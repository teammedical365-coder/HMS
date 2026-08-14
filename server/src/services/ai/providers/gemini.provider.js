const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiProvider {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            console.warn("GEMINI_API_KEY is not set.");
        }
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    }

    async analyzeImage(prompt, base64Image, mimeType, modelName = "gemini-1.5-pro-latest") {
        const model = this.genAI.getGenerativeModel({ model: modelName });
        const imageParts = [{
            inlineData: {
                data: base64Image,
                mimeType: mimeType || 'application/pdf'
            }
        }];
        const result = await model.generateContent([prompt, ...imageParts]);
        return result.response.text();
    }

    async compareImages(prompt, img1Base64, mime1, img2Base64, mime2, modelName = "gemini-1.5-pro-latest") {
        const model = this.genAI.getGenerativeModel({ model: modelName });
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
        return result.response.text();
    }

    async chatCompletion(systemPrompt, messages, modelName = "gemini-1.5-pro-latest") {
        // Gemini expects messages in a specific format for multi-turn chat, or we can just send it as a single prompt
        const model = this.genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
        
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
        return result.response.text();
    }
}

module.exports = new GeminiProvider();
