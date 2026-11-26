import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabResultModal from './LabResultModal';
import {
    FiAlertOctagon, FiCheckCircle, FiPhoneCall,
    FiRefreshCw, FiArrowUpRight, FiX, FiEye
} from 'react-icons/fi';
import './LabResultEntry.css';

const formatTime = (val) => {
    if (!val) return '—';
    try {
        return new Date(val).toLocaleString([], {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return '—';
    }
};

const LabCriticalAlertsPage = () => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [activeActionModal, setActiveActionModal] = useState(null); // { alert, type: 'ack' | 'esc' }
    const [actionNotes, setActionNotes] = useState('');
    const [actionTaken, setActionTaken] = useState('Attending clinician notified by telephone call');
    const [saving, setSaving] = useState(false);
    const [activeResultId, setActiveResultId] = useState(null);

    const loadAlerts = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter) params.alertStatus = statusFilter;
            const res = await labAPI.results.getCriticalAlerts(params);
            if (res?.success) {
                setAlerts(res.alerts || []);
            }
        } catch (err) {
            console.error('Failed to load critical alerts:', err);
            toast.error(err.response?.data?.message || 'Failed to load critical alerts');
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        loadAlerts();
    }, [loadAlerts]);

    const handleActionSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!activeActionModal) return;

        if (!actionNotes.trim() && activeActionModal.type === 'esc') {
            toast.error('Please enter mandatory escalation reason and notes.');
            return;
        }

        setSaving(true);
        try {
            if (activeActionModal.type === 'ack') {
                await labAPI.results.acknowledgeCriticalAlert(activeActionModal.alert._id, {
                    actionTaken,
                    notes: actionNotes.trim()
                });
                toast.success('Critical value alert acknowledged and logged.');
            } else {
                await labAPI.results.escalateCriticalAlert(activeActionModal.alert._id, {
                    notes: actionNotes.trim()
                });
                toast.success('Critical value alert escalated.');
            }
            setActiveActionModal(null);
            setActionNotes('');
            loadAlerts();
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Action failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <LabLayout>
            <div className="lre-page">
                <div className="lre-page-header">
                    <div>
                        <h1 className="lre-page-title">Critical Value Alerts Console</h1>
                        <p className="lre-page-subtitle">
                            Track life-threatening laboratory panic values, document clinician communication, and review associated test findings.
                        </p>
                    </div>
                    <div className="lre-header-actions">
                        <button
                            type="button"
                            className="lre-btn lre-btn-secondary"
                            onClick={loadAlerts}
                            disabled={loading}
                        >
                            <FiRefreshCw size={14} className={loading ? 'lre-spin' : ''} />
                            <span>Refresh Alerts</span>
                        </button>
                    </div>
                </div>

                {/* Status Filter Tabs */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className={`lre-btn ${statusFilter === 'PENDING' ? 'lre-btn-danger' : 'lre-btn-secondary'}`}
                        onClick={() => setStatusFilter('PENDING')}
                    >
                        <FiAlertOctagon size={14} />
                        <span>Pending Action</span>
                    </button>
                    <button
                        type="button"
                        className={`lre-btn ${statusFilter === 'ACKNOWLEDGED' ? 'lre-btn-success' : 'lre-btn-secondary'}`}
                        onClick={() => setStatusFilter('ACKNOWLEDGED')}
                    >
                        <FiCheckCircle size={14} />
                        <span>Acknowledged &amp; Audited</span>
                    </button>
                    <button
                        type="button"
                        className={`lre-btn ${statusFilter === 'ESCALATED' ? 'lre-btn-warning' : 'lre-btn-secondary'}`}
                        onClick={() => setStatusFilter('ESCALATED')}
                    >
                        <FiArrowUpRight size={14} />
                        <span>Escalated</span>
                    </button>
                    <button
                        type="button"
                        className={`lre-btn ${statusFilter === '' ? 'lre-btn-primary' : 'lre-btn-secondary'}`}
                        onClick={() => setStatusFilter('')}
                    >
                        <span>All Alerts</span>
                    </button>
                </div>

                {/* Critical Alerts Table */}
                <div className="lre-table-card">
                    {loading ? (
                        <div className="lre-empty-box">
                            <FiRefreshCw className="lre-spin" size={28} style={{ color: '#dc2626' }} />
                            <h4>Loading Critical Alerts...</h4>
                            <p>Checking clinical laboratory panic value logs.</p>
                        </div>
                    ) : alerts.length === 0 ? (
                        <div className="lre-empty-box">
                            <FiCheckCircle size={38} style={{ color: '#16a34a' }} />
                            <h4>No Critical Alerts in Selected View</h4>
                            <p>Zero unacknowledged panic value breaches found for this filter.</p>
                        </div>
                    ) : (
                        <div className="lre-table-scroll">
                            <table className="lre-table">
                                <thead>
                                    <tr>
                                        <th>Patient &amp; MRN</th>
                                        <th>Order &amp; Barcode</th>
                                        <th>Test &amp; Department</th>
                                        <th>Critical Parameter &amp; Value</th>
                                        <th>Threshold</th>
                                        <th>Status &amp; Detected</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {alerts.map((al) => {
                                        const isPending = al.alertStatus === 'PENDING';
                                        return (
                                            <tr key={String(al._id)} className={isPending ? 'lre-row-critical' : ''}>
                                                <td>
                                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{al.patientName || 'Patient'}</div>
                                                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>MRN: {al.uhid || 'N/A'}</div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 700, color: '#334155' }}>{al.orderNumber}</div>
                                                    <div className="lre-mono" style={{ fontSize: '11.5px' }}>{al.barcode}</div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 700, color: '#1d4ed8' }}>{al.testName}</div>
                                                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>{al.department}</div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 800, color: '#b91c1c', fontSize: '13.5px' }}>
                                                        {al.parameterName}: {al.criticalValue} {al.criticalThreshold?.unit || ''}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="lre-badge lre-badge-critical">
                                                        {al.criticalThreshold?.type === 'LOW'
                                                            ? `< ${al.criticalThreshold?.limit}`
                                                            : `> ${al.criticalThreshold?.limit}`}{' '}
                                                        {al.criticalThreshold?.unit || ''}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`lre-badge ${
                                                            isPending
                                                                ? 'lre-badge-critical'
                                                                : al.alertStatus === 'ACKNOWLEDGED'
                                                                    ? 'lre-badge-verified'
                                                                    : 'lre-badge-correction'
                                                        }`}
                                                    >
                                                        {al.alertStatus}
                                                    </span>
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                                                        {formatTime(al.detectedAt)}
                                                    </div>
                                                    {al.acknowledgedByName && (
                                                        <div style={{ fontSize: '11px', color: '#15803d', marginTop: '2px' }}>
                                                            By {al.acknowledgedByName}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                        {isPending && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="lre-btn lre-btn-success lre-btn-sm"
                                                                    onClick={() => {
                                                                        setActiveActionModal({ alert: al, type: 'ack' });
                                                                        setActionTaken('Attending clinician notified by telephone call');
                                                                        setActionNotes('');
                                                                    }}
                                                                >
                                                                    <FiPhoneCall size={12} />
                                                                    <span>Acknowledge</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="lre-btn lre-btn-warning lre-btn-sm"
                                                                    onClick={() => {
                                                                        setActiveActionModal({ alert: al, type: 'esc' });
                                                                        setActionNotes('');
                                                                    }}
                                                                >
                                                                    <FiArrowUpRight size={12} />
                                                                    <span>Escalate</span>
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="lre-btn lre-btn-secondary lre-btn-sm"
                                                            onClick={() => setActiveResultId(al.resultId)}
                                                        >
                                                            <FiEye size={12} />
                                                            <span>View Findings</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Acknowledge / Escalate Dialog (No Backdrop Auto-Close) */}
                {activeActionModal && (
                    <div className="lrm-overlay" role="dialog" aria-modal="true" aria-label="Critical Alert Action">
                        <div className="lrm-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="lrm-header">
                                <h3 className="lrm-title">
                                    {activeActionModal.type === 'ack'
                                        ? 'Log Attending Clinician Notification'
                                        : 'Escalate Critical Panic Alert'}
                                </h3>
                                <button
                                    type="button"
                                    className="lrm-close-btn"
                                    onClick={() => setActiveActionModal(null)}
                                    disabled={saving}
                                >
                                    <FiX />
                                </button>
                            </div>

                            <form onSubmit={handleActionSubmit} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
                                <div className="lrm-body" data-scrollable="true" data-lenis-prevent="true">
                                    <div className="lrm-alert-strip lrm-alert-critical">
                                        <FiAlertOctagon size={17} style={{ flexShrink: 0 }} />
                                        <div>
                                            <strong>{activeActionModal.alert.parameterName}:</strong>{' '}
                                            {activeActionModal.alert.criticalValue} {activeActionModal.alert.criticalThreshold?.unit || ''}<br />
                                            Patient: <strong>{activeActionModal.alert.patientName}</strong> &bull; Order: {activeActionModal.alert.orderNumber}
                                        </div>
                                    </div>

                                    {activeActionModal.type === 'ack' ? (
                                        <>
                                            <div>
                                                <label className="lrm-field-label" htmlFor="crit-action-taken">
                                                    Communication Channel *
                                                </label>
                                                <select
                                                    id="crit-action-taken"
                                                    className="lrm-param-select"
                                                    value={actionTaken}
                                                    onChange={(e) => setActionTaken(e.target.value)}
                                                >
                                                    <option value="Attending clinician notified by telephone call">Attending clinician notified by telephone call</option>
                                                    <option value="Ward / Nursing station informed verbally">Ward / Nursing station informed verbally</option>
                                                    <option value="Emergency consultant notified immediately">Emergency consultant notified immediately</option>
                                                    <option value="Direct clinician in-person consultation">Direct clinician in-person consultation</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="lrm-field-label" htmlFor="crit-ack-notes">
                                                    Clinician Name &amp; Read-Back Notes
                                                </label>
                                                <textarea
                                                    id="crit-ack-notes"
                                                    className="lrm-textarea"
                                                    rows={3}
                                                    value={actionNotes}
                                                    onChange={(e) => setActionNotes(e.target.value)}
                                                    placeholder="Record physician name, time of call, and read-back confirmation..."
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <div>
                                            <label className="lrm-field-label" htmlFor="crit-esc-notes">
                                                Escalation Reason &amp; Notes *
                                            </label>
                                            <textarea
                                                id="crit-esc-notes"
                                                className="lrm-textarea"
                                                rows={3}
                                                value={actionNotes}
                                                onChange={(e) => setActionNotes(e.target.value)}
                                                placeholder="State reason for escalation and senior authority contacted..."
                                                required
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="lrm-footer">
                                    <div />
                                    <div className="lrm-footer-actions">
                                        <button
                                            type="button"
                                            className="lre-btn lre-btn-secondary"
                                            onClick={() => setActiveActionModal(null)}
                                            disabled={saving}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="lre-btn lre-btn-primary"
                                            disabled={saving}
                                        >
                                            {saving ? 'Saving...' : 'Confirm & Log Audit'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Result Review Modal */}
                {activeResultId && (
                    <LabResultModal
                        isOpen={true}
                        onClose={() => setActiveResultId(null)}
                        resultId={activeResultId}
                        mode="verification"
                        onActionSuccess={() => loadAlerts()}
                    />
                )}
            </div>
        </LabLayout>
    );
};

export default LabCriticalAlertsPage;
