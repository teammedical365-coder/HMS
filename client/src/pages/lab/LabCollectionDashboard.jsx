import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import {
    FiLayers, FiCheckCircle, FiClock, FiAlertTriangle,
    FiPrinter, FiRefreshCw, FiInfo, FiTag
} from 'react-icons/fi';

const TUBE_TYPES = [
    { code: 'EDTA', color: '#9333ea', bg: '#faf5ff', border: '#e9d5ff', label: 'EDTA Purple', tests: 'CBC, ESR, HbA1c' },
    { code: 'SERUM', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Plain Red / Gold', tests: 'LFT, KFT, Lipid, Hormones' },
    { code: 'CITRATE', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', label: 'Sodium Citrate Blue', tests: 'PT / INR, D-Dimer' },
    { code: 'FLUORIDE', color: '#475569', bg: '#f8fafc', border: '#cbd5e1', label: 'Fluoride Grey', tests: 'Blood Glucose (F/PP)' },
    { code: 'HEPARIN', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Heparin Green', tests: 'Electrolytes, Blood Gas' }
];

const LabCollectionDashboard = () => {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [collectedIds, setCollectedIds] = useState(new Set());
    const [selectedProblem, setSelectedProblem] = useState(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await labAPI.getDashboardSummary();
            if (res.success) setSummary(res.summary);
        } catch (err) {
            console.error('Failed to load phlebotomy data:', err);
            setError('Unable to load sample collection workstation.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleMarkCollected = (id) => {
        setCollectedIds(prev => new Set(prev).add(id));
    };

    const metrics = summary?.metrics || {};

    return (
        <LabLayout
            title="Phlebotomy & Specimen Collection"
            subtitle={`${summary?.labName || 'Central Lab'} — Specimen Drawing, Tube Preparation & Phlebotomy Queue`}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <FiRefreshCw className="spin" style={{ fontSize: '32px', marginBottom: '12px' }} />
                    <p>Loading collection queue & specimen manifest...</p>
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
                    {/* Phlebotomy Metrics */}
                    <div className="lab-stats-grid">
                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                                <FiLayers />
                            </div>
                            <div className="lab-stat-val">
                                {Math.max(0, (metrics.pendingRequests || 0) - collectedIds.size)}
                            </div>
                            <div className="lab-stat-lbl">Pending Drawing</div>
                            <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
                                Awaiting phlebotomy
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <FiCheckCircle />
                            </div>
                            <div className="lab-stat-val">{collectedIds.size + 4}</div>
                            <div className="lab-stat-lbl">Samples Drawn Today</div>
                            <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px' }}>
                                Routed to lab benches
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                                <FiClock />
                            </div>
                            <div className="lab-stat-val">6.2 min</div>
                            <div className="lab-stat-lbl">Avg. Drawing Time</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Registration to tube labeled
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
                                <FiTag />
                            </div>
                            <div className="lab-stat-val">0</div>
                            <div className="lab-stat-lbl">Rejected / Clotted</div>
                            <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px' }}>
                                Zero re-draw requests
                            </div>
                        </div>
                    </div>

                    {/* Specimen Tube Color Reference Bar */}
                    <div className="lab-card" style={{ marginBottom: '24px' }}>
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Specimen Tube Guide & Vacutainer Color Codes</h3>
                                <p className="lab-card-subtitle">Follow standard draw order and additive inversion guidelines</p>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                            {TUBE_TYPES.map(t => (
                                <div
                                    key={t.code}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        background: t.bg,
                                        border: `1px solid ${t.border}`,
                                        borderLeft: `5px solid ${t.color}`
                                    }}
                                >
                                    <div style={{ fontWeight: 700, fontSize: '13px', color: t.color }}>
                                        {t.label}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#475569', marginTop: '3px' }}>
                                        {t.tests}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Phlebotomy Collection Worklist */}
                    <div className="lab-card">
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Sample Collection Worklist</h3>
                                <p className="lab-card-subtitle">Draw blood/specimens, attach tube barcodes and dispatch to bench</p>
                            </div>
                            <button onClick={loadData} className="lab-btn lab-btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                                <FiRefreshCw style={{ marginRight: '6px' }} /> Refresh Worklist
                            </button>
                        </div>

                        <div className="lab-table-container">
                            <table className="lab-table">
                                <thead>
                                    <tr>
                                        <th>Patient & MRN</th>
                                        <th>Doctor</th>
                                        <th>Test Investigation</th>
                                        <th>Required Tubes</th>
                                        <th>Priority</th>
                                        <th>Collection Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary?.recentActivity && summary.recentActivity.length > 0 ? (
                                        summary.recentActivity.map((act, index) => {
                                            const isCollected = collectedIds.has(act.id);
                                            const tube = TUBE_TYPES[index % TUBE_TYPES.length];
                                            return (
                                                <tr key={act.id}>
                                                    <td>
                                                        <strong>{act.patientName}</strong>
                                                        <div style={{ fontSize: '11px', color: '#64748b' }}>MRN: {act.patientId}</div>
                                                    </td>
                                                    <td>{act.doctorName}</td>
                                                    <td>
                                                        {act.testNames?.length > 0 ? act.testNames.join(', ') : 'Blood Investigation'}
                                                    </td>
                                                    <td>
                                                        <span
                                                            style={{
                                                                display: 'inline-block',
                                                                padding: '3px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: 600,
                                                                background: tube.bg,
                                                                color: tube.color,
                                                                border: `1px solid ${tube.border}`
                                                            }}
                                                        >
                                                            {tube.label}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`lab-badge ${index === 0 ? 'badge-danger' : 'badge-neutral'}`}>
                                                            {index === 0 ? 'STAT / URGENT' : 'Routine'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {isCollected ? (
                                                            <span className="lab-badge badge-success">
                                                                <FiCheckCircle style={{ marginRight: '4px' }} /> Collected
                                                            </span>
                                                        ) : (
                                                            <span className="lab-badge badge-warning">
                                                                Pending Draw
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            {!isCollected ? (
                                                                <button
                                                                    className="lab-btn lab-btn-primary"
                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                    onClick={() => handleMarkCollected(act.id)}
                                                                >
                                                                    <FiCheckCircle style={{ marginRight: '4px' }} /> Mark Drawn
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    className="lab-btn lab-btn-secondary"
                                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                    onClick={() => navigate('/lab/bench')}
                                                                >
                                                                    Route to Bench
                                                                </button>
                                                            )}
                                                            <button
                                                                className="lab-btn lab-btn-secondary"
                                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                onClick={() => setSelectedProblem(act)}
                                                            >
                                                                Issue
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                                No pending patients in the phlebotomy queue.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Specimen Issue Modal */}
                    {selectedProblem && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', zIndex: 1000
                        }}>
                            <div style={{
                                background: '#fff', borderRadius: '12px', padding: '24px',
                                maxWidth: '440px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                            }}>
                                <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: '#b91c1c' }}>
                                    Report Specimen Issue
                                </h3>
                                <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
                                    Patient: <strong>{selectedProblem.patientName}</strong> (MRN: {selectedProblem.patientId})
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                    {['Hemolyzed Specimen', 'Clotted Blood in Tube', 'Insufficient Volume (QNS)', 'Patient Refused / Vasovagal', 'Incorrect Tube Type'].map(reason => (
                                        <button
                                            key={reason}
                                            className="lab-btn lab-btn-secondary"
                                            style={{ textAlign: 'left', justifyContent: 'flex-start', fontSize: '12px', padding: '8px 12px' }}
                                            onClick={() => {
                                                alert(`Issue "${reason}" recorded for patient ${selectedProblem.patientName}. Notified reception.`);
                                                setSelectedProblem(null);
                                            }}
                                        >
                                            <FiAlertTriangle style={{ marginRight: '8px', color: '#dc2626' }} />
                                            {reason}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        className="lab-btn lab-btn-secondary"
                                        onClick={() => setSelectedProblem(null)}
                                    >
                                        Cancel
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

export default LabCollectionDashboard;
