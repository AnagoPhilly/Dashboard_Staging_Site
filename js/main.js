// js/main.js

function startApp() {
    console.log("CleanDash: Main app logic starting...");

    // 1. Initialize Profile Listeners (if the function exists)
    // Note: We check for existence because this script loads after the profile.js file.
    if(typeof window.initProfileListeners === 'function') {
        try {
            window.initProfileListeners();
            console.log("CleanDash: Profile listeners initialized.");
        } catch (err) {
            console.error("CleanDash: Error initializing profile listeners:", err);
        }
    }

    // 2. Tab Navigation Logic
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    
    if (navItems.length === 0) {
        console.error("CleanDash: No navigation items found! Check your HTML classes.");
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            console.log("CleanDash: Navigating to", item.dataset.page);

            // A. Remove active class from all nav items
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            
            // B. Add active class to clicked item
            item.classList.add('active');
            
            // C. Hide all pages
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            
            // D. Show the target page
            const targetPage = document.getElementById(item.dataset.page);
            if (targetPage) {
                targetPage.classList.add('active');
            } else {
                console.error("CleanDash: Target page not found:", item.dataset.page);
            }
    
            // E. Run page-specific loaders (Check if the function from the relevant JS file exists)
            const page = item.dataset.page;

            // Dashboard (Map)
            if (page === 'dashboard' && typeof window.loadMap === 'function') window.loadMap();

            // Accounts
            if (page === 'accounts' && typeof window.loadAccountsList === 'function') window.loadAccountsList();

            // Team Management (Phase 1)
            if (page === 'employees' && typeof window.loadEmployees === 'function') window.loadEmployees();

            // Scheduler (Phase 2)
            if (page === 'scheduler' && typeof window.loadScheduler === 'function') window.loadScheduler();

            // Payroll Tracking (Phase 5)
            if (page === 'payroll' && typeof window.loadPayroll === 'function') window.loadPayroll();

            // P&L Statement
            if (page === 'pnl' && typeof window.loadPnL === 'function') window.loadPnL();

            // C-Fee Calculator
            if (page === 'cfee_calc' && typeof window.initCfeeCalc === 'function') window.initCfeeCalc();

            // Profile
            if (page === 'profile' && typeof window.loadProfile === 'function') window.loadProfile();
        });
    });
}

// 3. Robust Startup: Ensures the startApp function runs regardless of when the script loads.
if (document.readyState === 'loading') {
    // If the page is still loading, wait for the content to be ready.
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    // If the page is already loaded, run the function immediately.
    startApp();
}