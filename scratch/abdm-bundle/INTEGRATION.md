# Medical365 x ABDM: integration bundle (M1 + bridge + M2 linking/discovery/consent)

## FINAL BRIDGE URL (submit this to ABDM)

    https://api.medical365.in

- Base URL only: no path, no trailing slash. These files serve the callbacks at the root of that host.
- DNS for api.medical365.in must point at the always-on server running the Node backend (NOT the Hostinger site).
- Never submit https://medical365.in or https://www.medical365.in (the website). The code now refuses them.
- Check before registering (must print a JSON 400/401, not HTML or a 404):
      curl -i -X POST https://api.medical365.in/v0.5/users/auth/on-init -H 'Content-Type: application/json' -d '{}'

## 1. Files in this bundle (server/src/...)

| File | Action |
|---|---|
| modules/abdm/abdm.config.js | NEW |
| modules/abdm/abdm.client.js | REPLACE (V3 client, RSA encryption) |
| modules/abdm/abdm.callbacks.js | NEW (public callback layer) |
| modules/abdm/abdm.inbox.processor.js | NEW (async processing + recovery worker) |
| modules/abdm/hip.service.js | NEW (M2 linking, discovery, consent) |
| modules/abdm/abha.service.js | REPLACE |
| modules/abdm/abha.controller.js | REPLACE (abha.routes.js stays as is) |
| modules/abdm/abdm.bridge.service.js / .controller.js / .routes.js | REPLACE |
| modules/abdm/abdm.webhook.controller.js | DELETE (superseded) |
| models/abdmInbox, abdmTxn, abdmCareContext, abdmLinkToken, abdmConsent .model.js | NEW |
| models/abdmBridge.model.js | REPLACE (platform singleton) |

Before first deploy, drop the old per-hospital bridge collection (its indexes conflict):

    db.abdmbridges.drop()

## 2. Install

    npm i jose

## 3. Environment (.env on the SERVER only; never in the frontend)

    ABDM_ENV=sandbox                       # production later
    ABDM_CLIENT_ID=...                     # rotate/store as a secret
    ABDM_CLIENT_SECRET=...
    ABDM_X_CM_ID=sbx                       # production: abdm
    ABDM_GATEWAY_BASE=https://dev.abdm.gov.in/api/hiecm        # prod: https://apis.abdm.gov.in/api/hiecm
    ABDM_ABHA_BASE=https://abhasbx.abdm.gov.in/abha/api        # prod: https://abha.abdm.gov.in/api/abha
    ABDM_BRIDGE_URL=https://api.medical365.in
    ABDM_JWKS_URL=...                      # ABDM's published signing keys (take from sandbox docs)
    # Sandbox-only helpers (ignored when ABDM_ENV=production):
    ABDM_ALLOW_UNSIGNED_CALLBACKS=true     # ONLY until ABDM_JWKS_URL is confirmed; then remove
    ABDM_SANDBOX_FIXED_OTP=123456          # ONLY if no SMS provider is wired yet
    ABDM_DATAPUSH_ENABLED=false            # keep false until the Fidelius/FHIR module exists

## 4. Model patches (small edits to your existing files)

hospital.model.js: add inside the schema
    abdm: {
        enabled: { type: Boolean, default: false },
        hipId:   { type: String, trim: true, unique: true, sparse: true },   // = HFR facility ID in production
    },

user.model.js, db/tenantModels.js (User), models/clinicPatient.model.js: replace the `abdm` block with
    abdm: {
        abhaNumber:      { type: String, sparse: true, trim: true, default: null },
        abhaAddress:     { type: String, sparse: true, trim: true, lowercase: true, default: null },
        abhaName:        { type: String, default: null },   // exactly as ABDM returns it (needed for link tokens)
        abhaGender:      { type: String, default: null },   // 'M' | 'F' | 'O'
        abhaYearOfBirth: { type: Number, default: null },
        kycVerified:     { type: Boolean, default: false },
        isVerified:      { type: Boolean, default: false },
        verifiedAt:      { type: Date, default: null },
        linkedAt:        { type: Date, default: null },
        status:          { type: String, enum: ['Not Linked', 'Verified', 'Pending', 'Failed'], default: 'Not Linked' },
    },
Keep your two existing abdm indexes. (If a field is missing here, Mongoose silently drops it.)

Aadhaar: the new code never reads or stores Aadhaar. Your three models still make `aadhaarNumber`
required+unique; plan to stop collecting it (separate change; check your legal basis).

## 5. app.js: exact edits

(a) Right AFTER `app.use(hpp());` and BEFORE `app.use('/api/', generalLimiter);` add:

    const { ABDM_CALLBACK_PATH, abdmCallbackLimiter, verifyAbdmCallback, abdmCallbackHandler } =
        require('./modules/abdm/abdm.callbacks');
    app.post(ABDM_CALLBACK_PATH, abdmCallbackLimiter, verifyAbdmCallback, abdmCallbackHandler);

   Why before: ABDM posts from a few IPs; your 200-requests-per-15-minutes limiter would start
   returning 429 and callbacks would be lost.

(b) Replace the lines mounting the old bridge/webhooks (currently ~285-288) with:

    const { bridgeRouter } = require('./modules/abdm/abdm.bridge.routes');
    app.use('/api/abdm/bridge', bridgeRouter);

   Delete the `/api/abdm/v0.5` and `/v0.5` mounts. Keep `app.use('/api/abdm/abha', ...)`.

## 6. server.js: start the recovery worker (once, after MongoDB connects)

    require('./src/modules/abdm/abdm.inbox.processor').startInboxWorker();

## 7. Frontend (client/src/components/abdm/AbdmSection.jsx)

- `useState(patient?.aadhaarNumber || '')` -> `useState('')`, and the matching `setAadhaarInput(patient?.aadhaarNumber || '')` -> `setAadhaarInput('')`.
- Replace the claim "Aadhaar ... is not stored in plain text" with: "Aadhaar is sent encrypted to ABDM and is not saved by Medical365."
- "Link existing": placeholder "14-digit ABHA number" (ABHA-address login is not implemented yet).
- Admin bridge page: `PATCH /api/abdm/bridge/url` now takes NO body (the URL comes from ABDM_BRIDGE_URL);
  `POST /api/abdm/bridge/services` is replaced by `PUT /api/abdm/bridge/hospitals/:hospitalId/hip` with `{ "hipId": "..." }`.

## 8. Hook care contexts into your clinical code (M2)

Call after a visit/prescription/lab report/discharge/bill is FINALISED:

    const { createCareContext, requestLinking } = require('../modules/abdm/hip.service');

    if (patient.abdm && patient.abdm.isVerified) {
        await createCareContext({
            hospitalId: patient.hospitalId, patientId: patient._id,
            hiType: 'DiagnosticReport',              // OPConsultation | Prescription | DiagnosticReport | ...
            sourceModel: 'LabReport', sourceId: report._id,
            display: `Lab report, ${new Date(report.createdAt).toDateString()}`,
        });
        requestLinking({ hospitalId: patient.hospitalId, patientId: patient._id })
            .catch((e) => console.error('[ABDM] linking:', e.message));   // never block the clinical save
    }

Wire your SMS provider once (needed for patient-initiated linking OTPs):

    require('./modules/abdm/hip.service').setSmsSender(async (phone10, text) => { /* your SMS API */ });

## 9. Go-live order (sandbox)

1. Deploy; set env; confirm the curl check above.
2. Superadmin: `PATCH /api/abdm/bridge/url` (no body). It probes first and refuses if the URL does not reach the callback handler.
3. Wait up to 15 minutes; `GET /api/abdm/bridge/config` should show the live URL.
4. `PUT /api/abdm/bridge/hospitals/<hospitalId>/hip` with `{ "hipId": "<your test HIP id>" }` (production: the HFR facility ID).
5. In the app: create or link an ABHA for a test patient; finalise a visit (creates a care context, requests a link token, links).
6. In the sandbox PHR app: search for records at your facility (discovery), link with the OTP, grant consent.
7. Watch the `abdminboxes` collection: each callback shows RECEIVED -> PROCESSED (or FAILED with an error).

## 10. NOT included / NOT verified

Not included (next bundle): Fidelius encryption, NRCeS FHIR bundles, health-information push and transfer notify,
Scan & Share, ABHA-address (PHR) login, the four operator screens, an SMS provider.
Until the data push exists, health-information requests are answered with an honest "not enabled" error.

Verify against the CURRENT sandbox swagger/Postman before relying on them: the V3 HIP paths (`config.paths`),
request/reply payload shapes, error codes, the JWKS URL and token claims, the exact name of the HIP-initiated
link result callback, and whether callbacks always carry X-HIP-ID. All are isolated in abdm.config.js and hip.service.js.

Tested: 38 automated checks (callback verification, idempotency, 202 behaviour, path routing, RSA-OAEP round trip,
bridge-URL validation) passed with a stubbed database and gateway. Not tested against the real ABDM sandbox or a real MongoDB.
