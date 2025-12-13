// js/scheduler.js

// --- CALENDAR STATE & CONFIGURATION ---
let currentView = 'week';
let currentDate = new Date();
let alertedJobs = new Set();
const alertSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
const HOURS_TO_RENDER = 30;

// GLOBAL SETTINGS CACHE
let schedulerSettings = {};

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
        const [userDoc, jobs, accountsSnap] = await Promise.all([
            db.collection('users').doc(window.currentUser.uid).get(),
            fetchJobs(),
            db.collection('accounts').where('owner', '==', window.currentUser.email).get()
        ]);

        const accountAlarms = {};
        accountsSnap.forEach(doc => {
            const data = doc.data();
            if(data.alarmCode) accountAlarms[doc.id] = data.alarmCode;
        });

        schedulerSettings = userDoc.exists ? userDoc.data() : {};

        const alertThreshold = schedulerSettings.alertThreshold || 15;
        const emailDelayMinutes = schedulerSettings.emailDelayMinutes || 60;
        const emailAlertsEnabled = (schedulerSettings.emailAlertsEnabled === undefined) ? true : schedulerSettings.emailAlertsEnabled;

        updateHeaderUI();

        const alertControls = document.getElementById('alertControls');
        if(alertControls) alertControls.style.display = 'flex';

        const delayInput = document.getElementById('editEmailDelay');
        if(delayInput) delayInput.value = emailDelayMinutes;

        const enabledInput = document.getElementById('editEmailEnabled');
        if(enabledInput) enabledInput.checked = emailAlertsEnabled;

        if (currentView === 'week') {
            renderWeekView(jobs, alertThreshold, emailDelayMinutes, emailAlertsEnabled, accountAlarms);
        } else if (currentView === 'day') {
            renderDayView(jobs, alertThreshold, emailDelayMinutes, emailAlertsEnabled, accountAlarms);
        } else if (currentView === 'month') {
            renderMonthView(jobs, alertThreshold, emailDelayMinutes, emailAlertsEnabled, accountAlarms);
        }

        if (currentView !== 'month') {
             setTimeout(() => {
                 if(container) container.scrollTop = 1020;
             }, 100);
        }

        // --- ATTACH LISTENERS ---
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

    let iterator = new Date(firstDay);
    iterator.setDate(iterator.getDate() - iterator.getDay());

    for(let i=0; i<42; i++) {
        const isCurrMonth = iterator.getMonth() === month;
        const dateStr = iterator.toISOString().split('T')[0];
        const dayJobs = jobs.filter(j => isSameDay(j.start, iterator));

        if (!isCurrMonth && iterator > lastDay && iterator.getDay() === 0) break;

        html += `<div class="month-day ${isCurrMonth ? '' : 'other-month'}" onclick="window.showAssignShiftModal('17:00', '${dateStr}')">
            <div class="month-date-num">${iterator.getDate()}</div>
            <div class="month-events">`;

        dayJobs.forEach(job => {
            let statusClass = 'month-event';
            if(job.status === 'Completed') statusClass += ' done';
            else if(job.status === 'Started') statusClass += ' active';
            else {
                 if (new Date() > new Date(job.start.getTime() + alertThreshold*60000)) statusClass += ' late';
            }

            const alarmIndicator = accountAlarms[job.accountId] ? '🔒' : '';

            html += `<div class="${statusClass}" onclick="event.stopPropagation(); editJob({id:'${job.id}'})">
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
        let label = '';

        if (displayH === 0) label = '12 AM';
        else if (displayH < 12) label = `${displayH} AM`;
        else if (displayH === 12) label = '12 PM';
        else label = `${displayH - 12} PM`;

        if (h >= 24) label += ' <span style="font-size:0.6rem; display:block; opacity:0.6;">(+1)</span>';

        html += `<div class="time-slot" data-hour-index="${h}">${label}</div>`;
    }
    html += '</div>';
    return html;
}

function renderDayColumn(dateObj, jobs, alertThreshold, emailDelay, emailEnabled, isSingleDay = false, accountAlarms = {}) {
    const dateStr = dateObj.toISOString().split('T')[0];
    const displayDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });

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

    let html = `<div class="calendar-day-col" style="${isSingleDay ? 'flex:1;' : ''}" data-date="${dateStr}">`;
    html += `<div class="cal-header">${displayDate}</div>`;
    html += `<div class="day-slots">`;

    const now = new Date();

    dayJobs.forEach(job => {
        const startHour = job.start.getHours() + (job.start.getMinutes() / 60);
        let endHour = job.end.getHours() + (job.end.getMinutes() / 60);

        if (job.end.getDate() !== job.start.getDate()) {
            endHour += 24;
        }

        let duration = endHour - startHour;
        if(duration < 0.5) duration = 0.5;

        const topPx = startHour * 60;
        const heightPx = Math.max(duration * 60, 25);

        const leftPos = 3 + (job.colIndex * colWidth);

        let statusClass = 'day-event';
        let statusIcon = '';

        if (job.status === 'Completed') {
            statusClass += ' done';
            statusIcon = '✅';
        } else if (job.status === 'Started') {
            statusClass += ' active';
            statusIcon = '🔄';
        } else {
            const lateTime = new Date(job.start.getTime() + alertThreshold * 60000);
            if (now > lateTime) {
                statusClass += ' late';
                statusIcon = '⚠️';
                if (emailEnabled && job.status === 'Scheduled') {
                     const emailTriggerTime = new Date(job.start.getTime() + emailDelay * 60000);
                     if (now > emailTriggerTime && !alertedJobs.has(job.id)) {
                         triggerLateAlert(job);
                         alertedJobs.add(job.id);
                     }
                }
            } else {
                statusClass += ' scheduled';
            }
        }

        const alarmCode = accountAlarms[job.accountId];
        const alarmHtml = alarmCode ? `<div class="event-meta" style="color:#ef4444; font-weight:bold;">🚨 ${alarmCode}</div>` : '';

        html += `
        <div class="${statusClass}"
             style="top:${topPx}px; height:${heightPx}px; width:${colWidth}%; left:${leftPos}%;"
             onclick="event.stopPropagation(); editJob({ id: '${job.id}' })"
             title="${job.accountName} - ${job.employeeName}">
            <div class="event-time">${formatTime(job.start)} - ${formatTime(job.end)}</div>
            <div class="event-title">${statusIcon} ${job.accountName}</div>
            <div class="event-meta">👤 ${job.employeeName.split(' ')[0]}</div>
            ${alarmHtml}
        </div>`;
    });

    html += `</div></div>`;
    return html;
}

// --- ROW HIGHLIGHTER (Illuminates Time Column) ---

function attachRowHighlighter() {
    const grid = document.getElementById('schedulerGrid');

    // Remove old listeners to prevent duplicates
    if (grid._highlightHandler) {
        grid.removeEventListener('mousemove', grid._highlightHandler);
        grid.removeEventListener('mouseleave', grid._clearHighlightHandler);
    }

    // Handler for mouse movement
    const moveHandler = function(e) {
        const firstSlot = document.querySelector('.time-slot[data-hour-index="0"]');
        if (!firstSlot) return;

        const rect = firstSlot.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;

        if (offsetY < 0) {
            clearHighlights();
            return;
        }

        const index = Math.floor(offsetY / 60);

        if (grid._lastHighlightIndex === index) return;
        grid._lastHighlightIndex = index;

        clearHighlights();

        const target = document.querySelector(`.time-slot[data-hour-index="${index}"]`);
        if (target) {
            target.classList.add('active-time');
        }
    };

    const clearHighlights = function() {
        document.querySelectorAll('.time-slot.active-time').forEach(el => {
            el.classList.remove('active-time');
        });
        grid._lastHighlightIndex = -1;
    };

    grid._highlightHandler = moveHandler;
    grid._clearHighlightHandler = clearHighlights;

    grid.addEventListener('mousemove', moveHandler);
    grid.addEventListener('mouseleave', clearHighlights);
}

// --- DOUBLE-CLICK LISTENER FUNCTION ---

function attachDblClickListeners() {
    document.querySelectorAll('.calendar-day-col').forEach(dayCol => {
        dayCol.removeEventListener('dblclick', dblClickHandler);
        dayCol.addEventListener('dblclick', dblClickHandler);
    });
}

function dblClickHandler(event) {
    if (event.target.closest('.day-event')) return;

    const slotHeight = 60;
    const daySlots = this.querySelector('.day-slots');
    if (!daySlots) return;

    const yOffset = event.clientY - daySlots.getBoundingClientRect().top;
    const hourIndex = Math.floor(yOffset / slotHeight);
    let clickedHour = hourIndex % 24;

    const formattedTime = `${String(clickedHour).padStart(2, '0')}:00`;
    const date = this.getAttribute('data-date');

    if (typeof window.showAssignShiftModal === 'function') {
        window.showAssignShiftModal(formattedTime, date);
    } else {
        console.error("showAssignShiftModal function is missing!");
    }
}

// --- UTILS ---

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

// --- UPDATED VIEW CHANGER ---
window.changeView = function(view) {
    currentView = view;
    // CRITICAL UPDATE: If switching to 'day', always jump to TODAY
    if (view === 'day') {
        currentDate = new Date();
    } else {
        currentDate = normalizeDate(currentDate, currentView);
    }
    loadScheduler();
};

window.changePeriod = function(direction) {
    if (currentView === 'day') {
        currentDate.setDate(currentDate.getDate() + direction);
    } else if (currentView === 'week') {
        currentDate.setDate(currentDate.getDate() + (direction * 7));
    } else if (currentView === 'month') {
        currentDate.setMonth(currentDate.getMonth() + direction);
    }
    loadScheduler();
};

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toIsoString(date) {
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// --- ALERTING ---

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

    const recipient = (schedulerSettings && schedulerSettings.smsEmail)
        ? schedulerSettings.smsEmail
        : job.owner;

    console.log(`Sending alert to: ${recipient}`);

    const templateParams = {
        employee: job.employeeName,
        location: job.accountName,
        time: job.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        to_email: recipient
    };

    const SERVICE_ID = 'service_k7z8j0n';
    const TEMPLATE_ID = 'template_najzv28';

    emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams)
        .then(function(response) {
            console.log('SUCCESS!', response.status, response.text);
            window.showToast(`Alert sent to ${recipient}`);
        }, function(error) {
            console.log('FAILED...', error);
            window.showToast("Failed to send alert.");
        });
}

window.saveScheduleSettings = async function() {
    if (!window.currentUser) return;
    const emailDelayMinutes = parseInt(document.getElementById('editEmailDelay').value) || 60;
    const emailAlertsEnabled = document.getElementById('editEmailEnabled').checked;
    await db.collection('users').doc(window.currentUser.uid).set({ emailDelayMinutes, emailAlertsEnabled }, { merge: true });
    window.showToast("Settings updated!");
    loadScheduler();
};

// --- RECURRENCE UI TOGGLES ---

window.toggleRecurrenceOptions = function() {
    const isChecked = document.getElementById('shiftRepeat').checked;
    const container = document.getElementById('recurrenceOptions');
    container.style.display = isChecked ? 'block' : 'none';
};

window.toggleRecurrenceDay = function(btn) {
    btn.classList.toggle('selected');
};

// --- MODAL & CRUD FUNCTIONS ---

async function populateDropdowns() {
    const accSelect = document.getElementById('shiftAccount');
    const empSelect = document.getElementById('shiftEmployee');
    const startSelect = document.getElementById('shiftStartTime');
    const endSelect = document.getElementById('shiftEndTime');

    const actStartSelect = document.getElementById('actStartTime');
    const actEndSelect = document.getElementById('actEndTime');

    if (!accSelect || !empSelect || !startSelect || !endSelect) return;

    // Populate Time Selects
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

        fill(startSelect);
        fill(endSelect);
        fill(actStartSelect);
        fill(actEndSelect);

        // Auto-set End Time +1hr logic
        const autoInc = function(source, target) {
             const val = source.value;
             if(!val) return;
             let [h, m] = val.split(':').map(Number);
             h = (h + 1) % 24;
             const nextVal = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
             if(target) target.value = nextVal;
        };

        startSelect.addEventListener('change', () => autoInc(startSelect, endSelect));
        if(actStartSelect) actStartSelect.addEventListener('change', () => autoInc(actStartSelect, actEndSelect));
    }

    // Populate Accounts/Employees
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

// Global modal function (used by double-click)
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

    // Clear manual section
    document.getElementById('actDate').value = '';
    document.getElementById('actStartTime').value = '';
    document.getElementById('actEndTime').value = '';

    await populateDropdowns();

    if (dateStr) {
        document.getElementById('shiftStartDate').value = dateStr;
    } else {
        document.getElementById('shiftStartDate').value = new Date().toISOString().split('T')[0];
    }

    document.getElementById('shiftStartTime').value = startTime;

    let [h, m] = startTime.split(':').map(Number);
    h = (h + 1) % 24;
    const nextVal = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    document.getElementById('shiftEndTime').value = nextVal;
};

// Backward compatibility wrapper
window.openShiftModal = function(dateObj) {
    const dateStr = dateObj.toISOString().split('T')[0];
    window.showAssignShiftModal("17:00", dateStr);
};


window.editJob = async function(job) {
    if(!job.start) {
        const doc = await db.collection('jobs').doc(job.id).get();
        const data = doc.data();
        job = {
            id: doc.id, ...data,
            start: data.startTime.toDate(),
            end: data.endTime.toDate(),
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
    const getYMD = (d) => d.toISOString().split('T')[0];

    document.getElementById('shiftStartDate').value = getYMD(job.start);
    document.getElementById('shiftStartTime').value = getHM(job.start);
    document.getElementById('shiftEndTime').value = getHM(job.end);

    if(job.actStart) {
        document.getElementById('actDate').value = getYMD(job.actStart);
        document.getElementById('actStartTime').value = getHM(job.actStart);
    } else {
        document.getElementById('actDate').value = '';
        document.getElementById('actStartTime').value = '';
    }

    if(job.actEnd) {
        document.getElementById('actEndTime').value = getHM(job.actEnd);
    } else {
        document.getElementById('actEndTime').value = '';
    }
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

    if (!accSelect.value || !empSelect.value || !sDate || !sTime || !eTime) {
        return alert("Required fields missing.");
    }

    const btn = document.querySelector('#shiftModal .btn-primary');
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
        const batch = db.batch();
        const baseStart = new Date(`${sDate}T${sTime}:00`);
        let baseEnd = new Date(`${sDate}T${eTime}:00`);

        if (baseEnd <= baseStart) {
            baseEnd.setDate(baseEnd.getDate() + 1);
        }

        const durationMs = baseEnd - baseStart;

        if (!isRepeat || id) {
            const data = {
                accountId: accSelect.value,
                accountName: accSelect.options[accSelect.selectedIndex].text,
                employeeId: empSelect.value,
                employeeName: empSelect.options[empSelect.selectedIndex].text,
                startTime: firebase.firestore.Timestamp.fromDate(baseStart),
                endTime: firebase.firestore.Timestamp.fromDate(baseEnd),
                status: status,
                owner: window.currentUser.email
            };

            const actSDate = document.getElementById('actDate').value;
            const actSTime = document.getElementById('actStartTime').value;
            const actETime = document.getElementById('actEndTime').value;

            if(actSDate && actSTime) {
                const manualStart = new Date(`${actSDate}T${actSTime}:00`);
                data.actualStartTime = firebase.firestore.Timestamp.fromDate(manualStart);

                if(actETime) {
                    let manualEnd = new Date(`${actSDate}T${actETime}:00`);
                    if (manualEnd <= manualStart) {
                        manualEnd.setDate(manualEnd.getDate() + 1);
                    }
                    data.actualEndTime = firebase.firestore.Timestamp.fromDate(manualEnd);
                }
            }

            if (id) {
                await db.collection('jobs').doc(id).update(data);
                window.showToast("Shift Updated");
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('jobs').add(data);
                window.showToast("Shift Created");
            }

        } else {
            const repeatUntilVal = document.getElementById('shiftRepeatEnd').value;
            if (!repeatUntilVal) throw new Error("Please select a 'Repeat Until' date.");

            const repeatUntil = new Date(repeatUntilVal);
            repeatUntil.setHours(23, 59, 59);

            const selectedDays = [];
            document.querySelectorAll('.day-btn-circle.selected').forEach(btn => {
                selectedDays.push(parseInt(btn.dataset.day));
            });

            if (selectedDays.length === 0) throw new Error("Select at least one day for repetition.");

            let cursor = new Date(baseStart);
            let createdCount = 0;

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
                        status: 'Scheduled',
                        owner: window.currentUser.email,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    createdCount++;
                }
                cursor.setDate(cursor.getDate() + 1);
            }

            if (createdCount === 0) throw new Error("No shifts created. Check dates and selected days.");

            await batch.commit();
            window.showToast(`${createdCount} Shifts Created!`);
        }

        closeShiftModal();
        loadScheduler();

    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "Save Shift";
    }
};

window.deleteJobFromModal = async function() {
    const id = document.getElementById('shiftId').value;
    if(!confirm("Cancel this shift?")) return;
    await db.collection('jobs').doc(id).delete();
    closeShiftModal();
    loadScheduler();
};

window.closeShiftModal = function() { document.getElementById('shiftModal').style.display = 'none'; };

if (Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission();
}

window.loadScheduler = loadScheduler;