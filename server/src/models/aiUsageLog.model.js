const mongoose = require('mongoose');

/**
 * AIUsageLog — Records token consumption, model metrics, and estimated costs
 * for all AI features (Summaries, Comparisons, OCR, Clinical Chat).
 */
const aiUsageLogSchema = new mongoose.Schema({
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userName: { type: String, default: 'Doctor/Staff' },
    patientId: { type: mongoose.Schema.Types.Mixed, default: null, index: true },
    
    actionType: {
        type: String,
        required: true,
        enum: ['REPORT_SUMMARY', 'REPORT_COMPARISON', 'CLINICAL_CHAT', 'OCR_EXTRACTION', 'HISTORY_SUMMARY', 'OTHER'],
        index: true
    },
    
    modelName: { type: String, default: 'gemini-1.5-flash' },
    
    promptTokens: { type: Number, default: 0 },
    candidateTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    
    estimatedCostUsd: { type: Number, default: 0 },
    estimatedCostInr: { type: Number, default: 0 },
    
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED'],
        default: 'SUCCESS'
    },
    
    error: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

aiUsageLogSchema.index({ createdAt: -1 });
aiUsageLogSchema.index({ hospitalId: 1, createdAt: -1 });

module.exports = mongoose.model('AIUsageLog', aiUsageLogSchema);
