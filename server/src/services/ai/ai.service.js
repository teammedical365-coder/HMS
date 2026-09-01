const geminiProvider = require('./providers/gemini.provider');
const aiWalletService = require('./aiWallet.service');
const { validateMedia, classifyContent } = require('./mediaValidator');
const { buildAnalysisPrompt, buildComparisonPrompt } = require('./promptBuilder');

class AIService {
    get _provider() {
        return geminiProvider;
    }

    /**
     * Process wallet deduction for an AI action.
     * Uses centralized AIWalletService.
     */
    async _processBilling(operation, rawUsage, userContext = {}, metadata = {}) {
        const hospitalId = userContext.hospitalId;
        const defaultModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        const usage = rawUsage || { promptTokens: 0, candidateTokens: 0, totalTokens: 0, modelName: defaultModel };

        if (!hospitalId) {
            console.warn(`[AI Wallet Billing Warning] No hospitalId provided for operation: ${operation}`);
            return {
                ...usage,
                actualApiCost: 0,
                estimatedCostInr: 0,
                estimatedCostUsd: 0,
                currency: 'INR'
            };
        }

        const billingResult = await aiWalletService.deductUsage({
            hospitalId,
            userId: userContext.userId,
            userRole: userContext.userRole || 'doctor',
            userName: userContext.userName || 'Doctor/Staff',
            patientId: userContext.patientId,
            operation,
            model: usage.modelName || defaultModel,
            rawUsage: usage,
            metadata
        });

        return {
            ...usage,
            actualApiCost: billingResult.actualCostInr || 0,
            estimatedCostInr: billingResult.actualCostInr || 0,
            estimatedCostUsd: billingResult.costUsd || 0,
            currency: 'INR',
            wallet: billingResult.wallet || null
        };
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
     */
    async extractReportText(base64Image, mimeType, userContext = {}) {
        const prompt = "Extract all text from this medical report. Return ONLY the raw text word for word. Do not summarize or format. If the image is not a document or contains no text, return an empty string.";
        const { text, usage } = await this._provider.analyzeImage(prompt, base64Image, mimeType);
        await this._processBilling('OCR_EXTRACTION', usage, userContext, { mimeType });
        return text;
    }

    /**
     * Generate a smart report summary — content-type-aware.
     */
    async generateReportSummary(base64Image, mimeType, userContext = {}, fileName = '') {
        const contentClass = classifyContent(mimeType, fileName);
        const prompt = buildAnalysisPrompt(contentClass, mimeType);

        console.log(`\x1b[36m[AI Analysis]\x1b[0m Content: \x1b[33m${contentClass}\x1b[0m | MIME: ${mimeType} | File: ${fileName || '(unnamed)'}`);

        const { text, usage } = await this._provider.analyzeImage(prompt, base64Image, mimeType);
        const billingUsage = await this._processBilling('REPORT_SUMMARY', usage, userContext, { mimeType, contentClass, fileName });
        
        const { parsed, raw } = this._parseJsonResponse(text);

        if (parsed) {
            return { summary: parsed, usage: billingUsage };
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
            usage: billingUsage
        };
    }

    /**
     * General media analysis — handles any supported file type with optional question.
     */
    async analyzeMedia(base64Data, mimeType, userContext = {}, userQuestion = '', fileName = '') {
        const contentClass = classifyContent(mimeType, fileName);
        const prompt = buildAnalysisPrompt(contentClass, mimeType, userQuestion);

        const operation = userQuestion ? 'MEDIA_QA' : 'MEDIA_ANALYSIS';
        console.log(`\x1b[36m[AI Media Analysis]\x1b[0m Class: \x1b[33m${contentClass}\x1b[0m | MIME: ${mimeType} | Question: ${userQuestion ? 'Yes' : 'No'}`);

        const { text, usage } = await this._provider.analyzeImage(prompt, base64Data, mimeType);
        const billingUsage = await this._processBilling(operation, usage, userContext, { mimeType, contentClass, fileName, hasQuestion: !!userQuestion });

        const { parsed, raw } = this._parseJsonResponse(text);

        if (parsed) {
            return { analysis: parsed, usage: billingUsage };
        }

        return {
            analysis: {
                ContentType: 'General Analysis',
                OverallSummary: raw || 'Unable to analyze the provided content.',
                VisibleObservations: [],
                NotableFindings: []
            },
            usage: billingUsage
        };
    }

    /**
     * Compare two reports/images — content-aware comparison.
     */
    async compareReports(latestBase64, latestMime, prevBase64, prevMime, userContext = {}) {
        const contentClass = classifyContent(latestMime, '');
        const prompt = buildComparisonPrompt(contentClass);
        
        const { text, usage } = await this._provider.compareImages(prompt, latestBase64, latestMime, prevBase64, prevMime);
        const billingUsage = await this._processBilling('REPORT_COMPARISON', usage, userContext, { latestMime, prevMime, contentClass });
        
        const { parsed, raw } = this._parseJsonResponse(text);

        if (parsed) {
            return { comparison: parsed, usage: billingUsage };
        }

        return {
            comparison: {
                NewFindings: [],
                RemovedFindings: [],
                ChangedFindings: [],
                OverallChange: raw || 'Unable to compare the provided files.'
            },
            usage: billingUsage
        };
    }

    /**
     * Text-only chat with AI assistant.
     */
    async chatWithAssistant(messages, userContext = {}) {
        const systemPrompt = "You are a medical AI assistant helping doctors analyze reports and patient history. Provide concise, professional, and factual responses. Do not generate prescriptions or medical advice directly to patients, but assist the doctor in clinical reasoning.";
        const { text, usage } = await this._provider.chatCompletion(systemPrompt, messages);
        const billingUsage = await this._processBilling('CLINICAL_CHAT', usage, userContext, { messageCount: messages.length });
        return { reply: text, usage: billingUsage };
    }

    /**
     * Chat with AI assistant + media attachments.
     */
    async chatWithMedia(messages, mediaInputs, userContext = {}) {
        const systemPrompt = `You are a medical AI assistant helping doctors analyze reports, medical images, and patient history.
Provide concise, professional, and factual responses.
When analyzing medical images: use cautious language, report only visible findings, never provide definitive diagnoses.
Do not generate prescriptions or medical advice directly to patients, but assist the doctor in clinical reasoning.
Always note when findings are AI-assisted and should be confirmed by qualified medical review.`;

        const { text, usage } = await this._provider.chatWithMedia(systemPrompt, messages, mediaInputs);
        const billingUsage = await this._processBilling('CLINICAL_CHAT_MEDIA', usage, userContext, {
            messageCount: messages.length,
            mediaCount: mediaInputs ? mediaInputs.length : 0
        });
        return { reply: text, usage: billingUsage };
    }
}

module.exports = new AIService();
