// js/metrics.js

let metricsChart = null;

function toggleMetricsInput() {
    const layout = document.getElementById('metricsLayout');
    const panel = document.getElementById('metricsInputPanel');
    
    if (panel.classList.contains('hidden')) {
        // Show it
        panel.classList.remove('hidden');
        layout.classList.remove('expanded-graph');
    } else {
        // Hide it
        panel.classList.add('hidden');
        layout.classList.add('expanded-graph');
    }
    
    // Trigger resize for Chart.js to fill space
    if (metricsChart) {
        setTimeout(() => metricsChart.resize(), 310);
    }
}

function generateMetricsGraph() {
    const rawInput = document.getElementById('metricsInput').value;
    if (!rawInput) return alert("Please paste your statement data first.");

    // 1. Parsing Logic
    const lines = rawInput.split('\n');
    const dataPoints = [];

    lines.forEach(line => {
        const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (dateMatch) {
            const dateStr = dateMatch[0];
            const textAfterDate = line.substring(line.indexOf(dateStr) + dateStr.length);
            const amountMatch = textAfterDate.match(/([\d,]+\.\d{2})/);
            
            if (amountMatch) {
                const amountClean = amountMatch[0].replace(/,/g, '');
                const amount = parseFloat(amountClean);
                
                const dateParts = dateStr.split('/');
                let year = parseInt(dateParts[2]);
                if (year < 100) year += 2000;
                const dateObj = new Date(year, parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
                
                if (!isNaN(amount)) {
                    dataPoints.push({ date: dateObj, value: amount, label: dateStr });
                }
            }
        }
    });

    if (dataPoints.length === 0) {
        alert("Could not find recognizable data. Make sure you copy columns containing Date and Amount.");
        return;
    }

    // 2. Sort & Prep
    dataPoints.sort((a, b) => a.date - b.date);
    const labels = dataPoints.map(d => d.label);
    const data = dataPoints.map(d => d.value);

    // 3. Auto-Hide Input Panel for "Discreet" View
    document.getElementById('metricsInputPanel').classList.add('hidden');
    document.getElementById('metricsLayout').classList.add('expanded-graph');

    // 4. Render Chart
    const ctx = document.getElementById('performanceChart').getContext('2d');
    if (metricsChart) metricsChart.destroy();

    metricsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Revenue Per Statement ($)',
                data: data,
                borderColor: '#0d9488',
                backgroundColor: 'rgba(13, 148, 136, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#0d9488',
                pointRadius: 4,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#f3f4f6' },
                    ticks: { callback: function(value) { return '$' + value.toLocaleString(); } }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function clearMetrics() {
    document.getElementById('metricsInput').value = '';
    // Show the input again so they can paste new data
    document.getElementById('metricsInputPanel').classList.remove('hidden');
    document.getElementById('metricsLayout').classList.remove('expanded-graph');
    
    if (metricsChart) {
        metricsChart.destroy();
        metricsChart = null;
    }
}

window.toggleMetricsInput = toggleMetricsInput;
window.generateMetricsGraph = generateMetricsGraph;
window.clearMetrics = clearMetrics;