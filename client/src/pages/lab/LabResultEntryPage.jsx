import React, { useState, useEffect } from 'react';
import { labAPI } from '../../utils/api';
import LabLayout from '../../components/lab/LabLayout';
import LabResultModal from './LabResultModal';
import {
    FiSearch, FiFilter, FiRefreshCw, FiEdit3, FiAlertTriangle,
    FiAlertOctagon, FiClock, FiFileText, FiCheckCircle
} from 'react-icons/fi';

const LabResultEntryPage = () => {
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filters
    const [search, setSearch] = useState('');
    const [department, setDepartment] = useState('');
    const [priority, setPriority] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Active Result Modal
    const [activeModal, setActiveModal] = useState(null);

    const loadQueue = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (search) params.search = search;
            if (department) params.department = department;
            if (priority) params.priority = priority;
            if (statusFilter) params.status = statusFilter;

            const res = await labAPI.results.getEntryQueue(params);
            if (res.success) {
                setQueue(res.queue || []);
            }
        } catch (err) {
            console.error('Failed to load entry queue:', err);
            setError(err.response?.data?.message || err.message || 'Failed to fetch result entry queue');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadQueue();
    }, [department, priority, statusFilter]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadQueue();
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
        <LabLayout
            title="Technician Result Entry Workstation"
            subtitle="Laboratory parameter findings, auto-reference interval calculation & preliminary submission"
            action={
                <button onClick={loadQueue} className="lab-btn lab-btn-secondary">
                    <FiRefreshCw style={{ marginRight: '6px' }} />
                    Refresh Queue
                </button>
            }
        >
            {error && (
                <div className="lab-card" style={{ borderLeft: '4px solid #ef4444', color: '#b91c1c', marginBottom: '20px' }}>
                    <FiAlertTriangle style={{ marginRight: '8px' }} />
                    {error}
                </div>
            )}

            {/* Filter Bar */}
            <div className="lab-card" style={{ marginBottom: '20px', padding: '16px' }}>
                <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: '1 1 240px', position: 'relative' }}>
                        <FiSearch style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8' }} />
                        <input
                            type="text"
                            className="lab-input"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by Barcode, Patient, UHID, Order..."
                            style={{ paddingLeft: '36px', width: '100%' }}
                        />
                    </div>

                    <select
                        className="lab-input"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        style={{ minWidth: '160px' }}
                    >
                        <option value="">All Departments</option>
                        <option value="Hematology">Hematology</option>
                        <option value="Biochemistry">Biochemistry</option>
                        <option value="Clinical Pathology">Clinical Pathology</option>
                        <option value="Serology">Serology</option>
                        <option value="Microbiology">Microbiology</option>
                        <option value="Immunology">Immunology</option>
                    </select>

                    <select
                        className="lab-input"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        style={{ minWidth: '130px' }}
                    >
                        <option value="">All Priorities</option>
                        <option value="STAT">STAT / Emergency</option>
                        <option value="Urgent">Urgent</option>
                        <option value="Routine">Routine</option>
                    </select>

                    <select
                        className="lab-input"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ minWidth: '150px' }}
                    >
                        <option value="">All Workflows</option>
                        <option value="PENDING">Pending Entry</option>
                        <option value="DRAFT">Draft Saved</option>
                        <option value="CORRECTION_REQUESTED">Correction Needed</option>
                        <option value="REJECTED">Rejected</option>
                    </select>

                    <button type="submit" className="lab-btn lab-btn-primary">
                        Filter
                    </button>
                    {(search || department || priority || statusFilter) && (
                        <button
                            type="button"
                            className="lab-btn lab-btn-secondary"
                            onClick={() => {
                                setSearch('');
                                setDepartment('');
                                setPriority('');
                                setStatusFilter('');
                            }}
                        >
                            Reset
                        </button>
                    )}
                </form>
            </div>

            {/* Queue Table */}
            <div className="lab-card" style={{ padding: 0 }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                        <FiRefreshCw className="spin" style={{ fontSize: '32px', marginBottom: '12px' }} />
                        <p>Loading pending specimen tests awaiting result entry...</p>
                    </div>
                ) : queue.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                        <FiCheckCircle style={{ fontSize: '42px', color: '#16a34a', marginBottom: '12px' }} />
                        <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>Result Entry Queue Clear</h4>
                        <p style={{ margin: 0, fontSize: '13px' }}>
                            All accepted and processed specimens have results entered and submitted.
                        </p>
                    </div>
                ) : (
                    <table className="lab-table" style={{ width: '100%', fontSize: '13px' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '14%' }}>Barcode / Order</th>
                                <th style={{ width: '20%' }}>Patient Demographics</th>
                                <th style={{ width: '22%' }}>Test Requisition</th>
                                <th style={{ width: '14%' }}>Department</th>
                                <th style={{ width: '10%' }}>Priority</th>
                                <th style={{ width: '10%' }}>Status</th>
                                <th style={{ width: '10%', textAlign: 'right' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {queue.map((item, idx) => {
                                const isStat = item.priority === 'STAT';
                                const isCorrection = item.resultStatus === 'CORRECTION_REQUESTED';
                                const isDraft = item.resultStatus === 'DRAFT';

                                return (
                                    <tr key={idx} style={{ background: isStat ? '#fff7ed' : isCorrection ? '#fffbeb' : 'inherit' }}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.barcode}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{item.orderNumber} • Token #{item.tokenNumber}</div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                {item.patientSnapshot?.name}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                {item.patientSnapshot?.age}y / {item.patientSnapshot?.gender} • UHID: {item.patientSnapshot?.uhid || 'N/A'}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#0284c7' }}>
                                                {item.testName}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                Code: {item.testCode} • {item.specimenType} ({item.containerType})
                                            </div>
                                        </td>
                                        <td>
                                            <span className="lab-badge" style={{ background: '#f1f5f9', color: '#475569' }}>
                                                {item.department}
                                            </span>
                                        </td>
                                        <td>
                                            {isStat ? (
                                                <span className="lab-badge lab-badge-danger">
                                                    ⚡ STAT
                                                </span>
                                            ) : item.priority === 'Urgent' ? (
                                                <span className="lab-badge lab-badge-warning">
                                                    Urgent
                                                </span>
                                            ) : (
                                                <span className="lab-badge" style={{ background: '#f8fafc', color: '#64748b' }}>
                                                    Routine
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {isCorrection ? (
                                                <span className="lab-badge lab-badge-warning" style={{ background: '#fef3c7', color: '#b45309' }}>
                                                    Correction Req.
                                                </span>
                                            ) : isDraft ? (
                                                <span className="lab-badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>
                                                    Draft Saved
                                                </span>
                                            ) : item.resultStatus === 'REJECTED' ? (
                                                <span className="lab-badge lab-badge-danger">
                                                    Rejected
                                                </span>
                                            ) : (
                                                <span className="lab-badge" style={{ background: '#f0f9ff', color: '#0284c7' }}>
                                                    Pending Entry
                                                </span>
                                            )}
                                            {item.hasCritical && (
                                                <span className="lab-badge lab-badge-danger" style={{ marginLeft: '4px' }}>
                                                    CRITICAL
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                className={`lab-btn ${isCorrection ? 'lab-btn-warning' : isDraft ? 'lab-btn-secondary' : 'lab-btn-primary'}`}
                                                onClick={() => handleOpenEntry(item)}
                                                style={{ padding: '6px 12px', fontSize: '12px' }}
                                            >
                                                <FiEdit3 style={{ marginRight: '4px' }} />
                                                {isCorrection ? 'Correct Findings' : isDraft ? 'Edit Draft' : 'Enter Findings'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal */}
            {activeModal && (
                <LabResultModal
                    isOpen={true}
                    onClose={() => setActiveModal(null)}
                    resultId={activeModal.resultId}
                    sampleId={activeModal.sampleId}
                    testId={activeModal.testId}
                    orderId={activeModal.orderId}
                    mode={activeModal.mode}
                    onActionSuccess={() => {
                        loadQueue();
                    }}
                />
            )}
        </LabLayout>
    );
};

export default LabResultEntryPage;
