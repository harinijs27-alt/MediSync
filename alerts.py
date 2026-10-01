from datetime import datetime


def create_alert(title, message, alert_type="info"):
    """
    Create a standard Medinova alert.
    """

    return {
        "title": title,
        "message": message,
        "type": alert_type,
        "timestamp": datetime.now().isoformat()
    }


def check_hardware_alerts(hardware):
    """
    Check ESP32 sensor values and generate alerts.
    """

    alerts = []

    # IV alert
    if hardware.iv_level <= 20:
        alerts.append(
            create_alert(
                "IV Level Low",
                f"IV level is {hardware.iv_level}%. Nurse attention required.",
                "critical"
            )
        )

    # Heart rate
    if hardware.heart_rate > 0:
        if hardware.heart_rate < 50:
            alerts.append(
                create_alert(
                    "Low Heart Rate",
                    f"Heart rate detected at {hardware.heart_rate} BPM.",
                    "critical"
                )
            )

        elif hardware.heart_rate > 120:
            alerts.append(
                create_alert(
                    "High Heart Rate",
                    f"Heart rate detected at {hardware.heart_rate} BPM.",
                    "critical"
                )
            )

    # SpO2
    if hardware.spo2 > 0 and hardware.spo2 < 94:
        alerts.append(
            create_alert(
                "Low SpO₂",
                f"SpO₂ detected at {hardware.spo2}%.",
                "critical"
            )
        )

    # Emergency
    if hardware.emergency:
        alerts.append(
            create_alert(
                "Emergency Detected",
                "ESP32 has detected a critical patient condition.",
                "emergency"
            )
        )

    # Nurse not nearby
    if not hardware.nurse_present:
        alerts.append(
            create_alert(
                "Nurse Not Nearby",
                "Assigned nurse is outside the monitored range.",
                "warning"
            )
        )

    return alerts