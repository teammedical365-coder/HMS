// client/src/pages/user/LabReports.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector, useAuth } from '../../store/hooks';
import { fetchMyLabReports } from '../../store/slices/labSlice';
import './LabReports.css';

const LabReports = () => {
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { requests: reports, loading } = useAppSelector((state) => state.lab);

  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    dispatch(fetchMyLabReports());
  }, [dispatch]);

  const handleDownload = (url, fileName) => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'Lab_Report.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredReports = reports.filter(report => {
    const matchesStatus = filter === 'all' || 
      (filter === 'completed' && report.testStatus === 'DONE') ||
      (filter === 'pending' && report.testStatus === 'PENDING') ||
      (filter === 'pending' && report.testStatus === 'IN_PROGRESS');

    const matchesSearch = 
      report.testNames?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())) ||
      report.doctorId?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  if (loading && reports.length === 0) {
    return <div className="loading-state"><div className="loading-spinner"></div><p>Fetching your medical records...</p></div>;
  }

  return (
    <div className="lab-reports-page">
      <div className="content-wrapper">
        <section className="reports-header animate-on-scroll slide-up visible">
          <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
          <div className="header-content">
            <span className="badge">Patient Lab Portal</span>
            <h1>Your <span className="text-gradient">Medical Reports</span></h1>
            <p className="user-greeting">Welcome, <strong>{user?.name}</strong></p>
          </div>
        </section>

        <section className="reports-controls animate-on-scroll slide-up visible">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by test name or doctor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="filter-buttons">
            {['all', 'completed', 'pending'].map(f => (
              <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="reports-grid-section">
          {filteredReports.length > 0 ? (
            <div className="reports-grid">
              {filteredReports.map((report) => (
                <div key={report._id} className="report-card">
                  <div className="report-card-header">
                    <div className="report-id">
                      <span className="id-label">Test ID</span>
                      <span className="id-value">#{report._id.slice(-6).toUpperCase()}</span>
                    </div>
                    <div className={`status-badge status-${report.testStatus === 'DONE' ? 'completed' : 'pending'}`}>
                      {report.testStatus === 'DONE' ? '✓ Ready' : '⏳ ' + report.testStatus}
                    </div>
                  </div>

                  <div className="report-card-body">
                    <div className="patient-info">
                      <h3>{report.testNames?.join(', ')}</h3>
                      <p className="test-type">Prescribed by {report.doctorId?.name}</p>
                    </div>
                    <div className="report-meta">
                      <div className="meta-item">
                        <span className="meta-label">Date Requested</span>
                        <span className="meta-value">{new Date(report.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Payment</span>
                        <span className={`meta-value ${report.paymentStatus.toLowerCase()}`}>{report.paymentStatus}</span>
                      </div>
                    </div>
                  </div>

                  <div className="report-card-footer">
                    {report.testStatus === 'DONE' && report.reportFile?.url ? (
                      <button className="btn btn-primary" onClick={() => handleDownload(report.reportFile?.url, report.reportFile?.name)}>
                        Download PDF
                      </button>
                    ) : (
                      <button className="btn btn-secondary" disabled>Processing Results</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No Reports Found</h3>
              <p>Your diagnostic records will appear here once requested or processed.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default LabReports;