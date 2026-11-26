# MEDICAL365 — HOSPITAL BILLING FIX, DEPARTMENT-WISE PAYMENT SEPARATION & IPD PATIENT WRISTBAND REPORT

## 1. Files Created & Modified

### Backend (`server/`)
- **Created** `server/src/models/ipdWristband.model.js` — Multi-tenant `IPDWristband` Mongoose model with unique compound indexes `{ hospitalId: 1, admissionId: 1 }` and `{ hospitalId: 1, wristbandCode: 1 }`, opaque internal `barcodePayload`, patient/admission/hospital snapshots, `status` (`ACTIVE` | `DISCHARGED`), and `printCount` tracking.
- **Modified** `server/src/models/admission.model.js` — Added `ipdNumber`, `wristbandId`, `wristbandCode`, `paidAmount`, `splitPayments[].date`, and expanded `paymentStatus` enum to `['Pending', 'Partially Paid', 'Paid']`.
- **Modified** `server/src/models/paymentTransaction.model.js` — Added `department`, `sourceCategory`, `nonAppointmentAmount`, `idempotencyKey`, and `billedItems.surgeryPlans`.
- **Modified** `server/src/models/refundRequest.model.js` — Added `sourceCategory` for department/service audit traceability.
- **Modified** `server/src/db/tenantModels.js` — Synced tenant schemas (`Admission`, `PaymentTransaction`) and registered `IPDWristband` on isolated tenant database connections.
- **Modified** `server/src/routes/billing.routes.js` — Supported partial and full IPD admission payments (both active and discharged), enforced server-side rejection of `pharmacyOrderIds` and `labReportIds` at Reception (`PUT /api/billing/pay`), added `idempotencyKey` + 15-second duplicate submission protection, classified `department` / `sourceCategory` / `nonAppointmentAmount`, and excluded Pharmacy/Lab bills from Reception billing summaries and history.
- **Modified** `server/src/routes/accountant.routes.js` — Implemented `computeHospitalRefundEligibility` and `resolveHospitalPatient` across master and tenant databases, strictly excluding all OPD Appointment payments (`appt_payment_*`, `Appointment` records, `OPD_CONSULTATION` transactions, and appointment portions of legacy mixed transactions) as well as Pharmacy/Lab bills, enforcing mandatory `reason`, and writing `AuditLog` entries.
- **Modified** `server/src/routes/admission.routes.js` — Added idempotent `ensureAdmissionWristband` auto-generation on `POST /api/admissions`, ward/bed synchronization on `PUT /api/admissions/:id/transfer`, discharge status transition on `PUT /api/admissions/:id/discharge`, and authenticated tenant-scoped endpoints:
  - `GET /api/admissions/:id/wristband`
  - `POST /api/admissions/:id/wristband/print`
  - `GET /api/admissions/wristband/scan/:code`

### Frontend (`client/`)
- **Created** `client/src/components/ipd/IPDWristbandModal.jsx` & `client/src/components/ipd/IPDWristbandModal.css` — White-label IPD patient wristband preview & print modal with client-side ISO/IEC 15417 Code-128B SVG barcode rendering and print count tracking.
- **Modified** `client/src/utils/api.js` — Added `getWristband`, `recordWristbandPrint`, and `scanWristband` to `admissionAPI`.
- **Modified** `client/src/pages/billing/PatientBillingProfile.jsx` — Added selectable cards, checkboxes, and partial/full payment amount inputs for both Active and Past/Discharged IPD bills; fixed `splitPayments` single-mode amount synchronization so the `Pay` button enables properly; fixed sub-24h `0d` facility tag formatting; removed Pharmacy & Lab payment collection from Reception Billing; updated Refund modal to exclude Appointment payments and require a mandatory refund reason; added IPD Wristband preview/reprint button.
- **Modified** `client/src/pages/cashier/CashierDashboard.jsx` — Removed Pharmacy & Lab billing collection from Hospital Cashier settlement and aligned IPD due/partial balance calculation.
- **Modified** `client/src/pages/accountant/AccountantRefunds.jsx` — Enforced mandatory refund reason, added non-refundable OPD Appointment policy banner, and surfaced eligible hospital payment source labels.
- **Modified** `client/src/pages/lab/LabBillingDashboard.jsx` — Updated unbilled order discovery so all non-cancelled clinical lab orders (`Confirmed`, `Sample Collected`, `In Progress`, `Completed`) without an active invoice appear in `Orders to Bill`.
- **Modified** `client/src/pages/reception/ReceptionDashboard.jsx`, `client/src/pages/ot/OTModals.jsx`, `client/src/pages/doctors/DoctorIPDWorkspace.jsx`, `client/src/pages/doctors/DoctorIPDPatients.jsx`, `client/src/pages/nurse/NursePatientWorkspace.jsx` — Auto-opened Wristband Preview on new IPD admissions and added `Wristband` / `Reprint Wristband` actions across IPD views.

---

## 2. IPD Discharge Billing Bug Fixed

### Root Causes Identified
1. **Unselectable Discharged IPD Cards:** In `PatientBillingProfile.jsx`, `Past Admissions` (`status === 'Discharged'`) rendered as static read-only cards with no checkbox and no payment amount input, leaving `Selected Amount` stuck at `₹0`. Sub-24h admissions also rendered `General × 0d` instead of `durationText` (e.g., `9 Hours`).
2. **Unsynchronized `splitPayments` State:** `splitPayments` initialized to `[{ method: 'Cash', amount: '' }]` while `PaymentSection.jsx` rendered single-method inputs as `readOnly` (`Fixed`). Selecting a bill never updated `splitPayments[0].amount`, causing `totalSplitAmount` (`0`) to mismatch `totalSelected()`, keeping the `Pay` button disabled.

### Fix Implemented
- Added selectable cards and checkboxes for all unpaid/partially-paid Active and Discharged IPD admissions in `Reception → Patient Billing`.
- Added Total Bill, Paid Amount, and Outstanding Balance indicators plus an inline **Enter Payment Amount (₹)** input supporting both partial payments (`Partially Paid`) and full balance settlement (`Paid`).
- Auto-synchronized `splitPayments` whenever `totalSelected()` changes so single-mode and split-mode totals match accurately.
- Added backend `admissionPayments` partial/full validation, atomic `paidAmount` + `paymentStatus` updates across master and tenant databases, and `idempotencyKey` duplicate submission protection (`409 Conflict`).

---

## 3. Pharmacy & Laboratory Billing Separation

- **Reception & Cashier:** Removed Pharmacy Orders and Lab Tests payment selection tables and totals from `PatientBillingProfile.jsx` and `CashierDashboard.jsx`. Reception now collects strictly hospital-owned charges (Appointments, Consultations, IPD Admissions, Ward/Room/Bed/Facility Charges, and OT Surgeries).
- **Backend Guard:** `PUT /api/billing/pay` explicitly rejects requests containing `pharmacyOrderIds` or `labReportIds` (`400 Department Billing Separation`), preventing cross-department collection or double revenue counting.
- **Department Billing Preserved:** Pharmacy continues collecting medicine payments in `/pharmacy/orders` & `/pharmacy/collections`, and Laboratory collects diagnostic test payments in `/lab/billing` (`LabBillingDashboard.jsx`), where prescribed unbilled hospital lab orders appear in `Orders to Bill`. Clinical prescription and lab history remain intact on the patient's clinical profile (`UnifiedPatientProfile.jsx`).

---

## 4. Hospital Refund Restrictions Implemented

- **Appointment Payment Protection:** OPD Appointment / Consultation payments are completely excluded from `clientRefundableBalance` in `PatientBillingProfile.jsx` and from `computeHospitalRefundEligibility` in `server/src/routes/accountant.routes.js`.
- **Direct API Enforcement:** `POST /api/accountant/refunds/request` rejects synthetic appointment IDs (`appt_payment_*`), `Appointment` document IDs, `OPD_CONSULTATION` / `APPOINTMENT` `PaymentTransaction` IDs, and Pharmacy/Lab IDs with `400 Bad Request`.
- **Eligible Balance & Audit Controls:** Only non-appointment hospital payments (IPD admission charges, room/bed/facility charges, OT/hospital service charges) contribute to refundable balance (`eligiblePaid - alreadyRefunded - pendingRefundAmount`). A mandatory `reason` is enforced in both frontend and backend, and `AuditLog` entries record initiator and refund details.

---

## 5. Automatic IPD Patient Wristband Implementation

- **Automatic Creation & Preview on Admission:** Admitting a patient via `POST /api/admissions` atomically upserts one unique `IPDWristband` record per `{ hospitalId, admissionId }` and immediately opens `IPDWristbandModal` in `ReceptionDashboard.jsx` and `OTModals.jsx` (never triggered on registration alone or OPD appointment booking).
- **Displayed Fields & White-Label Branding:** Displays the tenant hospital's white-label logo (or Medical365 fallback), hospital name, patient full name, MRN/UHID, age & gender, mobile number, IPD admission number, ward/room & bed number, admission date/time, and a scannable ISO Code-128B barcode.
- **Privacy & Security:** The barcode encodes only an opaque internal code (`WB-...`) with zero public URLs or exposed PII. `GET /api/admissions/wristband/scan/:code` requires authentication and enforces strict `hospitalId` tenant isolation.
- **Idempotent Reprint & Readmission:** `Reprint Wristband` buttons in Reception, Patient Billing, Doctor IPD Workspace/Directory, and Nurse Patient Workspace load the existing wristband and increment `printCount` via `POST /api/admissions/:id/wristband/print` without generating duplicate wristbands. Subsequent readmissions generate a new wristband tied to the new `admissionId` while preserving historical wristbands.

---

## 6. Verification & Tests Executed

1. **Backend Syntax Verification (`node --check`):**
   - Verified `ipdWristband.model.js`, `admission.model.js`, `paymentTransaction.model.js`, `refundRequest.model.js`, `tenantModels.js`, `billing.routes.js`, `accountant.routes.js`, and `admission.routes.js`.
   - **Result:** `BACKEND_SYNTAX_OK` (0 syntax errors).
2. **Route & Schema Functional Verification Suite (`verify_billing_refund_wristband.js` — non-destructive in-memory execution):**
   - `[PASS] 1. Schema & Tenant Model Registration Check` (`Admission` `Partially Paid` enum, `IPDWristband` validation, `PaymentTransaction` department fields, `tenantModels` registration)
   - `[PASS] 2. Department Billing Separation: Reject Pharmacy & Lab on Reception /api/billing/pay` (`400` returned for both `pharmacyOrderIds` and `labReportIds`)
   - `[PASS] 3. Refund Protection: Appointment-only patient has ₹0 refundable balance & direct API refund is rejected` (`totalPaid: 0`, `refundableAmount: 0`, `400` on `appt_payment_*` and appointment `PaymentTransaction`)
   - `[PASS] 4. IPD Discharge Billing: Partial Payment updates balance & status to Partially Paid` (`₹833` paid on `₹1,833` discharged IPD bill -> `paidAmount: 833`, `paymentStatus: 'Partially Paid'`)
   - `[PASS] 5. IPD Discharge Billing: Remaining Full Payment settles bill to Paid & blocks duplicate submission` (`₹1,000` remaining paid -> `paidAmount: 1833`, `paymentStatus: 'Paid'`; duplicate `idempotencyKey` blocked with `409`)
   - `[PASS] 6. Refund Eligibility on IPD Payments: Mandatory reason, accurate deduction & over-refund block` (`₹1,833` eligible excluding `₹500` appointment; blank reason rejected `400`; `₹600` refund leaves `₹1,233`; `₹1,500` over-refund rejected `400`)
   - `[PASS] 7. IPD Wristband: Auto-generation on admission, opaque barcode privacy, idempotent reprint, tenant scan & readmission` (`201` auto-creates `WB-*` barcode with zero PII/URL; 2 reprints keep single wristband record with `printCount: 2`; cross-tenant scan returns `404`; readmission creates distinct wristband)
   - **Result:** `ALL_TESTS_PASSED: 7/7` (exit code `0`).
3. **Frontend Production Bundle Build (`npm --prefix client run build`):**
   - **Result:** `✓ 1369 modules transformed. ✓ built in 2m 2s` (exit code `0`, 0 errors).

---

## 7. Remaining Notes
- Existing historical database records (appointments, invoices, payments, admissions, and prior refunds) were preserved untouched without destructive migrations.
- Legacy historical mixed `PaymentTransaction` documents (if a single historical payment previously bundled an appointment with IPD charges) automatically have the appointment fee deducted when calculating remaining hospital refundable balance.
