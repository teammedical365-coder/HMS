import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { pharmacyOrderAPI, pharmacyAPI } from '../../utils/api';
import './PharmacyReturns.css';

const PharmacyReturns = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Process State
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [returnType, setReturnType] = useState('Refund');
    
    // Items selected to return
    // format: { index: { qty: quantity_to_return, restockable: true } }
    const [returnQuantities, setReturnQuantities] = useState({});
    const [returnReason, setReturnReason] = useState('');
    const [paymentMode, setPaymentMode] = useState('CASH');
    
    // Exchange inventory
    const [inventory, setInventory] = useState([]);
    const [exchangedItems, setExchangedItems] = useState([]); // { medicineId, medicineName, quantity, pricePerUnit }

    useEffect(() => {
        if (selectedOrder && returnType === 'Exchange' && inventory.length === 0) {
            fetchInventory();
        }
    }, [selectedOrder, returnType]);

    const fetchInventory = async () => {
        try {
            const res = await pharmacyAPI.getInventory();
            if (res.success) setInventory(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setLoading(true);
        try {
            const res = await pharmacyOrderAPI.searchBills(searchQuery);
            if (res.success) setOrders(res.orders);
        } catch (error) {
            alert('Search failed');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectOrder = (order) => {
        setSelectedOrder(order);
        const initialReturnQs = {};
        order.items.forEach((item, idx) => {
            initialReturnQs[idx] = { qty: 0, restockable: true };
        });
        setReturnQuantities(initialReturnQs);
        setExchangedItems([]);
        setReturnType('Refund');
        setReturnReason('');
    };

    const handleReturnQtyChange = (idx, field, value) => {
        setReturnQuantities(prev => ({
            ...prev,
            [idx]: {
                ...prev[idx],
                [field]: value
            }
        }));
    };

    const handleAddExchangeItem = () => {
        setExchangedItems([...exchangedItems, { medicineId: '', medicineName: '', quantity: 1, pricePerUnit: 0 }]);
    };

    const handleExchangeItemChange = (idx, field, value) => {
        const newItems = [...exchangedItems];
        if (field === 'medicineId') {
            const med = inventory.find(i => i._id === value);
            newItems[idx].medicineId = value;
            newItems[idx].medicineName = med ? med.name : '';
            newItems[idx].pricePerUnit = med ? med.sellingPrice : 0;
        } else {
            newItems[idx][field] = value;
        }
        setExchangedItems(newItems);
    };

    const handleRemoveExchangeItem = (idx) => {
        setExchangedItems(exchangedItems.filter((_, i) => i !== idx));
    };

    // Dynamically calculate correct unit price for an item (mirrors Invoice UI logic)
    const getItemUnitPrice = (item) => {
        // If item.price was saved correctly by the backend, use it
        if (item.price && item.price > 0) return item.price;

        // Otherwise, derive it dynamically from item/medicine data
        const rawName = String(item.medicineName || '').toLowerCase();
        const isLiquidOrInj = rawName.includes('injection') || rawName.includes('inj') || rawName.includes('syrup') || rawName.includes('ceftriaxone');

        let sellingPrice = Number(item.sellingPrice || item.unitRate || 0);
        if (sellingPrice === 0) {
            sellingPrice = isLiquidOrInj ? 120 : 15;
        }
        // Prevent cross-contamination between tablet and injection prices
        if (!isLiquidOrInj && sellingPrice >= 120) {
            sellingPrice = 15;
        }

        let effectiveRate = sellingPrice;
        if (isLiquidOrInj) {
            const volumePerUnit = Number(item.volumePerUnit || item.packSize || item.capacity || 10);
            effectiveRate = sellingPrice / volumePerUnit; // e.g. ₹120 / 10ml = ₹12/ml
        }

        return effectiveRate;
    };

    // Calculate totals
    const calculateTotals = () => {
        let totalRefund = 0;
        const returnedPayload = [];

        if (selectedOrder) {
            selectedOrder.items.forEach((item, idx) => {
                const returnData = returnQuantities[idx] || { qty: 0, restockable: true };
                const qty = Number(returnData.qty);
                if (qty > 0 && item.purchased) {
                    const unitPrice = getItemUnitPrice(item);
                    const refundAmt = qty * unitPrice;
                    totalRefund += refundAmt;
                    returnedPayload.push({
                        medicineName: item.medicineName,
                        quantity: qty,
                        pricePerUnit: unitPrice,
                        refundAmount: refundAmt,
                        restockable: returnData.restockable
                    });
                }
            });
        }

        let totalExchangeCost = 0;
        const exchangePayload = [];
        if (returnType === 'Exchange') {
            exchangedItems.forEach(item => {
                if (item.medicineId && item.quantity > 0) {
                    const cost = item.quantity * item.pricePerUnit;
                    totalExchangeCost += cost;
                    exchangePayload.push({
                        ...item,
                        totalCost: cost
                    });
                }
            });
        }

        // Net = Exchange Cost - Refund Amount
        // Positive means patient pays us. Negative means we refund patient.
        const netAmount = totalExchangeCost - totalRefund;

        return { totalRefund, totalExchangeCost, netAmount, returnedPayload, exchangePayload };
    };

    const { totalRefund, totalExchangeCost, netAmount, returnedPayload, exchangePayload } = calculateTotals();

    const handleSubmit = async () => {
        if (!selectedOrder) return;
        if (returnedPayload.length === 0) {
            return alert("Please specify quantities to return.");
        }

        let returnResponseData = null;
        const orderSnapshot = { ...selectedOrder };

        try {
            const res = await pharmacyOrderAPI.processReturn({
                originalOrderId: selectedOrder._id,
                returnType,
                returnedItems: returnedPayload,
                exchangedItems: exchangePayload,
                netAmount,
                returnReason,
                refundAmount: netAmount < 0 ? Math.abs(netAmount) : 0
            });

            if (res.success) {
                console.log("✅ [RETURN SUCCESS] Backend response:", res);
                returnResponseData = res.data;
                alert(`Success! ${res.message}`);
                setSelectedOrder(null);
                setSearchQuery('');
                setOrders([]);
            } else {
                console.warn("⚠️ [RETURN] Backend returned 200 but success is falsy:", res);
                alert(res.message || "Return processed but response was unexpected.");
            }
        } catch (error) {
            console.error("❌ [RETURN ERROR TRACE]:", error);
            console.error("❌ [RETURN ERROR] Response data:", error.response?.data);
            alert(error.response?.data?.message || "Failed to process return.");
        }

        // Generate PDF OUTSIDE the try-catch so it never masks a successful return
        if (returnResponseData) {
            generatePDF(returnResponseData, orderSnapshot);
        }
    };

    const generatePDF = (returnData, orderInfo) => {
        try {
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text("Pharmacy Return/Exchange Invoice", 14, 22);
        
        doc.setFontSize(11);
        doc.text(`Return ID: ${returnData._id}`, 14, 32);
        doc.text(`Original Order: ${returnData.originalOrderId}`, 14, 38);
        doc.text(`Date: ${new Date(returnData.createdAt).toLocaleString()}`, 14, 44);
        doc.text(`Type: ${returnData.returnType}`, 14, 50);

        let yPos = 60;
        if (returnData.returnedItems && returnData.returnedItems.length > 0) {
            doc.setFontSize(14);
            doc.text("Returned Items", 14, yPos);
            yPos += 5;
            const returnDataRows = returnData.returnedItems.map(item => [
                item.medicineName,
                item.quantity.toString(),
                `Rs. ${item.pricePerUnit}`,
                `Rs. ${item.refundAmount}`
            ]);
            doc.autoTable({
                startY: yPos,
                head: [['Medicine', 'Qty', 'Unit Price', 'Refund']],
                body: returnDataRows,
            });
            yPos = doc.lastAutoTable.finalY + 10;
        }

        if (returnData.exchangedItems && returnData.exchangedItems.length > 0) {
            doc.setFontSize(14);
            doc.text("Exchanged Items", 14, yPos);
            yPos += 5;
            const exchangeRows = returnData.exchangedItems.map(item => [
                item.medicineName,
                item.quantity.toString(),
                `Rs. ${item.pricePerUnit}`,
                `Rs. ${item.totalCost}`
            ]);
            doc.autoTable({
                startY: yPos,
                head: [['Medicine', 'Qty', 'Unit Price', 'Cost']],
                body: exchangeRows,
            });
            yPos = doc.lastAutoTable.finalY + 10;
        }

        doc.setFontSize(12);
        doc.text(`Net Amount: Rs. ${returnData.netAmount}`, 14, yPos);
        yPos += 10;
        if (returnData.netAmount < 0) {
            doc.text(`Refunded to Patient: Rs. ${Math.abs(returnData.netAmount)}`, 14, yPos);
            
            // Add GST Reversal info if refund exists
            if (orderInfo && orderInfo.totalAmount > 0) {
                const refundAmount = Math.abs(returnData.netAmount);
                const cgstRatio = (orderInfo.cgstAmount || 0) / orderInfo.totalAmount;
                const sgstRatio = (orderInfo.sgstAmount || 0) / orderInfo.totalAmount;
                
                const cgstReversed = refundAmount * cgstRatio;
                const sgstReversed = refundAmount * sgstRatio;
                const taxableReversed = refundAmount - cgstReversed - sgstReversed;
                
                yPos += 10;
                doc.setFontSize(10);
                doc.text(`--- Tax Reversal Breakdown (Proportional) ---`, 14, yPos);
                yPos += 5;
                doc.text(`Taxable Value Reversed: Rs. ${taxableReversed.toFixed(2)}`, 14, yPos);
                yPos += 5;
                doc.text(`CGST Reversed: Rs. ${cgstReversed.toFixed(2)}`, 14, yPos);
                yPos += 5;
                doc.text(`SGST Reversed: Rs. ${sgstReversed.toFixed(2)}`, 14, yPos);
            }
        } else {
            doc.text(`Collected from Patient: Rs. ${returnData.netAmount}`, 14, yPos);
        }
        
        window.open(doc.output('bloburl'), '_blank');
        } catch (pdfError) {
            console.error("❌ [PDF GENERATION FAILED]:", pdfError);
            alert("Return processed successfully, but failed to generate the PDF receipt.");
        }
    };

    return (
        <div className="pharmacy-returns-container">
            <div className="returns-header">
                <h1>Medicine Return & Exchange</h1>
                <p>Process refunds or medicine exchanges for patients.</p>
            </div>

            <div className="search-section">
                <form onSubmit={handleSearch} className="search-form">
                    <input 
                        type="text" 
                        placeholder="Search by Invoice ID, MRN, Name, or Mobile..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                    <button type="submit" className="btn-search" disabled={loading}>
                        {loading ? 'Searching...' : 'Search Bill'}
                    </button>
                </form>

                {orders.length > 0 && !selectedOrder && (
                    <div className="search-results">
                        <h3>Select a Bill</h3>
                        <table className="results-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Invoice ID</th>
                                    <th>Patient</th>
                                    <th>Status</th>
                                    <th>Amount</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(order => (
                                    <tr key={order._id}>
                                        <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                                        <td><small>{order._id}</small></td>
                                        <td>{order.userId?.name} <br/><small>{order.userId?.phone}</small></td>
                                        <td><span className={`status ${order.orderStatus.toLowerCase()}`}>{order.orderStatus}</span></td>
                                        <td>₹{order.totalAmount}</td>
                                        <td>
                                            <button className="btn-select" onClick={() => handleSelectOrder(order)}>Select</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedOrder && (
                <div className="process-section">
                    <div className="process-header">
                        <h2>Processing Invoice: <small>{selectedOrder._id}</small></h2>
                        <button className="btn-cancel" onClick={() => setSelectedOrder(null)}>Cancel</button>
                    </div>

                    <div className="patient-info">
                        <strong>Patient:</strong> {selectedOrder.userId?.name} ({selectedOrder.userId?.phone})
                    </div>

                    <div className="toggle-type">
                        <label className={`toggle-label ${returnType === 'Refund' ? 'active' : ''}`}>
                            <input type="radio" value="Refund" checked={returnType === 'Refund'} onChange={() => setReturnType('Refund')} />
                            Cash Refund
                        </label>
                        <label className={`toggle-label ${returnType === 'Exchange' ? 'active' : ''}`}>
                            <input type="radio" value="Exchange" checked={returnType === 'Exchange'} onChange={() => setReturnType('Exchange')} />
                            Exchange Medicine
                        </label>
                    </div>

                    <div className="original-items">
                        <h3>Select Items to Return</h3>
                        <table className="items-table">
                            <thead>
                                <tr>
                                    <th>Medicine</th>
                                    <th>Purchased Price</th>
                                    <th>Return Qty</th>
                                    <th>Restock?</th>
                                    <th>Refund Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedOrder.items.filter(i => i.purchased).map((item, idx) => {
                                    const retData = returnQuantities[idx] || { qty: 0, restockable: true };
                                    const unitPrice = getItemUnitPrice(item);
                                    return (
                                        <tr key={idx}>
                                            <td>{item.medicineName}</td>
                                            <td>₹{unitPrice.toFixed(2)}</td>
                                            <td>
                                                <input 
                                                    type="number" 
                                                    min="0"
                                                    value={retData.qty}
                                                    onChange={(e) => handleReturnQtyChange(idx, 'qty', e.target.value)}
                                                    className="qty-input"
                                                />
                                            </td>
                                            <td>
                                                <input 
                                                    type="checkbox"
                                                    checked={retData.restockable}
                                                    onChange={(e) => handleReturnQtyChange(idx, 'restockable', e.target.checked)}
                                                />
                                            </td>
                                            <td>₹{(retData.qty * unitPrice).toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {returnType === 'Exchange' && (
                        <div className="exchange-items">
                            <h3>Select Items for Exchange</h3>
                            <table className="items-table">
                                <thead>
                                    <tr>
                                        <th>Medicine</th>
                                        <th>Unit Price</th>
                                        <th>Quantity</th>
                                        <th>Total</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {exchangedItems.map((item, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <select 
                                                    value={item.medicineId} 
                                                    onChange={(e) => handleExchangeItemChange(idx, 'medicineId', e.target.value)}
                                                >
                                                    <option value="">Select Medicine</option>
                                                    {inventory.map(inv => (
                                                        <option key={inv._id} value={inv._id}>{inv.name} (Stock: {inv.stock})</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>₹{item.pricePerUnit}</td>
                                            <td>
                                                <input 
                                                    type="number" 
                                                    min="1"
                                                    value={item.quantity}
                                                    onChange={(e) => handleExchangeItemChange(idx, 'quantity', e.target.value)}
                                                    className="qty-input"
                                                />
                                            </td>
                                            <td>₹{item.pricePerUnit * item.quantity}</td>
                                            <td><button className="btn-remove" onClick={() => handleRemoveExchangeItem(idx)}>×</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button className="btn-add-item" onClick={handleAddExchangeItem}>+ Add Medicine</button>
                        </div>
                    )}

                    <div className="summary-section">
                        <h3>Summary</h3>
                        <div className="summary-row">
                            <span>Total Refund Value:</span>
                            <span className="refund-amount">₹{totalRefund}</span>
                        </div>
                        {returnType === 'Exchange' && (
                            <div className="summary-row">
                                <span>Total Exchange Cost:</span>
                                <span>₹{totalExchangeCost}</span>
                            </div>
                        )}
                        <hr />
                        <div className="summary-row final">
                            <span>{netAmount < 0 ? 'Amount to Refund Patient:' : 'Amount to Collect from Patient:'}</span>
                            <span className={netAmount < 0 ? 'refund-amount' : 'collect-amount'}>
                                ₹{Math.abs(netAmount)}
                            </span>
                        </div>

                        <div className="summary-row final" style={{ marginTop: '10px' }}>
                            <input 
                                type="text"
                                placeholder="Reason for return/exchange (optional)"
                                value={returnReason}
                                onChange={(e) => setReturnReason(e.target.value)}
                                style={{ width: '100%', padding: '10px', marginTop: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                        </div>

                        <div className="process-actions">
                            <button className="btn-submit" onClick={handleSubmit}>
                                Confirm & Print Receipt
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PharmacyReturns;
