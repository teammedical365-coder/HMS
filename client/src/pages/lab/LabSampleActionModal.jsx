import React, { useState, useEffect } from 'react';
import { labAPI } from '../../utils/api';
import './LabBillingModal.css'; // Reuses modal layout styles
import {
    FiX, FiCheckCircle, FiAlertTriangle, FiLayers,
    FiCpu, FiRotateCcw, FiSend, FiPauseCircle
} from 'react-icons/fi';

const LabSampleActionModal = ({
    type, // 'collect', 'accept', 'reject', 'process_start', 'process_hold', 'transfer'
    data, // sample or transfer payload
    onClose,
    onSuccess
}) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Collection State
    const [collectedVolume, setCollectedVolume] = useState('2-3 mL');
    const [collectionNotes, setCollectionNotes] = useState('');

    // Acceptance State
    const [sampleCondition, setSampleCondition] = useState('Normal');
    const [accessionNotes, setAccessionNotes] = useState('');

    // Rejection State
    const [rejectionReason, setRejectionReason] = useState('Hemolyzed sample');
    const [customReason, setCustomReason] = useState('');
    const [rejectionNotes, setRejectionNotes] = useState('');
    const [requestRecollection, setRequestRecollection] = useState(true);

    // Processing State
    const [analyzerRef, setAnalyzerRef] = useState('Auto-Hematology Analyzer / Bench 1');
    const [processingNotes, setProcessingNotes] = useState('');
    const [holdReason, setHoldReason] = useState('Specimen clot / re-centrifugation needed');

    // Transfer State
    const [locations, setLocations] = useState([]);
    const [destLocationId, setDestLocationId] = useState('');
    const [courierName, setCourierName] = useState('Hospital Internal Dispatch Courier');
    const [transportRef, setTransportRef] = useState('');

    useEffect(() => {
        if (type === 'transfer') {
            labAPI.getLocations('active')
                .then(res => {
                    if (res.success && res.locations) {
                        setLocations(res.locations);
                        const processingLab = res.locations.find(l => l.isProcessingLab) || res.locations[0];
                        if (processingLab) setDestLocationId(processingLab._id);
                    }
                })
                .catch(() => {});
        }
    }, [type]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (type === 'collect') {
                const res = await labAPI.samples.collectSample(data._id, {
                    collectedVolume,
                    collectionNotes
                });
                if (res.success) {
                    onSuccess(res);
                    onClose();
                } else {
                    setError(res.message || 'Collection failed');
                }
            } else if (type === 'accept') {
                const res = await labAPI.samples.acceptSample(data._id, {
                    sampleCondition,
                    accessionNotes
                });
                if (res.success) {
                    onSuccess(res);
                    onClose();
                } else {
                    setError(res.message || 'Acceptance failed');
                }
            } else if (type === 'reject') {
                const finalReason = rejectionReason === 'Other' ? customReason : rejectionReason;
                if (!finalReason.trim()) {
                    setError('Mandatory rejection reason is required.');
                    setLoading(false);
                    return;
                }
                const res = await labAPI.samples.rejectSample(data._id, {
                    reason: finalReason,
                    notes: rejectionNotes,
                    requestRecollection
                });
                if (res.success) {
                    onSuccess(res);
                    onClose();
                } else {
                    setError(res.message || 'Rejection failed');
                }
            } else if (type === 'process_start') {
                const res = await labAPI.samples.startProcessing(data._id, {
                    analyzerReference: analyzerRef,
                    notes: processingNotes
                });
                if (res.success) {
                    onSuccess(res);
                    onClose();
                } else {
                    setError(res.message || 'Failed to start processing');
                }
            } else if (type === 'process_hold') {
                const res = await labAPI.samples.holdProcessing(data._id, {
                    holdReason
                });
                if (res.success) {
                    onSuccess(res);
                    onClose();
                } else {
                    setError(res.message || 'Failed to hold processing');
                }
            } else if (type === 'transfer') {
                if (!destLocationId) {
                    setError('Please select destination laboratory location.');
                    setLoading(false);
                    return;
                }
                const res = await labAPI.samples.createTransfer({
                    sourceLocationId: data.sourceLocationId,
                    destinationLocationId: destLocationId,
                    sampleIds: data.sampleIds || [data._id],
                    courierName,
                    transportReference: transportRef,
                    notes: processingNotes
                });
                if (res.success) {
                    onSuccess(res);
                    onClose();
                } else {
                    setError(res.message || 'Transfer failed');
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Action failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lbm-overlay">
            <div className="lbm-card">
                <div className="lbm-hdr">
                    <div className="lbm-hdr-title">
                        {type === 'collect' && <><FiLayers /> Confirm Specimen Draw & Collection</>}
                        {type === 'accept' && <><FiCheckCircle /> Accept Sample into Laboratory</>}
                        {type === 'reject' && <><FiRotateCcw /> Reject Specimen & Initiate Quality Protocol</>}
                        {type === 'process_start' && <><FiCpu /> Start Technical Bench Testing</>}
                        {type === 'process_hold' && <><FiPauseCircle /> Put Specimen Testing on Hold</>}
                        {type === 'transfer' && <><FiSend /> Dispatch Multi-Location Sample Batch</>}
                    </div>
                    <button onClick={onClose} className="lbm-btn-close">
                        <FiX />
                    </button>
                </div>

                {error && (
                    <div style={{ margin: '16px 24px 0', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <FiAlertTriangle /> {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="lbm-body">
                        {/* Sample Header Context */}
                        {data?.barcode && (
                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                <div>
                                    <span>Barcode: <strong style={{ color: '#2563eb' }}>{data.barcode}</strong></span>
                                    <span style={{ marginLeft: '12px' }}>Patient: <strong>{data.patientSnapshot?.name}</strong></span>
                                </div>
                                <div>
                                    <span>{data.containerType} ({data.specimenType})</span>
                                </div>
                            </div>
                        )}

                        {/* 1. COLLECT SAMPLE */}
                        {type === 'collect' && (
                            <>
                                <div className="lbm-form-group">
                                    <label className="lbm-label">Collected Volume (mL)*</label>
                                    <input
                                        type="text"
                                        value={collectedVolume}
                                        onChange={(e) => setCollectedVolume(e.target.value)}
                                        placeholder="e.g. 2-3 mL, 5 mL"
                                        className="lbm-input"
                                        required
                                    />
                                </div>
                                <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                    <label className="lbm-label">Phlebotomy Draw Notes (Vein site, difficulties, fasting verification)</label>
                                    <textarea
                                        value={collectionNotes}
                                        onChange={(e) => setCollectionNotes(e.target.value)}
                                        placeholder="e.g. Left antecubital fossa draw, fasting confirmed by patient..."
                                        rows="2"
                                        className="lbm-textarea"
                                    />
                                </div>
                            </>
                        )}

                        {/* 2. ACCEPT SAMPLE */}
                        {type === 'accept' && (
                            <>
                                <div className="lbm-form-group">
                                    <label className="lbm-label">Visual Specimen Quality Inspection*</label>
                                    <select
                                        value={sampleCondition}
                                        onChange={(e) => setSampleCondition(e.target.value)}
                                        className="lbm-select"
                                    >
                                        <option value="Normal">Normal (Clear, Adequate Volume, Right Container)</option>
                                        <option value="Hemolyzed">Slightly Hemolyzed (Acceptable for non-potassium assays)</option>
                                        <option value="Lipemic">Lipemic (Turbid serum/plasma)</option>
                                        <option value="Icteric">Icteric (Jaundiced specimen)</option>
                                    </select>
                                </div>
                                <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                    <label className="lbm-label">Accessioner Remarks (Optional)</label>
                                    <textarea
                                        value={accessionNotes}
                                        onChange={(e) => setAccessionNotes(e.target.value)}
                                        placeholder="Remarks on tube inspection, centrifugation, or temperature check..."
                                        rows="2"
                                        className="lbm-textarea"
                                    />
                                </div>
                            </>
                        )}

                        {/* 3. REJECT SAMPLE */}
                        {type === 'reject' && (
                            <>
                                <div className="lbm-form-group">
                                    <label className="lbm-label">Mandatory Quality Rejection Reason*</label>
                                    <select
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        className="lbm-select"
                                    >
                                        <option value="Hemolyzed sample">Hemolyzed sample</option>
                                        <option value="Clotted sample">Clotted sample (Micro-clots in EDTA)</option>
                                        <option value="Insufficient volume">Insufficient sample volume (QNS)</option>
                                        <option value="Incorrect container">Incorrect container type used</option>
                                        <option value="Leaking container">Leaking / Damaged container</option>
                                        <option value="Unlabelled sample">Unlabelled / Mismatched label</option>
                                        <option value="Patient identification mismatch">Patient identification mismatch</option>
                                        <option value="Expired or degraded sample">Expired or degraded sample</option>
                                        <option value="Other">Other Specific Reason</option>
                                    </select>
                                </div>

                                {rejectionReason === 'Other' && (
                                    <div className="lbm-form-group" style={{ marginTop: '8px' }}>
                                        <label className="lbm-label">Specify Rejection Reason*</label>
                                        <input
                                            type="text"
                                            value={customReason}
                                            onChange={(e) => setCustomReason(e.target.value)}
                                            placeholder="Enter specific clinical reason"
                                            className="lbm-input"
                                            required
                                        />
                                    </div>
                                )}

                                <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                    <label className="lbm-label">Laboratory Technical Rejection Notes</label>
                                    <textarea
                                        value={rejectionNotes}
                                        onChange={(e) => setRejectionNotes(e.target.value)}
                                        placeholder="Detailed description of defect for phlebotomy supervisor..."
                                        rows="2"
                                        className="lbm-textarea"
                                    />
                                </div>

                                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="recollectionCheck"
                                        checked={requestRecollection}
                                        onChange={(e) => setRequestRecollection(e.target.checked)}
                                    />
                                    <label htmlFor="recollectionCheck" style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                                        Automatically initiate patient sample recollection request
                                    </label>
                                </div>
                            </>
                        )}

                        {/* 4. START PROCESSING */}
                        {type === 'process_start' && (
                            <>
                                <div className="lbm-form-group">
                                    <label className="lbm-label">Automated Analyzer / Bench Station Reference*</label>
                                    <input
                                        type="text"
                                        value={analyzerRef}
                                        onChange={(e) => setAnalyzerRef(e.target.value)}
                                        className="lbm-input"
                                        required
                                    />
                                </div>
                                <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                    <label className="lbm-label">Bench Testing Notes (Calibrators, reagent batch)</label>
                                    <textarea
                                        value={processingNotes}
                                        onChange={(e) => setProcessingNotes(e.target.value)}
                                        placeholder="Optional notes..."
                                        rows="2"
                                        className="lbm-textarea"
                                    />
                                </div>
                            </>
                        )}

                        {/* 5. HOLD PROCESSING */}
                        {type === 'process_hold' && (
                            <div className="lbm-form-group">
                                <label className="lbm-label">Reason for Placing Testing on Hold*</label>
                                <textarea
                                    value={holdReason}
                                    onChange={(e) => setHoldReason(e.target.value)}
                                    placeholder="e.g. Analyzer calibrator rerun, patient serum dilution needed..."
                                    rows="3"
                                    className="lbm-textarea"
                                    required
                                />
                            </div>
                        )}

                        {/* 6. SAMPLE TRANSFER */}
                        {type === 'transfer' && (
                            <>
                                <div className="lbm-form-group">
                                    <label className="lbm-label">Destination Processing Laboratory*</label>
                                    <select
                                        value={destLocationId}
                                        onChange={(e) => setDestLocationId(e.target.value)}
                                        className="lbm-select"
                                        required
                                    >
                                        <option value="">Select Destination Lab...</option>
                                        {locations.map(loc => (
                                            <option key={loc._id} value={loc._id}>
                                                {loc.locationName} ({loc.locationType} - {loc.locationCode})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                    <label className="lbm-label">Courier Service / Logistics Courier Name</label>
                                    <input
                                        type="text"
                                        value={courierName}
                                        onChange={(e) => setCourierName(e.target.value)}
                                        className="lbm-input"
                                    />
                                </div>

                                <div className="lbm-form-group" style={{ marginTop: '12px' }}>
                                    <label className="lbm-label">Cold-Chain Box / Transport Reference #</label>
                                    <input
                                        type="text"
                                        value={transportRef}
                                        onChange={(e) => setTransportRef(e.target.value)}
                                        placeholder="e.g. ICE-BOX-04 / LOG-998"
                                        className="lbm-input"
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <div className="lbm-footer">
                        <button type="button" onClick={onClose} className="lbm-btn-secondary">
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="lbm-btn-primary"
                            style={{ background: type === 'reject' ? '#dc2626' : '#2563eb' }}
                        >
                            {loading ? 'Processing...' : type === 'collect' ? 'Confirm Collection' : type === 'accept' ? 'Accept Sample' : type === 'reject' ? 'Confirm Rejection' : type === 'process_start' ? 'Start Testing' : type === 'process_hold' ? 'Put on Hold' : 'Dispatch Transfer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LabSampleActionModal;
