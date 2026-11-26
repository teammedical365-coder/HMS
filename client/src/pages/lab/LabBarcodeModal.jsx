import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { generateCode128Svg } from '../../utils/code128';
import { useBranding } from '../../context/BrandingContext';
import { labAPI } from '../../utils/api';
import './LabBarcodeModal.css';
import { FiPrinter, FiX, FiTag } from 'react-icons/fi';

const formatStickerTimestamp = (dt) => {
    if (!dt) return '';
    try {
        const d = new Date(dt);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return '';
    }
};

const LabBarcodeModal = ({ labelData, onClose, onReprinted }) => {
    const { hospitalName: brandingHospitalName } = useBranding();
    const [copies, setCopies] = useState(1);
    const [printing, setPrinting] = useState(false);

    const resolvedHospitalName = (brandingHospitalName && brandingHospitalName !== 'Medical 365')
        ? brandingHospitalName
        : (labelData?.hospitalName || brandingHospitalName || 'Medical 365');
    const resolvedMrn = labelData?.mrn || labelData?.uhid || 'N/A';
    const collectedTimeStr = formatStickerTimestamp(labelData?.collectedAt);

    const barcodeSvg = generateCode128Svg(labelData?.barcode, { height: 42, barWidth: 1.65 });

    const handlePrint = async () => {
        if (!labelData?.barcode) {
            toast.error('Valid sample barcode is required before printing.');
            return;
        }
        setPrinting(true);
        try {
            if (labelData?.sampleId) {
                await labAPI.samples.reprintLabel(labelData.sampleId);
                if (onReprinted) onReprinted();
            }
        } catch (err) {
            console.error('Failed to log label print:', err);
        } finally {
            setPrinting(false);
            window.print();
        }
    };

    const stickers = Array.from({ length: copies });

    return (
        <div className="lbm-barcode-overlay" role="dialog" aria-modal="true" aria-label="Printable Specimen Barcode Label">
            <div className="lbm-barcode-card">
                {/* Header */}
                <div className="lbm-barcode-hdr">
                    <div className="lbm-barcode-title">
                        <FiTag /> Printable Specimen Barcode Label
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="lbm-barcode-close-btn"
                        aria-label="Close barcode modal"
                    >
                        <FiX />
                    </button>
                </div>

                {/* Body */}
                <div className="lbm-barcode-body">
                    {/* Copies Selector */}
                    <div className="lbm-copies-selector">
                        <span>Label Copies:</span>
                        {[1, 2, 3, 4].map((num) => (
                            <button
                                key={num}
                                type="button"
                                onClick={() => setCopies(num)}
                                className={`lbm-copies-btn ${copies === num ? 'active' : ''}`}
                            >
                                {num} {num === 1 ? 'Copy' : 'Copies'}
                            </button>
                        ))}
                    </div>

                    {/* Sticker Preview Container */}
                    <div className="lbm-sticker-container">
                        {stickers.map((_, idx) => (
                            <div key={idx} className="lbm-label-sticker">
                                <div className="lbm-sticker-hdr">
                                    <span className="lbm-sticker-lab">{resolvedHospitalName}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {labelData?.tubeLabel && (
                                            <span className="lbm-sticker-tube">{labelData.tubeLabel}</span>
                                        )}
                                        <span className={`lbm-sticker-priority ${(labelData?.priority || 'Routine').toLowerCase()}`}>
                                            {labelData?.priority || 'Routine'}
                                        </span>
                                    </div>
                                </div>

                                <div className="lbm-sticker-patient">
                                    {labelData?.patientName || 'Registered Patient'}
                                </div>

                                <div className="lbm-sticker-meta">
                                    <span>MRN: <strong>{resolvedMrn}</strong></span>
                                    <span>Order: <strong>{labelData?.orderNumber || '—'}</strong></span>
                                </div>

                                {/* Machine-Readable Vector Code 128 SVG Barcode */}
                                <div className="lbm-sticker-barcode-box">
                                    <div dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
                                    <div className="lbm-sticker-barcode-text">
                                        {labelData?.barcode}
                                    </div>
                                </div>

                                <div className="lbm-sticker-footer">
                                    <span><strong>{labelData?.containerType || 'Tube'}</strong> • {labelData?.specimenType || 'Specimen'}</span>
                                    <span className="lbm-sticker-tests">{labelData?.testsSummary || 'Lab Assay'}</span>
                                </div>

                                {collectedTimeStr && (
                                    <div className="lbm-sticker-collected">
                                        Collected: <strong>{collectedTimeStr}</strong>
                                        {labelData?.collectedByName ? ` • ${labelData.collectedByName}` : ''}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="lbm-barcode-footer">
                    <button
                        type="button"
                        onClick={onClose}
                        className="lbm-footer-btn-secondary"
                    >
                        Close
                    </button>
                    <button
                        type="button"
                        onClick={handlePrint}
                        disabled={printing}
                        className="lbm-footer-btn-primary"
                    >
                        <FiPrinter /> Print {copies} {copies === 1 ? 'Label' : 'Labels'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LabBarcodeModal;
