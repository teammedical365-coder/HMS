const axios = require('axios');

class KimiProvider {
    constructor() {
        this.baseURL = process.env.KIMI_BASE_URL || 'https://manishmahi505--ep-kimi-k3-server.us-west.modal.direct/v1';
        this.model = process.env.KIMI_MODEL || 'moonshotai/Kimi-K3';
        this.tokenId = process.env.MODAL_PROXY_TOKEN_ID;
        this.tokenSecret = process.env.MODAL_PROXY_TOKEN_SECRET;
        
        if (!this.tokenId || !this.tokenSecret) {
            console.warn("Kimi credentials (MODAL_PROXY_TOKEN_ID or MODAL_PROXY_TOKEN_SECRET) are missing.");
        }
    }

    get _headers() {
        return {
            'Authorization': `Bearer ${this.tokenId}.${this.tokenSecret}`,
            'Content-Type': 'application/json'
        };
    }

    _handleError(error) {
        if (error.code === 'ECONNABORTED') {
            throw new Error("Timeout: AI unavailable");
        }
        
        if (error.response) {
            const status = error.response.status;
            const apiMessage = error.response.data?.error || error.response.data?.message;
            if (status === 401) {
                throw new Error("Invalid Modal credentials");
            } else if (status === 429) {
                throw new Error(`Credit/quota limit reached: ${apiMessage || 'Unknown reason'}`);
            } else if (status >= 500) {
                throw new Error(`AI server error: ${apiMessage || 'Unknown reason'}`);
            }
            throw new Error(`AI Request failed with status ${status}: ${apiMessage || 'Unknown error'}`);
        }
        
        throw new Error(`AI Request failed: ${error.message}`);
    }

    async _makeRequest(messages) {
        try {
            const response = await axios.post(
                `${this.baseURL}/chat/completions`,
                {
                    model: this.model,
                    messages: messages,
                    temperature: 0.3,
                    max_tokens: 2048,
                    top_p: 0.95,
                    stream: false,
                    reasoning_effort: "none"
                },
                {
                    headers: this._headers,
                    timeout: 30000 // 30 seconds timeout
                }
            );

            return response.data.choices[0].message.content;
        } catch (error) {
            this._handleError(error);
        }
    }

    async analyzeImage(prompt, base64Image, mimeType) {
        let content = [{ type: "text", text: "Please analyze this document/image." }];

        if (mimeType === 'application/pdf') {
            try {
                const pdfParse = require('pdf-parse');
                const dataBuffer = Buffer.from(base64Image, 'base64');
                const pdfData = await pdfParse(dataBuffer);
                content.push({ type: "text", text: "Here is the extracted text from the PDF report:\n\n" + pdfData.text });
            } catch (err) {
                console.error("PDF Parsing error:", err);
                throw new Error("Failed to parse PDF document for AI processing.");
            }
        } else {
            content.push({ type: "image_url", image_url: { url: `data:${mimeType || 'application/octet-stream'};base64,${base64Image}` } });
        }

        const messages = [
            {
                role: "system",
                content: prompt
            },
            {
                role: "user",
                content: content
            }
        ];
        return await this._makeRequest(messages);
    }

    async compareImages(prompt, img1Base64, mime1, img2Base64, mime2) {
        let content = [{ type: "text", text: "Please compare these documents based on the system prompt." }];
        const pdfParse = require('pdf-parse');

        content.push({ type: "text", text: "Here is the latest report:" });
        if (mime1 === 'application/pdf') {
            try {
                const pdfData = await pdfParse(Buffer.from(img1Base64, 'base64'));
                content.push({ type: "text", text: "Extracted text:\n" + pdfData.text });
            } catch (err) {
                console.error("PDF Parsing error:", err);
                throw new Error("Failed to parse the latest PDF document for AI processing.");
            }
        } else {
            content.push({ type: "image_url", image_url: { url: `data:${mime1 || 'application/octet-stream'};base64,${img1Base64}` } });
        }

        content.push({ type: "text", text: "Here is the previous report:" });
        if (mime2 === 'application/pdf') {
            try {
                const pdfData = await pdfParse(Buffer.from(img2Base64, 'base64'));
                content.push({ type: "text", text: "Extracted text:\n" + pdfData.text });
            } catch (err) {
                console.error("PDF Parsing error:", err);
                throw new Error("Failed to parse the previous PDF document for AI processing.");
            }
        } else {
            content.push({ type: "image_url", image_url: { url: `data:${mime2 || 'application/octet-stream'};base64,${img2Base64}` } });
        }

        const messages = [
            {
                role: "system",
                content: prompt
            },
            {
                role: "user",
                content: content
            }
        ];
        return await this._makeRequest(messages);
    }

    async chatCompletion(systemPrompt, messages) {
        const formattedMessages = [
            { role: "system", content: systemPrompt },
            ...messages
        ];
        return await this._makeRequest(formattedMessages);
    }
}

module.exports = new KimiProvider();
