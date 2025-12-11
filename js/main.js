// js/main.js

function startApp() {
    console.log("CleanDash: Main app logic starting...");

    // 1. Initialize Profile Listeners
    if(typeof window.initProfileListeners === 'function') {
        try {
            window.initProfileListeners();
        } catch (err) {
            console.error("CleanDash: Error initializing profile listeners:", err);
        }
    }

    // 2. Initialize Admin "God Mode"
    if(typeof initAdminDashboard === 'function') {
        // We set a small timeout to ensure Auth is ready if this runs on reload
        setTimeout(initAdminDashboard, 1000);
    }

    // 3. Tab Navigation Logic
    const navItems = document.querySelectorAll('.nav-item[data-page]');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            console.log("CleanDash: Navigating to", item.dataset.page);

            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

            const targetPage = document.getElementById(item.dataset.page);
            if (targetPage) {
                targetPage.classList.add('active');
            }

            // Run page-specific loaders
            const page = item.dataset.page;

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
}

// --- ADMIN GOD MODE LOGIC (Simplified for Button) ---

async function initAdminDashboard() {
    const ADMIN_EMAIL = 'nate@anagophilly.com';

    if (!window.currentUser || window.currentUser.email.toLowerCase() !== ADMIN_EMAIL) {
        return;
    }

    console.log("CleanDash: Admin Mode Active.");

    const adminDiv = document.getElementById('adminControls');
    const statusLabel = document.getElementById('adminModeStatusLabel');
    const toggleButton = document.getElementById('godModeToggleButton');

    // Check if the current user is the admin AND if the current page is not admin.html
    const isOwnerDashboard = !window.location.pathname.includes('admin.html');

    if (adminDiv) adminDiv.style.display = 'block';

    const urlParams = new URLSearchParams(window.location.search);
    const viewAsEmail = urlParams.get('viewAs');
    const isImpersonating = viewAsEmail && isOwnerDashboard; // Admin viewing another owner's dashboard

    // If on the Admin's DASHBOARD VIEW (index.html)
    if (isOwnerDashboard) {
        if (isImpersonating) {
            // If IMPERSONATING: Show current view and a REVERT button
            // Note: window.currentUser.email holds the impersonated email here (set by auth.js)
            if (statusLabel) statusLabel.textContent = `STATUS: Viewing ${window.currentUser.email}`;
            if (toggleButton) {
                toggleButton.textContent = '🔥 Revert to God Mode';
                toggleButton.style.backgroundColor = '#f59e0b'; // Amber for revert
            }
        } else {
            // If on the Admin's OWN Dashboard View (no ?viewAs=)
            if (statusLabel) statusLabel.textContent = 'STATUS: Dashboard View';
            if (toggleButton) {
                toggleButton.textContent = '🔥 Go to God Mode';
                toggleButton.style.backgroundColor = '#ef4444'; // Red for switch
            }
        }
    } else {
        // If on the God Mode Control Center (admin.html)
        if (statusLabel) statusLabel.textContent = 'STATUS: God Mode Active';
        if (toggleButton) {
            toggleButton.textContent = '🔙 Exit to Dashboard';
            toggleButton.style.backgroundColor = '#64748b'; // Secondary/Gray for exit
        }
    }
}

// New single-click function to handle the button press
window.toggleGodModeView = function() {
    // Check if we are currently on the God Mode page
    const isOnGodModePage = window.location.pathname.includes('admin.html');

    if (isOnGodModePage) {
        // ACTION: Exit God Mode -> Go to Admin's own Dashboard View (index.html, no params)
        window.showToast("Exiting God Mode...");
        window.location.replace('index.html');
    } else {
        // ACTION: Go to God Mode -> Redirect to admin.html. This also covers the "Revert" action
        // because we want to clear the ?viewAs= parameter from the URL.
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