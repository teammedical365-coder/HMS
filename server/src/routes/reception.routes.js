// server/src/routes/reception.routes.js
const express = require('express');
const router = express.Router();
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const { verifyToken } = require('../middleware/auth.middleware');

// --- Middleware: Strict Role Check ---
const verifyReception = (req, res, next) => {
  // Allow 'admin' to act as 'reception' for debugging/management
  if (req.user.role !== 'reception' && req.user.role !== 'admin') {
    console.log(`[AUTH FAIL] User ${req.user.userId} with role ${req.user.role} tried to access reception routes.`);
    return res.status(403).json({ success: false, message: 'Access denied: Reception access only' });
  }
  next();
};

// 1. GET ALL APPOINTMENTS
// Route: GET /api/reception/appointments
router.get('/appointments', verifyToken, verifyReception, async (req, res) => {
  console.log('[RECEPTION] Fetching all appointments...');
  try {
    const appointments = await Appointment.find({})
      .populate('userId', 'name email phone patientId')
      .populate('doctorId', 'name')
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .lean();

    console.log(`[RECEPTION] Found ${appointments.length} appointments.`);
    res.json({ success: true, appointments });
  } catch (error) {
    console.error('[RECEPTION] Error fetching appointments:', error);
    res.status(500).json({ success: false, message: 'Server Error: Could not fetch appointments' });
  }
});

// 2. RESCHEDULE APPOINTMENT
// Route: PATCH /api/reception/appointments/:id/reschedule
router.patch('/appointments/:id/reschedule', verifyToken, verifyReception, async (req, res) => {
  const { id } = req.params;
  const { date, time } = req.body;
  console.log(`[RECEPTION] Rescheduling Apt ${id} to ${date} at ${time}`);

  try {
    const appointment = await Appointment.findById(id);
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });

    // Validate Date (No past dates)
    const todayStr = new Date().toISOString().split('T')[0];
    const reqDateStr = new Date(date).toISOString().split('T')[0];
    if (reqDateStr < todayStr) {
      return res.status(400).json({ success: false, message: 'Cannot reschedule to a past date.' });
    }

    // Validate Doctor Availability
    const doctorDoc = await Doctor.findById(appointment.doctorId);
    if (doctorDoc) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = days[new Date(reqDateStr).getDay()];

      // Check specific day availability
      if (doctorDoc.availability && doctorDoc.availability[dayName]) {
         if (!doctorDoc.availability[dayName].available) {
             return res.status(400).json({ success: false, message: `Doctor is not available on ${dayName}s.` });
         }
      }

      // Check Double Booking (Ignore self)
      const collision = await Appointment.findOne({
        doctorId: doctorDoc._id,
        appointmentDate: new Date(reqDateStr),
        appointmentTime: time,
        status: { $ne: 'cancelled' },
        _id: { $ne: id }
      });

      if (collision) {
        return res.status(400).json({ success: false, message: 'Time slot is already booked.' });
      }
    }

    // Apply Update
    appointment.appointmentDate = new Date(reqDateStr);
    appointment.appointmentTime = time;
    if (appointment.status === 'cancelled') appointment.status = 'confirmed';
    
    await appointment.save();
    res.json({ success: true, message: 'Rescheduled successfully', appointment });

  } catch (error) {
    console.error('[RECEPTION] Reschedule Error:', error);
    res.status(500).json({ success: false, message: 'Server Error: Could not reschedule' });
  }
});

// 3. CANCEL APPOINTMENT
// Route: PATCH /api/reception/appointments/:id/cancel
router.patch('/appointments/:id/cancel', verifyToken, verifyReception, async (req, res) => {
  console.log(`[RECEPTION] Cancelling Apt ${req.params.id}`);
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
    
    res.json({ success: true, message: 'Appointment cancelled', appointment });
  } catch (error) {
    console.error('[RECEPTION] Cancel Error:', error);
    res.status(500).json({ success: false, message: 'Server Error: Could not cancel' });
  }
});

module.exports = router;