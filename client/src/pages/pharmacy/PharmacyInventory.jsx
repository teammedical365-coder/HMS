import React, { useState, useEffect } from 'react';
import { pharmacyAPI } from '../../utils/api';
import './PharmacyInventory.css';

const EMPTY_FORM = {
    name: '', category: '', stock: '', unit: 'Tablets',
    buyingPrice: '', sellingPrice: '', vendor: '',
    batchNumber: '', expiryDate: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    isPriceFixed: false
};

const PharmacyInventory = () => {
    const [medicines, setMedicines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [formError, setFormError] = useState('');
    const [editId, setEditId] = useState(null);

    const [newMedicine, setNewMedicine] = useState(EMPTY_FORM);

    // ── Derived: Profit Margin ───────────────────────────────────────────────
    const buyNum = parseFloat(newMedicine.buyingPrice);
    const sellNum = parseFloat(newMedicine.sellingPrice);
    const profitMargin =
        buyNum > 0 && sellNum > 0
            ? (((sellNum - buyNum) / buyNum) * 100).toFixed(2)
            : '';

    // ── onChange helpers ─────────────────────────────────────────────────────
    /** Stock: integers only, max 6 digits */
    const handleStockChange = (e) => {
        const clean = e.target.value.replace(/\D/g, '').slice(0, 6);
        setNewMedicine(prev => ({ ...prev, stock: clean }));
    };

    /** Prices: positive decimals, prevent duplicate dots */
    const handlePriceChange = (field) => (e) => {
        let val = e.target.value
            .replace(/[^0-9.]/g, '')          // strip non-numeric/non-dot
            .replace(/^\./, '')               // disallow leading dot
            .replace(/(\..*)\./g, '$1');      // prevent second decimal point
        setNewMedicine(prev => ({ ...prev, [field]: val }));
        setFormError('');
    };

    /** Generic change for all other fields */
    const handleFieldChange = (field) => (e) => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setNewMedicine(prev => ({ ...prev, [field]: val }));
        setFormError('');
    };

    // ── Fetch ────────────────────────────────────────────────────────────────
    useEffect(() => { fetchInventory(); }, []);

    const fetchInventory = async () => {
        try {
            setLoading(true);
            const response = await pharmacyAPI.getInventory();
            if (response.success) setMedicines(response.data);
        } catch (error) {
            console.error('Fetch Error:', error);
        } finally { setLoading(false); }
    };

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmitMedicine = async (e) => {
        e.preventDefault();
        setFormError('');

        // ── Form-level validation ──
        const buying = parseFloat(newMedicine.buyingPrice);
        const selling = parseFloat(newMedicine.sellingPrice);

        if (isNaN(buying) || buying <= 0) {
            setFormError('Buying Price must be a positive number.');
            return;
        }
        if (isNaN(selling) || selling <= 0) {
            setFormError('Selling Price must be a positive number.');
            return;
        }
        if (selling < buying) {
            setFormError('Selling Price must be greater than or equal to Buying Price.');
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(newMedicine.expiryDate);
        if (!newMedicine.expiryDate || expiry <= today) {
            setFormError('Expiry Date must be a future date.');
            return;
        }

        const cleanedData = {
            ...newMedicine,
            stock: Number(newMedicine.stock),
            buyingPrice: buying,
            sellingPrice: selling,
            expiryDate: expiry,
            purchaseDate: new Date(newMedicine.purchaseDate)
        };

        try {
            let response;
            if (editId) {
                response = await pharmacyAPI.updateMedicine(editId, cleanedData);
            } else {
                response = await pharmacyAPI.addMedicine(cleanedData);
            }
            if (response.success) {
                setShowAddModal(false);
                setEditId(null);
                fetchInventory();
                setNewMedicine(EMPTY_FORM);
            }
        } catch (error) {
            const msg = error.response?.data?.message || 'Check fields and try again.';
            setFormError('Error: ' + msg);
        }
    };

    // ── Edit ───────────────────────────────────────────────────────────────
    const handleEditClick = (med) => {
        setNewMedicine({
            name: med.name,
            category: med.category,
            stock: med.stock,
            unit: med.unit,
            buyingPrice: med.buyingPrice,
            sellingPrice: med.sellingPrice,
            vendor: med.vendor || '',
            batchNumber: med.batchNumber || '',
            expiryDate: med.expiryDate ? med.expiryDate.split('T')[0] : '',
            purchaseDate: med.purchaseDate ? med.purchaseDate.split('T')[0] : new Date().toISOString().split('T')[0],
            isPriceFixed: med.isPriceFixed || false
        });
        setEditId(med._id);
        setFormError('');
        setShowAddModal(true);
    };

    // ── Delete ───────────────────────────────────────────────────────────────
    const handleDelete = async (id) => {
        if (window.confirm('Delete this item?')) {
            try {
                await pharmacyAPI.deleteMedicine(id);
                fetchInventory();
            } catch { alert('Delete failed.'); }
        }
    };

    const filteredMedicines = medicines.filter(med =>
        med.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        med.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="pharmacy-management-container">
            <div className="pharmacy-header">
                <h1>Medicine Inventory</h1>
                <p>Track stock, vendors, and profit margins.</p>
            </div>

            <div className="inventory-controls">
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <button className="btn-add" onClick={() => { setNewMedicine(EMPTY_FORM); setEditId(null); setFormError(''); setShowAddModal(true); }}>+ Add Stock</button>
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
                                    <td><div className={med.stock < 50 ? 'low-stock' : 'good-stock'}>{med.stock} {med.unit}</div></td>
                                    <td>₹{med.buyingPrice}</td>
                                    <td><strong>₹{med.sellingPrice}</strong></td>
                                    <td>{med.vendor}</td>
                                    <td>{new Date(med.expiryDate).toLocaleDateString()}</td>
                                    <td>
                                        <button className="pharma-action-btn edit" onClick={() => handleEditClick(med)}>✏️</button>
                                        <button className="pharma-action-btn delete" onClick={() => handleDelete(med._id)}>🗑</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {showAddModal && (
                <div className="modal-overlay !fixed !inset-0 !z-[9999] !flex !items-center !justify-center !bg-black/50 !overflow-hidden" 
                     style={{ position: 'fixed', inset: 0, overflowY: 'auto', zIndex: 9999 }} 
                     onWheel={(e) => e.stopPropagation()}>
                    <div className="modal-content inventory-modal !bg-white !rounded-xl !shadow-xl !max-h-[85vh] !w-full !max-w-2xl !flex !flex-col" 
                         style={{ height: '85vh', maxHeight: '85vh', overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header !p-6 !border-b !flex !justify-between !items-center !bg-white">
                            <div>
                                <h2>{editId ? 'Edit Medication' : 'Add New Medication'}</h2>
                                <p className="modal-subtitle">{editId ? 'Update details and stock levels' : 'Enter details to update your stock levels'}</p>
                            </div>
                            <button className="close-btn" onClick={() => setShowAddModal(false)}>×</button>
                        </div>

                        <form onSubmit={handleSubmitMedicine} className="pharma-form !p-6 !overflow-y-auto !flex-1" style={{ flex: '1', overflowY: 'auto', overscrollBehavior: 'contain', zIndex: 10 }}>

                            {/* Inline validation alert */}
                            {formError && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.9rem' }}>
                                    ⚠️ {formError}
                                </div>
                            )}

                            {/* Section 1: Basic Information */}
                            <div className="form-section">
                                <h3 className="section-title">General Information</h3>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Medicine Name <span className="required">*</span></label>
                                        <input required type="text" value={newMedicine.name} onChange={handleFieldChange('name')} placeholder="e.g. Paracetamol 500mg" />
                                    </div>
                                    <div className="form-group">
                                        <label>Category <span className="required">*</span></label>
                                        <input required type="text" value={newMedicine.category} onChange={handleFieldChange('category')} placeholder="e.g. Analgesic" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Vendor / Supplier</label>
                                        <input required type="text" value={newMedicine.vendor} onChange={handleFieldChange('vendor')} placeholder="e.g. Acme Pharma Ltd." />
                                    </div>
                                    <div className="form-group">
                                        <label>Batch Number</label>
                                        <input required type="text" value={newMedicine.batchNumber} onChange={handleFieldChange('batchNumber')} placeholder="e.g. BT-9921" />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Stock & Pricing */}
                            <div className="form-section">
                                <h3 className="section-title">Inventory &amp; Pricing</h3>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Quantity <span className="required">*</span></label>
                                        <input
                                            required
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={newMedicine.stock}
                                            onChange={handleStockChange}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Unit</label>
                                        <select value={newMedicine.unit} onChange={handleFieldChange('unit')}>
                                            <option value="Tablets">Tablets</option>
                                            <option value="Capsules">Capsules</option>
                                            <option value="Bottles">Bottles</option>
                                            <option value="Strips">Strips</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Buying Price (₹) <span className="required">*</span></label>
                                        <div className="input-with-icon">
                                            <input
                                                required
                                                type="text"
                                                inputMode="decimal"
                                                value={newMedicine.buyingPrice}
                                                onChange={handlePriceChange('buyingPrice')}
                                                placeholder="0.00"
                                                readOnly={newMedicine.isPriceFixed}
                                                className={newMedicine.isPriceFixed ? 'bg-gray-100 cursor-not-allowed' : ''}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Selling Price (₹) <span className="required">*</span></label>
                                        <div className="input-with-icon">
                                            <input
                                                required
                                                type="text"
                                                inputMode="decimal"
                                                value={newMedicine.sellingPrice}
                                                onChange={handlePriceChange('sellingPrice')}
                                                placeholder="0.00"
                                                readOnly={newMedicine.isPriceFixed}
                                                className={newMedicine.isPriceFixed ? 'bg-gray-100 cursor-not-allowed' : ''}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Real-time Profit Margin — read-only */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Profit Margin (%)</label>
                                        <input
                                            type="text"
                                            readOnly
                                            value={profitMargin !== '' ? `${profitMargin}%` : '—'}
                                            style={{
                                                background: '#f0fdf4',
                                                color: profitMargin !== '' && parseFloat(profitMargin) >= 0 ? '#16a34a' : '#dc2626',
                                                fontWeight: 600,
                                                cursor: 'default'
                                            }}
                                            tabIndex={-1}
                                        />
                                    </div>
                                    <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', paddingTop: '28px' }}>
                                        <input type="checkbox" id="isPriceFixed" checked={newMedicine.isPriceFixed} onChange={handleFieldChange('isPriceFixed')} style={{ width: 'auto', marginBottom: 0 }} />
                                        <label htmlFor="isPriceFixed" style={{ marginBottom: 0, fontWeight: 'normal' }}>Lock Prices (Fixed)</label>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Dates */}
                            <div className="form-section">
                                <h3 className="section-title">Tracking Dates</h3>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Purchase Date</label>
                                        <input required type="date" value={newMedicine.purchaseDate} onChange={handleFieldChange('purchaseDate')} />
                                    </div>
                                    <div className="form-group">
                                        <label>Expiry Date <span className="required">*</span></label>
                                        <input required type="date" value={newMedicine.expiryDate} onChange={handleFieldChange('expiryDate')} />
                                    </div>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setShowAddModal(false)}>Discard</button>
                                <button type="submit" className="btn-save">{editId ? 'Update Stock' : 'Save to Inventory'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PharmacyInventory;