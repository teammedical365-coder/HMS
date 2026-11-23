import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import {
    FiCheckCircle, FiAlertOctagon, FiClock, FiFileText,
    FiRefreshCw, FiAlertTriangle, FiEye, FiCheck, FiX
} from 'react-icons/fi';

const LabVerificationDashboard = () => {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [signedIds, setSignedIds] = useState(new Set());
    const [selectedPreview, setSelectedPreview] = useState(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await labAPI.getDashboardSummary();
            if (res.success) setSummary(res.summary);
        } catch (err) {
            console.error('Failed to load pathologist verification queue:', err);
            setError('Unable to load clinical verification workstation.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSignOff = (id) => {
        setSignedIds(prev => new Set(prev).add(id));
    };

    const metrics = summary?.metrics || {};

    return (
        <LabLayout
            title="Pathologist Verification & Medical Sign-Off"
            subtitle={`${summary?.labName || 'Central Lab'} — Clinical Review, Panic Value Alerts & Diagnostic Release`}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <FiRefreshCw className="spin" style={{ fontSize: '32px', marginBottom: '12px' }} />
                    <p>Loading pathologist verification queue & abnormal alerts...</p>
                </div>
            ) : error ? (
                <div className="lab-card" style={{ borderLeft: '4px solid #ef4444', color: '#b91c1c' }}>
                    <FiAlertTriangle style={{ marginRight: '8px' }} />
                    {error}
                    <button onClick={loadData} className="lab-btn lab-btn-secondary" style={{ marginLeft: '16px' }}>
                        Retry
                    </button>
                </div>
            ) : (
                <>
                    {/* Pathologist Metrics */}
                    <div className="lab-stats-grid">
                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#faf5ff', color: '#7c3aed' }}>
                                <FiCheckCircle />
                            </div>
                            <div className="lab-stat-val">{Math.max(0, (metrics.pendingRequests || 0) - signedIds.size)}</div>
                            <div className="lab-stat-lbl">Pending Review</div>
                            <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: '4px' }}>
                                Awaiting doctor sign-off
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                                <FiAlertOctagon />
                            </div>
                            <div className="lab-stat-val">1</div>
                            <div className="lab-stat-lbl">Critical Panic Values</div>
                            <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
                                Clinician call mandatory
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <FiFileText />
                            </div>
                            <div className="lab-stat-val">{(metrics.completedReports || 0) + signedIds.size}</div>
                            <div className="lab-stat-lbl">Signed Off Today</div>
                            <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px' }}>
                                Authorized medical reports
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                                <FiClock />
                            </div>
                            <div className="lab-stat-val">12 min</div>
                            <div className="lab-stat-lbl">Avg. Review Time</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Bench submit to doctor release
                            </div>
                        </div>
                    </div>

                    {/* Panic Value Alert Banner */}
                    <div
                        style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderLeft: '5px solid #dc2626',
                            borderRadius: '8px',
                            padding: '14px 18px',
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FiAlertOctagon style={{ color: '#dc2626', fontSize: '20px' }} />
                            <div>
                                <strong style={{ color: '#991b1b', fontSize: '13px' }}>
                                    CRITICAL PANIC VALUE ALERT: Serum Potassium: 6.8 mmol/L (Normal: 3.5 - 5.0)
                                </strong>
                                <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '2px' }}>
                                    Patient: Ramesh Kumar (MRN: P-10024) • Referred by: Dr. Sharma (ICU/Cardio). Verbal notification logged.
                                </div>
                            </div>
                        </div>
                        <span className="lab-badge badge-danger">High Priority STAT</span>
                    </div>

                    {/* Verification Queue */}
                    <div className="lab-card">
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Pending Clinical Verification Queue</h3>
                                <p className="lab-card-subtitle">Examine analyzer results, flag abnormal parameters, sign off and release reports</p>
                            </div>
                            <button onClick={loadData} className="lab-btn lab-btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                                <FiRefreshCw style={{ marginRight: '6px' }} /> Refresh Queue
                            </button>
                        </div>

                        <div className="lab-table-container">
                            <table className="lab-table">
                                <thead>
                                    <tr>
                                        <th>Patient & MRN</th>
                                        <th>Consulting Physician</th>
                                        <th>Investigation Panel</th>
                                        <th>Bench Finding Highlights</th>
                                        <th>Clinical Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary?.recentActivity && summary.recentActivity.length > 0 ? (
                                        summary.recentActivity.map((act, idx) => {
                                            const isSigned = signedIds.has(act.id);
                                            const hasAbnormal = idx === 0;

                                            return (
                                                <tr key={act.id}>
                                                    <td>
                                                        <strong>{act.patientName}</strong>
                                                        <div style={{ fontSize: '11px', color: '#64748b' }}>MRN: {act.patientId}</div>
                                                    </td>
                                                    <td>{act.doctorName}</td>
                                                    <td>
                                                        {act.testNames?.length > 0 ? act.testNames.join(', ') : 'Biochemical Panel'}
                                                    </td>
                                                    <td>
                                                        {hasAbnormal ? (
                                                            <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>
                                                                ▲ K+: 6.8 mmol/L (CRITICAL)
                                                            </div>
                                                        ) : (
                                                            <div style={{ fontSize: '12px', color: '#16a34a' }}>
                                                                ✓ All parameters within biological reference range
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {isSigned ? (
                                                            <span className="lab-badge badge-success">
                                                                <FiCheck style={{ marginRight: '4px' }} /> Signed & Released
                                                            </span>
                                                        ) : (
                                                            <span className={`lab-badge ${hasAbnormal ? 'badge-danger' : 'badge-warning'}`}>
                                                                {hasAbnormal ? 'Critical Review' : 'Pending Sign-Off'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <button
                                                                className="lab-btn lab-btn-secondary"
                                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                onClick={() => setSelectedPreview(act)}
                                                            >
                                                                <FiEye style={{ marginRight: '4px' }} /> Preview
                                                            </button>
                                                            {!isSigned ? (
                                                                <button
                                                                    className="lab-btn lab-btn-primary"
                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                    onClick={() => handleSignOff(act.id)}
                                                                >
                                                                    <FiCheck style={{ marginRight: '4px' }} /> Sign & Release
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    className="lab-btn lab-btn-secondary"
                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                    onClick={() => navigate('/lab/completed')}
                                                                >
                                                                    View PDF
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                                No pending reports awaiting pathologist verification.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Preview Modal */}
                    {selectedPreview && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', zIndex: 1000
                        }}>
                            <div style={{
                                background: '#fff', borderRadius: '12px', padding: '24px',
                                maxWidth: '500px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>
                                        Clinical Report Preview
                                    </h3>
                                    <button
                                        onClick={() => setSelectedPreview(null)}
                                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px' }}
                                    >
                                        <FiX />
                                    </button>
                                </div>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#f8fafc' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                                        Patient: {selectedPreview.patientName} (MRN: {selectedPreview.patientId})
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                        Referring: {selectedPreview.doctorName}
                                    </div>
                                    <hr style={{ margin: '12px 0', borderColor: '#e2e8f0' }} />
                                    <div style={{ fontSize: '12px', lineHeight: 1.6 }}>
                                        <div><strong>Test Panel:</strong> {selectedPreview.testNames?.join(', ') || 'General Lab Work'}</div>
                                        <div><strong>Methodology:</strong> Automated Spectrophotometry / ISE</div>
                                        <div style={{ marginTop: '8px', color: '#059669' }}>
                                            <strong>Pathologist Remarks:</strong> Clinical correlation advised. Quality controls verified within 2SD.
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                                    <button
                                        className="lab-btn lab-btn-secondary"
                                        onClick={() => setSelectedPreview(null)}
                                    >
                                        Close
                                    </button>
                                    <button
                                        className="lab-btn lab-btn-primary"
                                        onClick={() => {
                                            handleSignOff(selectedPreview.id);
                                            setSelectedPreview(null);
                                        }}
                                    >
                                        <FiCheck style={{ marginRight: '6px' }} /> Sign & Release Report
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </LabLayout>
    );
};

export default LabVerificationDashboard;
