import React, { useState, useEffect } from 'react';
import { pharmacyAPI } from '../../utils/api';
import PurchaseInvoiceHistory from './PurchaseInvoiceHistory';
import './PharmacyInventory.css';

const PharmacyInventory = () => {
    const [activeTab, setActiveTab] = useState('inventory');
    const [medicines, setMedicines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const [extractedMedicines, setExtractedMedicines] = useState([]);
    const [pendingInvoice, setPendingInvoice] = useState(null);
    const [invoiceStats, setInvoiceStats] = useState({ total: 0, imported: 0, remaining: 0 });
    const [showInvoiceConfirm, setShowInvoiceConfirm] = useState(false);
    const [pendingPdfFile, setPendingPdfFile] = useState(null);
    const [showInvoiceDetails, setShowInvoiceDetails] = useState(false);
    const [importLoadingState, setImportLoadingState] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const [pdfError, setPdfError] = useState('');
    // Modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    // Edit & View states
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    const [selectedMedicine, setSelectedMedicine] = useState(null);

    const initialFormState = {
        name: '', salt: '', category: '', stock: '', unit: 'Tablets', unitsPerStrip: 10,
        minStockAlertLevel: 50, rackLocation: '', vendorId: '',
        buyingPrice: '', sellingPrice: '', vendor: '',
        sgst: '', cgst: '', cgstPercent: '', sgstPercent: '',
        batchNumber: '', expiryDate: '',
        purchaseDate: new Date().toISOString().split('T')[0],
        isMultiDose: false, packVolume: '', volumeUnit: 'IU', billingType: 'FULL_UNIT',
        purchaseQty: '', freeQty: '', discountType: 'Percentage', discountValue: ''
    };

    const [newMedicine, setNewMedicine] = useState(initialFormState);

    const [nameSuggestions, setNameSuggestions] = useState([]);
    const [showNameSuggestions, setShowNameSuggestions] = useState(false);

    const [vendors, setVendors] = useState([]);
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [vendorForm, setVendorForm] = useState({ vendorName: '', contactPerson: '', phone: '', gstin: '', dlNumber: '' });
    const [vendorErrors, setVendorErrors] = useState({});
    const [savingVendor, setSavingVendor] = useState(false);

    // Consumption Log States
    const [showConsumptionModal, setShowConsumptionModal] = useState(false);
    const [consumptionForm, setConsumptionForm] = useState({ medicineId: '', quantity: 1, reason: 'Doctor/Staff Use', givenTo: '' });
    const [savingConsumption, setSavingConsumption] = useState(false);

    const handleRecordConsumption = async (e) => {
        e.preventDefault();
        const selectedMed = medicines.find(m => m._id === consumptionForm.medicineId);
        if (!selectedMed) return alert("Please select a medicine.");
        if (consumptionForm.quantity > selectedMed.stock) {
            return alert(`Quantity cannot exceed available stock (${selectedMed.stock}).`);
        }

        setSavingConsumption(true);
        try {
            const res = await pharmacyAPI.recordConsumption({
                ...consumptionForm,
                quantity: Number(consumptionForm.quantity)
            });
            if (res.success) {
                alert("Consumption logged successfully");
                setShowConsumptionModal(false);
                setConsumptionForm({ medicineId: '', quantity: 1, reason: 'Doctor/Staff Use', givenTo: '' });
                fetchInventory();
            }
        } catch (error) {
            alert(error.response?.data?.message || "Failed to record consumption");
        } finally {
            setSavingConsumption(false);
        }
    };

    useEffect(() => {
        fetchInventory();
        fetchVendors();
        checkPendingInvoice();
    }, []);

    const checkPendingInvoice = async () => {
        try {
            const res = await pharmacyAPI.getPurchaseInvoices();
            if (res.success && res.data) {
                const pending = res.data.find(inv => inv.status === 'Pending');
                if (pending) {
                    setPendingInvoice(pending);
                    const savedMeds = localStorage.getItem('pendingInvoiceMedicines_' + pending._id);
                    if (savedMeds) {
                        const parsed = JSON.parse(savedMeds);
                        setExtractedMedicines(parsed);
                        setInvoiceStats({
                            total: pending.totalMedicines || parsed.length,
                            imported: pending.importedMedicines || 0,
                            remaining: parsed.length
                        });
                    }
                }
            }
        } catch (err) { console.error('Error checking pending invoice', err); }
    };

    const handleClearInvoice = () => {
        if (pendingInvoice) localStorage.removeItem('pendingInvoiceMedicines_' + pendingInvoice._id);
        setPendingInvoice(null);
        setExtractedMedicines([]);
        setInvoiceStats({ total: 0, imported: 0, remaining: 0 });
    };

    const handlePdfUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            setPdfError('Please upload a PDF file.');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setPdfError('File size must be less than 10MB.');
            return;
        }

        if (pendingInvoice) {
            setPendingPdfFile(file);
            setShowInvoiceConfirm(true);
            e.target.value = null;
            return;
        }

        await processPdfUpload(file);
        e.target.value = null;
    };

    const processPdfUpload = async (file) => {
        setPdfError('');
        setImportLoadingState('Uploading PDF...');
        setUploadingPdf(true);
        try {
            const formData = new FormData();
            formData.append('invoice', file);

            // Upload, Save to DB and Parse all in one step
            const uploadRes = await pharmacyAPI.uploadPurchaseInvoice(formData);

            if (uploadRes.success && uploadRes.invoice && uploadRes.medicines?.length > 0) {
                setImportLoadingState('Preparing Medicines...');
                const meds = uploadRes.medicines;
                const newInvoiceId = uploadRes.invoice._id;

                setExtractedMedicines(meds);

                // Store in local storage to persist
                localStorage.setItem('pendingInvoiceMedicines_' + newInvoiceId, JSON.stringify(meds));

                setPendingInvoice(uploadRes.invoice);
                setInvoiceStats({
                    total: uploadRes.invoice.totalMedicines || meds.length,
                    imported: 0,
                    remaining: meds.length
                });

                showSuccessMsg('Invoice Uploaded Successfully');
            } else {
                setPdfError('No medicines found.');
            }
        } catch (error) {
            setPdfError(error.response?.data?.message || error.message || 'Unable to read this invoice.');
        } finally {
            setUploadingPdf(false);
            setImportLoadingState('');
        }
    };

    const showSuccessMsg = (msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 4000);
    };

    const handleSelectExtracted = (medName, list = extractedMedicines) => {
        const med = list.find(m => m.medicineName === medName);
        if (!med) {
            setNewMedicine(prev => ({ ...prev, name: medName }));
            return;
        }
        setNewMedicine(prev => ({
            ...prev,
            name: med.medicineName,
            batchNumber: med.batch || '',
            stock: (Number(med.purchaseQty) || 0) + (Number(med.freeQty) || 0) || '',
            purchaseQty: med.purchaseQty || '',
            freeQty: med.freeQty || '',
            discountType: 'Percentage',
            discountValue: med.discount || '',
            unit: med.unit || 'Tablets',
            buyingPrice: med.purchaseRate || '',
            sellingPrice: med.mrp || '',
            cgstPercent: med.gst ? (parseFloat(med.gst) / 2) : '',
            sgstPercent: med.gst ? (parseFloat(med.gst) / 2) : '',
            cgst: med.gst ? (parseFloat(med.gst) / 2) : '',
            sgst: med.gst ? (parseFloat(med.gst) / 2) : '',
            expiryDate: med.expiry ? new Date(med.expiry).toISOString().split('T')[0] : prev.expiryDate,
            purchaseDate: new Date().toISOString().split('T')[0]
        }));
    };

    const fetchVendors = async () => {
        try {
            const res = await pharmacyAPI.getVendors();
            if (res.success) setVendors(res.data);
        } catch (error) { console.error("Error fetching vendors", error); }
    };

    const fetchInventory = async () => {
        try {
            setLoading(true);
            const response = await pharmacyAPI.getInventory();
            if (response.success) setMedicines(response.data);
        } catch (error) {
            console.error("Fetch Error:", error);
        } finally { setLoading(false); }
    };

    const validateVendor = () => {
        let errs = {};
        if (!vendorForm.vendorName || !vendorForm.vendorName.trim()) errs.vendorName = 'Vendor name is required';
        if (vendorForm.phone && !/^\d{10}$/.test(vendorForm.phone)) errs.phone = 'Phone number must be exactly 10 digits';
        if (vendorForm.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(vendorForm.gstin.trim())) {
            errs.gstin = 'Invalid GSTIN format';
        }
        setVendorErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSaveVendor = async (e) => {
        e.preventDefault();
        if (!validateVendor()) return;
        setSavingVendor(true);
        try {
            const res = await pharmacyAPI.addVendor(vendorForm);
            if (res.success) {
                fetchVendors();
                setShowVendorModal(false);
                setVendorForm({ vendorName: '', contactPerson: '', phone: '', gstin: '', dlNumber: '' });
                setVendorErrors({});
                alert("Vendor added successfully");
            }
        } catch (error) {
            alert(error.response?.data?.message || "Failed to add vendor");
        } finally {
            setSavingVendor(false);
        }
    };

    const handleAddMedicine = async (e) => {
        e.preventDefault();

        const pQty = Number(newMedicine.purchaseQty) || 0;
        const fQty = Number(newMedicine.freeQty) || 0;

        let totalStock = pQty + fQty;
        let price = Number(newMedicine.buyingPrice) || 0;
        let selling = Number(newMedicine.sellingPrice) || 0;
        let ups = Number(newMedicine.unitsPerStrip) || 1;

        if (['Strip', 'Capsules', 'Tablets'].includes(newMedicine.unit)) {
            totalStock = totalStock * ups;
        } else if (['Number', 'Sachets', 'Powder', 'Ointment', 'Others'].includes(newMedicine.unit)) {
            ups = 1;
        } else if (['Syrup', 'Injection'].includes(newMedicine.unit)) {
            ups = 1;
        } else {
            if (ups > 1) {
                totalStock = totalStock * ups;
            }
        }

        let baseTotal = pQty * (Number(newMedicine.buyingPrice) || 0);

        let disc = 0;
        if (newMedicine.discountType === 'Percentage') {
            disc = baseTotal * ((Number(newMedicine.discountValue) || 0) / 100);
        } else {
            disc = Number(newMedicine.discountValue) || 0;
        }

        const afterDisc = Math.max(0, baseTotal - disc);
        const cgstAmt = afterDisc * ((Number(newMedicine.cgstPercent) || 0) / 100);
        const sgstAmt = afterDisc * ((Number(newMedicine.sgstPercent) || 0) / 100);
        const calculatedFinalAmount = afterDisc + cgstAmt + sgstAmt;

        const cleanedData = {
            ...newMedicine,
            salt: newMedicine.salt || '',
            stock: totalStock, // STRICT ENFORCEMENT: Computed based on unit logic
            unitsPerStrip: ups, // EXACT SYNCHRONIZATION
            minStockAlertLevel: Number(newMedicine.minStockAlertLevel) || 50,
            buyingPrice: price,
            sellingPrice: selling,
            sgst: Number(newMedicine.sgst) || 0,
            cgst: Number(newMedicine.cgst) || 0,
            cgstPercent: Number(newMedicine.cgstPercent) || 0,
            sgstPercent: Number(newMedicine.sgstPercent) || 0,
            vendorId: newMedicine.vendorId || null,
            expiryDate: new Date(newMedicine.expiryDate),
            purchaseDate: new Date(newMedicine.purchaseDate),
            isMultiDose: Boolean(newMedicine.isMultiDose),
            packVolume: Number(newMedicine.packVolume) || 1,
            purchaseQty: pQty,
            freeQty: fQty,
            discountType: newMedicine.discountType || 'Percentage',
            discountValue: Number(newMedicine.discountValue) || 0,
            finalAmount: calculatedFinalAmount
        };

        console.log("UPDATE PAYLOAD SENT:", cleanedData);

        try {
            let response;
            if (isEditing) {
                response = await pharmacyAPI.updateMedicine(editId, cleanedData);
            } else {
                response = await pharmacyAPI.addMedicine(cleanedData);
            }

            if (response.success) {
                setIsEditing(false);
                setEditId(null);
                fetchInventory();

                // If it was extracted from invoice, remove it
                if (pendingInvoice && extractedMedicines.some(m => m.medicineName === newMedicine.name)) {
                    showSuccessMsg('Medicine Imported Successfully');
                    const updatedMeds = extractedMedicines.filter(m => m.medicineName !== newMedicine.name);
                    setExtractedMedicines(updatedMeds);
                    localStorage.setItem('pendingInvoiceMedicines_' + pendingInvoice._id, JSON.stringify(updatedMeds));

                    const newImported = invoiceStats.imported + 1;
                    const newRemaining = updatedMeds.length;

                    setInvoiceStats({ ...invoiceStats, imported: newImported, remaining: newRemaining });

                    if (newRemaining === 0) {
                        showSuccessMsg('Invoice Completed Successfully');
                        // Optional: we can call an API to mark it completed here if we had one
                    }
                }

                setNewMedicine(initialFormState);
            }
        } catch (error) {
            const msg = error.response?.data?.message || "Check fields";
            console.error("Validation Error:", msg);
            alert("Error: " + msg);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Delete this item?")) {
            try {
                await pharmacyAPI.deleteMedicine(id);
                fetchInventory();
            } catch (error) { alert("Delete failed."); }
        }
    };

    const handleEdit = (med) => {
        setNewMedicine({
            name: med.name,
            category: med.category,
            stock: med.stock,
            unitsPerStrip: med.unitsPerStrip || 10,
            minStockAlertLevel: med.minStockAlertLevel || 50,
            rackLocation: med.rackLocation || '',
            unit: med.unit || 'Tablets',
            buyingPrice: med.buyingPrice,
            sellingPrice: med.sellingPrice,
            sgst: med.sgst || '',
            cgst: med.cgst || '',
            cgstPercent: med.cgstPercent || '',
            sgstPercent: med.sgstPercent || '',
            vendor: med.vendor || '',
            vendorId: med.vendorId || '',
            batchNumber: med.batchNumber || '',
            expiryDate: med.expiryDate ? new Date(med.expiryDate).toISOString().split('T')[0] : '',
            purchaseDate: med.purchaseDate ? new Date(med.purchaseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            isMultiDose: med.isMultiDose || false,
            packVolume: med.packVolume || '',
            volumeUnit: med.volumeUnit || 'ml',
            billingType: med.billingType || 'FULL_UNIT',
            purchaseQty: med.purchaseQty || '',
            freeQty: med.freeQty || '',
            discountType: med.discountType || 'Percentage',
            discountValue: med.discountValue || ''
        });
        setIsEditing(true);
        setEditId(med._id);
    };

    const handleViewDetails = (med) => {
        setSelectedMedicine(med);
        setShowDetailsModal(true);
    };

    const filteredMedicines = medicines.filter(med =>
        med.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        med.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="pharmacy-management-container">

            {pendingInvoice && invoiceStats.remaining > 0 && (
                <div style={{ position: 'fixed', bottom: '30px', right: '30px', background: 'white', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', zIndex: 1000, display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Invoice Medicines</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{invoiceStats.total}</div>
                    </div>
                    <div style={{ width: '1px', height: '30px', background: '#e2e8f0' }}></div>
                    <div>
                        <div style={{ fontSize: '12px', color: '#16a34a', textTransform: 'uppercase', fontWeight: 'bold' }}>Imported</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#16a34a' }}>{invoiceStats.imported}</div>
                    </div>
                    <div style={{ width: '1px', height: '30px', background: '#e2e8f0' }}></div>
                    <div>
                        <div style={{ fontSize: '12px', color: '#ea580c', textTransform: 'uppercase', fontWeight: 'bold' }}>Remaining</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ea580c' }}>{invoiceStats.remaining}</div>
                    </div>
                </div>
            )}
            <div className="admin-card" style={{ marginBottom: '20px', background: 'var(--glass-bg)', padding: '24px', borderRadius: '24px', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                        <h2 style={{ margin: '0', fontSize: '1.8rem', color: 'var(--text-dark)' }}>💊 Medicine Inventory</h2>
                        <p style={{ color: 'var(--text-light)', fontSize: '14px', margin: '4px 0 0' }}>Manage your hospital's medicine stock, pricing, and expiry tracking</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={() => setShowConsumptionModal(true)}
                            className="btn-add"
                            style={{ padding: '8px 20px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', boxShadow: 'none' }}
                        >
                            📌 Record Consumption
                        </button>
                        <button
                            onClick={() => setShowVendorModal(true)}
                            className="btn-add"
                            style={{ padding: '8px 20px', background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe', boxShadow: 'none' }}
                        >
                            👥 Manage Vendors
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '20px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }}>
                    <button onClick={() => setActiveTab('inventory')} style={{ padding: '10px 4px', background: 'none', border: 'none', borderBottom: activeTab === 'inventory' ? '2px solid #3b82f6' : 'none', color: activeTab === 'inventory' ? '#3b82f6' : '#64748b', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', marginBottom: '-2px' }}>Inventory</button>
                    <button onClick={() => setActiveTab('purchase-history')} style={{ padding: '10px 4px', background: 'none', border: 'none', borderBottom: activeTab === 'purchase-history' ? '2px solid #3b82f6' : 'none', color: activeTab === 'purchase-history' ? '#3b82f6' : '#64748b', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', marginBottom: '-2px' }}>Purchase History</button>
                </div>

                {activeTab === 'inventory' ? (
                    <>
                        <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '10px', marginTop: '20px', border: '1px solid #bae6fd', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '16px', color: '#0369a1' }}>📄 Upload Purchase Invoice</h3>
                                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#0284c7' }}>Upload a PDF invoice to automatically extract and import medicines (Max 10MB)</p>
                                </div>
                                {pendingInvoice && invoiceStats.remaining === 0 && (
                                    <button type="button" onClick={handleClearInvoice} style={{ padding: '8px 16px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                        Upload New Invoice
                                    </button>
                                )}
                            </div>

                            {successMessage && <div style={{ padding: '10px', background: '#dcfce7', color: '#166534', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold' }}>✔ {successMessage}</div>}

                            {(!pendingInvoice || invoiceStats.remaining === 0) ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <input type="file" accept=".doc,.docx,.pdf,.jpg,.jpeg,.png,.webp" onChange={handlePdfUpload} disabled={uploadingPdf} style={{ padding: '10px', background: 'white', borderRadius: '6px', border: '1px solid #7dd3fc', width: '300px' }} />
                                    {uploadingPdf && <span style={{ color: '#0284c7', fontSize: '14px', fontWeight: 'bold' }}>{importLoadingState}</span>}
                                    {pdfError && <span style={{ color: '#dc2626', fontSize: '14px', fontWeight: 'bold' }}>{pdfError}</span>}
                                </div>
                            ) : (
                                <div style={{ padding: '15px', background: 'white', borderRadius: '8px', border: '1px solid #e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 5px', color: '#0c4a6e', fontSize: '15px' }}>✔ Invoice Uploaded Successfully</h4>
                                        <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#0369a1' }}>
                                            <span><strong>Medicines Found:</strong> {invoiceStats.total}</span>
                                            <span><strong>Remaining:</strong> {invoiceStats.remaining}</span>
                                            <span><strong>Imported:</strong> {invoiceStats.imported}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button type="button" onClick={handleClearInvoice} style={{ padding: '8px 16px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                            Cancel / Clear
                                        </button>
                                        <button type="button" onClick={() => setShowInvoiceDetails(true)} style={{ padding: '8px 16px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                            View Invoice Details
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleAddMedicine} className="pharma-form" style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', marginTop: '20px', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#334155' }}>{isEditing ? 'Edit Medicine' : 'Add New Medicine'}</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '16px' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>MEDICINE NAME *</label>
                                    {pendingInvoice ? (
                                        <select required disabled={invoiceStats.remaining === 0} value={newMedicine.name || ''} onChange={(e) => handleSelectExtracted(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: invoiceStats.remaining === 0 ? '#f1f5f9' : 'white' }}>
                                            <option value="">-- Select Medicine from Invoice --</option>
                                            {extractedMedicines.map((m, idx) => (
                                                <option key={idx} value={m.medicineName}>{m.medicineName}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div style={{ position: 'relative' }}>
                                            <input required type="text" value={newMedicine.name || ''} onChange={(e) => {
                                                const val = e.target.value;
                                                setNewMedicine({ ...newMedicine, name: val });
                                                if (val.length >= 3) {
                                                    const matches = medicines.filter(m => m.name.toLowerCase().includes(val.toLowerCase())).slice(0, 10);
                                                    setNameSuggestions(matches);
                                                    setShowNameSuggestions(true);
                                                } else {
                                                    setShowNameSuggestions(false);
                                                }
                                            }} onFocus={() => {
                                                if (newMedicine.name && newMedicine.name.length >= 3) setShowNameSuggestions(true);
                                            }} onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)} placeholder="e.g. Gonal-F 900 IU Pen / Menopur 75 IU" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} autoComplete="off" />

                                            {showNameSuggestions && nameSuggestions.length > 0 && (
                                                <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', zIndex: 50, listStyle: 'none', margin: '4px 0 0 0', padding: 0, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                                                    {nameSuggestions.map((m, idx) => (
                                                        <li key={idx} onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            setNewMedicine(prev => ({
                                                                ...prev,
                                                                name: m.name,
                                                                salt: m.salt || prev.salt,
                                                                category: m.category || prev.category,
                                                                unit: m.unit || prev.unit
                                                            }));
                                                            setShowNameSuggestions(false);
                                                        }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                            <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.85rem' }}>{m.name}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{m.salt || 'No Salt'} • {m.category || 'General'}</div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>SALT / COMPOSITION</label>
                                    <input type="text" value={newMedicine.salt || ''} onChange={(e) => setNewMedicine({ ...newMedicine, salt: e.target.value })} placeholder="e.g. Acetaminophen" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>CATEGORY *</label>
                                    <input required type="text" value={newMedicine.category || ''} onChange={(e) => setNewMedicine({ ...newMedicine, category: e.target.value })} placeholder="General" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                            </div>

                            <div style={{ background: '#e0f2fe', padding: '15px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #bae6fd' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.95rem', fontWeight: 'bold', color: '#0369a1', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={newMedicine.isMultiDose} onChange={(e) => setNewMedicine({ ...newMedicine, isMultiDose: e.target.checked })} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                                    Enable Partial/Dosage Tracking (Multi-Dose items like Syrups, IV Fluids, Vials)
                                </label>

                                {newMedicine.isMultiDose && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '15px' }}>
                                        <div className="form-group">
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#0284c7', marginBottom: '6px' }}>VOLUME / DOSAGE PER UNIT *</label>
                                            <input required={newMedicine.isMultiDose} type="number" min="1" step="any" value={newMedicine.packVolume || ''} onChange={(e) => setNewMedicine({ ...newMedicine, packVolume: e.target.value })} placeholder="e.g. 900" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #7dd3fc' }} />
                                        </div>
                                        <div className="form-group">
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#0284c7', marginBottom: '6px' }}>VOLUME UNIT *</label>
                                            <select value={newMedicine.volumeUnit || ''} onChange={(e) => setNewMedicine({ ...newMedicine, volumeUnit: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #7dd3fc', background: 'white' }}>
                                                <option value="IU">IU (International Units)</option>
                                                <option value="IU/ml">IU/ml</option>
                                                <option value="Units">Units</option>
                                                <option value="ml">ml</option>
                                                <option value="mcg">mcg</option>
                                                <option value="mg">mg</option>
                                                <option value="pills">Pills / Tablets</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#0284c7', marginBottom: '6px' }}>BILLING TYPE *</label>
                                            <select value={newMedicine.billingType || ''} onChange={(e) => setNewMedicine({ ...newMedicine, billingType: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #7dd3fc', background: 'white' }}>
                                                <option value="FULL_UNIT">Charge Full Unit (Vial/Bottle)</option>
                                                <option value="PROPORTIONAL">Charge Proportionally (by used volume)</option>
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <div style={{ padding: '8px 12px', background: '#0284c7', color: 'white', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', width: '100%' }}>
                                                Total Initial Vol: {(newMedicine.stock || 0) * (newMedicine.packVolume || 0)} {newMedicine.volumeUnit}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '16px' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>PURCHASE QTY *</label>
                                    <input required type="number" min="0" value={newMedicine.purchaseQty || ''} onChange={(e) => {
                                        const val = e.target.value;
                                        setNewMedicine({ ...newMedicine, purchaseQty: val, stock: Number(val) + Number(newMedicine.freeQty || 0) });
                                    }} placeholder="e.g. 10" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>FREE QTY (SCHEME)</label>
                                    <input type="number" min="0" value={newMedicine.freeQty || ''} onChange={(e) => {
                                        const val = e.target.value;
                                        setNewMedicine({ ...newMedicine, freeQty: val, stock: Number(newMedicine.purchaseQty || 0) + Number(val) });
                                    }} placeholder="e.g. 2" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>TOTAL STOCK {['Strip', 'Capsules', 'Tablets'].includes(newMedicine.unit) ? '(UNITS)' : ''}</label>
                                    <input readOnly type="text" value={
                                        ['Strip', 'Capsules', 'Tablets'].includes(newMedicine.unit)
                                            ? `${(((Number(newMedicine.purchaseQty) || 0) + (Number(newMedicine.freeQty) || 0)) * (Number(newMedicine.unitsPerStrip) || 1)).toLocaleString()} Units (${(Number(newMedicine.purchaseQty) || 0) + (Number(newMedicine.freeQty) || 0)} Packs)`
                                            : `${((Number(newMedicine.purchaseQty) || 0) + (Number(newMedicine.freeQty) || 0)).toLocaleString()}`
                                    } style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f1f5f9', fontWeight: 'bold' }} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>UNIT</label>
                                    <select value={newMedicine.unit || ''} onChange={(e) => setNewMedicine({ ...newMedicine, unit: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white' }}>
                                        {['Tablets', 'Capsules', 'Strip', 'Sachets', 'Powder', 'Number', 'Syrup', 'Injection', 'Ointment', 'Others'].map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                {['Strip', 'Capsules', 'Tablets'].includes(newMedicine.unit) && (
                                    <div className="form-group">
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
                                            {newMedicine.unit === 'Strip' ? 'UNITS PER STRIP' : 'UNITS PER PACK / BOX'}
                                        </label>
                                        <input type="number" min="1" value={newMedicine.unitsPerStrip || ''} onChange={(e) => {
                                            setNewMedicine({ ...newMedicine, unitsPerStrip: e.target.value });
                                        }} placeholder={newMedicine.unit === 'Strip' ? "e.g. 10 or 15" : "e.g. 10"} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '16px' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>COST PRICE (₹) *</label>
                                    <input required type="number" min="0" step="any" value={newMedicine.buyingPrice || ''} onChange={(e) => setNewMedicine({ ...newMedicine, buyingPrice: e.target.value })} placeholder="e.g. 30" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>DISCOUNT TYPE</label>
                                    <select value={newMedicine.discountType || ''} onChange={(e) => setNewMedicine({ ...newMedicine, discountType: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white' }}>
                                        <option value="Percentage">Percentage (%)</option>
                                        <option value="Flat Amount">Flat Amount (₹)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>DISCOUNT VALUE</label>
                                    <input type="number" min="0" step="any" value={newMedicine.discountValue || ''} onChange={(e) => setNewMedicine({ ...newMedicine, discountValue: e.target.value })} placeholder="e.g. 10" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '16px' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>CGST (%)</label>
                                    <input type="number" min="0" step="any" value={newMedicine.cgstPercent || ''} onChange={(e) => setNewMedicine({ ...newMedicine, cgstPercent: e.target.value })} placeholder="e.g. 5" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>SGST (%)</label>
                                    <input type="number" min="0" step="any" value={newMedicine.sgstPercent || ''} onChange={(e) => setNewMedicine({ ...newMedicine, sgstPercent: e.target.value })} placeholder="e.g. 5" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#0369a1', marginBottom: '8px' }}>FINAL AMOUNT (₹)</label>
                                    <input readOnly type="text" value={
                                        (() => {
                                            const qty = Number(newMedicine.purchaseQty) || 0;
                                            const price = Number(newMedicine.buyingPrice) || 0;
                                            let baseTotal = qty * price;

                                            let disc = 0;
                                            if (newMedicine.discountType === 'Percentage') {
                                                disc = baseTotal * ((Number(newMedicine.discountValue) || 0) / 100);
                                            } else {
                                                disc = Number(newMedicine.discountValue) || 0;
                                            }

                                            const afterDisc = Math.max(0, baseTotal - disc);

                                            const cgstAmt = afterDisc * ((Number(newMedicine.cgstPercent) || 0) / 100);
                                            const sgstAmt = afterDisc * ((Number(newMedicine.sgstPercent) || 0) / 100);

                                            return (afterDisc + cgstAmt + sgstAmt).toFixed(2);
                                        })()
                                    } style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #bae6fd', background: '#f0f9ff', fontWeight: 'bold', color: '#0369a1' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '16px' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>SELLING PRICE (₹) *</label>
                                    <input required type="number" min="0" step="any" value={newMedicine.sellingPrice || ''} onChange={(e) => setNewMedicine({ ...newMedicine, sellingPrice: e.target.value })} placeholder="e.g. 50" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>PROFIT MARGIN</label>
                                    <input type="text" readOnly value={newMedicine.buyingPrice && newMedicine.sellingPrice ? `${(((Number(newMedicine.sellingPrice) - Number(newMedicine.buyingPrice)) / (Number(newMedicine.buyingPrice) || 1)) * 100).toFixed(1)}%` : '--'} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f1f5f9', fontWeight: '700', color: Number(newMedicine.sellingPrice) > Number(newMedicine.buyingPrice) ? '#059669' : '#dc2626' }} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>BATCH NUMBER</label>
                                    <input type="text" value={newMedicine.batchNumber || ''} onChange={(e) => setNewMedicine({ ...newMedicine, batchNumber: e.target.value })} placeholder="e.g. BT-2026-001" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '16px' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>EXPIRY DATE *</label>
                                    <input required type="date" value={newMedicine.expiryDate || ''} onChange={(e) => setNewMedicine({ ...newMedicine, expiryDate: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>VENDOR / SUPPLIER</label>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <select value={newMedicine.vendorId || ''} onChange={(e) => {
                                            const selId = e.target.value;
                                            const v = vendors.find(v => v._id === selId);
                                            setNewMedicine({ ...newMedicine, vendorId: selId, vendor: v ? v.vendorName : '' });
                                        }} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white' }}>
                                            <option value="">-- Select Vendor --</option>
                                            {vendors.map(v => (
                                                <option key={v._id} value={v._id}>{v.vendorName}</option>
                                            ))}
                                        </select>
                                        <button type="button" onClick={() => setShowVendorModal(true)} style={{ padding: '0 15px', background: '#e0e7ff', border: '1px solid #c7d2fe', borderRadius: '8px', cursor: 'pointer', color: '#4338ca', fontWeight: 'bold' }}>+</button>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '16px' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>RACK LOCATION</label>
                                    <input type="text" value={newMedicine.rackLocation || ''} onChange={(e) => setNewMedicine({ ...newMedicine, rackLocation: e.target.value })} placeholder="e.g. Rack A-3" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>MIN STOCK ALERT LEVEL</label>
                                    <input type="number" value={newMedicine.minStockAlertLevel || ''} onChange={(e) => setNewMedicine({ ...newMedicine, minStockAlertLevel: e.target.value })} placeholder="50" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                                </div>
                                <div className="form-group"></div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                                {isEditing && (
                                    <button type="button" onClick={() => { setIsEditing(false); setEditId(null); setNewMedicine(initialFormState); }} className="btn-cancel" style={{ padding: '10px 24px', width: 'auto', boxShadow: 'none', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel Edit</button>
                                )}
                                <button type="submit" className="btn-save" style={{ padding: '10px 24px', width: 'auto', boxShadow: 'none' }}>{isEditing ? 'Update Medicine' : 'Add Medicine'}</button>
                                {!isEditing && (
                                    <button type="button" onClick={() => setNewMedicine(initialFormState)} className="btn-cancel" style={{ padding: '10px 24px', width: 'auto', boxShadow: 'none', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', color: '#64748b' }}>Clear Form</button>
                                )}
                            </div>
                        </form>

                        <div className="inventory-controls" style={{ marginBottom: '20px', marginTop: '20px' }}>
                            <div className="search-bar" style={{ maxWidth: '400px' }}>
                                <span className="search-icon"></span>
                                <input type="text" placeholder="Search medicines..." value={searchTerm || ''} onChange={(e) => setSearchTerm(e.target.value)} />
                            </div>
                        </div>
                        <div className="inventory-table-wrapper">
                            {loading ? <div className="loader">Loading...</div> : (
                                <table className="inventory-table">
                                    <thead>
                                        <tr>
                                            <th>Batch #</th>
                                            <th>Medicine Name</th>
                                            <th>Category</th>
                                            <th>Stock</th>
                                            <th>Buying (₹)</th>
                                            <th>Selling (₹)</th>
                                            <th>Vendor</th>
                                            <th>Expiry</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredMedicines.map((med) => (
                                            <tr key={med._id}>
                                                <td><small>#{med.batchNumber}</small></td>
                                                <td className="med-name">{med.name}</td>
                                                <td><span className="category-tag">{med.category}</span></td>
                                                <td>
                                                    {med.isMultiDose ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <div className={med.stock < (med.minStockAlertLevel || 50) ? 'low-stock' : 'good-stock'} style={{ fontWeight: 'bold' }}>
                                                                {med.stock} {med.unit || 'Vials'} <span style={{ fontSize: '0.85em', color: '#475569', fontWeight: 'normal' }}>({med.openUnitVolume || 0}/{med.packVolume} {med.volumeUnit} open)</span>
                                                            </div>
                                                            {med.openUnitVolume > 0 && (
                                                                <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                                                    <div style={{ width: `${((med.openUnitVolume / med.packVolume) * 100) || 0}%`, height: '100%', background: '#3b82f6' }}></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className={med.stock < (med.minStockAlertLevel || 50) ? 'low-stock' : 'good-stock'}>
                                                            {['Strip', 'Capsules', 'Tablets'].includes(med.unit) ? (
                                                                <span>
                                                                    {Math.floor(med.stock / (Number(med.unitsPerStrip) || 1))} {med.unit} <span style={{ fontSize: '0.85em', color: '#64748b', fontWeight: 'normal' }}>({med.stock} Units)</span>
                                                                </span>
                                                            ) : (
                                                                <span>{med.stock} {med.unit}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>₹{med.buyingPrice}</td>
                                                <td><strong>₹{med.sellingPrice}</strong></td>
                                                <td>{med.vendor || 'N/A'}</td>
                                                <td>{new Date(med.expiryDate).toLocaleDateString()}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        <button
                                                            title="View Details"
                                                            onClick={() => handleViewDetails(med)}
                                                            style={{ padding: '6px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            👁️
                                                        </button>
                                                        <button
                                                            title="Edit Medicine"
                                                            onClick={() => {
                                                                handleEdit(med);
                                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                                            }}
                                                            style={{ padding: '6px', background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            ✏️
                                                        </button>
                                                        <button
                                                            title="Delete Item"
                                                            onClick={() => handleDelete(med._id)}
                                                            style={{ padding: '6px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                ) : (
                    <PurchaseInvoiceHistory />
                )}
            </div>
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content inventory-modal">
                        <div className="modal-header">
                            <div>
                                <h2>{isEditing ? 'Edit Medication' : 'Add New Medication'}</h2>
                                <p className="modal-subtitle">Enter details to update your stock levels</p>
                            </div>
                            <button className="close-btn" onClick={() => setShowAddModal(false)}>×</button>
                        </div>

                        <form onSubmit={handleAddMedicine} className="pharma-form">
                            {/* Section 1: Basic Information */}
                            <div className="form-section">
                                <h3 className="section-title">General Information</h3>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Medicine Name <span className="required">*</span></label>
                                        <input required type="text" value={newMedicine.name || ''} onChange={(e) => setNewMedicine({ ...newMedicine, name: e.target.value })} placeholder="e.g. Paracetamol 500mg" />
                                    </div>
                                    <div className="form-group">
                                        <label>Category <span className="required">*</span></label>
                                        <input required type="text" value={newMedicine.category || ''} onChange={(e) => setNewMedicine({ ...newMedicine, category: e.target.value })} placeholder="e.g. Analgesic" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column' }}>
                                        <label>Vendor / Supplier</label>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <select value={newMedicine.vendorId || ''} onChange={(e) => {
                                                const selId = e.target.value;
                                                const v = vendors.find(v => v._id === selId);
                                                setNewMedicine({ ...newMedicine, vendorId: selId, vendor: v ? v.vendorName : '' });
                                            }} style={{ flex: 1, padding: '8px' }}>
                                                <option value="">-- Select Vendor --</option>
                                                {vendors.map(v => (
                                                    <option key={v._id} value={v._id}>{v.vendorName}</option>
                                                ))}
                                            </select>
                                            <button type="button" onClick={() => setShowVendorModal(true)} style={{ padding: '8px', background: '#e0e7ff', border: '1px solid #c7d2fe', borderRadius: '4px', cursor: 'pointer' }}>+</button>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Batch Number</label>
                                        <input required type="text" value={newMedicine.batchNumber || ''} onChange={(e) => setNewMedicine({ ...newMedicine, batchNumber: e.target.value })} placeholder="e.g. BT-9921" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Rack Location</label>
                                        <input type="text" value={newMedicine.rackLocation || ''} onChange={(e) => setNewMedicine({ ...newMedicine, rackLocation: e.target.value })} placeholder="e.g. Rack A-3" />
                                    </div>
                                    <div className="form-group">
                                        <label>Min Stock Alert Level</label>
                                        <input type="number" value={newMedicine.minStockAlertLevel || ''} onChange={(e) => setNewMedicine({ ...newMedicine, minStockAlertLevel: e.target.value })} placeholder="50" />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Stock & Pricing */}
                            <div className="form-section">
                                <h3 className="section-title">Inventory & Pricing</h3>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Purchase Qty *</label>
                                        <input required type="number" min="0" value={newMedicine.purchaseQty || ''} onChange={(e) => {
                                            const val = e.target.value;
                                            setNewMedicine({ ...newMedicine, purchaseQty: val, stock: Number(val) + Number(newMedicine.freeQty || 0) });
                                        }} placeholder="0" />
                                    </div>
                                    <div className="form-group">
                                        <label>Free Qty (Scheme)</label>
                                        <input type="number" min="0" value={newMedicine.freeQty || ''} onChange={(e) => {
                                            const val = e.target.value;
                                            setNewMedicine({ ...newMedicine, freeQty: val, stock: Number(newMedicine.purchaseQty || 0) + Number(val) });
                                        }} placeholder="0" />
                                    </div>
                                    <div className="form-group">
                                        <label>Total Stock {['Strip', 'Capsules', 'Tablets'].includes(newMedicine.unit) ? '(UNITS)' : ''}</label>
                                        <input readOnly type="text" value={
                                            ['Strip', 'Capsules', 'Tablets'].includes(newMedicine.unit)
                                                ? `${(((Number(newMedicine.purchaseQty) || 0) + (Number(newMedicine.freeQty) || 0)) * (Number(newMedicine.unitsPerStrip) || 1)).toLocaleString()} Units (${(Number(newMedicine.purchaseQty) || 0) + (Number(newMedicine.freeQty) || 0)} Packs)`
                                                : `${((Number(newMedicine.purchaseQty) || 0) + (Number(newMedicine.freeQty) || 0)).toLocaleString()}`
                                        } style={{ background: '#f1f5f9', fontWeight: 'bold' }} />
                                    </div>
                                    <div className="form-group">
                                        <label>Unit</label>
                                        <select value={newMedicine.unit || ''} onChange={(e) => setNewMedicine({ ...newMedicine, unit: e.target.value })}>
                                            {['Tablets', 'Capsules', 'Strip', 'Sachets', 'Powder', 'Number', 'Syrup', 'Injection', 'Ointment', 'Others'].map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    {['Strip', 'Capsules', 'Tablets'].includes(newMedicine.unit) && (
                                        <div className="form-group">
                                            <label>{newMedicine.unit === 'Strip' ? 'Units Per Strip' : 'Units Per Pack'}</label>
                                            <input type="number" min="1" value={newMedicine.unitsPerStrip || ''} onChange={(e) => {
                                                setNewMedicine({ ...newMedicine, unitsPerStrip: e.target.value });
                                            }} placeholder="e.g. 10" />
                                        </div>
                                    )}
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Cost Price (₹) *</label>
                                        <div className="input-with-icon">
                                            <input required type="number" step="any" value={newMedicine.buyingPrice || ''} onChange={(e) => setNewMedicine({ ...newMedicine, buyingPrice: e.target.value })} placeholder="0.00" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Discount Type</label>
                                        <select value={newMedicine.discountType || ''} onChange={(e) => setNewMedicine({ ...newMedicine, discountType: e.target.value })}>
                                            <option value="Percentage">Percentage (%)</option>
                                            <option value="Flat Amount">Flat Amount (₹)</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Discount Value</label>
                                        <input type="number" min="0" step="any" value={newMedicine.discountValue || ''} onChange={(e) => setNewMedicine({ ...newMedicine, discountValue: e.target.value })} placeholder="0" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>SGST (%)</label>
                                        <div className="input-with-icon">
                                            <input required type="number" step="any" value={newMedicine.sgstPercent || ''} onChange={(e) => setNewMedicine({ ...newMedicine, sgstPercent: e.target.value })} placeholder="0" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>CGST (%)</label>
                                        <div className="input-with-icon">
                                            <input required type="number" step="any" value={newMedicine.cgstPercent || ''} onChange={(e) => setNewMedicine({ ...newMedicine, cgstPercent: e.target.value })} placeholder="0" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label style={{ color: '#0369a1' }}>Final Amount (₹)</label>
                                        <input readOnly type="text" value={
                                            (() => {
                                                const qty = Number(newMedicine.purchaseQty) || 0;
                                                const price = Number(newMedicine.buyingPrice) || 0;
                                                let baseTotal = qty * price;

                                                let disc = 0;
                                                if (newMedicine.discountType === 'Percentage') {
                                                    disc = baseTotal * ((Number(newMedicine.discountValue) || 0) / 100);
                                                } else {
                                                    disc = Number(newMedicine.discountValue) || 0;
                                                }

                                                const afterDisc = Math.max(0, baseTotal - disc);

                                                const cgstAmt = afterDisc * ((Number(newMedicine.cgstPercent) || 0) / 100);
                                                const sgstAmt = afterDisc * ((Number(newMedicine.sgstPercent) || 0) / 100);

                                                return (afterDisc + cgstAmt + sgstAmt).toFixed(2);
                                            })()
                                        } style={{ background: '#f0f9ff', fontWeight: 'bold', color: '#0369a1', borderColor: '#bae6fd' }} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Selling Price (₹) *</label>
                                        <div className="input-with-icon">
                                            <input required type="number" step="any" value={newMedicine.sellingPrice || ''} onChange={(e) => setNewMedicine({ ...newMedicine, sellingPrice: e.target.value })} placeholder="0.00" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Profit Margin</label>
                                        <input type="text" readOnly value={newMedicine.buyingPrice && newMedicine.sellingPrice ? `${(((Number(newMedicine.sellingPrice) - Number(newMedicine.buyingPrice)) / (Number(newMedicine.buyingPrice) || 1)) * 100).toFixed(1)}%` : '--'} style={{ background: '#f1f5f9', fontWeight: 'bold', color: Number(newMedicine.sellingPrice) > Number(newMedicine.buyingPrice) ? '#059669' : '#dc2626' }} />
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Dates */}
                            <div className="form-section">
                                <h3 className="section-title">Tracking Dates</h3>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Purchase Date</label>
                                        <input required type="date" value={newMedicine.purchaseDate || ''} onChange={(e) => setNewMedicine({ ...newMedicine, purchaseDate: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Expiry Date</label>
                                        <input required type="date" value={newMedicine.expiryDate || ''} onChange={(e) => setNewMedicine({ ...newMedicine, expiryDate: e.target.value })} />
                                    </div>
                                </div>

                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setShowAddModal(false)}>Discard</button>
                                <button type="submit" className="btn-save">{isEditing ? 'Update Inventory' : 'Save to Inventory'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showDetailsModal && selectedMedicine && (() => {
                // Find all medicines in the same batch/vendor bill
                const groupedMedicines = medicines.filter(med =>
                    (med.batchNumber && med.batchNumber === selectedMedicine.batchNumber &&
                        (med.vendor === selectedMedicine.vendor || med.vendorId === selectedMedicine.vendorId)) ||
                    (med._id === selectedMedicine._id) // Fallback for itself if batch/vendor is missing
                );

                // Deduplicate in case fallback overlaps with batch matching
                const uniqueGrouped = Array.from(new Set(groupedMedicines.map(m => m._id)))
                    .map(id => groupedMedicines.find(m => m._id === id));

                let totalPurchaseQty = 0;
                let totalFreeQty = 0;
                let totalStockQty = 0;
                let totalGrossPurchaseAmount = 0;
                let totalDiscountAmount = 0;
                let totalTaxableAmount = 0;
                let totalCGST = 0;
                let totalSGST = 0;
                let totalGST = 0;
                let totalFinalPurchaseAmount = 0;
                let totalExpectedRevenue = 0;

                uniqueGrouped.forEach(med => {
                    const pQty = (med.purchaseQty !== undefined && med.purchaseQty !== null) ? Number(med.purchaseQty) : (Number(med.stock) || 0);
                    const fQty = Number(med.freeQty) || 0;
                    const stock = pQty + fQty; // Total stock for revenue

                    const buyingPrice = Number(med.buyingPrice) || 0;
                    const sellingPrice = Number(med.sellingPrice) || 0;

                    const gross = pQty * buyingPrice;

                    let discountAmount = 0;
                    if (med.discountType === 'Flat Amount') {
                        discountAmount = Number(med.discountValue) || 0;
                    } else {
                        discountAmount = gross * ((Number(med.discountValue) || 0) / 100);
                    }

                    const taxable = Math.max(0, gross - discountAmount);
                    const cgstPercent = Number(med.cgstPercent) || 0;
                    const sgstPercent = Number(med.sgstPercent) || 0;

                    const cgstAmt = taxable * (cgstPercent / 100);
                    const sgstAmt = taxable * (sgstPercent / 100);
                    const gstAmt = cgstAmt + sgstAmt;

                    const finalAmt = taxable + gstAmt;
                    const revenue = stock * sellingPrice;

                    totalPurchaseQty += pQty;
                    totalFreeQty += fQty;
                    totalStockQty += stock;
                    totalGrossPurchaseAmount += gross;
                    totalDiscountAmount += discountAmount;
                    totalTaxableAmount += taxable;
                    totalCGST += cgstAmt;
                    totalSGST += sgstAmt;
                    totalGST += gstAmt;
                    totalFinalPurchaseAmount += finalAmt;
                    totalExpectedRevenue += revenue;
                });

                const expectedProfit = totalExpectedRevenue - totalFinalPurchaseAmount;
                const effectiveCost = totalStockQty > 0 ? (totalFinalPurchaseAmount / totalStockQty) : 0;

                return (
                    <div className="modal-overlay">
                        <div className="modal-content inventory-modal" style={{ maxWidth: '950px', width: '95%' }}>
                            <div className="modal-header">
                                <div>
                                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '1.5rem' }}>🧾</span> Purchase Bill / Stock View
                                    </h2>
                                    <p className="modal-subtitle" style={{ fontSize: '14px', color: '#1e3a8a', marginTop: '5px' }}>
                                        Batch: <strong>{selectedMedicine.batchNumber || 'N/A'}</strong> | Vendor: <strong>{selectedMedicine.vendor || 'N/A'}</strong>
                                    </p>
                                </div>
                                <button className="close-btn" onClick={() => setShowDetailsModal(false)}>×</button>
                            </div>

                            <div className="pharma-form" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                                {/* Header Section */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                                    <div>
                                        <div style={{ color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold' }}>Supplier/Vendor</div>
                                        <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{selectedMedicine.vendor || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold' }}>Batch / Invoice #</div>
                                        <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{selectedMedicine.batchNumber || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold' }}>Expiry Date</div>
                                        <div style={{ fontWeight: 'bold', color: new Date(selectedMedicine.expiryDate) < new Date() ? '#dc2626' : '#0f172a' }}>
                                            {selectedMedicine.expiryDate ? new Date(selectedMedicine.expiryDate).toLocaleDateString() : 'N/A'}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold' }}>Category & Rack</div>
                                        <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{selectedMedicine.category} | {selectedMedicine.rackLocation || 'Unassigned'}</div>
                                    </div>
                                </div>

                                {/* Stock Breakdown Table */}
                                <div>
                                    <h3 style={{ fontSize: '14px', color: '#334155', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '12px' }}>📦 Items in this Purchase Bill</h3>
                                    <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', border: '1px solid #e2e8f0' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569', textTransform: 'uppercase', fontSize: '11px', position: 'sticky', top: 0 }}>
                                                    <th style={{ padding: '10px' }}>Medicine Name</th>
                                                    <th style={{ padding: '10px' }}>Batch #</th>
                                                    <th style={{ padding: '10px' }}>Stock Qty</th>
                                                    <th style={{ padding: '10px' }}>Cost Price (ex. Tax)</th>
                                                    <th style={{ padding: '10px' }}>Selling Price</th>
                                                    <th style={{ padding: '10px' }}>Total Amount (incl. Tax)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {uniqueGrouped.map(med => {
                                                    const pQty = (med.purchaseQty !== undefined && med.purchaseQty !== null) ? Number(med.purchaseQty) : (Number(med.stock) || 0);
                                                    const buyingPrice = Number(med.buyingPrice) || 0;
                                                    const gross = pQty * buyingPrice;

                                                    let discountAmount = 0;
                                                    if (med.discountType === 'Flat Amount') {
                                                        discountAmount = Number(med.discountValue) || 0;
                                                    } else {
                                                        discountAmount = gross * ((Number(med.discountValue) || 0) / 100);
                                                    }

                                                    const taxable = Math.max(0, gross - discountAmount);
                                                    const cgstPercent = Number(med.cgstPercent) || 0;
                                                    const sgstPercent = Number(med.sgstPercent) || 0;

                                                    const cgstAmt = taxable * (cgstPercent / 100);
                                                    const sgstAmt = taxable * (sgstPercent / 100);
                                                    const gstAmt = cgstAmt + sgstAmt;

                                                    const totalFinalCost = taxable + gstAmt;

                                                    return (
                                                        <tr key={med._id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: med._id === selectedMedicine._id ? '#fefce8' : 'transparent' }}>
                                                            <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{med.name} {med._id === selectedMedicine._id ? '(Selected)' : ''}</td>
                                                            <td style={{ padding: '10px' }}>{med.batchNumber || 'N/A'}</td>
                                                            <td style={{ padding: '10px', fontWeight: 'bold', color: med.stock < (med.minStockAlertLevel || 50) ? '#dc2626' : '#059669' }}>
                                                                {['Strip', 'Capsules', 'Tablets'].includes(med.unit) ? (
                                                                    <span>
                                                                        {Math.floor(med.stock / (Number(med.unitsPerStrip) || 1))} {med.unit} <span style={{ fontSize: '0.85em', color: '#64748b', fontWeight: 'normal' }}>({med.stock} Units)</span>
                                                                    </span>
                                                                ) : (
                                                                    <span>{med.stock} {med.unit || 'Tabs'}</span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '10px' }}>₹{med.buyingPrice || 0} <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>(+{med.cgstPercent || 0}% CGST, +{med.sgstPercent || 0}% SGST)</span></td>
                                                            <td style={{ padding: '10px', color: '#059669', fontWeight: 'bold' }}>₹{med.sellingPrice || 0}</td>
                                                            <td style={{ padding: '10px', fontWeight: 'bold' }}>₹{totalFinalCost.toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Financial Calculations Section */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginTop: '10px' }}>

                                    <div style={{ background: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                                        <div style={{ color: '#166534', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Qty (Purchase + Free)</div>
                                        <div style={{ color: '#14532d', fontSize: '18px', fontWeight: '900' }}>{totalPurchaseQty} + {totalFreeQty}</div>
                                        <div style={{ color: '#166534', fontSize: '12px', marginTop: '4px' }}>Total Stock: {totalStockQty}</div>
                                    </div>

                                    <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                        <div style={{ color: '#475569', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Gross Amount</div>
                                        <div style={{ color: '#0f172a', fontSize: '18px', fontWeight: '900' }}>₹{totalGrossPurchaseAmount.toFixed(2)}</div>
                                        <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>- Disc: ₹{totalDiscountAmount.toFixed(2)}</div>
                                    </div>

                                    <div style={{ background: '#fffbeb', padding: '15px', borderRadius: '8px', border: '1px solid #fde68a', textAlign: 'center' }}>
                                        <div style={{ color: '#b45309', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Taxable & GST</div>
                                        <div style={{ color: '#92400e', fontSize: '18px', fontWeight: '900' }}>₹{totalTaxableAmount.toFixed(2)}</div>
                                        <div style={{ color: '#d97706', fontSize: '12px', marginTop: '4px' }}>+ GST: ₹{totalGST.toFixed(2)}</div>
                                    </div>

                                    <div style={{ background: '#eff6ff', padding: '15px', borderRadius: '8px', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                                        <div style={{ color: '#1e40af', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Final Purchase Amt</div>
                                        <div style={{ color: '#1e3a8a', fontSize: '20px', fontWeight: '900' }}>₹{totalFinalPurchaseAmount.toFixed(2)}</div>
                                        <div style={{ color: '#3b82f6', fontSize: '12px', marginTop: '4px' }}>Eff. Cost: ₹{effectiveCost.toFixed(2)}/unit</div>
                                    </div>

                                    <div style={{ background: '#f5f3ff', padding: '15px', borderRadius: '8px', border: '1px solid #ddd6fe', textAlign: 'center', gridColumn: 'span 2' }}>
                                        <div style={{ color: '#6d28d9', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Expected Revenue</div>
                                        <div style={{ color: '#5b21b6', fontSize: '20px', fontWeight: '900' }}>₹{totalExpectedRevenue.toFixed(2)}</div>
                                    </div>

                                    <div style={{ background: expectedProfit >= 0 ? '#f0fdfa' : '#fef2f2', padding: '15px', borderRadius: '8px', border: expectedProfit >= 0 ? '1px solid #a7f3d0' : '1px solid #fecaca', textAlign: 'center', gridColumn: 'span 2' }}>
                                        <div style={{ color: expectedProfit >= 0 ? '#0f766e' : '#b91c1c', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Expected Profit</div>
                                        <div style={{ color: expectedProfit >= 0 ? '#0d9488' : '#dc2626', fontSize: '20px', fontWeight: '900' }}>₹{expectedProfit.toFixed(2)}</div>
                                    </div>

                                </div>

                            </div>

                            <div className="modal-actions" style={{ padding: '15px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    className="btn-add"
                                    style={{ background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0', padding: '8px 16px', boxShadow: 'none' }}
                                    onClick={() => {
                                        setShowDetailsModal(false);
                                        handleEdit(selectedMedicine);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                >
                                    ✏️ Edit Selected Medicine
                                </button>
                                <button type="button" className="btn-cancel" onClick={() => setShowDetailsModal(false)} style={{ padding: '8px 16px' }}>Close</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showVendorModal && (
                <div className="modal-overlay">
                    <div className="modal-content inventory-modal" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <div>
                                <h2>Manage Vendors</h2>
                                <p className="modal-subtitle">Add a new supplier</p>
                            </div>
                            <button className="close-btn" onClick={() => setShowVendorModal(false)}>×</button>
                        </div>
                        <div className="pharma-form" style={{ padding: '20px' }}>
                            <form onSubmit={handleSaveVendor}>
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label>Vendor Name *</label>
                                    <input required type="text" value={vendorForm.vendorName || ''} onChange={(e) => setVendorForm({ ...vendorForm, vendorName: e.target.value })} placeholder="Enter vendor name" />
                                    {vendorErrors.vendorName && <span className="error-text" style={{ color: 'red', fontSize: '12px' }}>{vendorErrors.vendorName}</span>}
                                </div>
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label>Contact Person</label>
                                    <input type="text" value={vendorForm.contactPerson || ''} onChange={(e) => setVendorForm({ ...vendorForm, contactPerson: e.target.value })} placeholder="Contact Person" />
                                </div>
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label>Phone Number *</label>
                                    <input type="text" value={vendorForm.phone || ''} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="Phone Number" />
                                    {vendorErrors.phone && <span className="error-text" style={{ color: 'red', fontSize: '12px' }}>{vendorErrors.phone}</span>}
                                </div>
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label>GSTIN</label>
                                    <input type="text" value={vendorForm.gstin || ''} onChange={(e) => setVendorForm({ ...vendorForm, gstin: e.target.value.toUpperCase().slice(0, 15) })} placeholder="GST Number" />
                                    {vendorErrors.gstin && <span className="error-text" style={{ color: 'red', fontSize: '12px' }}>{vendorErrors.gstin}</span>}
                                </div>
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label>Drug License (DL) Number</label>
                                    <input type="text" value={vendorForm.dlNumber || ''} onChange={(e) => setVendorForm({ ...vendorForm, dlNumber: e.target.value })} placeholder="e.g., 20B/21B/... or DL Number" />
                                </div>
                                <div className="modal-actions" style={{ marginTop: '20px' }}>
                                    <button type="button" className="btn-cancel" onClick={() => setShowVendorModal(false)}>Cancel</button>
                                    <button type="submit" disabled={savingVendor} className="btn-save">{savingVendor ? 'Saving...' : 'Save Vendor'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}


            {/* Invoice Details Modal */}
            {showInvoiceDetails && pendingInvoice && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal-content" style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '95%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, color: '#0f172a' }}>📄 Invoice Breakdown</h2>
                            <span style={{ padding: '6px 12px', background: pendingInvoice.status === 'Completed' ? '#dcfce7' : '#fef9c3', color: pendingInvoice.status === 'Completed' ? '#166534' : '#854d0e', borderRadius: '20px', fontWeight: 'bold', fontSize: '13px' }}>
                                {pendingInvoice.status}
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                                <h4 style={{ margin: '0 0 10px', color: '#475569' }}>Vendor Details</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                                    <div><strong>Name:</strong> {pendingInvoice.vendorName || 'Unknown'}</div>
                                    <div><strong>GSTIN:</strong> {pendingInvoice.vendorGSTIN || 'N/A'}</div>
                                    <div><strong>Invoice No:</strong> {pendingInvoice.invoiceNumber || 'N/A'}</div>
                                    <div><strong>Date:</strong> {pendingInvoice.invoiceDate ? new Date(pendingInvoice.invoiceDate).toLocaleDateString() : 'N/A'}</div>
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                                <h4 style={{ margin: '0 0 10px', color: '#475569' }}>Medicine Stats</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                                    <div><strong>Total Medicines:</strong> {invoiceStats.total}</div>
                                    <div><strong>Imported Medicines:</strong> {invoiceStats.imported}</div>
                                    <div><strong>Remaining Medicines:</strong> {invoiceStats.remaining}</div>
                                    <div><strong>Purchase Qty:</strong> {pendingInvoice.purchaseQty || 0}</div>
                                    <div><strong>Free Qty:</strong> {pendingInvoice.freeQty || 0}</div>
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                                <h4 style={{ margin: '0 0 10px', color: '#475569' }}>Financials</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                                    <div><strong>Taxable Amount:</strong> ₹{pendingInvoice.taxableAmount || 0}</div>
                                    <div><strong>Discount:</strong> ₹{pendingInvoice.discountAmount || 0}</div>
                                    <div><strong>CGST:</strong> ₹{pendingInvoice.cgst || 0}</div>
                                    <div><strong>SGST:</strong> ₹{pendingInvoice.sgst || 0}</div>
                                    <div style={{ fontSize: '16px', color: '#0f172a', borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' }}><strong>Grand Total:</strong> ₹{pendingInvoice.grandTotal || 0}</div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                            <a href={`/uploads/invoices/${pendingInvoice.uploadedPDF?.generatedName}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                                <button type="button" style={{ padding: '10px 20px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    Download Original PDF
                                </button>
                            </a>
                            <button type="button" onClick={() => setShowInvoiceDetails(false)} style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pending Invoice Confirm Modal */}
            {showInvoiceConfirm && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal-content" style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '500px' }}>
                        <h3 style={{ marginTop: 0, color: '#dc2626' }}>Pending Invoice Detected</h3>
                        <p style={{ color: '#475569', lineHeight: '1.5' }}>
                            There is already a Pending Invoice.<br /><br />
                            <strong>Vendor:</strong> {pendingInvoice?.vendorName || 'N/A'}<br />
                            <strong>Invoice Number:</strong> {pendingInvoice?.invoiceNumber || 'N/A'}<br />
                            <strong>Remaining Medicines:</strong> {invoiceStats.remaining}
                        </p>
                        <p style={{ fontWeight: 'bold', color: '#0f172a', marginTop: '20px' }}>What do you want to do?</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                            <button type="button" onClick={() => { setShowInvoiceConfirm(false); setPendingPdfFile(null); }} style={{ padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                Continue Existing Invoice
                            </button>
                            <button type="button" onClick={() => { handleClearInvoice(); setShowInvoiceConfirm(false); processPdfUpload(pendingPdfFile); }} style={{ padding: '10px', background: '#f1f5f9', color: '#dc2626', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                Upload New Invoice
                            </button>
                            <button type="button" onClick={() => { setShowInvoiceConfirm(false); setPendingPdfFile(null); }} style={{ padding: '10px', background: 'transparent', color: '#64748b', border: 'none', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showConsumptionModal && (
                <div className="modal-overlay">
                    <div className="modal-content inventory-modal" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <div>
                                <h2>📌 Record Consumption</h2>
                                <p className="modal-subtitle">Log internal medicine usage</p>
                            </div>
                            <button className="close-btn" onClick={() => setShowConsumptionModal(false)}>×</button>
                        </div>
                        <div className="pharma-form" style={{ padding: '20px' }}>
                            <form onSubmit={handleRecordConsumption}>
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label>Select Medicine *</label>
                                    <select
                                        required
                                        value={consumptionForm.medicineId || ''}
                                        onChange={(e) => setConsumptionForm({ ...consumptionForm, medicineId: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                    >
                                        <option value="">-- Choose Medicine --</option>
                                        {medicines.filter(m => m.stock > 0).map(med => (
                                            <option key={med._id} value={med._id}>
                                                {med.name} (Batch: {med.batchNumber || 'N/A'}) - In Stock: {med.stock}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label>Quantity *</label>
                                    <input
                                        required
                                        type="number"
                                        min="1"
                                        value={consumptionForm.quantity || ''}
                                        onChange={(e) => setConsumptionForm({ ...consumptionForm, quantity: e.target.value })}
                                        placeholder="Enter quantity used"
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label>Reason / Category *</label>
                                    <select
                                        required
                                        value={consumptionForm.reason || ''}
                                        onChange={(e) => setConsumptionForm({ ...consumptionForm, reason: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                    >
                                        <option value="Doctor/Staff Use">Doctor / Staff Use</option>
                                        <option value="Hospital Emergency / First Aid">Hospital Emergency / First Aid</option>
                                        <option value="Sample / Promotional">Sample / Promotional</option>
                                        <option value="Damaged / Expired Write-off">Damaged / Expired Write-off</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label>Given To (Optional)</label>
                                    <input
                                        type="text"
                                        value={consumptionForm.givenTo || ''}
                                        onChange={(e) => setConsumptionForm({ ...consumptionForm, givenTo: e.target.value })}
                                        placeholder="e.g., Dr. Sharma, Staff Name"
                                    />
                                </div>
                                <div className="modal-actions" style={{ marginTop: '20px' }}>
                                    <button type="button" className="btn-cancel" onClick={() => setShowConsumptionModal(false)}>Cancel</button>
                                    <button type="submit" disabled={savingConsumption} className="btn-save">{savingConsumption ? 'Saving...' : 'Record Consumption'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PharmacyInventory;