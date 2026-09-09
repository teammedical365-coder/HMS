import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { confirmToast } from '../../utils/confirmToast';
import { bedAPI } from '../../utils/api';
import { FiPlus, FiTrash2, FiEdit2, FiSearch, FiCheckCircle, FiX, FiRefreshCw } from 'react-icons/fi';

const BedManagement = () => {
    const [beds, setBeds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // Filters & Search
    const [filterWard, setFilterWard] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBed, setEditingBed] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        bedNumber: '',
        ward: '',
        bedType: 'General',
        status: 'AVAILABLE'
    });

    useEffect(() => {
        fetchBeds();
    }, [filterWard, filterStatus]);

    const fetchBeds = async (showToast = false) => {
        setLoading(true);
        if (showToast) setIsRefreshing(true);
        try {
            const params = {};
            if (filterWard) params.ward = filterWard;
            if (filterStatus) params.status = filterStatus;
            
            const res = await bedAPI.getBeds(params);
            if (res.success) {
                setBeds(res.beds || []);
                if (showToast) toast.success('Bed data refreshed!');
            }
        } catch (error) {
            console.error("Error fetching beds:", error);
            toast.error(error.response?.data?.message || 'Error fetching beds');
        } finally {
            setLoading(false);
            if (showToast) setTimeout(() => setIsRefreshing(false), 400);
        }
    };

    const handleOpenModal = (bed = null) => {
        if (bed) {
            setEditingBed(bed);
            setFormData({
                bedNumber: bed.bedNumber,
                ward: bed.ward,
                bedType: bed.bedType || 'General',
                status: bed.status || 'AVAILABLE'
            });
        } else {
            setEditingBed(null);
            setFormData({
                bedNumber: '',
                ward: filterWard || '',
                bedType: 'General',
                status: 'AVAILABLE'
            });
        }
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.bedNumber.trim() || !formData.ward.trim()) {
            toast.error('Bed number and ward are required');
            return;
        }

        setSaving(true);
        try {
            if (editingBed) {
                await bedAPI.updateBed(editingBed._id, formData);
                toast.success(`Bed ${formData.bedNumber} updated successfully!`);
            } else {
                await bedAPI.createBed(formData);
                toast.success(`Bed ${formData.bedNumber} created successfully!`);
            }
            setModalOpen(false);
            fetchBeds();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error saving bed');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (bed) => {
        if (bed.status === 'OCCUPIED') {
            toast.error('Cannot delete an occupied bed. Please discharge or reassign patient first.');
            return;
        }
        const ok = await confirmToast(`Are you sure you want to delete Bed ${bed.bedNumber}?`, {
            title: 'Delete Bed',
            confirmText: 'Delete Bed',
            danger: true
        });
        if (!ok) return;

        try {
            await bedAPI.deleteBed(bed._id);
            toast.success(`Bed ${bed.bedNumber} deleted`);
            fetchBeds();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error deleting bed');
        }
    };

    // Filter by search query
    const filteredBeds = useMemo(() => {
        const q = (searchQuery || '').toLowerCase().trim();
        if (!q) return beds;
        return beds.filter(bed => {
            const num = (bed.bedNumber || '').toLowerCase();
            const ward = (bed.ward || '').toLowerCase();
            const type = (bed.bedType || '').toLowerCase();
            const status = (bed.status || '').toLowerCase();
            const patientName = (bed.currentPatient?.name || '').toLowerCase();
            return num.includes(q) || ward.includes(q) || type.includes(q) || status.includes(q) || patientName.includes(q);
        });
    }, [beds, searchQuery]);

    // Group beds by ward for rendering
    const groupedBeds = useMemo(() => {
        return filteredBeds.reduce((acc, bed) => {
            const w = bed.ward || 'General Ward';
            if (!acc[w]) acc[w] = [];
            acc[w].push(bed);
            return acc;
        }, {});
    }, [filteredBeds]);

    // Summary statistics
    const totalBeds = beds.length;
    const availableBeds = beds.filter(b => b.status === 'AVAILABLE').length;
    const occupiedBeds = beds.filter(b => b.status === 'OCCUPIED').length;
    const maintenanceBeds = beds.filter(b => b.status === 'MAINTENANCE').length;
    const uniqueWards = Array.from(new Set(beds.map(b => b.ward).filter(Boolean)));
    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    return (
        <div className="ha-bed-wrapper">
            {/* 1. Hero Banner */}
            <div className="ha-bed-hero-banner">
                <div className="ha-bed-hero-bg-shapes">
                    <div className="ha-bed-blob-1" />
                    <div className="ha-bed-blob-2" />
                </div>

                <div className="ha-bed-hero-content">
                    <div className="ha-bed-hero-top-row">
                        <div className="ha-bed-hero-titles">
                            <h2 className="ha-bed-hero-title">
                                <span className="ha-title-gradient">Bed Management & Allocation</span>
                            </h2>
                            <p className="ha-bed-hero-subtitle">
                                Monitor real-time ward occupancy, allocate patient admissions, and manage hospital bed infrastructure.
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="ha-bed-hero-actions">
                            <button 
                                type="button"
                                onClick={() => fetchBeds(true)}
                                className={`ha-btn-bed-refresh ${isRefreshing ? 'spinning' : ''}`}
                                title="Refresh Bed Data"
                            >
                                <FiRefreshCw size={15} />
                                <span>Refresh</span>
                            </button>
                            <button 
                                type="button"
                                onClick={() => handleOpenModal()}
                                className="ha-btn-bed-add"
                            >
                                <FiPlus size={18} />
                                <span>Add New Bed</span>
                            </button>
                        </div>
                    </div>

                    {/* Stat Chips Row */}
                    <div className="ha-bed-stat-chips-grid">
                        {/* Total Beds */}
                        <div className="ha-bed-stat-chip chip-blue">
                            <div className="ha-bed-chip-icon">🛏️</div>
                            <div className="ha-bed-chip-data">
                                <span className="ha-bed-chip-val">{totalBeds}</span>
                                <span className="ha-bed-chip-label">Total Beds</span>
                            </div>
                        </div>

                        {/* Available Beds */}
                        <div className="ha-bed-stat-chip chip-emerald">
                            <div className="ha-bed-chip-icon">🟢</div>
                            <div className="ha-bed-chip-data">
                                <span className="ha-bed-chip-val">{availableBeds}</span>
                                <span className="ha-bed-chip-label">Available</span>
                            </div>
                        </div>

                        {/* Occupied Beds */}
                        <div className="ha-bed-stat-chip chip-rose">
                            <div className="ha-bed-chip-icon">🔴</div>
                            <div className="ha-bed-chip-data">
                                <span className="ha-bed-chip-val">{occupiedBeds}</span>
                                <span className="ha-bed-chip-label">Occupied ({occupancyRate}%)</span>
                            </div>
                        </div>

                        {/* Maintenance */}
                        <div className="ha-bed-stat-chip chip-amber">
                            <div className="ha-bed-chip-icon">🛠️</div>
                            <div className="ha-bed-chip-data">
                                <span className="ha-bed-chip-val">{maintenanceBeds}</span>
                                <span className="ha-bed-chip-label">Maintenance</span>
                            </div>
                        </div>

                        {/* Active Wards */}
                        <div className="ha-bed-stat-chip chip-purple">
                            <div className="ha-bed-chip-icon">🏥</div>
                            <div className="ha-bed-chip-data">
                                <span className="ha-bed-chip-val">{uniqueWards.length}</span>
                                <span className="ha-bed-chip-label">Active Wards</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Filters & Search Toolbar Card */}
            <div className="ha-bed-toolbar-card">
                <div className="ha-bed-search-box">
                    <FiSearch className="ha-bed-search-icon" />
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search bed number, ward, type, or patient..."
                        className="ha-bed-search-input"
                    />
                    {searchQuery && (
                        <button type="button" onClick={() => setSearchQuery('')} className="ha-bed-search-clear">
                            <FiX size={14} />
                        </button>
                    )}
                </div>

                <div className="ha-bed-filters-group">
                    {/* Ward Filter */}
                    <div className="ha-bed-filter-item">
                        <label className="ha-bed-filter-label">Ward:</label>
                        <select 
                            value={filterWard} 
                            onChange={e => setFilterWard(e.target.value)}
                            className="ha-bed-filter-select"
                        >
                            <option value="">All Wards ({uniqueWards.length})</option>
                            {uniqueWards.map(w => (
                                <option key={w} value={w}>{w}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="ha-bed-filter-item">
                        <label className="ha-bed-filter-label">Status:</label>
                        <select 
                            value={filterStatus} 
                            onChange={e => setFilterStatus(e.target.value)}
                            className="ha-bed-filter-select"
                        >
                            <option value="">All Statuses</option>
                            <option value="AVAILABLE">Available Only</option>
                            <option value="OCCUPIED">Occupied Only</option>
                            <option value="MAINTENANCE">Maintenance Only</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* 3. Ward Sections & Bed Cards */}
            {loading ? (
                <div className="ha-bed-loading-box">
                    <div className="ha-bed-spinner" />
                    <p>Loading real-time bed allocation data...</p>
                </div>
            ) : Object.keys(groupedBeds).length === 0 ? (
                <div className="ha-bed-empty-card">
                    <div className="ha-bed-empty-icon">🛏️</div>
                    <h3 className="ha-bed-empty-title">No Beds Found</h3>
                    <p className="ha-bed-empty-sub">No hospital beds match your selected filters or search query.</p>
                    <button 
                        type="button" 
                        onClick={() => { setFilterWard(''); setFilterStatus(''); setSearchQuery(''); }}
                        className="ha-bed-btn-reset-filters"
                    >
                        Reset All Filters
                    </button>
                </div>
            ) : (
                <div className="ha-ward-sections-container">
                    {Object.entries(groupedBeds).map(([wardName, wardBeds]) => {
                        const wardOccupied = wardBeds.filter(b => b.status === 'OCCUPIED').length;
                        const wardAvailable = wardBeds.filter(b => b.status === 'AVAILABLE').length;
                        const wardPct = wardBeds.length > 0 ? Math.round((wardOccupied / wardBeds.length) * 100) : 0;

                        return (
                            <div key={wardName} className="ha-ward-card">
                                {/* Ward Header Bar */}
                                <div className="ha-ward-header">
                                    <div className="ha-ward-title-group">
                                        <div className="ha-ward-icon-badge">🏥</div>
                                        <div>
                                            <h3 className="ha-ward-title">{wardName}</h3>
                                            <div className="ha-ward-meta-row">
                                                <span className="ha-ward-stat-pill available">🟢 {wardAvailable} Available</span>
                                                <span className="ha-ward-stat-pill occupied">🔴 {wardOccupied} Occupied</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="ha-ward-occupancy-badge">
                                        <span className="ha-ward-total-pill">{wardBeds.length} Beds</span>
                                        <span className={`ha-ward-rate-tag ${wardPct >= 80 ? 'high' : wardPct >= 50 ? 'med' : 'low'}`}>
                                            {wardPct}% Full
                                        </span>
                                    </div>
                                </div>

                                {/* Ward Bed Grid */}
                                <div className="ha-bed-grid">
                                    {wardBeds.map(bed => {
                                        const statusKey = (bed.status || 'AVAILABLE').toLowerCase();
                                        const isAvailable = bed.status === 'AVAILABLE';
                                        const isOccupied = bed.status === 'OCCUPIED';

                                        return (
                                            <div key={bed._id} className={`ha-bed-item-card status-${statusKey}`}>
                                                {/* Top Status & Header */}
                                                <div className="ha-bed-item-top">
                                                    <div className="ha-bed-id-wrap">
                                                        <span className="ha-bed-badge-icon">🛏️</span>
                                                        <div>
                                                            <h4 className="ha-bed-item-number">{bed.bedNumber}</h4>
                                                            <span className="ha-bed-item-type">{bed.bedType || 'General'}</span>
                                                        </div>
                                                    </div>

                                                    <div className="ha-bed-item-actions">
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleOpenModal(bed)} 
                                                            className="ha-bed-act-btn edit"
                                                            title="Edit Bed Details"
                                                        >
                                                            <FiEdit2 size={13} />
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleDelete(bed)} 
                                                            disabled={isOccupied} 
                                                            className="ha-bed-act-btn delete"
                                                            title={isOccupied ? 'Cannot delete occupied bed' : 'Delete Bed'}
                                                        >
                                                            <FiTrash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Status Pill */}
                                                <div className="ha-bed-status-wrap">
                                                    <span className={`ha-bed-pill-badge ${statusKey}`}>
                                                        <span className="ha-bed-pulse-dot" />
                                                        <span>{bed.status || 'AVAILABLE'}</span>
                                                    </span>
                                                </div>

                                                {/* Body: Patient details or Admission status */}
                                                <div className="ha-bed-item-body">
                                                    {isOccupied && bed.currentPatient ? (
                                                        <div className="ha-bed-patient-card">
                                                            <div className="ha-bed-patient-row">
                                                                <span className="ha-patient-avatar-mini">👤</span>
                                                                <span className="ha-patient-name-txt">{bed.currentPatient.name || 'Admitted Patient'}</span>
                                                            </div>
                                                            <div className="ha-bed-patient-subinfo">
                                                                <span><strong>MRN:</strong> {bed.currentPatient.patientId || bed.currentPatient.mrn || 'N/A'}</span>
                                                                {bed.currentAdmission?.admissionDate && (
                                                                    <span><strong>Date:</strong> {new Date(bed.currentAdmission.admissionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : isAvailable ? (
                                                        <div className="ha-bed-ready-banner">
                                                            <FiCheckCircle className="ha-bed-ready-icon" />
                                                            <span>Ready for admission</span>
                                                        </div>
                                                    ) : (
                                                        <div className="ha-bed-maint-banner">
                                                            <span>🛠️ Under maintenance/cleaning</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 4. Sleek Add / Edit Bed Modal */}
            {modalOpen && (
                <div className="ha-bed-modal-overlay" onClick={() => setModalOpen(false)}>
                    <div className="ha-bed-modal-box" onClick={e => e.stopPropagation()}>
                        <div className="ha-bed-modal-header">
                            <div className="ha-bed-modal-header-left">
                                <div className="ha-bed-modal-icon-badge">🛏️</div>
                                <div>
                                    <h3 className="ha-bed-modal-title">{editingBed ? 'Edit Bed Details' : 'Add New Hospital Bed'}</h3>
                                    <p className="ha-bed-modal-subtitle">Configure bed identification, ward location, and tier.</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setModalOpen(false)} className="ha-bed-modal-close-btn">
                                <FiX size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="ha-bed-modal-form">
                            <div className="ha-bed-form-row">
                                <div className="ha-bed-form-group">
                                    <label className="ha-bed-form-label">Bed Number / Code <span className="req">*</span></label>
                                    <input 
                                        type="text" 
                                        value={formData.bedNumber}
                                        onChange={e => setFormData({...formData, bedNumber: e.target.value})}
                                        placeholder="e.g. B-101, ICU-04"
                                        required
                                        className="ha-bed-form-input"
                                    />
                                </div>

                                <div className="ha-bed-form-group">
                                    <label className="ha-bed-form-label">Ward Name <span className="req">*</span></label>
                                    <input 
                                        type="text" 
                                        value={formData.ward}
                                        onChange={e => setFormData({...formData, ward: e.target.value})}
                                        placeholder="e.g. General Ward, ICU, Semi-Private"
                                        required
                                        className="ha-bed-form-input"
                                    />
                                </div>
                            </div>

                            <div className="ha-bed-form-row">
                                <div className="ha-bed-form-group">
                                    <label className="ha-bed-form-label">Bed Type / Tier</label>
                                    <select 
                                        value={formData.bedType}
                                        onChange={e => setFormData({...formData, bedType: e.target.value})}
                                        className="ha-bed-form-select"
                                    >
                                        <option value="General">General</option>
                                        <option value="ICU">ICU (Intensive Care)</option>
                                        <option value="NICU">NICU (Neonatal)</option>
                                        <option value="Private">Private Room</option>
                                        <option value="Semi-Private">Semi-Private</option>
                                        <option value="Emergency">Emergency / Trauma</option>
                                        <option value="Post-Op">Post-Op Recovery</option>
                                        <option value="Deluxe">Deluxe Suite</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                {editingBed && (
                                    <div className="ha-bed-form-group">
                                        <label className="ha-bed-form-label">Operational Status</label>
                                        <select 
                                            value={formData.status}
                                            onChange={e => setFormData({...formData, status: e.target.value})}
                                            disabled={editingBed.status === 'OCCUPIED' || formData.status === 'OCCUPIED'}
                                            className="ha-bed-form-select"
                                        >
                                            <option value="AVAILABLE">Available</option>
                                            <option value="OCCUPIED">Occupied (Set via Admission)</option>
                                            <option value="MAINTENANCE">Maintenance / Cleaning</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className="ha-bed-modal-actions">
                                <button 
                                    type="button" 
                                    onClick={() => setModalOpen(false)} 
                                    className="ha-bed-btn-modal-cancel"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={saving}
                                    className="ha-bed-btn-modal-submit"
                                >
                                    {saving ? 'Saving Bed...' : editingBed ? 'Save Changes' : 'Create Bed'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BedManagement;
