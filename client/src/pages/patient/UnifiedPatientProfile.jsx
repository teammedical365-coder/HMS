import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { patientAPI, receptionAPI, reportAPI, consentAPI } from '../../utils/api';
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
    FiMapPin,
    FiMoreVertical,
    FiCamera,
    FiChevronRight,
    FiMessageSquare,
    FiUser,
    FiHeart,
    FiDroplet,
    FiBox
} from 'react-icons/fi';
import { FaHeartbeat, FaRupeeSign } from 'react-icons/fa';
import './UnifiedPatientProfile.css';
import toast from 'react-hot-toast';
import { confirmToast } from '../../utils/confirmToast';

import ClinicPatientProfile from './ClinicPatientProfile';
import FamilyHealthTree from './FamilyHealthTree';
import PatientVialsSection from '../../components/vials/PatientVialsSection';

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

    const isDoctor = dynRole.includes('doctor') || userRole.includes('doctor');

    const [searchParams] = useSearchParams();

    // State
    const [patientData, setPatientData] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'timeline');

    // Consent & Document States
    const [consentList, setConsentList] = useState([]);
    const [consentFile, setConsentFile] = useState(null);
    const [uploadingConsent, setUploadingConsent] = useState(false);
    const [consentTemplates, setConsentTemplates] = useState([]);
    const [selectedConsentTemplate, setSelectedConsentTemplate] = useState('');
    const [generatingConsentPdf, setGeneratingConsentPdf] = useState(false);

    const [documentList, setDocumentList] = useState([]);
    const [_activeFollowups, setActiveFollowups] = useState([]);

    // AI Summary States
    const [aiLoading, setAiLoading] = useState({});
    const [aiSummaries, setAiSummaries] = useState({});
    const [aiErrors, setAiErrors] = useState({});

    const handleGenerateSummary = async (fileUrl, mimeType, index, fileName) => {
        setAiLoading(prev => ({ ...prev, [index]: true }));
        setAiErrors(prev => ({ ...prev, [index]: null }));
        try {
            const res = await reportAPI.generateAISummary(fileUrl, mimeType, fileName);
            if (res.success) {
                setAiSummaries(prev => ({ ...prev, [index]: res.summary }));
            } else {
                setAiErrors(prev => ({ ...prev, [index]: res.message || 'Failed to generate summary.' }));
            }
        } catch (error) {
            console.error("AI Summary error:", error);
            const errMsg = error?.response?.data?.message || error.message || 'An error occurred while generating summary.';
            setAiErrors(prev => ({ ...prev, [index]: errMsg }));
        } finally {
            setAiLoading(prev => ({ ...prev, [index]: false }));
        }
    };
    const [currentFollowupStatus, setCurrentFollowupStatus] = useState(null);

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
                toast.success('Consent form uploaded successfully!');
            } else {
                toast.error(res.message || 'Upload failed.');
            }
        } catch (err) {
            console.error("Consent upload error:", err);
            toast.error('Failed to upload consent form. Please try again.');
        } finally {
            setUploadingConsent(false);
        }
    };

    // Load active consent templates
    useEffect(() => {
        consentAPI.getTemplates({ status: 'active' }).then(res => {
            if (res?.success && Array.isArray(res.data)) {
                setConsentTemplates(res.data);
                if (res.data.length > 0) setSelectedConsentTemplate(res.data[0]._id);
            }
        }).catch(err => console.error('Failed to load consent templates:', err));
    }, []);

    const handleGenerateConsentPDF = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!selectedConsentTemplate || !patientData) return;
        setGeneratingConsentPdf(true);
        try {
            const token = localStorage.getItem('token') || '';
            const pid = patientData._id || patientId;
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/consent/templates/${selectedConsentTemplate}/generate-pdf?patientId=${pid}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('PDF Generation failed');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const template = consentTemplates.find(t => t._id === selectedConsentTemplate);
            a.download = `${template?.name || 'Consent'}_${(patientData.name || 'Patient').replace(/\s+/g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Consent PDF downloaded successfully!');
        } catch (err) {
            console.error('Consent PDF error:', err);
            toast.error('Could not download consent PDF. Please check the template format.');
        } finally {
            setGeneratingConsentPdf(false);
        }
    };

    const handleDeleteConsent = async (index, fileId) => {
        const confirmed = await confirmToast('Are you sure you want to delete this consent form?', {
            title: 'Delete Consent Form',
            confirmText: 'Delete',
            danger: true
        });
        if (!confirmed) return;

        try {
            const res = await patientAPI.deleteConsent(patientData._id, index, fileId);
            if (res.success) {
                setConsentList(prev => prev.filter((_, i) => i !== index));
                toast.success('Consent form deleted successfully!');
            } else {
                toast.error(res.message || 'Failed to delete consent form.');
            }
        } catch (err) {
            console.error('Delete consent error:', err);
            toast.error('Failed to delete consent form.');
        }
    };

    const handleDeleteDocument = async (index, doc) => {
        const confirmed = await confirmToast('Are you sure you want to delete this report/document?', {
            title: 'Delete Document',
            confirmText: 'Delete',
            danger: true
        });
        if (!confirmed) return;

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
                toast.success('Document deleted successfully!');
            } else {
                toast.error(res.message || 'Failed to delete document.');
            }
        } catch (err) {
            console.error('Delete document error:', err);
            toast.error('Failed to delete report/document.');
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
        const safeTimeline = Array.isArray(timeline) ? timeline : [];
        const appointments = safeTimeline.filter(t => t.type === 'appointment' || t.type === 'clinicalVisit') || [];
        const upcoming = safeTimeline.filter(t => {
            if (t.type !== 'appointment') return false;
            const status = (t.data?.status || '').toLowerCase();
            if (status !== 'pending' && status !== 'confirmed' && status !== 'scheduled') return false;
            const apptTime = t.data?.appointmentTime || t.data?.visitTime || t.data?.time || '';
            return !isAppointmentExpired(t.date, apptTime);
        });

        let totalPaid = 0;
        let pendingDues = 0;
        let totalBills = 0;

        safeTimeline.forEach(t => {
            const amt = Number(t.data?.amount || t.data?.totalAmount || t.data?.fee || 0);
            if (!amt) return;
            totalBills += amt;
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
            pendingDues,
            totalBills
        };
    };

    const handleDownloadPDF = () => {
        if (!patientData) return;
        const doc = new jsPDF();
        const fp = patientData.fertilityProfile || {};
        
        // Title banner
        doc.setFillColor(37, 99, 235);
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
        doc.setTextColor(37, 99, 235);
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
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
            styles: { fontSize: 9 }
        });

        doc.save(`Patient_Profile_${patientData.patientId || 'MRN'}.pdf`);
    };

    if (loading) {
        return (
            <div className="upp-container">
                <div className="upp-loading-screen">
                    <div className="upp-spinner"></div>
                    <p>Loading Patient Profile...</p>
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

    // Compute age
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
    const fp = patientData.fertilityProfile || {};
    const allergiesText = fp.allergies || '';
    const allergiesList = allergiesText ? allergiesText.split(',').map(a => a.trim()).filter(Boolean) : [];

    const metrics = calculateMetrics();

    // Categorized timeline data
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

    // Recent visits (last 5)
    const recentVisits = displayTimeline
        .filter(t => t.type === 'appointment' || t.type === 'clinicalVisit')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    // Staff access check for Vial Management (Hospital Admin manages, Reception/Staff can view storage locations & time)
    const canViewVials = ['hospitaladmin', 'centraladmin', 'superadmin', 'reception', 'receptionist', 'doctor', 'clinicdoctor', 'clinic doctor', 'staff', 'frontdesk'].includes(userRole) || 
                         ['hospitaladmin', 'centraladmin', 'superadmin', 'reception', 'receptionist', 'doctor', 'clinicdoctor', 'clinic doctor', 'staff', 'frontdesk'].includes(dynRole) ||
                         ['hospitaladmin', 'centraladmin', 'superadmin', 'reception', 'receptionist', 'doctor', 'clinicdoctor', 'clinic doctor', 'staff', 'frontdesk'].includes(String(currentUser?.role || '').toLowerCase()) ||
                         ['hospitaladmin', 'centraladmin', 'superadmin', 'reception', 'receptionist', 'doctor', 'clinicdoctor', 'clinic doctor', 'staff', 'frontdesk'].includes(String(currentUser?._roleData?.name || '').toLowerCase()) ||
                         permissions.includes('reception_access') ||
                         permissions.includes('admin_manage_roles');

    // Tab definitions
    const tabs = [
        { key: 'timeline', label: 'Timeline' },
        { key: 'familyHistory', label: 'Family History' },
        { key: 'clinical', label: 'Clinical History' },
        { key: 'vitals', label: 'Vitals' },
        { key: 'prescriptions', label: 'Prescriptions' },
        { key: 'reports', label: 'Reports' },
        { key: 'notes', label: 'Notes' },
        ...(canViewVials ? [{ key: 'vialManagement', label: '🧪 Vial / Sample Location' }] : []),
        { key: 'documents', label: 'Documents' },
    ];

    // Gender & Blood Group display
    const genderDisplay = patientData.gender || patientData.fertilityProfile?.gender || 'N/A';
    const bloodGroupDisplay = patientData.bloodGroup || patientData.fertilityProfile?.bloodGroup || 'N/A';

    return (
        <div className="upp-container">
            {/* ====== TOP NAVIGATION ====== */}
            <div className="upp-top-nav">
                <button className="upp-back-btn" onClick={() => navigate(-1)}>
                    <FiArrowLeft /> Back
                </button>
                <div className="upp-breadcrumb">
                    <span>Dashboard</span>
                    <span className="upp-breadcrumb-sep">›</span>
                    <span className="upp-breadcrumb-active">Patient Profile</span>
                </div>
            </div>

            {/* ====== HEADER IDENTITY CARD ====== */}
            <div className="upp-header-card">
                <div className="upp-identity-wrapper">
                    <div className="upp-avatar">
                        {initials}
                        <span className="upp-avatar-camera"><FiCamera /></span>
                    </div>
                    <div className="upp-header-info">
                        <div className="upp-header-name-row">
                            <h1>{patientData.name}</h1>
                            <span className={`upp-status-badge ${currentFollowupStatus?.active ? 'active' : 'inactive'}`}>
                                {currentFollowupStatus?.active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        <div className="upp-header-tags">
                            <span className="upp-header-tag" style={{ color: 'var(--upp-primary)', fontWeight: '700', background: 'var(--upp-primary-light)' }}>
                                <FiShield /> MRN: {patientData.patientId || patientData.mrn || 'N/A'}
                            </span>
                            <span className="upp-header-tag">
                                <FiCalendar /> {ageText}
                            </span>
                            <span className="upp-header-tag">
                                <FiUser /> {genderDisplay}
                            </span>
                            <span className="upp-header-tag">
                                <FiDroplet /> {bloodGroupDisplay}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="upp-header-actions">
                    {isReception && (
                        <button 
                            className="upp-btn-action upp-btn-edit" 
                            onClick={() => navigate('/reception/dashboard?view=intake', { state: { patient: patientData, isEditingExisting: true } })} 
                            title="Edit Patient Demographics & Profile"
                            style={{ background: '#f8fafc', color: '#1e293b', border: '1.5px solid #cbd5e1' }}
                        >
                            <FiEdit3 /> Edit Profile
                        </button>
                    )}
                    <button className="upp-btn-action upp-btn-download" onClick={handleDownloadPDF} title="Download Patient Profile PDF">
                        <FiDownload /> Download PDF
                    </button>
                    {isReception && (
                        <button className="upp-btn-action upp-btn-new-appt" onClick={() => navigate('/reception/dashboard?view=intake', { state: { patient: patientData, isEditingExisting: false } })} title="Book New Appointment">
                            <FiPlus /> New Appointment
                        </button>
                    )}
                    <button className="upp-btn-action upp-btn-more" title="More Options" onClick={handleDownloadPDF}>
                        <FiMoreVertical />
                    </button>
                </div>
            </div>

            {/* ====== 5 STATS CARDS ROW ====== */}
            <div className="upp-metrics">
                <div className="upp-metric-card">
                    <div className="upp-metric-icon-circle blue">
                        <FiCalendar />
                    </div>
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Total Appointments</span>
                        <span className="upp-metric-val">{metrics.totalVisits}</span>
                    </div>
                </div>

                <div className="upp-metric-card">
                    <div className="upp-metric-icon-circle orange">
                        <FiClock />
                    </div>
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Upcoming</span>
                        <span className="upp-metric-val">{metrics.upcomingCount}</span>
                    </div>
                </div>

                <div className="upp-metric-card">
                    <div className="upp-metric-icon-circle emerald">
                        <FiFileText />
                    </div>
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Total Bills</span>
                        <span className="upp-metric-val">₹{metrics.totalBills.toLocaleString('en-IN')}</span>
                    </div>
                </div>

                <div className="upp-metric-card">
                    <div className="upp-metric-icon-circle red">
                        <FiAlertCircle />
                    </div>
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Outstanding</span>
                        <span className="upp-metric-val">₹{metrics.pendingDues.toLocaleString('en-IN')}</span>
                    </div>
                </div>

                <div className="upp-metric-card">
                    <div className="upp-metric-icon-circle teal">
                        <FiCheckCircle />
                    </div>
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Total Paid</span>
                        <span className="upp-metric-val">₹{metrics.totalPaid.toLocaleString('en-IN')}</span>
                    </div>
                </div>
            </div>

            {/* ====== ALLERGIES BAR ====== */}
            <div className="upp-allergies-bar">
                <div className="upp-allergies-icon">
                    <FaHeartbeat />
                </div>
                <div>
                    <span className="upp-allergies-label">Allergies</span>
                </div>
                <div className="upp-allergies-pills">
                    {allergiesList.length > 0 ? (
                        allergiesList.map((allergy, i) => (
                            <span key={i} className="upp-allergy-pill">{allergy}</span>
                        ))
                    ) : (
                        <span className="upp-allergies-text">No allergies added</span>
                    )}
                </div>
                <button className="upp-allergy-add-btn">
                    <FiPlus /> Add Allergy
                </button>
            </div>

            {/* ====== TAB NAVIGATION ====== */}
            <div className="upp-tab-nav">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`upp-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ====== MAIN CONTENT ====== */}
            {activeTab === 'familyHistory' ? (
                <div style={{ marginTop: '20px' }}>
                    <FamilyHealthTree patientId={patientData?._id || patientId} patientData={patientData} />
                </div>
            ) : activeTab === 'vialManagement' ? (
                <PatientVialsSection patientId={patientData?._id || patientId} patientData={patientData} />
            ) : (
                <div className="upp-main-layout">
                    {/* ---- LEFT PANEL ---- */}
                    <div className="upp-col-left">

                        {/* Timeline Tab Content */}
                        {activeTab === 'timeline' && (
                        <>
                            {/* Recent Visit Section */}
                            <div className="upp-section-card">
                                <div className="upp-section-header">
                                    <h2 className="upp-section-title">
                                        <FiActivity style={{ color: 'var(--upp-primary)' }} /> Recent Visit
                                    </h2>
                                    <div className="upp-visit-filter">
                                        <select defaultValue="all">
                                            <option value="all">All Visits</option>
                                            <option value="completed">Completed</option>
                                            <option value="pending">Pending</option>
                                        </select>
                                    </div>
                                </div>

                                {recentVisits.length === 0 ? (
                                    <div className="upp-empty-state">
                                        No clinical visits recorded yet.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {recentVisits.map((item, index) => {
                                            const visitDate = new Date(item.date || Date.now());
                                            const dateFormatted = visitDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                                            const timeStr = item.data?.appointmentTime || item.data?.visitTime || item.data?.time || '';
                                            const timeFormatted = timeStr || visitDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                                            const provider = item.data?.doctorName || item.data?.doctorConsultation?.doctorId || item.summary?.doctorSeen || 'Doctor';
                                            const dept = item.data?.department || item.data?.serviceName || departmentParam || 'General Medicine';
                                            const titleText = item.summary?.primaryComplaint || item.data?.serviceName || item.data?.title || 'General Consultation';
                                            const statusText = (item.data?.status || 'Completed').toLowerCase();
                                            const amt = Number(item.data?.amount || item.data?.totalAmount || item.data?.fee || 0);

                                            const badgeClass = statusText.includes('complete') || statusText.includes('paid') 
                                                ? 'completed' 
                                                : statusText.includes('confirm') ? 'confirmed' 
                                                : statusText.includes('cancel') ? 'cancelled' 
                                                : 'pending';

                                            return (
                                                <div key={index} className="upp-visit-card">
                                                    <div className="upp-visit-date-col">
                                                        <div className="upp-visit-dot" />
                                                        <span className="upp-visit-date-text">{dateFormatted}</span>
                                                        <span className="upp-visit-time-text">{timeFormatted}</span>
                                                        {index < recentVisits.length - 1 && <div className="upp-visit-line" />}
                                                    </div>
                                                    <div className="upp-visit-content">
                                                        <div className="upp-visit-title-row">
                                                            <span className="upp-visit-title">{titleText}</span>
                                                            <span className={`upp-visit-badge ${badgeClass}`}>{statusText.charAt(0).toUpperCase() + statusText.slice(1)}</span>
                                                        </div>
                                                        <div className="upp-visit-details-grid">
                                                            <div className="upp-visit-detail-item">
                                                                <FiUser /> <span>Doctor: <strong>{provider}</strong></span>
                                                            </div>
                                                            <div className="upp-visit-detail-item">
                                                                <FiFileText /> <span>Payment: <strong>₹{amt.toLocaleString('en-IN')}</strong></span>
                                                            </div>
                                                            <div className="upp-visit-detail-item">
                                                                <FiFolder /> <span>Department: <strong>{dept}</strong></span>
                                                            </div>
                                                            <div className="upp-visit-detail-item">
                                                                <FiCheckCircle /> <span>Status: <strong style={{ color: badgeClass === 'completed' ? '#15803d' : badgeClass === 'pending' ? '#b45309' : '#1d4ed8' }}>{statusText.charAt(0).toUpperCase() + statusText.slice(1)}</strong></span>
                                                            </div>
                                                        </div>

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

                            {/* Upcoming Appointments Section */}
                            <div className="upp-section-card">
                                <div className="upp-section-header">
                                    <h3 className="upp-section-title">
                                        <FiCalendar style={{ color: '#0ea5e9' }} /> Upcoming Appointments
                                    </h3>
                                    <button className="upp-view-all-btn">View All</button>
                                </div>
                                {upcomingAppointments.length === 0 ? (
                                    <div className="upp-empty-state">
                                        <div className="upp-empty-state-icon">📅</div>
                                        <strong>No upcoming appointments</strong>
                                        <span>Schedule a new appointment</span>
                                        {isReception && (
                                            <button 
                                                className="upp-upload-btn" 
                                                style={{ margin: '10px auto 0', background: '#22c55e', color: '#fff', borderColor: '#22c55e' }}
                                                onClick={() => navigate('/reception/dashboard?view=intake', { state: { patient: patientData, isEditingExisting: false } })}
                                            >
                                                <FiCalendar /> Book Appointment
                                            </button>
                                        )}
                                    </div>
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

                            {/* Recent Prescriptions Section */}
                            <div className="upp-section-card">
                                <div className="upp-section-header">
                                    <h3 className="upp-section-title">
                                        <FiFileText style={{ color: '#8b5cf6' }} /> Recent Prescriptions
                                    </h3>
                                    <button className="upp-view-all-btn">View All</button>
                                </div>
                                {medications.length === 0 ? (
                                    <div className="upp-empty-state">
                                        <div className="upp-empty-state-icon">💊</div>
                                        <strong>No prescriptions found</strong>
                                        <span>Prescriptions will appear here</span>
                                    </div>
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
                        </>
                    )}

                    {/* Clinical History Tab */}
                    {activeTab === 'clinical' && (
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
                    )}

                    {/* Vitals Tab */}
                    {activeTab === 'vitals' && (
                        <div className="upp-section-card">
                            <div className="upp-section-header">
                                <h2 className="upp-section-title">
                                    <FaHeartbeat style={{ color: '#ef4444' }} /> Patient Vitals
                                </h2>
                            </div>
                            {(() => {
                                const vitalsHistory = displayTimeline.filter(t => t.data?.vitals && Object.keys(t.data.vitals).length > 0);
                                if (vitalsHistory.length === 0) {
                                    return <div className="upp-empty-state">No vitals recorded yet.</div>;
                                }
                                return (
                                    <div className="upp-timeline">
                                        {vitalsHistory.sort((a, b) => new Date(b.date) - new Date(a.date)).map((item, i) => (
                                            <div key={i} className="upp-timeline-item" style={{ borderLeftColor: '#ef4444' }}>
                                                <div className="upp-tl-top">
                                                    <span className="upp-tl-date">{new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                </div>
                                                <div className="upp-tl-vitals-grid">
                                                    {item.data.vitals.weight && <span className="upp-vital-pill">Weight: {item.data.vitals.weight} kg</span>}
                                                    {item.data.vitals.height && <span className="upp-vital-pill">Height: {item.data.vitals.height} cm</span>}
                                                    {item.data.vitals.bp && <span className="upp-vital-pill">BP: {item.data.vitals.bp}</span>}
                                                    {item.data.vitals.bloodPressure && <span className="upp-vital-pill">BP: {item.data.vitals.bloodPressure}</span>}
                                                    {item.data.vitals.pulse && <span className="upp-vital-pill">Pulse: {item.data.vitals.pulse} bpm</span>}
                                                    {item.data.vitals.temperature && <span className="upp-vital-pill">Temp: {item.data.vitals.temperature}°F</span>}
                                                    {item.data.vitals.spo2 && <span className="upp-vital-pill">SpO2: {item.data.vitals.spo2}%</span>}
                                                    {item.data.vitals.bmi && <span className="upp-vital-pill">BMI: {item.data.vitals.bmi}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Prescriptions Tab */}
                    {activeTab === 'prescriptions' && (
                        <div className="upp-section-card">
                            <div className="upp-section-header">
                                <h2 className="upp-section-title">
                                    <FiPlus style={{ color: '#10b981' }} /> Medications & Prescriptions
                                </h2>
                                <span className="upp-section-count">{medications.length}</span>
                            </div>
                            {medications.length === 0 ? (
                                <div className="upp-empty-state">No medications or prescriptions found.</div>
                            ) : (
                                <div className="upp-list-items">
                                    {medications.map((med, i) => {
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
                    )}

                    {/* Reports Tab */}
                    {activeTab === 'reports' && (
                        <div className="upp-section-card">
                            <div className="upp-section-header">
                                <h2 className="upp-section-title">
                                    <FiFileText style={{ color: '#8b5cf6' }} /> Lab Reports
                                </h2>
                                <span className="upp-section-count">{recentLabs.length}</span>
                            </div>
                            {recentLabs.length === 0 ? (
                                <div className="upp-empty-state">No lab reports found.</div>
                            ) : (
                                <div className="upp-list-items">
                                    {recentLabs.map((lab, i) => (
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
                    )}

                    {/* Notes Tab */}
                    {activeTab === 'notes' && (
                        <div className="upp-section-card">
                            <div className="upp-section-header">
                                <h2 className="upp-section-title">
                                    <FiMessageSquare style={{ color: '#f59e0b' }} /> Clinical Notes
                                </h2>
                            </div>
                            {(() => {
                                const notesItems = displayTimeline.filter(t => t.data?.notes);
                                if (notesItems.length === 0) {
                                    return <div className="upp-empty-state">No clinical notes recorded.</div>;
                                }
                                return (
                                    <div className="upp-list-items">
                                        {notesItems.sort((a, b) => new Date(b.date) - new Date(a.date)).map((item, i) => (
                                            <div key={i} className="upp-list-card" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                                                <span className="upp-list-sub">{new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • {item.data?.doctorName || 'Provider'}</span>
                                                <span style={{ fontSize: '13px', color: 'var(--upp-text-secondary)', lineHeight: '1.5', marginTop: '4px' }}>{item.data.notes}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Documents Tab */}
                    {activeTab === 'documents' && (
                        <>
                            {/* Consent Forms */}
                            <div className="upp-section-card">
                                <div className="upp-section-header">
                                    <h3 className="upp-section-title">
                                        <FiShield style={{ color: '#f59e0b' }} /> Consent Forms
                                    </h3>
                                    <span className="upp-section-count">{consentList.length}</span>
                                </div>

                                {/* Upload box */}
                                <form className="upp-consent-box" onSubmit={handleConsentUpload}>
                                    <div className="upp-consent-form">
                                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--upp-text-main)' }}>Upload New Consent Form (PDF/Img)</span>
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

                                {/* Generate Auto-Filled Consent */}
                                <div style={{ marginTop: '12px', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1.5px dashed #cbd5e1' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <FiFileText style={{ color: '#6366f1', fontSize: '14px' }} />
                                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            Generate Auto-Filled Consent
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '11.5px', color: '#64748b', margin: '0 0 8px 0' }}>
                                        Select a template to generate auto-filled PDF with <strong>{patientData?.name || 'Patient'}</strong>'s details.
                                    </p>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <select 
                                            value={selectedConsentTemplate} 
                                            onChange={(e) => setSelectedConsentTemplate(e.target.value)}
                                            style={{ flex: 1, minWidth: '180px', padding: '8px 10px', borderRadius: '6px', border: '1.5px solid #cbd5e1', fontSize: '12.5px', background: '#fff', color: '#1e293b', fontWeight: 600 }}
                                        >
                                            {consentTemplates.length === 0 ? (
                                                <option value="">No templates available</option>
                                            ) : (
                                                consentTemplates.map(t => (
                                                    <option key={t._id} value={t._id}>{t.name} ({t.categoryId?.name || t.category || 'General'})</option>
                                                ))
                                            )}
                                        </select>
                                        <button 
                                            type="button" 
                                            onClick={handleGenerateConsentPDF}
                                            disabled={!selectedConsentTemplate || generatingConsentPdf || consentTemplates.length === 0}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 14px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', fontSize: '12px', cursor: (!selectedConsentTemplate || generatingConsentPdf) ? 'not-allowed' : 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(99, 102, 241, 0.2)' }}
                                        >
                                            <FiDownload /> {generatingConsentPdf ? 'Generating...' : 'Download PDF'}
                                        </button>
                                    </div>
                                </div>

                                {consentList.length === 0 ? (
                                    <div className="upp-empty-state" style={{ marginTop: '12px' }}>No consent forms uploaded yet.</div>
                                ) : (
                                    <div className="upp-list-items" style={{ marginTop: '12px' }}>
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

                            {/* Reports & Documents */}
                            <div className="upp-section-card">
                                <div className="upp-section-header">
                                    <h3 className="upp-section-title">
                                        <FiFolder style={{ color: '#6366f1' }} /> Reports & Documents
                                    </h3>
                                    <span className="upp-section-count">{displayDocuments.length}</span>
                                </div>

                                {displayDocuments.length === 0 ? (
                                    <div className="upp-empty-state">No uploaded documents found.</div>
                                ) : (
                                    <div className="upp-list-items">
                                        {displayDocuments.map((doc, i) => (
                                            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <div className="upp-list-card">
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
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* ---- RIGHT SIDEBAR ---- */}
                <div className="upp-col-right">
                    {/* Quick Actions Card */}
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h3 className="upp-section-title">⚡ Quick Actions</h3>
                        </div>
                        <div className="upp-quick-actions">
                            <div className="upp-quick-action-item" onClick={() => navigate(`/doctor/patient/${patientId}`)}>
                                <div className="upp-qa-left">
                                    <div className="upp-qa-icon blue"><FiFileText /></div>
                                    <span className="upp-qa-label">Add Prescription</span>
                                </div>
                                <FiChevronRight className="upp-qa-arrow" />
                            </div>
                            <div className="upp-quick-action-item">
                                <div className="upp-qa-left">
                                    <div className="upp-qa-icon amber"><FiMessageSquare /></div>
                                    <span className="upp-qa-label">Add Note</span>
                                </div>
                                <FiChevronRight className="upp-qa-arrow" />
                            </div>
                            {canViewVials && (
                                <div className="upp-quick-action-item" onClick={() => setActiveTab('vialManagement')}>
                                    <div className="upp-qa-left">
                                        <div className="upp-qa-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}><FiBox /></div>
                                        <span className="upp-qa-label">Sample / Vial Location</span>
                                    </div>
                                    <FiChevronRight className="upp-qa-arrow" />
                                </div>
                            )}
                            <div className="upp-quick-action-item" onClick={() => setActiveTab('documents')}>
                                <div className="upp-qa-left">
                                    <div className="upp-qa-icon violet"><FiUpload /></div>
                                    <span className="upp-qa-label">Upload Document</span>
                                </div>
                                <FiChevronRight className="upp-qa-arrow" />
                            </div>
                            <div className="upp-quick-action-item">
                                <div className="upp-qa-left">
                                    <div className="upp-qa-icon emerald"><FiPhone /></div>
                                    <span className="upp-qa-label">Send Message</span>
                                </div>
                                <FiChevronRight className="upp-qa-arrow" />
                            </div>
                        </div>
                    </div>

                    {/* Recent Payments Card */}
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h3 className="upp-section-title">
                                <FiDollarSign style={{ color: '#10b981' }} /> Recent Payments
                            </h3>
                            <button className="upp-view-all-btn">View All</button>
                        </div>
                        {financialTransactions.length === 0 ? (
                            <div className="upp-empty-state">No payments recorded.</div>
                        ) : (
                            <div>
                                {financialTransactions.slice(0, 4).map((t, i) => {
                                    const amt = Number(t.data?.amount || t.data?.totalAmount || t.data?.fee || 0);
                                    const pStatus = (t.data?.paymentStatus || t.data?.status || 'recorded').toLowerCase();
                                    const isPaid = pStatus.includes('paid') || pStatus.includes('completed');
                                    return (
                                        <div key={i} className="upp-payment-item">
                                            <div>
                                                <div className="upp-payment-date">{new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                                <div className="upp-payment-method">{t.data?.paymentMethod || 'Cash'}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div className="upp-payment-amount">₹{amt.toLocaleString('en-IN')}</div>
                                                <span className={`upp-payment-status ${isPaid ? 'paid' : 'pending'}`}>
                                                    {isPaid ? 'Paid' : 'Pending'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Documents Card (Sidebar) */}
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h3 className="upp-section-title">
                                <FiFolder style={{ color: '#6366f1' }} /> Documents
                            </h3>
                            <button className="upp-view-all-btn" onClick={() => setActiveTab('documents')}>View All</button>
                        </div>
                        {displayDocuments.length === 0 ? (
                            <div className="upp-empty-state">
                                <div className="upp-empty-state-icon">📁</div>
                                <strong>No documents uploaded</strong>
                                <span>Upload documents to view here</span>
                                <button className="upp-upload-btn" onClick={() => setActiveTab('documents')}>
                                    <FiUpload /> Upload Document
                                </button>
                            </div>
                        ) : (
                            <div className="upp-list-items">
                                {displayDocuments.slice(0, 3).map((doc, i) => (
                                    <div key={i} className="upp-list-card">
                                        <div className="upp-list-info">
                                            <span className="upp-list-title">{doc.fileName || 'Document'}</span>
                                            <span className="upp-list-sub">{doc.docType || 'General'}</span>
                                        </div>
                                        {doc.url && (
                                            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="upp-icon-btn" title="View">
                                                <FiEye />
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Notes Card (Sidebar) */}
                    <div className="upp-section-card">
                        <div className="upp-section-header">
                            <h3 className="upp-section-title">
                                <FiMessageSquare style={{ color: '#f59e0b' }} /> Notes
                            </h3>
                            <button className="upp-view-all-btn" onClick={() => setActiveTab('notes')}>View All</button>
                        </div>
                        {(() => {
                            const notesItems = displayTimeline.filter(t => t.data?.notes);
                            if (notesItems.length === 0) {
                                return (
                                    <div className="upp-empty-state">
                                        <strong>No notes added</strong>
                                        <span>Add notes for this patient</span>
                                        <div className="upp-note-write-icon">
                                            <FiEdit3 />
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <div className="upp-list-items">
                                    {notesItems.slice(0, 3).sort((a, b) => new Date(b.date) - new Date(a.date)).map((item, i) => (
                                        <div key={i} className="upp-list-card" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                                            <span className="upp-list-sub">{new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                                            <span className="upp-list-title" style={{ whiteSpace: 'normal' }}>{item.data.notes.substring(0, 80)}{item.data.notes.length > 80 ? '...' : ''}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
            )}

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
