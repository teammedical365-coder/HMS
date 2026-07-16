import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { patientAPI, receptionAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
    FiArrowLeft, 
    FiDownload, 
    FiEdit3,
    FiPhone, 
    FiCalendar,
    FiActivity, 
    FiDollarSign, 
    FiAlertCircle, 
    FiFileText, 
    FiPlus,
    FiEye,
    FiCheckCircle,
    FiClock,
    FiFolder,
    FiShield,
    FiFile,
    FiUpload,
    FiX,
    FiTrash2,
    FiMapPin
} from 'react-icons/fi';
import './UnifiedPatientProfile.css';

import ClinicPatientProfile from './ClinicPatientProfile';

const HospitalPatientProfileContent = () => {
    const { id: patientId, department: deptParam } = useParams();
    const departmentParam = deptParam && deptParam !== 'undefined' ? deptParam : 'Unassigned';
    const navigate = useNavigate();

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    // Role check for Edit access (Only Reception/Admins can edit; Doctors see read-only + download)
    const userRole = String(currentUser.role || '').toLowerCase();
    const dynRole = String(currentUser._roleData?.name || '').toLowerCase();
    const permissions = currentUser._roleData?.permissions || [];
    const isReception = ['reception', 'receptionist', 'admin', 'hospitaladmin', 'superadmin', 'centraladmin', 'frontdesk'].includes(userRole) || 
                        ['reception', 'receptionist', 'admin', 'hospitaladmin', 'superadmin', 'centraladmin', 'frontdesk'].includes(dynRole) || 
                        permissions.includes('reception_access') || 
                        permissions.includes('*');

    // State
    const [patientData, setPatientData] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Consent & Document States
    const [consentList, setConsentList] = useState([]);
    const [consentFile, setConsentFile] = useState(null);
    const [uploadingConsent, setUploadingConsent] = useState(false);

    const [documentList, setDocumentList] = useState([]);
    const [_activeFollowups, setActiveFollowups] = useState([]);
    const [currentFollowupStatus, setCurrentFollowupStatus] = useState(null);
    const [searchParams] = useSearchParams();

    useEffect(() => {
        if (patientId) {
            fetchProfile();
            fetchConsentAndDocs();
            fetchFollowups();
        }
    }, [patientId, departmentParam]);

    const fetchFollowups = async () => {
        try {
            const targetDept = departmentParam || '';
            const res = await receptionAPI.getFollowupStatus(patientId, targetDept);
            if (res.success && res.activeFollowups) {
                setActiveFollowups(res.activeFollowups);
            }

            const resAuto = await receptionAPI.getFollowupStatus(patientId, 'auto');
            if (resAuto.success) {
                setCurrentFollowupStatus(resAuto);
            }
        } catch (err) {
            console.warn("Could not fetch followups:", err?.message);
        }
    };

    const fetchProfile = async () => {
        setLoading(true);
        try {
            const res = await patientAPI.getFullHistory(patientId, departmentParam);
            if (res.success && res.user) {
                setPatientData(res.user);
                setTimeline(res.timeline || []);

                const fp = res.user.fertilityProfile || {};
                if (Array.isArray(fp.consentForms) && fp.consentForms.length > 0) {
                    setConsentList(fp.consentForms);
                }
                const combinedDocs = [
                    ...(Array.isArray(fp.documents) ? fp.documents : []),
                    ...(Array.isArray(fp.previousReports) ? fp.previousReports.map(r => ({
                        fileName: r.fileName || r.name || 'Medical Report',
                        docType: r.docType || 'Medical Report',
                        url: r.url || r.fileUrl || r.filename,
                        uploadedAt: r.date || r.uploadedAt || new Date(),
                        fileId: r.fileId || r._id || null,
                        uploadedBy: 'Doctor'
                    })) : []),
                    ...(Array.isArray(fp.reports) ? fp.reports.map(r => ({
                        fileName: r.name || r.fileName || 'Medical Report',
                        docType: r.docType || 'Medical Report',
                        url: r.url || r.fileUrl || (r.filename ? ((r.filename || '').startsWith('http') ? r.filename : `/api/patients/reports/${encodeURIComponent(r.filename)}`) : null),
                        uploadedAt: r.uploadedAt || r.date || new Date(),
                        fileId: r.fileId || r._id || null,
                        uploadedBy: 'Doctor'
                    })) : [])
                ];
                const seen = new Set();
                const uniqueDocs = combinedDocs.filter(d => {
                    const key = d.url || d.fileName;
                    if (key && seen.has(key)) return false;
                    if (key) seen.add(key);
                    return true;
                });
                if (uniqueDocs.length > 0) {
                    setDocumentList(uniqueDocs);
                }
            } else {
                setError('Could not load patient details.');
            }
        } catch (err) {
            console.error("Error fetching patient profile:", err);
            setError('Failed to load patient profile or unauthorized access.');
        } finally {
            setLoading(false);
        }
    };

    const fetchConsentAndDocs = async () => {
        try {
            const consentRes = await patientAPI.getConsent(patientId);
            if (consentRes.success && Array.isArray(consentRes.consentForms)) {
                setConsentList(consentRes.consentForms);
            }
        } catch (err) {
            console.warn("Could not fetch separate consent list:", err?.message);
        }

        try {
            const docRes = await patientAPI.getDocuments(patientId, departmentParam);
            if (docRes.success && Array.isArray(docRes.documents)) {
                setDocumentList(docRes.documents);
            }
        } catch (err) {
            console.warn("Could not fetch separate document list:", err?.message);
        }
    };

    const handleConsentUpload = async (e) => {
        e.preventDefault();
        if (!consentFile || !patientData) return;

        setUploadingConsent(true);
        const formData = new FormData();
        formData.append('consentFile', consentFile);

        try {
            const res = await patientAPI.uploadConsent(patientData._id, formData);
            if (res.success && res.consent) {
                setConsentList(prev => [...prev, res.consent]);
                setConsentFile(null);
                // Reset file input
                const fileInput = document.getElementById('consent-file-input');
                if (fileInput) fileInput.value = '';
                alert('Consent form uploaded successfully!');
            } else {
                alert(res.message || 'Upload failed.');
            }
        } catch (err) {
            console.error("Consent upload error:", err);
            alert('Failed to upload consent form. Please try again.');
        } finally {
            setUploadingConsent(false);
        }
    };

    const handleDeleteConsent = async (index, fileId) => {
        if (!window.confirm('Are you sure you want to delete this consent form?')) return;
        try {
            const res = await patientAPI.deleteConsent(patientData._id, index, fileId);
            if (res.success) {
                setConsentList(prev => prev.filter((_, i) => i !== index));
            } else {
                alert(res.message || 'Failed to delete consent form.');
            }
        } catch (err) {
            console.error('Delete consent error:', err);
            alert('Failed to delete consent form.');
        }
    };

    const handleDeleteDocument = async (index, doc) => {
        if (!window.confirm('Are you sure you want to delete this report/document?')) return;
        const fileId = typeof doc === 'object' ? doc.fileId : doc;
        const url = typeof doc === 'object' ? doc.url : null;
        const fileName = typeof doc === 'object' ? doc.fileName : null;
        try {
            const res = await patientAPI.deleteDocument(patientData._id, index, fileId, url, fileName);
            if (res.success) {
                if (Array.isArray(res.documents)) {
                    setDocumentList(res.documents);
                } else {
                    setDocumentList(prev => prev.filter((_, i) => i !== index));
                }
            } else {
                alert(res.message || 'Failed to delete document.');
            }
        } catch (err) {
            console.error('Delete document error:', err);
            alert('Failed to delete report/document.');
        }
    };

    // Helper to check if appointment has expired based on date and time
    const isAppointmentExpired = (dateStr, timeStr) => {
        if (!dateStr) return false;
        const now = new Date();
        const apptDate = new Date(dateStr);
        if (isNaN(apptDate.getTime())) return false;

        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth();
        const nowDay = now.getDate();

        const apptYear = apptDate.getFullYear();
        const apptMonth = apptDate.getMonth();
        const apptDay = apptDate.getDate();

        const nowDateOnly = new Date(nowYear, nowMonth, nowDay).getTime();
        const apptDateOnly = new Date(apptYear, apptMonth, apptDay).getTime();

        if (apptDateOnly < nowDateOnly) return true;
        if (apptDateOnly > nowDateOnly) return false;

        if (!timeStr) {
            return false;
        }

        let hours = 0;
        let minutes = 0;
        const cleanTime = String(timeStr).trim().toUpperCase();
        
        const isPM = cleanTime.includes('PM');
        const isAM = cleanTime.includes('AM');
        const timeParts = cleanTime.replace(/[^\d:]/g, '').split(':');
        
        if (timeParts.length >= 1) {
            hours = parseInt(timeParts[0], 10) || 0;
            minutes = timeParts.length >= 2 ? (parseInt(timeParts[1], 10) || 0) : 0;
            
            if (isPM && hours < 12) {
                hours += 12;
            } else if (isAM && hours === 12) {
                hours = 0;
            }
        }

        const apptExactTime = new Date(nowYear, nowMonth, nowDay, hours, minutes, 0, 0).getTime();
        return apptExactTime <= now.getTime();
    };

    // Calculate Metrics
    const calculateMetrics = () => {
        const appointments = displayTimeline.filter(t => t.type === 'appointment' || t.type === 'clinicalVisit') || [];
        const upcoming = displayTimeline.filter(t => {
            if (t.type !== 'appointment') return false;
            const status = (t.data?.status || '').toLowerCase();
            if (status !== 'pending' && status !== 'confirmed' && status !== 'scheduled') return false;
            const apptTime = t.data?.appointmentTime || t.data?.visitTime || t.data?.time || '';
            return !isAppointmentExpired(t.date, apptTime);
        });

        let totalPaid = 0;
        let pendingDues = 0;

        timeline.forEach(t => {
            const amt = Number(t.data?.amount || t.data?.totalAmount || t.data?.fee || 0);
            if (!amt) return;
            const pStatus = (t.data?.paymentStatus || t.data?.status || '').toLowerCase();
            if (pStatus === 'paid' || pStatus === 'completed') {
                totalPaid += amt;
            } else if (pStatus === 'pending' || pStatus === 'due') {
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

    const handleDownloadPDF = () => {
        if (!patientData) return;
        const doc = new jsPDF();
        const fp = patientData.fertilityProfile || {};
        
        // Title banner
        doc.setFillColor(99, 102, 241);
        doc.rect(0, 0, 210, 42, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.setTextColor(255, 255, 255);
        doc.text("HOSPITAL PATIENT CLINICAL SUMMARY", 15, 26);

        // Demographics
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Patient Name:", 15, 54);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.name || '—', 50, 54);

        doc.setFont("helvetica", "bold");
        doc.text("MRN / Patient ID:", 15, 62);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.patientId || '—', 50, 62);

        doc.setFont("helvetica", "bold");
        doc.text("Contact Phone:", 15, 70);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.phone || '—', 50, 70);

        doc.setFont("helvetica", "bold");
        doc.text("Blood Group:", 115, 54);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.bloodGroup || '—', 150, 54);

        doc.setFont("helvetica", "bold");
        doc.text("Gender / DOB:", 115, 62);
        doc.setFont("helvetica", "normal");
        const dobStr = patientData.dob ? new Date(patientData.dob).toLocaleDateString('en-IN') : '—';
        doc.text(`${patientData.gender || '—'} / ${dobStr}`, 150, 62);

        doc.setFont("helvetica", "bold");
        doc.text("Known Allergies:", 115, 70);
        doc.setFont("helvetica", "normal");
        doc.text(fp.allergies || 'None', 150, 70);

        // Vitals Section
        doc.setFillColor(248, 250, 252);
        doc.rect(15, 80, 180, 24, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(99, 102, 241);
        doc.text("LATEST RECORDED CLINICAL VITALS", 20, 88);
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "normal");
        const vitals = fp.vitals || {};
        doc.text(`Weight: ${vitals.weight || '—'} kg`, 20, 97);
        doc.text(`Height: ${vitals.height || '—'} cm`, 65, 97);
        doc.text(`BP: ${vitals.bloodPressure || vitals.bp || '—'}`, 110, 97);
        doc.text(`Pulse: ${vitals.pulse || '—'} bpm`, 150, 97);

        // Timeline table
        const timelineRows = timeline.map(t => [
            new Date(t.date).toLocaleDateString('en-IN'),
            t.type.toUpperCase(),
            t.data?.doctorName || t.data?.doctorConsultation?.doctorId || 'Staff',
            t.summary?.primaryComplaint || t.data?.serviceName || t.data?.title || t.data?.testName || 'Clinical Event',
            t.data?.status || t.data?.paymentStatus || 'Recorded'
        ]);

        autoTable(doc, {
            startY: 112,
            head: [['Date', 'Event Type', 'Provider', 'Description / Diagnosis', 'Status']],
            body: timelineRows,
            theme: 'grid',
            headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255] },
            styles: { fontSize: 9 }
        });

        doc.save(`Patient_Profile_${patientData.patientId || 'MRN'}.pdf`);
    };

    if (loading) {
        return (
            <div className="upp-container">
                <div className="upp-loading-screen">
                    <div className="upp-spinner"></div>
                    <p>Loading Hospital Patient Profile...</p>
                </div>
            </div>
        );
    }

    if (error || !patientData) {
        return (
            <div className="upp-container">
                <div className="upp-top-nav">
                    <button className="upp-back-btn" onClick={() => navigate(-1)}>
                        <FiArrowLeft /> Back
                    </button>
                </div>
                <div className="upp-empty-state" style={{ marginTop: '40px' }}>
                    <FiAlertCircle style={{ fontSize: '36px', color: 'var(--upp-danger)', marginBottom: '12px' }} />
                    <h3 style={{ margin: '0 0 8px 0' }}>Unable to access profile</h3>
                    <p style={{ margin: 0 }}>{error || 'Patient record could not be retrieved.'}</p>
                </div>
            </div>
        );
    }

    const initials = (patientData.name || 'P').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    // Compute age (checking registration age first, then calculating from dob)
    let ageText = 'N/A';
    const rawAge = patientData.age || patientData.fertilityProfile?.age;
    if (rawAge !== undefined && rawAge !== null && rawAge !== '') {
        ageText = `${rawAge} Years`;
    } else {
        const dobVal = patientData.dob || patientData.fertilityProfile?.dob;
        if (dobVal) {
            const diff = Date.now() - new Date(dobVal).getTime();
            const ageYears = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
            if (ageYears >= 0 && ageYears <= 120) ageText = `${ageYears} Years`;
        }
    }

    let fullAddress = patientData.address || '';
    if (!fullAddress) {
        fullAddress = [patientData.houseNo, patientData.street, patientData.city, patientData.state, patientData.zipCode]
            .map(s => String(s || '').trim())
            .filter(Boolean)
            .join(', ');
    }

    const displayTimeline = timeline;
    const displayDocuments = documentList;

    const metrics = calculateMetrics();

    // Categorized timeline data for sidebar
    const upcomingAppointments = displayTimeline.filter(t => {
        if (t.type !== 'appointment') return false;
        const status = (t.data?.status || '').toLowerCase();
        if (status !== 'pending' && status !== 'confirmed' && status !== 'scheduled') return false;
        const apptTime = t.data?.appointmentTime || t.data?.visitTime || t.data?.time || '';
        return !isAppointmentExpired(t.date, apptTime);
    });

    const recentLabs = displayTimeline.filter(t => t.type === 'labReport');
    const medications = displayTimeline.filter(t => t.type === 'pharmacyOrder' || (t.type === 'clinicalVisit' && t.data?.prescriptions?.length > 0));
    const financialTransactions = displayTimeline.filter(t => t.data?.amount || t.data?.totalAmount || t.data?.fee);

    return (
        <div className="upp-container">
            {/* Top Navigation Bar */}
            <div className="upp-top-nav">
                <button className="upp-back-btn" onClick={() => navigate(-1)}>
                    <FiArrowLeft /> Back
                </button>
            </div>



            {/* Header Identity Card */}
            <div className="upp-header-card">
                <div className="upp-identity-wrapper">
                    <div className="upp-avatar">
                        {initials}
                    </div>
                    <div className="upp-header-info">
                        {/* First Line: Patient Name only */}
                        <h1>{patientData.name}</h1>
                        
                        {/* Second Line: MRN, Mobile, Age chips */}
                        <div className="upp-header-tags">
                            <span className="upp-header-tag" style={{ color: 'var(--upp-primary)', fontWeight: '700', background: 'var(--upp-primary-light)' }}>
                                MRN : {patientData.patientId || patientData.mrn || 'N/A'}
                            </span>
                            <span className="upp-header-tag">
                                <FiPhone /> {patientData.phone || 'No contact provided'}
                            </span>
                            <span className="upp-header-tag">
                                Age : {ageText}
                            </span>
                        </div>

                        {/* Third Line: Full Address */}
                        <div className="upp-header-address">
                            <FiMapPin style={{ flexShrink: 0 }} /> {fullAddress || 'No address recorded'}
                        </div>
                    </div>
                </div>

                {/* Rearranged Action Buttons (stacked vertically, Download above Edit) */}
                <div className="upp-header-actions">
                    <button className="upp-btn-action upp-btn-download" onClick={handleDownloadPDF} title="Download Complete Patient Clinical Profile">
                        <FiDownload /> Download Profile
                    </button>
                    {isReception && (
                        <button className="upp-btn-action upp-btn-edit" onClick={() => navigate('/reception/dashboard?view=intake', { state: { patient: patientData, isEditingExisting: true } })} title="Edit Patient Demographics & Intake Information">
                            <FiEdit3 /> Edit Profile
                        </button>
                    )}
                </div>
            </div>

            {/* Statistics Cards Row */}
            <div className="upp-metrics">
                <div className="upp-metric-card metric-visits">
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Total Visits</span>
                        <span className="upp-metric-val">{metrics.totalVisits}</span>
                    </div>
                    <FiActivity className="upp-metric-icon" style={{ color: '#3b82f6' }} />
                </div>

                <div className="upp-metric-card metric-upcoming">
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Upcoming Appointments</span>
                        <span className="upp-metric-val">{metrics.upcomingCount}</span>
                    </div>
                    <FiCalendar className="upp-metric-icon" style={{ color: '#0ea5e9' }} />
                </div>

                <div className="upp-metric-card metric-pending">
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Pending Dues</span>
                        <span className="upp-metric-val">₹{metrics.pendingDues.toLocaleString('en-IN')}</span>
                    </div>
                    <FiAlertCircle className="upp-metric-icon" style={{ color: '#f59e0b' }} />
                </div>

                <div className="upp-metric-card metric-paid">
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Total Paid</span>
                        <span className="upp-metric-val">₹{metrics.totalPaid.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="upp-metric-icon" style={{ color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold' }}>₹</div>
                </div>

                <div className="upp-metric-card" style={{ background: currentFollowupStatus?.active ? '#f0fdf4' : '#fef2f2', borderColor: currentFollowupStatus?.active ? '#bbf7d0' : '#fecaca', borderLeft: currentFollowupStatus?.active ? '4px solid #22c55e' : '4px solid #ef4444', gridColumn: 'span 1', padding: '12px' }}>
                    <div className="upp-metric-info" style={{ width: '100%' }}>
                        <span className="upp-metric-label" style={{ color: currentFollowupStatus?.active ? '#166534' : '#991b1b', fontSize: '0.75rem' }}>Follow-up</span>
                        <div style={{ marginTop: '4px' }}>
                            <span className="upp-metric-val" style={{ color: currentFollowupStatus?.active ? '#15803d' : '#b91c1c', fontSize: '1.05rem' }}>
                                {(() => {
                                    if (currentFollowupStatus?.active) return 'Active';
                                    if (currentFollowupStatus?.message === 'New Patient / First Visit' && metrics.totalVisits === 0) return 'New Patient';
                                    return 'Expired';
                                })()}
                            </span>
                        </div>
                        {currentFollowupStatus && !(currentFollowupStatus.message === 'New Patient / First Visit' && metrics.totalVisits === 0) && (
                            <div style={{ fontSize: '0.75rem', color: currentFollowupStatus.active ? '#166534' : '#7f1d1d', marginTop: '4px', fontWeight: 500 }}>
                                {(() => {
                                    if (currentFollowupStatus.active) {
                                        return <>Valid: {Math.max(0, Math.ceil((new Date(currentFollowupStatus.validUntil).getTime() - new Date().getTime()) / (1000 * 3600 * 24)))} Days</>;
                                    } else {
                                        const lastVisit = timeline.find(t => t.type === 'clinicalVisit' || t.type === 'appointment');
                                        const lastDate = currentFollowupStatus.lastConsultation || (lastVisit ? lastVisit.date : null);
                                        return <>{lastDate ? `Last: ${new Date(lastDate).toLocaleDateString('en-IN')}` : 'Fee Applicable'}</>;
                                    }
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Two Column Main Layout */}
            <div className="upp-main-layout">
                {/* Left Panel (60%): Visit History */}
                <div className="upp-col-left">
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h2 className="upp-section-title">
                                <FiActivity style={{ color: 'var(--upp-primary)' }} /> Chronological Visit History
                            </h2>
                            <span className="upp-section-count">{displayTimeline.length} records</span>
                        </div>

                        {displayTimeline.length === 0 ? (
                            <div className="upp-empty-state">
                                No clinical visits or history recorded yet for the {departmentParam || 'Hospital'} department.
                            </div>
                        ) : (
                            <div className="upp-timeline">
                                {displayTimeline.sort((a, b) => new Date(b.date) - new Date(a.date)).map((item, index) => {
                                    const calendarDateOnly = new Date(item.date || Date.now()).toLocaleDateString('en-IN', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric'
                                    });
                                    const exactTime = item.data?.appointmentTime || item.data?.visitTime || item.data?.time;
                                    const dateStr = exactTime ? `${calendarDateOnly} • ${exactTime}` : calendarDateOnly;
                                    const provider = item.data?.doctorName || item.data?.doctorConsultation?.doctorId || item.summary?.doctorSeen || 'Hospital Provider';
                                    let titleText = item.summary?.primaryComplaint || item.data?.serviceName || item.data?.title || item.data?.testName || 'Clinical Consult';
                                    let statusText = item.data?.status || item.data?.paymentStatus || 'Recorded';

                                    if (item.type === 'labReport') {
                                        titleText = `Diagnostic Lab Test${item.data?.testNames?.length > 0 ? ': ' + item.data.testNames.join(', ') : ''}`;
                                        statusText = item.data?.reportStatus === 'UPLOADED' ? 'Completed' : (item.data?.reportStatus || 'Pending');
                                    } else if (item.type === 'pharmacyOrder') {
                                        titleText = 'Pharmacy / Prescription Order';
                                    }

                                    const badgeClass = statusText.toLowerCase().includes('complete') || statusText.toLowerCase().includes('paid') || statusText.toLowerCase() === 'uploaded'
                                        ? 'upp-badge-completed'
                                        : statusText.toLowerCase().includes('confirm')
                                        ? 'upp-badge-confirmed'
                                        : statusText.toLowerCase().includes('cancel')
                                        ? 'upp-badge-cancelled'
                                        : 'upp-badge-pending';

                                    return (
                                        <div key={index} className="upp-timeline-item">
                                            <div className="upp-tl-top">
                                                <div className="upp-tl-meta">
                                                    <span className="upp-tl-date">{dateStr}</span>
                                                    <span className="upp-tl-doc">Provider: {provider}</span>
                                                </div>
                                                <span className={`upp-badge ${badgeClass}`}>{statusText}</span>
                                            </div>

                                            <div className="upp-tl-body">
                                                <div className="upp-tl-field">
                                                    <span className="upp-tl-label">Clinical Description / Diagnosis</span>
                                                    <span className="upp-tl-value">{titleText}</span>
                                                </div>

                                                {item.summary?.outcome && item.summary.outcome !== 'Processing' && (
                                                    <div className="upp-tl-field">
                                                        <span className="upp-tl-label">Outcome / Assessment</span>
                                                        <span className="upp-tl-value">{item.summary.outcome}</span>
                                                    </div>
                                                )}

                                                {item.data?.notes && (
                                                    <div className="upp-tl-field">
                                                        <span className="upp-tl-label">Clinical Notes</span>
                                                        <span className="upp-tl-value">{item.data.notes}</span>
                                                    </div>
                                                )}

                                                {item.data?.vitals && Object.keys(item.data.vitals).length > 0 && (
                                                    <div className="upp-tl-vitals-grid">
                                                        {item.data.vitals.weight && <span className="upp-vital-pill">Wt: {item.data.vitals.weight} kg</span>}
                                                        {item.data.vitals.bp && <span className="upp-vital-pill">BP: {item.data.vitals.bp}</span>}
                                                        {item.data.vitals.pulse && <span className="upp-vital-pill">Pulse: {item.data.vitals.pulse} bpm</span>}
                                                        {item.data.vitals.temperature && <span className="upp-vital-pill">Temp: {item.data.vitals.temperature}°F</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel (40%): Sidebar Sections */}
                <div className="upp-col-right">
                    {/* Upcoming Appointments Card */}
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h3 className="upp-section-title">
                                <FiCalendar style={{ color: '#0ea5e9' }} /> Upcoming Appointments
                            </h3>
                            <span className="upp-section-count">{upcomingAppointments.length}</span>
                        </div>
                        {upcomingAppointments.length === 0 ? (
                            <div className="upp-empty-state">No scheduled future appointments.</div>
                        ) : (
                            <div className="upp-list-items">
                                {upcomingAppointments.map((appt, i) => (
                                    <div key={i} className="upp-list-card">
                                        <div className="upp-list-info">
                                            <span className="upp-list-title">{appt.data?.serviceName || 'Hospital Visit'}</span>
                                            <span className="upp-list-sub">
                                                {new Date(appt.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} • {appt.data?.appointmentTime || appt.data?.visitTime || appt.data?.time || 'Scheduled'} with {appt.data?.doctorName || 'Doctor'}
                                            </span>
                                        </div>
                                        <div className="upp-list-action">
                                            <span className="upp-badge upp-badge-confirmed">{appt.data?.status || 'Confirmed'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recent Lab Tests Card */}
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h3 className="upp-section-title">
                                <FiFileText style={{ color: '#8b5cf6' }} /> Recent Lab Reports
                            </h3>
                            <span className="upp-section-count">{recentLabs.length}</span>
                        </div>
                        {recentLabs.length === 0 ? (
                            <div className="upp-empty-state">No lab investigations recorded.</div>
                        ) : (
                            <div className="upp-list-items">
                                {recentLabs.slice(0, 5).map((lab, i) => (
                                    <div key={i} className="upp-list-card">
                                        <div className="upp-list-info">
                                            <span className="upp-list-title">{lab.data?.testName || lab.data?.reportName || (lab.data?.testNames?.join(', ')) || 'Diagnostic Lab Test'}</span>
                                            <span className="upp-list-sub">{new Date(lab.date).toLocaleDateString('en-IN')} • {lab.data?.reportStatus === 'UPLOADED' ? 'Completed' : (lab.data?.reportStatus || 'Pending')}</span>
                                        </div>
                                        {(lab.data?.reportFile?.url || lab.data?.fileUrl) && (
                                            <div className="upp-list-action">
                                                <a href={lab.data?.reportFile?.url || lab.data?.fileUrl} target="_blank" rel="noopener noreferrer" className="upp-mini-btn">
                                                    <FiEye /> View
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Medications Card */}
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h3 className="upp-section-title">
                                <FiPlus style={{ color: '#10b981' }} /> Medications & Prescriptions
                            </h3>
                            <span className="upp-section-count">{medications.length}</span>
                        </div>
                        {medications.length === 0 ? (
                            <div className="upp-empty-state">No active medications or pharmacy prescriptions found.</div>
                        ) : (
                            <div className="upp-list-items">
                                {medications.slice(0, 5).map((med, i) => {
                                    const title = med.data?.medicineName || (med.data?.items ? `${med.data.items.length} Pharmacy Items` : 'Clinical Prescription');
                                    return (
                                        <div key={i} className="upp-list-card">
                                            <div className="upp-list-info">
                                                <span className="upp-list-title">{title}</span>
                                                <span className="upp-list-sub">{new Date(med.date).toLocaleDateString('en-IN')} • {med.data?.dosage || med.data?.status || 'Dispensed'}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Patient Consent Information Card */}
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h3 className="upp-section-title">
                                <FiShield style={{ color: '#f59e0b' }} /> Patient Consent Forms
                            </h3>
                            <span className="upp-section-count">{consentList.length}</span>
                        </div>

                        {/* Upload box */}
                        <form className="upp-consent-box" onSubmit={handleConsentUpload}>
                            <div className="upp-consent-form">
                                <span style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--upp-text-main)' }}>Upload New Consent Form (PDF/Img)</span>
                                <input 
                                    id="consent-file-input"
                                    type="file" 
                                    accept="application/pdf,image/*" 
                                    onChange={(e) => setConsentFile(e.target.files[0])} 
                                    className="upp-file-input"
                                    required
                                />
                            </div>
                            <button type="submit" className="upp-btn-submit-consent" disabled={!consentFile || uploadingConsent}>
                                <FiUpload /> {uploadingConsent ? 'Uploading...' : 'Upload Consent Form'}
                            </button>
                        </form>

                        {consentList.length === 0 ? (
                            <div className="upp-empty-state">No consent forms uploaded yet.</div>
                        ) : (
                            <div className="upp-list-items">
                                {consentList.map((c, i) => (
                                    <div key={i} className="upp-list-card">
                                        <div className="upp-list-info">
                                            <span className="upp-list-title">{c.fileName || `Consent Form #${i + 1}`}</span>
                                            <span className="upp-list-sub">{c.uploadedAt ? new Date(c.uploadedAt).toLocaleDateString('en-IN') : 'Saved'}</span>
                                        </div>
                                        <div className="upp-list-action">
                                            {c.url && (
                                                <>
                                                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="upp-icon-btn" title="View">
                                                        <FiEye />
                                                    </a>
                                                    <a href={c.url} download target="_blank" rel="noopener noreferrer" className="upp-icon-btn upp-icon-btn-download" title="Download">
                                                        <FiDownload />
                                                    </a>
                                                </>
                                            )}
                                            <button type="button" onClick={() => handleDeleteConsent(i, c.fileId)} className="upp-icon-btn upp-icon-btn-danger" title="Delete">
                                                <FiTrash2 />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Reports & Documents Card */}
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h3 className="upp-section-title">
                                <FiFolder style={{ color: '#6366f1' }} /> Reports & Documents
                            </h3>
                            <span className="upp-section-count">{displayDocuments.length}</span>
                        </div>

                        {displayDocuments.length === 0 ? (
                            <div className="upp-empty-state">No uploaded documents found for the {departmentParam || 'Hospital'} department.</div>
                        ) : (
                            <div className="upp-list-items">
                                {displayDocuments.map((doc, i) => (
                                    <div key={i} className="upp-list-card">
                                        <div className="upp-list-info">
                                            <span className="upp-list-title">{doc.fileName || 'Hospital Document'}</span>
                                            <span className="upp-list-sub">{doc.docType || 'General'} • {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-IN') : 'Saved'}</span>
                                        </div>
                                        <div className="upp-list-action">
                                            {doc.url && (
                                                <>
                                                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="upp-icon-btn" title="View">
                                                        <FiEye />
                                                    </a>
                                                    <a href={doc.url} download target="_blank" rel="noopener noreferrer" className="upp-icon-btn upp-icon-btn-download" title="Download">
                                                        <FiDownload />
                                                    </a>
                                                </>
                                            )}
                                            <button type="button" onClick={() => handleDeleteDocument(i, doc)} className="upp-icon-btn upp-icon-btn-danger" title="Delete">
                                                <FiTrash2 />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recent Finances Card */}
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h3 className="upp-section-title">
                                <FiDollarSign style={{ color: '#10b981' }} /> Recent Finances & Dues
                            </h3>
                            <span className="upp-section-count">{financialTransactions.length} items</span>
                        </div>
                        {financialTransactions.length === 0 ? (
                            <div className="upp-empty-state">No financial transactions logged.</div>
                        ) : (
                            <div className="upp-list-items">
                                {financialTransactions.slice(0, 5).map((t, i) => {
                                    const amt = Number(t.data?.amount || t.data?.totalAmount || t.data?.fee || 0);
                                    const pStatus = t.data?.paymentStatus || t.data?.status || 'recorded';
                                    const badgeClass = pStatus.toLowerCase().includes('paid') ? 'upp-badge-completed' : 'upp-badge-pending';
                                    return (
                                        <div key={i} className="upp-list-card">
                                            <div className="upp-list-info">
                                                <span className="upp-list-title">{t.data?.serviceName || t.data?.title || 'Medical Service / Consult'}</span>
                                                <span className="upp-list-sub">{new Date(t.date).toLocaleDateString('en-IN')} • {t.data?.paymentMethod || 'Cash'}</span>
                                            </div>
                                            <div className="upp-list-action" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                <span style={{ fontWeight: '800', fontSize: '14px' }}>₹{amt.toLocaleString('en-IN')}</span>
                                                <span className={`upp-badge ${badgeClass}`}>{pStatus}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};

const UnifiedPatientProfile = () => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (currentUser?.clinicType === 'clinic') {
        return <ClinicPatientProfile />;
    }
    return <HospitalPatientProfileContent />;
};

export default UnifiedPatientProfile;
