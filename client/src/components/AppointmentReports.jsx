import React, { useState, useEffect } from 'react';
import { reportAPI } from '../utils/api';

const AppointmentReports = ({ appointmentId, prescriptions = [] }) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);

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

    return (
        <div>
            <h3 style={{ marginBottom: '16px', color: '#1e293b' }}>📁 Appointment Reports & Files</h3>
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
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
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
                            {f.url ? (
                                <a href={f.url} target="_blank" rel="noreferrer"
                                    style={{ background: '#3b82f6', color: '#fff', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                    {isPDF(f.mimetype) ? 'Open PDF' : 'View'}
                                </a>
                            ) : (
                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>No URL</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AppointmentReports;
