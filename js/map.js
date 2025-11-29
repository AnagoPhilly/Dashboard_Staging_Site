// js/map.js
let map = null;

// --- CONFIGURATION ---
// We make the icons 40% larger for better visibility
const ICON_DIMS = {
    size: [35, 57],       // Width, Height (Standard is [25, 41])
    anchor: [17, 57],     // Point of the icon which will correspond to marker's location
    popup: [1, -54],      // Point from which the popup should open relative to the iconAnchor
    shadow: [50, 50]      // Size of the shadow
};

// --- ICONS ---

// Red = Home Base (Owner)
const HomeIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: ICON_DIMS.size,
    iconAnchor: ICON_DIMS.anchor,
    popupAnchor: ICON_DIMS.popup,
    shadowSize: ICON_DIMS.shadow
});

// Green = Employees (Staff)
const StaffIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: ICON_DIMS.size,
    iconAnchor: ICON_DIMS.anchor,
    popupAnchor: ICON_DIMS.popup,
    shadowSize: ICON_DIMS.shadow
});

// Blue = Client Accounts (Standardized to match others)
const AccountIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: ICON_DIMS.size,
    iconAnchor: ICON_DIMS.anchor,
    popupAnchor: ICON_DIMS.popup,
    shadowSize: ICON_DIMS.shadow
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
    } catch (e) {
        console.error("Geocoding failed for address:", address, e);
    }
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
        // Initialize Leaflet
        map = L.map('map').setView([39.8, -98.5], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        if (L.Control.Geocoder) {
            L.Control.geocoder({ placeholder: "Search address..." }).addTo(map);
        }
    }

    // Clear existing markers
    map.eachLayer(l => l instanceof L.Marker && map.removeLayer(l));

    if (!window.currentUser) {
        if (dashboardKPIs) dashboardKPIs.innerHTML = '<p style="text-align:center; padding:1.5rem; color:red;">Please log in to view data.</p>';
        return;
    }

    const boundsMarkers = [];
    let totalRevenue = 0;
    let accountCount = 0;
    let activeEmployeeCount = 0;

    // --- 1. Load User Home Pin (Red) ---
    try {
        const userDoc = await db.collection('users').doc(window.currentUser.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const address = userData.address;

        if (address && address !== 'Not set') {
            let coords;
            if (userData.lat && userData.lng) {
                coords = { lat: userData.lat, lng: userData.lng };
            } else {
                coords = await getGeocode(address);
                if (coords) {
                    await db.collection('users').doc(window.currentUser.uid).set(coords, { merge: true });
                }
            }

            if (coords) {
                const homeMarker = L.marker([coords.lat, coords.lng], { icon: HomeIcon });
                homeMarker.addTo(map).bindPopup(`<b>Your Home Base</b><br>${address}`);
                boundsMarkers.push(homeMarker);
            }
        }
    } catch (e) {
        console.error("Error loading user profile or geocoding:", e);
    }

    // --- 2. Load Employees (Green) ---
    try {
        const empSnap = await db.collection('employees')
            .where('owner', '==', window.currentUser.email)
            .get();

        empSnap.forEach(doc => {
            const e = doc.data();

            // Count Active Employees
            if (e.status === 'Active') {
                activeEmployeeCount++;
            }

            // Map Logic (Only if they have coords AND are active)
            if (e.lat && e.lng && e.status === 'Active') {
                const marker = L.marker([e.lat, e.lng], { icon: StaffIcon });
                marker.addTo(map).bindPopup(`<b>👤 ${e.name}</b><br>${e.role}<br>${e.address}`);
                boundsMarkers.push(marker);
            }
        });
    } catch (e) { console.error("Error loading employees on map", e); }

    // --- 3. Load Account Pins (Blue) & Calculate KPIs ---
    const q = window.currentUser.email === 'admin@cleandash.com'
        ? db.collection('accounts')
        : db.collection('accounts').where('owner', '==', window.currentUser.email);

    q.get().then(snap => {
        accountCount = snap.size;

        snap.forEach(doc => {
            const a = doc.data();
            totalRevenue += (a.revenue || 0);

            if (a.lat && a.lng) {
                // UPDATED: Use the large AccountIcon instead of default
                const marker = L.marker([a.lat, a.lng], { icon: AccountIcon });
                marker.addTo(map)
                    .bindPopup(`<b>🏢 ${a.name}</b><br>${a.address}<br><b style="color:#0d9488">$${(a.revenue || 0).toLocaleString()}/mo</b>`);
                boundsMarkers.push(marker);
            }
        });

        // --- RENDER KPIS ---
        const kpiHtml = `
            <div class="kpi-dashboard-item" style="border-left-color: #3b82f6;">
                <p>Total Accounts</p>
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
        if (dashboardKPIs) dashboardKPIs.innerHTML = kpiHtml;

        // --- 3. Auto-Zoom Logic ---
        setTimeout(() => {
            map.invalidateSize();

            if (boundsMarkers.length > 0) {
                const group = new L.featureGroup(boundsMarkers);
                map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 11 });
            } else {
                map.setView([39.8, -98.5], 4);
            }
        }, 100); 
    });
}

window.loadMap = loadMap;