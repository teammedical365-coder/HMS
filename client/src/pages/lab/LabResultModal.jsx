import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { labAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import {
    FiX, FiCheck, FiAlertTriangle, FiAlertOctagon, FiClock,
    FiSave, FiSend, FiRotateCcw, FiFileText, FiRefreshCw,
    FiEdit3, FiLayers, FiShield, FiExternalLink
} from 'react-icons/fi';
import './LabResultEntry.css';

const getStatusBadgeClass = (status) => {
    switch (status) {
        case 'VERIFIED': return 'lre-badge lre-badge-verified';
        case 'SUBMITTED': return 'lre-badge lre-badge-submitted';
        case 'UNDER_REVIEW': return 'lre-badge lre-badge-review';
        case 'CORRECTION_REQUESTED': return 'lre-badge lre-badge-correction';
        case 'REJECTED': return 'lre-badge lre-badge-rejected';
        case 'DRAFT': return 'lre-badge lre-badge-draft';
        default: return 'lre-badge lre-badge-pending';
    }
};

const formatDateTime = (val) => {
    if (!val) return '—';
    try {
        return new Date(val).toLocaleString([], {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return '—';
    }
};

const LabResultModal = ({
    isOpen,
    onClose,
    resultId,
    sampleId,
    testId,
    orderId,
    mode = 'entry',
    onActionSuccess
}) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);
    const [sampleMeta, setSampleMeta] = useState(null);
    const [parameters, setParameters] = useState([]);
    const [overallRemarks, setOverallRemarks] = useState('');
    const [clinicalNotes, setClinicalNotes] = useState('');
    const [activeTab, setActiveTab] = useState('parameters'); // 'parameters' | 'history' | 'revisions'
    const [history, setHistory] = useState([]);

    // Structured action reason panel ('reject' | 'correction' | 'amendment')
    const [promptAction, setPromptAction] = useState(null);
    const [promptReason, setPromptReason] = useState('');
    const [promptNotes, setPromptNotes] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // Prevent duplicate concurrent initialization calls in StrictMode
    const initKeyRef = useRef('');

    useEffect(() => {
        if (!isOpen) {
            setResult(null);
            setSampleMeta(null);
            setParameters([]);
            setHistory([]);
            setPromptAction(null);
            setPromptReason('');
            setPromptNotes('');
            setErrorMsg('');
            setActiveTab('parameters');
            initKeyRef.current = '';
            return;
        }

        let cancelled = false;
        const reqKey = `${resultId || ''}_${sampleId || ''}_${testId || ''}_${orderId || ''}_${mode}`;

        const fetchOrInit = async () => {
            setLoading(true);
            setErrorMsg('');
            try {
                let resDoc = null;
                let resHistory = [];
                let resSample = null;

                if (resultId) {
                    const res = await labAPI.results.getResultById(resultId);
                    if (res?.success) {
                        resDoc = res.result;
                        resHistory = res.history || [];
                        resSample = res.sample || null;
                    }
                } else if (testId && (sampleId || orderId)) {
                    const initRes = await labAPI.results.initializeResult({ sampleId, testId, orderId });
                    if (initRes?.success) {
                        resDoc = initRes.result;
                        resHistory = initRes.history || [];
                        resSample = initRes.sample || null;
                    }
                }

                // Transition SUBMITTED -> UNDER_REVIEW when opened by authorized Pathologist
                if (
                    !cancelled &&
                    resDoc &&
                    mode === 'verification' &&
                    resDoc.resultStatus === 'SUBMITTED' &&
                    initKeyRef.current !== reqKey
                ) {
                    initKeyRef.current = reqKey;
                    try {
                        const revRes = await labAPI.results.startReview(resDoc._id);
                        if (revRes?.success && revRes.result) {
                            resDoc = {
                                ...resDoc,
                                resultStatus: revRes.result.resultStatus,
                                reviewedBy: revRes.result.reviewedBy,
                                reviewedByName: revRes.result.reviewedByName,
                                reviewedAt: revRes.result.reviewedAt
                            };
                        }
                    } catch (_) {
                        // Non-blocking if user lacks pathologist permission (e.g. read-only viewer)
                    }
                }

                if (!cancelled && resDoc) {
                    setResult(resDoc);
                    setSampleMeta(resSample);
                    setParameters(resDoc.resultParameters || []);
                    setOverallRemarks(resDoc.overallRemarks || '');
                    setClinicalNotes(resDoc.clinicalNotes || '');
                    setHistory(resHistory);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('Failed to load or initialize result:', err);
                    setErrorMsg(err.response?.data?.message || err.message || 'Failed to load test parameters');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchOrInit();
        return () => {
            cancelled = true;
        };
    }, [isOpen, resultId, sampleId, testId, orderId, mode]);

    if (!isOpen) return null;

    const evaluateClientParam = (param, rawValue) => {
        const p = { ...param, enteredValue: rawValue };
        const strVal = rawValue != null ? String(rawValue).trim() : '';

        if (strVal === '') {
            p.numericValue = null;
            p.abnormalFlag = 'NORMAL';
            p.criticalFlag = false;
            return p;
        }

        if (p.dataType === 'Numeric') {
            const num = Number(strVal);
            if (!Number.isNaN(num)) {
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
            const lower = strVal.toLowerCase();
            if (['positive', 'reactive', 'present', 'detected'].includes(lower)) {
                p.abnormalFlag = 'ABNORMAL';
            } else if (['negative', 'non-reactive', 'absent', 'not detected'].includes(lower)) {
                p.abnormalFlag = 'NORMAL';
            }
        }

        return p;
    };

    const handleParamChange = (index, value) => {
        setParameters((prev) => {
            const next = [...prev];
            next[index] = evaluateClientParam(next[index], value);
            return next;
        });
    };

    const validateParametersBeforeSubmit = () => {
        for (const p of parameters) {
            const valStr = p.enteredValue != null ? String(p.enteredValue).trim() : '';
            if (p.isRequired !== false && valStr === '') {
                return `Required parameter "${p.parameterName}" cannot be left blank.`;
            }
            if (p.dataType === 'Numeric' && valStr !== '' && Number.isNaN(Number(valStr))) {
                return `Parameter "${p.parameterName}" requires a valid numeric value.`;
            }
        }
        return null;
    };

    const handleSaveDraft = async () => {
        if (!result?._id) return;
        setSaving(true);
        setErrorMsg('');
        try {
            const res = await labAPI.results.saveDraft(result._id, {
                parameters,
                overallRemarks,
                clinicalNotes
            });
            if (res?.success) {
                setResult(res.result);
                setParameters(res.result.resultParameters || []);
                toast.success('Result draft saved.');
                if (onActionSuccess) onActionSuccess(res.result);
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Failed to save draft';
            setErrorMsg(msg);
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleSubmitForReview = async () => {
        if (!result?._id) return;
        const validationErr = validateParametersBeforeSubmit();
        if (validationErr) {
            setErrorMsg(validationErr);
            toast.error(validationErr);
            return;
        }

        setSaving(true);
        setErrorMsg('');
        try {
            const res = await labAPI.results.submitResult(result._id, {
                parameters,
                overallRemarks,
                clinicalNotes
            });
            if (res?.success) {
                toast.success('Result submitted for Pathologist verification.');
                if (onActionSuccess) onActionSuccess(res.result);
                onClose();
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Failed to submit result';
            setErrorMsg(msg);
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleVerifyResult = async () => {
        if (!result?._id) return;
        setSaving(true);
        setErrorMsg('');
        try {
            const res = await labAPI.results.verifyResult(result._id, {
                overallRemarks,
                clinicalNotes
            });
            if (res?.success) {
                toast.success('Result verified and clinically approved.');
                if (onActionSuccess) onActionSuccess(res.result);
                onClose();
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Failed to verify result';
            setErrorMsg(msg);
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handlePromptSubmit = async () => {
        if (!result?._id) return;
        if (!promptReason.trim()) {
            setErrorMsg('A clinical reason is mandatory for this action.');
            toast.error('Please enter a mandatory clinical reason.');
            return;
        }

        setSaving(true);
        setErrorMsg('');
        try {
            let res = null;
            if (promptAction === 'reject') {
                res = await labAPI.results.rejectResult(result._id, {
                    rejectionReason: promptReason.trim(),
                    notes: promptNotes.trim()
                });
            } else if (promptAction === 'correction') {
                res = await labAPI.results.requestCorrection(result._id, {
                    correctionReason: promptReason.trim(),
                    notes: promptNotes.trim()
                });
            } else if (promptAction === 'amendment') {
                res = await labAPI.results.createAmendment(result._id, {
                    reason: promptReason.trim(),
                    parameters
                });
            }

            if (res?.success) {
                const labelMap = {
                    reject: 'Result rejected with clinical reason.',
                    correction: 'Correction request sent to Lab Technician.',
                    amendment: `Audited Revision ${res.result?.revisionNumber || ''} created.`
                };
                toast.success(labelMap[promptAction] || 'Action completed.');
                if (onActionSuccess) onActionSuccess(res.result);
                onClose();
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Action failed';
            setErrorMsg(msg);
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const roleRaw = String(user?.roleName || user?._roleData?.name || user?.role || '').toLowerCase();
    const isAdminUser = roleRaw.includes('admin') || roleRaw === 'superadmin';
    const currentUserId = String(user?._id || user?.id || '');
    const isSelfEntered = Boolean(
        currentUserId &&
        !isAdminUser &&
        (
            (result?.enteredBy && String(result.enteredBy) === currentUserId) ||
            (result?.submittedBy && String(result.submittedBy) === currentUserId)
        )
    );

    const isVerified = result?.resultStatus === 'VERIFIED';
    const isEligibleForVerify = ['SUBMITTED', 'UNDER_REVIEW'].includes(result?.resultStatus);
    const isCorrectionRequested = result?.resultStatus === 'CORRECTION_REQUESTED';
    const isRejected = result?.resultStatus === 'REJECTED';
    const isReadOnly = mode === 'verification' || isVerified;

    const hasAnyCritical = parameters.some((p) => p.criticalFlag);
    const hasAnyAbnormal = parameters.some((p) => ['LOW', 'HIGH', 'ABNORMAL'].includes(p.abnormalFlag));
    const revisions = result?.correctionHistory || [];
    const mrn = result?.patientSnapshot?.mrn || result?.patientSnapshot?.uhid || 'N/A';

    return (
        <div className="lrm-overlay" role="dialog" aria-modal="true" aria-label="Laboratory Test Result Workstation">
            <div className="lrm-card" onClick={(e) => e.stopPropagation()}>
                {/* Fixed Header */}
                <div className="lrm-header">
                    <div>
                        <div className="lrm-title-row">
                            <h3 className="lrm-title">
                                {result?.testName || 'Diagnostic Test Findings'}
                            </h3>
                            {result?.testCode && (
                                <span className="lre-badge lre-badge-routine" style={{ fontFamily: 'monospace' }}>
                                    {result.testCode}
                                </span>
                            )}
                            <span className={getStatusBadgeClass(result?.resultStatus)}>
                                {String(result?.resultStatus || 'PENDING').replace(/_/g, ' ')}
                            </span>
                            {result?.revisionNumber > 1 && (
                                <span className="lre-badge lre-badge-draft">
                                    Revision #{result.revisionNumber}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px' }}>
                            {mode === 'verification'
                                ? 'Pathologist Clinical Review, Reference Range Inspection & Medical Sign-Off'
                                : 'Technician Result Entry — Configured Test Catalogue Parameters & Reference Evaluation'}
                        </div>
                    </div>

                    <button
                        type="button"
                        className="lrm-close-btn"
                        onClick={onClose}
                        disabled={saving}
                        aria-label="Close modal"
                    >
                        <FiX />
                    </button>
                </div>

                {/* 5-Column Structured Clinical Context Grid */}
                {result && (
                    <div className="lrm-context-grid">
                        <div>
                            <span className="lrm-ctx-label">Patient &amp; MRN</span>
                            <span className="lrm-ctx-val">{result.patientSnapshot?.name || 'Registered Patient'}</span>
                            <span className="lrm-ctx-sub">
                                MRN: {mrn} &bull; {result.patientSnapshot?.age ?? '—'}y / {result.patientSnapshot?.gender || '—'}
                            </span>
                        </div>
                        <div>
                            <span className="lrm-ctx-label">Order Number</span>
                            <span className="lrm-ctx-val">{result.orderNumber || '—'}</span>
                            <span className="lrm-ctx-sub">Token #{result.tokenNumber || 1}</span>
                        </div>
                        <div>
                            <span className="lrm-ctx-label">Sample Barcode</span>
                            <span className="lrm-ctx-val lre-mono">{result.barcode || 'N/A'}</span>
                            <span className="lrm-ctx-sub">
                                {sampleMeta?.specimenType
                                    ? `${sampleMeta.specimenType}${sampleMeta.containerType ? ` (${sampleMeta.containerType})` : ''}`
                                    : 'Barcoded Specimen'}
                            </span>
                        </div>
                        <div>
                            <span className="lrm-ctx-label">Test Name &amp; Code</span>
                            <span className="lrm-ctx-val">{result.testName || '—'}</span>
                            <span className="lrm-ctx-sub">Code: {result.testCode || '—'}</span>
                        </div>
                        <div>
                            <span className="lrm-ctx-label">Department &amp; Priority</span>
                            <span className="lrm-ctx-val">{result.department || 'General Pathology'}</span>
                            <span className="lrm-ctx-sub">Priority: {result.priority || 'Routine'}</span>
                        </div>
                    </div>
                )}

                {/* Navigation Tabs */}
                <div className="lrm-tabs">
                    <button
                        type="button"
                        className={`lrm-tab-btn ${activeTab === 'parameters' ? 'active' : ''}`}
                        onClick={() => setActiveTab('parameters')}
                    >
                        <FiFileText size={14} />
                        <span>Parameters &amp; Findings ({parameters.length})</span>
                    </button>
                    <button
                        type="button"
                        className={`lrm-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <FiClock size={14} />
                        <span>Audit History ({history.length})</span>
                    </button>
                    <button
                        type="button"
                        className={`lrm-tab-btn ${activeTab === 'revisions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('revisions')}
                    >
                        <FiLayers size={14} />
                        <span>Previous Revisions ({revisions.length})</span>
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="lrm-body" data-scrollable="true" data-lenis-prevent="true">
                    {errorMsg && (
                        <div className="lrm-alert-strip lrm-alert-critical" role="alert">
                            <FiAlertTriangle size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <div>{errorMsg}</div>
                        </div>
                    )}

                    {isCorrectionRequested && result?.correctionReason && (
                        <div className="lrm-alert-strip lrm-alert-warning">
                            <FiRotateCcw size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <div>
                                <strong>Correction Requested by {result.correctionRequestedByName || 'Pathologist'}:</strong>{' '}
                                {result.correctionReason}
                            </div>
                        </div>
                    )}

                    {isRejected && result?.rejectionReason && (
                        <div className="lrm-alert-strip lrm-alert-critical">
                            <FiAlertOctagon size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <div>
                                <strong>Rejected by {result.rejectedByName || 'Pathologist'}:</strong>{' '}
                                {result.rejectionReason}
                            </div>
                        </div>
                    )}

                    {hasAnyCritical && (
                        <div className="lrm-alert-strip lrm-alert-critical">
                            <FiAlertOctagon size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <div>
                                <strong>CRITICAL VALUE ALERT DETECTED:</strong> One or more parameters breach critical clinical thresholds. Attending clinician notification is mandatory.
                            </div>
                        </div>
                    )}

                    {hasAnyAbnormal && !hasAnyCritical && (
                        <div className="lrm-alert-strip lrm-alert-warning">
                            <FiAlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <div>
                                Abnormal findings detected outside configured biological reference intervals.
                            </div>
                        </div>
                    )}

                    {mode === 'verification' && isSelfEntered && !isVerified && (
                        <div className="lrm-alert-strip lrm-alert-warning">
                            <FiShield size={17} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <div>
                                <strong>Self-Approval Blocked:</strong> You entered or submitted this result. Independent Pathologist verification is required for clinical sign-off.
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="lre-empty-box">
                            <FiRefreshCw className="lre-spin" size={28} style={{ color: '#2563eb' }} />
                            <h4>Loading Configured Test Parameters...</h4>
                            <p>Fetching test catalogue definitions, reference intervals, and audit records.</p>
                        </div>
                    ) : activeTab === 'parameters' ? (
                        <>
                            {parameters.length === 0 ? (
                                <div className="lre-empty-box" style={{ border: '1px dashed #cbd5e1', borderRadius: '12px' }}>
                                    <h4>No Parameters Configured in Test Catalogue</h4>
                                    <p>
                                        Configure parameters for <strong>{result?.testName}</strong> in the Test Catalogue to enable structured parameter entry.
                                    </p>
                                </div>
                            ) : (
                                <div className="lrm-param-table-wrap">
                                    <table className="lrm-param-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '26%' }}>Parameter</th>
                                                <th style={{ width: '25%' }}>Observed Value</th>
                                                <th style={{ width: '12%' }}>Unit</th>
                                                <th style={{ width: '22%' }}>Reference Range</th>
                                                <th style={{ width: '15%' }}>Flag</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parameters.map((p, idx) => {
                                                const hasVal = p.enteredValue != null && String(p.enteredValue).trim() !== '';
                                                const isUnconfiguredRange = !p.referenceRangeText || p.referenceRangeText === 'Not Configured';
                                                const stepVal = p.decimalPlaces > 0
                                                    ? (1 / Math.pow(10, p.decimalPlaces)).toFixed(p.decimalPlaces)
                                                    : 'any';

                                                return (
                                                    <tr
                                                        key={p.parameterId || idx}
                                                        className={p.criticalFlag ? 'lre-row-critical' : ''}
                                                    >
                                                        <td>
                                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                                                {p.parameterName}
                                                                {p.isRequired !== false && (
                                                                    <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                                {p.parameterCode ? `${p.parameterCode} • ` : ''}{p.dataType || 'Numeric'}
                                                            </div>
                                                        </td>

                                                        <td>
                                                            {isReadOnly ? (
                                                                <span
                                                                    style={{
                                                                        fontWeight: 800,
                                                                        fontSize: '14px',
                                                                        color: p.criticalFlag
                                                                            ? '#dc2626'
                                                                            : ['LOW', 'HIGH', 'ABNORMAL'].includes(p.abnormalFlag)
                                                                                ? '#b45309'
                                                                                : '#0f172a'
                                                                    }}
                                                                >
                                                                    {hasVal ? p.enteredValue : '—'}
                                                                </span>
                                                            ) : p.dataType === 'Choice' ? (
                                                                <select
                                                                    className="lrm-param-select"
                                                                    value={p.enteredValue || ''}
                                                                    onChange={(e) => handleParamChange(idx, e.target.value)}
                                                                >
                                                                    <option value="">Select value...</option>
                                                                    {(p.choices || []).map((ch, cIdx) => (
                                                                        <option key={cIdx} value={ch}>{ch}</option>
                                                                    ))}
                                                                </select>
                                                            ) : p.dataType === 'Numeric' ? (
                                                                <input
                                                                    type="number"
                                                                    step={stepVal}
                                                                    className={`lrm-param-input ${
                                                                        p.criticalFlag
                                                                            ? 'input-critical'
                                                                            : ['LOW', 'HIGH'].includes(p.abnormalFlag)
                                                                                ? 'input-abnormal'
                                                                                : ''
                                                                    }`}
                                                                    value={p.enteredValue ?? ''}
                                                                    onChange={(e) => handleParamChange(idx, e.target.value)}
                                                                    placeholder={p.decimalPlaces > 0 ? `0.${'0'.repeat(p.decimalPlaces)}` : 'Enter numeric value'}
                                                                />
                                                            ) : (
                                                                <input
                                                                    type="text"
                                                                    className="lrm-param-input"
                                                                    value={p.enteredValue ?? ''}
                                                                    onChange={(e) => handleParamChange(idx, e.target.value)}
                                                                    placeholder="Enter finding"
                                                                />
                                                            )}
                                                        </td>

                                                        <td style={{ color: '#475569', fontWeight: 600 }}>
                                                            {p.unit || '—'}
                                                        </td>

                                                        <td>
                                                            {isUnconfiguredRange ? (
                                                                <span className="lre-badge lre-badge-unconfigured">
                                                                    Not Configured
                                                                </span>
                                                            ) : (
                                                                <div>
                                                                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '12.5px' }}>
                                                                        {p.referenceRangeText}
                                                                    </div>
                                                                    {p.referenceRangeSnapshot?.interpretationNotes && (
                                                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                                            {p.referenceRangeSnapshot.interpretationNotes}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>

                                                        <td>
                                                            {!hasVal ? (
                                                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                                                            ) : p.criticalFlag ? (
                                                                <span className="lre-badge lre-badge-critical">
                                                                    <FiAlertOctagon size={11} /> CRITICAL ({p.abnormalFlag})
                                                                </span>
                                                            ) : p.abnormalFlag === 'LOW' ? (
                                                                <span className="lre-badge lre-badge-submitted">
                                                                    &darr; LOW
                                                                </span>
                                                            ) : p.abnormalFlag === 'HIGH' ? (
                                                                <span className="lre-badge lre-badge-correction">
                                                                    &uarr; HIGH
                                                                </span>
                                                            ) : p.abnormalFlag === 'ABNORMAL' ? (
                                                                <span className="lre-badge lre-badge-correction">
                                                                    ABNORMAL
                                                                </span>
                                                            ) : isUnconfiguredRange && p.dataType !== 'Choice' ? (
                                                                <span className="lre-badge lre-badge-unconfigured">
                                                                    Recorded
                                                                </span>
                                                            ) : (
                                                                <span className="lre-badge lre-badge-normal">
                                                                    NORMAL
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Technician Remarks & Pathologist Clinical Notes */}
                            <div className="lrm-notes-grid">
                                <div>
                                    <label className="lrm-field-label" htmlFor="lrm-tech-remarks">
                                        Technician / Bench Examination Remarks
                                    </label>
                                    <textarea
                                        id="lrm-tech-remarks"
                                        className="lrm-textarea"
                                        rows={2}
                                        value={overallRemarks}
                                        onChange={(e) => setOverallRemarks(e.target.value)}
                                        disabled={isVerified}
                                        placeholder="Sample quality, instrument dilution, microscopy notes..."
                                    />
                                </div>
                                <div>
                                    <label className="lrm-field-label" htmlFor="lrm-path-notes">
                                        Pathologist Clinical Impression / Sign-Off Notes
                                    </label>
                                    <textarea
                                        id="lrm-path-notes"
                                        className="lrm-textarea"
                                        rows={2}
                                        value={clinicalNotes}
                                        onChange={(e) => setClinicalNotes(e.target.value)}
                                        disabled={isVerified || mode !== 'verification'}
                                        placeholder={mode === 'verification' ? 'Enter clinical correlation or diagnostic sign-off notes...' : 'Reserved for Pathologist review'}
                                    />
                                </div>
                            </div>
                        </>
                    ) : activeTab === 'history' ? (
                        history.length === 0 ? (
                            <div className="lre-empty-box">
                                <FiClock size={28} style={{ color: '#94a3b8' }} />
                                <h4>No Audit Events Recorded Yet</h4>
                                <p>Every draft save, submission, review, correction request, and verification is logged here.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {history.map((h, hIdx) => (
                                    <div
                                        key={h._id || hIdx}
                                        style={{
                                            border: '1px solid #e2e8f0',
                                            borderLeft: '3px solid #2563eb',
                                            borderRadius: '10px',
                                            padding: '12px 16px',
                                            background: '#f8fafc',
                                            fontSize: '12.5px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                            <strong style={{ color: '#0f172a' }}>
                                                {String(h.action || '').replace(/_/g, ' ')} (Revision #{h.revisionNumber || 1})
                                            </strong>
                                            <span style={{ color: '#64748b' }}>{formatDateTime(h.timestamp)}</span>
                                        </div>
                                        <div style={{ color: '#475569', marginTop: '4px' }}>
                                            By <strong>{h.performedByName || 'Authorized Staff'}</strong> &bull; Status:{' '}
                                            <span>{h.previousStatus || 'INIT'}</span> &rarr; <strong>{h.newStatus}</strong>
                                        </div>
                                        {(h.details?.rejectionReason || h.details?.correctionReason || h.details?.reason) && (
                                            <div style={{ marginTop: '6px', padding: '6px 10px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#334155' }}>
                                                <strong>Reason:</strong> {h.details.rejectionReason || h.details.correctionReason || h.details.reason}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        /* Previous Revisions Tab */
                        revisions.length === 0 ? (
                            <div className="lre-empty-box">
                                <FiLayers size={28} style={{ color: '#94a3b8' }} />
                                <h4>No Previous Revisions</h4>
                                <p>Result is currently on Revision #{result?.revisionNumber || 1}. Amended snapshots appear here automatically.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {[...revisions].reverse().map((rev, rIdx) => (
                                    <div key={rIdx} className="lrm-revision-card">
                                        <div className="lrm-revision-head">
                                            <div>
                                                <strong style={{ color: '#0f172a' }}>Revision #{rev.revisionNumber}</strong>
                                                <span style={{ color: '#64748b', marginLeft: '10px' }}>
                                                    Amended by <strong>{rev.changedByName || 'Staff'}</strong>
                                                </span>
                                            </div>
                                            <span style={{ color: '#64748b' }}>{formatDateTime(rev.changedAt)}</span>
                                        </div>
                                        <div style={{ padding: '12px 15px', fontSize: '12.5px' }}>
                                            <div style={{ marginBottom: '10px', color: '#334155' }}>
                                                <strong>Revision Justification:</strong> {rev.reason || 'Clinical amendment'}
                                            </div>
                                            <table className="lrm-param-table" style={{ minWidth: '520px' }}>
                                                <thead>
                                                    <tr>
                                                        <th>Parameter</th>
                                                        <th>Previous Value</th>
                                                        <th>Unit</th>
                                                        <th>Flag</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(rev.previousParameters || []).map((pp, pIdx) => (
                                                        <tr key={pIdx}>
                                                            <td>{pp.parameterName}</td>
                                                            <td><strong>{pp.enteredValue || '—'}</strong></td>
                                                            <td>{pp.unit || '—'}</td>
                                                            <td>{pp.criticalFlag ? 'CRITICAL' : (pp.abnormalFlag || 'NORMAL')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {/* Structured Mandatory Reason Box (Reject / Correction / Amendment) */}
                    {promptAction && (
                        <div className="lrm-reason-panel">
                            <h4 className="lrm-reason-title">
                                {promptAction === 'reject' && 'Reject Result — Mandatory Clinical Reason'}
                                {promptAction === 'correction' && 'Request Technician Correction — Mandatory Instructions'}
                                {promptAction === 'amendment' && 'Create Audited Revision / Amendment — Mandatory Clinical Justification'}
                            </h4>
                            <textarea
                                className="lrm-textarea"
                                rows={2}
                                value={promptReason}
                                onChange={(e) => setPromptReason(e.target.value)}
                                placeholder={
                                    promptAction === 'correction'
                                        ? 'Specify which parameter(s) require repeat assay, dilution check, or correction...'
                                        : 'Enter mandatory clinical reason for the permanent audit log...'
                                }
                            />
                            {promptAction !== 'amendment' && (
                                <input
                                    type="text"
                                    className="lrm-param-input"
                                    value={promptNotes}
                                    onChange={(e) => setPromptNotes(e.target.value)}
                                    placeholder="Optional bench / clinical remarks..."
                                />
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                    type="button"
                                    className="lre-btn lre-btn-secondary lre-btn-sm"
                                    onClick={() => {
                                        setPromptAction(null);
                                        setPromptReason('');
                                        setPromptNotes('');
                                    }}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className={`lre-btn lre-btn-sm ${promptAction === 'reject' ? 'lre-btn-danger' : 'lre-btn-warning'}`}
                                    onClick={handlePromptSubmit}
                                    disabled={saving || !promptReason.trim()}
                                >
                                    {saving ? 'Submitting...' : (
                                        promptAction === 'reject'
                                            ? 'Confirm Reject Result'
                                            : promptAction === 'correction'
                                                ? 'Send Correction Request'
                                                : 'Create Audited Revision'
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Footer */}
                <div className="lrm-footer">
                    <div className="lrm-footer-meta">
                        {result?.enteredByName && (
                            <span>
                                Entered by: <strong style={{ color: '#334155' }}>{result.enteredByName}</strong>
                                {result.enteredAt ? ` (${formatDateTime(result.enteredAt)})` : ''}
                            </span>
                        )}
                        {result?.submittedByName && (
                            <span>
                                Submitted by: <strong style={{ color: '#334155' }}>{result.submittedByName}</strong>
                            </span>
                        )}
                        {result?.verifiedByName && (
                            <span style={{ color: '#15803d', fontWeight: 700 }}>
                                Verified by: {result.verifiedByName} ({formatDateTime(result.verifiedAt)})
                            </span>
                        )}
                    </div>

                    <div className="lrm-footer-actions">
                        <button
                            type="button"
                            className="lre-btn lre-btn-secondary"
                            onClick={onClose}
                            disabled={saving}
                        >
                            Cancel
                        </button>

                        {/* Technician Entry Actions */}
                        {mode === 'entry' && !isVerified && (
                            <>
                                <button
                                    type="button"
                                    className="lre-btn lre-btn-secondary"
                                    onClick={handleSaveDraft}
                                    disabled={saving || loading || !result}
                                >
                                    <FiSave size={14} />
                                    <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                                </button>
                                <button
                                    type="button"
                                    className="lre-btn lre-btn-primary"
                                    onClick={handleSubmitForReview}
                                    disabled={saving || loading || !result || parameters.length === 0}
                                >
                                    <FiSend size={14} />
                                    <span>{saving ? 'Submitting...' : 'Submit for Pathologist Review'}</span>
                                </button>
                            </>
                        )}

                        {/* Pathologist Verification Actions */}
                        {mode === 'verification' && isEligibleForVerify && (
                            <>
                                <button
                                    type="button"
                                    className="lre-btn lre-btn-secondary"
                                    onClick={() => {
                                        setPromptAction('correction');
                                        setPromptReason('');
                                        setPromptNotes('');
                                    }}
                                    disabled={saving}
                                >
                                    <FiRotateCcw size={14} />
                                    <span>Request Correction</span>
                                </button>
                                <button
                                    type="button"
                                    className="lre-btn lre-btn-danger"
                                    onClick={() => {
                                        setPromptAction('reject');
                                        setPromptReason('');
                                        setPromptNotes('');
                                    }}
                                    disabled={saving}
                                >
                                    <FiX size={14} />
                                    <span>Reject Result</span>
                                </button>
                                <button
                                    type="button"
                                    className="lre-btn lre-btn-success"
                                    onClick={handleVerifyResult}
                                    disabled={saving || isSelfEntered}
                                    title={isSelfEntered ? 'Self-approval is blocked for clinical safety' : 'Verify and approve diagnostic result'}
                                >
                                    <FiCheck size={15} />
                                    <span>{saving ? 'Verifying...' : 'Verify / Approve Result'}</span>
                                </button>
                            </>
                        )}

                        {/* Verified Result Actions: Phase 8 Report Link + Audited Amendment */}
                        {isVerified && (
                            <>
                                <button
                                    type="button"
                                    className="lre-btn lre-btn-secondary"
                                    onClick={() => {
                                        onClose();
                                        navigate('/lab/reports');
                                    }}
                                >
                                    <FiExternalLink size={14} />
                                    <span>Diagnostic Reports</span>
                                </button>
                                {mode === 'verification' && (
                                    <button
                                        type="button"
                                        className="lre-btn lre-btn-warning"
                                        onClick={() => {
                                            setPromptAction('amendment');
                                            setPromptReason('');
                                        }}
                                        disabled={saving}
                                    >
                                        <FiEdit3 size={14} />
                                        <span>Amend Verified Result</span>
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LabResultModal;
