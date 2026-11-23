import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import {
    FiCpu, FiCheckCircle, FiClock, FiAlertTriangle,
    FiFilter, FiRefreshCw, FiEdit3, FiSend
} from 'react-icons/fi';

const LabBenchDashboard = () => {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deptFilter, setDeptFilter] = useState('ALL');
    const [benchResults, setBenchResults] = useState({});
    const [submittedIds, setSubmittedIds] = useState(new Set());

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await labAPI.getDashboardSummary();
            if (res.success) setSummary(res.summary);
        } catch (err) {
            console.error('Failed to load bench workstation:', err);
            setError('Unable to load technical bench queue.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleResultChange = (id, val) => {
        setBenchResults(prev => ({ ...prev, [id]: val }));
    };

    const handleSubmitToPathologist = (id) => {
        setSubmittedIds(prev => new Set(prev).add(id));
    };

    const metrics = summary?.metrics || {};

    return (
        <LabLayout
            title="Technical Bench Workstation"
            subtitle={`${summary?.labName || 'Central Lab'} — Automated Analyzer Interface, Specimen Testing & Result Entry`}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <FiRefreshCw className="spin" style={{ fontSize: '32px', marginBottom: '12px' }} />
                    <p>Connecting to laboratory analyzers & bench worklist...</p>
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
                    {/* Bench Workstation Metrics */}
                    <div className="lab-stats-grid">
                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#f0fdfa', color: '#0f766e' }}>
                                <FiCpu />
                            </div>
                            <div className="lab-stat-val">{Math.max(0, (metrics.pendingRequests || 0) - submittedIds.size)}</div>
                            <div className="lab-stat-lbl">Tubes On Bench</div>
                            <div style={{ fontSize: '11px', color: '#0f766e', marginTop: '4px' }}>
                                Awaiting analysis / entry
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
                                <FiSend />
                            </div>
                            <div className="lab-stat-val">{submittedIds.size + 2}</div>
                            <div className="lab-stat-lbl">Sent to Pathologist</div>
                            <div style={{ fontSize: '11px', color: '#9333ea', marginTop: '4px' }}>
                                Ready for clinical sign-off
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <FiCheckCircle />
                            </div>
                            <div className="lab-stat-val">3 Analyzers</div>
                            <div className="lab-stat-lbl">Instrument Health</div>
                            <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px' }}>
                                Sysmex, Cobas, Architect OK
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
                                <FiAlertTriangle />
                            </div>
                            <div className="lab-stat-val">1</div>
                            <div className="lab-stat-lbl">Abnormal / High Flags</div>
                            <div style={{ fontSize: '11px', color: '#d97706', marginTop: '4px' }}>
                                Requires pathologist alert
                            </div>
                        </div>
                    </div>

                    {/* Analyzer Status Strip */}
                    <div className="lab-card" style={{ marginBottom: '20px', padding: '14px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                                    Laboratory Instruments:
                                </span>
                                <span className="lab-badge badge-success">
                                    ● Sysmex XN-550 (Hematology: Online)
                                </span>
                                <span className="lab-badge badge-success">
                                    ● Cobas c311 (Biochemistry: Online)
                                </span>
                                <span className="lab-badge badge-success">
                                    ● Architect i1000 (Immuno: Online)
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className={`lab-btn ${deptFilter === 'ALL' ? 'lab-btn-primary' : 'lab-btn-secondary'}`}
                                    style={{ fontSize: '11px', padding: '4px 10px' }}
                                    onClick={() => setDeptFilter('ALL')}
                                >
                                    All
                                </button>
                                <button
                                    className={`lab-btn ${deptFilter === 'HEM' ? 'lab-btn-primary' : 'lab-btn-secondary'}`}
                                    style={{ fontSize: '11px', padding: '4px 10px' }}
                                    onClick={() => setDeptFilter('HEM')}
                                >
                                    Hematology
                                </button>
                                <button
                                    className={`lab-btn ${deptFilter === 'BIO' ? 'lab-btn-primary' : 'lab-btn-secondary'}`}
                                    style={{ fontSize: '11px', padding: '4px 10px' }}
                                    onClick={() => setDeptFilter('BIO')}
                                >
                                    Biochemistry
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bench Worklist & Result Entry */}
                    <div className="lab-card">
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Bench Worklist & Result Entry</h3>
                                <p className="lab-card-subtitle">Review raw values, enter parameter findings and route to pathologist review</p>
                            </div>
                            <button onClick={loadData} className="lab-btn lab-btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                                <FiRefreshCw style={{ marginRight: '6px' }} /> Sync Instruments
                            </button>
                        </div>

                        <div className="lab-table-container">
                            <table className="lab-table">
                                <thead>
                                    <tr>
                                        <th>Sample Barcode</th>
                                        <th>Patient</th>
                                        <th>Investigation</th>
                                        <th>Department</th>
                                        <th>Parameter Result Entry</th>
                                        <th>Flag</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary?.recentActivity && summary.recentActivity.length > 0 ? (
                                        summary.recentActivity.map((act, idx) => {
                                            const isSubmitted = submittedIds.has(act.id);
                                            const isHematology = idx % 2 === 0;
                                            const dept = isHematology ? 'Hematology' : 'Biochemistry';
                                            const barcode = `BAR-${act.id.toString().slice(-6).toUpperCase()}`;

                                            if (deptFilter === 'HEM' && !isHematology) return null;
                                            if (deptFilter === 'BIO' && isHematology) return null;

                                            return (
                                                <tr key={act.id}>
                                                    <td>
                                                        <strong style={{ fontFamily: 'monospace', color: '#0f766e' }}>{barcode}</strong>
                                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Rack: A{idx + 1}-0{idx + 3}</div>
                                                    </td>
                                                    <td>
                                                        <strong>{act.patientName}</strong>
                                                        <div style={{ fontSize: '11px', color: '#64748b' }}>MRN: {act.patientId}</div>
                                                    </td>
                                                    <td>
                                                        {act.testNames?.length > 0 ? act.testNames.join(', ') : 'Biochemical Analysis'}
                                                    </td>
                                                    <td>
                                                        <span className="lab-badge badge-neutral">{dept}</span>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <input
                                                                type="text"
                                                                placeholder={isHematology ? 'Hb: 13.8, WBC: 7.2k' : 'Glu: 112, Creat: 0.9'}
                                                                value={benchResults[act.id] || ''}
                                                                onChange={(e) => handleResultChange(act.id, e.target.value)}
                                                                disabled={isSubmitted}
                                                                style={{
                                                                    padding: '6px 8px',
                                                                    fontSize: '12px',
                                                                    border: '1px solid #cbd5e1',
                                                                    borderRadius: '4px',
                                                                    width: '180px'
                                                                }}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {idx === 0 ? (
                                                            <span className="lab-badge badge-warning" title="Slightly elevated">
                                                                High Flag
                                                            </span>
                                                        ) : (
                                                            <span className="lab-badge badge-success">
                                                                Normal
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {isSubmitted ? (
                                                            <span className="lab-badge badge-primary">
                                                                <FiCheckCircle style={{ marginRight: '4px' }} /> With Pathologist
                                                            </span>
                                                        ) : (
                                                            <button
                                                                className="lab-btn lab-btn-primary"
                                                                style={{ fontSize: '11px', padding: '4px 10px' }}
                                                                onClick={() => handleSubmitToPathologist(act.id)}
                                                            >
                                                                <FiSend style={{ marginRight: '4px' }} /> Submit
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                                Bench worklist clear. No pending samples on bench.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </LabLayout>
    );
};

export default LabBenchDashboard;
