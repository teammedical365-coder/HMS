import React, { useState, useEffect } from 'react';
import { hospitalAPI } from '../utils/api';
import { COMMON_NABH_LOGO_URL } from '../utils/tprChartPdf';
import { toast } from '../utils/confirmToast';

/**
 * Central-Admin-only modal for activating/deactivating NABH accreditation per hospital
 * and recording an audit trail. Uses the single shared common PNG asset (/assets/nabh-logo.png).
 */
const NabhAccreditationModal = ({ hospital, onClose, onUpdated }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [enabled, setEnabled] = useState(hospital?.accreditation?.enabled === true);
    const [certNo, setCertNo] = useState(hospital?.accreditation?.certNo || '');
    const [meta, setMeta] = useState({
        updatedByName: hospital?.accreditation?.updatedByName || '',
        updatedAt: hospital?.accreditation?.updatedAt || null
    });
    const [auditTrail, setAuditTrail] = useState([]);
    const [logoMissing, setLogoMissing] = useState(false);

    useEffect(() => {
        if (!hospital?._id) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await hospitalAPI.getNabhStatus(hospital._id);
                if (!cancelled && res?.success && res.nabh) {
                    setEnabled(res.nabh.enabled === true);
                    setCertNo(res.nabh.certNo || '');
                    setMeta({
                        updatedByName: res.nabh.updatedByName || '',
                        updatedAt: res.nabh.updatedAt || null
                    });
                    setAuditTrail(Array.isArray(res.nabh.auditTrail) ? [...res.nabh.auditTrail].reverse() : []);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.response?.data?.message || 'Failed to load NABH status');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [hospital?._id]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!hospital?._id) return;
        setSaving(true);
        setError('');
        try {
            const res = await hospitalAPI.updateNabhStatus(hospital._id, {
                enabled: Boolean(enabled),
                certNo: certNo.trim()
            });
            if (res?.success) {
                toast.success(res.message || `NABH ${enabled ? 'activated' : 'deactivated'} for ${hospital.name}`);
                if (typeof onUpdated === 'function') {
                    onUpdated(res);
                }
                onClose();
            } else {
                setError(res?.message || 'Failed to update NABH status');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error updating NABH status');
        } finally {
            setSaving(false);
        }
    };

    const formatTs = (val) => {
        if (!val) return '—';
        const d = new Date(val);
        return isNaN(d.getTime()) ? '—' : d.toLocaleString();
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
            <div className="modal-content" style={{ maxWidth: '580px', width: '94%', maxHeight: '90vh', overflowY: 'auto', padding: '24px 28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                            🏅 NABH Accreditation Control
                        </h3>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                            Hospital: <strong style={{ color: '#1e293b' }}>{hospital?.branding?.appName || hospital?.name}</strong>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px', color: '#475569' }}
                        title="Close"
                    >
                        ✕
                    </button>
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: enabled ? '#f0fdf4' : '#f8fafc',
                    border: `1px solid ${enabled ? '#86efac' : '#cbd5e1'}`,
                    marginBottom: '16px'
                }}>
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Current Status
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: enabled ? '#15803d' : '#475569', marginTop: '2px' }}>
                            {enabled ? 'NABH Enabled (Active)' : 'NABH Disabled (Inactive)'}
                        </div>
                        {meta.updatedAt && (
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                Last updated {formatTs(meta.updatedAt)}{meta.updatedByName ? ` by ${meta.updatedByName}` : ''}
                            </div>
                        )}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        {enabled && !logoMissing ? (
                            <img
                                src={COMMON_NABH_LOGO_URL}
                                alt="Shared NABH Seal"
                                onError={() => setLogoMissing(true)}
                                style={{ height: '48px', width: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                            />
                        ) : (
                            <span style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: '999px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                background: enabled ? '#dcfce7' : '#e2e8f0',
                                color: enabled ? '#166534' : '#475569'
                            }}>
                                {enabled ? 'LOGO ACTIVE' : 'HIDDEN'}
                            </span>
                        )}
                    </div>
                </div>

                {logoMissing && enabled && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px' }}>
                        Common asset <code>/assets/nabh-logo.png</code> is not placed in <code>client/public/assets/</code> yet. Once added, it will render automatically across accredited hospitals&apos; TPR Charts.
                    </div>
                )}

                {error && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                        {error}
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748b', fontSize: '13.5px' }}>
                        Loading authoritative accreditation record…
                    </div>
                ) : (
                    <form onSubmit={handleSave}>
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                padding: '14px 16px',
                                borderRadius: '10px',
                                border: `2px solid ${enabled ? '#16a34a' : '#cbd5e1'}`,
                                background: enabled ? '#f0fdf4' : '#f8fafc',
                                marginBottom: '14px',
                                cursor: 'pointer'
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) => setEnabled(e.target.checked)}
                                style={{
                                    width: '18px',
                                    height: '18px',
                                    marginTop: '2px',
                                    accentColor: '#16a34a',
                                    cursor: 'pointer'
                                }}
                            />
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '14px', color: enabled ? '#15803d' : '#1e293b' }}>
                                    {enabled ? 'NABH Accreditation Active (Checked)' : 'Activate NABH Accreditation for this Hospital'}
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                                    {enabled
                                        ? 'The shared Medical365 NABH seal and configured certificate number appear on this hospital\'s TPR Chart and In-Patient Clinical Notes letterheads.'
                                        : 'Unchecked: Neither NABH logo nor certificate number will appear on this hospital\'s IPD documents.'}
                                </div>
                            </div>
                        </label>

                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                NABH Certificate Number (Manual Entry)
                            </label>
                            <input
                                type="text"
                                value={certNo}
                                onChange={(e) => setCertNo(e.target.value)}
                                placeholder="e.g. Cert. No. : H-2026-001 or H-2014-0251"
                                maxLength={80}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    fontSize: '13.5px',
                                    boxSizing: 'border-box'
                                }}
                            />
                            <p style={{ margin: '5px 0 0', fontSize: '11.5px', color: '#64748b' }}>
                                Shared static PNG (<code>/assets/nabh-logo.png</code>) is used across all accredited hospitals. Hospitals cannot upload custom NABH seals or enable NABH from Hospital Branding Studio.
                            </p>
                        </div>

                        {auditTrail.length > 0 && (
                            <div style={{ marginBottom: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                                    Recent Accreditation Audit Trail
                                </div>
                                <div style={{ maxHeight: '110px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {auditTrail.slice(0, 6).map((entry, idx) => (
                                        <div key={idx} style={{ fontSize: '11.5px', color: '#334155', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <span>
                                                <strong>{entry.action}</strong>
                                                {entry.certNo ? ` (${entry.certNo})` : ''} — {entry.updatedByName || 'Central Admin'}
                                            </span>
                                            <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{formatTs(entry.timestamp)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button type="button" onClick={onClose} className="btn-cancel" disabled={saving}>
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                style={{
                                    padding: '9px 18px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#0d9488',
                                    color: '#ffffff',
                                    fontWeight: 700,
                                    fontSize: '13.5px',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    opacity: saving ? 0.65 : 1
                                }}
                            >
                                {saving ? 'Saving…' : 'Save NABH Status'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default NabhAccreditationModal;
