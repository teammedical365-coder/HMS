import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabBarcodeModal from './LabBarcodeModal';
import {
    FiArrowLeft, FiPrinter, FiTag, FiClock, FiCheckCircle,
    FiAlertTriangle, FiUser, FiActivity, FiMapPin, FiLayers,
    FiRefreshCw
} from 'react-icons/fi';

const LabSampleDetailPage = () => {
    const { sampleId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sample, setSample] = useState(null);
    const [history, setHistory] = useState([]);
    const [barcodeModal, setBarcodeModal] = useState({ open: false, data: null });

    const loadTimeline = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await labAPI.samples.getTimeline(sampleId);
            if (res.success) {
                setSample(res.sample);
                setHistory(res.history || []);
            } else {
                setError(res.message || 'Sample not found');
            }
        } catch (err) {
            console.error('Failed to load sample timeline:', err);
            setError('Unable to load sample tracking timeline.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTimeline();
    }, [sampleId]);

    const handleOpenLabel = async () => {
        if (!sample) return;
        try {
            const res = await labAPI.samples.getLabel(sample._id);
            if (res.success) {
                setBarcodeModal({
                    open: true,
                    data: { ...res.labelData, sampleId: sample._id }
                });
            }
        } catch (err) {
            alert('Failed to load label data');
        }
    };

    return (
        <LabLayout
            title={`Sample Tracking: ${sample?.barcode || ''}`}
            subtitle="Complete Chain of Custody, Specimen Drawing, Quality Verification & Status Audit Trail"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. TOP BAR NAVIGATION */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#475569', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
                    >
                        <FiArrowLeft /> Back to Workstation
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className={`lbd-badge ${sample?.status === 'COLLECTED' || sample?.status === 'ACCEPTED' || sample?.status === 'PROCESSING_COMPLETED' ? 'lbd-badge-paid' : sample?.status?.includes('REJECT') ? 'lbd-badge-unpaid' : 'lbd-badge-partial'}`} style={{ fontSize: '13px', padding: '6px 14px' }}>
                            {sample?.status?.replace(/_/g, ' ')}
                        </span>

                        <button
                            onClick={handleOpenLabel}
                            className="lbd-btn-action lbd-btn-action-primary"
                        >
                            <FiPrinter /> Print Barcode Label
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <FiAlertTriangle /> {error}
                    </div>
                )}

                {/* 2. SPECIMEN & PATIENT OVERVIEW CARDS */}
                {sample && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                        {/* Patient Snapshot */}
                        <div style={{ background: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', marginBottom: '8px' }}>
                                <FiUser /> Patient Identification
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                                {sample.patientSnapshot?.name}
                            </div>
                            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
                                UHID: <strong>{sample.patientSnapshot?.uhid || 'N/A'}</strong>
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                {sample.patientSnapshot?.gender} / {sample.patientSnapshot?.age}Y • Phone: {sample.patientSnapshot?.phone}
                            </div>
                        </div>

                        {/* Order Snapshot */}
                        <div style={{ background: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', marginBottom: '8px' }}>
                                <FiActivity /> Laboratory Requisition
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#2563eb' }}>
                                {sample.orderNumber}
                            </div>
                            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
                                Token: <strong>TKN-{sample.tokenNumber}</strong> • Priority: <strong>{sample.priority}</strong>
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                Mode: {sample.collectionType}
                            </div>
                        </div>

                        {/* Physical Container Details */}
                        <div style={{ background: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', marginBottom: '8px' }}>
                                <FiLayers /> Physical Tube Specifications
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                                {sample.containerType}
                            </div>
                            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
                                Specimen: <strong>{sample.specimenType}</strong>
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                Volume: {sample.collectedVolume || sample.requiredVolume} • Condition: <strong>{sample.sampleCondition || 'Normal'}</strong>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. CHRONOLOGICAL CUSTODY TIMELINE */}
                <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiClock style={{ color: '#2563eb' }} /> Chronological Chain of Custody Timeline
                        </h3>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                            {history.length} Audited Events
                        </span>
                    </div>

                    {history.length === 0 ? (
                        <div className="lbd-empty-state">
                            <FiClock />
                            <h3>No Events Recorded Yet</h3>
                            <p>This specimen was just initialized.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '3px solid #e2e8f0', marginLeft: '12px', paddingLeft: '24px' }}>
                            {history.map((h, idx) => (
                                <div key={idx} style={{ position: 'relative' }}>
                                    {/* Timeline Marker Dot */}
                                    <div style={{ position: 'absolute', left: '-31px', top: '4px', width: '13px', height: '13px', borderRadius: '50%', background: '#2563eb', border: '3px solid #ffffff', boxShadow: '0 0 0 2px #2563eb' }}></div>

                                    <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                                                {h.action.replace(/_/g, ' ')}
                                            </span>
                                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                                {new Date(h.timestamp).toLocaleString()}
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                                            Staff Actor: <strong>{h.performedByName || 'Laboratory Staff'}</strong>
                                            {h.previousStatus && (
                                                <span style={{ marginLeft: '12px' }}>
                                                    Status Transition: <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{h.previousStatus}</span> ➔ <strong style={{ color: '#059669' }}>{h.newStatus}</strong>
                                                </span>
                                            )}
                                        </div>

                                        {h.details && Object.keys(h.details).length > 0 && (
                                            <div style={{ marginTop: '8px', fontSize: '11.5px', background: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#334155' }}>
                                                {Object.entries(h.details).map(([k, v]) => (
                                                    <span key={k} style={{ marginRight: '16px' }}>
                                                        <strong>{k}:</strong> {String(v)}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* BARCODE MODAL */}
            {barcodeModal.open && (
                <LabBarcodeModal
                    labelData={barcodeModal.data}
                    onClose={() => setBarcodeModal({ open: false, data: null })}
                    onReprinted={() => loadTimeline()}
                />
            )}
        </LabLayout>
    );
};

export default LabSampleDetailPage;
