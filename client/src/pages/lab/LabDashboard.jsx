import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector, useAuth } from '../../store/hooks';
import { fetchLabStats, fetchLabRequests } from '../../store/slices/labSlice';
import { FaUserInjured, FaClock, FaCheckCircle, FaVial, FaHistory, FaExternalLinkAlt } from 'react-icons/fa';
import './LabDashboard.css';

const LabDashboard = () => {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { stats, requests, loading } = useAppSelector((state) => state.lab);

  useEffect(() => {
    // Fetch both counts and all requests (to filter recent ones)
    dispatch(fetchLabStats());
    dispatch(fetchLabRequests()); // Calling without status to get all for filtering
  }, [dispatch]);

  // --- Filter and Limit Lists ---
  const recentPending = requests
    .filter(req => req.testStatus === 'PENDING')
    .slice(0, 3);

  const recentCompleted = requests
    .filter(req => req.testStatus === 'DONE')
    .slice(0, 3);

  if (loading && !stats.total) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <p>Updating Lab Dashboard...</p>
      </div>
    );
  }

  // --- Helper to render request items ---
  const renderRequestList = (list, type) => {
    if (list.length === 0) {
      return (
        <div className="empty-state-small">
          <p>No recent {type} records found.</p>
        </div>
      );
    }

    return (
      <div className="dashboard-item-list">
        {list.map((req) => (
          <div key={req._id} className="dashboard-mini-card">
            <div className="mini-card-info">
              <div className="patient-name">
                <FaUserInjured className="icon-small" /> {req.userId?.name}
              </div>
              <div className="test-names">
                {req.testNames?.join(', ')}
              </div>
            </div>
            <div className="mini-card-meta">
              {type === 'pending' ? (
                <span className="status-indicator pending"><FaClock /> Waiting</span>
              ) : (
                <span className="status-indicator completed"><FaCheckCircle /> Done</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="dashboard-page">
      <div className="content-wrapper">
        
        <section className="dashboard-header animate-on-scroll slide-up">
          <div className="header-content">
            <span className="badge">Lab Portal</span>
            <h1>Welcome, <span className="text-gradient">{user?.name || 'Technician'}</span></h1>
            <p className="header-subtext">Quick overview of your diagnostic assignments.</p>
          </div>
        </section>

        <div className="dashboard-grid">
            
            {/* Recent Pending Section */}
            <div className="dashboard-column animate-on-scroll slide-up delay-100">
              <div className="column-header">
                <div className="column-icon"><FaVial /></div>
                <div>
                  <h2>Recent Pending</h2>
                  <p className="column-count">{stats.pending} Total Waiting</p>
                </div>
              </div>
              <div className="column-content">
                {renderRequestList(recentPending, 'pending')}
              </div>
              <div className="column-footer">
                <Link to="/lab/assigned-tests" className="view-all-link">
                  Manage All Pending <FaExternalLinkAlt />
                </Link>
              </div>
            </div>

            {/* Recent Completed Section */}
            <div className="dashboard-column animate-on-scroll slide-up delay-200">
              <div className="column-header">
                  <div className="column-icon"><FaHistory /></div>
                  <div>
                    <h2>Recent Completed</h2>
                    <p className="column-count">{stats.completed} Total History</p>
                  </div>
              </div>
              <div className="column-content">
                {renderRequestList(recentCompleted, 'completed')}
              </div>
              <div className="column-footer">
                <Link to="/lab/completed-reports" className="view-all-link">
                  View Full Archive <FaExternalLinkAlt />
                </Link>
              </div>
            </div>

            {/* Account & Profile Summary */}
            <div className="dashboard-column animate-on-scroll slide-up delay-300">
               <div className="column-header">
                  <div className="column-icon">👤</div>
                  <div>
                    <h2>Profile</h2>
                    <p className="column-count">Active Session</p>
                  </div>
              </div>
              <div className="column-content">
                  <div className="item-details" style={{padding: '10px'}}>
                      <p><strong>Name:</strong> {user?.name}</p>
                      <p><strong>Role:</strong> Lab Technician</p>
                      <p><strong>Contact:</strong> {user?.email}</p>
                      <p><strong>Total Managed:</strong> {stats.total}</p>
                  </div>
              </div>
            </div>

          </div>
      </div>
    </div>
  );
};

export default LabDashboard;