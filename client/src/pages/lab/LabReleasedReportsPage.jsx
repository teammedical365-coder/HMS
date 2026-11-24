import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FiSend, FiDownload, FiEye, FiSearch, FiRefreshCw,
    FiFileText, FiLink, FiShare2, FiArrowLeft, FiCheck
} from 'react-icons/fi';
import { labAPI } from '../../utils/api';
import LabReportPreviewModal from './LabReportPreviewModal';

const LabReleasedReportsPage = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [previewReport, setPreviewReport] = useState(null);
    const [copiedTokenId, setCopiedTokenId] = useState(null);

    const loadReleasedReports = async () => {
        setLoading(true);
        try {
            const res = await labAPI.reports.getReports({
                status: 'RELEASED',
                search: search.trim() || undefined
            });
            if (res.success) {
                setReports(res.data || []);
            }
        } catch (err) {
            console.error('Failed to load released reports:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReleasedReports();
    }, []);

    const handleCopyShareLink = async (rep) => {
        try {
            const res = await labAPI.reports.generateToken(rep._id, { validityDays: 30 });
            if (res.success) {
                const fullUrl = `${window.location.origin}${res.data.accessUrl}`;
                await navigator.clipboard.writeText(fullUrl);
                setCopiedTokenId(rep._id);
                setTimeout(() => setCopiedTokenId(null), 3000);
            }
        } catch (err) {
            alert('Failed to generate secure patient access link');
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
                        <h1 className="text-2xl font-bold text-slate-900">Released Reports Registry</h1>
                        <p className="text-xs text-slate-500">
                            Registry of officially released diagnostic reports ready for secure patient access and delivery
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => navigate('/lab/reports/delivery')}
                    className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-sm transition"
                >
                    <FiSend className="w-4 h-4 mr-2" />
                    Delivery Management Console
                </button>
            </div>

            {/* Search Filter */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
                <div className="relative flex-1">
                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search released reports by Report No, Patient Name, Phone or UHID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadReleasedReports()}
                        className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                </div>
                <button
                    onClick={loadReleasedReports}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                >
                    Search
                </button>
            </div>

            {/* Released Reports Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs tracking-wider uppercase">
                                <th className="px-5 py-3.5">Report ID</th>
                                <th className="px-5 py-3.5">Patient Details</th>
                                <th className="px-5 py-3.5">Investigations</th>
                                <th className="px-5 py-3.5">Release Sign-off</th>
                                <th className="px-5 py-3.5">Metrics</th>
                                <th className="px-5 py-3.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-slate-400">
                                        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                        Loading released reports...
                                    </td>
                                </tr>
                            ) : reports.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-slate-400">
                                        No released reports found.
                                    </td>
                                </tr>
                            ) : (
                                reports.map((rep) => (
                                    <tr key={rep._id} className="hover:bg-slate-50/60 transition">
                                        <td className="px-5 py-4">
                                            <div className="font-semibold text-slate-900 font-mono text-xs">{rep.reportNumber}</div>
                                            <div className="text-xs text-slate-500 font-mono mt-0.5">Order: {rep.orderNumber}</div>
                                            {rep.revisionNumber > 1 && (
                                                <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">
                                                    Rev {rep.revisionNumber}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="font-medium text-slate-900">{rep.patientSnapshot?.name}</div>
                                            <div className="text-xs text-slate-500">
                                                {rep.patientSnapshot?.age} {rep.patientSnapshot?.ageUnit || 'Y'} • {rep.patientSnapshot?.gender}
                                            </div>
                                            <div className="text-[11px] text-slate-400">{rep.patientSnapshot?.phone}</div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="text-xs text-slate-800 font-medium">
                                                {rep.tests?.map(t => t.testName).join(', ')}
                                            </div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">
                                                {rep.department || 'General Pathology'}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-xs">
                                            <div className="font-medium text-slate-900">{rep.releasedByName || 'Chief Pathologist'}</div>
                                            <div className="text-[11px] text-slate-400">
                                                {rep.releasedAt ? new Date(rep.releasedAt).toLocaleString() : '-'}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-xs text-slate-500">
                                            <div>Downloads: <span className="font-semibold text-slate-700">{rep.downloadCount || 0}</span></div>
                                            <div>Prints: <span className="font-semibold text-slate-700">{rep.printCount || 0}</span></div>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex items-center justify-end space-x-2">
                                                <button
                                                    onClick={() => handleCopyShareLink(rep)}
                                                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition"
                                                    title="Copy Patient Secure Link"
                                                >
                                                    {copiedTokenId === rep._id ? (
                                                        <>
                                                            <FiCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                                            <span className="text-emerald-600 font-bold">Copied!</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <FiLink className="w-3.5 h-3.5 mr-1 text-slate-500" />
                                                            Patient Link
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => setPreviewReport(rep)}
                                                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition"
                                                >
                                                    <FiEye className="w-3.5 h-3.5 mr-1" />
                                                    View
                                                </button>
                                                <button
                                                    onClick={() => navigate('/lab/reports/delivery')}
                                                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                                                >
                                                    <FiSend className="w-3.5 h-3.5 mr-1" />
                                                    Dispatch
                                                </button>
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
                    canAmend={true}
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
                                    alert(`Amended report revision ${res.data.revisionNumber} created.`);
                                    setPreviewReport(null);
                                    loadReleasedReports();
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

export default LabReleasedReportsPage;
