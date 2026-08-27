import React, { useState, useEffect } from 'react';
import { reportAPI } from '../utils/api';
import { useAuth } from '../store/hooks';

const AppointmentReports = ({ appointmentId, prescriptions = [] }) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    
    // AI Summary States
    const [aiLoading, setAiLoading] = useState({});
    const [aiSummaries, setAiSummaries] = useState({});
    const [aiErrors, setAiErrors] = useState({});

    const { user } = useAuth();
    const roleName = user?._roleData?.name?.toLowerCase() || (typeof user?.role === 'string' ? user.role.toLowerCase() : '');
    const isDoctor = roleName.includes('doctor');

    useEffect(() => {
        if (!appointmentId) return;
        
        setLoading(true);
        reportAPI.getReportsByAppointment(appointmentId)
            .then(res => {
                if (res.success) {
                    setReports(res.reports || []);
                }
            })
            .catch(err => console.error("Error fetching appointment reports:", err))
            .finally(() => setLoading(false));
    }, [appointmentId]);

    const isPDF = (mimetype) => mimetype === 'application/pdf' || (typeof mimetype === 'string' && mimetype.endsWith('pdf'));

    const rawFiles = [
        ...prescriptions.map(p => ({ 
            ...p, 
            name: p.name || 'Prescription',
            source: 'prescription' 
        })),
        ...reports.map(r => ({
            name: r.fileName || 'Medical Report',
            url: r.url,
            uploadedAt: r.uploadedAt,
            mimetype: r.mimeType,
            uploadedByRole: r.uploadedByRole,
            source: 'report'
        }))
    ];

    const allFiles = Array.from(new Map(rawFiles.map(f => [f.url || f.name, f])).values());

    const handleGenerateSummary = async (fileUrl, mimeType, index) => {
        setAiLoading(prev => ({ ...prev, [index]: true }));
        setAiErrors(prev => ({ ...prev, [index]: null }));
        try {
            const res = await reportAPI.generateAISummary(fileUrl, mimeType);
            if (res.success) {
                setAiSummaries(prev => ({ ...prev, [index]: res.summary }));
            } else {
                setAiErrors(prev => ({ ...prev, [index]: res.message || 'Failed to generate summary.' }));
            }
        } catch (error) {
            console.error("AI Summary error:", error);
            setAiErrors(prev => ({ ...prev, [index]: 'An error occurred while generating summary.' }));
        } finally {
            setAiLoading(prev => ({ ...prev, [index]: false }));
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!uploadFile || !appointmentId) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('reportFile', uploadFile);
        formData.append('appointmentId', appointmentId);
        try {
            const res = await reportAPI.uploadReport(formData);
            if (res.success) {
                alert('Report uploaded successfully!');
                setUploadFile(null);
                // re-fetch reports
                const newRes = await reportAPI.getReportsByAppointment(appointmentId);
                if (newRes.success) {
                    setReports(newRes.reports || []);
                }
            } else {
                alert(res.message || 'Failed to upload report');
            }
        } catch (err) {
            console.error("Upload error:", err);
            alert("Upload failed.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#1e293b' }}>📁 Appointment Reports & Files</h3>
            </div>
            
            <form onSubmit={handleUpload} style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <input 
                    type="file" 
                    onChange={e => setUploadFile(e.target.files[0])} 
                    style={{ flex: 1, fontSize: '13px' }}
                    required
                />
                <button type="submit" disabled={uploading || !uploadFile} style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', opacity: (uploading || !uploadFile) ? 0.6 : 1 }}>
                    {uploading ? 'Uploading...' : 'Upload'}
                </button>
            </form>

            {loading && <p style={{ color: '#94a3b8', fontSize: '13px' }}>Loading reports…</p>}
            {!loading && allFiles.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '10px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📂</div>
                    <p>No uploaded reports or files for this visit.</p>
                </div>
            )}
            {allFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {allFiles.map((f, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px' }}>
                                <div style={{ fontSize: '1.4rem' }}>{isPDF(f.mimetype) ? '📄' : '🖼️'}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {f.name || 'Unnamed file'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                        {f.source === 'prescription' ? '📝 Prescription' : '📋 Report'}
                                        {f.uploadedByRole && ` (via ${f.uploadedByRole})`}
                                        {f.uploadedAt && ` · ${new Date(f.uploadedAt).toLocaleDateString('en-IN')}`}
                                    </div>
                                </div>
                                
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {isDoctor && f.source === 'report' && f.url && (
                                        <button 
                                            onClick={() => handleGenerateSummary(f.url, f.mimetype, i)}
                                            disabled={aiLoading[i]}
                                            style={{
                                                background: '#8b5cf6', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: aiLoading[i] ? 'not-allowed' : 'pointer', opacity: aiLoading[i] ? 0.7 : 1
                                            }}
                                        >
                                            {aiLoading[i] ? '⏳ Processing...' : '🤖 AI Report Summary'}
                                        </button>
                                    )}

                                    {f.url ? (
                                        <a href={f.url} target="_blank" rel="noreferrer"
                                            style={{ background: '#3b82f6', color: '#fff', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                            {isPDF(f.mimetype) ? 'Open PDF' : 'View'}
                                        </a>
                                    ) : (
                                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>No URL</span>
                                    )}
                                </div>
                            </div>
                            
                            {/* AI Summary Display */}
                            {aiErrors[i] && (
                                <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', fontSize: '12px', borderTop: '1px solid #fecaca' }}>
                                    ❌ {aiErrors[i]}
                                </div>
                            )}
                            {aiSummaries[i] && (
                                <div style={{ padding: '16px', background: '#f5f3ff', borderTop: '1px solid #ede9fe' }}>
                                    <h4 style={{ margin: '0 0 12px 0', color: '#5b21b6', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        🤖 AI Report Summary
                                    </h4>
                                    
                                    <div style={{ marginBottom: '10px' }}>
                                        <strong style={{ fontSize: '12px', color: '#4c1d95' }}>
                                            {aiSummaries[i].ContentType ? 'Content Type:' : 'Report Type:'}
                                        </strong>
                                        <div style={{ fontSize: '13px', color: '#334155', marginTop: '2px' }}>
                                            {aiSummaries[i].ContentType || aiSummaries[i].ReportType || 'Unknown'}
                                        </div>
                                        {aiSummaries[i].ImageType && (
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Type: {aiSummaries[i].ImageType}</div>
                                        )}
                                        {aiSummaries[i].ImageQuality && (
                                            <div style={{ fontSize: '12px', color: aiSummaries[i].ImageQuality === 'Insufficient' ? '#dc2626' : '#64748b', marginTop: '2px' }}>Quality: {aiSummaries[i].ImageQuality}</div>
                                        )}
                                    </div>
                                    
                                    <div style={{ marginBottom: '10px' }}>
                                        <strong style={{ fontSize: '12px', color: '#4c1d95' }}>Overall Summary:</strong>
                                        <div style={{ fontSize: '13px', color: '#334155', marginTop: '2px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{aiSummaries[i].OverallSummary || 'No summary available.'}</div>
                                    </div>

                                    {/* Visible Observations (for image analysis) */}
                                    {aiSummaries[i].VisibleObservations && aiSummaries[i].VisibleObservations.length > 0 && (
                                        <div style={{ marginBottom: '10px' }}>
                                            <strong style={{ fontSize: '12px', color: '#166534' }}>Visible Observations:</strong>
                                            <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', fontSize: '13px', color: '#14532d' }}>
                                                {aiSummaries[i].VisibleObservations.map((obs, idx) => (
                                                    <li key={idx} style={{ marginBottom: '3px' }}>{obs}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    
                                    {/* Important Findings (for text reports) */}
                                    {aiSummaries[i].ImportantFindings && aiSummaries[i].ImportantFindings.length > 0 && (
                                        <div style={{ marginBottom: '10px' }}>
                                            <strong style={{ fontSize: '12px', color: '#4c1d95' }}>Important Findings:</strong>
                                            <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', fontSize: '13px', color: '#334155' }}>
                                                {aiSummaries[i].ImportantFindings.map((finding, idx) => (
                                                    <li key={idx} style={{ marginBottom: '3px' }}>{finding}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Notable Findings (for image analysis) */}
                                    {aiSummaries[i].NotableFindings && aiSummaries[i].NotableFindings.length > 0 && (
                                        <div style={{ marginBottom: '10px' }}>
                                            <strong style={{ fontSize: '12px', color: '#92400e' }}>Notable Findings:</strong>
                                            <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', fontSize: '13px', color: '#78350f' }}>
                                                {aiSummaries[i].NotableFindings.map((finding, idx) => (
                                                    <li key={idx} style={{ marginBottom: '3px' }}>{finding}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    
                                    {aiSummaries[i].AbnormalValues && aiSummaries[i].AbnormalValues.length > 0 && (
                                        <div style={{ marginBottom: '10px' }}>
                                            <strong style={{ fontSize: '12px', color: '#ef4444' }}>Abnormal Values:</strong>
                                            <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', fontSize: '13px', color: '#b91c1c' }}>
                                                {aiSummaries[i].AbnormalValues.map((val, idx) => (
                                                    <li key={idx} style={{ marginBottom: '3px' }}>{val}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Medical Disclaimer */}
                                    {aiSummaries[i].Disclaimer && (
                                        <div style={{ marginTop: '10px', padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '11px', color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                            <span>⚕️</span>
                                            <span>{aiSummaries[i].Disclaimer}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AppointmentReports;
