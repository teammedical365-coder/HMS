import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FiScissors, FiSearch, FiRefreshCw, 
    FiCalendar, FiArrowRight
} from 'react-icons/fi';
import { referralAPI } from '../../utils/api';
import './Patient.css';

const SurgeryReferrals = () => {
    const navigate = useNavigate();
    const [referrals, setReferrals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const fetchReferrals = async () => {
        setLoading(true);
        try {
            const res = await referralAPI.getMyReferrals();
            if (res.success && Array.isArray(res.referrals)) {
                setReferrals(res.referrals);
            } else {
                setReferrals([]);
            }
        } catch (err) {
            console.error('Error fetching surgery referrals:', err);
            setReferrals([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReferrals();
    }, []);

    const q = searchQuery.toLowerCase().trim();
    const filtered = referrals.filter(ref => {
        const pName = ref.patientId?.name || '';
        const pMrn = ref.patientId?.mrn || ref.patientId?.patientId || '';
        const docName = ref.referringDoctorId?.name || '';
        const reason = ref.reason || '';

        const matchesQuery = !q || (
            pName.toLowerCase().includes(q) ||
            pMrn.toLowerCase().includes(q) ||
            docName.toLowerCase().includes(q) ||
            reason.toLowerCase().includes(q)
        );

        const status = (ref.status || '').toLowerCase();
        const matchesStatus = statusFilter === 'all' || status === statusFilter.toLowerCase();

        return matchesQuery && matchesStatus;
    });

    const currentDate = new Date();
    const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    return (
        <div className="doc-exact-patients-page">
            {/* Header Banner */}
            <div className="doc-modern-banner">
                <div className="doc-banner-left">
                    <div className="doc-title-row">
                        <h1 className="doc-exact-title">Surgery Referrals</h1>
                        <span className="doc-role-badge">DOCTOR</span>
                        <span className="doc-count-pill">{referrals.length} Total</span>
                    </div>
                    <p className="doc-exact-subtitle">
                        Review consultation surgery referrals assigned to you, assess clinical indications, and formulate surgical plans.
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
                        placeholder="Search patient, MRN, referring doctor, or indication..."
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
                        {['all', 'pending', 'confirmed', 'completed'].map(st => (
                            <button
                                key={st}
                                className={`doc-status-filter-btn ${statusFilter === st ? 'active' : ''}`}
                                onClick={() => setStatusFilter(st)}
                            >
                                <span className="capitalize">{st === 'all' ? 'All Referrals' : st}</span>
                            </button>
                        ))}
                    </div>

                    <button 
                        className="doc-refresh-btn" 
                        onClick={fetchReferrals} 
                        disabled={loading}
                        title="Refresh referrals list"
                    >
                        <FiRefreshCw className={loading ? 'spin' : ''} size={14} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Referrals Table View */}
            <div className="doc-tab-view-container">
                <div className="doc-table-card-wrapper">
                    <div className="doc-table-header-bar">
                        <h3>
                            <FiScissors style={{ marginRight: '8px' }} />
                            Surgery Referrals Assigned to You ({filtered.length})
                        </h3>
                    </div>

                    <div className="doc-table-scroll">
                        {loading ? (
                            <div className="doc-loading-container" style={{ padding: '40px' }}>
                                <div className="doc-custom-spinner" />
                                <p>Loading surgery referrals...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#64748b' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✂️</div>
                                <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontWeight: 600 }}>No Surgery Referrals Found</h4>
                                <p style={{ margin: 0, fontSize: '0.88rem' }}>
                                    {searchQuery || statusFilter !== 'all'
                                        ? 'No referrals matched your filter criteria.'
                                        : 'There are currently no surgery referrals assigned to you.'}
                                </p>
                            </div>
                        ) : (
                            <table className="doc-clean-table">
                                <thead>
                                    <tr>
                                        <th>Patient</th>
                                        <th>Referred By</th>
                                        <th>Clinical Reason</th>
                                        <th>Referral Date</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(ref => {
                                        const pid = ref.patientId?.patientId || ref.patientId?.mrn || ref.patientId?._id;
                                        const status = (ref.status || 'confirmed').toLowerCase();
                                        return (
                                            <tr key={ref._id}>
                                                <td>
                                                    <div className="font-bold text-slate-800">{ref.patientId?.name || 'Unknown Patient'}</div>
                                                    <div className="text-xs text-slate-500">MRN: {ref.patientId?.mrn || ref.patientId?.patientId || '—'}</div>
                                                </td>
                                                <td className="text-slate-700">{ref.referringDoctorId?.name || 'Clinical Staff'}</td>
                                                <td className="text-slate-700" style={{ maxWidth: '280px' }}>{ref.reason || 'Surgical Evaluation'}</td>
                                                <td className="text-slate-500">
                                                    {ref.referralDate ? new Date(ref.referralDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                                </td>
                                                <td>
                                                    <span className={`doc-status-pill status-${status}`}>
                                                        {ref.status || 'Pending'}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => {
                                                            navigate('/doctor/patient/' + (pid || ref._id), {
                                                                state: { referralId: ref._id, referral: ref }
                                                            });
                                                        }}
                                                        className="doc-action-btn btn-consult"
                                                        style={{ padding: '7px 16px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                    >
                                                        <span>Review & Plan</span>
                                                        <FiArrowRight size={13} />
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

export default SurgeryReferrals;
