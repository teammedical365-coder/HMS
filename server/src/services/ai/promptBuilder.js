/**
 * Prompt Builder — Content-type-aware prompt construction
 * for the Medical365 AI multimodal analysis system.
 * 
 * Generates the appropriate Gemini prompt based on the detected content type,
 * ensuring medical safety, factual accuracy, and proper output formatting.
 */

const MEDICAL_DISCLAIMER = `
IMPORTANT: This is an AI-assisted observation summary and NOT a definitive medical diagnosis.
All findings should be reviewed and confirmed by a qualified medical professional.
Do not use this summary as a substitute for professional medical evaluation.`;

/**
 * Build the summary/analysis prompt based on content classification.
 * @param {string} contentClass - 'text-report' | 'medical-image' | 'document' | 'chart-table' | 'photo' | 'unknown'
 * @param {string} mimeType - The resolved MIME type
 * @param {string} [userQuestion] - Optional user question about the content
 * @returns {string} The prompt string
 */
function buildAnalysisPrompt(contentClass, mimeType, userQuestion) {
    // If user asked a specific question, wrap it with context-aware instructions
    if (userQuestion && userQuestion.trim()) {
        return buildQuestionPrompt(contentClass, userQuestion.trim());
    }

    switch (contentClass) {
        case 'medical-image':
            return buildMedicalImagePrompt();
        case 'chart-table':
            return buildChartTablePrompt();
        case 'text-report':
            return buildTextReportPrompt();
        case 'document':
            return buildDocumentPrompt(mimeType);
        case 'photo':
            return buildPhotoAnalysisPrompt();
        default:
            return buildGeneralAnalysisPrompt();
    }
}

function buildTextReportPrompt() {
    return `You are a medical AI assistant. Analyze the provided medical report and return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ContentType": "Text Report",
  "ReportType": "Identified report type (e.g. Complete Blood Count, Lipid Profile, Thyroid Panel, Urinalysis, Unknown)",
  "OverallSummary": "Short overall summary (4-8 lines) of the report's main findings. NO diagnosis or treatment advice.",
  "ImportantFindings": ["Finding 1", "Finding 2"],
  "AbnormalValues": ["Parameter: Value (Reference Range)"]
}
Only include AbnormalValues if there are any, otherwise an empty array.
ImportantFindings should be bullet points as an array of strings.
Do NOT generate any diagnosis, treatment suggestions, or prescriptions.`;
}

function buildMedicalImagePrompt() {
    return `You are a medical AI assistant specialized in medical image analysis.
Analyze the provided medical image carefully and return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ContentType": "Medical Image",
  "ImageType": "Identified image type (e.g. X-Ray, MRI, CT Scan, Ultrasound, ECG, Unknown)",
  "BodyRegion": "Identified body region if visible (e.g. Chest, Abdomen, Spine, Extremity, or 'Not Identifiable')",
  "ImageQuality": "Adequate / Limited / Insufficient",
  "OverallSummary": "Brief 3-5 line factual summary of what is visible in the image.",
  "VisibleObservations": ["Observation 1", "Observation 2"],
  "NotableFindings": ["Finding 1 (if any)"],
  "Disclaimer": "This is an AI-assisted observation summary and not a definitive medical diagnosis. All findings should be reviewed by a qualified medical professional."
}

CRITICAL RULES:
- Report ONLY what you can actually see in the image. Never fabricate or assume findings.
- Use cautious language: "appears to show", "suggestive of", "possible", "consistent with".
- If image quality is insufficient for reliable analysis, set ImageQuality to "Insufficient" and state limitations.
- If you cannot identify meaningful medical content, say so clearly.
- Do NOT provide definitive diagnoses, treatment plans, or prescriptions.
- NotableFindings should only contain observations with clinical significance. Use an empty array if none.`;
}

function buildChartTablePrompt() {
    return `You are a medical AI assistant. Analyze the provided chart, table, graph, or diagram.
Return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ContentType": "Chart/Table",
  "ChartType": "Type of chart or visualization (e.g. Bar Chart, Line Graph, Data Table, Flow Diagram, Pie Chart, Unknown)",
  "OverallSummary": "Summary of what the chart/table shows (3-5 lines).",
  "VisibleObservations": ["Data point or trend 1", "Data point or trend 2"],
  "NotableFindings": ["Key insight 1", "Key insight 2"],
  "ExtractedData": ["Key value or data point from the chart/table"]
}

Read and extract all visible text, numbers, labels, axes, and data points.
Describe trends, comparisons, or patterns visible in the data.
If it is a data table, extract the key rows and columns.
Do NOT invent data that is not visible.`;
}

function buildDocumentPrompt(mimeType) {
    if (mimeType === 'application/pdf') {
        return `You are a medical AI assistant. Analyze the provided document thoroughly.
This document may contain text, images, charts, tables, or a combination.
Return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ContentType": "Document",
  "ReportType": "Identified document/report type (e.g. Complete Blood Count, Discharge Summary, Prescription, Medical Certificate, Unknown)",
  "OverallSummary": "Comprehensive summary (4-8 lines) covering both textual and visual content. NO diagnosis or treatment advice.",
  "ImportantFindings": ["Finding 1", "Finding 2"],
  "AbnormalValues": ["Parameter: Value (Reference Range)"],
  "VisibleObservations": ["Visual observation from embedded images/charts, if any"]
}
Only include AbnormalValues if there are any, otherwise an empty array.
Only include VisibleObservations if the document contains images/charts, otherwise an empty array.
Analyze both text AND any embedded images, tables, or charts.
Do NOT generate any diagnosis, treatment suggestions, or prescriptions.`;
    }
    return buildGeneralAnalysisPrompt();
}

function buildPhotoAnalysisPrompt() {
    return `You are a medical AI assistant. Analyze the provided image carefully.
This image may be a medical report photo, a clinical photograph, a scanned document, a screenshot, or any other visual content.
Return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ContentType": "Image Analysis",
  "ImageType": "What the image appears to show (e.g. Medical Report Photo, Clinical Photo, Scanned Document, Screenshot, General Photo)",
  "OverallSummary": "Summary of the image content (3-6 lines). Read any visible text. Describe visual elements.",
  "VisibleObservations": ["Observation 1", "Observation 2"],
  "NotableFindings": ["Finding 1 (if clinically relevant)"],
  "ExtractedText": "Any text visible in the image, transcribed accurately. Return empty string if no text is visible."
}

RULES:
- If the image contains a medical report or document, read and extract all visible text.
- If it is a clinical photograph, describe what is visible factually without diagnosis.
- If it shows a medical image (X-ray, scan), use cautious observational language.
- Never fabricate information that is not visible in the image.
- For any medical content, add: "AI-assisted analysis — confirm with qualified medical professional."`;
}

function buildGeneralAnalysisPrompt() {
    return `You are a medical AI assistant. Analyze the provided content carefully.
Return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ContentType": "General Analysis",
  "OverallSummary": "Summary of the content (3-6 lines). Describe what you see.",
  "VisibleObservations": ["Observation 1", "Observation 2"],
  "NotableFindings": ["Finding 1 (if any)"],
  "ExtractedText": "Any text visible in the content. Return empty string if none."
}

Describe the content factually. Read any visible text. Identify any medical relevance.
Do NOT provide diagnoses or treatment recommendations.`;
}

function buildQuestionPrompt(contentClass, question) {
    let contextInstruction = '';

    if (contentClass === 'medical-image') {
        contextInstruction = `This is a medical image. When answering, use cautious observational language.
Do NOT provide definitive diagnoses. Use phrases like "appears to show", "suggestive of", "consistent with".
Always note that AI analysis should be confirmed by a qualified medical professional.`;
    } else if (contentClass === 'text-report' || contentClass === 'document') {
        contextInstruction = `This is a medical document/report. Answer based on the content visible in the document.
Do NOT provide diagnoses or treatment advice beyond what is stated in the report itself.`;
    } else {
        contextInstruction = `Analyze the provided content to answer the question. Be factual and precise.`;
    }

    return `You are a medical AI assistant. A doctor has asked the following question about the provided content:

"${question}"

${contextInstruction}

Return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ContentType": "Q&A Response",
  "Question": "${question.replace(/"/g, '\\"')}",
  "Answer": "Your detailed, factual answer to the question based on the provided content.",
  "VisibleObservations": ["Supporting observation 1", "Supporting observation 2"],
  "Confidence": "High / Medium / Low",
  "Disclaimer": "AI-assisted analysis. Confirm findings with qualified medical review."
}

Base your answer ONLY on what is actually visible in the provided content.
If you cannot determine a reliable answer, state so clearly and explain why.`;
}

/**
 * Build a comparison prompt for two media inputs
 */
function buildComparisonPrompt(contentClass) {
    if (contentClass === 'medical-image') {
        return `You are a medical AI assistant. Compare the two provided medical images.
Keep it strictly factual based on visual observations. Do NOT generate any diagnosis, treatment suggestions, prescriptions, or medical advice.
Return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "ContentType": "Medical Image Comparison",
  "NewFindings": ["New observation in the latest image"],
  "RemovedFindings": ["Observation no longer visible"],
  "ChangedFindings": ["Change description: previous → current"],
  "OverallChange": "Short factual statement summarizing visual differences.",
  "Disclaimer": "AI-assisted comparison. All findings should be confirmed by a qualified medical professional."
}
If a section has no findings, return an empty array. Do not invent details.
Use cautious language for all observations.`;
    }

    // Default comparison prompt (existing behavior preserved)
    return `You are a medical AI assistant. Compare the latest medical report with the previous medical report.
Keep it strictly factual based on the data. Do NOT generate any diagnosis, treatment suggestions, prescriptions, or medical advice.
Return ONLY a valid JSON string with the following structure (no markdown, no other text):
{
  "NewFindings": ["Finding 1", "Finding 2"],
  "RemovedFindings": ["Finding 1", "Finding 2"],
  "ChangedFindings": ["Parameter 1: Old Value -> New Value"],
  "OverallChange": "Short factual statement summarizing the difference."
}
If a section is empty, return an empty array. Do not invent details.`;
}

module.exports = {
    buildAnalysisPrompt,
    buildComparisonPrompt,
    buildTextReportPrompt,
    buildMedicalImagePrompt,
    buildChartTablePrompt,
    buildDocumentPrompt,
    buildPhotoAnalysisPrompt,
    buildGeneralAnalysisPrompt,
    buildQuestionPrompt,
    MEDICAL_DISCLAIMER
};
