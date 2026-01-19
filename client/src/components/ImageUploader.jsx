import React, { useState } from 'react';
import { uploadAPI } from '../utils/api'; // Import the function we made in Step 1

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
      // Optional: Add captions if you have inputs for them
      // formData.append('captions', `Image ${i+1}`);
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
    <div className="upload-container" style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h3>Upload Images</h3>
      
      {error && <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}
      
      <input 
        type="file" 
        multiple 
        accept="image/*,application/pdf"
        onChange={handleUpload}
        disabled={uploading}
      />
      
      {uploading && <p>Uploading... Please wait.</p>}

      {/* Preview Section */}
      <div className="preview-grid" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
        {uploadedFiles.map((file, index) => (
          <div key={index} style={{ border: '1px solid #ccc', padding: '5px', borderRadius: '4px' }}>
            <img 
              src={file.url} 
              alt={file.name} 
              style={{ width: '100px', height: '100px', objectFit: 'cover' }} 
            />
            <p style={{ fontSize: '12px', margin: '5px 0 0 0' }}>{file.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageUploader;