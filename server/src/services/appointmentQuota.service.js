/**
 * appointmentQuota.service.js
 * 
 * Concurrency-safe atomic quota management for the Free Doctor OPD Plan.
 * Enforces a strict ceiling of 20 appointments per doctor per calendar day (Asia/Kolkata).
 * 
 * Guarantees:
 * - Scoped strictly to (hospitalId, doctorId, IST calendar date).
 * - Multi-request atomic reservation using MongoDB findOneAndUpdate with { consumedCount: { $lt: maxLimit } }.
 * - Releases reservations if appointment creation subsequently fails.
 * - Same-day rescheduling does not consume extra quota.
 * - Cross-day rescheduling reserves destination before releasing source date.
 * - Paid plans (enterprise, multi_speciality_starter, clinic_basic, starter) bypass quota entirely.
 */

const mongoose = require('mongoose');
const DailyAppointmentQuota = require('../models/dailyAppointmentQuota.model');
const Hospital = require('../models/hospital.model');

const TIMEZONE = 'Asia/Kolkata';
const FREE_PLAN_DAILY_LIMIT = 20;

/**
 * Formats a Date object or timestamp into YYYY-MM-DD in Asia/Kolkata timezone.
 * 
 * @param {Date|string|number} dateInput 
 * @returns {string} 'YYYY-MM-DD'
 */
function getIstDateString(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) {
        throw new Error(`Invalid date provided to getIstDateString: ${dateInput}`);
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(d); // Outputs 'YYYY-MM-DD'
}

/**
 * Resolves an input to a canonical YYYY-MM-DD IST date string.
 * Handles existing 'YYYY-MM-DD' strings directly to prevent double-conversion artifacts.
 * 
 * @param {Date|string} dateInput 
 * @returns {string}
 */
function resolveIstDateStr(dateInput) {
    if (!dateInput) return getIstDateString(new Date());
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
        return dateInput.trim();
    }
    return getIstDateString(dateInput);
}

/**
 * Computes exact UTC Date boundaries for an IST calendar day.
 * IST day runs from 00:00:00.000 IST to 23:59:59.999 IST.
 * IST is UTC+5:30 -> UTC starts at previous day 18:30:00.000Z and ends at 18:29:59.999Z.
 * 
 * @param {string|Date} dateInput 
 * @returns {{ start: Date, end: Date, dateStr: string }}
 */
function getIstDayRange(dateInput) {
    const dateStr = resolveIstDateStr(dateInput);
    const [year, month, day] = dateStr.split('-').map(Number);
    // UTC milliseconds for start of IST day: (IST 00:00:00) minus 5h 30m
    const startUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000;
    const endUtcMs = startUtcMs + (24 * 60 * 60 * 1000) - 1;
    return {
        dateStr,
        start: new Date(startUtcMs),
        end: new Date(endUtcMs)
    };
}

/**
 * Checks if a hospital is subscribed to the Free Doctor OPD Plan.
 * Only returns true if subscriptionPlan is explicitly 'free_doctor_opd'.
 * 
 * @param {string|mongoose.Types.ObjectId} hospitalId 
 * @returns {Promise<{ isFreePlan: boolean, limit: number, hospital: object|null }>}
 */
async function getHospitalPlanInfo(hospitalId) {
    if (!hospitalId) {
        return { isFreePlan: false, limit: Infinity, hospital: null };
    }
    const hospital = await Hospital.findById(hospitalId).select('subscriptionPlan tier').lean();
    if (!hospital) {
        return { isFreePlan: false, limit: Infinity, hospital: null };
    }
    const isFreePlan = hospital.subscriptionPlan === 'free_doctor_opd';
    const limit = isFreePlan ? (hospital.tier?.maxDailyAppointments || FREE_PLAN_DAILY_LIMIT) : Infinity;
    return { isFreePlan, limit, hospital };
}

/**
 * Atomically ensures the quota counter document exists for (hospitalId, doctorId, dateStr).
 * If creating for the first time and AppointmentModel is provided, seeds consumedCount
 * from any existing non-cancelled appointments for that IST day.
 */
async function ensureQuotaDocument(hospitalId, doctorId, dateStr, maxLimit, AppointmentModel) {
    let initialCount = 0;
    if (AppointmentModel) {
        try {
            const { start, end } = getIstDayRange(dateStr);
            initialCount = await AppointmentModel.countDocuments({
                hospitalId,
                doctorId,
                appointmentDate: { $gte: start, $lte: end },
                status: { $ne: 'cancelled' }
            });
        } catch (cntErr) {
            console.warn('[appointmentQuota] Notice: could not pre-count appointments, defaulting to 0:', cntErr.message);
        }
    }

    try {
        await DailyAppointmentQuota.updateOne(
            { hospitalId, doctorId, dateStr },
            {
                $setOnInsert: {
                    hospitalId,
                    doctorId,
                    dateStr,
                    consumedCount: initialCount,
                    maxLimit
                }
            },
            { upsert: true }
        );
    } catch (err) {
        // Code 11000: duplicate key error if two concurrent requests upserted simultaneously.
        // This is safe and expected; the document exists now.
        if (err.code !== 11000) throw err;
    }
}

/**
 * Atomically reserves a daily appointment slot for a doctor under the Free Doctor OPD Plan.
 * If the tenant is on a paid plan, returns { allowed: true, reserved: false, isFreePlan: false } immediately.
 * 
 * Concurrency Safety:
 * Uses atomic findOneAndUpdate with query filter: consumedCount: { $lt: maxLimit } and $inc: { consumedCount: 1 }.
 * No two concurrent requests can exceed the limit.
 * 
 * @param {object} params
 * @param {string|mongoose.Types.ObjectId} params.hospitalId
 * @param {string|mongoose.Types.ObjectId} params.doctorId
 * @param {string|Date} params.appointmentDate
 * @param {mongoose.Model} [params.AppointmentModel]
 * @returns {Promise<{ allowed: boolean, reserved: boolean, isFreePlan: boolean, dateStr?: string, consumedCount?: number, message?: string }>}
 */
async function reserveAppointmentSlot({ hospitalId, doctorId, appointmentDate, AppointmentModel }) {
    if (!hospitalId || !doctorId) {
        return { allowed: true, reserved: false, isFreePlan: false };
    }

    const { isFreePlan, limit } = await getHospitalPlanInfo(hospitalId);
    if (!isFreePlan || limit === Infinity) {
        return { allowed: true, reserved: false, isFreePlan: false };
    }

    const dateStr = resolveIstDateStr(appointmentDate);

    // Ensure document exists
    await ensureQuotaDocument(hospitalId, doctorId, dateStr, limit, AppointmentModel);

    // Atomically increment quota if below limit
    const reservedDoc = await DailyAppointmentQuota.findOneAndUpdate(
        {
            hospitalId,
            doctorId,
            dateStr,
            consumedCount: { $lt: limit }
        },
        {
            $inc: { consumedCount: 1 }
        },
        {
            new: true
        }
    );

    if (!reservedDoc) {
        return {
            allowed: false,
            reserved: false,
            isFreePlan: true,
            dateStr,
            message: `Daily appointment quota reached. The Free Doctor OPD Plan permits a maximum of ${limit} appointments per calendar day (Asia/Kolkata). Please select a different date or upgrade your plan.`
        };
    }

    return {
        allowed: true,
        reserved: true,
        isFreePlan: true,
        dateStr,
        consumedCount: reservedDoc.consumedCount
    };
}

/**
 * Atomically releases a reserved slot (used upon appointment cancellation or rollback after creation failure).
 * Decrements consumedCount only if it is greater than 0.
 * 
 * @param {object} params
 * @param {string|mongoose.Types.ObjectId} params.hospitalId
 * @param {string|mongoose.Types.ObjectId} params.doctorId
 * @param {string|Date} params.appointmentDate
 * @returns {Promise<{ released: boolean, isFreePlan: boolean }>}
 */
async function releaseAppointmentSlot({ hospitalId, doctorId, appointmentDate }) {
    if (!hospitalId || !doctorId) {
        return { released: false, isFreePlan: false };
    }

    const { isFreePlan } = await getHospitalPlanInfo(hospitalId);
    if (!isFreePlan) {
        return { released: false, isFreePlan: false };
    }

    const dateStr = resolveIstDateStr(appointmentDate);

    const result = await DailyAppointmentQuota.updateOne(
        {
            hospitalId,
            doctorId,
            dateStr,
            consumedCount: { $gt: 0 }
        },
        {
            $inc: { consumedCount: -1 }
        }
    );

    return {
        released: (result.modifiedCount || result.nModified || 0) > 0,
        isFreePlan: true
    };
}

/**
 * Handles quota adjustments when rescheduling an appointment.
 * - Same IST calendar day: does not consume an extra slot.
 * - Different IST calendar day: atomically reserves destination date slot FIRST.
 *   If destination is full, preserves original slot and rejects rescheduling.
 *   If destination succeeds, releases the slot on the old date.
 * 
 * @param {object} params
 * @param {string|mongoose.Types.ObjectId} params.hospitalId
 * @param {string|mongoose.Types.ObjectId} params.doctorId
 * @param {string|Date} params.oldDate
 * @param {string|Date} params.newDate
 * @param {mongoose.Model} [params.AppointmentModel]
 * @returns {Promise<{ allowed: boolean, rescheduled: boolean, sameDay?: boolean, message?: string }>}
 */
async function rescheduleAppointmentSlot({ hospitalId, doctorId, oldDate, newDate, AppointmentModel }) {
    if (!hospitalId || !doctorId) {
        return { allowed: true, rescheduled: false };
    }

    const { isFreePlan, limit } = await getHospitalPlanInfo(hospitalId);
    if (!isFreePlan || limit === Infinity) {
        return { allowed: true, rescheduled: false };
    }

    const oldDateStr = resolveIstDateStr(oldDate);
    const newDateStr = resolveIstDateStr(newDate);

    // Same IST day: zero net quota change
    if (oldDateStr === newDateStr) {
        return { allowed: true, rescheduled: false, sameDay: true };
    }

    // Cross-day: reserve destination first
    const destReservation = await reserveAppointmentSlot({
        hospitalId,
        doctorId,
        appointmentDate: newDate,
        AppointmentModel
    });

    if (!destReservation.allowed) {
        return {
            allowed: false,
            rescheduled: false,
            message: `Cannot reschedule: ${destReservation.message}`
        };
    }

    // Destination successfully reserved, now release previous date slot
    await releaseAppointmentSlot({
        hospitalId,
        doctorId,
        appointmentDate: oldDate
    });

    return {
        allowed: true,
        rescheduled: true,
        sameDay: false,
        oldDateStr,
        newDateStr
    };
}

/**
 * Retrieves current quota consumption status for a doctor on a specific IST calendar day.
 */
async function getQuotaStatus({ hospitalId, doctorId, dateInput }) {
    const { isFreePlan, limit } = await getHospitalPlanInfo(hospitalId);
    if (!isFreePlan) {
        return { isFreePlan: false, limit: Infinity, consumedCount: 0, remaining: Infinity };
    }
    const dateStr = resolveIstDateStr(dateInput);
    const doc = await DailyAppointmentQuota.findOne({ hospitalId, doctorId, dateStr }).lean();
    const consumedCount = doc ? doc.consumedCount : 0;
    const remaining = Math.max(0, limit - consumedCount);
    return {
        isFreePlan: true,
        dateStr,
        limit,
        consumedCount,
        remaining
    };
}

module.exports = {
    TIMEZONE,
    FREE_PLAN_DAILY_LIMIT,
    getIstDateString,
    resolveIstDateStr,
    getIstDayRange,
    getHospitalPlanInfo,
    reserveAppointmentSlot,
    releaseAppointmentSlot,
    rescheduleAppointmentSlot,
    getQuotaStatus
};
