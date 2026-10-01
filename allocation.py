def find_available_bed(beds, department=None):
    """
    Find an available bed.

    If department is provided, try to find a bed
    in that department first.
    """

    # First try matching department
    if department:
        for bed in beds:
            if (
                bed.get("status", "").lower() == "available"
                and bed.get("ward", "").lower() == department.lower()
            ):
                return bed

    # Otherwise find any available bed
    for bed in beds:
        if bed.get("status", "").lower() == "available":
            return bed

    return None


def allocate_bed(beds, patient_id, department=None):
    """
    Assign an available bed to a patient.
    """

    bed = find_available_bed(beds, department)

    if not bed:
        return {
            "success": False,
            "message": "No available bed found.",
            "bed": None
        }

    bed["status"] = "occupied"
    bed["patient_id"] = patient_id

    return {
        "success": True,
        "message": f"Bed {bed['bed_id']} allocated successfully.",
        "bed": bed
    }


def find_available_staff(staff, department=None):
    """
    Find an available staff member.
    """

    if department:
        for member in staff:
            if (
                member.get("status", "").lower() == "available"
                and member.get("department", "").lower()
                == department.lower()
            ):
                return member

    for member in staff:
        if member.get("status", "").lower() == "available":
            return member

    return None


def allocate_staff(staff, patient_id, department=None):
    """
    Assign available staff to a patient.
    """

    member = find_available_staff(staff, department)

    if not member:
        return {
            "success": False,
            "message": "No available staff found.",
            "staff": None
        }

    member["status"] = "busy"
    member["patient_id"] = patient_id

    return {
        "success": True,
        "message": f"{member['name']} assigned successfully.",
        "staff": member
    }


def find_available_equipment(equipment, equipment_name=None):
    """
    Find available equipment.
    """

    for item in equipment:

        if item.get("status", "").lower() != "available":
            continue

        if equipment_name:
            if item.get("name", "").lower() == equipment_name.lower():
                return item

        else:
            return item

    return None


def allocate_equipment(equipment, patient_id, equipment_name=None):
    """
    Assign available equipment.
    """

    item = find_available_equipment(
        equipment,
        equipment_name
    )

    if not item:
        return {
            "success": False,
            "message": "No available equipment found.",
            "equipment": None
        }

    item["status"] = "in use"
    item["patient_id"] = patient_id

    return {
        "success": True,
        "message": f"{item['name']} assigned successfully.",
        "equipment": item
    }