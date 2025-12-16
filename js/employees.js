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
    const email = document.getElementById('empEmail').value.trim();
    const phone = document.getElementById('empPhone').value.trim();
    const wage = parseFloat(document.getElementById('empWage').value) || 0;
    const status = document.getElementById('empStatus').value;
    const address = document.getElementById('empAddress').value.trim();
    const color = document.getElementById('empColor').value; // Get from hidden input

    if (!name || !email) return alert("Name and Email are required.");

    const btn = document.querySelector('#employeeModal .btn-primary');
    btn.disabled = true; btn.textContent = "Processing...";

    const data = {
        name, role, email, phone, wage, status, address, color, // Save Color
        owner: window.currentUser.email
    };

    try {
        if (id) {
            await db.collection('employees').doc(id).update(data);
            window.showToast("Employee updated");
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('employees').add(data);
            window.showToast("Team member added");
        }
        closeEmployeeModal();
        loadEmployees();
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        btn.disabled = false; btn.textContent = "Save Member";
    }
};

window.editEmployee = function(id, name, role, email, phone, wage, status, address, color) {
    document.getElementById('employeeModal').style.display = 'flex';
    document.getElementById('empModalTitle').textContent = 'Edit Team Member';
    document.getElementById('empId').value = id;

    document.getElementById('empName').value = name;
    document.getElementById('empRole').value = role;
    document.getElementById('empEmail').value = email;
    document.getElementById('empPhone').value = phone;
    document.getElementById('empWage').value = wage;
    document.getElementById('empStatus').value = status;
    document.getElementById('empAddress').value = address || '';
    document.getElementById('empPassword').value = '';

    // Set Color UI
    const finalColor = color || '#2dd4bf';
    document.getElementById('empColor').value = finalColor;
    document.getElementById('selectedColorIndicator').style.backgroundColor = finalColor;
    document.getElementById('colorDropdown').style.display = 'none';

    document.getElementById('resetPasswordContainer').style.display = 'block';
};

// ... (keep loadEmployees, deleteEmployee, sendResetEmail as they were) ...
// Ensure you include the loadEmployees function from previous steps if you need the full file re-pasted.
// For brevity, I am assuming the load logic (rendering the table) remains the same.
// Just ensure loadEmployees calls editEmployee with the color param.

window.loadEmployees = function() {
    // ... (Use the loadEmployees code from previous response, ensuring color is passed to editEmployee) ...
    const activeDiv = document.getElementById('employeeListActive');
    if(activeDiv) activeDiv.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">Loading...</div>';

    if (!window.currentUser) return;

    const q = window.currentUser.email === 'admin@cleandash.com'
        ? db.collection('employees')
        : db.collection('employees').where('owner', '==', window.currentUser.email);

    q.orderBy('name').get().then(snap => {
        const activeDiv = document.getElementById('employeeListActive');
        const waitingDiv = document.getElementById('employeeListWaiting');
        const inactiveDiv = document.getElementById('employeeListInactive');

        if (snap.empty) {
            activeDiv.innerHTML = '<div style="text-align:center; padding:3rem; color:#6b7280;">No employees found.</div>';
            waitingDiv.innerHTML = ''; inactiveDiv.innerHTML = '';
            return;
        }

        const tableHead = `<table class="data-table"><thead><tr><th style="width:10px;"></th><th>Name / Role</th><th>Location</th><th>Contact</th><th>Wage</th><th style="text-align:center;">Status</th><th style="text-align:center;">Actions</th></tr></thead><tbody>`;
        let activeRows = '', waitingRows = '', inactiveRows = '';
        let hasActive = false, hasWaiting = false, hasInactive = false;

        snap.forEach(doc => {
            const e = doc.data();
            const safeName = (e.name || '').replace(/'/g, "\\'");
            const safeAddr = (e.address || '').replace(/'/g, "\\'");
            const empColor = e.color || '#2dd4bf';

            // Render color dot
            const colorDot = `<div style="width:12px; height:12px; border-radius:50%; background:${empColor}; box-shadow:0 1px 2px rgba(0,0,0,0.2);" title="Color Tag"></div>`;

            let statusBadge = `<span style="background:#d1fae5; color:#065f46; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">${e.status}</span>`;
            if (e.status === 'Waiting') statusBadge = `<span style="background:#fef3c7; color:#d97706; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">Waiting</span>`;
            if (e.status === 'Inactive') statusBadge = `<span style="background:#f3f4f6; color:#6b7280; padding:2px 8px; border-radius:12px; font-size:0.75rem;">Inactive</span>`;

            const addressDisplay = e.address ? `<span style="font-size:0.8rem; color:#4b5563;">📍 ${e.address}</span>` : '<span style="color:#9ca3af; font-size:0.8rem;">No address</span>';

            const actions = `
                <div class="action-buttons">
                    <button onclick="editEmployee('${doc.id}', '${safeName}', '${e.role}', '${e.email}', '${e.phone}', ${e.wage}, '${e.status}', '${safeAddr}', '${empColor}')" class="btn-xs btn-edit">Edit</button>
                    <button onclick="deleteEmployee('${doc.id}', '${safeName}', '${e.status}')" class="btn-xs btn-delete">Delete</button>
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

        activeDiv.innerHTML = hasActive ? tableHead + activeRows + '</tbody></table>' : '<div style="padding:2rem; text-align:center; color:#ccc;">No active team members.</div>';
        waitingDiv.innerHTML = hasWaiting ? tableHead + waitingRows + '</tbody></table>' : '<div style="padding:1rem; text-align:center; color:#eee;">No applicants.</div>';
        inactiveDiv.innerHTML = hasInactive ? tableHead + inactiveRows + '</tbody></table>' : '<div style="padding:1rem; text-align:center; color:#eee;">No inactive records.</div>';
    });
};