const mongoose = require('mongoose');

const dailyAppointmentQuotaSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
        index: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: true,
        index: true
    },
    dateStr: {
        type: String, // 'YYYY-MM-DD' representing the calendar day in Asia/Kolkata
        required: true,
        index: true
    },
    consumedCount: {
        type: Number,
        default: 0,
        min: 0
    },
    maxLimit: {
        type: Number,
        default: 20
    }
}, {
    timestamps: true
});

// Compound unique index guaranteeing exact uniqueness per tenant, doctor, and IST calendar day
dailyAppointmentQuotaSchema.index({ hospitalId: 1, doctorId: 1, dateStr: 1 }, { unique: true });

module.exports = mongoose.model('DailyAppointmentQuota', dailyAppointmentQuotaSchema);
