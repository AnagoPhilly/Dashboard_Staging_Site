// js/scheduler.js

// --- CALENDAR STATE ---
let currentView = 'week';
let currentDate = new Date();
let alertedJobs = new Set();
const alertSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
const HOURS_TO_RENDER = 30;
const PIXELS_PER_HOUR = 60;
const SNAP_MINUTES = 15;
const PIXELS_PER_MINUTE = PIXELS_PER_HOUR / 60;
const SNAP_PIXELS = SNAP_MINUTES * PIXELS_PER_MINUTE;

// --- STATE GLOBALS ---
let schedulerSettings = {};
let currentEmpFilter = 'ALL';
let showEmployeeColors = false; // TOGGLE STATE
let employeeColors = {}; // Cache for colors

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

// --- MAIN LOAD FUNCTION ---

async function loadScheduler() {
    console.log(`CleanDash: Loading Schedule (${currentView} view)...`);
    const container = document.getElementById('schedulerGrid');

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
        employeeColors = {}; // Reset color cache

        empSnap.forEach(doc => {
            const data = doc.data();
            employees.push({ id: doc.id, name: data.name });
            if (data.color) employeeColors[doc.id] = data.color;
        });

        schedulerSettings = userDoc.exists ? userDoc.data() : {};

        updateHeaderUI();
        renderFilterDropdown(employees);
        renderColorToggle(); // NEW: Render the color toggle switch

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

        const alertThreshold = schedulerSettings.alertThreshold || 15;
        const emailDelayMinutes = schedulerSettings.emailDelayMinutes || 60;
        const emailAlertsEnabled = enabledInput.checked;

        if (currentView === 'week') {
            renderWeekView(filteredJobs, alertThreshold, emailDelayMinutes, emailAlertsEnabled, accountAlarms);
        } else if (currentView === 'day') {
            renderDayView(filteredJobs, alertThreshold, emailDelayMinutes, emailAlertsEnabled, accountAlarms);
        } else if (currentView === 'month') {
            renderMonthView(filteredJobs, alertThreshold, emailDelayMinutes, emailAlertsEnabled, accountAlarms);
        }

        if (currentView !== 'month') {
             setTimeout(() => { if(container) container.scrollTop = 1020; }, 100);
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

// --- NEW: COLOR TOGGLE UI ---
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

            // HTML for the switch
            toggleContainer.innerHTML = `
                <label class="toggle-label" style="font-size:0.85rem; color:#4b5563; font-weight:600; cursor:pointer;">
                    <input type="checkbox" id="chkEmployeeColors" onchange="toggleColorMode(this)" style="margin-right:5px;">
                    Show Employee Colors
                </label>
            `;

            header.insertBefore(toggleContainer, viewToggles);
        }
    }
    // Restore state
    const chk = document.getElementById('chkEmployeeColors');
    if(chk) chk.checked = showEmployeeColors;
}

window.toggleColorMode = function(checkbox) {
    showEmployeeColors = checkbox.checked;
    loadScheduler();
};

// --- RENDERERS ---

function renderWeekView(jobs, alertThreshold, emailDelay, emailEnabled, accountAlarms) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;
    let html = '<div class="calendar-view">';
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
    let html = '<div class="calendar-view">';
    html += generateTimeColumn();
    html += renderDayColumn(currentDate, jobs, alertThreshold, emailDelay, emailEnabled, true, accountAlarms);
    html += '</div>';
    grid.innerHTML = html;
}

function renderMonthView(jobs, alertThreshold, emailDelay, emailEnabled, accountAlarms) {
    const grid = document.getElementById('schedulerGrid');
    if(!grid) return;
    let html = `
    <div class="month-header">
        <div class="month-day-label">Sun</div><div class="month-day-label">Mon</div>
        <div class="month-day-label">Tue</div><div class="month-day-label">Wed</div>
        <div class="month-day-label">Thu</div><div class="month-day-label">Fri</div>
        <div class="month-day-label">Sat</div>
    </div>
    <div class="calendar-month-view">`;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const now = new Date();

    let iterator = new Date(firstDay);
    iterator.setDate(iterator.getDate() - iterator.getDay());

    for(let i=0; i<42; i++) {
        const isCurrMonth = iterator.getMonth() === month;
        const dateStr = getLocalYMD(iterator);
        const isToday = isSameDay(iterator, now);
        const activeClass = isToday ? ' today-active' : '';
        const dayJobs = jobs.filter(j => isSameDay(j.start, iterator));

        if (!isCurrMonth && iterator > lastDay && iterator.getDay() === 0) break;

        html += `<div class="month-day ${isCurrMonth ? '' : 'other-month'}${activeClass}" onclick="window.showAssignShiftModal('17:00', '${dateStr}')">
            <div class="month-date-num">${iterator.getDate()}</div>
            <div class="month-events">`;

        dayJobs.forEach(job => {
            let statusClass = 'month-event';
            let extraStyle = '';

            // LOGIC: COLOR CODING
            if(job.status === 'Completed') statusClass += ' done';
            else if(job.status === 'Started') statusClass += ' active'; // This maps to Grey in CSS
            else if (new Date() > new Date(job.start.getTime() + alertThreshold*60000)) statusClass += ' late';
            else {
                // Scheduled: Check toggle
                if (showEmployeeColors && employeeColors[job.employeeId]) {
                    // Override default blue with employee color
                    extraStyle = `background-color: ${employeeColors[job.employeeId]}; border-left-color: rgba(0,0,0,0.2); color: #fff;`;
                }
            }

            const alarmIndicator = accountAlarms[job.accountId] ? '🔒' : '';

            html += `<div class="${statusClass}" style="${extraStyle}" data-id="${job.id}" onclick="event.stopPropagation()">
                ${alarmIndicator} ${formatTime(job.start)} ${job.accountName}
            </div>`;
        });

        html += `</div>
            <button class="month-add-btn" onclick="event.stopPropagation(); window.showAssignShiftModal('17:00', '${dateStr}')">+</button>
        </div>`;

        iterator.setDate(iterator.getDate() + 1);
    }

    html += `</div>`;
    grid.innerHTML = html;
}

function generateTimeColumn() {
    let html = '<div class="calendar-time-col">';
    html += '<div class="cal-header" style="background:#f9fafb; border-bottom:1px solid #e5e7eb;"></div>';
    for (let h = 0; h < HOURS_TO_RENDER; h++) {
        let displayH = h % 24;
        let label = (displayH === 0) ? '12 AM' : (displayH < 12 ? `${displayH} AM` : (displayH === 12 ? '12 PM' : `${displayH - 12} PM`));
        if (h >= 24) label += ' <span style="font-size:0.6rem; display:block; opacity:0.6;">(+1)</span>';
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
    const activeClass = isToday ? ' today-active' : '';

    const dayJobs = jobs.filter(j => isSameDay(j.start, dateObj));
    dayJobs.sort((a, b) => a.start - b.start);

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

        const topPx = startHour * 60;
        const heightPx = Math.max(duration * 60, 25);
        const leftPos = 3 + (job.colIndex * colWidth);

        let statusClass = 'day-event';
        let statusIcon = '';
        let extraStyle = '';

        // LOGIC: COLOR CODING (Updated for new request)
        if (job.status === 'Completed') {
            statusClass += ' done';
            statusIcon = '✅';
        } else if (job.status === 'Started') {
            statusClass += ' active'; // CSS updated to Grey
            statusIcon = '🔄';
        } else {
            // Check Late
            const lateTime = new Date(job.start.getTime() + alertThreshold * 60000);
            if (now > lateTime) {
                statusClass += ' late';
                statusIcon = '⚠️';
            } else {
                // Scheduled
                statusClass += ' scheduled';
                // Check Toggle for Employee Color
                if (showEmployeeColors && employeeColors[job.employeeId]) {
                    // Force background color via inline style
                    extraStyle = `background-color: ${employeeColors[job.employeeId]}; border-left-color: rgba(0,0,0,0.2); color: #fff;`;
                }
            }
        }

        const alarmCode = accountAlarms[job.accountId];
        const alarmHtml = alarmCode ? `<div class="event-meta" style="color:${extraStyle ? '#fff' : '#ef4444'}; font-weight:bold;">🚨 ${alarmCode}</div>` : '';
        const titleColor = extraStyle ? 'color: #fff;' : ''; // Ensure text is readable if custom bg

        html += `
        <div class="${statusClass}"
             style="top:${topPx}px; height:${heightPx}px; width:${colWidth}%; left:${leftPos}%; ${extraStyle}"
             data-id="${job.id}"
             title="${job.accountName} - ${job.employeeName}">
            <div class="event-time" style="${titleColor}">${formatTime(job.start)} - ${formatTime(job.end)}</div>
            <div class="event-title" style="${titleColor}">${statusIcon} ${job.accountName}</div>
            <div class="event-meta" style="${titleColor}">👤 ${job.employeeName.split(' ')[0]}</div>
            ${alarmHtml}
            <div class="resize-handle"></div>
        </div>`;
    });

    html += `</div></div>`;
    return html;
}

// ... (Rest of utility functions: setupInteractions, dblClickListeners, etc. remain the same) ...
// INCLUDING ALL PREVIOUS LOGIC BELOW:

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
            const newTop = Math.max(0, initialTop + snappedDeltaY);
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

        const startTotalMinutes = currentTop;
        const durationMinutes = currentHeight;

        activeEl.style.visibility = 'hidden';
        const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
        activeEl.style.visibility = 'visible';

        const targetCol = elemBelow ? elemBelow.closest('.calendar-day-col') : null;

        if (targetCol && targetCol.dataset.date) {
            const targetDateStr = targetCol.dataset.date;
            const hours = Math.floor(startTotalMinutes / 60);
            const minutes = startTotalMinutes % 60;
            const newStart = new Date(`${targetDateStr}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`);
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
        let clickedHour = hourIndex % 24;
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
    if (view === 'day') { currentDate = new Date(); }
    else { currentDate = normalizeDate(currentDate, currentView); }
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

function triggerLateAlert(job) {
    console.log(`ALARM: ${job.employeeName} is late for ${job.accountName}`);
    alertSound.play().catch(e => console.warn("Audio play blocked:", e));
    if (Notification.permission === "granted") {
        new Notification("MISSED CHECK-IN!", { body: `${job.employeeName} late.` });
    }
    sendEmailAlert(job);
}

function sendEmailAlert(job) {
    if (typeof emailjs === 'undefined') return console.error("EmailJS not loaded in index.html");
    const recipient = (schedulerSettings && schedulerSettings.smsEmail) ? schedulerSettings.smsEmail : job.owner;
    const templateParams = {
        employee: job.employeeName,
        location: job.accountName,
        time: job.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        to_email: recipient
    };
    emailjs.send('service_k7z8j0n', 'template_najzv28', templateParams)
        .then(() => window.showToast(`Alert sent to ${recipient}`),
              () => window.showToast("Failed to send alert."));
}

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