# 09 — Hospital Admin Lifecycle & OTP Authentication Subsystem

## 1. Overview & Operational Responsibilities

The **Hospital Admin** (Tier 2 Administrator) is the operational custodian of an individual hospital or clinic. Once onboarded by Central Admin, the Hospital Admin is responsible for configuring clinical departments, setting doctor consultation fees, onboarding nursing and reception staff, allocating inpatient wards and beds, managing pharmacy inventory and department stock transfers, overseeing laboratory pricing, and monitoring revenue reconciliation.

This document details:
1. **Hospital Admin Provisioning**: Account creation, validation, and credentials delivery.
2. **Hospital Portal URL Resolution**: How tenant subdomains route users to their dedicated hospital login portal.
3. **Two-Step Authentication with OTP**: The complete login lifecycle, cryptographic OTP generation, SHA-256 hashing, delivery via SMTP, and single-session enforcement.

---

## 2. Hospital Admin Provisioning (`server/src/routes/hospital.routes.js:452-520`)

Hospital Admins cannot self-register; they are created strictly by Central Admin via `/supremeadmin`:

```mermaid
sequenceDiagram
    autonumber
    actor CentralAdmin as Central Admin (/supremeadmin)
    participant API as /api/hospitals/admin/signup
    participant DB as MongoDB (User, Hospital)
    participant SMTP as Email Service (Nodemailer)

    CentralAdmin->>API: POST /api/hospitals/admin/signup (payload + Central Admin JWT)
    API->>API: verifyCentralAdmin middleware validates global admin role
    API->>API: Validates Name, Email, Password, HospitalId, Aadhaar, Age
    API->>DB: Checks email uniqueness for this hospitalId
    API->>DB: User.create({ name, email, password, role: 'hospitaladmin', hospitalId, ... })
    API->>DB: Hospital.updateOne({ _id: hospitalId }, { adminUserId: admin._id })
    
    rect rgb(240, 255, 240)
        Note over API,SMTP: Asynchronous Staff Welcome Email Dispatch
        API->>API: Derives login URL: https://<slug>.medical365.in/login
        API->>SMTP: sendStaffWelcomeEmail({ email, password, role: 'Hospital Admin', loginUrl })
    end

    API-->>CentralAdmin: HTTP 201 Created { success: true, user: { id, name, email, role, hospitalId } }
```

### 2.1 Admin Creation Form Fields & Validation Rules

| Field Name | Type | Required? | Validation Rules | Target Model Property |
| :--- | :--- | :---: | :--- | :--- |
| `name` | Text | **Yes** | String, trimmed | `User.name` |
| `email` | Email | **Yes** | Valid email format, unique per hospital | `User.email` |
| `password` | Password | **Yes** | `validatePassword()`: Minimum 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char | `User.password` (bcrypt hash) |
| `phone` | Text | Optional | 10-digit numeric string | `User.phone` |
| `hospitalId`| ObjectId | **Yes** | Valid existing hospital reference | `User.hospitalId` |
| `aadhaarNumber` | Text | Optional | Exactly 12 digits (`/^\d{12}$/`) | `User.aadhaarNumber` |
| `age` | Number | Optional | Integer between 1 and 999 | `User.age` |

---

## 3. Hospital URL Routing & Tenant Mapping

When a hospital is created, its administrative portal URL is derived:
- **Default Subdomain URL**: `https://<hospital-slug>.medical365.in/login` (or `/hospitaladmin`).
- **Custom Domain URL**: `https://<customDomain>/login` (e.g. `https://apollohospitals.org/login`).

### Tenant Resolution on Page Load (`client/src/utils/hostnameResolver.js`):
1. **Host Extraction**: When the browser navigates to `https://apollo.medical365.in/login`, the frontend extracts `hostname = "apollo.medical365.in"`.
2. **Subdomain Lookup**: Extracts the slug `"apollo"`.
3. **Public Branding API**: Calls `GET /api/public/branding?domain=apollo.medical365.in`.
4. **Visual Theming**: Loads Apollo's custom logo, hospital name, and primary/secondary colors into `BrandingContext`.
5. **Wrong URL Handling**: If an unrecognized subdomain is opened (e.g. `nonexistent.medical365.in`), the server returns HTTP 404, and the frontend renders `InvalidPortalPage.jsx` ("Domain Not Configured").

---

## 4. Complete Hospital Admin OTP Authentication Flow

Medical365 implements a **Two-Step Challenge-Response Authentication Protocol** (`server/src/routes/emailOtp.routes.js`):

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Hospital Admin
    participant UI as HospitalLogin.jsx (/login)
    participant AuthSlice as Redux (authSlice.js)
    participant API as /api/auth/otp/send & /verify
    participant DB as MongoDB (User, LoginOtp, Session)
    participant SMTP as Email Service (sendLoginOtpEmail)

    Admin->>UI: Enters Email & Password
    UI->>AuthSlice: dispatch(sendOtp({ email, password, hospitalId, loginType: 'staff' }))
    AuthSlice->>API: POST /api/auth/otp/send (emailOtpSendLimiter)
    API->>DB: User.findOne({ email, hospitalId, isActive: true })
    alt User Not Found or Inactive
        API-->>UI: HTTP 401: Invalid email or password
    else User Found
        API->>API: bcrypt.compare(password, user.password)
        alt Password Mismatch
            API-->>UI: HTTP 401: Invalid email or password
        else Password Valid
            API->>API: crypto.randomInt(100000, 999999) -> Plain OTP (e.g. 770296)
            API->>API: crypto.createHash('sha256').update(otp).digest('hex')
            API->>DB: LoginOtp.create({ userId, otpHash, expiresAt: now + 10min, maxAttempts: 5 })
            API->>SMTP: sendLoginOtpEmail({ email, otp, userName: user.name, hospitalName })
            API->>API: Signs preAuthToken (JWT: { userId, purpose: 'otp_verification', exp: 10m })
            API-->>UI: HTTP 200 { success: true, preAuthToken, email: "p***@gmail.com" }
        end
    end

    UI->>Admin: Displays 6-Digit OTP Entry Form with Countdown
    Admin->>UI: Enters 6-Digit OTP (e.g. 770296)
    UI->>AuthSlice: dispatch(verifyOtp({ preAuthToken, otp }))
    AuthSlice->>API: POST /api/auth/otp/verify (emailOtpVerifyLimiter)
    API->>API: jwt.verify(preAuthToken)
    API->>DB: LoginOtp.findOne({ userId, isUsed: false }).sort({ createdAt: -1 })
    alt OTP Expired or Exceeded Attempts
        API-->>UI: HTTP 401: OTP has expired. Please request a new one.
    else Active OTP Found
        API->>API: Compares SHA-256 hash of submitted OTP with stored otpHash
        alt Hash Mismatch
            API->>DB: LoginOtp.updateOne({ $inc: { attempts: 1 } })
            API-->>UI: HTTP 401: Incorrect OTP. (Attempts left: 5 - attempts)
        else Hash Matches
            API->>DB: LoginOtp.updateOne({ isUsed: true })
            API->>DB: Session.updateMany({ userId, isActive: true }, { isActive: false })
            API->>DB: Session.create({ userId, sessionId, ipAddress, userAgent, isActive: true })
            API->>API: jwt.sign({ userId, role, hospitalId, sessionId, jti }, JWT_SECRET, { expiresIn: '7d' })
            API-->>UI: HTTP 200 { success: true, token, user, roleData }
            UI->>UI: Persists token in localStorage, initializes WebSocket connection
            UI-->>Admin: Redirects to /hospitaladmin
        end
    end
```

---

## 5. Security Invariants & Defensive Controls

1. **Cryptographic OTP Hashing**: Plaintext OTPs are **never** stored in MongoDB. The database stores only the SHA-256 digest (`otpHash`), preventing exposure if the database is inspected.
2. **Rate Limiting**:
   - `emailOtpSendLimiter`: Limits requests to **5 OTP generation calls per 15 minutes** per IP/account.
   - `emailOtpVerifyLimiter`: Limits verification attempts to **10 calls per 15 minutes**; each individual OTP is invalidated after 5 failed verification attempts (`attempts >= maxAttempts`).
3. **Short-Lived Pre-Auth Tokens**: The `preAuthToken` generated in Step 1 contains a dedicated claim `purpose: 'otp_verification'` with a strict 10-minute expiration. It cannot be used to authenticate any general API routes.
4. **Single Active Device Enforcement (`Session` Model)**:
   - On successful OTP verification, all prior active sessions for that `userId` are invalidated (`isActive: false`).
   - Every authenticated request checks `Session.findOne({ sessionId, userId, isActive: true })`. If the admin logs in from a second laptop, the first device is automatically logged out on its next action with `sessionExpired: true`.
5. **Secure Logout & Token Revocation**:
   - Calling `POST /api/auth/logout` records the token's `jti` in `TokenBlacklist` with a TTL index matching the token expiration.
   - Any future presentation of that token is rejected immediately by `auth.middleware.js`.

