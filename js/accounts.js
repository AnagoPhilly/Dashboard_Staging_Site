// js/accounts.js

let editMap = null;
let editMarker = null;
let editCircle = null;

// --- 1. HELPER: TOGGLE DAY CHIP VISUALS ---
window.toggleDayChip = function(el) {
    el.classList.toggle('selected');
};

// --- 2. HELPER: DRAW/UPDATE GEOFENCE CIRCLE ---
function updateGeofenceCircle(lat, lng, radius) {
    if (!editMap) return;
    const safeRadius = Math.max(5, parseFloat(radius) || 200);

    if (editCircle) {
        if (editMap.hasLayer(editCircle)) editMap.removeLayer(editCircle);
    }

    editCircle = L.circle([lat, lng], {
        color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.2, weight: 2, radius: safeRadius
    }).addTo(editMap);
}

function handleGeofenceInputChange() {
    const radius = this.value;
    if (editMarker) {
        const latLng = editMarker.getLatLng();
        updateGeofenceCircle(latLng.lat, latLng.lng, radius);
    }
}

// --- 3. MAIN LIST LOADER ---
window.loadAccountsList = function() {
  if (!window.currentUser) return;
  const activeDiv = document.getElementById('accountsList');
  const inactiveDiv = document.getElementById('inactiveAccountsList');
  if(activeDiv) activeDiv.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">Loading Accounts...</div>';

  const q = db.collection('accounts').where('owner', '==', window.currentUser.email);

  q.orderBy('createdAt', 'desc').get().then(snap => {

    if (snap.empty) {
      if(activeDiv) activeDiv.innerHTML = '<div style="text-align:center; padding:3rem; color:#6b7280;">No accounts yet — click "+ Add Account"</div>';
      if(inactiveDiv) inactiveDiv.innerHTML = '';
      return;
    }

    const tableHead = `<table class="data-table"><thead><tr><th>Name / Contact</th><th>Address / Alarm</th><th style="text-align:right;">Revenue</th><th style="text-align:center;">Actions</th></tr></thead><tbody>`;
    const inactiveHead = `<table class="data-table" style="opacity:0.7;"><thead><tr><th>Name</th><th>Reason</th><th style="text-align:right;">End Date</th><th style="text-align:center;">Actions</th></tr></thead><tbody>`;

    let activeRows = '', inactiveRows = '', hasActive = false, hasInactive = false;
    const today = new Date().toISOString().split('T')[0];

    snap.forEach(doc => {
      const a = doc.data();
      const safeName = (a.name || '').replace(/'/g, "\\'");
      const safeAlarm = (a.alarmCode || '').replace(/'/g, "\\'");
      const isInactive = a.endDate && a.endDate <= today;

      // Handle Service Days (Array -> String for passing to function)
      const serviceDays = (a.serviceDays || []).join(',');

      if (!isInactive) {
          hasActive = true;
          const lat = a.lat || 0;
          const lng = a.lng || 0;
          const geofence = a.geofenceRadius || 50;

          activeRows += `<tr>
            <td><div style="font-weight:600; color:#111827;">${a.name}</div><div style="font-size:0.8rem; color:#6b7280;">${a.contactName || ''}</div></td>
            <td><div style="color:#4b5563; font-size:0.9rem;">${a.address}</div>${a.alarmCode ? `<div style="font-size:0.75rem; color:#ef4444; font-weight:bold; margin-top:2px;">🚨 ${a.alarmCode}</div>` : ''}</td>
            <td class="col-revenue">$${(a.revenue || 0).toLocaleString()}</td>
            <td style="text-align:center;">
                <div class="action-buttons">
                    <button onclick="openSpecsModal('${doc.id}', '${safeName}', 'view')" class="btn-xs btn-specs-view">Specs</button>
                    <button onclick="showEditAccount('${doc.id}', '${safeName}', '${safeAlarm}', ${geofence}, ${lat}, ${lng}, '${serviceDays}')" class="btn-xs btn-edit">Edit</button>
                </div>
            </td>
          </tr>`;
      } else {
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
};

// --- 4. SHOW EDIT ACCOUNT MODAL ---
window.showEditAccount = function(id, name, alarm, geofence, lat, lng, daysStr) {
  document.getElementById('editAccountId').value = id;
  const titleEl = document.getElementById('editAccountModalTitle');
  if(titleEl) titleEl.textContent = `Edit: ${name}`;

  const alarmEl = document.getElementById('editAccountAlarm');
  const geoEl = document.getElementById('editAccountGeofence');

  if(alarmEl) alarmEl.value = alarm || '';
  if(geoEl) geoEl.value = geofence || 200;

  // --- NEW: POPULATE DAY CHIPS ---
  const days = daysStr ? daysStr.split(',') : [];
  const chips = document.querySelectorAll('#editServiceDaysContainer .day-chip');
  chips.forEach(chip => {
      const dayText = chip.textContent.trim();
      if (days.includes(dayText)) chip.classList.add('selected');
      else chip.classList.remove('selected');
  });

  document.getElementById('editAccountModal').style.display = 'flex';

  // --- MAP LOGIC ---
  const ADMIN_EMAIL = 'nate@anagophilly.com';
  const SYSTEM_ADMIN_EMAIL = 'admin@cleandash.com';
  const isAdmin = (window.currentUser.email === ADMIN_EMAIL || window.currentUser.email === SYSTEM_ADMIN_EMAIL);

  const helpText = document.getElementById('pinHelpText');
  if (helpText) {
      helpText.textContent = isAdmin ? "🔓 ADMIN MODE: Drag pin to set location." : "🔒 Pin location locked. Contact Admin.";
      helpText.style.color = isAdmin ? "#0d9488" : "#6b7280";
  }

  setTimeout(() => {
      const startLat = lat || 39.9526;
      const startLng = lng || -75.1652;
      const zoom = lat ? 18 : 10;

      if (!editMap) {
          const mapEl = document.getElementById('editAccountMap');
          if(mapEl) {
            editMap = L.map('editAccountMap').setView([startLat, startLng], zoom);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21 }).addTo(editMap);
            editMarker = L.marker([startLat, startLng], { draggable: isAdmin }).addTo(editMap);

            editMarker.on('dragend', function(e) {
                const newLatLng = e.target.getLatLng();
                const currentRadius = parseInt(document.getElementById('editAccountGeofence').value);
                updateGeofenceCircle(newLatLng.lat, newLatLng.lng, currentRadius);
            });
          }
      } else {
          editMap.setView([startLat, startLng], zoom);
          editMarker.setLatLng([startLat, startLng]);
          if (editMarker.dragging) isAdmin ? editMarker.dragging.enable() : editMarker.dragging.disable();
      }

      if (editMap) {
          editMap.invalidateSize();
          updateGeofenceCircle(startLat, startLng, geofence);
      }
  }, 400);

  const geoInput = document.getElementById('editAccountGeofence');
  if (geoInput) {
      geoInput.removeEventListener('input', handleGeofenceInputChange);
      geoInput.addEventListener('input', handleGeofenceInputChange);
  }
};

// --- 5. SAVE EDITED ACCOUNT ---
window.saveEditedAccount = async (event) => {
    const btn = event.target;
    btn.disabled = true; btn.textContent = 'Saving...';

    const id = document.getElementById('editAccountId').value;

    try {
        const finalLatLng = editMarker ? editMarker.getLatLng() : { lat: 0, lng: 0 };
        const newGeofence = parseInt(document.getElementById('editAccountGeofence').value) || 200;
        const newAlarm = document.getElementById('editAccountAlarm').value.trim();

        // --- NEW: GATHER SELECTED DAYS ---
        const selectedChips = document.querySelectorAll('#editServiceDaysContainer .day-chip.selected');
        const serviceDays = Array.from(selectedChips).map(c => c.textContent.trim());

        const updateData = {
            alarmCode: newAlarm,
            geofenceRadius: newGeofence,
            lat: finalLatLng.lat,
            lng: finalLatLng.lng,
            serviceDays: serviceDays
        };

        await db.collection('accounts').doc(id).set(updateData, { merge: true });

        window.showToast('Operational Data Saved!');
        loadAccountsList();

        if (typeof loadMap === 'function') loadMap();
        if(window.hideEditAccount) window.hideEditAccount();
        else document.getElementById('editAccountModal').style.display = 'none';

    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Save Operational Data';
    }
};

// --- 6. OTHER FUNCTIONS (Keep existing) ---
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

                const currentRadius = parseInt(document.getElementById('editAccountGeofence').value);
                updateGeofenceCircle(lat, lng, currentRadius);
            }

            window.showToast("Pin moved to your location!");
            btn.textContent = originalText;
            btn.disabled = false;
        },
        (error) => {
            console.error("Error getting location:", error);
            alert("Could not get your location. Please allow GPS access.");
            btn.textContent = originalText;
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
};

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
        await db.collection('accounts').doc(accountId).update({ endDate: endDate, inactiveReason: finalReason });
        window.showToast("Account moved to Inactive.");
        closeInactiveReasonModal(); loadAccountsList();
        if (typeof loadMap === 'function') loadMap();
    } catch (e) { alert("Error: " + e.message); }
    finally { btn.disabled = false; btn.textContent = 'Confirm Inactivation'; }
};

window.deleteAccount = async (id, name, isAlreadyInactive) => {
    if (isAlreadyInactive) {
        if(confirm(`PERMANENTLY DELETE ${name}?\n\nThis cannot be undone.`)) await performHardDelete(id);
    } else {
        const choice = confirm(`You are removing ${name}.\n\n- Click OK to MARK INACTIVE (Recommended).\n- Click CANCEL to PERMANENTLY DELETE.`);
        if (choice) openInactiveReasonModal(id, 'soft_delete', name);
        else if(confirm(`Are you sure you want to permanently delete ${name}? All history will be lost.`)) await performHardDelete(id);
    }
};

async function performHardDelete(id) {
    try { await db.collection('accounts').doc(id).delete(); window.showToast("Account Permanently Deleted"); loadAccountsList(); if (typeof loadMap === 'function') loadMap(); } catch(e) { alert("Delete failed: " + e.message); }
}

window.openSpecsModal = function(id, name, mode) {
    document.getElementById('specsModal').style.display = 'flex';
    document.getElementById('specsModalTitle').textContent = `Specs: ${name}`;
    document.getElementById('currentSpecAccountId').value = id;
    document.getElementById('newSpecName').value = '';
    document.getElementById('newSpecUrl').value = '';
    loadRealSpecs(id);
    if (mode === 'add') setTimeout(() => document.getElementById('newSpecName').focus(), 100);
};

window.closeSpecsModal = function() { document.getElementById('specsModal').style.display = 'none'; };

window.saveSpecLink = async function() {
    const accountId = document.getElementById('currentSpecAccountId').value;
    const name = document.getElementById('newSpecName').value.trim();
    let url = document.getElementById('newSpecUrl').value.trim();
    const btn = document.querySelector('.specs-upload-box button');
    if (!name || !url) return alert("Please enter a document name and a valid URL link.");
    if (!url.match(/^https?:\/\//i)) url = 'https://' + url;
    try {
        btn.disabled = true; btn.textContent = "Saving...";
        await db.collection('accounts').doc(accountId).collection('specs').add({
            name: name, url: url, type: 'link', createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        window.showToast(`Saved Link: ${name}`);
        document.getElementById('newSpecName').value = ''; document.getElementById('newSpecUrl').value = '';
        loadRealSpecs(accountId);
    } catch (error) { alert("Error: " + error.message); }
    finally { btn.disabled = false; btn.textContent = "Save Document Link"; }
};

async function loadRealSpecs(accountId) {
    const listDiv = document.getElementById('specsList');
    listDiv.innerHTML = '<div class="empty-specs">Loading documents...</div>';
    try {
        const snap = await db.collection('accounts').doc(accountId).collection('specs').orderBy('createdAt', 'desc').get();
        if (snap.empty) { listDiv.innerHTML = '<div class="empty-specs">No specifications added yet.<br>Paste a Google Drive or Dropbox link above.</div>'; return; }
        let html = '';
        snap.forEach(doc => {
            const spec = doc.data();
            const dateStr = spec.createdAt ? new Date(spec.createdAt.toDate()).toLocaleDateString() : 'Just now';
            html += `<div class="spec-item"><div class="spec-info"><div class="spec-icon">🔗</div><div><div class="spec-name">${spec.name}</div><div class="spec-meta"><a href="${spec.url}" target="_blank" style="color:#6b7280; text-decoration:none;">${spec.url.substring(0,30)}...</a> • ${dateStr}</div></div></div><div class="spec-actions"><a href="${spec.url}" target="_blank" class="btn-view-doc">Open Link</a><span class="btn-delete-doc" onclick="deleteSpec('${accountId}', '${doc.id}')" title="Delete">&times;</span></div></div>`;
        });
        listDiv.innerHTML = html;
    } catch (error) { listDiv.innerHTML = '<div class="empty-specs" style="color:red">Error loading documents.</div>'; }
}

window.deleteSpec = async function(accountId, specId) {
    if (!confirm("Remove this document link?")) return;
    try { await db.collection('accounts').doc(accountId).collection('specs').doc(specId).delete(); window.showToast("Link removed"); loadRealSpecs(accountId); } catch (error) { alert("Error: " + error.message); }
};

window.reactivateAccount = async function(id) {
    if(!confirm("Reactivate this account?")) return;
    try { await db.collection('accounts').doc(id).update({ endDate: null, cancelReason: null, inactiveReason: null }); window.showToast("Account Reactivated!"); loadAccountsList(); } catch(e) { console.error(e); }
};

window.showAddAccount = function() { document.getElementById('addAccountModal').style.display = 'flex'; }
window.saveNewAccount = async () => {
    const name = document.getElementById('accountName').value.trim();
    const street = document.getElementById('accountStreet').value.trim();
    const city = document.getElementById('accountCity').value.trim();
    const state = document.getElementById('accountState').value.trim();
    const zip = document.getElementById('accountZip').value.trim();
    const startDate = document.getElementById('accountStartDate').value;
    const revenue = Number(document.getElementById('accountRevenue').value);

    if (!name || !street || !startDate) return alert('Name, Street, and Start Date required');

    try {
        const fullAddress = `${street}, ${city}, ${state} ${zip}`;

        const baseUrl = "https://us1.locationiq.com/v1/search.php";
        const params = new URLSearchParams({ key: window.LOCATIONIQ_KEY, street: street, city: city, state: state, postalcode: zip, format: 'json', limit: 1, countrycodes: 'us' });
        const res = await fetch(`${baseUrl}?${params.toString()}`);
        const data = await res.json();

        const accountData = {
            name, address: fullAddress, street, city, state, zip, revenue, startDate,
            endDate: null, owner: window.currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (data && data[0]) { accountData.lat = parseFloat(data[0].lat); accountData.lng = parseFloat(data[0].lon); }

        await db.collection('accounts').add(accountData);
        window.showToast('Account added!');
        window.hideAddAccount();
        loadAccountsList();
        if (typeof loadMap === 'function') loadMap();
    } catch (e) { alert('Error: ' + e.message); }
};

// Auto Fill PID
async function runPidAutoFill() {
    const pidInput = document.getElementById('accountPID');
    const pidVal = pidInput.value.trim();
    if (!pidVal) return alert("Please enter a PID first.");
    const btn = document.getElementById('btnPidAutoFill');
    const originalText = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '🔍 Searching...';

    try {
        const snap = await db.collection('master_client_list').where('pid', '==', pidVal).limit(1).get();
        if (snap.empty) {
            const docRef = await db.collection('master_client_list').doc(pidVal).get();
            if (docRef.exists) fillForm(docRef.data());
            else alert(`No master record found for PID: ${pidVal}`);
        } else {
            fillForm(snap.docs[0].data());
        }
    } catch (e) { console.error(e); alert("Error fetching data: " + e.message); }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
}

function fillForm(data) {
    if(data.name) document.getElementById('accountName').value = data.name;
    if(data.street) document.getElementById('accountStreet').value = data.street;
    if(data.city) document.getElementById('accountCity').value = data.city;
    if(data.state) document.getElementById('accountState').value = data.state;
    if(data.zip) document.getElementById('accountZip').value = data.zip;
    if(data.revenue) document.getElementById('accountRevenue').value = data.revenue;
    if(data.startDate) document.getElementById('accountStartDate').value = data.startDate;
    if(data.contactName) document.getElementById('contactName').value = data.contactName;
    if(data.contactPhone) document.getElementById('contactPhone').value = data.contactPhone;
    if(data.contactEmail) document.getElementById('contactEmail').value = data.contactEmail;
    window.showToast(`✨ Auto-Filled: ${data.name}`);
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnPidAutoFill');
    if(btn) btn.addEventListener('click', runPidAutoFill);
});