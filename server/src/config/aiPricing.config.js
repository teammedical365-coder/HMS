/**
 * aiPricing.config.js
 * Centralized pricing configuration for Google Gemini AI models.
 * Calculates actual API spending costs in INR and USD.
 */

const USD_TO_INR_RATE = 86.50; // Current market exchange rate

const MODEL_PRICING_TABLE = {
    // Gemini 3.x Flash Family (Ultra Fast & Cost Efficient)
    'gemini-3.1-flash': {
        inputPriceUsdPerMillion: 0.075,
        outputPriceUsdPerMillion: 0.30,
        unit: '1M tokens',
        currency: 'USD'
    },
    'gemini-3.5-flash': {
        inputPriceUsdPerMillion: 0.075,
        outputPriceUsdPerMillion: 0.30,
        unit: '1M tokens',
        currency: 'USD'
    },
    'gemini-3.7-flash': {
        inputPriceUsdPerMillion: 0.075,
        outputPriceUsdPerMillion: 0.30,
        unit: '1M tokens',
        currency: 'USD'
    },
    'gemini-3.6-flash': {
        inputPriceUsdPerMillion: 0.075,
        outputPriceUsdPerMillion: 0.30,
        unit: '1M tokens',
        currency: 'USD'
    },
    'gemini-2.5-flash': {
        inputPriceUsdPerMillion: 0.08,
        outputPriceUsdPerMillion: 0.35,
        unit: '1M tokens',
        currency: 'USD'
    },
    // Gemini 2.0 Flash
    'gemini-2.0-flash': {
        inputPriceUsdPerMillion: 0.10,
        outputPriceUsdPerMillion: 0.40,
        unit: '1M tokens',
        currency: 'USD'
    },
    // Gemini 1.5 Flash
    'gemini-1.5-flash': {
        inputPriceUsdPerMillion: 0.075,
        outputPriceUsdPerMillion: 0.30,
        unit: '1M tokens',
        currency: 'USD'
    },
    // Gemini Pro Series
    'gemini-1.5-pro': {
        inputPriceUsdPerMillion: 1.25,
        outputPriceUsdPerMillion: 5.00,
        unit: '1M tokens',
        currency: 'USD'
    },
    'gemini-pro': {
        inputPriceUsdPerMillion: 1.25,
        outputPriceUsdPerMillion: 5.00,
        unit: '1M tokens',
        currency: 'USD'
    }
};

const DEFAULT_MODEL = 'gemini-3.1-flash';

/**
 * Get pricing definition for a given model name.
 * Handles variations like '3.1-flash', 'gemini-3.5-flash', '3.5', etc.
 * @param {string} modelName 
 */
function getModelPricing(modelName) {
    if (!modelName) return MODEL_PRICING_TABLE['gemini-3.1-flash'];
    const clean = modelName.toLowerCase().trim().replace(/^["']|["']$/g, '');
    
    // Direct match
    if (MODEL_PRICING_TABLE[clean]) return MODEL_PRICING_TABLE[clean];
    
    // Normalization: e.g. "3.1-flash" -> "gemini-3.1-flash"
    const withPrefix = clean.startsWith('gemini-') ? clean : `gemini-${clean}`;
    if (MODEL_PRICING_TABLE[withPrefix]) return MODEL_PRICING_TABLE[withPrefix];
    
    // Smart Pattern Matching
    if (clean.includes('pro')) return MODEL_PRICING_TABLE['gemini-1.5-pro'];
    if (clean.includes('3.5')) return MODEL_PRICING_TABLE['gemini-3.5-flash'];
    if (clean.includes('3.7')) return MODEL_PRICING_TABLE['gemini-3.7-flash'];
    if (clean.includes('3.1') || clean.includes('3.')) return MODEL_PRICING_TABLE['gemini-3.1-flash'];
    if (clean.includes('2.5')) return MODEL_PRICING_TABLE['gemini-2.5-flash'];
    if (clean.includes('2.0') || clean.includes('2.')) return MODEL_PRICING_TABLE['gemini-2.0-flash'];
    
    return MODEL_PRICING_TABLE['gemini-3.1-flash'];
}

/**
 * Calculate actual API cost for given token counts.
 * Uses decimal-safe precision to avoid JS floating-point issues.
 * 
 * @param {string} modelName - Model name
 * @param {number} inputTokens - Number of input/prompt tokens
 * @param {number} outputTokens - Number of output/candidate tokens
 * @returns {{ costInr: number, costUsd: number, inputCostInr: number, outputCostInr: number }}
 */
function calculateCost(modelName, inputTokens = 0, outputTokens = 0) {
    const pricing = getModelPricing(modelName);
    const validInTokens = Math.max(0, Number(inputTokens) || 0);
    const validOutTokens = Math.max(0, Number(outputTokens) || 0);

    const inputCostUsd = (validInTokens * pricing.inputPriceUsdPerMillion) / 1000000;
    const outputCostUsd = (validOutTokens * pricing.outputPriceUsdPerMillion) / 1000000;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    const inputCostInr = inputCostUsd * USD_TO_INR_RATE;
    const outputCostInr = outputCostUsd * USD_TO_INR_RATE;
    const totalCostInr = totalCostUsd * USD_TO_INR_RATE;

    // Minimum charge per successful request if tokens are non-zero:
    // Ensures accurate accounting even for sub-paise API calls
    const roundedInr = Number(totalCostInr.toFixed(4));
    const roundedUsd = Number(totalCostUsd.toFixed(6));

    return {
        costInr: roundedInr,
        costUsd: roundedUsd,
        inputCostInr: Number(inputCostInr.toFixed(4)),
        outputCostInr: Number(outputCostInr.toFixed(4)),
        usdToInrRate: USD_TO_INR_RATE
    };
}

module.exports = {
    USD_TO_INR_RATE,
    MODEL_PRICING_TABLE,
    getModelPricing,
    calculateCost
};
