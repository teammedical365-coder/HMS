import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FiSend, FiMail, FiPhone, FiPrinter, FiCheckCircle,
    FiAlertCircle, FiArrowLeft, FiClock, FiFileText, FiRefreshCw
} from 'react-icons/fi';
import { labAPI } from '../../utils/api';

const LabReportDeliveryPage = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState([]);
    const [selectedReport, setSelectedReport] = useState(null);
    const [method, setMethod] = useState('PORTAL');
    const [customRecipient, setCustomRecipient] = useState('');
    const [loading, setLoading] = useState(true);
    const [dispatching, setDispatching] = useState(false);
    const [deliveryLogs, setDeliveryLogs] = useState([]);
    const [statusMessage, setStatusMessage] = useState('');

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await labAPI.reports.getReports({ status: 'RELEASED' });
            if (res.success) {
                setReports(res.data || []);
                if (res.data?.length > 0 && !selectedReport) {
                    setSelectedReport(res.data[0]);
                    setDeliveryLogs(res.data[0].deliveryAudit || []);
                }
            }
        } catch (err) {
            console.error('Failed to load released reports for delivery:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSelectReport = (rep) => {
        setSelectedReport(rep);
        setDeliveryLogs(rep.deliveryAudit || []);
        setStatusMessage('');
        setCustomRecipient('');
    };

    const handleDispatch = async () => {
        if (!selectedReport) return;

        setDispatching(true);
        setStatusMessage('');

        try {
            const payload = {
                method,
                recipient: customRecipient.trim() || undefined
            };

            const res = await labAPI.reports.deliverReport(selectedReport._id, payload);
            if (res.success) {
                setStatusMessage(`Report dispatched successfully via ${method}!`);
                // Refresh report history/logs
                const histRes = await labAPI.reports.getReportHistory(selectedReport._id);
                if (histRes.success) {
                    setDeliveryLogs(histRes.data.deliveryAudit || []);
                }
            } else {
                setStatusMessage(`Notice: ${res.message}`);
            }
        } catch (err) {
            setStatusMessage(`Failed: ${err.response?.data?.message || err.message}`);
        } finally {
            setDispatching(false);
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
                        <h1 className="text-2xl font-bold text-slate-900">Patient Report Delivery Management</h1>
                        <p className="text-xs text-slate-500">
                            Multi-channel report delivery console (Portal, Email, WhatsApp, and Manual Print) with immutable delivery audit logs
                        </p>
                    </div>
                </div>

                <button
                    onClick={loadData}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                    title="Refresh"
                >
                    <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Released Reports List */}
                <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col h-[75vh]">
                    <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-3 border-b border-slate-100">
                        Released Reports ({reports.length})
                    </h2>

                    <div className="flex-1 overflow-y-auto space-y-2 mt-3 pr-1">
                        {loading ? (
                            <div className="text-center py-10 text-slate-400 text-xs">Loading released reports...</div>
                        ) : reports.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 text-xs">No released reports found.</div>
                        ) : (
                            reports.map(rep => {
                                const isSelected = selectedReport?._id === rep._id;
                                return (
                                    <div
                                        key={rep._id}
                                        onClick={() => handleSelectReport(rep)}
                                        className={`p-3 rounded-xl border cursor-pointer transition ${
                                            isSelected
                                                ? 'bg-emerald-50 border-emerald-400 shadow-sm ring-2 ring-emerald-500/20'
                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono text-xs font-bold text-slate-800">{rep.reportNumber}</span>
                                            <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-semibold">
                                                Released
                                            </span>
                                        </div>
                                        <div className="text-sm font-medium text-slate-900 mt-1">{rep.patientSnapshot?.name}</div>
                                        <div className="text-xs text-slate-500">{rep.patientSnapshot?.phone || 'No phone'}</div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right: Delivery Workstation & Audit Log */}
                <div className="lg:col-span-2 space-y-6">
                    {selectedReport ? (
                        <>
                            {/* Dispatch Console Card */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-900">
                                            Dispatch Report: <span className="font-mono text-sky-700">{selectedReport.reportNumber}</span>
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            Recipient: {selectedReport.patientSnapshot?.name} ({selectedReport.patientSnapshot?.phone || 'N/A'})
                                        </p>
                                    </div>
                                </div>

                                {/* Channel Selector */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setMethod('PORTAL')}
                                        className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition ${
                                            method === 'PORTAL'
                                                ? 'bg-sky-50 border-sky-500 text-sky-800 ring-2 ring-sky-500/20'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                        }`}
                                    >
                                        <FiFileText className="w-5 h-5 text-sky-600" />
                                        <span className="text-xs font-semibold">Patient Portal</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setMethod('EMAIL')}
                                        className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition ${
                                            method === 'EMAIL'
                                                ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                        }`}
                                    >
                                        <FiMail className="w-5 h-5 text-blue-600" />
                                        <span className="text-xs font-semibold">Email PDF</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setMethod('WHATSAPP')}
                                        className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition ${
                                            method === 'WHATSAPP'
                                                ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                        }`}
                                    >
                                        <FiPhone className="w-5 h-5 text-emerald-600" />
                                        <span className="text-xs font-semibold">WhatsApp</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setMethod('PRINT')}
                                        className={`p-3 rounded-xl border flex flex-col items-center justify-center space-y-1.5 transition ${
                                            method === 'PRINT'
                                                ? 'bg-purple-50 border-purple-500 text-purple-800 ring-2 ring-purple-500/20'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                        }`}
                                    >
                                        <FiPrinter className="w-5 h-5 text-purple-600" />
                                        <span className="text-xs font-semibold">Physical Print</span>
                                    </button>
                                </div>

                                {/* Custom recipient input if email/whatsapp */}
                                {(method === 'EMAIL' || method === 'WHATSAPP') && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            {method === 'EMAIL' ? 'Recipient Email Address' : 'Recipient Phone Number'}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder={method === 'EMAIL' ? (selectedReport.patientSnapshot?.email || 'patient@example.com') : (selectedReport.patientSnapshot?.phone || '+91 98765 43210')}
                                            value={customRecipient}
                                            onChange={(e) => setCustomRecipient(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                                        />
                                    </div>
                                )}

                                {statusMessage && (
                                    <div className="p-3 bg-slate-50 border border-slate-200 text-xs rounded-xl text-slate-800">
                                        {statusMessage}
                                    </div>
                                )}

                                <div className="flex items-center justify-end pt-2">
                                    <button
                                        onClick={handleDispatch}
                                        disabled={dispatching}
                                        className="inline-flex items-center px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition disabled:opacity-50"
                                    >
                                        <FiSend className="w-4 h-4 mr-2" />
                                        {dispatching ? 'Dispatching...' : `Dispatch via ${method}`}
                                    </button>
                                </div>
                            </div>

                            {/* Delivery Audit Log */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                    Delivery History & Audit Trail
                                </h3>

                                {deliveryLogs.length === 0 ? (
                                    <div className="text-center py-6 text-slate-400 text-xs">
                                        No delivery attempts recorded for this report yet.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {deliveryLogs.map((log, idx) => (
                                            <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                                                <div>
                                                    <span className="font-bold text-slate-900">{log.deliveryMethod}</span>
                                                    <span className="text-slate-500 ml-2">to {log.recipient || 'Patient'}</span>
                                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                                        {new Date(log.sentAt).toLocaleString()} • Dispatched by {log.performedByName || 'Staff'}
                                                    </div>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded font-semibold ${
                                                    log.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' :
                                                    log.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                                    'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {log.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-24 bg-white rounded-2xl border border-slate-200 shadow-sm text-slate-400">
                            Select a released report to manage delivery channels.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LabReportDeliveryPage;
