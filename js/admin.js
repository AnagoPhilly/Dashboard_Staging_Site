// js/auth.js

const firebaseConfig = {
  apiKey: "AIzaSyDOOQuFmcvGjCHe8PFT5r2TLYQDaYalubA",
  authDomain: "hail-mary-10391.firebaseapp.com",
  projectId: "hail-mary-10391",
  storageBucket: "hail-mary-10391.firebasestorage.app",
  messagingSenderId: "911770919550",
  appId: "1:911770919550:web:7f1a839e39d488b2072e2f"
};

// CRITICAL: Expose config so employees.js can use it for 'Secondary App' creation
window.firebaseConfig = firebaseConfig;

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Expose globals
window.auth = auth;
window.db = db;
window.currentUser = null;

// --- THE TRAFFIC COP (Role-Based Access Control) ---
auth.onAuthStateChanged(async user => {
  const isPortal = window.location.pathname.includes('employee_portal.html');
  const loginPage = document.getElementById('loginPage');
  const app = document.getElementById('app');
  const appLoading = document.getElementById('appLoading');

  if (user) {
    window.currentUser = user;
    console.log("Auth: User logged in:", user.email);

    // -----------------------------------------------------------------
    // 1. IMPERSONATION LOGIC (For Admin "View As")
    // -----------------------------------------------------------------
    const urlParams = new URLSearchParams(window.location.search);
    const viewAsEmail = urlParams.get('viewAs');
    const ADMIN_EMAIL = 'nate@anagophilly.com';
    const isImpersonating = viewAsEmail && user.email.toLowerCase() === ADMIN_EMAIL;

    // Elements to update in Sidebar
    const nameDisplay = document.getElementById('userNameDisplay');
    const emailDisplay = document.getElementById('userEmailDisplay');

    if (isImpersonating) {
        let impersonatedName = viewAsEmail;
        try {
            // Find target user to get their UID
            const ownerSnap = await db.collection('users').where('email', '==', viewAsEmail).limit(1).get();
            if (!ownerSnap.empty) {
                const targetDoc = ownerSnap.docs[0];
                const ownerData = targetDoc.data();
                if (ownerData.name) impersonatedName = ownerData.name;

                // OVERRIDE currentUser so the app thinks we are them
                window.currentUser = {
                    uid: targetDoc.id,
                    email: viewAsEmail,
                    originalAdminEmail: user.email,
                    getIdToken: () => user.getIdToken()
                };
                console.log(`Auth: Impersonating ${impersonatedName}`);
            }
        } catch (e) { console.warn("Impersonation Error:", e); }

        if(nameDisplay) nameDisplay.textContent = `Viewing: ${impersonatedName}`;
        if(emailDisplay) emailDisplay.textContent = user.email;
    }

    // -----------------------------------------------------------------
    // 2. CHECK IF EMPLOYEE
    // -----------------------------------------------------------------
    const checkEmail = window.currentUser.email;
    const empSnap = await db.collection('employees').where('email', '==', checkEmail).get();

    if (!empSnap.empty) {
        // --- USER IS AN EMPLOYEE ---
        console.log("Auth: Role = Employee");

        if (nameDisplay && !isImpersonating && empSnap.docs[0].data().name) {
             nameDisplay.textContent = empSnap.docs[0].data().name;
        }

        // REDIRECT: If on Dashboard, go to Portal
        if (!isPortal) {
            window.location.href = 'employee_portal.html';
            return;
        }

        // If on Portal, we are good.
        return;
    }

    // -----------------------------------------------------------------
    // 3. CHECK IF OWNER
    // -----------------------------------------------------------------
    const ownerDoc = await db.collection('users').doc(window.currentUser.uid).get();

    if (ownerDoc.exists && ownerDoc.data().role === 'owner') {
        // --- USER IS AN OWNER ---
        console.log("Auth: Role = Owner");

        const userData = ownerDoc.data();
        if (!isImpersonating) {
            if(nameDisplay) nameDisplay.textContent = userData.name || "Owner";
            if(emailDisplay) emailDisplay.textContent = window.currentUser.email;
        }

        // REDIRECT: If on Portal, go to Dashboard (Unless testing)
        if (isPortal) {
             // Allow 'testMode' param to bypass redirect for debugging
             if (!urlParams.get('testMode')) {
                 window.location.href = 'index.html';
                 return;
             }
        }

        // Show Dashboard
        if (loginPage) loginPage.style.display = 'none';
        if (appLoading) appLoading.style.display = 'none';
        if (app) {
            app.style.display = 'flex';

            // --- INTELLIGENT INITIAL LOAD ---
            // Check which page is currently active (set by main.js) and load its data
            // This fixes the issue where Scheduler wouldn't load on refresh
            const activePage = document.querySelector('.page.active');
            const pageId = activePage ? activePage.id : 'dashboard';

            console.log(`Auth: Initializing view for ${pageId}...`);

            if (pageId === 'scheduler' && typeof window.loadScheduler === 'function') {
                window.loadScheduler(); //
            } else if (pageId === 'accounts' && typeof window.loadAccountsList === 'function') {
                window.loadAccountsList();
            } else if (pageId === 'employees' && typeof window.loadEmployees === 'function') {
                window.loadEmployees();
            } else if (pageId === 'payroll' && typeof window.loadPayroll === 'function') {
                window.loadPayroll();
            } else {
                // Default fallback (Dashboard)
                if (typeof window.loadMap === 'function') window.loadMap();
            }

            // --- GOD MODE / ADMIN CONTROLS ---
            // Check: Is Super Admin OR has isAdmin=true in DB
            const isAuthorizedAdmin = (user.email.toLowerCase() === ADMIN_EMAIL) || (userData.isAdmin === true);

            if (isAuthorizedAdmin) {
                const adminDiv = document.getElementById('adminControls');
                const statusLabel = document.getElementById('adminModeStatusLabel');
                const toggleButton = document.getElementById('godModeToggleButton');
                const isOwnerDashboard = !window.location.pathname.includes('admin.html');

                if (adminDiv) adminDiv.style.display = 'block';

                if (isOwnerDashboard) {
                    if (isImpersonating) {
                        if (statusLabel) statusLabel.textContent = `STATUS: Viewing ${window.currentUser.email}`;
                        if (toggleButton) {
                            toggleButton.textContent = '🔥 Revert to God Mode';
                            toggleButton.style.backgroundColor = '#f59e0b'; // Amber
                        }
                    } else {
                        if (statusLabel) statusLabel.textContent = 'STATUS: Dashboard View';
                        if (toggleButton) {
                            toggleButton.textContent = '🔥 Go to God Mode';
                            toggleButton.style.backgroundColor = '#ef4444'; // Red
                        }
                    }
                } else {
                    // On admin.html
                    if (statusLabel) statusLabel.textContent = 'STATUS: God Mode Active';
                    if (toggleButton) {
                        toggleButton.textContent = '🔙 Exit to Dashboard';
                        toggleButton.style.backgroundColor = '#64748b'; // Gray
                    }
                }
            }
        }
    } else {
        // -----------------------------------------------------------------
        // 4. UNKNOWN USER
        // -----------------------------------------------------------------
        console.warn("Auth: User authenticated but no profile found.");

        if (isPortal) {
             alert("Account not found in Employee Roster.");
             auth.signOut();
             window.location.href = 'index.html';
        } else {
             alert("Access Denied: No Owner Profile found.");
             auth.signOut();
        }
    }

  } else {
    // -----------------------------------------------------------------
    // 5. NOT LOGGED IN
    // -----------------------------------------------------------------
    console.log("Auth: No user.");

    // If on Portal, KICK BACK to Login Page (Index)
    if (isPortal) {
        window.location.href = 'index.html';
        return;
    }

    // If on Index, Show Login Form
    if (loginPage) loginPage.style.display = 'flex';
    if (app) app.style.display = 'none';
    if (appLoading) appLoading.style.display = 'none';
  }
});

// --- LOGIN FUNCTION ---
window.login = () => {
  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;
  if (!email || !password) return alert('Enter email & password');

  const btn = document.querySelector('button[onclick="login()"]');
  if(btn) btn.textContent = "Verifying...";

  auth.signInWithEmailAndPassword(email, password).catch(e => {
      alert("Login Failed: " + e.message);
      if(btn) btn.textContent = "Login";
  });
};

// --- LOGOUT FUNCTION (UPDATED) ---
window.logout = () => {
  // Clear any saved view state so next login starts fresh on "Day View"
  sessionStorage.clear();

  auth.signOut().then(() => {
      window.location.href = 'index.html';
  });
};