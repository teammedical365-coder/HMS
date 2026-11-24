import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabSampleActionModal from './LabSampleActionModal';
import {
    FiCpu, FiCheckCircle, FiClock, FiAlertTriangle,
    FiFilter, FiRefreshCw, FiPlay, FiPause, FiExternalLink
} from 'react-icons/fi';

const DEPARTMENTS = ['ALL', 'Hematology', 'Biochemistry', 'Clinical Pathology', 'Serology', 'Microbiology'];

const LabBenchDashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deptFilter, setDeptFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [queue, setQueue] = useState([]);
    const [actionModal, setActionModal] = useState({ open: false, type: '', data: null });

    const loadBenchQueue = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await labAPI.samples.getProcessingQueue({ search });
            if (res.success) {
                setQueue(res.samples || []);
            }
        } catch (err) {
            console.error('Failed to load bench queue:', err);
            setError(err?.response?.data?.message || err?.message || 'Unable to load technical bench queue.');
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        loadBenchQueue();
    }, [loadBenchQueue]);

    const handleCompleteDirect = async (sample) => {
        try {
            const res = await labAPI.samples.completeProcessing(sample._id, { notes: 'Completed on bench run' });
            if (res.success) {
                loadBenchQueue();
            }
        } catch (err) {
            alert(err.response?.data?.message || err.message || 'Failed to complete processing');
        }
    };

    // Filter by department
    const filteredQueue = queue.filter(s => {
        if (deptFilter === 'ALL') return true;
        return (s.tests || []).some(t => t.department?.toLowerCase() === deptFilter.toLowerCase());
    });

    return (
        <LabLayout
            title="Technical Bench Workstation"
            subtitle="Automated Analyzer Queue, Sample Testing Lifecycle & Technical Batch Processing"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. DEPARTMENT FILTER PILLS & REFRESH */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginRight: '4px' }}>
                            <FiFilter /> Department:
                        </span>
                        {DEPARTMENTS.map(d => (
                            <button
                                key={d}
                                onClick={() => setDeptFilter(d)}
                                className={`lbd-period-btn ${deptFilter === d ? 'active' : ''}`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                            type="text"
                            placeholder="Search barcode or patient..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                        />
                        <button onClick={loadBenchQueue} className="lbd-btn-action">
                            <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh Worklist
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <FiAlertTriangle /> {error}
                    </div>
                )}

                {/* 2. BENCH PROCESSING WORKLIST TABLE */}
                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiCpu style={{ color: '#2563eb' }} /> Bench Testing Worklist ({filteredQueue.length})
                        </h3>
                    </div>

                    {filteredQueue.length === 0 ? (
                        <div className="lbd-empty-state">
                            <FiCheckCircle style={{ color: '#059669' }} />
                            <h3>Technical Bench Queue Empty</h3>
                            <p>No specimens currently awaiting testing or in progress for {deptFilter}.</p>
                        </div>
                    ) : (
                        <div className="lbd-table-wrapper">
                            <table className="lbd-table">
                                <thead>
                                    <tr>
                                        <th>Barcode</th>
                                        <th>Patient Details</th>
                                        <th>Container & Specimen</th>
                                        <th>Investigations</th>
                                        <th>Priority</th>
                                        <th>Testing Status</th>
                                        <th className="lbd-table-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredQueue.map((s) => (
                                        <tr key={s._id}>
                                            <td>
                                                <strong style={{ color: '#2563eb', fontFamily: 'monospace' }}>
                                                    {s.barcode}
                                                </strong>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{s.orderNumber}</div>
                                            </td>
                                            <td>
                                                <div><strong>{s.patientSnapshot?.name}</strong></div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                    {s.patientSnapshot?.gender} / {s.patientSnapshot?.age}Y • UHID: {s.patientSnapshot?.uhid || 'N/A'}
                                                </div>
                                            </td>
                                            <td>
                                                <div><strong>{s.containerType}</strong></div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{s.specimenType}</div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {(s.tests || []).map((t, idx) => (
                                                        <span key={idx} style={{ padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                                                            {t.testCode}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`lbm-sticker-priority ${(s.priority || 'Routine').toLowerCase()}`}>
                                                    {s.priority}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`lbd-badge ${s.status === 'PROCESSING' ? 'lbd-badge-partial' : s.status === 'ON_HOLD' ? 'lbd-badge-unpaid' : 'lbd-badge-paid'}`}>
                                                    {s.status.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="lbd-table-right">
                                                <div className="lbd-row-actions">
                                                    {s.status !== 'PROCESSING' ? (
                                                        <button
                                                            onClick={() => setActionModal({ open: true, type: 'process_start', data: s })}
                                                            className="lbd-btn-action lbd-btn-action-primary"
                                                            title="Start testing on bench"
                                                        >
                                                            <FiPlay /> Start Run
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleCompleteDirect(s)}
                                                                className="lbd-btn-action lbd-btn-action-success"
                                                                title="Complete Technical Testing"
                                                            >
                                                                <FiCheckCircle /> Complete Run
                                                            </button>
                                                            <button
                                                                onClick={() => setActionModal({ open: true, type: 'process_hold', data: s })}
                                                                className="lbd-btn-action"
                                                                title="Put on Hold"
                                                            >
                                                                <FiPause /> Hold
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => navigate(`/lab/samples/${s._id}`)}
                                                        className="lbd-btn-action"
                                                        title="Sample Audit Timeline"
                                                    >
                                                        <FiExternalLink />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ACTION MODAL */}
            {actionModal.open && (
                <LabSampleActionModal
                    type={actionModal.type}
                    data={actionModal.data}
                    onClose={() => setActionModal({ open: false, type: '', data: null })}
                    onSuccess={() => loadBenchQueue()}
                />
            )}
        </LabLayout>
    );
};

export default LabBenchDashboard;
