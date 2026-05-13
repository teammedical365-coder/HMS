const multer = require('multer');
const path = require('path');
const fs = require('fs');
const validateFileType = require('../utils/validateFileType');

const uploadDir = 'uploads/prescriptions';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'application/pdf'];

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const safe = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + safe + path.extname(file.originalname).toLowerCase());
    },
});

// First-pass MIME check (catches obvious wrong types quickly before writing to disk)
const fileFilter = (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG and PDF are allowed.'), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter,
});

/**
 * Express middleware that runs AFTER multer — verifies magic bytes of the saved file.
 * Deletes the file and returns 400 if magic bytes don't match.
 */
const verifyUploadedFile = async (req, res, next) => {
    if (!req.file) return next();
    const err = await validateFileType(req.file, ALLOWED_MIMES);
    if (err) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ success: false, message: err });
    }
    next();
};

module.exports = upload;
module.exports.verifyUploadedFile = verifyUploadedFile;
