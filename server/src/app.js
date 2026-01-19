// server/src/app.js
const express = require('express')
const cors = require('cors')
const connectDB = require('./db/db')

// Import Routes
const authRoutes = require('./routes/auth.routes')
const adminRoutes = require('./routes/admin.routes')
const appointmentRoutes = require('./routes/appointment.routes')
const doctorRoutes = require('./routes/doctor.routes')
const adminEntitiesRoutes = require('./routes/admin-entities.routes')
const publicRoutes = require('./routes/public.routes')
const uploadRoutes = require('./routes/upload.routes')
const labRoutes = require('./routes/lab.routes')
const receptionRoutes = require('./routes/reception.routes') // <--- 1. IMPORT THIS
const pharmacyRoutes = require('./routes/pharmacy.routes')
const pharmacyOrderRoutes = require('./routes/pharmacyOrders.routes')

const app = express()

// Connect to database
connectDB()

// Middleware
app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://crm-ebon-two.vercel.app"
    ],
    credentials: true
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/doctor', doctorRoutes); 
app.use('/api/admin-entities', adminEntitiesRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/reception', receptionRoutes); // <--- 2. MOUNT THIS (Use exact path)
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/pharmacy/orders', pharmacyOrderRoutes);

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Server is running' })
})

app.get('/', (req, res) => {
    res.send('API is running...')
})

module.exports = app