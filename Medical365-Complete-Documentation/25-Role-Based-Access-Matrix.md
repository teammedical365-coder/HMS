# Phase 25 — Role-Based Access Control (RBAC) Matrix

## 1. Security Architecture & Authorization Enforcement

Medical365 enforces a multi-tiered authorization model combining:
1. **System Roles**: High-level personas hardcoded into route guards (`superadmin`, `centraladmin`, `hospitaladmin`, `doctor`, `nurse`, `receptionist`, `cashier`, `accountant`, `labtechnician`, `pharmacist`, `patient`).
2. **Dynamic Custom Roles**: Hospital-scoped roles stored in the `Role` collection with granular permission sets.
3. **Role-to-Route Authorization Middleware**:
   - `verifyToken`: Decodes JWT and validates against `TokenBlacklist` and active `Session`.
   - `verifyCentralAdmin`: Restricts endpoints to `centraladmin` or `superadmin`.
   - `verifyHospitalAdmin`: Restricts endpoints to `hospitaladmin` or Central Admin.
   - `requirePermission(perm)`: Evaluates whether `req.user._roleData.permissions` contains the required permission flag or the wildcard `*`.
4. **Client-Side Menu Synthesis (`PERMISSION_NAV_MAP`)**: Dynamic generation of navigation links based on user permissions.

---

## 2. Standard Permission Flags

The system defines **18 granular permission flags** grouped across 5 operational domains:

```javascript
const SYSTEM_PERMISSIONS = {
    // Clinical & Consultations
    DOCTOR_ACCESS: 'doctor_access',
    APPOINTMENT_MANAGE: 'appointment_manage',
    CLINICAL_MANAGE: 'clinical_manage',
    IPD_ORDERS_MANAGE: 'ipd_orders_manage',
    IPD_VIEW: 'ipd_view',

    // Front Desk & Operations
    RECEPTION_ACCESS: 'reception_access',
    STAFF_MANAGE: 'staff_manage',
    DEPARTMENTS_MANAGE: 'departments_manage',
    FACILITIES_MANAGE: 'facilities_manage',
    BEDS_MANAGE: 'beds_manage',
    OT_MANAGE: 'ot_manage',

    // Diagnostics & Supply Chain
    INVENTORY_MANAGE: 'inventory_manage',
    LAB_PRICING_MANAGE: 'lab_pricing_manage',
    LAB_TESTS_MANAGE: 'lab_tests_manage',

    // Financials & Commerce
    BILLING_MANAGE: 'billing_manage',
    ACCOUNTS_VIEW: 'accounts_view',
    AI_WALLET_MANAGE: 'ai_wallet_manage',
    REFUNDS_MANAGE: 'refunds_manage',

    // Super Administrator Wildcard
    ALL: '*'
};
```

---

## 3. Comprehensive Role-to-Feature Permission Matrix

| System Module / Capability | Central Admin | Hospital Admin | Doctor / Surgeon | Doctor Assistant | Nurse | Receptionist | Cashier | Accountant | Lab Tech | Pharmacist | Patient |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **System & Tenancy** | | | | | | | | | | | |
| Create / Delete Hospitals | **CRUD** | — | — | — | — | — | — | — | — | — | — |
| Assign Subscription Plans | **CRUD** | — | — | — | — | — | — | — | — | — | — |
| Trigger Android APK Build | **CRUD** | — | — | — | — | — | — | — | — | — | — |
| Global Master Question Lib | **CRUD** | **R** | — | — | — | — | — | — | — | — | — |
| Global Consent Master | **CRUD** | **R** | — | — | — | — | — | — | — | — | — |
| **Hospital Administration**| | | | | | | | | | | | |
| Update White-Label Theme | **CRUD** | **CRUD** | — | — | — | — | — | — | — | — | — |
| Onboard Staff & Doctors | **CRUD** | **CRUD** | — | — | — | — | — | — | — | — | — |
| Configure Department Fees | **CRUD** | **CRUD** | — | — | — | — | — | — | — | — | — |
| Register Department UPIs | **CRUD** | **CRUD** | — | — | — | — | — | — | — | — | — |
| AI Wallet Topup & Ledger | **CRUD** (Topup) | **R** (Ledger) | **R** (Own) | — | — | — | — | — | — | — | — |
| Data Migration Engine | **CRUD** | **CRUD** | — | — | — | — | — | — | — | — | — |
| Local Sync Pairing & Mesh| **CRUD** | **CRUD** | — | — | — | — | — | — | — | — | — |
| **Outpatient Care (OPD)** | | | | | | | | | | | |
| Book OPD Appointment | **CRUD** | **CRUD** | **R** | **CRUD** | **R** | **CRUD** | **R** | — | — | — | **CR** (Own) |
| Manage Token Queue | **CRUD** | **CRUD** | **RU** | **CRUD** | **RU** | **CRUD** | **R** | — | — | — | **R** (Own) |
| Triage Intake & Questions| **CRUD** | **CRUD** | **RU** | **CRUD** | **CRUD** | — | — | — | — | — | — |
| Clinical Consult & Diagnosis| — | — | **CRUD** | **R** | **R** | — | — | — | — | — | **R** (Own) |
| Electronic Prescriptions | — | — | **CRUD** | — | **R** | — | — | — | — | **R** | **R** (Own) |
| Ambient Voice Scribe AI | — | — | **CRUD** | — | — | — | — | — | — | — | — |
| **Inpatient Care (IPD)** | | | | | | | | | | | |
| Admit Patient & Assign Bed| **CRUD** | **CRUD** | **R** | — | **RU** | **CRUD** | — | — | — | — | — |
| Inter-Ward Bed Transfer | **CRUD** | **CRUD** | **R** | — | **CRUD** | **CRUD** | — | — | — | — | — |
| Ward Vitals & Intake/Output| — | — | **R** | — | **CRUD** | — | — | — | — | — | — |
| Med Administration (MAR)| — | — | **R** | — | **CRUD** | — | — | — | — | **R** | — |
| Physician Discharge Order| — | — | **CRUD** | — | — | — | — | — | — | — | — |
| Nursing Clearance Order | — | — | — | — | **CRUD** | — | — | — | — | — | — |
| Settle IPD Discharge Bill | **CRUD** | **CRUD** | — | — | — | **CRUD** | **CRUD** | **CRUD** | — | — | **R** (Own) |
| **Diagnostics & Bio-Bank**| | | | | | | | | | | |
| Master Lab Catalog | **CRUD** | **R** | **R** | — | — | — | — | — | **R** | — | — |
| Hospital Lab Overrides | **CRUD** | **CRUD** | **R** | — | — | — | — | — | **R** | — | — |
| Order Diagnostic Tests | — | — | **CRUD** | — | **CR** | **CR** | — | — | — | — | — |
| Specimen Intake & Process| — | — | — | — | — | — | — | — | **CRUD** | — | — |
| Upload Lab Report PDF | — | — | — | — | — | — | — | — | **CRUD** | — | — |
| Bio-Bank Vial Cryo-Tracking| **CRUD** | **CRUD** | **R** | — | — | — | — | — | **CRUD** | — | — |
| **Pharmacy & Supplies** | | | | | | | | | | | |
| Master Drug Catalog | **CRUD** | **CRUD** | **R** | — | — | — | — | — | — | **CRUD** | — |
| Purchase Invoices & Vendors| **CRUD** | **CRUD** | — | — | — | — | — | **R** | — | **CRUD** | — |
| Dispense Prescription | — | — | — | — | — | — | — | — | — | **CRUD** | — |
| Inter-Department Stock | **CRUD** | **CRUD** | — | — | **R** | — | — | — | — | **CRUD** | — |
| **Billing & Commercial** | | | | | | | | | | | |
| Collect Cash / Split Payment| **CRUD** | **CRUD** | — | — | — | **CRUD** | **CRUD** | **CRUD** | — | — | — |
| Generate Final Tax Invoice| **CRUD** | **CRUD** | — | — | — | **CRUD** | **CRUD** | **CRUD** | — | — | **R** (Own) |
| Request Patient Refund | **CRUD** | **CRUD** | — | — | — | **CR** | **CR** | **CR** | — | — | — |
| Approve / Reject Refund | **CRUD** | **CRUD** | — | — | — | — | — | — | — | — | — |
| Disburse UPI/Bank Refund | — | — | — | — | — | — | — | **CRUD** | — | — | — |
| Disburse Cash Refund | — | — | — | — | — | **CRUD** | **CRUD** | — | — | — | — |
| Define Hospital Packages | **CRUD** | **CRUD** | — | — | — | — | — | — | — | — | — |
| Assign Package to Patient| **CRUD** | **CRUD** | — | — | — | **CRUD** | **CRUD** | **CRUD** | — | — | — |
| Consume Package Quota | — | — | **CRUD** | — | **CRUD** | **CRUD** | **CRUD** | — | **CRUD** | **CRUD** | — |

*Legend: **C** = Create, **R** = Read/View, **U** = Update/Edit, **D** = Delete, **—** = Forbidden (HTTP 403).*

---

## 4. Navigation Menu Authorization Mapping (`PERMISSION_NAV_MAP`)

The frontend sidebar dynamically builds visible navigation routes according to the permissions assigned to the active user's role:

```javascript
const PERMISSION_NAV_MAP = {
    // Clinical Navigation
    doctor_access: [
        { label: 'Doctor Console', path: '/doctor/dashboard', icon: 'FaStethoscope' },
        { label: 'OPD Appointments', path: '/doctor/appointments', icon: 'FaCalendarCheck' },
        { label: 'Surgery Planning', path: '/doctor/surgeries', icon: 'FaBedPulse' }
    ],
    clinical_manage: [
        { label: 'EMR Records', path: '/clinical/records', icon: 'FaNotesMedical' }
    ],
    ipd_view: [
        { label: 'Inpatient Wards', path: '/ipd/wards', icon: 'FaHospitalUser' },
        { label: 'Bed Management', path: '/ipd/beds', icon: 'FaBed' }
    ],

    // Front Desk Navigation
    reception_access: [
        { label: 'Front Desk Queue', path: '/reception/queue', icon: 'FaUsersViewfinder' },
        { label: 'Walk-In Booking', path: '/reception/walk-in', icon: 'FaTicket' }
    ],

    // Pharmacy Navigation
    inventory_manage: [
        { label: 'Pharmacy POS', path: '/pharmacy/pos', icon: 'FaPills' },
        { label: 'Drug Inventory', path: '/pharmacy/inventory', icon: 'FaBoxesStacked' },
        { label: 'Vendors & Invoices', path: '/pharmacy/invoices', icon: 'FaFileInvoiceDollar' }
    ],

    // Laboratory Navigation
    lab_tests_manage: [
        { label: 'Diagnostic Orders', path: '/lab/queue', icon: 'FaVialVirus' },
        { label: 'Report Upload', path: '/lab/upload', icon: 'FaFileWaveform' },
        { label: 'Vial Cryo-Storage', path: '/vials/storage', icon: 'FaSnowflake' }
    ],

    // Financial Navigation
    billing_manage: [
        { label: 'POS Billing', path: '/billing/pos', icon: 'FaCashRegister' },
        { label: 'Patient Invoices', path: '/billing/invoices', icon: 'FaReceipt' }
    ],
    accounts_view: [
        { label: 'Financial Analytics', path: '/finance/dashboard', icon: 'FaChartLine' }
    ],
    refunds_manage: [
        { label: 'Refund Requests', path: '/refunds/manage', icon: 'FaHandHoldingDollar' }
    ]
};
```

---

## 5. Security Invariant Enforcement Rules

1. **Hierarchy Defense**: Central Admin routes reject Hospital Admins and lower roles with `403 Forbidden`.
2. **Horizontal Tenant Boundary**: Any query for clinical, financial, or operational data includes `{ hospitalId: req.user.hospitalId }`, preventing cross-hospital data leakage.
3. **Privilege Escalation Prevention**: When creating or updating users, a Hospital Admin cannot assign permissions exceeding their own role, nor can they assign the wildcard `*` permission.

