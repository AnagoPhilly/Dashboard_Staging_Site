// js/admin.js

const ADMIN_EMAIL = 'nate@anagophilly.com';

// Add global function to create a user document
window.createOwnerDocument = async function(uid, email, name) {
    const userRef = db.collection('users').doc(uid);
    await userRef.set({
        email: email,
        name: name,
        role: 'owner',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

auth.onAuthStateChanged(async user => {
    // 1. SECURITY GATE
    if (!user || user.email.toLowerCase() !== ADMIN_EMAIL) {
        alert("⛔ ACCESS DENIED: Authorized Personnel Only.");
        window.location.href = 'index.html';
        return;
    }

    // 2. Access Granted
    document.getElementById('appLoading').style.display = 'none';
    document.getElementById('adminApp').style.display = 'flex';

    console.log("God Mode: Access Granted to", user.email);
    loadGodModeData();
    document.getElementById('addOwnerModal').style.display = 'none';
});

async function loadGodModeData() {
    const userList = document.getElementById('userList');
    userList.innerHTML = '<div style="padding:20px; text-align:center;">Scanning Database...</div>';

    try {
        const [usersSnap, accountsSnap, empSnap] = await Promise.all([
            db.collection('users').get(),
            db.collection('accounts').get(),
            db.collection('employees').get()
        ]);

        let totalRev = 0;
        let ownerCount = 0;
        const owners = [];

        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.role === 'owner') {
                ownerCount++;
                owners.push({ id: doc.id, ...data, accountCount: 0, revenue: 0 });
            }
        });

        accountsSnap.forEach(doc => {
            const acc = doc.data();
            const rev = parseFloat(acc.revenue) || 0;
            totalRev += rev;
            const owner = owners.find(o => o.email === acc.owner);
            if (owner) {
                owner.accountCount++;
                owner.revenue += rev;
            }
        });

        // Update Stats
        document.getElementById('statOwners').textContent = ownerCount;
        document.getElementById('statAccounts').textContent = accountsSnap.size;
        document.getElementById('statRevenue').textContent = '$' + totalRev.toLocaleString();
        document.getElementById('statEmployees').textContent = empSnap.size;

        // Render List
        let html = '';
        owners.sort((a,b) => b.revenue - a.revenue);

        const employeeCounts = {};
        empSnap.forEach(doc => {
            const ownerEmail = doc.data().owner;
            employeeCounts[ownerEmail] = (employeeCounts[ownerEmail] || 0) + 1;
        });

        owners.forEach(u => {
            const empCount = employeeCounts[u.email] || 0;
            html += `
            <div class="user-row">
                <div style="flex: 1;">
                    <div style="font-weight: 700; font-size: 1.1rem; color: #111;">
                        ${u.name || 'Unknown Name'}
                        <span class="badge badge-owner">Owner</span>
                    </div>
                    <div style="font-size: 0.85rem; color: #666;">${u.email}</div>
                    <div style="font-size: 0.75rem; color: #999; margin-top: 4px;">ID: ${u.id}</div>
                    <div style="font-size: 0.75rem; color: #0d9488; font-weight:600;">Fran ID: ${u.franId || 'N/A'}</div>
                </div>
                <div style="text-align: right; padding-right: 20px;">
                    <div style="font-weight: 700; color: #0d9488;">${u.accountCount} Accounts</div>
                    <div style="font-size: 0.8rem; color: #444;">${empCount} Employees</div>
                    <div style="font-size: 0.9rem; color: #444;">$${u.revenue.toLocaleString()}/mo</div>
                </div>
                <div>
                    <button class="btn btn-secondary" onclick="impersonateUser('${u.email}')">👁️ View Dashboard</button>
                    <button class="btn btn-danger" style="margin-left:5px; font-size:0.7rem;" onclick="nukeUser('${u.id}', '${u.name}')">🗑️</button>
                </div>
            </div>`;
        });

        userList.innerHTML = html;
        if (!document.getElementById('addOwnerButton')) {
            userList.insertAdjacentHTML('beforebegin', `<div style="text-align:right;"><button id="addOwnerButton" class="btn btn-primary" style="margin-bottom: 15px;" onclick="showAddOwnerModal()">+ Add New Franchise Owner</button></div>`);
        }

    } catch (e) {
        console.error(e);
        userList.innerHTML = `<div style="color:red; padding:20px;">Error loading data: ${e.message}</div>`;
    }
}

// --- MODAL FUNCTIONS ---
window.showAddOwnerModal = function() {
    document.getElementById('ownerName').value = '';
    document.getElementById('ownerEmail').value = '';
    document.getElementById('addOwnerModal').style.display = 'flex';
};

window.closeAddOwnerModal = function() { document.getElementById('addOwnerModal').style.display = 'none'; };

window.saveNewOwner = async function() {
    const name = document.getElementById('ownerName').value.trim();
    const rawEmail = document.getElementById('ownerEmail').value;

    // Aggressive clean
    const email = rawEmail.toLowerCase().replace(/[^a-z0-9@._-]/g, '');
    const password = "password";

    if (!name || !email) return alert("Owner Name and Email are required.");

    const btn = document.querySelector('#addOwnerModal .btn-primary');
    btn.disabled = true;
    btn.textContent = "Creating...";

    let secondaryApp;
    let authUser = null;

    try {
        secondaryApp = firebase.initializeApp(window.firebaseConfig, "OwnerCreation");
        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
        authUser = userCredential.user;

        await createOwnerDocument(authUser.uid, email, name);

        alert(`Successfully created Owner: ${name}. Login: ${email} / "password"`);
        closeAddOwnerModal();
        loadGodModeData();

    } catch (e) {
        if(e.code === 'auth/email-already-in-use') {
            alert(`Error: The email ${email} already exists in Firebase Auth.\n\nYou must delete this user from the Firebase Console > Authentication tab before you can recreate them with the "password" default.`);
        } else {
            alert("Error creating user: " + e.message);
        }
    } finally {
        if (secondaryApp) secondaryApp.delete();
        btn.disabled = false;
        btn.textContent = "Create Owner";
    }
};

window.importOwnersFromCSV = function() {
    const file = document.getElementById('ownersCsvUpload').files[0];
    if(!file) return alert("Please select a CSV file first.");

    const btn = document.getElementById('btnImportOwners');
    const statusEl = document.getElementById('importOwnerStatus');

    btn.disabled = true;
    btn.textContent = "Processing File...";
    statusEl.innerHTML = '';

    if (typeof Papa === 'undefined') return statusEl.innerHTML = '<span style="color:red;">Error: PapaParse not loaded.</span>';

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim().replace(/[^a-zA-Z0-9]/g, ''),
        complete: function(results) { uploadNewOwners(results.data, btn, statusEl); },
        error: function(err) {
            alert("CSV Parsing Error: " + err.message);
            btn.disabled = false;
            btn.textContent = "🚀 Start Bulk Import and Account Creation";
        }
    });
};

async function uploadNewOwners(data, btn, statusEl) {
    let createdCount = 0;
    let failedCount = 0;
    let secondaryApp = null;
    const INITIAL_PASSWORD = "password";

    try {
        if (typeof window.firebaseConfig === 'undefined') throw new Error("Firebase config not available.");
        secondaryApp = firebase.initializeApp(window.firebaseConfig, "OwnerBulkCreation");
    } catch (e) {
        statusEl.innerHTML = `<span style="color:red;">FATAL ERROR: Could not initialize Auth app: ${e.message}</span>`;
        if (secondaryApp) secondaryApp.delete();
        btn.disabled = false;
        btn.textContent = "🚀 Start Bulk Import";
        return;
    }

    statusEl.innerHTML = `Starting import of ${data.length} records...`;
    console.group("Bulk Import Log");

    for (let i = 0; i < data.length; i++) {
        const row = data[i];

        // 1. Read Data
        const rawName = row['ContactName']?.trim() || row['CompanyName']?.trim();
        const rawEmail = row['ContactEmail']?.trim() || row['Contactemail']?.trim();
        const franId = row['FranID']?.trim();

        if (!rawEmail || !rawName) {
            statusEl.innerHTML += `<div style="color:#f59e0b;">Skipping row ${i+1}: Missing Email or Name.</div>`;
            failedCount++;
            continue;
        }

        // 2. Clean Data
        const email = rawEmail.toLowerCase().replace(/[^a-z0-9@._-]/g, '');
        const name = rawName;

        try {
            // 3. Create Auth User
            statusEl.innerHTML = `Creating ${name}...`;
            const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, INITIAL_PASSWORD);
            const uid = userCredential.user.uid;

            // 4. Create Firestore User Document
            const fullAddress = `${row.Address || ''} ${row.City || ''} ${row.State || ''} ${row.Zip || ''}`.trim();
            const cfiValue = parseFloat(row['CFee']) || 0;

            const ownerData = {
                email: email,
                name: name,
                role: 'owner',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                companyName: row['CompanyName'] || name,
                address: fullAddress,
                contactPhone: row['ContactPhone'] || '',
                cfi: cfiValue,
                purchaseDate: row['PurchaseDate'] || '',
                tempPassword: INITIAL_PASSWORD,
                franId: franId || ''
            };

            await db.collection('users').doc(uid).set(ownerData, { merge: true });
            statusEl.innerHTML = `<div style="color:#0d9488;">✅ Created: ${name}</div>`;
            console.log(`CREATED: ${email} | Password: ${INITIAL_PASSWORD}`);

            // 5. AUTOMATICALLY LINK ACCOUNTS (If FranID exists)
            if (franId) {
                statusEl.innerHTML += `<div style="font-size:0.85rem; margin-left:15px; color:#4b5563;">🔎 Searching for client accounts with FranID: ${franId}...</div>`;

                const linkedSnap = await db.collection('master_client_list').where('franId', '==', franId).get();

                if (!linkedSnap.empty) {
                    const batch = db.batch();
                    let linkCount = 0;

                    linkedSnap.forEach(clientDoc => {
                        const client = clientDoc.data();
                        const accRef = db.collection('accounts').doc(`ACC_${client.pid}`);

                        // CRITICAL: Ensure we grab the split fields (Street, City, Zip) if they exist in Master List
                        // This prevents address inaccuracy on newly imported accounts.

                        let street = client.street || '';
                        let city = client.city || '';
                        let state = client.state || '';
                        let zip = client.zip || '';

                        // Fallback parser if Master List is old (just in case)
                        if (!street && client.address) {
                            const parts = client.address.split(',').map(s => s.trim());
                            if(parts.length >= 3) {
                                street = parts[0];
                                city = parts[1];
                                if(parts[2].match(/\d{5}/)) zip = parts[2].match(/\d{5}/)[0];
                            }
                        }

                        const newAccountData = {
                            pid: client.pid,
                            name: client.name || 'Unknown',
                            address: client.address || '',
                            street: street, // <--- ADDED
                            city: city,     // <--- ADDED
                            state: state,   // <--- ADDED
                            zip: zip,       // <--- ADDED
                            revenue: client.revenue || 0,
                            owner: email,
                            status: 'Active',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            startDate: new Date().toISOString().split('T')[0],
                            contactName: client.contactName || '',
                            contactPhone: client.contactPhone || '',
                            contactEmail: client.contactEmail || '',
                            lat: client.lat || null,
                            lng: client.lng || null
                        };

                        batch.set(accRef, newAccountData, { merge: true });
                        linkCount++;
                    });

                    await batch.commit();
                    statusEl.innerHTML += `<div style="font-size:0.85rem; margin-left:15px; color:#0d9488; font-weight:bold;">↳ Linked ${linkCount} accounts!</div>`;
                } else {
                    statusEl.innerHTML += `<div style="font-size:0.85rem; margin-left:15px; color:#9ca3af;">↳ No matching clients found in Master List.</div>`;
                }
            }

            createdCount++;

        } catch (e) {
            if(e.code === 'auth/email-already-in-use') {
                 statusEl.innerHTML += `<div style="color:#ef4444; font-weight:bold;">⚠️ EXISTING AUTH: ${email} already exists. Delete in Firebase Console to reset.</div>`;
            } else {
                 statusEl.innerHTML += `<div style="color:#ef4444;">❌ Failed: ${name} (${email}) - ${e.message}</div>`;
            }
            failedCount++;
        }
    }

    console.groupEnd();
    if (secondaryApp) secondaryApp.delete();

    statusEl.innerHTML += `<hr><strong>Finished: ${createdCount} new, ${failedCount} skipped/failed.</strong>`;
    alert(`Import Complete! Check status log for details.`);

    loadGodModeData();
    btn.disabled = false;
    btn.textContent = "🚀 Start Bulk Import and Account Creation";
}

// --- ACTIONS ---
window.impersonateUser = function(email) {
    window.location.href = `index.html?viewAs=${encodeURIComponent(email)}`;
};

window.nukeUser = async function(uid, name) {
    if(!confirm(`⚠️ DANGER: Are you sure you want to DELETE ${name}'s document?\n\nThis leaves the login (Auth) record orphaned and must be manually deleted.`)) return;
    if (prompt(`Type "DELETE" to confirm destroying ${name}'s Firestore document.`) !== "DELETE") return;

    try {
        await db.collection('users').doc(uid).delete();
        alert("User document deleted. NOW GO TO FIREBASE CONSOLE > AUTHENTICATION AND DELETE THE LOGIN.");
        loadGodModeData();
    } catch(e) { alert("Error: " + e.message); }
};

window.filterUsers = function() {
    const term = document.getElementById('userSearch').value.toLowerCase();
    document.querySelectorAll('.user-row').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(term) ? 'flex' : 'none';
    });
};