const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { resolveTenant } = require('../middleware/tenantMiddleware');
const MasterAdmission = require('../models/admission.model');
const BedMaster = require('../models/bed.model');
const { getTenantModels } = require('../db/tenantModels');

// Admission access: reception, accountant, admin
const verifyAdmissionAccess = async (req, res, next) => {
    try {
        await verifyToken(req, res, async () => {
            const roleName = (req.user._roleData?.name || String(req.user.role || '')).toLowerCase().replace(/\s+/g, '');
            const perms = req.user._roleData?.permissions || [];
            const allowed = ['reception', 'receptionist', 'accountant', 'cashier', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin', 'otmanager', 'otstaff'];

            if (allowed.includes(roleName) ||
                perms.includes('billing_manage') ||
                perms.includes('admission_manage') ||
                perms.includes('appointment_manage') ||
                perms.includes('*')) {
                await resolveTenant(req, res, next);
            } else {
                return res.status(403).json({ success: false, message: 'Admission access required' });
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
};

const getAdmission = (req) => {
    if (req.tenantDb) return getTenantModels(req.tenantDb).Admission;
    return MasterAdmission;
};

// Helper: combine date and time string into a Date object
const combineDateTime = (dateVal, timeStr) => {
    if (!dateVal) return new Date();
    const d = new Date(dateVal);
    if (!timeStr) return d;

    const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const meridiem = match[3];
        if (meridiem) {
            if (meridiem.toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (meridiem.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        d.setHours(hours, minutes, 0, 0);
    }
    return d;
};

// Helper: calculate exact stay (hours and days) and billing amount between two timestamps
const calculateStayAndAmount = (startDateTime, endDateTime, dailyRate) => {
    const start = new Date(startDateTime).getTime();
    const end = new Date(endDateTime).getTime();
    const diffMs = Math.max(0, end - start);
    
    // Total hours as a decimal
    const totalHoursRaw = diffMs / (1000 * 60 * 60);
    // Rounded to 1 decimal place, minimum 0.5 hr
    const totalHours = Math.max(0.5, Math.round(totalHoursRaw * 10) / 10);
    
    const ratePerDay = Number(dailyRate) || 0;
    const hourlyRate = Math.round((ratePerDay / 24) * 100) / 100;
    
    const fullDays = Math.floor(totalHours / 24);
    const remainingHours = Math.round((totalHours % 24) * 10) / 10;
    
    let durationText = '';
    let amount = 0;

    if (totalHours < 24) {
        // Under 24 hours: billed by exact hours
        const billedHrs = Math.max(1, Math.round(totalHours));
        durationText = `${billedHrs} Hour${billedHrs > 1 ? 's' : ''}`;
        amount = Math.round(billedHrs * (ratePerDay / 24));
    } else {
        // 24 hours or more: billed by full days + remaining hours
        if (remainingHours >= 0.5) {
            const remHrsRound = Math.round(remainingHours);
            durationText = `${fullDays} Day${fullDays > 1 ? 's' : ''} ${remHrsRound} Hr${remHrsRound > 1 ? 's' : ''}`;
            amount = Math.round((fullDays * ratePerDay) + (remHrsRound * (ratePerDay / 24)));
        } else {
            durationText = `${fullDays} Day${fullDays > 1 ? 's' : ''}`;
            amount = Math.round(fullDays * ratePerDay);
        }
    }
    
    return {
        totalHours: Math.max(1, Math.round(totalHours)),
        fullDays,
        remainingHours,
        durationText,
        ratePerDay,
        hourlyRate,
        amount
    };
};

// Helper: calculate days between two dates (minimum 1 day)
const calculateDays = (startDateTime, endDateTime) => {
    const start = new Date(startDateTime).getTime();
    const end = new Date(endDateTime).getTime();
    const diffMs = Math.max(0, end - start);
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
};

// Helper: get daily rate for a ward from hospital facilities with smart defaults
const getWardRate = async (hospitalId, wardName, bedType) => {
    try {
        const Hospital = require('../models/hospital.model');
        const hospital = await Hospital.findById(hospitalId).lean();
        const wardLower = (wardName || '').toLowerCase().trim();
        const typeLower = (bedType || '').toLowerCase().trim();

        if (hospital && hospital.facilities && hospital.facilities.length > 0) {
            const facility = hospital.facilities.find(f => {
                const fLower = (f.name || '').toLowerCase().trim();
                return fLower === wardLower ||
                       fLower === typeLower ||
                       wardLower.includes(fLower) ||
                       fLower.includes(wardLower) ||
                       (typeLower && fLower.includes(typeLower));
            });

            if (facility && Number(facility.pricePerDay) > 0) {
                return Number(facility.pricePerDay);
            }
        }

        // Standard clinical defaults if facility price not configured
        if (wardLower.includes('icu') || typeLower.includes('icu')) return 20000;
        if (wardLower.includes('private')) return 8000;
        if (wardLower.includes('semi')) return 6000;
        return 5000; // General Ward default
    } catch (err) {
        console.error('getWardRate error:', err);
        return 5000;
    }
};

// POST /api/admissions — Admit a patient (single ward & bed assignment)
router.post('/', verifyAdmissionAccess, async (req, res) => {
    try {
        const { patientId, appointmentId, ward, bedNumber, bedId, admissionDate, admissionTime, notes, doctorId } = req.body;
        if (!patientId) return res.status(400).json({ success: false, message: 'patientId is required' });
        if (!bedId) return res.status(400).json({ success: false, message: 'bedId is required' });

        const hospitalId = req.hospitalId || req.user.hospitalId;
        const Bed = req.tenantDb ? getTenantModels(req.tenantDb).Bed || BedMaster : BedMaster;

        // Optional doctor validation (preserves backward compatibility)
        let validatedDoctorId = undefined;
        if (doctorId) {
            const mongoose = require('mongoose');
            if (!mongoose.Types.ObjectId.isValid(doctorId)) {
                return res.status(400).json({ success: false, message: 'Invalid doctorId format' });
            }
            const MasterUser = require('../models/user.model');
            const doctorUser = await MasterUser.findOne({
                _id: doctorId,
                $or: [{ hospitalId }, { hospitalId: null }]
            });
            if (!doctorUser) {
                return res.status(400).json({ success: false, message: 'Doctor not found in this hospital' });
            }
            if (doctorUser.hospitalId && String(doctorUser.hospitalId) !== String(hospitalId)) {
                return res.status(400).json({ success: false, message: 'Doctor belongs to a different hospital' });
            }
            validatedDoctorId = doctorUser._id;
        }

        // Check active admission for this patient
        const Admission = getAdmission(req);
        const existingActive = await Admission.findOne({
            hospitalId,
            patientId,
            status: 'Admitted'
        });
        if (existingActive) {
            return res.status(400).json({
                success: false,
                message: `Patient is already admitted in ${existingActive.ward} (Bed ${existingActive.bedNumber}). Please transfer or discharge first.`
            });
        }

        // Fetch selected bed
        const bedQuery = req.tenantDb ? { _id: bedId } : { _id: bedId, hospitalId };
        const bed = await Bed.findOne(bedQuery) || await BedMaster.findOne({ _id: bedId });
        if (!bed) return res.status(404).json({ success: false, message: 'Selected bed not found in this hospital' });
        if (ward && bed.ward.toLowerCase() !== String(ward).toLowerCase()) {
            return res.status(400).json({ success: false, message: `Selected bed belongs to '${bed.ward}', not '${ward}'` });
        }
        if (bed.status !== 'AVAILABLE') {
            return res.status(400).json({ success: false, message: 'Selected bed is already occupied or under maintenance' });
        }

        const wardRate = await getWardRate(hospitalId, bed.ward, bed.bedType);
        const hourlyRate = Math.round((wardRate / 24) * 100) / 100;
        const admDate = admissionDate ? new Date(admissionDate) : new Date();
        const admTime = admissionTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

        const admission = new Admission({
            hospitalId,
            patientId,
            appointmentId: appointmentId || undefined,
            doctorId: validatedDoctorId,
            admittedBy: req.user._id || req.user.userId,
            admissionDate: admDate,
            admissionTime: admTime,
            ward: bed.ward,
            bedNumber: bed.bedNumber,
            bedId: bed._id,
            wardRatePerDay: wardRate,
            wardHourlyRate: hourlyRate,
            transferHistory: [],
            selectedFacilities: [{
                facilityName: bed.ward,
                pricePerDay: wardRate,
                hourlyRate: hourlyRate,
                days: 1,
                hours: 24,
                durationText: 'Active Admission',
                totalAmount: wardRate
            }],
            totalAmount: wardRate,
            status: 'Admitted',
            notes: notes || '',
        });

        await admission.save();

        // Atomic lock on the bed
        const usedBedModel = (req.tenantDb && await Bed.exists({ _id: bed._id })) ? Bed : BedMaster;
        const lockedBed = await usedBedModel.findOneAndUpdate(
            { _id: bed._id, status: 'AVAILABLE' },
            { status: 'OCCUPIED', currentPatient: patientId, currentAdmission: admission._id },
            { new: true }
        );

        if (!lockedBed) {
            await Admission.findByIdAndDelete(admission._id);
            return res.status(409).json({ success: false, message: 'Bed was just occupied by another patient. Please choose another bed.' });
        }

        // Real-time notification via Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('admission_created', {
                admissionId: admission._id,
                patientId,
                ward: bed.ward,
                bedNumber: bed.bedNumber,
                doctorId: validatedDoctorId,
                timestamp: new Date()
            });
            io.to(`hospital_${hospitalId}`).emit('bed_status_changed', {
                bedId: bed._id,
                status: 'OCCUPIED',
                ward: bed.ward,
                bedNumber: bed.bedNumber,
                patientId,
                timestamp: new Date()
            });
        }

        res.status(201).json({ success: true, message: 'Patient admitted successfully', admission });
    } catch (err) {
        console.error('Admit patient error:', err);
        res.status(500).json({ success: false, message: err.message || 'An internal error occurred' });
    }
});

// GET /api/admissions/active — All currently admitted patients
router.get('/active', verifyAdmissionAccess, async (req, res) => {
    try {
        const Admission = getAdmission(req);
        let queryFilter = {
            hospitalId: req.hospitalId || req.user.hospitalId,
        };

        if (req.query.department) {
            const Appointment = require('../models/appointment.model');
            const deptRegex = new RegExp(`^${req.query.department}$`, 'i');
            const validAppts = await Appointment.find({
                hospitalId: queryFilter.hospitalId,
                $or: [
                    { department: { $regex: deptRegex } },
                    { serviceName: { $regex: deptRegex } }
                ]
            }).select('_id').lean();
            const validApptIds = validAppts.map(a => a._id);
            queryFilter.appointmentId = { $in: validApptIds };
        }

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            const MasterUser = require('../models/user.model');
            const Appointment = require('../models/appointment.model');

            const matchingUsers = await MasterUser.find({
                $or: [
                    { name: searchRegex },
                    { phone: searchRegex },
                    { patientId: searchRegex },
                    { patientUid: searchRegex }
                ]
            }).select('_id').lean();
            const validPatientIds = matchingUsers.map(u => u._id);

            const matchingAppointments = await Appointment.find({
                hospitalId: queryFilter.hospitalId,
                $or: [
                    { doctorName: searchRegex },
                    { patientId: searchRegex }
                ]
            }).select('_id').lean();
            const validApptIdsFromSearch = matchingAppointments.map(a => a._id);

            if (validPatientIds.length > 0 || validApptIdsFromSearch.length > 0) {
                const searchConditions = [];
                if (validPatientIds.length > 0) searchConditions.push({ patientId: { $in: validPatientIds } });
                if (validApptIdsFromSearch.length > 0) searchConditions.push({ appointmentId: { $in: validApptIdsFromSearch } });

                if (!queryFilter.$and) queryFilter.$and = [];
                queryFilter.$and.push({ $or: searchConditions });
            } else {
                return res.json({ success: true, admissions: [] });
            }
        }

        const User = require('../models/user.model');
        const Appointment = require('../models/appointment.model');
        let admissions = await Admission.find(queryFilter).sort({ admissionDate: -1, createdAt: -1 }).lean();

        for (let adm of admissions) {
            try {
                if (adm.patientId) {
                    adm.patientId = await User.findById(adm.patientId).select('name phone patientId mrn gender dob').lean() || adm.patientId;
                }
            } catch (err) {}
            try {
                if (adm.appointmentId) {
                    adm.appointmentId = await Appointment.findById(adm.appointmentId).select('doctorName department serviceName').lean() || adm.appointmentId;
                }
            } catch (err) {}
            try {
                if (adm.doctorId) {
                    adm.doctorId = await User.findById(adm.doctorId).select('name phone email specialization department').lean() || adm.doctorId;
                }
            } catch (err) {}
            if (!adm.wardRatePerDay || adm.wardRatePerDay === 0) {
                adm.wardRatePerDay = await getWardRate(adm.hospitalId, adm.ward);
                adm.wardHourlyRate = Math.round((adm.wardRatePerDay / 24) * 100) / 100;
            }
        }

        res.json({ success: true, admissions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// GET /api/admissions/patient/:patientId — Admission history for a patient
router.get('/patient/:patientId', verifyAdmissionAccess, async (req, res) => {
    try {
        const Admission = getAdmission(req);
        const admissions = await Admission.find({
            patientId: req.params.patientId,
            hospitalId: req.hospitalId || req.user.hospitalId,
        }).sort({ admissionDate: -1, createdAt: -1 }).lean();

        for (let adm of admissions) {
            try {
                if (adm.doctorId) {
                    const MasterUser = require('../models/user.model');
                    adm.doctorId = await MasterUser.findById(adm.doctorId).select('name phone email specialization department').lean() || adm.doctorId;
                }
            } catch (err) {}
            if (!adm.wardRatePerDay || adm.wardRatePerDay === 0) {
                adm.wardRatePerDay = await getWardRate(adm.hospitalId, adm.ward);
                adm.wardHourlyRate = Math.round((adm.wardRatePerDay / 24) * 100) / 100;
            }
        }

        res.json({ success: true, admissions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// PUT /api/admissions/:id/transfer — Transfer patient to a new bed/ward
router.put('/:id/transfer', verifyAdmissionAccess, async (req, res) => {
    try {
        const { bedId, newBedId, newWard, transferDate, transferTime, notes } = req.body;
        const targetBedId = newBedId || bedId;
        if (!targetBedId) return res.status(400).json({ success: false, message: 'newBedId is required' });

        const hospitalId = req.hospitalId || req.user.hospitalId;
        const Admission = getAdmission(req);
        const admission = await Admission.findOne({ _id: req.params.id, hospitalId });
        if (!admission) return res.status(404).json({ success: false, message: 'Admission not found' });
        if (admission.status === 'Discharged') return res.status(400).json({ success: false, message: 'Cannot transfer a discharged patient' });

        if (String(admission.bedId) === String(targetBedId)) {
            return res.status(400).json({ success: false, message: 'Patient is already assigned to this bed' });
        }

        const Bed = req.tenantDb ? getTenantModels(req.tenantDb).Bed || BedMaster : BedMaster;
        const targetBedQuery = req.tenantDb ? { _id: targetBedId } : { _id: targetBedId, hospitalId };
        const targetBed = await Bed.findOne(targetBedQuery) || await BedMaster.findOne({ _id: targetBedId });
        if (!targetBed) return res.status(404).json({ success: false, message: 'New bed not found in this hospital' });
        if (newWard && targetBed.ward.toLowerCase() !== String(newWard).toLowerCase()) {
            return res.status(400).json({ success: false, message: `Selected bed belongs to '${targetBed.ward}', not '${newWard}'` });
        }
        if (targetBed.status !== 'AVAILABLE') {
            return res.status(400).json({ success: false, message: 'New bed is already occupied or under maintenance' });
        }

        const transDate = transferDate ? new Date(transferDate) : new Date();
        const transTime = transferTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const transDateTime = combineDateTime(transDate, transTime);

        // Get start of the current segment
        const prevTransfer = admission.transferHistory && admission.transferHistory.length > 0
            ? admission.transferHistory[admission.transferHistory.length - 1]
            : null;

        const prevStartDateTime = prevTransfer
            ? combineDateTime(prevTransfer.transferDate, prevTransfer.transferTime)
            : combineDateTime(admission.admissionDate, admission.admissionTime);

        if (transDateTime < prevStartDateTime) {
            return res.status(400).json({ success: false, message: 'Transfer date & time cannot be earlier than admission / previous transfer date & time' });
        }

        let currentWardRate = Number(admission.wardRatePerDay) || 0;
        if (currentWardRate === 0) {
            currentWardRate = await getWardRate(hospitalId, admission.ward);
            admission.wardRatePerDay = currentWardRate;
            admission.wardHourlyRate = Math.round((currentWardRate / 24) * 100) / 100;
        }

        const segmentCalc = calculateStayAndAmount(prevStartDateTime, transDateTime, currentWardRate);
        const newWardRate = await getWardRate(hospitalId, targetBed.ward, targetBed.bedType);
        const newHourlyRate = Math.round((newWardRate / 24) * 100) / 100;

        // Atomic lock on new bed
        const usedNewBedModel = (req.tenantDb && await Bed.exists({ _id: targetBed._id })) ? Bed : BedMaster;
        const lockedNewBed = await usedNewBedModel.findOneAndUpdate(
            { _id: targetBed._id, status: 'AVAILABLE' },
            { status: 'OCCUPIED', currentPatient: admission.patientId, currentAdmission: admission._id },
            { new: true }
        );

        if (!lockedNewBed) {
            return res.status(409).json({ success: false, message: 'New bed was just booked by another patient. Please choose another bed.' });
        }

        // Free old bed
        if (admission.bedId) {
            const usedOldBedModel = (req.tenantDb && await Bed.exists({ _id: admission.bedId })) ? Bed : BedMaster;
            await usedOldBedModel.findByIdAndUpdate(admission.bedId, {
                status: 'AVAILABLE',
                currentPatient: null,
                currentAdmission: null
            });
        }

        // Record transfer in history with exact duration and amounts
        admission.transferHistory = admission.transferHistory || [];
        admission.transferHistory.push({
            fromWard: admission.ward,
            fromBedNumber: admission.bedNumber,
            fromBedId: admission.bedId,
            toWard: targetBed.ward,
            toBedNumber: targetBed.bedNumber,
            toBedId: targetBed._id,
            transferDate: transDate,
            transferTime: transTime,
            ratePerDay: currentWardRate,
            hourlyRate: segmentCalc.hourlyRate,
            durationHours: segmentCalc.totalHours,
            durationDays: segmentCalc.fullDays,
            durationText: segmentCalc.durationText,
            segmentAmount: segmentCalc.amount,
            transferredBy: req.user._id || req.user.userId,
            notes: notes || ''
        });

        admission.ward = targetBed.ward;
        admission.bedNumber = targetBed.bedNumber;
        admission.bedId = targetBed._id;
        admission.wardRatePerDay = newWardRate;
        admission.wardHourlyRate = newHourlyRate;

        // Recompute non-overlapping facilities breakdown
        const facilities = [];
        let total = 0;

        admission.transferHistory.forEach((th) => {
            facilities.push({
                facilityName: th.fromWard,
                pricePerDay: th.ratePerDay,
                hourlyRate: th.hourlyRate,
                days: th.durationDays,
                hours: th.durationHours,
                durationText: th.durationText,
                totalAmount: th.segmentAmount
            });
            total += th.segmentAmount;
        });

        // Add active new ward entry
        facilities.push({
            facilityName: `${targetBed.ward} (Active)`,
            pricePerDay: newWardRate,
            hourlyRate: newHourlyRate,
            days: 1,
            hours: 24,
            durationText: 'Active in ' + targetBed.ward,
            totalAmount: newWardRate
        });
        total += newWardRate;

        admission.selectedFacilities = facilities;
        admission.totalAmount = total;

        await admission.save();

        // Real-time transfer notification
        const io = req.app.get('io');
        if (io) {
            const lastTh = admission.transferHistory[admission.transferHistory.length - 1];
            io.to(`hospital_${hospitalId}`).emit('bed_transferred', {
                admissionId: admission._id,
                patientId: admission.patientId,
                fromWard: lastTh?.fromWard,
                toWard: targetBed.ward,
                toBedNumber: targetBed.bedNumber,
                timestamp: new Date()
            });
            io.to(`hospital_${hospitalId}`).emit('bed_status_changed', {
                oldBedId: lastTh?.fromBedId,
                newBedId: targetBed._id,
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Patient transferred successfully', admission });
    } catch (err) {
        console.error('Transfer patient error:', err);
        res.status(500).json({ success: false, message: err.message || 'An internal error occurred during transfer' });
    }
});

// PUT /api/admissions/:id/discharge — Discharge a patient (accurate non-overlapping billing)
router.put('/:id/discharge', verifyAdmissionAccess, async (req, res) => {
    try {
        const { dischargeDate, dischargeTime, notes } = req.body;
        const hospitalId = req.hospitalId || req.user.hospitalId;
        const Admission = getAdmission(req);
        const admission = await Admission.findOne({ _id: req.params.id, hospitalId });
        if (!admission) return res.status(404).json({ success: false, message: 'Admission not found' });
        if (admission.status === 'Discharged') return res.status(400).json({ success: false, message: 'Patient is already discharged' });

        const dDate = dischargeDate ? new Date(dischargeDate) : new Date();
        const dTime = dischargeTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const dDateTime = combineDateTime(dDate, dTime);

        // Check start of final segment
        const prevTransfer = admission.transferHistory && admission.transferHistory.length > 0
            ? admission.transferHistory[admission.transferHistory.length - 1]
            : null;

        const finalStartDateTime = prevTransfer
            ? combineDateTime(prevTransfer.transferDate, prevTransfer.transferTime)
            : combineDateTime(admission.admissionDate, admission.admissionTime);

        if (dDateTime < finalStartDateTime) {
            return res.status(400).json({ success: false, message: 'Discharge date & time cannot be earlier than admission / transfer date & time' });
        }

        let currentWardRate = Number(admission.wardRatePerDay) || 0;
        if (currentWardRate === 0) {
            currentWardRate = await getWardRate(hospitalId, admission.ward);
            admission.wardRatePerDay = currentWardRate;
            admission.wardHourlyRate = Math.round((currentWardRate / 24) * 100) / 100;
        }

        const finalSegmentCalc = calculateStayAndAmount(finalStartDateTime, dDateTime, currentWardRate);

        // Finalize non-overlapping facilities breakdown without duplicates
        const finalizedFacilities = [];
        let totalBill = 0;

        (admission.transferHistory || []).forEach((th) => {
            finalizedFacilities.push({
                facilityName: th.fromWard,
                pricePerDay: th.ratePerDay,
                hourlyRate: th.hourlyRate,
                days: th.durationDays,
                hours: th.durationHours,
                durationText: th.durationText,
                totalAmount: th.segmentAmount
            });
            totalBill += th.segmentAmount;
        });

        finalizedFacilities.push({
            facilityName: admission.ward,
            pricePerDay: currentWardRate,
            hourlyRate: finalSegmentCalc.hourlyRate,
            days: finalSegmentCalc.fullDays,
            hours: finalSegmentCalc.totalHours,
            durationText: finalSegmentCalc.durationText,
            totalAmount: finalSegmentCalc.amount
        });
        totalBill += finalSegmentCalc.amount;

        admission.dischargeDate = dDate;
        admission.dischargeTime = dTime;
        admission.status = 'Discharged';
        admission.selectedFacilities = finalizedFacilities;
        admission.totalAmount = totalBill;
        if (notes) admission.notes = (admission.notes ? admission.notes + '\n' : '') + notes;

        await admission.save();

        // Unlock current bed
        if (admission.bedId) {
            const Bed = req.tenantDb ? getTenantModels(req.tenantDb).Bed || BedMaster : BedMaster;
            const usedBedModel = (req.tenantDb && await Bed.exists({ _id: admission.bedId })) ? Bed : BedMaster;
            await usedBedModel.findByIdAndUpdate(admission.bedId, {
                status: 'AVAILABLE',
                currentPatient: null,
                currentAdmission: null
            });
        }

        // Real-time discharge notification
        const io = req.app.get('io');
        if (io) {
            io.to(`hospital_${hospitalId}`).emit('patient_discharged', {
                admissionId: admission._id,
                patientId: admission.patientId,
                bedId: admission.bedId,
                timestamp: new Date()
            });
            io.to(`hospital_${hospitalId}`).emit('bed_status_changed', {
                bedId: admission.bedId,
                status: 'AVAILABLE',
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Patient discharged successfully', admission });
    } catch (err) {
        console.error('Discharge patient error:', err);
        res.status(500).json({ success: false, message: err.message || 'An internal error occurred' });
    }
});

// PUT /api/admissions/:id/pay — Mark admission as paid
router.put('/:id/pay', verifyAdmissionAccess, async (req, res) => {
    try {
        const Admission = getAdmission(req);
        const admission = await Admission.findByIdAndUpdate(
            req.params.id,
            { paymentStatus: 'Paid' },
            { new: true }
        );
        if (!admission) return res.status(404).json({ success: false, message: 'Admission not found' });
        res.json({ success: true, message: 'Admission marked as paid', admission });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

module.exports = router;
