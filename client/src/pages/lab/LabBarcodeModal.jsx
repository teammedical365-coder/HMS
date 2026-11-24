import React, { useState } from 'react';
import { generateCode128Svg } from '../../utils/code128';
import { labAPI } from '../../utils/api';
import './LabBarcodeModal.css';
import { FiPrinter, FiX, FiCheckCircle, FiTag } from 'react-icons/fi';

const LabBarcodeModal = ({ labelData, onClose, onReprinted }) => {
    const [copies, setCopies] = useState(1);
    const [printing, setPrinting] = useState(false);

    const barcodeSvg = generateCode128Svg(labelData?.barcode, { height: 40, barWidth: 1.6 });

    const handlePrint = async () => {
        setPrinting(true);
        try {
            if (labelData?.sampleId) {
                await labAPI.samples.reprintLabel(labelData.sampleId);
                if (onReprinted) onReprinted();
            }
        } catch (err) {
            console.error('Failed to log reprint:', err);
        } finally {
            setPrinting(false);
            window.print();
        }
    };

    const stickers = Array.from({ length: copies });

    return (
        <div className="lbm-barcode-overlay">
            <div className="lbm-barcode-card">
                {/* Header */}
                <div className="lbm-barcode-hdr">
                    <div className="lbm-barcode-title">
                        <FiTag /> Thermal Barcode Specimen Label
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '20px' }}>
                        <FiX />
                    </button>
                </div>

                {/* Body */}
                <div className="lbm-barcode-body">
                    {/* Copies Selector */}
                    <div className="lbm-copies-selector">
                        <span>Label Copies:</span>
                        {[1, 2, 3, 4].map(num => (
                            <button
                                key={num}
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
                                    <span className="lbm-sticker-lab">{labelData?.hospitalName || 'Medical365 Laboratory'}</span>
                                    <span className={`lbm-sticker-priority ${(labelData?.priority || 'Routine').toLowerCase()}`}>
                                        {labelData?.priority || 'Routine'}
                                    </span>
                                </div>

                                <div className="lbm-sticker-patient">
                                    {labelData?.patientName || 'Patient Name'}
                                </div>

                                <div className="lbm-sticker-meta">
                                    <span>UHID: <strong>{labelData?.uhid || 'N/A'}</strong></span>
                                    <span>Ord: <strong>{labelData?.orderNumber}</strong></span>
                                </div>

                                {/* Machine-Readable Vector Code 128 SVG Barcode */}
                                <div className="lbm-sticker-barcode-box">
                                    <div dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
                                    <div className="lbm-sticker-barcode-text">
                                        {labelData?.barcode}
                                    </div>
                                </div>

                                <div className="lbm-sticker-footer">
                                    <span>{labelData?.containerType} • {labelData?.specimenType}</span>
                                    <span>{labelData?.testsSummary || 'Lab Tests'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="lbm-barcode-footer">
                    <button onClick={onClose} className="lab-btn lab-btn-secondary" style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
                        Close
                    </button>
                    <button
                        onClick={handlePrint}
                        disabled={printing}
                        className="lab-btn lab-btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                    >
                        <FiPrinter /> Print {copies} {copies === 1 ? 'Label' : 'Labels'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LabBarcodeModal;
