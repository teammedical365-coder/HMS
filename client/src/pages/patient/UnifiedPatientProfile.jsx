import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { patientAPI, publicAPI, receptionAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './UnifiedPatientProfile.css';

const UnifiedPatientProfile = () => {
    const { id: patientId } = useParams();
    const navigate = useNavigate();

    // Data States
    const [patientData, setPatientData] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('overview');

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
                // Extract unique departments
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
        if (!bookingForm.date) return;
        if (!lastApptDate) {
            setBookingForm(prev => ({ ...prev, fee: 500 }));
            setFollowUpDaysMsg('');
            return;
        }

        const selected = new Date(bookingForm.date);
        const last = new Date(lastApptDate);
        // Clear times for exact days difference
        selected.setHours(0, 0, 0, 0);
        last.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(selected - last);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Let's assume hospital follow-up days threshold is 5 days
        const threshold = 5;
        if (diffDays <= threshold) {
            setBookingForm(prev => ({ ...prev, fee: 0 }));
            setFollowUpDaysMsg(`🎉 Free follow-up visit active! (within ${threshold} days of last visit on ${last.toLocaleDateString('en-IN')})`);
        } else {
            setBookingForm(prev => ({ ...prev, fee: 500 }));
            setFollowUpDaysMsg(`Last visit was ${diffDays} days ago (Follow-up period: ${threshold} days). Standard fee applies.`);
        }
    };

    const handleBookingSubmit = async (e) => {
        e.preventDefault();
        if (!bookingForm.doctor) {
            alert('Please select a doctor!');
            return;
        }
        if (!bookingForm.time) {
            alert('Please select a time slot!');
            return;
        }

        setBookingSaving(true);
        try {
            const selectedDoc = doctorsList.find(d => d._id === bookingForm.doctor);
            const res = await receptionAPI.bookAppointment({
                patientId: patientId,
                doctorId: bookingForm.doctor,
                date: bookingForm.date,
                time: bookingForm.time,
                notes: `Rebooking visit. Fee: ₹${bookingForm.fee}. Note: ${bookingForm.notes}`,
                paymentMethod: bookingForm.paymentMethod,
                paymentStatus: bookingForm.fee === 0 ? 'Paid' : 'Pending',
                amount: bookingForm.fee
            });
            if (res.success) {
                alert(`Appointment booked successfully! Token: #${res.appointment?.tokenNumber || 'Slot Mode'}`);
                setBookingModalOpen(false);
                fetchProfile();
            } else {
                alert("Failed to book appointment: " + res.message);
            }
        } catch (err) {
            console.error("Booking error:", err);
            alert("Booking error: " + err.message);
        } finally {
            setBookingSaving(false);
        }
    };

    // Calculate Metrics
    const calculateMetrics = () => {
        let m = { totalPaid: 0, totalDue: 0, appointmentsCount: 0, upcomingAppointments: 0 };
        const now = new Date();
        now.setHours(0,0,0,0);

        timeline.forEach(item => {
            const data = item.data;
            if (item.type === 'appointment') {
                m.appointmentsCount++;
                if (new Date(data.appointmentDate) >= now && data.status !== 'cancelled' && data.status !== 'completed') {
                    m.upcomingAppointments++;
                }
                const amt = Number(data.amount) || 0;
                if (data.paymentStatus === 'paid' || data.paymentStatus === 'Paid') m.totalPaid += amt;
                else if (data.paymentStatus === 'pending' || data.paymentStatus === 'Pending') m.totalDue += amt;
            } else if (item.type === 'labReport') {
                const amt = Number(data.amount) || 0;
                if (data.paymentStatus === 'paid' || data.paymentStatus === 'Paid') m.totalPaid += amt;
                else if (data.paymentStatus === 'pending' || data.paymentStatus === 'Pending') m.totalDue += amt;
            } else if (item.type === 'pharmacyOrder') {
                const amt = Number(data.totalAmount) || 0;
                if (data.paymentStatus === 'paid' || data.paymentStatus === 'Paid') m.totalPaid += amt;
                else if (data.paymentStatus === 'pending' || data.paymentStatus === 'Pending') m.totalDue += amt;
            }
        });
        return m;
    };

    const generatePDF = () => {
        if (!patientData) return;
        const doc = new jsPDF();
        let y = 20;

        doc.setFontSize(22);
        doc.setTextColor(41, 128, 185);
        doc.text("PAWAN HARISH IVF CENTER", 105, y, { align: 'center' });
        y += 10;
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Complete Unified Patient Record", 105, y, { align: 'center' });
        y += 15;

        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.setFillColor(240, 240, 240);
        doc.rect(14, y, 182, 35, 'F');

        y += 10;
        doc.setFont("helvetica", "bold"); doc.text("Patient Name:", 18, y);
        doc.setFont("helvetica", "normal"); doc.text(`${patientData.name || '-'}`, 55, y);
        doc.setFont("helvetica", "bold"); doc.text("MRN / ID:", 120, y);
        doc.setFont("helvetica", "normal"); doc.text(`${patientData.patientId || '-'}`, 150, y);

        y += 10;
        doc.setFont("helvetica", "bold"); doc.text("Phone:", 18, y);
        doc.setFont("helvetica", "normal"); doc.text(`${patientData.phone || '-'}`, 55, y);
        doc.setFont("helvetica", "bold"); doc.text("DOB:", 120, y);
        doc.setFont("helvetica", "normal"); doc.text(`${patientData.dob ? new Date(patientData.dob).toLocaleDateString() : '-'}`, 150, y);

        y += 10;
        doc.setFont("helvetica", "bold"); doc.text("Gender:", 18, y);
        doc.setFont("helvetica", "normal"); doc.text(`${patientData.gender || '-'}`, 55, y);
        doc.setFont("helvetica", "bold"); doc.text("Report Date:", 120, y);
        doc.setFont("helvetica", "normal"); doc.text(`${new Date().toLocaleDateString()}`, 150, y);

        y += 20;
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Comprehensive Medical & Financial History", 14, y);
        y += 8;

        const tableBody = timeline.map(item => {
            const d = new Date(item.date).toLocaleDateString();
            let desc = '';
            let amount = '-';
            let payStatus = '-';

            if (item.type === 'appointment') {
                desc = `Appointment w/ ${item.data.doctorName || 'Doctor'} - ${item.data.serviceName || 'Consultation'}`;
                amount = `₹${item.data.amount || 0}`;
                payStatus = item.data.paymentStatus || 'pending';
            } else if (item.type === 'clinicalVisit') {
                desc = `Clinical Visit - ${item.summary?.outcome || 'Session Recorded'}`;
            } else if (item.type === 'labReport') {
                desc = `Lab Order: ${(item.data.testNames || []).join(', ')}`;
                amount = `₹${item.data.amount || 0}`;
                payStatus = item.data.paymentStatus || 'pending';
            } else if (item.type === 'pharmacyOrder') {
                desc = `Pharmacy Order (${item.data.items?.length || 0} items)`;
                amount = `₹${item.data.totalAmount || 0}`;
                payStatus = item.data.paymentStatus || 'pending';
            }
            return [d, item.type.toUpperCase(), desc, amount, payStatus];
        });

        autoTable(doc, {
            startY: y,
            head: [['Date', 'Category', 'Description/Details', 'Amount', 'Payment status']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            columnStyles: { 2: { cellWidth: 80 } }
        });

        doc.save(`Patient_Profile_${patientData.patientId || patientData._id}.pdf`);
    };

    if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: '#64748b' }}>Loading unified profile...</div>;
    if (error || !patientData) return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ color: 'red' }}>{error || 'Patient not found.'}</p>
            <button onClick={() => navigate(-1)} style={{ padding: '8px 16px', cursor: 'pointer' }}>← Go Back</button>
        </div>
    );

    const metrics = calculateMetrics();
    const fp = patientData.fertilityProfile || {};
    const vitals = fp.vitals || {};

    const tabs = [
        { key: 'overview', label: '📋 Overview' },
        { key: 'details', label: '👤 Demographics' },
        { key: 'appointments', label: '📅 Visits History' },
        { key: 'vitals', label: '💓 Vitals' },
        { key: 'reports', label: '🧪 Lab Reports' },
        { key: 'prescriptions', label: '💊 Prescriptions' },
        { key: 'treatment', label: '🩺 Treatment History' },
        { key: 'notes', label: '📝 Notes' },
        { key: 'timeline', label: '🕐 Timeline Logs' },
        { key: 'billing', label: '💰 Billing & Invoices' },
        { key: 'consultations', label: '💬 Consult Sessions' }
    ];

    const renderField = (label, value) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <span style={{ color: '#1e293b', fontSize: '0.9rem', fontWeight: '600' }}>{value || '—'}</span>
        </div>
    );

    return (
        <div className="upp-container" style={{ padding: '24px', background: '#f8fafc', minHeight: '100vh' }}>
            
            {/* Header profile card */}
            <div className="upp-header-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div className="upp-identity" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div className="upp-avatar" style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#ffffff', fontSize: '2rem', fontWeight: '800', display: 'flex', alignItems: 'center', justifyText: 'center', justifyContent: 'center' }}>
                        {(patientData.name || 'P')[0].toUpperCase()}
                    </div>
                    <div className="upp-info">
                        <h1 style={{ margin: '0 0 6px', fontSize: '1.6rem', color: '#0f172a', fontWeight: 800 }}>{patientData.name}</h1>
                        <div className="upp-tags" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <span className="upp-tag" style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>MRN: {patientData.patientId || 'N/A'}</span>
                            <span className="upp-tag" style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>📱 {patientData.phone}</span>
                            <span className="upp-tag" style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>🩸 {fp.bloodGroup || 'O-'}</span>
                            <span className="upp-tag" style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>Age: {fp.age || '—'} yrs</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={generatePDF} style={{ padding: '10px 18px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: '#475569' }}>
                        📄 Download History
                    </button>
                    <button onClick={() => setBookingModalOpen(true)} style={{ padding: '10px 20px', background: '#2563eb', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: '#ffffff', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)' }}>
                        ➕ Book Again
                    </button>
                </div>
            </div>

            {/* Metrics cards grid */}
            <div className="upp-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div className="upp-metric-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', borderLeft: '4px solid #2563eb' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Total Visits</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1e293b', marginTop: '4px' }}>{metrics.appointmentsCount}</span>
                </div>
                <div className="upp-metric-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', borderLeft: '4px solid #eab308' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Upcoming Appts</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1e293b', marginTop: '4px' }}>{metrics.upcomingAppointments}</span>
                </div>
                <div className="upp-metric-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', borderLeft: '4px solid #ef4444' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Pending Dues</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#ef4444', marginTop: '4px' }}>₹{metrics.totalDue}</span>
                </div>
                <div className="upp-metric-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', borderLeft: '4px solid #16a34a' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Total Paid</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#16a34a', marginTop: '4px' }}>₹{metrics.totalPaid}</span>
                </div>
            </div>

            {/* Clinic-Style Tabs bar */}
            <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '12px', marginBottom: '24px', overflowX: 'auto', border: '1px solid #e2e8f0' }}>
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        style={{
                            padding: '10px 18px',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '700',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s',
                            background: activeTab === t.key ? '#ffffff' : 'transparent',
                            color: activeTab === t.key ? '#2563eb' : '#64748b',
                            boxShadow: activeTab === t.key ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* TAB CONTENTS CONTAINER */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                
                {/* 1. OVERVIEW TAB */}
                {activeTab === 'overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 14px', color: '#0f172a', fontWeight: 800 }}>👤 Quick Demographics</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                                {renderField('Gender', patientData.gender)}
                                {renderField('Date of Birth', patientData.dob ? new Date(patientData.dob).toLocaleDateString() : '')}
                                {renderField('Alt Phone', fp.altPhone)}
                                {renderField('Email Address', patientData.email)}
                                {renderField('Relative Name', fp.partnerFirstName ? `${fp.partnerTitle || ''} ${fp.partnerFirstName} ${fp.partnerLastName || ''}` : '')}
                                {renderField('Relation', fp.relationToPatient)}
                                {renderField('Category', fp.patientCategory)}
                                {renderField('Referral Source', fp.referralType)}
                            </div>
                        </div>

                        <div style={{ marginTop: '10px' }}>
                            <h3 style={{ margin: '0 0 14px', color: '#0f172a', fontWeight: 800 }}>🕐 Recent Visits History</h3>
                            {timeline.filter(t => t.type === 'appointment').length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No recent visits recorded.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {timeline
                                        .filter(t => t.type === 'appointment')
                                        .slice(0, 3)
                                        .map((apt, idx) => (
                                            <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', background: '#f8fafc' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <span style={{ fontWeight: 700, color: '#1e293b' }}>Dr. {apt.data.doctorName || 'Doctor'}</span>
                                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(apt.date).toLocaleDateString('en-IN')}</span>
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                                                    <strong>Diagnosis:</strong> {apt.data.diagnosis || 'No diagnosis recorded yet'}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 2. DEMOGRAPHICS DETAILS TAB */}
                {activeTab === 'details' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                        {renderField('Title', fp.title)}
                        {renderField('First Name', fp.firstName)}
                        {renderField('Last Name', fp.lastName)}
                        {renderField('Email Address', patientData.email)}
                        {renderField('Phone / Mobile', patientData.phone)}
                        {renderField('Alt Phone', fp.altPhone)}
                        {renderField('Age', fp.age)}
                        {renderField('Gender', patientData.gender)}
                        {renderField('Address', fp.address || patientData.address)}
                        {renderField('Relative Name', fp.partnerFirstName ? `${fp.partnerTitle || ''} ${fp.partnerFirstName} ${fp.partnerLastName || ''}` : '')}
                        {renderField('Relative Contact', fp.partnerMobile)}
                        {renderField('Relation Type', fp.relationToPatient)}
                    </div>
                )}

                {/* 3. APPOINTMENTS HISTORY TAB */}
                {activeTab === 'appointments' && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #edf2f7' }}>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Date</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Doctor</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Service</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Fee Paid</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {timeline.filter(t => t.type === 'appointment').length === 0 ? (
                                    <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No appointments records.</td></tr>
                                ) : (
                                    timeline
                                        .filter(t => t.type === 'appointment')
                                        .map((apt, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #edf2f7' }}>
                                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>{new Date(apt.date).toLocaleDateString('en-IN')}</td>
                                                <td style={{ padding: '12px 14px' }}>Dr. {apt.data.doctorName || 'Doctor'}</td>
                                                <td style={{ padding: '12px 14px' }}>{apt.data.serviceName || 'Consultation'}</td>
                                                <td style={{ padding: '12px 14px', fontWeight: 'bold' }}>₹{apt.data.amount}</td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '20px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        background: apt.data.status === 'confirmed' ? '#dcfce7' : '#fef3c7',
                                                        color: apt.data.status === 'confirmed' ? '#15803d' : '#b45309'
                                                    }}>
                                                        {apt.data.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 4. VITALS TAB */}
                {activeTab === 'vitals' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                        {renderField('Height (cm)', fp.height)}
                        {renderField('Weight (kg)', fp.weight)}
                        {renderField('BMI', fp.bmi)}
                        {renderField('Blood Group', fp.bloodGroup || vitals.bloodGroup)}
                        {renderField('Pulse Rate (bpm)', vitals.pulse || fp.historyPulse)}
                        {renderField('Blood Pressure (BP)', vitals.bp || fp.historyBp)}
                        {renderField('Temperature (°F)', vitals.temperature)}
                        {renderField('SPO2 (%)', vitals.spo2)}
                    </div>
                )}

                {/* 5. REPORTS TAB */}
                {activeTab === 'reports' && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #edf2f7' }}>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Date</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Test / Report Name</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Amount</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {timeline.filter(t => t.type === 'labReport').length === 0 ? (
                                    <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No lab reports uploaded.</td></tr>
                                ) : (
                                    timeline
                                        .filter(t => t.type === 'labReport')
                                        .map((rep, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #edf2f7' }}>
                                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>{new Date(rep.date).toLocaleDateString('en-IN')}</td>
                                                <td style={{ padding: '12px 14px' }}>{(rep.data.testNames || []).join(', ') || 'Lab Test'}</td>
                                                <td style={{ padding: '12px 14px', fontWeight: 'bold' }}>₹{rep.data.amount || 0}</td>
                                                <td style={{ padding: '12px 14px' }}>{rep.data.status}</td>
                                            </tr>
                                        ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 6. PRESCRIPTIONS TAB */}
                {activeTab === 'prescriptions' && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #edf2f7' }}>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Date</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Medicines Prescribed</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Amount</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Payment</th>
                                </tr>
                            </thead>
                            <tbody>
                                {timeline.filter(t => t.type === 'pharmacyOrder').length === 0 ? (
                                    <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No prescriptions pharmacy history.</td></tr>
                                ) : (
                                    timeline
                                        .filter(t => t.type === 'pharmacyOrder')
                                        .map((ph, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #edf2f7' }}>
                                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>{new Date(ph.date).toLocaleDateString('en-IN')}</td>
                                                <td style={{ padding: '12px 14px' }}>{ph.data.items?.map(it => `${it.medicineName} (${it.quantity})`).join(', ') || 'Medicines'}</td>
                                                <td style={{ padding: '12px 14px', fontWeight: 'bold' }}>₹{ph.data.totalAmount || 0}</td>
                                                <td style={{ padding: '12px 14px' }}>{ph.data.paymentStatus}</td>
                                            </tr>
                                        ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 7. TREATMENT HISTORY TAB */}
                {activeTab === 'treatment' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {timeline.filter(t => t.type === 'treatmentPlan').length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No treatment plans recorded.</div>
                        ) : (
                            timeline
                                .filter(t => t.type === 'treatmentPlan')
                                .map((tp, idx) => (
                                    <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', background: '#f8fafc' }}>
                                        <h4 style={{ margin: '0 0 8px', color: '#2563eb', fontSize: '1.05rem', fontWeight: 700 }}>{tp.data.title}</h4>
                                        <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#475569' }}>{tp.data.description}</p>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                            <strong>Status:</strong> {tp.data.status} · <strong>Amount:</strong> ₹{tp.data.totalAmount} (Paid: ₹{tp.data.totalPaid})
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>
                )}

                {/* 8. NOTES TAB */}
                {activeTab === 'notes' && (
                    <div style={{ whiteSpace: 'pre-wrap', color: '#334155', lineHeight: '1.6', fontSize: '0.95rem' }}>
                        {fp.doctorNotes || 'No custom notes logged on this patient profile.'}
                    </div>
                )}

                {/* 9. TIMELINE TAB */}
                {activeTab === 'timeline' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {timeline.map((t, i) => (
                            <div key={i} style={{ padding: '14px', borderLeft: '4px solid #3b82f6', background: '#f8fafc', borderRadius: '0 10px 10px 0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{t.type.toUpperCase()}</span>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(t.date).toLocaleString()}</span>
                                </div>
                                <span style={{ fontSize: '0.88rem', color: '#475569' }}>
                                    {t.type === 'appointment' ? `Appointment booked with Dr. ${t.data.doctorName}` : `Patient activity recorded`}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* 10. BILLING TAB */}
                {activeTab === 'billing' && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #edf2f7' }}>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Date</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Transaction ID</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Description</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Amount</th>
                                    <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {timeline.filter(t => t.type === 'appointment' || t.type === 'pharmacyOrder' || t.type === 'labReport').length === 0 ? (
                                    <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No billing records found.</td></tr>
                                ) : (
                                    timeline
                                        .filter(t => t.type === 'appointment' || t.type === 'pharmacyOrder' || t.type === 'labReport')
                                        .map((bill, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #edf2f7' }}>
                                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>{new Date(bill.date).toLocaleDateString('en-IN')}</td>
                                                <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>TXN-{bill.data._id?.slice(-8).toUpperCase()}</td>
                                                <td style={{ padding: '12px 14px' }}>{bill.type.toUpperCase()} Billing</td>
                                                <td style={{ padding: '12px 14px', fontWeight: 'bold' }}>₹{bill.data.amount || bill.data.totalAmount || 0}</td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '20px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        background: (bill.data.paymentStatus === 'paid' || bill.data.paymentStatus === 'Paid') ? '#dcfce7' : '#fef3c7',
                                                        color: (bill.data.paymentStatus === 'paid' || bill.data.paymentStatus === 'Paid') ? '#15803d' : '#b45309'
                                                    }}>
                                                        {bill.data.paymentStatus || 'pending'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 11. CONSULTATIONS TAB */}
                {activeTab === 'consultations' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {timeline.filter(t => t.type === 'appointment' && t.data.doctorNotes).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No clinical consult logs recorded.</div>
                        ) : (
                            timeline
                                .filter(t => t.type === 'appointment' && t.data.doctorNotes)
                                .map((c, i) => (
                                    <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#f8fafc' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>Dr. {c.data.doctorName || 'Doctor'}</span>
                                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(c.date).toLocaleDateString()}</span>
                                        </div>
                                        <div style={{ fontSize: '0.88rem', color: '#334155' }}>
                                            <strong>Diagnosis Outcome:</strong> {c.data.diagnosis || 'None'}
                                            <br />
                                            <strong>Notes:</strong> {c.data.doctorNotes}
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>
                )}

            </div>

            {/* BOOK AGAIN MODAL */}
            {bookingModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '28px',
                        width: '500px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                        fontFamily: 'Inter, sans-serif'
                    }}>
                        <h3 style={{ margin: '0 0 16px', color: '#1e293b', fontSize: '1.25rem', fontWeight: 800 }}>Book Appointment Again</h3>
                        
                        <form onSubmit={handleBookingSubmit}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                                
                                {/* Select Department */}
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>Department</label>
                                    <select 
                                        value={bookingForm.department} 
                                        onChange={e => setBookingForm({ ...bookingForm, department: e.target.value, doctor: '', time: '' })}
                                        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px' }}
                                        required
                                    >
                                        <option value="">Select Department</option>
                                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>

                                {/* Select Doctor */}
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>Doctor</label>
                                    <select 
                                        value={bookingForm.doctor} 
                                        onChange={e => setBookingForm({ ...bookingForm, doctor: e.target.value, time: '' })}
                                        disabled={!bookingForm.department}
                                        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px' }}
                                        required
                                    >
                                        <option value="">Select Doctor</option>
                                        {doctorsList
                                            .filter(d => (d.specialization || d.department) === bookingForm.department)
                                            .map(d => <option key={d._id} value={d._id}>{d.name}</option>)
                                        }
                                    </select>
                                </div>

                                {/* Appointment Date */}
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>Appointment Date</label>
                                    <input 
                                        type="date" 
                                        value={bookingForm.date} 
                                        onChange={e => setBookingForm({ ...bookingForm, date: e.target.value, time: '' })}
                                        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px' }}
                                        required
                                    />
                                </div>

                                {/* Availability Grid Slots */}
                                {bookingForm.doctor && bookingForm.date && (
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '6px' }}>Select Slot</label>
                                        {checkingSlots ? (
                                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Checking slot availability...</div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                                                {timeSlots.map(t => {
                                                    const isBooked = bookedSlots.includes(t);
                                                    const isSelected = bookingForm.time === t;
                                                    return (
                                                        <button
                                                            key={t}
                                                            type="button"
                                                            disabled={isBooked}
                                                            onClick={() => setBookingForm({ ...bookingForm, time: t })}
                                                            style={{
                                                                padding: '6px 4px',
                                                                border: isSelected ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                                                borderRadius: '6px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 600,
                                                                cursor: isBooked ? 'not-allowed' : 'pointer',
                                                                background: isSelected ? '#eff6ff' : isBooked ? '#f1f5f9' : '#ffffff',
                                                                color: isSelected ? '#2563eb' : isBooked ? '#94a3b8' : '#334155'
                                                            }}
                                                        >
                                                            {t}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Follow Up Alert / Consultation Fee */}
                                <div style={{ background: bookingForm.fee === 0 ? '#f0fdf4' : '#fafafa', border: bookingForm.fee === 0 ? '1px solid #bbf7d0' : '1px solid #cbd5e1', padding: '12px', borderRadius: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.9rem', color: '#1e293b' }}>
                                        <span>Consultation Fee:</span>
                                        <span style={{ color: bookingForm.fee === 0 ? '#16a34a' : '#1e293b' }}>
                                            {bookingForm.fee === 0 ? 'FREE' : `₹${bookingForm.fee}`}
                                        </span>
                                    </div>
                                    {followUpDaysMsg && (
                                        <div style={{ fontSize: '0.78rem', color: bookingForm.fee === 0 ? '#166534' : '#64748b', marginTop: '6px', fontWeight: 500 }}>
                                            {followUpDaysMsg}
                                        </div>
                                    )}
                                </div>

                                {/* Custom notes */}
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>Notes</label>
                                    <textarea 
                                        rows="2"
                                        placeholder="Reason or medical comments..."
                                        value={bookingForm.notes}
                                        onChange={e => setBookingForm({ ...bookingForm, notes: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontFamily: 'sans-serif', fontSize: '0.85rem' }}
                                    />
                                </div>

                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button 
                                    type="button" 
                                    onClick={() => setBookingModalOpen(false)}
                                    style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={bookingSaving}
                                    style={{ padding: '8px 24px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
                                >
                                    {bookingSaving ? 'Booking...' : 'Book Visit'}
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
