// server/src/routes/appointment.routes.js
const express = require('express');
const router = express.Router();
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model'); 
const { verifyToken } = require('../middleware/auth.middleware');

// ==========================================
// 1. RECEPTION & ADMIN ROUTES (Must be first)
// ==========================================

// GET All Appointments (Reception/Admin)
router.get('/reception/all', verifyToken, async (req, res) => {
  try {
    // Check permissions
    if (req.user.role !== 'reception' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const appointments = await Appointment.find({})
      .populate('userId', 'name email phone patientId')
      .populate('doctorId', 'name') 
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .lean();

    res.json({ success: true, appointments });
  } catch (error) {
    console.error('Reception fetch error:', error);
    res.status(500).json({ success: false, message: 'Error fetching all appointments', error: error.message });
  }
});

// Reschedule Appointment (Reception/Admin)
router.patch('/reception/reschedule/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'reception' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { id } = req.params;
    const { date, time } = req.body;

    if (!date || !time) {
      return res.status(400).json({ success: false, message: 'Date and time are required' });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // --- Validation Logic ---
    const today = new Date();
    const reqDate = new Date(date);
    const todayStr = today.toISOString().split('T')[0];
    const reqDateStr = reqDate.toISOString().split('T')[0];

    if (reqDateStr < todayStr) {
        return res.status(400).json({ success: false, message: 'Cannot reschedule to the past.' });
    }

    // Check Availability
    const doctorDoc = await Doctor.findById(appointment.doctorId);
    if (doctorDoc) {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = days[reqDate.getDay()];
        
        if (doctorDoc.availability && doctorDoc.availability[dayName]) {
            const daySchedule = doctorDoc.availability[dayName];
            if (!daySchedule.available) {
                return res.status(400).json({ success: false, message: `Doctor is not available on ${dayName}s.` });
            }
            if (daySchedule.startTime && daySchedule.endTime) {
                const getMin = (t) => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]);
                const reqMin = getMin(time);
                const startMin = getMin(daySchedule.startTime);
                const endMin = getMin(daySchedule.endTime);
                
                if (reqMin < startMin || reqMin >= endMin) {
                    return res.status(400).json({ success: false, message: `Doctor is only available between ${daySchedule.startTime} and ${daySchedule.endTime}` });
                }
            }
        }

        // Check for Double Booking (excluding this appointment)
        const existingAppointment = await Appointment.findOne({
            doctorId: doctorDoc._id,
            appointmentDate: new Date(reqDateStr),
            appointmentTime: time,
            status: { $ne: 'cancelled' },
            _id: { $ne: id }
        });

        if (existingAppointment) {
            return res.status(400).json({ success: false, message: 'This slot is already booked.' });
        }
    }

    // Update fields
    appointment.appointmentDate = new Date(reqDateStr);
    appointment.appointmentTime = time;
    if (appointment.status === 'cancelled') {
        appointment.status = 'confirmed'; // Restore status if it was cancelled
    }
    
    await appointment.save();

    res.json({ success: true, message: 'Appointment rescheduled successfully', appointment });
  } catch (error) {
    console.error('Reschedule error:', error);
    res.status(500).json({ success: false, message: 'Error rescheduling appointment', error: error.message });
  }
});

// Cancel Appointment (Reception/Admin)
router.patch('/reception/cancel/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'reception' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { id } = req.params;
    const appointment = await Appointment.findByIdAndUpdate(
      id, 
      { status: 'cancelled' },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    res.json({ success: true, message: 'Appointment cancelled', appointment });
  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({ success: false, message: 'Error cancelling appointment', error: error.message });
  }
});

// ==========================================
// 2. GENERAL APPOINTMENT ROUTES
// ==========================================

// Create Appointment
router.post('/create', verifyToken, async (req, res) => {
  try {
    const { 
      doctorId, serviceId, serviceName, appointmentDate, appointmentTime, amount, 
      notes, doctorNotes, symptoms, diagnosis, prescriptionDescription, ivfDetails, pharmacy, labTests, dietPlan 
    } = req.body;

    const userId = req.user.userId;

    if (!doctorId || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ success: false, message: 'Missing required fields (doctorId, date, or time)' });
    }

    // Fetch User to get persistent Patient ID
    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    const patientId = user.patientId; 

    // Find Doctor
    let doctorDoc = await Doctor.findOne({
      $or: [
        { _id: (doctorId.match(/^[0-9a-fA-F]{24}$/) ? doctorId : null) },
        { userId: (doctorId.match(/^[0-9a-fA-F]{24}$/) ? doctorId : null) },
        { doctorId: doctorId }
      ]
    });

    if (!doctorDoc) {
      return res.status(400).json({ success: false, message: 'Doctor not found.' });
    }

    // Validate Date
    const today = new Date();
    const reqDate = new Date(appointmentDate);
    const todayStr = today.toISOString().split('T')[0];
    const reqDateStr = reqDate.toISOString().split('T')[0];

    if (reqDateStr < todayStr) {
        return res.status(400).json({ success: false, message: 'Cannot book appointments in the past.' });
    }

    // Validate Time (Simple logic)
    if (reqDateStr === todayStr) {
        const currentHours = today.getHours();
        const currentMinutes = today.getMinutes();
        const currentTimeInMin = currentHours * 60 + currentMinutes;
        const [reqHours, reqMinutes] = appointmentTime.split(':').map(Number);
        const reqTimeInMin = reqHours * 60 + reqMinutes;

        if (reqTimeInMin <= currentTimeInMin + 15) {
             return res.status(400).json({ success: false, message: 'This time slot is too soon or has passed.' });
        }
    }

    // Check Availability
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[reqDate.getDay()];
    
    if (doctorDoc.availability && doctorDoc.availability[dayName]) {
        const daySchedule = doctorDoc.availability[dayName];
        if (!daySchedule.available) {
            return res.status(400).json({ success: false, message: `Doctor is not available on ${dayName}s.` });
        }
        if (daySchedule.startTime && daySchedule.endTime) {
            const getMin = (t) => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]);
            const reqMin = getMin(appointmentTime);
            const startMin = getMin(daySchedule.startTime);
            const endMin = getMin(daySchedule.endTime);
            
            if (reqMin < startMin || reqMin >= endMin) {
                 return res.status(400).json({ success: false, message: `Doctor is only available between ${daySchedule.startTime} and ${daySchedule.endTime}` });
            }
        }
    }

    // Check for Double Booking
    const existingAppointment = await Appointment.findOne({
        doctorId: doctorDoc._id,
        appointmentDate: new Date(reqDateStr),
        appointmentTime: appointmentTime,
        status: { $ne: 'cancelled' }
    });

    if (existingAppointment) {
        return res.status(400).json({ success: false, message: 'This slot is already booked.' });
    }

    // Save Appointment with ALL FIELDS
    const appointment = new Appointment({
      userId: userId,
      patientId: patientId, 
      doctorId: doctorDoc._id,
      doctorUserId: doctorDoc.userId,
      doctorName: doctorDoc.name,
      serviceId: serviceId || (doctorDoc.services && doctorDoc.services[0]) || 'general',
      serviceName: serviceName || 'General Consultation',
      appointmentDate: new Date(reqDateStr),
      appointmentTime: appointmentTime,
      amount: amount || doctorDoc.consultationFee || 500,
      
      notes: notes || '',
      prescriptionDescription: prescriptionDescription || '',
      doctorNotes: doctorNotes || '', 
      symptoms: symptoms || '',
      diagnosis: diagnosis || '',
      ivfDetails: ivfDetails || {}, 
      pharmacy: pharmacy || [],
      labTests: labTests || [],
      dietPlan: dietPlan || [],

      status: 'pending',
      paymentStatus: 'pending'
    });

    const savedAppointment = await appointment.save();
    
    console.log("[BACKEND] Appointment Created & Saved. ID:", savedAppointment._id);
    console.log("------------------------------------------");

    res.status(201).json({ success: true, message: 'Appointment booked successfully', appointment: savedAppointment });

  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ success: false, message: 'Server error creating appointment', error: error.message });
  }
});

// Get My Appointments
router.get('/my-appointments', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Explicitly select all fields to ensure they are returned to frontend
    const appointments = await Appointment.find({ userId })
      .select('userId patientId doctorId doctorName serviceName appointmentDate appointmentTime status paymentStatus amount notes prescriptionDescription doctorNotes symptoms diagnosis ivfDetails prescription prescriptions labTests dietPlan pharmacy')
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .lean(); 
    
    res.status(200).json({ success: true, appointments });
  } catch (error) {
    console.error('Fetch appointments error:', error);
    res.status(500).json({ success: false, message: 'Error fetching appointments' });
  }
});

module.exports = router;