import React, { useState, useEffect } from 'react';
import { pharmacyOrderAPI } from '../../utils/api';
import './PharmacyInventory.css';

const PharmacyOrders = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

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

    const handleCompleteOrder = async (orderId) => {
        if (!window.confirm("Mark this order as Paid and Completed?")) return;
        try {
            const res = await pharmacyOrderAPI.completeOrder(orderId);
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
                                                <li key={idx}>• {item.medicineName} ({item.frequency})</li>
                                            ))}
                                        </ul>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${order.orderStatus === 'Completed' ? 'status-active' : 'status-low'
                                            }`}>
                                            {order.orderStatus}
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
                                                onClick={() => handleCompleteOrder(order._id)}
                                            >
                                                Complete & Paid
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