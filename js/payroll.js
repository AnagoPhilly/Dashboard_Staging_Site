// js/payroll.js

let payrollStart = new Date();
// Default to the 1st of the current month
payrollStart.setDate(1);
payrollStart.setHours(0,0,0,0);

let payrollEnd = new Date();
// Default to today
payrollEnd.setHours(23,59,59,999);

async function loadPayroll() {
    console.log("CleanDash: Loading Payroll...");
    const container = document.getElementById('payrollTableContainer');
    const totalDisplay = document.getElementById('totalPayrollCost');

    container.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">Calculating hours and wages...</div>';

    // Update Date Inputs to match state
    document.getElementById('payStart').valueAsDate = payrollStart;
    document.getElementById('payEnd').valueAsDate = payrollEnd;

    if (!window.currentUser) return;

    try {
        const ownerEmail = window.currentUser.email;

        // 1. Fetch Employees (Active & Inactive - we need to pay people who left too)
        const empSnap = await db.collection('employees').where('owner', '==', ownerEmail).get();
        const employees = {};
        empSnap.forEach(doc => {
            employees[doc.id] = { ...doc.data(), hours: 0, shifts: 0, totalPay: 0 };
        });

        // 2. Fetch Completed Jobs in Date Range
        // Firestore doesn't allow filtering by date AND owner easily without composite index.
        // We will fetch by Owner + Status, then filter date client-side for flexibility.
        const jobsSnap = await db.collection('jobs')
            .where('owner', '==', ownerEmail)
            .where('status', '==', 'Completed')
            .get();

        let grandTotal = 0;

        jobsSnap.forEach(doc => {
            const job = doc.data();
            const jobEnd = job.actualEndTime.toDate();

            // Date Filter
            if (jobEnd >= payrollStart && jobEnd <= payrollEnd) {
                const empId = job.employeeId;
                if (employees[empId]) {
                    const start = job.actualStartTime.toDate();
                    const end = job.actualEndTime.toDate();

                    // Calculate Hours (ms -> hours)
                    const durationHrs = (end - start) / (1000 * 60 * 60);

                    employees[empId].hours += durationHrs;
                    employees[empId].shifts += 1;

                    // Calculate Pay
                    const wage = employees[empId].wage || 0;
                    const pay = durationHrs * wage;

                    employees[empId].totalPay += pay;
                    grandTotal += pay;
                }
            }
        });

        // 3. Render Table
        let html = `<table class="data-table">
            <thead>
                <tr>
                    <th>Employee</th>
                    <th style="text-align:center;">Shifts</th>
                    <th style="text-align:right;">Total Hours</th>
                    <th style="text-align:right;">Wage</th>
                    <th style="text-align:right;">Gross Pay</th>
                </tr>
            </thead>
            <tbody>`;

        const sortedIds = Object.keys(employees).sort((a,b) => employees[a].name.localeCompare(employees[b].name));
        let hasData = false;

        sortedIds.forEach(id => {
            const e = employees[id];
            if (e.shifts > 0) { // Only show employees with activity
                hasData = true;
                html += `<tr>
                    <td style="font-weight:600;">${e.name} <div style="font-size:0.8rem; color:#6b7280;">${e.role}</div></td>
                    <td style="text-align:center;">${e.shifts}</td>
                    <td style="text-align:right;">${e.hours.toFixed(2)} hrs</td>
                    <td style="text-align:right;">$${e.wage.toFixed(2)}</td>
                    <td style="text-align:right; font-weight:700; color:#0d9488;">$${e.totalPay.toFixed(2)}</td>
                </tr>`;
            }
        });

        if (!hasData) {
            html = '<div style="text-align:center; padding:3rem; color:#6b7280;">No completed shifts found in this date range.</div>';
        } else {
            html += '</tbody></table>';
        }

        container.innerHTML = html;
        totalDisplay.textContent = '$' + grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

    } catch (err) {
        console.error("Error loading payroll:", err);
        container.innerHTML = '<div style="color:red; text-align:center;">Error loading payroll data.</div>';
    }
}

// Filter Logic
window.updatePayrollDates = function() {
    const startVal = document.getElementById('payStart').value;
    const endVal = document.getElementById('payEnd').value;

    if(startVal) payrollStart = new Date(startVal);
    if(endVal) {
        payrollEnd = new Date(endVal);
        payrollEnd.setHours(23,59,59,999); // End of that day
    }

    loadPayroll();
};

window.exportPayrollCSV = function() {
    // Basic CSV export logic could go here later
    alert("CSV Export coming in v1.2!");
};

window.loadPayroll = loadPayroll;