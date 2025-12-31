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
};

// --- NAVIGATION & PAGE MANAGEMENT ---

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initPWAInstallLogic(); // Initialize the new install prompt logic
});

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    const pages = document.querySelectorAll('.page');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.getAttribute('data-page');

            // 1. Update Sidebar UI
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // 2. Switch Page Visibility
            pages.forEach(p => p.classList.remove('active'));
            const targetPage = document.getElementById(page);
            if (targetPage) targetPage.classList.add('active');

            // 3. Trigger Module-Specific Loaders
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

    // 4. Trigger initial view load (Auto-click dashboard on load)
    const initialNavItem = document.querySelector('.nav-item[data-page="scheduler"]');
    if (initialNavItem) {
        initialNavItem.click();
    }
}

// --- ADMIN GOD MODE LOGIC ---

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

// --- PWA INSTALLATION PROMPT LOGIC ---

// --- PWA INSTALLATION PROMPT LOGIC (DEBUG VERSION) ---
function initPWAInstallLogic() {
    let deferredPrompt;
    const installBanner = document.getElementById('installBanner');
    const btnInstall = document.getElementById('btnInstall');

    console.log("PWA Logic Initialized. Waiting for browser event...");

    // 1. Listen for the browser saying "I'm ready to install!"
    window.addEventListener('beforeinstallprompt', (e) => {
        console.log("✅ 'beforeinstallprompt' event FIRED!");
        e.preventDefault(); // Stop the mini-infobar
        deferredPrompt = e; // Save the event "ticket" for later

        // Show our banner
        if (installBanner) {
            installBanner.style.display = 'flex';
            console.log("Banner displayed.");
        }
    });

    // 2. Handle the button click
    if (btnInstall) {
        btnInstall.addEventListener('click', async () => {
            console.log("Install button clicked.");

            if (!deferredPrompt) {
                alert("⚠️ Error: The browser has not granted permission to install yet.\n\nDid you force the banner to show via console? That won't work.\nUse the 'Application > Manifest > Trigger' method.");
                return;
            }

            // Show the native browser prompt
            console.log("Triggering native prompt...");
            deferredPrompt.prompt();

            // Wait for the user to respond
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response: ${outcome}`);

            deferredPrompt = null;
            if (installBanner) installBanner.style.display = 'none';
        });
    }

    // 3. Listener for successful install
    window.addEventListener('appinstalled', () => {
        console.log('🎉 CleanDash was installed successfully.');
        if (installBanner) installBanner.style.display = 'none';
    });
}