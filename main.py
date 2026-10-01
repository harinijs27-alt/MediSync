from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import sqlite3
import threading

import serial
import time
import re

# ============================================================
# ESP32 SERIAL CONFIGURATION
# ============================================================

ESP32_PORT = "COM7"
ESP32_BAUD = 115200
SERIAL_TIMEOUT = 1.0

_serial_connection = None


def _open_esp32_serial():
    global _serial_connection

    if _serial_connection is not None and _serial_connection.is_open:
        return _serial_connection

    try:
        _serial_connection = serial.Serial(
            ESP32_PORT,
            ESP32_BAUD,
            timeout=SERIAL_TIMEOUT
        )

        # Opening an ESP32 serial port commonly resets the board.
        # Give it time to boot and discard the startup text.
        time.sleep(2)
        _serial_connection.reset_input_buffer()

        print(f"ESP32 connected on {ESP32_PORT} @ {ESP32_BAUD}")
        return _serial_connection

    except Exception as error:
        print(f"ESP32 connection error on {ESP32_PORT}: {error}")
        _serial_connection = None
        return None


def _parse_esp32_line(line, report):
    """Parse the existing human-readable MediSync Serial Monitor output."""

    line = line.strip()

    if not line:
        return report

    # Current ESP32 output:
    # IV Weight           : 447.96 g
    match = re.search(r"^IV Weight\s*:\s*(-?\d+(?:\.\d+)?)\s*g", line, re.I)
    if match:
        report["weight"] = float(match.group(1))
        return report

    match = re.search(r"^IV Level\s*:\s*(-?\d+(?:\.\d+)?)\s*%", line, re.I)
    if match:
        report["iv_level"] = float(match.group(1))
        return report

    match = re.search(r"^IV Status\s*:\s*(.+)$", line, re.I)
    if match:
        report["iv_status"] = match.group(1).strip()
        return report

    # Patient vitals
    match = re.search(r"^Heart Rate\s*:\s*(-?\d+(?:\.\d+)?)\s*BPM", line, re.I)
    if match:
        report["heart_rate"] = float(match.group(1))
        return report

    match = re.search(r"^SpO2\s*:\s*(-?\d+(?:\.\d+)?)\s*%", line, re.I)
    if match:
        report["spo2"] = float(match.group(1))
        return report

    # Bed status
    match = re.search(r"^Bed Occupancy\s*:\s*(.+)$", line, re.I)
    if match:
        value = match.group(1).strip().upper()
        report["bed_occupied"] = value == "OCCUPIED"
        return report

    # Nurse status
    match = re.search(r"^Nurse Presence\s*:\s*(.+)$", line, re.I)
    if match:
        value = match.group(1).strip().upper()
        report["nurse_present"] = value == "PRESENT"
        return report

    match = re.search(r"^BLE RSSI\s*:\s*(-?\d+)\s*dBm", line, re.I)
    if match:
        report["nurse_rssi"] = int(match.group(1))
        return report

    match = re.search(r"^Proximity\s*:\s*(-?\d+(?:\.\d+)?)\s*m", line, re.I)
    if match:
        report["nurse_distance"] = float(match.group(1))
        return report

    # Emergency status
    match = re.search(r"^Emergency Status\s*:\s*(.+)$", line, re.I)
    if match:
        value = match.group(1).strip().upper()
        report["emergency"] = "ACTIVE" in value
        return report

    return report


def read_one_report():
    """
    Read one complete MediSync report from the ESP32.

    The ESP32 currently prints a human-readable multi-line report,
    not JSON. This function converts that report into the dictionary
    expected by main.py.
    """

    global _serial_connection

    ser = _open_esp32_serial()

    if ser is None:
        time.sleep(2)
        return None

    report = {}
    start_time = time.time()
    last_data_time = None

    try:
        while time.time() - start_time < 8:
            raw = ser.readline()

            if not raw:
                # If we already collected useful values, return them
                # after a short quiet period.
                if report and last_data_time is not None:
                    if time.time() - last_data_time >= 0.5:
                        break
                continue

            try:
                line = raw.decode("utf-8", errors="ignore")
            except Exception:
                line = str(raw)

            before = len(report)
            _parse_esp32_line(line, report)

            if len(report) > before:
                last_data_time = time.time()

                # A complete report contains the key IV fields.
                if (
                    "weight" in report
                    and "iv_level" in report
                    and "iv_status" in report
                ):
                    # Allow the remaining fields to arrive, but don't
                    # wait indefinitely for optional sections.
                    if time.time() - last_data_time >= 0.2:
                        break

        if not report:
            return None

        # Keep the values already present in the backend if an optional
        # sensor line was not present in this particular report.
        return report

    except Exception as error:
        print("ESP32 serial read error:", error)
        try:
            ser.close()
        except Exception:
            pass
        _serial_connection = None
        return None


from database import get_connection, initialize_database

from models import (
    Patient,
    Bed,
    Staff,
    Equipment,
    OTSchedule,
    Notification,
    HardwareReading,
    HospitalSettings
)

from ai_engine import analyze_resources, generate_forecast

from allocation import (
    allocate_bed,
    allocate_staff,
    allocate_equipment
)

from alerts import check_hardware_alerts


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="Medinova Hospital Orchestration API",
    description="Backend API for the Medinova intelligent hospital command center",
    version="1.0.0"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# GLOBAL HARDWARE STATE
# ============================================================

latest_hardware = {
    "connected": False,

    # IV
    "weight": 0.0,
    "iv_level": 0.0,
    "iv_status": "Unknown",

    # Patient vitals
    "heart_rate": 0.0,
    "spo2": 0.0,

    # Nurse BLE
    "nurse_present": False,
    "nurse_rssi": 0,
    "nurse_distance": 0.0,

    # Bed / FSR
    "bed_occupied": False,

    # Emergency
    "emergency": False,

    # Last update
    "last_update": None
}


# ============================================================
# HOSPITAL SETTINGS
# ============================================================

hospital_settings = HospitalSettings()


# ============================================================
# HARDWARE ALERT CONTROL
# ============================================================

# Prevent the same alert from being inserted every second
last_alert_state = {
    "iv_low": False,
    "heart_rate_low": False,
    "heart_rate_high": False,
    "spo2_low": False,
    "emergency": False,
    "nurse_away": False
}


# ============================================================
# SAVE HARDWARE READING TO DATABASE
# ============================================================

def save_hardware_reading(data):
    """
    Save the latest ESP32 hardware reading into SQLite.
    """

    connection = get_connection()
    cursor = connection.cursor()

    try:

        cursor.execute("""
            INSERT INTO hardware_readings (
                weight,
                iv_level,
                iv_status,
                heart_rate,
                spo2,
                nurse_present,
                nurse_rssi,
                nurse_distance,
                emergency
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            float(data.get("weight", 0)),
            float(data.get("iv_level", 0)),
            data.get("iv_status", "Unknown"),
            float(data.get("heart_rate", 0)),
            float(data.get("spo2", 0)),
            int(bool(data.get("nurse_present", False))),
            int(data.get("nurse_rssi", 0)),
            float(data.get("nurse_distance", 0)),
            int(bool(data.get("emergency", False)))
        ))

        connection.commit()

    except Exception as error:

        print("Database hardware save error:", error)

    finally:

        connection.close()


# ============================================================
# CREATE HARDWARE NOTIFICATION
# ============================================================

def create_hardware_notification(
    title,
    message,
    notification_type="warning"
):
    """
    Save an ESP32 hardware alert into notifications table.
    """

    connection = get_connection()
    cursor = connection.cursor()

    try:

        cursor.execute("""
            INSERT INTO notifications (
                title,
                message,
                notification_type,
                is_read
            )
            VALUES (?, ?, ?, 0)
        """, (
            title,
            message,
            notification_type
        ))

        connection.commit()

        print("NOTIFICATION CREATED:", title)

    except Exception as error:

        print("Notification database error:", error)

    finally:

        connection.close()


# ============================================================
# PROCESS ESP32 ALERTS
# ============================================================

def process_hardware_alerts(data):
    """
    Analyze ESP32 readings and create notifications
    only when an alert state changes.
    """

    global last_alert_state

    try:

        iv_level = float(data.get("iv_level", 0))
        heart_rate = float(data.get("heart_rate", 0))
        spo2 = float(data.get("spo2", 0))

        nurse_present = bool(
            data.get("nurse_present", False)
        )

        emergency = bool(
            data.get("emergency", False)
        )


        # ----------------------------------------------------
        # IV LOW
        # ----------------------------------------------------

        iv_low = iv_level <= 20

        if iv_low and not last_alert_state["iv_low"]:

            create_hardware_notification(
                "Critical IV Level",
                f"IV level is critically low ({iv_level:.1f}%). Nurse attention required.",
                "critical"
            )

        last_alert_state["iv_low"] = iv_low


        # ----------------------------------------------------
        # HEART RATE LOW
        # ----------------------------------------------------

        heart_rate_low = (
            heart_rate > 0 and heart_rate < 50
        )

        if heart_rate_low and not last_alert_state["heart_rate_low"]:

            create_hardware_notification(
                "Low Heart Rate",
                f"Patient heart rate is low ({heart_rate:.0f} BPM).",
                "critical"
            )

        last_alert_state["heart_rate_low"] = heart_rate_low


        # ----------------------------------------------------
        # HEART RATE HIGH
        # ----------------------------------------------------

        heart_rate_high = heart_rate > 120

        if heart_rate_high and not last_alert_state["heart_rate_high"]:

            create_hardware_notification(
                "High Heart Rate",
                f"Patient heart rate is high ({heart_rate:.0f} BPM).",
                "critical"
            )

        last_alert_state["heart_rate_high"] = heart_rate_high


        # ----------------------------------------------------
        # SPO2 LOW
        # ----------------------------------------------------

        spo2_low = (
            spo2 > 0 and spo2 < 94
        )

        if spo2_low and not last_alert_state["spo2_low"]:

            create_hardware_notification(
                "Low SpO2",
                f"Patient SpO2 is low ({spo2:.0f}%). Immediate attention required.",
                "critical"
            )

        last_alert_state["spo2_low"] = spo2_low


        # ----------------------------------------------------
        # EMERGENCY
        # ----------------------------------------------------

        if emergency and not last_alert_state["emergency"]:

            create_hardware_notification(
                "Emergency Alert",
                "ESP32 has detected a critical patient emergency.",
                "critical"
            )

        last_alert_state["emergency"] = emergency


        # ----------------------------------------------------
        # NURSE AWAY
        # ----------------------------------------------------

        nurse_away = not nurse_present

        if nurse_away and not last_alert_state["nurse_away"]:

            create_hardware_notification(
                "Nurse Proximity Alert",
                "Assigned nurse is not detected near the patient.",
                "warning"
            )

        last_alert_state["nurse_away"] = nurse_away

    except Exception as error:

        print("Hardware alert processing error:", error)


# ============================================================
# ESP32 SERIAL READER
# ============================================================

def esp32_reader_loop():

    global latest_hardware

    print("ESP32 reader thread started.")
    print("Waiting for ESP32 data on COM7...")

    while True:

        try:

            data = read_one_report()

            if data:

                # --------------------------------------------
                # UPDATE LIVE HARDWARE STATE
                # --------------------------------------------

                latest_hardware.update(data)

                latest_hardware["connected"] = True

                latest_hardware["last_update"] = (
                    datetime.now().isoformat()
                )


                # --------------------------------------------
                # SAVE READING
                # --------------------------------------------

                save_hardware_reading(
                    latest_hardware
                )


                # --------------------------------------------
                # PROCESS ALERTS
                # --------------------------------------------

                process_hardware_alerts(
                    latest_hardware
                )


                # --------------------------------------------
                # CONSOLE DISPLAY
                # --------------------------------------------

                print()
                print("=" * 60)
                print("ESP32 DATA RECEIVED")
                print("=" * 60)

                print(
                    f"IV Weight       : "
                    f"{latest_hardware.get('weight', 0)} g"
                )

                print(
                    f"IV Level        : "
                    f"{latest_hardware.get('iv_level', 0)} %"
                )

                print(
                    f"IV Status       : "
                    f"{latest_hardware.get('iv_status', 'Unknown')}"
                )

                print(
                    f"Heart Rate      : "
                    f"{latest_hardware.get('heart_rate', 0)} BPM"
                )

                print(
                    f"SpO2            : "
                    f"{latest_hardware.get('spo2', 0)} %"
                )

                print(
                    f"Bed Occupied    : "
                    f"{latest_hardware.get('bed_occupied', False)}"
                )

                print(
                    f"Nurse Present   : "
                    f"{latest_hardware.get('nurse_present', False)}"
                )

                print(
                    f"Nurse Distance  : "
                    f"{latest_hardware.get('nurse_distance', 0)} m"
                )

                print(
                    f"Emergency       : "
                    f"{latest_hardware.get('emergency', False)}"
                )

                print(
                    f"Last Update     : "
                    f"{latest_hardware.get('last_update')}"
                )

                print("=" * 60)

        except Exception as error:

            print()
            print("ESP32 reader error:", error)

            latest_hardware["connected"] = False
            latest_hardware["last_update"] = datetime.now().isoformat()

            time.sleep(1)


# ============================================================
# START ESP32 READER
# ============================================================

def start_esp32_reader():

    thread = threading.Thread(
        target=esp32_reader_loop,
        daemon=True
    )

    thread.start()

    print("ESP32 serial reader started.")


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
def startup_event():

    initialize_database()

    print("=" * 60)
    print("MEDINOVA BACKEND STARTED")
    print("=" * 60)

    print("Database initialized")

    start_esp32_reader()

    print("API ready")

    print("=" * 60)


# ============================================================
# BASIC API
# ============================================================

@app.get("/")
def root():

    return {
        "success": True,
        "message": "Medinova Hospital Orchestration Backend is running",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/health")
def health_check():

    return {
        "status": "online",
        "service": "Medinova Backend",
        "timestamp": datetime.now().isoformat()
    }


# ============================================================
# DASHBOARD SUMMARY
# ============================================================

@app.get("/api/dashboard")
def dashboard_summary():

    connection = get_connection()
    cursor = connection.cursor()

    # --------------------------------------------------------
    # PATIENTS
    # --------------------------------------------------------

    cursor.execute(
        "SELECT COUNT(*) FROM patients"
    )

    total_patients = cursor.fetchone()[0]


    # --------------------------------------------------------
    # BEDS
    # --------------------------------------------------------

    cursor.execute(
        "SELECT COUNT(*) FROM beds"
    )

    total_beds = cursor.fetchone()[0]


    cursor.execute("""
        SELECT COUNT(*)
        FROM beds
        WHERE LOWER(status) = 'occupied'
    """)

    occupied_beds = cursor.fetchone()[0]

    available_beds = (
        total_beds - occupied_beds
    )


    # --------------------------------------------------------
    # STAFF
    # --------------------------------------------------------

    cursor.execute(
        "SELECT COUNT(*) FROM staff"
    )

    total_staff = cursor.fetchone()[0]


    cursor.execute("""
        SELECT COUNT(*)
        FROM staff
        WHERE LOWER(status) = 'available'
    """)

    available_staff = cursor.fetchone()[0]


    # --------------------------------------------------------
    # EQUIPMENT
    # --------------------------------------------------------

    cursor.execute(
        "SELECT COUNT(*) FROM equipment"
    )

    total_equipment = cursor.fetchone()[0]


    cursor.execute("""
        SELECT COUNT(*)
        FROM equipment
        WHERE LOWER(status) = 'available'
    """)

    available_equipment = cursor.fetchone()[0]


    # --------------------------------------------------------
    # EMERGENCY
    # --------------------------------------------------------

    emergency_count = 0

    if latest_hardware.get("emergency", False):

        emergency_count = 1


    connection.close()


    # --------------------------------------------------------
    # OCCUPANCY
    # --------------------------------------------------------

    occupancy = 0

    if total_beds > 0:

        occupancy = round(
            (occupied_beds / total_beds) * 100,
            1
        )


    return {

        "patients": total_patients,

        "beds": {
            "total": total_beds,
            "occupied": occupied_beds,
            "available": available_beds,
            "occupancy": occupancy
        },

        "staff": {
            "total": total_staff,
            "available": available_staff
        },

        "equipment": {
            "total": total_equipment,
            "available": available_equipment
        },

        "active_emergencies": emergency_count,

        "hardware_connected":
            latest_hardware.get("connected", False),

        # LIVE ESP32 DATA
        # This makes /api/dashboard directly usable by the frontend.
        "hardware": latest_hardware,

        "timestamp":
            datetime.now().isoformat()
    }


# ============================================================
# PATIENT APIs
# ============================================================

@app.get("/api/patients")
def get_patients():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT *
        FROM patients
        ORDER BY id DESC
    """)

    rows = cursor.fetchall()

    connection.close()

    return [
        dict(row)
        for row in rows
    ]


@app.post("/api/patients")
def add_patient(patient: Patient):

    connection = get_connection()
    cursor = connection.cursor()

    try:

        cursor.execute("""
            INSERT INTO patients (
                patient_id,
                name,
                age,
                department,
                priority,
                bed,
                doctor,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            patient.patient_id,
            patient.name,
            patient.age,
            patient.department,
            patient.priority,
            patient.bed,
            patient.doctor,
            patient.status
        ))

        connection.commit()

    except sqlite3.IntegrityError:

        connection.close()

        raise HTTPException(
            status_code=400,
            detail="Patient ID already exists."
        )

    connection.close()

    return {
        "success": True,
        "message": "Patient added successfully",
        "patient": patient.model_dump()
    }


@app.delete("/api/patients/{patient_id}")
def delete_patient(patient_id: str):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        "DELETE FROM patients WHERE patient_id = ?",
        (patient_id,)
    )

    connection.commit()

    deleted = cursor.rowcount

    connection.close()

    if deleted == 0:

        raise HTTPException(
            status_code=404,
            detail="Patient not found."
        )

    return {
        "success": True,
        "message": "Patient deleted successfully"
    }


# ============================================================
# BED APIs
# ============================================================

@app.get("/api/beds")
def get_beds():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT *
        FROM beds
        ORDER BY id
    """)

    rows = cursor.fetchall()

    connection.close()

    return [
        dict(row)
        for row in rows
    ]


@app.post("/api/beds")
def add_bed(bed: Bed):

    connection = get_connection()
    cursor = connection.cursor()

    try:

        cursor.execute("""
            INSERT INTO beds (
                bed_id,
                ward,
                status,
                patient_id
            )
            VALUES (?, ?, ?, ?)
        """, (
            bed.bed_id,
            bed.ward,
            bed.status,
            bed.patient_id
        ))

        connection.commit()

    except sqlite3.IntegrityError:

        connection.close()

        raise HTTPException(
            status_code=400,
            detail="Bed ID already exists."
        )

    connection.close()

    return {
        "success": True,
        "message": "Bed added successfully",
        "bed": bed.model_dump()
    }


@app.put("/api/beds/{bed_id}")
def update_bed(
    bed_id: str,
    bed: Bed
):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE beds
        SET
            ward = ?,
            status = ?,
            patient_id = ?
        WHERE bed_id = ?
    """, (
        bed.ward,
        bed.status,
        bed.patient_id,
        bed_id
    ))

    connection.commit()

    updated = cursor.rowcount

    connection.close()

    if updated == 0:

        raise HTTPException(
            status_code=404,
            detail="Bed not found."
        )

    return {
        "success": True,
        "message": "Bed updated successfully"
    }


# ============================================================
# STAFF APIs
# ============================================================

@app.get("/api/staff")
def get_staff():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT *
        FROM staff
        ORDER BY id
    """)

    rows = cursor.fetchall()

    connection.close()

    return [
        dict(row)
        for row in rows
    ]


@app.post("/api/staff")
def add_staff(staff: Staff):

    connection = get_connection()
    cursor = connection.cursor()

    try:

        cursor.execute("""
            INSERT INTO staff (
                staff_id,
                name,
                role,
                department,
                status,
                workload,
                patient_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            staff.staff_id,
            staff.name,
            staff.role,
            staff.department,
            staff.status,
            staff.workload,
            staff.patient_id
        ))

        connection.commit()

    except sqlite3.IntegrityError:

        connection.close()

        raise HTTPException(
            status_code=400,
            detail="Staff ID already exists."
        )

    connection.close()

    return {
        "success": True,
        "message": "Staff added successfully",
        "staff": staff.model_dump()
    }


# ============================================================
# EQUIPMENT APIs
# ============================================================

@app.get("/api/equipment")
def get_equipment():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT *
        FROM equipment
        ORDER BY id
    """)

    rows = cursor.fetchall()

    connection.close()

    return [
        dict(row)
        for row in rows
    ]


@app.post("/api/equipment")
def add_equipment(
    equipment: Equipment
):

    connection = get_connection()
    cursor = connection.cursor()

    try:

        cursor.execute("""
            INSERT INTO equipment (
                equipment_id,
                name,
                department,
                status,
                patient_id
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            equipment.equipment_id,
            equipment.name,
            equipment.department,
            equipment.status,
            equipment.patient_id
        ))

        connection.commit()

    except sqlite3.IntegrityError:

        connection.close()

        raise HTTPException(
            status_code=400,
            detail="Equipment ID already exists."
        )

    connection.close()

    return {
        "success": True,
        "message": "Equipment added successfully",
        "equipment": equipment.model_dump()
    }


# ============================================================
# OT APIs
# ============================================================

@app.get("/api/ot")
def get_ot_schedule():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT *
        FROM ot_schedule
        ORDER BY id
    """)

    rows = cursor.fetchall()

    connection.close()

    return [
        dict(row)
        for row in rows
    ]


@app.post("/api/ot")
def add_ot_slot(
    slot: OTSchedule
):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        INSERT INTO ot_schedule (
            slot_time,
            procedure,
            patient_id,
            doctor,
            status,
            priority
        )
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        slot.slot_time,
        slot.procedure,
        slot.patient_id,
        slot.doctor,
        slot.status,
        slot.priority
    ))

    connection.commit()

    connection.close()

    return {
        "success": True,
        "message": "OT slot added successfully",
        "slot": slot.model_dump()
    }


# ============================================================
# NOTIFICATION APIs
# ============================================================

@app.get("/api/notifications")
def get_notifications():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT *
        FROM notifications
        ORDER BY id DESC
        LIMIT 50
    """)

    rows = cursor.fetchall()

    connection.close()

    return [
        dict(row)
        for row in rows
    ]


@app.post("/api/notifications")
def add_notification(
    notification: Notification
):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        INSERT INTO notifications (
            title,
            message,
            notification_type,
            is_read
        )
        VALUES (?, ?, ?, ?)
    """, (
        notification.title,
        notification.message,
        notification.notification_type,
        int(notification.is_read)
    ))

    connection.commit()

    connection.close()

    return {
        "success": True,
        "message": "Notification added successfully"
    }


@app.put("/api/notifications/read-all")
def mark_all_notifications_read():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE notifications
        SET is_read = 1
        WHERE is_read = 0
    """)

    connection.commit()

    connection.close()

    return {
        "success": True,
        "message": "All notifications marked as read"
    }


# ============================================================
# HARDWARE / ESP32 APIs
# ============================================================

@app.get("/api/hardware")
def get_hardware():

    return {
        **latest_hardware
    }


@app.post("/api/hardware")
def update_hardware(
    data: HardwareReading
):

    global latest_hardware

    # --------------------------------------------------------
    # UPDATE HARDWARE STATE
    # --------------------------------------------------------

    latest_hardware = {
        "connected": True,

        "weight": data.weight,
        "iv_level": data.iv_level,
        "iv_status": data.iv_status,

        "heart_rate": data.heart_rate,
        "spo2": data.spo2,

        "nurse_present": data.nurse_present,
        "nurse_rssi": data.nurse_rssi,
        "nurse_distance": data.nurse_distance,

        "bed_occupied":
            latest_hardware.get(
                "bed_occupied",
                False
            ),

        "emergency": data.emergency,

        "last_update":
            datetime.now().isoformat()
    }


    # --------------------------------------------------------
    # SAVE HARDWARE READING
    # --------------------------------------------------------

    save_hardware_reading(
        latest_hardware
    )


    # --------------------------------------------------------
    # ALERTS
    # --------------------------------------------------------

    alerts = check_hardware_alerts(
        data
    )


    # --------------------------------------------------------
    # SAVE ALERTS
    # --------------------------------------------------------

    if alerts:

        connection = get_connection()
        cursor = connection.cursor()

        for alert in alerts:

            cursor.execute("""
                INSERT INTO notifications (
                    title,
                    message,
                    notification_type,
                    is_read
                )
                VALUES (?, ?, ?, 0)
            """, (
                alert["title"],
                alert["message"],
                alert["type"]
            ))

        connection.commit()

        connection.close()


    return {
        "success": True,
        "hardware": latest_hardware,
        "alerts": alerts
    }


# ============================================================
# AI ORCHESTRATION
# ============================================================

@app.get("/api/ai/analyze")
def ai_analysis():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        "SELECT * FROM beds"
    )

    beds = [
        dict(row)
        for row in cursor.fetchall()
    ]


    cursor.execute(
        "SELECT * FROM staff"
    )

    staff = [
        dict(row)
        for row in cursor.fetchall()
    ]


    cursor.execute(
        "SELECT * FROM equipment"
    )

    equipment = [
        dict(row)
        for row in cursor.fetchall()
    ]

    connection.close()


    result = analyze_resources(
        beds,
        staff,
        equipment
    )


    return {
        "success": True,
        "analysis": result
    }


# ============================================================
# FORECAST
# ============================================================

@app.get("/api/forecast")
def forecast():

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        "SELECT COUNT(*) FROM patients"
    )

    patient_count = cursor.fetchone()[0]


    cursor.execute(
        "SELECT * FROM beds"
    )

    beds = [
        dict(row)
        for row in cursor.fetchall()
    ]

    connection.close()


    result = generate_forecast(
        patient_count,
        beds
    )


    return {
        "success": True,
        "forecast": result
    }


# ============================================================
# BED ALLOCATION
# ============================================================

@app.post("/api/allocation/bed")
def allocate_patient_bed(
    patient_id: str,
    department: str = ""
):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        "SELECT * FROM beds"
    )

    beds = [
        dict(row)
        for row in cursor.fetchall()
    ]


    result = allocate_bed(
        beds,
        patient_id,
        department if department else None
    )


    if result["success"]:

        selected_bed = result["bed"]


        cursor.execute("""
            UPDATE beds
            SET
                status = ?,
                patient_id = ?
            WHERE bed_id = ?
        """, (
            selected_bed["status"],
            selected_bed["patient_id"],
            selected_bed["bed_id"]
        ))


        cursor.execute("""
            UPDATE patients
            SET bed = ?
            WHERE patient_id = ?
        """, (
            selected_bed["bed_id"],
            patient_id
        ))


        connection.commit()


    connection.close()

    return result


# ============================================================
# STAFF ALLOCATION
# ============================================================

@app.post("/api/allocation/staff")
def allocate_patient_staff(
    patient_id: str,
    department: str = ""
):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        "SELECT * FROM staff"
    )

    staff = [
        dict(row)
        for row in cursor.fetchall()
    ]


    result = allocate_staff(
        staff,
        patient_id,
        department if department else None
    )


    if result["success"]:

        selected_staff = result["staff"]


        cursor.execute("""
            UPDATE staff
            SET
                status = ?,
                patient_id = ?
            WHERE staff_id = ?
        """, (
            selected_staff["status"],
            selected_staff["patient_id"],
            selected_staff["staff_id"]
        ))


        connection.commit()


    connection.close()

    return result


# ============================================================
# EQUIPMENT ALLOCATION
# ============================================================

@app.post("/api/allocation/equipment")
def allocate_patient_equipment(
    patient_id: str,
    equipment_name: str = ""
):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        "SELECT * FROM equipment"
    )

    equipment = [
        dict(row)
        for row in cursor.fetchall()
    ]


    result = allocate_equipment(
        equipment,
        patient_id,
        equipment_name
        if equipment_name
        else None
    )


    if result["success"]:

        selected_equipment = result["equipment"]


        cursor.execute("""
            UPDATE equipment
            SET
                status = ?,
                patient_id = ?
            WHERE equipment_id = ?
        """, (
            selected_equipment["status"],
            selected_equipment["patient_id"],
            selected_equipment["equipment_id"]
        ))


        connection.commit()


    connection.close()

    return result


# ============================================================
# SETTINGS
# ============================================================

@app.get("/api/settings")
def get_settings():

    return {
        "success": True,
        "settings": hospital_settings.model_dump()
    }


@app.put("/api/settings")
def update_settings(
    settings: HospitalSettings
):

    global hospital_settings

    hospital_settings = settings


    return {
        "success": True,
        "message": "Hospital settings updated successfully",
        "settings":
            hospital_settings.model_dump()
    }


# ============================================================
# RUN DIRECTLY
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=False
    )