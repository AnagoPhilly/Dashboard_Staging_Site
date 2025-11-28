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
        // This is a common pattern to ensure event listeners aren't duplicated if this function is called multiple times.
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
  const data = {
    name: document.getElementById('editName').value.trim(),
    address: document.getElementById('editAddress').value.trim(),
    // Parse inputs as numbers
    cfi: parseFloat(document.getElementById('editCfi').value) || 0,
    codb: parseFloat(document.getElementById('editCodb').value) || 25
  };

  db.collection('users').doc(uid).set(data, { merge: true }).then(() => {
    document.getElementById('saveSuccess').style.display = 'block';
    
    // Reload the view with new data
    loadProfile();
    
    setTimeout(() => {
      document.getElementById('saveSuccess').style.display = 'none';
      cancelEdit();
    }, 2000);
  }).catch(error => {
      // Use alert() here since this is user-triggered error feedback
      alert("Error saving profile: " + error.message);
  });
};

// Export functions to window so main.js can find them
window.loadProfile = loadProfile;
window.initProfileListeners = initProfileListeners;