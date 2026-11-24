import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LabLayout from '../../components/lab/LabLayout';
import { labAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import {
    FiInbox, FiSearch, FiPrinter, FiEye, FiXCircle,
    FiRefreshCw, FiPlusCircle, FiAlertTriangle, FiCheckCircle,
    FiClock, FiFileText, FiTag, FiDollarSign
} from 'react-icons/fi';
import LabOrderSlipModal from './LabOrderSlipModal';
import './LabOrdersPage.css';

const LabOrdersPage = () => {
    const navigate = useNavigate();

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalOrders, setTotalOrders] = useState(0);

    // Selected order for Detail Modal
    const [detailOrder, setDetailOrder] = useState(null);

    // Slip / Token Modal state
    const [slipModalOpen, setSlipModalOpen] = useState(false);
    const [slipOrder, setSlipOrder] = useState(null);
    const [isTokenOnly, setIsTokenOnly] = useState(false);

    // Recollections State
    const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'recollections'
    const [recollections, setRecollections] = useState([]);
    const [loadingRecollections, setLoadingRecollections] = useState(false);

    // Load Orders
    const loadOrders = async (pageNum = 1) => {
        setLoading(true);
        try {
            const res = await labAPI.reception.getOrders({
                search,
                status: statusFilter,
                priority: priorityFilter,
                page: pageNum,
                limit: 15
            });
            if (res.success) {
                setOrders(res.data || []);
                setPage(res.pagination?.page || 1);
                setTotalPages(res.pagination?.totalPages || 1);
                setTotalOrders(res.pagination?.total || 0);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load laboratory orders');
        } finally {
            setLoading(false);
        }
    };

    // Load Recollections
    const loadRecollections = async () => {
        setLoadingRecollections(true);
        try {
            const res = await labAPI.reception.getRecollections();
            if (res.success) setRecollections(res.data || []);
        } catch (err) {
            toast.error('Failed to load pending recollection tasks');
        } finally {
            setLoadingRecollections(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'orders') {
            loadOrders(1);
        } else {
            loadRecollections();
        }
    }, [activeTab, statusFilter, priorityFilter]);

    // Handle Cancel Order
    const handleCancelOrder = async (order) => {
        const reason = window.prompt(`Please provide a reason to cancel Requisition #${order.orderNumber}:`);
        if (!reason || !reason.trim()) return;

        try {
            const res = await labAPI.reception.cancelOrder(order._id, reason.trim());
            if (res.success) {
                toast.success(`Order #${order.orderNumber} cancelled successfully`);
                loadOrders(page);
                if (detailOrder?._id === order._id) {
                    setDetailOrder(res.order);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel order');
        }
    };

    // Acknowledge Recollection
    const handleAcknowledgeRecollection = async (orderId, placeholderId) => {
        try {
            const res = await labAPI.reception.acknowledgeRecollection(orderId, placeholderId);
            if (res.success) {
                toast.success(res.message);
                loadRecollections();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to process recollection');
        }
    };

    return (
        <LabLayout
            title="Laboratory Orders &amp; Intake Requisitions"
            subtitle="Track booked investigations, print slips &amp; queue tokens, and process recollection requests"
        >
            {/* Top Navigation Bar: Orders vs Recollections */}
            <div className="lmd-orders-top-tabs">
                <button
                    className={`lmd-order-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
                    onClick={() => setActiveTab('orders')}
                >
                    <FiInbox /> All Requisitions ({totalOrders})
                </button>
                <button
                    className={`lmd-order-tab-btn ${activeTab === 'recollections' ? 'active' : ''}`}
                    onClick={() => setActiveTab('recollections')}
                >
                    <FiAlertTriangle /> Pending Recollections {recollections.length > 0 && <span className="rec-badge">{recollections.length}</span>}
                </button>
                <div style={{ marginLeft: 'auto' }}>
                    <button
                        className="btn-create-order"
                        onClick={() => navigate('/lab/orders/create')}
                    >
                        <FiPlusCircle /> Book New Order
                    </button>
                </div>
            </div>

            {/* TAB 1: ALL ORDERS DIRECTORY */}
            {activeTab === 'orders' && (
                <>
                    {/* Filters & Action Bar */}
                    <div className="lmd-orders-action-bar">
                        <div className="lmd-orders-search">
                            <FiSearch className="search-icon" />
                            <input
                                type="text"
                                placeholder="Search by Requisition No, Patient Name, Phone, or UHID..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadOrders(1)}
                            />
                            <button className="btn-search" onClick={() => loadOrders(1)}>Search</button>
                        </div>

                        <div className="lmd-filter-selects">
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                                <option value="all">All Status</option>
                                <option value="Confirmed">Confirmed</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                                <option value="Cancelled">Cancelled</option>
                            </select>

                            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                                <option value="all">All Priorities</option>
                                <option value="Routine">Routine</option>
                                <option value="Urgent">Urgent</option>
                                <option value="STAT">STAT</option>
                            </select>

                            <button className="btn-refresh" onClick={() => loadOrders(page)} title="Refresh">
                                <FiRefreshCw className={loading ? 'spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {/* Orders Table */}
                    <div className="lmd-orders-card">
                        {loading ? (
                            <div className="lmd-loading-box">
                                <FiRefreshCw className="spin" /> Loading laboratory requisitions...
                            </div>
                        ) : orders.length === 0 ? (
                            <div className="lmd-empty-box">
                                <FiInbox style={{ fontSize: '36px', color: '#94a3b8' }} />
                                <p>No laboratory requisitions found.</p>
                                <button className="btn-create-order" onClick={() => navigate('/lab/orders/create')}>
                                    Book First Order
                                </button>
                            </div>
                        ) : (
                            <div className="lmd-table-wrapper">
                                <table className="lmd-table">
                                    <thead>
                                        <tr>
                                            <th>Order No.</th>
                                            <th>Token</th>
                                            <th>Patient Name &amp; UHID</th>
                                            <th>Contact</th>
                                            <th>Investigations</th>
                                            <th>Priority</th>
                                            <th>Tariff (₹)</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orders.map(ord => (
                                            <tr key={ord._id}>
                                                <td className="bold text-blue">{ord.orderNumber}</td>
                                                <td>
                                                    <span className="token-pill">#{ord.tokenNumber}</span>
                                                </td>
                                                <td>
                                                    <div className="bold">{ord.patientSnapshot?.name}</div>
                                                    <div className="subtext">{ord.patientSnapshot?.uhid || ord.patientSnapshot?.mrn}</div>
                                                </td>
                                                <td>{ord.patientSnapshot?.phone}</td>
                                                <td>
                                                    <div>{ord.tests?.length || 0} Test(s) {ord.packages?.length > 0 ? `+ ${ord.packages.length} Pkg(s)` : ''}</div>
                                                    <div className="subtext">{ord.samplePlaceholders?.length || 0} Sample Tube(s)</div>
                                                </td>
                                                <td>
                                                    <span className={`priority-pill ${ord.priority?.toLowerCase()}`}>
                                                        {ord.priority}
                                                    </span>
                                                </td>
                                                <td className="bold">₹{ord.pricing?.netAmount || 0}</td>
                                                <td>
                                                    <span className={`lmd-status-dot ${ord.status === 'Cancelled' ? 'inactive' : 'active'}`}>
                                                        {ord.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="lmd-table-actions">
                                                        <button
                                                            className="lmd-icon-btn"
                                                            title="View Details"
                                                            onClick={() => setDetailOrder(ord)}
                                                        >
                                                            <FiEye />
                                                        </button>
                                                        <button
                                                            className="lmd-icon-btn"
                                                            title="Print Requisition Slip"
                                                            onClick={() => {
                                                                setSlipOrder(ord);
                                                                setIsTokenOnly(false);
                                                                setSlipModalOpen(true);
                                                            }}
                                                        >
                                                            <FiPrinter />
                                                        </button>
                                                        <button
                                                            className="lmd-icon-btn"
                                                            title="Print Queue Token"
                                                            onClick={() => {
                                                                setSlipOrder(ord);
                                                                setIsTokenOnly(true);
                                                                setSlipModalOpen(true);
                                                            }}
                                                        >
                                                            <FiTag />
                                                        </button>
                                                        {ord.status !== 'Cancelled' && ord.status !== 'Completed' && (
                                                            <button
                                                                className="lmd-icon-btn danger"
                                                                title="Cancel Order"
                                                                onClick={() => handleCancelOrder(ord)}
                                                            >
                                                                <FiXCircle />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="lmd-pagination-bar">
                                <button disabled={page <= 1} onClick={() => loadOrders(page - 1)} className="btn-page">
                                    Previous
                                </button>
                                <span>Page {page} of {totalPages}</span>
                                <button disabled={page >= totalPages} onClick={() => loadOrders(page + 1)} className="btn-page">
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* TAB 2: PENDING RECOLLECTIONS */}
            {activeTab === 'recollections' && (
                <div className="lmd-orders-card">
                    <div className="lmd-patient-table-hdr">
                        <div>
                            <h3>Sample Recollection Requests</h3>
                            <p className="sub">Samples rejected by phlebotomy or technical lab requiring redrawing</p>
                        </div>
                        <button className="btn-refresh" onClick={loadRecollections} title="Refresh">
                            <FiRefreshCw className={loadingRecollections ? 'spin' : ''} />
                        </button>
                    </div>

                    {loadingRecollections ? (
                        <div className="lmd-loading-box"><FiRefreshCw className="spin" /> Loading recollections...</div>
                    ) : recollections.length === 0 ? (
                        <div className="lmd-empty-box">
                            <FiCheckCircle style={{ fontSize: '36px', color: '#16a34a' }} />
                            <p>No pending sample recollections! All samples accepted.</p>
                        </div>
                    ) : (
                        <div className="lmd-table-wrapper">
                            <table className="lmd-table">
                                <thead>
                                    <tr>
                                        <th>Requisition No</th>
                                        <th>Patient Name</th>
                                        <th>Sample Placeholder</th>
                                        <th>Specimen &amp; Container</th>
                                        <th>Rejection Reason</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recollections.map(rec => {
                                        const placeholdersToRedraw = (rec.samplePlaceholders || []).filter(
                                            sp => sp.status === 'Recollection Requested'
                                        );
                                        return placeholdersToRedraw.map(ph => (
                                            <tr key={`${rec._id}-${ph.samplePlaceholderId}`}>
                                                <td className="bold text-blue">{rec.orderNumber}</td>
                                                <td>
                                                    <strong>{rec.patientSnapshot?.name}</strong>
                                                    <div className="subtext">{rec.patientSnapshot?.phone}</div>
                                                </td>
                                                <td><span className="token-pill">{ph.samplePlaceholderId}</span></td>
                                                <td>{ph.specimenType} / {ph.containerType}</td>
                                                <td className="text-danger bold">
                                                    {ph.recollectionReason || 'Sample hemolyzed / insufficient volume'}
                                                </td>
                                                <td>
                                                    <button
                                                        className="lmd-action-btn primary"
                                                        onClick={() => handleAcknowledgeRecollection(rec._id, ph.samplePlaceholderId)}
                                                    >
                                                        <FiCheckCircle /> Schedule Recollection
                                                    </button>
                                                </td>
                                            </tr>
                                        ));
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* =========================================================
                ORDER DETAIL MODAL
               ========================================================= */}
            {detailOrder && (
                <div className="lmd-modal-overlay" onClick={() => setDetailOrder(null)}>
                    <div className="lmd-modal-card wide" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <h3>Requisition #{detailOrder.orderNumber} (Token #{detailOrder.tokenNumber})</h3>
                            <button className="lmd-close-btn" onClick={() => setDetailOrder(null)}>✕</button>
                        </div>
                        <div className="lmd-order-detail-content">
                            {/* Patient Demographics */}
                            <div className="detail-meta-grid">
                                <div><strong>Patient:</strong> {detailOrder.patientSnapshot?.name}</div>
                                <div><strong>UHID:</strong> {detailOrder.patientSnapshot?.uhid || detailOrder.patientSnapshot?.mrn}</div>
                                <div><strong>Phone:</strong> {detailOrder.patientSnapshot?.phone}</div>
                                <div><strong>Age / Gender:</strong> {detailOrder.patientSnapshot?.age} Yrs / {detailOrder.patientSnapshot?.gender}</div>
                                <div><strong>Doctor:</strong> {detailOrder.referringDoctorName || 'Direct Walk-in'}</div>
                                <div><strong>Priority:</strong> {detailOrder.priority}</div>
                                <div><strong>Collection:</strong> {detailOrder.collectionType}</div>
                                <div><strong>Status:</strong> {detailOrder.status}</div>
                            </div>

                            {/* Booked Investigations */}
                            <h4 style={{ margin: '16px 0 8px' }}>Booked Investigations ({detailOrder.tests?.length || 0})</h4>
                            <div className="detail-tests-list">
                                {detailOrder.tests?.map((t, i) => (
                                    <div key={i} className="detail-test-chip">
                                        <span>{t.testCode} - {t.testName}</span>
                                        <span className="bold">₹{t.price}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Sample Placeholders */}
                            <h4 style={{ margin: '16px 0 8px' }}>Specimen Placeholders ({detailOrder.samplePlaceholders?.length || 0})</h4>
                            <div className="detail-placeholders-grid">
                                {detailOrder.samplePlaceholders?.map((sp, i) => (
                                    <div key={i} className="detail-ph-card">
                                        <div className="bold">{sp.samplePlaceholderId} - {sp.containerType}</div>
                                        <div className="sub">{sp.specimenType} ({sp.requiredVolume})</div>
                                        <div className="tests">For: {sp.testCodes?.join(', ')}</div>
                                        <div className="status">{sp.status}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Pricing Breakdown */}
                            <div className="detail-pricing-summary">
                                <div>Standard Tariff: <strong>₹{detailOrder.pricing?.totalStandardPrice || 0}</strong></div>
                                {detailOrder.pricing?.totalDiscount > 0 && (
                                    <div className="text-green">Package Discount: <strong>-₹{detailOrder.pricing?.totalDiscount}</strong></div>
                                )}
                                <div className="net">Net Payable: <strong>₹{detailOrder.pricing?.netAmount || 0}</strong></div>
                            </div>

                            {/* Actions Footer */}
                            <div className="lmd-modal-actions">
                                <button
                                    className="lmd-btn-outline"
                                    onClick={() => {
                                        setSlipOrder(detailOrder);
                                        setIsTokenOnly(true);
                                        setSlipModalOpen(true);
                                    }}
                                >
                                    <FiTag /> Print Token
                                </button>
                                <button
                                    className="lmd-btn-primary"
                                    onClick={() => {
                                        setSlipOrder(detailOrder);
                                        setIsTokenOnly(false);
                                        setSlipModalOpen(true);
                                    }}
                                >
                                    <FiPrinter /> Print Requisition Slip
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Print Slip Modal */}
            {slipModalOpen && slipOrder && (
                <LabOrderSlipModal
                    isOpen={slipModalOpen}
                    onClose={() => setSlipModalOpen(false)}
                    order={slipOrder}
                    isTokenOnly={isTokenOnly}
                />
            )}
        </LabLayout>
    );
};

export default LabOrdersPage;
