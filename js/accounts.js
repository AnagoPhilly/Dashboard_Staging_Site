// js/accounts.js

let editMap = null;
let editMarker = null;

function loadAccountsList() {
  if (!window.currentUser) return;

  // --- DEV BUTTON VISIBILITY CHECK (Only for Nate) ---
  if (window.currentUser.email === 'nate@anagophilly.com') {
      const devBtn = document.getElementById('btnDeleteAllAccounts');
      if (devBtn) {
          devBtn.style.display = 'inline-block';
      }
  }
  // ---------------------------------------------------

  // VISIBILITY FIX: Always filter by owner so you don't see other users' data in this view.
  const q = db.collection('accounts').where('owner', '==', window.currentUser.email);

  q.orderBy('createdAt', 'desc').get().then(snap => {
    const activeDiv = document.getElementById('accountsList');
    const inactiveDiv = document.getElementById('inactiveAccountsList');

    if (snap.empty) {
      if(activeDiv) activeDiv.innerHTML = '<div style="text-align:center; padding:3rem; color:#6b7280;">No accounts yet — click "+ Add Account"</div>';
      if(inactiveDiv) inactiveDiv.innerHTML = '';
      return;
    }

    const tableHead = `<table class="data-table"><thead><tr><th>Name / Contact</th><th>Address / Alarm</th><th style="text-align:right;">Revenue</th><th style="text-align:center;">Actions</th></tr></thead><tbody>`;
    const inactiveHead = `<table class="data-table" style="opacity:0.7;"><thead><tr><th>Name</th><th>Reason</th><th style="text-align:right;">End Date</th><th style="text-align:center;">Actions</th></tr></thead><tbody>`;

    let activeRows = '';
    let inactiveRows = '';
    let hasActive = false;
    let hasInactive = false;

    const today = new Date().toISOString().split('T')[0];

    snap.forEach(doc => {
      const a = doc.data();
      const safeName = (a.name || '').replace(/'/g, "\\'");
      const safeAddress = (a.address || '').replace(/'/g, "\\'");

      // Get split address parts (with fallbacks)
      const safeStreet = (a.street || '').replace(/'/g, "\\'");
      const safeCity = (a.city || '').replace(/'/g, "\\'");
      const safeState = (a.state || 'PA').replace(/'/g, "\\'");
      const safeZip = (a.zip || '').replace(/'/g, "\\'");

      const lat = a.lat || 0;
      const lng = a.lng || 0;

      const isInactive = a.endDate && a.endDate <= today;

      if (!isInactive) {
          // --- ACTIVE ROW ---
          hasActive = true;

          let contactParts = [];
          if (a.contactName) contactParts.push(`👤 ${a.contactName}`);
          if (a.contactPhone) contactParts.push(`📞 ${a.contactPhone}`);
          if (a.contactEmail) contactParts.push(`✉️ ${a.contactEmail}`);

          const contactDisplay = contactParts.length > 0 ? `<div style="font-size:0.8rem; color:#6b7280; margin-top:2px;">${contactParts.join(' &nbsp;•&nbsp; ')}</div>` : '';
          const alarmDisplay = a.alarmCode ? `<div style="font-size:0.75rem; color:#ef4444; font-weight:bold; margin-top:2px;">🚨 ${a.alarmCode}</div>` : '';
          const pidDisplay = a.pid ? `<span style="font-size:0.7rem; background:#e0f2fe; color:#0369a1; padding:1px 4px; border-radius:4px; margin-left:5px;">${a.pid}</span>` : '';

          // UPDATE: Pass split fields to showEditAccount
          activeRows += `<tr>
            <td><div style="font-weight:600; color:#111827;">${a.name} ${pidDisplay}</div>${contactDisplay}</td>
            <td><div style="color:#4b5563; font-size:0.9rem;">${a.address}</div>${alarmDisplay}</td>
            <td class="col-revenue">$${(a.revenue || 0).toLocaleString()}</td>
            <td style="text-align:center;">
                <div class="action-buttons">
                    <button onclick="openSpecsModal('${doc.id}', '${safeName}', 'view')" class="btn-xs btn-specs-view">Specs</button>
                    <button onclick="showEditAccount('${doc.id}', '${safeName}', '${safeAddress}', '${safeStreet}', '${safeCity}', '${safeState}', '${safeZip}', ${a.revenue||0}, '${a.startDate||''}', '${a.endDate||''}', '${a.contactName||''}', '${a.contactPhone||''}', '${a.contactEmail||''}', '${a.alarmCode||''}', ${lat}, ${lng})" class="btn-xs btn-edit">Edit</button>
                    <button onclick="deleteAccount('${doc.id}', '${safeName}', false)" class="btn-xs" style="border:1px solid #ef4444; color:#ef4444; background:white;">Cancel</button>
                </div>
            </td>
          </tr>`;
      } else {
          // --- INACTIVE ROW ---
          hasInactive = true;
          inactiveRows += `<tr>
            <td><div style="font-weight:600; color:#4b5563;">${a.name}</div><div style="font-size:0.8rem;">${a.address}</div></td>
            <td style="color:#ef4444; font-weight:500;">${a.cancelReason || a.inactiveReason || 'Unknown'}</td>
            <td style="text-align:right; font-family:monospace;">${a.endDate}</td>
            <td style="text-align:center;">
                <button onclick="reactivateAccount('${doc.id}')" class="btn-xs" style="border:1px solid #10b981; color:#10b981;">Reactivate</button>
                <button onclick="deleteAccount('${doc.id}', '${safeName}', true)" class="btn-xs btn-delete">Delete</button>
            </td>
          </tr>`;
      }
    });

    if(activeDiv) activeDiv.innerHTML = hasActive ? tableHead + activeRows + '</tbody></table>' : '<div style="padding:2rem; text-align:center; color:#ccc;">No active accounts.</div>';
    if(inactiveDiv) inactiveDiv.innerHTML = hasInactive ? inactiveHead + inactiveRows + '</tbody></table>' : '<div style="padding:1rem; text-align:center; color:#eee;">No canceled/inactive accounts.</div>';

    if (typeof loadMap === 'function') setTimeout(loadMap, 50);

  });
}

// --- EDIT ACCOUNT ---
// UPDATED: Now accepts split address fields
window.showEditAccount = function(id, name, fullAddr, street, city, state, zip, revenue, startDate, endDate, cName, cPhone, cEmail, alarm, lat, lng) {
  document.getElementById('editAccountId').value = id;
  document.getElementById('editAccountName').value = name;

  // Populate Split Fields
  document.getElementById('editAccountStreet').value = street || fullAddr; // Fallback to full if street missing
  document.getElementById('editAccountCity').value = city || '';
  document.getElementById('editAccountState').value = state || 'PA';
  document.getElementById('editAccountZip').value = zip || '';

  document.getElementById('editAccountRevenue').value = revenue;
  document.getElementById('editAccountStartDate').value = startDate || '';
  document.getElementById('editAccountEndDate').value = endDate || '';
  document.getElementById('editContactName').value = cName || '';
  document.getElementById('editContactPhone').value = cPhone || '';
  document.getElementById('editContactEmail').value = cEmail || '';
  document.getElementById('editAccountAlarm').value = alarm || '';

  document.getElementById('editAccountModal').style.display = 'flex';

  const ADMIN_EMAIL = 'nate@anagophilly.com';
  const SYSTEM_ADMIN_EMAIL = 'admin@cleandash.com';

  const isAdmin = (
      window.currentUser.email === ADMIN_EMAIL ||
      window.currentUser.email === SYSTEM_ADMIN_EMAIL ||
      window.currentUser.originalAdminEmail === ADMIN_EMAIL
  );

  const helpText = document.getElementById('pinHelpText');
  if (helpText) {
      if (isAdmin) {
          helpText.textContent = "🔓 ADMIN MODE: You can drag this pin to fix location errors.";
          helpText.style.color = "#0d9488";
          helpText.style.fontWeight = "bold";
      } else {
          helpText.textContent = "🔒 Pin location is locked. Contact Home Office to adjust.";
          helpText.style.color = "#6b7280";
          helpText.style.fontWeight = "normal";
      }
  }

  setTimeout(() => {
      const startLat = lat || 39.9526;
      const startLng = lng || -75.1652;
      const zoom = lat ? 18 : 10;

      if (!editMap) {
          editMap = L.map('editAccountMap').setView([startLat, startLng], zoom);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 21,
              attribution: '© OpenStreetMap'
          }).addTo(editMap);

          editMarker = L.marker([startLat, startLng], { draggable: isAdmin }).addTo(editMap);

          if (isAdmin) {
              editMarker.bindPopup("Admin Mode: Drag to fix!").openPopup();
          }
      } else {
          editMap.invalidateSize();
          editMap.setView([startLat, startLng], zoom);
          editMarker.setLatLng([startLat, startLng]);

          if (editMarker.dragging) {
              isAdmin ? editMarker.dragging.enable() : editMarker.dragging.disable();
          }
      }
  }, 200);
};

window.setPinToUserLocation = function() {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = "Locating...";
    btn.disabled = true;

    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        btn.textContent = originalText;
        btn.disabled = false;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            if (editMarker && editMap) {
                const newLatLng = new L.LatLng(lat, lng);
                editMarker.setLatLng(newLatLng);
                editMap.setView(newLatLng, 18);
                editMarker.bindPopup(`<b>Updated from GPS!</b><br>Accuracy: ~${Math.round(accuracy)}m`).openPopup();
            }

            window.showToast("Pin moved to your location!");
            btn.textContent = originalText;
            btn.disabled = false;
        },
        (error) => {
            console.error("Error getting location:", error);
            alert("Could not get your location. Please ensure GPS is enabled.");
            btn.textContent = originalText;
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
};

window.saveEditedAccount = async (event) => {
    const btn = event.target;
    btn.disabled = true; btn.textContent = 'Saving...';

    const id = document.getElementById('editAccountId').value;
    const name = document.getElementById('editAccountName').value.trim();

    // NEW: Get Split Fields
    const street = document.getElementById('editAccountStreet').value.trim();
    const city = document.getElementById('editAccountCity').value.trim();
    const state = document.getElementById('editAccountState').value.trim();
    const zip = document.getElementById('editAccountZip').value.trim();
    const fullAddress = `${street}, ${city}, ${state} ${zip}`;

    const revenue = Number(document.getElementById('editAccountRevenue').value);
    const startDate = document.getElementById('editAccountStartDate').value;
    const endDate = document.getElementById('editAccountEndDate').value;
    const alarm = document.getElementById('editAccountAlarm').value.trim();
    const cName = document.getElementById('editContactName').value.trim();
    const cPhone = document.getElementById('editContactPhone').value.trim();
    const cEmail = document.getElementById('editContactEmail').value.trim();

    try {
        const finalLatLng = editMarker ? editMarker.getLatLng() : { lat: 0, lng: 0 };

        const updateData = {
            name,
            address: fullAddress,
            street, city, state, zip, // Save split fields
            revenue, startDate, endDate: endDate || null,
            alarmCode: alarm, contactName: cName, contactPhone: cPhone, contactEmail: cEmail,
            lat: finalLatLng.lat,
            lng: finalLatLng.lng
        };

        const currentDoc = await db.collection('accounts').doc(id).get();
        const currentData = currentDoc.data();

        // Check if address changed, if so re-geocode
        if (fullAddress !== (currentData.address || '')) {
            try {
                // STRUCTURED SEARCH
                const baseUrl = "https://us1.locationiq.com/v1/search.php";
                const params = new URLSearchParams({
                    key: window.LOCATIONIQ_KEY,
                    street: street,
                    city: city,
                    state: state,
                    postalcode: zip,
                    format: 'json',
                    limit: 1,
                    countrycodes: 'us'
                });

                const res = await fetch(`${baseUrl}?${params.toString()}`);
                const data = await res.json();

                if (data && data[0]) {
                    // Update pin if user didn't move it manually
                    if (currentData.lat === finalLatLng.lat && currentData.lng === finalLatLng.lng) {
                        updateData.lat = parseFloat(data[0].lat);
                        updateData.lng = parseFloat(data[0].lon);
                    }
                }
            } catch (geoErr) {
                console.warn("CleanDash: Geocoding failed, keeping pin at current location.", geoErr);
            }
        }

        if (endDate && endDate !== (currentData.endDate || '')) {
            const today = new Date().toISOString().split('T')[0];
            if (endDate <= today) {
                openInactiveReasonModal(id, 'soft_delete', name);
                return;
            }
        }

        await db.collection('accounts').doc(id).update(updateData);
        window.showToast('Account Saved!');
        loadAccountsList();

        if (typeof loadMap === 'function') loadMap();
        if (typeof generateMetricsGraphFromDB === 'function') generateMetricsGraphFromDB();

    } catch (e) { alert('Error: ' + e.message); }
    finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
};


// --- DEV FUNCTION: SAFE DELETE ONLY MY ACCOUNTS ---
window.deleteAllAccountsForDev = async function() {
    const ADMIN_EMAIL = 'nate@anagophilly.com';

    if (!window.currentUser || window.currentUser.email !== ADMIN_EMAIL) {
        return alert("Access Denied: This is a restricted developer function.");
    }

    const btn = document.getElementById('btnDeleteAllAccounts');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "DELETING MY ACCOUNTS...";

    try {
        const snap = await db.collection('accounts').get();

        if (snap.empty) {
            alert("No accounts found in database.");
            btn.disabled = false; btn.textContent = originalText;
            return;
        }

        const batchSize = 400;
        let batch = db.batch();
        let count = 0;
        let deletedTotal = 0;

        for (const doc of snap.docs) {
            const data = doc.data();

            // CRITICAL SAFETY CHECK:
            // Only delete accounts explicitly owned by 'nate@anagophilly.com'.
            if (data.owner === ADMIN_EMAIL) {
                batch.delete(doc.ref);
                count++;
                deletedTotal++;

                if (count >= batchSize) {
                    await batch.commit();
                    batch = db.batch();
                    count = 0;
                }
            }
        }

        if (count > 0) {
            await batch.commit();
        }

        window.showToast(`Deleted ${deletedTotal} accounts (Yours Only).`);
        loadAccountsList();
        if (typeof loadMap === 'function') loadMap();

    } catch (e) {
        alert("Error deleting accounts: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
};

// --- INACTIVE/DELETE MODALS ---
window.openInactiveReasonModal = function(accountId, type, currentName) {
    document.getElementById('inactiveReasonModal').style.display = 'flex';
    document.getElementById('inactiveAccountId').value = accountId;
    document.getElementById('actionType').value = type;

    document.getElementById('otherReasonInput').value = '';
    document.getElementById('otherReasonInput').style.display = 'none';
    document.querySelectorAll('input[name="inactiveReason"]').forEach(radio => radio.checked = false);

    document.getElementById('inactiveReasonTitle').textContent = `Mark ${currentName} Inactive`;
    document.getElementById('btnConfirmInactive').textContent = 'Confirm Inactivation';
};

window.closeInactiveReasonModal = function() {
    document.getElementById('inactiveReasonModal').style.display = 'none';
};

window.confirmInactiveAction = async function() {
    const accountId = document.getElementById('inactiveAccountId').value;
    const selectedReason = document.querySelector('input[name="inactiveReason"]:checked')?.value;
    const otherReason = document.getElementById('otherReasonInput').value.trim();

    if (!selectedReason) return alert("Please select a reason.");
    if (selectedReason === 'Other' && !otherReason) return alert("Please specify the reason.");

    const finalReason = selectedReason === 'Other' ? `Other: ${otherReason}` : selectedReason;

    const btn = document.getElementById('btnConfirmInactive');
    btn.disabled = true; btn.textContent = "Processing...";

    try {
        const endDate = new Date().toISOString().split('T')[0];
        await db.collection('accounts').doc(accountId).update({
            endDate: endDate,
            inactiveReason: finalReason
        });
        window.showToast("Account moved to Inactive.");
        closeInactiveReasonModal();
        loadAccountsList();
        if (typeof loadMap === 'function') loadMap();
        if (typeof generateMetricsGraphFromDB === 'function') generateMetricsGraphFromDB();
    } catch (e) { alert("Error: " + e.message); }
    finally { btn.disabled = false; btn.textContent = 'Confirm Inactivation'; }
};

window.deleteAccount = async (id, name, isAlreadyInactive) => {
    if (isAlreadyInactive) {
        if(confirm(`PERMANENTLY DELETE ${name}?\n\nThis cannot be undone.`)) {
             await performHardDelete(id);
        }
    } else {
        const choice = confirm(`You are removing ${name}.\n\n- Click OK to MARK INACTIVE (Recommended).\n- Click CANCEL to PERMANENTLY DELETE.`);
        if (choice) {
            openInactiveReasonModal(id, 'soft_delete', name);
        } else {
            if(confirm(`Are you sure you want to permanently delete ${name}? All history will be lost.`)) {
                await performHardDelete(id);
            }
        }
    }
};

async function performHardDelete(id) {
    try {
        await db.collection('accounts').doc(id).delete();
        window.showToast("Account Permanently Deleted");
        loadAccountsList();
        if (typeof loadMap === 'function') loadMap();
    } catch(e) { alert("Delete failed: " + e.message); }
}

// --- SPECS & DOCS ---
window.openSpecsModal = function(id, name, mode) {
    document.getElementById('specsModal').style.display = 'flex';
    document.getElementById('specsModalTitle').textContent = `Specs: ${name}`;
    document.getElementById('currentSpecAccountId').value = id;

    document.getElementById('newSpecName').value = '';
    document.getElementById('newSpecUrl').value = '';
    loadRealSpecs(id);
    if (mode === 'add') {
        setTimeout(() => document.getElementById('newSpecName').focus(), 100);
    }
};

window.closeSpecsModal = function() { document.getElementById('specsModal').style.display = 'none'; };

window.saveSpecLink = async function() {
    const accountId = document.getElementById('currentSpecAccountId').value;
    const nameInput = document.getElementById('newSpecName');
    const urlInput = document.getElementById('newSpecUrl');
    const btn = document.querySelector('.specs-upload-box button');

    const name = nameInput.value.trim();
    let url = urlInput.value.trim();

    if (!name || !url) return alert("Please enter a document name and a valid URL link.");
    if (!url.match(/^https?:\/\//i)) url = 'https://' + url;

    try {
        btn.disabled = true; btn.textContent = "Saving...";
        await db.collection('accounts').doc(accountId).collection('specs').add({
            name: name, url: url, type: 'link',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        window.showToast(`Saved Link: ${name}`);
        nameInput.value = ''; urlInput.value = '';
        loadRealSpecs(accountId);
    } catch (error) { alert("Error: " + error.message); }
    finally { btn.disabled = false; btn.textContent = "Save Document Link"; }
};

async function loadRealSpecs(accountId) {
    const listDiv = document.getElementById('specsList');
    listDiv.innerHTML = '<div class="empty-specs">Loading documents...</div>';

    try {
        const snap = await db.collection('accounts').doc(accountId).collection('specs').orderBy('createdAt', 'desc').get();
        if (snap.empty) {
            listDiv.innerHTML = '<div class="empty-specs">No specifications added yet.<br>Paste a Google Drive or Dropbox link above.</div>';
            return;
        }
        let html = '';
        snap.forEach(doc => {
            const spec = doc.data();
            const dateStr = spec.createdAt ? new Date(spec.createdAt.toDate()).toLocaleDateString() : 'Just now';
            html += `
            <div class="spec-item">
                <div class="spec-info">
                    <div class="spec-icon">🔗</div>
                    <div>
                        <div class="spec-name">${spec.name}</div>
                        <div class="spec-meta"><a href="${spec.url}" target="_blank" style="color:#6b7280; text-decoration:none;">${spec.url.substring(0,30)}...</a> • ${dateStr}</div>
                    </div>
                </div>
                <div class="spec-actions">
                    <a href="${spec.url}" target="_blank" class="btn-view-doc">Open Link</a>
                    <span class="btn-delete-doc" onclick="deleteSpec('${accountId}', '${doc.id}')" title="Delete">&times;</span>
                </div>
            </div>`;
        });
        listDiv.innerHTML = html;
    } catch (error) { listDiv.innerHTML = '<div class="empty-specs" style="color:red">Error loading documents.</div>'; }
}

window.deleteSpec = async function(accountId, specId) {
    if (!confirm("Remove this document link?")) return;
    try {
        await db.collection('accounts').doc(accountId).collection('specs').doc(specId).delete();
        window.showToast("Link removed");
        loadRealSpecs(accountId);
    } catch (error) { alert("Error: " + error.message); }
};

window.reactivateAccount = async function(id) {
    if(!confirm("Reactivate this account? It will move back to the Active list.")) return;
    try {
        await db.collection('accounts').doc(id).update({ endDate: null, cancelReason: null, inactiveReason: null });
        window.showToast("Account Reactivated!");
        loadAccountsList();
    } catch(e) { console.error(e); }
};

// --- CRUD Operations ---
window.showAddAccount = function() { document.getElementById('addAccountModal').style.display = 'flex'; }
window.hideAddAccount = window.hideAddAccount;

// --- SAVE NEW ACCOUNT WITH STRUCTURED GPS ---
window.saveNewAccount = async () => {
    // 1. Get Split Inputs
    const pid = document.getElementById('accountPID') ? document.getElementById('accountPID').value.trim() : '';
    const name = document.getElementById('accountName').value.trim();

    // New Split Fields
    const street = document.getElementById('accountStreet').value.trim();
    const city = document.getElementById('accountCity').value.trim();
    const state = document.getElementById('accountState').value.trim();
    const zip = document.getElementById('accountZip').value.trim();

    // Reconstruct full address for display/database saving
    const fullAddress = `${street}, ${city}, ${state} ${zip}`;

    const revenue = Number(document.getElementById('accountRevenue').value);
    const startDate = document.getElementById('accountStartDate').value;
    const endDate = document.getElementById('accountEndDate').value;
    const alarm = document.getElementById('accountAlarm').value.trim();
    const cName = document.getElementById('contactName').value.trim();
    const cPhone = document.getElementById('contactPhone').value.trim();
    const cEmail = document.getElementById('contactEmail').value.trim();

    if (!name || !street || !city || !startDate) return alert('Name, Street, City, and Start Date required');

    try {
        // 2. STRUCTURED GEOCODING (Higher Accuracy)
        const baseUrl = "https://us1.locationiq.com/v1/search.php";
        const params = new URLSearchParams({
            key: window.LOCATIONIQ_KEY,
            street: street,
            city: city,
            state: state,
            postalcode: zip,
            format: 'json',
            limit: 1,
            countrycodes: 'us'
        });

        const res = await fetch(`${baseUrl}?${params.toString()}`);
        const data = await res.json();

        const accountData = {
            pid: pid,
            name,
            address: fullAddress,
            street, city, state, zip, // Save splits too
            revenue, startDate, endDate: endDate || null, alarmCode: alarm,
            contactName: cName, contactPhone: cPhone, contactEmail: cEmail,
            owner: window.currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (data && data[0]) {
            accountData.lat = parseFloat(data[0].lat);
            accountData.lng = parseFloat(data[0].lon);
        }

        await db.collection('accounts').add(accountData);
        window.showToast('Account added!');

        // Clear inputs manually
        document.getElementById('accountName').value = '';
        document.getElementById('accountStreet').value = '';
        document.getElementById('accountCity').value = '';
        document.getElementById('accountZip').value = '';

        window.hideAddAccount();
        loadAccountsList();
        if (typeof loadMap === 'function') loadMap();

    } catch (e) { alert('Error: ' + e.message); }
};

// --- PID AUTO FILL LOGIC (FIXED TO SPLIT ADDRESS) ---
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnPidAutoFill');
    if(btn) btn.addEventListener('click', runPidAutoFill);
});

async function runPidAutoFill() {
    const pidInput = document.getElementById('accountPID');
    const pid = pidInput.value.trim();
    if (!pid) return alert("Please enter an Account ID (PID) first.");

    const btn = document.getElementById('btnPidAutoFill');
    const originalText = btn.innerHTML;
    btn.textContent = "Searching...";
    btn.disabled = true;

    try {
        const doc = await db.collection('master_client_list').doc(pid).get();

        if (!doc.exists) {
            alert(`PID "${pid}" not found in the master database.`);
            btn.innerHTML = "❌ Not Found";
            setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
            return;
        }

        const data = doc.data();

        if(document.getElementById('accountName')) document.getElementById('accountName').value = data.name || '';
        if(document.getElementById('accountRevenue')) document.getElementById('accountRevenue').value = data.revenue || '';
        if(document.getElementById('accountStartDate')) document.getElementById('accountStartDate').value = data.startDate || '';
        if(document.getElementById('contactName')) document.getElementById('contactName').value = data.contactName || '';
        if(document.getElementById('contactPhone')) document.getElementById('contactPhone').value = data.contactPhone || '';
        if(document.getElementById('contactEmail')) document.getElementById('contactEmail').value = data.contactEmail || '';

        // --- NEW: PARSE ADDRESS STRING INTO SPLIT FIELDS ---
        if (data.street) {
            // If we have clean split data from master, use it
            if(document.getElementById('accountStreet')) document.getElementById('accountStreet').value = data.street;
            if(document.getElementById('accountCity')) document.getElementById('accountCity').value = data.city;
            if(document.getElementById('accountState')) document.getElementById('accountState').value = data.state;
            if(document.getElementById('accountZip')) document.getElementById('accountZip').value = data.zip;
        } else if (data.address) {
            // Fallback: Parse old combined address
            const parts = data.address.split(',').map(s => s.trim());
            const streetInput = document.getElementById('accountStreet');
            const cityInput = document.getElementById('accountCity');
            const stateInput = document.getElementById('accountState');
            const zipInput = document.getElementById('accountZip');

            if (streetInput) streetInput.value = parts[0] || '';

            if (parts.length >= 4) {
                if (cityInput) cityInput.value = parts[1];
                if (stateInput) stateInput.value = parts[2];
                if (zipInput) zipInput.value = parts[3];
            } else if (parts.length === 3) {
                if (cityInput) cityInput.value = parts[1];
                const lastPart = parts[2];
                const zipMatch = lastPart.match(/\b\d{5}\b/);
                if (zipMatch) {
                    if (zipInput) zipInput.value = zipMatch[0];
                    if (stateInput) stateInput.value = lastPart.replace(zipMatch[0], '').trim();
                } else {
                    if (stateInput) stateInput.value = lastPart;
                }
            } else {
                if (parts.length >= 2 && cityInput) cityInput.value = parts[1];
            }
        }

        window.showToast(`Found: ${data.name}`);
        btn.innerHTML = "✅ Data Loaded!";
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);

    } catch (error) {
        console.error("Auto Fill Error:", error);
        alert("Error connecting to database.");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.loadAccountsList = loadAccountsList;