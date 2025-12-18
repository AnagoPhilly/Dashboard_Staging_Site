// js/employee_portal.js

// --- GLOBAL STATE ---
// 1. FORCE DEFAULTS ON LOAD (Always start at Today / Day View)
let currentView = 'day';
let currentStartDate = new Date();
let currentEmployeeId = null;

// Normalize date (strip time) for accurate comparisons
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

// Initial Normalization
currentStartDate = normalizeDate(currentStartDate, currentView);

// --- AUTH LISTENER ---
auth.onAuthStateChanged(async user => {
    const appPage = document.getElementById('empApp');

    if (user) {
        // If we already have the ID, just reload data.
        // If not, fetch the employee profile first.
        if (!currentEmployeeId) {
            const empSnap = await db.collection('employees').where('email', '==', user.email).limit(1).get();

            if (!empSnap.empty) {
                const employee = empSnap.docs[0].data();
                currentEmployeeId = empSnap.docs[0].id;

                const welcomeEl = document.getElementById('welcomeMsg');
                if(welcomeEl) welcomeEl.textContent = `Hi, ${employee.name.split(' ')[0]}`;

                // Reveal App
                if(appPage) appPage.style.display = 'block';

                // Load Data
                loadMyShifts(currentEmployeeId);
            }
        }
    } else {
        // --- LOGGED OUT / SESSION ENDED ---
        if(appPage) appPage.style.display = 'none';

        // SAFETY REDIRECT: Force navigation to login page
        window.location.replace('index.html');
    }
});

// --- DATA LOADING ---
async function loadMyShifts(employeeId) {
    const loader = document.getElementById('gridLoader');
    if(loader) loader.classList.add('active');

    // GA4 Tracking
    if (typeof window.gtag === 'function') {
        window.gtag('event', 'page_view', {
            'page_title': `Portal - ${currentView}`,
            'page_path': `/portal/${currentView}`
        });
    }

    const container = document.getElementById('schedulerGrid');
    const hoursDisplay = document.getElementById('totalHoursDisplay');
    const dateEl = document.getElementById('weekRangeDisplay');

    // Update Active Button UI
    document.querySelectorAll('.btn-view-toggle').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === currentView);
    });

    // Update Header Date Text
    if(dateEl) {
        if (currentView === 'month') {
             dateEl.textContent = currentStartDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        } else if (currentView === 'day') {
             // Show "Today, Dec 18" format
             dateEl.textContent = currentStartDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        } else {
             const weekEnd = new Date(currentStartDate);
             weekEnd.setDate(currentStartDate.getDate() + 6);
             dateEl.textContent = `${currentStartDate.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
        }
    }

    try {
        const allSnap = await db.collection('jobs').where('employeeId', '==', employeeId).get();
        const jobsForRender = [];
        let totalHours = 0;

        allSnap.forEach(doc => {
            const j = doc.data();
            j.id = doc.id;
            j.start = j.startTime.toDate();
            j.end = j.endTime.toDate();

            // Calculate Stats (Rough calc based on current view timeframe)
            if (j.status === 'Completed' && j.actualStartTime && j.actualEndTime) {
                 const jobEnd = j.actualEndTime.toDate();
                 let periodEnd = new Date(currentStartDate);

                 // Determine end of current view period for stat calc
                 if (currentView === 'day') {
                     // For day view, period is just that day
                     periodEnd = new Date(currentStartDate);
                     periodEnd.setHours(23,59,59,999);
                 } else if (currentView === 'week') {
                     periodEnd.setDate(periodEnd.getDate() + 6);
                 } else if (currentView === 'month') {
                     periodEnd.setMonth(periodEnd.getMonth() + 1);
                 }

                 // Check overlap
                 if (jobEnd >= normalizeDate(currentStartDate, currentView) && jobEnd <= periodEnd) {
                    const diffMs = jobEnd - j.actualStartTime.toDate();
                    totalHours += diffMs / (1000 * 60 * 60);
                 }
            }
            jobsForRender.push(j);
        });

        if(hoursDisplay) hoursDisplay.textContent = totalHours.toFixed(2);

        // Clear grid before rendering new view
        container.innerHTML = '';

        if (currentView === 'month') renderMonthView(jobsForRender);
        else if (currentView === 'day') renderDayView(jobsForRender);
        else renderWeekView(jobsForRender);

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p style="text-align:center; padding:1rem;">Error loading schedule.</p>';
    } finally {
        if(loader) loader.classList.remove('active');
    }
}

// --- RENDERERS ---

function renderMonthView(jobs) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;

    grid.className = 'month-grid';
    grid.style.display = 'grid';
    grid.style.overflowY = 'hidden';

    const year = currentStartDate.getFullYear();
    const month = currentStartDate.getMonth();
    const firstDay = new Date(year, month, 1);

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayLabels.forEach(label => {
        const header = document.createElement('div');
        header.className = 'month-header';
        header.textContent = label;
        grid.appendChild(header);
    });

    let iterator = new Date(firstDay);
    iterator.setDate(iterator.getDate() - iterator.getDay());
    const today = new Date();

    for(let i=0; i<42; i++) {
        const dayDiv = document.createElement('div');
        const isCurrMonth = iterator.getMonth() === month;
        const isToday = isSameDay(iterator, today);

        dayDiv.className = `month-day ${isCurrMonth ? '' : 'other-month'} ${isToday ? 'today' : ''}`;
        dayDiv.innerHTML = `<div class="month-label">${iterator.getDate()}</div>`;

        const dayJobs = jobs.filter(j => isSameDay(j.start, iterator));
        dayJobs.sort((a, b) => a.start - b.start);

        dayJobs.forEach(job => {
            const timeStr = formatTimeShort(job.start);
            let statusClass = 'scheduled';
            if (job.status === 'Completed') statusClass = 'completed';
            else if (job.status === 'Started') statusClass = 'started';

            const eventDiv = document.createElement('div');
            eventDiv.className = `month-event ${statusClass}`;
            eventDiv.textContent = `${timeStr} ${job.accountName}`;

            eventDiv.onclick = (e) => {
                e.stopPropagation();
                currentStartDate = new Date(job.start);
                changeView('day', false);
            };
            dayDiv.appendChild(eventDiv);
        });

        const targetDate = new Date(iterator);
        dayDiv.onclick = () => {
             currentStartDate = targetDate;
             changeView('day', false);
        };

        grid.appendChild(dayDiv);
        iterator.setDate(iterator.getDate() + 1);
    }
}

function renderWeekView(jobs) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;

    grid.className = '';
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';
    grid.style.overflowY = 'auto';

    for (let i = 0; i < 7; i++) {
        const colDate = new Date(currentStartDate);
        colDate.setDate(currentStartDate.getDate() + i);
        const dateString = colDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

        const dayJobs = jobs.filter(j => isSameDay(j.start, colDate));
        dayJobs.sort((a, b) => a.start - b.start);

        const dayContainer = document.createElement('div');
        dayContainer.style.borderBottom = '1px solid #eee';
        dayContainer.style.padding = '10px';
        dayContainer.innerHTML = `<div style="font-weight:700; color:#4b5563; margin-bottom:5px;">${dateString}</div>`;

        if (dayJobs.length === 0) {
            dayContainer.innerHTML += `<div style="font-size:0.8rem; color:#9ca3af; padding-left:10px;">No shifts</div>`;
        } else {
            dayJobs.forEach(job => {
                dayContainer.appendChild(createDetailCard(job));
            });
        }
        grid.appendChild(dayContainer);
    }
}

function renderDayView(jobs) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;
    grid.className = '';
    grid.style.display = 'block';
    grid.style.overflowY = 'auto';
    grid.style.padding = '15px';

    const colDate = currentStartDate;
    // Pretty Date Header
    const dateString = colDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    grid.innerHTML = `<h3 style="text-align:center; margin-bottom:20px; color:#1f2937;">${dateString}</h3>`;

    const dayJobs = jobs.filter(j => isSameDay(j.start, colDate));
    dayJobs.sort((a, b) => a.start - b.start);

    if (dayJobs.length === 0) {
        grid.innerHTML += '<div style="text-align:center; padding:2rem; color:#9ca3af;">No shifts scheduled for today.</div>';
    } else {
        dayJobs.forEach(job => {
            grid.appendChild(createDetailCard(job));
        });
    }
}

function createDetailCard(job) {
    const timeStr = formatTime(job.start) + ' - ' + formatTime(job.end);
    let actionBtn = '';
    let statusColor = '#3b82f6';

    if (job.status === 'Completed') {
        const actualEnd = job.actualEndTime ? formatTime(job.actualEndTime.toDate()) : 'Done';
        actionBtn = `<div style="color:#166534; font-weight:bold; margin-top:5px;">✅ Completed at ${actualEnd}</div>`;
        statusColor = '#10b981';
    } else if (job.status === 'Started') {
        actionBtn = `<button class="btn-clockout" onclick="attemptClockOut('${job.id}', '${job.accountId}')">🛑 Clock Out</button>`;
        statusColor = '#eab308';
    } else {
        actionBtn = `<button class="btn-checkin" onclick="attemptCheckIn('${job.id}', '${job.accountId}')">📍 Clock In</button>`;
    }

    const mapLink = `https://maps.google.com/?q=${encodeURIComponent(job.accountName)}`;

    const card = document.createElement('div');
    card.className = 'shift-card';
    card.style.borderLeft = `4px solid ${statusColor}`;
    card.style.background = 'white';
    card.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    card.style.marginBottom = '10px';
    card.style.padding = '15px';

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
                <div style="font-size:1.1rem; font-weight:800; color:#1f2937;">${timeStr}</div>
                <div style="font-size:1rem; color:#4b5563; margin-top:2px;">${job.accountName}</div>
                <a href="${mapLink}" target="_blank" style="font-size:0.85rem; color:#2563eb; text-decoration:none; display:block; margin-top:5px;">🗺️ Get Directions</a>
            </div>
        </div>
        <div style="margin-top:10px;">${actionBtn}</div>
    `;
    return card;
}

// --- UTILS ---
function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}
function formatTime(date) { return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function formatTimeShort(date) { return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' AM','').replace(' PM',''); }

// --- CONTROLS ---
window.changeView = function(view, isButtonPress = false) {
    const prevView = currentView;
    currentView = view;

    // Auto-reset to Today if moving from Month to Day/Week (Better UX)
    if (isButtonPress && prevView === 'month' && (view === 'week' || view === 'day')) {
        const today = new Date();
        // Only reset if we are in the current month
        if (currentStartDate.getMonth() === today.getMonth() && currentStartDate.getFullYear() === today.getFullYear()) {
            currentStartDate = today;
        }
    }

    currentStartDate = normalizeDate(currentStartDate, currentView);
    sessionStorage.setItem('empPortalView', currentView);
    sessionStorage.setItem('empPortalDate', currentStartDate.toISOString());
    if(currentEmployeeId) loadMyShifts(currentEmployeeId);
};

window.changePeriod = function(direction) {
    if (currentView === 'day') currentStartDate.setDate(currentStartDate.getDate() + direction);
    else if (currentView === 'week') currentStartDate.setDate(currentStartDate.getDate() + (direction * 7));
    else if (currentView === 'month') currentStartDate.setMonth(currentStartDate.getMonth() + direction);

    sessionStorage.setItem('empPortalDate', currentStartDate.toISOString());
    if(currentEmployeeId) loadMyShifts(currentEmployeeId);
};

// --- GEOFENCE ACTIONS ---
window.attemptCheckIn = function(jobId, accountId) {
    handleGeoAction(jobId, accountId, 'in');
};
window.attemptClockOut = function(jobId, accountId) {
    if(confirm("Clock Out?")) handleGeoAction(jobId, accountId, 'out');
};

async function handleGeoAction(jobId, accountId, type) {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = "Locating...";
    btn.disabled = true;

    if (!navigator.geolocation) {
        alert("GPS not supported.");
        btn.disabled = false;
        btn.textContent = originalText;
        return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;

        try {
            const accDoc = await db.collection('accounts').doc(accountId).get();
            if(!accDoc.exists) throw new Error("Account missing");
            const acc = accDoc.data();
            const lat = acc.lat;
            const lng = acc.lng;
            const rad = acc.geofenceRadius || 200;

            if (lat && lng) {
                const dist = getDistanceFromLatLonInKm(uLat, uLng, lat, lng) * 1000;

                if (dist > rad) {
                    alert(`⚠️ Too Far!\n\nDistance: ${Math.round(dist)}m\nAllowed: ${rad}m\n\nPlease move closer.`);
                    btn.disabled = false;
                    btn.textContent = originalText;
                    return;
                }
            }

            const update = { status: type === 'in' ? 'Started' : 'Completed' };
            if (type === 'in') update.actualStartTime = firebase.firestore.FieldValue.serverTimestamp();
            else update.actualEndTime = firebase.firestore.FieldValue.serverTimestamp();

            await db.collection('jobs').doc(jobId).update(update);
            window.showToast(type === 'in' ? "Checked In!" : "Clocked Out!");

            if(currentEmployeeId) loadMyShifts(currentEmployeeId);

        } catch (e) {
            console.error(e);
            alert("Action failed: " + e.message);
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }, (err) => {
        alert("GPS Error: " + err.message);
        btn.disabled = false;
        btn.textContent = originalText;
    }, { enableHighAccuracy: true });
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; var dLat = deg2rad(lat2-lat1); var dLon = deg2rad(lon2-lon1);
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
function deg2rad(deg) { return deg * (Math.PI/180); }