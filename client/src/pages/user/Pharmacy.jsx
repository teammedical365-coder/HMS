import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Pharmacy.css';

const Pharmacy = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filter, setFilter] = useState('all'); // all, delivered, processing, pending, cancelled
  const [searchTerm, setSearchTerm] = useState('');
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication and fetch pharmacy orders
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      try {
        const user = JSON.parse(userData);
        setLoggedInUser(user);
        fetchPharmacyOrders(token);
      } catch (e) {
        console.error('Error parsing user data:', e);
        navigate('/login?redirect=/pharmacy');
        return;
      }
    } else {
      // No token or user data, redirect to login
      navigate('/login?redirect=/pharmacy');
      return;
    }
  }, [navigate]);

  // Fetch pharmacy orders from API
  const fetchPharmacyOrders = async (token) => {
    try {
      setIsLoading(true);
      // Try to fetch from API first
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/pharmacy/my-orders`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const fetchedOrders = data.orders || [];
          setOrders(fetchedOrders);
          setFilteredOrders(fetchedOrders);
          setIsLoading(false);
          return;
        }
      }
      
      // If API call fails, use mock data (for development)
      console.log('API not available, using mock data');
      const userData = JSON.parse(localStorage.getItem('user'));
      const mockOrders = getMockPharmacyOrders(userData);
      setOrders(mockOrders);
      setFilteredOrders(mockOrders);
    } catch (err) {
      console.error('Error fetching pharmacy orders:', err);
      // Fallback to mock data if API fails
      const userData = JSON.parse(localStorage.getItem('user'));
      const mockOrders = getMockPharmacyOrders(userData);
      setOrders(mockOrders);
      setFilteredOrders(mockOrders);
    } finally {
      setIsLoading(false);
    }
  };

  // Mock pharmacy orders data (for development - remove when API is ready)
  const getMockPharmacyOrders = (userData) => {
    const allOrders = [
      {
        id: 1,
        orderId: 'PHARM-2024-001',
        patientName: 'John Doe',
        userId: 'user1',
        patientEmail: 'john.doe@example.com',
        orderDate: '2024-01-16',
        status: 'delivered',
        items: [
          { name: 'Paracetamol 500mg', quantity: 2, price: 50 },
          { name: 'Vitamin D3', quantity: 1, price: 200 }
        ],
        totalAmount: 300,
        deliveryDate: '2024-01-18',
        deliveryAddress: '123 Main St, City, State 12345',
        paymentStatus: 'paid'
      },
      {
        id: 2,
        orderId: 'PHARM-2024-002',
        patientName: 'Jane Smith',
        userId: 'user2',
        patientEmail: 'jane.smith@example.com',
        orderDate: '2024-01-19',
        status: 'processing',
        items: [
          { name: 'Amoxicillin 500mg', quantity: 1, price: 150 },
          { name: 'Cough Syrup', quantity: 1, price: 120 }
        ],
        totalAmount: 270,
        deliveryDate: null,
        deliveryAddress: '456 Oak Ave, City, State 12345',
        paymentStatus: 'paid'
      },
      {
        id: 3,
        orderId: 'PHARM-2024-003',
        patientName: 'Robert Johnson',
        userId: 'user3',
        patientEmail: 'robert.johnson@example.com',
        orderDate: '2024-01-21',
        status: 'pending',
        items: [
          { name: 'Blood Pressure Monitor', quantity: 1, price: 1500 }
        ],
        totalAmount: 1500,
        deliveryDate: null,
        deliveryAddress: '789 Pine Rd, City, State 12345',
        paymentStatus: 'pending'
      },
      {
        id: 4,
        orderId: 'PHARM-2024-004',
        patientName: 'Maria Garcia',
        userId: 'user4',
        patientEmail: 'maria.garcia@example.com',
        orderDate: '2024-01-23',
        status: 'delivered',
        items: [
          { name: 'Insulin Syringes', quantity: 10, price: 250 },
          { name: 'Glucose Test Strips', quantity: 50, price: 300 }
        ],
        totalAmount: 550,
        deliveryDate: '2024-01-25',
        deliveryAddress: '321 Elm St, City, State 12345',
        paymentStatus: 'paid'
      },
      {
        id: 5,
        orderId: 'PHARM-2024-005',
        patientName: 'David Lee',
        userId: 'user5',
        patientEmail: 'david.lee@example.com',
        orderDate: '2024-01-26',
        status: 'cancelled',
        items: [
          { name: 'Antibiotic Cream', quantity: 1, price: 180 }
        ],
        totalAmount: 180,
        deliveryDate: null,
        deliveryAddress: '654 Maple Dr, City, State 12345',
        paymentStatus: 'refunded'
      }
    ];

    if (!userData) return [];

    const userId = userData.id || userData.userId || userData._id;
    const userEmail = userData.email || userData.userEmail;
    const userName = userData.name || userData.userName || userData.fullName;

    return allOrders.filter(order => {
      if (userId && order.userId === userId) return true;
      if (userEmail && order.patientEmail && 
          order.patientEmail.toLowerCase() === userEmail.toLowerCase()) return true;
      if (userName && order.patientName && 
          order.patientName.toLowerCase() === userName.toLowerCase()) return true;
      return false;
    });
  };

  // Scroll animation logic
  useEffect(() => {
    window.scrollTo(0, 0);
    
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, observerOptions);

    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  // Filter orders by status and search
  useEffect(() => {
    if (isLoading) return;

    let filtered = [...orders];

    // Apply status filter
    if (filter !== 'all') {
      filtered = filtered.filter(order => order.status === filter);
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(order =>
        order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.items.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    setFilteredOrders(filtered);
  }, [filter, searchTerm, orders, isLoading]);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Show loading state
  if (isLoading || !loggedInUser) {
    return (
      <div className="pharmacy-page">
        <div className="content-wrapper">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading your pharmacy orders...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pharmacy-page">
      <div className="content-wrapper">
        
        {/* Header Section */}
        <section className="pharmacy-header animate-on-scroll slide-up">
          <Link to="/" className="back-link">
            <span className="back-arrow">←</span> Back to Home
          </Link>
          
          <div className="header-content">
            <span className="badge">Pharmacy Orders</span>
            <h1>
              Your <span className="text-gradient">Pharmacy Orders</span>
            </h1>
            <p className="header-subtext">
              View and track all your medication orders and purchases. 
              Manage your prescriptions and delivery information.
            </p>
            {loggedInUser && (loggedInUser.name || loggedInUser.email) && (
              <p className="user-greeting">
                Welcome, <strong>{loggedInUser.name || loggedInUser.email}</strong>
              </p>
            )}
          </div>
        </section>

        {/* Filters and Search Section */}
        <section className="pharmacy-controls animate-on-scroll slide-up delay-100">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by order ID, item name, or patient name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="filter-buttons">
            <button
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All Orders
            </button>
            <button
              className={`filter-btn ${filter === 'delivered' ? 'active' : ''}`}
              onClick={() => setFilter('delivered')}
            >
              Delivered
            </button>
            <button
              className={`filter-btn ${filter === 'processing' ? 'active' : ''}`}
              onClick={() => setFilter('processing')}
            >
              Processing
            </button>
            <button
              className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              Pending
            </button>
            <button
              className={`filter-btn ${filter === 'cancelled' ? 'active' : ''}`}
              onClick={() => setFilter('cancelled')}
            >
              Cancelled
            </button>
          </div>
        </section>

        {/* Orders Grid */}
        <section className="orders-grid-section">
          {filteredOrders.length > 0 ? (
            <div className="orders-grid">
              {filteredOrders.map((order, index) => (
                <div
                  key={order.id || order._id}
                  className={`order-card animate-on-scroll slide-up delay-${(index % 3) * 100}`}
                >
                  {/* Order Header */}
                  <div className="order-card-header">
                    <div className="order-id">
                      <span className="id-label">Order ID</span>
                      <span className="id-value">{order.orderId}</span>
                    </div>
                    <div className={`status-badge status-${order.status}`}>
                      {order.status === 'delivered' && '✓ Delivered'}
                      {order.status === 'processing' && '⏳ Processing'}
                      {order.status === 'pending' && '⏸ Pending'}
                      {order.status === 'cancelled' && '✕ Cancelled'}
                    </div>
                  </div>

                  {/* Order Body */}
                  <div className="order-card-body">
                    <div className="order-meta">
                      <div className="meta-item">
                        <span className="meta-icon">📅</span>
                        <div>
                          <span className="meta-label">Order Date</span>
                          <span className="meta-value">{formatDate(order.orderDate)}</span>
                        </div>
                      </div>
                      {order.deliveryDate && (
                        <div className="meta-item">
                          <span className="meta-icon">🚚</span>
                          <div>
                            <span className="meta-label">Delivery Date</span>
                            <span className="meta-value">{formatDate(order.deliveryDate)}</span>
                          </div>
                        </div>
                      )}
                      <div className="meta-item">
                        <span className="meta-icon">💰</span>
                        <div>
                          <span className="meta-label">Total Amount</span>
                          <span className="meta-value">₹{order.totalAmount}</span>
                        </div>
                      </div>
                      <div className="meta-item">
                        <span className="meta-icon">💳</span>
                        <div>
                          <span className="meta-label">Payment</span>
                          <span className={`meta-value payment-${order.paymentStatus}`}>
                            {order.paymentStatus === 'paid' ? '✓ Paid' : order.paymentStatus === 'refunded' ? '↩ Refunded' : '⏳ Pending'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="order-items">
                      <h4>Items ({order.items.length})</h4>
                      <div className="items-list">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="item-row">
                            <div className="item-info">
                              <span className="item-name">{item.name}</span>
                              <span className="item-quantity">Qty: {item.quantity}</span>
                            </div>
                            <span className="item-price">₹{item.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Delivery Address */}
                    {order.deliveryAddress && (
                      <div className="delivery-address">
                        <span className="address-icon">📍</span>
                        <span className="address-text">{order.deliveryAddress}</span>
                      </div>
                    )}
                  </div>

                  {/* Order Footer */}
                  <div className="order-card-footer">
                    {order.status === 'delivered' && (
                      <button
                        className="btn btn-primary"
                        onClick={() => alert(`Reordering ${order.orderId}...`)}
                      >
                        Reorder
                      </button>
                    )}
                    {order.status === 'processing' && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => alert(`Tracking order ${order.orderId}...`)}
                      >
                        Track Order
                      </button>
                    )}
                    {order.status === 'pending' && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => alert(`Order ${order.orderId} is pending confirmation...`)}
                      >
                        View Details
                      </button>
                    )}
                    {order.status === 'cancelled' && (
                      <button
                        className="btn btn-secondary"
                        disabled
                      >
                        Order Cancelled
                      </button>
                    )}
                  </div>

                  {/* Card Hover Effect */}
                  <div className="card-hover-effect"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-orders-found animate-on-scroll fade-in">
              <div className="empty-state">
                <div className="empty-icon">💊</div>
                <h3>No Orders Found</h3>
                <p>
                  {searchTerm || filter !== 'all'
                    ? 'No orders match your search criteria. Try adjusting your filters.'
                    : 'You don\'t have any pharmacy orders yet. Your orders will appear here once you make a purchase.'}
                </p>
                {(searchTerm || filter !== 'all') && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setSearchTerm('');
                      setFilter('all');
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* CTA Section */}
        {filteredOrders.length > 0 && (
          <section className="pharmacy-cta animate-on-scroll fade-in">
            <div className="cta-card">
              <h2>Need to Order Medications?</h2>
              <p>Browse our pharmacy catalog and place your order online.</p>
              <button className="btn btn-white">Browse Pharmacy</button>
            </div>
          </section>
        )}

      </div>
    </div>
  );
};

export default Pharmacy;

