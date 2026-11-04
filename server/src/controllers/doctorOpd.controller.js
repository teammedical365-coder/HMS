/**
 * doctorOpd.controller.js
 * 
 * HTTP request controller for Free Doctor OPD Plan (Phase 3).
 * Validates request parameters, ensures tenant and role authorization,
 * formats responses, and delegates business logic to doctorOpd.service.js.
 */

const mongoose = require('mongoose');
const doctorOpdService = require('../services/doctorOpd.service');
const Appointment = require('../models/appointment.model');

// Helper to extract hospitalId and doctor from req.user
async function getContext(req) {
    const hospitalId = req.user?.hospitalId;
    if (!hospitalId) {
        const err = new Error('Hospital tenant context required');
        err.statusCode = 400;
        throw err;
    }
    const docCtx = await doctorOpdService.resolveDoctorContext(req.user, req.query?.doctorId || req.body?.doctorId);
    return { ...docCtx, hospitalId };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. PATIENT MONITORING
// ────────────────────────────────────────────────────────────────────────────

exports.registerPatient = async (req, res) => {
    try {
        const hospitalId = req.user?.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const result = await doctorOpdService.registerPatient({
            hospitalId,
            ...req.body
        });

        res.status(result.existing ? 200 : 201).json({ success: true, ...result });
    } catch (error) {
        console.error('[doctorOpd] registerPatient error:', error);
        res.status(400).json({ success: false, message: error.message || 'Error registering patient' });
    }
};

exports.searchPatients = async (req, res) => {
    try {
        const hospitalId = req.user?.hospitalId;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const query = req.query.q || req.query.query || req.query.search || '';
        const page = req.query.page || 1;
        const limit = req.query.limit || 20;

        const result = await doctorOpdService.searchPatients({ hospitalId, query, page, limit });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[doctorOpd] searchPatients error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error searching patients' });
    }
};

exports.getPatientOverview = async (req, res) => {
    try {
        const hospitalId = req.user?.hospitalId;
        const { patientId } = req.params;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });
        if (!patientId) return res.status(400).json({ success: false, message: 'Patient ID required' });

        const overview = await doctorOpdService.getPatientOverview({ hospitalId, patientId });
        if (!overview) {
            return res.status(404).json({ success: false, message: 'Patient not found or unauthorized' });
        }
        res.json({ success: true, ...overview });
    } catch (error) {
        console.error('[doctorOpd] getPatientOverview error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error fetching patient overview' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// 2. DOCTOR PATIENT TRAY
// ────────────────────────────────────────────────────────────────────────────

exports.getTodayTray = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const dateStr = req.query.date;

        const tray = await doctorOpdService.getDoctorTray({ hospitalId, doctorId, doctorUserId, dateStr });
        res.json({ success: true, ...tray });
    } catch (error) {
        console.error('[doctorOpd] getTodayTray error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error fetching patient tray' });
    }
};

exports.startConsultation = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const appointmentId = req.params.appointmentId || req.params.id;

        const appointment = await doctorOpdService.startConsultation({
            hospitalId,
            doctorId,
            doctorUserId,
            appointmentId
        });
        res.json({ success: true, message: 'Consultation started', appointment });
    } catch (error) {
        console.error('[doctorOpd] startConsultation error:', error);
        res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Error starting consultation' });
    }
};

exports.completeConsultation = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const appointmentId = req.params.appointmentId || req.params.id;

        const appointment = await doctorOpdService.completeConsultation({
            hospitalId,
            doctorId,
            doctorUserId,
            appointmentId,
            payload: req.body
        });
        res.json({ success: true, message: 'Consultation completed', appointment });
    } catch (error) {
        console.error('[doctorOpd] completeConsultation error:', error);
        res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Error completing consultation' });
    }
};

exports.updateConsultationStatus = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const appointmentId = req.params.appointmentId || req.params.id;
        const { status } = req.body;

        const validStatuses = ['pending', 'confirmed', 'in-consultation', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        let appointment;
        if (status === 'cancelled') {
            appointment = await doctorOpdService.cancelAppointment({
                hospitalId,
                doctorId,
                appointmentId,
                reason: req.body.reason || 'Status update'
            });
        } else if (status === 'in-consultation') {
            appointment = await doctorOpdService.startConsultation({
                hospitalId,
                doctorId,
                doctorUserId,
                appointmentId
            });
        } else if (status === 'completed') {
            appointment = await doctorOpdService.completeConsultation({
                hospitalId,
                doctorId,
                doctorUserId,
                appointmentId,
                payload: req.body
            });
        } else {
            appointment = await Appointment.findOne({ _id: appointmentId, hospitalId });
            if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
            appointment.status = status;
            await appointment.save();
        }

        res.json({ success: true, message: `Appointment status updated to ${status}`, appointment });
    } catch (error) {
        console.error('[doctorOpd] updateConsultationStatus error:', error);
        res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Error updating status' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// 3. APPOINTMENT MANAGEMENT
// ────────────────────────────────────────────────────────────────────────────

exports.createDoctorAppointment = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId, doctorName } = await getContext(req);
        const {
            patientId,
            appointmentDate,
            appointmentTime,
            amount,
            paymentMethod,
            notes,
            followUpDate,
            visitType,
            diagnosis,
            pharmacy
        } = req.body;

        if (!appointmentDate) {
            return res.status(400).json({ success: false, message: 'Appointment date is required' });
        }

        const appointment = await doctorOpdService.createAppointment({
            hospitalId,
            doctorId,
            doctorUserId,
            doctorName,
            patientId,
            appointmentDate,
            appointmentTime,
            amount,
            paymentMethod,
            notes,
            followUpDate,
            visitType,
            diagnosis,
            pharmacy
        });

        res.status(201).json({ success: true, message: 'Appointment created successfully', appointment });
    } catch (error) {
        console.error('[doctorOpd] createDoctorAppointment error:', error);
        const status = error.statusCode || (error.isQuotaError ? 403 : 500);
        res.status(status).json({ success: false, message: error.message || 'Error creating appointment' });
    }
};

exports.rescheduleDoctorAppointment = async (req, res) => {
    try {
        const { hospitalId, doctorId } = await getContext(req);
        const appointmentId = req.params.appointmentId || req.params.id;
        const newDate = req.body.date || req.body.newDate || req.body.appointmentDate;
        const newTime = req.body.time || req.body.newTime || req.body.appointmentTime;

        if (!newDate) {
            return res.status(400).json({ success: false, message: 'New date is required' });
        }

        const appointment = await doctorOpdService.rescheduleAppointment({
            hospitalId,
            doctorId,
            appointmentId,
            newDate,
            newTime
        });

        res.json({ success: true, message: 'Appointment rescheduled successfully', appointment });
    } catch (error) {
        console.error('[doctorOpd] rescheduleDoctorAppointment error:', error);
        const status = error.statusCode || (error.isQuotaError ? 403 : 500);
        res.status(status).json({ success: false, message: error.message || 'Error rescheduling appointment' });
    }
};

exports.cancelDoctorAppointment = async (req, res) => {
    try {
        const { hospitalId, doctorId } = await getContext(req);
        const appointmentId = req.params.appointmentId || req.params.id;
        const reason = req.body.reason || '';

        const appointment = await doctorOpdService.cancelAppointment({
            hospitalId,
            doctorId,
            appointmentId,
            reason
        });

        res.json({ success: true, message: 'Appointment cancelled successfully', appointment });
    } catch (error) {
        console.error('[doctorOpd] cancelDoctorAppointment error:', error);
        res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Error cancelling appointment' });
    }
};

exports.listDoctorAppointments = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const { date, patientId, status, page = 1, limit = 50 } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * limitNum;

        const filter = { hospitalId };

        if (date) {
            const quotaService = require('../services/appointmentQuota.service');
            const { start, end } = quotaService.getIstDayRange(date);
            filter.appointmentDate = { $gte: start, $lte: end };
        }

        if (status && status !== 'all') {
            filter.status = status;
        }

        if (patientId) {
            const isObjectId = mongoose.Types.ObjectId.isValid(patientId) && patientId.length === 24;
            if (isObjectId) {
                filter.$or = [{ userId: patientId }, { clinicPatientId: patientId }];
            } else {
                filter.patientId = patientId;
            }
        }

        const docClauses = [];
        if (doctorId) docClauses.push({ doctorId });
        if (doctorUserId) docClauses.push({ doctorUserId });
        if (docClauses.length > 0) {
            if (filter.$or) {
                filter.$and = [{ $or: filter.$or }, { $or: docClauses }];
                delete filter.$or;
            } else {
                filter.$or = docClauses;
            }
        }

        const [total, appointments] = await Promise.all([
            Appointment.countDocuments(filter),
            Appointment.find(filter)
                .populate('userId', 'name phone email patientId mrn')
                .populate('clinicPatientId', 'name phone email patientUid')
                .sort({ appointmentDate: -1, appointmentTime: 1 })
                .skip(skip)
                .limit(limitNum)
                .lean()
        ]);

        res.json({
            success: true,
            appointments,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum) || 1
        });
    } catch (error) {
        console.error('[doctorOpd] listDoctorAppointments error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error listing appointments' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// 4. MONEY TRACKER
// ────────────────────────────────────────────────────────────────────────────

exports.recordPayment = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const appointmentId = req.params.appointmentId || req.params.id || req.body.appointmentId;

        const {
            amount,
            paymentMethod,
            splitPayments,
            transactionId,
            upiId,
            cardDetails,
            bankReference,
            proofUrl,
            description
        } = req.body;

        const result = await doctorOpdService.recordPayment({
            hospitalId,
            doctorId,
            doctorUserId,
            appointmentId,
            amount,
            paymentMethod,
            splitPayments,
            transactionId,
            upiId,
            cardDetails,
            bankReference,
            proofUrl,
            description
        });

        res.json({ success: true, message: 'Payment recorded successfully', ...result });
    } catch (error) {
        console.error('[doctorOpd] recordPayment error:', error);
        res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Error recording payment' });
    }
};

exports.getMoneySummary = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const summary = await doctorOpdService.getMoneySummary({ hospitalId, doctorId, doctorUserId });
        res.json({ success: true, summary });
    } catch (error) {
        console.error('[doctorOpd] getMoneySummary error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error fetching financial summary' });
    }
};

exports.getTransactions = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const { startDate, endDate, paymentMethod, page = 1, limit = 20 } = req.query;

        const result = await doctorOpdService.getTransactionsList({
            hospitalId,
            doctorId,
            doctorUserId,
            startDate,
            endDate,
            paymentMethod,
            page,
            limit
        });

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[doctorOpd] getTransactions error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error fetching transactions' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// 5. REVISIT SCHEDULE
// ────────────────────────────────────────────────────────────────────────────

exports.saveFollowUpDate = async (req, res) => {
    try {
        const { hospitalId, doctorId } = await getContext(req);
        const appointmentId = req.params.appointmentId || req.params.id || req.body.appointmentId;
        const followUpDate = req.body.followUpDate || req.body.date;

        const appointment = await doctorOpdService.saveFollowUpDate({
            hospitalId,
            doctorId,
            appointmentId,
            followUpDate
        });

        res.json({ success: true, message: 'Follow-up date saved successfully', appointment });
    } catch (error) {
        console.error('[doctorOpd] saveFollowUpDate error:', error);
        res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Error saving follow-up date' });
    }
};

exports.getRevisits = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const { filter = 'all', patientId = null, page = 1, limit = 20 } = req.query;

        const result = await doctorOpdService.getRevisits({
            hospitalId,
            doctorId,
            doctorUserId,
            filter,
            patientId,
            page,
            limit
        });

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[doctorOpd] getRevisits error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error fetching revisit schedule' });
    }
};

exports.bookRevisitAppointment = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const originalAppointmentId = req.params.appointmentId || req.params.id || req.body.originalAppointmentId;
        const { appointmentDate, appointmentTime, notes } = req.body;

        if (!appointmentDate) {
            return res.status(400).json({ success: false, message: 'Appointment date is required for revisit booking' });
        }

        const appointment = await doctorOpdService.bookFollowUpAppointment({
            hospitalId,
            doctorId,
            doctorUserId,
            originalAppointmentId,
            appointmentDate,
            appointmentTime,
            notes
        });

        res.status(201).json({ success: true, message: 'Follow-up appointment booked successfully', appointment });
    } catch (error) {
        console.error('[doctorOpd] bookRevisitAppointment error:', error);
        const status = error.statusCode || (error.isQuotaError ? 403 : 500);
        res.status(status).json({ success: false, message: error.message || 'Error booking follow-up appointment' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// 6. PRESCRIPTIONS
// ────────────────────────────────────────────────────────────────────────────

exports.savePrescription = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const appointmentId = req.params.appointmentId || req.params.id || req.body.appointmentId;
        const patientId = req.body.patientId || req.params.patientId;
        const { medicines, diagnosis, vitals, doctorNotes, followUpDate } = req.body;

        const appointment = await doctorOpdService.savePrescription({
            hospitalId,
            doctorId,
            doctorUserId,
            appointmentId,
            patientId,
            medicines,
            diagnosis,
            vitals,
            doctorNotes,
            followUpDate
        });

        res.json({ success: true, message: 'Prescription saved successfully', appointment });
    } catch (error) {
        console.error('[doctorOpd] savePrescription error:', error);
        res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Error saving prescription' });
    }
};

exports.getPatientPrescriptions = async (req, res) => {
    try {
        const hospitalId = req.user?.hospitalId;
        const { patientId } = req.params;
        if (!hospitalId) return res.status(400).json({ success: false, message: 'Hospital context required' });
        if (!patientId) return res.status(400).json({ success: false, message: 'Patient ID required' });

        const prescriptions = await doctorOpdService.getPatientPrescriptions({ hospitalId, patientId });
        res.json({ success: true, prescriptions });
    } catch (error) {
        console.error('[doctorOpd] getPatientPrescriptions error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error fetching prescriptions' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// 7. BASIC OPD REPORTS
// ────────────────────────────────────────────────────────────────────────────

exports.getOpdSummaryReport = async (req, res) => {
    try {
        const { hospitalId, doctorId, doctorUserId } = await getContext(req);
        const dateStr = req.query.date;

        const report = await doctorOpdService.getOpdSummaryReport({ hospitalId, doctorId, doctorUserId, dateStr });
        res.json({ success: true, report });
    } catch (error) {
        console.error('[doctorOpd] getOpdSummaryReport error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error generating OPD summary report' });
    }
};

