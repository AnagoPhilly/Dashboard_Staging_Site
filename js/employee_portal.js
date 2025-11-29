// js/employee_portal.js

let currentWeekStart = new Date();
const day = currentWeekStart.getDay();
const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
currentWeekStart.setDate(diff);
currentWeekStart.setHours(0,0,0,0);

const MAX_DISTANCE_KM = 0.5; // 500 meters

auth.onAuthStateChanged(async user => {
    if (user) {
        document.getElementById('appLoading').style.display = 'none';
        document.getElementById('app').style.display = 'flex';

        const empSnap = await db.collection('employees').where('email', '==', user.email).get();

        if (empSnap.empty) {
            alert("Account not found in Employee Roster.");
            auth.signOut();
            return;
        }

        const employee = empSnap.docs[0].data();
        employee.id = empSnap.docs[0].id;

        document.getElementById('welcomeMsg').textContent = `Hi, ${employee.name.split(' ')[0]}`;

        loadMyShifts(employee.id);
    } else {
        window.location.href = 'index.html';
    }
});

async function loadMyShifts(employeeId) {
    const container = document.getElementById('schedulerGrid');
    const hoursDisplay = document.getElementById('totalHoursDisplay'); // NEW

    // ... (Date Header Logic) ...

    try {
        // ... (Query Logic) ...

        const jobs = [];
        let totalHours = 0; // NEW: Init counter

        snap.forEach(doc => {
            const j = doc.data();
            j.id = doc.id;
            j.start = j.startTime.toDate();
            j.end = j.endTime.toDate();
            jobs.push(j);

            // NEW: Calculate Hours if Completed
            if (j.status === 'Completed' && j.actualStartTime && j.actualEndTime) {
                const diffMs = j.actualEndTime.toDate() - j.actualStartTime.toDate();
                const hrs = diffMs / (1000 * 60 * 60);
                totalHours += hrs;
            }
        });

        // NEW: Update Display
        if(hoursDisplay) hoursDisplay.textContent = totalHours.toFixed(2);

        renderReadCalendar(jobs);

    } catch (e) {
        // ... error handling ...
    }
}

function renderReadCalendar(jobs) {
    const grid = document.getElementById('schedulerGrid');
    grid.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const colDate = new Date(currentWeekStart);
        colDate.setDate(colDate.getDate() + i);
        const dateString = colDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

        const col = document.createElement('div');
        col.className = 'calendar-col';
        col.innerHTML = `<div class="cal-header">${dateString}</div>`;

        const dayJobs = jobs.filter(j =>
            j.start.getDate() === colDate.getDate() &&
            j.start.getMonth() === colDate.getMonth()
        );

        dayJobs.sort((a, b) => a.start - b.start);

        dayJobs.forEach(job => {
            const timeStr = job.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // --- NEW BUTTON LOGIC ---
            let actionBtn = '';

            if (job.status === 'Completed') {
                // 1. Shift Done
                const actualEnd = job.actualEndTime ? new Date(job.actualEndTime.toDate()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Done';
                actionBtn = `<div class="status-badge completed">🏁 Ended: ${actualEnd}</div>`;

            } else if (job.status === 'Started') {
                // 2. Shift In Progress -> Show Clock Out
                const actualStart = job.actualStartTime ? new Date(job.actualStartTime.toDate()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
                actionBtn = `
                    <div style="font-size:0.75rem; color:green; margin-bottom:4px;">Started: ${actualStart}</div>
                    <button class="btn-clockout" onclick="attemptClockOut('${job.id}', '${job.accountId}')">🛑 Clock Out</button>
                `;

            } else {
                // 3. Not Started -> Show Check In
                actionBtn = `<button class="btn-checkin" onclick="attemptCheckIn('${job.id}', '${job.accountId}')">📍 Check In</button>`;
            }

            const card = document.createElement('div');
            card.className = 'shift-card';
            card.innerHTML = `
                <div class="shift-time">${timeStr}</div>
                <div class="shift-loc">${job.accountName}</div>
                ${actionBtn}
            `;
            col.appendChild(card);
        });

        grid.appendChild(col);
    }
}

// --- GEOFENCING & ACTIONS ---

// Shared wrapper to handle geolocation
function runGeofencedAction(jobId, accountId, actionType) {
    // actionType = 'in' or 'out'
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Locating...";

    if (!navigator.geolocation) {
        alert("Geolocation is not supported.");
        btn.disabled = false;
        btn.textContent = originalText;
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        try {
            const accDoc = await db.collection('accounts').doc(accountId).get();
            if (!accDoc.exists) throw new Error("Account not found");

            const accData = accDoc.data();

            if (!accData.lat || !accData.lng) {
                alert("Warning: No GPS pin for this building. Processing anyway.");
                if (actionType === 'in') await processCheckIn(jobId);
                else await processClockOut(jobId);
                return;
            }

            const distanceKm = getDistanceFromLatLonInKm(userLat, userLng, accData.lat, accData.lng);
            console.log(`Distance: ${distanceKm.toFixed(3)} km`);

            if (distanceKm <= MAX_DISTANCE_KM) {
                if (actionType === 'in') await processCheckIn(jobId);
                else await processClockOut(jobId);
            } else {
                alert(`Too far away (${distanceKm.toFixed(2)}km). You must be on site.`);
                btn.disabled = false;
                btn.textContent = originalText;
            }

        } catch (error) {
            console.error(error);
            alert("Action failed: " + error.message);
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, (err) => {
        alert("GPS Error. Allow location access.");
        btn.disabled = false;
        btn.textContent = originalText;
    }, { enableHighAccuracy: true });
}

window.attemptCheckIn = function(jobId, accountId) {
    runGeofencedAction(jobId, accountId, 'in');
};

window.attemptClockOut = function(jobId, accountId) {
    if(!confirm("Are you sure you are done for the day?")) return;
    runGeofencedAction(jobId, accountId, 'out');
};

async function processCheckIn(jobId) {
    await db.collection('jobs').doc(jobId).update({
        status: 'Started',
        actualStartTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.showToast("Checked In!");
    refresh();
}

async function processClockOut(jobId) {
    await db.collection('jobs').doc(jobId).update({
        status: 'Completed',
        actualEndTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.showToast("Clocked Out. Good job!");
    refresh();
}

function refresh() {
    const user = auth.currentUser;
    db.collection('employees').where('email', '==', user.email).get().then(snap => {
        loadMyShifts(snap.docs[0].id);
    });
}

// Math Utils
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = deg2rad(lat2-lat1);
  var dLon = deg2rad(lon2-lon1);
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function deg2rad(deg) { return deg * (Math.PI/180) }

window.changeWeek = function(offset) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (offset * 7));
    location.reload();
};