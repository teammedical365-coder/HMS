import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patientAPI, clinicAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
    FiArrowLeft, 
    FiCalendar, 
    FiDownload, 
    FiMail, 
    FiPhone, 
    FiActivity, 
    FiDollarSign, 
    FiTrash2, 
    FiPlus, 
    FiUserCheck, 
    FiAlertCircle, 
    FiFileText, 
    FiMapPin 
} from 'react-icons/fi';
import './ClinicPatientProfile.css';

import AppointmentReports from '../../components/AppointmentReports';

const ClinicPatientProfile = () => {
    const { id: patientId } = useParams();
    const navigate = useNavigate();

    // Data States
    const [patientData, setPatientData] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('timeline');

    // Report upload states
    const [file, setFile] = useState(null);
    const [reportName, setReportName] = useState('');
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (patientId) {
            fetchProfile();
        }
    }, [patientId]);

    const fetchProfile = async () => {
        setLoading(true);
        try {
            const res = await patientAPI.getFullHistory(patientId);
            if (res.success) {
                setPatientData(res.user);
                setTimeline(res.timeline || []);
            } else {
                setError(res.message || 'Failed to load profile data.');
            }
        } catch (err) {
            console.error(err);
            setError('An error occurred while fetching the profile.');
        } finally {
            setLoading(false);
        }
    };

    const getReportUrl = (filename) => {
        if (!filename) return '';
        const isAbsolute = filename.startsWith('http://') || filename.startsWith('https://');
        return isAbsolute ? filename : `/api/patients/reports/${encodeURIComponent(filename)}`;
    };

    // Calculate Metrics
    const calculateMetrics = () => {
        const appointments = timeline.filter(t => t.type === 'appointment') || [];
        const completed = appointments.filter(a => a.data?.status === 'completed');
        const upcoming = appointments.filter(a => {
            const status = a.data?.status;
            const date = new Date(a.date);
            const today = new Date();
            today.setHours(0,0,0,0);
            return (status === 'pending' || status === 'confirmed') && date >= today;
        });

        let totalPaid = 0;
        let pendingDues = 0;

        appointments.forEach(a => {
            const amt = a.data?.amount || 0;
            const pStatus = (a.data?.paymentStatus || '').toLowerCase();
            if (pStatus === 'paid') {
                totalPaid += amt;
            } else if (pStatus === 'pending') {
                pendingDues += amt;
            }
        });

        return {
            totalVisits: appointments.length,
            upcomingCount: upcoming.length,
            totalPaid,
            pendingDues
        };
    };

    const handleUploadReport = async (e) => {
        e.preventDefault();
        if (!file || !reportName.trim()) {
            alert('Please select a file and enter a report name.');
            return;
        }
        setUploading(true);
        try {
            const res = await clinicAPI.uploadPatientReport(patientData._id, file, reportName.trim());
            if (res.success) {
                alert('Report uploaded successfully!');
                setFile(null);
                setReportName('');
                fetchProfile();
            } else {
                alert(res.message || 'Failed to upload report.');
            }
        } catch (err) {
            console.error(err);
            alert('Error uploading report.');
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteReport = async (reportId) => {
        if (!window.confirm('Are you sure you want to delete this report?')) return;
        try {
            const res = await clinicAPI.deletePatientReport(patientData._id, reportId);
            if (res.success) {
                alert('Report deleted successfully!');
                fetchProfile();
            } else {
                alert(res.message || 'Failed to delete report.');
            }
        } catch (err) {
            console.error(err);
            alert('Error deleting report.');
        }
    };

    // Export PDF Profile summary
    const handleDownloadPDF = () => {
        if (!patientData) return;
        const doc = new jsPDF();
        
        // Title banner
        doc.setFillColor(99, 102, 241);
        doc.rect(0, 0, 210, 40, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(255, 255, 255);
        doc.text("CLINIC PATIENT PROFILE SUMMARY", 15, 26);

        // Patient details box
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Patient Name:", 15, 55);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.name || '—', 50, 55);

        doc.setFont("helvetica", "bold");
        doc.text("Patient UID (MRN):", 15, 63);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.patientUid || '—', 50, 63);

        doc.setFont("helvetica", "bold");
        doc.text("Phone Number:", 15, 71);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.phone || '—', 50, 71);

        doc.setFont("helvetica", "bold");
        doc.text("Blood Group:", 115, 55);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.bloodGroup || '—', 150, 55);

        doc.setFont("helvetica", "bold");
        doc.text("Gender / DOB:", 115, 63);
        doc.setFont("helvetica", "normal");
        doc.text(`${patientData.gender || '—'} / ${patientData.dob ? new Date(patientData.dob).toLocaleDateString('en-IN') : '—'}`, 150, 63);

        doc.setFont("helvetica", "bold");
        doc.text("Allergies:", 115, 71);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.allergies || 'None', 150, 71);

        // Vitals box
        doc.setFillColor(248, 250, 252);
        doc.rect(15, 80, 180, 26, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(99, 102, 241);
        doc.text("LATEST RECORDED VITALS", 20, 88);
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "normal");
        
        const vitals = patientData.vitals || {};
        doc.text(`Weight: ${vitals.weight || '—'} kg`, 20, 98);
        doc.text(`Height: ${vitals.height || '—'} cm`, 65, 98);
        doc.text(`BP: ${vitals.bloodPressure || '—'}`, 110, 98);
        doc.text(`Pulse: ${vitals.pulse || '—'} bpm`, 150, 98);

        // Visits table
        const appointments = timeline.filter(t => t.type === 'appointment');
        const rows = appointments.map(a => [
            new Date(a.date).toLocaleDateString('en-IN'),
            a.data?.doctorName || 'Not Assigned',
            a.data?.diagnosis || '—',
            a.data?.notes || '—',
            a.data?.status || 'Pending'
        ]);

        autoTable(doc, {
            startY: 115,
            head: [['Date', 'Doctor', 'Diagnosis', 'Consultation Notes', 'Status']],
            body: rows,
            headStyles: { fillColor: [99, 102, 241] },
            theme: 'striped',
            margin: { horizontal: 15 }
        });

        doc.save(`Patient_Profile_${patientData.patientUid || 'summary'}.pdf`);
    };

    if (loading) {
        return (
            <div className="cpp-loading-screen">
                <div className="cpp-spinner"></div>
                <p>Loading patient history details...</p>
            </div>
        );
    }

    if (error || !patientData) {
        return (
            <div className="cpp-loading-screen">
                <FiAlertCircle size={48} color="#ef4444" />
                <p>{error || 'Patient profile not found.'}</p>
                <button className="cpp-btn-download" onClick={() => navigate(-1)} style={{ background: '#64748b' }}>
                    <FiArrowLeft /> Go Back
                </button>
            </div>
        );
    }

    const metrics = calculateMetrics();
    const vitals = patientData.vitals || {};
    const relative = patientData.relatives?.[0] || {};

    // Get unique medicines
    const getMedicinesList = () => {
        const list = [];
        timeline.filter(t => t.type === 'appointment').forEach(appt => {
            const meds = appt.data?.pharmacy || [];
            meds.forEach(m => {
                list.push({
                    name: m.medicineName,
                    salt: m.saltName,
                    frequency: m.frequency,
                    duration: m.duration,
                    date: appt.date
                });
            });
        });
        return list;
    };
    const medicinesList = getMedicinesList();

    // Get invoices
    const getInvoicesList = () => {
        return timeline
            .filter(t => t.type === 'appointment' && t.data?.amount > 0)
            .map(t => ({
                id: t.data?._id,
                date: t.date,
                amount: t.data?.amount,
                method: t.data?.paymentMethod || 'Cash',
                status: t.data?.paymentStatus || 'Pending'
            }));
    };
    const invoicesList = getInvoicesList();

    return (
        <div className="cpp-container">
            {/* Header Identity Card */}
            <div className="cpp-header-card">
                <div className="cpp-identity">
                    <div className="cpp-avatar">
                        {(patientData.name || 'P')[0].toUpperCase()}
                    </div>
                    <div className="cpp-info">
                        <h1>{patientData.name}</h1>
                        <div className="cpp-tags">
                            <span className="cpp-tag cpp-tag-primary">UID: {patientData.patientUid}</span>
                            <span className="cpp-tag">📱 {patientData.phone}</span>
                            <span className="cpp-tag">🩸 Blood: {patientData.bloodGroup || '—'}</span>
                            <span className="cpp-tag">👤 {patientData.gender}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="cpp-btn-download" onClick={() => navigate(-1)} style={{ background: '#64748b' }}>
                        <FiArrowLeft /> Back
                    </button>
                    <button className="cpp-btn-download" onClick={handleDownloadPDF}>
                        <FiDownload /> Export Summary
                    </button>
                </div>
            </div>

            {/* Quick Metrics Cards Grid */}
            <div className="cpp-metrics">
                <div className="cpp-metric-card metric-visits">
                    <div className="cpp-metric-info">
                        <span className="cpp-metric-label">Total Visits</span>
                        <span className="cpp-metric-val">{metrics.totalVisits}</span>
                    </div>
                    <div className="cpp-metric-icon"><FiUserCheck /></div>
                </div>
                <div className="cpp-metric-card metric-upcoming">
                    <div className="cpp-metric-info">
                        <span className="cpp-metric-label">Upcoming</span>
                        <span className="cpp-metric-val">{metrics.upcomingCount}</span>
                    </div>
                    <div className="cpp-metric-icon"><FiCalendar /></div>
                </div>
                <div className="cpp-metric-card metric-paid">
                    <div className="cpp-metric-info">
                        <span className="cpp-metric-label">Total Paid</span>
                        <span className="cpp-metric-val">₹{metrics.totalPaid.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="cpp-metric-icon"><FiDollarSign /></div>
                </div>
                <div className="cpp-metric-card metric-pending">
                    <div className="cpp-metric-info">
                        <span className="cpp-metric-label">Pending Dues</span>
                        <span className="cpp-metric-val">₹{metrics.pendingDues}</span>
                    </div>
                    <div className="cpp-metric-icon"><FiAlertCircle /></div>
                </div>
            </div>

            {/* Sidebar and content grid */}
            <div className="cpp-content-grid">
                
                {/* Left Sidebar Columns */}
                <div className="cpp-sidebar">
                    {/* Patient Information Card */}
                    <div className="cpp-card">
                        <h3 className="cpp-card-title"><FiUserCheck /> Demographics</h3>
                        <div className="cpp-details-list">
                            <div className="cpp-detail-item">
                                <span className="cpp-detail-lbl">Full Name</span>
                                <span className="cpp-detail-val">{patientData.name}</span>
                            </div>
                            <div className="cpp-detail-item">
                                <span className="cpp-detail-lbl">Email Address</span>
                                <span className="cpp-detail-val">{patientData.email || 'No email registered'}</span>
                            </div>
                            <div className="cpp-detail-item">
                                <span className="cpp-detail-lbl">Date of Birth</span>
                                <span className="cpp-detail-val">
                                    {patientData.dob ? new Date(patientData.dob).toLocaleDateString('en-IN') : '—'}
                                </span>
                            </div>
                            <div className="cpp-detail-item">
                                <span className="cpp-detail-lbl">Address</span>
                                <span className="cpp-detail-val">{patientData.address || '—'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Medical Alert Profile Card */}
                    <div className="cpp-card">
                        <h3 className="cpp-card-title" style={{ color: '#f59e0b' }}><FiAlertCircle /> Clinical Profile</h3>
                        <div className="cpp-details-list">
                            <div className="cpp-detail-item">
                                <span className="cpp-detail-lbl">Allergies</span>
                                <span className="cpp-detail-val" style={{ color: patientData.allergies ? '#ef4444' : 'inherit' }}>
                                    {patientData.allergies || 'No allergies recorded'}
                                </span>
                            </div>
                            <div className="cpp-detail-item">
                                <span className="cpp-detail-lbl">Chronic Conditions</span>
                                <span className="cpp-detail-val">
                                    {patientData.chronicConditions || 'No chronic conditions'}
                                </span>
                            </div>
                            <div className="cpp-detail-item">
                                <span className="cpp-detail-lbl">Clinical Notes / Intake</span>
                                <span className="cpp-detail-val">
                                    {patientData.medicalNotes || 'No notes added'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Emergency Contacts Card */}
                    <div className="cpp-card">
                        <h3 className="cpp-card-title"><FiPhone /> Emergency Contacts</h3>
                        {relative.name ? (
                            <div className="cpp-details-list">
                                <div className="cpp-detail-item">
                                    <span className="cpp-detail-lbl">Contact Name</span>
                                    <span className="cpp-detail-val">{relative.name}</span>
                                </div>
                                <div className="cpp-detail-item">
                                    <span className="cpp-detail-lbl">Relationship</span>
                                    <span className="cpp-detail-val">{relative.relation || 'Relative'}</span>
                                </div>
                                <div className="cpp-detail-item">
                                    <span className="cpp-detail-lbl">Phone Number</span>
                                    <span className="cpp-detail-val">{relative.phone}</span>
                                </div>
                            </div>
                        ) : (
                            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>No emergency relative registered.</p>
                        )}
                    </div>
                </div>

                {/* Right Panel Main Contents */}
                <div className="cpp-main-panel">
                    
                    {/* Horizontal Nav Tabs */}
                    <div className="cpp-tabs-bar">
                        <button 
                            className={`cpp-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                            onClick={() => setActiveTab('timeline')}
                        >
                            📋 Visits History ({timeline.length})
                        </button>
                        <button 
                            className={`cpp-tab-btn ${activeTab === 'medicines' ? 'active' : ''}`}
                            onClick={() => setActiveTab('medicines')}
                        >
                            💊 Medicines ({medicinesList.length})
                        </button>
                        <button 
                            className={`cpp-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
                            onClick={() => setActiveTab('reports')}
                        >
                            🧪 Lab Reports ({patientData.reports?.length || 0})
                        </button>
                        <button 
                            className={`cpp-tab-btn ${activeTab === 'billing' ? 'active' : ''}`}
                            onClick={() => setActiveTab('billing')}
                        >
                            💰 Financials ({invoicesList.length})
                        </button>
                    </div>

                    {/* Tab Panels */}
                    {activeTab === 'timeline' && (
                        <div className="cpp-card">
                            <h3 className="cpp-card-title"><FiFileText /> Visit Consultation Log</h3>
                            {timeline.length === 0 ? (
                                <div className="cpp-empty-state">No consult history logs recorded for this patient.</div>
                            ) : (
                                <div className="cpp-timeline">
                                    {timeline.map((item, idx) => {
                                        const dateStr = new Date(item.date).toLocaleDateString('en-IN', {
                                            day: '2-digit', month: 'short', year: 'numeric'
                                        });
                                        const timeStr = item.data?.appointmentTime || '';
                                        const diag = item.data?.diagnosis || 'No diagnosis logged';
                                        const status = item.data?.status || 'pending';
                                        
                                        return (
                                            <div key={idx} className="cpp-timeline-item">
                                                <div className="cpp-tl-head">
                                                    <div className="cpp-tl-meta">
                                                        <span className="cpp-tl-date">{dateStr} {timeStr && `• ${timeStr}`}</span>
                                                        <span className="cpp-tl-doctor">Dr. {item.data?.doctorName || 'Not Assigned'}</span>
                                                    </div>
                                                    <span className={`cpp-tl-badge badge-${status.toLowerCase()}`}>
                                                        {status}
                                                    </span>
                                                </div>
                                                <div className="cpp-tl-body">
                                                    <div className="cpp-tl-section">
                                                        <span className="cpp-tl-lbl">Diagnosis</span>
                                                        <span className="cpp-tl-val" style={{ fontWeight: '700' }}>{diag}</span>
                                                    </div>
                                                    {item.data?.notes && (
                                                        <div className="cpp-tl-section">
                                                            <span className="cpp-tl-lbl">Intake symptoms</span>
                                                            <span className="cpp-tl-val">{item.data?.notes}</span>
                                                        </div>
                                                    )}
                                                    {item.data?.doctorNotes && (
                                                        <div className="cpp-tl-section">
                                                            <span className="cpp-tl-lbl">Consultation notes</span>
                                                            <span className="cpp-tl-val">{item.data?.doctorNotes}</span>
                                                        </div>
                                                    )}
                                                    {/* Vitals summary */}
                                                    {item.data?.vitals && Object.values(item.data.vitals).some(Boolean) && (
                                                        <div className="cpp-tl-section">
                                                            <span className="cpp-tl-lbl">Consult Vitals</span>
                                                            <div className="cpp-tl-vitals">
                                                                {item.data.vitals.weight && <span className="cpp-tl-vital-pill">⚖️ Weight: {item.data.vitals.weight}kg</span>}
                                                                {item.data.vitals.height && <span className="cpp-tl-vital-pill">📏 Height: {item.data.vitals.height}cm</span>}
                                                                {item.data.vitals.bp && <span className="cpp-tl-vital-pill">🩸 BP: {item.data.vitals.bp}</span>}
                                                                {item.data.vitals.temperature && <span className="cpp-tl-vital-pill">🌡️ Temp: {item.data.vitals.temperature}°F</span>}
                                                                {item.data.vitals.pulse && <span className="cpp-tl-vital-pill">💓 Pulse: {item.data.vitals.pulse}</span>}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Reports & Prescriptions for this Appointment */}
                                                    <div className="cpp-tl-section" style={{ marginTop: '12px' }}>
                                                        <AppointmentReports appointmentId={item.data?._id} prescriptions={item.data?.prescriptions} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'medicines' && (
                        <div className="cpp-card">
                            <h3 className="cpp-card-title"><FiActivity /> Prescribed Medicines Log</h3>
                            {medicinesList.length === 0 ? (
                                <div className="cpp-empty-state">No prescribed medicines logs found.</div>
                            ) : (
                                <div className="cpp-table-wrap">
                                    <table className="cpp-table">
                                        <thead>
                                            <tr>
                                                <th>Date Prescribed</th>
                                                <th>Medicine Name</th>
                                                <th>Dosage / Salt</th>
                                                <th>Frequency</th>
                                                <th>Duration</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {medicinesList.map((med, idx) => (
                                                <tr key={idx}>
                                                    <td><strong>{new Date(med.date).toLocaleDateString('en-IN')}</strong></td>
                                                    <td style={{ color: 'var(--cpp-primary)', fontWeight: '700' }}>{med.name}</td>
                                                    <td>{med.salt || '—'}</td>
                                                    <td><span style={{ background: 'var(--cpp-secondary-light)', color: 'var(--cpp-secondary)', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>{med.frequency}</span></td>
                                                    <td>{med.duration}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'reports' && (
                        <div className="cpp-card">
                            <h3 className="cpp-card-title"><FiFileText /> Uploaded Documents & Reports</h3>
                            
                            {/* Upload form */}
                            <form onSubmit={handleUploadReport} className="cpp-report-upload-box">
                                <span className="cpp-tl-lbl" style={{ alignSelf: 'flex-start' }}>Upload new lab report</span>
                                <input 
                                    type="text" 
                                    className="cpp-report-input" 
                                    placeholder="e.g. Blood Test, Chest X-Ray" 
                                    value={reportName}
                                    onChange={e => setReportName(e.target.value)}
                                />
                                <input 
                                    type="file" 
                                    className="cpp-report-input" 
                                    onChange={e => setFile(e.target.files[0])}
                                />
                                <button className="cpp-btn-upload" type="submit" disabled={uploading}>
                                    {uploading ? 'Uploading...' : 'Add Document'}
                                </button>
                            </form>

                            {/* Reports list */}
                            {(!patientData.reports || patientData.reports.length === 0) ? (
                                <div className="cpp-empty-state">No reports uploaded yet.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {patientData.reports.map((rep, idx) => (
                                        <div key={idx} className="cpp-report-row">
                                            <div className="cpp-report-info" onClick={() => window.open(getReportUrl(rep.filename), '_blank')}>
                                                <span className="cpp-report-name">{rep.name}</span>
                                                <span className="cpp-report-date">{new Date(rep.uploadedAt).toLocaleString('en-IN')}</span>
                                            </div>
                                            <div className="cpp-report-actions">
                                                <button className="cpp-btn-icon-del" onClick={() => handleDeleteReport(rep._id)}>
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'billing' && (
                        <div className="cpp-card">
                            <h3 className="cpp-card-title"><FiDollarSign /> Consultation Financial Details</h3>
                            {invoicesList.length === 0 ? (
                                <div className="cpp-empty-state">No billing details logged yet.</div>
                            ) : (
                                <div className="cpp-table-wrap">
                                    <table className="cpp-table">
                                        <thead>
                                            <tr>
                                                <th>Billing Date</th>
                                                <th>Amount</th>
                                                <th>Payment Method</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoicesList.map((inv, idx) => (
                                                <tr key={idx}>
                                                    <td><strong>{new Date(inv.date).toLocaleDateString('en-IN')}</strong></td>
                                                    <td style={{ color: '#10b981', fontWeight: '800' }}>₹{inv.amount}</td>
                                                    <td>{inv.method}</td>
                                                    <td>
                                                        <span className={`cpp-tl-badge badge-${inv.status.toLowerCase()}`}>
                                                            {inv.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClinicPatientProfile;
