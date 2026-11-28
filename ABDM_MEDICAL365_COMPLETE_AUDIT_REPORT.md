# MEDICAL365 — ABDM HIE-CM v3 COMPLETE IMPLEMENTATION AUDIT REPORT

**Audit Date:** 2026-11-28  
**Scope:** End-to-End Read-Only Technical Audit against Official ABDM HIE-CM v3 Specifications (`https://docs.abdm.gov.in/docs/hiecm/v3/getting-started/first-fifteen-minutes`)  
**Repository:** `d:\Medical365 Project\HMS`  
**Audit Mode:** Strictly Read-Only Inspection (zero source, dependency, configuration, or database modifications performed)

---

## A. EXECUTIVE SUMMARY

### Overall ABDM Implementation Status
Medical365 currently has a **foundational M1 (partial) and early M2 (discovery & linking skeleton) backend layer** in `server/src/modules/abdm/`, paired with a single frontend modal/card (`AbdmSection.jsx`) on the hospital patient profile (`UnifiedPatientProfile.jsx`). **End-to-end ABDM v3 interoperability is NOT operational** across Health Information Exchange (HIP data push), Health Information User (HIU consent fetching & external record consumption), FHIR R4 clinical serialization, Fidelius encryption/decryption, clinical workflow auto-triggers, Clinic tenants (`ClinicPatient`), or HFR/HPR Registry APIs.

| Audit Classification | Count | Summary |
| :--- | :---: | :--- |
| **Verified Complete (`COMPLETE`)** | **12** | Gateway session token client, RSA-OAEP Aadhaar/OTP encryption, M1 Aadhaar OTP enrol & verify, M1 ABHA-number link OTP flow, duplicate ABHA checks (M1), callback root router/202 ACK/idempotent inbox + retry worker, `hospital.abdm` & `user.abdm` schemas, encrypted `AbdmLinkToken` storage, bridge URL HTTPS/host validator |
| **Partially Completed (`PARTIAL`)** | **15** | M1 Mobile OTP & profile retrieval (missing ABHA Address creation/suggestions, X-Token profile/QR APIs, ABHA-address login), M2 HIP discovery/linking/consent notify (zero clinical workflow triggers linking `createCareContext`/`requestLinking` in OPD/IPD/Lab/Rx/Discharge, callback regex mismatch for `/token/on-generate-token`, missing hospital admin/care-context UI, zero ClinicPatient support) |
| **Missing (`MISSING`)** | **34** | Complete M2 FHIR R4 Bundle generation/validation & Fidelius Curve25519+AES-GCM push (`/health-information/request` explicitly throws `not installed`); **100% of M3 HIU** (consent init, notify/fetch, HI request, transfer callback, decryption, external FHIR storage/UI); **100% of M4 Registry APIs** (HFR sync, HPR doctor verification); Admin Bridge/HIP/CareContext/Consent UI |
| **Not Verified (`NOT VERIFIED`)** | **5** | Live ABDM Sandbox / Gateway token handshake, live UIDAI/ABDM OTP dispatch & verification, live bridge callback delivery with JWKS signature verification (`ABDM_JWKS_URL` missing from `.env`), live `patchBridgeUrl` & `addUpdateServices` responses, NRCeS FHIR sandbox bundle validation |
| **Blocked (`BLOCKED`)** | **2** | M2 Health Info Transfer (`onHealthInfoRequest` blocked by unimplemented data-push module + `ABDM_DATAPUSH_ENABLED` flag) and Production Callback Signature Verification (blocked until `ABDM_JWKS_URL` is configured) |

### Critical Blockers Identified
1. **No FHIR R4 / Fidelius Data Push Engine (`M2` Blocker):** `hip.service.js:270-281` returns `ERR.NOT_ENABLED (1003)` when `ABDM_DATAPUSH_ENABLED=false` and throws `Error('ABDM_DATAPUSH_ENABLED=true but the data push module is not installed')` if enabled. No HL7 FHIR R4 libraries, composition mappers, terminology bindings (SNOMED CT / LOINC / ICD-10), or Curve25519 ECDH + HKDF + AES-GCM (Fidelius) utilities exist anywhere in `server/`.
2. **Zero Clinical Trigger Wiring (`M2` Blocker):** `createCareContext()` and `requestLinking()` in `hip.service.js` are never imported or called anywhere in `server/src/routes/` (OPD appointments, prescriptions, lab reports, IPD discharge summary, or invoices). Consequently, live hospital encounters never register care contexts or link to ABHA.
3. **v3 Callback Path Mismatch (`M2` Blocker):** Official HIE-CM v3 docs route link-token callbacks to `POST /api/v3/hip/token/on-generate-token`, whereas `abdm.inbox.processor.js:14` only matches `/\/hip\/v3\/links\/link\/token$/i`. Incoming v3 link-token callbacks fall through to `UNHANDLED`.
4. **HIU & Registries Entirely Unbuilt (`M3` & `M4` Blockers):** Zero HIU routes/models/UI exist, and zero HFR/HPR registry APIs or `Doctor.hprId` fields exist.
5. **Missing Callback Signature Verification (`Security` Blocker):** `ABDM_JWKS_URL` is unset in `server/.env`, and `ABDM_ALLOW_UNSIGNED_CALLBACKS` is present. While production/staging rejects unsigned callbacks (`503`), non-production environments allow spoofing any callback by supplying the public `X-CM-ID` string (`sbx`).
6. **Clinics & In-Hospital RBAC Gaps (`Multi-Tenant / Security` Blocker):** `abha.routes.js` enforces `verifyToken` only—without checking staff vs patient RBAC—allowing any logged-in user (even another patient) in the same hospital to invoke ABHA APIs against a `patientId`. Furthermore, simple clinics (`ClinicPatient`) are excluded from `AbhaService` and `HipService`, and `ClinicPatientProfile.jsx` has no `<AbdmSection />`.

---

## B. MILESTONE COMPLETION TABLE

*(Feature-level breakdown evaluated against all enumerated checks in Phase 3 + Registry/Multi-tenant requirements; `Total = 66` audited capabilities across M1–M4.)*

| Milestone | Scope | Total Features | Verified Complete | Partial | Missing | Not Verified | Blocked |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **M1** | ABHA / Patient Identity | **14** | 5 | 4 | 3 | 2 | 0 |
| **M2** | HIP (Health Information Provider) | **24** | 6 | 7 | 7 | 2 | 2 |
| **M3** | HIU (Health Information User) | **16** | 0 | 0 | 16 | 0 | 0 |
| **M4** | Registry Integration (HFR / HPR) & Bridge | **12** | 1 | 4 | 6 | 1 | 0 |
| **Total** | **M1 – M4 Combined** | **66** | **12** | **15** | **32** | **5** | **2** |

*(Note: Gateway session management & sandbox connectivity checks overlap across M1/M2/M4 and are counted consistently under their respective milestones above without inflating completions.)*

---

## C. FEATURE-BY-FEATURE STATUS

### Milestone 1 (M1) — ABHA / Identity

1. **Gateway v3 Session Token Acquisition & Refresh**
   - **Status:** `PARTIAL` (`COMPLETE` in local logic/fallback design; `NOT VERIFIED` live against ABDM Sandbox)
   - **File:** `server/src/modules/abdm/abdm.client.js:55-117`, `server/src/modules/abdm/abdm.config.js:22-26`
   - **Symbol / API:** `AbdmClient.getGatewayToken()`, `AbdmClient.call()` -> `POST ${gatewayBase}/gateway/v3/sessions` with fallback `${legacyGatewayBase}/v0.5/sessions`
   - **Implemented:** Standard v3 `client_credentials` payload (`clientId`, `clientSecret`, `grantType`), required v3 headers (`REQUEST-ID`, `TIMESTAMP`, `X-CM-ID`), in-memory caching with 60s early refresh margin, automatic 1-time retry on HTTP `401`.
   - **Missing / Gap:** In-memory singleton cache does not coordinate across clustered Node instances; default `gatewayBase` uses `/api/hiecm`, so `${gatewayBase}/gateway/v3/sessions` resolves cleanly to `/api/hiecm/gateway/v3/sessions`, but live sandbox connectivity was not executed in this audit. Also note `server/test/test_abdm_m1_suite.js` does not make a live call to `getGatewayToken()`.
   - **Evidence:** Inspected `abdm.client.js:55-117` and `test_abdm_m1_suite.js:50-60`.
   - **Next Action:** Run non-destructive sandbox health probe with valid sandbox credentials in an isolated test environment.

2. **Aadhaar / OTP / Mobile RSA Public Key Encryption**
   - **Status:** `COMPLETE`
   - **File:** `server/src/modules/abdm/abdm.client.js:120-138`
   - **Symbol / API:** `getAbhaPublicKeyPem()`, `rsaEncrypt()` -> `GET ${abhaBase}/v3/profile/public/certificate`
   - **Implemented:** Fetches ABDM public certificate (6-hour cache), wraps PEM headers cleanly, encrypts with `RSA/ECB/OAEPWithSHA-1AndMGF1Padding` (`crypto.constants.RSA_PKCS1_OAEP_PADDING`, `oaepHash: 'sha1'`), base64-encoded before outbound calls. Aadhaar is never persisted or logged.
   - **Missing:** Live cert fetch verification against sandbox (`NOT VERIFIED` live).
   - **Evidence:** Direct inspection of `abdm.client.js:120-138` and `abha.service.js:6-9`.
   - **Next Action:** Validate cert endpoint response format against live ABDM Sandbox.

3. **ABHA Number Creation (Aadhaar-Based Enrolment)**
   - **Status:** `PARTIAL`
   - **File:** `server/src/modules/abdm/abha.routes.js:23-24`, `server/src/modules/abdm/abha.service.js:84-113`, `server/src/modules/abdm/abdm.client.js:141-162`, `client/src/components/abdm/AbdmSection.jsx:127-201`
   - **Symbol / API:** `POST /api/abdm/abha/create/start` -> `/v3/enrollment/request/otp`; `POST /api/abdm/abha/create/verify` -> `/v3/enrollment/enrol/byAadhaar`
   - **Implemented:** 12-digit Aadhaar format validation, RSA encryption of Aadhaar & OTP, server-side transaction binding (`AbdmTxn` scoped to `hospitalId` + `patientId` + `userId` with 15-min TTL), profile normalization & DB persistence.
   - **Missing:** Post-enrolment **X-Token (`tokens.token`) handling**, Aadhaar biometric/demographics auth options, and live UIDAI sandbox verification.
   - **Evidence:** `abdm.client.js:141-162` parses `ABHAProfile` / `profile` only and discards `tokens.token` / `refreshToken`.
   - **Next Action:** Store/handle user `X-Token` cleanly (short-lived encrypted/memory session) for subsequent v3 profile/ABHA-address calls.

4. **ABHA Address Creation & Suggestions**
   - **Status:** `MISSING`
   - **File:** Searched `server/src/modules/abdm/` and `client/src/components/abdm/`
   - **Symbol / API:** Missing `GET /abha/api/v3/enrollment/enrol/suggestion` and `POST /abha/api/v3/enrollment/enrol/abha-address`
   - **Implemented:** Stores returned `phrAddress[0]` / `preferredAbhaAddress` if returned during enrolment (`abha.service.js:156-161`).
   - **Missing:** No API or UI to fetch suggested ABHA addresses, check availability, or let the patient create/select a custom `username@sbx` / `username@abdm` PHR address during onboarding.
   - **Evidence:** Absent from `abdm.client.js`, `abha.service.js`, `abha.routes.js`, and `AbdmSection.jsx`.
   - **Next Action:** Add `getAbhaSuggestions()` and `createAbhaAddress()` endpoints and modal step in `AbdmSection.jsx`.

5. **Existing ABHA Verification & Linking (by 14-digit ABHA Number)**
   - **Status:** `COMPLETE` (code implementation) / `NOT VERIFIED` (live sandbox OTP)
   - **File:** `server/src/modules/abdm/abha.service.js:116-151`, `server/src/modules/abdm/abdm.client.js:166-183`, `client/src/components/abdm/AbdmSection.jsx:63-124`
   - **Symbol / API:** `POST /api/abdm/abha/link/start` -> `/v3/profile/login/request/otp`; `POST /api/abdm/abha/link/verify` -> `/v3/profile/login/verify`
   - **Implemented:** Normalizes 14 digits to `XX-XXXX-XXXX-XXXX`, prevents intra-hospital duplicates prior to OTP request (`abha.service.js:127-128`), supports `AADHAAR_OTP` (`otpSystem: 'aadhaar'`, `scope: ['abha-login', 'aadhaar-verify']`) and `MOBILE_OTP` (`otpSystem: 'abdm'`, `scope: ['abha-login']`), binds `txnId` in `AbdmTxn`.
   - **Missing:** Cannot verify/login via ABHA Address (`abha-address` loginHint explicitly rejected at `abha.service.js:122-124` & `AbdmSection.jsx:328`), nor via Mobile-only lookup or Scan & Share QR.
   - **Evidence:** `abha.service.js:121-125` enforces `digits.length === 14`.
   - **Next Action:** Add `abha-address` (`loginHint: 'abha-address'`) and mobile OTP login flows.

6. **ABHA Address Verification / Login (`@abdm` / `@sbx`)**
   - **Status:** `MISSING`
   - **File:** `server/src/modules/abdm/abha.service.js:121-125`, `client/src/components/abdm/AbdmSection.jsx:327-329`
   - **Implemented:** None; code explicitly states `ABHA-address login is not supported yet`.
   - **Missing:** `requestLoginOtp` with `loginHint: 'abha-address'`, UI handling for handles containing `@`.
   - **Next Action:** Implement ABHA-address search/login flow in `AbhaService` and remove UI restriction.

7. **Mobile-Based Authentication / Verification**
   - **Status:** `PARTIAL`
   - **File:** `server/src/modules/abdm/abha.service.js:130-134`, `client/src/components/abdm/AbdmSection.jsx:340`
   - **Implemented:** `MOBILE_OTP` option passes `otpSystem: 'abdm'` when linking by 14-digit ABHA number.
   - **Missing:** Standalone mobile OTP lookup/verification (`loginHint: 'mobile'`) when patient forgets ABHA number/address, and mobile-based PHR address enrolment.
   - **Next Action:** Add `mobile` loginHint support to discover linked ABHAs on a mobile number.

8. **ABHA Profile Retrieval, ABHA Card & QR Code Download**
   - **Status:** `MISSING`
   - **File:** `server/src/modules/abdm/abdm.client.js`, `client/src/components/abdm/AbdmSection.jsx`
   - **Implemented:** Captures basic profile fields returned inline inside enrol/verify responses (`abhaNumber`, `abhaAddress`, `abhaName`, `abhaGender`, `abhaYearOfBirth`, `kycVerified`).
   - **Missing:** No `GET /v3/profile/account`, `GET /v3/profile/account/abha-card`, or `GET /v3/profile/account/qrCode` integration; no ABHA Card viewer/download button in UI; no X-Token propagation.
   - **Next Action:** Add X-Token-authenticated profile/card/QR endpoints and UI viewer.

9. **Patient-to-ABHA Linking & Storage (Hospital vs Clinic Models)**
   - **Status:** `PARTIAL`
   - **File:** `server/src/models/user.model.js:84-95`, `server/src/db/tenantModels.js:40-51`, `server/src/models/clinicPatient.model.js:32-43`, `server/src/modules/abdm/abha.service.js:40-46,154-196`
   - **Implemented:** Hospital `User` model + tenant `User` DB sync cleanly persist `abdm.*` metadata.
   - **Missing:** **Simple Clinics (`ClinicPatient` model) are completely ignored** by `AbhaService.getPatientForTenant` (`User.findOne` only), even though `ClinicPatient` already defines the `abdm` subschema. `ClinicPatientProfile.jsx` never renders `<AbdmSection />`. Also no unlink/re-verify UI control (`onAbhaDeactivate` callback exists server-side only).
   - **Evidence:** Inspected `abha.service.js:43` and `ClinicPatientProfile.jsx`.
   - **Next Action:** Support `ClinicPatient` lookup/update inside `AbhaService` and mount `AbdmSection` in `ClinicPatientProfile.jsx`.

10. **ABHA Session & Transaction Binding (`AbdmTxn`)**
    - **Status:** `COMPLETE`
    - **File:** `server/src/models/abdmTxn.model.js:1-19`, `server/src/modules/abdm/abha.service.js:48-61`
    - **Implemented:** Binds `txnId + flow` to `{ hospitalId, patientId, userId }` in MongoDB with 15-minute auto-expiry TTL index, preventing cross-patient/cross-user OTP replay.
    - **Missing:** Enrol/Login flows do not increment or cap failed OTP `attempts` in `verifyCreate`/`verifyLink` (attempt limiting only implemented in HIP `onLinkConfirm` at `hip.service.js:213`, and `AbhaService.takeTxn` does not atomically delete or lock after single use on error). Also `abha.routes.js` lacks rate limiting on OTP start/verify endpoints and lacks RBAC role checks beyond `verifyToken`.
    - **Next Action:** Add OTP attempt throttling + `verifyReception/verifyClinicalStaff` RBAC middleware on `/api/abdm/abha/*`.

11. **Duplicate ABHA Handling**
    - **Status:** `COMPLETE`
    - **File:** `server/src/modules/abdm/abha.service.js:127-128,168-171`, `server/src/models/user.model.js:158-159`
    - **Implemented:** Checks intra-hospital duplicate `abdm.abhaNumber` (`_id: { $ne: patient._id }`) both before requesting link OTP and before persisting after Aadhaar/Login verify, returning HTTP `409`. Compound sparse indexes exist on `{ hospitalId: 1, 'abdm.abhaNumber': 1 }` and `{ hospitalId: 1, 'abdm.abhaAddress': 1 }`.
    - **Missing:** Duplicate check missing for `abdm.abhaAddress` collision inside `persist()`, and missing uniqueness across `ClinicPatient`.
    - **Next Action:** Add `abdm.abhaAddress` duplicate check and extend to `ClinicPatient`.

12. **Patient Identity Validation & Masking**
    - **Status:** `COMPLETE`
    - **File:** `server/src/modules/abdm/abha.service.js:26-38,164-166`, `client/src/components/abdm/AbdmSection.jsx:236-254`
    - **Implemented:** Masks ABHA Number (`**-****-****-XXXX`) and ABHA Address (`a***z@abdm`) in API responses and UI; stores canonical `abhaName`, `abhaGender`, `abhaYearOfBirth` separately from hospital demographics without overwriting patient registration details.
    - **Missing:** No demographic mismatch warning surfaced to reception/staff if ABHA KYC name/YOB differs significantly from local hospital record.
    - **Next Action:** Return demographic comparison warning flags alongside masked response.

13. **Error Handling & OTP Failure Handling (M1)**
    - **Status:** `PARTIAL`
    - **File:** `server/src/modules/abdm/abdm.client.js:244-265`, `client/src/components/abdm/AbdmSection.jsx:86-91,118-121,156-160,195-199`
    - **Implemented:** Sanitizes outbound gateway errors in `AbdmClient.fail()`, renders inline error alert boxes and toast feedback, preserves 503 `configured: false` status cleanly.
    - **Missing:** No OTP countdown timer, no **Resend OTP** button/endpoint (`POST /abha/api/v3/.../request/otp`), no specific UI handling for ABDM-specific rate-limit/OTP-expired codes vs network timeouts.
    - **Next Action:** Add OTP resend action with cooldown timer in `AbdmSection.jsx`.

14. **Patient Registration Integration & Self-Service Portal**
    - **Status:** `MISSING`
    - **File:** `client/src/pages/reception/ReceptionDashboard.jsx`, `client/src/pages/patient/PatientDashboard.jsx`
    - **Implemented:** `AbdmSection` is mounted inside `UnifiedPatientProfile.jsx:901`.
    - **Missing:** Not integrated into new patient walk-in registration (`ReceptionDashboard.jsx`), Appointment booking, or Patient Portal (`PatientDashboard.jsx`).
    - **Next Action:** Embed optional compact ABHA link/create trigger post-registration or in Patient Portal profile.

---

### Milestone 2 (M2) — HIP (Health Information Provider)

15. **HIP Registration & Per-Hospital Configuration**
    - **Status:** `COMPLETE` (Sandbox API / Schema) / `NOT VERIFIED` (live sandbox gateway)
    - **File:** `server/src/modules/abdm/abdm.bridge.routes.js:30-31`, `server/src/modules/abdm/abdm.bridge.service.js:110-133`, `server/src/models/hospital.model.js:132-135`
    - **Symbol / API:** `PUT /api/abdm/bridge/hospitals/:hospitalId/hip`, `GET /api/abdm/bridge/hospital`
    - **Implemented:** Unique sparse `abdm.hipId` per hospital on `Hospital` model, clash detection (`409`), platform-admin RBAC enforcement, calls sandbox `addUpdateServices` and activates `hospital.abdm.enabled = true`.
    - **Missing:** Frontend Admin UI wiring (API methods exist in `client/src/utils/api.js:2181-2186` but are never called in any React component!).
    - **Evidence:** `Select-String` across `client/src` shows zero callers for `registerHospitalHip`, `getBridgeConfig`, `registerBridgeUrl`, or `getHospitalStatus`.
    - **Next Action:** Build ABDM Settings panel in Central Admin (`CentralAdminDashboard.jsx`) and read-only HIP status card in Hospital Admin (`HospitalAdminDashboard.jsx`).

16. **Patient Discovery (`discover` / `on-discover`)**
    - **Status:** `COMPLETE` (logic) / `PARTIAL` (clinical records gap)
    - **File:** `server/src/modules/abdm/hip.service.js:101-163`, `server/src/modules/abdm/abdm.inbox.processor.js:15`
    - **Symbol / API:** `hipService.onDiscover` -> replies to `config.paths.onDiscover` (`/user-initiated-linking/v3/patient/care-context/on-discover`)
    - **Implemented:** Multi-tenant resolution via `hipId` (`hospital._id`), strict matching requiring at least one strong identifier (`MOBILE` or `ABHA_ADDRESS`) plus weak identifier agreement (fuzzy normalized name, gender, YOB), safe `ERR.NOT_FOUND` on ambiguity (`matches.length !== 1`), returns unlinked `CREATED` care contexts grouped by `hiType`.
    - **Missing:** Does not search `ClinicPatient` for clinics; because `createCareContext` is never wired into clinical routes, `AbdmCareContext` will return `ERR.NO_RECORDS (1001)` for real patients until clinical triggers are hooked up.
    - **Evidence:** `hip.service.js:101-163` and global grep showing 0 clinical callers of `createCareContext`.
    - **Next Action:** Add `ClinicPatient` discovery support and wire `createCareContext` across clinical encounters.

17. **Patient Authentication for UIL Linking (`init` / `on-init`, `confirm` / `on-confirm`)**
    - **Status:** `PARTIAL`
    - **File:** `server/src/modules/abdm/hip.service.js:166-244`, `server/src/modules/abdm/abdm.inbox.processor.js:16-17`
    - **Symbol / API:** `hipService.onLinkInit`, `hipService.onLinkConfirm`
    - **Implemented:** Verifies ownership of requested `referenceNumber` list per `hospitalId + patientId`, generates cryptographically random 6-digit OTP (or sandbox fixed OTP), stores SHA-256 salted hash (`txnId:otp`) with 10-min expiry and 5-attempt lock, timing-safe comparison (`crypto.timingSafeEqual`), updates `AbdmCareContext.status = 'LINKED'`, replies `on-init` / `on-confirm`.
    - **Missing / Blocker Risk:** **`setSmsSender()` is NEVER called anywhere in `server/`!** In production without `config.sandboxFixedOtp`, `sendLinkOtp()` throws `Error('SMS provider not configured for ABDM linking (call setSmsSender)')` (`hip.service.js:70`), failing `onLinkInit` into retry exhaustion.
    - **Evidence:** Repo search for `setSmsSender` confirms zero invocations outside `hip.service.js`.
    - **Next Action:** Wire `hipService.setSmsSender(...)` at server startup to Medical365's SMS gateway provider (while preserving Pacific Demo suppression guard).

18. **Care Context Generation & Storage (`AbdmCareContext`)**
    - **Status:** `PARTIAL`
    - **File:** `server/src/modules/abdm/hip.service.js:322-331`, `server/src/models/abdmCareContext.model.js:1-30`
    - **Symbol / API:** `createCareContext({ hospitalId, patientId, hiType, sourceModel, sourceId, display, visitDate })`
    - **Implemented:** Supports all 8 ABDM HI types (`OPConsultation`, `Prescription`, `DiagnosticReport`, `DischargeSummary`, `ImmunizationRecord`, `WellnessRecord`, `HealthDocumentRecord`, `Invoice`), idempotent compound unique index `{ hospitalId, referenceNumber }`.
    - **Missing:** Completely disconnected from Medical365 runtime clinical events (OPD, IPD, Rx, Lab, Billing). Zero automated invocation exists.
    - **Evidence:** Only called inside `server/test/test_abdm_bundle_integration.js:341`.
    - **Next Action:** Call `createCareContext` + `requestLinking` hooks upon consultation finalization, prescription issue, lab report release, discharge summary finalization, and invoice payment.

19. **HIP-Initiated Care Context Linking (`generate-token` / `on-generate-token` / `link/carecontext`)**
    - **Status:** `PARTIAL` (Broken v3 Callback Route + Null Dereference Risk)
    - **File:** `server/src/modules/abdm/hip.service.js:78-98,334-416`, `server/src/modules/abdm/abdm.inbox.processor.js:14,21`
    - **Symbol / API:** `requestLinking()`, `onLinkToken()`, `linkPendingForPatient()`, `onCareContextLinked()`
    - **Implemented:** Validates `hospital.abdm.enabled` + patient `abdmName`/`abhaGender`/`abhaYearOfBirth`, encrypts stored link token (`AbdmLinkToken` AES-256-GCM + SHA-256 hash), enforces 1-care-context-per-API-call loop (`hip.service.js:387-414`), updates status on `onCareContextLinked`.
    - **Missing / Critical Bugs:**
      1. **Route Mismatch:** Official ABDM HIE-CM v3 sends generated link tokens to `/api/v3/hip/token/on-generate-token`, whereas `abdm.inbox.processor.js:14` only matches `/\/hip\/v3\/links\/link\/token$/i`.
      2. **Null Crash:** `linkPendingForPatient()` at `hip.service.js:378` executes `if (tok.isExpired && ...)` without checking `if (!tok || !hospital?.abdm?.hipId || !patient?.abdm?.abhaAddress)`.
      3. **Tenant Scope on `onCareContextLinked`:** Updates `AbdmCareContext.updateMany({ lastRequestId: corr })` without `hospitalId`.
    - **Next Action:** Update `ROUTES` regex in `abdm.inbox.processor.js` for all official v3 callback paths and add null guards.

20. **OPD Consultation Records Integration (HIP)**
    - **Status:** `MISSING` (HMS module complete; ABDM linkage & FHIR mapper absent)
    - **File:** `server/src/routes/doctor.routes.js`, `server/src/models/appointment.model.js`
    - **Implemented:** Rich HMS OPD `Appointment` model (`symptoms`, `diagnosis`, `doctorNotes`, `vitals`, `pharmacy`, `labTests`, `doctorUserId`).
    - **Missing:** No `createCareContext(..., 'OPConsultation')` call on consultation completion; no FHIR `OPConsultRecord` Composition bundle mapper; no SNOMED/ICD coding.
    - **Next Action:** Trigger `OPConsultation` care context on consultation save/complete and build FHIR `OPConsultRecord` builder.

21. **IPD Admission Records & Clinical Notes Integration (HIP)**
    - **Status:** `MISSING`
    - **File:** `server/src/models/admission.model.js`, `server/src/models/inpatientClinicalNote.model.js`, `server/src/routes/ipdClinical.routes.js`
    - **Implemented:** Full HMS IPD `Admission`, `IPDVitals`, `InpatientClinicalNote`, `InpatientOrder`, `InpatientProgressNote`, `InpatientDrugChart`.
    - **Missing:** No IPD encounter -> ABDM care context registration or FHIR Encounter/Condition/Observation mapping.
    - **Next Action:** Map IPD encounters and clinical notes into FHIR `Encounter` + `Condition` / `Observation` / `DocumentReference` structures.

22. **IPD Discharge Summaries Integration (HIP)**
    - **Status:** `MISSING`
    - **File:** `server/src/models/admission.model.js:42-65`, `server/src/routes/ipdClinical.routes.js:1642-1822`
    - **Implemented:** Structured `dischargeSummary` subdocument with `FINALIZED` sign-off (`admission.routes` / `ipdClinical.routes`).
    - **Missing:** No `createCareContext(..., 'DischargeSummary')` trigger when doctor finalizes discharge summary (`status === 'FINALIZED'`); no FHIR `DischargeSummaryRecord` bundle builder.
    - **Next Action:** Hook `createCareContext` inside `POST /admissions/:admissionId/discharge-summary` (`status === 'FINALIZED'`) and map sections to NRCeS DischargeSummary Composition.

23. **Prescriptions Integration (HIP)**
    - **Status:** `MISSING`
    - **File:** `server/src/models/appointment.model.js:3-10,85`, `server/src/models/pharmacyOrder.model.js`, `server/src/routes/doctor.routes.js`
    - **Implemented:** Structured `pharmacy` item array (`medicineName`, `saltName`, `dosage`, `frequency`, `duration`, `instructions`) on OPD appointments and `dischargeMedications` on IPD admissions.
    - **Missing:** No `createCareContext(..., 'Prescription')` hook; no FHIR `MedicationRequest` / `PrescriptionRecord` bundle generator; medicines are stored as plain text without SNOMED CT / Common Drug Code mapping.
    - **Next Action:** Hook `Prescription` care context on Rx save and serialize to FHIR `PrescriptionRecord`.

24. **Laboratory & Diagnostic Reports Integration (HIP)**
    - **Status:** `MISSING`
    - **File:** `server/src/models/labReport.model.js:9-120`, `server/src/routes/labReports.routes.js`
    - **Implemented:** Rich structured `LabReport` (`parameters`, `numericValue`, `unit`, `referenceRangeSnapshot`, `abnormalFlag`, `verifiedAt`, `verifiedBy`, PDF URL).
    - **Missing:** Zero `createCareContext(..., 'DiagnosticReport')` call on report `APPROVED` / `RELEASED`; no FHIR `DiagnosticReport` + `Observation` (`LOINC` or local code) + `Media` / `Binary` PDF attachment builder.
    - **Next Action:** Hook `DiagnosticReport` care context on LMS report release and map `reportTestSchema` parameters into FHIR `Observation` + `DiagnosticReport`.

25. **FHIR R4 Resource Generation (`nrces.in/ndhm/fhir/r4`)**
    - **Status:** `MISSING`
    - **File:** None (verified across `server/src` and `server/package.json`)
    - **Implemented:** None. No FHIR builders exist for `Composition`, `Patient`, `Practitioner`, `Organization`, `Encounter`, `Condition`, `MedicationRequest`, `Observation`, `DiagnosticReport`, `DocumentReference`, or `Bundle`.
    - **Missing:** Complete NRCeS FHIR R4 serializer & record compatibility check (note: Medical365 `Doctor` currently lacks mandatory HPR/registration identifier for `Practitioner`, and clinical findings lack mandatory SNOMED/LOINC code URIs required by strict NRCeS validation, requiring default/codeableConcept text fallback + terminology mapping table).
    - **Next Action:** Build `server/src/modules/abdm/fhir/` resource mappers and bundle builders for all supported HI types.

26. **FHIR Bundle Schema & NRCeS Profile Validation**
    - **Status:** `MISSING`
    - **File:** None
    - **Implemented:** None.
    - **Missing:** Automated structural validation of generated FHIR R4 Document Bundles against NRCeS ABDM profiles before encryption/transfer.
    - **Next Action:** Add JSON schema / profile structure validator (and test against NRCeS validator / ABDM FHIR IG fixtures).

27. **Consent Notification Handling (`consent/request/hip/notify` & `on-notify`)**
    - **Status:** `PARTIAL`
    - **File:** `server/src/modules/abdm/hip.service.js:247-267`, `server/src/models/abdmConsent.model.js:1-15`
    - **Implemented:** Upserts `AbdmConsent` scoped to `{ hospitalId, consentId }`, stores status (`GRANTED`, `REVOKED`, `EXPIRED`, `DENIED`), `patientAbhaAddress`, and `detail` (`consentDetail`), and sends `onConsentNotify` ACK.
    - **Missing:** Expects incoming path matching `/\/request\/hip\/notify$/i` cleanly, but does NOT validate consent digital signature/artefact schema fields (`permission.dateRange`, `hiTypes`, `careContexts`), does NOT update or cascade status cleanly if an active HI transfer session is paused/revoked, and has NO Hospital Admin / Compliance viewer UI.
    - **Next Action:** Add strict artefact structure validation and consent revocation checks inside data-flow pipeline.

28. **Health Information Request & Consent Validation (`health-information/request` / `on-request`)**
    - **Status:** `BLOCKED` (`MISSING` data push module)
    - **File:** `server/src/modules/abdm/hip.service.js:270-281`, `server/src/modules/abdm/abdm.config.js:48,60`
    - **Implemented:** Inbound route registered (`/data-flow/v3/health-information/request` in `abdm.callbacks.js` & `abdm.inbox.processor.js`); sends honest `1003` rejection when `dataPushEnabled=false`.
    - **Missing:** Entire core handler: consent artefact lookup (`AbdmConsent` status === `GRANTED`, expiry check, date range intersection, `hiTypes` & `careContexts` scope validation), sending `ACKNOWLEDGED` via `on-request` (`hiRequest.sessionStatus = 'ACKNOWLEDGED'`), generating FHIR bundles, encrypting, pushing, and calling `notify`.
    - **Evidence:** `hip.service.js:279-280`: `// TODO (next module): validate consent, build NRCeS FHIR bundles, Fidelius-encrypt, push, notify.` -> throws Error.
    - **Next Action:** Implement HIP Data Push orchestrator service wired to `onHealthInfoRequest`.

29. **Record Encryption (Fidelius: ECDH Curve25519 + HKDF + AES-GCM)**
    - **Status:** `MISSING`
    - **File:** None (`abdm.client.js` only implements RSA-OAEP for M1 Aadhaar/OTP, NOT Fidelius ECDH!)
    - **Implemented:** None. Zero X25519/Curve25519 ephemeral key generation, HKDF-SHA256 shared secret derivation (`salt = XOR(senderNonce, receiverNonce)`), or AES-256-GCM bundle payload encryption exists.
    - **Next Action:** Implement pure Node.js `crypto` (X25519 + HKDF + AES-256-GCM) Fidelius module compatible with ABDM `keyMaterial` (`cryptoAlg: 'ECDH'`, `curve: 'Curve25519'`).

30. **Health Information Transfer Push (`dataPushUrl`) & Completion Notification (`health-information/notify`)**
    - **Status:** `MISSING`
    - **File:** None
    - **Implemented:** None.
    - **Missing:** Outbound HTTPS push to HIU's `dataPushUrl` (handling chunking/pagination for large payloads) and outbound `POST /api/hiecm/data-flow/v3/health-information/notify` reporting `TRANSFERRED` / `ERRORED` status per care context.
    - **Next Action:** Build outbound chunked `dataPushUrl` client + `/health-information/notify` caller with retry semantics.

31. **Callback Handling, Inbox Durability & Retry Recovery**
    - **Status:** `PARTIAL`
    - **File:** `server/src/modules/abdm/abdm.callbacks.js:1-123`, `server/src/modules/abdm/abdm.inbox.processor.js:1-98`, `server/server.js:190-195`
    - **Implemented:** Root mount BEFORE `tenantResolver` & `generalLimiter`, `600 req/min` callback limiter, `X-CM-ID` validation, `15-min` timestamp replay window, mandatory `REQUEST-ID`, atomic `AbdmInbox.create` duplicate protection (`11000` -> `202 duplicate`), immediate `202 ACK` + `setImmediate`, and background recovery worker (`startInboxWorker` every 30s, atomic lock claim `status: PROCESSING`, max 5 attempts, stuck-lock recovery after 5 min, 30-day TTL auto-cleanup).
    - **Missing / Gaps:**
      1. Missing official v3 `/token/on-generate-token` pattern in `ROUTES`.
      2. Missing ALL HIU callback routes (`/hiu/consent/request/notify`, `/consent/on-fetch`, `/hiu/health-information/on-request`, HIU `/health-information/transfer`).
      3. `ABDM_JWKS_URL` is NOT configured in `.env`, leaving JWKS signature validation untested (`NOT VERIFIED`).
      4. Uses fixed 60s poll delay for `FAILED` retries rather than exponential backoff.
    - **Next Action:** Add missing v3 HIP/HIU `ROUTES`, configure `ABDM_JWKS_URL`, and add exponential backoff.

---

### Milestone 3 (M3) — HIU (Health Information User)

Every feature audited under Milestone 3 was checked across `server/src/` and `client/src/`. **Zero HIU implementation exists in Medical365.**

| # | HIU Feature (Phase 3 Checklist) | Status | File Path | Missing Implementation / Gap |
| :-: | :--- | :--- | :--- | :--- |
| 1 | HIU Registration & Configuration | `MISSING` | `hospital.model.js:132-135`, `abdm.bridge.service.js:121` | `hospital.abdm` only stores `hipId`; `addUpdateServices` hardcodes `type: 'HIP'`; no `hiuId` schema/registration. |
| 2 | Consent Request Generation (UI + Validator) | `MISSING` | None | No Doctor/Staff form to specify ABHA Address, purpose (`CAREMGT`, etc.), HI types, date range & expiry. |
| 3 | Consent Request Submission (`consent/v3/request/init`) | `MISSING` | None | No outbound client/route calling `POST /api/hiecm/consent/v3/request/init` or storing pending consent requests. |
| 4 | Consent Notification Callback (`hiu/consent/request/notify` & `on-notify`) | `MISSING` | `abdm.inbox.processor.js` | No HIU consent notify route/handler or Gateway acknowledgement (`on-notify`). |
| 5 | Consent Approval Handling & Artefact Fetch (`consent/v3/fetch` & `on-fetch`) | `MISSING` | None | No `consent/v3/fetch` call to retrieve `consentArtefacts` when status is `GRANTED`. |
| 6 | Consent Denial Handling | `MISSING` | None | No handler/UI status update when patient rejects (`DENIED`) or request expires (`EXPIRED`). |
| 7 | Consent Revocation Handling | `MISSING` | None | No HIU-side cascade blocking cached/subsequent data pulls when patient emits `REVOKED`. |
| 8 | HIU Consent Artefact Storage & Validation | `MISSING` | `abdmConsent.model.js` | Current `AbdmConsent` only models HIP inbound notifications; no HIU `consentRequestId` / requester / `hiuId` / permission lifecycle collection. |
| 9 | Health Information Request (`data-flow/v3/health-information/request`) | `MISSING` | None | No outbound HI request generator, ephemeral Fidelius keypair generation (`keyMaterial` public key + nonce + expiry stored per txn), or `dataPushUrl`. |
| 10 | Health Information Transfer Callback (`health-information/on-request` & `dataPushUrl` endpoint) | `MISSING` | None | No endpoint to receive HIU `on-request` status ACK or the direct `POST` encrypted health data push from remote HIPs. |
| 11 | Encrypted Data Reception & Key Lookup | `MISSING` | None | No handler validating `transactionId`, sender `keyMaterial`, and retrieving HIU's ephemeral private key + nonce. |
| 12 | Data Decryption (Fidelius Decryption) | `MISSING` | None | Zero Curve25519 ECDH + HKDF + AES-GCM decryption code exists. |
| 13 | FHIR Bundle Parsing & Validation | `MISSING` | None | Zero FHIR R4 Document Bundle / Composition parser to extract clinical entries from remote providers. |
| 14 | External Health Record Storage | `MISSING` | None | No tenant-scoped MongoDB model/storage for parsed external longitudinal ABDM records (`AbdmExternalRecord` or equivalent). |
| 15 | External Health Record Display UI | `MISSING` | `UnifiedPatientProfile.jsx` | No "External Records / Linked ABDM Records" tab or viewer inside Patient Profile / Doctor Workspace. |
| 16 | HIU Retry & Failure Handling | `MISSING` | None | No retry job for failed HIU requests, expired keyMaterial recovery, or partial transfer error tracking. |

---

### Milestone 4 (M4) — Registry Integration (HFR, HPR & Bridge)

1. **ABDM Bridge URL Configuration & Registration**
   - **Status:** `PARTIAL` (`COMPLETE` backend service; `NOT VERIFIED` live; `MISSING` Admin UI)
   - **File:** `server/src/modules/abdm/abdm.bridge.service.js:17-108`, `server/src/modules/abdm/abdm.bridge.routes.js:26-29`
   - **Implemented:** Strict `ABDM_BRIDGE_URL` validation (HTTPS required, no localhost/private IP/marketing host), self-reachability probe (`probeBridge`), `PATCH /gateway/v3/bridge/url`, DB singleton `AbdmBridge`.
   - **Missing:** Platform Admin frontend panel calling `getBridgeConfig`, `probeBridge`, `registerBridgeUrl`, `verifyBridgeServices` (`abdmAPI` methods sit unused in `client/src/utils/api.js`).
   - **Next Action:** Add Bridge Settings view to `CentralAdminDashboard.jsx`.

2. **Sandbox Service Registration vs Production HFR Linking**
   - **Status:** `PARTIAL`
   - **File:** `server/src/modules/abdm/abdm.bridge.service.js:110-127`, `server/src/modules/abdm/abdm.client.js:197-215`
   - **Implemented:** `registerHospitalHip` registers sandbox services via `addUpdateServices` and binds `abdm.hipId` to `Hospital`. Code correctly documents that production facility linking must happen via HFR (`// Sandbox facility (HIP) registration. In production, link the facility through HFR instead.`).
   - **Missing:** No HFR API client (`https://apihspsbx.abdm.gov.in/v4/int/...`), no HFR Facility ID verification/sync, no multi-type `HIP`/`HIU` bridge service mapping, and no UI trigger for Super Admin.
   - **Next Action:** Integrate HFR Facility lookup/verification API (or formal manual-portal ID verification check) & Super Admin UI.

3. **Health Facility Registry (HFR) API Integration**
   - **Status:** `MISSING`
   - **File:** `server/src/models/hospital.model.js:132-135`
   - **Implemented:** Stores manual string `abdm.hipId` (`// = HFR facility ID in production`).
   - **Missing:** No HFR search/fetch/sync endpoints, no HFR status/verification timestamp, no address/LGD code synchronization, no Facility Type / specialties HFR mapping.
   - **Next Action:** Extend `hospital.abdm` with `hfrId`, `hfrVerified`, `hfrVerifiedAt`, `hiuId`, and implement HFR API client.

4. **Healthcare Professionals Registry (HPR) Integration**
   - **Status:** `MISSING`
   - **File:** `server/src/models/doctor.model.js`
   - **Implemented:** None. Inspected `doctor.model.js:1-112` — lacks `hprId`, `hprNumber`, `nmcRegistrationNumber` / `mciNumber`, or `hprVerified` fields completely.
   - **Missing:** HPR API client (`apihspsbx` / HPR endpoints), doctor HPR lookup/OAuth/OTP verification, doctor-to-HPR binding in `Doctor` schema and Doctor onboarding UI, and HPR ID inclusion in FHIR `Practitioner` resources.
   - **Next Action:** Add HPR fields to `Doctor` schema, integrate HPR verification API, and include verified `hprId` in FHIR `Practitioner`.

---

## D. EXISTING CODE REUSE REPORT

Medical365 already possesses mature clinical modules across Hospital and Clinic architectures. **Important Audit Rule:** Existing HMS features below represent reusable data/workflow foundations only—**zero** of them are currently ABDM-compliant or wired into HIE-CM v3.

| Medical365 Module | Existing Files & Models Verified | How It Supports ABDM Integration | Gaps Needed for ABDM / FHIR Compliance |
| :--- | :--- | :--- | :--- |
| **Patient Management** | `user.model.js`, `clinicPatient.model.js`, `tenantModels.js`, `UnifiedPatientProfile.jsx`, `ClinicPatientProfile.jsx`, `AbdmSection.jsx` | Core demographics (`name`, `phone`, `gender`, `dob`, `age`, `address`, `bloodGroup`) + `abdm` schema fields already exist on all 3 patient models. `AbdmSection` already integrates ABHA status/link/create into `UnifiedPatientProfile.jsx`. | Extend `AbhaService` & `HipService` to query `ClinicPatient`, mount `AbdmSection` on `ClinicPatientProfile.jsx` & `ReceptionDashboard.jsx`, normalize missing `dob`/`gender` for FHIR `Patient`. |
| **Doctor Management** | `doctor.model.js`, `doctor.routes.js`, `AdminDoctors.jsx` | Stores doctor `name`, `email`, `phone`, `specialty`, `education`, `departments`, `hospitalId`. | Add `hprId`, `licenseNumber` / medical council registration number (optional on `User` in some routes, missing on `Doctor.model.js`) to populate compliant FHIR `Practitioner`. |
| **OPD Workflow** | `appointment.model.js`, `reception.routes.js`, `doctor.routes.js`, `DoctorPatientDetails.jsx` | Captures encounter metadata (`appointmentDate`, `department`, `symptoms`, `diagnosis`, `doctorNotes`, `vitals`), `doctorId`, `hospitalId`, consultation status `completed`. | Hook `hip.createCareContext(..., 'OPConsultation')` + `requestLinking()` on consultation completion; build `OPConsultRecord` FHIR Composition mapper. |
| **IPD Management** | `admission.model.js`, `inpatientClinicalNote.model.js`, `inpatientProgressNote.model.js`, `ipdVitals.model.js`, `ipdClinical.routes.js` | Captures full inpatient stay (`ipdNumber`, `admissionDate`, `ward`, `bedNumber`, history, physical exam, vitals time-series, clinical orders, MAR). | Emit `WellnessRecord` / encounter care contexts; map `IPDVitals` parameters to LOINC codes for FHIR `Observation`. |
| **IPD Discharge Summary** | `admission.model.js:42-65`, `ipdClinical.routes.js:1642-1822`, `DoctorIPDOrdersPanel.jsx`, `dischargeSummaryPdf.js` | Structured fields: `diagnosis`, `admissionReason`, `clinicalHistory`, `clinicalExamination`, `hospitalCourse`, `proceduresSummary`, `keyInvestigationsSummary`, `treatmentSummary`, `vitalsSummary`, `dischargeMedications`, `dischargeAdvice`, `followUpInstructions`, `doctorSignedAt`, `FINALIZED` status. | Ideal source for `DischargeSummaryRecord`! Trigger `hip.createCareContext(..., 'DischargeSummary')` when `status === 'FINALIZED'`; serialize into NRCeS `DischargeSummary` FHIR Composition + Binary/DocumentReference PDF. |
| **Prescriptions (OPD & IPD)** | `appointment.model.js:pharmacy`, `admission.model.js:dischargeMedications`, `inpatientOrder.model.js`, `medicine.model.js`, `inventory.model.js` | Structured arrays containing `medicineName`, `saltName`/`composition`, `dosage`, `route`, `frequency`, `duration`, `quantity`, `instructions`. | Trigger `Prescription` care context on final Rx save; map free-text medicine/frequency/route strings to SNOMED/FHIR `MedicationRequest` timing schedules. |
| **Laboratory & Diagnostic Reports** | `labReport.model.js`, `labOrder.model.js`, `labTestResult.model.js`, `labReports.routes.js` | Very clean structured data: `testName`, `parameters` (`parameterName`, `numericValue`, `enteredValue`, `unit`, `referenceRangeText`, `abnormalFlag`), `verifiedBy`, `verifiedAt`, PDF `url`/`s3Key`. | Trigger `DiagnosticReport` care context upon report `APPROVED`/`RELEASED`; map parameters to FHIR `Observation` + `DiagnosticReport` + embedded PDF `Binary`. |
| **Hospital Consent Templates** | `consent.routes.js`, `consentCategory.model.js`, `consentTemplate.model.js`, `policyAcceptance.model.js` | Handles surgical/procedural consent forms (`.docx` templates & digital signatures). | Completely separate domain from **ABDM Electronic Health Record Consent Artefacts** (`AbdmConsent`). Do not conflate procedural consent with ABDM HIE-CM Consent Artefacts. |
| **Authentication & Security** | `auth.middleware.js`, `jwt.js`, `Session`, `rateLimiter.js` | JWT auth, token revocation cache, session tracking, role permissions (`_roleData`), audit logging (`AuditLog`). | Enforce role-based access control on `abha.routes.js` and fix `abdm.bridge.routes.js` custom `Role` ObjectId compatibility (`_roleData.name`). |
| **Multi-Tenant Architecture** | `hospital.model.js`, `tenantResolver.js`, `tenantMiddleware.js`, `tenantDb.js` | Hostname subdomain resolution + JWT `hospitalId` tenant scoping + separate per-hospital MongoDB connections (`getTenantConnection`). | Add explicit Clinic (`ClinicPatient`) routing in ABDM services; expand `AbdmBridge` vs per-hospital `hiuId`/`hfrId` config; enforce tenant scoping on `onCareContextLinked`. |

---

## E. ABDM API INVENTORY

*(Strict comparison against official ABDM HIE-CM v3 & ABHA v3 documentation)*

| API / Callback Path | Role | Direction | Exists in Code? | Working Evidence | Missing Work |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST /api/hiecm/gateway/v3/sessions` | Gateway Auth | Outbound | **YES** | `abdm.client.js:62` (with `/gateway/v0.5/sessions` fallback) | Live sandbox handshake `NOT VERIFIED` |
| `GET /abha/api/v3/profile/public/certificate` | M1 Auth/Enrol | Outbound | **YES** | `abdm.client.js:123` (cached 6h + RSA OAEP SHA-1 helper) | Live cert fetch `NOT VERIFIED` |
| `POST /abha/api/v3/enrollment/request/otp` | M1 ABHA Create | Outbound | **YES** | `abdm.client.js:143`, `abha.service.js:92` | Resend OTP cooldown & live sandbox `NOT VERIFIED` |
| `POST /abha/api/v3/enrollment/enrol/byAadhaar` | M1 ABHA Create | Outbound | **YES** | `abdm.client.js:152`, `abha.service.js:107` | Capture/persist user `X-Token` & refresh token |
| `GET /abha/api/v3/enrollment/enrol/suggestion` | M1 ABHA Address | Outbound | **NO** | None | Suggest custom ABHA handles post-enrolment |
| `POST /abha/api/v3/enrollment/enrol/abha-address` | M1 ABHA Address | Outbound | **NO** | None | Allow choosing/creating custom `@sbx`/`@abdm` address |
| `POST /abha/api/v3/profile/login/request/otp` | M1 Verification | Outbound | **YES** | `abdm.client.js:168`, `abha.service.js:132` (14-digit ABHA only) | Support `abha-address` and `mobile` loginHints |
| `POST /abha/api/v3/profile/login/verify` | M1 Verification | Outbound | **YES** | `abdm.client.js:175`, `abha.service.js:145` | Capture `X-Token` for profile/card APIs |
| `GET /abha/api/v3/profile/account` (+ `/abha-card`, `/qrCode`) | M1 Profile | Outbound | **NO** | None | Retrieve full profile, downloadable ABHA Card & QR |
| `PATCH /api/hiecm/gateway/v3/bridge/url` | Bridge Mgmt | Outbound | **YES** | `abdm.client.js:187`, `abdm.bridge.service.js:84` | Super Admin frontend trigger UI |
| `GET /api/hiecm/gateway/v3/bridge-services` | Bridge Mgmt | Outbound | **YES** | `abdm.client.js:192`, `abdm.bridge.service.js:57` | Super Admin frontend viewer UI |
| `PUT /devservice/v1/bridges/addUpdateServices` | Sandbox Reg | Outbound | **YES** | `abdm.client.js:206`, `abdm.bridge.service.js:121` | Support `HIU` type + Super Admin UI |
| `POST /api/hiecm/v3/token/generate-token` | M2 HIP Link | Outbound | **YES** | `abdm.client.js:219`, `hip.service.js:356` | Wire clinical callers (`requestLinking()`) |
| `POST /api/v3/hip/token/on-generate-token` | M2 HIP Callback | Inbound | **BROKEN** | Root router allows path (`abdm.callbacks.js:18`), **BUT `abdm.inbox.processor.js:14` regex matches `/hip/v3/links/link/token`, NOT `/hip/token/on-generate-token`** | Fix `ROUTES` regex in `abdm.inbox.processor.js` |
| `POST /api/hiecm/hip/v3/link/carecontext` *(check path)* | M2 HIP Link | Outbound | **YES** | `abdm.client.js:227`, `abdm.config.js:55` | Verify exact v3 swagger path (`link/carecontext` vs `hip/v3/link/carecontext`) & live test |
| `POST .../on-carecontext` / `on_carecontext` | M2 HIP Callback | Inbound | **YES** | `abdm.inbox.processor.js:21`, `hip.service.js:303` | Scope update with `hospitalId`; verify exact v3 callback suffix |
| `POST .../patient/care-context/discover` | M2 HIP Callback | Inbound | **YES** | `abdm.inbox.processor.js:15`, `hip.service.js:101` | Add `ClinicPatient` lookup + clinical CareContext hooks |
| `POST /api/hiecm/user-initiated-linking/v3/patient/care-context/on-discover` | M2 HIP Reply | Outbound | **YES** | `hip.service.js:157`, `abdm.config.js:56` | Verify live with ABDM Sandbox |
| `POST .../link/care-context/init` & `on-init` | M2 HIP Linking | In + Out | **PARTIAL** | `abdm.inbox.processor.js:16`, `hip.service.js:166` | **Blocked on Prod:** `setSmsSender()` never configured |
| `POST .../link/care-context/confirm` & `on-confirm` | M2 HIP Linking | In + Out | **YES** | `abdm.inbox.processor.js:17`, `hip.service.js:206` | Verify live OTP confirm flow |
| `POST .../consent/v3/request/hip/notify` & `on-notify` | M2 HIP Consent | In + Out | **PARTIAL** | `abdm.inbox.processor.js:18`, `hip.service.js:247` | Validate full consent artefact schema; add Admin UI |
| `POST .../data-flow/v3/health-information/request` & `hip/on-request` | M2 HIP Data | In + Out | **BLOCKED** | `hip.service.js:270-281` returns `ERR 1003` or throws | Consent check + FHIR build + Fidelius encrypt + `on-request` ACK |
| `POST <HIU dataPushUrl>` & `/data-flow/v3/health-information/notify` | M2 Data Push | Outbound | **NO** | None | Direct encrypted FHIR push + gateway status notify |
| `POST .../abha/deactivate` | M1/M2 Callback | Inbound | **PARTIAL** | `abdm.inbox.processor.js:20`, `hip.service.js:284` | Fails if `X-HIP-ID` missing (`hospital` check in processor) |
| `POST /api/hiecm/consent/v3/request/init` | M3 HIU | Outbound | **NO** | None | Initiate patient consent request |
| `POST /api/v3/hiu/consent/request/notify` & `on-notify` | M3 HIU Callback | In + Out | **NO** | None | Handle granted/denied/revoked consent alerts |
| `POST /api/hiecm/consent/v3/fetch` & `on-fetch` | M3 HIU | Out + In | **NO** | None | Fetch approved Consent Artefacts |
| `POST /api/hiecm/data-flow/v3/health-information/request` & `hiu/on-request` | M3 HIU | Out + In | **NO** | None | Request encrypted data with HIU Fidelius keypair |
| `POST /api/v3/hiu/health-information/transfer` *(HIU dataPushUrl)* | M3 HIU Callback | Inbound | **NO** | None | Receive encrypted bundles, decrypt & parse FHIR |
| `HFR Facility Registry APIs` (`v4/int/...`) | M4 Registry | Outbound | **NO** | None (`hospital.abdm.hipId` manual only) | Search/sync/verify HFR Facility ID |
| `HPR Professional Registry APIs` | M4 Registry | Outbound | **NO** | None (no `hprId` on `Doctor`) | Verify & bind Doctor HPR IDs |

---

## F. DATABASE AUDIT

### Existing Collections & Embedded ABDM Schemas
1. **`AbdmBridge` (`server/src/models/abdmBridge.model.js`)** — Master DB singleton per `clientId` (`unique: true`). Stores `bridgeUrl`, `lastRegisteredAt`, `lastStatus`, `lastMessage`, `updatedBy`. Clean isolation from tenants.
2. **`AbdmInbox` (`server/src/models/abdmInbox.model.js`)** — Master DB callback durability log. Compound unique index `{ requestId: 1, path: 1 }`; status index `{ status: 1, receivedAt: 1 }`; 30-day TTL on `receivedAt` (auto-deletes PII payloads). Good schema; lacks `correlationId` / `hiuId` fields for HIU flows.
3. **`AbdmTxn` (`server/src/models/abdmTxn.model.js`)** — Master DB ephemeral transaction store for `ENROL`, `LOGIN`, `LINK`. Index `{ txnId: 1, flow: 1 }` unique + 15-minute TTL on `createdAt`. Scopes every transaction to `{ hospitalId, patientId, userId }`.
4. **`AbdmLinkToken` (`server/src/models/abdmLinkToken.model.js`)** — Master DB per-patient HIP link token. Unique index `{ hospitalId: 1, patientId: 1 }`. Stores `tokenHash` (SHA-256) + `tokenEncrypted` (`aes-256-gcm`) and drops plaintext `token = null`. **Weakness:** Falls back to `JWT_SECRET` or hardcoded `'medical365-default-abdm-secret-key-32b'` (`abdmLinkToken.model.js:10`) when `ABDM_TOKEN_ENCRYPTION_KEY` is unset.
5. **`AbdmCareContext` (`server/src/models/abdmCareContext.model.js`)** — Master DB care-context registry. Compound unique index `{ hospitalId: 1, referenceNumber: 1 }`; indexed on `hospitalId`, `patientId`, `status`, `lastRequestId`. **Gap:** Supports `User` ref (`patientId`), does not distinguish `ClinicPatient` collection; lacks `dataPushedCount` / `lastTransferId` tracking; `onCareContextLinked` queries by `{ lastRequestId }` without `hospitalId`.
6. **`AbdmConsent` (`server/src/models/abdmConsent.model.js`)** — Master DB consent storage for HIP notifications. Unique index `{ hospitalId: 1, consentId: 1 }`. Stores `status`, `patientAbhaAddress`, `detail`, `lastNotifiedAt`. **Gap:** Missing `hipId`, `hiuId`, parsed `permission.dateRange` indexes, `hiTypes` index, `approvedCareContexts` array, and `consentArtefact` signature/artefact vs request distinction.
7. **Embedded `abdm` Subdocuments:**
   - `Hospital` (`server/src/models/hospital.model.js:132-135`): `enabled`, `hipId` (`unique, sparse`). Missing `hiuId`, `hfrId`, `hfrVerified`, `hfrMetadata`.
   - `User` (`server/src/models/user.model.js:84-95`): Full `abdm` subdocument + sparse compound indexes `{ hospitalId: 1, 'abdm.abhaNumber': 1 }` & `{ hospitalId: 1, 'abdm.abhaAddress': 1 }`. **Note:** `abhaNumber` and `abhaAddress` indexes are NOT marked `unique: true` at DB index level with `partialFilterExpression` (uniqueness is enforced in app code only for `abhaNumber`, not `abhaAddress`).
   - `tenantModels.js` (`server/src/db/tenantModels.js:40-51`): Replicates `User.abdm` schema on per-hospital tenant DBs; **misses** syncing `AbdmCareContext` or `ClinicPatient` when queries run on master vs tenant DB.
   - `ClinicPatient` (`server/src/models/clinicPatient.model.js:32-43`): Defines `abdm` subdocument **WITHOUT** compound indexes on `{ clinicId, 'abdm.abhaNumber' }` or `{ clinicId, 'abdm.abhaAddress' }`, and `AbhaService`/`HipService` never read/write it.

### Missing Collections & Missing Fields
- **Missing Collections:**
  - `AbdmConsentRequest` (HIU outbound consent requests, `consentRequestId`, `purpose`, `dateRange`, `hiTypes`, linked `consentArtefactIds`, `requestedByDoctorId`).
  - `AbdmDataTransferSession` / `AbdmHiTransaction` (HIP & HIU HI exchange `transactionId` state, `consentId`, ephemeral Curve25519 keys for HIU, chunk status, `TRANSFERRED`/`RECEIVED`/`FAILED` telemetry).
  - `AbdmExternalRecord` (HIU decrypted FHIR Bundle storage & parsed clinical summaries per `hospitalId + patientId`).
- **Missing Fields on Existing Collections:**
  - `Doctor` (`doctor.model.js`): Missing `hprId`, `hprVerified`, `registrationNumber` / `medicalCouncil`.
  - `Hospital` (`hospital.model.js`): Missing `hiuId`, `hfrId`, `hfrVerified`, `supportedHiTypes`.
  - `AbdmCareContext`: Missing `patientModel` (`'User'` vs `'ClinicPatient'`) if supporting clinic patients cleanly.

### Multi-Tenant Isolation Notes on DB Storage
- `AbdmInbox`, `AbdmCareContext`, `AbdmConsent`, `AbdmLinkToken`, `AbdmTxn`, and `Hospital` all live in the **Master MongoDB**, while clinical data (`Appointment`, `Admission`, `LabReport`, etc.) may live in Master OR per-hospital Tenant DBs (`tenantDb.js` / `tenantMiddleware.js`). When M2 data push is built, the worker MUST resolve `getTenantConnection(String(hospital._id))` via `hospital._id` from `AbdmInbox` rather than querying only Master models!

---

## G. SECURITY AUDIT

1. **CRITICAL — Unsigned Callback Bypass Risk & Missing JWKS URL:**
   - `server/src/modules/abdm/abdm.callbacks.js:69-79` allows unsigned callbacks when `ABDM_JWKS_URL` is unset AND `ABDM_ALLOW_UNSIGNED_CALLBACKS === 'true'` outside `production`/`staging`. Verification of `server/.env` shows `ABDM_JWKS_URL` is **NOT SET**, while `ABDM_ALLOW_UNSIGNED_CALLBACKS` IS set.
   - If `ABDM_ENV=sandbox` and `NODE_ENV=development` (e.g., staging/dev server or misconfigured deployment), any unauthenticated internet client sending headers `X-CM-ID: sbx`, `REQUEST-ID: <uuid>`, `TIMESTAMP: <now>`, and `X-HIP-ID: <target_hip_id>` can inject callbacks into `AbdmInbox`, trigger OTP SMS (`onLinkInit`), or inject fake `AbdmConsent` (`GRANTED`) or `onAbhaDeactivate` (`Unlink patient`) actions! Conversely, in `NODE_ENV=production` without `ABDM_JWKS_URL`, ALL callbacks fail with `503`.

2. **HIGH — Missing Intra-Tenant RBAC on `/api/abdm/abha/*`:**
   - `server/src/modules/abdm/abha.routes.js:13` only applies `verifyToken`. It does **not** restrict by clinical/reception/self-patient roles. Any authenticated account inside a hospital (`patient`, `accountant`, `pharmacist`, `lab`) can call `POST /api/abdm/abha/create/start` or `/link/start` on another patient's `_id` in the same hospital, triggering UIDAI/ABDM OTP spam to arbitrary patients.

3. **HIGH — Hardcoded Fallback Encryption Key in `AbdmLinkToken`:**
   - `server/src/models/abdmLinkToken.model.js:9-11`: `const secret = process.env.ABDM_TOKEN_ENCRYPTION_KEY || JWT_SECRET || 'medical365-default-abdm-secret-key-32b';`.
   - Relying on `JWT_SECRET` (or the default literal) ties persisted ABDM link-token decryption to auth JWT rotation and risks weak key derivation if `ABDM_TOKEN_ENCRYPTION_KEY` is omitted.

4. **MEDIUM — Role Check Fragility in `abdm.bridge.routes.js` & `abha.controller.js`:**
   - `abdm.bridge.routes.js:15-24` and `abha.controller.js:8` inspect `req.user.role` directly instead of `(req.user._roleData?.name || req.user.role)`. Any admin assigned a custom `Role` document (`ObjectId` stored in `user.role`) will be rejected with `403`, whereas `auth.middleware.js` stores the string role name in `_roleData.name`.

5. **MEDIUM — Global vs Tenant Scoping Edge Cases:**
   - `hip.service.js:310`: `onCareContextLinked` calls `AbdmCareContext.updateMany({ lastRequestId: corr }, ...)` without `hospitalId`.
   - `hip.service.js:284`: `onAbhaDeactivate` relies on `doc.hipId` being present in incoming header/body (`abdm.inbox.processor.js:45`), otherwise marking deactivation callbacks `UNHANDLED`.

6. **GOOD PRACTICES VERIFIED:**
   - `abdm.config.js` reads credentials exclusively from `process.env`; zero hardcoded client secrets exist in code.
   - `abdmBridge.service.js` never returns `ABDM_CLIENT_SECRET` (masks `clientId` via `abcd...wxyz`), blocks `http://`, `localhost`, private IPs, and marketing host domains (`medical365.in`) from bridge registration.
   - Aadhaar numbers are RSA-OAEP encrypted immediately in `abdm.client.js`, never saved to DB, and never logged in `abdm.callbacks.js`.
   - `AbdmTxn` cryptographically binds `txnId` to `(hospitalId, patientId, userId)` preventing OTP replay across patients/hospitals.
   - `onLinkInit` stores SHA-256 OTP hashes with 5-attempt lockout + `crypto.timingSafeEqual`.
   - `AbdmInbox` enforces atomic `findOneAndUpdate` locking and auto-purges raw callback PII payloads after 30 days via MongoDB TTL index.
   - Pacific Hospital Demo sandbox properly suppresses external SMS OTP dispatch inside `hip.service.js:63-67`.

---

## H. REMAINING IMPLEMENTATION ROADMAP

*Assumes 1–2 Senior MERN engineers working standard 8-hour days.*

### Phase 1 — Critical Fixes, Security Hardening & M1 Completion (`P0`)
| Task | Priority | Est. Hours | Dependencies | Target Files | Acceptance Criteria | Testing |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| Fix `abdm.inbox.processor.js` v3 callback regex (`/hip/token/on-generate-token`), add `tok` null guard in `hip.service.js`, scope `onCareContextLinked` with `hospitalId` | **P0** | 6h | None | `abdm.inbox.processor.js`, `hip.service.js` | Official v3 `on-generate-token` callback routes to `onLinkToken` cleanly without unhandled/TypeError | Unit + mocked callback integration test |
| Enforce `abha.routes.js` RBAC (`hospitaladmin`, `doctor`, `reception`, `nurse`, or self-`patient`), add OTP rate limit + `verifyCreate`/`verifyLink` attempt cap, require `ABDM_TOKEN_ENCRYPTION_KEY`, fix `_roleData.name` checks in `abdm.bridge.routes.js` & `abha.controller.js` | **P0** | 8h | None | `abha.routes.js`, `abha.controller.js`, `abha.service.js`, `abdm.bridge.routes.js`, `abdmLinkToken.model.js`, `rateLimiter.js` | Non-clinical staff/other patients receive `403`; OTP verify locks after failed tries | Auth & RBAC negative test suite |
| Configure/verify `ABDM_JWKS_URL` against ABDM v3 published keys + verify `verifySignature` JWT validation | **P0** | 6h | Sandbox/Stage access | `abdm.callbacks.js`, server env | Valid gateway JWT passes; forged/expired JWT rejected `401` with `allowUnsignedCallbacks=false` | Callback JWT mock/sandbox test |
| Support `ClinicPatient` in `AbhaService` & `HipService` (`clinicId` -> `hospitalId` mapping) + add `ClinicPatient` ABDM indexes + mount `<AbdmSection />` in `ClinicPatientProfile.jsx` | **P0** | 8h | None | `abha.service.js`, `hip.service.js`, `clinicPatient.model.js`, `ClinicPatientProfile.jsx` | Clinics can create/verify/link ABHA and respond to `onDiscover`/`onLinkInit` | Multi-tenant clinic isolation test |
| Complete M1: `abha-address` suggestions & creation, ABHA-address/mobile login, capture `X-Token` for profile/ABHA Card/QR retrieval + Resend OTP UI | **P1** | 16h | ABDM Sandbox | `abdm.client.js`, `abha.service.js`, `abha.routes.js`, `AbdmSection.jsx` | Patient can create custom ABHA address, verify via ABHA address or mobile, download ABHA card | M1 sandbox E2E test |

### Phase 2 — Clinical Triggers, FHIR R4 Engine & M2 Data Push (`P0`)
| Task | Priority | Est. Hours | Dependencies | Target Files | Acceptance Criteria | Testing |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| Wire `createCareContext` + `requestLinking` into finalized OPD consultations, Prescriptions, Released Lab Reports, Finalized IPD Discharge Summaries, & Invoices (tenant-aware) + SMS provider setup (`setSmsSender`) | **P0** | 14h | Phase 1 P0 | `doctor.routes.js`, `labReports.routes.js`, `ipdClinical.routes.js`, `billing.routes.js`, `hip.service.js`, `server.js` | Every finalized record auto-creates idempotent `AbdmCareContext` & queues linking when verified ABHA exists | Integration test verifying CareContext per clinical flow |
| Build NRCeS FHIR R4 Builders + Profile Validator (`Patient`, `Practitioner`, `Organization`, `Encounter`, `OPConsultation`, `Prescription`, `DiagnosticReport`, `DischargeSummary`, `Invoice`) | **P0** | 32h | Doctor HPR field, clinical data mapping | New `server/src/modules/abdm/fhir/*.js` | Valid HL7 FHIR R4 Document Bundles generated from real tenant DB records | FHIR JSON schema/NRCeS IG validation tests |
| Implement Fidelius Encryption/Decryption Utility (Curve25519 X25519 + HKDF-SHA256 + AES-256-GCM) | **P0** | 12h | None | New `server/src/modules/abdm/fidelius.crypto.js` | Round-trip encrypt/decrypt matches official ABDM Fidelius reference vector | Crypto unit test matching reference test vector |
| Implement M2 HIP Data Push (`onHealthInfoRequest`, consent artefact verification, tenant DB lookup via `getTenantConnection`, `hip/on-request`, chunked `dataPushUrl` push, `health-information/notify`) | **P0** | 22h | FHIR + Fidelius + Triggers | `hip.service.js`, `abdm.client.js`, `abdm.inbox.processor.js` | Granted HI requests deliver encrypted FHIR bundles cleanly; expired/revoked consents reject accurately | HIP E2E & negative consent test |

### Phase 3 — Full M3 HIU Module & External Record Viewer (`P1`)
| Task | Priority | Est. Hours | Dependencies | Target Files | Acceptance Criteria | Testing |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| Add HIU registration support (`hospital.abdm.hiuId`, `AbdmConsentRequest`, `AbdmHiTransaction`, `AbdmExternalRecord` models) | **P1** | 10h | Phase 1 | `hospital.model.js`, new `abdm*.model.js`, `abdm.bridge.service.js` | Hospitals/Clinics store isolated `hiuId` and track consent requests per tenant | Schema & tenant isolation tests |
| Implement HIU Consent Lifecycle APIs (`consent/v3/request/init`, `hiu/consent/request/notify`, `consent/v3/fetch`, revocation propagation) | **P1** | 20h | M3 models | New `server/src/modules/abdm/hiu.service.js`, `abdm.hiu.routes.js`, `abdm.inbox.processor.js` | Doctors can initiate consent requests, receive async grant/deny/revoke updates, and fetch consent artefacts | HIU callback & state machine tests |
| Implement HIU Data Request, Encrypted Transfer Receiver (`transfer` callback / `dataPushUrl`), Fidelius Decryption & FHIR Bundle Parser | **P1** | 24h | Fidelius crypto + HIU consent | `hiu.service.js`, `abdm.callbacks.js`, `fhir/fhirParser.js` | Incoming encrypted bundles decrypt, parse into readable clinical sections, and persist scoped to `hospitalId + patientId` | Mock HIP -> HIU decrypt/parse integration test |
| Build Frontend UI: Consent Request Modal, External Longitudinal Health Records Tab in `UnifiedPatientProfile.jsx` / `ClinicPatientProfile.jsx`, & Reception Care Context Status | **P1** | 20h | HIU APIs | `client/src/components/abdm/*`, `UnifiedPatientProfile.jsx`, `ClinicPatientProfile.jsx`, `api.js` | Clinicians request external records and view parsed consults, Rx, labs, and discharge summaries | Manual & role UI verification |

### Phase 4 — M4 Registries, Admin UI & Production Certification (`P1` / `P2`)
| Task | Priority | Est. Hours | Dependencies | Target Files | Acceptance Criteria | Testing |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| Build Super Admin Bridge/HIP/HIU Management UI & Hospital Admin Consent/CareContext/Transfer Audit Dashboard | **P1** | 14h | Phases 1–3 | `CentralAdminDashboard.jsx`, `HospitalAdminDashboard.jsx`, `AbdmAdminPanel.jsx` | Super Admin configures bridge & hospital HIP/HIU IDs; Hospital Admin monitors consents, transfers, & inbox errors | RBAC + UI functional test |
| HFR & HPR Integration (`Doctor.hprId`, HFR/HPR API verification/sync, Doctor HPR verification UI) | **P1** | 18h | HFR/HPR credentials | `doctor.model.js`, `hospital.model.js`, `hfrHpr.service.js`, `AdminDoctors.jsx` | Facilities & Doctors link verified HFR Facility IDs and HPR IDs into FHIR resources | Registry API sandbox test |
| Live ABDM Sandbox End-to-End Certification Testing (M1, M2, M3, M4 functional sign-off + load/retry audit) | **P0** | 18h | Phases 1–4 + Sandbox creds | All ABDM modules & test suite | All NHA sandbox functional & security test cases pass end-to-end | NHA ABDM Sandbox Certification |

**Total Estimated Remaining Engineering Effort:** **240 hours** (~**30 working days** at 8 hours/day for 1 engineer, or ~15 working days for 2 engineers).

---

## I. REALISTIC COMPLETION PERCENTAGE

### Calculation Methodology
Every capability audited in **Section B / Section C** was scored strictly by verified, executable end-to-end readiness (`COMPLETE` = 1.0, `PARTIAL` = 0.4 credit when core logic works locally without clinical triggers/UI/callbacks, `MISSING`/`BLOCKED`/`NOT VERIFIED` = 0.0 credit).  
*(Code scaffolding that throws unimplemented errors or tests that were not run safely in sandbox earn 0.0 completion credit.)*

| Metric / Milestone | Audited Score Breakdown | Realistic Percentage |
| :--- | :--- | :---: |
| **1. M1 — ABHA / Identity** | 5 Complete + 4 Partial (×0.4 = 1.6) out of 14 features = `6.6 / 14` | **47%** |
| **2. M2 — HIP (Provider)** | 6 Complete + 7 Partial (×0.4 = 2.8) out of 24 features = `8.8 / 24` *(0% FHIR, 0% Fidelius, 0% Data Push, 0% Clinical hooks)* | **37%** |
| **3. M3 — HIU (Consumer)** | 0 Complete + 0 Partial out of 16 features = `0 / 16` | **0%** |
| **4. M4 — Registry Integration (HFR/HPR & Bridge)** | 1 Complete + 4 Partial (×0.4 = 1.6) out of 12 features = `2.6 / 12` *(Bridge infrastructure present; HFR/HPR APIs & Admin UI missing)* | **22%** |
| **5. Overall Technical Implementation** | Weighted total across 66 features: `18.0 / 66` | **27%** |
| **6. Sandbox Verification** | Existing tests (`test_abdm_m1_suite.js`, `test_abdm_bundle_integration.js`, `test_abdm_admin_endpoints.js`) perform local Express callback & schema assertions (and write/delete test DB docs so they were NOT executed); **live** gateway/UIDAI/PHR/data-flow sandbox calls = unverified (`NOT VERIFIED`) | **0% Verified Live** *(local unit/router checks exist; 0% end-to-end NHA sandbox certified)* |
| **7. Production Readiness** | Blocked on missing `ABDM_JWKS_URL`, unimplemented FHIR/Fidelius/HIP push, broken v3 `/token/on-generate-token` callback path, missing SMS sender wiring, 0% HIU, 0% HFR/HPR, and RBAC gaps on `/api/abdm/abha/*` | **10%** *(Pre-Alpha / Non-Production Ready)* |

---

## J. FINAL CONCLUSION

1. **How much ABDM work has already been completed?**
   Approximately **27% overall** (concentrated in the foundational backend plumbing: gateway token acquisition & v3 headers, RSA-OAEP M1 Aadhaar encryption, Aadhaar OTP enrolment & 14-digit ABHA linking, encrypted `AbdmLinkToken` persistence, durable idempotent `AbdmInbox` callback ingestion + retry worker, `AbdmCareContext`/`AbdmConsent`/`AbdmTxn`/`AbdmBridge` Mongoose models, and the hospital-only `AbdmSection.jsx` modal).

2. **How much is partially implemented?**
   **15 of 66 audited features (~23% of total feature count)** are partial—most notably M1 mobile verification/patient identity integration (missing Clinics, missing ABHA address custom enrolment/login, missing X-Token profile/QR), M2 HIP discovery & care-context linking (`createCareContext` and `linkPendingForPatient` exist in `hip.service.js` but have zero clinical callers, no SMS provider wired, and a broken regex for `/api/v3/hip/token/on-generate-token`), and Bridge/HIP administration (backend routes exist, zero Admin UI).

3. **How much is completely missing?**
   **34 features (`MISSING` + `BLOCKED`, >51% of required ABDM scope)**—including **100% of M3 (HIU)**, **100% of HFR/HPR Registry APIs**, **100% of NRCeS FHIR R4 bundle generation & validation**, **100% of Fidelius ECDH+AES-GCM encryption/decryption**, **HIP health information push (`onHealthInfoRequest` throws not installed)**, and **clinical event hooks** across OPD/IPD/Lab/Rx/Discharge.

4. **What is the most important remaining work?**
   - **(Security / Reliability first):** Configure `ABDM_JWKS_URL`, enforce RBAC on `/api/abdm/abha/*`, fix `/api/v3/hip/token/on-generate-token` callback matching, wire `ClinicPatient`, and wire `setSmsSender`.
   - **(Core Clinical Value):** Build the **NRCeS FHIR R4 serializer + Fidelius Curve25519 crypto module + M2 Data Push + Clinical CareContext triggers** so hospital OPD, Prescriptions, Lab Reports, and Discharge Summaries actually link and transfer cleanly.
   - **(Interoperability Completion):** Implement **M3 HIU** (consent initiation, artefact fetch, decryption, FHIR viewer) and **M4 HFR/HPR**.

5. **How many working hours are realistically required?**
   Approximately **240 working hours (~30 working days at 8 hours/day)** for one senior full-stack/healthcare engineer covering security hardening, M1 completion, M2 FHIR+Fidelius+Triggers, M3 HIU+UI, M4 HFR/HPR+Admin UI, and live ABDM Sandbox certification testing.

6. **Can the current Medical365 architecture support complete ABDM integration?**
   **Yes — cleanly.** The existing Node/Express + MongoDB multi-tenant design already solves the hardest prerequisites: callback routing before `tenantResolver`, durable `AbdmInbox` deduplication + background retry worker in `server.js`, tenant resolution via `hipId` + `getTenantConnection`, encrypted `AbdmLinkToken` storage, and structured clinical data models (`Appointment`, `Admission.dischargeSummary`, `LabReport`, `PharmacyOrder`, `IPDVitals`). No architectural rewrite is needed.

7. **What should be implemented first?**
   1. Fix `abdm.inbox.processor.js` `/token/on-generate-token` regex, `hip.service.js` null guard, `abha.routes.js` RBAC, and `ABDM_JWKS_URL` verification (**Phase 1, 2–3 days**).
   2. Connect `createCareContext` + `requestLinking` hooks to OPD, Rx, Lab Release, and IPD Discharge Summary finalization + wire `setSmsSender` & `ClinicPatient` (**2 days**).
   3. Implement Fidelius crypto + NRCeS FHIR R4 builders + M2 HIP Data Push (`onHealthInfoRequest` -> `transfer` -> `notify`) and complete live M1+M2 Sandbox testing before starting M3 HIU (**8–9 days**).
