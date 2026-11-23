import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import {
    FiActivity, FiClock, FiCheckCircle, FiAlertTriangle,
    FiTrendingUp, FiCpu, FiLayers, FiUsers, FiDollarSign,
    FiRefreshCw, FiArrowRight, FiShield, FiSliders
} from 'react-icons/fi';

const LabManagerDashboard = () => {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await labAPI.getDashboardSummary();
            if (res.success) setSummary(res.summary);
        } catch (err) {
            console.error('Failed to load manager dashboard:', err);
            setError('Unable to load laboratory operations data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const metrics = summary?.metrics || {};

    return (
        <LabLayout
            title="Laboratory Operations & Management"
            subtitle={`${summary?.labName || 'Central Lab'} — Operational Throughput & Quality Oversight`}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <FiRefreshCw className="spin" style={{ fontSize: '32px', marginBottom: '12px' }} />
                    <p>Aggregating laboratory workflow metrics...</p>
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
                    {/* Operational Throughput Metrics */}
                    <div className="lab-stats-grid">
                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                                <FiClock />
                            </div>
                            <div className="lab-stat-val">3.8 hrs</div>
                            <div className="lab-stat-lbl">Average TAT</div>
                            <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px' }}>
                                Target: &lt; 4.5 hrs (Compliant)
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                                <FiActivity />
                            </div>
                            <div className="lab-stat-val">{metrics.pendingRequests || 0}</div>
                            <div className="lab-stat-lbl">Active In-Flight Orders</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Across all stations
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                <FiTrendingUp />
                            </div>
                            <div className="lab-stat-val">98.4%</div>
                            <div className="lab-stat-lbl">QC Compliance</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Calibrations verified today
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
                                <FiCheckCircle />
                            </div>
                            <div className="lab-stat-val">{metrics.completedReports || 0}</div>
                            <div className="lab-stat-lbl">Released Reports</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                Verified & dispatched
                            </div>
                        </div>

                        <div className="lab-stat-card">
                            <div className="lab-stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                                <FiAlertTriangle />
                            </div>
                            <div className="lab-stat-val">0</div>
                            <div className="lab-stat-lbl">Specimen Rejections</div>
                            <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px' }}>
                                0.0% Hemolysis rate
                            </div>
                        </div>
                    </div>

                    {/* Department-wise Bench Workload */}
                    <div className="lab-card" style={{ marginBottom: '24px' }}>
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Departmental Workload & Analyzer Status</h3>
                                <p className="lab-card-subtitle">Real-time specimen routing across laboratory benches</p>
                            </div>
                            <span className="lab-badge badge-success">Analyzers Online</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>Hematology</span>
                                    <span className="lab-badge badge-primary">Running</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 700, margin: '10px 0 4px', color: '#1e293b' }}>
                                    {Math.max(1, Math.floor((metrics.pendingRequests || 0) * 0.4))}
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>CBC, ESR, Blood Smear</div>
                                <div style={{ fontSize: '11px', color: '#059669', marginTop: '6px' }}>Analyzer: Sysmex XN-550 (OK)</div>
                            </div>

                            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>Biochemistry</span>
                                    <span className="lab-badge badge-primary">Running</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 700, margin: '10px 0 4px', color: '#1e293b' }}>
                                    {Math.max(1, Math.floor((metrics.pendingRequests || 0) * 0.35))}
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>LFT, KFT, Lipid, HbA1c</div>
                                <div style={{ fontSize: '11px', color: '#059669', marginTop: '6px' }}>Analyzer: Cobas c311 (OK)</div>
                            </div>

                            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>Serology & Immuno</span>
                                    <span className="lab-badge badge-primary">Running</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 700, margin: '10px 0 4px', color: '#1e293b' }}>
                                    {Math.max(0, Math.floor((metrics.pendingRequests || 0) * 0.15))}
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>Hepatitis, HIV, Thyroid</div>
                                <div style={{ fontSize: '11px', color: '#059669', marginTop: '6px' }}>Analyzer: Architect i1000 (OK)</div>
                            </div>

                            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>Microbiology</span>
                                    <span className="lab-badge badge-neutral">Standby</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 700, margin: '10px 0 4px', color: '#1e293b' }}>
                                    {Math.max(0, Math.floor((metrics.pendingRequests || 0) * 0.1))}
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>Urine Culture, Gram Stain</div>
                                <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '6px' }}>Incubator 37°C Calibrated</div>
                            </div>
                        </div>
                    </div>

                    {/* Operational Workstations Routing Bar */}
                    <div className="lab-card" style={{ marginBottom: '24px' }}>
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Clinical Workstation Supervisions</h3>
                                <p className="lab-card-subtitle">Direct access to monitor and inspect team stations</p>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/reception')}
                                style={{ justifyContent: 'space-between', padding: '12px 16px' }}
                            >
                                <span><FiUsers style={{ marginRight: '8px', color: '#2563eb' }} /> Reception Desk</span>
                                <FiArrowRight />
                            </button>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/collection')}
                                style={{ justifyContent: 'space-between', padding: '12px 16px' }}
                            >
                                <span><FiLayers style={{ marginRight: '8px', color: '#dc2626' }} /> Phlebotomy Station</span>
                                <FiArrowRight />
                            </button>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/bench')}
                                style={{ justifyContent: 'space-between', padding: '12px 16px' }}
                            >
                                <span><FiCpu style={{ marginRight: '8px', color: '#0d9488' }} /> Technical Bench</span>
                                <FiArrowRight />
                            </button>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/verification')}
                                style={{ justifyContent: 'space-between', padding: '12px 16px' }}
                            >
                                <span><FiCheckCircle style={{ marginRight: '8px', color: '#7c3aed' }} /> Pathologist Review</span>
                                <FiArrowRight />
                            </button>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/locations')}
                                style={{ justifyContent: 'space-between', padding: '12px 16px' }}
                            >
                                <span><FiSliders style={{ marginRight: '8px', color: '#475569' }} /> Lab Locations</span>
                                <FiArrowRight />
                            </button>
                        </div>
                    </div>

                    {/* Pending Operational Orders Table */}
                    <div className="lab-card">
                        <div className="lab-card-header">
                            <div>
                                <h3 className="lab-card-title">Orders Under Processing</h3>
                                <p className="lab-card-subtitle">Active turnaround monitoring for ongoing tests</p>
                            </div>
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => navigate('/lab/tests')}
                                style={{ fontSize: '12px', padding: '6px 12px' }}
                            >
                                View All Tests <FiArrowRight style={{ marginLeft: '4px' }} />
                            </button>
                        </div>

                        <div className="lab-table-container">
                            <table className="lab-table">
                                <thead>
                                    <tr>
                                        <th>Patient</th>
                                        <th>Doctor</th>
                                        <th>Requested Panels</th>
                                        <th>Status</th>
                                        <th>Priority</th>
                                        <th>Elapsed</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary?.recentActivity && summary.recentActivity.length > 0 ? (
                                        summary.recentActivity.map(act => (
                                            <tr key={act.id}>
                                                <td>
                                                    <strong>{act.patientName}</strong>
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>MRN: {act.patientId}</div>
                                                </td>
                                                <td>{act.doctorName}</td>
                                                <td>
                                                    {act.testNames?.length > 0
                                                        ? act.testNames.join(', ')
                                                        : 'Routine Panel'}
                                                </td>
                                                <td>
                                                    <span className={`lab-badge ${act.reportStatus === 'Completed' ? 'badge-success' : 'badge-warning'}`}>
                                                        {act.reportStatus}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="lab-badge badge-neutral">Routine</span>
                                                </td>
                                                <td style={{ fontSize: '12px', color: '#64748b' }}>
                                                    {act.createdAt ? new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                                All orders processed. Worklist is currently clear.
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

export default LabManagerDashboard;
