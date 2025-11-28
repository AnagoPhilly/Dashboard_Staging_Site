// js/accounts.js

function loadAccountsList() {
  if (!window.currentUser) return;

  const q = window.currentUser.email === 'admin@cleandash.com'
    ? db.collection('accounts')
    : db.collection('accounts').where('owner', '==', window.currentUser.email);

  q.orderBy('createdAt', 'desc').get().then(snap => {
    const div = document.getElementById('accountsList');
    if (snap.empty) {
      div.innerHTML = '<div style="text-align:center; padding:3rem; color:#6b7280;">No accounts yet — click "+ Add Account"</div>';
      return;
    }
    let html = `<table class="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Address</th>
          <th style="text-align:right;">Revenue</th>
          <th style="text-align:center;">Actions</th>
        </tr>
      </thead>
      <tbody>`;
      
    snap.forEach(doc => {
      const a = doc.data();
      // FIX 1: Escape special characters in both Name and Address to prevent syntax errors
      const safeName = a.name.replace(/'/g, "\\'");
      const safeAddress = a.address.replace(/'/g, "\\'"); 
      const startDateDisplay = a.startDate ? `<br><span style="font-size:0.75rem; color:#6b7280; font-weight:400;">Start: ${a.startDate}</span>` : '';
      
      // FIX 2: Removed the extra single quote after ${a.revenue} that was causing the crash
      html += `<tr>
        <td style="font-weight:600; color:#111827;">${a.name}${startDateDisplay}</td>
        <td style="color:#6b7280; font-size:0.9rem;">${a.address}</td>
        <td class="col-revenue">$${(a.revenue || 0).toLocaleString()}</td>
        <td style="text-align:center;">
            <div class="action-buttons">
                <button onclick="openSpecsModal('${doc.id}', '${safeName}', 'add')" 
                        class="btn-xs btn-specs-add">
                    <span>+</span> Specs
                </button>
                <button onclick="openSpecsModal('${doc.id}', '${safeName}', 'view')" 
                        class="btn-xs btn-specs-view">
                    <span>👁️</span> View
                </button>
                <button onclick="showEditAccount('${doc.id}', '${safeName}', '${safeAddress}', ${a.revenue || 0}, '${a.startDate || ''}')" 
                        class="btn-xs btn-edit">Edit</button>
                <button onclick="deleteAccount('${doc.id}', '${safeName}')" 
                        class="btn-xs btn-delete">Delete</button>
            </div>
        </td>
      </tr>`;
    });
    div.innerHTML = html + '</tbody></table>';
  });
}

// --- SPECS MODAL LOGIC (LINK REFERENCE VERSION) ---

window.openSpecsModal = function(id, name, mode) {
    document.getElementById('specsModal').style.display = 'flex';
    document.getElementById('specsModalTitle').textContent = `Specs: ${name}`;
    document.getElementById('currentSpecAccountId').value = id;
    
    // Clear inputs
    document.getElementById('newSpecName').value = '';
    document.getElementById('newSpecUrl').value = ''; 

    loadRealSpecs(id);

    if (mode === 'add') {
        setTimeout(() => document.getElementById('newSpecName').focus(), 100);
    }
};

window.closeSpecsModal = function() {
    document.getElementById('specsModal').style.display = 'none';
};

// SAVE LINK TO FIRESTORE (No Storage Cost)
window.saveSpecLink = async function() {
    const accountId = document.getElementById('currentSpecAccountId').value;
    const nameInput = document.getElementById('newSpecName');
    const urlInput = document.getElementById('newSpecUrl');
    const btn = document.querySelector('.specs-upload-box button');
    
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();

    if (!name || !url) {
        alert("Please enter a document name and a valid URL link.");
        return;
    }

    // Basic URL fix if they forgot https
    if (!url.match(/^https?:\/\//i)) {
        url = 'https://' + url;
    }

    try {
        btn.disabled = true;
        btn.textContent = "Saving...";

        await db.collection('accounts').doc(accountId).collection('specs').add({
            name: name,
            url: url,
            type: 'link',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        window.showToast(`Saved Link: ${name}`);
        nameInput.value = '';
        urlInput.value = '';
        loadRealSpecs(accountId);

    } catch (error) {
        console.error("Save error:", error);
        alert("Error saving link: " + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "Save Document Link";
    }
};

// LOAD SPECS
async function loadRealSpecs(accountId) {
    const listDiv = document.getElementById('specsList');
    listDiv.innerHTML = '<div class="empty-specs">Loading documents...</div>';

    try {
        const snap = await db.collection('accounts').doc(accountId).collection('specs')
                             .orderBy('createdAt', 'desc').get();

        if (snap.empty) {
            listDiv.innerHTML = '<div class="empty-specs">No specifications added yet.<br>Paste a Google Drive or Dropbox link above.</div>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const spec = doc.data();
            const dateStr = spec.createdAt ? new Date(spec.createdAt.toDate()).toLocaleDateString() : 'Just now';
            
            // Clean up display URL for UI
            let displayUrl = spec.url;
            if(displayUrl.length > 30) displayUrl = displayUrl.substring(0, 30) + '...';

            html += `
            <div class="spec-item">
                <div class="spec-info">
                    <div class="spec-icon">🔗</div>
                    <div>
                        <div class="spec-name">${spec.name}</div>
                        <div class="spec-meta"><a href="${spec.url}" target="_blank" style="color:#6b7280; text-decoration:none;">${displayUrl}</a> • ${dateStr}</div>
                    </div>
                </div>
                <div class="spec-actions">
                    <a href="${spec.url}" target="_blank" class="btn-view-doc">Open Link</a>
                    <span class="btn-delete-doc" onclick="deleteSpec('${accountId}', '${doc.id}')" title="Delete">&times;</span>
                </div>
            </div>
            `;
        });

        listDiv.innerHTML = html;

    } catch (error) {
        console.error("Load error:", error);
        listDiv.innerHTML = '<div class="empty-specs" style="color:red">Error loading documents.</div>';
    }
}

// DELETE SPEC
window.deleteSpec = async function(accountId, specId) {
    if (!confirm("Remove this document link?")) return;
    
    try {
        await db.collection('accounts').doc(accountId).collection('specs').doc(specId).delete();
        window.showToast("Link removed");
        loadRealSpecs(accountId);
    } catch (error) {
        alert("Error deleting: " + error.message);
    }
};

// --- CRUD Operations ---

window.showAddAccount = function() {
  document.getElementById('addAccountModal').style.display = 'flex';
}

window.hideAddAccount = function() {
  document.getElementById('addAccountModal').style.display = 'none';
  ['accountName','accountAddress','accountRevenue','accountStartDate'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
}

window.saveNewAccount = async () => {
    const name = document.getElementById('accountName').value.trim();
    const address = document.getElementById('accountAddress').value.trim();
    const revenue = Number(document.getElementById('accountRevenue').value);
    const startDate = document.getElementById('accountStartDate').value;

    if (!name || !address || !revenue) return alert('Please fill all fields');

    try {
        const url = `https://us1.locationiq.com/v1/search.php?key=${window.LOCATIONIQ_KEY}&q=${encodeURIComponent(address)}&format=json&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        
        const accountData = {
            name, address, revenue, startDate,
            owner: window.currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (data && data[0]) {
            accountData.lat = parseFloat(data[0].lat);
            accountData.lng = parseFloat(data[0].lon);
        }

        await db.collection('accounts').add(accountData);
        window.showToast('Account added!');
        hideAddAccount();
        loadAccountsList();
        if (typeof loadMap === 'function') loadMap();

    } catch (e) {
        alert('Error: ' + e.message);
    }
};

window.showEditAccount = function(id, name, address, revenue, startDate) {
  document.getElementById('editAccountId').value = id;
  document.getElementById('editAccountName').value = name;
  document.getElementById('editAccountAddress').value = address;
  document.getElementById('editAccountRevenue').value = revenue;
  document.getElementById('editAccountStartDate').value = startDate || '';
  document.getElementById('editAccountModal').style.display = 'flex';
}

window.hideEditAccount = function() {
  document.getElementById('editAccountModal').style.display = 'none';
}

window.saveEditedAccount = async (event) => {
    const btn = event.target;
    btn.disabled = true; btn.textContent = 'Saving...';
    
    const id = document.getElementById('editAccountId').value;
    const name = document.getElementById('editAccountName').value.trim();
    const address = document.getElementById('editAccountAddress').value.trim();
    const revenue = Number(document.getElementById('editAccountRevenue').value);
    const startDate = document.getElementById('editAccountStartDate').value;

    try {
        await db.collection('accounts').doc(id).update({ name, address, revenue, startDate });
        window.showToast('Updated!');
        window.hideEditAccount();
        loadAccountsList();
        if (typeof loadMap === 'function') loadMap();
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Save Changes';
    }
};

window.deleteAccount = async (id, name) => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
        await db.collection('accounts').doc(id).delete();
        window.showToast(`Deleted ${name}`);
        loadAccountsList();
        if (typeof loadMap === 'function') loadMap();
    } catch (error) {
        console.error(error);
    }
};

window.loadAccountsList = loadAccountsList;