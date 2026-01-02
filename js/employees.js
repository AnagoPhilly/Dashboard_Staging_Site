// js/employees.js

// --- 1. DEFINE PASTEL PALETTE ---
const EMPLOYEE_COLOR_PALETTE = [
    '#2dd4bf', // Teal
    '#34d399', // Emerald
    '#60a5fa', // Blue
    '#a78bfa', // Violet
    '#f87171', // Red
    '#fb7185', // Rose
    '#facc15', // Yellow
    '#fb923c', // Orange
    '#4ade80', // Green
    '#a3e635', // Lime
    '#818cf8', // Indigo
    '#e879f9', // Fuchsia
    '#c084fc', // Purple
    '#f472b6', // Pink
    '#67e8f9', // Cyan
    '#94a3b8', // Slate Blue
    '#a1a1aa', // Zinc
    '#fcd34d', // Amber
    '#be185d', // Maroon
    '#0ea5e9'  // Sky
];

// --- 2. DROPDOWN LOGIC ---

// Render the grid of colors
function renderColorPalette(currentColor) {
    const paletteDiv = document.getElementById('colorPaletteGrid');
    if (!paletteDiv) return;

    paletteDiv.innerHTML = '';

    EMPLOYEE_COLOR_PALETTE.forEach(color => {
        const dot = document.createElement('div');
        dot.className = 'color-dot'; // CSS class in scheduler.css
        dot.style.backgroundColor = color;

        // Add checkmark for selected color
        if (color.toLowerCase() === (currentColor || '').toLowerCase()) {
            dot.classList.add('selected');
            dot.innerHTML = '✓'; // Visual checkmark
        }

        // Click handler
        dot.onclick = (e) => {
            e.stopPropagation(); // Prevent closing immediately
            selectEmployeeColor(color);
        };

        paletteDiv.appendChild(dot);
    });
}

// Open/Close Dropdown
window.toggleColorDropdown = function(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('colorDropdown');
    const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';

    // Hide all other dropdowns first (if any)
    document.querySelectorAll('.color-dropdown-popover').forEach(d => d.style.display = 'none');

    if (isHidden) {
        dropdown.style.display = 'block';
        const currentColor = document.getElementById('empColor').value;
        renderColorPalette(currentColor);
    } else {
        dropdown.style.display = 'none';
    }
};

// Handle Selection
window.selectEmployeeColor = function(color) {
    // 1. Update Hidden Input
    document.getElementById('empColor').value = color;

    // 2. Update Visible Button Color
    document.getElementById('selectedColorIndicator').style.backgroundColor = color;

    // 3. Close Dropdown
    document.getElementById('colorDropdown').style.display = 'none';
};

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('colorDropdown');
    const button = document.getElementById('colorPickerButton');
    if (dropdown && button && !dropdown.contains(event.target) && !button.contains(event.target)) {
        dropdown.style.display = 'none';
    }
});


// --- 3. CRUD OPERATIONS (Updated to use new logic) ---

window.showAddEmployee = function() {
    document.getElementById('employeeModal').style.display = 'flex';
    document.getElementById('empModalTitle').textContent = 'Add Team Member';
    document.getElementById('empId').value = '';

    ['empName', 'empRole', 'empEmail', 'empPhone', 'empWage', 'empPassword', 'empAddress'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });

    document.getElementById('empStatus').value = 'Active';

    // Set Default Color
    const defaultColor = '#2dd4bf';
    document.getElementById('empColor').value = defaultColor;
    document.getElementById('selectedColorIndicator').style.backgroundColor = defaultColor;
    document.getElementById('colorDropdown').style.display = 'none';

    document.getElementById('resetPasswordContainer').style.display = 'none';
};

window.closeEmployeeModal = function() {
    document.getElementById('employeeModal').style.display = 'none';
};

window.saveEmployee = async function() {
    const id = document.getElementById('empId').value;
    const name = document.getElementById('empName').value.trim();
    const role = document.getElementById('empRole').value;
    const rawEmail = document.getElementById('empEmail').value.trim();
    const email = rawEmail.toLowerCase();
    const phone = document.getElementById('empPhone').value.trim();
    const wage = parseFloat(document.getElementById('empWage').value) || 0;
    const status = document.getElementById('empStatus').value;
    const address = document.getElementById('empAddress').value.trim();
    const color = document.getElementById('empColor').value;
    const password = document.getElementById('empPassword').value;

    if (!name || !email) return alert("Name and Email are required.");

    const btn = document.querySelector('#employeeModal .btn-primary');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Geocoding Address..."; // User feedback

    let secondaryApp = null;

    try {
        // 1. GEOCODING (Convert Address to Lat/Lng)
        let lat = null;
        let lng = null;

        if (address) {
            try {
                // Using OpenStreetMap (Nominatim) - Free, No Key Required
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
                const results = await response.json();

                if (results && results.length > 0) {
                    lat = parseFloat(results[0].lat);
                    lng = parseFloat(results[0].lon);
                    console.log(`Geocoded: ${lat}, ${lng}`);
                } else {
                    console.warn("Address not found, map marker will be skipped.");
                }
            } catch (geoErr) {
                console.error("Geocoding failed:", geoErr);
                // Proceed saving anyway, just without map coords
            }
        }

        // 2. Handle Authentication Account Creation
        if (password) {
            if (password.length < 6) throw new Error("Password must be at least 6 characters.");

            if (window.firebaseConfig) {
                secondaryApp = firebase.initializeApp(window.firebaseConfig, "SecondaryEmpCreation");
                try {
                    await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
                    console.log("Auth user created");
                } catch (authErr) {
                    if (authErr.code !== 'auth/email-already-in-use') throw authErr;
                    else console.log("User already exists in Auth, updating DB profile only.");
                }
            }
        }

        // 3. Save to Database
        const ownerEmail = window.currentUser.email.toLowerCase();

        const data = {
            name, role, email, phone, wage, status, address, color,
            lat, lng, // Save the coordinates!
            owner: ownerEmail
        };

        if (id) {
            await db.collection('employees').doc(id).update(data);
            window.showToast("Employee updated");
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('employees').add(data);
            window.showToast("Team member added & Login created");
        }

        closeEmployeeModal();
        loadEmployees();

    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        if (secondaryApp) secondaryApp.delete();
        btn.disabled = false;
        btn.textContent = originalText;
    }
};

window.editEmployee = function(id, dataString) {
    try {
        // Decode the "package" sent from the button
        const data = JSON.parse(decodeURIComponent(dataString));

        document.getElementById('empModalTitle').textContent = "Edit Team Member";
        document.getElementById('empId').value = id;

        // Populate fields
        document.getElementById('empName').value = data.name || "";
        document.getElementById('empRole').value = data.role || "General Cleaner";
        document.getElementById('empEmail').value = data.email || "";
        document.getElementById('empPhone').value = data.phone || "";
        document.getElementById('empWage').value = data.wage || "";
        document.getElementById('empStatus').value = data.status || "Active";
        document.getElementById('empAddress').value = data.address || "";

        // Handle Color
        const color = data.color || "#2dd4bf";
        document.getElementById('empColor').value = color;

        // Update the visual color dots if the function exists
        if (typeof renderColorPalette === 'function') {
            renderColorPalette(color);
        }

        // Clear password field so we don't accidentally overwrite it
        document.getElementById('empPassword').value = "";

        // Show "Reset Password" button since we are editing an existing user
        const resetContainer = document.getElementById('resetPasswordContainer');
        if(resetContainer) resetContainer.style.display = 'block';

        // Show Modal
        document.getElementById('employeeModal').style.display = 'flex';

    } catch (e) {
        console.error("Error parsing employee data:", e);
        alert("Error loading employee details. Please refresh the page.");
    }
};

// ... (keep loadEmployees, deleteEmployee, sendResetEmail as they were) ...
// Ensure you include the loadEmployees function from previous steps if you need the full file re-pasted.
// For brevity, I am assuming the load logic (rendering the table) remains the same.
// Just ensure loadEmployees calls editEmployee with the color param.

window.loadEmployees = async function() {
    const activeDiv = document.getElementById('employeeListActive');
    const waitingDiv = document.getElementById('employeeListWaiting');
    const inactiveDiv = document.getElementById('employeeListInactive');

    // UI: Show loading state
    if (activeDiv) activeDiv.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">Loading...</div>';
    if (waitingDiv) waitingDiv.innerHTML = '';
    if (inactiveDiv) inactiveDiv.innerHTML = '';

    // FIX: Typo corrected here (was "wwindow")
    if (!window.currentUser) return;

    try {
        const ownerEmail = window.currentUser.email;

        // 1. SMART QUERY: Check for both "Nate@..." and "nate@..."
        let q;
        if (ownerEmail === 'admin@cleandash.com') {
             q = db.collection('employees');
        } else {
             q = db.collection('employees').where('owner', 'in', [ownerEmail, ownerEmail.toLowerCase()]);
        }

        const snap = await q.get();

        if (snap.empty) {
            if(activeDiv) activeDiv.innerHTML = '<div style="text-align:center; padding:3rem; color:#6b7280;">No employees found.</div>';
            return;
        }

        // 2. MANUAL SORT
        const sortedDocs = snap.docs.sort((a, b) => {
            const nameA = (a.data().name || '').toUpperCase();
            const nameB = (b.data().name || '').toUpperCase();
            return (nameA < nameB) ? -1 : (nameA > nameB) ? 1 : 0;
        });

        const tableHead = `<table class="data-table"><thead><tr><th style="width:10px;"></th><th>Name / Role</th><th>Location</th><th>Contact</th><th>Wage</th><th style="text-align:center;">Status</th><th style="text-align:center;">Actions</th></tr></thead><tbody>`;
        let activeRows = '', waitingRows = '', inactiveRows = '';
        let hasActive = false, hasWaiting = false, hasInactive = false;

        sortedDocs.forEach(doc => {
            const e = doc.data();
            const safeName = (e.name || 'Unknown').replace(/'/g, "\\'");
            const safeAddr = (e.address || '').replace(/'/g, "\\'");
            const dataStr = encodeURIComponent(JSON.stringify(e));
            const empColor = e.color || '#2dd4bf';

            const colorDot = `<div style="width:12px; height:12px; border-radius:50%; background:${empColor}; box-shadow:0 1px 2px rgba(0,0,0,0.2);" title="Color Tag"></div>`;

            let statusBadge = `<span style="background:#d1fae5; color:#065f46; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">${e.status}</span>`;
            if (e.status === 'Waiting') statusBadge = `<span style="background:#fef3c7; color:#d97706; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">Waiting</span>`;
            if (e.status === 'Inactive') statusBadge = `<span style="background:#f3f4f6; color:#6b7280; padding:2px 8px; border-radius:12px; font-size:0.75rem;">Inactive</span>`;

            const addressDisplay = e.address ? `<span style="font-size:0.8rem; color:#4b5563;">📍 ${e.address}</span>` : '<span style="color:#9ca3af; font-size:0.8rem;">No address</span>';

            const actions = `
                <div class="action-buttons">
                    <button onclick="editEmployee('${doc.id}', '${dataStr}')" class="btn-xs btn-edit">Edit</button>
                    <button onclick="deleteEmployee('${doc.id}')" class="btn-xs btn-delete">Delete</button>
                </div>`;

            const row = `<tr>
                <td style="text-align:center;">${colorDot}</td>
                <td><div style="font-weight:600;">${e.name}</div><div style="font-size:0.8rem; color:#6b7280;">${e.role}</div></td>
                <td>${addressDisplay}</td>
                <td><div style="font-size:0.9rem;">${e.phone||'--'}</div><div style="font-size:0.8rem; color:#6b7280;">${e.email}</div></td>
                <td style="font-family:monospace; font-weight:600;">$${(e.wage||0).toFixed(2)}/hr</td>
                <td style="text-align:center;">${statusBadge}</td>
                <td style="text-align:center;">${actions}</td>
            </tr>`;

            if (e.status === 'Active') { activeRows += row; hasActive = true; }
            else if (e.status === 'Waiting') { waitingRows += row; hasWaiting = true; }
            else { inactiveRows += row; hasInactive = true; }
        });

        if(activeDiv) activeDiv.innerHTML = hasActive ? tableHead + activeRows + '</tbody></table>' : '<div style="padding:2rem; text-align:center; color:#ccc;">No active team members.</div>';
        if(waitingDiv) waitingDiv.innerHTML = hasWaiting ? tableHead + waitingRows + '</tbody></table>' : '<div style="padding:1rem; text-align:center; color:#eee;">No applicants.</div>';
        if(inactiveDiv) inactiveDiv.innerHTML = hasInactive ? tableHead + inactiveRows + '</tbody></table>' : '<div style="padding:1rem; text-align:center; color:#eee;">No inactive records.</div>';

    } catch (err) {
        console.error("Error loading employees:", err);
        if(activeDiv) activeDiv.innerHTML = '<div style="color:red; text-align:center;">Error loading data.</div>';
    }
};