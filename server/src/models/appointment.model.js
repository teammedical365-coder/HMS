const mongoose = require('mongoose');

// Define a sub-schema for Pharmacy items to ensure structure
const pharmacyItemSchema = new mongoose.Schema({
  medicineName: { 
    type: String, 
    required: [true, 'Medicine name is required'],
    trim: true
  },
  frequency: { 
    type: String, 
    default: '',
    trim: true
  },
  duration: { 
    type: String, 
    default: '',
    trim: true
  }
}, { _id: false });

const appointmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  patientId: {
    type: String,
    required: false,
    index: true
  },
  doctorId: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  doctorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true
  },
  doctorName: {
    type: String,
    required: [true, 'Doctor name is required']
  },
  serviceId: { type: String, required: false },
  serviceName: { type: String, required: false },
  appointmentDate: { type: Date, required: [true, 'Appointment date is required'] },
  appointmentTime: { type: String, required: [true, 'Appointment time is required'] },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  amount: { type: Number, default: 0 },
  
  // Clinical Data
  notes: { type: String, default: '' },
  doctorNotes: { type: String, default: '' },
  symptoms: { type: String, default: '' },
  diagnosis: { type: String, default: '' },

  // --- NEW FIELD: Selected Lab ---
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    default: null
  },
  // -------------------------------

  labTests: [{ type: String, trim: true }],
  dietPlan: [{ type: String, trim: true }],
  pharmacy: [pharmacyItemSchema], 
  ivfDetails: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Files
  prescription: { type: String, default: '' },
  prescriptions: [{
    url: { type: String, required: true },
    fileId: { type: String },
    name: { type: String },
    uploadedAt: { type: Date, default: Date.now },
    type: { type: String } // 'doctor_prescription' or 'lab_report'
  }]
}, {
  timestamps: true
});

appointmentSchema.index(
  { doctorId: 1, appointmentDate: 1, appointmentTime: 1 }, 
  { unique: true, partialFilterExpression: { status: { $ne: 'cancelled' } } }
);

const Appointment = mongoose.model('Appointment', appointmentSchema);
module.exports = Appointment;