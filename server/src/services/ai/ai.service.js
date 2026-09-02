const geminiProvider = require('./providers/gemini.provider');
const aiWalletService = require('./aiWallet.service');
const { validateMedia, classifyContent } = require('./mediaValidator');
const { buildAnalysisPrompt, buildComparisonPrompt } = require('./promptBuilder');

class AIService {
    get _provider() {
        return geminiProvider;
    }

    /**
     * Process wallet deduction for a successful AI action.
     * Uses centralized AIWalletService.
     */
    async _processBilling(operation, rawUsage, userContext = {}, metadata = {}) {
        const hospitalId = userContext.hospitalId;
        const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
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
            wallet: billingResult.wallet || null,
            warningLevel: billingResult.warningLevel || null,
            warningMessage: billingResult.warningMessage || null
        };
    }

    /**
     * Record a failed AI request — no wallet charge.
     */
    async _recordFailure(operation, userContext = {}, errorMessage = '', metadata = {}) {
        if (!userContext.hospitalId) return;
        try {
            await aiWalletService.recordFailure({
                hospitalId: userContext.hospitalId,
                userId: userContext.userId,
                userRole: userContext.userRole || 'doctor',
                userName: userContext.userName || 'Doctor/Staff',
                patientId: userContext.patientId,
                operation,
                model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
                error: errorMessage,
                metadata
            });
        } catch (err) {
            console.error('[AI Service] recordFailure error:', err.message);
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
     */
    async extractReportText(base64Image, mimeType, userContext = {}) {
        const prompt = "Extract all text from this medical report. Return ONLY the raw text word for word. Do not summarize or format. If the image is not a document or contains no text, return an empty string.";
        try {
            const { text, usage } = await this._provider.analyzeImage(prompt, base64Image, mimeType);
            await this._processBilling('OCR_EXTRACTION', usage, userContext, { mimeType });
            return text;
        } catch (err) {
            await this._recordFailure('OCR_EXTRACTION', userContext, err.message, { mimeType });
            throw err;
        }
    }

    /**
     * Generate a smart report summary — content-type-aware.
     */
    async generateReportSummary(base64Image, mimeType, userContext = {}, fileName = '') {
        const contentClass = classifyContent(mimeType, fileName);
        const prompt = buildAnalysisPrompt(contentClass, mimeType);

        console.log(`\x1b[36m[AI Analysis]\x1b[0m Content: \x1b[33m${contentClass}\x1b[0m | MIME: ${mimeType} | File: ${fileName || '(unnamed)'}`);

        try {
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
        } catch (err) {
            await this._recordFailure('REPORT_SUMMARY', userContext, err.message, { mimeType, contentClass, fileName });
            throw err;
        }
    }

    /**
     * General media analysis — handles any supported file type with optional question.
     */
    async analyzeMedia(base64Data, mimeType, userContext = {}, userQuestion = '', fileName = '') {
        const contentClass = classifyContent(mimeType, fileName);
        const prompt = buildAnalysisPrompt(contentClass, mimeType, userQuestion);

        const operation = userQuestion ? 'MEDIA_QA' : 'MEDIA_ANALYSIS';
        console.log(`\x1b[36m[AI Media Analysis]\x1b[0m Class: \x1b[33m${contentClass}\x1b[0m | MIME: ${mimeType} | Question: ${userQuestion ? 'Yes' : 'No'}`);

        try {
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
        } catch (err) {
            await this._recordFailure(operation, userContext, err.message, { mimeType, contentClass, fileName });
            throw err;
        }
    }

    /**
     * Compare two reports/images — content-aware comparison.
     */
    async compareReports(latestBase64, latestMime, prevBase64, prevMime, userContext = {}) {
        const contentClass = classifyContent(latestMime, '');
        const prompt = buildComparisonPrompt(contentClass);
        
        try {
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
        } catch (err) {
            await this._recordFailure('REPORT_COMPARISON', userContext, err.message, { latestMime, prevMime, contentClass });
            throw err;
        }
    }

    /**
     * Text-only chat with AI assistant.
     */
    async chatWithAssistant(messages, userContext = {}) {
        const systemPrompt = `You are the Medical365 AI Assistant, a professional clinical assistance and medical report explanation tool.
Your purpose is to assist healthcare professionals by:
- Summarizing medical reports, diagnostic tests, and clinical documents accurately.
- Explaining medical terminology, physiological parameters, and laboratory test markers.
- Identifying and clearly presenting values, reference ranges, and observations explicitly present in the reports.
- Comparing reported values and highlighting trends/changes across reports.
- Explaining general medical context and summarizing patient history from available records.
- When the doctor asks about clinical management, treatment options, or care pathways ("ilaj / management"), provide 2 to 3 standard evidence-based clinical management options or protocol considerations clearly as structured bullet points for the treating doctor's evaluation.
- Structuring responses clearly with Markdown: headings (##), clean bullet points, tables for numerical/test comparisons, and bold key metrics.

CRITICAL MEDICAL SAFETY RULES:
- Frame treatment/management options as standard clinical considerations/protocols for the physician's evaluation, not definitive prescriptions for patients.
- Base report analysis ONLY on information explicitly visible in the provided records. Never fabricate values.
- Maintain professional, concise, objective, and clear clinical language.
- Conclude clinical management responses with: "Clinical decisions and final diagnosis should be confirmed by the treating healthcare professional."`;

        try {
            const { text, usage } = await this._provider.chatCompletion(systemPrompt, messages);
            const billingUsage = await this._processBilling('CLINICAL_CHAT', usage, userContext, { messageCount: messages.length });
            return { reply: text, usage: billingUsage };
        } catch (err) {
            await this._recordFailure('CLINICAL_CHAT', userContext, err.message, { messageCount: messages.length });
            throw err;
        }
    }

    /**
     * Chat with AI assistant + media attachments.
     */
    async chatWithMedia(messages, mediaInputs, userContext = {}) {
        const systemPrompt = `You are the Medical365 AI Assistant, a professional clinical assistance and medical report explanation tool.
Provide concise, professional, and factual responses structured with clean Markdown.
When analyzing medical images or uploaded reports: read all visible text, laboratory parameters, and anatomical observations carefully.
When the doctor asks about treatment pathways or management options, outline 2 to 3 standard evidence-based clinical management options for the doctor's review.
Always assist the doctor in understanding report metrics and factual document observations.`;

        try {
            const { text, usage } = await this._provider.chatWithMedia(systemPrompt, messages, mediaInputs);
            const billingUsage = await this._processBilling('CLINICAL_CHAT_MEDIA', usage, userContext, {
                messageCount: messages.length,
                mediaCount: mediaInputs ? mediaInputs.length : 0
            });
            return { reply: text, usage: billingUsage };
        } catch (err) {
            await this._recordFailure('CLINICAL_CHAT_MEDIA', userContext, err.message, {
                messageCount: messages.length,
                mediaCount: mediaInputs ? mediaInputs.length : 0
            });
            throw err;
        }
    }
}

module.exports = new AIService();
