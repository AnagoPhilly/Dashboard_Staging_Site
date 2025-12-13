// js/employee_portal.js

// --- GLOBAL STATE ---
// Load state from session, default to 'week' view and today's date
let currentView = sessionStorage.getItem('empPortalView') || 'week';
let currentStartDate = sessionStorage.getItem('empPortalDate')
    ? new Date(sessionStorage.getItem('empPortalDate'))
    : new Date();

// Helper to normalize the date based on the current view
function normalizeDate(date, view) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (view === 'week') {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
    } else if (view === 'month') {
        d.setDate(1);
    }
    return d;
}

// Normalize the start date once and ensure the date object is correct
currentStartDate = normalizeDate(currentStartDate, currentView);

// Save initial state to session
sessionStorage.setItem('empPortalView', currentView);
sessionStorage.setItem('empPortalDate', currentStartDate.toISOString());

// NOTE: MAX_DISTANCE_KM removed in favor of dynamic per-account radius

auth.onAuthStateChanged(async user => {
    if (user) {
        const empSnap = await db.collection('employees').where('email', '==', user.email).get();

        if (empSnap.empty) {
            alert("Account not found in Employee Roster. Please contact your manager.");
            auth.signOut();
            return;
        }

        const employee = empSnap.docs[0].data();
        employee.id = empSnap.docs[0].id;

        document.getElementById('appLoading').style.display = 'none';
        document.getElementById('app').style.display = 'flex';

        const welcomeEl = document.getElementById('welcomeMsg');
        if(welcomeEl) welcomeEl.textContent = `Hi, ${employee.name.split(' ')[0]}`;

        loadMyShifts(employee.id);
    } else {
        window.location.href = 'index.html';
    }
});

async function loadMyShifts(employeeId) {
    const container = document.getElementById('schedulerGrid');
    const hoursDisplay = document.getElementById('totalHoursDisplay');
    const dateEl = document.getElementById('weekRangeDisplay');

    container.innerHTML = '';

    document.querySelectorAll('.btn-view-toggle').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === currentView);
    });

    if(dateEl) {
        if (currentView === 'month') {
             dateEl.textContent = currentStartDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        } else if (currentView === 'day') {
             dateEl.textContent = currentStartDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        } else {
             const weekEnd = new Date(currentStartDate);
             weekEnd.setDate(currentStartDate.getDate() + 6);
             dateEl.textContent = `${currentStartDate.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
        }
    }

    try {
        const allSnap = await db.collection('jobs')
            .where('employeeId', '==', employeeId)
            .get();

        const jobsForRender = [];
        let totalHours = 0;

        allSnap.forEach(doc => {
            const j = doc.data();
            j.id = doc.id;
            j.start = j.startTime.toDate();
            j.end = j.endTime.toDate();

            if (j.status === 'Completed' && j.actualStartTime && j.actualEndTime) {
                 const jobEnd = j.actualEndTime.toDate();
                 let periodEnd = new Date(currentStartDate);
                 if (currentView === 'week') periodEnd.setDate(periodEnd.getDate() + 6);
                 else if (currentView === 'month') periodEnd.setMonth(periodEnd.getMonth() + 1);

                 if (jobEnd >= normalizeDate(currentStartDate, currentView) && jobEnd <= periodEnd) {
                    const diffMs = jobEnd - j.actualStartTime.toDate();
                    const hrs = diffMs / (1000 * 60 * 60);
                    totalHours += hrs;
                 }
            }
            jobsForRender.push(j);
        });

        if(hoursDisplay) hoursDisplay.textContent = totalHours.toFixed(2);

        if (currentView === 'month') {
            renderMonthView(jobsForRender);
        } else if (currentView === 'day') {
            renderDayView(jobsForRender);
        } else {
            renderWeekView(jobsForRender);
        }

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="text-align:center; padding:1rem;">Error loading schedule.</p>';
    }
}

// --- RENDERERS ---

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}


function renderWeekView(jobs) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;
    grid.style.display = 'flex';
    grid.style.gridTemplateColumns = 'none';

    for (let i = 0; i < 7; i++) {
        const colDate = new Date(currentStartDate);
        colDate.setDate(currentStartDate.getDate() + i);
        const dateString = colDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

        const col = document.createElement('div');
        col.className = 'calendar-col';
        col.innerHTML = `<div class="cal-header">${dateString}</div>`;

        const dayJobs = jobs.filter(j => isSameDay(j.start, colDate));

        dayJobs.sort((a, b) => a.start - b.start);

        dayJobs.forEach(job => {
            const timeStr = formatTime(job.start);
            let actionBtn = '';

            if (job.status === 'Completed') {
                const actualEnd = job.actualEndTime ? formatTime(job.actualEndTime.toDate()) : 'Done';
                actionBtn = `<div class="status-badge completed">✅ Ended: ${actualEnd}</div>`;
            } else if (job.status === 'Started') {
                const actualStart = job.actualStartTime ? formatTime(job.actualStartTime.toDate()) : '';
                actionBtn = `
                    <div style="font-size:0.75rem; color:green; margin-bottom:4px;">Started: ${actualStart}</div>
                    <button class="btn-clockout" onclick="attemptClockOut('${job.id}', '${job.accountId}')">🛑 Clock Out</button>
                `;
            } else {
                actionBtn = `<button class="btn-checkin" onclick="attemptCheckIn('${job.id}', '${job.accountId}')">📲 Check In</button>`;
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

function renderDayView(jobs) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;
    grid.innerHTML = '';
    grid.style.display = 'flex';
    grid.style.justifyContent = 'center';
    grid.style.overflowX = 'hidden';

    const colDate = currentStartDate;
    const dateString = colDate.toLocaleDateString('en-US', { weekday: 'long', month: 'numeric', day: 'numeric' });

    const col = document.createElement('div');
    col.className = 'calendar-col';
    col.style.flex = '0 0 250px';
    col.innerHTML = `<div class="cal-header">${dateString}</div>`;

    const dayJobs = jobs.filter(j => isSameDay(j.start, colDate));
    dayJobs.sort((a, b) => a.start - b.start);

    if (dayJobs.length === 0) {
        col.innerHTML += '<div style="text-align:center; padding:2rem; color:#9ca3af; font-size:0.9rem;">No shifts scheduled.</div>';
    } else {
        dayJobs.forEach(job => {
            const timeStr = formatTime(job.start);
            let actionBtn = '';

            if (job.status === 'Completed') {
                const actualEnd = job.actualEndTime ? formatTime(job.actualEndTime.toDate()) : 'Done';
                actionBtn = `<div class="status-badge completed">✅ Ended: ${actualEnd}</div>`;
            } else if (job.status === 'Started') {
                const actualStart = job.actualStartTime ? formatTime(job.actualStartTime.toDate()) : '';
                actionBtn = `<div style="font-size:0.75rem; color:green; margin-bottom:4px;">Started: ${actualStart}</div><button class="btn-clockout" onclick="attemptClockOut('${job.id}', '${job.accountId}')">🛑 Clock Out</button>`;
            } else {
                actionBtn = `<button class="btn-checkin" onclick="attemptCheckIn('${job.id}', '${job.accountId}')">📲 Check In</button>`;
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
    }

    grid.appendChild(col);
}

function renderMonthView(jobs) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;
    grid.innerHTML = '';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
    grid.style.gap = '1px';
    grid.style.background = '#e5e7eb';
    grid.style.overflowX = 'hidden';

    const year = currentStartDate.getFullYear();
    const month = currentStartDate.getMonth();
    const firstDay = new Date(year, month, 1);

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayLabels.forEach(label => {
        const header = document.createElement('div');
        header.className = 'cal-header';
        header.textContent = label;
        header.style.background = '#f9fafb';
        grid.appendChild(header);
    });

    let iterator = new Date(firstDay);
    iterator.setDate(iterator.getDate() - iterator.getDay());

    for(let i=0; i<42; i++) {
        const day = document.createElement('div');
        const isCurrMonth = iterator.getMonth() === month;
        day.className = `month-day ${isCurrMonth ? '' : 'other-month'}`;
        day.style.minHeight = '100px';
        day.style.background = isCurrMonth ? 'white' : '#f9fafb';
        day.style.color = isCurrMonth ? '#1f2937' : '#ccc';
        day.style.padding = '8px';

        day.innerHTML = `<div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 4px;">${iterator.getDate()}</div>`;

        const dayJobs = jobs.filter(j => isSameDay(j.start, iterator));

        if (dayJobs.length > 0) {
            dayJobs.forEach(job => {
                const event = document.createElement('div');
                event.style.fontSize = '0.75rem';
                event.style.padding = '2px 4px';
                event.style.borderRadius = '3px';
                event.style.marginTop = '2px';
                event.style.whiteSpace = 'nowrap';
                event.style.overflow = 'hidden';
                event.style.textOverflow = 'ellipsis';
                event.textContent = `${formatTime(job.start)} ${job.accountName}`;

                if (job.status === 'Completed') {
                    event.style.background = '#dcfce7';
                    event.style.color = '#065f46';
                } else if (job.status === 'Started') {
                    event.style.background = '#eff6ff';
                    event.style.color = '#1e40af';
                } else {
                    event.style.background = '#f3f4f6';
                    event.style.color = '#6b7280';
                }
                day.appendChild(event);
            });
        }

        grid.appendChild(day);

        iterator.setDate(iterator.getDate() + 1);
        if (iterator > firstDay && iterator.getDay() === 0 && iterator.getMonth() !== month) break;
    }
}


// --- NAVIGATION FUNCTIONS ---

// UPDATED: Now forces TODAY on 'day' view
window.changeView = function(view) {
    currentView = view;
    if (view === 'day') {
        currentStartDate = new Date();
    } else {
        currentStartDate = normalizeDate(currentStartDate, currentView);
    }
    sessionStorage.setItem('empPortalView', currentView);
    sessionStorage.setItem('empPortalDate', currentStartDate.toISOString());
    location.reload();
};

window.changePeriod = function(direction) {
    if (currentView === 'day') {
        currentStartDate.setDate(currentStartDate.getDate() + direction);
    } else if (currentView === 'week') {
        currentStartDate.setDate(currentStartDate.getDate() + (direction * 7));
    } else if (currentView === 'month') {
        currentStartDate.setMonth(currentStartDate.getMonth() + direction);
    }
    sessionStorage.setItem('empPortalDate', currentStartDate.toISOString());
    location.reload();
};


// --- GEOFENCING & ACTIONS (UPDATED) ---

function runGeofencedAction(jobId, accountId, actionType) {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Locating...";

    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
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
                alert("Warning: No GPS pin for this building. Checking you in anyway.");
                if (actionType === 'in') await processCheckIn(jobId);
                else await processClockOut(jobId);
                return;
            }

            const distanceKm = getDistanceFromLatLonInKm(userLat, userLng, accData.lat, accData.lng);

            // --- NEW: DYNAMIC RADIUS CHECK ---
            const allowedRadiusKm = (accData.geofenceRadius || 200) / 1000;

            console.log(`Distance: ${distanceKm.toFixed(3)} km. Allowed: ${allowedRadiusKm} km`);

            if (distanceKm <= allowedRadiusKm) {
                if (actionType === 'in') await processCheckIn(jobId);
                else await processClockOut(jobId);
            } else {
                alert(`You are too far away (${distanceKm.toFixed(2)}km). Allowed range: ${(allowedRadiusKm*1000).toFixed(0)}m. Please arrive at the site.`);
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
        alert("Unable to retrieve location. Please allow GPS access.");
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
    location.reload();
}

async function processClockOut(jobId) {
    await db.collection('jobs').doc(jobId).update({
        status: 'Completed',
        actualEndTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.showToast("Clocked Out!");
    location.reload();
}

// Haversine Formula
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = deg2rad(lat2-lat1);
  var dLon = deg2rad(lon2-lon1);
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}