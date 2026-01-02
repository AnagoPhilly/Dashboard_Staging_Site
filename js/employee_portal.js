// js/employee_portal.js

// --- GLOBAL STATE ---
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
// We don't overwrite global start date aggressively on load, just ensure time is stripped
currentStartDate.setHours(0,0,0,0);

// --- AUTH LISTENER ---
auth.onAuthStateChanged(async user => {
    const appPage = document.getElementById('empApp');
    const loadingScreen = document.getElementById('appLoading');
    const loginPage = document.getElementById('loginPage');

    if (user) {
        if (!currentEmployeeId) {
            try {
                // STRATEGY: Try Lowercase first (New Standard)
                const lowerEmail = user.email.toLowerCase();
                let empSnap = await db.collection('employees').where('email', '==', lowerEmail).limit(1).get();

                // FALLBACK: If not found, try the raw email (Handle legacy uppercase records)
                if (empSnap.empty && user.email !== lowerEmail) {
                    console.log("Portal: Lowercase lookup failed. Trying raw email for legacy record...");
                    empSnap = await db.collection('employees').where('email', '==', user.email).limit(1).get();
                }

                if (!empSnap.empty) {
                    // --- SUCCESS ---
                    const employee = empSnap.docs[0].data();
                    currentEmployeeId = empSnap.docs[0].id;

                    const welcomeEl = document.getElementById('welcomeMsg');
                    if(welcomeEl) welcomeEl.textContent = `Hi, ${employee.name.split(' ')[0]}`;

                    // REVEAL UI
                    if (loadingScreen) loadingScreen.style.display = 'none';
                    if (loginPage) loginPage.style.display = 'none';
                    if (appPage) appPage.style.display = 'block';

                    loadMyShifts(currentEmployeeId);
                } else {
                    // --- FAIL: LOGIN VALID, BUT NO EMPLOYEE RECORD ---
                    if (loadingScreen) loadingScreen.style.display = 'none';
                    alert("Login successful, but no Employee Profile found for: " + user.email + "\n\nPlease contact your manager.");
                }
            } catch (err) {
                console.error("Portal Load Error:", err);
                if (loadingScreen) loadingScreen.style.display = 'none';
                alert("Error loading profile: " + err.message);
            }
        }
    } else {
        // --- LOGGED OUT ---
        if (loadingScreen) loadingScreen.style.display = 'none';
        if (appPage) appPage.style.display = 'none';
        window.location.replace('index.html');
    }
});

// --- DATA LOADING ---
async function loadMyShifts(employeeId) {
    const loader = document.getElementById('gridLoader');
    const container = document.getElementById('schedulerGrid');
    const hoursDisplay = document.getElementById('totalHoursDisplay');
    const dateEl = document.getElementById('weekRangeDisplay');

    if (loader) loader.classList.add('active');

    // 1. CALCULATE RENDER START DATE (Do not change global currentStartDate)
    // This variable determines what the USER SEES, but doesn't overwrite where they ARE.
    let renderStart = new Date(currentStartDate);
    renderStart.setHours(0,0,0,0);

    if (currentView === 'week') {
        // Find the Monday of the current week for RENDERING ONLY
        const day = renderStart.getDay();
        const diff = renderStart.getDate() - day + (day === 0 ? -6 : 1);
        renderStart.setDate(diff);
    } else if (currentView === 'month') {
        renderStart.setDate(1);
    }

    // 2. Update Header Text
    if (dateEl) {
        if (currentView === 'month') {
             dateEl.textContent = renderStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        } else if (currentView === 'day') {
             // Use currentStartDate (User's selected day) for Day View title
             dateEl.textContent = currentStartDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        } else {
             const weekEnd = new Date(renderStart);
             weekEnd.setDate(renderStart.getDate() + 6);
             dateEl.textContent = `${renderStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
        }
    }

    try {
        // 3. Fetch Jobs
        const allSnap = await db.collection('jobs').where('employeeId', '==', employeeId).get();
        const jobsForRender = [];
        let totalHours = 0;

        allSnap.forEach(doc => {
            const j = doc.data();
            j.id = doc.id;
            j.start = j.startTime ? j.startTime.toDate() : new Date();
            j.end = j.endTime ? j.endTime.toDate() : new Date();

            // Calculate Hours (Simple Stat)
            if (j.status === 'Completed' && j.actualStartTime && j.actualEndTime) {
                 const jobEnd = j.actualEndTime.toDate();
                 // Only count if it falls in the current month/period roughly (30 days)
                 if (Math.abs(jobEnd - renderStart) < 2592000000) {
                    const diffMs = jobEnd - j.actualStartTime.toDate();
                    totalHours += diffMs / (1000 * 60 * 60);
                 }
            }
            jobsForRender.push(j);
        });

        if (hoursDisplay) hoursDisplay.textContent = totalHours.toFixed(2);
        updateNextShiftDisplay(jobsForRender);

        // 4. Render Grid using the Calculated "renderStart"
        if (container) {
            container.innerHTML = '';

            // Update Active Buttons
            document.querySelectorAll('.btn-view-toggle').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === currentView);
            });

            if (currentView === 'month') renderMonthView(jobsForRender); // Month view handles its own dates
            else if (currentView === 'day') renderDayView(jobsForRender); // Day view uses currentStartDate directly
            else renderWeekView(jobsForRender, renderStart); // Pass the calculated Monday
        }

    } catch (e) {
        console.error(e);
        if (container) container.innerHTML = '<p style="text-align:center;">Error loading schedule.</p>';
    } finally {
        if (loader) loader.classList.remove('active');
    }
}

// --- CONTROLS ---

window.changeView = function(view, isButtonPress = false) {
    currentView = view;

    // We intentionally DO NOT reset currentStartDate here.
    // This keeps the user on the date they were looking at.

    sessionStorage.setItem('empPortalView', currentView);
    sessionStorage.setItem('empPortalDate', currentStartDate.toISOString());

    if (currentEmployeeId) loadMyShifts(currentEmployeeId);
};

window.changePeriod = function(direction) {
    // We adjust the anchor date based on the view
    if (currentView === 'day') {
        currentStartDate.setDate(currentStartDate.getDate() + direction);
    } else if (currentView === 'week') {
        currentStartDate.setDate(currentStartDate.getDate() + (direction * 7));
    } else if (currentView === 'month') {
        currentStartDate.setMonth(currentStartDate.getMonth() + direction);
    }

    sessionStorage.setItem('empPortalDate', currentStartDate.toISOString());
    if (currentEmployeeId) loadMyShifts(currentEmployeeId);
};

// --- HELPER: NEXT SHIFT DISPLAY ---
function updateNextShiftDisplay(jobs) {
    const now = new Date();
    const upcoming = jobs.filter(j => j.start > now && j.status !== 'Completed');
    upcoming.sort((a, b) => a.start - b.start);

    let nextShiftEl = document.getElementById('nextShiftDisplay');
    const headerContainer = document.getElementById('welcomeMsg')?.parentElement;

    if (!nextShiftEl && headerContainer) {
        nextShiftEl = document.createElement('p');
        nextShiftEl.id = 'nextShiftDisplay';
        nextShiftEl.style.margin = '5px 0 0 0';
        nextShiftEl.style.fontSize = '0.9rem';
        nextShiftEl.style.fontWeight = '700';
        headerContainer.appendChild(nextShiftEl);
    }

    if (!nextShiftEl) return;

    if (upcoming.length === 0) {
        nextShiftEl.textContent = "Next Shift: None Scheduled";
        nextShiftEl.style.color = '#9ca3af';
        return;
    }

    const nextJob = upcoming[0];
    const todayReset = new Date(now); todayReset.setHours(0,0,0,0);
    const shiftReset = new Date(nextJob.start); shiftReset.setHours(0,0,0,0);
    const diffDays = Math.ceil((shiftReset - todayReset) / (1000 * 60 * 60 * 24));

    let displayText = "";
    let color = '#0d9488';

    if (diffDays === 0) {
        const diffMs = nextJob.start - now;
        const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        if (diffHrs > 0) displayText = `${diffHrs}h ${diffMins}m`;
        else {
            displayText = `${diffMins} mins`;
            color = '#eab308';
        }
    } else if (diffDays === 1) {
        displayText = `Tomorrow @ ${nextJob.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    } else {
        displayText = `${nextJob.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} @ ${nextJob.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }

    nextShiftEl.style.color = color;
    nextShiftEl.textContent = `Next Shift: ${displayText}`;
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
    const now = new Date(); // Capture Current Time

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

            // --- UPDATED LOGIC: CHECK FOR LATE ---
            let statusClass = 'scheduled';
            if (job.status === 'Completed') statusClass = 'completed';
            else if (job.status === 'Started') statusClass = 'started';
            else if (now > job.start) statusClass = 'late'; // Applies Red LATE style

            const eventDiv = document.createElement('div');
            eventDiv.className = `month-event ${statusClass}`;
            eventDiv.textContent = `${timeStr} ${job.accountName}`;

            // Clicking a specific shift goes to Day View for that day
            eventDiv.onclick = (e) => {
                e.stopPropagation();
                currentStartDate = new Date(job.start);
                window.changeView('day', false);
            };
            dayDiv.appendChild(eventDiv);
        });

        const targetDate = new Date(iterator);
        dayDiv.onclick = () => {
             currentStartDate = targetDate;
             window.changeView('day', false);
        };

        grid.appendChild(dayDiv);
        iterator.setDate(iterator.getDate() + 1);
    }
}

// Renders Week view using the pre-calculated weekStart from loadMyShifts
function renderWeekView(jobs, weekStart) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;

    grid.className = '';
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';
    grid.style.overflowY = 'auto';

    for (let i = 0; i < 7; i++) {
        const colDate = new Date(weekStart);
        colDate.setDate(weekStart.getDate() + i);

        const dateString = colDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const dayJobs = jobs.filter(j => isSameDay(j.start, colDate));
        dayJobs.sort((a, b) => a.start - b.start);

        const dayContainer = document.createElement('div');
        dayContainer.style.borderBottom = '1px solid #eee';
        dayContainer.style.padding = '10px';

        const isToday = isSameDay(colDate, new Date());
        const dateColor = isToday ? '#0d9488' : '#4b5563';
        const bg = isToday ? '#f0fdfa' : 'transparent';
        dayContainer.style.backgroundColor = bg;

        dayContainer.innerHTML = `<div style="font-weight:700; color:${dateColor}; margin-bottom:5px;">${dateString} ${isToday ? '(Today)' : ''}</div>`;

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

// Renders Day view using the Global currentStartDate
function renderDayView(jobs) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;
    grid.className = '';
    grid.style.display = 'block';
    grid.style.overflowY = 'auto';
    grid.style.padding = '15px';

    const colDate = currentStartDate;
    const dateString = colDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    grid.innerHTML = `<h3 style="text-align:center; margin-bottom:20px; color:#1f2937;">${dateString}</h3>`;

    const dayJobs = jobs.filter(j => isSameDay(j.start, colDate));
    dayJobs.sort((a, b) => a.start - b.start);

    if (dayJobs.length === 0) {
        grid.innerHTML += '<div style="text-align:center; padding:2rem; color:#9ca3af;">No shifts scheduled for this day.</div>';
    } else {
        dayJobs.forEach(job => {
            grid.appendChild(createDetailCard(job));
        });
    }
}

function createDetailCard(job) {
    const timeStr = formatTime(job.start) + ' - ' + formatTime(job.end);
    let actionBtn = '';
    let statusColor = '#3b82f6'; // Default Blue
    let lateLabel = '';

    // Check for Late Status
    const now = new Date();
    const isLate = (job.status === 'Scheduled' && now > job.start);

    if (job.status === 'Completed') {
        const actualEnd = job.actualEndTime ? formatTime(job.actualEndTime.toDate()) : 'Done';
        actionBtn = `<div style="color:#166534; font-weight:bold; margin-top:5px;">✅ Completed at ${actualEnd}</div>`;
        statusColor = '#10b981';
    } else if (job.status === 'Started') {
        actionBtn = `<button class="btn-clockout" onclick="attemptClockOut('${job.id}', '${job.accountId}')">🛑 Clock Out</button>`;
        statusColor = '#eab308';
    } else {
        // Scheduled
        if (isLate) {
            statusColor = '#ef4444'; // RED for Late
            lateLabel = `<span style="color:#ef4444; font-weight:bold; margin-left:8px; font-size:0.9rem;">(LATE)</span>`;
        }
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
                <div style="font-size:1.1rem; font-weight:800; color:#1f2937;">
                    ${timeStr} ${lateLabel}
                </div>
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

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const loader = document.getElementById('appLoading');
        const app = document.getElementById('empApp');
        const login = document.getElementById('loginPage');

        // Only run this check if we are on the Portal page
        if (app) {
            // If loader is still visible, kill it and show the app
            if (loader && loader.style.display !== 'none') {
                console.warn("CleanDash: Loader stuck? Forcing UI reveal...");
                loader.style.display = 'none';
                if (login) login.style.display = 'none';
                app.style.display = 'block';
            }
        }
    }, 2500);
});