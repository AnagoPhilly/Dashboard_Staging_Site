// js/pnl.js

let allAccounts = [];

function loadPnL() {
  console.log("CleanDash: Loading P&L...");
  const container = document.getElementById('accountsContainer');
  
  if (!container) {
      console.error("CleanDash: Accounts container not found!");
      return;
  }

  container.innerHTML = '<p style="text-align:center;padding:2rem;color:#888;">Loading accounts...</p>';

  if (!window.currentUser) {
      console.warn("CleanDash: No user logged in.");
      container.innerHTML = '<p style="text-align:center;padding:2rem;color:#888;">Please login to view data.</p>';
      return;
  }

  // Determine query based on user role
  const q = window.currentUser.email === 'admin@cleandash.com'
    ? db.collection('accounts')
    : db.collection('accounts').where('owner', '==', window.currentUser.email);

  q.orderBy('name').get().then(snap => {
    allAccounts = [];
    container.innerHTML = '';
    
    // Ensure hidden sections are handled if no data exists
    if (snap.empty) {
      container.innerHTML = '<p style="text-align:center;padding:3rem;color:#888;font-size:1.3rem;">No accounts found.</p>';
      document.getElementById('grandTotal').style.display = 'none';
      document.getElementById('financialScorecard').style.display = 'none';
      document.getElementById('revenueChartContainer').style.display = 'none';
      return;
    }

    // Build the list of accounts
    snap.forEach(doc => {
      const data = doc.data();
      data.id = doc.id;
      allAccounts.push(data);
      
      const wrapper = document.createElement('div');
      wrapper.className = 'pnl-item-wrapper';
      wrapper.dataset.accountId = data.id;
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `pnl-toggle-${data.id}`;
      checkbox.className = 'pnl-account-checkbox';
      checkbox.checked = true; 
      checkbox.dataset.accountId = data.id;
      checkbox.setAttribute('onchange', 'calculateAll()'); 

      const accordion = document.createElement('button');
      accordion.className = 'accordion';
      accordion.textContent = data.name;

      const panel = document.createElement('div');
      panel.className = 'panel';
      
      // Build the account details panel with specific toggle
      panel.innerHTML = `
        <div class="pnl-grid">
          <div class="pnl-box">
            <h4>Revenue</h4>
            <div class="pnl-row"><span class="label">Total Revenue (Cleaning Services)</span><span class="value">$${(data.revenue || 0).toLocaleString()}</span></div>
          </div>
          <div class="pnl-box">
            <h4>Direct Costs</h4>
            <div class="pnl-row">
              <span class="label">Labor Costs</span>
              <span class="value">
                <input type="number" id="input-labor-${data.id}" data-acc-id="${data.id}" oninput="calculateAll()" placeholder="0.00" value="0" min="0" />
              </span>
            </div>
            <div class="pnl-row">
              <span class="label">Supplies</span>
              <span class="value">
                <input type="number" id="input-supplies-${data.id}" data-acc-id="${data.id}" oninput="calculateAll()" placeholder="0.00" value="0" min="0" />
              </span>
            </div>
          </div>
        </div>
        <div class="pnl-grid">
          <div class="pnl-box">
            <h4>Overhead Expenses</h4>
            <div class="pnl-row">
              <span class="label">Overhead Expenses</span>
              <span class="value">
                <input type="number" id="input-overhead-${data.id}" data-acc-id="${data.id}" oninput="calculateAll()" placeholder="0.00" value="0" min="0" />
              </span>
            </div>
            <div class="pnl-row">
              <span class="label">Cfees (Monthly Calc)</span>
              <span class="value" id="cfees-${data.id}">$0</span>
            </div>
            <div class="pnl-row" style="justify-content: flex-end; padding-top: 8px; border:none;">
                <label style="font-size:0.75rem; margin-right:10px; color:#6b7280; font-weight:600;">INCLUDE IN P&L?</label>
                <label class="switch" style="transform:scale(0.8); margin:0;">
                    <input type="checkbox" id="cfee-toggle-${data.id}" onchange="calculateAll()">
                    <span class="slider"></span>
                </label>
            </div>
          </div>
          <div class="pnl-box">
            <h4>Cost of Doing Business</h4>
            <div class="pnl-row"><span class="label" id="codbLabel-${data.id}">25% of Revenue</span><span class="value" id="codb-${data.id}">$0</span></div>
          </div>
        </div>
        <div class="pnl-grid">
          <div class="pnl-box" style="grid-column: span 2; background: #e6fffa; border: 1px solid #b2f5ea;">
            <h4>Monthly Totals</h4>
            <div class="pnl-row"><span class="label">Total Expenses</span><span class="value" id="accountTotalExpenses-${data.id}">$0</span></div>
            <div class="pnl-row" style="font-weight: bold; color: #065f46;">
              <span class="label">Net Profit Monthly</span>
              <span class="value" id="accountNetProfit-${data.id}">$0</span>
            </div>
          </div>
        </div>
      `;
      
      // Accordion Click Logic
      accordion.addEventListener('click', function() {
        this.classList.toggle('active');
        this.parentElement.classList.toggle('accordion-open'); 
        const panel = this.parentElement.nextElementSibling;
        panel.style.maxHeight = panel.style.maxHeight ? null : panel.scrollHeight + "px";
      });

      wrapper.appendChild(checkbox);
      wrapper.appendChild(accordion);
      container.appendChild(wrapper);
      container.appendChild(panel);
    });

    // Run calculations to populate numbers
    window.calculateAll(); 
  }).catch(err => {
      console.error("CleanDash: Error loading accounts:", err);
      container.innerHTML = '<p style="text-align:center;padding:2rem;color:red;">Error loading data.</p>';
  });
}

// Global Calculation Function
window.calculateAll = async function() {
  console.log("CleanDash: Calculating P&L...");
  if (!window.currentUser) return;
  
  // Default values
  let userCodbPercentage = 25;
  let userCfiFactor = 0; 
  
  // Fetch user settings
  try {
      const userDoc = await db.collection('users').doc(window.currentUser.uid).get();
      if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData && typeof userData.codb === 'number') userCodbPercentage = userData.codb;
          if (userData && typeof userData.cfi === 'number') userCfiFactor = userData.cfi;
      }
  } catch (e) {
      console.error("Failed to load user profile:", e);
  }

  const codbFactor = userCodbPercentage / 100;
  const INTEREST_RATE = 0.12;
  
  if (typeof allAccounts === 'undefined' || allAccounts.length === 0) {
      return;
  }
  
  const checkedAccountIds = Array.from(document.querySelectorAll('.pnl-account-checkbox:checked'))
                                 .map(checkbox => checkbox.dataset.accountId);
                                 
  let totalRevenue = 0, totalLabor = 0, totalSupplies = 0, totalOverhead = 0, 
      totalCfeesDisplayed = 0, totalCodb = 0;
  let totalCfeesActual = 0; 

  // Process each account
  allAccounts.forEach(acc => {
    const revenue = acc.revenue || 0;
    const labor = parseFloat(document.getElementById(`input-labor-${acc.id}`)?.value) || 0;
    const supplies = parseFloat(document.getElementById(`input-supplies-${acc.id}`)?.value) || 0;
    const overhead = parseFloat(document.getElementById(`input-overhead-${acc.id}`)?.value) || 0;
    
    // Check specific toggle for this account
    const includeThisCfee = document.getElementById(`cfee-toggle-${acc.id}`)?.checked || false;
    
    const codb = revenue * codbFactor; 
    const cfeeBase = revenue * userCfiFactor;
    const totalAnnualCost = cfeeBase * (1 + INTEREST_RATE); 
    const cfees = totalAnnualCost / 12; 
    
    // Update individual account UI
    const codbLabelEl = document.getElementById(`codbLabel-${acc.id}`); 
    const codbEl = document.getElementById(`codb-${acc.id}`);
    const cfeesEl = document.getElementById(`cfees-${acc.id}`); 
    
    if (codbLabelEl) codbLabelEl.textContent = `${userCodbPercentage}% of Revenue`;
    if (codbEl) codbEl.textContent = '$' + codb.toFixed(0).toLocaleString();
    if (cfeesEl) cfeesEl.textContent = '$' + cfees.toFixed(0).toLocaleString();

    // Add to Grand Totals if checked
    if (checkedAccountIds.includes(acc.id)) { 
        totalRevenue += revenue;
        totalLabor += labor;
        totalSupplies += supplies;
        totalOverhead += overhead;
        totalCodb += codb;
        
        let accountCfeesActual = 0;
        if (includeThisCfee) {
            totalCfeesActual += cfees;
            accountCfeesActual = cfees;
            totalCfeesDisplayed += cfees; // Only sum displayed if they are included
        }

        const accountTotalExpenses = labor + supplies + overhead + codb + accountCfeesActual;
        const accountNetProfit = revenue - accountTotalExpenses;

        document.getElementById(`accountTotalExpenses-${acc.id}`).textContent = '$' + accountTotalExpenses.toFixed(0).toLocaleString();
        document.getElementById(`accountNetProfit-${acc.id}`).textContent = '$' + accountNetProfit.toFixed(0).toLocaleString();
    }
  });

  // Calculate final totals
  const totalExpenses = totalLabor + totalSupplies + totalOverhead + totalCodb + totalCfeesActual;
  const netProfit = totalRevenue - totalExpenses; 
  const annualProfit = netProfit * 12;

  const cogs = totalLabor + totalSupplies;
  const operatingExpenses = totalOverhead + totalCodb + totalCfeesActual; 

  const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const cogsPercent = totalRevenue > 0 ? (cogs / totalRevenue) * 100 : 0;
  const oerPercent = totalRevenue > 0 ? (operatingExpenses / totalRevenue) * 100 : 0; 
  const cashFlowRatio = netProfit >= 0 ? 'good' : 'bad'; 

  // --- RENDER SCORECARD ---
  const scorecardHtml = `
      <div class="kpi-scorecard">
          <div class="kpi-item" style="border-left-color: #0d9488;">
              <p>Net Profit Margin</p>
              <h3 class="${cashFlowRatio}">${netProfitMargin.toFixed(1)}%</h3>
          </div>
          <div class="kpi-item" style="border-left-color: #ef4444;">
              <p>COGS %</p>
              <h3>${cogsPercent.toFixed(1)}%</h3>
          </div>
          <div class="kpi-item" style="border-left-color: #f59e0b;">
              <p>OER %</p>
              <h3>${oerPercent.toFixed(1)}%</h3>
          </div>
          <div class="kpi-item" style="border-left-color: #3b82f6;">
              <p>Monthly Profit</p>
              <h3>$${netProfit.toFixed(0).toLocaleString()}</h3>
          </div>
      </div>
  `;
  document.getElementById('financialScorecard').innerHTML = scorecardHtml;

  // --- RENDER CHART ---
  const chartData = [
      { name: 'Labor', value: totalLabor, color: '#f87171' }, 
      { name: 'Supplies', value: totalSupplies, color: '#fb923c' }, 
      { name: 'Overhead', value: totalOverhead, color: '#facc15' },
      { name: 'CoDB', value: totalCodb, color: '#34d399' },
      { name: 'Cfees', value: totalCfeesActual, color: '#60a5fa' }, 
      { name: 'Net Profit', value: netProfit > 0 ? netProfit : 0, color: '#0d9488' } 
  ];

  let chartHtml = '';
  let legendHtml = '';

  chartData.forEach(item => {
      const percentage = totalRevenue > 0 ? (item.value / totalRevenue) * 100 : 0;
      if (percentage > 0.1) {
          chartHtml += `<div class="chart-segment" style="width:${percentage.toFixed(1)}%; background-color: ${item.color};" title="${item.name}: $${item.value.toFixed(0).toLocaleString()}">${item.name} ${percentage.toFixed(0)}%</div>`;
      } else if (item.value > 0) {
          chartHtml += `<div class="chart-segment" style="width:1%; background-color: ${item.color};" title="${item.name}: $${item.value.toFixed(0).toLocaleString()}"></div>`;
      }
      if (item.value > 0 || item.name === 'Net Profit' || item.name === 'Cfees') {
          legendHtml += `<div class="legend-item"><span class="legend-color" style="background-color: ${item.color};"></span>${item.name} (${percentage.toFixed(1)}%)</div>`;
      }
  });

  document.getElementById('revenueChartContainer').style.display = 'block';
  document.getElementById('revenueChart').innerHTML = chartHtml || '<div style="padding:20px; text-align:center; color:#666;">No revenue selected yet</div>';
  document.getElementById('chartLegend').innerHTML = legendHtml || '<div style="padding:10px; color:#666;">Select accounts to see breakdown</div>';

  // --- UPDATE GRAND TOTAL ---
  document.getElementById('totalAllRevenue').textContent = '$' + totalRevenue.toLocaleString();
  document.getElementById('totalAllLabor').textContent = '$' + totalLabor.toFixed(0).toLocaleString();
  document.getElementById('totalAllSupplies').textContent = '$' + totalSupplies.toFixed(0).toLocaleString();
  document.getElementById('totalAllOverhead').textContent = '$' + totalOverhead.toFixed(0).toLocaleString();
  document.getElementById('totalAllCfees').textContent = '$' + totalCfeesActual.toFixed(0).toLocaleString(); 
  document.getElementById('totalAllCodb').textContent = '$' + totalCodb.toFixed(0).toLocaleString();
  document.getElementById('totalAllExpenses').textContent = '$' + totalExpenses.toFixed(0).toLocaleString();
  document.getElementById('totalNetMonthly').textContent = '$' + netProfit.toFixed(0).toLocaleString();
  document.getElementById('totalNetAnnual').textContent = '$' + annualProfit.toLocaleString();

  // Reveal the hidden sections
  document.getElementById('grandTotal').style.display = 'block';
  document.getElementById('financialScorecard').style.display = 'block';
}

async function downloadPDF() {
  const element = document.querySelector('#pnl > div');
  const canvas = await html2canvas(element, { scale: 2 });
  const imgData = canvas.toDataURL('image/png');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const width = pdf.internal.pageSize.getWidth();
  const height = (canvas.height * width) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, width, height);
  pdf.save('CleanDash_P&L_Statement.pdf');
}

window.loadPnL = loadPnL;
window.calculateAll = calculateAll;
window.downloadPDF = downloadPDF;