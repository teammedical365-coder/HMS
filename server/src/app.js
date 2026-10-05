const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const { generalLimiter } = require('./middleware/rateLimiter');

// Import Routes
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const doctorRoutes = require('./routes/doctor.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const publicRoutes = require('./routes/public.routes');
const adminEntitiesRoutes = require('./routes/admin-entities.routes');
const labRoutes = require('./routes/lab.routes');
const uploadRoutes = require('./routes/upload.routes');
const reportRoutes = require('./routes/report.routes');
const aiWalletRoutes = require('./routes/aiWallet.routes');
const pharmacyRoutes = require('./routes/pharmacy.routes');
const pharmacyOrdersRoutes = require('./routes/pharmacyOrders.routes');
const receptionRoutes = require('./routes/reception.routes');

// --- NEW IMPORTS FOR CLINICAL WORKFLOW ---
const patientRoutes = require('./routes/patient.routes');
const clinicalRoutes = require('./routes/clinical.routes');
const notificationRoutes = require('./routes/notification.routes');
const labTestRoutes = require('./routes/labTest.routes');
const medicineRoutes = require('./routes/medicine.routes');
const questionLibraryRoutes = require('./routes/questionLibrary.routes');
const testPackageRoutes = require('./routes/testPackage.routes');
const hospitalRoutes = require('./routes/hospital.routes');
const hospitalPolicyRoutes = require('./routes/hospitalPolicy.routes');
const financeRoutes = require('./routes/finance.routes');
const billingRoutes = require('./routes/billing.routes');
const admissionRoutes = require('./routes/admission.routes');
const simpleClinicRoutes = require('./routes/simpleClinic.routes');
const clinicRoutes = require('./routes/clinic.routes');
const syncRoutes = require('./routes/sync.routes');
const patientAuthRoutes = require('./routes/patientAuth.routes');
const patientLocalRoutes = require('./routes/patientLocal.routes');
const patientAppRoutes = require('./routes/patientApp.routes');
const revenueRoutes = require('./routes/revenue.routes');
const mfaRoutes = require('./routes/mfa.routes');
const emailOtpRoutes = require('./routes/emailOtp.routes');
const searchRoutes = require('./routes/search.routes');
const consentRoutes = require('./routes/consent.routes');
const bedRoutes = require('./routes/bed.routes');
const otRoutes = require('./routes/ot.routes');
const compression = require('compression');
const referralRoutes = require('./routes/referral.routes');
const vialRoutes = require('./routes/vial.routes');

const app = express();

// ── 0. High-Performance Gzip/Deflate Response Compression ─────────────────────
app.use(compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    },
    threshold: 1024 // Only compress responses > 1KB
}));

// ── 1. CORS Configuration (With in-memory Domain Cache) ───────────────────────
const isAllowedOrigin = (origin) => {
    if (!origin) return true; // Direct REST calls / Android Native requests
    const clean = String(origin).trim().toLowerCase().replace(/\/+$/, '');

    // Localhost and dev networks
    if (clean.includes('localhost') || clean.includes('127.0.0.1')) return true;
    if (clean.startsWith('capacitor://') || clean.startsWith('http://capacitor') || clean.startsWith('ionic://')) return true;
    if (clean.match(/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/)) return true;

    // Official Medical365 domains and ALL subdomains (admin.medical365.in, etc.)
    if (
        clean === 'https://medical365.in' ||
        clean === 'http://medical365.in' ||
        clean === 'https://www.medical365.in' ||
        clean === 'http://www.medical365.in' ||
        clean.endsWith('.medical365.in') ||
        clean.includes('medical365.in')
    ) {
        return true;
    }

    // Cloud hosting & deployment platforms
    if (
        clean.endsWith('.onrender.com') ||
        clean.endsWith('.vercel.app') ||
        clean.endsWith('.netlify.app') ||
        clean.includes('onrender.com') ||
        clean.includes('vercel.app')
    ) {
        return true;
    }

    return false;
};

const HospitalModelForCors = require('./models/hospital.model');
const verifiedDomainCache = new Map(); // domain -> { allowed: boolean, expireAt: number }

// Preflight & CORS Header Fallback (Guarantees preflight OPTIONS 204 response with proper CORS headers)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
        const reqHeaders = req.headers['access-control-request-headers'];
        res.setHeader(
            'Access-Control-Allow-Headers',
            reqHeaders || 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-tenant-subdomain, x-hospital-id, x-client-version, x-portal-type, x-app-type, x-offline-ping, X-Offline-Ping, x-client-operation-id, X-Client-Operation-Id, Cache-Control, Pragma, Expires'
        );
        res.setHeader('Access-Control-Max-Age', '86400');
    }

    // Instant response to OPTIONS preflight
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    next();
});

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin)) {
            return callback(null, true);
        }

        const domainOnly = origin.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();

        // Fast In-Memory Cache Check
        const cached = verifiedDomainCache.get(domainOnly);
        const now = Date.now();
        if (cached && cached.expireAt > now) {
            return callback(null, cached.allowed);
        }

        // Safe Non-blocking Database Check for Custom Domains
        HospitalModelForCors.findOne({ customDomain: domainOnly }).select('_id').lean()
            .then(hospital => {
                if (hospital) {
                    verifiedDomainCache.set(domainOnly, { allowed: true, expireAt: now + 10 * 60 * 1000 });
                    callback(null, true);
                } else {
                    verifiedDomainCache.set(domainOnly, { allowed: false, expireAt: now + 2 * 60 * 1000 });
                    callback(null, false);
                }
            })
            .catch(err => {
                console.warn('[CORS DB Check Warning]:', err.message);
                callback(null, true); // Fallback allow on DB error
            });
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
        'Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization',
        'x-tenant-subdomain', 'x-hospital-id', 'x-client-version', 'x-portal-type', 'x-app-type',
        'x-offline-ping', 'X-Offline-Ping', 'x-client-operation-id', 'X-Client-Operation-Id',
        'Cache-Control', 'Pragma', 'Expires'
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range', 'ETag', 'x-tenant-subdomain'],
    maxAge: 86400
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Enable reverse proxy support for Render / Cloudflare rate-limiting
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// ── CORS configuration moved to top of file ──

// ── Body parsing (with size limits) ──────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// ── NoSQL injection protection — strip $ and . from req.body/params/query ────
app.use(mongoSanitize());

// ── HTTP parameter pollution protection ──────────────────────────────────────
app.use(hpp());

// ── Global rate limit (200 req / 15 min per IP) ───────────────────────────────
app.use('/api/', generalLimiter);

// ── Logging (skip in test) ────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Tenant Resolution Middleware ────────────────────────────────────────────────
const tenantResolver = require('./middleware/tenantResolver');
app.use(tenantResolver);

// ── Static uploads ────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin-entities', adminEntitiesRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/ai-wallet', aiWalletRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/pharmacy/orders', pharmacyOrdersRoutes);
app.use('/api/reception', receptionRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/clinical', clinicalRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/lab-tests', labTestRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/question-library', questionLibraryRoutes);
app.use('/api/test-packages', testPackageRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/hospital-policies', hospitalPolicyRoutes);
app.use('/api/superadmin/hospitals', require('./routes/superadmin.build.routes')); // Added superadmin build routes
app.use('/api/finance', financeRoutes);

// ── Static Downloads for Generated Apps ─────────────────────────────────────────
app.use('/downloads/apks', express.static(path.join(__dirname, '../public/downloads/apks')));
app.use('/downloads/aabs', express.static(path.join(__dirname, '../public/downloads/aabs')));
app.use('/api/billing', billingRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/simple-clinics', simpleClinicRoutes);
app.use('/api/clinic', clinicRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/patient-auth', patientAuthRoutes);
app.use('/api/patient-app', patientAppRoutes);
app.use('/api/patient-local', patientLocalRoutes);
app.use('/api/mfa', mfaRoutes);
app.use('/api/auth/otp', emailOtpRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/beds', bedRoutes);
app.use('/api/ot', otRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/vials', vialRoutes);
app.use('/api/assistant', require('./routes/assistant.routes'));
app.use('/api/ipd-clinical', require('./routes/ipdClinical.routes'));
app.use('/api/ipd-nursing', require('./routes/ipdNursing.routes'));
app.use('/api/voice-scribe', require('./routes/voiceScribe.routes'));
app.use('/api/accountant', require('./routes/accountant.routes'));
app.use('/api/refunds', require('./routes/refund.routes'));
app.use('/api/packages', require('./routes/package.routes'));
app.use('/api/migrations', require('./routes/migration.routes'));
app.use('/api/local-agent', require('./routes/localAgent.routes'));
app.use('/api/local-sync', require('./routes/localSync.routes'));

// ── Serve Frontend in Production (if client/dist exists) ──────────────────────
const clientDistPath = path.join(__dirname, '../../client/dist');
const fs = require('fs');
if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath, {
        maxAge: '1d',
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-cache');
            } else if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
        }
    }));

    app.get('*', (req, res, next) => {
        // Do not intercept API or static media routes
        if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/downloads') || req.path.startsWith('/uploads')) {
            return next();
        }
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.send('API is running...');
    });
}

// ── Global error handler — never leak internal error details to client ────────
app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} —`, err.stack || err.message);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
        success: false,
        message: status === 500 ? 'An unexpected error occurred. Please try again.' : (err.message || 'Request failed'),
    });
});

module.exports = app;
