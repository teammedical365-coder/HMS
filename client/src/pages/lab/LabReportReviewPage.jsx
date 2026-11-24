import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FiCheckCircle, FiXCircle, FiEye, FiClock, FiAlertTriangle,
    FiFileText, FiArrowLeft, FiRefreshCw, FiSend, FiUser
} from 'react-icons/fi';
import { labAPI } from '../../utils/api';
import LabReportPreviewModal from './LabReportPreviewModal';

const LabReportReviewPage = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previewReport, setPreviewReport] = useState(null);
    const [processingId, setProcessingId] = useState(null);

    const loadReviewQueue = async () => {
        setLoading(true);
        try {
            // Fetch reports in GENERATED or UNDER_REVIEW status
            const res = await labAPI.reports.getReports({ status: 'UNDER_REVIEW' });
            const genRes = await labAPI.reports.getReports({ status: 'GENERATED' });
            if (res.success && genRes.success) {
                const combined = [...(res.data || []), ...(genRes.data || [])];
                setReports(combined);
            }
        } catch (err) {
            console.error('Failed to load review queue:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReviewQueue();
    }, []);

    const handleApprove = async (reportId) => {
        setProcessingId(reportId);
        try {
            const res = await labAPI.reports.approveReport(reportId);
            if (res.success) {
                alert('Report approved successfully!');
                loadReviewQueue();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Approval failed');
        } finally {
            setProcessingId(null);
        }
    };

    const handleRelease = async (reportId) => {
        setProcessingId(reportId);
        try {
            const res = await labAPI.reports.releaseReport(reportId);
            if (res.success) {
                alert(`Report ${res.data.reportNumber} officially RELEASED for patient delivery!`);
                loadReviewQueue();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Release failed');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (reportId) => {
        const reason = prompt('Enter mandatory rejection reason to return report to technician:');
        if (!reason || !reason.trim()) return;

        setProcessingId(reportId);
        try {
            const res = await labAPI.reports.rejectReport(reportId, { reason: reason.trim() });
            if (res.success) {
                alert('Report rejected and returned to technician.');
                loadReviewQueue();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Rejection failed');
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => navigate('/lab/reports')}
                        className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition"
                    >
                        <FiArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Pathologist Review & Approval Console</h1>
                        <p className="text-xs text-slate-500">
                            Clinical sign-off and official release console for diagnostic laboratory reports
                        </p>
                    </div>
                </div>

                <button
                    onClick={loadReviewQueue}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                    title="Refresh Queue"
                >
                    <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Queue Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                        Pending Sign-off Queue ({reports.length})
                    </h2>
                    <span className="text-xs text-slate-500">
                        Only verified findings can be approved & released
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-semibold text-xs tracking-wider uppercase">
                                <th className="px-5 py-3.5">Report / Order</th>
                                <th className="px-5 py-3.5">Patient Info</th>
                                <th className="px-5 py-3.5">Investigations Included</th>
                                <th className="px-5 py-3.5">Clinical Flags</th>
                                <th className="px-5 py-3.5">Status</th>
                                <th className="px-5 py-3.5 text-right">Approval Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-slate-400">
                                        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                        Loading reports pending pathologist review...
                                    </td>
                                </tr>
                            ) : reports.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-16 text-slate-400">
                                        <FiCheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                                        Review queue is clear! All generated reports have been reviewed or released.
                                    </td>
                                </tr>
                            ) : (
                                reports.map((rep) => {
                                    const hasAbnormal = rep.tests?.some(t => t.hasAbnormalParameters);
                                    const hasCritical = rep.tests?.some(t => t.hasCriticalParameters);

                                    return (
                                        <tr key={rep._id} className="hover:bg-slate-50/60 transition">
                                            <td className="px-5 py-4">
                                                <div className="font-semibold text-slate-900 font-mono text-xs">{rep.reportNumber || 'DRAFT'}</div>
                                                <div className="text-xs text-slate-500 font-mono mt-0.5">Order: {rep.orderNumber}</div>
                                                <div className="text-[11px] text-slate-400 mt-1">
                                                    Drafted by {rep.generatedByName || 'Tech'}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="font-medium text-slate-900">{rep.patientSnapshot?.name}</div>
                                                <div className="text-xs text-slate-500">
                                                    {rep.patientSnapshot?.age} {rep.patientSnapshot?.ageUnit || 'Y'} • {rep.patientSnapshot?.gender}
                                                </div>
                                                <div className="text-[11px] text-slate-400 font-mono">{rep.patientSnapshot?.uhid || rep.patientSnapshot?.phone}</div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="text-xs text-slate-800 font-medium">
                                                    {rep.tests?.map(t => t.testName).join(', ')}
                                                </div>
                                                <div className="text-[11px] text-slate-400 mt-0.5">
                                                    {rep.tests?.length} Test(s) evaluated
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                {hasCritical ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800">
                                                        <FiAlertTriangle className="w-3 h-3 mr-1" />
                                                        CRITICAL VALUE
                                                    </span>
                                                ) : hasAbnormal ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                                                        Abnormal Finding
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700">
                                                        Normal Range
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                    rep.reportStatus === 'UNDER_REVIEW'
                                                        ? 'bg-amber-100 text-amber-800'
                                                        : 'bg-purple-100 text-purple-800'
                                                }`}>
                                                    {rep.reportStatus}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex items-center justify-end space-x-2">
                                                    <button
                                                        onClick={() => setPreviewReport(rep)}
                                                        className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition"
                                                    >
                                                        <FiEye className="w-3.5 h-3.5 mr-1 text-slate-500" />
                                                        Preview PDF
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(rep._id)}
                                                        disabled={processingId === rep._id}
                                                        className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition"
                                                    >
                                                        <FiXCircle className="w-3.5 h-3.5 mr-1" />
                                                        Reject
                                                    </button>
                                                    <button
                                                        onClick={() => handleApprove(rep._id)}
                                                        disabled={processingId === rep._id}
                                                        className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
                                                    >
                                                        <FiCheckCircle className="w-3.5 h-3.5 mr-1" />
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => handleRelease(rep._id)}
                                                        disabled={processingId === rep._id}
                                                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition"
                                                    >
                                                        <FiSend className="w-3.5 h-3.5 mr-1" />
                                                        Release
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
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
                    onClose={() => setPreviewReport(null)}
                />
            )}
        </div>
    );
};

export default LabReportReviewPage;
