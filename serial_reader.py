import serial
import time
import re


# ============================================================
# ESP32 SERIAL CONFIGURATION
# ============================================================

SERIAL_PORT = "COM7"
BAUD_RATE = 115200
SERIAL_TIMEOUT = 1


# ============================================================
# PARSE ESP32 MEDISYNC REPORT
# ============================================================

def parse_esp32_report(report):

    data = {
        "weight": 0.0,
        "iv_level": 0.0,
        "iv_status": "Unknown",
        "heart_rate": 0.0,
        "spo2": 0.0,
        "nurse_present": False,
        "nurse_rssi": 0,
        "nurse_distance": 0.0,
        "bed_occupied": False,
        "emergency": False
    }

    # --------------------------------------------------------
    # IV WEIGHT
    # --------------------------------------------------------

    match = re.search(
        r"IV Weight\s*:\s*([-+]?\d*\.?\d+)",
        report,
        re.IGNORECASE
    )

    if match:
        data["weight"] = float(match.group(1))


    # --------------------------------------------------------
    # IV LEVEL
    # --------------------------------------------------------

    match = re.search(
        r"IV Level\s*:\s*([-+]?\d*\.?\d+)",
        report,
        re.IGNORECASE
    )

    if match:
        data["iv_level"] = float(match.group(1))


    # --------------------------------------------------------
    # IV STATUS
    # --------------------------------------------------------

    match = re.search(
        r"IV Status\s*:\s*(.+)",
        report,
        re.IGNORECASE
    )

    if match:
        data["iv_status"] = match.group(1).strip()


    # --------------------------------------------------------
    # HEART RATE
    # --------------------------------------------------------

    match = re.search(
        r"Heart Rate\s*:\s*([-+]?\d*\.?\d+)",
        report,
        re.IGNORECASE
    )

    if match:
        data["heart_rate"] = float(match.group(1))


    # --------------------------------------------------------
    # SPO2
    # --------------------------------------------------------

    match = re.search(
        r"SpO2\s*:\s*([-+]?\d*\.?\d+)",
        report,
        re.IGNORECASE
    )

    if match:
        data["spo2"] = float(match.group(1))


    # --------------------------------------------------------
    # BED OCCUPANCY
    # --------------------------------------------------------

    match = re.search(
        r"Bed Occupancy\s*:\s*(OCCUPIED|AVAILABLE)",
        report,
        re.IGNORECASE
    )

    if match:

        status = match.group(1).upper()

        data["bed_occupied"] = (
            status == "OCCUPIED"
        )


    # --------------------------------------------------------
    # NURSE PRESENCE
    # --------------------------------------------------------

    match = re.search(
        r"Nurse Presence\s*:\s*(PRESENT|AWAY)",
        report,
        re.IGNORECASE
    )

    if match:

        status = match.group(1).upper()

        data["nurse_present"] = (
            status == "PRESENT"
        )


    # --------------------------------------------------------
    # NURSE RSSI
    # --------------------------------------------------------

    match = re.search(
        r"BLE RSSI\s*:\s*(-?\d+)",
        report,
        re.IGNORECASE
    )

    if match:
        data["nurse_rssi"] = int(
            match.group(1)
        )


    # --------------------------------------------------------
    # NURSE DISTANCE
    # --------------------------------------------------------

    match = re.search(
        r"Proximity\s*:\s*([-+]?\d*\.?\d+)",
        report,
        re.IGNORECASE
    )

    if match:
        data["nurse_distance"] = float(
            match.group(1)
        )


    # --------------------------------------------------------
    # EMERGENCY
    # --------------------------------------------------------

    match = re.search(
        r"Emergency Status\s*:\s*(!!! ACTIVE !!!|NORMAL)",
        report,
        re.IGNORECASE
    )

    if match:

        status = match.group(1).upper()

        data["emergency"] = (
            "ACTIVE" in status
        )


    return data


# ============================================================
# READ ONE COMPLETE ESP32 REPORT
# ============================================================

def read_one_report():

    ser = None

    try:

        print()
        print("=" * 60)
        print("MEDINOVA ESP32 SERIAL READER")
        print("=" * 60)
        print(f"Port      : {SERIAL_PORT}")
        print(f"Baud Rate : {BAUD_RATE}")
        print("=" * 60)


        # ----------------------------------------------------
        # OPEN COM7
        # ----------------------------------------------------

        ser = serial.Serial(
            port=SERIAL_PORT,
            baudrate=BAUD_RATE,
            timeout=SERIAL_TIMEOUT
        )

        print("COM7 opened successfully.")
        print("Waiting for ESP32 data...")


        # Give ESP32 a moment after opening serial
        time.sleep(2)


        lines = []

        report_started = False

        start_time = time.time()

        # Maximum time waiting for one report
        max_wait = 15


        while time.time() - start_time < max_wait:

            try:

                raw_line = ser.readline()

            except serial.SerialException as error:

                print(
                    "Serial read error:",
                    error
                )

                break


            if not raw_line:
                continue


            try:

                line = raw_line.decode(
                    "utf-8",
                    errors="ignore"
                ).strip()

            except Exception:

                continue


            if not line:
                continue


            # ------------------------------------------------
            # START OF REPORT
            # ------------------------------------------------

            if "MEDISYNC COMMAND CENTER" in line.upper():

                # If we already have a previous report,
                # return it before starting a new one.

                if report_started and lines:

                    report = "\n".join(lines)

                    return parse_esp32_report(
                        report
                    )


                lines = []

                report_started = True

                lines.append(line)

                continue


            # ------------------------------------------------
            # COLLECT REPORT
            # ------------------------------------------------

            if report_started:

                lines.append(line)


            # ------------------------------------------------
            # END OF REPORT
            # ------------------------------------------------

            if (
                report_started
                and "MEDISYNC STATUS: LIVE"
                in line.upper()
            ):

                report = "\n".join(lines)

                return parse_esp32_report(
                    report
                )


        # ----------------------------------------------------
        # TIMEOUT
        # ----------------------------------------------------

        if lines:

            report = "\n".join(lines)

            return parse_esp32_report(
                report
            )

        return None


    except serial.SerialException as error:

        print()
        print("COM7 SERIAL ERROR")
        print(error)
        print()
        print("Check that:")
        print("1. ESP32 is connected.")
        print("2. Arduino Serial Monitor is CLOSED.")
        print("3. COM7 is the correct port.")
        print("4. No other Python program is using COM7.")

        return None


    except Exception as error:

        print(
            "Serial reader error:",
            error
        )

        return None


    finally:

        # ----------------------------------------------------
        # ALWAYS CLOSE SERIAL PORT
        # ----------------------------------------------------

        if ser is not None:

            try:

                if ser.is_open:

                    ser.close()

                    print(
                        "COM7 closed."
                    )

            except Exception:

                pass