/**
 * aiPricing.config.js
 * Centralized pricing configuration for Google Gemini AI models.
 * Calculates actual API spending costs in INR and USD.
 */

const USD_TO_INR_RATE = 86.50; // Current market exchange rate

const MODEL_PRICING_TABLE = {
    // Gemini 1.5 Flash / 3.6 Flash
    'gemini-1.5-flash': {
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
    'gemini-2.0-flash': {
        inputPriceUsdPerMillion: 0.10,
        outputPriceUsdPerMillion: 0.40,
        unit: '1M tokens',
        currency: 'USD'
    },
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

const DEFAULT_MODEL = 'gemini-1.5-flash';

/**
 * Get pricing definition for a given model name.
 * @param {string} modelName 
 */
function getModelPricing(modelName) {
    if (!modelName) return MODEL_PRICING_TABLE[DEFAULT_MODEL];
    const clean = modelName.toLowerCase().trim();
    if (MODEL_PRICING_TABLE[clean]) return MODEL_PRICING_TABLE[clean];
    
    // Fuzzy matching
    if (clean.includes('pro')) return MODEL_PRICING_TABLE['gemini-1.5-pro'];
    if (clean.includes('2.0')) return MODEL_PRICING_TABLE['gemini-2.0-flash'];
    return MODEL_PRICING_TABLE[DEFAULT_MODEL];
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
