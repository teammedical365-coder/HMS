import React, { useState, useEffect } from 'react';
import { FiX, FiDownload, FiPrinter, FiSend, FiFileText, FiRefreshCw, FiExternalLink } from 'react-icons/fi';
import apiClient from '../../utils/api';

/**
 * LabReportPreviewModal — Phase 8
 * High-fidelity in-browser PDF preview with manual download, print, delivery dispatch, and amendment triggers.
 * Strictly adheres to rule: NO auto-download or auto-print. Only explicit user actions.
 */
const LabReportPreviewModal = ({
    reportId,
    reportNumber,
    isOpen,
    onClose,
    onDeliver,
    onAmend,
    canAmend = false
}) => {
    const [blobUrl, setBlobUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen || !reportId) {
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
                setBlobUrl(null);
            }
            return;
        }

        let isMounted = true;
        setLoading(true);
        setError('');

        apiClient.get(`/api/lab/reports/${reportId}/preview`, {
            responseType: 'blob'
        })
            .then(res => {
                if (!isMounted) return;
                const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                setBlobUrl(url);
                setLoading(false);
            })
            .catch(err => {
                if (!isMounted) return;
                console.error('Failed to load report PDF preview:', err);
                setError(err.response?.data?.message || 'Failed to render PDF preview');
                setLoading(false);
            });

        return () => {
            isMounted = false;
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
            }
        };
    }, [isOpen, reportId]);

    if (!isOpen) return null;

    const handleManualDownload = async () => {
        try {
            const res = await apiClient.get(`/api/lab/reports/${reportId}/download`, {
                responseType: 'blob'
            });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${reportNumber || 'Report'}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download error:', err);
            alert('Failed to download report PDF');
        }
    };

    const handleManualPrint = () => {
        if (!blobUrl) return;
        const iframe = document.getElementById('report-pdf-frame');
        if (iframe && iframe.contentWindow) {
            try {
                iframe.contentWindow.print();
            } catch (e) {
                window.open(blobUrl, '_blank');
            }
        } else {
            window.open(blobUrl, '_blank');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-5xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-sky-100 text-sky-700 rounded-lg">
                            <FiFileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Diagnostic Report Preview</h2>
                            <p className="text-xs text-slate-500 font-mono">{reportNumber || reportId}</p>
                        </div>
                    </div>

                    {/* Action Toolbar */}
                    <div className="flex items-center space-x-2">
                        {canAmend && onAmend && (
                            <button
                                onClick={onAmend}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors"
                                title="Issue an official revision"
                            >
                                <FiRefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                Amend Report
                            </button>
                        )}
                        {onDeliver && (
                            <button
                                onClick={onDeliver}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
                                title="Send via Email, WhatsApp or Portal"
                            >
                                <FiSend className="w-3.5 h-3.5 mr-1.5" />
                                Dispatch Delivery
                            </button>
                        )}
                        <button
                            onClick={handleManualPrint}
                            disabled={loading || !blobUrl}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors disabled:opacity-50"
                        >
                            <FiPrinter className="w-3.5 h-3.5 mr-1.5" />
                            Print
                        </button>
                        <button
                            onClick={handleManualDownload}
                            disabled={loading || !blobUrl}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                        >
                            <FiDownload className="w-3.5 h-3.5 mr-1.5" />
                            Download PDF
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors ml-2"
                        >
                            <FiX className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Modal Body / PDF Frame */}
                <div className="flex-1 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                    {loading && (
                        <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-sm font-medium text-slate-600">Generating print-ready PDF...</p>
                        </div>
                    )}

                    {error && (
                        <div className="text-center p-6 max-w-md bg-white rounded-xl shadow-sm border border-red-200">
                            <p className="text-sm font-semibold text-red-600 mb-2">Preview Generation Failed</p>
                            <p className="text-xs text-slate-500 mb-4">{error}</p>
                            <button
                                onClick={onClose}
                                className="px-4 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                            >
                                Close Preview
                            </button>
                        </div>
                    )}

                    {!loading && !error && blobUrl && (
                        <iframe
                            id="report-pdf-frame"
                            src={blobUrl}
                            title={`PDF Preview ${reportNumber}`}
                            className="w-full h-full border-none shadow-inner"
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default LabReportPreviewModal;
