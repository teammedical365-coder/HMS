const geminiProvider = require('./providers/gemini.provider');
const aiWalletService = require('./aiWallet.service');

/**
 * VoiceScribeService — Handles audio transcription and medical AI analysis
 * for doctor-patient voice consultations.
 *
 * Uses the existing Gemini provider for audio processing and
 * AI Wallet for billing integration.
 */
class VoiceScribeService {

    /**
     * Build the medical scribe system prompt based on output language.
     */
    _buildSystemPrompt(outputLanguage = 'English') {
        return `You are Medical365 AI Voice Scribe — a professional medical transcription and clinical documentation assistant.

Your task: Listen to a doctor-patient consultation audio and produce a STRUCTURED CLINICAL NOTE.

INSTRUCTIONS:
1. Transcribe the entire conversation accurately, preserving the original language(s) spoken.
2. Identify speakers as "Doctor" and "Patient" where distinguishable. If uncertain, use "Speaker 1" and "Speaker 2".
3. Detect ALL languages spoken (Hindi, English, Hinglish, Bengali, Tamil, Telugu, Kannada, Marathi, Gujarati, Punjabi, Malayalam, Urdu, Odia, Assamese, or any other language).
4. Understand medical meaning from mixed-language/code-switched speech. For example:
   - "Mujhe teen din se fever hai" → Chief Complaint: Fever, Duration: 3 days
   - "Body me bahut weakness lag rahi hai" → Associated Symptom: Generalized weakness
5. Generate the clinical summary and SOAP note in ${outputLanguage}.
6. NEVER invent symptoms, diagnoses, medications, or findings that were NOT explicitly discussed.
7. If something was not mentioned, use "Not mentioned" or omit it.
8. NEVER treat AI interpretation as a confirmed diagnosis unless the doctor explicitly stated it.

OUTPUT FORMAT — Return ONLY valid JSON (no markdown, no code fences):
{
  "transcript": "Full conversation transcript with speaker labels",
  "speakerSegments": [
    { "speaker": "Doctor", "text": "...", "timestamp": "" },
    { "speaker": "Patient", "text": "...", "timestamp": "" }
  ],
  "detectedLanguages": ["Hindi", "English"],
  "clinicalSummary": {
    "chiefComplaint": [],
    "historyOfPresentIllness": "",
    "symptoms": [],
    "duration": [],
    "associatedSymptoms": [],
    "relevantHistory": [],
    "medicationsMentioned": [],
    "allergiesMentioned": [],
    "examinationFindings": [],
    "vitalsMentioned": [],
    "investigationsMentioned": [],
    "previousDiagnosis": [],
    "assessment": [],
    "plan": [],
    "followUp": "",
    "importantPoints": []
  },
  "soap": {
    "subjective": "",
    "objective": "",
    "assessment": "",
    "plan": ""
  }
}

CRITICAL SAFETY RULES:
- You are an ASSISTANT, not a clinical decision-maker.
- Only reflect what was EXPLICITLY stated by the doctor and patient.
- If the doctor did NOT state a diagnosis, set assessment to "Assessment not explicitly documented by the physician."
- Do NOT prescribe, diagnose, or recommend treatment on your own.`;
    }

    /**
     * Parse Gemini response as JSON with fallback handling.
     */
    _parseResponse(text) {
        let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(cleaned);
        } catch (e) {
            // Try to extract JSON from mixed content
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch (e2) {
                    // Fall through
                }
            }
            // Return a minimal structure with raw text as transcript
            return {
                transcript: cleaned,
                speakerSegments: [],
                detectedLanguages: [],
                clinicalSummary: {
                    chiefComplaint: [],
                    historyOfPresentIllness: cleaned,
                    symptoms: [], duration: [], associatedSymptoms: [],
                    relevantHistory: [], medicationsMentioned: [],
                    allergiesMentioned: [], examinationFindings: [],
                    vitalsMentioned: [], investigationsMentioned: [],
                    previousDiagnosis: [], assessment: [], plan: [],
                    followUp: '', importantPoints: []
                },
                soap: {
                    subjective: cleaned,
                    objective: 'Unable to parse structured response.',
                    assessment: 'Assessment not explicitly documented.',
                    plan: ''
                }
            };
        }
    }

    /**
     * Process billing for a voice scribe operation.
     */
    async _processBilling(usage, userContext = {}, metadata = {}) {
        const hospitalId = userContext.hospitalId;
        const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        const usageData = usage || { promptTokens: 0, candidateTokens: 0, totalTokens: 0, modelName: defaultModel };

        if (!hospitalId) {
            console.warn('[Voice Scribe] No hospitalId for billing');
            return { ...usageData, actualApiCost: 0, estimatedCostInr: 0, currency: 'INR' };
        }

        try {
            const billingResult = await aiWalletService.deductUsage({
                hospitalId,
                userId: userContext.userId,
                userRole: userContext.userRole || 'doctor',
                userName: userContext.userName || 'Doctor',
                patientId: userContext.patientId,
                operation: 'VOICE_SCRIBE',
                model: usageData.modelName || defaultModel,
                rawUsage: usageData,
                metadata
            });

            return {
                ...usageData,
                actualApiCost: billingResult.actualCostInr || 0,
                estimatedCostInr: billingResult.actualCostInr || 0,
                estimatedCostUsd: billingResult.costUsd || 0,
                currency: 'INR',
                wallet: billingResult.wallet || null,
                warningLevel: billingResult.warningLevel || null,
                warningMessage: billingResult.warningMessage || null
            };
        } catch (err) {
            console.error('[Voice Scribe] Billing error:', err.message);
            return { ...usageData, actualApiCost: 0, estimatedCostInr: 0, currency: 'INR' };
        }
    }

    /**
     * Record a failed voice scribe attempt (no charge).
     */
    async _recordFailure(userContext = {}, errorMessage = '', metadata = {}) {
        if (!userContext.hospitalId) return;
        try {
            await aiWalletService.recordFailure({
                hospitalId: userContext.hospitalId,
                userId: userContext.userId,
                userRole: userContext.userRole || 'doctor',
                userName: userContext.userName || 'Doctor',
                patientId: userContext.patientId,
                operation: 'VOICE_SCRIBE',
                model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
                error: errorMessage,
                metadata
            });
        } catch (err) {
            console.error('[Voice Scribe] recordFailure error:', err.message);
        }
    }

    /**
     * Main method: Transcribe audio and generate clinical analysis.
     *
     * @param {string} audioBase64 - Base64-encoded audio data
     * @param {string} mimeType - Audio MIME type (audio/webm, audio/ogg, audio/mp4, etc.)
     * @param {string} outputLanguage - Language for the clinical note output
     * @param {object} userContext - { hospitalId, userId, userRole, userName, patientId }
     * @param {string} liveTranscript - Optional browser-side live transcript for context
     * @returns {object} { transcript, speakerSegments, detectedLanguages, clinicalSummary, soap, usage }
     */
    async transcribeAndAnalyze(audioBase64, mimeType, outputLanguage = 'English', userContext = {}, liveTranscript = '') {
        if (!audioBase64) {
            throw new Error('No audio data provided for transcription.');
        }

        const systemPrompt = this._buildSystemPrompt(outputLanguage);

        try {
            const { text, usage } = await geminiProvider.transcribeAudio(
                systemPrompt,
                audioBase64,
                mimeType
            );

            const parsed = this._parseResponse(text);
            const billingUsage = await this._processBilling(usage, userContext, {
                mimeType,
                outputLanguage,
                audioSizeBytes: Math.round(audioBase64.length * 0.75) // approximate decoded size
            });

            return {
                transcript: parsed.transcript || '',
                speakerSegments: parsed.speakerSegments || [],
                detectedLanguages: parsed.detectedLanguages || [],
                clinicalSummary: parsed.clinicalSummary || {},
                soap: parsed.soap || {},
                usage: billingUsage
            };
        } catch (err) {
            await this._recordFailure(userContext, err.message, { mimeType, outputLanguage });
            throw err;
        }
    }
}

module.exports = new VoiceScribeService();
