// js/profile.js

function loadProfile() {
  console.log("CleanDash: Loading Profile...");
  
  // Safety check: Is user logged in?
  if (!window.currentUser) {
      console.warn("CleanDash: No user logged in for profile.");
      return;
  }

  const uid = window.currentUser.uid;
  
  db.collection('users').doc(uid).get().then(doc => {
    const data = doc.exists ? doc.data() : {};
    
    // Populate the "View" mode
    setText('viewName', data.name || 'Not set');
    setText('viewEmail', window.currentUser.email);
    setText('viewAddress', data.address || 'Not set');
    setText('viewCfi', (data.cfi || 0).toFixed(2));
    setText('viewCodb', (data.codb || 25) + '%');

    // Populate the "Edit" mode inputs
    setValue('editName', data.name || '');
    setValue('editEmail', window.currentUser.email);
    setValue('editAddress', data.address || '');
    setValue('editCfi', data.cfi || '');
    setValue('editCodb', data.codb || '');

    // NEW: Populate Alert Threshold (Default to 15 if missing)
    setValue('editAlertThreshold', data.alertThreshold || 15);

  }).catch(error => {
      console.error("CleanDash: Error loading profile:", error);
  });
}

// Helper to safely set text content
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Helper to safely set input value
function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function initProfileListeners() {
    console.log("CleanDash: Attaching profile listeners...");
    const editBtn = document.getElementById('editProfileBtn');

    if (editBtn) {
        // Remove old listeners to be safe (cloning trick), then re-add
        const newBtn = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newBtn, editBtn);

        newBtn.addEventListener('click', () => {
            document.getElementById('profileView').style.display = 'none';
            document.getElementById('profileEdit').style.display = 'block';
        });
    } else {
        console.error("CleanDash: Edit Profile button not found in HTML.");
    }
}

window.cancelEdit = function() {
  document.getElementById('profileView').style.display = 'grid';
  document.getElementById('profileEdit').style.display = 'none';
};

window.saveProfile = function() {
  if (!window.currentUser) return;

  const uid = window.currentUser.uid;

  // Gather data from inputs
  const data = {
    name: document.getElementById('editName').value.trim(),
    address: document.getElementById('editAddress').value.trim(),
    // Parse inputs as numbers
    cfi: parseFloat(document.getElementById('editCfi').value) || 0,
    codb: parseFloat(document.getElementById('editCodb').value) || 25,
    // NEW: Save Alert Threshold
    alertThreshold: parseInt(document.getElementById('editAlertThreshold').value) || 15
  };

  db.collection('users').doc(uid).set(data, { merge: true }).then(() => {
    document.getElementById('saveSuccess').style.display = 'block';

    // Reload the view with new data
    loadProfile();

    // Also refresh map and calculator since they use profile data
    if (typeof window.loadMap === 'function') window.loadMap();
    if (typeof window.populateCfi === 'function') window.populateCfi();

    setTimeout(() => {
      document.getElementById('saveSuccess').style.display = 'none';
      cancelEdit();
    }, 2000);
  }).catch(error => {
      alert("Error saving profile: " + error.message);
  });
};

// Export functions to window so main.js can find them
window.loadProfile = loadProfile;
window.initProfileListeners = initProfileListeners;