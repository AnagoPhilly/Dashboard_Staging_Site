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
// Global variable to store the install "ticket"
window.deferredInstallPrompt = null;

// Global variable to hold the install ticket
window.deferredInstallPrompt = null;

function initPWAInstallLogic() {
    // 1. Listen for the browser "Ready" signal
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.deferredInstallPrompt = e;
        console.log("✅ App is ready to be installed.");
    });

    // 2. Make the Profile Button work
    const btnProfileInstall = document.getElementById('btnProfileInstall');

    if (btnProfileInstall) {
        btnProfileInstall.addEventListener('click', async () => {

            // CASE A: Android/Desktop is ready to install
            if (window.deferredInstallPrompt) {
                window.deferredInstallPrompt.prompt();
                const { outcome } = await window.deferredInstallPrompt.userChoice;
                console.log(`User response: ${outcome}`);
                window.deferredInstallPrompt = null;
                return;
            }

            // CASE B: Already Installed or iPhone
            const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

            if (isIOS) {
                alert("📲 To install on iPhone:\n\n1. Tap the Share button (square with arrow)\n2. Scroll down and tap 'Add to Home Screen'");
            } else {
                alert("The app is likely already installed! Check your Home Screen or App List.");
            }
        });
    }

    // 3. Hide banner if installed successfully
    window.addEventListener('appinstalled', () => {
        console.log('🎉 App Installed');
        window.deferredInstallPrompt = null;
        if (document.getElementById('installBanner')) {
            document.getElementById('installBanner').style.display = 'none';
        }
    });
}

// Helper function to trigger the native prompt
async function triggerInstall() {
    if (!window.deferredInstallPrompt) return;

    // Show the native browser prompt
    window.deferredInstallPrompt.prompt();

    // Wait for the user to respond
    const { outcome } = await window.deferredInstallPrompt.userChoice;
    console.log(`User response: ${outcome}`);

    // Reset variable (can't use it twice)
    window.deferredInstallPrompt = null;
    document.getElementById('installBanner').style.display = 'none';
}

// Helper to explain iOS installation
function checkIOSandHelp() {
    // Detect if user is on iPhone/iPad using classic regex
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

    if (isIOS) {
        alert("📲 To install on iPhone:\n\n1. Tap the 'Share' icon (square with arrow) at the bottom.\n2. Scroll down and tap 'Add to Home Screen'.");
    } else {
        alert("It looks like the app is already installed, or your browser doesn't support automatic installation.");
    }
}