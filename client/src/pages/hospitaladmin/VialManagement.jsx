import React, { useState, useEffect, useCallback, useRef } from 'react';
import { vialAPI, patientAPI } from '../../utils/api';
import Pagination from '../../components/Pagination';
import toast from 'react-hot-toast';
import {
    FiBox,
    FiPlus,
    FiSearch,
    FiFilter,
    FiRefreshCw,
    FiEye,
    FiTruck,
    FiRotateCcw,
    FiTrash2,
    FiMapPin,
    FiUser,
    FiClock,
    FiCheckCircle,
    FiAlertCircle,
    FiX,
    FiCalendar,
    FiShield,
    FiTag,
    FiFileText,
    FiArrowRight
} from 'react-icons/fi';
import './VialManagement.css';

const VIAL_TYPES = [
    'Biological Sample',
    'Specimen',
    'Laboratory Sample',
    'Medication',
    'Reagent',
    'Cryogenic Sample',
    'Other'
];

const STATUS_OPTIONS = ['All', 'Received', 'Stored', 'Moved', 'Retrieved', 'Returned', 'Discarded'];

const VialManagement = () => {
    // Data State
    const [vials, setVials] = useState([]);
    const [stats, setStats] = useState({
        totalVials: 0,
        currentlyStored: 0,
        retrievedCount: 0,
        discardedCount: 0
    });
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Pagination & Filter State
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalRecords: 0,
        pageSize: 10
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('All');
    const [selectedType, setSelectedType] = useState('All');
    const [storageUnitFilter, setStorageUnitFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Modals State
    const [showStoreModal, setShowStoreModal] = useState(false);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [showRetrieveModal, setShowRetrieveModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [showDiscardModal, setShowDiscardModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    const [activeVial, setActiveVial] = useState(null);
    const [actionSubmitting, setActionSubmitting] = useState(false);

    // Patient Search in Store Modal
    const [patientQuery, setPatientQuery] = useState('');
    const [patientResults, setPatientResults] = useState([]);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [searchingPatients, setSearchingPatients] = useState(false);
    const [showPatientDropdown, setShowPatientDropdown] = useState(false);
    const searchDebounceRef = useRef(null);
    const patientSearchContainerRef = useRef(null);

    // Close patient dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (patientSearchContainerRef.current && !patientSearchContainerRef.current.contains(e.target)) {
                setShowPatientDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Store Vial Form State (clean empty initial state - no dummy data)
    const [storeForm, setStoreForm] = useState({
        vialId: '',
        vialType: '',
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

    // Move Form State
    const [moveForm, setMoveForm] = useState({
        room: '',
        storageUnit: '',
        rack: '',
        box: '',
        position: '',
        reason: '',
        notes: ''
    });

    // Retrieve Form State
    const [retrieveForm, setRetrieveForm] = useState({
        reason: '',
        retrievalDate: new Date().toISOString().slice(0, 16),
        notes: ''
    });

    // Return Form State
    const [returnForm, setReturnForm] = useState({
        room: '',
        storageUnit: '',
        rack: '',
        box: '',
        position: '',
        returnDate: new Date().toISOString().slice(0, 16),
        notes: ''
    });

    // Discard Form State
    const [discardForm, setDiscardForm] = useState({
        discardReason: '',
        discardDate: new Date().toISOString().slice(0, 16),
        notes: ''
    });

    // Fetch Stats
    const fetchStats = async () => {
        setStatsLoading(true);
        try {
            const res = await vialAPI.getStats();
            if (res.success && res.stats) {
                setStats(res.stats);
            }
        } catch (err) {
            console.error('Failed to load vial stats:', err);
        } finally {
            setStatsLoading(false);
        }
    };

    // Fetch Vials
    const fetchVials = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                page,
                limit: 10
            };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (selectedStatus !== 'All') params.status = selectedStatus;
            if (selectedType !== 'All') params.vialType = selectedType;
            if (storageUnitFilter.trim()) params.storageUnit = storageUnitFilter.trim();
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;

            const res = await vialAPI.getAll(params);
            if (res.success) {
                setVials(res.vials || []);
                if (res.pagination) {
                    setPagination(res.pagination);
                }
            } else {
                setError(res.message || 'Unable to load vial information.');
            }
        } catch (err) {
            console.error('Error fetching vials:', err);
            setError(err?.response?.data?.message || 'Unable to load vial information. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [page, searchTerm, selectedStatus, selectedType, storageUnitFilter, startDate, endDate]);

    useEffect(() => {
        fetchStats();
    }, []);

    useEffect(() => {
        fetchVials();
    }, [fetchVials]);

    // Patient live search — triggers ONLY when user types a name or search term
    const handlePatientSearchChange = (e) => {
        const query = e.target.value;
        setPatientQuery(query);

        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }

        const trimmed = query.trim();
        if (!trimmed || trimmed.length < 1) {
            setPatientResults([]);
            setShowPatientDropdown(false);
            setSearchingPatients(false);
            return;
        }

        setShowPatientDropdown(true);
        searchDebounceRef.current = setTimeout(async () => {
            setSearchingPatients(true);
            try {
                const res = await patientAPI.search(trimmed);
                if (res.success && Array.isArray(res.data)) {
                    setPatientResults(res.data);
                } else {
                    setPatientResults([]);
                }
            } catch (err) {
                console.error('Patient search error:', err);
                setPatientResults([]);
            } finally {
                setSearchingPatients(false);
            }
        }, 250);
    };

    const handleSelectPatient = (patient) => {
        setSelectedPatient(patient);
        setPatientResults([]);
        setPatientQuery('');
        setShowPatientDropdown(false);
    };

    // Reset Filters
    const handleResetFilters = () => {
        setSearchTerm('');
        setSelectedStatus('All');
        setSelectedType('All');
        setStorageUnitFilter('');
        setStartDate('');
        setEndDate('');
        setPage(1);
    };

    // Open Store Modal
    const handleOpenStoreModal = () => {
        setSelectedPatient(null);
        setPatientQuery('');
        setPatientResults([]);
        setShowPatientDropdown(false);
        setStoreForm({
            vialId: '',
            vialType: '',
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

    // Submit Store Vial
    const handleStoreSubmit = async (e) => {
        e.preventDefault();
        if (!selectedPatient) {
            toast.error('Please search and select a patient first');
            return;
        }
        if (!storeForm.vialType) {
            toast.error('Please select a Vial Type');
            return;
        }
        if (!storeForm.storageUnit || !storeForm.storageUnit.trim()) {
            toast.error('Storage Unit / Freezer is mandatory');
            return;
        }

        setActionSubmitting(true);
        try {
            const payload = {
                patientId: selectedPatient._id,
                vialId: storeForm.vialId.trim() || undefined,
                vialType: storeForm.vialType,
                description: storeForm.description.trim(),
                receivedAt: storeForm.receivedAt,
                initialStatus: storeForm.initialStatus,
                notes: storeForm.notes.trim(),
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
                fetchVials();
                fetchStats();
            } else {
                toast.error(res.message || 'Failed to register vial');
            }
        } catch (err) {
            console.error('Store error:', err);
            toast.error(err?.response?.data?.message || err?.message || 'Error registering vial');
        } finally {
            setActionSubmitting(false);
        }
    };

    // Open Move Modal
    const handleOpenMove = (vial) => {
        setActiveVial(vial);
        const loc = vial.currentLocation || {};
        setMoveForm({
            room: loc.room || '',
            storageUnit: loc.storageUnit || '',
            rack: loc.rack || '',
            box: loc.box || '',
            position: loc.position || '',
            reason: '',
            notes: ''
        });
        setShowMoveModal(true);
    };

    const handleMoveSubmit = async (e) => {
        e.preventDefault();
        if (!moveForm.storageUnit.trim()) {
            toast.error('Destination Storage Unit is required');
            return;
        }

        setActionSubmitting(true);
        try {
            const res = await vialAPI.move(activeVial._id, moveForm);
            if (res.success) {
                toast.success(res.message || 'Vial moved successfully');
                setShowMoveModal(false);
                fetchVials();
                fetchStats();
            } else {
                toast.error(res.message || 'Failed to move vial');
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Error moving vial');
        } finally {
            setActionSubmitting(false);
        }
    };

    // Open Retrieve Modal
    const handleOpenRetrieve = (vial) => {
        setActiveVial(vial);
        setRetrieveForm({
            reason: '',
            retrievalDate: new Date().toISOString().slice(0, 16),
            notes: ''
        });
        setShowRetrieveModal(true);
    };

    const handleRetrieveSubmit = async (e) => {
        e.preventDefault();
        if (!retrieveForm.reason.trim()) {
            toast.error('Reason for retrieval is required');
            return;
        }

        setActionSubmitting(true);
        try {
            const res = await vialAPI.retrieve(activeVial._id, retrieveForm);
            if (res.success) {
                toast.success(res.message || 'Vial retrieved successfully');
                setShowRetrieveModal(false);
                fetchVials();
                fetchStats();
            } else {
                toast.error(res.message || 'Failed to retrieve vial');
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Error retrieving vial');
        } finally {
            setActionSubmitting(false);
        }
    };

    // Open Return Modal
    const handleOpenReturn = (vial) => {
        setActiveVial(vial);
        // Look up last stored location from history if available
        let lastLoc = {};
        if (Array.isArray(vial.auditHistory)) {
            const lastStoredOrMoved = [...vial.auditHistory].reverse().find(a => a.previousLocation && a.previousLocation.storageUnit);
            if (lastStoredOrMoved) {
                lastLoc = lastStoredOrMoved.previousLocation;
            }
        }
        setReturnForm({
            room: lastLoc.room || '',
            storageUnit: lastLoc.storageUnit || '',
            rack: lastLoc.rack || '',
            box: lastLoc.box || '',
            position: lastLoc.position || '',
            returnDate: new Date().toISOString().slice(0, 16),
            notes: ''
        });
        setShowReturnModal(true);
    };

    const handleReturnSubmit = async (e) => {
        e.preventDefault();
        if (!returnForm.storageUnit.trim()) {
            toast.error('Storage Unit is required to return vial to storage');
            return;
        }

        setActionSubmitting(true);
        try {
            const res = await vialAPI.returnToStorage(activeVial._id, returnForm);
            if (res.success) {
                toast.success(res.message || 'Vial returned to storage');
                setShowReturnModal(false);
                fetchVials();
                fetchStats();
            } else {
                toast.error(res.message || 'Failed to return vial');
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Error returning vial');
        } finally {
            setActionSubmitting(false);
        }
    };

    // Open Discard Modal
    const handleOpenDiscard = (vial) => {
        setActiveVial(vial);
        setDiscardForm({
            discardReason: '',
            discardDate: new Date().toISOString().slice(0, 16),
            notes: ''
        });
        setShowDiscardModal(true);
    };

    const handleDiscardSubmit = async (e) => {
        e.preventDefault();
        if (!discardForm.discardReason.trim() || discardForm.discardReason.trim().length < 3) {
            toast.error('Please enter a valid discard reason (at least 3 characters)');
            return;
        }

        setActionSubmitting(true);
        try {
            const res = await vialAPI.discard(activeVial._id, discardForm);
            if (res.success) {
                toast.success(res.message || 'Vial marked as discarded');
                setShowDiscardModal(false);
                fetchVials();
                fetchStats();
            } else {
                toast.error(res.message || 'Failed to discard vial');
            }
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Error discarding vial');
        } finally {
            setActionSubmitting(false);
        }
    };

    // Open View Details Modal
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

    // Format location string
    const formatLocation = (loc) => {
        if (!loc || !loc.storageUnit) return null;
        const parts = [];
        if (loc.room) parts.push(loc.room);
        if (loc.storageUnit) parts.push(loc.storageUnit);
        if (loc.rack) parts.push(`Rack ${loc.rack}`);
        if (loc.box) parts.push(`Box ${loc.box}`);
        if (loc.position) parts.push(`Pos ${loc.position}`);
        return parts.join(' → ');
    };

    // Format date string
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

    return (
        <div className="vm-container">
            {/* Header */}
            <div className="vm-header">
                <div className="vm-header-left">
                    <h1>🧪 Vial Management Workspace</h1>
                    <p>Track, store, move, retrieve, and audit laboratory and biological patient vials</p>
                </div>
                <div className="vm-header-actions">
                    <button className="vm-btn-secondary" onClick={() => { fetchVials(); fetchStats(); }} title="Refresh">
                        <FiRefreshCw /> Refresh
                    </button>
                    <button className="vm-btn-primary" onClick={handleOpenStoreModal}>
                        <FiPlus /> Store Vial
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="vm-stats-grid">
                <div className="vm-stat-card">
                    <div className="vm-stat-icon blue">
                        <FiBox />
                    </div>
                    <div className="vm-stat-info">
                        <span className="vm-stat-val">
                            {statsLoading ? '...' : stats.totalVials || 0}
                        </span>
                        <span className="vm-stat-label">Total Vials</span>
                    </div>
                </div>

                <div className="vm-stat-card">
                    <div className="vm-stat-icon emerald">
                        <FiCheckCircle />
                    </div>
                    <div className="vm-stat-info">
                        <span className="vm-stat-val">
                            {statsLoading ? '...' : stats.currentlyStored || 0}
                        </span>
                        <span className="vm-stat-label">Currently Stored</span>
                    </div>
                </div>

                <div className="vm-stat-card">
                    <div className="vm-stat-icon amber">
                        <FiTruck />
                    </div>
                    <div className="vm-stat-info">
                        <span className="vm-stat-val">
                            {statsLoading ? '...' : stats.retrievedCount || 0}
                        </span>
                        <span className="vm-stat-label">Retrieved</span>
                    </div>
                </div>

                <div className="vm-stat-card">
                    <div className="vm-stat-icon rose">
                        <FiTrash2 />
                    </div>
                    <div className="vm-stat-info">
                        <span className="vm-stat-val">
                            {statsLoading ? '...' : stats.discardedCount || 0}
                        </span>
                        <span className="vm-stat-label">Discarded</span>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="vm-filter-card">
                <div className="vm-filter-row">
                    <div className="vm-search-box">
                        <FiSearch />
                        <input
                            type="text"
                            className="vm-search-input"
                            placeholder="Search by Vial ID, Patient, MRN..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                        />
                    </div>

                    <select
                        className="vm-select"
                        value={selectedType}
                        onChange={(e) => { setSelectedType(e.target.value); setPage(1); }}
                    >
                        <option value="All">All Vial Types</option>
                        {VIAL_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>

                    <select
                        className="vm-select"
                        value={selectedStatus}
                        onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
                    >
                        {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
                        ))}
                    </select>

                    <input
                        type="text"
                        className="vm-search-input vm-search-storage"
                        placeholder="Storage Unit..."
                        value={storageUnitFilter}
                        onChange={(e) => { setStorageUnitFilter(e.target.value); setPage(1); }}
                    />

                    <div className="vm-date-filter-group">
                        <span className="vm-date-prefix">From</span>
                        <input
                            type="date"
                            className="vm-date-input"
                            title="Received Date From"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                        />
                        <span className="vm-date-prefix">To</span>
                        <input
                            type="date"
                            className="vm-date-input"
                            title="Received Date To"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                        />
                    </div>

                    {(searchTerm || selectedStatus !== 'All' || selectedType !== 'All' || storageUnitFilter || startDate || endDate) && (
                        <button className="vm-filter-reset" onClick={handleResetFilters}>
                            Clear Filters
                        </button>
                    )}
                </div>
            </div>

            {/* Vials Table Card */}
            <div className="vm-table-card">
                <div className="vm-table-wrapper">
                    {loading ? (
                        <div className="vm-state-box">
                            <FiRefreshCw className="vm-state-icon" style={{ animation: 'spin 1s linear infinite' }} />
                            <span className="vm-state-title">Loading vial records...</span>
                        </div>
                    ) : error ? (
                        <div className="vm-state-box">
                            <FiAlertCircle className="vm-state-icon vm-state-error" />
                            <span className="vm-state-title vm-state-error">{error}</span>
                            <button className="vm-btn-secondary" style={{ marginTop: '12px' }} onClick={fetchVials}>
                                Try Again
                            </button>
                        </div>
                    ) : vials.length === 0 ? (
                        <div className="vm-state-box">
                            <FiBox className="vm-state-icon" />
                            <span className="vm-state-title">No vials have been registered yet.</span>
                            <p className="vm-state-subtitle">
                                {searchTerm || selectedStatus !== 'All'
                                    ? 'No vials match your search filters. Try clearing your search parameters.'
                                    : 'Store your first biological or laboratory sample vial using the button above.'}
                            </p>
                        </div>
                    ) : (
                        <table className="vm-table">
                            <thead>
                                <tr>
                                    <th>Vial ID</th>
                                    <th>Patient</th>
                                    <th>Vial Type</th>
                                    <th>Received Date</th>
                                    <th>Current Location</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vials.map((vial) => {
                                    const locStr = formatLocation(vial.currentLocation);
                                    const statusKey = (vial.currentStatus || 'received').toLowerCase();
                                    const patientObj = vial.patientId || {};

                                    return (
                                        <tr key={vial._id}>
                                            <td>
                                                <span className="vm-vial-id-badge">
                                                    <FiTag /> {vial.vialId}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="vm-patient-cell">
                                                    <span className="vm-patient-name">{patientObj.name || 'Unknown'}</span>
                                                    <span className="vm-patient-mrn">
                                                        MRN: {patientObj.mrn || patientObj.patientId || '—'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontWeight: '600', color: '#334155' }}>
                                                    {vial.vialType}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ color: '#475569' }}>
                                                    {formatDate(vial.receivedAt)}
                                                </span>
                                            </td>
                                            <td>
                                                {locStr ? (
                                                    <span className="vm-location-tag">
                                                        <FiMapPin size={12} color="#0284c7" />
                                                        {locStr}
                                                    </span>
                                                ) : (
                                                    <span className="vm-location-empty">Not in storage</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`vm-status-badge ${statusKey}`}>
                                                    {vial.currentStatus}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="vm-action-group" style={{ justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="vm-btn-icon view"
                                                        title="View Details & Audit History"
                                                        onClick={() => handleOpenDetails(vial)}
                                                    >
                                                        <FiEye />
                                                    </button>

                                                    {vial.currentStatus === 'Received' && (
                                                        <button
                                                            className="vm-btn-icon store"
                                                            title="Assign Storage Location"
                                                            onClick={() => handleOpenMove(vial)}
                                                        >
                                                            <FiBox />
                                                        </button>
                                                    )}

                                                    {['Stored', 'Moved', 'Returned'].includes(vial.currentStatus) && (
                                                        <>
                                                            <button
                                                                className="vm-btn-icon move"
                                                                title="Move to New Storage Location"
                                                                onClick={() => handleOpenMove(vial)}
                                                            >
                                                                <FiTruck />
                                                            </button>
                                                            <button
                                                                className="vm-btn-icon retrieve"
                                                                title="Retrieve Vial"
                                                                onClick={() => handleOpenRetrieve(vial)}
                                                            >
                                                                <FiRotateCcw />
                                                            </button>
                                                        </>
                                                    )}

                                                    {vial.currentStatus === 'Retrieved' && (
                                                        <button
                                                            className="vm-btn-icon return"
                                                            title="Return to Storage"
                                                            onClick={() => handleOpenReturn(vial)}
                                                        >
                                                            <FiBox />
                                                        </button>
                                                    )}

                                                    {vial.currentStatus !== 'Discarded' && (
                                                        <button
                                                            className="vm-btn-icon discard"
                                                            title="Mark as Discarded"
                                                            onClick={() => handleOpenDiscard(vial)}
                                                        >
                                                            <FiTrash2 />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination */}
                {!loading && pagination.totalRecords > 0 && (
                    <div style={{ padding: '16px' }}>
                        <Pagination
                            currentPage={pagination.currentPage}
                            totalPages={pagination.totalPages}
                            totalRecords={pagination.totalRecords}
                            pageSize={pagination.pageSize}
                            entityName="vials"
                            onPageChange={(newPage) => setPage(newPage)}
                        />
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* MODAL 1: STORE / REGISTER VIAL */}
            {/* ========================================================================= */}
            {showStoreModal && (
                <div className="vm-modal-backdrop" onClick={() => !actionSubmitting && setShowStoreModal(false)}>
                    <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="vm-modal-header">
                            <h3 className="vm-modal-title">
                                <FiBox color="#0284c7" /> Register & Store Patient Vial
                            </h3>
                            <button className="vm-modal-close" onClick={() => setShowStoreModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleStoreSubmit} className="vm-modal-form">
                            <div className="vm-modal-body">
                                {/* Patient Selection Section */}
                                <div className="vm-form-group">
                                    <label className="vm-form-label">
                                        Select Patient <span className="req">*</span>
                                    </label>

                                    {selectedPatient ? (
                                        <div className="vm-patient-selected-card">
                                            <div className="vm-patient-selected-avatar">
                                                {selectedPatient.name?.charAt(0)?.toUpperCase() || 'P'}
                                            </div>
                                            <div className="vm-patient-selected-info">
                                                <div className="vm-patient-selected-name">
                                                    {selectedPatient.name}
                                                    <span className="vm-patient-selected-badge">Selected</span>
                                                </div>
                                                <div className="vm-patient-selected-meta">
                                                    <span><strong>MRN / ID:</strong> {selectedPatient.mrn || selectedPatient.patientId || '—'}</span>
                                                    <span><strong>Phone:</strong> {selectedPatient.phone || '—'}</span>
                                                    {selectedPatient.gender && <span><strong>Gender:</strong> {selectedPatient.gender}</span>}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="vm-btn-secondary"
                                                style={{ padding: '6px 14px', fontSize: '12px' }}
                                                onClick={() => {
                                                    setSelectedPatient(null);
                                                    setPatientQuery('');
                                                    setPatientResults([]);
                                                    setShowPatientDropdown(false);
                                                }}
                                            >
                                                Change
                                            </button>
                                        </div>
                                    ) : (
                                        <div ref={patientSearchContainerRef} style={{ position: 'relative' }}>
                                            <input
                                                type="text"
                                                className="vm-form-input"
                                                placeholder="Type patient name, phone, or MRN..."
                                                value={patientQuery}
                                                onChange={handlePatientSearchChange}
                                                autoFocus
                                            />
                                            {searchingPatients && (
                                                <span className="vm-patient-searching-spinner">
                                                    <FiRefreshCw className="vm-spinner-icon" /> Searching...
                                                </span>
                                            )}

                                            {showPatientDropdown && patientQuery.trim().length > 0 && (
                                                <div className="vm-patient-search-results">
                                                    {searchingPatients && patientResults.length === 0 ? (
                                                        <div className="vm-patient-empty-state">
                                                            <span>Searching for "{patientQuery}"...</span>
                                                        </div>
                                                    ) : patientResults.length > 0 ? (
                                                        <>
                                                            <div className="vm-patient-results-header">
                                                                Found {patientResults.length} Matching Patient(s)
                                                            </div>
                                                            {patientResults.map((p) => (
                                                                <div
                                                                    key={p._id}
                                                                    className="vm-patient-search-item"
                                                                    onClick={() => handleSelectPatient(p)}
                                                                >
                                                                    <div className="vm-patient-item-avatar">
                                                                        {p.name?.charAt(0)?.toUpperCase() || 'P'}
                                                                    </div>
                                                                    <div className="vm-patient-item-details">
                                                                        <div className="vm-patient-item-name">{p.name}</div>
                                                                        <div className="vm-patient-item-meta">
                                                                            <span><strong>ID:</strong> {p.patientId || p.mrn || '—'}</span>
                                                                            <span><strong>Phone:</strong> {p.phone || '—'}</span>
                                                                            {p.gender && <span><strong>Gender:</strong> {p.gender}</span>}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        className="vm-btn-primary"
                                                                        style={{ padding: '5px 12px', fontSize: '11px' }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleSelectPatient(p);
                                                                        }}
                                                                    >
                                                                        Select
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </>
                                                    ) : (
                                                        <div className="vm-patient-empty-state">
                                                            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#334155' }}>
                                                                No patients found matching "{patientQuery}"
                                                            </p>
                                                            <small style={{ color: '#64748b' }}>
                                                                Search by full name, phone number, or patient ID.
                                                            </small>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="vm-form-row">
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">
                                            Vial ID <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>(Leave blank to auto-generate)</span>
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
                                            <option value="">-- Select Vial Type * --</option>
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
                                            placeholder="Enter sample description (Optional)"
                                            value={storeForm.description}
                                            onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Hierarchical Storage Location */}
                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                        <FiMapPin color="#0284c7" /> Hierarchical Storage Location
                                    </span>

                                    <div className="vm-form-row">
                                        <div className="vm-form-group">
                                            <label className="vm-form-label">
                                                Room / Storage Area
                                            </label>
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
                                        placeholder="Enter intake notes or instructions (Optional)..."
                                        value={storeForm.notes}
                                        onChange={(e) => setStoreForm({ ...storeForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="vm-modal-footer">
                                <button
                                    type="button"
                                    className="vm-btn-secondary"
                                    disabled={actionSubmitting}
                                    onClick={() => setShowStoreModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="vm-btn-primary"
                                    disabled={actionSubmitting}
                                >
                                    {actionSubmitting ? 'Registering...' : 'Register & Store Vial'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 2: MOVE VIAL */}
            {/* ========================================================================= */}
            {showMoveModal && activeVial && (
                <div className="vm-modal-backdrop" onClick={() => !actionSubmitting && setShowMoveModal(false)}>
                    <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="vm-modal-header">
                            <h3 className="vm-modal-title">
                                <FiTruck color="#7c3aed" /> Move Vial: {activeVial.vialId}
                            </h3>
                            <button className="vm-modal-close" onClick={() => setShowMoveModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleMoveSubmit} className="vm-modal-form">
                            <div className="vm-modal-body">
                                <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Current Location:</span>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginTop: '2px' }}>
                                        {formatLocation(activeVial.currentLocation) || 'Not assigned'}
                                    </div>
                                </div>

                                <div className="vm-form-row">
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">
                                            Destination Room / Area
                                        </label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Enter destination room"
                                            value={moveForm.room}
                                            onChange={(e) => setMoveForm({ ...moveForm, room: e.target.value })}
                                        />
                                    </div>
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">
                                            Destination Storage Unit <span className="req">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Enter destination storage unit / freezer"
                                            value={moveForm.storageUnit}
                                            onChange={(e) => setMoveForm({ ...moveForm, storageUnit: e.target.value })}
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
                                            value={moveForm.rack}
                                            onChange={(e) => setMoveForm({ ...moveForm, rack: e.target.value })}
                                        />
                                    </div>
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">Box</label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Enter box (Optional)"
                                            value={moveForm.box}
                                            onChange={(e) => setMoveForm({ ...moveForm, box: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="vm-form-row" style={{ marginTop: '10px' }}>
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">Position</label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Enter position / well (Optional)"
                                            value={moveForm.position}
                                            onChange={(e) => setMoveForm({ ...moveForm, position: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="vm-form-group">
                                    <label className="vm-form-label">
                                        Reason for Movement <span className="req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="vm-form-input"
                                        placeholder="Enter reason for movement"
                                        value={moveForm.reason}
                                        onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="vm-form-group">
                                    <label className="vm-form-label">Notes</label>
                                    <textarea
                                        className="vm-form-textarea"
                                        placeholder="Enter notes (Optional)..."
                                        value={moveForm.notes}
                                        onChange={(e) => setMoveForm({ ...moveForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="vm-modal-footer">
                                <button
                                    type="button"
                                    className="vm-btn-secondary"
                                    disabled={actionSubmitting}
                                    onClick={() => setShowMoveModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="vm-btn-primary"
                                    style={{ background: '#7c3aed' }}
                                    disabled={actionSubmitting}
                                >
                                    {actionSubmitting ? 'Moving...' : 'Confirm Move'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 3: RETRIEVE VIAL */}
            {/* ========================================================================= */}
            {showRetrieveModal && activeVial && (
                <div className="vm-modal-backdrop" onClick={() => !actionSubmitting && setShowRetrieveModal(false)}>
                    <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="vm-modal-header">
                            <h3 className="vm-modal-title">
                                <FiRotateCcw color="#d97706" /> Retrieve Vial: {activeVial.vialId}
                            </h3>
                            <button className="vm-modal-close" onClick={() => setShowRetrieveModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleRetrieveSubmit} className="vm-modal-form">
                            <div className="vm-modal-body">
                                <div style={{ background: '#fef3c7', padding: '12px 16px', borderRadius: '10px', border: '1px solid #fde68a' }}>
                                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#92400e', textTransform: 'uppercase' }}>Stored At:</span>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#78350f', marginTop: '2px' }}>
                                        {formatLocation(activeVial.currentLocation) || 'Storage position'}
                                    </div>
                                </div>

                                <div className="vm-form-group">
                                    <label className="vm-form-label">
                                        Reason for Retrieval <span className="req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="vm-form-input"
                                        placeholder="Enter reason for retrieval"
                                        value={retrieveForm.reason}
                                        onChange={(e) => setRetrieveForm({ ...retrieveForm, reason: e.target.value })}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="vm-form-group">
                                    <label className="vm-form-label">
                                        Retrieval Date & Time <span className="req">*</span>
                                    </label>
                                    <input
                                        type="datetime-local"
                                        className="vm-form-input"
                                        value={retrieveForm.retrievalDate}
                                        onChange={(e) => setRetrieveForm({ ...retrieveForm, retrievalDate: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="vm-form-group">
                                    <label className="vm-form-label">Notes</label>
                                    <textarea
                                        className="vm-form-textarea"
                                        placeholder="Enter notes (Optional)..."
                                        value={retrieveForm.notes}
                                        onChange={(e) => setRetrieveForm({ ...retrieveForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="vm-modal-footer">
                                <button
                                    type="button"
                                    className="vm-btn-secondary"
                                    disabled={actionSubmitting}
                                    onClick={() => setShowRetrieveModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="vm-btn-primary"
                                    style={{ background: '#d97706' }}
                                    disabled={actionSubmitting}
                                >
                                    {actionSubmitting ? 'Retrieving...' : 'Confirm Retrieval'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 4: RETURN TO STORAGE */}
            {/* ========================================================================= */}
            {showReturnModal && activeVial && (
                <div className="vm-modal-backdrop" onClick={() => !actionSubmitting && setShowReturnModal(false)}>
                    <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="vm-modal-header">
                            <h3 className="vm-modal-title">
                                <FiBox color="#0d9488" /> Return Vial to Storage: {activeVial.vialId}
                            </h3>
                            <button className="vm-modal-close" onClick={() => setShowReturnModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleReturnSubmit} className="vm-modal-form">
                            <div className="vm-modal-body">
                                <div className="vm-form-row">
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">
                                            Storage Unit / Freezer <span className="req">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Enter storage unit / freezer"
                                            value={returnForm.storageUnit}
                                            onChange={(e) => setReturnForm({ ...returnForm, storageUnit: e.target.value })}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">Rack</label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Enter rack (Optional)"
                                            value={returnForm.rack}
                                            onChange={(e) => setReturnForm({ ...returnForm, rack: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="vm-form-row">
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">Box</label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Enter box (Optional)"
                                            value={returnForm.box}
                                            onChange={(e) => setReturnForm({ ...returnForm, box: e.target.value })}
                                        />
                                    </div>
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">Position</label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Enter position / well (Optional)"
                                            value={returnForm.position}
                                            onChange={(e) => setReturnForm({ ...returnForm, position: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="vm-form-row">
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">
                                            Return Date & Time <span className="req">*</span>
                                        </label>
                                        <input
                                            type="datetime-local"
                                            className="vm-form-input"
                                            value={returnForm.returnDate}
                                            onChange={(e) => setReturnForm({ ...returnForm, returnDate: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="vm-form-group">
                                        <label className="vm-form-label">Notes</label>
                                        <input
                                            type="text"
                                            className="vm-form-input"
                                            placeholder="Enter notes (Optional)"
                                            value={returnForm.notes}
                                            onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="vm-modal-footer">
                                <button
                                    type="button"
                                    className="vm-btn-secondary"
                                    disabled={actionSubmitting}
                                    onClick={() => setShowReturnModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="vm-btn-primary"
                                    style={{ background: '#0d9488' }}
                                    disabled={actionSubmitting}
                                >
                                    {actionSubmitting ? 'Saving...' : 'Return to Storage'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 5: DISCARD VIAL */}
            {/* ========================================================================= */}
            {showDiscardModal && activeVial && (
                <div className="vm-modal-backdrop" onClick={() => !actionSubmitting && setShowDiscardModal(false)}>
                    <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="vm-modal-header">
                            <h3 className="vm-modal-title" style={{ color: '#dc2626' }}>
                                <FiTrash2 color="#dc2626" /> Mark Vial as Discarded
                            </h3>
                            <button className="vm-modal-close" onClick={() => setShowDiscardModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleDiscardSubmit} className="vm-modal-form">
                            <div className="vm-modal-body">
                                <div className="vm-danger-banner">
                                    <FiAlertCircle size={24} style={{ flexShrink: 0, marginTop: 2 }} />
                                    <div>
                                        <strong>Deliberate Action Required:</strong>
                                        <p style={{ margin: '4px 0 0' }}>
                                            Are you sure you want to mark vial <strong>{activeVial.vialId}</strong> as discarded?
                                            This action is permanent and will close the vial record. The vial will remain searchable in history.
                                        </p>
                                    </div>
                                </div>

                                <div className="vm-form-group">
                                    <label className="vm-form-label">
                                        Discard Reason <span className="req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="vm-form-input"
                                        placeholder="Enter reason for discarding"
                                        value={discardForm.discardReason}
                                        onChange={(e) => setDiscardForm({ ...discardForm, discardReason: e.target.value })}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="vm-form-group">
                                    <label className="vm-form-label">
                                        Discard Date & Time <span className="req">*</span>
                                    </label>
                                    <input
                                        type="datetime-local"
                                        className="vm-form-input"
                                        value={discardForm.discardDate}
                                        onChange={(e) => setDiscardForm({ ...discardForm, discardDate: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="vm-form-group">
                                    <label className="vm-form-label">Notes</label>
                                    <textarea
                                        className="vm-form-textarea"
                                        placeholder="Enter notes (Optional)..."
                                        value={discardForm.notes}
                                        onChange={(e) => setDiscardForm({ ...discardForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="vm-modal-footer">
                                <button
                                    type="button"
                                    className="vm-btn-secondary"
                                    disabled={actionSubmitting}
                                    onClick={() => setShowDiscardModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="vm-btn-danger"
                                    disabled={actionSubmitting}
                                >
                                    {actionSubmitting ? 'Discarding...' : 'Confirm Discard'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 6: VIEW VIAL DETAILS & MOVEMENT AUDIT TRAIL */}
            {/* ========================================================================= */}
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
                            {/* Metadata Details Grid */}
                            <div className="vm-details-grid">
                                <div className="vm-detail-item">
                                    <span className="vm-detail-label">Patient Name</span>
                                    <span className="vm-detail-val">{activeVial.patientId?.name || '—'}</span>
                                </div>

                                <div className="vm-detail-item">
                                    <span className="vm-detail-label">MRN / Patient ID</span>
                                    <span className="vm-detail-val">{activeVial.patientId?.mrn || activeVial.patientId?.patientId || '—'}</span>
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
                                    <span className="vm-detail-label">Received Date</span>
                                    <span className="vm-detail-val">{formatDateTime(activeVial.receivedAt)}</span>
                                </div>

                                <div className="vm-detail-item" style={{ gridColumn: 'span 2' }}>
                                    <span className="vm-detail-label">Sample Description</span>
                                    <span className="vm-detail-val" style={{ fontWeight: 400 }}>
                                        {activeVial.description || 'No description provided'}
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

                            {/* Append-Only Audit History / Movement Trail */}
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

export default VialManagement;
