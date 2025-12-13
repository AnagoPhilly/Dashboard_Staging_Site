// js/main.js

// --- CRITICAL GLOBAL FUNCTIONS FOR ACCOUNTS.JS ---

// Function to show a simple notification
window.showToast = function(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
};

// Function to hide the Edit Account Modal (Called by accounts.js)
window.hideEditAccount = function() {
    // Assuming your modal has the ID 'editAccountModal'
    const modal = document.getElementById('editAccountModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Function to hide the Add Account Modal (Called by accounts.js)
window.hideAddAccount = function() {
    const modal = document.getElementById('addAccountModal');
    if (modal) {
        modal.style.display = 'none';
        document.querySelectorAll('#addAccountModal input').forEach(i => i.value = '');
    }
    // Reset PID button state
    const btn = document.getElementById('btnPidAutoFill');
    if(btn) {
        btn.innerHTML = '✨ PID Auto Fill';
        btn.disabled = false;
    }
}

// Function to close the Inactive Reason Modal (Called by accounts.js)
window.hideInactiveReasonModal = function() {
    const modal = document.getElementById('inactiveReasonModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// --- END CRITICAL GLOBAL FUNCTIONS ---


function startApp() {
    console.log("CleanDash: Main app logic starting...");

    if(typeof window.initProfileListeners === 'function') {
        try {
            window.initProfileListeners();
        } catch (err) {
            console.error("CleanDash: Error initializing profile listeners:", err);
        }
    }

    // 2. Tab Navigation Logic (MODIFIED FOR ANALYTICS)
    const navItems = document.querySelectorAll('.nav-item[data-page]');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            console.log("CleanDash: Navigating to", page);

            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

            const targetPage = document.getElementById(page);
            if (targetPage) {
                targetPage.classList.add('active');
            }

            // --- NEW: GOOGLE ANALYTICS PAGE VIEW TRACKING ---
            if (typeof window.gtag === 'function') {
                const newPath = window.location.pathname.replace('index.html', '') + '/' + page;
                const newTitle = 'CleanDash - ' + page.charAt(0).toUpperCase() + page.slice(1);

                window.gtag('event', 'page_view', {
                    'page_title': newTitle,
                    'page_path': newPath,
                    'send_to': 'G-HBLVYZSS3M' // Explicitly send to your property
                });
                console.log(`GA: Sent page_view for ${page}`);
            }
            // --- END NEW TRACKING ---

            // Run page-specific loaders
            if (page === 'dashboard' && typeof window.loadMap === 'function') window.loadMap();
            if (page === 'accounts' && typeof window.loadAccountsList === 'function') window.loadAccountsList();
            if (page === 'employees' && typeof window.loadEmployees === 'function') window.loadEmployees();
            if (page === 'scheduler' && typeof window.loadScheduler === 'function') window.loadScheduler();
            if (page === 'payroll' && typeof window.loadPayroll === 'function') window.loadPayroll();
            if (page === 'pnl' && typeof window.loadPnL === 'function') window.loadPnL();
            if (page === 'cfee_calc' && typeof window.initCfeeCalc === 'function') window.initCfeeCalc();
            if (page === 'profile' && typeof window.loadProfile === 'function') window.loadProfile();
        });
    });

    // 3. Trigger initial view load (Optional: Auto-click dashboard on load)
    const initialNavItem = document.querySelector('.nav-item[data-page="dashboard"]');
    if (initialNavItem) {
        initialNavItem.click();
    }
}

// --- ADMIN GOD MODE LOGIC (Restored from your previous code) ---

// New single-click function to handle the button press
window.toggleGodModeView = function() {
    // Check if we are currently on the God Mode page
    const isOnGodModePage = window.location.pathname.includes('admin.html');

    if (isOnGodModePage) {
        // ACTION: Exit God Mode -> Go to Admin's own Dashboard View (index.html, no params)
        window.showToast("Exiting God Mode...");
        window.location.replace('index.html');
    } else {
        // ACTION: Go to God Mode -> Redirect to admin.html.
        window.showToast("Switching to God Mode...");
        window.location.replace('admin.html');
    }
};

// --- STARTUP ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}