import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabResultModal from './LabResultModal';
import {
    FiSearch, FiRefreshCw, FiCheckCircle, FiAlertTriangle,
    FiClock, FiEye, FiFileText, FiX, FiRotateCcw, FiXCircle
} from 'react-icons/fi';
import './LabResultEntry.css';

const formatDateTime = (val) => {
    if (!val) return '—';
    try {
        return new Date(val).toLocaleString([], {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return '—';
    }
};

const LabResultDashboard = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const initialParams = new URLSearchParams(location.search);

    const [stats, setStats] = useState(null);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [search, setSearch] = useState(() => initialParams.get('search') || '');
    const [department, setDepartment] = useState('');
    const [statusFilter, setStatusFilter] = useState(() => initialParams.get('status') || '');
    const [activeResultId, setActiveResultId] = useState(null);

    useEffect(() => {
        const sp = new URLSearchParams(location.search);
        const st = sp.get('status');
        const s = sp.get('search');
        if (st !== null) setStatusFilter(st);
        if (s !== null) setSearch(s);
    }, [location.search]);

    const loadHistory = useCallback(async (overrideSearch) => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            const q = overrideSearch !== undefined ? overrideSearch : search;
            if (q && q.trim()) params.search = q.trim();
            if (department) params.department = department;
            if (statusFilter) params.status = statusFilter;

            const [statRes, histRes] = await Promise.all([
                labAPI.results.getDashboardStats(),
                labAPI.results.getHistoryList(params)
            ]);

            if (statRes?.success) setStats(statRes.stats);
            if (histRes?.success) setResults(histRes.results || []);
        } catch (err) {
            console.error('Failed to load verified results history:', err);
            setError(err.response?.data?.message || err.message || 'Failed to load verified results and revision history');
        } finally {
            setLoading(false);
        }
    }, [search, department, statusFilter]);

    useEffect(() => {
        loadHistory();
    }, [department, statusFilter]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadHistory();
    };

    return (
        <LabLayout>
            <div className="lre-page">
                {/* Header */}
                <div className="lre-page-header">
                    <div>
                        <h1 className="lre-page-title">Verified Results &amp; Clinical Revision History</h1>
                        <p className="lre-page-subtitle">
                            Permanent clinical archive of verified laboratory findings, pathologist sign-offs, correction requests, rejected results, and audited amendments.
                        </p>
                    </div>
                    <div className="lre-header-actions">
                        <button
                            type="button"
                            className="lre-btn lre-btn-secondary"
                            onClick={() => loadHistory()}
                            disabled={loading}
                        >
                            <FiRefreshCw size={14} className={loading ? 'lre-spin' : ''} />
                            <span>Refresh</span>
                        </button>
                        <button
                            type="button"
                            className="lre-btn lre-btn-primary"
                            onClick={() => navigate('/lab/reports')}
                        >
                            <FiFileText size={14} />
                            <span>Diagnostic Reports</span>
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="lrm-alert-strip lrm-alert-critical" role="alert">
                        <FiAlertTriangle size={17} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Quick Status Filter Pills */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className={`lre-btn ${statusFilter === '' ? 'lre-btn-primary' : 'lre-btn-secondary'}`}
                        onClick={() => setStatusFilter('')}
                    >
                        <span>All History ({(stats?.verified || 0) + (stats?.correctionRequested || 0) + (stats?.rejected || 0)})</span>
                    </button>
                    <button
                        type="button"
                        className={`lre-btn ${statusFilter === 'VERIFIED' ? 'lre-btn-success' : 'lre-btn-secondary'}`}
                        onClick={() => setStatusFilter('VERIFIED')}
                    >
                        <FiCheckCircle size={14} />
                        <span>Verified ({stats?.verified ?? 0})</span>
                    </button>
                    <button
                        type="button"
                        className={`lre-btn ${statusFilter === 'CORRECTION_REQUESTED' ? 'lre-btn-warning' : 'lre-btn-secondary'}`}
                        onClick={() => setStatusFilter('CORRECTION_REQUESTED')}
                    >
                        <FiRotateCcw size={14} />
                        <span>Correction Requested ({stats?.correctionRequested ?? 0})</span>
                    </button>
                    <button
                        type="button"
                        className={`lre-btn ${statusFilter === 'REJECTED' ? 'lre-btn-danger' : 'lre-btn-secondary'}`}
                        onClick={() => setStatusFilter('REJECTED')}
                    >
                        <FiXCircle size={14} />
                        <span>Rejected ({stats?.rejected ?? 0})</span>
                    </button>
                </div>

                {/* Search & Department Filter */}
                <div className="lre-filter-card">
                    <form className="lre-filter-form" onSubmit={handleSearchSubmit}>
                        <div className="lre-search-field">
                            <FiSearch className="lre-search-icon" />
                            <input
                                type="text"
                                className="lre-search-input"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search verified results by patient name, MRN, order number, barcode, or test..."
                            />
                            {search && (
                                <button
                                    type="button"
                                    className="lre-search-clear"
                                    onClick={() => {
                                        setSearch('');
                                        loadHistory('');
                                    }}
                                    aria-label="Clear search"
                                >
                                    <FiX size={15} />
                                </button>
                            )}
                        </div>

                        <select
                            className="lre-select"
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            aria-label="Filter by department"
                        >
                            <option value="">All Departments</option>
                            <option value="Hematology">Hematology</option>
                            <option value="Biochemistry">Biochemistry</option>
                            <option value="Clinical Pathology">Clinical Pathology</option>
                            <option value="Serology">Serology</option>
                            <option value="Microbiology">Microbiology</option>
                            <option value="Immunology">Immunology</option>
                            <option value="Histopathology">Histopathology</option>
                            <option value="Radiology">Radiology</option>
                        </select>

                        <button type="submit" className="lre-btn lre-btn-primary">
                            Search
                        </button>
                    </form>
                </div>

                {/* History Table */}
                <div className="lre-table-card">
                    {loading ? (
                        <div className="lre-empty-box">
                            <FiRefreshCw className="lre-spin" size={28} style={{ color: '#2563eb' }} />
                            <h4>Loading Clinical Result History...</h4>
                            <p>Fetching verified diagnostic records and revision logs.</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="lre-empty-box">
                            <FiClock size={36} style={{ color: '#94a3b8' }} />
                            <h4>No Historical Result Records Found</h4>
                            <p>Verified, rejected, and correction-requested results appear here automatically.</p>
                        </div>
                    ) : (
                        <div className="lre-table-scroll">
                            <table className="lre-table">
                                <thead>
                                    <tr>
                                        <th>Patient Name / MRN</th>
                                        <th>Order Number</th>
                                        <th>Sample Barcode</th>
                                        <th>Test Name</th>
                                        <th>Department</th>
                                        <th>Reviewed / Verified By</th>
                                        <th>Timestamp</th>
                                        <th>Revision</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((r) => {
                                        const mrn = r.patientSnapshot?.mrn || r.patientSnapshot?.uhid || 'N/A';
                                        const reviewer = r.verifiedByName || r.rejectedByName || r.correctionRequestedByName || 'Pathologist';
                                        const actionTime = r.verifiedAt || r.rejectedAt || r.correctionRequestedAt || r.updatedAt;

                                        return (
                                            <tr key={String(r._id)}>
                                                <td>
                                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>
                                                        {r.patientSnapshot?.name || 'Registered Patient'}
                                                    </div>
                                                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                                                        MRN: {mrn} &bull; {r.patientSnapshot?.age ?? '—'}y / {r.patientSnapshot?.gender || '—'}
                                                    </div>
                                                </td>
                                                <td style={{ fontWeight: 700, color: '#334155' }}>{r.orderNumber}</td>
                                                <td><span className="lre-mono">{r.barcode}</span></td>
                                                <td>
                                                    <div style={{ fontWeight: 700, color: '#1d4ed8' }}>{r.testName}</div>
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{r.testCode}</div>
                                                </td>
                                                <td>{r.department || 'General Pathology'}</td>
                                                <td style={{ fontWeight: 600, color: '#334155' }}>{reviewer}</td>
                                                <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: '#475569' }}>
                                                    {formatDateTime(actionTime)}
                                                </td>
                                                <td>
                                                    <span className="lre-badge lre-badge-routine">
                                                        Rev #{r.revisionNumber || 1}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`lre-badge ${
                                                            r.resultStatus === 'VERIFIED'
                                                                ? 'lre-badge-verified'
                                                                : r.resultStatus === 'REJECTED'
                                                                    ? 'lre-badge-rejected'
                                                                    : 'lre-badge-correction'
                                                        }`}
                                                    >
                                                        {String(r.resultStatus).replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        className="lre-btn lre-btn-secondary lre-btn-sm"
                                                        onClick={() => setActiveResultId(r._id)}
                                                    >
                                                        <FiEye size={13} />
                                                        <span>Inspect &amp; Audit</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Inspection / Audit / Amendment Modal */}
                {activeResultId && (
                    <LabResultModal
                        isOpen={true}
                        onClose={() => setActiveResultId(null)}
                        resultId={activeResultId}
                        mode="verification"
                        onActionSuccess={() => loadHistory()}
                    />
                )}
            </div>
        </LabLayout>
    );
};

export default LabResultDashboard;
