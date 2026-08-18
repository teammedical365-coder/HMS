import React, { useState, useEffect } from 'react';
import { bedAPI } from '../../utils/api';
import { FiPlus, FiTrash2, FiEdit2 } from 'react-icons/fi';

const BedManagement = () => {
    const [beds, setBeds] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Filters
    const [filterWard, setFilterWard] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    
    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBed, setEditingBed] = useState(null);
    const [formData, setFormData] = useState({
        bedNumber: '',
        ward: '',
        bedType: 'General',
        status: 'AVAILABLE'
    });

    useEffect(() => {
        fetchBeds();
    }, [filterWard, filterStatus]);

    const fetchBeds = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filterWard) params.ward = filterWard;
            if (filterStatus) params.status = filterStatus;
            
            const res = await bedAPI.getBeds(params);
            if (res.success) {
                setBeds(res.beds);
            }
        } catch (error) {
            console.error("Error fetching beds:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (bed = null) => {
        if (bed) {
            setEditingBed(bed);
            setFormData({
                bedNumber: bed.bedNumber,
                ward: bed.ward,
                bedType: bed.bedType,
                status: bed.status
            });
        } else {
            setEditingBed(null);
            setFormData({
                bedNumber: '',
                ward: '',
                bedType: 'General',
                status: 'AVAILABLE'
            });
        }
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingBed) {
                await bedAPI.updateBed(editingBed._id, formData);
            } else {
                await bedAPI.createBed(formData);
            }
            setModalOpen(false);
            fetchBeds();
        } catch (error) {
            alert(error.response?.data?.message || 'Error saving bed');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this bed?')) return;
        try {
            await bedAPI.deleteBed(id);
            fetchBeds();
        } catch (error) {
            alert(error.response?.data?.message || 'Error deleting bed');
        }
    };

    // Group beds by ward for rendering
    const groupedBeds = beds.reduce((acc, bed) => {
        if (!acc[bed.ward]) acc[bed.ward] = [];
        acc[bed.ward].push(bed);
        return acc;
    }, {});

    return (
        <div style={{ padding: '20px', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ margin: 0, color: '#1e293b' }}>🛏️ Bed Management</h2>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>Manage hospital beds, wards, and occupancy status.</p>
                </div>
                <button 
                    onClick={() => handleOpenModal()}
                    style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
                >
                    <FiPlus /> Add New Bed
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Filter by Ward</label>
                    <select 
                        value={filterWard} 
                        onChange={e => setFilterWard(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                    >
                        <option value="">All Wards</option>
                        {Array.from(new Set(beds.map(b => b.ward))).map(w => (
                            <option key={w} value={w}>{w}</option>
                        ))}
                    </select>
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Filter by Status</label>
                    <select 
                        value={filterStatus} 
                        onChange={e => setFilterStatus(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                    >
                        <option value="">All Statuses</option>
                        <option value="AVAILABLE">Available</option>
                        <option value="OCCUPIED">Occupied</option>
                        <option value="MAINTENANCE">Maintenance</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <p>Loading beds...</p>
            ) : Object.keys(groupedBeds).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <p style={{ color: '#64748b' }}>No beds found. Create some beds to get started.</p>
                </div>
            ) : (
                Object.entries(groupedBeds).map(([wardName, wardBeds]) => (
                    <div key={wardName} style={{ marginBottom: '32px' }}>
                        <h3 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            🏥 {wardName} 
                            <span style={{ fontSize: '0.8rem', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', color: '#64748b', fontWeight: 600 }}>{wardBeds.length} Beds</span>
                        </h3>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
                            {wardBeds.map(bed => (
                                <div key={bed._id} style={{ 
                                    background: '#fff', 
                                    borderRadius: '12px', 
                                    border: `1px solid ${bed.status === 'AVAILABLE' ? '#bbf7d0' : bed.status === 'OCCUPIED' ? '#fecaca' : '#fde68a'}`,
                                    borderLeft: `5px solid ${bed.status === 'AVAILABLE' ? '#22c55e' : bed.status === 'OCCUPIED' ? '#ef4444' : '#f59e0b'}`,
                                    padding: '16px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <h4 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>{bed.bedNumber}</h4>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px', color: '#64748b', fontWeight: 600 }}>{bed.bedType}</span>
                                            </div>
                                            <span style={{ 
                                                display: 'inline-block', marginTop: '6px', fontSize: '0.75rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px',
                                                background: bed.status === 'AVAILABLE' ? '#dcfce7' : bed.status === 'OCCUPIED' ? '#fee2e2' : '#fef3c7',
                                                color: bed.status === 'AVAILABLE' ? '#166534' : bed.status === 'OCCUPIED' ? '#991b1b' : '#92400e',
                                            }}>
                                                {bed.status}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => handleOpenModal(bed)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                                <FiEdit2 size={14} />
                                            </button>
                                            <button onClick={() => handleDelete(bed._id)} disabled={bed.status === 'OCCUPIED'} style={{ background: bed.status === 'OCCUPIED' ? '#f1f5f9' : '#fef2f2', border: 'none', width: '32px', height: '32px', borderRadius: '6px', cursor: bed.status === 'OCCUPIED' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: bed.status === 'OCCUPIED' ? '#cbd5e1' : '#ef4444' }}>
                                                <FiTrash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {bed.status === 'OCCUPIED' && bed.currentPatient ? (
                                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: 'auto' }}>
                                            <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '4px' }}><strong>Patient:</strong> {bed.currentPatient.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}><strong>MRN:</strong> {bed.currentPatient.patientId || bed.currentPatient.mrn || 'N/A'}</div>
                                            {bed.currentAdmission && (
                                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}><strong>Admitted:</strong> {new Date(bed.currentAdmission.admissionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ marginTop: 'auto', padding: '12px 0 0 0', fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                            Ready for admission
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            )}

            {/* Modal */}
            {modalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>{editingBed ? 'Edit Bed' : 'Add New Bed'}</h3>
                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Bed Number</label>
                                <input 
                                    type="text" 
                                    value={formData.bedNumber}
                                    onChange={e => setFormData({...formData, bedNumber: e.target.value})}
                                    placeholder="e.g. B-101"
                                    required
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Ward Name</label>
                                <input 
                                    type="text" 
                                    value={formData.ward}
                                    onChange={e => setFormData({...formData, ward: e.target.value})}
                                    placeholder="e.g. General Ward"
                                    required
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Bed Type</label>
                                <select 
                                    value={formData.bedType}
                                    onChange={e => setFormData({...formData, bedType: e.target.value})}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                >
                                    <option value="General">General</option>
                                    <option value="ICU">ICU</option>
                                    <option value="Private">Private</option>
                                    <option value="Semi-Private">Semi-Private</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            
                            {editingBed && (
                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Status</label>
                                    <select 
                                        value={formData.status}
                                        onChange={e => setFormData({...formData, status: e.target.value})}
                                        disabled={editingBed.status === 'OCCUPIED' || formData.status === 'OCCUPIED'}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', background: (editingBed.status === 'OCCUPIED' || formData.status === 'OCCUPIED') ? '#f1f5f9' : '#fff' }}
                                    >
                                        <option value="AVAILABLE">Available</option>
                                        <option value="OCCUPIED">Occupied (Set via Admission)</option>
                                        <option value="MAINTENANCE">Maintenance</option>
                                    </select>
                                </div>
                            )}
                            
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: editingBed ? '0' : '24px' }}>
                                <button type="button" onClick={() => setModalOpen(false)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ padding: '10px 16px', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Save Bed</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BedManagement;
