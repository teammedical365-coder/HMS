import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabBarcodeModal from './LabBarcodeModal';
import LabSampleActionModal from './LabSampleActionModal';
import {
    FiLayers, FiCheckCircle, FiClock, FiAlertTriangle,
    FiPrinter, FiRefreshCw, FiSearch, FiTag, FiActivity,
    FiInbox, FiExternalLink, FiFilter
} from 'react-icons/fi';

const TUBE_TYPES = [
    { code: 'EDTA', color: '#9333ea', bg: '#faf5ff', border: '#e9d5ff', label: 'EDTA Purple', tests: 'CBC, ESR, HbA1c' },
    { code: 'SERUM', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Plain Red / Gold', tests: 'LFT, KFT, Lipid, Hormones' },
    { code: 'CITRATE', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', label: 'Citrate Blue', tests: 'PT / INR, D-Dimer' },
    { code: 'FLUORIDE', color: '#475569', bg: '#f8fafc', border: '#cbd5e1', label: 'Fluoride Grey', tests: 'Blood Glucose (F/PP)' },
    { code: 'HEPARIN', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Heparin Green', tests: 'Electrolytes, Blood Gas' }
];

const LabCollectionDashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [samples, setSamples] = useState([]);
    const [pendingPlaceholders, setPendingPlaceholders] = useState([]);
    const [stats, setStats] = useState({});

    // Modal States
    const [barcodeModal, setBarcodeModal] = useState({ open: false, data: null });
    const [actionModal, setActionModal] = useState({ open: false, type: '', data: null });

    const loadCollectionQueue = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [queueResult, statsResult] = await Promise.allSettled([
                labAPI.samples.getCollectionQueue({ search, priority: priorityFilter }),
                labAPI.samples.getDashboardStats()
            ]);

            const errors = [];
            if (queueResult.status === 'fulfilled' && queueResult.value?.success) {
                setSamples(queueResult.value.samples || []);
                setPendingPlaceholders(queueResult.value.pendingPlaceholders || []);
            } else if (queueResult.status === 'rejected') {
                errors.push(queueResult.reason?.response?.data?.message || queueResult.reason?.message || 'Queue unavailable');
            }

            if (statsResult.status === 'fulfilled' && statsResult.value?.success) {
                setStats(statsResult.value.stats || {});
            } else if (statsResult.status === 'rejected') {
                errors.push(statsResult.reason?.response?.data?.message || statsResult.reason?.message || 'Stats unavailable');
            }

            if (queueResult.status === 'rejected' && statsResult.status === 'rejected') {
                setError(`Unable to load phlebotomy collection queue (${errors.join('; ')}).`);
            }
        } catch (err) {
            console.error('Failed to load collection queue:', err);
            setError(err?.response?.data?.message || err?.message || 'Unable to load phlebotomy collection queue.');
        } finally {
            setLoading(false);
        }
    }, [search, priorityFilter]);

    useEffect(() => {
        loadCollectionQueue();
    }, [loadCollectionQueue]);

    // Handle Quick Barcode Generation for a Placeholder
    const handleGenerateBarcode = async (item) => {
        try {
            const res = await labAPI.samples.generateBarcode({
                orderId: item.orderId,
                specimenPlaceholderId: item.specimenPlaceholderId
            });
            if (res.success && res.sample) {
                // Fetch label data and open label printer modal
                const lbl = await labAPI.samples.getLabel(res.sample._id);
                if (lbl.success) {
                    setBarcodeModal({
                        open: true,
                        data: { ...lbl.labelData, sampleId: res.sample._id }
                    });
                }
                loadCollectionQueue();
            }
        } catch (err) {
            alert(err.response?.data?.message || err.message || 'Failed to generate barcode');
        }
    };

    // Open Print Label Modal for existing sample
    const handleOpenLabel = async (sample) => {
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
            title="Phlebotomy & Specimen Collection"
            subtitle="Specimen Drawing, Code 128 Barcode Printing, Draw Confirmation & Quality Identification"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. TOP METRICS CARDS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                            <FiInbox />
                        </div>
                        <div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                                {(pendingPlaceholders.length || 0)}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Pending Order Draws</div>
                        </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#faf5ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                            <FiTag />
                        </div>
                        <div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                                {stats.barcodeGenerated || 0}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Barcodes Printed</div>
                        </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                            <FiCheckCircle />
                        </div>
                        <div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669' }}>
                                {stats.collected || 0}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Specimens Collected</div>
                        </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                            <FiAlertTriangle />
                        </div>
                        <div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: '#dc2626' }}>
                                {stats.recollectionRequested || 0}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Recollection Redraws</div>
                        </div>
                    </div>
                </div>

                {/* 2. SPECIMEN TUBE GUIDE BANNER */}
                <div style={{ background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Phlebotomy Tube Color Guide & Mixing Protocols
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                        {TUBE_TYPES.map(t => (
                            <div key={t.code} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '8px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: t.color, fontSize: '12px' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: t.color }}></span>
                                    {t.label}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{t.tests}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. FILTERS & SEARCH BAR */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', background: '#ffffff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
                        <FiSearch style={{ color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Scan or type barcode, patient name, UHID, or order number..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '14px' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                        >
                            <option value="">All Priorities</option>
                            <option value="STAT">STAT Priority</option>
                            <option value="Urgent">Urgent Priority</option>
                            <option value="Routine">Routine</option>
                        </select>
                        <button onClick={loadCollectionQueue} className="lbd-btn-action">
                            <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh Queue
                        </button>
                    </div>
                </div>

                {/* 4. PENDING RECEPTION DRAWS (Ready for Barcode Printing) */}
                {pendingPlaceholders.length > 0 && (
                    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FiTag style={{ color: '#2563eb' }} /> Ready for Barcode Generation ({pendingPlaceholders.length})
                            </h3>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>Confirmed reception orders awaiting physical tube prep</span>
                        </div>

                        <div className="lbd-table-wrapper">
                            <table className="lbd-table">
                                <thead>
                                    <tr>
                                        <th>Order Ref</th>
                                        <th>Token</th>
                                        <th>Patient Demographics</th>
                                        <th>Specimen & Container</th>
                                        <th>Investigations</th>
                                        <th>Priority</th>
                                        <th className="lbd-table-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingPlaceholders.map((ph, idx) => (
                                        <tr key={idx}>
                                            <td><strong style={{ color: '#2563eb' }}>{ph.orderNumber}</strong></td>
                                            <td><span style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: '6px', fontWeight: 700 }}>TKN-{ph.tokenNumber}</span></td>
                                            <td>
                                                <div><strong>{ph.patientSnapshot?.name}</strong></div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>UHID: {ph.patientSnapshot?.uhid || 'N/A'} • {ph.patientSnapshot?.phone}</div>
                                            </td>
                                            <td>
                                                <div><strong>{ph.containerType}</strong></div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{ph.specimenType} ({ph.requiredVolume})</div>
                                            </td>
                                            <td><span style={{ fontSize: '12px', color: '#334155' }}>{(ph.testNames || []).join(', ')}</span></td>
                                            <td>
                                                <span className={`lbm-sticker-priority ${(ph.priority || 'Routine').toLowerCase()}`}>
                                                    {ph.priority}
                                                </span>
                                            </td>
                                            <td className="lbd-table-right">
                                                <button
                                                    onClick={() => handleGenerateBarcode(ph)}
                                                    className="lbd-btn-action lbd-btn-action-primary"
                                                >
                                                    <FiTag /> Generate Barcode
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 5. PHLEBOTOMY SPECIMEN COLLECTION QUEUE */}
                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiLayers style={{ color: '#059669' }} /> Phlebotomy Collection Worklist ({samples.length})
                        </h3>
                    </div>

                    {samples.length === 0 ? (
                        <div className="lbd-empty-state">
                            <FiCheckCircle style={{ color: '#059669' }} />
                            <h3>No Samples in Phlebotomy Queue</h3>
                            <p>All active orders have been collected or no samples match your filter criteria.</p>
                        </div>
                    ) : (
                        <div className="lbd-table-wrapper">
                            <table className="lbd-table">
                                <thead>
                                    <tr>
                                        <th>Barcode</th>
                                        <th>Order / Token</th>
                                        <th>Patient Details</th>
                                        <th>Specimen & Container</th>
                                        <th>Tests Included</th>
                                        <th>Status</th>
                                        <th className="lbd-table-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {samples.map((s) => (
                                        <tr key={s._id}>
                                            <td>
                                                <strong style={{ color: '#2563eb', fontFamily: 'monospace', fontSize: '13px' }}>
                                                    {s.barcode}
                                                </strong>
                                                {s.recollection?.isRecollection && (
                                                    <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 700 }}>
                                                        REPLACEMENT DRAW
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <div><strong>{s.orderNumber}</strong></div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>TKN-{s.tokenNumber}</div>
                                            </td>
                                            <td>
                                                <div><strong>{s.patientSnapshot?.name}</strong></div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                    UHID: {s.patientSnapshot?.uhid || 'N/A'} • {s.patientSnapshot?.phone}
                                                </div>
                                            </td>
                                            <td>
                                                <div><strong>{s.containerType}</strong></div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{s.specimenType} ({s.collectedVolume || s.requiredVolume})</div>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '12px', color: '#334155' }}>
                                                    {(s.tests || []).map(t => t.testCode).join(', ')}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`lbd-badge ${s.status === 'COLLECTED' ? 'lbd-badge-paid' : s.status.includes('RECOLLECTION') ? 'lbd-badge-unpaid' : 'lbd-badge-partial'}`}>
                                                    {s.status.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="lbd-table-right">
                                                <div className="lbd-row-actions">
                                                    {/* Print Barcode Label */}
                                                    <button
                                                        onClick={() => handleOpenLabel(s)}
                                                        className="lbd-btn-action"
                                                        title="Print Barcode Label"
                                                    >
                                                        <FiPrinter /> Label ({s.labelPrintCount || 1})
                                                    </button>

                                                    {/* Confirm Collection Button */}
                                                    {s.status !== 'COLLECTED' && (
                                                        <button
                                                            onClick={() => setActionModal({ open: true, type: 'collect', data: s })}
                                                            className="lbd-btn-action lbd-btn-action-success"
                                                            title="Confirm Physical Specimen Draw"
                                                        >
                                                            <FiCheckCircle /> Confirm Draw
                                                        </button>
                                                    )}

                                                    {/* Track Detail Link */}
                                                    <button
                                                        onClick={() => navigate(`/lab/samples/${s._id}`)}
                                                        className="lbd-btn-action"
                                                        title="View Sample Audit Timeline"
                                                    >
                                                        <FiExternalLink /> Track
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
            {barcodeModal.open && (
                <LabBarcodeModal
                    labelData={barcodeModal.data}
                    onClose={() => setBarcodeModal({ open: false, data: null })}
                    onReprinted={() => loadCollectionQueue()}
                />
            )}

            {actionModal.open && (
                <LabSampleActionModal
                    type={actionModal.type}
                    data={actionModal.data}
                    onClose={() => setActionModal({ open: false, type: '', data: null })}
                    onSuccess={() => loadCollectionQueue()}
                />
            )}
        </LabLayout>
    );
};

export default LabCollectionDashboard;
