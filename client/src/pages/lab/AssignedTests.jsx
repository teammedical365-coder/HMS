import React, { useState, useEffect } from 'react';
import { labAPI } from '../../utils/api';
import './AssignedTests.css';

const AssignedTests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploadingId, setUploadingId] = useState(null);

    // Fetch requests on mount
    useEffect(() => {
        loadRequests();
    }, []);

    const loadRequests = async () => {
        setLoading(true);
        try {
            // Fetch pending requests specifically
            const res = await labAPI.getRequests('pending');
            if (res.success) {
                setRequests(res.requests);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e, reportId) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm(`Upload ${file.name} for this patient?`)) return;

        setUploadingId(reportId);
        const formData = new FormData();
        formData.append('reportFile', file);
        formData.append('notes', 'Uploaded via Lab Dashboard');

        try {
            const res = await labAPI.uploadReport(reportId, formData);
            if (res.success) {
                alert("✅ Report Uploaded & Sent to Doctor!");
                loadRequests(); // Refresh list to remove completed
            }
        } catch (err) {
            alert("Upload Failed: " + err.message);
        } finally {
            setUploadingId(null);
        }
    };

    if (loading) return <div className="loading">Loading Test Requests...</div>;

    return (
        <div className="assigned-tests-page">
            <h2>📋 Pending Lab Requests</h2>

            {requests.length === 0 ? (
                <div className="empty-state">
                    <p>No pending tests assigned to your lab.</p>
                </div>
            ) : (
                <div className="requests-grid">
                    {requests.map(req => (
                        <div key={req._id} className="request-card">
                            <div className="card-header">
                                <span className="patient-name">{req.userId?.name || 'Unknown Patient'}</span>
                                <span className="patient-id">{req.patientId}</span>
                            </div>

                            <div className="card-body">
                                <div className="info-row">
                                    <strong>Doctor:</strong> Dr. {req.doctorId?.name || 'N/A'}
                                </div>
                                <div className="info-row">
                                    <strong>Date:</strong> {new Date(req.createdAt).toLocaleDateString()}
                                </div>

                                <div className="tests-list">
                                    <strong>Tests Requested:</strong>
                                    <ul>
                                        {req.testNames && req.testNames.map((test, idx) => (
                                            <li key={idx}>{test}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            <div className="card-footer">
                                <label className={`upload-btn ${uploadingId === req._id ? 'disabled' : ''}`}>
                                    {uploadingId === req._id ? 'Uploading...' : '📤 Upload Report'}
                                    <input
                                        type="file"
                                        accept=".pdf,.jpg,.png"
                                        onChange={(e) => handleFileUpload(e, req._id)}
                                        disabled={uploadingId === req._id}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AssignedTests;