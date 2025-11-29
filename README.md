# CleanDash
**All-in-One Management System for Commercial Cleaning Franchises**

CleanDash is a Single Page Application (SPA) designed to bridge the gap between financial forecasting and daily field operations for janitorial business owners. It features a dual-interface system: a robust **Owner Dashboard** for administration and a mobile-first **Employee Portal** for field staff.

---

## Key Features (v1.0)

### Operations & Scheduling
* **Visual Scheduler:** Weekly calendar grid for assigning shifts to employees.
* **Conflict Detection:** "Smart" logic prevents double-booking employees for overlapping times.
* **Mobile-First Employee Portal:** A simplified, read-only view for staff to see their schedules.
* **Geofenced Time Tracking:** Employees can only "Check In" or "Clock Out" when their GPS location is within **500 meters** of the client facility.

### Team Management
* **Owner-Managed Credentials:** Secure "Velvet Rope" onboarding. Owners create employee login credentials directly; no public sign-up allowed.
* **Role-Based Access Control (RBAC):** Automatic "Traffic Cop" routing sends Owners to the Dashboard and Employees to the Portal based on database roles.
* **Map Visualization:** Interactive map (Leaflet) displaying Client Accounts (Blue Pins) and Employee Home Bases (Green Pins) for route optimization.

### Financial Intelligence
* **Dynamic P&L:** Monthly Profit & Loss statement with adjustable Cost of Doing Business (CoDB) and Franchise Fee calculations.
* **C-Fee Calculator:** Specialized tool for estimating franchise fees and financing options (Cash vs. Financed).
* **Revenue Metrics:** Visual line graphs (Chart.js) tracking revenue trends over time.

### Marketing
* **Ad Generator:** Instantly generates formatted job descriptions and printable flyers in English and Spanish.

---

## Tech Stack

* **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3.
* **Backend / Database:** Google Firebase (Authentication & Firestore).
* **Mapping:** Leaflet.js & LocationIQ API (Geocoding).
* **Visualization:** Chart.js (Metrics).
* **Utilities:** html2canvas & jsPDF (PDF Generation).

---

## Installation & Setup

### 1. Clone the Repository
```bash
git clone [https://github.com/YourUsername/CleanDash.git](https://github.com/YourUsername/CleanDash.git)
cd CleanDash
