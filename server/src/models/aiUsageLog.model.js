const mongoose = require('mongoose');

/**
 * AIUsageLog — Internal billing & technical usage log for AI Assistant operations.
 * Records Gemini API token counts, calculated actual monetary costs (in INR),
 * and links each call to the originating hospital, doctor, and patient context.
 */
const aiUsageLogSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    userName: {
        type: String,
        default: 'Doctor/Staff'
    },
    userRole: {
        type: String,
        default: 'doctor'
    },
    patientId: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    
    // Feature / Operation type
    operation: {
        type: String,
        required: true
    },
    // Alias for backward compatibility
    actionType: {
        type: String,
        default: ''
    },
    
    model: {
        type: String,
        default: 'gemini-1.5-flash'
    },
    // Alias for backward compatibility
    modelName: {
        type: String,
        default: 'gemini-1.5-flash'
    },
    
    // Technical Token Usage
    inputTokens: {
        type: Number,
        default: 0
    },
    outputTokens: {
        type: Number,
        default: 0
    },
    totalTokens: {
        type: Number,
        default: 0
    },
    // Aliases for backward compatibility
    promptTokens: {
        type: Number,
        default: 0
    },
    candidateTokens: {
        type: Number,
        default: 0
    },
    
    // Financial Cost Breakdown (Real Gemini API spending)
    actualApiCost: {
        type: Number,
        default: 0,
        min: 0
    },
    estimatedCostInr: {
        type: Number,
        default: 0,
        min: 0
    },
    estimatedCostUsd: {
        type: Number,
        default: 0,
        min: 0
    },
    currency: {
        type: String,
        default: 'INR'
    },
    
    requestId: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'INSUFFICIENT_FUNDS'],
        default: 'SUCCESS'
    },
    error: {
        type: String,
        default: ''
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

aiUsageLogSchema.index({ createdAt: -1 });
aiUsageLogSchema.index({ hospitalId: 1, createdAt: -1 });
aiUsageLogSchema.index({ hospitalId: 1, userId: 1, createdAt: -1 });
aiUsageLogSchema.index({ hospitalId: 1, operation: 1 });

module.exports = mongoose.model('AIUsageLog', aiUsageLogSchema);
