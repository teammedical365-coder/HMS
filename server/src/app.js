const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

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
const syncRoutes        = require('./routes/sync.routes');
const patientAppRoutes  = require('./routes/patientApp.routes');
const patientLocalRoutes = require('./routes/patientLocal.routes');
const revenueRoutes     = require('./routes/revenue.routes');

const app = express();
// ughfgh
// --- CORS CONFIGURATION ---
const isAllowedOrigin = (origin) => {
    if (!origin) return true;                                  // curl / mobile / server-to-server
    if (origin.includes('localhost')) return true;             // any localhost port (dev)
    if (origin === 'https://medical365.in') return true;       // root domain
    if (origin === 'https://www.medical365.in') return true;   // www
    if (origin.endsWith('.medical365.in')) return true;        // admin.* and all hospital subdomains
    return false;
};

app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        callback(new Error('CORS blocked: ' + origin), false);
    },
    credentials: true
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
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

// --- NEW ROUTES REGISTERED HERE ---
app.use('/api/patients', patientRoutes); // For searching & identifying patients (e.g. /api/patients/search)
app.use('/api/clinical', clinicalRoutes); // For visits, vitals & history (e.g. /api/clinical/intake)
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

// Revenue & Billing — Central Admin system analytics
app.use('/api/revenue', revenueRoutes);

// ── Hybrid local/cloud infrastructure ────────────────────────────────────────
// Sync receiver + tunnel proxy (active on cloud; no-ops on local for sync routes)
app.use('/api/sync', syncRoutes);
// Patient mobile/PWA app routes (cloud: auth + tunnel proxy; local: data serving)
app.use('/api/patient-app', patientAppRoutes);
// Local patient data routes — called via tunnel from cloud, or directly on LAN
app.use('/api/patient-local', patientLocalRoutes);

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: err.message
    });
});

module.exports = app;
// Trigger nodemon restart