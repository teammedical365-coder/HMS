const mongoose = require('mongoose');
const Appointment = require('../models/appointment.model');

/**
 * Format time string into 12-hour format if in 24-hour HH:mm
 */
function formatTimeDisplay(timeStr = '') {
    if (!timeStr) return '';
    if (/am|pm/i.test(timeStr) || /token/i.test(timeStr)) {
        return timeStr.trim();
    }
    const parts = timeStr.trim().split(':');
    if (parts.length >= 2) {
        let hour = parseInt(parts[0], 10);
        const min = parts[1];
        if (!isNaN(hour)) {
            const ampm = hour >= 12 ? 'PM' : 'AM';
            hour = hour % 12;
            if (hour === 0) hour = 12;
            return `${hour}:${min} ${ampm}`;
        }
    }
    return timeStr.trim();
}

/**
 * Format date value into DD-MMM-YYYY format (e.g., 14-Jul-2026)
 */
function formatDateDisplay(dateVal) {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getUTCDate() < 10 ? '0' + d.getUTCDate() : d.getUTCDate();
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Reusable Production-Ready Validator:
 * Checks if the patient already has an active appointment at the exact same date and time.
 */
async function checkPatientDoubleBooking({ userId, patientId, date, time, excludeAppointmentId = null }) {
    if (!date || !time) return null;

    const patientOrConditions = [];
    if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
        patientOrConditions.push({ userId });
    }
    if (patientId && typeof patientId === 'string' && patientId.trim() !== '' && patientId.trim() !== 'WALK-IN' && patientId.trim() !== 'Patient') {
        patientOrConditions.push({ patientId: patientId.trim() });
    }

    if (patientOrConditions.length === 0) {
        return null;
    }

    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return null;

    const startOfDay = new Date(dateObj);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const query = {
        $or: patientOrConditions,
        appointmentDate: { $gte: startOfDay, $lte: endOfDay },
        appointmentTime: time.trim(),
        status: { $ne: 'cancelled' }
    };

    if (excludeAppointmentId && mongoose.Types.ObjectId.isValid(String(excludeAppointmentId))) {
        query._id = { $ne: excludeAppointmentId };
    }

    const existing = await Appointment.findOne(query);
    if (!existing) {
        return { conflict: false };
    }

    const timeDisplay = formatTimeDisplay(existing.appointmentTime);
    const dateDisplay = formatDateDisplay(existing.appointmentDate);
    const department = existing.department || existing.serviceName || 'General';
    const doctor = existing.doctorName ? (existing.doctorName.startsWith('Dr.') ? existing.doctorName : `Dr. ${existing.doctorName}`) : 'Assigned Doctor';

    const friendlyMessage = `You already have an appointment booked at ${timeDisplay} on ${dateDisplay}.\n\nDepartment:\n${department}\n\nDoctor:\n${doctor}\n\nPlease select another available time.`;

    return {
        conflict: true,
        message: friendlyMessage,
        existingAppointment: existing
    };
}

module.exports = {
    checkPatientDoubleBooking,
    formatTimeDisplay,
    formatDateDisplay
};
