import React, { useState, useMemo, useRef } from 'react';
import { patientPolicyAPI, baseURL } from '../../utils/api';
import './PatientPolicySection.css';

export const POLICY_TYPES = [
    'TPA',
    'Private Health Insurance',
    'Government Health Scheme',
    'Government Employee Health Scheme',
    'Corporate Health Insurance',
    'Other'
];

export const POLICY_PROVIDER_SUGGESTIONS = {
    TPA: ['Medi Assist', 'MDIndia', 'Vidal Health', 'Paramount Health', 'Raksha TPA', 'Heritage Health'],
    'Private Health Insurance': ['Star Health', 'HDFC ERGO', 'Niva Bupa', 'ICICI Lombard', 'Care Health', 'Bajaj Allianz', 'Tata AIG'],
    'Government Health Scheme': ['Ayushman Bharat PM-JAY', 'Chiranjeevi / MAA Yojana', 'MJPJAY', 'CM Relief Scheme'],
    'Government Employee Health Scheme': ['Rajasthan RGHS', 'CGHS', 'ECHS', 'ESIC', 'Railway Health Scheme'],
    'Corporate Health Insurance': ['Corporate Group Mediclaim', 'Employer Health Cover'],
    Other: ['Community Health Cover', 'Student Health Insurance']
};

export const RELATIONSHIP_OPTIONS = [
    'Self',
    'Spouse',
    'Son',
    'Daughter',
    'Father',
    'Mother',
    'Dependent',
    'Employee',
    'Other'
];

export const VERIFICATION_STATUSES = [
    'Not Verified',
    'Pending Verification',
    'Verified',
    'Rejected',
    'Expired'
];

export const EMPTY_POLICY_DRAFT = {
    policyType: 'Private Health Insurance',
    providerName: '',
    policyNumber: '',
    tpaOrMemberId: '',
    policyHolderName: '',
    relationshipWithPatient: 'Self',
    validFrom: '',
    validUntil: '',
    cardDocument: null,
    notes: ''
};

export function hasAnyPolicyInput(policy) {
    if (!policy) return false;
    return Boolean(
        (policy.providerName && String(policy.providerName).trim()) ||
        (policy.policyNumber && String(policy.policyNumber).trim()) ||
        (policy.tpaOrMemberId && String(policy.tpaOrMemberId).trim()) ||
        (policy.policyHolderName && String(policy.policyHolderName).trim()) ||
        (policy.notes && String(policy.notes).trim()) ||
        (policy.cardDocument && policy.cardDocument.url)
    );
}

export function getPolicyFieldConfig(policyType) {
    switch (policyType) {
        case 'TPA':
            return {
                providerLabel: 'TPA / Administrator Name',
                providerPlaceholder: 'e.g., Medi Assist, MDIndia, Vidal Health...',
                policyNumberLabel: 'Policy Number',
                policyNumberPlaceholder: 'Enter policy number',
                memberIdLabel: 'TPA ID / Member ID',
                memberIdPlaceholder: 'Enter TPA / E-Card Member ID',
                holderLabel: 'Policy Holder / Primary Insured Name',
                showMemberId: true,
                showRelationship: true
            };
        case 'Government Health Scheme':
            return {
                providerLabel: 'Government Health Scheme Name',
                providerPlaceholder: 'e.g., Ayushman Bharat PM-JAY, Chiranjeevi...',
                policyNumberLabel: 'Scheme Card / Family / PM-JAY ID',
                policyNumberPlaceholder: 'Enter scheme card or family ID',
                memberIdLabel: 'Beneficiary / Ration / ABHA Reference',
                memberIdPlaceholder: 'Optional beneficiary or member reference',
                holderLabel: 'Beneficiary / Head of Family Name',
                showMemberId: true,
                showRelationship: false
            };
        case 'Government Employee Health Scheme':
            return {
                providerLabel: 'Government Employee Scheme Name',
                providerPlaceholder: 'e.g., Rajasthan RGHS, CGHS, ECHS...',
                policyNumberLabel: 'Card / PPO / Scheme Policy Number',
                policyNumberPlaceholder: 'Enter RGHS / CGHS / ECHS card number',
                memberIdLabel: 'Employee / Beneficiary ID',
                memberIdPlaceholder: 'Enter employee code or beneficiary ID',
                holderLabel: 'Primary Employee / Pensioner Name',
                showMemberId: true,
                showRelationship: true
            };
        case 'Corporate Health Insurance':
            return {
                providerLabel: 'Insurance Company / Corporate Plan',
                providerPlaceholder: 'e.g., ICICI Lombard, Star Health Corporate...',
                policyNumberLabel: 'Corporate Policy Number',
                policyNumberPlaceholder: 'Enter group policy number',
                memberIdLabel: 'Employee / Member ID',
                memberIdPlaceholder: 'Enter corporate member / employee ID',
                holderLabel: 'Primary Employee / Insured Name',
                showMemberId: true,
                showRelationship: true
            };
        case 'Other':
            return {
                providerLabel: 'Insurer / Scheme / Organization Name',
                providerPlaceholder: 'Enter insurer, trust, or scheme name',
                policyNumberLabel: 'Policy / Reference Number',
                policyNumberPlaceholder: 'Enter policy or reference number',
                memberIdLabel: 'Member / Beneficiary ID',
                memberIdPlaceholder: 'Enter member ID (if applicable)',
                holderLabel: 'Policy Holder Name',
                showMemberId: true,
                showRelationship: true
            };
        case 'Private Health Insurance':
        default:
            return {
                providerLabel: 'Insurance Company Name',
                providerPlaceholder: 'e.g., Star Health, HDFC ERGO, Niva Bupa...',
                policyNumberLabel: 'Policy Number',
                policyNumberPlaceholder: 'Enter policy number',
                memberIdLabel: 'Member ID / TPA ID (if any)',
                memberIdPlaceholder: 'Enter insured member ID',
                holderLabel: 'Policy Holder Name',
                showMemberId: true,
                showRelationship: true
            };
    }
}

export function getVerificationBadgeClass(status) {
    switch (status) {
        case 'Verified': return 'verified';
        case 'Pending Verification': return 'pending';
        case 'Rejected': return 'rejected';
        case 'Expired': return 'expired';
        default: return 'not-verified';
    }
}

function formatDateInputValue(val) {
    if (!val) return '';
    try {
        const d = new Date(val);
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString().slice(0, 10);
    } catch {
        return '';
    }
}

function formatDisplayDate(val) {
    if (!val) return '—';
    try {
        const d = new Date(val);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return '—';
    }
}

export async function openOrDownloadCardDocument(doc, download = false) {
    if (!doc?.url) return;
    const rawUrl = doc.url;
    const isRelative = rawUrl.startsWith('/');
    const targetUrl = isRelative ? `${baseURL}${rawUrl}` : rawUrl;
    try {
        if (isRelative || rawUrl.includes('/api/patients/reports/')) {
            const blob = await patientPolicyAPI.fetchCardBlob(rawUrl.startsWith('http') ? rawUrl : rawUrl);
            const objectUrl = URL.createObjectURL(blob);
            if (download) {
                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = doc.originalName || doc.fileName || 'health_card';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
            } else {
                window.open(objectUrl, '_blank', 'noopener,noreferrer');
                setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
            }
            return;
        }
    } catch {
        // Fallback below
    }
    if (download) {
        const a = document.createElement('a');
        a.href = targetUrl;
        a.download = doc.originalName || doc.fileName || 'health_card';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
}

function PolicyFormFields({
    draft,
    onChange,
    patientName = '',
    uploading,
    uploadError,
    onUploadFile
}) {
    const fileInputRef = useRef(null);
    const config = useMemo(() => getPolicyFieldConfig(draft.policyType), [draft.policyType]);
    const suggestions = POLICY_PROVIDER_SUGGESTIONS[draft.policyType] || POLICY_PROVIDER_SUGGESTIONS.Other;

    const updateField = (key, val) => {
        onChange({ ...draft, [key]: val });
    };

    const handleTypeChange = (nextType) => {
        const nextConfig = getPolicyFieldConfig(nextType);
        const updated = { ...draft, policyType: nextType };
        if (!nextConfig.showRelationship && !updated.relationshipWithPatient) {
            updated.relationshipWithPatient = 'Self';
        }
        onChange(updated);
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await onUploadFile(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div>
            <div className="patient-policy-grid">
                <div className="patient-policy-field">
                    <label>Policy Category / Type (Optional)</label>
                    <select
                        value={draft.policyType || 'Private Health Insurance'}
                        onChange={(e) => handleTypeChange(e.target.value)}
                    >
                        {POLICY_TYPES.map((type) => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>

                <div className="patient-policy-field">
                    <label>{config.providerLabel}</label>
                    <input
                        type="text"
                        value={draft.providerName || ''}
                        onChange={(e) => updateField('providerName', e.target.value)}
                        placeholder={config.providerPlaceholder}
                        list={`policy-providers-${draft.policyType}`}
                    />
                    <datalist id={`policy-providers-${draft.policyType}`}>
                        {suggestions.map((s) => <option key={s} value={s} />)}
                    </datalist>
                    <div className="patient-policy-suggestions">
                        {suggestions.slice(0, 5).map((item) => (
                            <button
                                key={item}
                                type="button"
                                className="patient-policy-suggestion-btn"
                                onClick={() => updateField('providerName', item)}
                            >
                                + {item}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="patient-policy-field">
                    <label>{config.policyNumberLabel}</label>
                    <input
                        type="text"
                        value={draft.policyNumber || ''}
                        onChange={(e) => updateField('policyNumber', e.target.value)}
                        placeholder={config.policyNumberPlaceholder}
                    />
                </div>

                {config.showMemberId && (
                    <div className="patient-policy-field">
                        <label>{config.memberIdLabel}</label>
                        <input
                            type="text"
                            value={draft.tpaOrMemberId || ''}
                            onChange={(e) => updateField('tpaOrMemberId', e.target.value)}
                            placeholder={config.memberIdPlaceholder}
                        />
                    </div>
                )}

                <div className="patient-policy-field">
                    <label>{config.holderLabel}</label>
                    <input
                        type="text"
                        value={draft.policyHolderName || ''}
                        onChange={(e) => updateField('policyHolderName', e.target.value)}
                        placeholder={patientName ? `e.g., ${patientName}` : 'Enter policy holder full name'}
                    />
                </div>

                {config.showRelationship && (
                    <div className="patient-policy-field">
                        <label>Relationship with Patient</label>
                        <select
                            value={draft.relationshipWithPatient || 'Self'}
                            onChange={(e) => updateField('relationshipWithPatient', e.target.value)}
                        >
                            {RELATIONSHIP_OPTIONS.map((rel) => (
                                <option key={rel} value={rel}>{rel}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="patient-policy-field">
                    <label>Policy Valid From</label>
                    <input
                        type="date"
                        value={formatDateInputValue(draft.validFrom)}
                        onChange={(e) => updateField('validFrom', e.target.value)}
                    />
                </div>

                <div className="patient-policy-field">
                    <label>Policy Valid Until</label>
                    <input
                        type="date"
                        value={formatDateInputValue(draft.validUntil)}
                        onChange={(e) => updateField('validUntil', e.target.value)}
                    />
                </div>

                <div className="patient-policy-field full-width">
                    <label>Insurance / Health Card Upload (Image or PDF, max 10MB)</label>
                    <div className="patient-policy-upload-box">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                onChange={handleFileSelect}
                                disabled={uploading}
                                style={{ fontSize: '12.5px', border: 'none', padding: 0, width: 'auto' }}
                            />
                            {uploading && <span style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>Uploading card...</span>}
                        </div>

                        {draft.cardDocument?.url && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '12.5px', color: '#0f766e', fontWeight: 600 }}>
                                    ✓ {draft.cardDocument.originalName || draft.cardDocument.fileName || 'Uploaded Card'}
                                </span>
                                <button
                                    type="button"
                                    className="patient-policy-toggle-btn"
                                    onClick={() => openOrDownloadCardDocument(draft.cardDocument, false)}
                                >
                                    Preview
                                </button>
                                <button
                                    type="button"
                                    className="patient-policy-toggle-btn"
                                    onClick={() => updateField('cardDocument', null)}
                                    style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2' }}
                                >
                                    Remove
                                </button>
                            </div>
                        )}
                    </div>
                    {uploadError && (
                        <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{uploadError}</div>
                    )}
                </div>

                <div className="patient-policy-field full-width">
                    <label>Additional Notes</label>
                    <textarea
                        rows={2}
                        value={draft.notes || ''}
                        onChange={(e) => updateField('notes', e.target.value)}
                        placeholder="Optional policy notes, sum insured remarks, corporate/TPA desk instructions..."
                    />
                </div>
            </div>
        </div>
    );
}

/**
 * Reusable Patient Insurance / TPA / Govt Health Policy component.
 * - mode="form": Collapsible optional section inside Reception registration & booking workflows.
 * - mode="profile": Multi-policy management + authorized verification panel inside Patient Profile.
 */
export default function PatientPolicySection({
    mode = 'form',
    // Form mode props
    value = EMPTY_POLICY_DRAFT,
    onChange,
    existingPolicies = [],
    selectedPolicyId = null,
    onSelectExistingPolicy,
    patientName = '',
    defaultExpanded = false,
    // Profile mode props
    patientId,
    policies = [],
    onRefreshPolicies,
    canVerify = false,
    canEdit = true
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');

    // Profile mode state
    const [editingPolicyId, setEditingPolicyId] = useState(null);
    const [showNewForm, setShowNewForm] = useState(false);
    const [profileDraft, setProfileDraft] = useState({ ...EMPTY_POLICY_DRAFT });
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [verifyingId, setVerifyingId] = useState(null);
    const [verifyNoteDraft, setVerifyNoteDraft] = useState('');
    const [pendingVerifyStatus, setPendingVerifyStatus] = useState({});

    const handleUploadCard = async (file, setter, currentObj) => {
        if (file.size > 10 * 1024 * 1024) {
            setUploadError('File exceeds 10MB limit.');
            return;
        }
        setUploading(true);
        setUploadError('');
        try {
            const res = await patientPolicyAPI.uploadCard(file);
            if (res?.success && res.document) {
                setter({ ...currentObj, cardDocument: res.document });
            } else {
                setUploadError(res?.message || 'Upload failed.');
            }
        } catch (err) {
            setUploadError(err?.response?.data?.message || 'Could not upload document. Ensure it is JPG/PNG/WEBP/PDF under 10MB.');
        } finally {
            setUploading(false);
        }
    };

    if (mode === 'form') {
        const activeDraft = value || EMPTY_POLICY_DRAFT;
        const primaryExisting = existingPolicies[0] || null;
        const isFilled = hasAnyPolicyInput(activeDraft);

        return (
            <div className="patient-policy-card" data-testid="patient-policy-form-section">
                <div className="patient-policy-header">
                    <div className="patient-policy-title-group">
                        <h4 className="patient-policy-title">
                            🛡️ Insurance, TPA &amp; Government Health Policy
                        </h4>
                        <span className="patient-policy-optional-pill">Optional</span>
                        {existingPolicies.length > 0 && (
                            <span className="patient-policy-saved-pill">
                                {existingPolicies.length} Saved {existingPolicies.length === 1 ? 'Policy' : 'Policies'}
                                {primaryExisting?.providerName ? ` • ${primaryExisting.providerName}` : ''}
                            </span>
                        )}
                        {!existingPolicies.length && isFilled && (
                            <span className="patient-policy-saved-pill">
                                Draft Entered ({activeDraft.policyType})
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        className="patient-policy-toggle-btn"
                        onClick={() => setExpanded((prev) => !prev)}
                    >
                        {expanded ? 'Hide Policy Details ▲' : (existingPolicies.length > 0 || isFilled ? 'View / Edit Policy Details ▼' : '+ Add Insurance / Policy ▼')}
                    </button>
                </div>

                {!expanded && primaryExisting && (
                    <div style={{ marginTop: '8px', fontSize: '12.5px', color: '#475569', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span><strong>Type:</strong> {primaryExisting.policyType}</span>
                        {primaryExisting.providerName && <span><strong>Provider/Scheme:</strong> {primaryExisting.providerName}</span>}
                        {primaryExisting.policyNumber && <span><strong>Policy No:</strong> {primaryExisting.policyNumber}</span>}
                        <span className={`patient-policy-status-badge ${getVerificationBadgeClass(primaryExisting.verificationStatus)}`}>
                            {primaryExisting.verificationStatus || 'Not Verified'}
                        </span>
                    </div>
                )}

                {expanded && (
                    <div style={{ marginTop: '10px' }}>
                        <p style={{ margin: '0 0 8px', fontSize: '12.5px', color: '#64748b' }}>
                            Record TPA, Private Insurance, CGHS/RGHS/ECHS, Ayushman Bharat PM-JAY, or Corporate cover. All fields are optional and will not block registration.
                        </p>

                        {existingPolicies.length > 0 && (
                            <div className="patient-policy-saved-strip">
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                                    Saved Patient Policies (Select one to view/update for this booking, or add another):
                                </div>
                                <div className="patient-policy-saved-chips">
                                    {existingPolicies.map((pol) => (
                                        <button
                                            key={pol._id}
                                            type="button"
                                            className={`patient-policy-chip ${selectedPolicyId === pol._id ? 'active' : ''}`}
                                            onClick={() => onSelectExistingPolicy?.(pol)}
                                        >
                                            <span>{pol.providerName || pol.policyType}</span>
                                            {pol.policyNumber ? <span style={{ opacity: 0.75 }}>#{pol.policyNumber}</span> : null}
                                            <span className={`patient-policy-status-badge ${getVerificationBadgeClass(pol.verificationStatus)}`}>
                                                {pol.verificationStatus || 'Not Verified'}
                                            </span>
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className={`patient-policy-chip ${!selectedPolicyId ? 'active' : ''}`}
                                        onClick={() => onSelectExistingPolicy?.(null)}
                                    >
                                        + New Policy
                                    </button>
                                </div>
                            </div>
                        )}

                        <PolicyFormFields
                            draft={activeDraft}
                            onChange={onChange}
                            patientName={patientName}
                            uploading={uploading}
                            uploadError={uploadError}
                            onUploadFile={(file) => handleUploadCard(file, onChange, activeDraft)}
                        />
                    </div>
                )}
            </div>
        );
    }

    // Profile mode handlers
    const startCreate = () => {
        setEditingPolicyId(null);
        setProfileDraft({ ...EMPTY_POLICY_DRAFT, policyHolderName: patientName || '' });
        setShowNewForm(true);
        setProfileError('');
        setUploadError('');
    };

    const startEdit = (pol) => {
        setShowNewForm(false);
        setEditingPolicyId(pol._id);
        setProfileDraft({
            _id: pol._id,
            policyType: pol.policyType || 'Private Health Insurance',
            providerName: pol.providerName || '',
            policyNumber: pol.policyNumber || '',
            tpaOrMemberId: pol.tpaOrMemberId || '',
            policyHolderName: pol.policyHolderName || '',
            relationshipWithPatient: pol.relationshipWithPatient || 'Self',
            validFrom: formatDateInputValue(pol.validFrom),
            validUntil: formatDateInputValue(pol.validUntil),
            cardDocument: pol.cardDocument || null,
            notes: pol.notes || ''
        });
        setProfileError('');
        setUploadError('');
    };

    const cancelForm = () => {
        setEditingPolicyId(null);
        setShowNewForm(false);
        setProfileError('');
    };

    const handleSaveProfilePolicy = async (e) => {
        e.preventDefault();
        if (!patientId) return;
        if (!hasAnyPolicyInput(profileDraft)) {
            setProfileError('Please enter at least a provider/scheme name, policy number, member ID, or health card document.');
            return;
        }
        setSavingProfile(true);
        setProfileError('');
        try {
            if (editingPolicyId) {
                await patientPolicyAPI.updatePolicy(editingPolicyId, profileDraft);
            } else {
                await patientPolicyAPI.savePatientPolicy(patientId, profileDraft);
            }
            cancelForm();
            await onRefreshPolicies?.();
        } catch (err) {
            setProfileError(err?.response?.data?.message || 'Failed to save policy details.');
        } finally {
            setSavingProfile(false);
        }
    };

    const handleVerifyUpdate = async (policyId, nextStatus) => {
        setVerifyingId(policyId);
        setProfileError('');
        try {
            await patientPolicyAPI.verifyPolicy(policyId, {
                verificationStatus: nextStatus,
                verificationNotes: verifyNoteDraft
            });
            setVerifyNoteDraft('');
            await onRefreshPolicies?.();
        } catch (err) {
            setProfileError(err?.response?.data?.message || 'Failed to update verification status.');
        } finally {
            setVerifyingId(null);
        }
    };

    const handleDelete = async (policyId) => {
        if (!window.confirm('Remove this insurance / health policy record?')) return;
        try {
            await patientPolicyAPI.deletePolicy(policyId);
            await onRefreshPolicies?.();
        } catch (err) {
            setProfileError(err?.response?.data?.message || 'Failed to delete policy.');
        }
    };

    return (
        <div className="patient-policy-profile-list">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                        🛡️ Insurance, TPA &amp; Government Health Policies
                    </h3>
                    <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                        Saved coverage details for OPD, IPD, and billing readiness. Entering policy details does not auto-verify coverage or auto-deduct hospital bills.
                    </p>
                </div>
                {canEdit && !showNewForm && !editingPolicyId && (
                    <button
                        type="button"
                        onClick={startCreate}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#0f766e',
                            color: '#ffffff',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer'
                        }}
                    >
                        + Add Policy
                    </button>
                )}
            </div>

            {profileError && (
                <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', fontSize: '13px' }}>
                    {profileError}
                </div>
            )}

            {(showNewForm || editingPolicyId) && (
                <form onSubmit={handleSaveProfilePolicy} className="patient-policy-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <strong style={{ fontSize: '14.5px', color: '#0f172a' }}>
                            {editingPolicyId ? 'Edit Policy Details' : 'Add New Insurance / Health Policy'}
                        </strong>
                        <button type="button" className="patient-policy-toggle-btn" onClick={cancelForm}>
                            Cancel
                        </button>
                    </div>
                    <PolicyFormFields
                        draft={profileDraft}
                        onChange={setProfileDraft}
                        patientName={patientName}
                        uploading={uploading}
                        uploadError={uploadError}
                        onUploadFile={(file) => handleUploadCard(file, setProfileDraft, profileDraft)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                        <button type="button" className="patient-policy-toggle-btn" onClick={cancelForm}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={savingProfile || uploading}
                            style={{
                                padding: '8px 18px',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#0f766e',
                                color: '#ffffff',
                                fontWeight: 600,
                                fontSize: '13.5px',
                                cursor: 'pointer'
                            }}
                        >
                            {savingProfile ? 'Saving...' : (editingPolicyId ? 'Save Changes' : 'Save Policy')}
                        </button>
                    </div>
                </form>
            )}

            {policies.length === 0 && !showNewForm ? (
                <div style={{ padding: '26px', textAlign: 'center', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                    No insurance, TPA, or government health scheme policies recorded for this patient yet.
                </div>
            ) : (
                policies.map((pol) => {
                    const selectedNextVerify = pendingVerifyStatus[pol._id] ?? pol.verificationStatus ?? 'Not Verified';
                    return (
                        <div key={pol._id} className="patient-policy-profile-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '15.5px', fontWeight: 700, color: '#0f172a' }}>
                                            {pol.providerName || pol.policyType}
                                        </span>
                                        <span className="patient-policy-optional-pill">{pol.policyType}</span>
                                        <span className={`patient-policy-status-badge ${getVerificationBadgeClass(pol.verificationStatus)}`}>
                                            {pol.verificationStatus || 'Not Verified'}
                                        </span>
                                    </div>
                                    {pol.verifiedAt && (
                                        <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '4px' }}>
                                            Updated status by {pol.verifiedByName || 'Authorized Staff'} on {formatDisplayDate(pol.verifiedAt)}
                                            {pol.verificationNotes ? ` — "${pol.verificationNotes}"` : ''}
                                        </div>
                                    )}
                                </div>

                                {canEdit && (
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <button type="button" className="patient-policy-toggle-btn" onClick={() => startEdit(pol)}>
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="patient-policy-toggle-btn"
                                            onClick={() => handleDelete(pol._id)}
                                            style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2' }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="patient-policy-profile-meta">
                                <div>
                                    <span className="patient-policy-meta-label">Policy / Card Number</span>
                                    <div className="patient-policy-meta-value">{pol.policyNumber || '—'}</div>
                                </div>
                                <div>
                                    <span className="patient-policy-meta-label">TPA / Member / Beneficiary ID</span>
                                    <div className="patient-policy-meta-value">{pol.tpaOrMemberId || '—'}</div>
                                </div>
                                <div>
                                    <span className="patient-policy-meta-label">Policy Holder</span>
                                    <div className="patient-policy-meta-value">{pol.policyHolderName || '—'}</div>
                                </div>
                                <div>
                                    <span className="patient-policy-meta-label">Relationship</span>
                                    <div className="patient-policy-meta-value">{pol.relationshipWithPatient || 'Self'}</div>
                                </div>
                                <div>
                                    <span className="patient-policy-meta-label">Valid From</span>
                                    <div className="patient-policy-meta-value">{formatDisplayDate(pol.validFrom)}</div>
                                </div>
                                <div>
                                    <span className="patient-policy-meta-label">Valid Until</span>
                                    <div className="patient-policy-meta-value">{formatDisplayDate(pol.validUntil)}</div>
                                </div>
                            </div>

                            {pol.notes && (
                                <div style={{ marginTop: '10px', padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', fontSize: '12.5px', color: '#334155' }}>
                                    <strong>Notes:</strong> {pol.notes}
                                </div>
                            )}

                            {pol.cardDocument?.url && (
                                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '12.5px', color: '#334155', fontWeight: 600 }}>
                                        📎 Card Document: {pol.cardDocument.originalName || pol.cardDocument.fileName || 'Attached Card'}
                                    </span>
                                    <button
                                        type="button"
                                        className="patient-policy-toggle-btn"
                                        onClick={() => openOrDownloadCardDocument(pol.cardDocument, false)}
                                    >
                                        View Card
                                    </button>
                                    <button
                                        type="button"
                                        className="patient-policy-toggle-btn"
                                        onClick={() => openOrDownloadCardDocument(pol.cardDocument, true)}
                                    >
                                        Download
                                    </button>
                                </div>
                            )}

                            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                                {canVerify ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Verification Action:</span>
                                        <select
                                            value={selectedNextVerify}
                                            onChange={(e) => setPendingVerifyStatus((prev) => ({ ...prev, [pol._id]: e.target.value }))}
                                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                                        >
                                            {VERIFICATION_STATUSES.map((st) => (
                                                <option key={st} value={st}>{st}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="text"
                                            placeholder="Verification remark (optional)"
                                            value={verifyNoteDraft}
                                            onChange={(e) => setVerifyNoteDraft(e.target.value)}
                                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px', minWidth: '190px', flex: '1 1 180px' }}
                                        />
                                        <button
                                            type="button"
                                            disabled={verifyingId === pol._id}
                                            onClick={() => handleVerifyUpdate(pol._id, selectedNextVerify)}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: '#1e293b',
                                                color: '#ffffff',
                                                fontSize: '12.5px',
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {verifyingId === pol._id ? 'Updating...' : 'Update Status'}
                                        </button>
                                    </div>
                                ) : (
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                                        Policy verification status can only be confirmed by authorized Billing / Accounts / Hospital Admin staff.
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

/**
 * Read-only reference banner for Billing & IPD screens.
 * Never alters charges, never assumes cashless approval or scheme eligibility.
 */
export function PatientPolicySummaryBanner({ policies = [], contextLabel = 'Coverage Reference' }) {
    if (!Array.isArray(policies) || policies.length === 0) return null;

    return (
        <div className="patient-policy-banner" data-testid="patient-policy-summary-banner">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    🛡️ {contextLabel} (Reference Only — No Auto-Deduction)
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {policies.map((pol) => (
                        <div
                            key={pol._id}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '12.5px'
                            }}
                        >
                            <strong>{pol.providerName || pol.policyType}</strong>
                            <span style={{ color: '#64748b' }}>({pol.policyType})</span>
                            {pol.policyNumber && <span>• Policy: <strong>{pol.policyNumber}</strong></span>}
                            {pol.tpaOrMemberId && <span>• ID: {pol.tpaOrMemberId}</span>}
                            {pol.validUntil && <span>• Valid till {formatDisplayDate(pol.validUntil)}</span>}
                            <span className={`patient-policy-status-badge ${getVerificationBadgeClass(pol.verificationStatus)}`}>
                                {pol.verificationStatus || 'Not Verified'}
                            </span>
                            {pol.cardDocument?.url && (
                                <button
                                    type="button"
                                    onClick={() => openOrDownloadCardDocument(pol.cardDocument, false)}
                                    style={{
                                        border: '1px solid #cbd5e1',
                                        background: '#f8fafc',
                                        borderRadius: '6px',
                                        padding: '2px 7px',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Card
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
