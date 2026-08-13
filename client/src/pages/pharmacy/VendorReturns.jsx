import React, { useState, useEffect } from 'react';
import { pharmacyAPI } from '../../utils/api';
import './PharmacyReturns.css'; // Reusing CSS from Patient returns to stay consistent

const VendorReturns = () => {
    const [returnsHistory, setReturnsHistory] = useState([]);
    const [inventory, setInventory] = useState([]);
    
    // Form State
    const [vendorName, setVendorName] = useState('');
    const [invoiceOrBillNo, setInvoiceOrBillNo] = useState('');
    const [returnItems, setReturnItems] = useState([]);
    
    // Draft Item State
    const [selectedMedicineId, setSelectedMedicineId] = useState('');
    const [returnQuantity, setReturnQuantity] = useState(1);
    const [returnReason, setReturnReason] = useState('Expired');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const [returnsRes, invRes] = await Promise.all([
                pharmacyAPI.getVendorReturns(),
                pharmacyAPI.getInventory()
            ]);
            if (returnsRes.success) setReturnsHistory(returnsRes.returns || []);
            if (invRes.success) setInventory(invRes.data || []);
        } catch (error) {
            console.error('Error fetching initial data:', error);
        }
    };

    const handleAddItem = () => {
        if (!selectedMedicineId || returnQuantity <= 0) return;
        const medicine = inventory.find(i => i._id === selectedMedicineId);
        if (!medicine) return;

        if (returnQuantity > medicine.stock) {
            alert(`Cannot return more than current stock (${medicine.stock})`);
            return;
        }

        const newItem = {
            inventoryId: medicine._id,
            medicineName: medicine.name,
            batchNumber: medicine.batchNumber || '',
            quantityReturned: Number(returnQuantity),
            unitPrice: medicine.buyingPrice || medicine.sellingPrice || 0,
            reason: returnReason
        };

        setReturnItems([...returnItems, newItem]);
        setSelectedMedicineId('');
        setReturnQuantity(1);
    };

    const handleRemoveItem = (index) => {
        setReturnItems(returnItems.filter((_, i) => i !== index));
    };

    const totalReturnAmount = returnItems.reduce((sum, item) => sum + (item.quantityReturned * item.unitPrice), 0);

    const handleSubmitReturn = async () => {
        if (!vendorName) return alert('Vendor Name is required');
        if (returnItems.length === 0) return alert('Add at least one item to return');

        setLoading(true);
        try {
            const payload = {
                vendorName,
                invoiceOrBillNo,
                items: returnItems,
                totalReturnAmount
            };

            const res = await pharmacyAPI.createVendorReturn(payload);
            if (res.success) {
                alert('Vendor return submitted successfully');
                // Reset form
                setVendorName('');
                setInvoiceOrBillNo('');
                setReturnItems([]);
                // Refresh data
                fetchInitialData();
            } else {
                alert(res.message || 'Error submitting return');
            }
        } catch (error) {
            alert('Error submitting return');
            console.error(error);
        }
        setLoading(false);
    };

    return (
        <div className="pharmacy-management-container" style={{ padding: '20px' }}>
            <div className="header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b' }}>Vendor Returns (RTV)</h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Left Panel: Return Form */}
                <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>New Return to Vendor</h2>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Vendor Name *</label>
                            <input 
                                type="text" 
                                value={vendorName} 
                                onChange={(e) => setVendorName(e.target.value)} 
                                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                placeholder="e.g. PharmaCorp Ltd."
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Invoice/Bill No.</label>
                            <input 
                                type="text" 
                                value={invoiceOrBillNo} 
                                onChange={(e) => setInvoiceOrBillNo(e.target.value)} 
                                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                placeholder="Original Invoice No"
                            />
                        </div>
                    </div>

                    <div style={{ padding: '15px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Add Medicine to Return</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                            <div>
                                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Select Medicine</label>
                                <select 
                                    value={selectedMedicineId}
                                    onChange={(e) => setSelectedMedicineId(e.target.value)}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                >
                                    <option value="">-- Choose from Inventory --</option>
                                    {inventory.filter(i => i.stock > 0).map(i => (
                                        <option key={i._id} value={i._id}>{i.name} (Stock: {i.stock})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Qty</label>
                                <input 
                                    type="number" 
                                    min="1"
                                    value={returnQuantity}
                                    onChange={(e) => setReturnQuantity(e.target.value)}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Reason</label>
                                <select 
                                    value={returnReason}
                                    onChange={(e) => setReturnReason(e.target.value)}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                >
                                    <option value="Expired">Expired</option>
                                    <option value="Damaged">Damaged</option>
                                    <option value="Excess Stock">Excess Stock</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <button 
                                    type="button"
                                    onClick={handleAddItem}
                                    style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>

                    {returnItems.length > 0 && (
                        <div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontSize: '12px', color: '#64748b' }}>
                                        <th style={{ padding: '8px' }}>Medicine</th>
                                        <th style={{ padding: '8px' }}>Batch</th>
                                        <th style={{ padding: '8px' }}>Qty</th>
                                        <th style={{ padding: '8px' }}>Price</th>
                                        <th style={{ padding: '8px' }}>Reason</th>
                                        <th style={{ padding: '8px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {returnItems.map((item, index) => (
                                        <tr key={index} style={{ borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                                            <td style={{ padding: '8px' }}>{item.medicineName}</td>
                                            <td style={{ padding: '8px' }}>{item.batchNumber}</td>
                                            <td style={{ padding: '8px' }}>{item.quantityReturned}</td>
                                            <td style={{ padding: '8px' }}>₹{item.unitPrice}</td>
                                            <td style={{ padding: '8px' }}>{item.reason}</td>
                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                <button onClick={() => handleRemoveItem(index)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: '#f1f5f9', borderRadius: '6px' }}>
                                <span style={{ fontWeight: 'bold' }}>Total Return Amount:</span>
                                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f766e' }}>₹{totalReturnAmount.toFixed(2)}</span>
                            </div>
                            <div style={{ marginTop: '20px', textAlign: 'right' }}>
                                <button 
                                    onClick={handleSubmitReturn}
                                    disabled={loading}
                                    style={{ padding: '10px 24px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                    {loading ? 'Submitting...' : 'Submit Return'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Panel: History */}
                <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>Return History</h2>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontSize: '13px', color: '#475569' }}>
                                    <th style={{ padding: '12px' }}>Date</th>
                                    <th style={{ padding: '12px' }}>Vendor</th>
                                    <th style={{ padding: '12px' }}>Items</th>
                                    <th style={{ padding: '12px' }}>Amount</th>
                                    <th style={{ padding: '12px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {returnsHistory.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No returns found</td>
                                    </tr>
                                ) : (
                                    returnsHistory.map((ret, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
                                            <td style={{ padding: '12px' }}>{new Date(ret.returnDate).toLocaleDateString()}</td>
                                            <td style={{ padding: '12px', fontWeight: '500' }}>{ret.vendorName}</td>
                                            <td style={{ padding: '12px' }}>{ret.items?.length || 0}</td>
                                            <td style={{ padding: '12px', color: '#dc2626', fontWeight: '500' }}>₹{ret.totalReturnAmount}</td>
                                            <td style={{ padding: '12px' }}>
                                                <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: '#dcfce3', color: '#166534', fontSize: '12px', fontWeight: 'bold' }}>
                                                    {ret.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VendorReturns;
