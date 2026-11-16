const mongoose = require('mongoose');

const qualityIndicatorSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    period: { type: String, required: true, trim: true, index: true }, // YYYY-MM
    metrics: {
        // PSQ-1: Initial assessment completion TAT (<24 hours)
        initialAssessmentAvgHours: { type: Number, default: 0 },
        initialAssessmentComplianceRate: { type: Number, default: 100 }, // percentage completed within 24h

        // PSQ-2: Medication Errors & MAR adherence
        medicationErrorCount: { type: Number, default: 0 },
        marAdherenceRate: { type: Number, default: 100 }, // percentage administered on schedule

        // PSQ-3: Bed Occupancy Rate
        totalBeds: { type: Number, default: 0 },
        occupiedBeds: { type: Number, default: 0 },
        bedOccupancyRate: { type: Number, default: 0 }, // percentage

        // PSQ-4: Patient Safety Incidents
        patientFallCount: { type: Number, default: 0 },
        hospitalAcquiredInfectionRate: { type: Number, default: 0 },
        readmissionRate30Days: { type: Number, default: 0 },

        // PSQ-5: Emergency & Critical Care response
        criticalAlertResponseMinutes: { type: Number, default: 0 }
    },
    status: {
        type: String,
        enum: ['AUTO_CALCULATED', 'VERIFIED', 'AUDITED'],
        default: 'AUTO_CALCULATED'
    },
    calculatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

qualityIndicatorSchema.index({ hospitalId: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('QualityIndicator', qualityIndicatorSchema);
module.exports.qualityIndicatorSchema = qualityIndicatorSchema;

