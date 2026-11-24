import React, { useState, useEffect } from 'react';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabResultModal from './LabResultModal';
import {
    FiSearch, FiFilter, FiRefreshCw, FiCheckCircle, FiAlertOctagon,
    FiAlertTriangle, FiCheck, FiX, FiRotateCcw, FiClock, FiFileText
} from 'react-icons/fi';

const LabVerificationPage = () => {
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filters
    const [search, setSearch] = useState('');
    const [department, setDepartment] = useState('');
    const [priority, setPriority] = useState('');
    const [abnormalOnly, setAbnormalOnly] = useState(false);
    const [criticalOnly, setCriticalOnly] = useState(false);

    // Active Modal
    const [activeModal, setActiveModal] = useState(null);

    const loadQueue = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (search) params.search = search;
            if (department) params.department = department;
            if (priority) params.priority = priority;
            if (abnormalOnly) params.abnormalOnly = 'true';
            if (criticalOnly) params.criticalOnly = 'true';

            const res = await labAPI.results.getVerificationQueue(params);
            if (res.success) {
                setQueue(res.queue || []);
            }
        } catch (err) {
            console.error('Failed to load verification queue:', err);
            setError(err.response?.data?.message || err.message || 'Failed to load verification queue');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadQueue();
    }, [department, priority, abnormalOnly, criticalOnly]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadQueue();
    };

    const handleOpenReview = (result) => {
        setActiveModal({
            resultId: result._id,
            mode: 'verification'
        });
    };

    return (
        <LabLayout
            title="Pathologist Verification & Medical Sign-Off Console"
            subtitle="Clinical evaluation, biological reference interval validation, panic alert oversight, and authorized diagnostic release"
            action={
                <button onClick={loadQueue} className="lab-btn lab-btn-secondary">
                    <FiRefreshCw style={{ marginRight: '6px' }} />
                    Refresh Queue
                </button>
            }
        >
            {error && (
                <div className="lab-card" style={{ borderLeft: '4px solid #ef4444', color: '#b91c1c', marginBottom: '20px' }}>
                    <FiAlertTriangle style={{ marginRight: '8px' }} />
                    {error}
                </div>
            )}

            {/* Filter Console */}
            <div className="lab-card" style={{ marginBottom: '20px', padding: '16px' }}>
                <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: '1 1 240px', position: 'relative' }}>
                        <FiSearch style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8' }} />
                        <input
                            type="text"
                            className="lab-input"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by Barcode, Patient, UHID, Test Code..."
                            style={{ paddingLeft: '36px', width: '100%' }}
                        />
                    </div>

                    <select
                        className="lab-input"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        style={{ minWidth: '160px' }}
                    >
                        <option value="">All Departments</option>
                        <option value="Hematology">Hematology</option>
                        <option value="Biochemistry">Biochemistry</option>
                        <option value="Clinical Pathology">Clinical Pathology</option>
                        <option value="Serology">Serology</option>
                        <option value="Microbiology">Microbiology</option>
                        <option value="Immunology">Immunology</option>
                    </select>

                    <select
                        className="lab-input"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        style={{ minWidth: '130px' }}
                    >
                        <option value="">All Priorities</option>
                        <option value="STAT">STAT / Emergency</option>
                        <option value="Urgent">Urgent</option>
                        <option value="Routine">Routine</option>
                    </select>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', color: '#92400e' }}>
                        <input
                            type="checkbox"
                            checked={abnormalOnly}
                            onChange={(e) => setAbnormalOnly(e.target.checked)}
                        />
                        Abnormal Only
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', color: '#b91c1c', fontWeight: 600 }}>
                        <input
                            type="checkbox"
                            checked={criticalOnly}
                            onChange={(e) => setCriticalOnly(e.target.checked)}
                        />
                        Critical Panic Values Only
                    </label>

                    <button type="submit" className="lab-btn lab-btn-primary">
                        Filter
                    </button>
                    {(search || department || priority || abnormalOnly || criticalOnly) && (
                        <button
                            type="button"
                            className="lab-btn lab-btn-secondary"
                            onClick={() => {
                                setSearch('');
                                setDepartment('');
                                setPriority('');
                                setAbnormalOnly(false);
                                setCriticalOnly(false);
                            }}
                        >
                            Reset
                        </button>
                    )}
                </form>
            </div>

            {/* Queue Table */}
            <div className="lab-card" style={{ padding: 0 }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                        <FiRefreshCw className="spin" style={{ fontSize: '32px', marginBottom: '12px' }} />
                        <p>Loading pathologist verification queue & abnormal alerts...</p>
                    </div>
                ) : queue.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                        <FiCheckCircle style={{ fontSize: '42px', color: '#16a34a', marginBottom: '12px' }} />
                        <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>Verification Queue Clear</h4>
                        <p style={{ margin: 0, fontSize: '13px' }}>
                            All submitted technician findings have been reviewed and signed off.
                        </p>
                    </div>
                ) : (
                    <table className="lab-table" style={{ width: '100%', fontSize: '13px' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '14%' }}>Barcode / Order</th>
                                <th style={{ width: '18%' }}>Patient Demographics</th>
                                <th style={{ width: '20%' }}>Test / Department</th>
                                <th style={{ width: '18%' }}>Observed Key Findings</th>
                                <th style={{ width: '15%' }}>Technician / Time</th>
                                <th style={{ width: '15%', textAlign: 'right' }}>Review & Sign-Off</th>
                            </tr>
                        </thead>
                        <tbody>
                            {queue.map((res, idx) => {
                                const hasCritical = res.hasCriticalParameters;
                                const hasAbnormal = res.hasAbnormalParameters;
                                const isStat = res.priority === 'STAT';

                                return (
                                    <tr key={idx} style={{
                                        background: hasCritical ? '#fff1f2' : isStat ? '#fff7ed' : hasAbnormal ? '#fffdf7' : 'inherit'
                                    }}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{res.barcode}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{res.orderNumber} • Token #{res.tokenNumber}</div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                {res.patientSnapshot?.name}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                {res.patientSnapshot?.age}y / {res.patientSnapshot?.gender} • UHID: {res.patientSnapshot?.uhid || 'N/A'}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#0284c7' }}>
                                                {res.testName} ({res.testCode})
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                {res.department} • Priority: <strong>{res.priority}</strong>
                                            </div>
                                        </td>
                                        <td>
                                            {/* Key parameter summary chips */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {hasCritical && (
                                                    <span className="lab-badge lab-badge-danger" style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content' }}>
                                                        <FiAlertOctagon style={{ marginRight: '4px' }} />
                                                        PANIC VALUE BREACH
                                                    </span>
                                                )}
                                                {hasAbnormal && !hasCritical && (
                                                    <span className="lab-badge lab-badge-warning" style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content' }}>
                                                        <FiAlertTriangle style={{ marginRight: '4px' }} />
                                                        ABNORMAL FINDINGS
                                                    </span>
                                                )}
                                                <div style={{ fontSize: '11px', color: '#475569' }}>
                                                    {(res.resultParameters || []).slice(0, 2).map(p => `${p.parameterName}: ${p.enteredValue} ${p.unit}`).join(' | ')}
                                                    {(res.resultParameters || []).length > 2 ? ` (+${res.resultParameters.length - 2} more)` : ''}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 500, color: '#334155' }}>
                                                {res.submittedByName || res.enteredByName || 'Technician'}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                {res.submittedAt ? new Date(res.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                className="lab-btn lab-btn-primary"
                                                onClick={() => handleOpenReview(res)}
                                                style={{ padding: '6px 12px', fontSize: '12px', background: hasCritical ? '#dc2626' : '#16a34a' }}
                                            >
                                                <FiCheck style={{ marginRight: '4px' }} />
                                                Review & Sign-Off
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal */}
            {activeModal && (
                <LabResultModal
                    isOpen={true}
                    onClose={() => setActiveModal(null)}
                    resultId={activeModal.resultId}
                    mode="verification"
                    onActionSuccess={() => {
                        loadQueue();
                    }}
                />
            )}
        </LabLayout>
    );
};

export default LabVerificationPage;
