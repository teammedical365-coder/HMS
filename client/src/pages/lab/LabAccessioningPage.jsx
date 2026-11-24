import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabSampleActionModal from './LabSampleActionModal';
import LabBarcodeModal from './LabBarcodeModal';
import {
    FiCheckCircle, FiAlertTriangle, FiSearch, FiRefreshCw,
    FiXCircle, FiPrinter, FiCpu, FiExternalLink, FiMaximize2
} from 'react-icons/fi';

const LabAccessioningPage = () => {
    const navigate = useNavigate();
    const barcodeInputRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [scannedBarcode, setScannedBarcode] = useState('');
    const [selectedSample, setSelectedSample] = useState(null);
    const [queue, setQueue] = useState([]);
    const [stats, setStats] = useState({});

    // Modal Control
    const [actionModal, setActionModal] = useState({ open: false, type: '', data: null });
    const [barcodeModal, setBarcodeModal] = useState({ open: false, data: null });

    const loadAccessionData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [queueRes, statsRes] = await Promise.all([
                labAPI.samples.getAccessionQueue(),
                labAPI.samples.getDashboardStats()
            ]);

            if (queueRes.success) {
                setQueue(queueRes.samples || []);
                // If there was a selected sample, refresh it
                if (selectedSample) {
                    const refreshed = (queueRes.samples || []).find(s => s._id === selectedSample._id);
                    setSelectedSample(refreshed || null);
                }
            }
            if (statsRes.success) {
                setStats(statsRes.stats || {});
            }
        } catch (err) {
            console.error('Failed to load accessioning queue:', err);
            setError('Unable to load laboratory accessioning queue.');
        } finally {
            setLoading(false);
        }
    }, [selectedSample]);

    useEffect(() => {
        loadAccessionData();
        // Focus the barcode scanner input automatically
        if (barcodeInputRef.current) {
            barcodeInputRef.current.focus();
        }
    }, []);

    // Handle Hardware Barcode Scanner Submission (Enter key)
    const handleBarcodeScanSubmit = (e) => {
        e.preventDefault();
        const code = scannedBarcode.trim();
        if (!code) return;

        const found = queue.find(
            s => s.barcode.toLowerCase() === code.toLowerCase() ||
                 s.orderNumber.toLowerCase() === code.toLowerCase()
        );

        if (found) {
            setSelectedSample(found);
            setError(null);
        } else {
            setError(`No specimen found matching barcode "${code}" in accessioning queue`);
        }
        setScannedBarcode('');
    };

    const handleAcceptDirect = async (sample) => {
        try {
            const res = await labAPI.samples.acceptSample(sample._id, {
                sampleCondition: 'Normal',
                accessionNotes: 'Verified at central accessioning desk'
            });
            if (res.success) {
                setSelectedSample(null);
                loadAccessionData();
            }
        } catch (err) {
            alert(err.response?.data?.message || err.message || 'Failed to accept sample');
        }
    };

    return (
        <LabLayout
            title="Specimen Accessioning Workstation"
            subtitle="Central Inbound Tube Verification, Quality Inspection, Acceptance & Quality Rejection"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. TOP SCANNER CARD */}
                <div style={{ background: '#0f172a', color: '#ffffff', padding: '20px', borderRadius: '14px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
                                ⚡ Hardware Barcode Scanner Receiver
                            </h2>
                            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                                Scan physical tube barcode or manually type barcode / UHID and press Enter
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ background: '#1e293b', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', border: '1px solid #334155' }}>
                                Awaiting Accession: <strong style={{ color: '#38bdf8' }}>{queue.length}</strong>
                            </div>
                            <div style={{ background: '#1e293b', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', border: '1px solid #334155' }}>
                                Accepted Today: <strong style={{ color: '#4ade80' }}>{stats.accepted || 0}</strong>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleBarcodeScanSubmit} style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <FiSearch style={{ position: 'absolute', left: '16px', top: '15px', color: '#64748b', fontSize: '18px' }} />
                            <input
                                ref={barcodeInputRef}
                                type="text"
                                placeholder="Ready for barcode scanner input (e.g. SMP-HOSP-20261123-0001)..."
                                value={scannedBarcode}
                                onChange={(e) => setScannedBarcode(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px 12px 46px',
                                    borderRadius: '10px',
                                    border: '2px solid #3b82f6',
                                    background: '#1e293b',
                                    color: '#ffffff',
                                    fontSize: '15px',
                                    fontFamily: 'monospace',
                                    outline: 'none',
                                    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.25)'
                                }}
                            />
                        </div>
                        <button
                            type="submit"
                            style={{ padding: '0 24px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
                        >
                            Find Tube
                        </button>
                    </form>
                </div>

                {/* Error Banner */}
                {error && (
                    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <FiAlertTriangle /> {error}
                    </div>
                )}

                {/* 2. ACTIVE INSPECTION PANEL (If a sample is selected) */}
                {selectedSample && (
                    <div style={{ background: '#ffffff', border: '2px solid #2563eb', borderRadius: '14px', padding: '20px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}>
                            <div>
                                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#2563eb', letterSpacing: '1px' }}>
                                    Specimen Quality Verification Panel
                                </span>
                                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '2px 0 0 0', fontFamily: 'monospace' }}>
                                    {selectedSample.barcode}
                                </h3>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className={`lbm-sticker-priority ${(selectedSample.priority || 'Routine').toLowerCase()}`}>
                                    {selectedSample.priority}
                                </span>
                                <button
                                    onClick={() => setSelectedSample(null)}
                                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
                                >
                                    Dismiss Panel
                                </button>
                            </div>
                        </div>

                        {/* Patient & Tube Details Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PATIENT DEMOGRAPHICS</div>
                                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                                    {selectedSample.patientSnapshot?.name}
                                </div>
                                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                                    UHID: <strong>{selectedSample.patientSnapshot?.uhid || 'N/A'}</strong> • {selectedSample.patientSnapshot?.gender} / {selectedSample.patientSnapshot?.age}Y
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>SPECIMEN REQUIREMENTS</div>
                                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                                    {selectedSample.containerType}
                                </div>
                                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                                    Type: <strong>{selectedSample.specimenType}</strong> • Volume: {selectedSample.collectedVolume || selectedSample.requiredVolume}
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>COLLECTION AUDIT</div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                                    Collector: {selectedSample.collectedByName || 'Phlebotomist'}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                    Drawn At: {selectedSample.collectedAt ? new Date(selectedSample.collectedAt).toLocaleTimeString() : 'Pending'}
                                </div>
                            </div>
                        </div>

                        {/* Associated Tests */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                                Investigations Configured for this Specimen:
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {(selectedSample.tests || []).map((t, i) => (
                                    <span key={i} style={{ padding: '4px 10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                                        {t.testCode} — {t.testName}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Inspection Actions */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                            <button
                                onClick={() => setActionModal({ open: true, type: 'reject', data: selectedSample })}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: '#ffffff', border: '1px solid #dc2626', color: '#dc2626', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                <FiXCircle /> Reject Specimen
                            </button>

                            <button
                                onClick={() => handleAcceptDirect(selectedSample)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 22px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                <FiCheckCircle /> Accept & Send to Bench
                            </button>
                        </div>
                    </div>
                )}

                {/* 3. ACCESSIONING QUEUE TABLE */}
                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            Awaiting Accessioning Verification ({queue.length})
                        </h3>
                        <button onClick={loadAccessionData} className="lbd-btn-action">
                            <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh List
                        </button>
                    </div>

                    {queue.length === 0 ? (
                        <div className="lbd-empty-state">
                            <FiCheckCircle style={{ color: '#059669' }} />
                            <h3>Accessioning Queue Clear!</h3>
                            <p>No specimens currently awaiting inbound inspection.</p>
                        </div>
                    ) : (
                        <div className="lbd-table-wrapper">
                            <table className="lbd-table">
                                <thead>
                                    <tr>
                                        <th>Barcode</th>
                                        <th>Order Ref</th>
                                        <th>Patient Details</th>
                                        <th>Specimen Requirements</th>
                                        <th>Investigations</th>
                                        <th>Priority</th>
                                        <th className="lbd-table-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queue.map((s) => (
                                        <tr key={s._id} style={{ background: selectedSample?._id === s._id ? '#eff6ff' : 'transparent' }}>
                                            <td>
                                                <strong style={{ color: '#2563eb', fontFamily: 'monospace' }}>
                                                    {s.barcode}
                                                </strong>
                                            </td>
                                            <td>
                                                <div><strong>{s.orderNumber}</strong></div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>TKN-{s.tokenNumber}</div>
                                            </td>
                                            <td>
                                                <div><strong>{s.patientSnapshot?.name}</strong></div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                    UHID: {s.patientSnapshot?.uhid || 'N/A'}
                                                </div>
                                            </td>
                                            <td>
                                                <div><strong>{s.containerType}</strong></div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{s.specimenType}</div>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '12px' }}>
                                                    {(s.tests || []).map(t => t.testCode).join(', ')}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`lbm-sticker-priority ${(s.priority || 'Routine').toLowerCase()}`}>
                                                    {s.priority}
                                                </span>
                                            </td>
                                            <td className="lbd-table-right">
                                                <div className="lbd-row-actions">
                                                    <button
                                                        onClick={() => setSelectedSample(s)}
                                                        className="lbd-btn-action lbd-btn-action-primary"
                                                        title="Inspect and Verify Tube"
                                                    >
                                                        Inspect
                                                    </button>
                                                    <button
                                                        onClick={() => handleAcceptDirect(s)}
                                                        className="lbd-btn-action lbd-btn-action-success"
                                                        title="Quick Accept"
                                                    >
                                                        <FiCheckCircle /> Accept
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

            {/* MODALS */}
            {actionModal.open && (
                <LabSampleActionModal
                    type={actionModal.type}
                    data={actionModal.data}
                    onClose={() => setActionModal({ open: false, type: '', data: null })}
                    onSuccess={() => {
                        setSelectedSample(null);
                        loadAccessionData();
                    }}
                />
            )}
        </LabLayout>
    );
};

export default LabAccessioningPage;
