// js/accounts.js

function loadAccountsList() {
  if (!window.currentUser) return;

  const q = window.currentUser.email === 'admin@cleandash.com'
    ? db.collection('accounts')
    : db.collection('accounts').where('owner', '==', window.currentUser.email);

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

      // Determine Status
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

          activeRows += `<tr>
            <td><div style="font-weight:600; color:#111827;">${a.name}</div>${contactDisplay}</td>
            <td><div style="color:#4b5563; font-size:0.9rem;">${a.address}</div>${alarmDisplay}</td>
            <td class="col-revenue">$${(a.revenue || 0).toLocaleString()}</td>
            <td style="text-align:center;">
                <div class="action-buttons">
                    <button onclick="openSpecsModal('${doc.id}', '${safeName}', 'view')" class="btn-xs btn-specs-view">Specs</button>
                    <button onclick="showEditAccount('${doc.id}', '${safeName}', '${safeAddress}', ${a.revenue||0}, '${a.startDate||''}', '${a.endDate||''}', '${a.contactName||''}', '${a.contactPhone||''}', '${a.contactEmail||''}', '${a.alarmCode||''}')" class="btn-xs btn-edit">Edit</button>
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

  });
}

// --- INACTIVE REASON MODAL (Used only for "Soft Delete" / Marking Inactive) ---

window.openInactiveReasonModal = function(accountId, type, currentName) {
    document.getElementById('inactiveReasonModal').style.display = 'flex';
    document.getElementById('inactiveAccountId').value = accountId;
    document.getElementById('actionType').value = type;

    // Reset inputs
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
        // Soft Delete / Inactivation
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

    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm Inactivation';
    }
};


// --- DELETE / CANCEL LOGIC ---

window.deleteAccount = async (id, name, isAlreadyInactive) => {
    if (isAlreadyInactive) {
        // PATH A: Hard Delete for Inactive Accounts (Instant)
        if(confirm(`PERMANENTLY DELETE ${name}?\n\nThis cannot be undone.`)) {
             await performHardDelete(id);
        }
    } else {
        // PATH B: Active Account - Ask to Mark Inactive or Hard Delete
        const choice = confirm(`You are removing ${name}.\n\n- Click OK to MARK INACTIVE (Recommended to keep data).\n- Click CANCEL to PERMANENTLY DELETE.`);

        if (choice) {
            // Open the modal to get the reason
            openInactiveReasonModal(id, 'soft_delete', name);
        } else {
            // Double check for hard delete
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
    } catch(e) {
        alert("Delete failed: " + e.message);
    }
}


// --- SPECS MODAL LOGIC ---

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

window.closeSpecsModal = function() {
    document.getElementById('specsModal').style.display = 'none';
};

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
        await db.collection('accounts').doc(id).update({
            endDate: null,
            cancelReason: null,
            inactiveReason: null
        });
        window.showToast("Account Reactivated!");
        loadAccountsList();
        if (typeof generateMetricsGraphFromDB === 'function') generateMetricsGraphFromDB();
    } catch(e) { console.error(e); }
};

// --- CRUD Operations ---
window.showAddAccount = function() { document.getElementById('addAccountModal').style.display = 'flex'; }
window.hideAddAccount = function() { document.getElementById('addAccountModal').style.display = 'none'; document.querySelectorAll('#addAccountModal input').forEach(i => i.value = ''); }

window.saveNewAccount = async () => {
    const name = document.getElementById('accountName').value.trim();
    const address = document.getElementById('accountAddress').value.trim();
    const revenue = Number(document.getElementById('accountRevenue').value);
    const startDate = document.getElementById('accountStartDate').value;
    const endDate = document.getElementById('accountEndDate').value;
    const alarm = document.getElementById('accountAlarm').value.trim();
    const cName = document.getElementById('contactName').value.trim();
    const cPhone = document.getElementById('contactPhone').value.trim();
    const cEmail = document.getElementById('contactEmail').value.trim();

    if (!name || !address || !startDate) return alert('Name, Address, and Start Date required');

    try {
        const url = `https://us1.locationiq.com/v1/search.php?key=${window.LOCATIONIQ_KEY}&q=${encodeURIComponent(address)}&format=json&limit=1`;
        const res = await fetch(url);
        const data = await res.json();

        const accountData = {
            name, address, revenue, startDate, endDate: endDate || null, alarmCode: alarm,
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
        hideAddAccount();
        loadAccountsList();
        if (typeof loadMap === 'function') loadMap();

    } catch (e) { alert('Error: ' + e.message); }
};

window.showEditAccount = function(id, name, address, revenue, startDate, endDate, cName, cPhone, cEmail, alarm) {
  document.getElementById('editAccountId').value = id;
  document.getElementById('editAccountName').value = name;
  document.getElementById('editAccountAddress').value = address;
  document.getElementById('editAccountRevenue').value = revenue;
  document.getElementById('editAccountStartDate').value = startDate || '';
  document.getElementById('editAccountEndDate').value = endDate || '';
  document.getElementById('editContactName').value = cName || '';
  document.getElementById('editContactPhone').value = cPhone || '';
  document.getElementById('editContactEmail').value = cEmail || '';
  document.getElementById('editAccountAlarm').value = alarm || '';
  document.getElementById('editAccountModal').style.display = 'flex';
};

window.hideEditAccount = function() { document.getElementById('editAccountModal').style.display = 'none'; };

window.saveEditedAccount = async (event) => {
    const btn = event.target;
    btn.disabled = true; btn.textContent = 'Saving...';
    const id = document.getElementById('editAccountId').value;
    const name = document.getElementById('editAccountName').value.trim();
    const address = document.getElementById('editAccountAddress').value.trim();
    const revenue = Number(document.getElementById('editAccountRevenue').value);
    const startDate = document.getElementById('editAccountStartDate').value;
    const endDate = document.getElementById('editAccountEndDate').value;
    const alarm = document.getElementById('editAccountAlarm').value.trim();
    const cName = document.getElementById('editContactName').value.trim();
    const cPhone = document.getElementById('editContactPhone').value.trim();
    const cEmail = document.getElementById('editContactEmail').value.trim();

    try {
        // If date set in future or past, check for inactivation logic
        const currentDoc = await db.collection('accounts').doc(id).get();
        const currentEndDate = currentDoc.data().endDate || '';

        if (endDate && endDate !== currentEndDate) {
            const today = new Date().toISOString().split('T')[0];
            if (endDate <= today) {
                document.getElementById('editAccountModal').style.display = 'none';
                openInactiveReasonModal(id, 'soft_delete', name);
                return;
            }
        }

        await db.collection('accounts').doc(id).update({
            name, address, revenue, startDate, endDate: endDate || null,
            alarmCode: alarm, contactName: cName, contactPhone: cPhone, contactEmail: cEmail
        });

        window.showToast('Updated!');
        window.hideEditAccount();
        loadAccountsList();
        if (typeof loadMap === 'function') loadMap();
        if (typeof generateMetricsGraphFromDB === 'function') generateMetricsGraphFromDB();

    } catch (e) { alert('Error: ' + e.message); }
    finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
};

window.loadAccountsList = loadAccountsList;