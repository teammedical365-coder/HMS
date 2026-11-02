# Phase 21 — Package Management

## 1. Module Overview

The **Package Management** module allows hospital administrators to bundle multiple clinical services, outpatient consultations, diagnostic tests, operating theater procedures, and inpatient stays into bundled healthcare packages (e.g., *Maternity Gold Package*, *Annual Executive Wellness Checkup*, *Dialysis 10-Session Plan*).

### Key Architectural Pillars
- **Snapshot Isolation Pattern**: When a package is assigned to a patient, a complete snapshot of all included services, quantities, and pricing rules is frozen into the patient's assignment record. Subsequent edits to the master hospital package never affect ongoing patient packages.
- **Consumption & Quota Tracking**: Real-time logging of service utilization (`usedQuantity` vs. `includedQuantity`), supporting both limited allotments and unlimited services (`includedQuantity: -1`).
- **Automated Extra-Charge Billing**: When a patient exceeds their package entitlement for a specific service, the billing engine automatically applies configured overage tariffs (`extraChargePerUnit`).
- **Immutability of In-Use Packages**: Hospital packages that have been assigned to patients cannot be hard-deleted; they can only be deactivated (`isActive: false`) to preserve historical audit integrity.

---

## 2. Package Architecture & Assignment Lifecycle

```mermaid
flowchart TD
    subgraph MasterPackage ["Hospital Package Catalog (HospitalPackage)"]
        CreatePkg["Admin Creates Package (Services, Total Price, Validity)"]
        EditPkg["Admin Updates Master Package"]
        SoftDeact["Admin Deactivates Package"]
    end

    subgraph AssignmentEngine ["Patient Assignment (PatientPackageAssignment)"]
        AssignAction["Assign Package to Patient"]
        FreezeSnap["Freeze Snapshot of Services (snapshotServices)"]
        InitStatus["Status: ACTIVE, Expiry: Today + validityDays"]
    end

    subgraph ServiceConsumption ["Clinical Care Delivery"]
        UseSvc["Patient receives Consultation / Lab / Bed Day"]
        QuotaCheck{"usedQuantity < includedQuantity?"}
        ConsumeFree["Consume Included Quota (usedQuantity + 1)"]
        ChargeExtra["Charge extraChargePerUnit to Patient Ledger"]
        LogUsage["Append to usageLog with Entity Ref"]
    end

    CreatePkg --> AssignAction
    AssignAction --> FreezeSnap
    FreezeSnap --> InitStatus
    EditPkg -.->|Does NOT affect existing| FreezeSnap

    InitStatus --> UseSvc
    UseSvc --> QuotaCheck
    QuotaCheck -->|Yes| ConsumeFree
    QuotaCheck -->|No (Overage)| ChargeExtra
    ConsumeFree --> LogUsage
    ChargeExtra --> LogUsage
```

---

## 3. Data Models & Schemas

### 3.1 Hospital Master Package Model (`server/src/models/hospitalPackage.model.js`)

```javascript
const packageServiceSchema = new mongoose.Schema({
    serviceName: { type: String, required: true, trim: true },
    serviceCategory: {
        type: String,
        enum: ['Consultation', 'Lab', 'Pharmacy', 'Facility', 'Surgery', 'Procedure', 'Nursing', 'Other'],
        default: 'Other'
    },
    includedQuantity: { type: Number, default: 1, min: -1 }, // -1 = Unlimited
    extraChargePerUnit: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', trim: true }
}, { _id: true });

const hospitalPackageSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    name: { type: String, required: [true, 'Package name is required'], trim: true },
    code: { type: String, trim: true, uppercase: true, default: '' },
    description: { type: String, default: '', trim: true },
    category: {
        type: String,
        enum: ['General', 'Maternity', 'Surgery', 'Wellness', 'Dialysis', 'Physiotherapy', 'Dental', 'Eye', 'Cardiology', 'Other'],
        default: 'General'
    },
    services: [packageServiceSchema],
    totalPrice: { type: Number, required: true, min: 0 },
    discountedPrice: { type: Number, default: null, min: 0 },
    validityDays: { type: Number, default: 365, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    totalAssignments: { type: Number, default: 0 }
}, { timestamps: true });
```

### 3.2 Patient Package Assignment Model (`server/src/models/patientPackageAssignment.model.js`)

```javascript
const snapshotServiceSchema = new mongoose.Schema({
    serviceName: { type: String, required: true },
    serviceCategory: { type: String, default: 'Other' },
    includedQuantity: { type: Number, default: 1 },
    usedQuantity: { type: Number, default: 0 },
    extraChargePerUnit: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    notes: { type: String, default: '' }
}, { _id: true });

const usageLogSchema = new mongoose.Schema({
    serviceIndex: { type: Number, required: true },
    serviceName: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    isExtra: { type: Boolean, default: false },
    extraAmount: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    loggedByName: { type: String, default: '' },
    loggedAt: { type: Date, default: Date.now },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    labReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabReport', default: null },
    pharmacyOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyOrder', default: null }
}, { _id: true, timestamps: true });

const patientPackageAssignmentSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    patientName: { type: String, default: '' },
    patientMRN: { type: String, default: '' },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'HospitalPackage', required: true, index: true },
    packageName: { type: String, required: true },
    packageCode: { type: String, default: '' },
    snapshotServices: [snapshotServiceSchema],
    usageLog: [usageLogSchema],
    totalPackageAmount: { type: Number, required: true },
    totalExtraCharges: { type: Number, default: 0 },
    assignedDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true },
    status: {
        type: String,
        enum: ['ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
        default: 'ACTIVE',
        index: true
    },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true,
    optimisticConcurrency: true
});
```

---

## 4. Quota Consumption & Overage Logic

When a clinical event occurs (e.g., patient visits doctor or undergoes a diagnostic panel):
1. **Locate Active Package**: The billing engine searches for an `ACTIVE` assignment where `expiryDate >= now`.
2. **Evaluate Service Balance**:
   - If `includedQuantity === -1` (Unlimited), usage is logged with `isExtra = false` and `extraAmount = 0`.
   - If `usedQuantity < includedQuantity`, `usedQuantity` increments by the consumed units, with `isExtra = false`.
   - If `usedQuantity >= includedQuantity`, `isExtra = true` and `extraAmount = quantity * extraChargePerUnit`.
3. **Ledger Update**: If extra charges apply, they are appended to the patient's billing invoice as out-of-package liabilities.
4. **Completion Check**: If all non-unlimited services reach `usedQuantity >= includedQuantity`, the package status shifts to `COMPLETED`.

---

## 5. API Endpoints Catalog (`server/src/routes/package.routes.js`)

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/packages` | Authenticated Staff | Lists active packages for the hospital. |
| `POST` | `/api/packages` | `hospitaladmin` | Creates a new bundled package with service quotas and pricing. |
| `PUT` | `/api/packages/:id` | `hospitaladmin` | Updates an existing package. |
| `DELETE` | `/api/packages/:id` | `hospitaladmin` | Deactivates or deletes package (Soft deactivation if assigned). |
| `POST` | `/api/packages/assign` | Reception / Cashier / Admin | Assigns package to patient, freezing service snapshot. |
| `GET` | `/api/packages/patient/:patientId` | Staff | Fetches all active and historical package assignments for a patient. |
| `POST` | `/api/packages/assignments/:id/consume` | Doctor / Reception / Lab | Records consumption of a package service, calculating overage fees. |
| `PUT` | `/api/packages/assignments/:id/cancel` | `hospitaladmin` | Cancels an active patient package assignment. |

