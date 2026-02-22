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

const app = express();
// ughfgh
// --- CORS CONFIGURATION ---
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)dr
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            "http://localhost:5173",
            "http://localhost:3000",
            "https://crm-ebon-two.vercel.app",
            "https://crm-222i.onrender.com",
            "https://crm-arkw.vercel.app" // <-- ADD THIS LINE! (Make sure there is no '/' at the very end)
        ];

        // DYNAMIC ALLOW: If origin includes "localhost", allow it (Fixes 5174, 5175, etc.)
        if (origin.includes('localhost') || allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }

        var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
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