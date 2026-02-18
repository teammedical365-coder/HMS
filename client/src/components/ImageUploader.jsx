import React, { useState } from 'react';
import { uploadAPI } from '../utils/api'; // Import the function we made in Step 1
import './ImageUploader.css';

const ImageUploader = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [error, setError] = useState(null);

  const handleUpload = async (e) => {
    const files = e.target.files;

    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();

    // Loop through files and append them
    for (let i = 0; i < files.length; i++) {
      formData.append('images', files[i]);
    }

    try {
      // Call the API utility we created
      const data = await uploadAPI.uploadImages(formData);

      if (data.success) {
        console.log("Uploaded successfully:", data.files);
        setUploadedFiles(prev => [...prev, ...data.files]);
        alert(`Successfully uploaded ${data.count} images!`);
      }
    } catch (err) {
      console.error("Upload failed", err);
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      // Reset the input value so the same file can be selected again if needed
      e.target.value = null;
    }
  };

  return (
    <div className="upload-container">
      <h3 className="upload-header">Upload Images</h3>

      {error && <div className="error-message">{error}</div>}

      <div className="upload-input-wrapper">
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={handleUpload}
          disabled={uploading}
          className="file-input"
        />
      </div>

      {uploading && <div className="upload-status">Uploading... Please wait.</div>}

      {/* Preview Section */}
      <div className="preview-grid">
        {uploadedFiles.map((file, index) => (
          <div key={index} className="preview-item">
            <img
              src={file.url}
              alt={file.name}
              className="preview-image"
            />
            <p className="preview-name">{file.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageUploader;