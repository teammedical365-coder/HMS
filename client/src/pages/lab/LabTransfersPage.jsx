import React, { useState, useEffect, useCallback } from 'react';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabSampleActionModal from './LabSampleActionModal';
import {
    FiSend, FiCheckCircle, FiClock, FiAlertTriangle,
    FiRefreshCw, FiMapPin, FiTruck, FiPlusCircle, FiBox
} from 'react-icons/fi';

const LabTransfersPage = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [transfers, setTransfers] = useState([]);
    const [actionModal, setActionModal] = useState({ open: false, type: '', data: null });

    const loadTransfers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await labAPI.samples.getTransfers();
            if (res.success) {
                setTransfers(res.transfers || []);
            }
        } catch (err) {
            console.error('Failed to load transfers:', err);
            setError('Unable to load sample transfers manifest.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTransfers();
    }, [loadTransfers]);

    const handleReceiveTransfer = async (transfer) => {
        try {
            const res = await labAPI.samples.receiveTransfer(transfer._id);
            if (res.success) {
                loadTransfers();
            }
        } catch (err) {
            alert(err.response?.data?.message || err.message || 'Failed to receive transfer');
        }
    };

    return (
        <LabLayout
            title="Multi-Location Specimen Transfers"
            subtitle="Cold-Chain Transport Manifest, Branch Dispatches & Processing Laboratory Receiving"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                            Transfer Batches: <strong>{transfers.length}</strong>
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={loadTransfers} className="lbd-btn-action">
                            <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>

                {error && (
                    <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <FiAlertTriangle /> {error}
                    </div>
                )}

                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    {transfers.length === 0 ? (
                        <div className="lbd-empty-state">
                            <FiBox />
                            <h3>No Active Sample Transfers</h3>
                            <p>No multi-location transport batches have been dispatched.</p>
                        </div>
                    ) : (
                        <div className="lbd-table-wrapper">
                            <table className="lbd-table">
                                <thead>
                                    <tr>
                                        <th>Transfer No</th>
                                        <th>Route (Source ➔ Destination)</th>
                                        <th>Manifest Tubes</th>
                                        <th>Logistics / Courier</th>
                                        <th>Dispatched By</th>
                                        <th>Status</th>
                                        <th className="lbd-table-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transfers.map((t) => (
                                        <tr key={t._id}>
                                            <td>
                                                <strong style={{ color: '#2563eb', fontFamily: 'monospace' }}>
                                                    {t.transferNumber}
                                                </strong>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                    {new Date(t.dispatchedAt).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <strong>{t.sourceLocationName || 'Collection Centre'}</strong>
                                                    <span>➔</span>
                                                    <strong style={{ color: '#059669' }}>{t.destinationLocationName || 'Central Processing Lab'}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ padding: '3px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '6px', fontWeight: 700, fontSize: '12px' }}>
                                                    {t.samples?.length || 0} Tubes
                                                </span>
                                            </td>
                                            <td>
                                                <div>{t.courierName || 'Internal Logistics'}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>Ref: {t.transportReference || 'Cold-Box'}</div>
                                            </td>
                                            <td>
                                                <div>{t.dispatchedByName || 'Staff'}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{new Date(t.dispatchedAt).toLocaleTimeString()}</div>
                                            </td>
                                            <td>
                                                <span className={`lbd-badge ${t.status === 'RECEIVED' ? 'lbd-badge-paid' : 'lbd-badge-partial'}`}>
                                                    {t.status}
                                                </span>
                                            </td>
                                            <td className="lbd-table-right">
                                                {t.status !== 'RECEIVED' ? (
                                                    <button
                                                        onClick={() => handleReceiveTransfer(t)}
                                                        className="lbd-btn-action lbd-btn-action-success"
                                                    >
                                                        <FiCheckCircle /> Receive at Lab
                                                    </button>
                                                ) : (
                                                    <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>
                                                        ✓ Received ({new Date(t.receivedAt).toLocaleTimeString()})
                                                    </span>
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
        </LabLayout>
    );
};

export default LabTransfersPage;
