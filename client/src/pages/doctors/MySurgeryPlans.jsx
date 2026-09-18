import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FiFileText, FiSearch, FiRefreshCw, 
    FiCalendar, FiUser, FiArrowRight
} from 'react-icons/fi';
import { otAPI } from '../../utils/api';
import './Patient.css';

const MySurgeryPlans = () => {
    const navigate = useNavigate();
    const [surgeryPlans, setSurgeryPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const fetchSurgeryPlans = async () => {
        setLoading(true);
        try {
            const res = await otAPI.getMySurgeryPlans();
            if (res.success && Array.isArray(res.data)) {
                setSurgeryPlans(res.data);
            } else {
                setSurgeryPlans([]);
            }
        } catch (err) {
            console.error('Error fetching surgery plans:', err);
            setSurgeryPlans([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSurgeryPlans();
    }, []);

    const q = searchQuery.toLowerCase().trim();
    const filtered = surgeryPlans.filter(sp => {
        const surgery = sp.surgery || '';
        const planId = sp.planId || '';
        const pName = sp.patientId?.name || '';
        const pMrn = sp.patientId?.mrn || '';
        const dx = sp.diagnosis || '';
        const otName = sp.otRoomId?.name || '';

        const matchesQuery = !q || (
            surgery.toLowerCase().includes(q) ||
            planId.toLowerCase().includes(q) ||
            pName.toLowerCase().includes(q) ||
            pMrn.toLowerCase().includes(q) ||
            dx.toLowerCase().includes(q) ||
            otName.toLowerCase().includes(q)
        );

        const status = (sp.status || '').toLowerCase();
        const matchesStatus = statusFilter === 'all' || status === statusFilter.toLowerCase();

        return matchesQuery && matchesStatus;
    });

    const handleViewProfile = (sp) => {
        const targetId = sp.patientId?._id || sp.patientId?.patientId || sp.patientId?.mrn || sp._id;
        const dept = sp.department || 'Surgery';
        if (targetId) {
            navigate(`/patient/${targetId}/department/${encodeURIComponent(dept)}`);
        }
    };

    const currentDate = new Date();
    const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    return (
        <div className="doc-exact-patients-page">
            {/* Header Banner */}
            <div className="doc-modern-banner">
                <div className="doc-banner-left">
                    <div className="doc-title-row">
                        <h1 className="doc-exact-title">My Surgery Plans</h1>
                        <span className="doc-role-badge">DOCTOR</span>
                        <span className="doc-count-pill">{surgeryPlans.length} Plans</span>
                    </div>
                    <p className="doc-exact-subtitle">
                        Track planned surgical procedures, OT suite bookings, surgical teams, and patient operational status.
                    </p>
                </div>

                <div className="doc-banner-right">
                    <div className="doc-date-card">
                        <div className="doc-date-icon-wrap">
                            <FiCalendar className="doc-date-icon" />
                        </div>
                        <div className="doc-date-info">
                            <span className="doc-date-day">{dayName}</span>
                            <span className="doc-date-full">{formattedDate}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter & Search Toolbar */}
            <div className="doc-toolbar-card">
                <div className="doc-search-pill-container">
                    <FiSearch className="doc-search-pill-icon" />
                    <input
                        type="text"
                        placeholder="Search procedure, plan ID, patient name, or OT room..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="doc-search-pill-input"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="doc-search-clear-btn">
                            ✕
                        </button>
                    )}
                </div>

                <div className="doc-filter-right-actions">
                    <div className="doc-status-filter-pills">
                        {['all', 'planned', 'scheduled', 'completed', 'cancelled'].map(st => (
                            <button
                                key={st}
                                className={`doc-status-filter-btn ${statusFilter === st ? 'active' : ''}`}
                                onClick={() => setStatusFilter(st)}
                            >
                                <span className="capitalize">{st === 'all' ? 'All Plans' : st}</span>
                            </button>
                        ))}
                    </div>

                    <button 
                        className="doc-refresh-btn" 
                        onClick={fetchSurgeryPlans} 
                        disabled={loading}
                        title="Refresh surgery plans list"
                    >
                        <FiRefreshCw className={loading ? 'spin' : ''} size={14} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Surgery Plans Table View */}
            <div className="doc-tab-view-container">
                <div className="doc-table-card-wrapper">
                    <div className="doc-table-header-bar">
                        <h3>
                            <FiFileText style={{ marginRight: '8px' }} />
                            My Surgery Plans & OT Status ({filtered.length})
                        </h3>
                    </div>

                    <div className="doc-table-scroll">
                        {loading ? (
                            <div className="doc-loading-container" style={{ padding: '40px' }}>
                                <div className="doc-custom-spinner" />
                                <p>Loading surgery plans...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📋</div>
                                <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontWeight: 600 }}>No Surgery Plans Found</h4>
                                <p style={{ margin: 0, fontSize: '0.88rem' }}>
                                    {searchQuery || statusFilter !== 'all'
                                        ? 'No surgery plans matched your filter criteria.'
                                        : 'No surgery plans have been scheduled yet.'}
                                </p>
                            </div>
                        ) : (
                            <table className="doc-clean-table">
                                <thead>
                                    <tr>
                                        <th>Plan ID & Procedure</th>
                                        <th>Patient Details</th>
                                        <th>Referring Doctor</th>
                                        <th>OT Suite & Timing</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(sp => {
                                        const status = (sp.status || 'planned').toLowerCase();
                                        return (
                                            <tr key={sp._id}>
                                                <td>
                                                    <div className="font-bold text-slate-800">{sp.surgery || 'Surgical Procedure'}</div>
                                                    <span className="doc-plan-badge">{sp.planId || 'PLAN-AUTO'}</span>
                                                    {sp.diagnosis && <div className="text-xs text-slate-500 mt-1">Dx: {sp.diagnosis}</div>}
                                                </td>
                                                <td>
                                                    <div className="font-bold text-slate-800">{sp.patientId?.name || 'Patient'}</div>
                                                    <div className="text-xs text-slate-500">MRN: {sp.patientId?.mrn || sp.patientId?.patientId || '—'}</div>
                                                </td>
                                                <td className="text-slate-700">{sp.referringDoctorId?.name || 'Self-Planned'}</td>
                                                <td>
                                                    <strong>🚪 {sp.otRoomId?.name || 'OT Suite TBD'}</strong>
                                                    <div className="text-xs text-slate-500">
                                                        📅 {sp.surgeryDate || 'Flexible'} {sp.startTime ? `(${sp.startTime} - ${sp.endTime || '--:--'})` : ''}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`doc-status-pill status-${status}`}>
                                                        {sp.status || 'Planned'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => handleViewProfile(sp)}
                                                        className="doc-action-btn btn-profile"
                                                        style={{ padding: '7px 16px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                    >
                                                        <FiUser size={13} />
                                                        <span>View Profile</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MySurgeryPlans;
