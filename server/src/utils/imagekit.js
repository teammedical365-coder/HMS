const ImageKit = require("imagekit");
const fs = require("fs");
const path = require("path");

const localUploadFallback = async (options) => {
    try {
        const fileBuffer = options.file;
        const fileName = options.fileName || `file_${Date.now()}`;
        const uploadDir = path.join(__dirname, '../../uploads/patient-reports');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = path.join(uploadDir, cleanName);
        if (Buffer.isBuffer(fileBuffer)) {
            await fs.promises.writeFile(filePath, fileBuffer);
        } else if (typeof fileBuffer === 'string') {
            const base64Data = fileBuffer.replace(/^data:([A-Za-z-+/]+);base64,/, '');
            await fs.promises.writeFile(filePath, Buffer.from(base64Data, 'base64'));
        }
        return {
            url: `/api/patients/reports/${encodeURIComponent(cleanName)}`,
            fileId: `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            size: Buffer.isBuffer(fileBuffer) ? fileBuffer.length : 0,
            name: cleanName
        };
    } catch (err) {
        console.error('[ImageKit Local Fallback Error]:', err.message);
        throw err;
    }
};

let imagekit = null;

if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINTS) {
    console.warn('[ImageKit] Missing credentials — using local disk fallback for uploads.');
    imagekit = {
        upload: localUploadFallback,
        deleteFile: async () => ({ success: true })
    };
} else {
    try {
        const realImageKit = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINTS,
        });
        imagekit = {
            upload: async (options) => {
                try {
                    return await realImageKit.upload(options);
                } catch (netErr) {
                    console.warn('[ImageKit] Cloud upload failed, falling back to local disk:', netErr.message);
                    return await localUploadFallback(options);
                }
            },
            deleteFile: async (fileId) => {
                try {
                    return await realImageKit.deleteFile(fileId);
                } catch (e) {
                    return { success: true };
                }
            }
        };
    } catch (initErr) {
        console.warn('[ImageKit] Initialization failed:', initErr.message, '— using local disk fallback.');
        imagekit = {
            upload: localUploadFallback,
            deleteFile: async () => ({ success: true })
        };
    }
}

module.exports = imagekit;
