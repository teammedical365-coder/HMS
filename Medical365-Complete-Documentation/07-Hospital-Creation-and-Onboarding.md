# 07 — Hospital Creation & Tenant Onboarding Pipeline

## 1. Overview

The **Hospital Creation & Onboarding Pipeline** is one of the most critical operational lifecycles in the Medical365 platform. When a Super Admin registers a new hospital or clinic, the system initiates an automated provisioning cascade: it validates branding and domain configurations, establishes isolated tenant database storage, seeds default clinical compliance policies, initializes a prepaid AI operational wallet, and links the hospital's selected departments directly to the Question Library.

---

## 2. Hospital Creation Form Specifications

The creation form is located in `client/src/pages/centraladmin/CentralAdminDashboard.jsx` (lines 3100–3450). Every field is documented below:

| Field Name | Form Field Label | Type | Required? | Validation Rules | Default Value | Target Schema Property | Module Impact |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| `name` | Hospital Name | Text | **Yes** | Alphanumeric, trimmed | `""` | `Hospital.name` | Displayed across UI, printed on bills, prescriptions, reports |
| `slug` | Hospital Slug | Text | Optional | Lowercase, hyphen-separated, max 60 chars | Auto-derived from `name` | `Hospital.slug` | Determines portal URL (`https://<slug>.medical365.in`) |
| `plan` | Subscription Plan | Dropdown | **Yes** | `enterprise`, `multi_speciality_starter`, `clinic_basic` | Current active tab | `Hospital.subscriptionPlan` | Dictates doctor & staff capacity quotas |
| `customDomain`| Custom Domain | Text | Optional | Valid FQDN (e.g. `apollohospitals.org`) | `""` | `Hospital.customDomain` | Routes custom domain traffic to this tenant |
| `phone` | Phone Number | Text | **Yes** | Exactly 10 digits (`pattern="\d{10}"`) | `""` | `Hospital.phone` | Displayed on appointment slips & receipts |
| `email` | Email Address | Email | **Yes** | Valid email format | `""` | `Hospital.email` | Administrative notifications & OTP delivery |
| `website` | Website | Text | Optional | Alphanumeric / URL string | `""` | `Hospital.website` | Printed on official clinical headers |
| `address` | Full Address | Text | **Yes** | Non-empty string | `""` | `Hospital.address` | Printed on patient invoices, OPD slips |
| `city` | City | Text | **Yes** | Non-empty string | `""` | `Hospital.city` | Analytics grouping, ABDM registry |
| `state` | State | Text | **Yes** | Non-empty string | `""` | `Hospital.state` | Tax calculation & state health records |
| `departments` | Departments Provided | Multi-Select | Optional | Selected from Question Library catalog | `[]` | `Hospital.departments` | Filters available clinical intake questions |
| `whiteLabelEnabled`| Enable White-Label | Toggle | Optional | Boolean flag | `false` | `Hospital.whiteLabelEnabled` | Activates custom styling engine |
| `brandingSchema.appName` | App Display Name | Text | Optional | Alphanumeric string | `""` | `Hospital.brandingSchema.appName` | Overrides "Medical365" in header & mobile app |
| `brandingSchema.themeColors.primary` | Primary Theme Color | Color Picker + Hex | Optional | Hex string (`#RRGGBB`) | `#14b8a6` | `themeColors.primary` | Drives `--brand-500` & primary action buttons |
| `brandingSchema.themeColors.secondary`| Secondary Color | Color Picker + Hex | Optional | Hex string (`#RRGGBB`) | `#0a2647` | `themeColors.secondary` | Drives deep navigation navy color scales |
| `brandingSchema.themeColors.background`| Background Color| Color Picker + Hex | Optional | Hex string (`#RRGGBB`) | `#ffffff` | `themeColors.background` | Sets `--bg-color` across dashboard workspace |

---

## 3. End-to-End Onboarding Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Super Administrator
    participant UI as CentralAdminDashboard (/supremeadmin)
    participant API as /api/hospitals (POST)
    participant DB as MongoDB (Master Database)
    participant TenantPool as tenantDb.js (Connection Pool)
    participant TenantDB as Isolated Tenant DB (medical365_tenant_<id>)
    participant AIWallet as aiWallet.service.js

    Admin->>UI: Fills Form & Clicks "Create Hospital"
    UI->>UI: Validates Phone (10 digits) & Required Fields
    UI->>API: POST /api/hospitals (payload + Bearer Token)
    API->>API: verifyCentralAdmin middleware validates caller role
    API->>API: Sanitizes slug: removes special chars, enforces max 60 chars
    API->>DB: Checks slug collisions; increments counter (e.g. apollo-1)
    API->>API: Assigns plan tiers (e.g. multi_speciality: 15 docs, 25 staff)
    API->>DB: Hospital.create(hospitalData) -> Generates hospital._id
    
    rect rgb(240, 248, 255)
        Note over API,TenantDB: Automated Tenant Database Provisioning
        API->>TenantPool: getTenantConnection(hospital._id)
        TenantPool->>TenantDB: Connects to medical365_tenant_<hospitalId>
        TenantPool->>TenantDB: Inserts hospital_meta seed document
        TenantPool->>TenantDB: Auto-seeds 4 Default Hospital Policies
    end

    rect rgb(245, 245, 255)
        Note over API,AIWallet: Automated AI Budget Provisioning
        API->>AIWallet: getOrCreateWallet(hospital._id)
        AIWallet->>DB: AIWallet.create({ hospitalId, balanceInr: 2000, initialProvision: 2000 })
    end

    API-->>UI: HTTP 201 Created { success: true, hospital, tenantDb }
    UI->>UI: Clears form, updates cache, scrolls to new hospital card
    UI-->>Admin: Displays "Hospital created successfully ✅"
```

---

## 4. Step-by-Step Technical Execution Details

### 4.1 Slug Sanitization & Collision Prevention (`server/src/routes/hospital.routes.js:145-164`)
```javascript
const baseSlug = (customSlug || name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);

// Reserved slug safety check
const RESERVED_SLUGS = ['api', 'admin', 'login', 'logout', 'signup', 'register', 'uploads', 'static', 'www'];
if (RESERVED_SLUGS.includes(baseSlug)) {
    return res.status(400).json({ success: false, message: `Slug "${baseSlug}" is reserved.` });
}

// Ensure slug uniqueness by appending incrementing suffix if needed
let slug = baseSlug;
let counter = 1;
while (await Hospital.findOne({ slug })) {
    slug = `${baseSlug}-${counter++}`;
}
```

### 4.2 Automated Tenant Database & Policy Seeding (`lines 180-222`)
1. **Dynamic Connection**: Calls `getTenantConnection(hospital._id)` which creates a dedicated Mongoose connection string pointing to `medical365_tenant_<hospitalId>`.
2. **Forcing Physical DB Allocation**: MongoDB only creates a database when physical bytes are written. The server writes an initial seed document to the `hospital_meta` collection.
3. **Seeding Compliance Policies**: Automatically populates 4 baseline legal policies into the new tenant DB:
   - *General Hospital Policy* (Code of conduct, hygiene protocols).
   - *Appointment & Cancellation Policy* (Notice requirements, triage rules).
   - *Patient Privacy Policy* (Medical confidentiality, electronic record encryption).
   - *Patient Consent Policy* (General clinical and surgical investigation consent).

### 4.3 Initial AI Wallet Provisioning (`lines 224-230`)
- Invokes `aiWalletService.getOrCreateWallet(hospital._id)`.
- Injects **₹2,000 INR** in complimentary clinical AI credit into the `AIWallet` collection.
- Initializes token counters (`totalTokensUsed: 0`, `totalCostInr: 0`) and warning thresholds.

---

## 5. Department Selection & Question Library Coupling

During hospital creation, the Super Admin selects departments from `availableDepartments`.
1. **Source of Options**: `availableDepartments` is dynamically populated from the global Question Library (`questionLibraryAPI.getLibrary()`), presenting all medical specialties currently configured (e.g. `Cardiology`, `ENT`, `Orthopedics`, `Pediatrics`, `Gynecology`, `Dermatology`, `Ophthalmology`, `General Medicine`).
2. **Storage**: The chosen array of strings is stored in `Hospital.departments`.
3. **Downstream Coupling**:
   - When the Hospital Admin later logs in and opens `/hospitaladmin/question-library`, the backend filters the Question Library to return **strictly** the departments selected during this onboarding step.
   - When registering a patient at Reception (`/reception/dashboard`), the department dropdown only lists these authorized departments.
   - In OPD clinical queues, nurses and doctors only see the intake questionnaires corresponding to these active departments.

