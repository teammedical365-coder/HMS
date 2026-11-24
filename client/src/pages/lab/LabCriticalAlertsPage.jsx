import React, { useState, useEffect } from 'react';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabResultModal from './LabResultModal';
import {
    FiAlertOctagon, FiCheckCircle, FiClock, FiPhoneCall,
    FiRefreshCw, FiUser, FiArrowUpRight, FiX, FiCheck
} from 'react-icons/fi';

const LabCriticalAlertsPage = () => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('PENDING'); // 'PENDING' | 'ACKNOWLEDGED' | 'ESCALATED' | ''
    const [activeActionModal, setActiveActionModal] = useState(null); // { alert, type: 'ack' | 'esc' }
    const [actionNotes, setActionNotes] = useState('');
    const [actionTaken, setActionTaken] = useState('Attending clinician notified by telephone call');
    const [saving, setSaving] = useState(false);
    const [activeResultId, setActiveResultId] = useState(null);

    const loadAlerts = async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter) params.alertStatus = statusFilter;
            const res = await labAPI.results.getCriticalAlerts(params);
            if (res.success) {
                setAlerts(res.alerts || []);
            }
        } catch (err) {
            console.error('Failed to load critical alerts:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAlerts();
    }, [statusFilter]);

    const handleActionSubmit = async () => {
        if (!actionNotes.trim() && activeActionModal.type === 'esc') {
            alert('Please provide notes for escalation');
            return;
        }

        setSaving(true);
        try {
            if (activeActionModal.type === 'ack') {
                await labAPI.results.acknowledgeCriticalAlert(activeActionModal.alert._id, {
                    actionTaken,
                    notes: actionNotes
                });
            } else {
                await labAPI.results.escalateCriticalAlert(activeActionModal.alert._id, {
                    notes: actionNotes
                });
            }
            setActiveActionModal(null);
            setActionNotes('');
            loadAlerts();
        } catch (err) {
            alert('Action failed: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    return (
        <LabLayout
            title="Critical Panic Value Alerts Console"
            subtitle="Immediate physician notification, mandatory call logging, and diagnostic escalation for life-threatening findings"
            action={
                <button onClick={loadAlerts} className="lab-btn lab-btn-secondary">
                    <FiRefreshCw style={{ marginRight: '6px' }} />
                    Refresh Alerts
                </button>
            }
        >
            {/* Status Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <button
                    className={`lab-btn ${statusFilter === 'PENDING' ? 'lab-btn-danger' : 'lab-btn-secondary'}`}
                    onClick={() => setStatusFilter('PENDING')}
                >
                    <FiAlertOctagon style={{ marginRight: '6px' }} />
                    Pending Action
                </button>
                <button
                    className={`lab-btn ${statusFilter === 'ACKNOWLEDGED' ? 'lab-btn-primary' : 'lab-btn-secondary'}`}
                    onClick={() => setStatusFilter('ACKNOWLEDGED')}
                >
                    <FiCheckCircle style={{ marginRight: '6px' }} />
                    Acknowledged & Audited
                </button>
                <button
                    className={`lab-btn ${statusFilter === 'ESCALATED' ? 'lab-btn-warning' : 'lab-btn-secondary'}`}
                    onClick={() => setStatusFilter('ESCALATED')}
                >
                    <FiArrowUpRight style={{ marginRight: '6px' }} />
                    Escalated
                </button>
                <button
                    className={`lab-btn ${statusFilter === '' ? 'lab-btn-primary' : 'lab-btn-secondary'}`}
                    onClick={() => setStatusFilter('')}
                >
                    All Alerts
                </button>
            </div>

            {/* Alerts Table */}
            <div className="lab-card" style={{ padding: 0 }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                        <FiRefreshCw className="spin" style={{ fontSize: '32px', marginBottom: '12px' }} />
                        <p>Loading critical panic value notifications...</p>
                    </div>
                ) : alerts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                        <FiCheckCircle style={{ fontSize: '42px', color: '#16a34a', marginBottom: '12px' }} />
                        <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>No Critical Alerts in Queue</h4>
                        <p style={{ margin: 0, fontSize: '13px' }}>
                            Zero unacknowledged panic values detected across all clinical departments.
                        </p>
                    </div>
                ) : (
                    <table className="lab-table" style={{ width: '100%', fontSize: '13px' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '15%' }}>Patient & Order</th>
                                <th style={{ width: '15%' }}>Test / Barcode</th>
                                <th style={{ width: '22%' }}>Critical Parameter & Value</th>
                                <th style={{ width: '15%' }}>Panic Threshold</th>
                                <th style={{ width: '13%' }}>Status / Time</th>
                                <th style={{ width: '20%', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {alerts.map((al, idx) => {
                                const isPending = al.alertStatus === 'PENDING';

                                return (
                                    <tr key={idx} style={{ background: isPending ? '#fef2f2' : 'inherit' }}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{al.patientName}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>UHID: {al.uhid || 'N/A'} • {al.orderNumber}</div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#0284c7' }}>{al.testName}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{al.barcode} • {al.department}</div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#b91c1c', fontSize: '14px' }}>
                                                {al.parameterName}: <strong>{al.criticalValue}</strong> {al.criticalThreshold?.unit}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="lab-badge lab-badge-danger">
                                                {al.criticalThreshold?.type === 'LOW' ? `< ${al.criticalThreshold?.limit}` : `> ${al.criticalThreshold?.limit}`} {al.criticalThreshold?.unit}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`lab-badge ${
                                                isPending ? 'lab-badge-danger' :
                                                al.alertStatus === 'ACKNOWLEDGED' ? 'lab-badge-success' : 'lab-badge-warning'
                                            }`}>
                                                {al.alertStatus}
                                            </span>
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                                {new Date(al.detectedAt).toLocaleTimeString()}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                {isPending && (
                                                    <>
                                                        <button
                                                            className="lab-btn lab-btn-primary"
                                                            style={{ padding: '4px 10px', fontSize: '11px', background: '#16a34a' }}
                                                            onClick={() => {
                                                                setActiveActionModal({ alert: al, type: 'ack' });
                                                                setActionTaken('Attending clinician notified by telephone call');
                                                                setActionNotes('');
                                                            }}
                                                        >
                                                            <FiPhoneCall style={{ marginRight: '4px' }} />
                                                            Acknowledge
                                                        </button>
                                                        <button
                                                            className="lab-btn lab-btn-warning"
                                                            style={{ padding: '4px 10px', fontSize: '11px' }}
                                                            onClick={() => {
                                                                setActiveActionModal({ alert: al, type: 'esc' });
                                                                setActionNotes('');
                                                            }}
                                                        >
                                                            <FiArrowUpRight style={{ marginRight: '4px' }} />
                                                            Escalate
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    className="lab-btn lab-btn-secondary"
                                                    style={{ padding: '4px 10px', fontSize: '11px' }}
                                                    onClick={() => setActiveResultId(al.resultId)}
                                                >
                                                    View Findings
                                                </button>
                                            </div>
                                            {al.acknowledgedByName && (
                                                <div style={{ fontSize: '10px', color: '#16a34a', marginTop: '4px' }}>
                                                    Notified by {al.acknowledgedByName} ({al.actionTaken})
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Action Dialog (Acknowledge / Escalate) */}
            {activeActionModal && (
                <div className="lab-modal-overlay">
                    <div className="lab-modal" style={{ maxWidth: '480px' }}>
                        <div className="lab-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '16px' }}>
                                {activeActionModal.type === 'ack' ? 'Log Clinician Notification' : 'Escalate Critical Panic Alert'}
                            </h3>
                            <button className="lab-btn-icon" onClick={() => setActiveActionModal(null)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="lab-modal-body" style={{ padding: '20px' }}>
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px', marginBottom: '14px', fontSize: '12px', color: '#991b1b' }}>
                                Parameter: <strong>{activeActionModal.alert.parameterName}</strong> ({activeActionModal.alert.criticalValue} {activeActionModal.alert.criticalThreshold?.unit})<br />
                                Patient: <strong>{activeActionModal.alert.patientName}</strong> • Order: {activeActionModal.alert.orderNumber}
                            </div>

                            {activeActionModal.type === 'ack' ? (
                                <>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                        Communication Action Taken *
                                    </label>
                                    <select
                                        className="lab-input"
                                        value={actionTaken}
                                        onChange={(e) => setActionTaken(e.target.value)}
                                        style={{ width: '100%', marginBottom: '12px' }}
                                    >
                                        <option value="Attending clinician notified by telephone call">Attending clinician notified by telephone call</option>
                                        <option value="Ward / Nursing station informed verbally">Ward / Nursing station informed verbally</option>
                                        <option value="Emergency consultant notified immediately">Emergency consultant notified immediately</option>
                                        <option value="Direct clinician in-person consultation">Direct clinician in-person consultation</option>
                                    </select>

                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                        Doctor Name & Call Notes
                                    </label>
                                    <textarea
                                        className="lab-input"
                                        rows={3}
                                        value={actionNotes}
                                        onChange={(e) => setActionNotes(e.target.value)}
                                        placeholder="e.g. Spoke with Dr. Sharma at 11:20 AM. Read back and confirmed."
                                        style={{ width: '100%' }}
                                    />
                                </>
                            ) : (
                                <>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                        Escalation Reason & Notes *
                                    </label>
                                    <textarea
                                        className="lab-input"
                                        rows={3}
                                        value={actionNotes}
                                        onChange={(e) => setActionNotes(e.target.value)}
                                        placeholder="e.g. Attending clinician unreachable after 3 attempts. Escalating to Lab Director / CMO."
                                        style={{ width: '100%' }}
                                    />
                                </>
                            )}
                        </div>
                        <div className="lab-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="lab-btn lab-btn-secondary" onClick={() => setActiveActionModal(null)} disabled={saving}>
                                Cancel
                            </button>
                            <button className="lab-btn lab-btn-primary" onClick={handleActionSubmit} disabled={saving}>
                                Confirm Action
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Findings Detail Modal */}
            {activeResultId && (
                <LabResultModal
                    isOpen={true}
                    onClose={() => setActiveResultId(null)}
                    resultId={activeResultId}
                    mode="verification"
                    onActionSuccess={() => loadAlerts()}
                />
            )}
        </LabLayout>
    );
};

export default LabCriticalAlertsPage;
