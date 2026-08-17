const mongoose = require('mongoose');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const Hospital = require('../models/hospital.model');
const Appointment = require('../models/appointment.model');

exports.globalSearch = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters long' });
        }

        let roleStr = '';
        if (req.user._roleData && req.user._roleData.name) {
            roleStr = String(req.user._roleData.name).toLowerCase();
        } else if (req.user.role) {
            roleStr = String(req.user.role).toLowerCase();
        }
        const role = roleStr;
        
        const hospitalId = req.user.hospitalId;
        const userId = req.user.id || req.user._id;

        const permissions = req.user._roleData?.permissions || [];
        const hasPerm = (p) => permissions.includes('*') || permissions.includes(p);

        const isCentralRole = role === 'centraladmin' || role === 'superadmin';
        // Admin can manage everything in their hospital
        const isHospitalAdmin = role === 'hospitaladmin' || hasPerm('admin_manage_roles');
        // Doctors have diagnosis access
        const isDoctor = hasPerm('visit_diagnose');
        // Reception manages appointments/patients
        const isReception = hasPerm('appointment_manage') || hasPerm('patient_create') || hasPerm('appointment_view_all');
        // Pharmacy
        const isPharmacy = hasPerm('pharmacy_view') || hasPerm('pharmacy_manage');
        // Lab
        const isLab = hasPerm('lab_view') || hasPerm('lab_manage');
        // Finance
        const isFinance = hasPerm('finance_view') || hasPerm('billing_manage') || hasPerm('billing_view');

        const searchRegex = new RegExp(q, 'i');
        const results = [];

        // Base hospital filter
        const hospitalFilter = isCentralRole ? {} : { hospitalId: hospitalId };

        // 1. Search Hospitals (Only for Central Admin)
        if (isCentralRole) {
            const hospitals = await Hospital.find({ name: searchRegex }).limit(5).select('_id name email phone plan');
            hospitals.forEach(h => results.push({
                type: 'Hospital',
                id: h._id,
                title: h.name,
                subtitle: h.email || h.phone || 'Hospital',
                route: `/supremeadmin?hospitalId=${h._id}&plan=${h.plan || 'enterprise'}`
            }));
        }

        // 2. Search Patients
        // Anyone with basically any operational role can search patients
        const canSearchPatients = isCentralRole || isHospitalAdmin || isDoctor || isReception || isPharmacy || isLab || isFinance || role === 'patient';
        
        if (canSearchPatients) {
            let patientFilter = { ...hospitalFilter, role: 'patient' };
            // If the user IS a patient, they can only search themselves (if we want to allow that at all)
            if (role === 'patient') {
                patientFilter = { _id: userId, role: 'patient' };
            }
            const patientSearchQuery = {
                ...patientFilter,
                $or: [
                    { name: searchRegex },
                    { email: searchRegex },
                    { phone: searchRegex },
                    { uhid: searchRegex },
                    { patientId: searchRegex }
                ]
            };

            const patients = await User.find(patientSearchQuery).limit(10).select('_id name uhid patientId phone email');
            patients.forEach(p => {
                const mrn = p.uhid || p.patientId || p.phone;
                let route = `/admin/users`;
                if (isDoctor) route = `/patient/${p._id}`;
                else if (isReception) route = `/patient/${p._id}`;
                else if (isHospitalAdmin) route = `/patient/${p._id}`;
                
                results.push({
                    type: 'Patient',
                    id: p._id,
                    title: p.name,
                    subtitle: mrn ? `MRN/Phone: ${mrn}` : 'Patient',
                    route: route
                });
            });
        }

        // 3. Search Doctors
        // Reception, Admins, and Central Admins need to search doctors
        const canSearchDoctors = isCentralRole || isHospitalAdmin || isReception;
        if (canSearchDoctors) {
            const doctorSearchQuery = {
                ...hospitalFilter,
                $or: [
                    { name: searchRegex },
                    { email: searchRegex },
                    { phone: searchRegex },
                    { specialty: searchRegex }
                ]
            };
            const doctors = await Doctor.find(doctorSearchQuery).limit(5).select('_id name specialty email');
            doctors.forEach(d => results.push({
                type: 'Doctor',
                id: d._id,
                title: d.name,
                subtitle: d.specialty || 'Doctor',
                route: isCentralRole ? '/admin/doctors' : '/admin/doctors'
            }));
        }

        // 4. Search Staff (Admins, Reception, Lab, etc.)
        // Only Admins and Central Admins can search general staff
        if (isCentralRole || isHospitalAdmin) {
            const staffSearchQuery = {
                ...hospitalFilter,
                role: { $nin: ['patient', 'doctor', 'clinic doctor'] },
                $or: [
                    { name: searchRegex },
                    { email: searchRegex },
                    { phone: searchRegex }
                ]
            };

            const staff = await User.find(staffSearchQuery).limit(5).select('_id name role email phone');
            staff.forEach(s => results.push({
                type: 'Staff',
                id: s._id,
                title: s.name,
                subtitle: `Role: ${s.role}`,
                route: '/admin/users'
            }));
        }

        // 5. Search Appointments
        const canSearchAppointments = isCentralRole || isHospitalAdmin || isReception || isDoctor;
        if (canSearchAppointments) {
            const appointmentSearchQuery = {
                ...hospitalFilter,
                $or: [
                    { appointmentId: searchRegex },
                    { 'patientName': searchRegex },
                    { 'status': searchRegex },
                    { 'paymentStatus': searchRegex }
                ]
            };
            
            // Doctors ONLY see their own appointments, unless they also have appointment_view_all or hospitaladmin
            if (isDoctor && !isHospitalAdmin && !hasPerm('appointment_view_all')) {
                const docRec = await Doctor.findOne({ userId: userId }).select('_id');
                if (docRec) {
                    appointmentSearchQuery.doctorId = docRec._id;
                } else {
                    // Fallback to ensuring they find nothing if doctor record is missing
                    appointmentSearchQuery.doctorId = new mongoose.Types.ObjectId();
                }
            }

            const appointments = await Appointment.find(appointmentSearchQuery)
                .populate('patientId', 'name uhid')
                .populate('doctorId', 'name')
                .limit(5)
                .select('_id appointmentId appointmentDate status patientId doctorId');

            appointments.forEach(a => {
                const pName = a.patientId?.name || 'Unknown Patient';
                const dName = a.doctorId?.name ? `with Dr. ${a.doctorId.name}` : '';
                
                let route = '/appointment';
                if (isReception) route = '/reception/dashboard';
                else if (isDoctor) route = '/doctor/dashboard';

                results.push({
                    type: 'Appointment',
                    id: a._id,
                    title: `Apt: ${a.appointmentId || a._id.toString().substring(0,8)}`,
                    subtitle: `${pName} ${dName} - ${a.status}`,
                    route: route
                });
            });
        }

        res.status(200).json({
            success: true,
            count: results.length,
            data: results
        });

    } catch (error) {
        console.error('Global search error:', error);
        res.status(500).json({ success: false, message: 'Server error during search' });
    }
};
