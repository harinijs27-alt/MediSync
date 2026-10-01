import sqlite3
from pathlib import Path

# Database location
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "medinova.db"


def get_connection():
    """Create and return a SQLite database connection."""
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    """Create all required tables if they don't already exist."""

    connection = get_connection()
    cursor = connection.cursor()

    # Patients table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            age INTEGER,
            department TEXT,
            priority TEXT,
            bed TEXT,
            doctor TEXT,
            status TEXT
        )
    """)

    # Beds table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS beds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bed_id TEXT UNIQUE NOT NULL,
            ward TEXT,
            status TEXT,
            patient_id TEXT
        )
    """)

    # Staff table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            role TEXT,
            department TEXT,
            status TEXT,
            workload TEXT,
            patient_id TEXT
        )
    """)

    # Equipment table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_id TEXT UNIQUE NOT NULL,
            name TEXT,
            department TEXT,
            status TEXT,
            patient_id TEXT
        )
    """)

    # OT schedule
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ot_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slot_time TEXT,
            procedure TEXT,
            patient_id TEXT,
            doctor TEXT,
            status TEXT,
            priority TEXT
        )
    """)

    # Notifications
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            message TEXT,
            notification_type TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Hardware readings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hardware_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            weight REAL,
            iv_level REAL,
            iv_status TEXT,
            heart_rate REAL,
            spo2 REAL,
            nurse_present INTEGER,
            nurse_rssi INTEGER,
            nurse_distance REAL,
            emergency INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    connection.commit()
    connection.close()


if __name__ == "__main__":
    initialize_database()
    print("Medinova database initialized successfully.")
    print(f"Database location: {DB_PATH}")