import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabResultModal from './LabResultModal';
import './LabResultEntry.css';
import {
    FiArrowLeft, FiCheckCircle, FiAlertOctagon, FiAlertTriangle,
    FiClock, FiFileText, FiRefreshCw, FiEdit3, FiCheck, FiX, FiLayers
} from 'react-icons/fi';

const LabResultDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [result, setResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('entry');

    const loadResult = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await labAPI.results.getResultById(id);
            if (res.success) {
                setResult(res.result);
                setHistory(res.history || []);
            }
        } catch (err) {
            console.error('Failed to load result:', err);
            setError(err.response?.data?.message || err.message || 'Failed to load test result detail');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadResult();
    }, [id]);

    const isVerified = result?.resultStatus === 'VERIFIED';
    const isSubmitted = result?.resultStatus === 'SUBMITTED';

    return (
        <LabLayout
            title={`Clinical Findings: ${result?.testName || 'Laboratory Test'}`}
            subtitle={`Order ${result?.orderNumber || ''} • Sample Barcode: ${result?.barcode || ''}`}
            action={
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => navigate(-1)} className="lab-btn lab-btn-secondary">
                        <FiArrowLeft style={{ marginRight: '6px' }} />
                        Back
                    </button>
                    {!isVerified && (
                        <button
                            onClick={() => { setModalMode(isSubmitted ? 'verification' : 'entry'); setIsModalOpen(true); }}
                            className="lab-btn lab-btn-primary"
                        >
                            <FiEdit3 style={{ marginRight: '6px' }} />
                            {isSubmitted ? 'Pathologist Sign-Off' : 'Edit Findings'}
                        </button>
                    )}
                    {isVerified && (
                        <button
                            onClick={() => { setModalMode('verification'); setIsModalOpen(true); }}
                            className="lab-btn lab-btn-secondary"
                        >
                            <FiEdit3 style={{ marginRight: '6px' }} />
                            Create Amendment
                        </button>
                    )}
                </div>
            }
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                    <FiRefreshCw className="spin" style={{ fontSize: '32px', marginBottom: '12px' }} />
                    <p>Loading clinical findings & parameter sheets...</p>
                </div>
            ) : error ? (
                <div className="lab-card" style={{ borderLeft: '4px solid #ef4444', color: '#b91c1c' }}>
                    <FiAlertTriangle style={{ marginRight: '8px' }} />
                    {error}
                </div>
            ) : !result ? (
                <div className="lab-card" style={{ textAlign: 'center', padding: '40px' }}>
                    Result record not found.
                </div>
            ) : (
                <>
                    {/* Header Summary Card */}
                    <div className="lab-card" style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', fontSize: '13px' }}>
                            <div>
                                <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Patient</span>
                                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '15px' }}>{result.patientSnapshot?.name}</div>
                                <div style={{ color: '#64748b' }}>UHID: {result.patientSnapshot?.uhid || 'N/A'} • {result.patientSnapshot?.age}y / {result.patientSnapshot?.gender}</div>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Requisition</span>
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>{result.orderNumber} (Token #{result.tokenNumber})</div>
                                <div style={{ color: '#64748b' }}>Priority: <strong>{result.priority}</strong></div>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Specimen / Department</span>
                                <div style={{ fontWeight: 600, color: '#0284c7' }}>{result.department}</div>
                                <div style={{ color: '#64748b' }}>Barcode: <strong>{result.barcode}</strong></div>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Status</span>
                                <div>
                                    <span className={`lab-badge ${
                                        isVerified ? 'lab-badge-success' :
                                        isSubmitted ? 'lab-badge-warning' : 'lab-badge-info'
                                    }`}>
                                        {result.resultStatus}
                                    </span>
                                    {result.revisionNumber > 1 && (
                                        <span className="lab-badge" style={{ background: '#e0e7ff', color: '#4338ca', marginLeft: '6px' }}>
                                            Revision {result.revisionNumber}
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                    {result.verifiedByName ? `Verified by ${result.verifiedByName}` : result.submittedByName ? `Submitted by ${result.submittedByName}` : ''}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Panic Warning Banner */}
                    {result.hasCriticalParameters && (
                        <div style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '12px 20px', borderRadius: '4px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b' }}>
                            <FiAlertOctagon style={{ fontSize: '20px' }} />
                            <div>
                                <strong>PANIC VALUE REPORTED:</strong> One or more parameters in this test breached critical physiological boundaries. Attending clinician notification required.
                            </div>
                        </div>
                    )}

                    {/* Parameters Findings Table */}
                    <div className="lab-card" style={{ padding: 0, marginBottom: '20px' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', color: '#0f172a' }}>
                                Measured Parameters & Reference Intervals
                            </h3>
                        </div>
                        <table className="lab-table" style={{ width: '100%', fontSize: '13px' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '25%' }}>Parameter Name</th>
                                    <th style={{ width: '20%' }}>Observed Result</th>
                                    <th style={{ width: '15%' }}>Unit</th>
                                    <th style={{ width: '25%' }}>Biological Reference Interval</th>
                                    <th style={{ width: '15%' }}>Flag</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(result.resultParameters || []).map((p, idx) => (
                                    <tr key={idx} style={{
                                        background: p.criticalFlag ? '#fff1f2' : (p.abnormalFlag === 'LOW' || p.abnormalFlag === 'HIGH') ? '#fffdf7' : 'inherit'
                                    }}>
                                        <td style={{ fontWeight: 600, color: '#1e293b' }}>
                                            {p.parameterName}
                                            {p.parameterCode && <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>({p.parameterCode})</span>}
                                        </td>
                                        <td style={{ fontWeight: 600, fontSize: '14px', color: p.criticalFlag ? '#dc2626' : '#0f172a' }}>
                                            {p.enteredValue || '—'}
                                        </td>
                                        <td style={{ color: '#64748b' }}>
                                            {p.unit || '—'}
                                        </td>
                                        <td style={{ color: '#334155' }}>
                                            {p.referenceRangeText || 'Not Configured'}
                                        </td>
                                        <td>
                                            {p.criticalFlag ? (
                                                <span className="lab-badge lab-badge-danger">
                                                    CRITICAL ({p.abnormalFlag})
                                                </span>
                                            ) : p.abnormalFlag === 'LOW' ? (
                                                <span className="lab-badge lab-badge-warning" style={{ background: '#fef3c7', color: '#b45309' }}>
                                                    ↓ LOW
                                                </span>
                                            ) : p.abnormalFlag === 'HIGH' ? (
                                                <span className="lab-badge lab-badge-warning" style={{ background: '#fed7aa', color: '#c2410c' }}>
                                                    ↑ HIGH
                                                </span>
                                            ) : p.abnormalFlag === 'ABNORMAL' ? (
                                                <span className="lab-badge lab-badge-warning">
                                                    ABNORMAL
                                                </span>
                                            ) : (
                                                <span className="lab-badge lab-badge-success" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                                    NORMAL
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Remarks Card */}
                    {(result.overallRemarks || result.clinicalNotes) && (
                        <div className="lab-card" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '13px' }}>
                                {result.overallRemarks && (
                                    <div>
                                        <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#475569' }}>Technician Remarks:</h4>
                                        <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '4px', color: '#334155' }}>
                                            {result.overallRemarks}
                                        </div>
                                    </div>
                                )}
                                {result.clinicalNotes && (
                                    <div>
                                        <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#475569' }}>Pathologist Clinical Notes:</h4>
                                        <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '4px', color: '#334155' }}>
                                            {result.clinicalNotes}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Audit History Timeline */}
                    <div className="lab-card">
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiClock style={{ color: '#0284c7' }} />
                            Audit Log & Chain of Custody
                        </h3>
                        {history.length === 0 ? (
                            <div style={{ color: '#94a3b8', fontSize: '13px' }}>No audit history records available.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {history.map((h, idx) => (
                                    <div key={idx} style={{
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        padding: '10px 14px',
                                        background: '#fafafa',
                                        fontSize: '12px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{h.action} (Revision {h.revisionNumber || 1})</span>
                                            <span style={{ color: '#64748b' }}>{new Date(h.timestamp).toLocaleString()}</span>
                                        </div>
                                        <div style={{ color: '#475569' }}>
                                            Performed by: <strong>{h.performedByName || 'Staff'}</strong> • Transition: {h.previousStatus || 'INIT'} → <strong>{h.newStatus}</strong>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Modal */}
            {isModalOpen && (
                <LabResultModal
                    isOpen={true}
                    onClose={() => setIsModalOpen(false)}
                    resultId={result._id}
                    mode={modalMode}
                    onActionSuccess={() => {
                        loadResult();
                    }}
                />
            )}
        </LabLayout>
    );
};

export default LabResultDetailPage;
