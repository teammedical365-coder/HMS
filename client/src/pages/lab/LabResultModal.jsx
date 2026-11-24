import React, { useState, useEffect } from 'react';
import { labAPI } from '../../utils/api';
import {
    FiX, FiCheck, FiAlertTriangle, FiAlertOctagon, FiClock,
    FiSave, FiSend, FiRotateCcw, FiFileText, FiRefreshCw, FiEdit3
} from 'react-icons/fi';

const LabResultModal = ({ isOpen, onClose, resultId, sampleId, testId, orderId, mode = 'entry', onActionSuccess }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);
    const [parameters, setParameters] = useState([]);
    const [overallRemarks, setOverallRemarks] = useState('');
    const [clinicalNotes, setClinicalNotes] = useState('');
    const [activeTab, setActiveTab] = useState('parameters'); // 'parameters' | 'history'
    const [history, setHistory] = useState([]);

    // Prompt modals for reject / correction / amendment
    const [promptAction, setPromptAction] = useState(null); // 'reject' | 'correction' | 'amendment'
    const [promptReason, setPromptReason] = useState('');
    const [promptNotes, setPromptNotes] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setResult(null);
            setParameters([]);
            setPromptAction(null);
            setPromptReason('');
            setErrorMsg('');
            return;
        }

        const fetchOrInit = async () => {
            setLoading(true);
            setErrorMsg('');
            try {
                let resDoc = null;
                if (resultId) {
                    const res = await labAPI.results.getResultById(resultId);
                    if (res.success) {
                        resDoc = res.result;
                        setHistory(res.history || []);
                    }
                } else if (testId && (sampleId || orderId)) {
                    const initRes = await labAPI.results.initializeResult({ sampleId, testId, orderId });
                    if (initRes.success) {
                        resDoc = initRes.result;
                    }
                }

                if (resDoc) {
                    setResult(resDoc);
                    setParameters(resDoc.resultParameters || []);
                    setOverallRemarks(resDoc.overallRemarks || '');
                    setClinicalNotes(resDoc.clinicalNotes || '');
                }
            } catch (err) {
                console.error('Failed to load result:', err);
                setErrorMsg(err.response?.data?.message || err.message || 'Failed to load test parameters');
            } finally {
                setLoading(false);
            }
        };

        fetchOrInit();
    }, [isOpen, resultId, sampleId, testId, orderId]);

    if (!isOpen) return null;

    const handleParamChange = (index, value) => {
        setParameters(prev => {
            const next = [...prev];
            const p = { ...next[index], enteredValue: value };

            // Dynamic live evaluation preview for numeric parameters
            if (p.dataType === 'Numeric' && value !== '') {
                const num = parseFloat(value);
                if (!isNaN(num)) {
                    p.numericValue = num;
                    const snap = p.referenceRangeSnapshot || {};
                    if (snap.criticalLow != null && num < snap.criticalLow) {
                        p.criticalFlag = true;
                        p.abnormalFlag = 'LOW';
                    } else if (snap.criticalHigh != null && num > snap.criticalHigh) {
                        p.criticalFlag = true;
                        p.abnormalFlag = 'HIGH';
                    } else if (snap.normalMin != null && num < snap.normalMin) {
                        p.abnormalFlag = 'LOW';
                        p.criticalFlag = false;
                    } else if (snap.normalMax != null && num > snap.normalMax) {
                        p.abnormalFlag = 'HIGH';
                        p.criticalFlag = false;
                    } else {
                        p.abnormalFlag = 'NORMAL';
                        p.criticalFlag = false;
                    }
                }
            } else if (p.dataType === 'Choice') {
                const lower = String(value).toLowerCase();
                if (['positive', 'reactive', 'present', 'detected'].includes(lower)) {
                    p.abnormalFlag = 'ABNORMAL';
                } else if (['negative', 'non-reactive', 'absent', 'not detected'].includes(lower)) {
                    p.abnormalFlag = 'NORMAL';
                }
            }

            next[index] = p;
            return next;
        });
    };

    const handleParamRemarksChange = (index, remarks) => {
        setParameters(prev => {
            const next = [...prev];
            next[index] = { ...next[index], remarks };
            return next;
        });
    };

    // Save Draft
    const handleSaveDraft = async () => {
        setSaving(true);
        setErrorMsg('');
        try {
            const res = await labAPI.results.saveDraft(result._id, {
                parameters,
                overallRemarks,
                clinicalNotes
            });
            if (res.success) {
                setResult(res.result);
                setParameters(res.result.resultParameters || []);
                alert('Result draft saved successfully');
                if (onActionSuccess) onActionSuccess(res.result);
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || err.message || 'Failed to save draft');
        } finally {
            setSaving(false);
        }
    };

    // Submit for Verification
    const handleSubmit = async () => {
        setSaving(true);
        setErrorMsg('');
        try {
            const res = await labAPI.results.submitResult(result._id, {
                parameters,
                overallRemarks,
                clinicalNotes
            });
            if (res.success) {
                alert('Results submitted to Pathologist verification queue!');
                if (onActionSuccess) onActionSuccess(res.result);
                onClose();
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || err.message || 'Failed to submit results');
        } finally {
            setSaving(false);
        }
    };

    // Pathologist: Approve
    const handleVerify = async () => {
        setSaving(true);
        setErrorMsg('');
        try {
            const res = await labAPI.results.verifyResult(result._id, { overallRemarks });
            if (res.success) {
                alert('Results verified and clinically approved!');
                if (onActionSuccess) onActionSuccess(res.result);
                onClose();
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || err.message || 'Failed to verify result');
        } finally {
            setSaving(false);
        }
    };

    // Submit prompt actions (Reject / Request Correction / Amendment)
    const handlePromptSubmit = async () => {
        if (!promptReason.trim()) {
            setErrorMsg('Mandatory clinical reason is required');
            return;
        }

        setSaving(true);
        setErrorMsg('');
        try {
            let res = null;
            if (promptAction === 'reject') {
                res = await labAPI.results.rejectResult(result._id, {
                    rejectionReason: promptReason,
                    notes: promptNotes
                });
            } else if (promptAction === 'correction') {
                res = await labAPI.results.requestCorrection(result._id, {
                    correctionReason: promptReason,
                    notes: promptNotes
                });
            } else if (promptAction === 'amendment') {
                res = await labAPI.results.createAmendment(result._id, {
                    reason: promptReason,
                    parameters
                });
            }

            if (res && res.success) {
                alert(`Action ${promptAction.toUpperCase()} executed successfully`);
                if (onActionSuccess) onActionSuccess(res.result);
                onClose();
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || err.message || 'Action failed');
        } finally {
            setSaving(false);
        }
    };

    const isVerified = result?.resultStatus === 'VERIFIED';
    const isSubmitted = result?.resultStatus === 'SUBMITTED';
    const isCorrectionRequested = result?.resultStatus === 'CORRECTION_REQUESTED';
    const isRejected = result?.resultStatus === 'REJECTED';
    const isReadOnly = mode === 'verification' || isVerified;

    const hasAnyCritical = parameters.some(p => p.criticalFlag);
    const hasAnyAbnormal = parameters.some(p => p.abnormalFlag === 'LOW' || p.abnormalFlag === 'HIGH' || p.abnormalFlag === 'ABNORMAL');

    return (
        <div className="lab-modal-overlay">
            <div className="lab-modal" style={{ maxWidth: '960px', width: '95%' }}>
                {/* Header */}
                <div className="lab-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px' }}>
                                {result?.testName || 'Laboratory Test Findings'}
                            </h3>
                            <span className="lab-badge" style={{ background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                {result?.testCode}
                            </span>
                            <span className={`lab-badge ${
                                isVerified ? 'lab-badge-success' :
                                isSubmitted ? 'lab-badge-warning' :
                                isRejected ? 'lab-badge-danger' :
                                isCorrectionRequested ? 'lab-badge-warning' : 'lab-badge-info'
                            }`}>
                                {result?.resultStatus || 'PENDING'}
                            </span>
                            {result?.revisionNumber > 1 && (
                                <span className="lab-badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>
                                    Rev {result.revisionNumber}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                            Order: <strong>{result?.orderNumber}</strong> • Barcode: <strong>{result?.barcode}</strong> • Patient: <strong>{result?.patientSnapshot?.name}</strong> ({result?.patientSnapshot?.age}y / {result?.patientSnapshot?.gender})
                        </div>
                    </div>
                    <button className="lab-btn-icon" onClick={onClose} disabled={saving}>
                        <FiX style={{ fontSize: '20px' }} />
                    </button>
                </div>

                {/* Sub-Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px', background: '#f8fafc' }}>
                    <button
                        onClick={() => setActiveTab('parameters')}
                        style={{
                            padding: '10px 16px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === 'parameters' ? '2px solid #0284c7' : 'none',
                            color: activeTab === 'parameters' ? '#0284c7' : '#64748b',
                            fontWeight: activeTab === 'parameters' ? 600 : 500,
                            cursor: 'pointer'
                        }}
                    >
                        <FiFileText style={{ marginRight: '6px' }} />
                        Parameters & Findings ({parameters.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        style={{
                            padding: '10px 16px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === 'history' ? '2px solid #0284c7' : 'none',
                            color: activeTab === 'history' ? '#0284c7' : '#64748b',
                            fontWeight: activeTab === 'history' ? 600 : 500,
                            cursor: 'pointer'
                        }}
                    >
                        <FiClock style={{ marginRight: '6px' }} />
                        Audit History & Revisions ({history.length + (result?.correctionHistory?.length || 0)})
                    </button>
                </div>

                {/* Critical / Abnormal Notification Banners */}
                {hasAnyCritical && (
                    <div style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b', fontSize: '13px' }}>
                        <FiAlertOctagon style={{ fontSize: '18px', flexShrink: 0 }} />
                        <div>
                            <strong>CRITICAL VALUE ALERT DETECTED:</strong> One or more parameter values breach clinical life-threatening thresholds. Mandatory physician notification required upon submission.
                        </div>
                    </div>
                )}
                {hasAnyAbnormal && !hasAnyCritical && (
                    <div style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '10px', color: '#92400e', fontSize: '12px' }}>
                        <FiAlertTriangle style={{ fontSize: '16px', flexShrink: 0 }} />
                        <div>
                            Abnormal findings detected outside physiological reference ranges.
                        </div>
                    </div>
                )}
                {errorMsg && (
                    <div style={{ background: '#fef2f2', borderLeft: '4px solid #dc2626', padding: '10px 24px', color: '#b91c1c', fontSize: '13px' }}>
                        {errorMsg}
                    </div>
                )}

                {/* Body Content */}
                <div className="lab-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '20px 24px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                            <FiRefreshCw className="spin" style={{ fontSize: '28px', marginBottom: '8px' }} />
                            <p>Loading clinical parameters & reference ranges...</p>
                        </div>
                    ) : activeTab === 'parameters' ? (
                        <>
                            {/* Parameters Table */}
                            <table className="lab-table" style={{ width: '100%', fontSize: '13px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '25%' }}>Parameter</th>
                                        <th style={{ width: '22%' }}>Observed Finding</th>
                                        <th style={{ width: '12%' }}>Unit</th>
                                        <th style={{ width: '23%' }}>Biological Ref Interval</th>
                                        <th style={{ width: '18%' }}>Flag</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parameters.map((p, idx) => (
                                        <tr key={idx} style={{
                                            background: p.criticalFlag ? '#fff1f2' : (p.abnormalFlag === 'LOW' || p.abnormalFlag === 'HIGH') ? '#fffdf7' : 'inherit'
                                        }}>
                                            <td>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                    {p.parameterName} {p.isRequired && <span style={{ color: '#ef4444' }}>*</span>}
                                                </div>
                                                {p.parameterCode && (
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{p.parameterCode}</div>
                                                )}
                                            </td>
                                            <td>
                                                {isReadOnly ? (
                                                    <span style={{ fontWeight: 600, fontSize: '14px', color: p.criticalFlag ? '#dc2626' : '#0f172a' }}>
                                                        {p.enteredValue || '—'}
                                                    </span>
                                                ) : p.dataType === 'Choice' ? (
                                                    <select
                                                        className="lab-input"
                                                        value={p.enteredValue || ''}
                                                        onChange={(e) => handleParamChange(idx, e.target.value)}
                                                        style={{ width: '100%', padding: '6px 8px' }}
                                                    >
                                                        <option value="">-- Select --</option>
                                                        {(p.choices || []).map((ch, cIdx) => (
                                                            <option key={cIdx} value={ch}>{ch}</option>
                                                        ))}
                                                    </select>
                                                ) : p.dataType === 'Numeric' ? (
                                                    <input
                                                        type="number"
                                                        step={p.decimalPlaces > 0 ? (1 / Math.pow(10, p.decimalPlaces)).toString() : '1'}
                                                        className="lab-input"
                                                        value={p.enteredValue || ''}
                                                        onChange={(e) => handleParamChange(idx, e.target.value)}
                                                        placeholder="Enter numeric value"
                                                        style={{
                                                            width: '100%',
                                                            padding: '6px 8px',
                                                            borderColor: p.criticalFlag ? '#ef4444' : p.abnormalFlag !== 'NORMAL' ? '#f59e0b' : '#cbd5e1'
                                                        }}
                                                    />
                                                ) : (
                                                    <input
                                                        type="text"
                                                        className="lab-input"
                                                        value={p.enteredValue || ''}
                                                        onChange={(e) => handleParamChange(idx, e.target.value)}
                                                        placeholder="Enter descriptive finding"
                                                        style={{ width: '100%', padding: '6px 8px' }}
                                                    />
                                                )}
                                            </td>
                                            <td style={{ color: '#64748b', fontSize: '12px' }}>
                                                {p.unit || '—'}
                                            </td>
                                            <td style={{ fontSize: '12px', color: '#334155' }}>
                                                <div>{p.referenceRangeText || 'Not Configured'}</div>
                                                {p.referenceRangeSnapshot?.interpretationNotes && (
                                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                        {p.referenceRangeSnapshot.interpretationNotes}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                {p.criticalFlag ? (
                                                    <span className="lab-badge lab-badge-danger" style={{ animation: 'pulse 1.5s infinite' }}>
                                                        <FiAlertOctagon style={{ marginRight: '4px' }} />
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

                            {/* Remarks & Clinical Notes */}
                            <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                                        Technician / Examination Remarks
                                    </label>
                                    <textarea
                                        className="lab-input"
                                        rows={2}
                                        value={overallRemarks}
                                        onChange={(e) => setOverallRemarks(e.target.value)}
                                        disabled={isReadOnly}
                                        placeholder="Add examination remarks or technician notes..."
                                        style={{ width: '100%', resize: 'vertical' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                                        Pathologist Clinical Opinion / Notes
                                    </label>
                                    <textarea
                                        className="lab-input"
                                        rows={2}
                                        value={clinicalNotes}
                                        onChange={(e) => setClinicalNotes(e.target.value)}
                                        disabled={mode !== 'verification' && isVerified}
                                        placeholder="Pathologist clinical impression or diagnostic correlation..."
                                        style={{ width: '100%', resize: 'vertical' }}
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        /* Audit History Tab */
                        <div>
                            {history.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                    No audit history entries recorded for this test result yet.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {history.map((h, hIdx) => (
                                        <div key={hIdx} style={{
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            padding: '12px 16px',
                                            background: '#f8fafc',
                                            fontSize: '12px'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                                    {h.action} (Rev {h.revisionNumber || 1})
                                                </span>
                                                <span style={{ color: '#64748b' }}>
                                                    {new Date(h.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                            <div style={{ color: '#475569' }}>
                                                Performed by: <strong>{h.performedByName || 'Staff'}</strong> • Transition: {h.previousStatus || 'INIT'} → <strong>{h.newStatus}</strong>
                                            </div>
                                            {h.details && Object.keys(h.details).length > 0 && (
                                                <div style={{ marginTop: '6px', color: '#64748b', background: '#fff', padding: '6px 10px', borderRadius: '4px' }}>
                                                    {JSON.stringify(h.details)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Prompt Action Sub-Panel (Reject / Correction / Amendment) */}
                    {promptAction && (
                        <div style={{ marginTop: '16px', padding: '16px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '6px' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#9a3412' }}>
                                {promptAction === 'reject' && 'Reject Result: Enter Mandatory Clinical Reason'}
                                {promptAction === 'correction' && 'Request Correction: Enter Instructions for Technician'}
                                {promptAction === 'amendment' && 'Create Formal Revision / Amendment: Enter Justification'}
                            </h4>
                            <textarea
                                className="lab-input"
                                rows={2}
                                value={promptReason}
                                onChange={(e) => setPromptReason(e.target.value)}
                                placeholder="Mandatory clinical explanation..."
                                style={{ width: '100%', marginBottom: '8px' }}
                            />
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button className="lab-btn lab-btn-secondary" onClick={() => setPromptAction(null)} disabled={saving}>
                                    Cancel
                                </button>
                                <button className="lab-btn lab-btn-danger" onClick={handlePromptSubmit} disabled={saving || !promptReason.trim()}>
                                    Confirm {promptAction.toUpperCase()}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="lab-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {result?.enteredByName && (
                            <span>Entered by: <strong>{result.enteredByName}</strong> ({result.enteredAt ? new Date(result.enteredAt).toLocaleTimeString() : ''})</span>
                        )}
                        {result?.verifiedByName && (
                            <span style={{ marginLeft: '12px' }}>Verified by: <strong>{result.verifiedByName}</strong></span>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="lab-btn lab-btn-secondary" onClick={onClose} disabled={saving}>
                            Close
                        </button>

                        {/* Mode: Technician Entry */}
                        {mode === 'entry' && !isVerified && (
                            <>
                                <button className="lab-btn lab-btn-secondary" onClick={handleSaveDraft} disabled={saving}>
                                    <FiSave style={{ marginRight: '6px' }} />
                                    Save Draft
                                </button>
                                <button className="lab-btn lab-btn-primary" onClick={handleSubmit} disabled={saving}>
                                    <FiSend style={{ marginRight: '6px' }} />
                                    Submit for Verification
                                </button>
                            </>
                        )}

                        {/* Mode: Pathologist Verification */}
                        {mode === 'verification' && !isVerified && (
                            <>
                                <button
                                    className="lab-btn lab-btn-secondary"
                                    onClick={() => { setPromptAction('correction'); setPromptReason(''); }}
                                    disabled={saving}
                                >
                                    <FiRotateCcw style={{ marginRight: '6px' }} />
                                    Request Correction
                                </button>
                                <button
                                    className="lab-btn lab-btn-danger"
                                    onClick={() => { setPromptAction('reject'); setPromptReason(''); }}
                                    disabled={saving}
                                >
                                    <FiX style={{ marginRight: '6px' }} />
                                    Reject Result
                                </button>
                                <button
                                    className="lab-btn lab-btn-primary"
                                    onClick={handleVerify}
                                    disabled={saving}
                                    style={{ background: '#16a34a' }}
                                >
                                    <FiCheck style={{ marginRight: '6px' }} />
                                    Approve & Sign-Off
                                </button>
                            </>
                        )}

                        {/* Verified result: Allow Amendment */}
                        {isVerified && (
                            <button
                                className="lab-btn lab-btn-secondary"
                                onClick={() => { setPromptAction('amendment'); setPromptReason(''); }}
                                disabled={saving}
                            >
                                <FiEdit3 style={{ marginRight: '6px' }} />
                                Create Amendment / Revision
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LabResultModal;
