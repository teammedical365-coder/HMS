const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Supported valid Google Gemini models in smart cascade order (all validated for generateContent)
const DEFAULT_MODELS = [
    'gemini-3.1-flash',
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
];

class GeminiProvider {
    constructor() {
        this._runtimeApiKey = null;
        this._runtimeModel = null;
    }

    /**
     * Set runtime API key override (e.g. updated from Admin panel)
     */
    setRuntimeConfig({ apiKey, model }) {
        if (apiKey) this._runtimeApiKey = apiKey.trim();
        if (model) this._runtimeModel = model.trim();
    }

    /**
     * Normalize any user model string to standard Gemini format.
     * Handles: '3.1-flash', '3.5-flash', '3.1', '3.5', 'gemini-3.1-flash', etc.
     */
    _normalizeModelName(rawModel) {
        if (!rawModel) return 'gemini-3.1-flash';
        let clean = rawModel.toLowerCase().trim().replace(/^["']|["']$/g, '');
        clean = clean.replace(/\s+/g, '-'); // replace spaces with hyphens

        if (clean === '3.1' || clean === '3.1-flash' || clean === 'flash-3.1') return 'gemini-3.1-flash';
        if (clean === '3.5' || clean === '3.5-flash' || clean === 'flash-3.5') return 'gemini-3.5-flash';
        if (clean === '3.7' || clean === '3.7-flash' || clean === 'flash-3.7') return 'gemini-3.7-flash';
        if (clean === '2.5' || clean === '2.5-flash' || clean === 'flash-2.5') return 'gemini-2.5-flash';
        if (clean === '2.0' || clean === '2.0-flash' || clean === 'flash-2.0' || clean === '2') return 'gemini-2.0-flash';
        if (clean === '1.5' || clean === '1.5-flash' || clean === 'flash-1.5' || clean === 'flash') return 'gemini-1.5-flash';
        if (clean === '1.5-pro' || clean === 'pro') return 'gemini-1.5-pro';

        if (!clean.startsWith('gemini-')) {
            clean = `gemini-${clean}`;
        }
        return clean;
    }

    /**
     * Get all configured Gemini API keys (supports single, comma-separated, or pool).
     * Strips quotes, whitespace, and invalid characters.
     */
    _getApiKeys() {
        // Reload latest .env dynamically if file exists
        try {
            const envPath = path.resolve(__dirname, '../../../../.env');
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf8');
                const matchKey = envContent.match(/^GEMINI_API_KEY\s*=\s*(.*)$/m);
                if (matchKey && matchKey[1]) {
                    process.env.GEMINI_API_KEY = matchKey[1].trim().replace(/^["']|["']$/g, '');
                }
                const matchModel = envContent.match(/^GEMINI_MODEL\s*=\s*(.*)$/m);
                if (matchModel && matchModel[1]) {
                    process.env.GEMINI_MODEL = matchModel[1].trim().replace(/^["']|["']$/g, '');
                }
            }
        } catch (e) {
            // Ignore file read error in restricted envs
        }

        const rawKeys = [];
        if (this._runtimeApiKey) rawKeys.push(this._runtimeApiKey);
        if (process.env.GEMINI_API_KEYS) rawKeys.push(process.env.GEMINI_API_KEYS);
        if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);

        const keys = [];
        for (const raw of rawKeys) {
            if (!raw) continue;
            // Split by comma in case user provides multiple keys
            const parts = raw.split(',');
            for (let p of parts) {
                p = p.trim().replace(/^["']|["']$/g, ''); // strip quotes
                if (p && !keys.includes(p)) {
                    keys.push(p);
                }
            }
        }

        return keys;
    }

    /**
     * Build list of candidate models starting with the requested one,
     * falling back to reliable standard Gemini models if an invalid or unsupported model was requested.
     */
    _getModelCandidates(requestedModel) {
        const envModel = (this._runtimeModel || process.env.GEMINI_MODEL || '').trim().replace(/^["']|["']$/g, '');
        const target = requestedModel || envModel || 'gemini-3.1-flash';
        const normalizedTarget = this._normalizeModelName(target);

        const candidates = [];
        if (target && !candidates.includes(target)) candidates.push(target);
        if (normalizedTarget && !candidates.includes(normalizedTarget)) candidates.push(normalizedTarget);

        for (const def of DEFAULT_MODELS) {
            if (!candidates.includes(def)) {
                candidates.push(def);
            }
        }
        return candidates;
    }

    _extractUsage(result, modelName) {
        const meta = result?.response?.usageMetadata || {};
        const promptTokens = meta.promptTokenCount || 0;
        const candidateTokens = meta.candidatesTokenCount || 0;
        const totalTokens = meta.totalTokenCount || (promptTokens + candidateTokens);
        return {
            promptTokens,
            candidateTokens,
            totalTokens,
            modelName
        };
    }

    /**
     * Formats error to provide crystal-clear guidance to the user.
     */
    _formatError(error) {
        const msg = error?.message || String(error);
        const status = error?.status || error?.statusCode;

        if (status === 401 || msg.includes('401') || msg.includes('API_KEY_INVALID') || msg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
            const keys = this._getApiKeys();
            const firstKeyPreview = keys[0] ? `${keys[0].substring(0, 4)}...` : 'none';
            return new Error(
                `Google Gemini Authentication Error: Invalid API key (${firstKeyPreview}). ` +
                `Google AI Studio API keys start with "AIzaSy...". ` +
                `Please get a free API key from https://aistudio.google.com/app/apikey and save it to GEMINI_API_KEY in server/.env`
            );
        }

        if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
            return new Error(
                `Gemini API Rate Limit / Quota Exceeded. Please wait a few seconds or add a backup key to GEMINI_API_KEY.`
            );
        }

        if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
            return new Error(
                `Unable to reach Google Gemini servers. Please check your network connection.`
            );
        }

        return error;
    }

    /**
     * Executes an AI operation with automatic multi-key failover and model fallback cascade.
     */
    async _executeWithRetry(operationName, executor, requestedModel) {
        const keys = this._getApiKeys();
        if (keys.length === 0) {
            throw new Error(
                'No Gemini API Key found. Please add GEMINI_API_KEY="AIzaSy..." to server/.env (get a free key at https://aistudio.google.com/app/apikey).'
            );
        }

        const modelCandidates = this._getModelCandidates(requestedModel);
        let lastError = null;

        for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
            const apiKey = keys[keyIdx];
            const maskedKey = `${apiKey.substring(0, 6)}...${apiKey.slice(-4)}`;

            for (const modelName of modelCandidates) {
                try {
                    const genAI = new GoogleGenerativeAI(apiKey);
                    const result = await executor(genAI, modelName);
                    return {
                        result,
                        modelName,
                        usage: this._extractUsage(result, modelName)
                    };
                } catch (err) {
                    lastError = err;
                    const errStatus = err?.status || err?.statusCode;
                    const errMsg = err?.message || '';

                    console.warn(
                        `[Gemini ${operationName}] Key #${keyIdx + 1} (${maskedKey}) failed with model "${modelName}":`,
                        errMsg
                    );

                    // If model not found (404), try next model candidate with same key
                    if (errStatus === 404 || errMsg.includes('404') || errMsg.includes('models/')) {
                        continue;
                    }

                    // If auth error (401) or rate limit (429), break model loop and try next API key in pool
                    if (errStatus === 401 || errStatus === 429 || errMsg.includes('401') || errMsg.includes('429')) {
                        break;
                    }
                }
            }
        }

        throw this._formatError(lastError);
    }

    /**
     * Analyze a single image/document with a text prompt.
     */
    async analyzeImage(prompt, base64Image, mimeType, modelName) {
        const { result, modelName: resolvedModel } = await this._executeWithRetry('analyzeImage', async (genAI, model) => {
            const generativeModel = genAI.getGenerativeModel({ model });
            const imageParts = [{
                inlineData: {
                    data: base64Image,
                    mimeType: mimeType || 'application/pdf'
                }
            }];
            return await generativeModel.generateContent([prompt, ...imageParts]);
        }, modelName);

        return {
            text: result.response.text(),
            usage: this._extractUsage(result, resolvedModel)
        };
    }

    /**
     * Analyze one or more media inputs with a text prompt.
     */
    async analyzeMultimodal(prompt, mediaInputs, modelName) {
        const { result, modelName: resolvedModel } = await this._executeWithRetry('analyzeMultimodal', async (genAI, model) => {
            const generativeModel = genAI.getGenerativeModel({ model });
            const parts = mediaInputs.map(input => ({
                inlineData: {
                    data: input.data,
                    mimeType: input.mimeType
                }
            }));
            return await generativeModel.generateContent([prompt, ...parts]);
        }, modelName);

        return {
            text: result.response.text(),
            usage: this._extractUsage(result, resolvedModel)
        };
    }

    /**
     * Compare two images/documents.
     */
    async compareImages(prompt, img1Base64, mime1, img2Base64, mime2, modelName) {
        const { result, modelName: resolvedModel } = await this._executeWithRetry('compareImages', async (genAI, model) => {
            const generativeModel = genAI.getGenerativeModel({ model });
            const imageParts = [
                { inlineData: { data: img1Base64, mimeType: mime1 || 'application/pdf' } },
                { inlineData: { data: img2Base64, mimeType: mime2 || 'application/pdf' } }
            ];
            return await generativeModel.generateContent([prompt, ...imageParts]);
        }, modelName);

        return {
            text: result.response.text(),
            usage: this._extractUsage(result, resolvedModel)
        };
    }

    _formatHistory(messages) {
        if (!Array.isArray(messages) || messages.length <= 1) return [];
        
        const history = messages.slice(0, -1).map(msg => ({
            role: (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user',
            parts: [{ text: typeof msg.content === 'string' ? msg.content : (msg.text || '') }]
        }));

        // Google Generative AI strictly requires history to start with role 'user'.
        // If history starts with initial assistant greeting, strip it.
        while (history.length > 0 && history[0].role === 'model') {
            history.shift();
        }

        // Ensure alternating roles (merge consecutive identical roles)
        const cleanHistory = [];
        for (const item of history) {
            if (cleanHistory.length === 0 || cleanHistory[cleanHistory.length - 1].role !== item.role) {
                cleanHistory.push(item);
            } else {
                cleanHistory[cleanHistory.length - 1].parts[0].text += '\n\n' + item.parts[0].text;
            }
        }

        return cleanHistory;
    }

    /**
     * Text-only chat completion.
     */
    async chatCompletion(systemPrompt, messages, modelName) {
        const { result, modelName: resolvedModel } = await this._executeWithRetry('chatCompletion', async (genAI, model) => {
            const generativeModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
            const formattedHistory = this._formatHistory(messages);
            const chat = generativeModel.startChat({ history: formattedHistory });
            const latestMsgObj = messages[messages.length - 1];
            const latestMessage = typeof latestMsgObj === 'string' ? latestMsgObj : (latestMsgObj.content || latestMsgObj.text || '');
            return await chat.sendMessage(latestMessage);
        }, modelName);

        return {
            text: result.response.text(),
            usage: this._extractUsage(result, resolvedModel)
        };
    }

    /**
     * Chat with media attachments.
     */
    async chatWithMedia(systemPrompt, messages, mediaInputs, modelName) {
        const { result, modelName: resolvedModel } = await this._executeWithRetry('chatWithMedia', async (genAI, model) => {
            const generativeModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
            const formattedHistory = this._formatHistory(messages);
            const chat = generativeModel.startChat({ history: formattedHistory });
            const latestMsgObj = messages[messages.length - 1];
            const latestText = typeof latestMsgObj === 'string' ? latestMsgObj : (latestMsgObj.content || latestMsgObj.text || '');
            const messageParts = [latestText];

            if (mediaInputs && mediaInputs.length > 0) {
                mediaInputs.forEach(input => {
                    messageParts.push({
                        inlineData: {
                            data: input.data,
                            mimeType: input.mimeType
                        }
                    });
                });
            }

            return await chat.sendMessage(messageParts);
        }, modelName);

        return {
            text: result.response.text(),
            usage: this._extractUsage(result, resolvedModel)
        };
    }
}

module.exports = new GeminiProvider();
