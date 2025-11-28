// js/calculator.js

// Ensure we have a placeholder for the global calculation function.
window.runCfeeCalc = runCfeeCalc;
window.downloadCalcPDF = downloadCalcPDF;

// Update init function to populate data before calculating
window.initCfeeCalc = async function() {
    await populateCfi();
    runCfeeCalc();
};

async function populateCfi() {
    const input = document.getElementById('calc_cfi');
    
    // Safety check: Don't overwrite if the user has already typed a value this session
    if (!input || input.value !== "") return;

    // Safety check: Must be logged in
    if (!window.currentUser) return;

    try {
        const doc = await db.collection('users').doc(window.currentUser.uid).get();
        if (doc.exists) {
            const data = doc.data();
            // Only populate if a valid CFI exists in profile (and isn't 0)
            if (data.cfi && data.cfi > 0) {
                input.value = data.cfi;
                console.log("CleanDash: Auto-populated CFI from profile:", data.cfi);
            }
        }
    } catch (e) {
        console.error("CleanDash: Error fetching CFI from profile:", e);
    }
}

function runCfeeCalc() {
    const revenue = parseFloat(document.getElementById('calc_revenue')?.value) || 0;
    const cfiFactor = parseFloat(document.getElementById('calc_cfi')?.value) || 0;
    
    // Constants
    const CASH_DISCOUNT = 0.15; // 15% cash discount
    const NO_INTEREST_MONTHS = 4;
    const FINANCED_MONTHS = 12;
    const ANNUAL_INTEREST_RATE = 0.12; 

    // --- 1. Base C-Fee Calculation ---
    const baseCfee = revenue * cfiFactor;

    // --- 2. Cash Payment ---
    const cashDiscountAmount = baseCfee * CASH_DISCOUNT;
    const cashTotal = baseCfee - cashDiscountAmount;

    // --- 3. 120 Days No Interest ---
    const noInterestTotalCfee = baseCfee;
    const noInterestPayment = noInterestTotalCfee / NO_INTEREST_MONTHS;

    // --- 4. Financed (12 Months) ---
    const interestAmount = baseCfee * ANNUAL_INTEREST_RATE;
    const financedTotal = baseCfee + interestAmount;
    const financedPayment = financedTotal / FINANCED_MONTHS;

    // --- UI Update Function ---
    function updateUI() {
        // Helper to get element and apply text or value
        const s = (id, value, isMoney = true) => {
            const el = document.getElementById(id);
            if (el) el.textContent = isMoney ? window.formatMoney(value) : value;
        };
        const s_label = (id, label) => {
            const el = document.getElementById(id);
            if (el) el.textContent = label;
        };

        // Cash Payment Card
        s_label('lbl_cash_cfee', `C-fee Amount (${cfiFactor.toFixed(2)} x $${revenue.toLocaleString()})`);
        s('val_cash_cfee_detail', baseCfee);
        s('val_cash_disc', -cashDiscountAmount); // Use negative sign for discount display
        s('val_cash_total', cashTotal);

        // 120 Days No Interest Card
        s_label('lbl_120_cfee', `C-fee Amount (${cfiFactor.toFixed(2)} x $${revenue.toLocaleString()})`);
        s('val_120_cfee', baseCfee);
        s('val_120_total_cfee', noInterestTotalCfee);
        s('val_120_pay', noInterestPayment);

        // Financed (12 Months) Card
        s_label('lbl_fin_cfee', `C-fee Amount (${cfiFactor.toFixed(2)} x $${revenue.toLocaleString()})`);
        s('val_fin_cfee', baseCfee);
        s('val_fin_int', interestAmount);
        s('val_fin_total', financedTotal);
        s('val_fin_pay', financedPayment);
    }
    
    updateUI();
}

async function downloadCalcPDF() {
    // Select the specific container for printing/downloading
    const element = document.getElementById('calcPrintArea').parentElement; 
    
    // Ensure the results are visible before capturing
    const calcResults = document.getElementById('calcResults');
    if (calcResults) calcResults.style.display = 'grid'; 

    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;
    
    // Check if the content is too long for one page
    let position = 0;
    const pageHeight = 295; // A4 height in mm
    
    // If the content is too tall, slice and add pages
    if (height > pageHeight) {
        let heightLeft = height;
        let pages = 0;
        
        while (heightLeft >= 0) {
            position = heightLeft - height;
            pdf.addImage(imgData, 'PNG', 0, position, width, height);
            heightLeft -= pageHeight;
            pages++;

            // Add new page if content remains
            if (heightLeft >= 0) {
                pdf.addPage();
            }
        }
    } else {
        pdf.addImage(imgData, 'PNG', 0, 0, width, height);
    }
    
    pdf.save('CleanDash_Cfee_Quote.pdf');
}

// Initial run to populate with $0.00
runCfeeCalc();