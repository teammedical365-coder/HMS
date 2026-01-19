const mongoose = require('mongoose');

const uploadedFileSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  fileId: {
    type: String,
    required: true
  },
  mimeType: String,
  size: Number,



  tags: [String],
  uploadDate: {
    type: Date,
    default: Date.now
  }
});

const UploadedFile = mongoose.model('UploadedFile', uploadedFileSchema);

module.exports = UploadedFile;