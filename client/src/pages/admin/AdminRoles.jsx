import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../utils/api';
import './AdminRoles.css';

const AdminRoles = () => {
    const [roles, setRoles] = useState([]);
    const [formData, setFormData] = useState({
        name: '', description: '', permissions: [],
        dashboardPath: '/', navLinks: [{ label: '', path: '' }]
    });
    const [editingRoleId, setEditingRoleId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Organized Permissions List
    const PERMISSIONS = [
        {
            category: "Patient Management", items: [
                { key: 'patient_create', label: 'Register New Patients' },
                { key: 'patient_search', label: 'Search Patient Database' },
                { key: 'patient_view', label: 'View Patient Profiles' },
                { key: 'patient_edit', label: 'Edit Patient Profiles' }
            ]
        },
        {
            category: "Clinical & Medical", items: [
                { key: 'visit_intake', label: 'Nurse Intake (Vitals & History)' },
                { key: 'visit_diagnose', label: 'Doctor Diagnosis & Prescription' },
                { key: 'clinical_history_view', label: 'View Medical History' }
            ]
        },
        {
            category: "Operations", items: [
                { key: 'appointment_manage', label: 'Manage Appointments' },
                { key: 'appointment_view_all', label: 'View All Appointments' },
                { key: 'lab_view', label: 'View Lab Tests' },
                { key: 'lab_manage', label: 'Manage Lab Tests' },
                { key: 'pharmacy_view', label: 'View Pharmacy' },
                { key: 'pharmacy_manage', label: 'Pharmacy & Inventory' }
            ]
        },
        {
            category: "Admin", items: [
                { key: 'admin_manage_roles', label: 'Manage Roles' },
                { key: 'admin_view_stats', label: 'View Admin Stats' }
            ]
        }
    ];

    // ─── Permission → Nav Link Auto-Mapping ───
    // Each permission gets its own unique nav label so users can see all their
    // available features in the navbar. De-duplicated by label (not path).
    const PERMISSION_NAV_MAP = {
        // Patient Management
        patient_create: { label: 'Patient Registration', path: '/reception/dashboard' },
        patient_search: { label: 'Patient Search', path: '/doctor/patients' },
        patient_view: { label: 'Patient Records', path: '/doctor/patients' },
        patient_edit: { label: 'Edit Patients', path: '/doctor/patients' },
        // Clinical & Medical
        visit_intake: { label: 'Nurse Intake', path: '/reception/dashboard' },
        visit_diagnose: { label: 'Consultations', path: '/doctor/patients' },
        clinical_history_view: { label: 'Medical History', path: '/doctor/patients' },
        // Operations
        appointment_manage: { label: 'Reception', path: '/reception/dashboard' },
        appointment_view_all: { label: 'All Appointments', path: '/reception/dashboard' },
        lab_view: { label: 'Lab Dashboard', path: '/lab/dashboard' },
        lab_manage: { label: 'Lab Tests', path: '/lab/tests' },
        pharmacy_view: { label: 'Pharmacy', path: '/pharmacy/inventory' },
        pharmacy_manage: { label: 'Pharmacy Orders', path: '/pharmacy/orders' },
        // Admin
        admin_manage_roles: { label: 'Manage Users', path: '/admin/users' },
        admin_view_stats: { label: 'Admin Dashboard', path: '/admin' },
    };

    // Compute nav links from current permissions (one link per permission, de-duped by label)
    const getAutoNavLinks = (permissions) => {
        const seen = new Set();
        const links = [];
        permissions.forEach(perm => {
            const mapping = PERMISSION_NAV_MAP[perm];
            if (mapping && !seen.has(mapping.label)) {
                seen.add(mapping.label);
                links.push({ label: mapping.label, path: mapping.path });
            }
        });
        // Also add Roles link if admin_manage_roles is present
        if (permissions.includes('admin_manage_roles') && !seen.has('Manage Roles')) {
            links.push({ label: 'Manage Roles', path: '/admin/roles' });
        }
        return links;
    };

    useEffect(() => {
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        try {
            const res = await adminAPI.getRoles();
            if (res.success) setRoles(res.data);
        } catch (err) {
            console.error("Error fetching roles", err);
        }
    };

    const handlePermissionToggle = (key) => {
        setFormData(prev => {
            const exists = prev.permissions.includes(key);
            const newPerms = exists
                ? prev.permissions.filter(p => p !== key)
                : [...prev.permissions, key];
            const autoLinks = getAutoNavLinks(newPerms);
            return {
                ...prev,
                permissions: newPerms,
                navLinks: autoLinks,
                dashboardPath: autoLinks.length > 0 ? autoLinks[0].path : '/'
            };
        });
    };

    // Manual nav link helpers removed — links are now auto-generated from permissions

    const resetForm = () => {
        setFormData({
            name: '', description: '', permissions: [],
            dashboardPath: '/', navLinks: []
        });
        setEditingRoleId(null);
    };

    const handleEdit = (role) => {
        setEditingRoleId(role._id);
        const perms = role.permissions || [];
        const autoLinks = getAutoNavLinks(perms);
        setFormData({
            name: role.name,
            description: role.description || '',
            permissions: perms,
            dashboardPath: role.dashboardPath || (autoLinks.length > 0 ? autoLinks[0].path : '/'),
            navLinks: autoLinks
        });
        setMessage({ type: '', text: '' });
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        // Filter out empty nav links
        const cleanedData = {
            ...formData,
            navLinks: formData.navLinks.filter(l => l.label.trim() && l.path.trim())
        };

        try {
            if (editingRoleId) {
                await adminAPI.updateRole(editingRoleId, cleanedData);
                setMessage({ type: 'success', text: 'Role updated successfully!' });
            } else {
                await adminAPI.createRole(cleanedData);
                setMessage({ type: 'success', text: 'Role created successfully!' });
            }
            resetForm();
            fetchRoles();
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.message || 'Error saving role' });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure? This will remove the role permanently.")) return;
        try {
            await adminAPI.deleteRole(id);
            fetchRoles();
            setMessage({ type: 'success', text: 'Role deleted successfully!' });
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete role' });
        }
    };

    return (
        <div className="roles-page-container">
            <header className="roles-header">
                <h1>Role & Permission Manager</h1>
                <p>Define custom access levels for your hospital staff.</p>
            </header>

            <div className="roles-grid">
                {/* --- LEFT COLUMN: CREATE/EDIT FORM --- */}
                <div className="role-card create-card">
                    <div className="card-header">
                        <h2>{editingRoleId ? 'Edit Role' : 'Create New Role'}</h2>
                        {editingRoleId && (
                            <button onClick={resetForm} className="btn-cancel" style={{ marginLeft: 'auto' }}>
                                Cancel Edit
                            </button>
                        )}
                    </div>

                    {message.text && (
                        <div className={`status-message ${message.type}`}>
                            {message.type === 'success' ? '✔' : '⚠'} {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Role Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Senior Nurse"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="What is this role for?"
                            />
                        </div>
                        {/* Auto-generated Nav Links Preview */}
                        <div className="form-group">
                            <label>Auto-Generated Navigation</label>
                            <small style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '10px' }}>
                                These links are automatically created from the permissions you assign below.
                                The first link will be used as the default dashboard page.
                            </small>
                            {formData.navLinks.length > 0 ? (
                                <div className="auto-nav-preview">
                                    {formData.navLinks.map((link, index) => (
                                        <div key={link.path} className="auto-nav-item">
                                            <span className="auto-nav-label">{link.label}</span>
                                            <span className="auto-nav-path">{link.path}</span>
                                            {index === 0 && <span className="auto-nav-default">Default</span>}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="auto-nav-empty">
                                    Select permissions below to auto-generate navigation links
                                </div>
                            )}
                        </div>

                        <div className="permissions-section">
                            <label className="section-label">Assign Permissions</label>
                            <div className="permissions-list">
                                {PERMISSIONS.map((category) => (
                                    <div key={category.category} className="perm-category">
                                        <h4 className="category-title">{category.category}</h4>
                                        {category.items.map(p => (
                                            <label key={p.key} className="perm-item">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.permissions.includes(p.key)}
                                                    onChange={() => handlePermissionToggle(p.key)}
                                                />
                                                <span className="perm-text">{p.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button type="submit" disabled={loading} className="btn-create">
                            {loading ? 'Saving...' : editingRoleId ? 'Update Role' : 'Create Role'}
                        </button>
                    </form>
                </div>

                {/* --- RIGHT COLUMN: EXISTING ROLES --- */}
                <div className="role-card list-card">
                    <div className="card-header">
                        <h2>Active Roles</h2>
                        <span className="role-count">{roles.length} roles found</span>
                    </div>

                    <div className="roles-list">
                        {roles.length === 0 && <div className="empty-state">No roles defined yet. Create one!</div>}

                        {roles.map(role => (
                            <div key={role._id} className="role-item">
                                <div className="role-info">
                                    <div className="role-title-row">
                                        <h3>{role.name}</h3>
                                        <span className="perm-badge">{role.permissions?.length || 0} perms</span>
                                        {role.userCount > 0 && (
                                            <span className="perm-badge" style={{ background: '#1890ff20', color: '#1890ff' }}>
                                                {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {role.isSystemRole && (
                                            <span className="perm-badge" style={{ background: '#faad1420', color: '#faad14' }}>
                                                System
                                            </span>
                                        )}
                                    </div>
                                    <p className="role-desc">{role.description || "No description provided."}</p>
                                    {role.dashboardPath && (
                                        <p className="role-desc" style={{ fontSize: '11px', color: '#888' }}>
                                            Dashboard: {role.dashboardPath}
                                        </p>
                                    )}

                                    <div className="role-tags">
                                        {(role.permissions || []).slice(0, 3).map(p => (
                                            <span key={p} className="tag">{p.replace(/_/g, ' ')}</span>
                                        ))}
                                        {(role.permissions || []).length > 3 && <span className="tag more">+{role.permissions.length - 3} more</span>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => handleEdit(role)} className="btn-icon-delete" title="Edit Role"
                                        style={{ background: '#1890ff20', color: '#1890ff' }}>
                                        ✏️
                                    </button>
                                    {!role.isSystemRole && (
                                        <button onClick={() => handleDelete(role._id)} className="btn-icon-delete" title="Delete Role">
                                            🗑
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminRoles;