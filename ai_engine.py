from datetime import datetime


def calculate_bed_occupancy(beds):
    """
    Calculate current bed occupancy percentage.
    """

    if not beds:
        return 0

    occupied = sum(
        1 for bed in beds
        if bed.get("status", "").lower() == "occupied"
    )

    return round((occupied / len(beds)) * 100, 1)


def analyze_resources(beds, staff, equipment):
    """
    Analyze current hospital resources.
    """

    bed_occupancy = calculate_bed_occupancy(beds)

    available_staff = sum(
        1 for member in staff
        if member.get("status", "").lower() == "available"
    )

    available_equipment = sum(
        1 for item in equipment
        if item.get("status", "").lower() == "available"
    )

    recommendations = []

    if bed_occupancy >= 90:
        recommendations.append(
            "High bed occupancy detected. Prepare additional beds."
        )

    elif bed_occupancy >= 75:
        recommendations.append(
            "Bed occupancy is increasing. Monitor admission demand."
        )

    if available_staff <= 2:
        recommendations.append(
            "Low staff availability. Consider reallocating staff."
        )

    if available_equipment <= 1:
        recommendations.append(
            "Limited equipment availability detected."
        )

    if not recommendations:
        recommendations.append(
            "Hospital resources are currently stable."
        )

    return {
        "bed_occupancy": bed_occupancy,
        "available_staff": available_staff,
        "available_equipment": available_equipment,
        "recommendations": recommendations,
        "generated_at": datetime.now().isoformat()
    }


def generate_forecast(current_patients, current_beds):
    """
    Simple demonstration forecast.
    """

    total_beds = len(current_beds)

    if total_beds == 0:
        occupancy = 0
    else:
        occupancy = round(
            (current_patients / total_beds) * 100,
            1
        )

    if occupancy >= 90:
        demand = "Very High"
    elif occupancy >= 75:
        demand = "High"
    elif occupancy >= 50:
        demand = "Moderate"
    else:
        demand = "Low"

    return {
        "current_patients": current_patients,
        "total_beds": total_beds,
        "occupancy": occupancy,
        "predicted_demand": demand
    }