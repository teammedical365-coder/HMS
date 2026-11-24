import React, { useState, useEffect, useCallback } from 'react';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabSampleActionModal from './LabSampleActionModal';
import LabBarcodeModal from './LabBarcodeModal';
import {
    FiRotateCcw, FiCheckCircle, FiClock, FiAlertTriangle,
    FiRefreshCw, FiUserCheck, FiTag, FiSearch
} from 'react-icons/fi';

const LabRecollectionsPage = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [recollections, setRecollections] = useState([]);
    const [actionModal, setActionModal] = useState({ open: false, type: '', data: null });
    const [barcodeModal, setBarcodeModal] = useState({ open: false, data: null });

    const loadRecollections = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await labAPI.samples.getRecollections();
            if (res.success) {
                setRecollections(res.recollections || []);
            }
        } catch (err) {
            console.error('Failed to load recollections:', err);
            setError('Unable to load sample recollections queue.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRecollections();
    }, [loadRecollections]);

    const handleOpenBarcode = async (barcode) => {
        setBarcodeModal({
            open: true,
            data: { barcode, hospitalName: 'Medical365 Laboratory', priority: 'STAT', testsSummary: 'Recollection Redraw' }
        });
    };

    return (
        <LabLayout
            title="Specimen Recollections Management"
            subtitle="Rejected Specimen Redraw Worklist, Phlebotomist Assignment & Replacement Tracking"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                            Active Recollection Requests: <strong style={{ color: '#dc2626' }}>{recollections.length}</strong>
                        </span>
                    </div>

                    <button onClick={loadRecollections} className="lbd-btn-action">
                        <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh List
                    </button>
                </div>

                {error && (
                    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <FiAlertTriangle /> {error}
                    </div>
                )}

                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    {recollections.length === 0 ? (
                        <div className="lbd-empty-state">
                            <FiCheckCircle style={{ color: '#059669' }} />
                            <h3>No Active Recollection Requests</h3>
                            <p>All laboratory specimens have passed quality checks without redraws required.</p>
                        </div>
                    ) : (
                        <div className="lbd-table-wrapper">
                            <table className="lbd-table">
                                <thead>
                                    <tr>
                                        <th>Original Barcode</th>
                                        <th>Order Ref</th>
                                        <th>Patient Name</th>
                                        <th>Container & Specimen</th>
                                        <th>Rejection Reason</th>
                                        <th>Status</th>
                                        <th className="lbd-table-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recollections.map((r) => (
                                        <tr key={r._id}>
                                            <td>
                                                <strong style={{ color: '#dc2626', fontFamily: 'monospace' }}>
                                                    {r.originalBarcode}
                                                </strong>
                                                {r.replacementBarcode && (
                                                    <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>
                                                        ➔ Replacement: {r.replacementBarcode}
                                                    </div>
                                                )}
                                            </td>
                                            <td>{r.orderNumber}</td>
                                            <td><strong>{r.patientName}</strong></td>
                                            <td>{r.containerType} ({r.specimenType})</td>
                                            <td>
                                                <span style={{ color: '#b91c1c', fontWeight: 600, fontSize: '12px' }}>
                                                    {r.reason}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`lbd-badge ${r.status === 'RECOLLECTED' ? 'lbd-badge-paid' : 'lbd-badge-unpaid'}`}>
                                                    {r.status}
                                                </span>
                                            </td>
                                            <td className="lbd-table-right">
                                                {r.status !== 'RECOLLECTED' ? (
                                                    <button
                                                        onClick={() => setActionModal({ open: true, type: 'recollect', data: r })}
                                                        className="lbd-btn-action lbd-btn-action-primary"
                                                    >
                                                        <FiRotateCcw /> Confirm Redraw
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleOpenBarcode(r.replacementBarcode)}
                                                        className="lbd-btn-action"
                                                    >
                                                        <FiTag /> Label
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ACTION MODAL */}
            {actionModal.open && (
                <LabSampleActionModal
                    type="collect"
                    data={{ _id: actionModal.data.originalSampleId, barcode: actionModal.data.originalBarcode, patientSnapshot: { name: actionModal.data.patientName }, containerType: actionModal.data.containerType, specimenType: actionModal.data.specimenType }}
                    onClose={() => setActionModal({ open: false, type: '', data: null })}
                    onSuccess={async () => {
                        await labAPI.samples.recollectSample(actionModal.data._id, { collectedVolume: '2-3 mL' });
                        loadRecollections();
                    }}
                />
            )}

            {barcodeModal.open && (
                <LabBarcodeModal
                    labelData={barcodeModal.data}
                    onClose={() => setBarcodeModal({ open: false, data: null })}
                />
            )}
        </LabLayout>
    );
};

export default LabRecollectionsPage;
