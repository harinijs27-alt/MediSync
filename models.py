from pydantic import BaseModel
from typing import Optional


# =========================
# PATIENT
# =========================

class Patient(BaseModel):
    patient_id: str
    name: str
    age: int
    department: str
    priority: str
    bed: Optional[str] = None
    doctor: str
    status: str


# =========================
# BED
# =========================

class Bed(BaseModel):
    bed_id: str
    ward: str
    status: str
    patient_id: Optional[str] = None


# =========================
# STAFF
# =========================

class Staff(BaseModel):
    staff_id: str
    name: str
    role: str
    department: str
    status: str
    workload: str
    patient_id: Optional[str] = None


# =========================
# EQUIPMENT
# =========================

class Equipment(BaseModel):
    equipment_id: str
    name: str
    department: str
    status: str
    patient_id: Optional[str] = None


# =========================
# OT SCHEDULE
# =========================

class OTSchedule(BaseModel):
    slot_time: str
    procedure: str
    patient_id: str
    doctor: str
    status: str
    priority: str


# =========================
# NOTIFICATION
# =========================

class Notification(BaseModel):
    title: str
    message: str
    notification_type: str
    is_read: bool = False


# =========================
# ESP32 HARDWARE DATA
# =========================

class HardwareReading(BaseModel):
    weight: float = 0.0
    iv_level: float = 0.0
    iv_status: str = "Unknown"

    heart_rate: float = 0.0
    spo2: float = 0.0

    nurse_present: bool = False
    nurse_rssi: int = 0
    nurse_distance: float = 0.0

    emergency: bool = False


# =========================
# SETTINGS
# =========================

class HospitalSettings(BaseModel):
    hospital_name: str = "Medinova Hospital"
    emergency_threshold: int = 80
    bed_alert_threshold: int = 90
    iv_alert_level: int = 20
    enable_ai: bool = True
    enable_notifications: bool = True