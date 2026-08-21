const geminiProvider = require('./providers/gemini.provider');
const AIUsageLog = require('../../models/aiUsageLog.model');

class AIService {
    get _provider() {
        return geminiProvider;
    }

    _calculateCost(usage) {
        const model = (usage.modelName || '').toLowerCase();
        let inputRate = 0.075 / 1000000; // $0.075 per 1M tokens (Flash)
        let outputRate = 0.30 / 1000000; // $0.30 per 1M tokens (Flash)
        
        if (model.includes('pro')) {
            inputRate = 1.25 / 1000000; // $1.25 per 1M tokens (Pro)
            outputRate = 5.00 / 1000000; // $5.00 per 1M tokens (Pro)
        }

        const costUsd = (usage.promptTokens * inputRate) + (usage.candidateTokens * outputRate);
        const costInr = costUsd * 86.5; // Approx USD to INR

        return {
            costUsd: Number(costUsd.toFixed(7)),
            costInr: Number(costInr.toFixed(5))
        };
    }

    async _recordUsage(actionType, rawUsage, userContext = {}, metadata = {}) {
        try {
            const defaultModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
            const usage = rawUsage || { promptTokens: 0, candidateTokens: 0, totalTokens: 0, modelName: defaultModel };
            const { costUsd, costInr } = this._calculateCost(usage);
            
            // Formatted console log for instant inspection in terminal
            console.log(
                `\x1b[36m[AI Token Tracker]\x1b[0m \x1b[32m${actionType}\x1b[0m | Model: \x1b[33m${usage.modelName || defaultModel}\x1b[0m | ` +
                `In: \x1b[1m${usage.promptTokens}\x1b[0m | Out: \x1b[1m${usage.candidateTokens}\x1b[0m | ` +
                `Total: \x1b[35m\x1b[1m${usage.totalTokens} tokens\x1b[0m | Est: \x1b[32m$${costUsd.toFixed(6)} (~₹${costInr.toFixed(4)})\x1b[0m`
            );

            const enrichedUsage = {
                ...usage,
                estimatedCostUsd: costUsd,
                estimatedCostInr: costInr
            };

            // Async DB persistence (non-blocking)
            AIUsageLog.create({
                hospitalId: userContext.hospitalId || null,
                userId: userContext.userId || null,
                userName: userContext.userName || 'Doctor/Staff',
                patientId: userContext.patientId || null,
                actionType,
                modelName: usage.modelName || defaultModel,
                promptTokens: usage.promptTokens || 0,
                candidateTokens: usage.candidateTokens || 0,
                totalTokens: usage.totalTokens || 0,
                estimatedCostUsd: costUsd,
                estimatedCostInr: costInr,
                status: 'SUCCESS',
                metadata
            }).catch(err => console.error('[AIUsageLog DB Error]:', err.message));

            return enrichedUsage;
        } catch (e) {
            console.error('[AI Token Tracker Error]:', e.message);
            return rawUsage;
        }
    }

    async extractReportText(base64Image, mimeType, userContext = {}) {
        const prompt = "Extract all text from this medical report. Return ONLY the raw text word for word. Do not summarize or format. If the image is not a document or contains no text, return an empty string.";
        const { text, usage } = await this._provider.analyzeImage(prompt, base64Image, mimeType);
        await this._recordUsage('OCR_EXTRACTION', usage, userContext, { mimeType });
        return text;
    }

    async generateReportSummary(base64Image, mimeType, userContext = {}) {
        const prompt = `You are a medical AI assistant. Analyze the provided medical report and return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ReportType": "Identified report type (e.g. Complete Blood Count, X-Ray, Unknown)",
  "OverallSummary": "Short overall summary (4-8 lines) of the report's main findings. NO diagnosis or treatment advice.",
  "ImportantFindings": ["Finding 1", "Finding 2"],
  "AbnormalValues": ["Parameter: Value", "Parameter: Value"]
}
Only include AbnormalValues if there are any, otherwise an empty array.
ImportantFindings should just be bullet points as an array of strings.`;
        
        const { text, usage } = await this._provider.analyzeImage(prompt, base64Image, mimeType);
        const enrichedUsage = await this._recordUsage('REPORT_SUMMARY', usage, userContext, { mimeType });
        
        let cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const summary = JSON.parse(cleanedText);
        return { summary, usage: enrichedUsage };
    }

    async compareReports(latestBase64, latestMime, prevBase64, prevMime, userContext = {}) {
        const prompt = `You are a medical AI assistant. Compare the latest medical report with the previous medical report.
Keep it strictly factual based on the data. Do NOT generate any diagnosis, treatment suggestions, prescriptions, or medical advice.
Return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "NewFindings": ["Finding 1", "Finding 2"],
  "RemovedFindings": ["Finding 1", "Finding 2"],
  "ChangedFindings": ["Parameter 1: Old Value -> New Value"],
  "OverallChange": "Short factual statement summarizing the difference."
}
If a section is empty, return an empty array. Do not invent details.`;
        
        const { text, usage } = await this._provider.compareImages(prompt, latestBase64, latestMime, prevBase64, prevMime);
        const enrichedUsage = await this._recordUsage('REPORT_COMPARISON', usage, userContext, { latestMime, prevMime });
        
        let cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const comparison = JSON.parse(cleanedText);
        return { comparison, usage: enrichedUsage };
    }

    async chatWithAssistant(messages, userContext = {}) {
        const systemPrompt = "You are a medical AI assistant helping doctors analyze reports and patient history. Provide concise, professional, and factual responses. Do not generate prescriptions or medical advice directly to patients, but assist the doctor in clinical reasoning.";
        const { text, usage } = await this._provider.chatCompletion(systemPrompt, messages);
        const enrichedUsage = await this._recordUsage('CLINICAL_CHAT', usage, userContext, { messageCount: messages.length });
        return { reply: text, usage: enrichedUsage };
    }
}

module.exports = new AIService();
