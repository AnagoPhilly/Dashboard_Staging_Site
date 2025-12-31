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
    console.log("Auth: User detected:", user.email);
    window.currentUser = user;

    try {
        // -----------------------------------------------------------------
        // 1. ADMIN AUTHORIZATION CHECK (Priority Order)
        // -----------------------------------------------------------------
        const ADMIN_EMAIL = 'nate@anagophilly.com';
        let isAuthorizedAdmin = false;

        // CHECK A: Hardcoded Super Admin (Immediate Pass)
        if (user.email.toLowerCase() === ADMIN_EMAIL) {
            isAuthorizedAdmin = true;
        }
        // CHECK B: Database Flag (Only check if not already authorized)
        else {
            const realUserDoc = await db.collection('users').doc(user.uid).get();
            if (realUserDoc.exists && realUserDoc.data().isAdmin === true) {
                isAuthorizedAdmin = true;
            }
        }

        // -----------------------------------------------------------------
        // 2. IMPERSONATION LOGIC (For Admin "View As")
        // -----------------------------------------------------------------
        const urlParams = new URLSearchParams(window.location.search);
        const viewAsEmail = urlParams.get('viewAs');
        const targetId = urlParams.get('targetId');

        // Only allow impersonation if a param exists AND user is Authorized
        const isImpersonating = (viewAsEmail || targetId) && isAuthorizedAdmin;

        // Elements to update in Sidebar
        const nameDisplay = document.getElementById('userNameDisplay');
        const emailDisplay = document.getElementById('userEmailDisplay');

        if (isImpersonating) {
            let impersonatedName = viewAsEmail || "User";
            let targetDoc = null;

            try {
                // STRATEGY A: Lookup by ID (Primary)
                if (targetId && targetId !== 'undefined' && targetId !== 'null') {
                    const docSnap = await db.collection('users').doc(targetId).get();
                    if (docSnap.exists) targetDoc = docSnap;
                }

                // STRATEGY B: Fallback to Email (Secondary)
                if (!targetDoc && viewAsEmail) {
                    const ownerSnap = await db.collection('users').where('email', '==', viewAsEmail).limit(1).get();
                    if (!ownerSnap.empty) targetDoc = ownerSnap.docs[0];
                }

                if (targetDoc && targetDoc.exists) {
                    const ownerData = targetDoc.data();
                    if (ownerData.name) impersonatedName = ownerData.name;
                    const finalEmail = ownerData.email || viewAsEmail;

                    // OVERRIDE currentUser so the app thinks we are them
                    window.currentUser = {
                        uid: targetDoc.id,
                        email: finalEmail,
                        originalAdminEmail: user.email,
                        getIdToken: () => user.getIdToken()
                    };
                    console.log(`Auth: Successfully Impersonating ${impersonatedName}`);
                }
            } catch (e) { console.warn("Impersonation Error:", e); }

            if(nameDisplay) nameDisplay.textContent = `Viewing: ${impersonatedName}`;
            if(emailDisplay) emailDisplay.textContent = user.email;
        }

        // -----------------------------------------------------------------
        // 3. CHECK IF OWNER (PRIORITY FIX: Check this BEFORE Employee)
        // -----------------------------------------------------------------
        // We re-fetch here to ensure we get the data of the *current context* user.
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
                const activePage = document.querySelector('.page.active');
                const pageId = activePage ? activePage.id : 'dashboard';

                setTimeout(() => {
                    if (pageId === 'scheduler' && typeof window.loadScheduler === 'function') {
                        window.loadScheduler();
                    } else if (pageId === 'accounts' && typeof window.loadAccountsList === 'function') {
                        window.loadAccountsList();
                    } else if (pageId === 'employees' && typeof window.loadEmployees === 'function') {
                        window.loadEmployees();
                    } else if (pageId === 'payroll' && typeof window.loadPayroll === 'function') {
                        window.loadPayroll();
                    } else {
                        if (typeof window.loadMap === 'function') window.loadMap();
                    }
                }, 100);

                // --- GOD MODE / ADMIN CONTROLS ---
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
            return; // STOP HERE if Owner (Don't check Employee)
        }

        // -----------------------------------------------------------------
        // 4. CHECK IF EMPLOYEE (Only if NOT an Owner)
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
            if (appLoading) appLoading.style.display = 'none';
            if (app) app.style.display = 'block';
            return;
        }

        // -----------------------------------------------------------------
        // 5. UNKNOWN USER
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

    } catch (error) {
        console.error("Auth Critical Failure:", error);
        alert("System Error: " + error.message);
        if (appLoading) appLoading.style.display = 'none';
        if (loginPage) loginPage.style.display = 'flex';
    }
  } else {
    // -----------------------------------------------------------------
    // 6. NOT LOGGED IN
    // -----------------------------------------------------------------
    if (isPortal) {
        window.location.href = 'index.html';
        return;
    }
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

// --- LOGOUT FUNCTION ---
window.logout = () => {
  sessionStorage.clear();
  auth.signOut().then(() => {
      window.location.href = 'index.html';
  });
};

setTimeout(() => {
    const appLoading = document.getElementById('appLoading');
    const loginPage = document.getElementById('loginPage');
    if (appLoading && appLoading.style.display !== 'none') {
        appLoading.style.display = 'none';
        if (loginPage) loginPage.style.display = 'flex';
    }
}, 3000);