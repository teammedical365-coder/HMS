const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const { 
    generalLimiter, 
    publicConfigLimiter, 
    aiWalletLimiter, 
    uploadLimiter, 
    searchLimiter 
} = require('./middleware/rateLimiter');

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

// ── 1. CORS Configuration (Exact Allowlist Matching & Domain Cache) ─────────
const ALLOWED_EXACT_ORIGINS = new Set([
    'https://medical365.in',
    'https://www.medical365.in',
    'https://hms-react-native-app-alpha.vercel.app'
]);

// Parse any additional allowed origins from environment configuration
if (process.env.CORS_ALLOWED_ORIGINS) {
    process.env.CORS_ALLOWED_ORIGINS.split(',').forEach(o => {
        const trimmed = o.trim();
        if (trimmed) ALLOWED_EXACT_ORIGINS.add(trimmed);
    });
}

const isAllowedOrigin = (origin) => {
    if (!origin) return true; // Direct REST / non-browser requests (mobile native, server-to-server)
    
    let parsedUrl;
    try {
        parsedUrl = new URL(origin);
    } catch {
        return false;
    }

    const { protocol, hostname, origin: normalizedOrigin } = parsedUrl;

    // Reject non-http(s) except approved native schemes
    if (protocol !== 'http:' && protocol !== 'https:') {
        if (['capacitor:', 'ionic:'].includes(protocol)) return true;
        return false;
    }

    // Exact allowlist match
    if (ALLOWED_EXACT_ORIGINS.has(normalizedOrigin)) return true;

    // Subdomains of medical365.in (strictly https in production, e.g. admin.medical365.in, apollo.medical365.in)
    // Validates that hostname strictly ends with .medical365.in and prefix is valid alphanumeric subdomain
    const isM365Subdomain = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.medical365\.in$/.test(hostname);
    if (isM365Subdomain) {
        if (protocol === 'https:' || process.env.NODE_ENV !== 'production') {
            return true;
        }
    }

    // Local development network origins (strictly non-production)
    if (process.env.NODE_ENV !== 'production') {
        if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
        if (hostname.endsWith('.localhost')) return true;
        // Private LAN IP ranges: 10.x.x.x, 192.168.x.x, 172.16-31.x.x
        if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) return true;
    }

    return false;
};

const HospitalModelForCors = require('./models/hospital.model');
const verifiedDomainCache = new Map(); // domain -> { allowed: boolean, expireAt: number }
const VERIFIED_DOMAIN_CACHE_MAX = 500;

function setDomainCache(domain, val) {
    if (verifiedDomainCache.size >= VERIFIED_DOMAIN_CACHE_MAX) {
        const oldest = verifiedDomainCache.keys().next().value;
        verifiedDomainCache.delete(oldest);
    }
    verifiedDomainCache.set(domain, val);
}

// Preflight & CORS Header Fallback (Guarantees preflight OPTIONS 204 response with proper CORS headers)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        const allowed = isAllowedOrigin(origin);
        if (allowed) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
            const requestHeaders = req.headers['access-control-request-headers'];
            const defaultAllowedHeaders = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-tenant-subdomain, x-hospital-id, x-client-version, x-portal-type, x-app-type, x-offline-ping, X-Offline-Ping, x-client-operation-id, X-Client-Operation-Id, Cache-Control, Pragma, Expires';

            res.setHeader(
                'Access-Control-Allow-Headers',
                requestHeaders ? `${defaultAllowedHeaders}, ${requestHeaders}` : defaultAllowedHeaders
            );
            res.setHeader('Access-Control-Max-Age', '86400');
        } else if (req.method === 'OPTIONS') {
            return res.status(403).json({ success: false, message: 'CORS origin not allowed' });
        }
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

        let parsedUrl;
        try {
            parsedUrl = new URL(origin);
        } catch {
            return callback(null, false);
        }

        const domainOnly = parsedUrl.hostname.toLowerCase();

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
                    setDomainCache(domainOnly, { allowed: true, expireAt: now + 10 * 60 * 1000 });
                    callback(null, true);
                } else {
                    setDomainCache(domainOnly, { allowed: false, expireAt: now + 2 * 60 * 1000 });
                    callback(null, false);
                }
            })
            .catch(err => {
                console.warn('[CORS DB Check Warning]:', err.message);
                callback(null, false); // Fail closed on DB error
            });
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'x-tenant-subdomain',
        'x-hospital-id',
        'x-client-version',
        'x-portal-type',
        'x-app-type',
        'x-offline-ping',
        'X-Offline-Ping',
        'x-client-operation-id',
        'X-Client-Operation-Id',
        'Cache-Control',
        'Pragma',
        'Expires'
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range', 'ETag', 'x-tenant-subdomain'],
    maxAge: 86400
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Enable reverse proxy support for Render / Cloudflare rate-limiting
app.set('trust proxy', 1);

// ── Security headers (Helmet CSP, COOP, HSTS, Frameguard, NoSniff) ───────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
            imgSrc: ["'self'", "data:", "blob:", "https://ik.imagekit.io", "https:"],
            connectSrc: ["'self'", "https:", "wss:", "ws:"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'sameorigin' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ── CORS configuration moved to top of file ──

// ── Body parsing (with size limits) ──────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// ── NoSQL injection protection — strip $ and . from req.body/params/query ────
app.use(mongoSanitize());

// ── HTTP parameter pollution protection ──────────────────────────────────────
app.use(hpp());

// ── Lightweight Performance & Status Metrics Tracker ─────────────────────────
const serverMetrics = {
    totalRequests: 0,
    statusCodes: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
    startTime: Date.now()
};

app.use((req, res, next) => {
    serverMetrics.totalRequests++;
    res.on('finish', () => {
        const cat = `${Math.floor(res.statusCode / 100)}xx`;
        if (serverMetrics.statusCodes[cat] !== undefined) {
            serverMetrics.statusCodes[cat]++;
        }
    });
    next();
});

// ── Health Check Endpoint (Render & APM Liveness Probe) ───────────────────────
app.get('/healthz', (req, res) => {
    const mongoose = require('mongoose');
    const mongoStatus = mongoose.connection.readyState;
    const isHealthy = mongoStatus === 1;
    const mem = process.memoryUsage();
    
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'degraded',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        database: {
            connected: isHealthy,
            state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoStatus] || 'unknown'
        },
        memory: {
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
            rssMB: Math.round(mem.rss / 1024 / 1024)
        },
        traffic: serverMetrics
    });
});

// ── ABDM Callback Layer (Public bridge endpoints — bypass general rate limiter) ──
const { ABDM_CALLBACK_PATH, abdmCallbackLimiter, verifyAbdmCallback, abdmCallbackHandler } =
    require('./modules/abdm/abdm.callbacks');
app.post(ABDM_CALLBACK_PATH, abdmCallbackLimiter, verifyAbdmCallback, abdmCallbackHandler);

// ── Global rate limit (200 req / 15 min per IP) ───────────────────────────────
app.use('/api/', generalLimiter);

// ── Logging (skip in test) ────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Tenant Resolution Middleware ────────────────────────────────────────────────
const tenantResolver = require('./middleware/tenantResolver');
app.use(tenantResolver);

// ── Pacific Demo Sandbox Execution Context (suppresses real SMS/Email for active demo sessions only) ──
const jwtForDemoSandbox = require('jsonwebtoken');
const { JWT_SECRET: DEMO_SANDBOX_JWT_SECRET } = require('./config/jwt');
const { pacificDemoAls } = require('./config/pacificDemoConfig');
app.use('/api', (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const tok = authHeader.split(' ')[1];
        const preview = jwtForDemoSandbox.decode(tok);
        if (preview && preview.isPacificDemo === true) {
            try {
                const verified = jwtForDemoSandbox.verify(tok, DEMO_SANDBOX_JWT_SECRET);
                if (verified && verified.isPacificDemo === true) {
                    req.isPacificDemo = true;
                    return pacificDemoAls.run({ isPacificDemo: true }, next);
                }
            } catch (_) {
                // Let verifyToken handle invalid/expired tokens normally
            }
        }
    }
    return next();
});

// ── Static uploads ────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Layered Resource Rate Limiters ───────────────────────────────────────────
app.use('/api/public/branding', publicConfigLimiter);
app.use('/api/public/tenant-config', publicConfigLimiter);
app.use('/api/public/auth-config', publicConfigLimiter);
app.use('/api/ai-wallet', aiWalletLimiter);
app.use('/api/upload', uploadLimiter);
app.use('/api/search', searchLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin-entities', adminEntitiesRoutes);
const labReceptionRoutes = require('./routes/labReception.routes');
const labBillingRoutes = require('./routes/labBilling.routes');
const labSampleRoutes = require('./routes/labSample.routes');
const labResultRoutes = require('./routes/labResult.routes');
const labReportRoutes = require('./routes/labReport.routes');

app.use('/api/lab/reports', labReportRoutes);
app.use('/api/lab/results', labResultRoutes);
app.use('/api/lab/samples', labSampleRoutes);
app.use('/api/lab/billing', labBillingRoutes);
app.use('/api/lab/reception', labReceptionRoutes);
app.use('/api/lab/master', require('./routes/labMaster.routes'));
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
app.use('/api/superadmin/releases', require('./routes/release.routes')); // Added superadmin OTA release routes
app.use('/api/finance', financeRoutes);

// ── Static Downloads for Generated Apps ─────────────────────────────────────────
app.use('/downloads/apks', express.static(path.join(__dirname, '../public/downloads/apks')));
app.use('/downloads/aabs', express.static(path.join(__dirname, '../public/downloads/aabs')));
app.use('/downloads/releases', express.static(path.join(__dirname, '../public/downloads/releases')));
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
app.use('/api/pacific-demo', require('./routes/pacificDemo.routes'));
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
app.use('/api/nabh', require('./routes/nabh.routes'));
app.use('/api/patient-policies', require('./routes/patientPolicy.routes'));
app.use('/api/abdm/abha', require('./modules/abdm/abha.routes'));
const { bridgeRouter } = require('./modules/abdm/abdm.bridge.routes');
app.use('/api/abdm/bridge', bridgeRouter);

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
