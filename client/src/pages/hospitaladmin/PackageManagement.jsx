import React, { useState, useEffect, useCallback, useRef } from 'react';
import { packageAPI, receptionAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import {
    FiPackage, FiPlus, FiSearch, FiRefreshCw, FiEdit2, FiTrash2,
    FiToggleLeft, FiToggleRight, FiUsers, FiDollarSign, FiCalendar,
    FiX, FiCheck, FiAlertCircle, FiTrendingUp, FiGrid, FiList,
    FiChevronDown, FiTag, FiClock, FiActivity, FiEye,
    FiUserPlus, FiXCircle, FiHash, FiFileText
} from 'react-icons/fi';
import './PackageManagement.css';
import CustomSelect from '../../components/common/CustomSelect';

const CATEGORIES = ['General', 'Maternity', 'Surgery', 'Wellness', 'Dialysis', 'Physiotherapy', 'Dental', 'Eye', 'Cardiology', 'Other'];
const SERVICE_CATEGORIES = ['Consultation', 'Lab', 'Pharmacy', 'Facility', 'Surgery', 'Procedure', 'Nursing', 'Other'];

const emptyService = () => ({
    serviceName: '', serviceCategory: 'Other', includedQuantity: 1,
    extraChargePerUnit: 0, unitPrice: 0, notes: ''
});

const emptyForm = () => ({
    name: '', code: '', description: '', category: 'General',
    totalPrice: '', discountedPrice: '', validityDays: 365,
    services: [emptyService()]
});

const PackageManagement = () => {
    // ── State ──────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState('packages');
    const [packages, setPackages] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(null);
    const [editingPackage, setEditingPackage] = useState(null);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [formData, setFormData] = useState(emptyForm());
    const [saving, setSaving] = useState(false);

    // Assignment form state
    const [assignFormData, setAssignFormData] = useState({ packageId: '', patientId: '', notes: '' });
    const [patientSearch, setPatientSearch] = useState('');
    const [patientResults, setPatientResults] = useState([]);
    const [searchingPatients, setSearchingPatients] = useState(false);
    const searchTimeoutRef = useRef(null);

    // ── Data Loading ───────────────────────────────────────────────────
    const loadPackages = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (categoryFilter) params.category = categoryFilter;
            const res = await packageAPI.getPackages(params);
            if (res.success) setPackages(res.packages || []);
        } catch (err) {
            console.error('Load packages error:', err);
            toast.error('Failed to load packages');
        } finally {
            setLoading(false);
        }
    }, [categoryFilter]);

    const loadAssignments = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (statusFilter) params.status = statusFilter;
            const res = await packageAPI.getAssignments(params);
            if (res.success) setAssignments(res.assignments || []);
        } catch (err) {
            console.error('Load assignments error:', err);
            toast.error('Failed to load assignments');
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    const loadStats = useCallback(async () => {
        try {
            setStatsLoading(true);
            const res = await packageAPI.getDashboardStats();
            if (res.success) setStats(res.stats);
        } catch (err) {
            console.error('Load stats error:', err);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    useEffect(() => {
        if (activeTab === 'packages') loadPackages();
        else if (activeTab === 'assignments') loadAssignments();
    }, [activeTab, loadPackages, loadAssignments]);

    // ── Patient Search for Assignment ──────────────────────────────────
    useEffect(() => {
        if (!patientSearch || patientSearch.length < 2) {
            setPatientResults([]);
            return;
        }
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                setSearchingPatients(true);
                const res = await receptionAPI.searchPatients(patientSearch);
                setPatientResults(res.patients || res.data || []);
            } catch (err) {
                console.error('Patient search error:', err);
            } finally {
                setSearchingPatients(false);
            }
        }, 400);
        return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
    }, [patientSearch]);

    // ── Filtered Data ──────────────────────────────────────────────────
    const filteredPackages = packages.filter(p => {
        if (search) {
            const q = search.toLowerCase();
            if (!p.name?.toLowerCase().includes(q) && !p.code?.toLowerCase().includes(q) && !p.description?.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    const filteredAssignments = assignments.filter(a => {
        if (search) {
            const q = search.toLowerCase();
            if (!a.patientName?.toLowerCase().includes(q) && !a.patientMRN?.toLowerCase().includes(q) && !a.packageName?.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    // ── Package CRUD Handlers ──────────────────────────────────────────
    const openCreateModal = () => {
        setEditingPackage(null);
        setFormData(emptyForm());
        setShowCreateModal(true);
    };

    const openEditModal = (pkg) => {
        setEditingPackage(pkg);
        setFormData({
            name: pkg.name || '',
            code: pkg.code || '',
            description: pkg.description || '',
            category: pkg.category || 'General',
            totalPrice: pkg.totalPrice?.toString() || '',
            discountedPrice: pkg.discountedPrice != null ? pkg.discountedPrice.toString() : '',
            validityDays: pkg.validityDays || 365,
            services: pkg.services?.length ? pkg.services.map(s => ({
                serviceName: s.serviceName || '',
                serviceCategory: s.serviceCategory || 'Other',
                includedQuantity: s.includedQuantity ?? 1,
                extraChargePerUnit: s.extraChargePerUnit ?? 0,
                unitPrice: s.unitPrice ?? 0,
                notes: s.notes || ''
            })) : [emptyService()]
        });
        setShowCreateModal(true);
    };

    const handleSavePackage = async () => {
        if (!formData.name.trim()) return toast.error('Package name is required');
        if (!formData.totalPrice || Number(formData.totalPrice) < 0) return toast.error('Valid total price is required');
        if (!formData.services.length || !formData.services[0].serviceName) return toast.error('At least one service is required');

        // Validate all services have names
        const invalidService = formData.services.find(s => !s.serviceName.trim());
        if (invalidService) return toast.error('All services must have a name');

        try {
            setSaving(true);
            const payload = {
                name: formData.name.trim(),
                code: formData.code.trim(),
                description: formData.description.trim(),
                category: formData.category,
                totalPrice: Number(formData.totalPrice),
                discountedPrice: formData.discountedPrice ? Number(formData.discountedPrice) : null,
                validityDays: Number(formData.validityDays) || 365,
                services: formData.services.filter(s => s.serviceName.trim()).map(s => ({
                    serviceName: s.serviceName.trim(),
                    serviceCategory: s.serviceCategory,
                    includedQuantity: Number(s.includedQuantity),
                    extraChargePerUnit: Number(s.extraChargePerUnit) || 0,
                    unitPrice: Number(s.unitPrice) || 0,
                    notes: s.notes || ''
                }))
            };

            let res;
            if (editingPackage) {
                res = await packageAPI.updatePackage(editingPackage._id, payload);
            } else {
                res = await packageAPI.createPackage(payload);
            }

            if (res.success) {
                toast.success(res.message || 'Package saved successfully');
                setShowCreateModal(false);
                loadPackages();
                loadStats();
            } else {
                toast.error(res.message || 'Failed to save package');
            }
        } catch (err) {
            console.error('Save package error:', err);
            toast.error(err.response?.data?.message || 'Failed to save package');
        } finally {
            setSaving(false);
        }
    };

    const handleTogglePackage = async (pkg) => {
        try {
            const res = await packageAPI.togglePackage(pkg._id);
            if (res.success) {
                toast.success(res.message);
                loadPackages();
                loadStats();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to toggle package');
        }
    };

    const handleDeletePackage = async (pkg) => {
        try {
            const res = await packageAPI.deletePackage(pkg._id);
            if (res.success) {
                toast.success(res.message);
                setShowConfirmModal(null);
                loadPackages();
                loadStats();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Cannot delete this package');
            setShowConfirmModal(null);
        }
    };

    // ── Assignment Handlers ────────────────────────────────────────────
    const openAssignModal = (pkg = null) => {
        setAssignFormData({ packageId: pkg?._id || '', patientId: '', notes: '' });
        setPatientSearch('');
        setPatientResults([]);
        setShowAssignModal(true);
    };

    const handleAssignPackage = async () => {
        if (!assignFormData.packageId) return toast.error('Select a package');
        if (!assignFormData.patientId) return toast.error('Select a patient');

        try {
            setSaving(true);
            const res = await packageAPI.assignPackage(assignFormData);
            if (res.success) {
                toast.success(res.message || 'Package assigned successfully');
                setShowAssignModal(false);
                loadAssignments();
                loadStats();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to assign package');
        } finally {
            setSaving(false);
        }
    };

    const handleCancelAssignment = async (assignment) => {
        try {
            const res = await packageAPI.cancelAssignment(assignment._id, { reason: 'Cancelled by admin' });
            if (res.success) {
                toast.success(res.message);
                setShowConfirmModal(null);
                loadAssignments();
                loadStats();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel assignment');
            setShowConfirmModal(null);
        }
    };

    // ── Form Helpers ───────────────────────────────────────────────────
    const updateService = (idx, field, value) => {
        setFormData(prev => {
            const services = [...prev.services];
            services[idx] = { ...services[idx], [field]: value };
            return { ...prev, services };
        });
    };

    const addService = () => {
        setFormData(prev => ({ ...prev, services: [...prev.services, emptyService()] }));
    };

    const removeService = (idx) => {
        if (formData.services.length <= 1) return toast.error('At least one service is required');
        setFormData(prev => ({ ...prev, services: prev.services.filter((_, i) => i !== idx) }));
    };

    // ── Usage calculation helpers ──────────────────────────────────────
    const getUsagePercent = (assignment) => {
        if (!assignment.snapshotServices?.length) return 0;
        let totalIncluded = 0, totalUsed = 0;
        assignment.snapshotServices.forEach(s => {
            if (s.includedQuantity === -1) return;
            totalIncluded += s.includedQuantity;
            totalUsed += Math.min(s.usedQuantity, s.includedQuantity);
        });
        return totalIncluded > 0 ? Math.round((totalUsed / totalIncluded) * 100) : 0;
    };

    const formatCurrency = (amount) => {
        if (amount == null) return '₹0';
        return '₹' + Number(amount).toLocaleString('en-IN');
    };

    const formatDate = (d) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // ════════════════════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════════════════════

    return (
        <div className="pkg-mgmt">
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="pkg-header">
                <div className="pkg-header-left">
                    <h1><FiPackage /> Package Management</h1>
                    <p>Create, manage, and assign service packages to patients</p>
                </div>
                <div className="pkg-header-actions">
                    <button className="pkg-btn pkg-btn-secondary" onClick={() => { loadPackages(); loadAssignments(); loadStats(); }}>
                        <FiRefreshCw size={15} /> Refresh
                    </button>
                    <button className="pkg-btn pkg-btn-primary" onClick={() => openAssignModal()}>
                        <FiUserPlus size={15} /> Assign Package
                    </button>
                    <button className="pkg-btn pkg-btn-primary" onClick={openCreateModal}>
                        <FiPlus size={15} /> Create Package
                    </button>
                </div>
            </div>

            {/* ── Stats ──────────────────────────────────────────────── */}
            <div className="pkg-stats-grid">
                <div className="pkg-stat-card">
                    <div className="pkg-stat-icon accent"><FiPackage /></div>
                    <div className="pkg-stat-content">
                        <h3>{statsLoading ? '—' : stats?.totalPackages || 0}</h3>
                        <p>Total Packages</p>
                    </div>
                </div>
                <div className="pkg-stat-card">
                    <div className="pkg-stat-icon success"><FiCheck /></div>
                    <div className="pkg-stat-content">
                        <h3>{statsLoading ? '—' : stats?.activePackages || 0}</h3>
                        <p>Active Packages</p>
                    </div>
                </div>
                <div className="pkg-stat-card">
                    <div className="pkg-stat-icon info"><FiUsers /></div>
                    <div className="pkg-stat-content">
                        <h3>{statsLoading ? '—' : stats?.activeAssignments || 0}</h3>
                        <p>Active Assignments</p>
                    </div>
                </div>
                <div className="pkg-stat-card">
                    <div className="pkg-stat-icon warning"><FiTrendingUp /></div>
                    <div className="pkg-stat-content">
                        <h3>{statsLoading ? '—' : formatCurrency(stats?.totalRevenue)}</h3>
                        <p>Total Package Revenue</p>
                    </div>
                </div>
            </div>

            {/* ── Tabs ───────────────────────────────────────────────── */}
            <div className="pkg-tabs">
                <button className={`pkg-tab ${activeTab === 'packages' ? 'active' : ''}`} onClick={() => setActiveTab('packages')}>
                    <FiPackage size={15} /> Packages
                    <span className="tab-badge">{packages.length}</span>
                </button>
                <button className={`pkg-tab ${activeTab === 'assignments' ? 'active' : ''}`} onClick={() => setActiveTab('assignments')}>
                    <FiUsers size={15} /> Patient Assignments
                    <span className="tab-badge">{assignments.length}</span>
                </button>
            </div>

            {/* ── Toolbar ────────────────────────────────────────────── */}
            <div className="pkg-toolbar">
                <div className="pkg-search">
                    <FiSearch size={16} />
                    <input
                        placeholder={activeTab === 'packages' ? 'Search packages...' : 'Search assignments...'}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                {activeTab === 'packages' && (
                    <CustomSelect className="pkg-filter-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                        <option value="">All Categories</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </CustomSelect>
                )}
                {activeTab === 'assignments' && (
                    <CustomSelect className="pkg-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">All Status</option>
                        <option value="ACTIVE">Active</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="EXPIRED">Expired</option>
                        <option value="CANCELLED">Cancelled</option>
                    </CustomSelect>
                )}
            </div>

            {/* ── Content ────────────────────────────────────────────── */}
            {loading ? (
                <div className="pkg-loading">
                    <div className="pkg-spinner" />
                    <span>Loading...</span>
                </div>
            ) : activeTab === 'packages' ? (
                /* ── Packages Tab ─── */
                filteredPackages.length === 0 ? (
                    <div className="pkg-empty">
                        <FiPackage />
                        <h3>No packages found</h3>
                        <p>Create your first service package to get started</p>
                    </div>
                ) : (
                    <div className="pkg-grid">
                        {filteredPackages.map(pkg => {
                            const effective = pkg.discountedPrice != null ? pkg.discountedPrice : pkg.totalPrice;
                            const discount = pkg.discountedPrice != null && pkg.totalPrice > 0
                                ? Math.round(((pkg.totalPrice - pkg.discountedPrice) / pkg.totalPrice) * 100) : 0;
                            return (
                                <div key={pkg._id} className={`pkg-card ${!pkg.isActive ? 'inactive' : ''}`}>
                                    <div className="pkg-card-header">
                                        <div>
                                            <h3 className="pkg-card-title">{pkg.name}</h3>
                                            {pkg.code && <span className="pkg-card-code">{pkg.code}</span>}
                                        </div>
                                        <span className={`pkg-card-badge ${pkg.isActive ? 'active' : 'inactive'}`}>
                                            {pkg.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>

                                    <div className="pkg-card-category">
                                        <FiTag size={12} /> {pkg.category || 'General'}
                                    </div>

                                    {pkg.description && <p className="pkg-card-desc">{pkg.description}</p>}

                                    <div className="pkg-card-services">
                                        <div className="pkg-card-services-title">Included Services ({pkg.services?.length || 0})</div>
                                        <div className="pkg-card-services-list">
                                            {(pkg.services || []).slice(0, 5).map((s, i) => (
                                                <span key={i} className="pkg-service-chip">{s.serviceName}</span>
                                            ))}
                                            {(pkg.services?.length || 0) > 5 && (
                                                <span className="pkg-service-chip">+{pkg.services.length - 5} more</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="pkg-card-pricing">
                                        <span className="pkg-price-effective">{formatCurrency(effective)}</span>
                                        {discount > 0 && (
                                            <>
                                                <span className="pkg-price-original">{formatCurrency(pkg.totalPrice)}</span>
                                                <span className="pkg-price-discount">-{discount}%</span>
                                            </>
                                        )}
                                    </div>

                                    <div className="pkg-card-meta">
                                        <span className="pkg-card-meta-item"><FiCalendar size={12} /> {pkg.validityDays} days</span>
                                        <span className="pkg-card-meta-item"><FiUsers size={12} /> {pkg.totalAssignments || 0} assigned</span>
                                    </div>

                                    <div className="pkg-card-footer">
                                        {pkg.isActive && (
                                            <button className="pkg-btn pkg-btn-sm pkg-btn-success" onClick={() => openAssignModal(pkg)}>
                                                <FiUserPlus size={13} /> Assign
                                            </button>
                                        )}
                                        <button className="pkg-btn-icon" onClick={() => openEditModal(pkg)} title="Edit">
                                            <FiEdit2 size={14} />
                                        </button>
                                        <button
                                            className="pkg-btn-icon"
                                            onClick={() => handleTogglePackage(pkg)}
                                            title={pkg.isActive ? 'Deactivate' : 'Activate'}
                                        >
                                            {pkg.isActive ? <FiToggleRight size={14} style={{ color: '#22c55e' }} /> : <FiToggleLeft size={14} />}
                                        </button>
                                        <button
                                            className="pkg-btn-icon"
                                            onClick={() => setShowConfirmModal({ type: 'delete', item: pkg })}
                                            title="Delete"
                                        >
                                            <FiTrash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            ) : (
                /* ── Assignments Tab ─── */
                filteredAssignments.length === 0 ? (
                    <div className="pkg-empty">
                        <FiUsers />
                        <h3>No assignments found</h3>
                        <p>Assign a package to a patient to get started</p>
                    </div>
                ) : (
                    <div className="pkg-grid">
                        {filteredAssignments.map(a => {
                            const usagePct = getUsagePercent(a);
                            return (
                                <div key={a._id} className="pkg-assignment-card">
                                    <div className="pkg-assignment-header">
                                        <div>
                                            <h4 className="pkg-assignment-patient">{a.patientName || 'Unknown Patient'}</h4>
                                            <span className="pkg-assignment-mrn">MRN: {a.patientMRN || '—'}</span>
                                        </div>
                                        <span className={`pkg-status ${a.status?.toLowerCase()}`}>{a.status}</span>
                                    </div>

                                    <div className="pkg-assignment-pkg-name">
                                        <FiPackage size={13} /> {a.packageName}
                                        {a.packageCode && <span style={{ marginLeft: 6, opacity: 0.7 }}>({a.packageCode})</span>}
                                    </div>

                                    <div className="pkg-usage-bar-container">
                                        <div className="pkg-usage-bar-label">
                                            <span>Usage</span>
                                            <span>{usagePct}%</span>
                                        </div>
                                        <div className="pkg-usage-bar">
                                            <div
                                                className={`pkg-usage-bar-fill ${usagePct >= 100 ? 'full' : usagePct >= 75 ? 'high' : ''}`}
                                                style={{ width: `${Math.min(usagePct, 100)}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="pkg-assignment-details">
                                        <div className="pkg-assignment-detail">
                                            <label>Package Price</label>
                                            <span>{formatCurrency(a.effectivePrice)}</span>
                                        </div>
                                        <div className="pkg-assignment-detail">
                                            <label>Extra Charges</label>
                                            <span style={{ color: a.totalExtraCharges > 0 ? '#f59e0b' : undefined }}>{formatCurrency(a.totalExtraCharges)}</span>
                                        </div>
                                        <div className="pkg-assignment-detail">
                                            <label>Assigned</label>
                                            <span>{formatDate(a.assignedDate)}</span>
                                        </div>
                                        <div className="pkg-assignment-detail">
                                            <label>Expires</label>
                                            <span>{formatDate(a.expiryDate)}</span>
                                        </div>
                                    </div>

                                    <div className="pkg-card-footer">
                                        <button className="pkg-btn pkg-btn-sm pkg-btn-secondary" onClick={() => { setSelectedAssignment(a); setShowDetailModal(true); }}>
                                            <FiEye size={13} /> Details
                                        </button>
                                        {a.status === 'ACTIVE' && (
                                            <button className="pkg-btn pkg-btn-sm pkg-btn-danger" onClick={() => setShowConfirmModal({ type: 'cancelAssignment', item: a })}>
                                                <FiXCircle size={13} /> Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* CREATE / EDIT PACKAGE MODAL                                */}
            {/* ════════════════════════════════════════════════════════════ */}
            {showCreateModal && (
                <div className="pkg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCreateModal(false)}>
                    <div className="pkg-modal">
                        <div className="pkg-modal-header">
                            <h2><FiPackage /> {editingPackage ? 'Edit Package' : 'Create Package'}</h2>
                            <button className="pkg-btn-icon" onClick={() => setShowCreateModal(false)}><FiX size={18} /></button>
                        </div>
                        <div className="pkg-modal-body">
                            <div className="pkg-form-row">
                                <div className="pkg-form-group">
                                    <label>Package Name <span className="required">*</span></label>
                                    <input className="pkg-form-input" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Maternity Gold" />
                                </div>
                                <div className="pkg-form-group">
                                    <label>Code</label>
                                    <input className="pkg-form-input" value={formData.code} onChange={(e) => setFormData(p => ({ ...p, code: e.target.value }))} placeholder="e.g., MAT-GOLD" />
                                </div>
                            </div>

                            <div className="pkg-form-group">
                                <label>Description</label>
                                <textarea className="pkg-form-textarea" value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Package description..." />
                            </div>

                            <div className="pkg-form-row-3">
                                <div className="pkg-form-group">
                                    <label>Category</label>
                                    <CustomSelect className="pkg-form-select" value={formData.category} onChange={(e) => setFormData(p => ({ ...p, category: e.target.value }))}>
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </CustomSelect>
                                </div>
                                <div className="pkg-form-group">
                                    <label>Total Price (₹) <span className="required">*</span></label>
                                    <input className="pkg-form-input" type="number" min="0" value={formData.totalPrice} onChange={(e) => setFormData(p => ({ ...p, totalPrice: e.target.value }))} placeholder="0" />
                                </div>
                                <div className="pkg-form-group">
                                    <label>Discounted Price (₹)</label>
                                    <input className="pkg-form-input" type="number" min="0" value={formData.discountedPrice} onChange={(e) => setFormData(p => ({ ...p, discountedPrice: e.target.value }))} placeholder="Optional" />
                                </div>
                            </div>

                            <div className="pkg-form-group">
                                <label>Validity (Days)</label>
                                <input className="pkg-form-input" type="number" min="1" value={formData.validityDays} onChange={(e) => setFormData(p => ({ ...p, validityDays: e.target.value }))} />
                            </div>

                            {/* ── Services Builder ─── */}
                            <div className="pkg-services-builder">
                                <div className="pkg-services-builder-header">
                                    <h4>Included Services <span className="required">*</span></h4>
                                    <button className="pkg-btn pkg-btn-sm pkg-btn-secondary" onClick={addService}><FiPlus size={13} /> Add Service</button>
                                </div>

                                {formData.services.map((svc, idx) => (
                                    <div key={idx} className="pkg-service-row">
                                        <div className="pkg-service-row-top">
                                            <div>
                                                <label>Service Name <span className="required">*</span></label>
                                                <input value={svc.serviceName} onChange={(e) => updateService(idx, 'serviceName', e.target.value)} placeholder="e.g., Consultation" />
                                            </div>
                                            <div>
                                                <label>Category</label>
                                                <select value={svc.serviceCategory} onChange={(e) => updateService(idx, 'serviceCategory', e.target.value)}>
                                                    {SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <button className="pkg-service-remove" onClick={() => removeService(idx)} title="Remove"><FiTrash2 size={14} /></button>
                                        </div>
                                        <div className="pkg-service-row-bottom">
                                            <div>
                                                <label>Included Qty (-1 = unlimited)</label>
                                                <input type="number" min="-1" value={svc.includedQuantity} onChange={(e) => updateService(idx, 'includedQuantity', e.target.value)} />
                                            </div>
                                            <div>
                                                <label>Extra Charge/Unit (₹)</label>
                                                <input type="number" min="0" value={svc.extraChargePerUnit} onChange={(e) => updateService(idx, 'extraChargePerUnit', e.target.value)} />
                                            </div>
                                            <div>
                                                <label>Unit Price (₹)</label>
                                                <input type="number" min="0" value={svc.unitPrice} onChange={(e) => updateService(idx, 'unitPrice', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="pkg-modal-footer">
                            <button className="pkg-btn pkg-btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                            <button className="pkg-btn pkg-btn-primary" onClick={handleSavePackage} disabled={saving}>
                                {saving ? 'Saving...' : editingPackage ? 'Update Package' : 'Create Package'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* ASSIGN PACKAGE MODAL                                       */}
            {/* ════════════════════════════════════════════════════════════ */}
            {showAssignModal && (
                <div className="pkg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAssignModal(false)}>
                    <div className="pkg-modal" style={{ maxWidth: 540 }}>
                        <div className="pkg-modal-header">
                            <h2><FiUserPlus /> Assign Package to Patient</h2>
                            <button className="pkg-btn-icon" onClick={() => setShowAssignModal(false)}><FiX size={18} /></button>
                        </div>
                        <div className="pkg-modal-body">
                            <div className="pkg-form-group">
                                <label>Select Package <span className="required">*</span></label>
                                <select
                                    className="pkg-form-select"
                                    value={assignFormData.packageId}
                                    onChange={(e) => setAssignFormData(p => ({ ...p, packageId: e.target.value }))}
                                >
                                    <option value="">— Choose a package —</option>
                                    {packages.filter(p => p.isActive).map(p => (
                                        <option key={p._id} value={p._id}>
                                            {p.name} — {formatCurrency(p.discountedPrice != null ? p.discountedPrice : p.totalPrice)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="pkg-form-group">
                                <label>Search Patient <span className="required">*</span></label>
                                <div className="pkg-search" style={{ marginBottom: 4 }}>
                                    <FiSearch size={16} />
                                    <input
                                        placeholder="Search by name, phone, MRN..."
                                        value={patientSearch}
                                        onChange={(e) => { setPatientSearch(e.target.value); setAssignFormData(p => ({ ...p, patientId: '' })); }}
                                    />
                                    {searchingPatients && <div className="pkg-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />}
                                </div>
                                {assignFormData.patientId && (
                                    <div style={{ fontSize: '0.82rem', color: '#22c55e', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <FiCheck size={14} /> Patient selected
                                    </div>
                                )}
                                {patientResults.length > 0 && !assignFormData.patientId && (
                                    <div className="pkg-patient-dropdown">
                                        {patientResults.map(pt => (
                                            <div
                                                key={pt._id}
                                                className="pkg-patient-dropdown-item"
                                                onClick={() => { setAssignFormData(p => ({ ...p, patientId: pt._id })); setPatientSearch(pt.name); setPatientResults([]); }}
                                            >
                                                <div className="pkg-patient-item-name">{pt.name}</div>
                                                <div className="pkg-patient-item-meta">
                                                    {pt.mrn || pt.patientId || ''} • {pt.phone || ''}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pkg-form-group">
                                <label>Notes</label>
                                <textarea
                                    className="pkg-form-textarea"
                                    value={assignFormData.notes}
                                    onChange={(e) => setAssignFormData(p => ({ ...p, notes: e.target.value }))}
                                    placeholder="Optional notes..."
                                    style={{ minHeight: 60 }}
                                />
                            </div>
                        </div>
                        <div className="pkg-modal-footer">
                            <button className="pkg-btn pkg-btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
                            <button className="pkg-btn pkg-btn-primary" onClick={handleAssignPackage} disabled={saving || !assignFormData.packageId || !assignFormData.patientId}>
                                {saving ? 'Assigning...' : 'Assign Package'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* ASSIGNMENT DETAIL MODAL                                     */}
            {/* ════════════════════════════════════════════════════════════ */}
            {showDetailModal && selectedAssignment && (
                <div className="pkg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowDetailModal(false)}>
                    <div className="pkg-modal" style={{ maxWidth: 600 }}>
                        <div className="pkg-modal-header">
                            <h2><FiFileText /> Assignment Details</h2>
                            <button className="pkg-btn-icon" onClick={() => setShowDetailModal(false)}><FiX size={18} /></button>
                        </div>
                        <div className="pkg-modal-body">
                            <div className="pkg-detail-header-row">
                                <div>
                                    <h3 className="pkg-detail-patient-name">{selectedAssignment.patientName}</h3>
                                    <span className="pkg-detail-patient-mrn">MRN: {selectedAssignment.patientMRN || '—'}</span>
                                </div>
                                <span className={`pkg-status ${selectedAssignment.status?.toLowerCase()}`}>{selectedAssignment.status}</span>
                            </div>

                            <div className="pkg-detail-box">
                                <div className="pkg-detail-box-title">
                                    <FiPackage style={{ marginRight: 6 }} />{selectedAssignment.packageName}
                                </div>
                                <div className="pkg-assignment-details" style={{ margin: 0 }}>
                                    <div className="pkg-assignment-detail">
                                        <label>Effective Price</label>
                                        <span>{formatCurrency(selectedAssignment.effectivePrice)}</span>
                                    </div>
                                    <div className="pkg-assignment-detail">
                                        <label>Extra Charges</label>
                                        <span>{formatCurrency(selectedAssignment.totalExtraCharges)}</span>
                                    </div>
                                    <div className="pkg-assignment-detail">
                                        <label>Assigned</label>
                                        <span>{formatDate(selectedAssignment.assignedDate)}</span>
                                    </div>
                                    <div className="pkg-assignment-detail">
                                        <label>Expires</label>
                                        <span>{formatDate(selectedAssignment.expiryDate)}</span>
                                    </div>
                                    <div className="pkg-assignment-detail">
                                        <label>Assigned By</label>
                                        <span>{selectedAssignment.assignedByName || '—'}</span>
                                    </div>
                                    <div className="pkg-assignment-detail">
                                        <label>Validity</label>
                                        <span>{selectedAssignment.validityDays} days</span>
                                    </div>
                                </div>
                            </div>

                            <div className="pkg-detail-services">
                                <h4 className="pkg-detail-section-title">Service Usage</h4>
                                {(selectedAssignment.snapshotServices || []).map((s, i) => (
                                    <div key={i} className="pkg-detail-service-item">
                                        <div>
                                            <div className="pkg-detail-service-name">{s.serviceName}</div>
                                            <div className="pkg-detail-service-meta">
                                                {s.serviceCategory} • Extra: {formatCurrency(s.extraChargePerUnit)}/unit
                                            </div>
                                        </div>
                                        <div className="pkg-detail-service-usage">
                                            <div className="qty">{s.usedQuantity} / {s.includedQuantity === -1 ? '∞' : s.includedQuantity}</div>
                                            <div className="label">used</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {(selectedAssignment.usageLog || []).length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <h4 className="pkg-detail-section-title">Usage Log ({selectedAssignment.usageLog.length})</h4>
                                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                        {selectedAssignment.usageLog.map((log, i) => (
                                            <div key={i} className="pkg-usage-log-card">
                                                <div className="pkg-usage-log-row">
                                                    <span className="pkg-usage-log-name">{log.serviceName} × {log.quantity}</span>
                                                    {log.isExtra && <span className="pkg-usage-log-extra">Extra: {formatCurrency(log.extraAmount)}</span>}
                                                </div>
                                                <div className="pkg-usage-log-meta">
                                                    {formatDate(log.loggedAt)} {log.loggedByName && `• by ${log.loggedByName}`}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="pkg-modal-footer">
                            <button className="pkg-btn pkg-btn-secondary" onClick={() => setShowDetailModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* CONFIRM DIALOG                                              */}
            {/* ════════════════════════════════════════════════════════════ */}
            {showConfirmModal && (
                <div className="pkg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowConfirmModal(null)}>
                    <div className="pkg-modal" style={{ maxWidth: 420 }}>
                        <div className="pkg-modal-body">
                            <div className="pkg-confirm-content">
                                <FiAlertCircle style={{ color: showConfirmModal.type === 'delete' ? '#ef4444' : '#f59e0b' }} />
                                <h3>
                                    {showConfirmModal.type === 'delete' ? 'Delete Package?' : 'Cancel Assignment?'}
                                </h3>
                                <p>
                                    {showConfirmModal.type === 'delete'
                                        ? `Are you sure you want to delete "${showConfirmModal.item.name}"? This cannot be undone.`
                                        : `Cancel the package assignment for "${showConfirmModal.item.patientName}"?`
                                    }
                                </p>
                            </div>
                        </div>
                        <div className="pkg-modal-footer" style={{ justifyContent: 'center' }}>
                            <button className="pkg-btn pkg-btn-secondary" onClick={() => setShowConfirmModal(null)}>No, Go Back</button>
                            <button
                                className="pkg-btn pkg-btn-danger"
                                onClick={() => {
                                    if (showConfirmModal.type === 'delete') handleDeletePackage(showConfirmModal.item);
                                    else handleCancelAssignment(showConfirmModal.item);
                                }}
                            >
                                {showConfirmModal.type === 'delete' ? 'Yes, Delete' : 'Yes, Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PackageManagement;
