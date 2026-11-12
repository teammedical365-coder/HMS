# MEDICAL365 HMS — PRODUCTION SAFETY AUDIT

**Audit Date:** 2026-11-07  
**Audit Scope:** Read-only inspection of actual backend implementation for Staging/Production readiness  
**Target Codebase:** `server/` (Node.js, Express, MongoDB Atlas / Mongoose, Socket.IO, ImageKit)  

---

## EXECUTIVE SUMMARY

A rigorous, read-only production safety audit was performed across the six critical areas of the Medical365 Hospital Management System (HMS) backend. This audit inspected actual source files, function implementations, line numbers, and error handling paths.

### Audit Summary Matrix

| Audit Area | Inspected Source Files | Risk Level | Status |
|---|---|---|---|
| **1. Authentication Cache Invalidation** | `auth.middleware.js`, `auth.routes.js`, `emailOtp.routes.js`, `admin.routes.js`, `tokenBlacklist.model.js` | **MEDIUM** | **PASS (With Advisory)** |
| **2. Appointment Unique Index** | `appointment.model.js`, `tenantModels.js`, `doctorOpd.service.js`, `db.js` | **HIGH** | **FAIL (Requires Data Migration Safety)** |
| **3. Tenant DB Connection Reaper** | `tenantDb.js`, `server.js` | **MEDIUM** | **PASS (With Advisory)** |
| **4. Socket.IO Authorization & Rooms** | `server.js` | **LOW** | **PASS** |
| **5. ImageKit & File Storage** | `imagekit.js`, `app.js` | **LOW** | **PASS** |
| **6. Rate Limiting & Mount Ordering** | `rateLimiter.js`, `app.js`, `aiWallet.routes.js`, `upload.routes.js`, `search.routes.js` | **MEDIUM** | **FAIL (Middleware Ordering Issue)** |

---

## 1. AUTHENTICATION CACHE INVALIDATION

### Inspected Source Files
- `server/src/middleware/auth.middleware.js` (lines 14–115)
- `server/src/routes/auth.routes.js` (lines 438–466)
- `server/src/routes/emailOtp.routes.js` (lines 215–270)
- `server/src/routes/admin.routes.js` (lines 224–253, 865–975, 1001–1041)
- `server/src/models/tokenBlacklist.model.js` (lines 6–19)

### Actual Code Evidence
1. **Cache Structure and Fast Path:**
   - In `auth.middleware.js` (lines 18–45), `authCache` is implemented as an in-memory `Map` with a 45-second TTL (`AUTH_CACHE_TTL_MS = 45000`) and a 1,000-entry ceiling (`AUTH_CACHE_MAX_ENTRIES = 1000`).
   - Line 85: Fast path returns cached auth context when `cachedAuth && cachedAuth.expiresAt > now`.
2. **Logout Invalidation:**
   - In `auth.routes.js` (line 461), `router.post('/logout')` invokes:
     ```javascript
     invalidateAuthCache({ userId: decoded?.userId, jti: decoded?.jti, token });
     ```
3. **Session Revocation Invalidation:**
   - In `emailOtp.routes.js` (lines 241, 268), `invalidateUserSessions` and `invalidateOldestSessions` call:
     ```javascript
     invalidateAuthCache({ userId });
     ```
4. **Token Blacklist Automatic Eviction:**
   - In `tokenBlacklist.model.js` (lines 13–19), a Mongoose post-save lifecycle hook triggers eviction whenever any route adds a JTI to the blacklist:
     ```javascript
     tokenBlacklistSchema.post('save', function (doc) {
         if (doc?.jti) {
             const { invalidateAuthCache } = require('../middleware/auth.middleware');
             invalidateAuthCache({ jti: doc.jti });
         }
     });
     ```
5. **User Profile & Deletion Invalidation:**
   - In `admin.routes.js` (line 958 & line 1037), `invalidateAuthCache({ userId })` is called when a user's details/role are modified or when a user is deleted.

### Identified Gap
- In `admin.routes.js` (lines 224–253), `router.put('/roles/:roleId')` updates role permissions and saves `roleDoc`, but does NOT evict users holding that `roleId` from `authCache`. Users with active tokens will retain their previous permissions until the 45-second TTL expires.

### Risk Level
**MEDIUM** (bounded by 45s TTL, but real-time revocation during privilege demotion has a 45s lag window).

### Status
**PASS (With Advisory)**

### Required Action
Add role-based eviction support in `invalidateAuthCache({ roleId })` and invoke it in `admin.routes.js:248` upon role permission changes.

---

## 2. APPOINTMENT UNIQUE INDEX

### Inspected Source Files
- `server/src/models/appointment.model.js` (lines 100–115)
- `server/src/db/tenantModels.js` (lines 69–89)
- `server/src/services/doctorOpd.service.js` (lines 472–487, 714–729)
- `server/src/db/db.js` (lines 27–40)

### Actual Code Evidence
1. **Master Schema Unique Compound Index:**
   - In `appointment.model.js` (lines 102–105):
     ```javascript
     appointmentSchema.index(
         { hospitalId: 1, doctorId: 1, appointmentDate: 1, appointmentTime: 1 },
         { unique: true, partialFilterExpression: { status: { $ne: 'cancelled' }, doctorId: { $type: 'objectId' } } }
     );
     ```
2. **Cancelled Appointments:**
   - Correctly handled: `partialFilterExpression: { status: { $ne: 'cancelled' } }` ensures cancelled appointments release the slot for re-booking.
3. **Application-Level Double-Booking Prevention:**
   - In `doctorOpd.service.js` (lines 472–487 for creation, lines 714–729 for rescheduling), atomic pre-checks reject conflicting bookings.

### Identified Gaps & Production Risks
1. **Existing Duplicates on Production Database:**
   - If an existing production MongoDB collection already contains duplicate uncancelled appointments created in the past, Mongoose's background index builder will fail with:
     `E11000 duplicate key error collection: hms.appointments index: hospitalId_1_doctorId_1_appointmentDate_1_appointmentTime_1`
   - In `db.js`, `autoIndex` is not explicitly disabled for production.
2. **Tenant DB Model Discrepancy:**
   - In `tenantModels.js` (lines 69–89), the tenant database's own `appointmentSchema` does NOT declare this unique compound index. In a multi-database architecture where tenant data is stored in isolated tenant databases, the database-level unique constraint will only exist on the master connection, not in the tenant databases.

### Risk Level
**HIGH**

### Status
**FAIL (Requires Data Migration Safety)**

### Required Action
1. Run a pre-migration deduplication query before deploying the unique index to an existing database.
2. In `db.js`, ensure `autoIndex: false` is configured for production, with indexes managed via dedicated migration scripts.
3. Synchronize `appointmentSchema` in `tenantModels.js` to match `appointment.model.js`.

---

## 3. TENANT DB CONNECTION REAPER

### Inspected Source Files
- `server/src/db/tenantDb.js` (lines 61–125)
- `server/server.js` (lines 175–182)

### Actual Code Evidence
1. **Connection Tracking & Usage Timestamps:**
   - In `tenantDb.js` (line 68 & line 95), `cached.__lastUsedAt = Date.now()` and `connection.__lastUsedAt = Date.now()` record active usage on every request.
2. **Reaper Implementation:**
   - In `tenantDb.js` (lines 101–112):
     ```javascript
     const IDLE_CONNECTION_TTL_MS = 30 * 60 * 1000; // 30 minutes idle
     setInterval(() => {
         const now = Date.now();
         for (const [dbName, conn] of connectionCache.entries()) {
             const lastUsed = conn.__lastUsedAt || 0;
             if (now - lastUsed > IDLE_CONNECTION_TTL_MS) {
                 try { conn.close(); } catch (e) {}
                 connectionCache.delete(dbName);
             }
         }
     }, 10 * 60 * 1000).unref();
     ```
3. **Graceful Shutdown Hook:**
   - In `server.js` (lines 175–180), `closeAllTenantConnections()` is invoked during `SIGTERM`/`SIGINT`.

### Identified Gaps & Edge Cases
1. **Concurrent Connection Failure Handling:**
   - In `tenantDb.js` (lines 85–92):
     ```javascript
     connectionCache.set(dbName, connection);
     await new Promise((resolve, reject) => {
         connection.once('open', resolve);
         connection.once('error', reject);
     });
     ```
   - If `connection.once('error')` triggers, the rejected connection is NOT removed from `connectionCache` inside `getTenantConnection`. A subsequent caller hitting line 67 (`cached.readyState !== 0`) will see `readyState === 0` (disconnected) and only then delete it.

### Risk Level
**MEDIUM**

### Status
**PASS (With Advisory)**

### Required Action
Wrap the connection `await new Promise(...)` in a `try...catch` block to immediately call `connectionCache.delete(dbName)` if connection initialization rejects.

---

## 4. SOCKET.IO AUTHORIZATION & ROOM ISOLATION

### Inspected Source Files
- `server/server.js` (lines 40–125)

### Actual Code Evidence
1. **CORS Restriction:**
   - Lines 40–47: `isAllowedOriginSocket` restricts allowed origins in production (medical365.in, vercel, onrender, capacitor). Fallback to wildcard is strictly blocked when `NODE_ENV === 'production'`.
2. **JWT Connection Authentication:**
   - In `server.js` (lines 67–81):
     ```javascript
     io.use((socket, next) => {
         const token = socket.handshake.auth?.token || socket.handshake.query?.token;
         if (!token) return next();
         try {
             const decoded = jwt.verify(token, JWT_SECRET);
             socket.user = decoded;
             next();
         } catch (err) {
             next(new Error('Authentication failed: Invalid token'));
         }
     });
     ```
3. **Server-Derived Room Assignment:**
   - Lines 85–93: Automatically joins `user_${uId}` and `hospital_${socket.user.hospitalId}` based solely on validated JWT claims.
4. **Room Joining Authorization:**
   - Lines 96–106: Client `join` event only allows joining own user room or allows superadmins.
   - Lines 109–122: Client `joinHospitalRoom` verifies `String(socket.user.hospitalId) === String(hospitalId)` or superadmin role. Foreign tenant IDs are explicitly rejected.

### Identified Gap
- Unauthenticated guest sockets are permitted to connect (line 70: `return next()`) for public broadcasts, but have no room joining privileges. This is an intentional design choice for landing page notifications.

### Risk Level
**LOW**

### Status
**PASS**

### Required Action
None.

---

## 5. IMAGEKIT & FILE STORAGE

### Inspected Source Files
- `server/src/utils/imagekit.js` (lines 1–94)
- `server/src/app.js` (line 336)

### Actual Code Evidence
1. **Production Credential Guard:**
   - Lines 37–51: When `IMAGEKIT_` environment variables are absent in production (`isProduction === true`), `upload()` rejects with an explicit error:
     `"Cloud file storage (ImageKit) is not configured in production. Ephemeral disk storage is disabled to prevent permanent patient data loss."`
2. **Failed Upload Behavior:**
   - Lines 63–67: If cloud upload fails over the network in production, it throws an explicit error rather than silently saving to ephemeral container disk:
     ```javascript
     if (isProduction) {
         throw new Error(`Cloud storage upload failed: ${netErr.message || 'ImageKit network error'}. Request aborted to prevent ephemeral data loss.`);
     }
     ```
3. **Existing Document Access:**
   - In `app.js` (line 336), `app.use('/uploads', express.static(...))` is maintained, ensuring legacy development documents remain readable.

### Risk Level
**LOW**

### Status
**PASS**

### Required Action
Verify that `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, and `IMAGEKIT_URL_ENDPOINTS` are properly set in the Render environment variables prior to deployment.

---

## 6. RATE LIMITING & MIDDLEWARE ORDERING

### Inspected Source Files
- `server/src/middleware/rateLimiter.js` (lines 1–134)
- `server/src/app.js` (lines 323–345)
- `server/src/routes/aiWallet.routes.js` (lines 1–25)
- `server/src/routes/upload.routes.js` (lines 1–25)
- `server/src/routes/search.routes.js` (lines 1–9)

### Actual Code Evidence
1. **Shared Office IP Protection:**
   - In `rateLimiter.js` (line 10 & line 58), `loginLimiter` and `emailOtpSendLimiter` use `skipSuccessfulRequests: true`. Legitimate clinic staff behind a single NAT IP do not exhaust the limit with successful logins.
2. **Public Config Rate Limiter:**
   - In `rateLimiter.js` (lines 81–87), `publicConfigLimiter` limits requests to 300 / 5 min per IP on `/branding`, `/tenant-config`, and `/auth-config`.

### Critical Architecture Flaw: Middleware Mount Ordering
- In `app.js` (lines 342–344), resource rate limiters are mounted globally on path prefixes:
  ```javascript
  app.use('/api/ai-wallet', aiWalletLimiter);
  app.use('/api/upload', uploadLimiter);
  app.use('/api/search', searchLimiter);
  ```
- In `rateLimiter.js` (lines 95, 106, 117), their `keyGenerator` relies on `req.user`:
  ```javascript
  keyGenerator: (req) => (req.user?.id || req.user?.userId ? String(req.user.id || req.user.userId) : req.ip)
  ```
- **The Problem:** In Express, `verifyToken` has NOT run when requests hit `app.use('/api/ai-wallet', ...)`. `verifyToken` is mounted inside the route handlers (e.g. `router.get('/', verifyToken, ...)` in `aiWallet.routes.js:11`).
- **Consequence:** `req.user` is ALWAYS `undefined` at limiter evaluation time! The key generator ALWAYS falls back to `req.ip`. As a result, all staff members in a hospital sharing an IP address share one single bucket for AI, uploads, and searches, defeating per-user rate limiting!

### Risk Level
**MEDIUM**

### Status
**FAIL (Middleware Ordering Issue)**

### Required Action
Mount `aiWalletLimiter`, `uploadLimiter`, and `searchLimiter` inside their respective route files AFTER `verifyToken`, or apply an authentication pass-through middleware before the limiter.

---

## FINAL AUDIT VERDICT

# ⚠️ NOT READY FOR STAGING

### Blocking Reasons:
1. **Area 2 (Appointment Index):** Risk of `E11000` duplicate key failure if deployed against an existing MongoDB collection with historical duplicate appointments.
2. **Area 6 (Rate Limiting Ordering):** Per-user rate limiting on heavy endpoints (`/api/ai-wallet`, `/api/upload`, `/api/search`) is rendered ineffective because the limiters are mounted before `req.user` is populated by `verifyToken`, falling back to shared IP limits.

### Remediation Plan to Achieve "READY FOR STAGING":
1. Synchronize `appointmentSchema` in `tenantModels.js` and add a safe deduplication/migration check.
2. Move `aiWalletLimiter`, `uploadLimiter`, and `searchLimiter` into sub-routers after `verifyToken` (e.g. `router.use(verifyToken, limiter)`).
3. Add role-based cache eviction in `admin.routes.js:248`.

