import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabResultModal from './LabResultModal';
import {
    FiSearch, FiRefreshCw, FiEdit3, FiAlertTriangle,
    FiAlertOctagon, FiCheckCircle, FiX
} from 'react-icons/fi';
import './LabResultEntry.css';

const LabResultEntryPage = () => {
    const location = useLocation();
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const initialParams = new URLSearchParams(location.search);
    const [search, setSearch] = useState(() => initialParams.get('barcode') || initialParams.get('search') || '');
    const [department, setDepartment] = useState('');
    const [priority, setPriority] = useState('');
    const [statusFilter, setStatusFilter] = useState(() => initialParams.get('status') || '');
    const [activeModal, setActiveModal] = useState(null);

    useEffect(() => {
        const sp = new URLSearchParams(location.search);
        const bc = sp.get('barcode') || sp.get('search');
        const st = sp.get('status');
        if (bc !== null) setSearch(bc);
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

            const res = await labAPI.results.getEntryQueue(params);
            if (res?.success) {
                setQueue(res.queue || []);
            }
        } catch (err) {
            console.error('Failed to load result entry queue:', err);
            setError(err.response?.data?.message || err.message || 'Failed to fetch result entry queue');
        } finally {
            setLoading(false);
        }
    }, [search, department, priority, statusFilter]);

    useEffect(() => {
        loadQueue();
    }, [department, priority, statusFilter]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadQueue();
    };

    const handleResetFilters = () => {
        setSearch('');
        setDepartment('');
        setPriority('');
        setStatusFilter('');
        loadQueue('');
    };

    const handleOpenEntry = (item) => {
        setActiveModal({
            resultId: item.resultId,
            sampleId: item.sampleId,
            testId: item.testId,
            orderId: item.orderId,
            mode: 'entry'
        });
    };

    return (
        <LabLayout>
            <div className="lre-page">
                {/* Page Header */}
                <div className="lre-page-header">
                    <div>
                        <h1 className="lre-page-title">Technician Result Entry Workstation</h1>
                        <p className="lre-page-subtitle">
                            Enter configured diagnostic test parameters, evaluate biological reference intervals, and submit findings for Pathologist review.
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

                {/* Clean Filter Bar (No Icon Overlap) */}
                <div className="lre-filter-card">
                    <form className="lre-filter-form" onSubmit={handleSearchSubmit}>
                        <div className="lre-search-field">
                            <FiSearch className="lre-search-icon" />
                            <input
                                type="text"
                                className="lre-search-input"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by sample barcode, order number, patient name, or MRN..."
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
                            aria-label="Filter by result workflow status"
                        >
                            <option value="">All Workflows</option>
                            <option value="PENDING">Pending Entry</option>
                            <option value="DRAFT">Draft Saved</option>
                            <option value="CORRECTION_REQUESTED">Correction Requested</option>
                            <option value="REJECTED">Rejected</option>
                        </select>

                        <button type="submit" className="lre-btn lre-btn-primary">
                            Filter
                        </button>

                        {(search || department || priority || statusFilter) && (
                            <button
                                type="button"
                                className="lre-btn lre-btn-secondary"
                                onClick={handleResetFilters}
                            >
                                Reset
                            </button>
                        )}
                    </form>
                </div>

                {/* Result Entry Queue Table */}
                <div className="lre-table-card">
                    {loading ? (
                        <div className="lre-empty-box">
                            <FiRefreshCw className="lre-spin" size={28} style={{ color: '#2563eb' }} />
                            <h4>Loading Result Entry Queue...</h4>
                            <p>Fetching barcoded specimens eligible for parameter entry.</p>
                        </div>
                    ) : queue.length === 0 ? (
                        <div className="lre-empty-box">
                            <FiCheckCircle size={38} style={{ color: '#16a34a' }} />
                            <h4>Result Entry Queue Clear</h4>
                            <p>No pending specimen tests match the current filter criteria.</p>
                        </div>
                    ) : (
                        <div className="lre-table-scroll">
                            <table className="lre-table">
                                <thead>
                                    <tr>
                                        <th>Barcode / Order</th>
                                        <th>Patient &amp; MRN</th>
                                        <th>Test Requisition</th>
                                        <th>Department</th>
                                        <th>Priority</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queue.map((item, idx) => {
                                        const isStat = item.priority === 'STAT';
                                        const isCorrection = item.resultStatus === 'CORRECTION_REQUESTED';
                                        const isDraft = item.resultStatus === 'DRAFT';
                                        const isRejected = item.resultStatus === 'REJECTED';
                                        const isSubmitted = ['SUBMITTED', 'UNDER_REVIEW'].includes(item.resultStatus);
                                        const mrn = item.patientSnapshot?.mrn || item.patientSnapshot?.uhid || 'N/A';

                                        return (
                                            <tr
                                                key={`${item.sampleId}_${item.testId}_${idx}`}
                                                className={item.hasCritical ? 'lre-row-critical' : isStat ? 'lre-row-stat' : ''}
                                            >
                                                <td>
                                                    <div className="lre-mono">{item.barcode}</div>
                                                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                                        {item.orderNumber} &bull; Token #{item.tokenNumber || 1}
                                                    </div>
                                                </td>

                                                <td>
                                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>
                                                        {item.patientSnapshot?.name || 'Registered Patient'}
                                                    </div>
                                                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                                        {item.patientSnapshot?.age ?? '—'}y / {item.patientSnapshot?.gender || '—'} &bull; MRN: {mrn}
                                                    </div>
                                                </td>

                                                <td>
                                                    <div style={{ fontWeight: 700, color: '#1d4ed8' }}>
                                                        {item.testName}
                                                    </div>
                                                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                                        Code: {item.testCode} &bull; {item.specimenType} ({item.containerType})
                                                    </div>
                                                    {isCorrection && item.correctionReason && (
                                                        <div style={{ fontSize: '11px', color: '#b45309', marginTop: '3px', fontWeight: 600 }}>
                                                            Correction Note: {item.correctionReason}
                                                        </div>
                                                    )}
                                                </td>

                                                <td>
                                                    <span className="lre-badge lre-badge-routine">
                                                        {item.department || 'General Pathology'}
                                                    </span>
                                                </td>

                                                <td>
                                                    {isStat ? (
                                                        <span className="lre-badge lre-badge-stat">STAT</span>
                                                    ) : item.priority === 'Urgent' ? (
                                                        <span className="lre-badge lre-badge-urgent">Urgent</span>
                                                    ) : (
                                                        <span className="lre-badge lre-badge-routine">Routine</span>
                                                    )}
                                                </td>

                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                                        {isCorrection ? (
                                                            <span className="lre-badge lre-badge-correction">Correction Req.</span>
                                                        ) : isDraft ? (
                                                            <span className="lre-badge lre-badge-draft">Draft Saved</span>
                                                        ) : isRejected ? (
                                                            <span className="lre-badge lre-badge-rejected">Rejected</span>
                                                        ) : isSubmitted ? (
                                                            <span className="lre-badge lre-badge-submitted">Submitted</span>
                                                        ) : (
                                                            <span className="lre-badge lre-badge-pending">Pending Entry</span>
                                                        )}
                                                        {item.hasCritical && (
                                                            <span className="lre-badge lre-badge-critical">
                                                                <FiAlertOctagon size={11} /> CRITICAL
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        className={`lre-btn lre-btn-sm ${
                                                            isCorrection
                                                                ? 'lre-btn-warning'
                                                                : isDraft
                                                                    ? 'lre-btn-secondary'
                                                                    : 'lre-btn-primary'
                                                        }`}
                                                        onClick={() => handleOpenEntry(item)}
                                                    >
                                                        <FiEdit3 size={13} />
                                                        <span>
                                                            {isCorrection
                                                                ? 'Correct Findings'
                                                                : isDraft
                                                                    ? 'Edit Draft'
                                                                    : isSubmitted
                                                                        ? 'Update Findings'
                                                                        : 'Enter Findings'}
                                                        </span>
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

                {/* Structured Result Entry Modal */}
                {activeModal && (
                    <LabResultModal
                        isOpen={true}
                        onClose={() => setActiveModal(null)}
                        resultId={activeModal.resultId}
                        sampleId={activeModal.sampleId}
                        testId={activeModal.testId}
                        orderId={activeModal.orderId}
                        mode={activeModal.mode}
                        onActionSuccess={() => loadQueue()}
                    />
                )}
            </div>
        </LabLayout>
    );
};

export default LabResultEntryPage;
