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
const financeRoutes = require('./routes/finance.routes');
const billingRoutes = require('./routes/billing.routes');
const admissionRoutes = require('./routes/admission.routes');
const simpleClinicRoutes = require('./routes/simpleClinic.routes');
const clinicRoutes = require('./routes/clinic.routes');
const syncRoutes = require('./routes/sync.routes');
const patientAuthRoutes = require('./routes/patientAuth.routes');
const patientLocalRoutes = require('./routes/patientLocal.routes');
const revenueRoutes = require('./routes/revenue.routes');
const mfaRoutes = require('./routes/mfa.routes');
const patientAppRoutes = require('./routes/patientApp.routes');

const app = express();
app.use('/api/patient-auth', patientAuthRoutes);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https://ik.imagekit.io'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const LOCALHOST_RE = /^https?:\/\/([a-zA-Z0-9-]+\.)*(localhost|127\.0\.0\.1)(:\d+)?$/;
const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (LOCALHOST_RE.test(origin)) return true;
    if (origin === 'https://medical365.in') return true;
    if (origin === 'https://www.medical365.in') return true;
    if (origin.endsWith('.medical365.in')) return true;
    return false;
};

const HospitalModelForCors = require('./models/hospital.model');

app.use(cors({
    origin: async (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);

        try {
            // Support for white-labeled custom domains
            const domainOnly = origin.replace(/^https?:\/\//, '');
            const hospital = await HospitalModelForCors.findOne({ customDomain: domainOnly }).select('_id').lean();
            if (hospital) {
                return callback(null, true);
            }
        } catch (err) {
            console.error('CORS DB Check Error:', err);
        }

        callback(new Error('CORS blocked: ' + origin), false);
    },
    credentials: true,
}));

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
app.use('/api/finance', financeRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/simple-clinics', simpleClinicRoutes);
app.use('/api/clinic', clinicRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/patient-app', patientAppRoutes);
app.use('/api/patient-local', patientLocalRoutes);
app.use('/api/mfa', mfaRoutes);

app.get('/', (req, res) => {
    res.send('API is running...');
});

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
