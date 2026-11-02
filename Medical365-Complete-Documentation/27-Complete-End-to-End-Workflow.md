# Phase 27 — Complete End-to-End System Workflow

## 1. Master Architecture Sequence

The following diagram illustrates the complete, interconnected lifecycle of Medical365—spanning multi-tenant provisioning, white-label branding, clinical care delivery, diagnostic laboratory investigations, inpatient admission, surgical planning, point-of-sale financial settlement, and hybrid edge data synchronization.

```mermaid
sequenceDiagram
    autonumber
    actor SA as Super Admin
    actor HA as Hospital Admin
    actor Recep as Receptionist / Cashier
    actor Nurse as Ward Nurse / Assistant
    actor Doc as Attending Doctor
    actor Lab as Lab Technician
    actor Pharm as Pharmacist
    participant Cloud as Medical365 Cloud Platform
    participant Local as On-Premise Local Agent

    %% Phase 1: Onboarding
    Note over SA,Cloud: 1. Hospital Provisioning & Onboarding
    SA->>Cloud: POST /api/hospitals (Create Hospital: Apollo Care, Plan: multi_speciality_starter)
    Cloud->>Cloud: Provision Tenant DB, Seed Policies, Credit ₹2,000 AI Wallet
    SA->>Cloud: POST /api/hospitals/admin/create (Create Hospital Admin user)
    Cloud-->>HA: Dispatches Welcome Email with Credentials & Portal Link

    %% Phase 2: Configuration
    Note over HA,Cloud: 2. White-Label & Operational Setup
    HA->>Cloud: PUT /api/hospitals/my-hospital/branding (Upload Logo, Set Primary Colors)
    HA->>Cloud: PUT /api/hospitals/my-hospital/department-fees (Cardiology Fee: ₹800, Validity: 7 Days)
    HA->>Cloud: POST /api/hospitals/department-upis (Assign Reception & Pharmacy UPIs)
    HA->>Cloud: POST /api/admin/users (Onboard Doctors & Staff within plan quotas)

    %% Phase 3: Outpatient Care
    Note over Recep,Doc: 3. Outpatient (OPD) Registration & Consultation
    Recep->>Cloud: POST /api/patients (Register Patient, Generate MRN: P-101)
    Recep->>Cloud: POST /api/appointments (Book OPD with Dr. Sharma, Token #04)
    Nurse->>Cloud: POST /api/assistant/triage-prep (Complete Question Library Intake Form)
    Doc->>Cloud: POST /api/voice-scribe (Record Audio Consultation -> AI generates SOAP Note)
    Doc->>Cloud: POST /api/clinical/prescribe (Prescribe CBC Lab Test + Antibiotics)

    %% Phase 4: Diagnostics
    Note over Lab,Doc: 4. Laboratory Investigation & Specimen Tracking
    Lab->>Cloud: POST /api/vials/intake (Intake Blood Vial -> Store: Room 2 / Unit A / Rack 3)
    Lab->>Cloud: POST /api/labs/reports/:id/upload (Upload Lab PDF Report)
    Cloud->>Cloud: AI extracts biomarkers, flags abnormal elevated WBC
    Doc->>Cloud: Reviews Lab Report & Abnormal Biomarkers in EMR

    %% Phase 5: Inpatient Stay
    Note over Doc,Nurse: 5. Inpatient (IPD) Admission & Bed Movement
    Doc->>Cloud: Recommends Inpatient Admission
    Recep->>Cloud: POST /api/admissions (Allocate Bed G-102, Ward: General)
    Cloud-->>Local: Broadcasts bed_status_changed event via WebSocket
    Recep->>Cloud: POST /api/admissions/:id/transfer (Condition deteriorates -> Move to ICU-01)
    Cloud->>Cloud: Calculates segment stay for General Ward; updates daily rate to ICU tariff
    Nurse->>Cloud: POST /api/ipd/nursing/vitals & MAR (Administer IV antibiotics & monitor vitals)

    %% Phase 6: Discharge & Billing
    Note over Doc,Recep: 6. Multi-Stage Discharge & Financial Settlement
    Doc->>Cloud: POST /api/admissions/:id/discharge-order (Physician signs Discharge Summary)
    Nurse->>Cloud: POST /api/admissions/:id/nurse-clearance (Nursing clearance complete)
    Recep->>Cloud: GET /api/finance/patient/:id/billing (Aggregates OPD, Lab, Pharmacy, Bed stays)
    Recep->>Cloud: POST /api/finance/payments (Settle bill: Split ₹3,000 Cash + ₹7,000 UPI)
    Cloud->>Cloud: Discharge finalized, Bed ICU-01 marked AVAILABLE
    Cloud-->>Local: Syncs transactions & bed status to on-premise edge database
```

---

## 2. Step-by-Step Lifecycle Guide

### Step 1: Central Admin Authentication & Provisioning
1. The Super Administrator authenticates via the **Neural Auth Portal** (`/centraladmin/login`).
2. Central Admin submits the **Hospital Creation Form**:
   - Sets institution name (e.g., *Apex Heart & Multi-Specialty Hospital*).
   - Generates subdomain slug (`apex`).
   - Assigns initial subscription tier: `multi_speciality_starter` (15 doctors, 25 staff).
   - Selects clinical departments: `General`, `Cardiology`, `Orthopedics`, `Pediatrics`.
3. The backend:
   - Spawns the dynamic tenant database `medical365_tenant_<hospitalId>`.
   - Seeds default hospital policies (Visitor, Admission, IPD, Billing).
   - Initializes the prepaid **AI Wallet with ₹2,000 credit**.
   - Clones the Master Question Library filtered to the selected departments.

### Step 2: Hospital Admin Onboarding & White-Label Customization
1. Hospital Admin receives an encrypted welcome email and authenticates via two-step OTP.
2. Under the **Overview Tab**, Admin configures branding:
   - Uploads high-resolution PNG logo and SVG favicon.
   - Selects primary brand color (`#0d9488` teal) and secondary accent.
   - The frontend injects CSS variables (`--color-primary`, `--color-primary-hover`) across the UI.
3. Under the **Departments Tab**, Admin defines consultation fees:
   - *Cardiology*: ₹800 (Validity: 7 days).
   - *General*: ₹500 (Validity: 5 days).
4. Registers **Department UPI IDs** for the reception and pharmacy counters to display dynamic QR codes.

### Step 3: Staff & Doctor Provisioning
1. Hospital Admin navigates to the **Staff Tab** and onboards non-doctor personnel (Nurses, Receptionists, Cashiers, Pharmacists, Lab Technicians), assigning roles and permission flags.
2. Navigates to the **Doctors Tab** and adds attending physicians:
   - Sets specialty, room number, OPD schedule, and individual consultation fee overrides.
   - Backend enforces plan quota constraints (maximum 15 doctors).

### Step 4: Patient Registration & Outpatient Consultation
1. A patient arrives at the hospital. Reception enters demographic details and creates an electronic profile; system issues permanent Medical Record Number `P-101`.
2. Reception books an appointment with the cardiologist. The token engine generates Token **#04**, applying the ₹800 department fee.
3. In the triage area, the doctor assistant opens the **Intake Form**. The patient completes the localized Cardiology questionnaire (Chest pain duration, radiating pain, family history).
4. The doctor opens the OPD queue:
   - Pre-intake questionnaire responses appear formatted in the consultation console.
   - Doctor activates **AI Voice Scribe** on their microphone.
   - As doctor and patient converse in Hindi/English, the AI transcribes the dialogue, detects symptoms, and drafts a structured SOAP note.
   - Doctor reviews the differential, prescribes medications, and orders a *Lipid Profile* and *ECG*.

### Step 5: Laboratory Specimen Tracking & AI Diagnostics
1. The diagnostic orders arrive instantly on the Lab Technician's console.
2. The technician draws blood and attaches a barcoded label.
3. In the **Vial Management** module, the technician registers the specimen:
   - Type: `Whole Blood (EDTA)`.
   - 5-Tier Cryo-Storage Address: `Room 1 -> Unit B -> Rack 2 -> Box 4 -> Position 16`.
4. Tests are executed. The technician uploads the completed laboratory report PDF.
5. The **AI Module** parses the PDF, extracts numerical values, and flags elevated *Total Cholesterol (245 mg/dL)* and *LDL (165 mg/dL)* directly into the doctor's EHR view.

### Step 6: Inpatient Admission & Inter-Ward Transfer
1. The cardiologist evaluates the patient's critical symptoms and recommends inpatient admission.
2. Reception processes the admission, assigning bed **G-102** in the General Ward (Daily rate: ₹1,500).
3. The system broadcasts `bed_status_changed` via Socket.io; the ward monitor reflects G-102 as `OCCUPIED`.
4. At 11:30 PM, the patient experiences acute arrhythmia. The medical team initiates an emergency transfer to the ICU:
   - The system calculates the stay in G-102 (e.g., 6.5 hours = ₹406.25 segment charge).
   - Bed G-102 is marked for sanitization; bed **ICU-01** (Daily rate: ₹6,000) is marked `OCCUPIED`.
5. The ward nurse uses the **IPD Nursing Station** to log hourly vitals, fluid intake/output, and administer IV medications via the Medication Administration Record (MAR).

### Step 7: Multi-Stage Discharge & Consolidated Settlement
1. After 48 hours, the patient stabilizes. The cardiologist completes the **Physician Discharge Order**, authoring the final clinical discharge summary and take-home medications.
2. The head nurse performs clinical clearance (catheters removed, vitals stable, discharge counseling completed) and marks `nursingClearance = true`.
3. The cashier opens the **Unified Patient Billing Profile**:
   - OPD Consultation: ₹800
   - Diagnostic Laboratory Panel: ₹1,400
   - General Ward Segment (6.5 hrs): ₹406.25
   - ICU Stay (48 hrs): ₹12,000
   - Pharmacy Medications: ₹2,150
   - **Total Billable Amount**: ₹16,756.25
4. The patient settles the bill via **Split Tender**: ₹5,000 Cash + ₹11,756.25 via dynamic UPI QR code.
5. Payment is confirmed. The cashier clicks "Finalize Discharge":
   - Bed ICU-01 is vacated and marked `AVAILABLE`.
   - The discharge summary and receipt are printed with the hospital's white-label branding.

### Step 8: Hybrid Edge Synchronization
1. Throughout the day, the on-premise **Local Agent** maintains an active WebSocket tunnel with the cloud.
2. All clinical notes, admissions, bed changes, and payments sync in real-time to the local MongoDB database.
3. If an internet cable is severed, hospital terminals automatically switch to the local server, continuing OPD registrations, vitals logging, and emergency care without downtime.

