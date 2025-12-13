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
  const isEmployeePage = window.location.pathname.includes('employee.html');
  const loginPage = document.getElementById('loginPage');
  const app = document.getElementById('app');
  const appLoading = document.getElementById('appLoading');

  if (user) {
    // Start with the real authenticated user
    window.currentUser = user;
    console.log("Auth: User detected:", user.email);

    // Elements to update in the Sidebar
    const nameDisplay = document.getElementById('userNameDisplay');
    const emailDisplay = document.getElementById('userEmailDisplay');

    // -----------------------------------------------------------------
    // NEW IMPERSONATION LOGIC FOR ADMINS
    // -----------------------------------------------------------------
    const urlParams = new URLSearchParams(window.location.search);
    const viewAsEmail = urlParams.get('viewAs');
    const ADMIN_EMAIL = 'nate@anagophilly.com';
    const isImpersonating = viewAsEmail && user.email.toLowerCase() === ADMIN_EMAIL;

    if (isImpersonating) {
        let impersonatedName = viewAsEmail;

        try {
            // Step 1: Find the target user document to get their real UID and Name
            const ownerSnap = await db.collection('users').where('email', '==', viewAsEmail).limit(1).get();

            if (!ownerSnap.empty) {
                const targetDoc = ownerSnap.docs[0];
                const ownerData = targetDoc.data();

                if (ownerData.name) impersonatedName = ownerData.name;

                // CRITICAL FIX: We must override the UID so profile/accounts load the TARGET'S data, not the admin's.
                // We create a proxy object because Firebase User properties are often read-only.
                window.currentUser = {
                    uid: targetDoc.id,       // Use the Franchisee's UID
                    email: viewAsEmail,      // Use the Franchisee's Email
                    originalAdminEmail: user.email, // Keep track of real admin
                    // Proxy other methods if needed, though most app logic just needs uid/email
                    getIdToken: () => user.getIdToken()
                };

                console.log(`Auth: Impersonation Success. Swapped UID to ${targetDoc.id}`);
            }
        } catch (e) {
             console.warn("Impersonation Lookup Error:", e);
        }

        console.log(`Auth: Admin Impersonation active. Viewing as: ${impersonatedName}`);

        // Update Sidebar Displays to show the *impersonated name*
        if(nameDisplay) nameDisplay.textContent = `Viewing: ${impersonatedName}`;

        // Show the original admin email in the smaller space
        if(emailDisplay) emailDisplay.textContent = user.email;
    }
    // -----------------------------------------------------------------

    // 1. Check if they are an EMPLOYEE
    const checkEmail = window.currentUser.email;
    const empSnap = await db.collection('employees').where('email', '==', checkEmail).get();

    if (!empSnap.empty) {
        // --- IT IS AN EMPLOYEE ---
        console.log("Auth: User is an Employee.");

        if (nameDisplay && empSnap.docs[0].data().name) {
            nameDisplay.textContent = `Team Member: ${empSnap.docs[0].data().name.split(' ')[0]}`;
        }
        if (emailDisplay) emailDisplay.textContent = checkEmail;

        if (!isEmployeePage) {
            window.location.href = 'employee.html';
            return;
        }
        return;
    }

    // 2. If not an employee, check if they are an OWNER
    console.log("Auth: Checking Firestore 'users' collection for UID:", window.currentUser.uid);

    const ownerDoc = await db.collection('users').doc(window.currentUser.uid).get();

    if (ownerDoc.exists && ownerDoc.data().role === 'owner') {
        // --- IT IS AN OWNER ---
        console.log("Auth: User is an Owner.");

        const userData = ownerDoc.data();
        let name = userData.name || window.currentUser.email;

        // If not impersonating, set name/email as normal
        if (!isImpersonating) {
            const firstName = name.split(' ')[0];
            if(nameDisplay) nameDisplay.textContent = `Welcome, ${firstName}!`;
            if(emailDisplay) emailDisplay.textContent = window.currentUser.email;
        }

        if (isEmployeePage) {
            window.location.href = 'index.html';
            return;
        }

        // Show the Owner Dashboard
        if (loginPage) loginPage.style.display = 'none';
        if (appLoading) appLoading.style.display = 'none';
        if (app) {
            app.style.display = 'flex';
            if (typeof loadMap === 'function') loadMap();

            // --- NEW: ENSURE ADMIN BUTTON IS RENDERED IMMEDIATELY ---
            if (user.email.toLowerCase() === ADMIN_EMAIL) {
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
                            toggleButton.style.backgroundColor = '#f59e0b';
                        }
                    } else {
                        if (statusLabel) statusLabel.textContent = 'STATUS: Dashboard View';
                        if (toggleButton) {
                            toggleButton.textContent = '🔥 Go to God Mode';
                            toggleButton.style.backgroundColor = '#ef4444';
                        }
                    }
                } else { // On admin.html
                    if (statusLabel) statusLabel.textContent = 'STATUS: God Mode Active';
                    if (toggleButton) {
                        toggleButton.textContent = '🔙 Exit to Dashboard';
                        toggleButton.style.backgroundColor = '#64748b';
                    }
                }
            }
            // --- END NEW ADMIN BUTTON LOGIC ---
        }
    } else {
        // --- UNKNOWN USER (Security Risk) ---
        console.warn("Auth: User is authenticated but has no role. Signing out.");
        alert(`Access Denied: Account not authorized.\n\nMissing Firestore Document for UID: ${window.currentUser.uid}`);
        auth.signOut();
    }

  } else {
    // --- NO USER LOGGED IN ---
    console.log("Auth: No user.");

    if (isEmployeePage) {
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
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  });
};