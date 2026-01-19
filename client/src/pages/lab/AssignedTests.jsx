import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchLabRequests, uploadLabReport, clearLabErrors, updateLabPayment } from '../../store/slices/labSlice';
import { 
  FaSearch, FaFilter, FaUserInjured, FaUserMd, FaVial, FaFileMedical, 
  FaCloudUploadAlt, FaTimes, FaCheckCircle, FaCalendarAlt, FaNotesMedical, 
  FaMoneyBillWave, FaCreditCard 
} from 'react-icons/fa';
import './AssignedTests.css';

const AssignedTests = () => {
  const dispatch = useAppDispatch();
  const { requests, loading, error, uploadSuccess } = useAppSelector((state) => state.lab);
  
  // Local State for standard form fields
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null); 
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // --- Local State for Payment Details ---
  const [paymentInfo, setPaymentInfo] = useState({
    status: 'PENDING',
    mode: 'NONE',
    amount: 0
  });

  useEffect(() => {
    dispatch(fetchLabRequests('pending'));
  }, [dispatch]);

  useEffect(() => {
    if (uploadSuccess) {
        closeModal();
        const timer = setTimeout(() => dispatch(clearLabErrors()), 3000);
        return () => clearTimeout(timer);
    }
  }, [uploadSuccess, dispatch]);

  // --- Filtering ---
  const filteredRequests = requests.filter(req => 
    req.userId?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.testNames?.some(test => test.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // --- Handlers ---
  const openModal = (request) => {
    setSelectedRequest(request);
    setNotes(request.notes || '');
    setSelectedFile(null);
    // Initialize payment info from the request object
    setPaymentInfo({
        status: request.paymentStatus || 'PENDING',
        mode: request.paymentMode || 'NONE',
        amount: request.amount || 0
    });
  };

  const closeModal = () => {
    setSelectedRequest(null);
    setNotes('');
    setSelectedFile(null);
  };

  // --- FIXED: Payload keys now match backend expectations ---
  const handlePaymentUpdate = async () => {
    const updatedStatus = paymentInfo.status === 'PAID' ? 'PENDING' : 'PAID';
    const updatedMode = updatedStatus === 'PAID' ? (paymentInfo.mode === 'NONE' ? 'CASH' : paymentInfo.mode) : 'NONE';
    
    // Construct payload with keys the backend expects (paymentStatus, paymentMode)
    const apiPayload = {
        paymentStatus: updatedStatus,
        paymentMode: updatedMode,
        amount: paymentInfo.amount
    };
    
    // Update backend
    await dispatch(updateLabPayment({ id: selectedRequest._id, paymentData: apiPayload }));
    
    // Update local state to keep UI in sync
    setPaymentInfo({
        ...paymentInfo,
        status: updatedStatus,
        mode: updatedMode
    });
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Logic: Block submission if no file OR if payment is not marked as PAID
    if (!selectedRequest || !selectedFile || paymentInfo.status !== 'PAID') return;

    const formData = new FormData();
    formData.append('reportFile', selectedFile);
    formData.append('notes', notes); 

    await dispatch(uploadLabReport({ id: selectedRequest._id, formData }));
  };

  // --- Helpers ---
  const getDoctorPrescription = (appointment) => {
    if (!appointment) return null;
    if (appointment.prescriptions?.length > 0) {
        const docDocs = appointment.prescriptions.filter(p => p.type !== 'lab_report');
        if (docDocs.length > 0) return docDocs[docDocs.length - 1]; 
    }
    if (appointment.prescription) {
        return { url: appointment.prescription, name: 'Prescription File' };
    }
    return null;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="lab">
      {/* --- Header Section --- */}
      <header className="lab-header">
        <div className="header-title">
          <h1><FaVial className="header-icon"/> Lab Requests</h1>
          <p>Manage pending tests and upload diagnostic reports</p>
        </div>
        
        <div className="header-actions">
          <div className="search-box">
            <FaSearch className="search-icon"/>
            <input 
              type="text" 
              placeholder="Search patient or test..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-badge">
            <FaFilter /> {filteredRequests.length} Pending
          </div>
        </div>
      </header>

      {/* --- Status Messages --- */}
      {uploadSuccess && <div className="lab-alert success"><FaCheckCircle/> {uploadSuccess}</div>}
      {error && <div className="lab-alert error"><FaTimes/> {error}</div>}

      {/* --- Content Grid --- */}
      {loading && !selectedRequest ? (
         <div className="lab-loading"><div className="spinner"></div><p>Fetching requests...</p></div>
      ) : (
        <div className="lab-grid">
          {filteredRequests.length === 0 ? (
            <div className="lab-empty-state">
                <img src="https://cdn-icons-png.flaticon.com/512/7486/7486744.png" alt="No Tasks" />
                <h3>All Caught Up!</h3>
                <p>There are no pending lab tests assigned to you right now.</p>
            </div>
          ) : (
            filteredRequests.map((req) => {
                const prescription = getDoctorPrescription(req.appointmentId);
                return (
                    <div key={req._id} className="lab-card">
                        <div className="card-header">
                            <span className={`payment-badge ${req.paymentStatus?.toLowerCase()}`}>
                                {req.paymentStatus}
                            </span>
                            <span className="date-badge"><FaCalendarAlt/> {formatDate(req.appointmentId?.appointmentDate)}</span>
                        </div>
                        
                        <div className="card-body">
                            <div className="info-row">
                                <div className="info-group">
                                    <label><FaUserInjured/> Patient</label>
                                    <h4>{req.userId?.name}</h4>
                                </div>
                                <div className="info-group">
                                    <label><FaMoneyBillWave/> Amount</label>
                                    <h4>₹{req.amount || 0}</h4>
                                </div>
                            </div>

                            <div className="test-list">
                                <label>Prescribed Tests:</label>
                                <div className="tags">
                                    {req.testNames?.map((test, i) => (
                                        <span key={i} className="test-tag">{test}</span>
                                    ))}
                                </div>
                            </div>

                            {prescription && (
                                <a href={prescription.url} target="_blank" rel="noreferrer" className="prescription-link">
                                    <FaFileMedical/> View Prescription
                                </a>
                            )}
                        </div>

                        <div className="card-footer">
                            <button className="btn-process" onClick={() => openModal(req)}>
                                Process & Upload Report
                            </button>
                        </div>
                    </div>
                );
            })
          )}
        </div>
      )}

      {/* --- Upload Modal --- */}
      {selectedRequest && (
        <div className="lab-modal-overlay" onClick={closeModal}>
          <div className="lab-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Processing Lab Request</h2>
              <button className="close-btn" onClick={closeModal}><FaTimes/></button>
            </div>
            
            <div className="modal-content">
              {/* --- Payment Verification Section --- */}
              <div className="payment-config-section">
                <h3><FaCreditCard/> Payment Verification</h3>
                <div className="payment-grid">
                    <div className="form-group">
                        <label>Total Charges (₹)</label>
                        <input 
                            type="number" 
                            value={paymentInfo.amount} 
                            onChange={(e) => setPaymentInfo({...paymentInfo, amount: Number(e.target.value)})}
                        />
                    </div>
                    <div className="form-group">
                        <label>Mode of Payment</label>
                        <select 
                            value={paymentInfo.mode} 
                            onChange={(e) => setPaymentInfo({...paymentInfo, mode: e.target.value})}
                        >
                            <option value="NONE">Select Mode</option>
                            <option value="CASH">Cash</option>
                            <option value="UPI">UPI / QR Code</option>
                            <option value="CARD">Card Payment</option>
                            <option value="ONLINE">Online Transfer</option>
                        </select>
                    </div>
                </div>
                <button 
                    type="button" 
                    className={`btn-payment-toggle ${paymentInfo.status === 'PAID' ? 'is-paid' : ''}`}
                    onClick={handlePaymentUpdate}
                >
                    {paymentInfo.status === 'PAID' ? 'Payment Verified' : 'Mark as Paid'}
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {/* Input: Notes */}
                <div className="form-group">
                    <label><FaNotesMedical/> Technician Observations</label>
                    <textarea 
                    style={{color:'black'}}
                        value={notes} 
                        onChange={(e) => setNotes(e.target.value)} 
                        placeholder="Add results summary or internal notes..."
                        rows="2"
                    ></textarea>
                </div>

                {/* Input: File Upload */}
                <div className="form-group">
                    <label><FaCloudUploadAlt/> Final Report (PDF/Image)</label>
                    <div 
                        className={`drop-zone ${dragActive ? 'active' : ''} ${selectedFile ? 'has-file' : ''}`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <input 
                            type="file" 
                            id="report-file" 
                            accept=".pdf,.jpg,.png,.jpeg" 
                            onChange={handleFileChange}
                            hidden
                        />
                        
                        {selectedFile ? (
                            <div className="file-info">
                                <FaFileMedical className="file-icon"/>
                                <span>{selectedFile.name}</span>
                                <button type="button" onClick={() => setSelectedFile(null)} className="remove-file">Change</button>
                            </div>
                        ) : (
                            <div className="upload-prompt">
                                <FaCloudUploadAlt className="upload-icon-large"/>
                                <p>Drag & Drop report here or <label htmlFor="report-file">Browse</label></p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-actions">
                    <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                    <button 
                        type="submit" 
                        className={`btn-submit ${loading ? 'loading' : ''}`}
                        disabled={!selectedFile || paymentInfo.status !== 'PAID' || loading}
                    >
                        {loading ? 'Uploading...' : 'Confirm & Sync Report'}
                    </button>
                </div>
                
                {/* Payment Warning */}
                {paymentInfo.status !== 'PAID' && (
                    <p className="payment-warning">Note: You must verify payment before the system allows syncing the report to the doctor.</p>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignedTests;