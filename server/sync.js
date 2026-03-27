/**
 * ONE-TIME MIGRATION: Backfill hospitalId onto PharmacyOrder and LabReport
 * that are missing it. Uses the appointment's hospitalId as the source of truth.
 *
 * Run: node sync.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Appointment = require('./src/models/appointment.model');
const PharmacyOrder = require('./src/models/pharmacyOrder.model');
const LabReport = require('./src/models/labReport.model');

const MONGO_URI = process.env.MONGODB_URL;

async function backfillHospitalIds() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // ── 1. PharmacyOrders ──
    const ordersWithout = await PharmacyOrder.find({ $or: [{ hospitalId: null }, { hospitalId: { $exists: false } }] });
    console.log(`Found ${ordersWithout.length} PharmacyOrders missing hospitalId`);

    let updatedOrders = 0;
    for (const order of ordersWithout) {
        if (!order.appointmentId) continue;
        const appt = await Appointment.findById(order.appointmentId).lean();
        if (appt && appt.hospitalId) {
            await PharmacyOrder.updateOne({ _id: order._id }, { $set: { hospitalId: appt.hospitalId } });
            updatedOrders++;
        }
    }
    console.log(`Updated ${updatedOrders} PharmacyOrders with hospitalId`);

    // ── 2. LabReports ──
    const reportsWithout = await LabReport.find({ $or: [{ hospitalId: null }, { hospitalId: { $exists: false } }] });
    console.log(`Found ${reportsWithout.length} LabReports missing hospitalId`);

    let updatedReports = 0;
    for (const report of reportsWithout) {
        if (!report.appointmentId) continue;
        const appt = await Appointment.findById(report.appointmentId).lean();
        if (appt && appt.hospitalId) {
            await LabReport.updateOne({ _id: report._id }, { $set: { hospitalId: appt.hospitalId } });
            updatedReports++;
        }
    }
    console.log(`Updated ${updatedReports} LabReports with hospitalId`);

    console.log('\n✅ Migration complete!');
    await mongoose.disconnect();
}

backfillHospitalIds().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});
