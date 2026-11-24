import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FiPlus, FiCheckCircle, FiAlertCircle, FiArrowLeft, FiClock,
    FiFileText, FiUser, FiCalendar, FiChevronRight
} from 'react-icons/fi';
import { labAPI } from '../../utils/api';

const LabReportGenerator = () => {
    const navigate = useNavigate();
    const [pendingOrders, setPendingOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [reportType, setReportType] = useState('ROUTINE');
    const [overallInterpretation, setOverallInterpretation] = useState('');
    const [clinicalNotes, setClinicalNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const [ordersRes, tplRes] = await Promise.all([
                    labAPI.reports.getPendingOrders(),
                    labAPI.reports.getTemplates()
                ]);
                if (ordersRes.success) {
                    setPendingOrders(ordersRes.data || []);
                }
                if (tplRes.success && tplRes.data?.length > 0) {
                    setTemplates(tplRes.data);
                    const def = tplRes.data.find(t => t.isDefault) || tplRes.data[0];
                    if (def) setSelectedTemplateId(def._id);
                }
            } catch (err) {
                console.error('Error fetching generator initial data:', err);
                setError('Failed to load pending orders with verified results');
            } finally {
                setLoading(false);
            }
        };

        fetchInitialData();
    }, []);

    const handleGenerate = async () => {
        if (!selectedOrder) {
            alert('Please select an order to generate report');
            return;
        }

        setGenerating(true);
        setError('');

        try {
            const payload = {
                orderId: selectedOrder.orderId,
                reportType,
                templateId: selectedTemplateId || undefined,
                overallInterpretation: overallInterpretation.trim(),
                clinicalNotes: clinicalNotes.trim()
            };

            const res = await labAPI.reports.generateReport(payload);
            if (res.success) {
                alert(`Report draft ${res.data.reportNumber} generated successfully!`);
                navigate('/lab/reports');
            }
        } catch (err) {
            console.error('Report generation error:', err);
            setError(err.response?.data?.message || 'Failed to generate report draft. Ensure all tests are VERIFIED.');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Top Bar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => navigate('/lab/reports')}
                        className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition"
                    >
                        <FiArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Generate Diagnostic Report</h1>
                        <p className="text-xs text-slate-500">
                            Create print-ready diagnostic report from verified clinical test results
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center space-x-2">
                    <FiAlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Panel: Available Verified Orders */}
                <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col h-[75vh]">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                            Orders Ready ({pendingOrders.length})
                        </h2>
                        <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">
                            Verified Only
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 mt-3 pr-1">
                        {loading ? (
                            <div className="text-center py-10 text-slate-400 text-xs">
                                Loading orders with verified results...
                            </div>
                        ) : pendingOrders.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 text-xs">
                                <FiCheckCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                No pending verified orders found. Check the Verification Queue to verify test results.
                            </div>
                        ) : (
                            pendingOrders.map(order => {
                                const isSelected = selectedOrder?.orderId === order.orderId;
                                return (
                                    <div
                                        key={order.orderId}
                                        onClick={() => setSelectedOrder(order)}
                                        className={`p-3.5 rounded-xl border cursor-pointer transition ${
                                            isSelected
                                                ? 'bg-sky-50 border-sky-400 shadow-sm ring-2 ring-sky-500/20'
                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono text-xs font-bold text-slate-800">
                                                {order.orderNumber}
                                            </span>
                                            {order.hasExistingReport && (
                                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                                    Reported
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm font-medium text-slate-900 mt-1">
                                            {order.patientSnapshot?.name}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {order.patientSnapshot?.gender} • {order.patientSnapshot?.age} Years
                                        </div>
                                        <div className="mt-2 text-[11px] text-sky-700 font-semibold flex items-center">
                                            <span>{order.verifiedTests?.length} Verified Test(s)</span>
                                            <FiChevronRight className="w-3.5 h-3.5 ml-auto" />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Panel: Report Configuration & Preview */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                    {selectedOrder ? (
                        <>
                            {/* Selected Order Summary Banner */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <span className="text-xs text-slate-400 uppercase font-semibold">Selected Order</span>
                                    <div className="text-lg font-bold text-slate-900 font-mono">{selectedOrder.orderNumber}</div>
                                    <div className="text-sm font-medium text-slate-700">{selectedOrder.patientSnapshot?.name}</div>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs text-slate-400 uppercase font-semibold">Tests to Include</span>
                                    <div className="text-sm font-bold text-emerald-700">
                                        {selectedOrder.verifiedTests?.length} Tests (100% Verified)
                                    </div>
                                </div>
                            </div>

                            {/* Verified Tests Checklist */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                                    Verified Investigations Included in this Report
                                </label>
                                <div className="space-y-2">
                                    {selectedOrder.verifiedTests?.map(t => (
                                        <div key={t.resultId} className="flex items-center justify-between p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                                            <div className="flex items-center space-x-2.5">
                                                <FiCheckCircle className="w-4 h-4 text-emerald-600" />
                                                <span className="text-sm font-semibold text-slate-900">{t.testName}</span>
                                                <span className="text-xs font-mono text-slate-500">({t.testCode})</span>
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                Verified by {t.verifiedByName || 'Pathologist'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Report Configuration Options */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Report Priority / Classification
                                    </label>
                                    <select
                                        value={reportType}
                                        onChange={(e) => setReportType(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                    >
                                        <option value="ROUTINE">Routine</option>
                                        <option value="URGENT">Urgent</option>
                                        <option value="STAT">STAT (Immediate Attention)</option>
                                        <option value="CRITICAL">Critical Alert Included</option>
                                        <option value="CONFIDENTIAL">Confidential Clinical Report</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Branding & Print Layout Template
                                    </label>
                                    <select
                                        value={selectedTemplateId}
                                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                    >
                                        {templates.map(tpl => (
                                            <option key={tpl._id} value={tpl._id}>
                                                {tpl.templateName} {tpl.isDefault ? '(Default)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Overall Impression & Clinical Notes */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Overall Clinical Impression / Interpretation (Optional)
                                    </label>
                                    <textarea
                                        rows="3"
                                        placeholder="e.g. Findings consistent with normocytic normochromic anemia. Recommend iron profile."
                                        value={overallInterpretation}
                                        onChange={(e) => setOverallInterpretation(e.target.value)}
                                        className="w-full p-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                                        Special Clinical Notes & Methodology Remarks (Optional)
                                    </label>
                                    <textarea
                                        rows="2"
                                        placeholder="e.g. Test performed on automated analyzer using photometric assay."
                                        value={clinicalNotes}
                                        onChange={(e) => setClinicalNotes(e.target.value)}
                                        className="w-full p-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                                    />
                                </div>
                            </div>

                            {/* Bottom Generate Action */}
                            <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                                <button
                                    onClick={() => navigate('/lab/reports')}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleGenerate}
                                    disabled={generating}
                                    className="inline-flex items-center px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-sm transition disabled:opacity-50"
                                >
                                    <FiPlus className="w-4 h-4 mr-2" />
                                    {generating ? 'Compiling Report...' : 'Generate Report Draft'}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-20 text-slate-400">
                            <FiFileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <h3 className="text-base font-semibold text-slate-700">Select an Order from the Queue</h3>
                            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                Choose an order from the left column to compile its verified test findings into a formal diagnostic report.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LabReportGenerator;
