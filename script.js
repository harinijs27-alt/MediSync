/* =========================================================
   MEDINOVA
   ONE PATIENT + ONE ESP32 BED DEMO
   ========================================================= */

const API_BASE = "http://127.0.0.1:8000";

const PAGE_KEY = "medinova_current_page";
const SETTINGS_KEY = "medinova_settings";


/* =========================================================
   DEMO PATIENT
   ========================================================= */

const PATIENT = {
    id: "P001",
    name: "Demo Patient",
    age: 52,
    gender: "Male",
    diagnosis: "Continuous ICU Monitoring",
    bed: "BED-01",
    ward: "ICU",
    doctor: "Dr. Kumar",
    priority: "High"
};


/* =========================================================
   DEMO STAFF
   ========================================================= */

const STAFF = [
    {
        id: "N-01",
        name: "Nurse Anitha",
        role: "Nurse",
        department: "ICU",
        status: "Available",
        workload: "Low"
    },
    {
        id: "D-01",
        name: "Dr. Kumar",
        role: "Doctor",
        department: "ICU",
        status: "Available",
        workload: "Medium"
    },
    {
        id: "N-02",
        name: "Nurse Divya",
        role: "Nurse",
        department: "ICU",
        status: "Available",
        workload: "Low"
    }
];


/* =========================================================
   DEMO EQUIPMENT
   ========================================================= */

const EQUIPMENT = [
    {
        id: "MON-01",
        name: "Patient Monitor",
        type: "MAX30102",
        location: "BED-01",
        status: "Connected"
    },
    {
        id: "PUMP-01",
        name: "Infusion Pump",
        type: "IV Pump",
        location: "BED-01",
        status: "In Use"
    },
    {
        id: "ECG-01",
        name: "ECG Machine",
        type: "ECG",
        location: "ICU",
        status: "Available"
    }
];


/* =========================================================
   DEMO OT
   ========================================================= */

const OT_SLOTS = [
    {
        id: "OT-01",
        time: "08:00 - 10:00",
        procedure: "Cardiac Surgery",
        priority: "High",
        status: "Scheduled"
    },
    {
        id: "OT-02",
        time: "10:30 - 12:30",
        procedure: "Orthopedic Surgery",
        priority: "Normal",
        status: "Available"
    },
    {
        id: "OT-03",
        time: "13:00 - 15:00",
        procedure: "Emergency Slot",
        priority: "Emergency",
        status: "Reserved"
    }
];


/* =========================================================
   LIVE HARDWARE STATE
   ========================================================= */

let hardware = {

    connected: false,

    weight: null,

    iv_level: null,

    iv_status: "--",

    heart_rate: null,

    spo2: null,

    nurse_present: null,

    nurse_rssi: null,

    nurse_distance: null,

    bed_occupied: null,

    emergency: false,

    last_update: null

};


/* =========================================================
   SETTINGS
   ========================================================= */

let settings = {

    hospitalName: "Medinova Demo Hospital",

    patientName: "Demo Patient",

    bedId: "BED-01",

    alertIV: true,

    alertVitals: true,

    alertNurseAway: true,

    aiEnabled: true,

    refreshSeconds: 2

};


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

let notifications = [

    {
        id: "local-start",
        title: "Medinova Monitoring",
        message: "Waiting for ESP32 patient data.",
        type: "info",
        read: false,
        created_at: new Date().toISOString()
    }

];


/* =========================================================
   ACTIVITY
   ========================================================= */

let activityLog = [

    {
        event: "Dashboard initialized",
        resource: "P001 / BED-01",
        status: "Active"
    },

    {
        event: "ESP32 monitoring started",
        resource: "COM7",
        status: "Waiting"
    }

];


let currentPage = "command";

let hardwareTimer = null;

let clockTimer = null;

let notificationTimer = null;


/* =========================================================
   PREVIOUS ALERT STATE
   ========================================================= */

let previousAlerts = {

    emergency: false,

    lowIV: false,

    abnormalHR: false,

    lowSpO2: false,

    nurseAway: false

};


/* =========================================================
   PAGE INFORMATION
   ========================================================= */

const pageMeta = {

    command: {
        title: "Hospital Command Center",
        subtitle: "One-patient live monitoring and orchestration"
    },

    patients: {
        title: "Patient Management",
        subtitle: "Single demo patient profile and monitoring"
    },

    beds: {
        title: "Bed Management",
        subtitle: "Physical demonstration bed connected to ESP32"
    },

    staff: {
        title: "Staff Management",
        subtitle: "Staff assigned to the monitored patient"
    },

    equipment: {
        title: "Equipment Management",
        subtitle: "Equipment supporting BED-01"
    },

    ot: {
        title: "OT Scheduler",
        subtitle: "Operating theatre scheduling"
    },

    ai: {
        title: "AI Orchestration",
        subtitle: "Patient-aware decision engine"
    },

    forecast: {
        title: "Patient Load Forecast",
        subtitle: "Demo forecast based on current patient state"
    },

    emergency: {
        title: "Emergency Command",
        subtitle: "Real-time emergency escalation"
    },

    health: {
        title: "EHR / FHIR Integration",
        subtitle: "FHIR-style patient observations"
    },

    analytics: {
        title: "Hospital Analytics",
        subtitle: "Single-patient operational intelligence"
    },

    settings: {
        title: "System Settings",
        subtitle: "Configure Medinova demonstration"
    }

};


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function numberOrNull(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return null;

    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;

}


function valueOr(value, fallback = "--") {

    return (
        value === null ||
        value === undefined ||
        value === ""
    )
        ? fallback
        : value;

}


function formatTime(value) {

    const date = value
        ? new Date(value)
        : new Date();

    if (Number.isNaN(date.getTime())) {

        return "Just now";

    }

    return date.toLocaleTimeString([], {

        hour: "2-digit",

        minute: "2-digit"

    });

}


function statusClass(status) {

    const text = String(status || "")
        .toLowerCase();

    if (
        text.includes("critical") ||
        text.includes("emergency") ||
        text.includes("active")
    ) {

        return "status-critical";

    }

    if (
        text.includes("warning") ||
        text.includes("low") ||
        text.includes("away") ||
        text.includes("busy")
    ) {

        return "status-warning";

    }

    return "status-normal";

}


function addActivity(
    event,
    resource,
    status = "Active"
) {

    activityLog.unshift({

        event,
        resource,
        status

    });

    activityLog =
        activityLog.slice(0, 8);

    renderActivity();

}


/* =========================================================
   CLOCK
   ========================================================= */

function updateClock() {

    const now = new Date();

    const time =
        document.getElementById("currentTime");

    const date =
        document.getElementById("currentDate");


    if (time) {

        time.textContent =
            now.toLocaleTimeString([], {

                hour: "2-digit",

                minute: "2-digit",

                second: "2-digit"

            });

    }


    if (date) {

        date.textContent =
            now.toLocaleDateString([], {

                weekday: "long",

                day: "2-digit",

                month: "long",

                year: "numeric"

            });

    }

}


/* =========================================================
   SETTINGS
   ========================================================= */

function loadSettings() {

    try {

        const saved =
            localStorage.getItem(SETTINGS_KEY);

        if (saved) {

            settings = {

                ...settings,

                ...JSON.parse(saved)

            };

        }

    }

    catch (error) {

        console.error(
            "Settings error:",
            error
        );

    }

}


function saveSettings() {

    localStorage.setItem(

        SETTINGS_KEY,

        JSON.stringify(settings)

    );

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

    document
        .querySelectorAll(".nav-item")
        .forEach(item => {

            item.addEventListener(
                "click",
                event => {

                    event.preventDefault();

                    const page =
                        item.dataset.page;

                    if (page) {

                        showPage(page);

                    }

                }
            );

        });

}


function setActiveNav(page) {

    document
        .querySelectorAll(".nav-item")
        .forEach(item => {

            item.classList.toggle(

                "active",

                item.dataset.page === page

            );

        });

}


function updatePageHeader(page) {

    const meta =
        pageMeta[page] ||
        pageMeta.command;


    const title =
        document.getElementById(
            "pageTitle"
        );


    const subtitle =
        document.getElementById(
            "pageSubtitle"
        );


    if (title) {

        title.textContent =
            meta.title;

    }


    if (subtitle) {

        subtitle.textContent =
            meta.subtitle;

    }

}


/* =========================================================
   COMMAND CENTER
   ========================================================= */

function showCommandCenter() {

    currentPage = "command";

    localStorage.setItem(
        PAGE_KEY,
        "command"
    );


    updatePageHeader(
        "command"
    );

    setActiveNav(
        "command"
    );


    const dashboard =
        document.getElementById(
            "commandDashboard"
        );


    const pageContent =
        document.getElementById(
            "pageContent"
        );


    if (dashboard) {

        dashboard.style.display =
            "";

    }


    if (pageContent) {

        pageContent.style.display =
            "none";

    }


    updateCommandCenter();

}


function updateCommandCenter() {
// ============================================================
// BED PRESSURE CARD - ESP32 FSR
// ============================================================

function updatePressureCard() {

    let card =
        document.getElementById("medinovaPressureCard");

    // Create the card only once
    if (!card) {

        const container =
            document.querySelector(".stats-grid");

        if (!container) {
            return;
        }

        card = document.createElement("div");

        card.id =
            "medinovaPressureCard";

        card.className =
            "stat-card pressure-card";

        card.innerHTML = `

            <div class="pressure-card-icon">
                <i class="fa-solid fa-bed"></i>
            </div>

            <div class="pressure-card-content">

                <h3>
                    Bed Pressure
                </h3>

                <strong id="pressureStatus">
                    --
                </strong>

                <span id="pressureSub">
                    Waiting for ESP32 FSR
                </span>

            </div>

        `;

        container.appendChild(card);


        // Card styling
        const style =
            document.createElement("style");

        style.id =
            "medinovaPressureCardStyle";

        style.textContent = `

            .pressure-card {
                display:flex;
                align-items:center;
                gap:18px;
                min-height:140px;
                transition:0.3s ease;
            }

            .pressure-card-icon {
                width:58px;
                height:58px;
                border-radius:18px;
                display:flex;
                align-items:center;
                justify-content:center;
                background:#eef4ff;
                color:#2563eb;
                font-size:25px;
                flex-shrink:0;
            }

            .pressure-card-content h3 {
                margin:0 0 8px 0;
                font-size:15px;
                font-weight:500;
                color:#64748b;
            }

            .pressure-card-content strong {
                display:block;
                font-size:24px;
                font-weight:700;
                color:#102a56;
                margin-bottom:5px;
            }

            .pressure-card-content span {
                color:#94a3b8;
                font-size:13px;
            }

            .pressure-detected
            .pressure-card-icon {
                background:#fee2e2;
                color:#dc2626;
            }

            .pressure-detected
            #pressureStatus {
                color:#dc2626;
            }

            .pressure-not-detected
            .pressure-card-icon {
                background:#dcfce7;
                color:#16a34a;
            }

            .pressure-not-detected
            #pressureStatus {
                color:#16a34a;
            }

            .pressure-waiting
            .pressure-card-icon {
                background:#eef4ff;
                color:#64748b;
            }

        `;

        document.head.appendChild(style);

    }


    const status =
        document.getElementById(
            "pressureStatus"
        );

    const sub =
        document.getElementById(
            "pressureSub"
        );


    if (!status || !sub) {
        return;
    }


    // ESP32 not connected
    if (!hardware.connected) {

        card.classList.remove(
            "pressure-detected",
            "pressure-not-detected"
        );

        card.classList.add(
            "pressure-waiting"
        );

        status.textContent =
            "WAITING";

        sub.textContent =
            "Waiting for ESP32 FSR";

        return;
    }


    // Pressure detected / bed occupied
    if (hardware.bed_occupied === true) {

        card.classList.remove(
            "pressure-waiting",
            "pressure-not-detected"
        );

        card.classList.add(
            "pressure-detected"
        );

        status.textContent =
            "DETECTED";

        sub.textContent =
            "Patient pressure detected";

    }


    // No pressure / bed available
    else {

        card.classList.remove(
            "pressure-waiting",
            "pressure-detected"
        );

        card.classList.add(
            "pressure-not-detected"
        );

        status.textContent =
            "NOT DETECTED";

        sub.textContent =
            "No pressure detected";

    }

}
    updatePatientHeader();

    updateLiveCards();

    updateResourceOverview();

    updateAISummary();

    updateEmergencyPanel();

    updateForecast();

    renderActivity();

}


/* =========================================================
   PATIENT HEADER
   ========================================================= */

function updatePatientHeader() {

    const name =
        document.getElementById(
            "dashboardPatientName"
        );


    const id =
        document.getElementById(
            "dashboardPatientId"
        );


    const bed =
        document.getElementById(
            "dashboardBedId"
        );


    const badge =
        document.getElementById(
            "patientStatusBadge"
        );


    const connection =
        document.getElementById(
            "hardwareConnectionText"
        );


    if (name) {

        name.textContent =
            settings.patientName ||
            PATIENT.name;

    }


    if (id) {

        id.textContent =
            PATIENT.id;

    }


    if (bed) {

        bed.textContent =
            settings.bedId ||
            PATIENT.bed;

    }


    if (badge) {

        if (!hardware.connected) {

            badge.textContent =
                "WAITING";

            badge.className =
                "mv-status warning";

        }

        else if (hardware.emergency) {

            badge.textContent =
                "EMERGENCY";

            badge.className =
                "mv-status critical";

        }

        else if (
            hardware.bed_occupied === true
        ) {

            badge.textContent =
                "MONITORING";

            badge.className =
                "mv-status normal";

        }

        else {

            badge.textContent =
                "BED AVAILABLE";

            badge.className =
                "mv-status warning";

        }

    }


    if (connection) {

        connection.textContent =
            hardware.connected

                ? `ESP32 LIVE • Updated ${formatTime(hardware.last_update)}`

                : "Waiting for ESP32 data on COM7";

    }

}


/* =========================================================
   LIVE CARDS
   ========================================================= */

function updateLiveCards() {

    const bed =
        document.getElementById(
            "liveBedStatus"
        );


    const bedSub =
        document.getElementById(
            "liveBedSub"
        );


    const iv =
        document.getElementById(
            "liveIVLevel"
        );


    const ivStatus =
        document.getElementById(
            "liveIVStatus"
        );


    const hr =
        document.getElementById(
            "liveHeartRate"
        );


    const hrStatus =
        document.getElementById(
            "liveHeartStatus"
        );


    const spo2 =
        document.getElementById(
            "liveSpO2"
        );


    const spo2Status =
        document.getElementById(
            "liveSpO2Status"
        );


    const nurse =
        document.getElementById(
            "liveNurse"
        );


    const nurseSub =
        document.getElementById(
            "liveNurseSub"
        );


    const emergency =
        document.getElementById(
            "liveEmergency"
        );


    const emergencySub =
        document.getElementById(
            "liveEmergencySub"
        );


    if (bed) {

        if (!hardware.connected) {

            bed.textContent =
                "WAITING";

        }

        else {

            bed.textContent =
                hardware.bed_occupied
                    ? "OCCUPIED"
                    : "AVAILABLE";

        }

    }


    if (bedSub) {

        bedSub.textContent =
            hardware.connected
                ? "FSR sensor"
                : "Waiting for ESP32";

    }


    if (iv) {

        iv.textContent =
            hardware.iv_level !== null

                ? `${Math.round(
                    hardware.iv_level
                )}%`

                : "--";

    }


    if (ivStatus) {

        ivStatus.textContent =
            hardware.connected

                ? valueOr(
                    hardware.iv_status,
                    "Monitoring"
                )

                : "Waiting for HX711";

    }


    if (hr) {

        hr.textContent =
            hardware.heart_rate !== null

                ? `${Math.round(
                    hardware.heart_rate
                )} BPM`

                : "--";

    }


    if (hrStatus) {

        hrStatus.textContent =
            hardware.heart_rate !== null

                ? getHeartStatus(
                    hardware.heart_rate
                )

                : "Waiting for MAX30102";

    }


    if (spo2) {

        spo2.textContent =
            hardware.spo2 !== null

                ? `${Math.round(
                    hardware.spo2
                )}%`

                : "--";

    }


    if (spo2Status) {

        spo2Status.textContent =
            hardware.spo2 !== null

                ? getSpO2Status(
                    hardware.spo2
                )

                : "Waiting for MAX30102";

    }


    if (nurse) {

        if (!hardware.connected) {

            nurse.textContent =
                "--";

        }

        else {

            nurse.textContent =
                hardware.nurse_present
                    ? "PRESENT"
                    : "AWAY";

        }

    }


    if (nurseSub) {

        if (
            hardware.nurse_present &&
            hardware.nurse_distance !== null
        ) {

            nurseSub.textContent =
                `${Number(
                    hardware.nurse_distance
                ).toFixed(2)} m away`;

        }

        else {

            nurseSub.textContent =
                "BLE proximity";

        }

    }


    if (emergency) {

        emergency.textContent =
            hardware.emergency
                ? "ACTIVE"
                : "NORMAL";

    }


    if (emergencySub) {

        emergencySub.textContent =
            hardware.emergency

                ? "Immediate attention required"

                : "No active emergency";

    }

}


/* =========================================================
   VITAL STATUS
   ========================================================= */

function getHeartStatus(value) {

    const hr =
        Number(value);

    if (
        hr < 50 ||
        hr > 120
    ) {

        return "Critical reading";

    }

    if (
        hr < 60 ||
        hr > 100
    ) {

        return "Monitor";

    }

    return "Normal";

}


function getSpO2Status(value) {

    const valueNumber =
        Number(value);

    if (
        valueNumber < 94
    ) {

        return "Critical reading";

    }

    if (
        valueNumber < 96
    ) {

        return "Monitor";

    }

    return "Normal";

}


/* =========================================================
   RESOURCE OVERVIEW
   ========================================================= */

function updateResourceOverview() {

    const bedText =
        document.getElementById(
            "resourceBedText"
        );


    const bedProgress =
        document.getElementById(
            "bedProgress"
        );


    const bedProgressText =
        document.getElementById(
            "bedProgressText"
        );


    const ivText =
        document.getElementById(
            "resourceIVText"
        );


    const ivProgress =
        document.getElementById(
            "ivProgress"
        );


    const ivProgressText =
        document.getElementById(
            "ivProgressText"
        );


    const nurseText =
        document.getElementById(
            "resourceNurseText"
        );


    const nursePill =
        document.getElementById(
            "nurseResourcePill"
        );


    const monitorPill =
        document.getElementById(
            "monitorResourcePill"
        );


    if (bedText) {

        bedText.textContent =
            hardware.connected

                ? `BED-01 • ${
                    hardware.bed_occupied
                        ? "Occupied"
                        : "Available"
                }`

                : "BED-01 • Waiting";

    }


    if (bedProgress) {

        bedProgress.style.width =
            hardware.bed_occupied
                ? "100%"
                : "0%";

    }


    if (bedProgressText) {

        bedProgressText.textContent =
            hardware.connected

                ? (
                    hardware.bed_occupied
                        ? "OCCUPIED"
                        : "FREE"
                )

                : "--";

    }


    if (ivText) {

        ivText.textContent =
            hardware.iv_level !== null

                ? valueOr(
                    hardware.iv_status,
                    "Monitoring"
                )

                : "Waiting for HX711";

    }


    if (ivProgress) {

        const level =
            Number(
                hardware.iv_level
            );


        ivProgress.style.width =
            Number.isFinite(level)

                ? `${Math.max(
                    0,
                    Math.min(100, level)
                )}%`

                : "0%";

    }


    if (ivProgressText) {

        ivProgressText.textContent =
            hardware.iv_level !== null

                ? `${Math.round(
                    hardware.iv_level
                )}%`

                : "--";

    }


    if (nurseText) {

        if (
            hardware.nurse_present &&
            hardware.nurse_distance !== null
        ) {

            nurseText.textContent =
                `Present • ${
                    Number(
                        hardware.nurse_distance
                    ).toFixed(2)
                } m`;

        }

        else if (
            hardware.connected
        ) {

            nurseText.textContent =
                "Away";

        }

        else {

            nurseText.textContent =
                "BLE proximity monitoring";

        }

    }


    if (nursePill) {

        nursePill.textContent =
            hardware.connected

                ? (
                    hardware.nurse_present
                        ? "PRESENT"
                        : "AWAY"
                )

                : "WAITING";

    }


    if (monitorPill) {

        monitorPill.textContent =
            (
                hardware.heart_rate !== null ||
                hardware.spo2 !== null
            )

                ? "CONNECTED"

                : "WAITING";

    }

}


/* =========================================================
   AI STATE
   ========================================================= */

function getAIState() {

    if (!hardware.connected) {

        return {

            title: "Waiting for patient data",

            text:
                "ESP32 is connected to the backend but live sensor data has not arrived yet.",

            alerts: 0

        };

    }


    if (hardware.emergency) {

        return {

            title:
                "Emergency escalation required",

            text:
                "Medinova detected an active emergency condition from the patient monitoring system.",

            alerts: 1

        };

    }


    if (
        hardware.iv_level !== null &&
        Number(hardware.iv_level) <= 20
    ) {

        return {

            title:
                "IV level requires attention",

            text:
                "IV level is at or below the configured low threshold. Nurse attention is required.",

            alerts: 1

        };

    }


    if (
        hardware.spo2 !== null &&
        Number(hardware.spo2) < 94
    ) {

        return {

            title:
                "SpO₂ requires attention",

            text:
                "The latest SpO₂ reading is below the configured monitoring threshold.",

            alerts: 1

        };

    }


    if (
        hardware.heart_rate !== null &&
        (
            Number(hardware.heart_rate) < 50 ||
            Number(hardware.heart_rate) > 120
        )
    ) {

        return {

            title:
                "Heart rate requires attention",

            text:
                "The latest heart-rate reading is outside the configured safe range.",

            alerts: 1

        };

    }


    if (
        settings.alertNurseAway &&
        hardware.nurse_present === false
    ) {

        return {

            title:
                "Nurse proximity alert",

            text:
                "The BLE nurse beacon is currently outside the configured proximity range.",

            alerts: 1

        };

    }


    return {

        title:
            "Patient state stable",

        text:
            "No active escalation condition has been detected from the available ESP32 readings.",

        alerts: 0

    };

}


function updateAISummary() {

    const state =
        getAIState();


    const title =
        document.getElementById(
            "aiSummaryTitle"
        );


    const text =
        document.getElementById(
            "aiSummaryText"
        );


    const patient =
        document.getElementById(
            "aiPatientStat"
        );


    const resource =
        document.getElementById(
            "aiResourceStat"
        );


    const alerts =
        document.getElementById(
            "aiAlertStat"
        );


    if (title) {

        title.textContent =
            state.title;

    }


    if (text) {

        text.textContent =
            state.text;

    }


    if (patient) {

        patient.textContent =
            PATIENT.id;

    }


    if (resource) {

        resource.textContent =
            "4";

    }


    if (alerts) {

        alerts.textContent =
            String(
                state.alerts
            );

    }

}


function runAIAnalysis() {

    const state =
        getAIState();


    addActivity(

        "AI allocation analysis executed",

        `${PATIENT.id} / ${PATIENT.bed}`,

        state.alerts > 0
            ? "Attention"
            : "Completed"

    );


    alert(

        state.alerts > 0

            ? `AI detected a condition requiring attention.\n\n${state.text}`

            : `AI analysis complete.\n\n${state.text}`

    );

}


/* =========================================================
   EMERGENCY
   ========================================================= */

function updateEmergencyPanel() {

    const container =
        document.getElementById(
            "dashboardEmergencyContent"
        );


    const count =
        document.getElementById(
            "dashboardAlertCount"
        );


    const state =
        getAIState();


    if (count) {

        count.textContent =
            String(
                state.alerts
            );

    }


    if (!container) {

        return;

    }


    if (state.alerts === 0) {

        container.innerHTML = `

            <div class="mv-empty-state">

                <i class="fa-solid fa-shield-heart"></i>

                <strong>
                    No active emergency
                </strong>

                <span>
                    Patient is being monitored continuously.
                </span>

            </div>

        `;

        return;

    }


    container.innerHTML = `

        <div class="emergency-item">

            <div class="patient-alert-icon">

                <i class="fa-solid fa-heart-pulse"></i>

            </div>


            <div class="emergency-info">

                <strong>
                    P001
                </strong>

                <span>
                    ${escapeHTML(
                        state.text
                    )}
                </span>

                <small>
                    Live ESP32 reading
                </small>

            </div>


            <button
                class="alert-action"
                onclick="respondToEmergency()">

                Respond

            </button>

        </div>

    `;

}


function activateEmergency() {

    hardware.emergency =
        true;


    addActivity(

        "Emergency workflow activated",

        "P001 / BED-01",

        "Critical"

    );


    addNotification(

        "Emergency workflow activated",

        "Demo emergency escalation has been activated.",

        "critical"

    );


    showPage(
        "emergency"
    );

}


function respondToEmergency() {

    addActivity(

        "Emergency response acknowledged",

        "P001 / BED-01",

        "Acknowledged"

    );


    addNotification(

        "Emergency response acknowledged",

        "The response workflow has been acknowledged.",

        "info"

    );


    alert(
        "Emergency response acknowledged for P001."
    );

}


/* =========================================================
   FORECAST
   ========================================================= */

function getForecastLevel() {

    const state =
        getAIState();


    if (
        state.alerts > 0
    ) {

        return "HIGH";

    }


    if (
        hardware.iv_level !== null &&
        Number(
            hardware.iv_level
        ) < 40
    ) {

        return "MEDIUM";

    }


    return "LOW";

}


function updateForecast() {

    const level =
        getForecastLevel();


    const number =
        document.getElementById(
            "forecastRiskNumber"
        );


    const text =
        document.getElementById(
            "forecastRiskText"
        );


    if (number) {

        number.textContent =
            level;

    }


    if (text) {

        text.textContent =

            level === "HIGH"

                ? "Immediate resource attention may be required"

                : level === "MEDIUM"

                    ? "Monitor IV and resource demand"

                    : "Current patient resource demand";

    }

}


/* =========================================================
   HARDWARE API
   ========================================================= */

function normalizeHardware(data) {

    const source =

        data?.hardware ||

        data?.latest_hardware ||

        data?.data ||

        data ||

        {};


    return {

        connected:
            Boolean(
                source.connected ??
                source.serial_connected ??
                true
            ),


        weight:
            numberOrNull(
                source.weight ??
                source.iv_weight
            ),


        iv_level:
            numberOrNull(
                source.iv_level ??
                source.ivLevel
            ),


        iv_status:
            source.iv_status ??
            source.ivStatus ??
            "--",


        heart_rate:
            numberOrNull(
                source.heart_rate ??
                source.heartRate
            ),


        spo2:
            numberOrNull(
                source.spo2 ??
                source.SpO2 ??
                source.spO2
            ),


        nurse_present:
            source.nurse_present ??
            source.nursePresent ??
            null,


        nurse_rssi:
            numberOrNull(
                source.nurse_rssi ??
                source.nurseRSSI
            ),


        nurse_distance:
            numberOrNull(
                source.nurse_distance ??
                source.nurseDistance
            ),


        bed_occupied:
            source.bed_occupied ??
            source.bedOccupied ??
            null,


        emergency:
            Boolean(
                source.emergency ??
                source.emergency_active ??
                false
            ),


        last_update:
            source.last_update ??
            source.lastUpdate ??
            new Date().toISOString()

    };

}


async function fetchHardware() {

    try {

        const response =
            await fetch(
                `${API_BASE}/api/hardware`,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        hardware =
            normalizeHardware(
                data
            );


        hardware.connected =
            true;


        setSystemOnline(
            true
        );


        processHardwareAlerts();


        updateCommandCenter();


    }

    catch (error) {

        hardware.connected =
            false;


        setSystemOnline(
            false
        );


        updateCommandCenter();


        console.warn(
            "ESP32 data unavailable:",
            error.message
        );

    }

}


/* =========================================================
   SYSTEM STATUS
   ========================================================= */

function setSystemOnline(online) {

    const text =
        document.getElementById(
            "systemStatusText"
        );


    const sub =
        document.getElementById(
            "systemStatusSub"
        );


    if (text) {

        text.textContent =
            online
                ? "System Online"
                : "Waiting for ESP32";

    }


    if (sub) {

        sub.textContent =
            online
                ? "ESP32 monitoring active"
                : "Backend / COM7 unavailable";

    }

}


/* =========================================================
   HARDWARE ALERTS
   ========================================================= */

function processHardwareAlerts() {

    if (!hardware.connected) {

        return;

    }


    const emergencyNow =
        Boolean(
            hardware.emergency
        );


    const lowIVNow =
        hardware.iv_level !== null &&
        Number(
            hardware.iv_level
        ) <= 20;


    const abnormalHRNow =
        hardware.heart_rate !== null &&
        (
            Number(
                hardware.heart_rate
            ) < 50 ||

            Number(
                hardware.heart_rate
            ) > 120
        );


    const lowSpO2Now =
        hardware.spo2 !== null &&
        Number(
            hardware.spo2
        ) < 94;


    const nurseAwayNow =
        hardware.nurse_present === false;


    checkTransition(

        "emergency",

        emergencyNow,

        "Critical Patient Emergency",

        "ESP32 reported an active emergency condition.",

        "critical"

    );


    checkTransition(

        "lowIV",

        lowIVNow,

        "Low IV Level",

        `IV level is ${hardware.iv_level}%.`,

        "warning"

    );


    checkTransition(

        "abnormalHR",

        abnormalHRNow,

        "Abnormal Heart Rate",

        `Heart rate is ${hardware.heart_rate} BPM.`,

        "critical"

    );


    checkTransition(

        "lowSpO2",

        lowSpO2Now,

        "Low SpO₂",

        `SpO₂ is ${hardware.spo2}%.`,

        "critical"

    );


    if (
        settings.alertNurseAway
    ) {

        checkTransition(

            "nurseAway",

            nurseAwayNow,

            "Nurse Not Nearby",

            "BLE nurse beacon is outside the configured range.",

            "warning"

        );

    }


    previousAlerts = {

        emergency:
            emergencyNow,

        lowIV:
            lowIVNow,

        abnormalHR:
            abnormalHRNow,

        lowSpO2:
            lowSpO2Now,

        nurseAway:
            nurseAwayNow

    };

}


function checkTransition(

    key,

    active,

    title,

    message,

    type

) {

    if (
        active &&
        !previousAlerts[key]
    ) {

        addNotification(
            title,
            message,
            type
        );


        addActivity(

            title,

            "P001 / BED-01",

            type === "critical"
                ? "Critical"
                : "Attention"

        );

    }

}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function addNotification(

    title,

    message,

    type = "info"

) {

    notifications.unshift({

        id:
            `local-${Date.now()}`,

        title,

        message,

        type,

        read: false,

        created_at:
            new Date().toISOString()

    });


    notifications =
        notifications.slice(
            0,
            20
        );


    updateNotificationUI();

}


function updateNotificationUI() {

    const count =
        document.getElementById(
            "notificationCount"
        );


    const unread =
        notifications.filter(
            item =>
                !item.read
        ).length;


    if (count) {

        count.textContent =
            String(unread);


        count.style.display =
            unread > 0
                ? "flex"
                : "none";

    }


    renderNotificationList();

}


function renderNotificationList() {

    const list =
        document.getElementById(
            "notificationList"
        );


    if (!list) {

        return;

    }


    if (
        notifications.length === 0
    ) {

        list.innerHTML = `

            <div class="mv-notification-empty">
                No notifications
            </div>

        `;

        return;

    }


    list.innerHTML =
        notifications
            .map(item => `

                <div
                    class="mv-notification-item ${
                        item.read
                            ? "read"
                            : ""
                    }"
                    onclick="markNotificationRead('${item.id}')">

                    <div
                        class="mv-notification-icon ${
                            item.type || "info"
                        }">

                        <i class="fa-solid fa-bell"></i>

                    </div>


                    <div>

                        <strong>
                            ${escapeHTML(
                                item.title
                            )}
                        </strong>

                        <p>
                            ${escapeHTML(
                                item.message
                            )}
                        </p>

                        <small>
                            ${formatTime(
                                item.created_at
                            )}
                        </small>

                    </div>

                </div>

            `)
            .join("");

}


function toggleNotificationPanel() {

    const panel =
        document.getElementById(
            "notificationPanel"
        );


    if (panel) {

        panel.classList.toggle(
            "hidden"
        );

    }

}


function markNotificationRead(id) {

    const item =
        notifications.find(
            n =>
                String(n.id) ===
                String(id)
        );


    if (item) {

        item.read =
            true;

    }


    updateNotificationUI();

}


function markAllNotificationsRead() {

    notifications.forEach(
        item =>
            item.read = true
    );


    updateNotificationUI();

}


async function fetchNotifications() {

    try {

        const response =
            await fetch(
                `${API_BASE}/api/notifications`,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            return;

        }


        const data =
            await response.json();


        const serverNotifications =

            Array.isArray(data)

                ? data

                : Array.isArray(
                    data.notifications
                )

                    ? data.notifications

                    : [];


        if (
            serverNotifications.length > 0
        ) {

            const local =
                notifications.filter(
                    item =>
                        String(
                            item.id
                        ).startsWith(
                            "local-"
                        )
                );


            notifications = [

                ...serverNotifications.map(
                    item => ({

                        id:
                            item.id,

                        title:
                            item.title ||
                            "Notification",

                        message:
                            item.message ||
                            "",

                        type:
                            item.type ||
                            item.notification_type ||
                            "info",

                        read:
                            Boolean(
                                item.read
                            ),

                        created_at:
                            item.created_at ||
                            new Date().toISOString()

                    })
                ),

                ...local

            ].slice(
                0,
                20
            );


            updateNotificationUI();

        }

    }

    catch (error) {

        console.log(
            "Notification API unavailable"
        );

    }

}


/* =========================================================
   ACTIVITY
   ========================================================= */

function renderActivity() {

    const container =
        document.getElementById(
            "activityRows"
        );


    if (!container) {

        return;

    }


    container.innerHTML =
        activityLog
            .slice(0, 6)
            .map(item => `

                <div class="table-row">

                    <span>
                        ${formatTime()}
                    </span>

                    <span>
                        ${escapeHTML(
                            item.event
                        )}
                    </span>

                    <span>
                        ${escapeHTML(
                            item.resource
                        )}
                    </span>

                    <span class="${
                        item.status === "Critical"
                            ? "status-danger"
                            : "status-success"
                    }">

                        ${escapeHTML(
                            item.status
                        )}

                    </span>

                </div>

            `)
            .join("");

}


/* =========================================================
   PAGE ROUTER
   ========================================================= */

function showPage(page) {

    if (
        page === "command"
    ) {

        showCommandCenter();

        return;

    }


    currentPage =
        page;


    localStorage.setItem(
        PAGE_KEY,
        page
    );


    updatePageHeader(
        page
    );


    setActiveNav(
        page
    );


    const dashboard =
        document.getElementById(
            "commandDashboard"
        );


    const content =
        document.getElementById(
            "pageContent"
        );


    if (dashboard) {

        dashboard.style.display =
            "none";

    }


    if (content) {

        content.style.display =
            "block";


        content.innerHTML =
            getPageHTML(page);

    }


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


/* =========================================================
   PAGE HTML
   ========================================================= */

function pageShell(

    title,

    subtitle,

    content

) {

    return `

        <div class="medinova-page">

            <div class="page-header">

                <div>

                    <h1>
                        ${title}
                    </h1>

                    <p>
                        ${subtitle}
                    </p>

                </div>

            </div>

            ${content}

        </div>

    `;

}


/* =========================================================
   PATIENT PAGE
   ========================================================= */

function patientPage() {

    return pageShell(

        "Patient Management",

        "Single demo patient profile",

        `

        <div class="stats-grid">

            <div class="stat-card">

                <h3>
                    Patient ID
                </h3>

                <strong>
                    P001
                </strong>

                <span>
                    Demo patient
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Bed
                </h3>

                <strong>
                    BED-01
                </strong>

                <span>
                    ICU
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Priority
                </h3>

                <strong>
                    HIGH
                </strong>

                <span>
                    Continuous monitoring
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Monitoring
                </h3>

                <strong>
                    LIVE
                </strong>

                <span>
                    ESP32
                </span>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                Patient Profile
            </h2>

            <div class="mv-profile-grid">

                <div>
                    <span>Name</span>
                    <strong>
                        ${PATIENT.name}
                    </strong>
                </div>

                <div>
                    <span>Age</span>
                    <strong>
                        ${PATIENT.age}
                    </strong>
                </div>

                <div>
                    <span>Gender</span>
                    <strong>
                        ${PATIENT.gender}
                    </strong>
                </div>

                <div>
                    <span>Diagnosis</span>
                    <strong>
                        ${PATIENT.diagnosis}
                    </strong>
                </div>

                <div>
                    <span>Doctor</span>
                    <strong>
                        ${PATIENT.doctor}
                    </strong>
                </div>

                <div>
                    <span>Ward</span>
                    <strong>
                        ${PATIENT.ward}
                    </strong>
                </div>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                Live Patient Observations
            </h2>

            ${observationTable()}

        </div>

        `

    );

}


/* =========================================================
   BED PAGE
   ========================================================= */

function bedPage() {

    const status =

        !hardware.connected

            ? "Waiting"

            : hardware.bed_occupied
                ? "Occupied"
                : "Available";


    return pageShell(

        "Bed Management",

        "Physical demonstration bed",

        `

        <div class="stats-grid">

            <div class="stat-card">

                <h3>
                    Demo Beds
                </h3>

                <strong>
                    01
                </strong>

                <span>
                    BED-01
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Current Status
                </h3>

                <strong>
                    ${status}
                </strong>

                <span>
                    FSR sensor
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Patient
                </h3>

                <strong>
                    P001
                </strong>

                <span>
                    Demo Patient
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Hardware
                </h3>

                <strong>
                    ${hardware.connected
                        ? "LIVE"
                        : "WAITING"}
                </strong>

                <span>
                    COM7
                </span>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                BED-01 Live Status
            </h2>

            <div class="mv-monitor-grid">

                <div>

                    <i class="fa-solid fa-bed"></i>

                    <span>
                        Occupancy
                    </span>

                    <strong>
                        ${
                            hardware.bed_occupied === null
                                ? "--"
                                : hardware.bed_occupied
                                    ? "OCCUPIED"
                                    : "AVAILABLE"
                        }
                    </strong>

                </div>


                <div>

                    <i class="fa-solid fa-scale-balanced"></i>

                    <span>
                        FSR Weight
                    </span>

                    <strong>
                        ${
                            hardware.weight === null
                                ? "--"
                                : `${hardware.weight.toFixed(1)} g`
                        }
                    </strong>

                </div>


                <div>

                    <i class="fa-solid fa-link"></i>

                    <span>
                        ESP32
                    </span>

                    <strong>
                        ${
                            hardware.connected
                                ? "CONNECTED"
                                : "WAITING"
                        }
                    </strong>

                </div>

            </div>

        </div>

        `

    );

}


/* =========================================================
   STAFF PAGE
   ========================================================= */

function staffPage() {

    return pageShell(

        "Staff Management",

        "Staff supporting P001",

        `

        <div class="stats-grid">

            <div class="stat-card">

                <h3>
                    Assigned Team
                </h3>

                <strong>
                    03
                </strong>

                <span>
                    Doctors + nurses
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Nurses
                </h3>

                <strong>
                    02
                </strong>

                <span>
                    ICU
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Doctor
                </h3>

                <strong>
                    01
                </strong>

                <span>
                    Dr. Kumar
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Nurse Proximity
                </h3>

                <strong>
                    ${
                        hardware.nurse_present
                            ? "NEAR"
                            : "AWAY"
                    }
                </strong>

                <span>
                    BLE
                </span>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                Assigned Staff
            </h2>

            <div class="table-container">

                <table class="data-table">

                    <thead>

                        <tr>

                            <th>
                                ID
                            </th>

                            <th>
                                Name
                            </th>

                            <th>
                                Role
                            </th>

                            <th>
                                Department
                            </th>

                            <th>
                                Status
                            </th>

                            <th>
                                Workload
                            </th>

                        </tr>

                    </thead>


                    <tbody>

                        ${STAFF.map(
                            person => `

                            <tr>

                                <td>
                                    ${person.id}
                                </td>

                                <td>
                                    ${person.name}
                                </td>

                                <td>
                                    ${person.role}
                                </td>

                                <td>
                                    ${person.department}
                                </td>

                                <td>
                                    <span class="${statusClass(person.status)}">
                                        ${person.status}
                                    </span>
                                </td>

                                <td>
                                    ${person.workload}
                                </td>

                            </tr>

                        `
                        ).join("")}

                    </tbody>

                </table>

            </div>

        </div>

        `

    );

}


/* =========================================================
   EQUIPMENT PAGE
   ========================================================= */

function equipmentPage() {

    return pageShell(

        "Equipment Management",

        "Equipment supporting BED-01",

        `

        <div class="stats-grid">

            <div class="stat-card">

                <h3>
                    Patient Monitor
                </h3>

                <strong>
                    ${
                        hardware.connected
                            ? "LIVE"
                            : "WAITING"
                    }
                </strong>

                <span>
                    MAX30102
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    IV Sensor
                </h3>

                <strong>
                    ${
                        hardware.connected
                            ? "LIVE"
                            : "WAITING"
                    }
                </strong>

                <span>
                    HX711
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    BLE
                </h3>

                <strong>
                    ${
                        hardware.nurse_present
                            ? "NEAR"
                            : "AWAY"
                    }
                </strong>

                <span>
                    Nurse beacon
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    ESP32
                </h3>

                <strong>
                    ${
                        hardware.connected
                            ? "ONLINE"
                            : "WAITING"
                    }
                </strong>

                <span>
                    COM7
                </span>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                Equipment Inventory
            </h2>

            <div class="table-container">

                <table class="data-table">

                    <thead>

                        <tr>

                            <th>
                                Equipment
                            </th>

                            <th>
                                ID
                            </th>

                            <th>
                                Type
                            </th>

                            <th>
                                Location
                            </th>

                            <th>
                                Status
                            </th>

                        </tr>

                    </thead>


                    <tbody>

                        ${EQUIPMENT.map(
                            item => `

                            <tr>

                                <td>
                                    ${item.name}
                                </td>

                                <td>
                                    ${item.id}
                                </td>

                                <td>
                                    ${item.type}
                                </td>

                                <td>
                                    ${item.location}
                                </td>

                                <td>
                                    <span class="${statusClass(item.status)}">
                                        ${item.status}
                                    </span>
                                </td>

                            </tr>

                        `
                        ).join("")}

                    </tbody>

                </table>

            </div>

        </div>

        `

    );

}


/* =========================================================
   OT PAGE
   ========================================================= */

function otPage() {

    return pageShell(

        "OT Scheduler",

        "Operating theatre scheduling",

        `

        <div class="stats-grid">

            <div class="stat-card">

                <h3>
                    OT Slots
                </h3>

                <strong>
                    03
                </strong>

                <span>
                    Demo schedule
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Emergency Slot
                </h3>

                <strong>
                    01
                </strong>

                <span>
                    Reserved
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Patient
                </h3>

                <strong>
                    P001
                </strong>

                <span>
                    Demo patient
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    AI Scheduler
                </h3>

                <strong>
                    READY
                </strong>

                <span>
                    Decision engine
                </span>

            </div>

        </div>


        <div class="dashboard-card">

            <div class="card-header">

                <div>

                    <h2>
                        Today's OT Schedule
                    </h2>

                    <p>
                        Software orchestration
                    </p>

                </div>


                <button
                    class="primary-btn"
                    onclick="optimizeOT()">

                    <i class="fa-solid fa-wand-magic-sparkles"></i>

                    Optimize

                </button>

            </div>


            <div class="table-container">

                <table class="data-table">

                    <thead>

                        <tr>

                            <th>
                                OT
                            </th>

                            <th>
                                Time
                            </th>

                            <th>
                                Procedure
                            </th>

                            <th>
                                Priority
                            </th>

                            <th>
                                Status
                            </th>

                        </tr>

                    </thead>


                    <tbody>

                        ${OT_SLOTS.map(
                            slot => `

                            <tr>

                                <td>
                                    ${slot.id}
                                </td>

                                <td>
                                    ${slot.time}
                                </td>

                                <td>
                                    ${slot.procedure}
                                </td>

                                <td>
                                    <span class="${statusClass(slot.priority)}">
                                        ${slot.priority}
                                    </span>
                                </td>

                                <td>
                                    ${slot.status}
                                </td>

                            </tr>

                        `
                        ).join("")}

                    </tbody>

                </table>

            </div>

        </div>

        `

    );

}


function optimizeOT() {

    addActivity(

        "AI optimized OT schedule",

        "P001 / OT-02",

        "Completed"

    );


    alert(

        "OT optimization complete.\n\n" +

        "Emergency capacity reserved for the monitored patient."

    );

}


/* =========================================================
   AI PAGE
   ========================================================= */

function aiPage() {

    const state =
        getAIState();


    return pageShell(

        "AI Orchestration",

        "Patient-aware resource decision engine",

        `

        <div class="stats-grid">

            <div class="stat-card">

                <h3>
                    Patient State
                </h3>

                <strong>
                    ${
                        hardware.connected
                            ? "LIVE"
                            : "WAITING"
                    }
                </strong>

                <span>
                    P001
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Resources
                </h3>

                <strong>
                    04
                </strong>

                <span>
                    Bed / IV / Monitor / Nurse
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Alerts
                </h3>

                <strong>
                    ${state.alerts}
                </strong>

                <span>
                    Current state
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Decision Mode
                </h3>

                <strong>
                    REAL-TIME
                </strong>

                <span>
                    Orchestration engine
                </span>

            </div>

        </div>


        <div class="dashboard-card">

            <div class="card-header">

                <div>

                    <h2>
                        <i class="fa-solid fa-brain"></i>

                        Hospital State Analysis
                    </h2>

                    <p>
                        Current patient state
                    </p>

                </div>

                <span class="ai-status">
                    ACTIVE
                </span>

            </div>


            <div class="mv-ai-layout">

                <div class="mv-ai-decision">

                    <div class="mv-ai-circle">

                        <i class="fa-solid fa-brain"></i>

                    </div>


                    <h3>
                        ${state.title}
                    </h3>


                    <p>
                        ${state.text}
                    </p>


                    <button
                        class="primary-btn"
                        onclick="runAIAnalysis()">

                        <i class="fa-solid fa-bolt"></i>

                        Run Allocation Analysis

                    </button>

                </div>


                <div class="mv-decision-list">

                    <div>

                        <span>
                            Patient Priority
                        </span>

                        <strong>
                            HIGH
                        </strong>

                    </div>


                    <div>

                        <span>
                            Bed
                        </span>

                        <strong>
                            BED-01
                        </strong>

                    </div>


                    <div>

                        <span>
                            Nurse
                        </span>

                        <strong>
                            ${
                                hardware.nurse_present
                                    ? "PRESENT"
                                    : "AWAY"
                            }
                        </strong>

                    </div>


                    <div>

                        <span>
                            Emergency
                        </span>

                        <strong>
                            ${
                                hardware.emergency
                                    ? "ACTIVE"
                                    : "NORMAL"
                            }
                        </strong>

                    </div>

                </div>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                Decision Flow
            </h2>

            <div class="mv-flow">

                <div>

                    <i class="fa-solid fa-satellite-dish"></i>

                    <span>
                        ESP32
                    </span>

                </div>


                <b>
                    →
                </b>


                <div>

                    <i class="fa-solid fa-database"></i>

                    <span>
                        Data Layer
                    </span>

                </div>


                <b>
                    →
                </b>


                <div>

                    <i class="fa-solid fa-brain"></i>

                    <span>
                        AI Engine
                    </span>

                </div>


                <b>
                    →
                </b>


                <div>

                    <i class="fa-solid fa-user-nurse"></i>

                    <span>
                        Action
                    </span>

                </div>

            </div>

        </div>

        `

    );

}


/* =========================================================
   FORECAST PAGE
   ========================================================= */

function forecastPage() {

    const level =
        getForecastLevel();


    return pageShell(

        "Patient Load Forecast",

        "AI prediction based on current patient state",

        `

        <div class="stats-grid">

            <div class="stat-card">

                <h3>
                    Current Demand
                </h3>

                <strong>
                    ${level}
                </strong>

                <span>
                    P001
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Bed Demand
                </h3>

                <strong>
                    01
                </strong>

                <span>
                    BED-01
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Monitoring
                </h3>

                <strong>
                    01
                </strong>

                <span>
                    MAX30102
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    IV Monitoring
                </h3>

                <strong>
                    01
                </strong>

                <span>
                    HX711
                </span>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                Next 4 Hours
            </h2>

            <div class="mv-forecast-big">

                <strong>
                    ${level}
                </strong>

                <span>
                    resource attention level
                </span>

            </div>


            <div class="mv-forecast-grid">

                <div>

                    <span>
                        Now
                    </span>

                    <strong>
                        ${level}
                    </strong>

                </div>


                <div>

                    <span>
                        +1 hour
                    </span>

                    <strong>
                        ${level}
                    </strong>

                </div>


                <div>

                    <span>
                        +2 hours
                    </span>

                    <strong>
                        ${
                            level === "LOW"
                                ? "LOW"
                                : "MEDIUM"
                        }
                    </strong>

                </div>


                <div>

                    <span>
                        +3 hours
                    </span>

                    <strong>
                        ${
                            level === "HIGH"
                                ? "HIGH"
                                : "MEDIUM"
                        }
                    </strong>

                </div>


                <div>

                    <span>
                        +4 hours
                    </span>

                    <strong>
                        ${level}
                    </strong>

                </div>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                Forecast Insight
            </h2>

            <div class="mv-insight">

                <i class="fa-solid fa-lightbulb"></i>

                <p>

                    ${
                        level === "HIGH"

                            ? "Current patient readings indicate that staff attention and emergency resources may be required."

                            : level === "MEDIUM"

                                ? "Resource demand is moderate. Continue monitoring IV and vital-sign trends."

                                : "Current resource demand is low. Continue normal monitoring and keep the assigned nurse available."
                    }

                </p>

            </div>

        </div>

        `

    );

}


/* =========================================================
   EMERGENCY PAGE
   ========================================================= */

function emergencyPage() {

    const state =
        getAIState();


    return pageShell(

        "Emergency Command",

        "Real-time emergency escalation workflow",

        `

        <div class="stats-grid">

            <div class="stat-card">

                <h3>
                    Emergency State
                </h3>

                <strong>
                    ${
                        hardware.emergency
                            ? "ACTIVE"
                            : "NORMAL"
                    }
                </strong>

                <span>
                    P001
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Response Team
                </h3>

                <strong>
                    03
                </strong>

                <span>
                    Nurse + doctor + supervisor
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Bed
                </h3>

                <strong>
                    BED-01
                </strong>

                <span>
                    Patient location
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Escalation
                </h3>

                <strong>
                    ${
                        state.alerts
                            ? "REQUIRED"
                            : "READY"
                    }
                </strong>

                <span>
                    Role-based workflow
                </span>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                Live Emergency Monitor
            </h2>


            <div
                class="mv-emergency-box ${
                    hardware.emergency
                        ? "critical"
                        : ""
                }">

                <div class="mv-emergency-icon">

                    <i class="fa-solid fa-triangle-exclamation"></i>

                </div>


                <div>

                    <h3>

                        ${
                            hardware.emergency
                                ? "Emergency detected"
                                : "No active emergency"
                        }

                    </h3>


                    <p>
                        ${state.text}
                    </p>

                </div>

            </div>


            <div class="mv-escalation-flow">

                <div class="${
                    hardware.emergency
                        ? "active"
                        : ""
                }">

                    <strong>
                        1
                    </strong>

                    <span>
                        ESP32 detects condition
                    </span>

                </div>


                <div class="${
                    hardware.emergency
                        ? "active"
                        : ""
                }">

                    <strong>
                        2
                    </strong>

                    <span>
                        AI evaluates state
                    </span>

                </div>


                <div class="${
                    hardware.emergency
                        ? "active"
                        : ""
                }">

                    <strong>
                        3
                    </strong>

                    <span>
                        Nurse receives alert
                    </span>

                </div>


                <div>

                    <strong>
                        4
                    </strong>

                    <span>
                        Supervisor escalation
                    </span>

                </div>

            </div>


            <div class="toolbar">

                <button
                    class="danger-btn"
                    onclick="activateEmergency()">

                    <i class="fa-solid fa-bell"></i>

                    Activate Demo Emergency

                </button>


                <button
                    class="secondary-btn"
                    onclick="respondToEmergency()">

                    Acknowledge Response

                </button>

            </div>

        </div>

        `

    );

}


/* =========================================================
   HEALTH / FHIR
   ========================================================= */

function healthPage() {

    return pageShell(

        "EHR / FHIR Integration",

        "FHIR-style data for P001",

        `

        <div class="stats-grid">

            <div class="stat-card">

                <h3>
                    Patient
                </h3>

                <strong>
                    P001
                </strong>

                <span>
                    Demo Patient
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Observations
                </h3>

                <strong>
                    04
                </strong>

                <span>
                    Live observations
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Bed
                </h3>

                <strong>
                    BED-01
                </strong>

                <span>
                    ICU
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Integration
                </h3>

                <strong>
                    READY
                </strong>

                <span>
                    FHIR-compatible
                </span>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                FHIR-style Patient Resource
            </h2>


            <pre class="mv-json">${escapeHTML(
JSON.stringify(
{
    resourceType: "Patient",
    id: PATIENT.id,
    name: PATIENT.name,
    gender: PATIENT.gender.toLowerCase(),
    age: PATIENT.age,
    managingOrganization:
        settings.hospitalName
},
null,
2
)
)}</pre>

        </div>


        <div class="dashboard-card">

            <h2>
                Live Observations
            </h2>

            ${observationTable()}

        </div>

        `

    );

}


function observationTable() {

    return `

        <div class="table-container">

            <table class="data-table">

                <thead>

                    <tr>

                        <th>
                            Observation
                        </th>

                        <th>
                            Value
                        </th>

                        <th>
                            Source
                        </th>

                        <th>
                            Status
                        </th>

                    </tr>

                </thead>


                <tbody>

                    <tr>

                        <td>
                            Bed Occupancy
                        </td>

                        <td>
                            ${
                                hardware.bed_occupied === null

                                    ? "--"

                                    : hardware.bed_occupied
                                        ? "Occupied"
                                        : "Available"
                            }
                        </td>

                        <td>
                            FSR
                        </td>

                        <td>
                            ${
                                hardware.connected
                                    ? "Live"
                                    : "Waiting"
                            }
                        </td>

                    </tr>


                    <tr>

                        <td>
                            IV Level
                        </td>

                        <td>
                            ${
                                hardware.iv_level === null
                                    ? "--"
                                    : `${hardware.iv_level}%`
                            }
                        </td>

                        <td>
                            HX711
                        </td>

                        <td>
                            ${
                                hardware.iv_level === null
                                    ? "Waiting"
                                    : hardware.iv_status
                            }
                        </td>

                    </tr>


                    <tr>

                        <td>
                            Heart Rate
                        </td>

                        <td>
                            ${
                                hardware.heart_rate === null
                                    ? "--"
                                    : `${hardware.heart_rate} BPM`
                            }
                        </td>

                        <td>
                            MAX30102
                        </td>

                        <td>
                            ${
                                hardware.heart_rate === null
                                    ? "Waiting"
                                    : getHeartStatus(
                                        hardware.heart_rate
                                    )
                            }
                        </td>

                    </tr>


                    <tr>

                        <td>
                            SpO₂
                        </td>

                        <td>
                            ${
                                hardware.spo2 === null
                                    ? "--"
                                    : `${hardware.spo2}%`
                            }
                        </td>

                        <td>
                            MAX30102
                        </td>

                        <td>
                            ${
                                hardware.spo2 === null
                                    ? "Waiting"
                                    : getSpO2Status(
                                        hardware.spo2
                                    )
                            }
                        </td>

                    </tr>

                </tbody>

            </table>

        </div>

    `;

}


/* =========================================================
   ANALYTICS
   ========================================================= */

function analyticsPage() {

    const state =
        getAIState();


    return pageShell(

        "Hospital Analytics",

        "Operational analytics for P001",

        `

        <div class="stats-grid">

            <div class="stat-card">

                <h3>
                    Patients
                </h3>

                <strong>
                    01
                </strong>

                <span>
                    Demo scope
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Bed Utilization
                </h3>

                <strong>
                    ${
                        hardware.bed_occupied
                            ? "100%"
                            : "0%"
                    }
                </strong>

                <span>
                    BED-01
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    Alerts
                </h3>

                <strong>
                    ${state.alerts}
                </strong>

                <span>
                    Current
                </span>

            </div>


            <div class="stat-card">

                <h3>
                    ESP32
                </h3>

                <strong>
                    ${
                        hardware.connected
                            ? "LIVE"
                            : "WAITING"
                    }
                </strong>

                <span>
                    COM7
                </span>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                Monitoring Analytics
            </h2>


            <div class="mv-analytics-grid">

                ${analyticsMetric(
                    "IV Level",
                    hardware.iv_level ?? 0
                )}

                ${analyticsMetric(
                    "SpO₂",
                    hardware.spo2 ?? 0
                )}

                ${analyticsMetric(
                    "Nurse Proximity",
                    hardware.nurse_present
                        ? 100
                        : 0
                )}

                ${analyticsMetric(
                    "Bed Occupancy",
                    hardware.bed_occupied
                        ? 100
                        : 0
                )}

            </div>

        </div>

        `

    );

}


function analyticsMetric(
    name,
    value
) {

    const safe =
        Math.max(
            0,
            Math.min(
                100,
                Number(value) || 0
            )
        );


    return `

        <div class="mv-analytics-item">

            <div>

                <strong>
                    ${name}
                </strong>

                <span>
                    ${Math.round(
                        safe
                    )}%
                </span>

            </div>


            <div class="mv-analytics-bar">

                <div
                    style="width:${safe}%">
                </div>

            </div>

        </div>

    `;

}


/* =========================================================
   SETTINGS
   ========================================================= */

function settingsPage() {

    return pageShell(

        "System Settings",

        "Configure Medinova demonstration",

        `

        <div class="dashboard-card">

            <h2>
                Demo Configuration
            </h2>


            <div class="mv-form-grid">

                <label>

                    Hospital Name

                    <input
                        id="settingHospital"
                        value="${escapeHTML(
                            settings.hospitalName
                        )}">

                </label>


                <label>

                    Patient Name

                    <input
                        id="settingPatient"
                        value="${escapeHTML(
                            settings.patientName
                        )}">

                </label>


                <label>

                    Bed ID

                    <input
                        id="settingBed"
                        value="${escapeHTML(
                            settings.bedId
                        )}">

                </label>


                <label>

                    Refresh Interval

                    <select
                        id="settingRefresh">

                        <option
                            value="1"
                            ${
                                settings.refreshSeconds == 1
                                    ? "selected"
                                    : ""
                            }>

                            1 second

                        </option>


                        <option
                            value="2"
                            ${
                                settings.refreshSeconds == 2
                                    ? "selected"
                                    : ""
                            }>

                            2 seconds

                        </option>


                        <option
                            value="5"
                            ${
                                settings.refreshSeconds == 5
                                    ? "selected"
                                    : ""
                            }>

                            5 seconds

                        </option>

                    </select>

                </label>

            </div>

        </div>


        <div class="dashboard-card">

            <h2>
                Alert Settings
            </h2>


            <div class="mv-toggle-list">

                <label>

                    <span>

                        <strong>
                            IV Low-Level Alerts
                        </strong>

                        <small>
                            Notify when IV is low
                        </small>

                    </span>

                    <input
                        id="settingIV"
                        type="checkbox"
                        ${
                            settings.alertIV
                                ? "checked"
                                : ""
                        }>

                </label>


                <label>

                    <span>

                        <strong>
                            Vital Alerts
                        </strong>

                        <small>
                            Monitor HR and SpO₂
                        </small>

                    </span>

                    <input
                        id="settingVitals"
                        type="checkbox"
                        ${
                            settings.alertVitals
                                ? "checked"
                                : ""
                        }>

                </label>


                <label>

                    <span>

                        <strong>
                            Nurse Proximity Alert
                        </strong>

                        <small>
                            Alert when nurse is away
                        </small>

                    </span>

                    <input
                        id="settingNurse"
                        type="checkbox"
                        ${
                            settings.alertNurseAway
                                ? "checked"
                                : ""
                        }>

                </label>

            </div>


            <br>


            <button
                class="primary-btn"
                onclick="saveSettingsFromPage()">

                <i class="fa-solid fa-floppy-disk"></i>

                Save Settings

            </button>

        </div>

        `

    );

}


function saveSettingsFromPage() {

    const hospital =
        document.getElementById(
            "settingHospital"
        );


    const patient =
        document.getElementById(
            "settingPatient"
        );


    const bed =
        document.getElementById(
            "settingBed"
        );


    const refresh =
        document.getElementById(
            "settingRefresh"
        );


    const iv =
        document.getElementById(
            "settingIV"
        );


    const vitals =
        document.getElementById(
            "settingVitals"
        );


    const nurse =
        document.getElementById(
            "settingNurse"
        );


    if (hospital) {

        settings.hospitalName =
            hospital.value;

    }


    if (patient) {

        settings.patientName =
            patient.value;

    }


    if (bed) {

        settings.bedId =
            bed.value;

    }


    if (refresh) {

        settings.refreshSeconds =
            Number(
                refresh.value
            );

    }


    if (iv) {

        settings.alertIV =
            iv.checked;

    }


    if (vitals) {

        settings.alertVitals =
            vitals.checked;

    }


    if (nurse) {

        settings.alertNurseAway =
            nurse.checked;

    }


    saveSettings();


    restartHardwarePolling();


    addActivity(

        "System settings updated",

        "Medinova",

        "Saved"

    );


    alert(
        "Settings saved successfully."
    );

}


/* =========================================================
   PAGE SELECTOR
   ========================================================= */

function getPageHTML(page) {

    switch (page) {

        case "patients":
            return patientPage();

        case "beds":
            return bedPage();

        case "staff":
            return staffPage();

        case "equipment":
            return equipmentPage();

        case "ot":
            return otPage();

        case "ai":
            return aiPage();

        case "forecast":
            return forecastPage();

        case "emergency":
            return emergencyPage();

        case "health":
            return healthPage();

        case "analytics":
            return analyticsPage();

        case "settings":
            return settingsPage();

        default:

            return patientPage();

    }

}


/* =========================================================
   NOTIFICATION BUTTON
   ========================================================= */

function setupNotifications() {

    const button =
        document.getElementById(
            "notificationButton"
        );


    if (button) {

        button.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                toggleNotificationPanel();

            }
        );

    }


    document.addEventListener(
        "click",
        event => {

            const panel =
                document.getElementById(
                    "notificationPanel"
                );


            const buttonElement =
                document.getElementById(
                    "notificationButton"
                );


            if (
                panel &&
                !panel.contains(
                    event.target
                ) &&
                buttonElement &&
                !buttonElement.contains(
                    event.target
                )
            ) {

                panel.classList.add(
                    "hidden"
                );

            }

        }
    );

}


/* =========================================================
   HARDWARE POLLING
   ========================================================= */

function restartHardwarePolling() {

    if (hardwareTimer) {

        clearInterval(
            hardwareTimer
        );

    }


    const seconds =
        Math.max(
            1,
            Number(
                settings.refreshSeconds
            ) || 2
        );


    hardwareTimer =
        setInterval(

            fetchHardware,

            seconds * 1000

        );

}


/* =========================================================
   EXTRA STYLES
   ========================================================= */

function injectStyles() {

    const style =
        document.createElement(
            "style"
        );


    style.textContent = `

        .mv-patient-banner {
            margin-bottom:20px;
            padding:22px;
            border-radius:18px;
            background:linear-gradient(
                135deg,
                #ffffff,
                #f7fbff
            );
            border:1px solid #e4eaf2;
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:20px;
            box-shadow:
                0 8px 25px
                rgba(15,23,42,.05);
        }


        .mv-patient-main {
            display:flex;
            align-items:center;
            gap:16px;
        }


        .mv-patient-icon {
            width:58px;
            height:58px;
            border-radius:16px;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#eaf2ff;
            color:#2563eb;
            font-size:24px;
        }


        .mv-live-label {
            color:#2563eb;
            font-size:11px;
            font-weight:700;
            letter-spacing:.7px;
            display:flex;
            align-items:center;
            gap:6px;
        }


        .mv-live-dot {
            width:7px;
            height:7px;
            border-radius:50%;
            background:#10b981;
            display:inline-block;
        }


        .mv-patient-banner h2 {
            margin:3px 0;
            font-size:22px;
        }


        .mv-patient-banner p {
            margin:0;
            color:#64748b;
            font-size:13px;
        }


        .mv-patient-status {
            text-align:right;
        }


        .mv-status {
            display:inline-flex;
            padding:7px 12px;
            border-radius:999px;
            font-size:11px;
            font-weight:700;
        }


        .mv-status.normal {
            background:#eafaf3;
            color:#059669;
        }


        .mv-status.warning {
            background:#fff6df;
            color:#d97706;
        }


        .mv-status.critical {
            background:#fff0f0;
            color:#dc2626;
        }


        .mv-patient-status small {
            display:block;
            margin-top:6px;
            color:#64748b;
        }


        .mv-vitals-grid {
            display:grid;
            grid-template-columns:
                repeat(3,1fr);
            gap:16px;
            margin-bottom:20px;
        }


        .mv-vital-card {
            background:#fff;
            border:1px solid #e4eaf2;
            border-radius:16px;
            padding:18px;
            display:flex;
            gap:14px;
            align-items:center;
            box-shadow:
                0 6px 20px
                rgba(15,23,42,.04);
        }


        .mv-vital-icon {
            width:45px;
            height:45px;
            border-radius:13px;
            display:flex;
            align-items:center;
            justify-content:center;
        }


        .mv-vital-icon.blue {
            background:#eaf2ff;
            color:#2563eb;
        }


        .mv-vital-icon.purple {
            background:#f1eaff;
            color:#7c3aed;
        }


        .mv-vital-icon.red {
            background:#fff0f0;
            color:#dc2626;
        }


        .mv-vital-icon.green {
            background:#eafaf3;
            color:#059669;
        }


        .mv-vital-icon.orange {
            background:#fff5e5;
            color:#d97706;
        }


        .mv-vital-card span,
        .mv-vital-card small {
            display:block;
            color:#64748b;
            font-size:12px;
        }


        .mv-vital-card strong {
            display:block;
            margin:3px 0;
            font-size:19px;
            color:#172033;
        }


        .mv-resource-pill {
            display:inline-flex;
            padding:7px 12px;
            border-radius:999px;
            background:#eef2f7;
            color:#475569;
            font-size:11px;
            font-weight:700;
        }


        .mv-empty-state {
            padding:28px 15px;
            text-align:center;
            color:#64748b;
        }


        .mv-empty-state i {
            display:block;
            font-size:28px;
            margin-bottom:10px;
            color:#10b981;
        }


        .mv-empty-state strong,
        .mv-empty-state span {
            display:block;
        }


        .mv-empty-state strong {
            color:#172033;
            margin-bottom:4px;
        }


        .mv-notification-panel {
            position:fixed;
            z-index:1000;
            top:82px;
            right:28px;
            width:370px;
            max-height:500px;
            overflow:auto;
            background:#fff;
            border:1px solid #e2e8f0;
            border-radius:16px;
            box-shadow:
                0 20px 50px
                rgba(15,23,42,.18);
        }


        .mv-notification-panel.hidden {
            display:none;
        }


        .mv-notification-head {
            padding:16px 18px;
            display:flex;
            justify-content:space-between;
            border-bottom:1px solid #edf1f5;
        }


        .mv-notification-head button {
            border:0;
            background:none;
            color:#2563eb;
            cursor:pointer;
            font-size:12px;
        }


        .mv-notification-item {
            padding:14px 16px;
            display:flex;
            gap:12px;
            border-bottom:1px solid #f1f5f9;
            cursor:pointer;
        }


        .mv-notification-item.read {
            opacity:.55;
        }


        .mv-notification-item p {
            margin:3px 0;
            font-size:12px;
            color:#64748b;
        }


        .mv-notification-item small {
            color:#94a3b8;
            font-size:10px;
        }


        .mv-notification-icon {
            width:34px;
            height:34px;
            border-radius:10px;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#eef2ff;
            color:#2563eb;
            flex:none;
        }


        .mv-notification-icon.critical {
            background:#fff0f0;
            color:#dc2626;
        }


        .mv-notification-icon.warning {
            background:#fff6df;
            color:#d97706;
        }


        .mv-profile-grid {
            display:grid;
            grid-template-columns:
                repeat(3,1fr);
            gap:18px;
            margin-top:20px;
        }


        .mv-profile-grid div {
            padding:16px;
            background:#f8fafc;
            border-radius:12px;
        }


        .mv-profile-grid span,
        .mv-profile-grid strong {
            display:block;
        }


        .mv-profile-grid span {
            color:#64748b;
            font-size:12px;
            margin-bottom:5px;
        }


        .mv-profile-grid strong {
            color:#172033;
        }


        .mv-monitor-grid {
            display:grid;
            grid-template-columns:
                repeat(3,1fr);
            gap:16px;
            margin-top:20px;
        }


        .mv-monitor-grid div {
            padding:22px;
            background:#f8fafc;
            border-radius:14px;
            text-align:center;
        }


        .mv-monitor-grid i {
            display:block;
            color:#2563eb;
            font-size:25px;
            margin-bottom:10px;
        }


        .mv-monitor-grid span,
        .mv-monitor-grid strong {
            display:block;
        }


        .mv-monitor-grid span {
            color:#64748b;
            font-size:12px;
        }


        .mv-monitor-grid strong {
            margin-top:5px;
        }


        .mv-ai-layout {
            display:grid;
            grid-template-columns:
                1.2fr 1fr;
            gap:25px;
        }


        .mv-ai-decision {
            padding:25px;
            border-radius:16px;
            background:#f8fbff;
            text-align:center;
        }


        .mv-ai-circle {
            width:70px;
            height:70px;
            border-radius:50%;
            margin:0 auto 15px;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#eaf2ff;
            color:#2563eb;
            font-size:27px;
        }


        .mv-decision-list {
            display:grid;
            gap:12px;
        }


        .mv-decision-list div {
            padding:15px;
            border:1px solid #e8edf3;
            border-radius:12px;
            display:flex;
            justify-content:space-between;
        }


        .mv-decision-list span {
            color:#64748b;
        }


        .mv-flow {
            display:flex;
            align-items:center;
            justify-content:center;
            gap:15px;
            flex-wrap:wrap;
            padding:25px;
        }


        .mv-flow div {
            min-width:120px;
            padding:18px;
            border:1px solid #e6ebf2;
            border-radius:14px;
            text-align:center;
            background:#fafcff;
        }


        .mv-flow i {
            display:block;
            color:#2563eb;
            font-size:24px;
            margin-bottom:7px;
        }


        .mv-flow span {
            font-size:12px;
            font-weight:600;
        }


        .mv-forecast-big {
            text-align:center;
            padding:25px;
        }


        .mv-forecast-big strong {
            display:block;
            font-size:42px;
            color:#2563eb;
        }


        .mv-forecast-big span {
            color:#64748b;
        }


        .mv-forecast-grid {
            display:grid;
            grid-template-columns:
                repeat(5,1fr);
            gap:12px;
        }


        .mv-forecast-grid div {
            padding:18px;
            background:#f8fafc;
            border-radius:12px;
            text-align:center;
        }


        .mv-forecast-grid span,
        .mv-forecast-grid strong {
            display:block;
        }


        .mv-forecast-grid span {
            font-size:11px;
            color:#64748b;
            margin-bottom:6px;
        }


        .mv-insight {
            display:flex;
            gap:15px;
            align-items:flex-start;
            padding:18px;
            background:#f8fbff;
            border-radius:14px;
        }


        .mv-insight i {
            color:#f59e0b;
            font-size:24px;
        }


        .mv-insight p {
            margin:0;
            color:#475569;
        }


        .mv-emergency-box {
            display:flex;
            gap:18px;
            align-items:center;
            padding:22px;
            border-radius:15px;
            background:#ecfdf5;
            margin:20px 0;
        }


        .mv-emergency-box.critical {
            background:#fff1f2;
        }


        .mv-emergency-icon {
            width:52px;
            height:52px;
            border-radius:14px;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#dcfce7;
            color:#16a34a;
            font-size:23px;
        }


        .mv-emergency-box.critical
        .mv-emergency-icon {
            background:#fee2e2;
            color:#dc2626;
        }


        .mv-escalation-flow {
            display:grid;
            grid-template-columns:
                repeat(4,1fr);
            gap:12px;
        }


        .mv-escalation-flow div {
            padding:15px;
            border:1px solid #e6ebf2;
            border-radius:12px;
            text-align:center;
        }


        .mv-escalation-flow div.active {
            border-color:#fecaca;
            background:#fff7f7;
        }


        .mv-escalation-flow strong {
            width:30px;
            height:30px;
            display:flex;
            align-items:center;
            justify-content:center;
            margin:0 auto 7px;
            border-radius:50%;
            background:#eaf2ff;
            color:#2563eb;
        }


        .mv-escalation-flow span {
            display:block;
            font-size:11px;
            color:#64748b;
        }


        .mv-json {
            padding:20px;
            border-radius:12px;
            background:#0f172a;
            color:#dbeafe;
            overflow:auto;
            font-size:12px;
        }


        .mv-analytics-grid {
            display:grid;
            grid-template-columns:
                repeat(2,1fr);
            gap:20px;
        }


        .mv-analytics-item
        > div:first-child {
            display:flex;
            justify-content:space-between;
            margin-bottom:8px;
        }


        .mv-analytics-bar {
            height:10px;
            background:#e9eef4;
            border-radius:20px;
            overflow:hidden;
        }


        .mv-analytics-bar div {
            height:100%;
            background:#2563eb;
        }


        .mv-form-grid {
            display:grid;
            grid-template-columns:
                1fr 1fr;
            gap:18px;
        }


        .mv-form-grid label {
            display:flex;
            flex-direction:column;
            gap:7px;
            font-size:12px;
            font-weight:600;
            color:#475569;
        }


        .mv-form-grid input,
        .mv-form-grid select {
            border:1px solid #dce3eb;
            border-radius:10px;
            padding:11px 12px;
            font-family:inherit;
            outline:none;
        }


        .mv-toggle-list {
            display:grid;
            gap:12px;
            margin-top:20px;
        }


        .mv-toggle-list label {
            display:flex;
            align-items:center;
            justify-content:space-between;
            padding:15px;
            border:1px solid #e8edf3;
            border-radius:12px;
        }


        .mv-toggle-list strong,
        .mv-toggle-list small {
            display:block;
        }


        .mv-toggle-list small {
            color:#94a3b8;
            margin-top:3px;
        }


        @media(max-width:1000px) {

            .mv-vitals-grid {
                grid-template-columns:
                    repeat(2,1fr);
            }

            .mv-profile-grid,
            .mv-monitor-grid {
                grid-template-columns:
                    repeat(2,1fr);
            }

            .mv-ai-layout {
                grid-template-columns:
                    1fr;
            }

        }


        @media(max-width:700px) {

            .mv-patient-banner {
                flex-direction:column;
                align-items:flex-start;
            }

            .mv-patient-status {
                text-align:left;
            }

            .mv-vitals-grid,
            .mv-profile-grid,
            .mv-monitor-grid,
            .mv-form-grid,
            .mv-analytics-grid,
            .mv-escalation-flow {
                grid-template-columns:
                    1fr;
            }

            .mv-forecast-grid {
                grid-template-columns:
                    repeat(2,1fr);
            }

            .mv-notification-panel {
                right:10px;
                left:10px;
                width:auto;
            }

        }

    `;


    document.head.appendChild(
        style
    );

}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initializeMedinova() {

    loadSettings();

    injectStyles();

    setupNavigation();

    setupNotifications();

    updateClock();

    clockTimer =
        setInterval(
            updateClock,
            1000
        );


    updateNotificationUI();


    const savedPage =
        localStorage.getItem(
            PAGE_KEY
        );


    if (
        savedPage &&
        pageMeta[savedPage]
    ) {

        showPage(
            savedPage
        );

    }

    else {

        showCommandCenter();

    }


    await fetchHardware();

    await fetchNotifications();


    restartHardwarePolling();


    notificationTimer =
        setInterval(
            fetchNotifications,
            5000
        );

}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.showPage =
    showPage;

window.showCommandCenter =
    showCommandCenter;

window.runAIAnalysis =
    runAIAnalysis;

window.activateEmergency =
    activateEmergency;

window.respondToEmergency =
    respondToEmergency;

window.optimizeOT =
    optimizeOT;

window.markNotificationRead =
    markNotificationRead;

window.markAllNotificationsRead =
    markAllNotificationsRead;

window.saveSettingsFromPage =
    saveSettingsFromPage;


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initializeMedinova();

    }
);
