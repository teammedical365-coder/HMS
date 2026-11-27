import React, { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
    FiUploadCloud,
    FiFileText,
    FiCheckCircle,
    FiAlertTriangle,
    FiAlertCircle,
    FiPlus,
    FiTrash2,
    FiRotateCcw,
    FiEye,
    FiCheck,
    FiX,
    FiSearch,
    FiShield,
    FiChevronLeft,
    FiChevronRight,
    FiRefreshCw
} from 'react-icons/fi';
import { pharmacyAPI } from '../../utils/api';
import './SmartInvoiceImportPanel.css';

const PAGE_SIZE = 20;
const UNITS_LIST = ['Tablets', 'Capsules', 'Strip', 'Sachets', 'Powder', 'Number', 'Syrup', 'Injection', 'Ointment', 'Others'];

function computeLineNet(row) {
    const qty = Number(row.purchaseQty) || 0;
    const rate = Number(row.purchaseRate) || 0;
    const disc = Number(row.discount) || 0;
    const gst = Number(row.gst) || 0;
    const gross = qty * rate;
    const taxable = row.discountType === 'Flat Amount'
        ? Math.max(0, gross - disc)
        : Math.max(0, gross * (1 - disc / 100));
    return taxable * (1 + gst / 100);
}

function recomputeRowValidation(row) {
    const warnings = [];
    const fieldConfidence = { ...(row.fieldConfidence || {}) };

    const nameOk = Boolean(row.medicineName && row.medicineName.trim().length >= 2);
    const qtyVal = Number(row.purchaseQty);
    const freeVal = Number(row.freeQty) || 0;
    const qtyOk = (Number.isFinite(qtyVal) && qtyVal > 0) || (Number.isFinite(qtyVal) && qtyVal === 0 && freeVal > 0);
    const rateOk = row.purchaseRate !== '' && row.purchaseRate !== null && row.purchaseRate !== undefined && Number.isFinite(Number(row.purchaseRate)) && Number(row.purchaseRate) >= 0;

    if (!nameOk) {
        fieldConfidence.medicineName = 'missing';
        warnings.push('Medicine name is required');
    } else if (row.editedFields?.medicineName) {
        fieldConfidence.medicineName = 'high';
    }

    if (!qtyOk) {
        fieldConfidence.purchaseQty = 'missing';
        warnings.push('Valid quantity (> 0) is required');
    } else if (row.editedFields?.purchaseQty) {
        fieldConfidence.purchaseQty = 'high';
    }

    if (!rateOk) {
        fieldConfidence.purchaseRate = 'missing';
        warnings.push('Purchase rate is required');
    } else if (row.editedFields?.purchaseRate) {
        fieldConfidence.purchaseRate = 'high';
    }

    const mrpNum = Number(row.mrp);
    if (row.mrp !== '' && row.mrp !== null && row.mrp !== undefined) {
        if (Number.isFinite(mrpNum) && Number.isFinite(Number(row.purchaseRate)) && mrpNum > 0 && mrpNum < Number(row.purchaseRate)) {
            fieldConfidence.mrp = 'low';
            warnings.push(`MRP (₹${mrpNum}) < Purchase Rate (₹${row.purchaseRate})`);
        } else if (row.editedFields?.mrp) {
            fieldConfidence.mrp = 'high';
        }
    } else {
        fieldConfidence.mrp = 'missing';
    }

    if (row.batch && String(row.batch).trim()) {
        if (row.editedFields?.batch) fieldConfidence.batch = 'high';
    } else {
        fieldConfidence.batch = 'missing';
        warnings.push('Batch number not specified');
    }

    const isDevice = /consumable|surgical|thermometer|mask|glove|syringe/i.test(`${row.category} ${row.medicineName}`);
    if (row.expiry && String(row.expiry).trim()) {
        const d = new Date(row.expiry);
        if (Number.isNaN(d.getTime())) {
            fieldConfidence.expiry = 'low';
            warnings.push('Invalid expiry date');
        } else {
            if (row.editedFields?.expiry) fieldConfidence.expiry = 'high';
            if (d < new Date()) warnings.push('Expiry date is in the past');
        }
    } else if (!row.expiryIsNA && !isDevice) {
        fieldConfidence.expiry = 'missing';
        warnings.push('Expiry date missing');
    }

    if (qtyOk && rateOk && row.amount !== '' && row.amount !== null && row.amount !== undefined && Number(row.amount) > 0) {
        const expected = computeLineNet(row);
        const extractedAmt = Number(row.amount);
        const tol = Math.max(2, extractedAmt * 0.015);
        if (Math.abs(expected - extractedAmt) > tol) {
            warnings.push(`Calculated ₹${expected.toFixed(2)} differs from invoice ₹${extractedAmt.toFixed(2)}`);
        }
    }

    const weights = { high: 1, medium: 0.72, low: 0.35, missing: 0 };
    const tracked = ['medicineName', 'purchaseQty', 'purchaseRate', 'mrp', 'batch', 'expiry'];
    const conf = Math.round((tracked.reduce((s, k) => s + (weights[fieldConfidence[k]] || 0), 0) / tracked.length) * 100);

    const validationStatus = (!nameOk || !qtyOk || !rateOk)
        ? 'Incomplete'
        : (warnings.length > 0 ? 'Warning' : 'Valid');

    return {
        ...row,
        confidence: row.isManualRow ? 100 : conf,
        fieldConfidence,
        warnings,
        validationStatus
    };
}

const SmartInvoiceImportPanel = ({
    vendors = [],
    onImportCompleted,
    onSwitchToManual
}) => {
    // Stage: 'upload' | 'processing' | 'review' | 'confirm' | 'summary'
    const [stage, setStage] = useState('upload');
    const [processStepText, setProcessStepText] = useState('');
    const [dragOver, setDragOver] = useState(false);

    const [uploadError, setUploadError] = useState('');
    const [duplicateConflict, setDuplicateConflict] = useState(null);
    const [lastFile, setLastFile] = useState(null);

    const [invoiceData, setInvoiceData] = useState(null);
    const [extractionMeta, setExtractionMeta] = useState({});
    const [matchedVendor, setMatchedVendor] = useState(null);

    const [invoiceForm, setInvoiceForm] = useState({
        vendorId: '',
        vendorName: '',
        vendorGST: '',
        vendorDL: '',
        invoiceNumber: '',
        invoiceDate: ''
    });

    const [rows, setRows] = useState([]);
    const [saveVendorMapping, setSaveVendorMapping] = useState(true);

    // Filter, search & pagination for large multi-page invoices
    const [rowFilter, setRowFilter] = useState('all'); // 'all' | 'issues' | 'missing' | 'ready'
    const [rowSearch, setRowSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // PDF Preview Modal
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewBlobUrl, setPreviewBlobUrl] = useState('');
    const [loadingPreview, setLoadingPreview] = useState(false);

    // Import progress & final summary
    const [importing, setImporting] = useState(false);
    const [importSummary, setImportSummary] = useState(null);

    useEffect(() => {
        return () => {
            if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
        };
    }, [previewBlobUrl]);

    const handleFileSelected = async (file, { allowRevised = false } = {}) => {
        if (!file) return;
        setUploadError('');
        setDuplicateConflict(null);

        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
        if (!isPdf) {
            setUploadError('Unsupported file format. Only PDF (.pdf) vendor invoice files are allowed.');
            return;
        }
        if (file.size === 0) {
            setUploadError('The selected PDF file is empty (0 bytes).');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setUploadError('PDF file exceeds the 10MB size limit.');
            return;
        }

        setLastFile(file);
        setStage('processing');
        setProcessStepText('Validating PDF & extracting document coordinates (Layer 1–2)...');

        const stepTimer = setTimeout(() => {
            setProcessStepText('Detecting columns, vendor format & running OCR/validation checks if needed...');
        }, 1200);

        try {
            const fd = new FormData();
            fd.append('invoice', file);
            if (allowRevised) fd.append('allowRevised', 'true');

            const res = await pharmacyAPI.uploadPurchaseInvoice(fd);
            clearTimeout(stepTimer);

            if (!res?.success || !res?.invoice) {
                throw new Error(res?.message || 'Could not process invoice PDF.');
            }

            const inv = res.invoice;
            const extractedRows = (res.medicines || []).map((m, idx) => recomputeRowValidation({
                ...m,
                _localId: `row_${Date.now()}_${idx}`,
                included: m.included !== false,
                editedFields: {},
                expiry: m.expiry ? String(m.expiry).slice(0, 10) : '',
                purchaseQty: m.purchaseQty ?? '',
                freeQty: m.freeQty ?? 0,
                purchaseRate: m.purchaseRate ?? '',
                mrp: m.mrp ?? '',
                discount: m.discount ?? '',
                gst: m.gst ?? '',
                amount: m.amount ?? ''
            }));

            setInvoiceData(inv);
            setExtractionMeta(res.extractionMeta || {});
            setMatchedVendor(res.matchedVendor || null);
            setInvoiceForm({
                vendorId: inv.vendorId || res.matchedVendor?._id || '',
                vendorName: inv.vendorName || res.matchedVendor?.vendorName || '',
                vendorGST: inv.vendorGST || res.matchedVendor?.gstin || '',
                vendorDL: inv.vendorDL || res.matchedVendor?.dlNumber || '',
                invoiceNumber: inv.invoiceNumber || '',
                invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split('T')[0] : ''
            });
            setRows(extractedRows);
            setCurrentPage(1);
            setRowFilter('all');
            setRowSearch('');
            setStage('review');
            toast.success(res.message || `Extracted ${extractedRows.length} items for review`);
        } catch (err) {
            clearTimeout(stepTimer);
            const data = err.response?.data;
            if (err.response?.status === 409 && data?.code === 'DUPLICATE_INVOICE') {
                setDuplicateConflict(data);
                setUploadError(data.message || 'Duplicate invoice detected.');
            } else {
                setUploadError(data?.message || err.message || 'Failed to read PDF invoice.');
            }
            setStage('upload');
        }
    };

    const updateRowField = (localId, field, value) => {
        setRows((prev) => prev.map((r) => {
            if (r._localId !== localId) return r;
            const origVal = r.originalExtracted?.[field];
            const isChanged = origVal !== undefined && String(value ?? '') !== String(origVal ?? '');
            const editedFields = { ...(r.editedFields || {}) };
            if (isChanged) editedFields[field] = true;
            else delete editedFields[field];

            const next = { ...r, [field]: value, editedFields };
            return recomputeRowValidation(next);
        }));
    };

    const revertRowToOriginal = (localId) => {
        setRows((prev) => prev.map((r) => {
            if (r._localId !== localId || !r.originalExtracted) return r;
            return recomputeRowValidation({
                ...r,
                ...r.originalExtracted,
                expiry: r.originalExtracted.expiry ? String(r.originalExtracted.expiry).slice(0, 10) : '',
                purchaseQty: r.originalExtracted.purchaseQty ?? '',
                freeQty: r.originalExtracted.freeQty ?? 0,
                purchaseRate: r.originalExtracted.purchaseRate ?? '',
                mrp: r.originalExtracted.mrp ?? '',
                discount: r.originalExtracted.discount ?? '',
                gst: r.originalExtracted.gst ?? '',
                amount: r.originalExtracted.amount ?? '',
                editedFields: {}
            });
        }));
        toast('Row restored to originally extracted values');
    };

    const applySuggestedMatch = (localId, matchObj) => {
        setRows((prev) => prev.map((r) => {
            if (r._localId !== localId) return r;
            if (!matchObj) {
                return {
                    ...r,
                    matchedInventoryId: null,
                    importAction: 'create_new'
                };
            }
            const next = {
                ...r,
                matchedInventoryId: matchObj.inventoryId || null,
                importAction: matchObj.inventoryId ? 'link_existing' : 'create_new',
                medicineName: matchObj.name || r.medicineName,
                salt: r.salt || matchObj.salt || '',
                category: r.category || matchObj.category || 'General',
                unit: matchObj.unit || r.unit || 'Tablets',
                editedFields: { ...(r.editedFields || {}), medicineName: true }
            };
            return recomputeRowValidation(next);
        }));
    };

    const handleAddManualRow = () => {
        const blank = recomputeRowValidation({
            _localId: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            rowNumber: rows.length + 1,
            medicineName: '',
            rawMedicineName: '',
            salt: '',
            category: 'General',
            manufacturer: '',
            packSize: '',
            unit: 'Tablets',
            unitsPerStrip: 1,
            hsnCode: '',
            batch: '',
            expiry: '',
            purchaseQty: '',
            freeQty: 0,
            purchaseRate: '',
            mrp: '',
            discount: '',
            discountType: 'Percentage',
            gst: '',
            amount: '',
            confidence: 100,
            fieldConfidence: { medicineName: 'missing', purchaseQty: 'missing', purchaseRate: 'missing', mrp: 'missing', batch: 'missing', expiry: 'missing' },
            suggestedMatches: [],
            matchedInventoryId: null,
            importAction: 'create_new',
            included: true,
            isManualRow: true,
            editedFields: {}
        });
        const nextRows = [...rows, blank];
        setRows(nextRows);
        setCurrentPage(Math.ceil(nextRows.length / PAGE_SIZE));
    };

    const handleRemoveRow = (localId) => {
        setRows((prev) => prev.filter((r) => r._localId !== localId));
    };

    const openPdfPreview = async () => {
        if (!invoiceData?._id) return;
        setShowPreviewModal(true);
        if (previewBlobUrl) return;
        setLoadingPreview(true);
        try {
            const blob = await pharmacyAPI.getPurchaseInvoiceFileBlob(invoiceData._id);
            const url = URL.createObjectURL(blob);
            setPreviewBlobUrl(url);
        } catch (err) {
            toast.error('Unable to load secure PDF preview.');
            setShowPreviewModal(false);
        } finally {
            setLoadingPreview(false);
        }
    };

    const stats = useMemo(() => {
        const included = rows.filter((r) => r.included);
        const ready = included.filter((r) => r.validationStatus === 'Valid').length;
        const warnings = included.filter((r) => r.validationStatus === 'Warning').length;
        const incomplete = included.filter((r) => r.validationStatus === 'Incomplete').length;
        const skipped = rows.length - included.length;
        const linkExisting = included.filter((r) => r.importAction === 'link_existing' && r.matchedInventoryId).length;
        const createNew = included.length - linkExisting;
        const calculatedGrand = included.reduce((s, r) => s + computeLineNet(r), 0);

        return {
            total: rows.length,
            included: included.length,
            ready,
            warnings,
            incomplete,
            skipped,
            linkExisting,
            createNew,
            calculatedGrand: Number(calculatedGrand.toFixed(2))
        };
    }, [rows]);

    const filteredRows = useMemo(() => {
        return rows.filter((r) => {
            if (rowFilter === 'issues' && r.validationStatus === 'Valid') return false;
            if (rowFilter === 'missing' && r.validationStatus !== 'Incomplete') return false;
            if (rowFilter === 'ready' && r.validationStatus !== 'Valid') return false;
            if (rowSearch.trim()) {
                const q = rowSearch.toLowerCase();
                const hay = `${r.medicineName} ${r.salt} ${r.batch} ${r.hsnCode}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [rows, rowFilter, rowSearch]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const pagedRows = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return filteredRows.slice(start, start + PAGE_SIZE);
    }, [filteredRows, safePage]);

    const handleConfirmBulkImport = async () => {
        if (!invoiceData?._id) return;
        setImporting(true);
        try {
            const payload = {
                invoiceMeta: {
                    vendorId: invoiceForm.vendorId || null,
                    vendorName: invoiceForm.vendorName,
                    vendorGST: invoiceForm.vendorGST,
                    vendorDL: invoiceForm.vendorDL,
                    invoiceNumber: invoiceForm.invoiceNumber,
                    invoiceDate: invoiceForm.invoiceDate || null
                },
                saveVendorMapping,
                allowRevised: Boolean(invoiceData.isRevisedDuplicate),
                rows: rows.map((r) => ({
                    ...r,
                    importAction: r.included ? r.importAction : 'skip'
                }))
            };
            const res = await pharmacyAPI.bulkImportPurchaseInvoice(invoiceData._id, payload);
            if (!res?.success) {
                throw new Error(res?.message || 'Bulk import failed.');
            }
            setImportSummary(res);
            setStage('summary');
            toast.success(res.message || 'Medicines imported successfully!');
            if (onImportCompleted) onImportCompleted(res);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Bulk import failed.');
        } finally {
            setImporting(false);
        }
    };

    const resetWorkflow = () => {
        if (previewBlobUrl) {
            URL.revokeObjectURL(previewBlobUrl);
            setPreviewBlobUrl('');
        }
        setStage('upload');
        setUploadError('');
        setDuplicateConflict(null);
        setInvoiceData(null);
        setRows([]);
        setImportSummary(null);
        setLastFile(null);
    };

    const stepIndex = stage === 'upload' ? 1 : stage === 'processing' ? 2 : stage === 'review' ? 3 : stage === 'confirm' ? 5 : 6;

    return (
        <div className="sii-container">
            {/* Top Stage Stepper */}
            <div className="sii-header-bar">
                <div>
                    <h3 className="sii-title">
                        <FiFileText /> Upload Purchase Invoice (Smart Multi-Vendor PDF Import)
                    </h3>
                    <p className="sii-subtitle">
                        Supports native &amp; scanned multi-page PDFs, dynamic vendor layouts, confidence validation, and bulk inventory import (Max 10MB)
                    </p>
                </div>
                <div className="sii-stepper" aria-label="Import workflow progress">
                    {[
                        { num: 1, label: 'Upload' },
                        { num: 2, label: 'Processing' },
                        { num: 3, label: 'Review & Correct' },
                        { num: 5, label: 'Confirm Import' },
                        { num: 6, label: 'Summary' }
                    ].map((s) => (
                        <span
                            key={s.num}
                            className={`sii-step-pill ${stepIndex === s.num ? 'active' : stepIndex > s.num ? 'done' : ''}`}
                        >
                            {stepIndex > s.num ? <FiCheck size={12} /> : null}
                            <span>{s.label}</span>
                        </span>
                    ))}
                </div>
            </div>

            {/* STAGE 1: UPLOAD INVOICE */}
            {stage === 'upload' && (
                <div className="sii-upload-stage">
                    <label
                        className={`sii-dropzone ${dragOver ? 'drag-over' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            const f = e.dataTransfer?.files?.[0];
                            if (f) handleFileSelected(f);
                        }}
                    >
                        <input
                            type="file"
                            accept=".pdf,application/pdf"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFileSelected(f);
                                e.target.value = '';
                            }}
                            style={{ display: 'none' }}
                        />
                        <div className="sii-drop-icon"><FiUploadCloud size={28} /></div>
                        <div className="sii-drop-main">Drop vendor purchase invoice PDF here, or <span>browse file</span></div>
                        <div className="sii-drop-hint">PDF only • Max 10MB • Automatically adapts to vendor tables &amp; multi-page invoices</div>
                    </label>

                    {uploadError && (
                        <div className="sii-error-banner">
                            <div className="sii-error-msg">
                                <FiAlertCircle size={18} style={{ flexShrink: 0 }} />
                                <span>{uploadError}</span>
                            </div>
                            <div className="sii-error-actions">
                                {duplicateConflict && lastFile && (
                                    <button
                                        type="button"
                                        className="sii-btn sii-btn-warn"
                                        onClick={() => handleFileSelected(lastFile, { allowRevised: true })}
                                    >
                                        Import as Revised / Corrected Copy
                                    </button>
                                )}
                                {onSwitchToManual && (
                                    <button type="button" className="sii-btn sii-btn-outline" onClick={onSwitchToManual}>
                                        Enter Medicines Manually Instead
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* STAGE 2: PROCESSING (NON-BLOCKING) */}
            {stage === 'processing' && (
                <div className="sii-processing-card">
                    <div className="sii-spinner" />
                    <div>
                        <div className="sii-proc-title">Analyzing Vendor Invoice PDF...</div>
                        <div className="sii-proc-desc">{processStepText}</div>
                    </div>
                </div>
            )}

            {/* STAGES 3 & 4: REVIEW, CORRECT & VALIDATE */}
            {stage === 'review' && invoiceData && (
                <div className="sii-review-stage">
                    {/* Invoice Metadata & Math Check Strip */}
                    <div className="sii-meta-panel">
                        <div className="sii-meta-grid">
                            <div className="sii-meta-field">
                                <label>Vendor / Supplier</label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <select
                                        value={invoiceForm.vendorId || ''}
                                        onChange={(e) => {
                                            const v = vendors.find((x) => x._id === e.target.value);
                                            setInvoiceForm((p) => ({
                                                ...p,
                                                vendorId: e.target.value,
                                                vendorName: v ? v.vendorName : p.vendorName,
                                                vendorGST: v?.gstin || p.vendorGST,
                                                vendorDL: v?.dlNumber || p.vendorDL
                                            }));
                                        }}
                                    >
                                        <option value="">-- Auto / Custom Vendor --</option>
                                        {vendors.map((v) => (
                                            <option key={v._id} value={v._id}>{v.vendorName}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        value={invoiceForm.vendorName}
                                        onChange={(e) => setInvoiceForm((p) => ({ ...p, vendorName: e.target.value }))}
                                        placeholder="Vendor Name"
                                    />
                                </div>
                            </div>

                            <div className="sii-meta-field">
                                <label>Invoice Number</label>
                                <input
                                    type="text"
                                    value={invoiceForm.invoiceNumber}
                                    onChange={(e) => setInvoiceForm((p) => ({ ...p, invoiceNumber: e.target.value }))}
                                    placeholder="Invoice No."
                                />
                            </div>

                            <div className="sii-meta-field">
                                <label>Invoice Date</label>
                                <input
                                    type="date"
                                    value={invoiceForm.invoiceDate}
                                    onChange={(e) => setInvoiceForm((p) => ({ ...p, invoiceDate: e.target.value }))}
                                />
                            </div>

                            <div className="sii-meta-field">
                                <label>Vendor GSTIN / DL No.</label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <input
                                        type="text"
                                        value={invoiceForm.vendorGST}
                                        onChange={(e) => setInvoiceForm((p) => ({ ...p, vendorGST: e.target.value.toUpperCase() }))}
                                        placeholder="GSTIN"
                                    />
                                    <input
                                        type="text"
                                        value={invoiceForm.vendorDL}
                                        onChange={(e) => setInvoiceForm((p) => ({ ...p, vendorDL: e.target.value }))}
                                        placeholder="DL No."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="sii-meta-badges-row">
                            <span className="sii-badge sii-badge-info">
                                Method: {extractionMeta.ocrUsed ? 'OCR Fallback (Scanned PDF)' : 'Native PDF Table Parser'} • {extractionMeta.pageCount || 1} Page(s)
                            </span>
                            <span className="sii-badge sii-badge-neutral">
                                Avg Confidence: {extractionMeta.overallConfidence ?? stats.ready}%
                            </span>
                            {matchedVendor?.learnedMappingsCount > 0 && (
                                <span className="sii-badge sii-badge-ok">
                                    Learned Vendor Format Applied ({matchedVendor.learnedMappingsCount} columns)
                                </span>
                            )}
                            {invoiceData.grandTotal > 0 && (
                                <span className={`sii-badge ${extractionMeta.mathMismatch ? 'sii-badge-warn' : 'sii-badge-ok'}`}>
                                    Printed Grand Total: ₹{Number(invoiceData.grandTotal).toLocaleString('en-IN')} | Rows Sum: ₹{stats.calculatedGrand.toLocaleString('en-IN')}
                                </span>
                            )}
                            <label className="sii-learn-check">
                                <input
                                    type="checkbox"
                                    checked={saveVendorMapping}
                                    onChange={(e) => setSaveVendorMapping(e.target.checked)}
                                />
                                <span>Remember column layout for this vendor</span>
                            </label>
                        </div>

                        {Array.isArray(extractionMeta.warnings) && extractionMeta.warnings.length > 0 && (
                            <div className="sii-warnings-box">
                                <FiAlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    {extractionMeta.warnings.map((w, i) => (
                                        <div key={i}>{w}</div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Table Controls */}
                    <div className="sii-table-toolbar">
                        <div className="sii-filter-pills">
                            <button type="button" className={rowFilter === 'all' ? 'active' : ''} onClick={() => { setRowFilter('all'); setCurrentPage(1); }}>
                                All ({rows.length})
                            </button>
                            <button type="button" className={rowFilter === 'ready' ? 'active' : ''} onClick={() => { setRowFilter('ready'); setCurrentPage(1); }}>
                                Valid ({rows.filter((r) => r.validationStatus === 'Valid').length})
                            </button>
                            <button type="button" className={rowFilter === 'issues' ? 'active' : ''} onClick={() => { setRowFilter('issues'); setCurrentPage(1); }}>
                                Needs Review ({rows.filter((r) => r.validationStatus !== 'Valid').length})
                            </button>
                            <button type="button" className={rowFilter === 'missing' ? 'active' : ''} onClick={() => { setRowFilter('missing'); setCurrentPage(1); }}>
                                Missing Required ({rows.filter((r) => r.validationStatus === 'Incomplete').length})
                            </button>
                        </div>

                        <div className="sii-toolbar-right">
                            <div className="sii-search-input">
                                <FiSearch size={14} />
                                <input
                                    type="text"
                                    placeholder="Search medicine / batch / HSN..."
                                    value={rowSearch}
                                    onChange={(e) => { setRowSearch(e.target.value); setCurrentPage(1); }}
                                />
                            </div>
                            <button type="button" className="sii-btn sii-btn-outline" onClick={openPdfPreview}>
                                <FiEye size={14} /> Preview PDF
                            </button>
                            <button type="button" className="sii-btn sii-btn-outline" onClick={handleAddManualRow}>
                                <FiPlus size={14} /> Add Row
                            </button>
                            <button type="button" className="sii-btn sii-btn-danger-outline" onClick={resetWorkflow}>
                                <FiX size={14} /> Cancel
                            </button>
                        </div>
                    </div>

                    {/* Editable Multi-Page Review Table */}
                    <div className="sii-table-wrap">
                        <table className="sii-review-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '36px' }}>
                                        <input
                                            type="checkbox"
                                            checked={rows.length > 0 && rows.every((r) => r.included)}
                                            onChange={(e) => setRows((prev) => prev.map((r) => ({ ...r, included: e.target.checked })))}
                                            title="Include / exclude all rows"
                                        />
                                    </th>
                                    <th style={{ width: '42px' }}>#</th>
                                    <th style={{ minWidth: '230px' }}>Medicine Name &amp; Match</th>
                                    <th style={{ minWidth: '140px' }}>Composition / Salt</th>
                                    <th style={{ minWidth: '115px' }}>Batch</th>
                                    <th style={{ minWidth: '132px' }}>Expiry</th>
                                    <th style={{ width: '76px' }}>Qty</th>
                                    <th style={{ width: '70px' }}>Free</th>
                                    <th style={{ width: '92px' }}>Pur. Rate</th>
                                    <th style={{ width: '92px' }}>MRP</th>
                                    <th style={{ width: '72px' }}>Disc%</th>
                                    <th style={{ width: '72px' }}>GST%</th>
                                    <th style={{ minWidth: '115px' }}>Confidence</th>
                                    <th style={{ minWidth: '145px' }}>Validation</th>
                                    <th style={{ width: '74px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={15} className="sii-empty-cell">
                                            No medicine rows match the current filter. Click <strong>+ Add Row</strong> to enter an item manually.
                                        </td>
                                    </tr>
                                ) : (
                                    pagedRows.map((row) => {
                                        const fc = row.fieldConfidence || {};
                                        const isEdited = Object.keys(row.editedFields || {}).length > 0;
                                        const cellClass = (field) => {
                                            const st = fc[field];
                                            if (st === 'missing') return 'sii-cell-missing';
                                            if (st === 'low') return 'sii-cell-low';
                                            if (st === 'medium') return 'sii-cell-med';
                                            return '';
                                        };

                                        return (
                                            <tr key={row._localId} className={!row.included ? 'sii-row-excluded' : ''}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={row.included}
                                                        onChange={(e) => setRows((prev) => prev.map((x) => x._localId === row._localId ? { ...x, included: e.target.checked } : x))}
                                                    />
                                                </td>
                                                <td className="sii-num-col">{row.rowNumber}</td>

                                                <td className={cellClass('medicineName')}>
                                                    <input
                                                        type="text"
                                                        className="sii-cell-input sii-input-bold"
                                                        value={row.medicineName}
                                                        onChange={(e) => updateRowField(row._localId, 'medicineName', e.target.value)}
                                                        placeholder="Medicine Name *"
                                                    />
                                                    {row.editedFields?.medicineName && row.originalExtracted?.medicineName !== undefined && (
                                                        <div className="sii-orig-hint">Orig: {row.originalExtracted.medicineName || '—'}</div>
                                                    )}
                                                    <div className="sii-row-submeta">
                                                        <select
                                                            className="sii-mini-select"
                                                            value={row.unit || 'Tablets'}
                                                            onChange={(e) => updateRowField(row._localId, 'unit', e.target.value)}
                                                        >
                                                            {UNITS_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
                                                        </select>
                                                        {row.packSize && <span className="sii-chip">{row.packSize}</span>}
                                                        {row.hsnCode && <span className="sii-chip">HSN: {row.hsnCode}</span>}
                                                    </div>

                                                    {/* Candidate Inventory Suggestions (Explicit User Confirmation — Never Auto-Merged) */}
                                                    {Array.isArray(row.suggestedMatches) && row.suggestedMatches.length > 0 && (
                                                        <div className="sii-match-box">
                                                            <select
                                                                className="sii-match-select"
                                                                value={row.matchedInventoryId || ''}
                                                                onChange={(e) => {
                                                                    const sel = row.suggestedMatches.find((m) => String(m.inventoryId) === e.target.value);
                                                                    applySuggestedMatch(row._localId, sel || null);
                                                                }}
                                                            >
                                                                <option value="">+ Create as New Medicine</option>
                                                                {row.suggestedMatches.filter((m) => m.inventoryId).map((m) => (
                                                                    <option key={m.inventoryId} value={m.inventoryId}>
                                                                        Link Existing ({m.matchScore}%): {m.name} {m.batchNumber ? `[${m.batchNumber}]` : ''}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                </td>

                                                <td>
                                                    <input
                                                        type="text"
                                                        className="sii-cell-input"
                                                        value={row.salt || ''}
                                                        onChange={(e) => updateRowField(row._localId, 'salt', e.target.value)}
                                                        placeholder="Salt / Composition"
                                                    />
                                                    {row.editedFields?.salt && (
                                                        <div className="sii-orig-hint">Orig: {row.originalExtracted?.salt || '—'}</div>
                                                    )}
                                                </td>

                                                <td className={cellClass('batch')}>
                                                    <input
                                                        type="text"
                                                        className="sii-cell-input"
                                                        value={row.batch || ''}
                                                        onChange={(e) => updateRowField(row._localId, 'batch', e.target.value)}
                                                        placeholder="Batch No."
                                                    />
                                                    {row.editedFields?.batch && (
                                                        <div className="sii-orig-hint">Orig: {row.originalExtracted?.batch || '—'}</div>
                                                    )}
                                                </td>

                                                <td className={cellClass('expiry')}>
                                                    <input
                                                        type="date"
                                                        className="sii-cell-input"
                                                        value={row.expiry || ''}
                                                        onChange={(e) => updateRowField(row._localId, 'expiry', e.target.value)}
                                                    />
                                                    {row.expiryRaw && !row.expiry && (
                                                        <div className="sii-orig-hint">PDF: {row.expiryRaw}</div>
                                                    )}
                                                    {row.editedFields?.expiry && (
                                                        <div className="sii-orig-hint">Orig: {row.originalExtracted?.expiry || row.originalExtracted?.expiryRaw || '—'}</div>
                                                    )}
                                                </td>

                                                <td className={cellClass('purchaseQty')}>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        className="sii-cell-input sii-num-input"
                                                        value={row.purchaseQty}
                                                        onChange={(e) => updateRowField(row._localId, 'purchaseQty', e.target.value)}
                                                        placeholder="0"
                                                    />
                                                    {row.editedFields?.purchaseQty && (
                                                        <div className="sii-orig-hint">Orig: {row.originalExtracted?.purchaseQty ?? '—'}</div>
                                                    )}
                                                </td>

                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        className="sii-cell-input sii-num-input"
                                                        value={row.freeQty ?? 0}
                                                        onChange={(e) => updateRowField(row._localId, 'freeQty', e.target.value)}
                                                    />
                                                </td>

                                                <td className={cellClass('purchaseRate')}>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        className="sii-cell-input sii-num-input"
                                                        value={row.purchaseRate}
                                                        onChange={(e) => updateRowField(row._localId, 'purchaseRate', e.target.value)}
                                                        placeholder="Rate"
                                                    />
                                                    {row.editedFields?.purchaseRate && (
                                                        <div className="sii-orig-hint">Orig: {row.originalExtracted?.purchaseRate ?? '—'}</div>
                                                    )}
                                                </td>

                                                <td className={cellClass('mrp')}>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        className="sii-cell-input sii-num-input"
                                                        value={row.mrp}
                                                        onChange={(e) => updateRowField(row._localId, 'mrp', e.target.value)}
                                                        placeholder="MRP"
                                                    />
                                                    {row.editedFields?.mrp && (
                                                        <div className="sii-orig-hint">Orig: {row.originalExtracted?.mrp ?? '—'}</div>
                                                    )}
                                                </td>

                                                <td className={cellClass('discount')}>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        className="sii-cell-input sii-num-input"
                                                        value={row.discount}
                                                        onChange={(e) => updateRowField(row._localId, 'discount', e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </td>

                                                <td className={cellClass('gst')}>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        className="sii-cell-input sii-num-input"
                                                        value={row.gst}
                                                        onChange={(e) => updateRowField(row._localId, 'gst', e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </td>

                                                <td>
                                                    <span className={`sii-conf-badge ${row.confidence >= 85 ? 'high' : row.confidence >= 60 ? 'med' : 'low'}`}>
                                                        {row.confidence}% {row.confidence >= 85 ? 'High' : row.confidence >= 60 ? 'Medium' : 'Low'}
                                                    </span>
                                                </td>

                                                <td>
                                                    <span className={`sii-val-badge ${row.validationStatus.toLowerCase()}`}>
                                                        {row.validationStatus}
                                                    </span>
                                                    {row.warnings?.length > 0 && (
                                                        <div className="sii-row-warnings" title={row.warnings.join('\n')}>
                                                            {row.warnings[0]}
                                                            {row.warnings.length > 1 ? ` (+${row.warnings.length - 1})` : ''}
                                                        </div>
                                                    )}
                                                </td>

                                                <td>
                                                    <div className="sii-action-btns">
                                                        {isEdited && row.originalExtracted && (
                                                            <button
                                                                type="button"
                                                                className="sii-icon-btn"
                                                                onClick={() => revertRowToOriginal(row._localId)}
                                                                title="Revert row to originally extracted PDF values"
                                                            >
                                                                <FiRotateCcw size={13} />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="sii-icon-btn danger"
                                                            onClick={() => handleRemoveRow(row._localId)}
                                                            title="Remove row"
                                                        >
                                                            <FiTrash2 size={13} />
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

                    {/* Pagination & Footer Action Strip */}
                    <div className="sii-review-footer">
                        <div className="sii-pagination">
                            <span>
                                Showing {filteredRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} items
                            </span>
                            {totalPages > 1 && (
                                <div className="sii-page-btns">
                                    <button type="button" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                                        <FiChevronLeft />
                                    </button>
                                    <span>Page {safePage} / {totalPages}</span>
                                    <button type="button" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                                        <FiChevronRight />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="sii-footer-cta">
                            <span className="sii-cta-info">
                                Selected: <strong>{stats.included}</strong> • Valid/Ready: <strong>{stats.ready + stats.warnings}</strong>
                                {stats.incomplete > 0 && <span className="sii-cta-warn"> • {stats.incomplete} Incomplete (will fail/need fix)</span>}
                            </span>
                            <button
                                type="button"
                                className="sii-btn sii-btn-primary"
                                disabled={stats.included === 0}
                                onClick={() => setStage('confirm')}
                            >
                                <FiCheckCircle size={15} /> Review &amp; Confirm Bulk Import ({stats.included})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* STAGE 5: CONFIRM BULK IMPORT */}
            {stage === 'confirm' && invoiceData && (
                <div className="sii-confirm-card">
                    <h4><FiShield size={18} /> Confirm Bulk Inventory Import</h4>
                    <div className="sii-confirm-grid">
                        <div><span>Vendor</span><strong>{invoiceForm.vendorName || 'Unspecified Vendor'}</strong></div>
                        <div><span>Invoice No.</span><strong>{invoiceForm.invoiceNumber || 'N/A'}</strong></div>
                        <div><span>Included Rows</span><strong>{stats.included} of {stats.total}</strong></div>
                        <div><span>New Medicine Batches</span><strong>{stats.createNew}</strong></div>
                        <div><span>Restock Existing</span><strong>{stats.linkExisting}</strong></div>
                        <div><span>Excluded / Skipped</span><strong>{stats.skipped}</strong></div>
                    </div>

                    {stats.incomplete > 0 && (
                        <div className="sii-warnings-box" style={{ marginTop: '12px' }}>
                            <FiAlertTriangle size={16} />
                            <span>{stats.incomplete} selected row(s) are missing required fields (Name, Qty, or Purchase Rate). You can go back to fix them, or continue and they will be safely reported as Failed without blocking valid rows.</span>
                        </div>
                    )}

                    <div className="sii-confirm-actions">
                        <button type="button" className="sii-btn sii-btn-outline" onClick={() => setStage('review')} disabled={importing}>
                            ← Back to Review Table
                        </button>
                        <button type="button" className="sii-btn sii-btn-primary" onClick={handleConfirmBulkImport} disabled={importing}>
                            {importing ? 'Importing Inventory...' : `Confirm & Import ${stats.included} Item(s)`}
                        </button>
                    </div>
                </div>
            )}

            {/* STAGE 6: IMPORT SUMMARY */}
            {stage === 'summary' && importSummary && (
                <div className="sii-summary-card">
                    <div className="sii-summary-top">
                        <h4><FiCheckCircle color="#059669" /> Bulk Invoice Import Completed</h4>
                        <button type="button" className="sii-btn sii-btn-primary" onClick={resetWorkflow}>
                            <FiRefreshCw size={14} /> Upload Another Invoice
                        </button>
                    </div>

                    <div className="sii-summary-stats">
                        <div className="sii-stat-box ok">
                            <span>Imported</span>
                            <strong>{importSummary.summary?.imported || 0}</strong>
                        </div>
                        <div className="sii-stat-box skip">
                            <span>Skipped</span>
                            <strong>{importSummary.summary?.skipped || 0}</strong>
                        </div>
                        <div className="sii-stat-box fail">
                            <span>Failed</span>
                            <strong>{importSummary.summary?.failed || 0}</strong>
                        </div>
                    </div>

                    {importSummary.results?.failedRows?.length > 0 && (
                        <div className="sii-result-list fail">
                            <strong>Failed Rows ({importSummary.results.failedRows.length}):</strong>
                            {importSummary.results.failedRows.map((fr, idx) => (
                                <div key={idx}>Row #{fr.rowNumber} ({fr.medicineName}): {(fr.errors || []).join(', ')}</div>
                            ))}
                        </div>
                    )}

                    {importSummary.results?.skippedRows?.length > 0 && (
                        <div className="sii-result-list skip">
                            <strong>Skipped Rows ({importSummary.results.skippedRows.length}):</strong>
                            {importSummary.results.skippedRows.slice(0, 10).map((sr, idx) => (
                                <div key={idx}>Row #{sr.rowNumber} ({sr.medicineName}): {sr.reason}</div>
                            ))}
                            {importSummary.results.skippedRows.length > 10 && (
                                <div>...and {importSummary.results.skippedRows.length - 10} more</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* INLINE SECURE PDF PREVIEW MODAL */}
            {showPreviewModal && (
                <div className="sii-preview-overlay" onClick={() => setShowPreviewModal(false)}>
                    <div className="sii-preview-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="sii-preview-hdr">
                            <strong>📄 Original Invoice Preview — {invoiceData?.uploadedPDF?.originalName || 'Invoice.pdf'}</strong>
                            <button type="button" onClick={() => setShowPreviewModal(false)}><FiX size={18} /></button>
                        </div>
                        <div className="sii-preview-body">
                            {loadingPreview ? (
                                <div className="sii-preview-loading">Loading authenticated PDF preview...</div>
                            ) : previewBlobUrl ? (
                                <iframe src={previewBlobUrl} title="Vendor Invoice PDF Preview" />
                            ) : (
                                <div className="sii-preview-loading">PDF preview unavailable.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SmartInvoiceImportPanel;
