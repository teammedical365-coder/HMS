import React, { useState, useEffect } from 'react';
import { pharmacyOrderAPI } from '../../utils/api';
import './PharmacyInventory.css';

const PharmacyOrders = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [checkedItems, setCheckedItems] = useState({});

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

    return (
        <div className="pharmacy-management-container">
            <div className="pharmacy-header">
                <h1>Order Management</h1>
                <p>Process prescriptions sent by doctors and confirm payments.</p>
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
                            {orders.map((order) => (
                                <tr key={order._id}>
                                    <td>
                                        <div style={{ fontWeight: 'bold' }}>{order.userId?.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#666' }}>{order.patientId}</div>
                                    </td>
                                    <td>Dr. {order.doctorId?.name}</td>
                                    <td>
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
                                                        {item.medicineName} ({item.frequency})
                                                        {item.price > 0 && (
                                                            <span style={{ marginLeft: '6px', color: '#059669', fontWeight: '600', fontSize: '0.8rem' }}>₹{item.price}</span>
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </td>
                                    <td style={{ fontWeight: '700', color: '#0f172a' }}>
                                        {order.totalAmount > 0
                                            ? `₹${order.totalAmount}`
                                            : order.orderStatus === 'Upcoming' ? '—' : '₹0'}
                                    </td>
                                    <td>
                                        <span className={`status-badge ${order.orderStatus === 'Completed' ? 'status-active' : 'status-low'}`}>
                                            {order.orderStatus}
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{
                                            color: order.paymentStatus === 'Paid' ? '#166534' : (order.orderStatus === 'Completed' && order.paymentStatus === 'Pending' ? '#000' : '#991b1b'),
                                            fontWeight: 'bold'
                                        }}>
                                            {order.orderStatus === 'Completed' && order.paymentStatus === 'Pending' ? '-' : order.paymentStatus}
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