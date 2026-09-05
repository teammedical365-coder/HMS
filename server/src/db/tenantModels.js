/**
 * tenantModels.js — Returns Mongoose models bound to a specific tenant DB connection.
 *
 * Why this is needed:
 *   Normal Mongoose models (e.g. require('../models/user.model')) are always
 *   bound to the DEFAULT connection (master DB). For tenant data, we need
 *   the same schemas but bound to the TENANT connection.
 *
 * Usage in a route:
 *   const { User, Appointment } = getTenantModels(req.tenantDb);
 *   const patients = await User.find({ hospitalId: req.hospitalId });
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ─── Schema Definitions (reusable, not bound to any connection) ───────────────

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, minlength: 2 },
    email: { type: String, required: true, lowercase: true, trim: true, match: /^\S+@\S+\.\S+$/ },
    password: { type: String, required: false },
    phone: { type: String, required: true, match: /^\d{10}$/ },
    role: { type: mongoose.Schema.Types.Mixed, default: 'patient' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, default: null },
    patientId: { type: String, unique: true, sparse: true },
    dob: String,
    gender: String,
    bloodGroup: String,
    address: String,
    houseNo: String,
    street: String,
    city: String,
    state: String,
    zipCode: String,
    mrn: { type: String, unique: true, sparse: true },
    aadhaarNumber: { type: String, required: true, match: /^\d{12}$/, unique: true, trim: true },
    isAadhaarVerified: { type: Boolean, default: false },
    age: { type: Number, required: true, min: 1 },
    patientType: { type: String, enum: ['Primary', 'Partner'], default: 'Primary' },
    departments: [{ type: String }],
    avatar: { type: String, default: null }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});
userSchema.methods.comparePassword = async function (entered) {
    if (!this.password) return false;
    return await bcrypt.compare(entered, this.password);
};

const appointmentSchema = new mongoose.Schema({
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId },
    date: Date,
    time: String,
    appointmentDate: Date,
    appointmentTime: { type: String, default: '' },
    tokenNumber: { type: Number, default: null },
    status: { type: String, default: 'Scheduled' },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Waived'], default: 'Pending' },
    fee: { type: Number, default: 0 },
    type: String,
    notes: String,
    department: String,
    doctorName: String,
    serviceName: String,
    amount: { type: Number, default: 0 },
    bookedBy: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true });

const labReportSchema = new mongoose.Schema({
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    testName: String,
    status: { type: String, default: 'Pending' },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Waived'], default: 'Pending' },
    price: { type: Number, default: 0 },
    results: mongoose.Schema.Types.Mixed,
    hospitalId: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true });

const pharmacyOrderSchema = new mongoose.Schema({
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [{ name: String, qty: Number, price: Number }],
    totalAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Waived'], default: 'Pending' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true });

const facilityChargeSchema = new mongoose.Schema({
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    facilityName: { type: String, required: true },
    pricePerDay: { type: Number, required: true },
    daysUsed: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Waived'], default: 'Pending' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId },
    notes: String,
}, { timestamps: true });

const roleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    permissions: [String],
    dashboardPath: { type: String, default: '/my-dashboard' },
    navLinks: [{ label: String, path: String }],
    hospitalId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isSystemRole: { type: Boolean, default: false },
}, { timestamps: true });

const transferRecordSchema = new mongoose.Schema({
    fromWard: { type: String, required: true },
    fromBedNumber: { type: String, required: true },
    fromBedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
    toWard: { type: String, required: true },
    toBedNumber: { type: String, required: true },
    toBedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', required: true },
    transferDate: { type: Date, required: true },
    transferTime: { type: String, default: '' },
    ratePerDay: { type: Number, default: 0 },
    hourlyRate: { type: Number, default: 0 },
    durationHours: { type: Number, default: 0 },
    durationDays: { type: Number, default: 0 },
    durationText: { type: String, default: '' },
    segmentAmount: { type: Number, default: 0 },
    transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, default: '' }
}, { _id: true, timestamps: true });

const admissionSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    admittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    admissionDate: { type: Date, default: Date.now },
    admissionTime: { type: String, default: '' },
    dischargeDate: Date,
    dischargeTime: { type: String, default: '' },
    status: { type: String, enum: ['Admitted', 'Discharged'], default: 'Admitted' },
    ward: { type: String, required: true },
    bedNumber: { type: String, required: true },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', required: true },
    wardRatePerDay: { type: Number, default: 0 },
    wardHourlyRate: { type: Number, default: 0 },
    transferHistory: [transferRecordSchema],
    selectedFacilities: [{
        facilityName: { type: String, required: true },
        pricePerDay: { type: Number, required: true },
        hourlyRate: { type: Number, default: 0 },
        days: { type: Number, default: 0 },
        hours: { type: Number, default: 0 },
        durationText: { type: String, default: '' },
        totalAmount: { type: Number, required: true }
    }],
    totalAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
    splitPayments: [{
        method: { type: String },
        amount: { type: Number, default: 0 }
    }],
    notes: String,
}, { timestamps: true });

const paymentTransactionSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    paymentMode: { type: String, default: 'Cash' },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed', 'Refunded'], default: 'Paid' },
    amount: { type: Number, required: true, default: 0 },
    transactionId: { type: String, default: '' },
    upiId: { type: String, default: '' },
    cardDetails: { type: String, default: '' }, // Masked
    bankReference: { type: String, default: '' },
    paymentDate: { type: Date, default: Date.now },
    proofUrl: { type: String, default: '' },
    proofFileId: { type: String, default: '' },
    billedItems: {
        appointments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }],
        labReports: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabReport' }],
        pharmacyOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyOrder' }],
        facilityCharges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FacilityCharge' }],
        admissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admission' }]
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const bedSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, required: true },
    bedNumber: { type: String, required: true, trim: true },
    ward: { type: String, required: true, trim: true },
    bedType: { type: String, enum: ['General', 'ICU', 'Private', 'Semi-Private', 'Other'], default: 'General' },
    status: { type: String, enum: ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'], default: 'AVAILABLE' },
    currentPatient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    currentAdmission: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', default: null }
}, { timestamps: true });

const otRoomSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Available', 'Occupied', 'Maintenance'], default: 'Available' },
    notes: { type: String, default: '' }
}, { timestamps: true });

const surgeryPlanSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    planId: { type: String, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    surgeonId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assistantSurgeonIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    referralId: { type: mongoose.Schema.Types.ObjectId, ref: 'Referral' },
    referringDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    surgery: { type: String, required: true },
    diagnosis: { type: String },
    preferredDate: { type: Date, required: true },
    preferredTime: { type: String, required: true },
    otRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'OTRoom' },
    surgeryDate: { type: Date },
    startTime: { type: String },
    endTime: { type: String },
    priority: { type: String, enum: ['Normal', 'High', 'Emergency'], default: 'Normal' },
    admissionRequired: { type: Boolean, default: false },
    admissionDate: { type: Date },
    preOpRequired: { type: Boolean, default: false },
    notes: { type: String },
    status: { type: String, enum: ['PLANNED', 'SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT', 'IN_OT', 'SURGERY_COMPLETED', 'POST_OP', 'COMPLETED', 'CANCELLED'], default: 'PLANNED', index: true },
    surgeryCost: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['UNPAID', 'PARTIALLY PAID', 'PAID'], default: 'UNPAID', index: true },
    splitPayments: [{
        method: { type: String },
        amount: { type: Number, default: 0 },
        date: { type: Date, default: Date.now }
    }],
    facilityChargeId: { type: mongoose.Schema.Types.ObjectId, ref: 'FacilityCharge' },
    actualStartTime: { type: Date },
    actualEndTime: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const referralSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    referringDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    referredToDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    notes: { type: String },
    referralDate: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: ['REFERRED', 'ACCEPTED', 'REJECTED', 'NOT_REQUIRED', 'SURGERY_PLANNED'],
        default: 'REFERRED'
    },
    surgeryPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'SurgeryPlan' },
    reviewNotes: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// ─── Model Factory ────────────────────────────────────────────────────────────

/**
 * Returns all Mongoose models bound to the given tenant connection.
 * Models are cached on the connection object itself to avoid re-registering.
 *
 * @param {mongoose.Connection} tenantDb
 * @returns {{ User, Appointment, LabReport, PharmacyOrder, FacilityCharge, Role, Admission, PaymentTransaction, Bed, OTRoom, SurgeryPlan, Referral }}
 */
function getTenantModels(tenantDb) {
    if (!tenantDb) {
        throw new Error('tenantDb connection is required for getTenantModels()');
    }

    // Helper: register model once per connection
    const model = (name, schema) => {
        try {
            return tenantDb.model(name);
        } catch {
            return tenantDb.model(name, schema);
        }
    };

    const { vialSchema } = require('../models/vial.model');
    const { inpatientOrderSchema } = require('../models/inpatientOrder.model');
    const { marRecordSchema } = require('../models/marRecord.model');
    const { ipdVitalsSchema } = require('../models/ipdVitals.model');

    return {
        User: model('User', userSchema),
        Appointment: model('Appointment', appointmentSchema),
        LabReport: model('LabReport', labReportSchema),
        PharmacyOrder: model('PharmacyOrder', pharmacyOrderSchema),
        FacilityCharge: model('FacilityCharge', facilityChargeSchema),
        Role: model('Role', roleSchema),
        Admission: model('Admission', admissionSchema),
        PaymentTransaction: model('PaymentTransaction', paymentTransactionSchema),
        Bed: model('Bed', bedSchema),
        OTRoom: model('OTRoom', otRoomSchema),
        SurgeryPlan: model('SurgeryPlan', surgeryPlanSchema),
        Referral: model('Referral', referralSchema),
        Vial: model('Vial', vialSchema),
        InpatientOrder: model('InpatientOrder', inpatientOrderSchema),
        MARRecord: model('MARRecord', marRecordSchema),
        IPDVitals: model('IPDVitals', ipdVitalsSchema),
    };
}

module.exports = { getTenantModels };
