// js/auth.js

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDOOQuFmcvGjCHe8PFT5r2TLYQDaYalubA",
  authDomain: "hail-mary-10391.firebaseapp.com",
  projectId: "hail-mary-10391",
  storageBucket: "hail-mary-10391.firebasestorage.app",
  messagingSenderId: "911770919550",
  appId: "1:911770919550:web:7f1a839e39d488b2072e2f"
};

// Expose config globally so employees.js can use it for 'Secondary App' creation
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

  // Sidebar Elements
  const nameDisplay = document.getElementById('userNameDisplay');
  const emailDisplay = document.getElementById('userEmailDisplay');

  if (user) {
    console.log("Auth: User detected:", user.email);
    window.currentUser = user;
    const currentEmail = user.email.toLowerCase();

    try {
        // 1. FETCH USER PROFILE (OWNER)
        const userDoc = await db.collection('users').doc(user.uid).get();
        let userData = {};
        let isOwner = false;

        if (userDoc.exists) {
            userData = userDoc.data();
            isOwner = true; // Use simple logic: if you have a user profile, you are an owner/admin

            // Update Sidebar UI
            if (nameDisplay) nameDisplay.textContent = userData.name || "Franchise Owner";
            if (emailDisplay) emailDisplay.textContent = userData.email || user.email;
        }

        // ---------------------------------------------------------------
        // 2. GOD MODE CHECK (MOVED OUTSIDE 'userDoc.exists')
        // ---------------------------------------------------------------
        // This ensures you get the button even if your DB profile is missing
        const ALLOWED_ADMINS = ['nate@anagophilly.com', 'admin@cleandash.com'];

        const isAdmin = ALLOWED_ADMINS.includes(currentEmail) || (userData.isAdmin === true);

        const btnGodMode = document.getElementById('navGodMode');
        if (btnGodMode) {
            console.log(`God Mode Check: ${currentEmail} -> ${isAdmin ? 'ALLOWED' : 'DENIED'}`);
            btnGodMode.style.display = isAdmin ? 'flex' : 'none';
        }
        // ---------------------------------------------------------------

        // 3. OWNER / ADMIN REDIRECT LOGIC
        if (isOwner || isAdmin) {
            // REDIRECT: Owners shouldn't be on the Portal
            if (isPortal) {
                 window.location.href = 'index.html';
                 return;
            }

            // Show Dashboard
            if (loginPage) loginPage.style.display = 'none';
            if (appLoading) appLoading.style.display = 'none';
            if (app) {
                app.style.display = 'flex';
                // Trigger Dashboard Loads
                setTimeout(() => {
                    const activePage = document.querySelector('.page.active');
                    const pageId = activePage ? activePage.id : 'dashboard';

                    if (pageId === 'scheduler' && window.loadScheduler) window.loadScheduler();
                    else if (pageId === 'accounts' && window.loadAccountsList) window.loadAccountsList();
                    else if (pageId === 'employees' && window.loadEmployees) window.loadEmployees();
                    else if (window.loadMap) window.loadMap();
                }, 100);
            }
            return;
        }

        // 4. CHECK IF EMPLOYEE (Only if NOT an Owner/Admin)
        const empSnap = await db.collection('employees').where('email', '==', currentEmail).limit(1).get();

        if (!empSnap.empty) {
            // REDIRECT: If on Dashboard, go to Portal
            if (!isPortal) {
                window.location.href = 'employee_portal.html';
                return;
            }
            console.log("Auth: Employee verified on Portal.");
            return;
        }

        // 5. UNKNOWN USER
        console.warn("Auth: User authenticated but no profile found.");

        // Even guests might be Admins if hardcoded above, so we don't kick them out instantly if they passed the Admin check
        if (isAdmin) return;

        alert("Access Denied: No profile found for " + user.email);
        auth.signOut();

    } catch (error) {
        console.error("Auth Critical Failure:", error);
        alert("System Error: " + error.message);
        if (appLoading) appLoading.style.display = 'none';
        if (loginPage) loginPage.style.display = 'flex';
    }
  } else {
    // 6. NOT LOGGED IN
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

// Fallback to hide loader if auth hangs
setTimeout(() => {
    const appLoading = document.getElementById('appLoading');
    const loginPage = document.getElementById('loginPage');
    if (appLoading && appLoading.style.display !== 'none' && !window.currentUser) {
       // appLoading.style.display = 'none'; // Optional: Don't hide prematurely
       // if (loginPage) loginPage.style.display = 'flex';
    }
}, 4000);