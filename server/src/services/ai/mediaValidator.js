/**
 * Media Validator — MIME type detection, validation, and content classification
 * for the Medical365 AI multimodal analysis system.
 */

// Supported MIME types for AI analysis
const SUPPORTED_MIME_TYPES = {
    'image/png': { category: 'image', extensions: ['.png'] },
    'image/jpeg': { category: 'image', extensions: ['.jpg', '.jpeg'] },
    'image/webp': { category: 'image', extensions: ['.webp'] },
    'image/heic': { category: 'image', extensions: ['.heic'] },
    'image/heif': { category: 'image', extensions: ['.heif'] },
    'application/pdf': { category: 'document', extensions: ['.pdf'] },
};

// Magic byte signatures for content-type detection
const MAGIC_BYTES = [
    { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
    { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
    { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    { mime: 'image/heic', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp
    { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Detect MIME type from buffer magic bytes
 */
function detectMimeFromBuffer(buffer) {
    if (!buffer || buffer.length < 12) return null;

    for (const sig of MAGIC_BYTES) {
        const offset = sig.offset || 0;
        const match = sig.bytes.every((byte, i) => buffer[offset + i] === byte);
        if (match) {
            // HEIC/HEIF share the 'ftyp' marker — distinguish by subtype
            if (sig.mime === 'image/heic') {
                const subtype = buffer.slice(8, 12).toString('ascii');
                if (['heic', 'heix', 'heim', 'heis'].includes(subtype)) return 'image/heic';
                if (['hevc', 'hevx'].includes(subtype)) return 'image/heic';
                if (['mif1', 'msf1'].includes(subtype)) return 'image/heif';
                // Default for ftyp-based formats — might be video; skip
                continue;
            }
            return sig.mime;
        }
    }
    return null;
}

/**
 * Classify content type for prompt routing
 * @returns 'text-report' | 'medical-image' | 'document' | 'chart-table' | 'photo' | 'unknown'
 */
function classifyContent(mimeType, fileName) {
    if (!mimeType) return 'unknown';

    const mime = mimeType.toLowerCase();
    const name = (fileName || '').toLowerCase();

    if (mime === 'application/pdf') {
        return 'document';
    }

    if (mime.startsWith('image/')) {
        // Check filename hints for medical images
        const medicalKeywords = ['xray', 'x-ray', 'x_ray', 'scan', 'mri', 'ct', 'ultrasound', 'echo', 'radio', 'mammo', 'sono'];
        const chartKeywords = ['chart', 'graph', 'table', 'diagram', 'flow'];
        const reportKeywords = ['report', 'result', 'lab', 'test', 'blood', 'urine', 'pathology'];

        if (medicalKeywords.some(kw => name.includes(kw))) return 'medical-image';
        if (chartKeywords.some(kw => name.includes(kw))) return 'chart-table';
        if (reportKeywords.some(kw => name.includes(kw))) return 'text-report';

        // Default image classification — Gemini will determine context from content
        return 'photo';
    }

    return 'unknown';
}

/**
 * Validate a media input for AI analysis.
 * Returns { valid: true, mimeType, category, contentClass } or { valid: false, error, code }
 */
function validateMedia(buffer, declaredMimeType, fileName) {
    // 1. Size check
    if (buffer && buffer.length > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File exceeds the maximum supported size of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
            code: 'FILE_TOO_LARGE'
        };
    }

    // 2. Detect actual MIME from buffer
    const detectedMime = buffer ? detectMimeFromBuffer(buffer) : null;

    // 3. Resolve final MIME type (prefer detected, fall back to declared)
    let resolvedMime = detectedMime || declaredMimeType;

    if (!resolvedMime) {
        return {
            valid: false,
            error: 'Unable to determine file type. Please upload a supported image or PDF file.',
            code: 'UNKNOWN_TYPE'
        };
    }

    resolvedMime = resolvedMime.toLowerCase();

    // 4. Check if supported
    if (!SUPPORTED_MIME_TYPES[resolvedMime]) {
        return {
            valid: false,
            error: `This file type (${resolvedMime}) is not currently supported. Supported types: PNG, JPG, WEBP, HEIC, PDF.`,
            code: 'UNSUPPORTED_TYPE'
        };
    }

    // 5. Basic integrity check — buffer should have reasonable content
    if (buffer && buffer.length < 100) {
        return {
            valid: false,
            error: 'The uploaded file appears to be empty or corrupted.',
            code: 'INVALID_FILE'
        };
    }

    const info = SUPPORTED_MIME_TYPES[resolvedMime];
    const contentClass = classifyContent(resolvedMime, fileName);

    return {
        valid: true,
        mimeType: resolvedMime,
        category: info.category,
        contentClass
    };
}

module.exports = {
    validateMedia,
    classifyContent,
    detectMimeFromBuffer,
    SUPPORTED_MIME_TYPES,
    MAX_FILE_SIZE
};
