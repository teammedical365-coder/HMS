/**
 * Validates an uploaded file's actual type by reading its magic bytes.
 * Prevents MIME type spoofing (e.g. renaming malware.exe → malware.pdf).
 *
 * Works with both disk-storage files (req.file.path) and memory-storage files (req.file.buffer).
 */

const fs   = require('fs');
const path = require('path');
const { fromBuffer } = require('file-type');

const ALLOWED_TYPES = {
    'image/jpeg':     ['.jpg', '.jpeg'],
    'image/png':      ['.png'],
    'image/webp':     ['.webp'],
    'application/pdf':['.pdf'],
};

/**
 * @param {object} file - multer file object (req.file)
 * @param {string[]} allowedMimes - list of allowed MIME types
 * @returns {Promise<string|null>} null if valid, error message if not
 */
async function validateFileType(file, allowedMimes) {
    if (!file) return 'No file provided';

    const allowed = allowedMimes || Object.keys(ALLOWED_TYPES);

    let buffer;
    if (file.buffer) {
        // memory storage — buffer already in memory
        buffer = file.buffer.slice(0, 4100);
    } else if (file.path) {
        // disk storage — read first bytes
        try {
            const fd = fs.openSync(file.path, 'r');
            buffer = Buffer.alloc(4100);
            const bytesRead = fs.readSync(fd, buffer, 0, 4100, 0);
            fs.closeSync(fd);
            buffer = buffer.slice(0, bytesRead);
        } catch (e) {
            return 'Could not read uploaded file';
        }
    } else {
        return 'Invalid file object';
    }

    const detected = await fromBuffer(buffer);

    if (!detected) {
        return 'Unrecognised file format. Only PDF and images are allowed.';
    }

    if (!allowed.includes(detected.mime)) {
        return `File content type not allowed. Detected: ${detected.mime}`;
    }

    // Extension sanity check
    const declaredExt = path.extname(file.originalname || '').toLowerCase();
    const allowedExts = ALLOWED_TYPES[detected.mime] || [];
    if (allowedExts.length && declaredExt && !allowedExts.includes(declaredExt)) {
        return `File extension (${declaredExt}) does not match file content (${detected.mime})`;
    }

    return null;
}

module.exports = validateFileType;
