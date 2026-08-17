const geminiProvider = require('./providers/gemini.provider');
const kimiProvider = require('./providers/kimi.provider');

class AIService {
    get _provider() {
        const providerName = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
        if (providerName === 'kimi') {
            return kimiProvider;
        }
        return geminiProvider;
    }

    async extractReportText(base64Image, mimeType) {
        const prompt = "Extract all text from this medical report. Return ONLY the raw text word for word. Do not summarize or format. If the image is not a document or contains no text, return an empty string.";
        return await this._provider.analyzeImage(prompt, base64Image, mimeType);
    }

    async generateReportSummary(base64Image, mimeType) {
        const prompt = `You are a medical AI assistant. Analyze the provided medical report and return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ReportType": "Identified report type (e.g. Complete Blood Count, X-Ray, Unknown)",
  "OverallSummary": "Short overall summary (4-8 lines) of the report's main findings. NO diagnosis or treatment advice.",
  "ImportantFindings": ["Finding 1", "Finding 2"],
  "AbnormalValues": ["Parameter: Value", "Parameter: Value"]
}
Only include AbnormalValues if there are any, otherwise an empty array.
ImportantFindings should just be bullet points as an array of strings.`;
        
        const responseText = await this._provider.analyzeImage(prompt, base64Image, mimeType);
        
        let cleanedText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedText);
    }

    async compareReports(latestBase64, latestMime, prevBase64, prevMime) {
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
        
        const responseText = await this._provider.compareImages(prompt, latestBase64, latestMime, prevBase64, prevMime);
        
        let cleanedText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedText);
    }

    async chatWithAssistant(messages) {
        const systemPrompt = "You are a medical AI assistant helping doctors analyze reports and patient history. Provide concise, professional, and factual responses. Do not generate prescriptions or medical advice directly to patients, but assist the doctor in clinical reasoning.";
        return await this._provider.chatCompletion(systemPrompt, messages);
    }
}

module.exports = new AIService();
