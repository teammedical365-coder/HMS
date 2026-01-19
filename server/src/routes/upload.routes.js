// server/src/routes/upload.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const imagekit = require('../utils/imagekit'); // Correctly imports the instance now
const UploadedFile = require('../models/uploadedFile.model'); // Import the new model

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
router.post('/images', upload.array("images", 10), async (req, res) => {
  try {
    const files = req.files;
    
    // --- DEBUG LOG: Request received ---
    console.log(`[Upload Route] Request received. Files count: ${files ? files.length : 0}`);

    if (!files || files.length === 0) {
      console.log("[Upload Route] Error: No files found in request.");
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }

    const uploadedResults = [];

    // Loop through all files
    for (const file of files) {
      // --- DEBUG LOG: Processing file ---
      console.log(`[Upload Route] Processing file: ${file.originalname} | Size: ${file.size} bytes | Mime: ${file.mimetype}`);

      try {
        // 1. Upload to ImageKit
        console.log(`[Upload Route] Sending '${file.originalname}' to ImageKit...`);
        
        const result = await imagekit.upload({
          file: file.buffer, // The file buffer from RAM
          fileName: `crm_${Date.now()}_${file.originalname}`,
          folder: "/prescriptions", // Organized folder
          tags: ['crm_upload', file.mimetype]
        });

        console.log(`[Upload Route] ImageKit Upload Success! FileId: ${result.fileId} | URL: ${result.url}`);

        // 2. Save Metadata to MongoDB
        console.log(`[Upload Route] Saving metadata to MongoDB for '${file.originalname}'...`);
        
        const newFileRecord = new UploadedFile({
          fileName: file.originalname,
          url: result.url,
          fileId: result.fileId,
          mimeType: file.mimetype,
          size: result.size,
          tags: result.tags
        });

        await newFileRecord.save();
        console.log(`[Upload Route] MongoDB Save Success for '${file.originalname}'`);

        // Push to response array
        uploadedResults.push(newFileRecord);

      } catch (innerError) {
        console.error(`[Upload Route] FAILED to upload file '${file.originalname}':`, innerError);
        // Depending on requirements, you might want to continue to the next file or throw
        throw innerError; 
      }
    }

    res.status(201).json({
      success: true,
      message: "Images uploaded and metadata saved successfully",
      count: uploadedResults.length,
      files: uploadedResults, // Returns the MongoDB documents (including URLs)
    });

  } catch (error) {
    console.error('[Upload Route] Critical Upload Error:', error);
    res.status(500).json({ 
        success: false, 
        message: "Upload failed", 
        error: error.message 
    });
  }
});

module.exports = router;