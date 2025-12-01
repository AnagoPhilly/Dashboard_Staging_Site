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
    window.currentUser = user;
    console.log("Auth: User detected:", user.email);

    // Elements to update in the Sidebar
    const nameDisplay = document.getElementById('userNameDisplay');
    const emailDisplay = document.getElementById('userEmailDisplay');

    // 1. Check if they are an EMPLOYEE
    const empSnap = await db.collection('employees').where('email', '==', user.email).get();

    if (!empSnap.empty) {
        // --- IT IS AN EMPLOYEE ---
        console.log("Auth: User is an Employee.");

        // Update Sidebar (if visible)
        if (nameDisplay && empSnap.docs[0].data().name) {
            nameDisplay.textContent = `Team Member: ${empSnap.docs[0].data().name.split(' ')[0]}`;
        }
        if (emailDisplay) emailDisplay.textContent = user.email;

        // If they are on the Owner Dashboard (index.html), kick them to the Employee Portal
        if (!isEmployeePage) {
            window.location.href = 'employee.html';
            return;
        }

        return; // Stop here if employee
    }

    // 2. If not an employee, check if they are an OWNER
    console.log("Auth: Checking Firestore 'users' collection for UID:", user.uid); // <--- DEBUGGING HELP
    
    const ownerDoc = await db.collection('users').doc(user.uid).get();

    if (ownerDoc.exists && ownerDoc.data().role === 'owner') {
        // --- IT IS AN OWNER ---
        console.log("Auth: User is an Owner.");

        const userData = ownerDoc.data();
        const name = userData.name || user.email;
        const firstName = name.split(' ')[0];

        // Update Sidebar Displays
        if(nameDisplay) nameDisplay.textContent = `Welcome, ${firstName}!`;
        if(emailDisplay) emailDisplay.textContent = user.email;

        // If they are on the Employee Portal, kick them back to Main Dash
        if (isEmployeePage) {
            window.location.href = 'index.html';
            return;
        }

        // Show the Owner Dashboard
        if (loginPage) loginPage.style.display = 'none';
        if (appLoading) appLoading.style.display = 'none';
        if (app) {
            app.style.display = 'flex';
            // Critical: Load Map if on Dashboard
            if (typeof loadMap === 'function') loadMap();
        }
    } else {
        // --- UNKNOWN USER (Security Risk) ---
        console.warn("Auth: User is authenticated but has no role. Signing out.");
        alert(`Access Denied: Account not authorized.\n\nMissing Firestore Document for UID: ${user.uid}`);
        auth.signOut();
    }

  } else {
    // --- NO USER LOGGED IN ---
    console.log("Auth: No user.");

    // If trying to access the restricted Employee page, kick to login
    if (isEmployeePage) {
        window.location.href = 'index.html';
        return;
    }

    // Show Login Screen
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

  // Show loading state on button
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
    // FORCE RELOAD: Clears memory/cache to prevent data leaks between Owner/Employee sessions
    window.location.href = 'index.html';
  });
};
