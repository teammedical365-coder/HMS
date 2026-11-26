import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabResultModal from './LabResultModal';
import {
    FiSearch, FiRefreshCw, FiCheckCircle, FiAlertTriangle,
    FiCheckSquare, FiX
} from 'react-icons/fi';
import './LabResultEntry.css';

const formatSubmissionTime = (val) => {
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

const LabVerificationPage = () => {
    const location = useLocation();
    const initialParams = new URLSearchParams(location.search);

    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [search, setSearch] = useState(() => initialParams.get('search') || initialParams.get('barcode') || '');
    const [department, setDepartment] = useState('');
    const [priority, setPriority] = useState('');
    const [statusFilter, setStatusFilter] = useState(() => initialParams.get('status') || '');
    const [abnormalOnly, setAbnormalOnly] = useState(false);
    const [criticalOnly, setCriticalOnly] = useState(false);

    const [activeResultId, setActiveResultId] = useState(null);

    useEffect(() => {
        const sp = new URLSearchParams(location.search);
        const s = sp.get('search') || sp.get('barcode');
        const st = sp.get('status');
        if (s !== null) setSearch(s);
        if (st !== null) setStatusFilter(st);
    }, [location.search]);

    const loadQueue = useCallback(async (overrideSearch) => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            const q = overrideSearch !== undefined ? overrideSearch : search;
            if (q && q.trim()) params.search = q.trim();
            if (department) params.department = department;
            if (priority) params.priority = priority;
            if (statusFilter) params.status = statusFilter;
            if (abnormalOnly) params.abnormalOnly = 'true';
            if (criticalOnly) params.criticalOnly = 'true';

            const res = await labAPI.results.getVerificationQueue(params);
            if (res?.success) {
                setQueue(res.queue || []);
            }
        } catch (err) {
            console.error('Failed to load verification queue:', err);
            setError(err.response?.data?.message || err.message || 'Failed to load verification queue');
        } finally {
            setLoading(false);
        }
    }, [search, department, priority, statusFilter, abnormalOnly, criticalOnly]);

    useEffect(() => {
        loadQueue();
    }, [department, priority, statusFilter, abnormalOnly, criticalOnly]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadQueue();
    };

    const handleReset = () => {
        setSearch('');
        setDepartment('');
        setPriority('');
        setStatusFilter('');
        setAbnormalOnly(false);
        setCriticalOnly(false);
        loadQueue('');
    };

    return (
        <LabLayout>
            <div className="lre-page">
                {/* Page Header */}
                <div className="lre-page-header">
                    <div>
                        <h1 className="lre-page-title">Pathologist Verification Queue</h1>
                        <p className="lre-page-subtitle">
                            Inspect submitted laboratory findings, verify biological reference intervals, request corrections, or authorize clinical release.
                        </p>
                    </div>
                    <div className="lre-header-actions">
                        <button
                            type="button"
                            className="lre-btn lre-btn-secondary"
                            onClick={() => loadQueue()}
                            disabled={loading}
                        >
                            <FiRefreshCw size={14} className={loading ? 'lre-spin' : ''} />
                            <span>Refresh Queue</span>
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="lrm-alert-strip lrm-alert-critical" role="alert">
                        <FiAlertTriangle size={17} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Filter Bar */}
                <div className="lre-filter-card">
                    <form className="lre-filter-form" onSubmit={handleSearchSubmit}>
                        <div className="lre-search-field">
                            <FiSearch className="lre-search-icon" />
                            <input
                                type="text"
                                className="lre-search-input"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search patient name, MRN, order number, barcode, or test..."
                            />
                            {search && (
                                <button
                                    type="button"
                                    className="lre-search-clear"
                                    onClick={() => {
                                        setSearch('');
                                        loadQueue('');
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

                        <select
                            className="lre-select"
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                            aria-label="Filter by priority"
                        >
                            <option value="">All Priorities</option>
                            <option value="STAT">STAT / Emergency</option>
                            <option value="Urgent">Urgent</option>
                            <option value="Routine">Routine</option>
                        </select>

                        <select
                            className="lre-select"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            aria-label="Filter by review status"
                        >
                            <option value="">All Eligible</option>
                            <option value="SUBMITTED">Submitted</option>
                            <option value="UNDER_REVIEW">Under Review</option>
                        </select>

                        <label className="lre-check-pill" style={{ color: '#92400e' }}>
                            <input
                                type="checkbox"
                                checked={abnormalOnly}
                                onChange={(e) => setAbnormalOnly(e.target.checked)}
                            />
                            <span>Abnormal</span>
                        </label>

                        <label className="lre-check-pill" style={{ color: '#b91c1c' }}>
                            <input
                                type="checkbox"
                                checked={criticalOnly}
                                onChange={(e) => setCriticalOnly(e.target.checked)}
                            />
                            <span>Critical Only</span>
                        </label>

                        <button type="submit" className="lre-btn lre-btn-primary">
                            Filter
                        </button>

                        {(search || department || priority || statusFilter || abnormalOnly || criticalOnly) && (
                            <button type="button" className="lre-btn lre-btn-secondary" onClick={handleReset}>
                                Reset
                            </button>
                        )}
                    </form>
                </div>

                {/* Verification Queue Table (Exact 10 Columns Required by Part 5C) */}
                <div className="lre-table-card">
                    {loading ? (
                        <div className="lre-empty-box">
                            <FiRefreshCw className="lre-spin" size={28} style={{ color: '#2563eb' }} />
                            <h4>Loading Verification Queue...</h4>
                            <p>Fetching diagnostic results eligible for Pathologist sign-off.</p>
                        </div>
                    ) : queue.length === 0 ? (
                        <div className="lre-empty-box">
                            <FiCheckCircle size={38} style={{ color: '#16a34a' }} />
                            <h4>Verification Queue Clear</h4>
                            <p>All eligible technician-submitted results have been reviewed.</p>
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
                                        <th>Technician</th>
                                        <th>Submission Date</th>
                                        <th>Priority</th>
                                        <th>Result Status</th>
                                        <th style={{ textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queue.map((res) => {
                                        const mrn = res.patientSnapshot?.mrn || res.patientSnapshot?.uhid || 'N/A';
                                        const isStat = res.priority === 'STAT';

                                        return (
                                            <tr
                                                key={String(res._id)}
                                                className={res.hasCriticalParameters ? 'lre-row-critical' : isStat ? 'lre-row-stat' : ''}
                                            >
                                                <td>
                                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>
                                                        {res.patientSnapshot?.name || 'Registered Patient'}
                                                    </div>
                                                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                                        MRN: {mrn} &bull; {res.patientSnapshot?.age ?? '—'}y / {res.patientSnapshot?.gender || '—'}
                                                    </div>
                                                </td>

                                                <td style={{ fontWeight: 700, color: '#334155' }}>
                                                    <div>{res.orderNumber}</div>
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>Token #{res.tokenNumber || 1}</div>
                                                </td>

                                                <td>
                                                    <span className="lre-mono">{res.barcode}</span>
                                                </td>

                                                <td>
                                                    <div style={{ fontWeight: 700, color: '#1d4ed8' }}>{res.testName}</div>
                                                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                                                        Code: {res.testCode}
                                                        {res.revisionNumber > 1 ? ` • Rev #${res.revisionNumber}` : ''}
                                                    </div>
                                                </td>

                                                <td>{res.department || 'General Pathology'}</td>

                                                <td>
                                                    <div style={{ fontWeight: 600, color: '#334155' }}>
                                                        {res.submittedByName || res.enteredByName || 'Lab Technician'}
                                                    </div>
                                                </td>

                                                <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: '#475569' }}>
                                                    {formatSubmissionTime(res.submittedAt || res.updatedAt)}
                                                </td>

                                                <td>
                                                    {isStat ? (
                                                        <span className="lre-badge lre-badge-stat">STAT</span>
                                                    ) : res.priority === 'Urgent' ? (
                                                        <span className="lre-badge lre-badge-urgent">Urgent</span>
                                                    ) : (
                                                        <span className="lre-badge lre-badge-routine">Routine</span>
                                                    )}
                                                </td>

                                                <td>
                                                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                                        <span className={`lre-badge ${res.resultStatus === 'UNDER_REVIEW' ? 'lre-badge-review' : 'lre-badge-submitted'}`}>
                                                            {String(res.resultStatus).replace(/_/g, ' ')}
                                                        </span>
                                                        {res.hasCriticalParameters && (
                                                            <span className="lre-badge lre-badge-critical">CRITICAL</span>
                                                        )}
                                                        {res.hasAbnormalParameters && !res.hasCriticalParameters && (
                                                            <span className="lre-badge lre-badge-correction">ABNORMAL</span>
                                                        )}
                                                    </div>
                                                </td>

                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        className={`lre-btn lre-btn-sm ${res.hasCriticalParameters ? 'lre-btn-danger' : 'lre-btn-success'}`}
                                                        onClick={() => setActiveResultId(res._id)}
                                                    >
                                                        <FiCheckSquare size={13} />
                                                        <span>Review &amp; Verify</span>
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

                {/* Review & Verification Modal */}
                {activeResultId && (
                    <LabResultModal
                        isOpen={true}
                        onClose={() => setActiveResultId(null)}
                        resultId={activeResultId}
                        mode="verification"
                        onActionSuccess={() => loadQueue()}
                    />
                )}
            </div>
        </LabLayout>
    );
};

export default LabVerificationPage;
