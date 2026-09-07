import React, { useState, useEffect, useCallback } from 'react';
import { vialAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import {
    FiBox,
    FiPlus,
    FiEye,
    FiCheckCircle,
    FiAlertCircle,
    FiClock,
    FiTrash2,
    FiRotateCcw,
    FiTruck,
    FiMapPin,
    FiTag,
    FiX,
    FiArrowRight,
    FiRefreshCw
} from 'react-icons/fi';
import './PatientVialsSection.css';
import '../../pages/hospitaladmin/VialManagement.css';

const VIAL_TYPES = [
    'Biological Sample',
    'Specimen',
    'Laboratory Sample',
    'Medication',
    'Reagent',
    'Cryogenic Sample',
    'Other'
];

const PatientVialsSection = ({ patientId, patientData }) => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const roleStr = String(currentUser.role || '').toLowerCase();
    const dynRoleStr = String(currentUser._roleData?.name || '').toLowerCase();
    const isHospitalAdmin = ['hospitaladmin', 'centraladmin', 'superadmin'].includes(roleStr) ||
                            ['hospitaladmin', 'centraladmin', 'superadmin'].includes(dynRoleStr);

    const [vials, setVials] = useState([]);
    const [stats, setStats] = useState({
        totalVials: 0,
        currentlyStored: 0,
        retrievedCount: 0,
        discardedCount: 0
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modals
    const [showStoreModal, setShowStoreModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [activeVial, setActiveVial] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Store Form State
    const [storeForm, setStoreForm] = useState({
        vialId: '',
        vialType: 'Biological Sample',
        description: '',
        receivedAt: new Date().toISOString().slice(0, 16),
        room: '',
        storageUnit: '',
        rack: '',
        box: '',
        position: '',
        notes: '',
        initialStatus: 'Stored'
    });

    const fetchPatientVials = useCallback(async () => {
        if (!patientId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await vialAPI.getPatientVials(patientId);
            if (res.success) {
                setVials(res.vials || []);
                if (res.stats) {
                    setStats(res.stats);
                }
            } else {
                setError(res.message || 'Unable to load vial information.');
            }
        } catch (err) {
            console.error('Error fetching patient vials:', err);
            setError(err?.response?.data?.message || 'Unable to load vial information. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    useEffect(() => {
        fetchPatientVials();
    }, [fetchPatientVials]);

    const handleOpenStore = () => {
        setStoreForm({
            vialId: '',
            vialType: 'Biological Sample',
            description: '',
            receivedAt: new Date().toISOString().slice(0, 16),
            room: '',
            storageUnit: '',
            rack: '',
            box: '',
            position: '',
            notes: '',
            initialStatus: 'Stored'
        });
        setShowStoreModal(true);
    };

    const handleStoreSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const payload = {
                patientId,
                vialId: storeForm.vialId.trim() || undefined,
                vialType: storeForm.vialType,
                description: storeForm.description,
                receivedAt: storeForm.receivedAt,
                initialStatus: storeForm.initialStatus,
                notes: storeForm.notes,
                currentLocation: {
                    room: storeForm.room.trim(),
                    storageUnit: storeForm.storageUnit.trim(),
                    rack: storeForm.rack.trim(),
                    box: storeForm.box.trim(),
                    position: storeForm.position.trim()
                }
            };

            const res = await vialAPI.create(payload);
            if (res.success) {
                toast.success(res.message || 'Vial stored successfully');
                setShowStoreModal(false);
                fetchPatientVials();
            } else {
                toast.error(res.message || 'Failed to store vial');
            }
        } catch (err) {
            console.error('Store vial error:', err);
            toast.error(err?.response?.data?.message || 'Error registering vial');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenDetails = async (vial) => {
        try {
            const res = await vialAPI.getById(vial._id);
            if (res.success && res.vial) {
                setActiveVial(res.vial);
                setShowDetailsModal(true);
            } else {
                toast.error('Failed to load vial details');
            }
        } catch (err) {
            toast.error('Error fetching vial details');
        }
    };

    const formatLocation = (loc) => {
        if (!loc || (!loc.storageUnit && !loc.room)) return null;
        const parts = [];
        if (loc.room) parts.push(`Room: ${loc.room}`);
        if (loc.storageUnit) parts.push(`Unit: ${loc.storageUnit}`);
        if (loc.rack) parts.push(`Rack ${loc.rack}`);
        if (loc.box) parts.push(`Box ${loc.box}`);
        if (loc.position) parts.push(`Pos ${loc.position}`);
        return parts.join(' → ');
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const storedVials = vials.filter((v) => (v.currentStatus || '').toLowerCase() === 'stored');

    return (
        <div className="pvs-container">
            {/* Header */}
            <div className="pvs-header">
                <div className="pvs-header-left">
                    <h2>🧪 Vial & Sample Storage</h2>
                    <p>Biological samples, specimens, and laboratory vials tracked for this patient</p>
                </div>
                {isHospitalAdmin ? (
                    <button className="pvs-btn-store" onClick={handleOpenStore}>
                        <FiPlus /> + Store Vial
                    </button>
                ) : (
                    <div className="pvs-role-badge">
                        <FiMapPin /> Reception & Staff Wayfinding (Read-Only)
                    </div>
                )}
            </div>

            {/* Reception Wayfinding & Patient Guidance Card */}
            {storedVials.length > 0 && (
                <div className="pvs-wayfinding-card">
                    <div className="pvs-wayfinding-header">
                        <div className="pvs-wayfinding-title-row">
                            <span className="pvs-wayfinding-badge">
                                <FiMapPin /> Reception Wayfinding & Patient Guidance
                            </span>
                            <span className="pvs-wayfinding-count">
                                {storedVials.length} Active Stored Sample{storedVials.length > 1 ? 's' : ''}
                            </span>
                        </div>
                        <p className="pvs-wayfinding-desc">
                            Guidance for Receptionist: Use the assigned Room, Freezer Unit, and Intake Time below to direct the patient or clinical attendants.
                        </p>
                    </div>

                    <div className="pvs-wayfinding-grid">
                        {storedVials.map((vial) => {
                            const loc = vial.currentLocation || {};
                            const roomText = loc.room || 'General Storage / Pathology Lab';
                            const unitText = loc.storageUnit || 'Main Freezer';
                            const subSlots = [
                                loc.rack && `Rack ${loc.rack}`,
                                loc.box && `Box ${loc.box}`,
                                loc.position && `Pos ${loc.position}`
                            ].filter(Boolean).join(' • ');

                            return (
                                <div key={vial._id} className="pvs-wayfinding-item">
                                    <div className="pvs-wayfinding-top">
                                        <div className="pvs-vial-tag">
                                            <FiTag /> {vial.vialId}
                                        </div>
                                        <span className="pvs-vial-type">{vial.vialType}</span>
                                        <span className="pvs-received-time">
                                            <FiClock size={12} /> Intake: {formatDateTime(vial.receivedAt)}
                                        </span>
                                    </div>

                                    <div className="pvs-destination-banner">
                                        <div className="pvs-dest-room">
                                            <span className="pvs-dest-label">Assigned Room / Area</span>
                                            <span className="pvs-dest-val-room">🚪 {roomText}</span>
                                        </div>
                                        <div className="pvs-dest-unit">
                                            <span className="pvs-dest-label">Freezer / Storage Unit</span>
                                            <span className="pvs-dest-val-unit">❄️ {unitText}</span>
                                        </div>
                                    </div>

                                    {subSlots && (
                                        <div className="pvs-dest-sub">
                                            <strong>Specific Slot:</strong> {subSlots}
                                        </div>
                                    )}

                                    <div className="pvs-patient-prompt">
                                        💬 <strong>Direction for Patient:</strong> "Please proceed to <u>{roomText}</u>, Storage Unit <u>{unitText}</u>."
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Summary Cards */}
            <div className="pvs-summary-grid">
                <div className="pvs-summary-card">
                    <div className="pvs-summary-icon blue">
                        <FiBox />
                    </div>
                    <div>
                        <div className="pvs-summary-val">{stats.totalVials || 0}</div>
                        <div className="pvs-summary-label">Total Vials</div>
                    </div>
                </div>

                <div className="pvs-summary-card">
                    <div className="pvs-summary-icon emerald">
                        <FiCheckCircle />
                    </div>
                    <div>
                        <div className="pvs-summary-val">{stats.currentlyStored || 0}</div>
                        <div className="pvs-summary-label">Currently Stored</div>
                    </div>
                </div>

                <div className="pvs-summary-card">
                    <div className="pvs-summary-icon amber">
                        <FiTruck />
                    </div>
                    <div>
                        <div className="pvs-summary-val">{stats.retrievedCount || 0}</div>
                        <div className="pvs-summary-label">Retrieved</div>
                    </div>
                </div>

                <div className="pvs-summary-card">
                    <div className="pvs-summary-icon rose">
                        <FiTrash2 />
                    </div>
                    <div>
                        <div className="pvs-summary-val">{stats.discardedCount || 0}</div>
                        <div className="pvs-summary-label">Discarded</div>
                    </div>
                </div>
            </div>

            {/* Table or Empty State */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                    <FiRefreshCw style={{ animation: 'spin 1s linear infinite', fontSize: '24px', color: '#0284c7' }} />
                    <p style={{ marginTop: '10px', fontSize: '14px', color: '#64748b' }}>Loading vials for this patient...</p>
                </div>
            ) : error ? (
                <div className="pvs-empty-state">
                    <FiAlertCircle className="pvs-empty-icon" style={{ color: '#ef4444' }} />
                    <span className="pvs-empty-title" style={{ color: '#ef4444' }}>{error}</span>
                    <button
                        className="vm-btn-secondary"
                        style={{ marginTop: '12px' }}
                        onClick={fetchPatientVials}
                    >
                        Retry
                    </button>
                </div>
            ) : vials.length === 0 ? (
                <div className="pvs-empty-state">
                    <FiBox className="pvs-empty-icon" />
                    <span className="pvs-empty-title">No vials stored for this patient.</span>
                    <span className="pvs-empty-sub">
                        When a vial is registered or stored for this patient, it will immediately appear here with its complete storage location, room, and intake timestamp.
                    </span>
                </div>
            ) : (
                <div className="pvs-table-wrapper">
                    <table className="pvs-table">
                        <thead>
                            <tr>
                                <th>Vial ID</th>
                                <th>Vial Type</th>
                                <th>Intake Date & Time</th>
                                <th>Storage Room & Unit</th>
                                <th>Shelf / Position</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vials.map((vial) => {
                                const loc = vial.currentLocation || {};
                                const statusKey = (vial.currentStatus || 'received').toLowerCase();
                                const hasStorage = loc.room || loc.storageUnit;
                                const subLoc = [
                                    loc.rack && `Rack ${loc.rack}`,
                                    loc.box && `Box ${loc.box}`,
                                    loc.position && `Pos ${loc.position}`
                                ].filter(Boolean).join(' • ');

                                return (
                                    <tr key={vial._id}>
                                        <td>
                                            <span className="vm-vial-id-badge">
                                                <FiTag /> {vial.vialId}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: '600', color: '#334155' }}>
                                                {vial.vialType}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ color: '#1e293b', fontWeight: '500' }}>
                                                {formatDateTime(vial.receivedAt)}
                                            </span>
                                        </td>
                                        <td>
                                            {hasStorage ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <span className="pvs-room-pill">
                                                        🚪 Room: <strong>{loc.room || 'General Storage'}</strong>
                                                    </span>
                                                    <span className="pvs-unit-pill">
                                                        ❄️ Unit: <strong>{loc.storageUnit || 'Main Unit'}</strong>
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="vm-location-empty">Not in storage</span>
                                            )}
                                        </td>
                                        <td>
                                            {hasStorage && subLoc ? (
                                                <span style={{ fontSize: '12px', color: '#475569' }}>
                                                    {subLoc}
                                                </span>
                                            ) : (
                                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`vm-status-badge ${statusKey}`}>
                                                {vial.currentStatus}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="vm-btn-secondary"
                                                    style={{ padding: '6px 12px', fontSize: '12px', gap: '4px' }}
                                                    onClick={() => handleOpenDetails(vial)}
                                                >
                                                    <FiEye /> View Location Details
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

            {/* Modal: Store Vial for this Patient (Hospital Admin only) */}
            {showStoreModal && isHospitalAdmin && (
                <div className="vm-modal-backdrop" onClick={() => !submitting && setShowStoreModal(false)}>
                    <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="vm-modal-header">
                            <h3 className="vm-modal-title">
                                <FiBox color="#0284c7" /> Store Vial for {patientData?.name || 'Patient'}
                            </h3>
                            <button className="vm-modal-close" onClick={() => setShowStoreModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleStoreSubmit} className="vm-modal-form">
                            <div className="vm-modal-body">
                                <div className="vm-patient-selected-card">
                                    <div className="vm-patient-selected-info">
                                        <span className="vm-patient-selected-name">
                                            {patientData?.name}
                                        </span>
                                        <span className="vm-patient-selected-meta">
                                            MRN: {patientData?.mrn || patientData?.patientId || '—'} | Phone: {patientData?.phone || '—'}
                                        </span>
                                    </div>
                                </div>

                                <div className="vm-form-row">
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">
                                            Vial ID <span style={{ fontSize: '11px', color: '#64748b' }}>(Auto-generated if blank)</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Leave blank to auto-generate"
                                            value={storeForm.vialId}
                                            onChange={(e) => setStoreForm({ ...storeForm, vialId: e.target.value })}
                                        />
                                    </div>

                                    <div className="vm-form-group">
                                        <label className="vm-form-label">
                                            Vial Type <span className="req">*</span>
                                        </label>
                                        <select
                                            className="vm-form-select"
                                            value={storeForm.vialType}
                                            onChange={(e) => setStoreForm({ ...storeForm, vialType: e.target.value })}
                                            required
                                        >
                                            {VIAL_TYPES.map((t) => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="vm-form-row">
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">
                                            Received Date & Time <span className="req">*</span>
                                        </label>
                                        <input
                                            type="datetime-local"
                                            className="vm-form-input"
                                            value={storeForm.receivedAt}
                                            onChange={(e) => setStoreForm({ ...storeForm, receivedAt: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="vm-form-group">
                                        <label className="vm-form-label">Sample Description</label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Sample description (Optional)"
                                            value={storeForm.description}
                                            onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Hierarchical Location */}
                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                        <FiMapPin color="#0284c7" /> Hierarchical Storage Location
                                    </span>

                                    <div className="vm-form-row">
                                        <div className="vm-form-group">
                                            <label className="vm-form-label">Room / Storage Area</label>
                                            <input
                                                type="text"
                                                className="vm-form-input"
                                                placeholder="Enter Room (e.g. Room 102, Cryo Lab)"
                                                value={storeForm.room}
                                                onChange={(e) => setStoreForm({ ...storeForm, room: e.target.value })}
                                            />
                                        </div>
                                        <div className="vm-form-group">
                                            <label className="vm-form-label">
                                                Storage Unit / Freezer <span className="req">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                className="vm-form-input"
                                                placeholder="Enter storage unit / freezer"
                                                value={storeForm.storageUnit}
                                                onChange={(e) => setStoreForm({ ...storeForm, storageUnit: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="vm-form-row" style={{ marginTop: '10px' }}>
                                        <div className="vm-form-group">
                                            <label className="vm-form-label">Rack</label>
                                            <input
                                                type="text"
                                                className="vm-form-input"
                                                placeholder="Enter rack (Optional)"
                                                value={storeForm.rack}
                                                onChange={(e) => setStoreForm({ ...storeForm, rack: e.target.value })}
                                            />
                                        </div>
                                        <div className="vm-form-group">
                                            <label className="vm-form-label">Box</label>
                                            <input
                                                type="text"
                                                className="vm-form-input"
                                                placeholder="Enter box (Optional)"
                                                value={storeForm.box}
                                                onChange={(e) => setStoreForm({ ...storeForm, box: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="vm-form-row" style={{ marginTop: '10px' }}>
                                        <div className="vm-form-group">
                                            <label className="vm-form-label">Position / Well</label>
                                            <input
                                                type="text"
                                                className="vm-form-input"
                                                placeholder="Enter position / well (Optional)"
                                                value={storeForm.position}
                                                onChange={(e) => setStoreForm({ ...storeForm, position: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="vm-form-group">
                                    <label className="vm-form-label">Notes</label>
                                    <textarea
                                        className="vm-form-textarea"
                                        placeholder="Intake notes or instructions (Optional)..."
                                        value={storeForm.notes}
                                        onChange={(e) => setStoreForm({ ...storeForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="vm-modal-footer">
                                <button
                                    type="button"
                                    className="vm-btn-secondary"
                                    disabled={submitting}
                                    onClick={() => setShowStoreModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="vm-btn-primary"
                                    disabled={submitting}
                                >
                                    {submitting ? 'Registering...' : 'Store Vial'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: View Details */}
            {showDetailsModal && activeVial && (
                <div className="vm-modal-backdrop" onClick={() => setShowDetailsModal(false)}>
                    <div className="vm-modal modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="vm-modal-header">
                            <h3 className="vm-modal-title">
                                🧪 Vial Details: {activeVial.vialId}
                            </h3>
                            <button className="vm-modal-close" onClick={() => setShowDetailsModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <div className="vm-modal-body">
                            {/* Prominent Wayfinding Banner inside Details Modal */}
                            {activeVial.currentLocation && (activeVial.currentLocation.room || activeVial.currentLocation.storageUnit) && (
                                <div className="pvs-details-wayfinding-box">
                                    <div className="pvs-dwb-title">
                                        <FiMapPin color="#0284c7" /> Patient Wayfinding & Storage Location
                                    </div>
                                    <div className="pvs-dwb-grid">
                                        <div className="pvs-dwb-item">
                                            <span className="pvs-dwb-label">Assigned Room:</span>
                                            <span className="pvs-dwb-val-room">🚪 {activeVial.currentLocation.room || 'General Storage / Lab'}</span>
                                        </div>
                                        <div className="pvs-dwb-item">
                                            <span className="pvs-dwb-label">Freezer / Unit:</span>
                                            <span className="pvs-dwb-val-unit">❄️ {activeVial.currentLocation.storageUnit || 'Main Freezer'}</span>
                                        </div>
                                        <div className="pvs-dwb-item">
                                            <span className="pvs-dwb-label">Intake Date & Time:</span>
                                            <span className="pvs-dwb-val">🕒 {formatDateTime(activeVial.receivedAt)}</span>
                                        </div>
                                        <div className="pvs-dwb-item">
                                            <span className="pvs-dwb-label">Detailed Slot:</span>
                                            <span className="pvs-dwb-val">
                                                {[
                                                    activeVial.currentLocation.rack && `Rack ${activeVial.currentLocation.rack}`,
                                                    activeVial.currentLocation.box && `Box ${activeVial.currentLocation.box}`,
                                                    activeVial.currentLocation.position && `Pos ${activeVial.currentLocation.position}`
                                                ].filter(Boolean).join(' • ') || 'Standard slot'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="pvs-dwb-footer">
                                        💬 <strong>Direction to Patient:</strong> "Your sample is kept in <u>{activeVial.currentLocation.room || 'Storage Area'}</u>, Storage Unit <u>{activeVial.currentLocation.storageUnit || 'Freezer'}</u>."
                                    </div>
                                </div>
                            )}

                            <div className="vm-details-grid">
                                <div className="vm-detail-item">
                                    <span className="vm-detail-label">Patient Name</span>
                                    <span className="vm-detail-val">{patientData?.name || activeVial.patientId?.name || '—'}</span>
                                </div>

                                <div className="vm-detail-item">
                                    <span className="vm-detail-label">MRN / Patient ID</span>
                                    <span className="vm-detail-val">{patientData?.mrn || patientData?.patientId || activeVial.patientId?.mrn || '—'}</span>
                                </div>

                                <div className="vm-detail-item">
                                    <span className="vm-detail-label">Vial Type</span>
                                    <span className="vm-detail-val">{activeVial.vialType}</span>
                                </div>

                                <div className="vm-detail-item">
                                    <span className="vm-detail-label">Current Status</span>
                                    <div>
                                        <span className={`vm-status-badge ${(activeVial.currentStatus || 'received').toLowerCase()}`}>
                                            {activeVial.currentStatus}
                                        </span>
                                    </div>
                                </div>

                                <div className="vm-detail-item">
                                    <span className="vm-detail-label">Current Storage Location</span>
                                    <span className="vm-detail-val">
                                        {formatLocation(activeVial.currentLocation) || 'Not in storage'}
                                    </span>
                                </div>

                                <div className="vm-detail-item">
                                    <span className="vm-detail-label">Received Date & Time</span>
                                    <span className="vm-detail-val">{formatDateTime(activeVial.receivedAt)}</span>
                                </div>

                                <div className="vm-detail-item" style={{ gridColumn: 'span 2' }}>
                                    <span className="vm-detail-label">Description</span>
                                    <span className="vm-detail-val" style={{ fontWeight: 400 }}>
                                        {activeVial.description || 'No description'}
                                    </span>
                                </div>

                                {activeVial.notes && (
                                    <div className="vm-detail-item" style={{ gridColumn: 'span 2' }}>
                                        <span className="vm-detail-label">Notes</span>
                                        <span className="vm-detail-val" style={{ fontWeight: 400 }}>
                                            {activeVial.notes}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Movement & Audit History */}
                            <div style={{ marginTop: '10px' }}>
                                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FiClock color="#0284c7" /> Movement & Audit History
                                </h4>

                                {(!activeVial.auditHistory || activeVial.auditHistory.length === 0) ? (
                                    <div style={{ color: '#94a3b8', fontSize: '13px' }}>No audit history recorded.</div>
                                ) : (
                                    <div className="vm-timeline">
                                        {activeVial.auditHistory.map((item, idx) => {
                                            const prevLoc = formatLocation(item.previousLocation);
                                            const newLoc = formatLocation(item.newLocation);

                                            return (
                                                <div key={item._id || idx} className="vm-timeline-item">
                                                    <div className="vm-timeline-node">
                                                        <FiCheckCircle />
                                                    </div>
                                                    <div className="vm-timeline-header">
                                                        <span className="vm-timeline-action">{item.action}</span>
                                                        <span className="vm-timeline-date">
                                                            {formatDateTime(item.timestamp)}
                                                        </span>
                                                        <span className="vm-timeline-user">
                                                            By: {item.performedByName || 'Hospital Admin'}
                                                        </span>
                                                    </div>

                                                    {(item.reason || prevLoc || newLoc || item.notes) && (
                                                        <div className="vm-timeline-body">
                                                            {item.reason && (
                                                                <div>
                                                                    <strong>Reason:</strong> {item.reason}
                                                                </div>
                                                            )}
                                                            {prevLoc && newLoc && (
                                                                <div className="vm-timeline-location-diff">
                                                                    <span>{prevLoc}</span>
                                                                    <FiArrowRight color="#0284c7" />
                                                                    <span style={{ color: '#0284c7' }}>{newLoc}</span>
                                                                </div>
                                                            )}
                                                            {!prevLoc && newLoc && (
                                                                <div style={{ marginTop: '2px', fontSize: '12px' }}>
                                                                    <strong>Location:</strong> {newLoc}
                                                                </div>
                                                            )}
                                                            {item.notes && (
                                                                <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                                                                    <em>"{item.notes}"</em>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="vm-modal-footer">
                            <button
                                type="button"
                                className="vm-btn-secondary"
                                onClick={() => setShowDetailsModal(false)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientVialsSection;
