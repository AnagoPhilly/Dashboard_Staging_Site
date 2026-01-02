// js/scheduler.js

// --- 1. CONFIGURATION ---
const START_HOUR = 8; // Start at 4 PM (Afternoon)
const HOURS_TO_RENDER = 30;
const PIXELS_PER_HOUR = 60;
const SNAP_MINUTES = 15;
const PIXELS_PER_MINUTE = PIXELS_PER_HOUR / 60;
const SNAP_PIXELS = SNAP_MINUTES * PIXELS_PER_MINUTE;

// --- 2. STATE ---
let currentView = window.innerWidth < 768 ? 'day' : 'month';
let currentDate = new Date();
let alertedJobs = new Set();
const alertSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');

// Globals
let schedulerSettings = {};
let currentEmpFilter = 'ALL';
let showEmployeeColors = false;
let employeeColors = {};

// --- 3. NAVIGATION LISTENER ---
document.addEventListener('click', function(e) {
    const navItem = e.target.closest('.nav-item[data-page="scheduler"]');
    if (navItem) {
        loadScheduler();
    }
});

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

function getLocalYMD(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

currentDate = normalizeDate(currentDate, currentView);

// --- 4. MAIN LOAD FUNCTION ---
async function loadScheduler() {
    console.log(`CleanDash: Loading Schedule (${currentView} view)...`);
    const container = document.getElementById('schedulerGrid');

    // --- CONTAINER SETUP ---
    if (container) {
        // Reset styles first
        container.style.padding = '0';
        container.style.margin = '0';

        // Calculate height based on viewport minus header
        container.style.height = 'calc(100vh - 170px)';
        container.style.width = '100%';

        // Default to hidden (Month View uses this), Week view overrides it
        container.style.overflow = 'hidden';

        if(container.parentElement) {
            container.parentElement.style.padding = '0';
            container.parentElement.style.height = '100%';
            container.parentElement.style.display = 'flex';
            container.parentElement.style.flexDirection = 'column';
            container.parentElement.style.overflow = 'hidden';
        }
    }

    if (!container.innerHTML.trim()) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#888;">Loading schedule...</div>';
    }

    if (!window.currentUser) return;

    try {
        const [userDoc, jobs, accountsSnap, empSnap] = await Promise.all([
            db.collection('users').doc(window.currentUser.uid).get(),
            fetchJobs(),
            db.collection('accounts').where('owner', '==', window.currentUser.email).get(),
            db.collection('employees').where('owner', '==', window.currentUser.email).orderBy('name').get()
        ]);

        const accountAlarms = {};
        accountsSnap.forEach(doc => {
            const data = doc.data();
            if(data.alarmCode) accountAlarms[doc.id] = data.alarmCode;
        });

        const employees = [];
        employeeColors = {};

        empSnap.forEach(doc => {
            const data = doc.data();
            employees.push({ id: doc.id, name: data.name });
            if (data.color) employeeColors[doc.id] = data.color;
        });

        schedulerSettings = userDoc.exists ? userDoc.data() : {};

        updateHeaderUI();
        renderFilterDropdown(employees);
        renderColorToggle();

        const alertControls = document.getElementById('alertControls');
        if(alertControls) alertControls.style.display = 'flex';
        const delayInput = document.getElementById('editEmailDelay');
        if(delayInput) delayInput.value = schedulerSettings.emailDelayMinutes || 60;
        const enabledInput = document.getElementById('editEmailEnabled');
        if(enabledInput) enabledInput.checked = (schedulerSettings.emailAlertsEnabled === undefined) ? true : schedulerSettings.emailAlertsEnabled;

        let filteredJobs = jobs;
        if (currentEmpFilter !== 'ALL') {
            filteredJobs = jobs.filter(job => job.employeeId === currentEmpFilter);
        }

        window.schedulerJobsCache = filteredJobs;

        const alertThreshold = schedulerSettings.alertThreshold || 15;
        const emailDelayMinutes = schedulerSettings.emailDelayMinutes || 60;
        const emailAlertsEnabled = enabledInput.checked;

        // RENDER VIEWS
        if (currentView === 'week') {
            renderWeekView(filteredJobs, alertThreshold, emailDelayMinutes, emailAlertsEnabled, accountAlarms);
        } else if (currentView === 'day') {
            renderDayView(filteredJobs, alertThreshold, emailDelayMinutes, emailAlertsEnabled, accountAlarms);
        } else if (currentView === 'month') {
            renderMonthView(filteredJobs, alertThreshold, emailDelayMinutes, emailAlertsEnabled, accountAlarms);
        }

        if (currentView !== 'month') {
             setupInteractions();
        }

        attachDblClickListeners();
        attachRowHighlighter();

    } catch (err) {
        console.error("Error loading jobs:", err);
        container.innerHTML = '<div style="color:red; padding:2rem; text-align:center;">Error loading schedule.</div>';
    }
}

async function fetchJobs() {
    const q = window.currentUser.email === 'admin@cleandash.com'
        ? db.collection('jobs')
        : db.collection('jobs').where('owner', '==', window.currentUser.email);

    const snap = await q.get();
    const jobs = [];
    snap.forEach(doc => {
        const j = doc.data();
        j.id = doc.id;
        j.start = j.startTime.toDate();
        j.end = j.endTime.toDate();
        j.actStart = j.actualStartTime ? j.actualStartTime.toDate() : null;
        j.actEnd = j.actualEndTime ? j.actualEndTime.toDate() : null;
        jobs.push(j);
    });
    return jobs;
}

// --- 5. RENDERERS ---

function renderColorToggle() {
    let toggleContainer = document.getElementById('schedulerColorToggleContainer');
    if (!toggleContainer) {
        const header = document.querySelector('#scheduler .card-header');
        const viewToggles = document.querySelector('#scheduler .view-toggles');

        if (header && viewToggles) {
            toggleContainer = document.createElement('div');
            toggleContainer.id = 'schedulerColorToggleContainer';
            toggleContainer.style.marginRight = '15px';
            toggleContainer.style.display = 'flex';
            toggleContainer.style.alignItems = 'center';

            toggleContainer.innerHTML = `
                <label class="toggle-label" style="font-size:0.85rem; color:#4b5563; font-weight:600; cursor:pointer;">
                    <input type="checkbox" id="chkEmployeeColors" onchange="toggleColorMode(this)" style="margin-right:5px;">
                    Colors
                </label>
            `;
            header.insertBefore(toggleContainer, viewToggles);
        }
    }
    const chk = document.getElementById('chkEmployeeColors');
    if(chk) chk.checked = showEmployeeColors;
}

window.toggleColorMode = function(checkbox) {
    showEmployeeColors = checkbox.checked;
    loadScheduler();
};

function renderWeekView(jobs, alertThreshold, emailDelay, emailEnabled, accountAlarms) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;

    // --- ENABLE SCROLLING FOR WEEK VIEW ---
    grid.style.overflow = 'auto';
    grid.style.display = 'block';

    // min-width forces scroll on small screens so columns don't crush
    let html = '<div class="calendar-view" style="min-width: 1000px;">';
    html += generateTimeColumn();
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(currentDate);
        dayDate.setDate(currentDate.getDate() + i);
        html += renderDayColumn(dayDate, jobs, alertThreshold, emailDelay, emailEnabled, false, accountAlarms);
    }
    html += '</div>';
    grid.innerHTML = html;
}

function renderDayView(jobs, alertThreshold, emailDelay, emailEnabled, accountAlarms) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;

    // --- ENABLE SCROLLING FOR DAY VIEW ---
    grid.style.overflow = 'auto';
    grid.style.display = 'block';

    let html = '<div class="calendar-view">';
    html += generateTimeColumn();
    html += renderDayColumn(currentDate, jobs, alertThreshold, emailDelay, emailEnabled, true, accountAlarms);
    html += '</div>';
    grid.innerHTML = html;
}

// --- 6. MONTH VIEW (FIT TO SCREEN - FIXED) ---
function renderMonthView(jobs, alertThreshold, emailDelay, emailEnabled, accountAlarms) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;

    // --- DISABLE OUTER SCROLL ---
    grid.style.overflow = 'hidden';
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';

    // WRAPPER: 100% width/height
    let html = `<div style="width: 100%; height: 100%; display: flex; flex-direction: column; background:white;">`;

    // GRID LAYOUT:
    // - grid-template-columns: repeat(7, minmax(0, 1fr)) -> Forces columns to squash to fit 100% width.
    // - NO min-width -> Allows it to shrink to any screen size.
    html += `<div class="month-view-container" style="
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        grid-template-rows: 25px repeat(6, 1fr);
        flex: 1;
        width: 100%;
        background: #fff;
        border-top: 1px solid #e5e7eb;">

        ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day =>
            `<div style="background:#fff; text-align:center; font-size:0.75rem; font-weight:700; color:#6b7280; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; display:flex; align-items:center; justify-content:center; overflow:hidden;">${day}</div>`
        ).join('')}
    `;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const now = new Date();

    let iterator = new Date(firstDay);
    const diff = iterator.getDay();
    iterator.setDate(iterator.getDate() - diff);

    // Render exactly 42 cells (6 rows x 7 cols)
    for(let i=0; i<42; i++) {
        const isCurrMonth = iterator.getMonth() === month;
        const dateStr = getLocalYMD(iterator);
        const isToday = isSameDay(iterator, now);

        const bgStyle = isCurrMonth ? 'background: #fff;' : 'background: #fcfcfc;';

        // "Today" Indicator (Blue Circle)
        let dateNumStyle = 'font-size:0.8rem; font-weight:600; padding:2px 4px; color:#374151;';
        if (isToday) {
            dateNumStyle = 'background: #2563eb; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; margin: 4px;';
        } else {
            dateNumStyle += ' margin-top: 4px; text-align: left; display: block;';
        }
        if (!isCurrMonth) dateNumStyle += ' opacity: 0.4;';

        const dayJobs = jobs.filter(j => isSameDay(j.start, iterator));
        dayJobs.sort((a,b) => a.start - b.start);

        // CELL:
        // - overflow: hidden clips content so the box doesn't grow
        html += `
        <div class="month-day-cell"
             style="${bgStyle} border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; position:relative; display:flex; flex-direction:column; overflow:hidden;"
             onclick="window.showAssignShiftModal('17:00', '${dateStr}')">

            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="${dateNumStyle}">${iterator.getDate()}</div>
            </div>

            <div style="flex:1; display:flex; flex-direction:column; gap:1px; overflow: hidden; padding: 0 2px 2px 2px;">`;

        dayJobs.forEach(job => {
            // PILL STYLES
            let colorStyle = 'background-color: #e0f2fe; color: #1e40af;';

            if (job.status === 'Completed') colorStyle = 'background-color: #dcfce7; color: #166534;';
            else if (job.status === 'Started') colorStyle = 'background-color: #f3f4f6; color: #4b5563;';
            else {
                const lateTime = new Date(job.start.getTime() + alertThreshold * 60000);
                if (now > lateTime) colorStyle = 'background-color: #fee2e2; color: #991b1b;';
            }

            if (showEmployeeColors && employeeColors[job.employeeId]) {
                colorStyle = `background-color: ${employeeColors[job.employeeId]}; color: #fff;`;
            }

            const alarmIndicator = accountAlarms[job.accountId] ? '🔒' : '';

            html += `
            <div style="${colorStyle} font-size:0.7rem; padding:1px 4px; border-radius:2px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:1px;"
                 data-id="${job.id}"
                 onclick="event.stopPropagation(); window.editJob({id:'${job.id}', accountId:'${job.accountId}', employeeId:'${job.employeeId}'})"
                 title="${formatTime(job.start)} - ${job.accountName}">
                 ${alarmIndicator} <span style="font-weight:700;">${formatTime(job.start)}</span> ${job.accountName}
            </div>`;
        });

        html += `</div>`;

        // PLUS BUTTON: Only if shifts exist
        if (dayJobs.length > 0) {
            html += `
                <div class="mobile-detail-btn"
                     style="display:flex; position:absolute; bottom:2px; right:2px; width:18px; height:18px; background:rgba(255,255,255,0.8); color:#4b5563; border-radius:3px; justify-content:center; align-items:center; cursor:pointer; font-size:1rem; border:1px solid #d1d5db; font-weight:bold; z-index: 10;"
                     onclick="event.stopPropagation(); showMobileDayDetails('${dateStr}')"
                     title="View All">
                     +
                </div>`;
        }

        html += `</div>`;
        iterator.setDate(iterator.getDate() + 1);
    }

    html += `</div></div>`;
    grid.innerHTML = html;
}

// --- 7. HELPER: POPUP MODAL ---
window.showMobileDayDetails = function(dateStr) {
    const existing = document.getElementById('mobileDayPopup');
    if(existing) existing.remove();

    const targetDate = new Date(dateStr + 'T00:00:00');
    const allJobs = window.schedulerJobsCache || [];

    const dayJobs = allJobs.filter(j => {
        const d = j.start;
        return d.getDate() === targetDate.getDate() &&
               d.getMonth() === targetDate.getMonth() &&
               d.getFullYear() === targetDate.getFullYear();
    });

    dayJobs.sort((a,b) => a.start - b.start);

    const displayDate = targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    let content = `<div style="padding:15px; background:#f9fafb; border-bottom:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; border-radius:8px 8px 0 0;">
            <h3 style="margin:0; font-size:1.1rem; color:#1f2937;">${displayDate}</h3>
            <button onclick="document.getElementById('mobileDayPopup').remove()" style="border:none; background:none; font-size:1.5rem; color:#6b7280;">&times;</button>
        </div>
        <div style="max-height:60vh; overflow-y:auto; padding:15px; background:white;">`;

    if (dayJobs.length === 0) {
        content += `<p style="color:#666; text-align:center; padding:20px; background:#f9fafb; border-radius:4px; border:1px solid #e5e7eb;">No shifts scheduled.</p>`;
    } else {
        dayJobs.forEach(job => {
            let border = '4px solid #3b82f6';
            if (job.status === 'Completed') border = '4px solid #10b981';
            else if (job.status === 'Started') border = '4px solid #eab308';

            content += `
            <div style="background:white; padding:10px; margin-bottom:8px; border-left:${border}; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.05); cursor:pointer; border:1px solid #e5e7eb;"
                 onclick="window.editJob({id:'${job.id}', accountId:'${job.accountId}', employeeId:'${job.employeeId}'}); document.getElementById('mobileDayPopup').remove();">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <strong style="color:#1f2937; font-size:0.95rem;">${job.accountName}</strong>
                    <span style="font-size:0.85rem; color:#4b5563; font-weight:600;">${formatTime(job.start)}</span>
                </div>
                <div style="font-size:0.8rem; color:#6b7280;">
                    👤 ${job.employeeName}
                </div>
            </div>`;
        });
    }

    content += `</div><div style="padding:15px; background:#f9fafb; border-radius:0 0 8px 8px; border-top:1px solid #e5e7eb;">
        <button onclick="window.showAssignShiftModal('09:00', '${dateStr}'); document.getElementById('mobileDayPopup').remove();"
        style="width:100%; padding:10px; background:#2563eb; color:white; border:none; border-radius:6px; font-weight:600; cursor:pointer;">
        + New Shift
        </button>
    </div>`;

    const overlay = document.createElement('div');
    overlay.id = 'mobileDayPopup';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); z-index: 99999;
        display: flex; justify-content: center; align-items: center;
        backdrop-filter: blur(1px);
    `;

    overlay.innerHTML = `
        <div style="background:white; width:90%; max-width:450px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.2); animation: popIn 0.15s ease-out;">
            ${content}
        </div>
    `;

    const style = document.createElement('style');
    style.innerHTML = `@keyframes popIn { from { transform: scale(0.98); opacity: 0; } to { transform: scale(1); opacity: 1; } }`;
    overlay.appendChild(style);
    overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); }
    document.body.appendChild(overlay);
};

// --- 8. UTILS ---

function generateTimeColumn() {
    let html = '<div class="calendar-time-col">';
    html += '<div class="cal-header" style="background:#f9fafb; border-bottom:1px solid #e5e7eb;"></div>';
    for (let h = 0; h < HOURS_TO_RENDER; h++) {
        let actualHour = h + START_HOUR;
        let displayH = actualHour % 24;
        let label = (displayH === 0) ? '12 AM' : (displayH < 12 ? `${displayH} AM` : (displayH === 12 ? '12 PM' : `${displayH - 12} PM`));
        if (actualHour >= 24) label += ' <span style="font-size:0.6rem; display:block; opacity:0.6;">(+1)</span>';
        html += `<div class="time-slot" data-hour-index="${h}">${label}</div>`;
    }
    html += '</div>';
    return html;
}

function renderDayColumn(dateObj, jobs, alertThreshold, emailDelay, emailEnabled, isSingleDay = false, accountAlarms = {}) {
    const dateStr = getLocalYMD(dateObj);
    const displayDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    const now = new Date();
    const isToday = isSameDay(dateObj, now);
    const activeClass = (isToday && !isSingleDay) ? ' today-active' : '';

    const dayJobs = jobs.filter(j => isSameDay(j.start, dateObj));
    dayJobs.sort((a, b) => a.start - b.start);

    // --- ALGORITHM TO STACK OVERLAPPING SHIFTS ---
    const columns = [];
    dayJobs.forEach(job => {
        let placed = false;
        for(let i = 0; i < columns.length; i++) {
            const lastJobInColumn = columns[i][columns[i].length - 1];
            if (job.start >= lastJobInColumn.end) {
                columns[i].push(job);
                job.colIndex = i;
                placed = true;
                break;
            }
        }
        if (!placed) {
            columns.push([job]);
            job.colIndex = columns.length - 1;
        }
    });

    const totalCols = columns.length || 1;
    const colWidth = 94 / totalCols;

    let html = `<div class="calendar-day-col${activeClass}" style="${isSingleDay ? 'flex:1;' : ''}" data-date="${dateStr}">`;
    html += `<div class="cal-header">${displayDate}</div>`;
    html += `<div class="day-slots">`;

    dayJobs.forEach(job => {
        const startHour = job.start.getHours() + (job.start.getMinutes() / 60);
        let endHour = job.end.getHours() + (job.end.getMinutes() / 60);
        if (job.end.getDate() !== job.start.getDate()) endHour += 24;

        let duration = endHour - startHour;
        if(duration < 0.5) duration = 0.5;

        // Vertical positioning adjusted for Noon offset
        const topPx = (startHour - START_HOUR) * PIXELS_PER_HOUR;
        const heightPx = Math.max(duration * PIXELS_PER_HOUR, 25);
        const leftPos = 3 + (job.colIndex * colWidth);

        let statusClass = 'day-event';
        let extraStyle = '';

        if (job.status === 'Completed') statusClass += ' done';
        else if (job.status === 'Started') statusClass += ' active';
        else {
            const lateTime = new Date(job.start.getTime() + alertThreshold * 60000);
            if (now > lateTime) statusClass += ' late';
            else statusClass += ' scheduled';
        }

        if (showEmployeeColors && employeeColors[job.employeeId]) {
            extraStyle = `background-color: ${employeeColors[job.employeeId]}; border-left-color: rgba(0,0,0,0.2); color: #fff;`;
        }

        const alarmCode = accountAlarms[job.accountId];
        const alarmHtml = alarmCode ? `<div class="event-meta" style="color:${extraStyle ? '#fff' : '#ef4444'}; font-weight:bold;">🚨 ${alarmCode}</div>` : '';
        const titleColor = extraStyle ? 'color: #fff;' : '';

        // --- THE FIX IS HERE ---
        // Added onclick="window.editJob..." to enable tap-to-edit
        html += `
        <div class="${statusClass}"
             style="top:${topPx}px; height:${heightPx}px; width:${colWidth}%; left:${leftPos}%; ${extraStyle}"
             data-id="${job.id}"
             onclick="event.stopPropagation(); window.editJob({id:'${job.id}'})"
             title="${job.accountName} - ${job.employeeName}">
            <div class="event-time" style="${titleColor}">${formatTime(job.start)} - ${formatTime(job.end)}</div>
            <div class="event-title" style="${titleColor}">${job.accountName}</div>
            <div class="event-meta" style="${titleColor}">👤 ${job.employeeName.split(' ')[0]}</div>
            ${alarmHtml}
            <div class="resize-handle"></div>
        </div>`;
    });

    html += `</div></div>`;
    return html;
}

function setupInteractions() {
    const grid = document.getElementById('schedulerGrid');
    if(grid._mouseDownHandler) grid.removeEventListener('mousedown', grid._mouseDownHandler);

    let activeEl = null;
    let mode = null;
    let startY = 0;
    let initialTop = 0;
    let initialHeight = 0;

    const onMouseDown = (e) => {
        const handle = e.target.closest('.resize-handle');
        const eventEl = e.target.closest('.day-event');
        if (!eventEl || eventEl.classList.contains('done')) return;
        if(e.button !== 0) return;

        activeEl = eventEl;
        startY = e.clientY;
        initialTop = activeEl.offsetTop;
        initialHeight = activeEl.offsetHeight;

        if (handle) {
            mode = 'resize';
            document.body.style.cursor = 'ns-resize';
            e.preventDefault(); e.stopPropagation();
        } else {
            mode = 'potential_drag';
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!activeEl) return;
        const deltaY = e.clientY - startY;

        if (mode === 'potential_drag' && Math.abs(deltaY) > 5) {
            mode = 'drag';
            activeEl.classList.add('dragging');
            activeEl.style.zIndex = '1000';
            activeEl.style.width = activeEl.getBoundingClientRect().width + 'px';
            document.body.style.cursor = 'grabbing';
        }

        if (mode === 'resize') {
            const snappedDelta = Math.round(deltaY / SNAP_PIXELS) * SNAP_PIXELS;
            const newHeight = Math.max(30, initialHeight + snappedDelta);
            activeEl.style.height = `${newHeight}px`;
        } else if (mode === 'drag') {
            const snappedDeltaY = Math.round(deltaY / SNAP_PIXELS) * SNAP_PIXELS;
            const newTop = Math.max(-600, initialTop + snappedDeltaY);
            activeEl.style.top = `${newTop}px`;
        }
    };

    const onMouseUp = async (e) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';

        if (!activeEl) return;
        if (mode === 'potential_drag') { activeEl = null; mode = null; return; }

        const jobId = activeEl.dataset.id;
        const currentTop = parseInt(activeEl.style.top);
        const currentHeight = parseInt(activeEl.style.height);

        activeEl.classList.remove('dragging');
        activeEl.style.zIndex = '';
        activeEl.style.width = '';

        const startTotalMinutes = (currentTop / PIXELS_PER_HOUR * 60) + (START_HOUR * 60);
        const durationMinutes = (currentHeight / PIXELS_PER_HOUR * 60);

        activeEl.style.visibility = 'hidden';
        const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
        activeEl.style.visibility = 'visible';

        const targetCol = elemBelow ? elemBelow.closest('.calendar-day-col') : null;

        if (targetCol && targetCol.dataset.date) {
            const targetDateStr = targetCol.dataset.date;
            const hours = Math.floor(startTotalMinutes / 60);
            const minutes = Math.floor(startTotalMinutes % 60);
            const newStart = new Date(`${targetDateStr}T${String(hours % 24).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`);

            if (hours >= 24) newStart.setDate(newStart.getDate() + 1);

            const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

            window.showToast("Updating schedule...");
            try {
                await db.collection('jobs').doc(jobId).update({
                    startTime: firebase.firestore.Timestamp.fromDate(newStart),
                    endTime: firebase.firestore.Timestamp.fromDate(newEnd)
                });
                loadScheduler();
            } catch (err) { alert("Failed to move shift."); loadScheduler(); }
        } else { loadScheduler(); }

        activeEl = null; mode = null;
    };
    grid._mouseDownHandler = onMouseDown;
    grid.addEventListener('mousedown', onMouseDown);
}

function renderFilterDropdown(employees) {
    let filterContainer = document.getElementById('schedulerFilterContainer');
    if (!filterContainer) {
        const header = document.querySelector('#scheduler .card-header');
        const viewToggles = document.querySelector('#scheduler .view-toggles');
        if (header && viewToggles) {
            filterContainer = document.createElement('div');
            filterContainer.id = 'schedulerFilterContainer';
            filterContainer.style.marginRight = '15px';
            const select = document.createElement('select');
            select.id = 'schedulerEmpFilterSelect';
            select.className = 'form-control';
            select.style.padding = '6px 12px';
            select.style.borderRadius = '6px';
            select.style.border = '1px solid #d1d5db';
            select.style.fontSize = '0.9rem';
            select.style.fontWeight = '600';
            select.onchange = function() { currentEmpFilter = this.value; loadScheduler(); };
            filterContainer.appendChild(select);
            header.insertBefore(filterContainer, viewToggles);
        }
    }
    const select = document.getElementById('schedulerEmpFilterSelect');
    if (select) {
        const currentSelection = select.value || currentEmpFilter;
        select.innerHTML = '';
        const allOpt = document.createElement('option');
        allOpt.value = 'ALL'; allOpt.textContent = '👥 All Team Members';
        select.appendChild(allOpt);
        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id; opt.textContent = `👤 ${emp.name}`;
            select.appendChild(opt);
        });
        select.value = currentSelection;
    }
}

function attachRowHighlighter() {
    const grid = document.getElementById('schedulerGrid');
    if (grid._highlightHandler) {
        grid.removeEventListener('mousemove', grid._highlightHandler);
        grid.removeEventListener('mouseleave', grid._clearHighlightHandler);
    }
    const moveHandler = function(e) {
        const firstSlot = document.querySelector('.time-slot[data-hour-index="0"]');
        if (!firstSlot) return;
        const rect = firstSlot.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        if (offsetY < 0) { clearHighlights(); return; }
        const index = Math.floor(offsetY / 60);
        if (grid._lastHighlightIndex === index) return;
        grid._lastHighlightIndex = index;
        clearHighlights();
        const target = document.querySelector(`.time-slot[data-hour-index="${index}"]`);
        if (target) { target.classList.add('active-time'); }
    };
    const clearHighlights = function() {
        document.querySelectorAll('.time-slot.active-time').forEach(el => { el.classList.remove('active-time'); });
        grid._lastHighlightIndex = -1;
    };
    grid._highlightHandler = moveHandler;
    grid._clearHighlightHandler = clearHighlights;
    grid.addEventListener('mousemove', moveHandler);
    grid.addEventListener('mouseleave', clearHighlights);
}

function attachDblClickListeners() {
    document.querySelectorAll('.calendar-day-col').forEach(dayCol => {
        dayCol.removeEventListener('dblclick', dblClickHandler);
        dayCol.addEventListener('dblclick', dblClickHandler);
    });
    const monthView = document.querySelector('.calendar-month-view');
    if (monthView) {
        monthView.removeEventListener('dblclick', dblClickHandler);
        monthView.addEventListener('dblclick', dblClickHandler);
    }
}

function dblClickHandler(event) {
    const eventEl = event.target.closest('.day-event') || event.target.closest('.month-event');
    if (eventEl) {
        event.stopPropagation();
        const id = eventEl.dataset.id;
        if(id) editJob({ id: id });
        return;
    }
    const slotHeight = 60;
    const daySlots = event.target.closest('.day-slots');
    if (daySlots) {
        const yOffset = event.clientY - daySlots.getBoundingClientRect().top;
        const hourIndex = Math.floor(yOffset / slotHeight);
        let actualHour = hourIndex + START_HOUR; // Adjust for offset
        let clickedHour = actualHour % 24;
        const formattedTime = `${String(clickedHour).padStart(2, '0')}:00`;
        const dayCol = event.target.closest('.calendar-day-col');
        const date = dayCol ? dayCol.getAttribute('data-date') : null;
        if (date && typeof window.showAssignShiftModal === 'function') {
            window.showAssignShiftModal(formattedTime, date);
        }
    }
}

function updateHeaderUI() {
    const label = document.getElementById('weekRangeDisplay');
    if(!label) return;
    if (currentView === 'day') {
        label.textContent = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    } else if (currentView === 'month') {
        label.textContent = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
        const endOfWeek = new Date(currentDate);
        endOfWeek.setDate(currentDate.getDate() + 6);
        label.textContent = `${currentDate.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
    }
    document.querySelectorAll('.btn-view-toggle').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === currentView);
    });
}

window.changeView = function(view) {
    currentView = view;
    if (view === 'week' || view === 'day') {
        currentDate = new Date();
    }
    currentDate = normalizeDate(currentDate, currentView);
    loadScheduler();
};

window.changePeriod = function(direction) {
    if (currentView === 'day') { currentDate.setDate(currentDate.getDate() + direction); }
    else if (currentView === 'week') { currentDate.setDate(currentDate.getDate() + (direction * 7)); }
    else if (currentView === 'month') { currentDate.setMonth(currentDate.getMonth() + direction); }
    loadScheduler();
};

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function formatTime(date) { return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

window.saveScheduleSettings = async function() {
    if (!window.currentUser) return;
    const emailDelayMinutes = parseInt(document.getElementById('editEmailDelay').value) || 60;
    const emailAlertsEnabled = document.getElementById('editEmailEnabled').checked;
    await db.collection('users').doc(window.currentUser.uid).set({ emailDelayMinutes, emailAlertsEnabled }, { merge: true });
    window.showToast("Settings updated!");
    loadScheduler();
};

window.toggleRecurrenceOptions = function() {
    const isChecked = document.getElementById('shiftRepeat').checked;
    document.getElementById('recurrenceOptions').style.display = isChecked ? 'block' : 'none';
};
window.toggleRecurrenceDay = function(btn) { btn.classList.toggle('selected'); };

async function populateDropdowns() {
    const accSelect = document.getElementById('shiftAccount');
    const empSelect = document.getElementById('shiftEmployee');
    const startSelect = document.getElementById('shiftStartTime');
    const endSelect = document.getElementById('shiftEndTime');
    const actStartSelect = document.getElementById('actStartTime');
    const actEndSelect = document.getElementById('actEndTime');

    if (!accSelect || !empSelect || !startSelect || !endSelect) return;

    if (startSelect.options.length === 0) {
        const times = [];
        for(let i=0; i<24; i++) {
            for(let m=0; m<60; m+=15) {
                const h = i.toString().padStart(2,'0');
                const min = m.toString().padStart(2,'0');
                const displayH = i === 0 ? 12 : (i > 12 ? i-12 : i);
                const ampm = i < 12 ? 'AM' : 'PM';
                times.push({ val: `${h}:${min}`, text: `${displayH}:${min} ${ampm}` });
            }
        }
        const fill = (sel) => {
            if(!sel) return;
            sel.innerHTML = '<option value="">-- Select --</option>';
            times.forEach(t => sel.add(new Option(t.text, t.val)));
        };
        fill(startSelect); fill(endSelect); fill(actStartSelect); fill(actEndSelect);
        const autoInc = (source, target) => {
             const val = source.value; if(!val) return;
             let [h, m] = val.split(':').map(Number);
             h = (h + 1) % 24;
             if(target) target.value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        };
        startSelect.addEventListener('change', () => autoInc(startSelect, endSelect));
        if(actStartSelect) actStartSelect.addEventListener('change', () => autoInc(actStartSelect, actEndSelect));
    }

    if (accSelect.options.length <= 1) {
        accSelect.innerHTML = '<option value="">Select Account...</option>';
        empSelect.innerHTML = '<option value="">Select Employee...</option>';
        if (!window.currentUser) return;
        try {
            const accSnap = await db.collection('accounts').where('owner', '==', window.currentUser.email).orderBy('name').get();
            accSnap.forEach(doc => accSelect.appendChild(new Option(doc.data().name, doc.id)));
            const empSnap = await db.collection('employees').where('owner', '==', window.currentUser.email).orderBy('name').get();
            empSnap.forEach(doc => empSelect.appendChild(new Option(doc.data().name, doc.id)));
        } catch (e) { console.error("Dropdown load error:", e); }
    }
}

window.showAssignShiftModal = async function(startTime = "17:00", dateStr = null) {
    document.getElementById('shiftModal').style.display = 'flex';
    document.getElementById('shiftModalTitle').textContent = "Assign Shift";
    document.getElementById('shiftId').value = "";
    document.getElementById('btnDeleteShift').style.display = 'none';
    document.getElementById('manualTimeSection').style.display = 'none';
    document.getElementById('shiftRepeat').checked = false;
    document.getElementById('recurrenceOptions').style.display = 'none';
    document.querySelectorAll('.day-btn-circle').forEach(b => b.classList.remove('selected'));
    document.getElementById('shiftRepeatEnd').value = "";
    document.getElementById('actDate').value = '';
    document.getElementById('actStartTime').value = '';
    document.getElementById('actEndTime').value = '';

    await populateDropdowns();

    if (dateStr) document.getElementById('shiftStartDate').value = dateStr;
    else document.getElementById('shiftStartDate').value = getLocalYMD(new Date());

    document.getElementById('shiftStartTime').value = startTime;
    let [h, m] = startTime.split(':').map(Number);
    h = (h + 1) % 24;
    document.getElementById('shiftEndTime').value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};

window.openShiftModal = function(dateObj) {
    window.showAssignShiftModal("17:00", getLocalYMD(dateObj));
};

window.editJob = async function(job) {
    if(!job.start) {
        const doc = await db.collection('jobs').doc(job.id).get();
        const data = doc.data();
        job = {
            id: doc.id, ...data,
            start: data.startTime.toDate(), end: data.endTime.toDate(),
            actStart: data.actualStartTime ? data.actualStartTime.toDate() : null,
            actEnd: data.actualEndTime ? data.actualEndTime.toDate() : null
        };
    }
    document.getElementById('shiftModal').style.display = 'flex';
    document.getElementById('shiftModalTitle').textContent = "Edit Shift";
    document.getElementById('shiftId').value = job.id;
    document.getElementById('btnDeleteShift').style.display = 'inline-block';
    document.getElementById('manualTimeSection').style.display = 'block';
    document.getElementById('shiftRepeat').checked = false;
    document.getElementById('recurrenceOptions').style.display = 'none';

    await populateDropdowns();

    document.getElementById('shiftAccount').value = job.accountId;
    document.getElementById('shiftEmployee').value = job.employeeId;
    document.getElementById('shiftStatus').value = job.status || 'Scheduled';

    const getHM = (d) => {
        const h = String(d.getHours()).padStart(2,'0');
        const m = String(Math.round(d.getMinutes()/15)*15).padStart(2,'0');
        return `${h}:${m === '60' ? '00' : m}`;
    };

    document.getElementById('shiftStartDate').value = getLocalYMD(job.start);
    document.getElementById('shiftStartTime').value = getHM(job.start);
    document.getElementById('shiftEndTime').value = getHM(job.end);

    if(job.actStart) {
        document.getElementById('actDate').value = getLocalYMD(job.actStart);
        document.getElementById('actStartTime').value = getHM(job.actStart);
    } else { document.getElementById('actDate').value = ''; document.getElementById('actStartTime').value = ''; }

    if(job.actEnd) { document.getElementById('actEndTime').value = getHM(job.actEnd); }
    else { document.getElementById('actEndTime').value = ''; }
};

window.autoFillCompleted = function() {
    const sDate = document.getElementById('shiftStartDate').value;
    const sTime = document.getElementById('shiftStartTime').value;
    const eTime = document.getElementById('shiftEndTime').value;

    if (!sDate || !sTime || !eTime) {
        return alert("Please ensure the Scheduled Date and Times are set first.");
    }
    document.getElementById('actDate').value = sDate;
    document.getElementById('actStartTime').value = sTime;
    document.getElementById('actEndTime').value = eTime;
    document.getElementById('shiftStatus').value = 'Completed';
    window.showToast("Times matched to schedule. Click 'Save Shift' to finish.");
};

window.saveShift = async function() {
    const id = document.getElementById('shiftId').value;
    const accSelect = document.getElementById('shiftAccount');
    const empSelect = document.getElementById('shiftEmployee');
    const sDate = document.getElementById('shiftStartDate').value;
    const sTime = document.getElementById('shiftStartTime').value;
    const eTime = document.getElementById('shiftEndTime').value;
    const status = document.getElementById('shiftStatus').value;
    const isRepeat = document.getElementById('shiftRepeat').checked;

    if (!accSelect.value || !empSelect.value || !sDate || !sTime || !eTime) return alert("Required fields missing.");

    const btn = document.querySelector('#shiftModal .btn-primary');
    btn.disabled = true; btn.textContent = "Saving...";

    try {
        const batch = db.batch();
        const baseStart = new Date(`${sDate}T${sTime}:00`);
        let baseEnd = new Date(`${sDate}T${eTime}:00`);
        if (baseEnd <= baseStart) baseEnd.setDate(baseEnd.getDate() + 1);
        const durationMs = baseEnd - baseStart;

        if (!isRepeat || id) {
            const data = {
                accountId: accSelect.value,
                accountName: accSelect.options[accSelect.selectedIndex].text,
                employeeId: empSelect.value,
                employeeName: empSelect.options[empSelect.selectedIndex].text,
                startTime: firebase.firestore.Timestamp.fromDate(baseStart),
                endTime: firebase.firestore.Timestamp.fromDate(baseEnd),
                status: status, owner: window.currentUser.email
            };

            const actSDate = document.getElementById('actDate').value;
            const actSTime = document.getElementById('actStartTime').value;
            const actETime = document.getElementById('actEndTime').value;

            if(actSDate && actSTime) {
                const manualStart = new Date(`${actSDate}T${actSTime}:00`);
                data.actualStartTime = firebase.firestore.Timestamp.fromDate(manualStart);
                if(actETime) {
                    let manualEnd = new Date(`${actSDate}T${actETime}:00`);
                    if (manualEnd <= manualStart) manualEnd.setDate(manualEnd.getDate() + 1);
                    data.actualEndTime = firebase.firestore.Timestamp.fromDate(manualEnd);
                }
            }

            if (id) { await db.collection('jobs').doc(id).update(data); window.showToast("Shift Updated"); }
            else { data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection('jobs').add(data); window.showToast("Shift Created"); }
        } else {
            const repeatUntilVal = document.getElementById('shiftRepeatEnd').value;
            if (!repeatUntilVal) throw new Error("Please select a 'Repeat Until' date.");
            const repeatUntil = new Date(repeatUntilVal); repeatUntil.setHours(23, 59, 59);
            const selectedDays = [];
            document.querySelectorAll('.day-btn-circle.selected').forEach(btn => selectedDays.push(parseInt(btn.dataset.day)));
            if (selectedDays.length === 0) throw new Error("Select at least one day for repetition.");

            let cursor = new Date(baseStart); let createdCount = 0;
            while (cursor <= repeatUntil) {
                if (selectedDays.includes(cursor.getDay())) {
                    const shiftStart = new Date(cursor);
                    const shiftEnd = new Date(cursor.getTime() + durationMs);
                    const newRef = db.collection('jobs').doc();
                    batch.set(newRef, {
                        accountId: accSelect.value,
                        accountName: accSelect.options[accSelect.selectedIndex].text,
                        employeeId: empSelect.value,
                        employeeName: empSelect.options[empSelect.selectedIndex].text,
                        startTime: firebase.firestore.Timestamp.fromDate(shiftStart),
                        endTime: firebase.firestore.Timestamp.fromDate(shiftEnd),
                        status: 'Scheduled', owner: window.currentUser.email,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    createdCount++;
                }
                cursor.setDate(cursor.getDate() + 1);
            }
            if (createdCount === 0) throw new Error("No shifts created. Check dates.");
            await batch.commit(); window.showToast(`${createdCount} Shifts Created!`);
        }
        closeShiftModal(); loadScheduler();
    } catch (e) { alert("Error: " + e.message); }
    finally { btn.disabled = false; btn.textContent = "Save Shift"; }
};

window.deleteJobFromModal = async function() {
    const id = document.getElementById('shiftId').value;
    if(!confirm("Cancel this shift?")) return;
    await db.collection('jobs').doc(id).delete();
    closeShiftModal(); loadScheduler();
};

window.closeShiftModal = function() { document.getElementById('shiftModal').style.display = 'none'; };

if (Notification.permission !== "granted" && Notification.permission !== "denied") Notification.requestPermission();

window.loadScheduler = loadScheduler;