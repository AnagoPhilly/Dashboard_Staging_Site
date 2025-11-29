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

        // 1. Fetch Employees (Active & Inactive)
        const empSnap = await db.collection('employees').where('owner', '==', ownerEmail).get();
        const employees = {};
        empSnap.forEach(doc => {
            // Initialize every employee with 0 hours
            employees[doc.id] = { ...doc.data(), hours: 0, shifts: 0, totalPay: 0 };
        });

        // 2. Fetch Completed Jobs in Date Range
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

                // Only add if employee still exists in our records
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

        if (sortedIds.length === 0) {
             html = '<div style="text-align:center; padding:3rem; color:#6b7280;">No employees found. Go to Team Management to add staff.</div>';
        } else {
            sortedIds.forEach(id => {
                const e = employees[id];

                // Show row if: They have shifts OR they are Active
                // (Hides inactive employees with 0 pay history for cleaner view)
                if (e.shifts > 0 || e.status === 'Active') {

                    // Formatting: Dim text if 0 hours
                    const rowStyle = e.shifts === 0 ? 'color:#6b7280;' : 'font-weight:600; color:#111827;';
                    const payStyle = e.shifts === 0 ? 'color:#9ca3af;' : 'color:#0d9488; font-weight:700;';

                    html += `<tr style="${rowStyle}">
                        <td>
                            <div>${e.name}</div>
                            <div style="font-size:0.8rem; opacity:0.8;">${e.role}</div>
                        </td>
                        <td style="text-align:center;">${e.shifts}</td>
                        <td style="text-align:right;">${e.hours.toFixed(2)} hrs</td>
                        <td style="text-align:right;">$${(e.wage || 0).toFixed(2)}</td>
                        <td style="text-align:right; ${payStyle}">$${e.totalPay.toFixed(2)}</td>
                    </tr>`;
                }
            });
            html += '</tbody></table>';
        }

        container.innerHTML = html;
        totalDisplay.textContent = '$' + grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

    } catch (err) {
        console.error("Error loading payroll:", err);
        container.innerHTML = '<div style="color:red; text-align:center;">Error loading payroll data. Check console for details.</div>';
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
    alert("CSV Export coming in v1.2!");
};

window.loadPayroll = loadPayroll;