import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchLabRequests } from '../../store/slices/labSlice';
import { 
  FaSearch, FaFilePdf, FaCheckCircle, FaUserInjured, FaUserMd, 
  FaCalendarCheck, FaDownload, FaEye, FaVial, FaPrint 
} from 'react-icons/fa';
import './CompletedReports.css';

/**
 * CompletedReports Component
 * Displays an archive of all finished lab tests with export options.
 */
const CompletedReports = () => {
  const dispatch = useAppDispatch();
  const { requests, loading } = useAppSelector((state) => state.lab);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Fetch only completed requests on component mount
  useEffect(() => {
    dispatch(fetchLabRequests('completed'));
  }, [dispatch]);

  // --- 1. View Logic ---
  const handleView = (url) => {
    if (!url) return;
    window.open(url, '_blank', 'noreferrer');
  };

  // --- 2. Download Logic ---
  const handleDownload = async (url, fileName) => {
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName || 'lab-report.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  // --- 3. Persistent Printing System ---
  const handlePrint = async (url) => {
    if (!url) return;
    try {
      // Fetch file as blob to handle CORS for printing
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = blobUrl;

      const cleanup = () => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
        URL.revokeObjectURL(blobUrl);
      };

      document.body.appendChild(iframe);
      
      iframe.onload = () => {
        iframe.contentWindow.focus();
        
        // Fix: Use onafterprint to ensure cleanup only happens AFTER dialog is closed
        iframe.contentWindow.onafterprint = cleanup;
        
        iframe.contentWindow.print();
      };
    } catch (error) {
      console.error("Print failed, falling back to new tab:", error);
      window.open(url, '_blank');
    }
  };

  // --- Filter Logic ---
  const filteredReports = requests.filter(report => {
    const matchesSearch = 
      report.userId?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.testNames?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Filtering based on completion date (updatedAt)
    const matchesDate = filterDate ? report.updatedAt?.startsWith(filterDate) : true;

    return matchesSearch && matchesDate;
  });

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="report-page-container">
      <header className="report-header">
        <div className="header-title">
          <h1><FaCheckCircle className="header-icon"/> Completed Reports</h1>
          <p>Full archive of diagnostic results and patient files.</p>
        </div>
        
        <div className="header-controls">
          <div className="search-group">
            <FaSearch className="search-icon"/>
            <input 
              type="text" 
              placeholder="Search patient or test name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="date-filter">
            <input 
              type="date" 
              value={filterDate} 
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="lab-loading">
          <div className="spinner"></div>
          <p>Loading records...</p>
        </div>
      ) : (
        <div className="reports-grid">
          {filteredReports.length === 0 ? (
            <div className="empty-state">
              <h3>No reports found</h3>
              <p>Try different search terms or clear your date filter.</p>
            </div>
          ) : (
            filteredReports.map((report) => (
              <div key={report._id} className="report-card">
                <div className="card-top">
                  <div className="patient-meta">
                    <span className="id-badge">ID: {report.patientId}</span>
                    <span className="date-meta"><FaCalendarCheck/> {formatDate(report.updatedAt)}</span>
                  </div>
                  <div className="status-pill success">COMPLETED</div>
                </div>

                <div className="card-main">
                  <div className="info-block">
                    <label><FaUserInjured/> Patient</label>
                    <h3>{report.userId?.name}</h3>
                  </div>
                  <div className="info-block">
                    <label><FaUserMd/> Requesting Doctor</label>
                    <p>{report.doctorId?.name}</p>
                  </div>
                  
                  <div className="tests-block">
                    <label><FaVial/> Conducted Tests</label>
                    <div className="test-tags">
                      {report.testNames?.map((test, i) => (
                        <span key={i}>{test}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {report.reportFile && (
                  <div className="file-preview">
                    <div className="file-icon"><FaFilePdf/></div>
                    <div className="file-info">
                      <span className="filename">{report.reportFile.name}</span>
                      <span className="filesize">Digital Report Ready</span>
                    </div>
                  </div>
                )}

                <div className="card-actions">
                  <button className="btn-action secondary" onClick={() => handleView(report.reportFile?.url)}>
                    <FaEye/> View
                  </button>
                  <button className="btn-action primary" onClick={() => handleDownload(report.reportFile?.url, report.reportFile?.name)}>
                    <FaDownload/> Download
                  </button>
                  <button className="btn-action print" onClick={() => handlePrint(report.reportFile?.url)}>
                    <FaPrint/> Print
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CompletedReports;