// js/auth.js
const firebaseConfig = {
  apiKey: "AIzaSyDOOQuFmcvGjCHe8PFT5r2TLYQDaYalubA",
  authDomain: "hail-mary-10391.firebaseapp.com",
  projectId: "hail-mary-10391",
  storageBucket: "hail-mary-10391.firebasestorage.app",
  messagingSenderId: "911770919550",
  appId: "1:911770919550:web:7f1a839e39d488b2072e2f"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
// We keep the storage reference initialization commented out to avoid the TypeError,
// as the Link Reference system does not rely on it.
// const storage = firebase.storage(); 

// Expose these to window so other scripts can access them
window.auth = auth;
window.db = db;
// window.storage = storage;
window.currentUser = null;

auth.onAuthStateChanged(user => {
  window.currentUser = user;

  const emailEl = document.getElementById('userEmail');
  if (emailEl) emailEl.textContent = user ? user.email : 'Loading...';

  const loginPage = document.getElementById('loginPage');
  const app = document.getElementById('app');
  const appLoading = document.getElementById('appLoading');

  if (user) {
    if (loginPage) loginPage.style.display = 'none';
    if (appLoading) appLoading.style.display = 'none';
    if (app) {
        app.style.display = 'flex';
        // CRITICAL FIX: Ensure loadMap runs right after successful login/refresh
        if (typeof loadMap === 'function') loadMap(); 
    }
  } else {
    if (loginPage) loginPage.style.display = 'flex';
    if (app) app.style.display = 'none';
    if (appLoading) appLoading.style.display = 'none';
  }
});

window.login = () => {
  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;
  if (!email || !password) return alert('Enter email & password');
  auth.signInWithEmailAndPassword(email, password).catch(e => alert(e.message));
};

window.logout = () => {
  auth.signOut().then(() => {
    // Auth state listener handles UI switch
  });
};