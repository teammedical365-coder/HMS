const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const Doctor = require('../models/doctor.model');
const Lab = require('../models/lab.model');
const Pharmacy = require('../models/pharmacy.model');
const Reception = require('../models/reception.model');
const Service = require('../models/service.model');
const User = require('../models/user.model');
const { verifyAdminOrSuperAdmin } = require('../middleware/auth.middleware');
const bcrypt = require('bcryptjs');

/**
 * Returns hospitalId filter for queries.
 * Central admin: no filter (sees all) unless ?hospitalId= query param
 * Hospital admin / staff: always scoped to their hospitalId
 */
function getHospitalFilter(req) {
  const role = req.user ? req.user.role : null;
  const isCentral = role === 'centraladmin' || role === 'superadmin';
  if (isCentral) {
    const qhid = req.query.hospitalId;
    return qhid ? { hospitalId: qhid } : {};
  }
  const hid = req.user && req.user.hospitalId;
  return hid ? { hospitalId: hid } : { hospitalId: null };
}

function getHospitalId(req) {
  const role = req.user ? req.user.role : null;
  const isCentral = role === 'centraladmin' || role === 'superadmin';
  if (isCentral) return req.body.hospitalId || null;
  return (req.user && req.user.hospitalId) || null;
}

// Create doctor
router.post('/doctors', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, specialty, experience, education, services, availability, successRate, patientsCount, image, bio, consultationFee, password } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Generate unique doctor ID using nanoid
    let doctorId;
    let isUnique = false;
    while (!isUnique) {
      doctorId = nanoid(10); // Generate 10-character ID
      const existingDoctor = await Doctor.findOne({ doctorId });
      if (!existingDoctor) {
        isUnique = true;
      }
    }

    // Create user account for the doctor
    const defaultPassword = password || nanoid(12); // Generate password if not provided
    // Don't hash password here - User model's pre-save hook will handle it

    const user = new User({
      name,
      email: email.toLowerCase(),
      password: defaultPassword,
      phone: phone || '',
      role: 'doctor',
      services: services || [],
      hospitalId: getHospitalId(req)
    });

    await user.save();

    // Ensure availability has proper structure
    const defaultAvailability = {
      monday: { available: false, startTime: '09:00', endTime: '17:00' },
      tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
      wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
      thursday: { available: false, startTime: '09:00', endTime: '17:00' },
      friday: { available: false, startTime: '09:00', endTime: '17:00' },
      saturday: { available: false, startTime: '09:00', endTime: '17:00' },
      sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    };

    const mergedAvailability = { ...defaultAvailability };
    if (availability && typeof availability === 'object') {
      Object.keys(availability).forEach(day => {
        if (defaultAvailability[day]) {
          mergedAvailability[day] = {
            available: availability[day].available !== undefined ? availability[day].available : false,
            startTime: availability[day].startTime || defaultAvailability[day].startTime,
            endTime: availability[day].endTime || defaultAvailability[day].endTime
          };
        }
      });
    }

    const doctor = new Doctor({
      doctorId: doctorId,
      userId: user._id,
      hospitalId: getHospitalId(req),
      name: name,
      email: email.toLowerCase(),
      phone: phone || '',
      specialty: specialty || '',
      experience: experience || '',
      education: education || '',
      services: services || [],
      departments: req.body.departments || [],
      availability: mergedAvailability,
      successRate: successRate || '90%',
      patientsCount: patientsCount || '100+',
      image: image || '👨‍⚕️',
      bio: bio || '',
      consultationFee: consultationFee || 0
    });

    await doctor.save();
    const populatedDoctor = await Doctor.findById(doctor._id).populate('userId', 'name email phone role');

    res.status(201).json({
      success: true,
      message: 'Doctor created successfully',
      doctor: populatedDoctor,
      generatedPassword: !password ? defaultPassword : undefined // Return generated password if not provided
    });
  } catch (error) {
    console.error('Create doctor error:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message).join(', ');
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: errors
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Doctor profile already exists for this user'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating doctor',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get all doctors
router.get('/doctors', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const filter = getHospitalFilter(req);
    const doctors = await Doctor.find(filter).populate('userId', 'name email phone role').sort({ createdAt: -1 });
    res.json({ success: true, doctors });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching doctors', error: error.message });
  }
});

// Get single doctor
router.get('/doctors/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate('userId', 'name email phone role');
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }
    res.json({ success: true, doctor });
  } catch (error) {
    console.error('Get doctor error:', error);
    res.status(500).json({ success: false, message: 'Error fetching doctor', error: error.message });
  }
});

// Update doctor
router.put('/doctors/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, specialty, experience, education, services, availability, successRate, patientsCount, image, bio, consultationFee, departments } = req.body;

    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    // Update doctor fields
    if (name) doctor.name = name;
    if (email) doctor.email = email.toLowerCase();
    if (phone !== undefined) doctor.phone = phone;
    if (specialty !== undefined) doctor.specialty = specialty;
    if (experience !== undefined) doctor.experience = experience;
    if (education !== undefined) doctor.education = education;
    if (services !== undefined) doctor.services = services;
    if (departments !== undefined) doctor.departments = departments;
    if (availability !== undefined) {
      const defaultAvailability = {
        monday: { available: false, startTime: '09:00', endTime: '17:00' },
        tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
        wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
        thursday: { available: false, startTime: '09:00', endTime: '17:00' },
        friday: { available: false, startTime: '09:00', endTime: '17:00' },
        saturday: { available: false, startTime: '09:00', endTime: '17:00' },
        sunday: { available: false, startTime: '09:00', endTime: '17:00' }
      };
      const mergedAvailability = { ...defaultAvailability };
      if (availability && typeof availability === 'object') {
        Object.keys(availability).forEach(day => {
          if (defaultAvailability[day]) {
            mergedAvailability[day] = {
              available: availability[day].available !== undefined ? availability[day].available : false,
              startTime: availability[day].startTime || defaultAvailability[day].startTime,
              endTime: availability[day].endTime || defaultAvailability[day].endTime
            };
          }
        });
      }
      doctor.availability = mergedAvailability;
    }
    if (successRate !== undefined) doctor.successRate = successRate;
    if (patientsCount !== undefined) doctor.patientsCount = patientsCount;
    if (image !== undefined) doctor.image = image;
    if (bio !== undefined) doctor.bio = bio;
    if (consultationFee !== undefined) doctor.consultationFee = consultationFee;

    await doctor.save();

    // Update user if exists
    if (doctor.userId) {
      const user = await User.findById(doctor.userId);
      if (user) {
        if (name) user.name = name;
        if (email) user.email = email.toLowerCase();
        if (phone !== undefined) user.phone = phone;
        if (services !== undefined) user.services = services;
        await user.save();
      }
    }

    const populatedDoctor = await Doctor.findById(doctor._id).populate('userId', 'name email phone role');
    res.json({ success: true, message: 'Doctor updated successfully', doctor: populatedDoctor });
  } catch (error) {
    console.error('Update doctor error:', error);
    res.status(500).json({ success: false, message: 'Error updating doctor', error: error.message });
  }
});

// Delete doctor
router.delete('/doctors/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    // Optionally delete associated user
    if (doctor.userId) {
      await User.findByIdAndDelete(doctor.userId);
    }

    await Doctor.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Doctor deleted successfully' });
  } catch (error) {
    console.error('Delete doctor error:', error);
    res.status(500).json({ success: false, message: 'Error deleting doctor', error: error.message });
  }
});

// Labs routes
router.post('/labs', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, services, facilities, availability, description, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if email already exists in User collection
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Check if lab already exists
    const existingLab = await Lab.findOne({ email: email.toLowerCase() });
    if (existingLab) {
      return res.status(400).json({ success: false, message: 'Lab with this email already exists' });
    }

    // Create user account for the lab
    const defaultPassword = password || nanoid(12); // Generate password if not provided
    // Don't hash password here - User model's pre-save hook will handle it

    const user = new User({
      name,
      email: email.toLowerCase(),
      password: defaultPassword,
      phone: phone || '',
      role: 'lab',
      hospitalId: getHospitalId(req)
    });

    await user.save();

    // Ensure availability has proper structure
    const defaultAvailability = {
      monday: { available: false, startTime: '09:00', endTime: '17:00' },
      tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
      wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
      thursday: { available: false, startTime: '09:00', endTime: '17:00' },
      friday: { available: false, startTime: '09:00', endTime: '17:00' },
      saturday: { available: false, startTime: '09:00', endTime: '17:00' },
      sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    };

    const mergedAvailability = { ...defaultAvailability };
    if (availability && typeof availability === 'object') {
      Object.keys(availability).forEach(day => {
        if (defaultAvailability[day]) {
          mergedAvailability[day] = {
            available: availability[day].available !== undefined ? availability[day].available : false,
            startTime: availability[day].startTime || defaultAvailability[day].startTime,
            endTime: availability[day].endTime || defaultAvailability[day].endTime
          };
        }
      });
    }

    const lab = new Lab({
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      address: address || '',
      services: services || [],
      facilities: facilities || [],
      availability: mergedAvailability,
      description: description || '',
      hospitalId: getHospitalId(req)
    });

    await lab.save();
    res.status(201).json({
      success: true,
      message: 'Lab created successfully',
      lab,
      generatedPassword: !password ? defaultPassword : undefined // Return generated password if not provided
    });
  } catch (error) {
    console.error('Create lab error:', error);
    res.status(500).json({ success: false, message: 'Error creating lab', error: error.message });
  }
});

router.get('/labs', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const filter = getHospitalFilter(req);
    const labs = await Lab.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, labs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching labs', error: error.message });
  }
});

router.put('/labs/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const lab = await Lab.findById(req.params.id);
    if (!lab) {
      return res.status(404).json({ success: false, message: 'Lab not found' });
    }

    Object.assign(lab, req.body);
    await lab.save();
    res.json({ success: true, message: 'Lab updated successfully', lab });
  } catch (error) {
    console.error('Update lab error:', error);
    res.status(500).json({ success: false, message: 'Error updating lab', error: error.message });
  }
});

router.delete('/labs/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const lab = await Lab.findById(req.params.id);
    if (!lab) {
      return res.status(404).json({ success: false, message: 'Lab not found' });
    }

    // Delete associated user account
    if (lab.email) {
      await User.findOneAndDelete({ email: lab.email });
    }

    await Lab.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Lab deleted successfully' });
  } catch (error) {
    console.error('Delete lab error:', error);
    res.status(500).json({ success: false, message: 'Error deleting lab', error: error.message });
  }
});

// Pharmacy routes
router.post('/pharmacies', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, medications, availability, description, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if email already exists in User collection
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Check if pharmacy already exists
    const existingPharmacy = await Pharmacy.findOne({ email: email.toLowerCase() });
    if (existingPharmacy) {
      return res.status(400).json({ success: false, message: 'Pharmacy with this email already exists' });
    }

    // Create user account for the pharmacy
    const defaultPassword = password || nanoid(12); // Generate password if not provided
    // Don't hash password here - User model's pre-save hook will handle it

    const user = new User({
      name,
      email: email.toLowerCase(),
      password: defaultPassword,
      phone: phone || '',
      role: 'pharmacy',
      hospitalId: getHospitalId(req)
    });

    await user.save();

    // Ensure availability has proper structure
    const defaultAvailability = {
      monday: { available: false, startTime: '09:00', endTime: '17:00' },
      tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
      wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
      thursday: { available: false, startTime: '09:00', endTime: '17:00' },
      friday: { available: false, startTime: '09:00', endTime: '17:00' },
      saturday: { available: false, startTime: '09:00', endTime: '17:00' },
      sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    };

    const mergedAvailability = { ...defaultAvailability };
    if (availability && typeof availability === 'object') {
      Object.keys(availability).forEach(day => {
        if (defaultAvailability[day]) {
          mergedAvailability[day] = {
            available: availability[day].available !== undefined ? availability[day].available : false,
            startTime: availability[day].startTime || defaultAvailability[day].startTime,
            endTime: availability[day].endTime || defaultAvailability[day].endTime
          };
        }
      });
    }

    const pharmacy = new Pharmacy({
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      address: address || '',
      medications: medications || [],
      availability: mergedAvailability,
      description: description || '',
      hospitalId: getHospitalId(req)
    });

    await pharmacy.save();
    res.status(201).json({
      success: true,
      message: 'Pharmacy created successfully',
      pharmacy,
      generatedPassword: !password ? defaultPassword : undefined // Return generated password if not provided
    });
  } catch (error) {
    console.error('Create pharmacy error:', error);
    res.status(500).json({ success: false, message: 'Error creating pharmacy', error: error.message });
  }
});

router.get('/pharmacies', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const filter = getHospitalFilter(req);
    const pharmacies = await Pharmacy.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, pharmacies });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching pharmacies', error: error.message });
  }
});

router.put('/pharmacies/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findById(req.params.id);
    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found' });
    }

    Object.assign(pharmacy, req.body);
    await pharmacy.save();
    res.json({ success: true, message: 'Pharmacy updated successfully', pharmacy });
  } catch (error) {
    console.error('Update pharmacy error:', error);
    res.status(500).json({ success: false, message: 'Error updating pharmacy', error: error.message });
  }
});

router.delete('/pharmacies/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findById(req.params.id);
    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'Pharmacy not found' });
    }

    // Delete associated user account
    if (pharmacy.email) {
      await User.findOneAndDelete({ email: pharmacy.email });
    }

    await Pharmacy.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Pharmacy deleted successfully' });
  } catch (error) {
    console.error('Delete pharmacy error:', error);
    res.status(500).json({ success: false, message: 'Error deleting pharmacy', error: error.message });
  }
});

// Reception routes
router.post('/receptions', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, email, phone, services, availability, description, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if email already exists in User collection
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Check if reception already exists
    const existingReception = await Reception.findOne({ email: email.toLowerCase() });
    if (existingReception) {
      return res.status(400).json({ success: false, message: 'Reception with this email already exists' });
    }

    // Create user account for the reception
    const defaultPassword = password || nanoid(12); // Generate password if not provided
    // Don't hash password here - User model's pre-save hook will handle it

    const user = new User({
      name,
      email: email.toLowerCase(),
      password: defaultPassword,
      phone: phone || '',
      role: 'reception',
      hospitalId: getHospitalId(req)
    });

    await user.save();

    // Ensure availability has proper structure
    const defaultAvailability = {
      monday: { available: false, startTime: '09:00', endTime: '17:00' },
      tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
      wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
      thursday: { available: false, startTime: '09:00', endTime: '17:00' },
      friday: { available: false, startTime: '09:00', endTime: '17:00' },
      saturday: { available: false, startTime: '09:00', endTime: '17:00' },
      sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    };

    const mergedAvailability = { ...defaultAvailability };
    if (availability && typeof availability === 'object') {
      Object.keys(availability).forEach(day => {
        if (defaultAvailability[day]) {
          mergedAvailability[day] = {
            available: availability[day].available !== undefined ? availability[day].available : false,
            startTime: availability[day].startTime || defaultAvailability[day].startTime,
            endTime: availability[day].endTime || defaultAvailability[day].endTime
          };
        }
      });
    }

    const reception = new Reception({
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      services: services || [],
      availability: mergedAvailability,
      description: description || ''
    });

    await reception.save();
    res.status(201).json({
      success: true,
      message: 'Reception created successfully',
      reception,
      generatedPassword: !password ? defaultPassword : undefined // Return generated password if not provided
    });
  } catch (error) {
    console.error('Create reception error:', error);
    res.status(500).json({ success: false, message: 'Error creating reception', error: error.message });
  }
});

router.get('/receptions', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const filter = getHospitalFilter(req);
    const receptions = await Reception.find(filter).populate('userId', 'name email phone').sort({ createdAt: -1 });
    res.json({ success: true, receptions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching receptions', error: error.message });
  }
});

router.put('/receptions/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const reception = await Reception.findById(req.params.id);
    if (!reception) {
      return res.status(404).json({ success: false, message: 'Reception not found' });
    }

    Object.assign(reception, req.body);
    await reception.save();
    res.json({ success: true, message: 'Reception updated successfully', reception });
  } catch (error) {
    console.error('Update reception error:', error);
    res.status(500).json({ success: false, message: 'Error updating reception', error: error.message });
  }
});

router.delete('/receptions/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const reception = await Reception.findById(req.params.id);
    if (!reception) {
      return res.status(404).json({ success: false, message: 'Reception not found' });
    }

    // Delete associated user account
    if (reception.email) {
      await User.findOneAndDelete({ email: reception.email });
    }

    await Reception.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Reception deleted successfully' });
  } catch (error) {
    console.error('Delete reception error:', error);
    res.status(500).json({ success: false, message: 'Error deleting reception', error: error.message });
  }
});

// Services routes
router.post('/services', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, title, description, icon, color, price, duration, isActive } = req.body;

    if (!id || !title || !description) {
      return res.status(400).json({ success: false, message: 'ID, title, and description are required' });
    }

    const existingService = await Service.findOne({ id });
    if (existingService) {
      return res.status(400).json({ success: false, message: 'Service with this ID already exists' });
    }

    const service = new Service({
      id,
      title,
      description,
      icon: icon || '✨',
      color: color || '#14C38E',
      price: price || 0,
      duration: duration || '30min',
      isActive: isActive !== undefined ? isActive : true
    });

    await service.save();
    res.status(201).json({ success: true, message: 'Service created successfully', service });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ success: false, message: 'Error creating service', error: error.message });
  }
});

router.get('/services', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const services = await Service.find().sort({ title: 1 });
    res.json({ success: true, services });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ success: false, message: 'Error fetching services', error: error.message });
  }
});

router.put('/services/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const service = await Service.findOne({ id: req.params.id });
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    Object.assign(service, req.body);
    await service.save();
    res.json({ success: true, message: 'Service updated successfully', service });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ success: false, message: 'Error updating service', error: error.message });
  }
});

router.delete('/services/:id', verifyAdminOrSuperAdmin, async (req, res) => {
  try {
    const service = await Service.findOneAndDelete({ id: req.params.id });
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ success: false, message: 'Error deleting service', error: error.message });
  }
});

module.exports = router;
