import React, { useState, useEffect } from 'react';
import LabLayout from '../../components/lab/LabLayout';
import { labAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import { FiMapPin, FiPlus, FiEdit2, FiCheckCircle, FiXCircle, FiHome, FiPhone, FiMail, FiUser } from 'react-icons/fi';

const LabLocationsPage = () => {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingLoc, setEditingLoc] = useState(null);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        locationName: '',
        locationCode: '',
        locationType: 'COLLECTION_CENTRE',
        address: '',
        contactPerson: '',
        phone: '',
        email: '',
        isProcessingLab: false
    });

    useEffect(() => {
        loadLocations();
    }, []);

    const loadLocations = async () => {
        setLoading(true);
        try {
            const res = await labAPI.getLocations();
            if (res.success) {
                setLocations(res.locations || []);
            }
        } catch (err) {
            toast.error('Failed to load laboratory locations');
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingLoc(null);
        setForm({
            locationName: '',
            locationCode: '',
            locationType: 'COLLECTION_CENTRE',
            address: '',
            contactPerson: '',
            phone: '',
            email: '',
            isProcessingLab: false
        });
        setModalOpen(true);
    };

    const openEditModal = (loc) => {
        setEditingLoc(loc);
        setForm({
            locationName: loc.locationName || '',
            locationCode: loc.locationCode || '',
            locationType: loc.locationType || 'COLLECTION_CENTRE',
            address: loc.address || '',
            contactPerson: loc.contactPerson || '',
            phone: loc.phone || '',
            email: loc.email || '',
            isProcessingLab: Boolean(loc.isProcessingLab)
        });
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editingLoc) {
                const res = await labAPI.updateLocation(editingLoc._id, form);
                if (res.success) {
                    toast.success('Location updated successfully!');
                    setModalOpen(false);
                    loadLocations();
                }
            } else {
                const res = await labAPI.createLocation(form);
                if (res.success) {
                    toast.success('Laboratory location created successfully!');
                    setModalOpen(false);
                    loadLocations();
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save laboratory location');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = async (loc) => {
        try {
            const res = await labAPI.updateLocationStatus(loc._id, !loc.isActive);
            if (res.success) {
                toast.success(`Location ${!loc.isActive ? 'activated' : 'deactivated'} successfully`);
                loadLocations();
            }
        } catch (err) {
            toast.error('Failed to change location status');
        }
    };

    return (
        <LabLayout
            title="Laboratory Locations"
            subtitle="Manage central processing laboratories, satellite collection centres, and branch facilities."
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Network Locations</h2>
                    <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Registered sample accessioning and specimen intake locations.</p>
                </div>
                <button onClick={openCreateModal} className="lms-btn lms-btn-primary">
                    <FiPlus /> Add Laboratory Location
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading locations...</div>
            ) : locations.length === 0 ? (
                <div className="lms-section-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📍</div>
                    <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>No Laboratory Locations Registered</h3>
                    <p style={{ color: '#64748b', fontSize: '13.5px', maxWidth: '420px', margin: '0 auto 20px' }}>
                        Create your hospital's central processing laboratory or collection centres to organize phlebotomy and specimen tracking.
                    </p>
                    <button onClick={openCreateModal} className="lms-btn lms-btn-primary">
                        <FiPlus /> Register First Location
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '18px' }}>
                    {locations.map(loc => (
                        <div
                            key={loc._id}
                            style={{
                                background: '#ffffff',
                                border: loc.isProcessingLab ? '2px solid #0ea5e9' : '1px solid #e2e8f0',
                                borderRadius: '14px',
                                padding: '20px',
                                position: 'relative',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                                opacity: loc.isActive ? 1 : 0.65
                            }}
                        >
                            {loc.isProcessingLab && (
                                <div style={{ position: 'absolute', top: '14px', right: '14px', background: '#e0f2fe', color: '#0284c7', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '12px' }}>
                                    PRIMARY PROCESSING LAB
                                </div>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: loc.isProcessingLab ? '#f0f9ff' : '#f8fafc', color: loc.isProcessingLab ? '#0284c7' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                                    <FiMapPin />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{loc.locationName}</h4>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0ea5e9' }}>{loc.locationCode}</span>
                                    <span style={{ fontSize: '11.5px', color: '#64748b', marginLeft: '8px' }}>({loc.locationType.replace('_', ' ')})</span>
                                </div>
                            </div>

                            {loc.address && (
                                <p style={{ fontSize: '12.5px', color: '#475569', margin: '0 0 10px', lineHeight: 1.4 }}>
                                    {loc.address}
                                </p>
                            )}

                            <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                                {loc.contactPerson && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <FiUser /> {loc.contactPerson}
                                    </div>
                                )}
                                {loc.phone && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <FiPhone /> {loc.phone}
                                    </div>
                                )}
                                {loc.email && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <FiMail /> {loc.email}
                                    </div>
                                )}
                                <div style={{ marginTop: '4px', color: '#0f172a', fontWeight: 600 }}>
                                    👥 Assigned Staff: {loc.staffCount || 0}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                                <button
                                    onClick={() => handleToggleStatus(loc)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        color: loc.isActive ? '#16a34a' : '#94a3b8',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {loc.isActive ? <FiCheckCircle /> : <FiXCircle />}
                                    {loc.isActive ? 'Active Location' : 'Deactivated'}
                                </button>
                                <button
                                    onClick={() => openEditModal(loc)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        padding: '5px 12px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        color: '#334155',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <FiEdit2 /> Edit
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* CREATE / EDIT LOCATION MODAL */}
            {modalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div style={{ background: '#ffffff', borderRadius: '16px', maxWidth: '520px', width: '100%', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
                        <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>
                            {editingLoc ? 'Edit Laboratory Location' : 'Add Laboratory Location'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>Location Name *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.locationName}
                                    onChange={e => setForm({ ...form, locationName: e.target.value })}
                                    placeholder="e.g. Central Clinical Laboratory"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>Location Code *</label>
                                    <input
                                        type="text"
                                        required
                                        value={form.locationCode}
                                        onChange={e => setForm({ ...form, locationCode: e.target.value.toUpperCase() })}
                                        placeholder="e.g. LAB-MAIN"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px', textTransform: 'uppercase' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>Facility Type *</label>
                                    <select
                                        value={form.locationType}
                                        onChange={e => setForm({ ...form, locationType: e.target.value })}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px' }}
                                    >
                                        <option value="PROCESSING_LAB">Processing Lab</option>
                                        <option value="COLLECTION_CENTRE">Collection Centre</option>
                                        <option value="BRANCH">Branch Facility</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>Address</label>
                                <input
                                    type="text"
                                    value={form.address}
                                    onChange={e => setForm({ ...form, address: e.target.value })}
                                    placeholder="e.g. 2nd Floor, Diagnostic Wing, Block B"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>Contact Person</label>
                                    <input
                                        type="text"
                                        value={form.contactPerson}
                                        onChange={e => setForm({ ...form, contactPerson: e.target.value })}
                                        placeholder="Supervisor Name"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>Phone Number</label>
                                    <input
                                        type="text"
                                        value={form.phone}
                                        onChange={e => setForm({ ...form, phone: e.target.value })}
                                        placeholder="e.g. 9876543210"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px' }}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#0f172a', fontWeight: 600, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={form.isProcessingLab}
                                        onChange={e => setForm({ ...form, isProcessingLab: e.target.checked })}
                                    />
                                    Designate as Primary Specimen Processing Lab
                                </label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    style={{ padding: '9px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    {saving ? 'Saving...' : 'Save Location'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </LabLayout>
    );
};

export default LabLocationsPage;
