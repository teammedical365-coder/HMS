// server/src/routes/upload.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const imagekit = require('../utils/imagekit');
const UploadedFile = require('../models/uploadedFile.model');

// Configure Multer for memory storage (Required for ImageKit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs are allowed!'), false);
    }
  }
});

// Route: POST /api/upload/images
router.post('/images', verifyToken, upload.array("images", 10), async (req, res) => {
  try {
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }

    const uploadedResults = [];

    for (const file of files) {
      try {
        const result = await imagekit.upload({
          file: file.buffer,
          fileName: `crm_${Date.now()}_${file.originalname}`,
          folder: "/prescriptions",
          tags: ['crm_upload', file.mimetype]
        });

        const newFileRecord = new UploadedFile({
          fileName: file.originalname,
          url: result.url,
          fileId: result.fileId,
          mimeType: file.mimetype,
          size: result.size,
          tags: result.tags
        });

        await newFileRecord.save();
        uploadedResults.push(newFileRecord);

      } catch (innerError) {
        console.error('[Upload Route] File upload failed');
        throw innerError;
      }
    }

    res.status(201).json({
      success: true,
      message: "Images uploaded and metadata saved successfully",
      count: uploadedResults.length,
      files: uploadedResults,
    });

  } catch (error) {
    console.error('[Upload Route] Upload error');
    res.status(500).json({
        success: false,
        message: "Upload failed. Please try again.",
    });
  }
});

module.exports = router;