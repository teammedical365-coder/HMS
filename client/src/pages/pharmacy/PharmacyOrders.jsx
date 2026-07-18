import React, { useState, useEffect } from 'react';
import { pharmacyOrderAPI } from '../../utils/api';
import './PharmacyInventory.css';

const getPharmacyTotal = (order, isChecked) => {
    if (order.totalAmount && Number(order.totalAmount) > 0) return Number(order.totalAmount);
    if (!order.items || !order.items.length) return 0;

    let sum = 0;
    order.items.forEach((item, idx) => {
        const includeItem = order.orderStatus === 'Upcoming' ? isChecked(order._id, idx) : item.purchased;
        if (includeItem) {
            const qty = parseInt(item.quantity) || parseInt(item.duration) || parseInt(item.days) || 1;
            sum += (Number(item.price) || 50) * qty;
        }
    });
    return sum;
};

const PharmacyOrders = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [checkedItems, setCheckedItems] = useState({});
    const [expandedRows, setExpandedRows] = useState({});
    const [searchTerm, setSearchTerm] = useState('');

    const toggleExpand = (orderId) => {
        setExpandedRows(prev => ({ ...prev, [orderId]: !prev[orderId] }));
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const res = await pharmacyOrderAPI.getOrders();
            if (res.success) setOrders(res.orders);
        } catch (err) {
            console.error("Failed to fetch pharmacy orders", err);
        } finally {
            setLoading(false);
        }
    };

    const isChecked = (orderId, idx) => {
        if (!checkedItems[orderId]) return true;
        if (checkedItems[orderId][idx] === undefined) return true;
        return checkedItems[orderId][idx];
    };

    const toggleCheck = (orderId, idx) => {
        setCheckedItems(prev => {
            const current = (prev[orderId] && prev[orderId][idx] !== undefined) ? prev[orderId][idx] : true;
            return {
                ...prev,
                [orderId]: {
                    ...(prev[orderId] || {}),
                    [idx]: !current
                }
            };
        });
    };

    const handleCompleteOrder = async (orderId, orderItemsLength) => {
        const purchasedIndices = [];
        for (let i = 0; i < orderItemsLength; i++) {
            if (isChecked(orderId, i)) purchasedIndices.push(i);
        }

        if (purchasedIndices.length === 0) {
            if (!window.confirm("No medicines selected! Are you sure you want to proceed and mark order complete but strictly skip dispensing?")) return;
        } else {
            if (!window.confirm("Mark this order as Dispensed / Paid?")) return;
        }

        try {
            const res = await pharmacyOrderAPI.completeOrder(orderId, purchasedIndices);
            if (res.success) {
                alert("Order completed!");
                fetchOrders();
            }
        } catch (err) {
            alert("Failed to update order.");
        }
    };

    const filteredOrders = orders.filter(o =>
        (o.userId?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.patientId || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="pharmacy-management-container">
            <div className="pharmacy-header">
                <h1>Order Management</h1>
                <p>Process prescriptions sent by doctors and confirm payments.</p>
            </div>

                                {/* Custom Hardcoded Panel Container - Isse background har haal mein dikhega */}
                    <div 
                    style={{ 
                        backgroundColor: '#ffffff', 
                        border: '1px solid #f3f4f6', 
                        borderRadius: '1rem', 
                        padding: '16px', 
                        marginBottom: '20px',
                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%'
                    }}
                    >
                    {/* Inner Input Wrapper with fixed width */}
                    <div className="relative w-full" style={{ maxWidth: '260px' }}> 
                        <span 
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-sm flex items-center pointer-events-none" 
                        style={{ zIndex: 10 }}
                        >
                        🔍
                        </span>
                        <input 
                        type="text" 
                        placeholder="Search Patient by Name..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ 
                            width: '100%',
                            paddingLeft: '36px',
                            paddingRight: '12px',
                            paddingTop: '6px',
                            paddingBottom: '6px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            color: '#374151',
                            outline: 'none',
                            boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                        }}
                        />
                    </div>
                    </div>

            <div className="inventory-table-wrapper">
                {loading ? <div className="loader">Loading Orders...</div> : (
                    <table className="inventory-table">
                        <thead>
                            <tr>
                                <th>Patient Details</th>
                                <th>Doctor</th>
                                <th>Prescribed Items</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map((order) => (
                                <tr key={order._id}>
                                    <td>
                                        <div style={{ fontWeight: 'bold' }}>{order.userId?.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#666' }}>{order.patientId}</div>
                                    </td>
                                    <td>Dr. {order.doctorId?.name}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontWeight: '500', fontSize: '0.9rem', color: '#334155' }}>
                                                📦 {order.items?.length || 0} Items
                                            </span>
                                            <button
                                                onClick={() => toggleExpand(order._id)}
                                                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', padding: 0 }}
                                            >
                                                {expandedRows[order._id] ? 'Hide Details ↑' : 'View Details ↓'}
                                            </button>
                                        </div>
                                        {expandedRows[order._id] && (
                                            <div className="bg-gray-50/50 p-2 rounded mt-1" style={{ backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', marginTop: '8px', border: '1px solid #e2e8f0' }}>
                                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
                                                    {order.items.map((item, idx) => (
                                                        <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                            {order.orderStatus === 'Upcoming' ? (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked(order._id, idx)}
                                                                    onChange={() => toggleCheck(order._id, idx)}
                                                                    style={{ cursor: 'pointer' }}
                                                                />
                                                            ) : (
                                                                <span style={{ color: item.purchased ? '#16a34a' : '#ef4444' }}>
                                                                    {item.purchased ? '✓' : '✗'}
                                                                </span>
                                                            )}
                                                            <span style={{ textDecoration: order.orderStatus !== 'Upcoming' && !item.purchased ? 'line-through' : 'none', color: order.orderStatus !== 'Upcoming' && !item.purchased ? '#999' : '#000' }}>
                                                                {item.medicineName} {item.frequency ? `(${item.frequency})` : ''}
                                                                {(() => {
                                                                    const itemQty = parseInt(item.quantity) || parseInt(item.duration) || parseInt(item.days) || 1;
                                                                    const itemTotal = (Number(item.price) || 50) * itemQty;
                                                                    const durationText = item.duration ? `${item.duration}` : item.quantity ? `${item.quantity} Qty` : item.days ? `${item.days} Days` : '1 Qty';
                                                                    return (
                                                                        <>
                                                                            <span style={{ marginLeft: '6px', color: '#475569', fontSize: '0.85rem' }}>[{durationText}]</span>
                                                                            <span style={{ marginLeft: '6px', color: '#059669', fontWeight: '600', fontSize: '0.8rem' }}>- ₹{itemTotal}</span>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ fontWeight: '700', color: '#0f172a' }}>
                                        ₹{getPharmacyTotal(order, isChecked)}
                                    </td>
                                    <td>
                                        <span className={`status-badge ${order.orderStatus === 'Completed' ? 'status-active' : 'status-low'}`}>
                                            {order.orderStatus === 'Upcoming' ? 'Pending' : order.orderStatus}
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{
                                            color: order.paymentStatus === 'Paid' ? '#166534' : '#991b1b',
                                            fontWeight: 'bold'
                                        }}>
                                            {order.paymentStatus}
                                        </span>
                                    </td>
                                    <td>
                                        {order.orderStatus === 'Upcoming' && (
                                            <button
                                                className="btn-add"
                                                style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                                                onClick={() => handleCompleteOrder(order._id, order.items.length)}
                                            >
                                                Complete Selected & Paid
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default PharmacyOrders; // Ensure this line exists to fix the SyntaxError