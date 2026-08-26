const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiProvider {
    _getClient() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn("GEMINI_API_KEY is not set.");
        }
        return new GoogleGenerativeAI(apiKey || '');
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
     * Analyze a single image/document with a text prompt.
     * (Preserved for backward compatibility)
     */
    async analyzeImage(prompt, base64Image, mimeType, modelName = (process.env.GEMINI_MODEL || "gemini-3.6-flash")) {
        const genAI = this._getClient();
        const model = genAI.getGenerativeModel({ model: modelName });
        const imageParts = [{
            inlineData: {
                data: base64Image,
                mimeType: mimeType || 'application/pdf'
            }
        }];
        const result = await model.generateContent([prompt, ...imageParts]);
        return {
            text: result.response.text(),
            usage: this._extractUsage(result, modelName)
        };
    }

    /**
     * Analyze one or more media inputs with a text prompt.
     * Supports multiple files for combined analysis.
     * @param {string} prompt - The analysis prompt
     * @param {Array<{data: string, mimeType: string}>} mediaInputs - Array of base64 media inputs
     * @param {string} [modelName] - Override model name
     */
    async analyzeMultimodal(prompt, mediaInputs, modelName = (process.env.GEMINI_MODEL || "gemini-3.6-flash")) {
        const genAI = this._getClient();
        const model = genAI.getGenerativeModel({ model: modelName });

        const parts = mediaInputs.map(input => ({
            inlineData: {
                data: input.data,
                mimeType: input.mimeType
            }
        }));

        const result = await model.generateContent([prompt, ...parts]);
        return {
            text: result.response.text(),
            usage: this._extractUsage(result, modelName)
        };
    }

    /**
     * Compare two images/documents.
     * (Preserved for backward compatibility)
     */
    async compareImages(prompt, img1Base64, mime1, img2Base64, mime2, modelName = (process.env.GEMINI_MODEL || "gemini-3.6-flash")) {
        const genAI = this._getClient();
        const model = genAI.getGenerativeModel({ model: modelName });
        const imageParts = [
            {
                inlineData: {
                    data: img1Base64,
                    mimeType: mime1 || 'application/pdf'
                }
            },
            {
                inlineData: {
                    data: img2Base64,
                    mimeType: mime2 || 'application/pdf'
                }
            }
        ];
        const result = await model.generateContent([prompt, ...imageParts]);
        return {
            text: result.response.text(),
            usage: this._extractUsage(result, modelName)
        };
    }

    /**
     * Text-only chat completion.
     * (Preserved for backward compatibility)
     */
    async chatCompletion(systemPrompt, messages, modelName = (process.env.GEMINI_MODEL || "gemini-3.6-flash")) {
        const genAI = this._getClient();
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
        
        // Convert OpenAI format messages to Gemini format
        const formattedHistory = messages.slice(0, -1).map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));
        
        const chat = model.startChat({
            history: formattedHistory,
        });

        const latestMessage = messages[messages.length - 1].content;
        const result = await chat.sendMessage(latestMessage);
        return {
            text: result.response.text(),
            usage: this._extractUsage(result, modelName)
        };
    }

    /**
     * Chat with media attachments — sends text messages along with images/documents.
     * @param {string} systemPrompt - System instruction
     * @param {Array} messages - Chat messages in OpenAI format [{role, content}]
     * @param {Array<{data: string, mimeType: string}>} mediaInputs - Media files to include
     * @param {string} [modelName] - Override model name
     */
    async chatWithMedia(systemPrompt, messages, mediaInputs, modelName = (process.env.GEMINI_MODEL || "gemini-3.6-flash")) {
        const genAI = this._getClient();
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });

        // Build history from all messages except the last one
        const formattedHistory = messages.slice(0, -1).map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const chat = model.startChat({
            history: formattedHistory,
        });

        // Build the latest message parts: text + media
        const latestText = messages[messages.length - 1].content;
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

        const result = await chat.sendMessage(messageParts);
        return {
            text: result.response.text(),
            usage: this._extractUsage(result, modelName)
        };
    }
}

module.exports = new GeminiProvider();
