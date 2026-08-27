const geminiProvider = require('./providers/gemini.provider');
const AIUsageLog = require('../../models/aiUsageLog.model');
const { validateMedia, classifyContent } = require('./mediaValidator');
const { buildAnalysisPrompt, buildComparisonPrompt } = require('./promptBuilder');

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

    /**
     * Parse Gemini response text as JSON, with graceful fallback.
     * Handles markdown code fences, partial JSON, and non-JSON responses.
     */
    _parseJsonResponse(text) {
        let cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        try {
            return { parsed: JSON.parse(cleanedText), raw: null };
        } catch (e) {
            // Try to extract JSON from mixed content
            const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return { parsed: JSON.parse(jsonMatch[0]), raw: null };
                } catch (e2) {
                    // Fall through
                }
            }
            // Return raw text if JSON parsing fails entirely
            return { parsed: null, raw: cleanedText };
        }
    }

    /**
     * Extract text from a report image/PDF using OCR.
     * (Preserved — backward compatible)
     */
    async extractReportText(base64Image, mimeType, userContext = {}) {
        const prompt = "Extract all text from this medical report. Return ONLY the raw text word for word. Do not summarize or format. If the image is not a document or contains no text, return an empty string.";
        const { text, usage } = await this._provider.analyzeImage(prompt, base64Image, mimeType);
        await this._recordUsage('OCR_EXTRACTION', usage, userContext, { mimeType });
        return text;
    }

    /**
     * Generate a smart report summary — content-type-aware.
     * Detects whether the input is a text report, medical image, chart, etc.
     * and uses the appropriate prompt and response handling.
     * 
     * (Upgraded from the original text-only version. Backward compatible.)
     */
    async generateReportSummary(base64Image, mimeType, userContext = {}, fileName = '') {
        // Classify the content to select the right prompt
        const contentClass = classifyContent(mimeType, fileName);
        const prompt = buildAnalysisPrompt(contentClass, mimeType);

        console.log(`\x1b[36m[AI Analysis]\x1b[0m Content: \x1b[33m${contentClass}\x1b[0m | MIME: ${mimeType} | File: ${fileName || '(unnamed)'}`);

        const { text, usage } = await this._provider.analyzeImage(prompt, base64Image, mimeType);
        const enrichedUsage = await this._recordUsage('REPORT_SUMMARY', usage, userContext, { mimeType, contentClass, fileName });
        
        const { parsed, raw } = this._parseJsonResponse(text);

        if (parsed) {
            return { summary: parsed, usage: enrichedUsage };
        }

        // Fallback: wrap raw text in a structured response
        return {
            summary: {
                ContentType: 'General Analysis',
                ReportType: 'Unknown',
                OverallSummary: raw || 'Unable to generate a structured summary for this content.',
                ImportantFindings: [],
                AbnormalValues: [],
                VisibleObservations: [],
                NotableFindings: []
            },
            usage: enrichedUsage
        };
    }

    /**
     * General media analysis — handles any supported file type with optional question.
     * @param {string} base64Data - Base64 encoded file content
     * @param {string} mimeType - Resolved MIME type
     * @param {Object} userContext - User/hospital context for tracking
     * @param {string} [userQuestion] - Optional question about the content
     * @param {string} [fileName] - Original filename for classification hints
     */
    async analyzeMedia(base64Data, mimeType, userContext = {}, userQuestion = '', fileName = '') {
        const contentClass = classifyContent(mimeType, fileName);
        const prompt = buildAnalysisPrompt(contentClass, mimeType, userQuestion);

        const actionType = userQuestion ? 'MEDIA_QA' : 'MEDIA_ANALYSIS';
        console.log(`\x1b[36m[AI Media Analysis]\x1b[0m Class: \x1b[33m${contentClass}\x1b[0m | MIME: ${mimeType} | Question: ${userQuestion ? 'Yes' : 'No'}`);

        const { text, usage } = await this._provider.analyzeImage(prompt, base64Data, mimeType);
        const enrichedUsage = await this._recordUsage(actionType, usage, userContext, { mimeType, contentClass, fileName, hasQuestion: !!userQuestion });

        const { parsed, raw } = this._parseJsonResponse(text);

        if (parsed) {
            return { analysis: parsed, usage: enrichedUsage };
        }

        return {
            analysis: {
                ContentType: 'General Analysis',
                OverallSummary: raw || 'Unable to analyze the provided content.',
                VisibleObservations: [],
                NotableFindings: []
            },
            usage: enrichedUsage
        };
    }

    /**
     * Compare two reports/images — content-aware comparison.
     * (Upgraded with content classification. Backward compatible.)
     */
    async compareReports(latestBase64, latestMime, prevBase64, prevMime, userContext = {}) {
        const contentClass = classifyContent(latestMime, '');
        const prompt = buildComparisonPrompt(contentClass);
        
        const { text, usage } = await this._provider.compareImages(prompt, latestBase64, latestMime, prevBase64, prevMime);
        const enrichedUsage = await this._recordUsage('REPORT_COMPARISON', usage, userContext, { latestMime, prevMime, contentClass });
        
        const { parsed, raw } = this._parseJsonResponse(text);

        if (parsed) {
            return { comparison: parsed, usage: enrichedUsage };
        }

        return {
            comparison: {
                NewFindings: [],
                RemovedFindings: [],
                ChangedFindings: [],
                OverallChange: raw || 'Unable to compare the provided files.'
            },
            usage: enrichedUsage
        };
    }

    /**
     * Text-only chat with AI assistant.
     * (Preserved — backward compatible)
     */
    async chatWithAssistant(messages, userContext = {}) {
        const systemPrompt = "You are a medical AI assistant helping doctors analyze reports and patient history. Provide concise, professional, and factual responses. Do not generate prescriptions or medical advice directly to patients, but assist the doctor in clinical reasoning.";
        const { text, usage } = await this._provider.chatCompletion(systemPrompt, messages);
        const enrichedUsage = await this._recordUsage('CLINICAL_CHAT', usage, userContext, { messageCount: messages.length });
        return { reply: text, usage: enrichedUsage };
    }

    /**
     * Chat with AI assistant + media attachments.
     * Allows doctors to ask questions about attached images/documents in chat.
     * @param {Array} messages - Chat messages [{role, content}]
     * @param {Array<{data: string, mimeType: string}>} mediaInputs - Attached media files
     * @param {Object} userContext - User/hospital context
     */
    async chatWithMedia(messages, mediaInputs, userContext = {}) {
        const systemPrompt = `You are a medical AI assistant helping doctors analyze reports, medical images, and patient history.
Provide concise, professional, and factual responses.
When analyzing medical images: use cautious language, report only visible findings, never provide definitive diagnoses.
Do not generate prescriptions or medical advice directly to patients, but assist the doctor in clinical reasoning.
Always note when findings are AI-assisted and should be confirmed by qualified medical review.`;

        const { text, usage } = await this._provider.chatWithMedia(systemPrompt, messages, mediaInputs);
        const enrichedUsage = await this._recordUsage('CLINICAL_CHAT_MEDIA', usage, userContext, {
            messageCount: messages.length,
            mediaCount: mediaInputs ? mediaInputs.length : 0
        });
        return { reply: text, usage: enrichedUsage };
    }
}

module.exports = new AIService();
