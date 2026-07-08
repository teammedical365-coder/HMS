import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patientAPI, publicAPI, receptionAPI } from '../../utils/api';
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
    FiUserCheck, 
    FiAlertCircle, 
    FiFileText, 
    FiPlus,
    FiEye 
} from 'react-icons/fi';
import './UnifiedPatientProfile.css';

import ClinicPatientProfile from './ClinicPatientProfile';

const UnifiedPatientProfile = () => {
    const { id: patientId } = useParams();
    const navigate = useNavigate();

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (currentUser?.clinicType === 'clinic') {
        return <ClinicPatientProfile />;
    }

    // Data States
    const [patientData, setPatientData] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('timeline');

    // Booking Modal States
    const [bookingModalOpen, setBookingModalOpen] = useState(false);
    const [doctorsList, setDoctorsList] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [bookingForm, setBookingForm] = useState({
        department: '',
        doctor: '',
        date: new Date().toISOString().split('T')[0],
        time: '',
        notes: '',
        paymentMethod: 'Cash',
        fee: 500
    });
    const [bookedSlots, setBookedSlots] = useState([]);
    const [checkingSlots, setCheckingSlots] = useState(false);
    const [bookingSaving, setBookingSaving] = useState(false);
    const [lastApptDate, setLastApptDate] = useState(null);
    const [followUpDaysMsg, setFollowUpDaysMsg] = useState('');

    const timeSlots = [
        '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
        '16:00', '16:30', '17:00', '17:30'
    ];

    useEffect(() => {
        if (patientId) {
            fetchProfile();
            fetchDoctorsAndDeps();
        }
    }, [patientId]);

    const fetchProfile = async () => {
        setLoading(true);
        try {
            const res = await patientAPI.getFullHistory(patientId);
            if (res.success) {
                setPatientData(res.user);
                const historyTimeline = res.timeline || [];
                setTimeline(historyTimeline);

                // Find the latest completed/confirmed appointment for follow-up calculation
                const appts = historyTimeline
                    .filter(t => t.type === 'appointment' && ['completed', 'confirmed'].includes(t.data?.status))
                    .map(t => new Date(t.date))
                    .sort((a, b) => b - a);
                if (appts.length > 0) {
                    setLastApptDate(appts[0]);
                }
            }
        } catch (err) {
            console.error("Error fetching unified profile", err);
            setError('Failed to load patient history or unauthorized access.');
        } finally {
            setLoading(false);
        }
    };

    const fetchDoctorsAndDeps = async () => {
        try {
            const res = await publicAPI.getDoctors();
            if (res.success && Array.isArray(res.doctors)) {
                setDoctorsList(res.doctors);
                const deps = [...new Set(res.doctors.map(d => d.specialization || d.department).filter(Boolean))];
                setDepartments(deps);
            }
        } catch (err) {
            console.error("Error loading doctors:", err);
        }
    };

    // Load slots on doctor / date change
    useEffect(() => {
        if (bookingForm.doctor && bookingForm.date) {
            loadSlots(bookingForm.doctor, bookingForm.date);
        }
    }, [bookingForm.doctor, bookingForm.date]);

    // Recalculate fee on doctor/date change
    useEffect(() => {
        calculateFollowUpFee();
    }, [bookingForm.date, bookingForm.doctor, lastApptDate]);

    const loadSlots = async (doctorId, date) => {
        setCheckingSlots(true);
        try {
            const res = await receptionAPI.getBookedSlots(doctorId, date);
            if (res.success) {
                setBookedSlots(res.bookedSlots || []);
            }
        } catch (err) {
            console.error("Error loading slots:", err);
        } finally {
            setCheckingSlots(false);
        }
    };

    const calculateFollowUpFee = () => {
        if (!bookingForm.doctor) return;
        const selectedDoc = doctorsList.find(d => d._id === bookingForm.doctor);
        if (!selectedDoc) return;

        const baseConsultationFee = selectedDoc.consultationFee || 500;
        const baseFollowUpFee = selectedDoc.followUpFee || 300;
        const followUpDaysLimit = selectedDoc.followUpDays || 10;

        if (!lastApptDate) {
            setBookingForm(prev => ({ ...prev, fee: baseConsultationFee }));
            setFollowUpDaysMsg('New consult: Base consultation fee applies');
            return;
        }

        const dateDiffMs = new Date(bookingForm.date).getTime() - new Date(lastApptDate).getTime();
        const diffDays = Math.ceil(dateDiffMs / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= followUpDaysLimit) {
            setBookingForm(prev => ({ ...prev, fee: baseFollowUpFee }));
            setFollowUpDaysMsg(`Follow-up consult within ${followUpDaysLimit} days: Follow-up fee applies`);
        } else {
            setBookingForm(prev => ({ ...prev, fee: baseConsultationFee }));
            setFollowUpDaysMsg(`Consultation outside follow-up window (> ${followUpDaysLimit} days): Standard fee applies`);
        }
    };

    const handleBookingSubmit = async (e) => {
        e.preventDefault();
        if (!bookingForm.doctor || !bookingForm.time || !bookingForm.date) {
            alert('Please fill in Date, Doctor, and Time Slot.');
            return;
        }

        setBookingSaving(true);
        try {
            const selectedDoc = doctorsList.find(d => d._id === bookingForm.doctor);
            const payload = {
                userId: patientData._id,
                patientId: patientData.patientId,
                doctorId: bookingForm.doctor,
                doctorName: selectedDoc ? selectedDoc.name : 'Doctor',
                serviceName: 'Consultation',
                appointmentDate: bookingForm.date,
                appointmentTime: bookingForm.time,
                amount: bookingForm.fee,
                paymentStatus: bookingForm.paymentMethod === 'Cash' ? 'paid' : 'pending',
                paymentMethod: bookingForm.paymentMethod,
                notes: bookingForm.notes
            };

            const res = await receptionAPI.createAppointment(payload);
            if (res.success) {
                alert('Appointment booked successfully!');
                setBookingModalOpen(false);
                fetchProfile();
            } else {
                alert(res.message || 'Booking failed');
            }
        } catch (err) {
            console.error("Booking error:", err);
            alert('Error booking appointment');
        } finally {
            setBookingSaving(false);
        }
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

        timeline.forEach(t => {
            const amt = t.data?.amount || t.data?.totalAmount || 0;
            const pStatus = (t.data?.paymentStatus || '').toLowerCase();
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

    // Export PDF Summary
    const handleDownloadPDF = () => {
        if (!patientData) return;
        const doc = new jsPDF();
        const fp = patientData.fertilityProfile || {};
        
        // Title banner
        doc.setFillColor(99, 102, 241);
        doc.rect(0, 0, 210, 40, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(255, 255, 255);
        doc.text("HOSPITAL PATIENT PROFILE SUMMARY", 15, 26);

        // Patient details
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Patient Name:", 15, 55);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.name || '—', 50, 55);

        doc.setFont("helvetica", "bold");
        doc.text("Patient ID (MRN):", 15, 63);
        doc.setFont("helvetica", "normal");
        doc.text(patientData.patientId || '—', 50, 63);

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
        doc.text(fp.allergies || 'None', 150, 71);

        // Vitals box (from latest consult or fertilityProfile)
        doc.setFillColor(248, 250, 252);
        doc.rect(15, 80, 180, 26, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(99, 102, 241);
        doc.text("LATEST RECORDED VITALS", 20, 88);
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "normal");
        
        doc.text(`Weight: ${fp.weight || '—'} kg`, 20, 98);
        doc.text(`Height: ${fp.height || '—'} cm`, 65, 98);
        doc.text(`BP: ${fp.historyBp || '—'}`, 110, 98);
        doc.text(`Pulse: ${fp.historyPulse || '—'} bpm`, 150, 98);

        // Visits table
        const appointments = timeline.filter(t => t.type === 'appointment');
        const rows = appointments.map(a => [
            new Date(a.date).toLocaleDateString('en-IN'),
            a.data?.doctorName || 'Doctor',
            a.data?.diagnosis || '—',
            a.data?.doctorNotes || '—',
            a.data?.status || 'Pending'
        ]);

        autoTable(doc, {
            startY: 115,
            head: [['Date', 'Doctor', 'Diagnosis', 'Doctor Consultation Notes', 'Status']],
            body: rows,
            headStyles: { fillColor: [99, 102, 241] },
            theme: 'striped',
            margin: { horizontal: 15 }
        });

        doc.save(`Patient_Profile_${patientData.patientId || 'summary'}.pdf`);
    };

    if (loading) {
        return (
            <div className="upp-loading-screen">
                <div className="upp-spinner"></div>
                <p>Loading patient history details...</p>
            </div>
        );
    }

    if (error || !patientData) {
        return (
            <div className="upp-loading-screen">
                <FiAlertCircle size={48} color="#ef4444" />
                <p>{error || 'Patient profile not found.'}</p>
                <button className="upp-btn-action" onClick={() => navigate(-1)} style={{ background: '#64748b' }}>
                    <FiArrowLeft /> Go Back
                </button>
            </div>
        );
    }

    const metrics = calculateMetrics();
    const fp = patientData.fertilityProfile || {};
    
    // Spreading role check for booking modal view
    const isStaff = ['reception', 'receptionist', 'admin', 'superadmin', 'hospitaladmin', 'cashier'].some(
        r => (currentUser.role || '').toLowerCase().includes(r)
    );

    // Medicines extraction
    const getMedicinesList = () => {
        const list = [];
        timeline.forEach(t => {
            if (t.type === 'appointment' && t.data?.pharmacy) {
                t.data.pharmacy.forEach(m => {
                    list.push({
                        name: m.medicineName,
                        salt: m.saltName || '—',
                        frequency: m.frequency,
                        duration: m.duration,
                        date: t.date,
                        source: 'Consultation'
                    });
                });
            } else if (t.type === 'pharmacyOrder' && t.data?.items) {
                t.data.items.forEach(m => {
                    list.push({
                        name: m.medicineName,
                        salt: '—',
                        frequency: '—',
                        duration: `Qty: ${m.quantity}`,
                        date: t.date,
                        source: 'Pharmacy Order'
                    });
                });
            }
        });
        return list;
    };
    const medicinesList = getMedicinesList();

    // Financials Billing extraction
    const getInvoicesList = () => {
        const list = [];
        timeline.forEach(t => {
            if (t.type === 'appointment' && t.data?.amount > 0) {
                list.push({
                    date: t.date,
                    desc: 'Consultation Fee',
                    amount: t.data.amount,
                    method: t.data.paymentMethod || 'Cash',
                    status: t.data.paymentStatus || 'Pending'
                });
            } else if (t.type === 'labReport' && t.data?.amount > 0) {
                list.push({
                    date: t.date,
                    desc: `Lab Tests: ${(t.data.testNames || []).join(', ')}`,
                    amount: t.data.amount,
                    method: t.data.paymentMode || 'ONLINE',
                    status: t.data.paymentStatus || 'PENDING'
                });
            } else if (t.type === 'pharmacyOrder' && t.data?.totalAmount > 0) {
                list.push({
                    date: t.date,
                    desc: 'Pharmacy Prescription Order',
                    amount: t.data.totalAmount,
                    method: 'ONLINE',
                    status: t.data.paymentStatus || 'PENDING'
                });
            }
        });
        return list;
    };
    const invoicesList = getInvoicesList();

    return (
        <div className="upp-container">
            {/* Header Identity Card */}
            <div className="upp-header-card">
                <div className="upp-identity">
                    <div className="upp-avatar">
                        {(patientData.name || 'P')[0].toUpperCase()}
                    </div>
                    <div className="upp-info">
                        <h1>{patientData.name}</h1>
                        <div className="upp-tags">
                            <span className="upp-tag upp-tag-primary">MRN: {patientData.patientId || 'N/A'}</span>
                            <span className="upp-tag">📱 {patientData.phone}</span>
                            <span className="upp-tag">🩸 Blood: {patientData.bloodGroup || '—'}</span>
                            <span className="upp-tag">👤 {patientData.gender}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="upp-btn-action" onClick={() => navigate(-1)} style={{ background: '#64748b' }}>
                        <FiArrowLeft /> Back
                    </button>
                    {isStaff && (
                        <button className="upp-btn-action" onClick={() => setBookingModalOpen(true)} style={{ background: '#6366f1' }}>
                            <FiPlus /> Book Consult
                        </button>
                    )}
                    <button className="upp-btn-action" onClick={handleDownloadPDF}>
                        <FiDownload /> Export Summary
                    </button>
                </div>
            </div>

            {/* Quick Metrics Cards Grid */}
            <div className="upp-metrics">
                <div className="upp-metric-card metric-visits">
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Total Visits</span>
                        <span className="upp-metric-val">{metrics.totalVisits}</span>
                    </div>
                    <div className="upp-metric-icon"><FiUserCheck /></div>
                </div>
                <div className="upp-metric-card metric-upcoming">
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Upcoming</span>
                        <span className="upp-metric-val">{metrics.upcomingCount}</span>
                    </div>
                    <div className="upp-metric-icon"><FiCalendar /></div>
                </div>
                <div className="upp-metric-card metric-paid">
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Total Paid</span>
                        <span className="upp-metric-val">₹{metrics.totalPaid}</span>
                    </div>
                    <div className="upp-metric-icon"><FiDollarSign /></div>
                </div>
                <div className="upp-metric-card metric-pending">
                    <div className="upp-metric-info">
                        <span className="upp-metric-label">Pending Dues</span>
                        <span className="upp-metric-val">₹{metrics.pendingDues}</span>
                    </div>
                    <div className="upp-metric-icon"><FiAlertCircle /></div>
                </div>
            </div>

            {/* Sidebar and content grid */}
            <div className="upp-content-grid">
                
                {/* Left Sidebar Demographics */}
                <div className="upp-sidebar">
                    {/* Demographics Card */}
                    <div className="upp-card">
                        <h3 className="upp-card-title"><FiUserCheck /> Demographics</h3>
                        <div className="upp-details-list">
                            <div className="upp-detail-item">
                                <span className="upp-detail-lbl">Full Name</span>
                                <span className="upp-detail-val">{patientData.name}</span>
                            </div>
                            <div className="upp-detail-item">
                                <span className="upp-detail-lbl">Email Address</span>
                                <span className="upp-detail-val">{patientData.email || 'No email registered'}</span>
                            </div>
                            <div className="upp-detail-item">
                                <span className="upp-detail-lbl">Date of Birth</span>
                                <span className="upp-detail-val">
                                    {patientData.dob ? new Date(patientData.dob).toLocaleDateString('en-IN') : '—'}
                                </span>
                            </div>
                            <div className="upp-detail-item">
                                <span className="upp-detail-lbl">Address</span>
                                <span className="upp-detail-val">{patientData.address || fp.address || '—'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Clinical Profile Card */}
                    <div className="upp-card">
                        <h3 className="upp-card-title" style={{ color: '#f59e0b' }}><FiAlertCircle /> Clinical Profile</h3>
                        <div className="upp-details-list">
                            <div className="upp-detail-item">
                                <span className="upp-detail-lbl">Allergies</span>
                                <span className="upp-detail-val" style={{ color: fp.allergies ? '#ef4444' : 'inherit' }}>
                                    {fp.allergies || 'No allergies recorded'}
                                </span>
                            </div>
                            <div className="upp-detail-item">
                                <span className="upp-detail-lbl">Chronic Conditions</span>
                                <span className="upp-detail-val">
                                    {fp.chronicConditions || 'No chronic conditions'}
                                </span>
                            </div>
                            <div className="cpp-detail-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px' }}>
                                <span className="upp-detail-lbl">Clinical / General Notes</span>
                                <span className="upp-detail-val">
                                    {fp.doctorNotes || 'No clinical notes added'}
                                </span>
                            </div>
                            <div className="cpp-detail-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px' }}>
                                <span className="upp-detail-lbl">Intake symptoms</span>
                                <span className="upp-detail-val">
                                    {fp.medicalNotes || fp.notes || 'No intake notes added'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel Main Contents */}
                <div className="upp-main-panel">
                    
                    {/* Horizontal Nav Tabs */}
                    <div className="upp-tabs-bar">
                        <button 
                            className={`upp-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                            onClick={() => setActiveTab('timeline')}
                        >
                            📋 Visit History ({timeline.filter(t => t.type === 'appointment' || t.type === 'clinicalVisit').length})
                        </button>
                        <button 
                            className={`upp-tab-btn ${activeTab === 'medicines' ? 'active' : ''}`}
                            onClick={() => setActiveTab('medicines')}
                        >
                            💊 Medicines ({medicinesList.length})
                        </button>
                        <button 
                            className={`upp-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
                            onClick={() => setActiveTab('reports')}
                        >
                            🧪 Lab Reports ({timeline.filter(t => t.type === 'labReport').length})
                        </button>
                        <button 
                            className={`upp-tab-btn ${activeTab === 'billing' ? 'active' : ''}`}
                            onClick={() => setActiveTab('billing')}
                        >
                            💰 Financials ({invoicesList.length})
                        </button>
                    </div>

                    {/* Tab Panels */}
                    {activeTab === 'timeline' && (
                        <div className="upp-card">
                            <h3 className="upp-card-title"><FiFileText /> Visit Consultation Log</h3>
                            {timeline.filter(t => t.type === 'appointment' || t.type === 'clinicalVisit').length === 0 ? (
                                <div className="upp-empty-state">No consult history logs recorded.</div>
                            ) : (
                                <div className="upp-timeline">
                                    {timeline
                                        .filter(t => t.type === 'appointment' || t.type === 'clinicalVisit')
                                        .map((item, idx) => {
                                            const dateStr = new Date(item.date).toLocaleDateString('en-IN', {
                                                day: '2-digit', month: 'short', year: 'numeric'
                                            });
                                            const timeStr = item.data?.appointmentTime || '';
                                            const diag = item.data?.diagnosis || 'No diagnosis logged';
                                            const status = item.data?.status || 'completed';
                                            
                                            // Vitals mapping
                                            const apptVitals = item.data?.vitals || {};
                                            const hasVitals = apptVitals.weight || apptVitals.height || apptVitals.bp || apptVitals.temperature || apptVitals.pulse;

                                            return (
                                                <div key={idx} className="upp-timeline-item">
                                                    <div className="upp-tl-head">
                                                        <div className="upp-tl-meta">
                                                            <span className="upp-tl-date">{dateStr} {timeStr && `• ${timeStr}`}</span>
                                                            <span className="upp-tl-doctor">Dr. {item.data?.doctorName || 'Doctor'}</span>
                                                        </div>
                                                        <span className={`upp-tl-badge badge-${status.toLowerCase()}`}>
                                                            {status}
                                                        </span>
                                                    </div>
                                                    <div className="upp-tl-body">
                                                        <div className="upp-tl-section">
                                                            <span className="upp-tl-lbl">Diagnosis</span>
                                                            <span className="upp-tl-val" style={{ fontWeight: '700' }}>{diag}</span>
                                                        </div>
                                                        {item.data?.notes && (
                                                            <div className="upp-tl-section">
                                                                <span className="upp-tl-lbl">Symptoms / Chief Complaint</span>
                                                                <span className="upp-tl-val">{item.data.notes}</span>
                                                            </div>
                                                        )}
                                                        {item.data?.doctorNotes && (
                                                            <div className="upp-tl-section">
                                                                <span className="upp-tl-lbl">Consultation notes</span>
                                                                <span className="upp-tl-val">{item.data.doctorNotes}</span>
                                                            </div>
                                                        )}
                                                        {/* Vitals summary */}
                                                        {hasVitals && (
                                                            <div className="upp-tl-section">
                                                                <span className="upp-tl-lbl">Intake Vitals</span>
                                                                <div className="upp-tl-vitals">
                                                                    {apptVitals.weight && <span className="upp-tl-vital-pill">⚖️ Weight: {apptVitals.weight}kg</span>}
                                                                    {apptVitals.height && <span className="upp-tl-vital-pill">📏 Height: {apptVitals.height}cm</span>}
                                                                    {apptVitals.bp && <span className="upp-tl-vital-pill">🩸 BP: {apptVitals.bp}</span>}
                                                                    {apptVitals.temperature && <span className="upp-tl-vital-pill">🌡️ Temp: {apptVitals.temperature}°F</span>}
                                                                    {apptVitals.pulse && <span className="upp-tl-vital-pill">💓 Pulse: {apptVitals.pulse}</span>}
                                                                </div>
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

                    {activeTab === 'medicines' && (
                        <div className="upp-card">
                            <h3 className="upp-card-title"><FiActivity /> Prescribed Medicines Log</h3>
                            {medicinesList.length === 0 ? (
                                <div className="upp-empty-state">No prescribed medicines records found.</div>
                            ) : (
                                <div className="upp-table-wrap">
                                    <table className="upp-table">
                                        <thead>
                                            <tr>
                                                <th>Date Prescribed</th>
                                                <th>Medicine Name</th>
                                                <th>Generic Salt</th>
                                                <th>Frequency</th>
                                                <th>Duration / Qty</th>
                                                <th>Source</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {medicinesList.map((med, idx) => (
                                                <tr key={idx}>
                                                    <td><strong>{new Date(med.date).toLocaleDateString('en-IN')}</strong></td>
                                                    <td style={{ color: 'var(--upp-primary)', fontWeight: '700' }}>{med.name}</td>
                                                    <td>{med.salt}</td>
                                                    <td><span style={{ background: 'var(--upp-secondary-light)', color: 'var(--upp-secondary)', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>{med.frequency}</span></td>
                                                    <td>{med.duration}</td>
                                                    <td><span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{med.source}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'reports' && (
                        <div className="upp-card">
                            <h3 className="upp-card-title"><FiFileText /> Uploaded Documents & Reports</h3>
                            {timeline.filter(t => t.type === 'labReport').length === 0 ? (
                                <div className="upp-empty-state">No lab reports found.</div>
                            ) : (
                                <div className="upp-table-wrap">
                                    <table className="upp-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Test Names</th>
                                                <th>Amount</th>
                                                <th>Status</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {timeline
                                                .filter(t => t.type === 'labReport')
                                                .map((rep, idx) => (
                                                    <tr key={idx}>
                                                        <td><strong>{new Date(rep.date).toLocaleDateString('en-IN')}</strong></td>
                                                        <td>{(rep.data.testNames || []).join(', ') || 'Lab Report'}</td>
                                                        <td style={{ fontWeight: 'bold' }}>₹{rep.data.amount || 0}</td>
                                                        <td>
                                                            <span className={`upp-tl-badge badge-${(rep.data.testStatus || 'pending').toLowerCase()}`}>
                                                                {rep.data.testStatus}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            {rep.data.reportFile?.url ? (
                                                                <button 
                                                                    className="upp-btn-action" 
                                                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                                                    onClick={() => window.open(rep.data.reportFile.url, '_blank')}
                                                                >
                                                                    <FiEye /> View Report
                                                                </button>
                                                            ) : (
                                                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>File Pending</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'billing' && (
                        <div className="upp-card">
                            <h3 className="upp-card-title"><FiDollarSign /> Consultation Financial Details</h3>
                            {invoicesList.length === 0 ? (
                                <div className="upp-empty-state">No billing details logged yet.</div>
                            ) : (
                                <div className="upp-table-wrap">
                                    <table className="upp-table">
                                        <thead>
                                            <tr>
                                                <th>Billing Date</th>
                                                <th>Description</th>
                                                <th>Amount</th>
                                                <th>Payment Method</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoicesList.map((inv, idx) => (
                                                <tr key={idx}>
                                                    <td><strong>{new Date(inv.date).toLocaleDateString('en-IN')}</strong></td>
                                                    <td style={{ color: 'var(--upp-primary)', fontWeight: '600' }}>{inv.desc}</td>
                                                    <td style={{ color: '#10b981', fontWeight: '800' }}>₹{inv.amount}</td>
                                                    <td>{inv.method}</td>
                                                    <td>
                                                        <span className={`upp-tl-badge badge-${inv.status.toLowerCase()}`}>
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

            {/* BOOK AGAIN MODAL (PRESERVED FOR RECEPTION / STAFF ROLES) */}
            {bookingModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{ background: 'white', padding: '30px', borderRadius: '16px', width: '480px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', fontWeight: 800 }}>Book Appointment</h3>
                        <form onSubmit={handleBookingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Date</label>
                                <input 
                                    type="date" 
                                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                    value={bookingForm.date}
                                    onChange={e => setBookingForm(prev => ({ ...prev, date: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Department</label>
                                <select 
                                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                    value={bookingForm.department}
                                    onChange={e => setBookingForm(prev => ({ ...prev, department: e.target.value, doctor: '' }))}
                                >
                                    <option value="">Select Department</option>
                                    {departments.map((d, i) => <option key={i} value={d}>{d}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Doctor</label>
                                <select 
                                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                    value={bookingForm.doctor}
                                    onChange={e => setBookingForm(prev => ({ ...prev, doctor: e.target.value, time: '' }))}
                                    disabled={!bookingForm.department}
                                >
                                    <option value="">Select Doctor</option>
                                    {doctorsList
                                        .filter(d => (d.specialization || d.department) === bookingForm.department)
                                        .map((d, i) => <option key={i} value={d._id}>{d.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Time Slot</label>
                                <select 
                                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                    value={bookingForm.time}
                                    onChange={e => setBookingForm(prev => ({ ...prev, time: e.target.value }))}
                                    disabled={!bookingForm.doctor}
                                >
                                    <option value="">Select Slot</option>
                                    {timeSlots.map((slot, i) => {
                                        const isBooked = bookedSlots.includes(slot);
                                        return <option key={i} value={slot} disabled={isBooked}>{slot} {isBooked ? '(Booked)' : ''}</option>;
                                    })}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Fee (INR)</label>
                                <input 
                                    type="text" 
                                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc' }}
                                    value={`₹${bookingForm.fee}`}
                                    readOnly
                                />
                                {followUpDaysMsg && <span style={{ fontSize: '11px', color: '#6366f1', marginTop: '4px', display: 'block' }}>{followUpDaysMsg}</span>}
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Notes</label>
                                <textarea 
                                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', minHeight: '60px' }}
                                    value={bookingForm.notes}
                                    onChange={e => setBookingForm(prev => ({ ...prev, notes: e.target.value }))}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                                <button 
                                    type="button" 
                                    style={{ flex: 1, padding: '12px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                                    onClick={() => setBookingModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    style={{ flex: 1, padding: '12px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                                    disabled={bookingSaving}
                                >
                                    {bookingSaving ? 'Booking...' : 'Book'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UnifiedPatientProfile;
