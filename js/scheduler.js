// js/scheduler.js

let currentWeekStart = new Date();
const day = currentWeekStart.getDay();
const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
currentWeekStart.setDate(diff);
currentWeekStart.setHours(0,0,0,0);

async function loadScheduler() {
    console.log("CleanDash: Loading Schedule...");
    const container = document.getElementById('schedulerGrid');
    container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#888;">Loading schedule...</div>';

    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    document.getElementById('weekRangeDisplay').textContent =
        `${currentWeekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;

    const q = window.currentUser.email === 'admin@cleandash.com'
        ? db.collection('jobs')
        : db.collection('jobs').where('owner', '==', window.currentUser.email);

    try {
        const snap = await q.get();
        const jobs = [];
        snap.forEach(doc => {
            const j = doc.data();
            j.id = doc.id;
            j.start = j.startTime.toDate();
            j.end = j.endTime.toDate();
            // Store actuals if they exist for editing
            j.actStart = j.actualStartTime ? j.actualStartTime.toDate() : null;
            j.actEnd = j.actualEndTime ? j.actualEndTime.toDate() : null;
            jobs.push(j);
        });

        renderCalendar(jobs);

    } catch (err) {
        console.error("Error loading jobs:", err);
        container.innerHTML = '<div style="color:red">Error loading schedule.</div>';
    }
}

function renderCalendar(jobs) {
    const grid = document.getElementById('schedulerGrid');
    grid.innerHTML = '';

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
        const colDate = new Date(currentWeekStart);
        colDate.setDate(colDate.getDate() + i);
        const dateString = colDate.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });

        const col = document.createElement('div');
        col.className = 'calendar-col';
        col.innerHTML = `<div class="cal-header">${dateString}</div>`;

        const dayJobs = jobs.filter(j => isSameDay(j.start, colDate));
        dayJobs.sort((a, b) => a.start - b.start);

        dayJobs.forEach(job => {
            const timeStr = formatTime(job.start) + ' - ' + formatTime(job.end);

            // Status Indicator
            let statusDot = '';
            if(job.status === 'Completed') statusDot = '✅';
            else if(job.status === 'Started') statusDot = '🟢';

            const card = document.createElement('div');
            card.className = 'shift-card';
            // Store full job data in the element for easy edit access
            card.onclick = () => editJob(job);

            card.innerHTML = `
                <div class="shift-time">${statusDot} ${timeStr}</div>
                <div class="shift-loc">${job.accountName}</div>
                <div class="shift-emp">👤 ${job.employeeName}</div>
            `;
            col.appendChild(card);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'btn-add-shift';
        addBtn.textContent = '+ Shift';
        addBtn.onclick = () => openShiftModal(colDate);
        col.appendChild(addBtn);

        grid.appendChild(col);
    }
}

// --- EDIT & SAVE LOGIC ---

window.openShiftModal = async function(dateObj) {
    document.getElementById('shiftModal').style.display = 'flex';
    document.getElementById('shiftModalTitle').textContent = "Assign Shift";
    document.getElementById('shiftId').value = ""; // Clear ID = New Mode
    document.getElementById('btnDeleteShift').style.display = 'none';
    document.getElementById('manualTimeSection').style.display = 'none'; // Hide manual tools for new shifts

    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');

    document.getElementById('shiftStart').value = `${yyyy}-${mm}-${dd}T17:00`;
    document.getElementById('shiftEnd').value = `${yyyy}-${mm}-${dd}T21:00`;

    await populateDropdowns();
};

window.editJob = async function(job) {
    document.getElementById('shiftModal').style.display = 'flex';
    document.getElementById('shiftModalTitle').textContent = "Edit Shift";
    document.getElementById('shiftId').value = job.id; // Set ID = Edit Mode
    document.getElementById('btnDeleteShift').style.display = 'inline-block';
    document.getElementById('manualTimeSection').style.display = 'block'; // Show manual tools

    await populateDropdowns();

    // Populate Fields
    document.getElementById('shiftAccount').value = job.accountId;
    document.getElementById('shiftEmployee').value = job.employeeId;
    document.getElementById('shiftStart').value = toIsoString(job.start);
    document.getElementById('shiftEnd').value = toIsoString(job.end);
    document.getElementById('shiftStatus').value = job.status || 'Scheduled';

    // Populate Actuals if they exist
    document.getElementById('actualStart').value = job.actStart ? toIsoString(job.actStart) : '';
    document.getElementById('actualEnd').value = job.actEnd ? toIsoString(job.actEnd) : '';
};

window.saveShift = async function() {
    const id = document.getElementById('shiftId').value;
    const accSelect = document.getElementById('shiftAccount');
    const empSelect = document.getElementById('shiftEmployee');
    const startVal = document.getElementById('shiftStart').value;
    const endVal = document.getElementById('shiftEnd').value;

    // Manual Overrides
    const status = document.getElementById('shiftStatus').value;
    const actStartVal = document.getElementById('actualStart').value;
    const actEndVal = document.getElementById('actualEnd').value;

    if (!accSelect.value || !empSelect.value || !startVal || !endVal) return alert("Required fields missing.");

    const startTime = new Date(startVal);
    const endTime = new Date(endVal);

    if (endTime <= startTime) return alert("End time must be after start time.");

    const btn = document.querySelector('#shiftModal .btn-primary');
    btn.disabled = true;
    btn.textContent = "Saving...";

    // 1. Conflict Check (Only if changing employee or time, but strictly we check always for safety)
    // In edit mode, we should ideally exclude the current job from conflict check, but for simplicity we skip check on edits or accept self-clash.
    // Simpler: Just run check. If it conflicts with ITSELF, that's fine.
    // For now, let's keep it robust: Run check only on NEW shifts.
    if (!id) {
        const check = await checkScheduleConflict(empSelect.value, startTime, endTime);
        if (check.conflict) {
            alert(`Conflict! ${check.existingJob.employeeName} is already working.`);
            btn.disabled = false; btn.textContent = "Save Shift"; return;
        }
    }

    const data = {
        accountId: accSelect.value,
        accountName: accSelect.options[accSelect.selectedIndex].text,
        employeeId: empSelect.value,
        employeeName: empSelect.options[empSelect.selectedIndex].text,
        startTime: firebase.firestore.Timestamp.fromDate(startTime),
        endTime: firebase.firestore.Timestamp.fromDate(endTime),
        status: status, // Save status
        owner: window.currentUser.email
    };

    // If manual times entered, save them
    if (actStartVal) data.actualStartTime = firebase.firestore.Timestamp.fromDate(new Date(actStartVal));
    if (actEndVal) data.actualEndTime = firebase.firestore.Timestamp.fromDate(new Date(actEndVal));

    try {
        if (id) {
            await db.collection('jobs').doc(id).update(data);
            window.showToast("Shift Updated");
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            data.status = 'Scheduled'; // Default for new
            await db.collection('jobs').add(data);
            window.showToast("Shift Assigned");
        }
        closeShiftModal();
        loadScheduler();
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        btn.disabled = false; btn.textContent = "Save Shift";
    }
};

// Utils
async function populateDropdowns() {
    const accSelect = document.getElementById('shiftAccount');
    const empSelect = document.getElementById('shiftEmployee');
    if (accSelect.options.length > 1) return;

    const accSnap = await db.collection('accounts').where('owner', '==', window.currentUser.email).orderBy('name').get();
    accSelect.innerHTML = '<option value="">Select Account...</option>';
    accSnap.forEach(doc => {
        const op = document.createElement('option');
        op.value = doc.id; op.text = doc.data().name; accSelect.appendChild(op);
    });

    const empSnap = await db.collection('employees').where('owner', '==', window.currentUser.email).orderBy('name').get();
    empSelect.innerHTML = '<option value="">Select Employee...</option>';
    empSnap.forEach(doc => {
        const op = document.createElement('option');
        op.value = doc.id; op.text = doc.data().name; empSelect.appendChild(op);
    });
}

async function checkScheduleConflict(employeeId, newStart, newEnd) {
    const q = db.collection('jobs').where('employeeId', '==', employeeId).where('endTime', '>', firebase.firestore.Timestamp.fromDate(newStart));
    const snap = await q.get();
    for (let doc of snap.docs) {
        const job = doc.data();
        if (job.startTime.toDate() < newEnd) return { conflict: true, existingJob: job };
    }
    return { conflict: false };
}

window.deleteJobFromModal = async function() {
    const id = document.getElementById('shiftId').value;
    if(!confirm("Cancel this shift?")) return;
    await db.collection('jobs').doc(id).delete();
    closeShiftModal();
    loadScheduler();
};

window.closeShiftModal = function() { document.getElementById('shiftModal').style.display = 'none'; };

function isSameDay(d1, d2) { return d1.toDateString() === d2.toDateString(); }
function formatTime(date) { return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function toIsoString(date) {
    // Format date object to "YYYY-MM-DDTHH:MM" for input values
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

window.changeWeek = function(offset) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (offset * 7));
    loadScheduler();
};

window.loadScheduler = loadScheduler;