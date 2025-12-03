// js/metrics.js

let metricsChart = null;

function toggleMetricsInput() {
    const layout = document.getElementById('metricsLayout');
    const panel = document.getElementById('metricsInputPanel');
    
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        layout.classList.remove('expanded-graph');
    } else {
        panel.classList.add('hidden');
        layout.classList.add('expanded-graph');
    }

    if (metricsChart) {
        setTimeout(() => metricsChart.resize(), 310);
    }
}

// --- HELPER: ROBUST DATE PARSING ---
function parseDateSafe(input) {
    if (!input) return null;
    // Handle Firestore Timestamp
    if (input.toDate && typeof input.toDate === 'function') {
        return input.toDate();
    }
    // Handle String YYYY-MM-DD
    if (typeof input === 'string') {
        // Append time to prevent timezone off-by-one errors
        return new Date(input + 'T00:00:00');
    }
    // Handle JS Date object
    if (input instanceof Date) {
        return input;
    }
    return null;
}

// --- MAIN GRAPHING FUNCTION ---
async function generateMetricsGraphFromDB() {
    if(!window.currentUser) return alert("Please log in.");

    // UI Feedback
    const btn = document.querySelector('button[onclick="generateMetricsGraphFromDB()"]');
    const originalText = btn ? btn.textContent : '';
    if(btn) { btn.textContent = "Calculating..."; btn.disabled = true; }

    try {
        // 1. Fetch ALL accounts (Active AND Inactive) to see full history
        const snap = await db.collection('accounts')
            .where('owner', '==', window.currentUser.email)
            .get();

        if (snap.empty) {
            if(btn) { btn.textContent = originalText; btn.disabled = false; }
            return alert("No accounts found to graph.");
        }

        const accounts = [];
        snap.forEach(doc => {
            const data = doc.data();
            // Clean Revenue (remove $ or ,)
            let rev = data.revenue;
            if (typeof rev === 'string') rev = parseFloat(rev.replace(/[$,]/g, ''));
            if (!rev || isNaN(rev)) rev = 0;

            accounts.push({
                name: data.name,
                revenue: rev,
                start: parseDateSafe(data.startDate),
                end: parseDateSafe(data.endDate)
            });
        });

        // 2. Setup Timeline: Last 12 Months -> Next 12 Months
        const today = new Date();
        const labels = [];
        const dataPoints = [];
        const colors = []; // To visually distinguish past vs future

        // Loop from -12 to +12 months
        for (let i = -12; i <= 12; i++) {
            // Determine the specific month we are calculating
            const targetMonth = new Date(today.getFullYear(), today.getMonth() + i, 1);

            // Define the "Window" of this month (1st to Last Day)
            const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
            const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0); // Last day of month

            // Label Format: "Nov 25"
            labels.push(monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));

            // 3. Calculate Revenue for this specific month
            let monthlyTotal = 0;

            accounts.forEach(acc => {
                if (!acc.start) return; // Skip if no start date

                // LOGIC: Did the account exist during this month?
                // It must have started BEFORE the month ended.
                // AND
                // It must have ended AFTER the month started (or have no end date).

                const hasStarted = acc.start <= monthEnd;
                const hasNotEnded = (!acc.end) || (acc.end >= monthStart);

                if (hasStarted && hasNotEnded) {
                    monthlyTotal += acc.revenue;
                }
            });

            dataPoints.push(monthlyTotal);

            // Visual: Future months get a slightly different look (handled in chart options or just context)
            // For now we calculate pure data.
        }

        renderChart(labels, dataPoints);

        // Auto-expand view
        const panel = document.getElementById('metricsInputPanel');
        if(panel) panel.classList.add('hidden');
        document.getElementById('metricsLayout').classList.add('expanded-graph');

    } catch (e) {
        console.error(e);
        alert("Error generating graph: " + e.message);
    } finally {
        if(btn) { btn.textContent = originalText; btn.disabled = false; }
    }
}

function renderChart(labels, data) {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    if (metricsChart) metricsChart.destroy();

    // Stats: Current Month is index 12 (since we started at -12)
    const currentMonthIndex = 12;
    const currentVal = data[currentMonthIndex];
    const maxVal = Math.max(...data);
    const avgVal = data.reduce((a,b)=>a+b,0) / data.length;

    // Show Stats Bar
    const statsDiv = document.getElementById('metricsStats');
    if(statsDiv) statsDiv.style.display = 'flex';
    if(document.getElementById('statTotal')) document.getElementById('statTotal').textContent = '$' + currentVal.toLocaleString();
    if(document.getElementById('statHigh')) document.getElementById('statHigh').textContent = '$' + maxVal.toLocaleString();
    if(document.getElementById('statAvg')) document.getElementById('statAvg').textContent = '$' + avgVal.toLocaleString(undefined,{maximumFractionDigits:0});

    // Gradient Background
    let gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(13, 148, 136, 0.4)'); // Primary Teal
    gradient.addColorStop(1, 'rgba(13, 148, 136, 0.0)');

    metricsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Monthly Recurring Revenue',
                data: data,
                borderColor: '#0d9488',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#0f766e',
                pointRadius: (ctx) => {
                    // Highlight "Today" (Index 12) with a larger dot
                    return ctx.dataIndex === currentMonthIndex ? 8 : 4;
                },
                pointHoverRadius: 8,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1f2937',
                    bodyColor: '#1f2937',
                    borderColor: '#e5e7eb',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        title: (items) => {
                            const idx = items[0].dataIndex;
                            const status = idx < 12 ? '(Historical)' : (idx === 12 ? '(Current)' : '(Projected)');
                            return `${items[0].label} ${status}`;
                        },
                        label: function(context) {
                            return ' Revenue: ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                        }
                    }
                },
                annotation: {
                    // (Optional) If we added chartjs-plugin-annotation, we could draw a vertical line at index 12
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#f3f4f6', borderDash: [5, 5] },
                    ticks: {
                        font: { size: 11 },
                        callback: function(value) { return '$' + (value/1000) + 'k'; }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                }
            }
        }
    });
}

// 1. LEGACY MANUAL INPUT (Kept for backwards compatibility)
function generateMetricsGraph() {
    alert("Please use the 'Load Graph from My Accounts' button for accurate tracking.");
}

function clearMetrics() {
    document.getElementById('metricsInput').value = '';
    document.getElementById('metricsInputPanel').classList.remove('hidden');
    document.getElementById('metricsLayout').classList.remove('expanded-graph');
    if (metricsChart) metricsChart.destroy();
    document.getElementById('metricsStats').style.display = 'none';
}

// Exports
window.toggleMetricsInput = toggleMetricsInput;
window.generateMetricsGraph = generateMetricsGraph;
window.generateMetricsGraphFromDB = generateMetricsGraphFromDB;
window.clearMetrics = clearMetrics;