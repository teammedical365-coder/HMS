import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FiFileText, FiClock, FiCheckCircle, FiSend, FiAlertCircle,
    FiSearch, FiFilter, FiDownload, FiEye, FiPlus, FiPrinter,
    FiRefreshCw, FiSliders, FiArrowRight
} from 'react-icons/fi';
import { labAPI } from '../../utils/api';
import LabReportPreviewModal from './LabReportPreviewModal';

const LabReportDashboard = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        TOTAL: 0,
        GENERATED: 0,
        UNDER_REVIEW: 0,
        APPROVED: 0,
        RELEASED: 0,
        REJECTED: 0,
        SUPERSEDED: 0
    });
    const [filters, setFilters] = useState({
        status: 'ALL',
        reportType: 'ALL',
        department: 'ALL',
        search: ''
    });

    // Preview Modal state
    const [previewReport, setPreviewReport] = useState(null);

    const loadReports = async () => {
        setLoading(true);
        try {
            const res = await labAPI.reports.getReports(filters);
            if (res.success) {
                setReports(res.data || []);
                if (res.stats) setStats(res.stats);
            }
        } catch (err) {
            console.error('Failed to load reports:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReports();
    }, [filters.status, filters.reportType, filters.department]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadReports();
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'RELEASED':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Released</span>;
            case 'APPROVED':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Approved</span>;
            case 'UNDER_REVIEW':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Under Review</span>;
            case 'GENERATED':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">Generated</span>;
            case 'REJECTED':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">Rejected</span>;
            case 'SUPERSEDED':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">Superseded</span>;
            default:
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">{status}</span>;
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Diagnostic Reports Workstation</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Phase 8: High-fidelity Vector PDF Generation, Medical Sign-off, and Patient Report Delivery
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    <button
                        onClick={() => navigate('/lab/reports/templates')}
                        className="inline-flex items-center px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 shadow-sm transition"
                    >
                        <FiSliders className="w-4 h-4 mr-2 text-slate-500" />
                        Branding Templates
                    </button>
                    <button
                        onClick={() => navigate('/lab/reports/review')}
                        className="inline-flex items-center px-3.5 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition"
                    >
                        <FiCheckCircle className="w-4 h-4 mr-2" />
                        Review Queue ({stats.UNDER_REVIEW || 0})
                    </button>
                    <button
                        onClick={() => navigate('/lab/reports/generate')}
                        className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-xl hover:bg-sky-700 shadow-sm transition"
                    >
                        <FiPlus className="w-4 h-4 mr-2" />
                        Generate Report Draft
                    </button>
                </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div
                    onClick={() => setFilters({ ...filters, status: 'ALL' })}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${filters.status === 'ALL' ? 'bg-sky-50/70 border-sky-300 shadow-sm ring-2 ring-sky-500/20' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider">All Reports</span>
                        <FiFileText className="w-4 h-4 text-sky-600" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{stats.TOTAL}</div>
                </div>

                <div
                    onClick={() => setFilters({ ...filters, status: 'GENERATED' })}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${filters.status === 'GENERATED' ? 'bg-purple-50/70 border-purple-300 shadow-sm ring-2 ring-purple-500/20' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider">Drafts</span>
                        <FiClock className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="text-2xl font-bold text-purple-900">{stats.GENERATED}</div>
                </div>

                <div
                    onClick={() => setFilters({ ...filters, status: 'UNDER_REVIEW' })}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${filters.status === 'UNDER_REVIEW' ? 'bg-amber-50/70 border-amber-300 shadow-sm ring-2 ring-amber-500/20' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider">Under Review</span>
                        <FiClock className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="text-2xl font-bold text-amber-900">{stats.UNDER_REVIEW}</div>
                </div>

                <div
                    onClick={() => setFilters({ ...filters, status: 'APPROVED' })}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${filters.status === 'APPROVED' ? 'bg-blue-50/70 border-blue-300 shadow-sm ring-2 ring-blue-500/20' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider">Approved</span>
                        <FiCheckCircle className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-2xl font-bold text-blue-900">{stats.APPROVED}</div>
                </div>

                <div
                    onClick={() => setFilters({ ...filters, status: 'RELEASED' })}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${filters.status === 'RELEASED' ? 'bg-emerald-50/70 border-emerald-300 shadow-sm ring-2 ring-emerald-500/20' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider">Released</span>
                        <FiSend className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-2xl font-bold text-emerald-900">{stats.RELEASED}</div>
                </div>

                <div
                    onClick={() => setFilters({ ...filters, status: 'REJECTED' })}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${filters.status === 'REJECTED' ? 'bg-red-50/70 border-red-300 shadow-sm ring-2 ring-red-500/20' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider">Rejected</span>
                        <FiAlertCircle className="w-4 h-4 text-red-600" />
                    </div>
                    <div className="text-2xl font-bold text-red-900">{stats.REJECTED}</div>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search by Report No, Order No, Patient Name, UHID or Phone..."
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />
                </form>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="GENERATED">Drafts (Generated)</option>
                        <option value="UNDER_REVIEW">Under Review</option>
                        <option value="APPROVED">Approved</option>
                        <option value="RELEASED">Released</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="SUPERSEDED">Superseded</option>
                    </select>

                    <select
                        value={filters.reportType}
                        onChange={(e) => setFilters({ ...filters, reportType: e.target.value })}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    >
                        <option value="ALL">All Priorities</option>
                        <option value="ROUTINE">Routine</option>
                        <option value="URGENT">Urgent</option>
                        <option value="STAT">STAT</option>
                        <option value="CRITICAL">Critical</option>
                    </select>

                    <button
                        onClick={loadReports}
                        className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                        title="Refresh"
                    >
                        <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Reports Registry Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-xs tracking-wider uppercase">
                                <th className="px-5 py-3.5">Report / Order</th>
                                <th className="px-5 py-3.5">Patient Details</th>
                                <th className="px-5 py-3.5">Tests Included</th>
                                <th className="px-5 py-3.5">Status</th>
                                <th className="px-5 py-3.5">Sign-off / Released</th>
                                <th className="px-5 py-3.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-slate-400">
                                        <div className="w-8 h-8 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                        Loading diagnostic reports...
                                    </td>
                                </tr>
                            ) : reports.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-slate-400">
                                        <FiFileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                        No reports match the current criteria.
                                    </td>
                                </tr>
                            ) : (
                                reports.map((rep) => (
                                    <tr key={rep._id} className="hover:bg-slate-50/60 transition">
                                        <td className="px-5 py-4">
                                            <div className="font-semibold text-slate-900 font-mono text-xs">{rep.reportNumber || 'DRAFT'}</div>
                                            <div className="text-xs text-slate-500 font-mono mt-0.5">Order: {rep.orderNumber}</div>
                                            {rep.revisionNumber > 1 && (
                                                <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">
                                                    Rev {rep.revisionNumber} (Amended)
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="font-medium text-slate-900">{rep.patientSnapshot?.name || 'N/A'}</div>
                                            <div className="text-xs text-slate-500">
                                                {rep.patientSnapshot?.age} {rep.patientSnapshot?.ageUnit || 'Y'} • {rep.patientSnapshot?.gender}
                                            </div>
                                            {rep.patientSnapshot?.uhid && (
                                                <div className="text-[11px] text-slate-400 font-mono">{rep.patientSnapshot?.uhid}</div>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="text-xs text-slate-800 font-medium">
                                                {rep.tests?.map(t => t.testName).join(', ') || 'No tests specified'}
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                {rep.tests?.reduce((acc, t) => acc + (t.parameters?.length || 0), 0)} Parameters evaluated
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            {getStatusBadge(rep.reportStatus)}
                                            {rep.reportType !== 'ROUTINE' && (
                                                <div className="text-[10px] font-bold text-red-600 mt-1 uppercase">
                                                    {rep.reportType}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-xs text-slate-600">
                                            {rep.releasedAt ? (
                                                <div>
                                                    <span className="font-medium text-slate-800">{rep.releasedByName || 'Pathologist'}</span>
                                                    <div className="text-[11px] text-slate-400">{new Date(rep.releasedAt).toLocaleString()}</div>
                                                </div>
                                            ) : rep.approvedAt ? (
                                                <div>
                                                    <span className="font-medium text-slate-800">Approved by {rep.approvedByName}</span>
                                                    <div className="text-[11px] text-slate-400">{new Date(rep.approvedAt).toLocaleDateString()}</div>
                                                </div>
                                            ) : (
                                                <div className="text-slate-400 italic">Drafted {new Date(rep.createdAt).toLocaleDateString()}</div>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex items-center justify-end space-x-2">
                                                <button
                                                    onClick={() => setPreviewReport(rep)}
                                                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition"
                                                    title="Preview PDF"
                                                >
                                                    <FiEye className="w-3.5 h-3.5 mr-1" />
                                                    Preview
                                                </button>
                                                {rep.reportStatus === 'RELEASED' && (
                                                    <button
                                                        onClick={() => navigate('/lab/reports/delivery')}
                                                        className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                                                        title="Deliver Report"
                                                    >
                                                        <FiSend className="w-3.5 h-3.5 mr-1" />
                                                        Deliver
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* In-Browser PDF Preview Modal */}
            {previewReport && (
                <LabReportPreviewModal
                    isOpen={!!previewReport}
                    reportId={previewReport._id}
                    reportNumber={previewReport.reportNumber}
                    canAmend={previewReport.reportStatus === 'RELEASED'}
                    onClose={() => setPreviewReport(null)}
                    onDeliver={() => {
                        setPreviewReport(null);
                        navigate('/lab/reports/delivery');
                    }}
                    onAmend={() => {
                        const reason = prompt('Enter mandatory reason for amending this released report:');
                        if (reason && reason.trim()) {
                            labAPI.reports.amendReport(previewReport._id, { amendmentReason: reason.trim() })
                                .then(res => {
                                    alert(`Amended report revision ${res.data.revisionNumber} generated.`);
                                    setPreviewReport(null);
                                    loadReports();
                                })
                                .catch(err => {
                                    alert(err.response?.data?.message || 'Amendment failed');
                                });
                        }
                    }}
                />
            )}
        </div>
    );
};

export default LabReportDashboard;
