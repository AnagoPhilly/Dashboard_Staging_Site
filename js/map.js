// js/map.js
let map = null;
let markersMap = {}; // Store markers by ID for hover interaction

// --- CONFIGURATION ---
const ICON_DIMS = {
    size: [35, 57],
    anchor: [17, 57],
    popup: [1, -54],
    shadow: [50, 50]
};

const ICON_HOVER_DIMS = {
    size: [45, 73], // 1.3x larger
    anchor: [22, 73],
    popup: [1, -70],
    shadow: [60, 60]
};

// --- ICONS ---
const HomeIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: ICON_DIMS.size, iconAnchor: ICON_DIMS.anchor, popupAnchor: ICON_DIMS.popup, shadowSize: ICON_DIMS.shadow
});

const StaffIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: ICON_DIMS.size, iconAnchor: ICON_DIMS.anchor, popupAnchor: ICON_DIMS.popup, shadowSize: ICON_DIMS.shadow
});

const AccountIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: ICON_DIMS.size, iconAnchor: ICON_DIMS.anchor, popupAnchor: ICON_DIMS.popup, shadowSize: ICON_DIMS.shadow
});

const InactiveIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: ICON_DIMS.size, iconAnchor: ICON_DIMS.anchor, popupAnchor: ICON_DIMS.popup, shadowSize: ICON_DIMS.shadow
});

// Hover Icons (Larger versions)
const AccountIconHover = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: ICON_HOVER_DIMS.size, iconAnchor: ICON_HOVER_DIMS.anchor, popupAnchor: ICON_HOVER_DIMS.popup, shadowSize: ICON_HOVER_DIMS.shadow
});

// Utility to get geocode data
async function getGeocode(address) {
    if (!address) return null;
    try {
        const url = `https://us1.locationiq.com/v1/search.php?key=${window.LOCATIONIQ_KEY}&q=${encodeURIComponent(address)}&format=json&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data[0]) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    } catch (e) { console.error("Geocoding failed:", e); }
    return null;
}

async function loadMap() {
    console.log("CleanDash: Loading Map...");

    // 0. Set Loading State for KPIs
    const dashboardKPIs = document.getElementById('dashboardKPIs');
    if (dashboardKPIs) {
        dashboardKPIs.innerHTML = '<p style="text-align:center; padding:1.5rem; color:#888;">Loading data...</p>';
    }

    if (!map) {
        map = L.map('map').setView([39.8, -98.5], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        // REMOVED: Search Control/Geocoder from the map interface
        // if (L.Control.Geocoder) L.Control.geocoder({ placeholder: "Search..." }).addTo(map);
    }

    setTimeout(() => { map.invalidateSize(); }, 200);

    // Clear existing markers & map object
    map.eachLayer(l => l instanceof L.Marker && map.removeLayer(l));
    markersMap = {}; // Reset storage

    const activeListDiv = document.getElementById('dashAccountList');
    if(activeListDiv) activeListDiv.innerHTML = '';

    if (!window.currentUser) return;

    const boundsMarkers = [];
    let totalRevenue = 0;
    let accountCount = 0;
    let activeEmployeeCount = 0;
    const today = new Date();

    try {
        // --- 1. Load User Home Pin ---
        const userDoc = await db.collection('users').doc(window.currentUser.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        if (userData.address && userData.address !== 'Not set') {
            let coords = (userData.lat && userData.lng) ? {lat: userData.lat, lng: userData.lng} : await getGeocode(userData.address);
            if (coords) {
                const homeMarker = L.marker([coords.lat, coords.lng], { icon: HomeIcon }).addTo(map).bindPopup(`<b>Your Home Base</b>`);
                boundsMarkers.push(homeMarker);
            }
        }

        // --- 2. Load Employees ---
        const empSnap = await db.collection('employees').where('owner', '==', window.currentUser.email).get();
        empSnap.forEach(doc => {
            const e = doc.data();
            if (e.status === 'Active') activeEmployeeCount++;
            if (e.lat && e.lng && e.status === 'Active') {
                const marker = L.marker([e.lat, e.lng], { icon: StaffIcon }).addTo(map).bindPopup(`<b>👤 ${e.name}</b><br>${e.role}`);
                boundsMarkers.push(marker);
            }
        });

        // --- 3. Load Account Pins & List ---
        // Load only accounts assigned to the current user (consistent with loadAccountsList fix)
        const q = db.collection('accounts').where('owner', '==', window.currentUser.email);

        const accSnap = await q.get();

        accSnap.forEach(doc => {
            const a = doc.data();
            const end = a.endDate ? new Date(a.endDate) : null;
            let isActive = true;
            if(end && end < today) isActive = false;

            if(isActive) {
                accountCount++;
                totalRevenue += (a.revenue || 0);

                // Create Marker
                if (a.lat && a.lng) {
                    const marker = L.marker([a.lat, a.lng], { icon: AccountIcon }).addTo(map)
                        .bindPopup(`<b>🏢 ${a.name}</b><br>${a.address}<br><b style="color:#0d9488">$${(a.revenue||0).toLocaleString()}/mo</b>`);

                    boundsMarkers.push(marker);
                    markersMap[doc.id] = marker; // Store reference
                }

                // Create List Card with Hover Events
                if (activeListDiv) {
                    const card = document.createElement('div');
                    card.className = 'dash-account-card';
                    card.style.borderLeftColor = '#3b82f6';
                    card.innerHTML = `
                        <div class="dash-acc-name">${a.name}</div>
                        <div class="dash-acc-addr">${a.address}</div>
                        <div class="dash-acc-rev">$${(a.revenue||0).toLocaleString()}</div>
                    `;

                    // --- HOVER INTERACTION ---
                    card.addEventListener('mouseenter', () => {
                        const m = markersMap[doc.id];
                        if (m) {
                            m.setIcon(AccountIconHover); // Make bigger
                            m.setZIndexOffset(1000); // Bring to front
                            m.openPopup();
                        }
                    });

                    card.addEventListener('mouseleave', () => {
                        const m = markersMap[doc.id];
                        if (m) {
                            m.setIcon(AccountIcon); // Revert size
                            m.setZIndexOffset(0);
                            m.closePopup();
                        }
                    });

                    activeListDiv.appendChild(card);
                }
            }
        });

        // --- RENDER KPIS ---
        if (dashboardKPIs) {
            dashboardKPIs.innerHTML = `
                <div class="kpi-dashboard-item" style="border-left-color: #3b82f6;">
                    <p>Total Active Accounts</p>
                    <h3>${accountCount}</h3>
                </div>
                <div class="kpi-dashboard-item" style="border-left-color: #0d9488;">
                    <p>Total Monthly Revenue</p>
                    <h3>$${totalRevenue.toLocaleString()}</h3>
                </div>
                <div class="kpi-dashboard-item" style="border-left-color: #ef4444;">
                    <p>Active Team Members</p>
                    <h3>${activeEmployeeCount}</h3>
                </div>
            `;
        }

        // --- Auto-Zoom ---
        setTimeout(() => {
            map.invalidateSize();
            if (boundsMarkers.length > 0) {
                const group = new L.featureGroup(boundsMarkers);
                map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 11 });
            } else {
                map.setView([39.8, -98.5], 4);
            }
        }, 100);

    } catch (e) {
        console.error("Dashboard Load Error:", e);
    }
}

window.loadMap = loadMap;