import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { receptionAPI, publicAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './ReceptionDashboard.css';

const timeSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30'
];

const ReceptionDashboard = () => {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [doctorsList, setDoctorsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('dashboard');
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [profilePatient, setProfilePatient] = useState(null);
    const [profileAppointments, setProfileAppointments] = useState([]);

    // Availability
    const [availabilityCheck, setAvailabilityCheck] = useState({
        doctorId: '', date: new Date().toISOString().split('T')[0], bookedSlots: []
    });

    // SIMPLIFIED INTAKE STATE (Removed medical history)
    const [intakeForm, setIntakeForm] = useState({
        // Identity
        title: 'Mrs.', firstName: '', middleName: '', lastName: '',
        dob: '', age: '', gender: 'Female', mobile: '', email: '',
        address: '', aadhaar: '', isAadhaarVerified: false,

        // Partner
        partnerTitle: 'Mr.', partnerFirstName: '', partnerLastName: '', partnerMobile: '',

        // Vitals / Payment (Reception Duties)
        height: '', weight: '', bmi: '', bloodGroup: '',
        paymentStatus: 'Pending', consultationFee: '',

        // Assignment
        doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: '',
        referralType: '', reasonForVisit: ''
    });

    const [verifyingAadhaar, setVerifyingAadhaar] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [aadhaarOtp, setAadhaarOtp] = useState('');

    useEffect(() => {
        fetchAppointments();
        fetchDoctors();
    }, []);

    useEffect(() => {
        if (availabilityCheck.doctorId && availabilityCheck.date) {
            fetchBookedSlots(availabilityCheck.doctorId, availabilityCheck.date);
        }
    }, [availabilityCheck.doctorId, availabilityCheck.date]);

    // Sync Form with Widget
    useEffect(() => {
        if (intakeForm.doctor && intakeForm.visitDate) {
            if (intakeForm.doctor !== availabilityCheck.doctorId || intakeForm.visitDate !== availabilityCheck.date) {
                setAvailabilityCheck(prev => ({
                    ...prev, doctorId: intakeForm.doctor, date: intakeForm.visitDate
                }));
            }
        }
    }, [intakeForm.doctor, intakeForm.visitDate]);

    const fetchAppointments = async () => {
        setLoading(true);
        try {
            const response = await receptionAPI.getAllAppointments();
            if (response.success) setAppointments(response.appointments);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const fetchDoctors = async () => {
        try {
            const response = await publicAPI.getDoctors();
            if (response.success && Array.isArray(response.doctors)) setDoctorsList(response.doctors);
        } catch (err) { console.error(err); }
    };

    const fetchBookedSlots = async (doctorId, date) => {
        try {
            const response = await receptionAPI.getBookedSlots(doctorId, date);
            if (response.success) setAvailabilityCheck(prev => ({ ...prev, bookedSlots: response.bookedSlots || [] }));
        } catch (err) { console.error(err); }
    };

    const handleSlotClick = (time) => {
        if (availabilityCheck.bookedSlots.includes(time)) return;
        handleNewWalkIn();
        setIntakeForm(prev => ({
            ...prev, doctor: availabilityCheck.doctorId, visitDate: availabilityCheck.date, visitTime: time
        }));
    };

    const handleNewWalkIn = () => {
        setSelectedPatientId(null);
        // Reset to default
        setIntakeForm({
            title: 'Mrs.', firstName: '', middleName: '', lastName: '',
            dob: '', age: '', gender: 'Female', mobile: '', email: '',
            address: '', aadhaar: '', isAadhaarVerified: false,
            partnerTitle: 'Mr.', partnerFirstName: '', partnerLastName: '', partnerMobile: '',
            height: '', weight: '', bmi: '', bloodGroup: '',
            paymentStatus: 'Pending', consultationFee: '500',
            doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: '',
            referralType: '', reasonForVisit: ''
        });
        setViewMode('intake');
    };

    const handleEditPatient = (patient) => {
        setSelectedPatientId(patient._id);
        const p = patient.fertilityProfile || {};
        const getVal = (val) => val || '';

        setIntakeForm(prev => ({
            ...prev,
            firstName: getVal(patient.name).split(' ')[0],
            lastName: getVal(patient.name).split(' ').slice(1).join(' '),
            mobile: getVal(patient.phone),
            email: getVal(patient.email),
            aadhaar: p.aadhaar || '', // Load existing
            isAadhaarVerified: p.aadhaar ? true : false, // Assume verified if exists for now, or check backend flag
            ...p, // Spread existing profile
            // Reset appointment specific fields for new booking
            doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: ''
        }));
        setViewMode('intake');
    };

    const handleViewProfile = (patient) => {
        navigate(`/patient/${patient._id}`);
    };

    const handleSearch = async (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (query.length > 2) {
            try {
                const res = await receptionAPI.searchPatients(query);
                if (res.success) setSearchResults(res.patients);
            } catch (err) { console.error(err); }
        } else {
            setSearchResults([]);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        // BMI Calculation
        if (name === 'height' || name === 'weight') {
            const h = name === 'height' ? value : intakeForm.height;
            const w = name === 'weight' ? value : intakeForm.weight;
            if (h && w) {
                const hM = h / 100;
                const bmi = (w / (hM * hM)).toFixed(2);
                setIntakeForm(prev => ({ ...prev, [name]: value, bmi }));
                return;
            }
        }
        setIntakeForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSendOTP = async () => {
        if (!intakeForm.aadhaar || intakeForm.aadhaar.length !== 12) {
            alert("Please enter a valid 12-digit Aadhaar number.");
            return;
        }
        setVerifyingAadhaar(true);
        try {
            const res = await receptionAPI.sendAadhaarOTP(intakeForm.aadhaar);
            if (res.success) {
                setOtpSent(true);
                alert(res.message); // "OTP Sent (Use 123456)"
            }
        } catch (err) {
            alert(err.response?.data?.message || "Failed to send OTP");
            setOtpSent(false);
        } finally {
            setVerifyingAadhaar(false);
        }
    };

    const handleVerifyOTP = async () => {
        if (!aadhaarOtp) return alert("Please enter the OTP sent to mobile.");

        setVerifyingAadhaar(true);
        try {
            const res = await receptionAPI.verifyAadhaarOTP(intakeForm.aadhaar, aadhaarOtp);
            if (res.success && res.data) {
                const kyc = res.data;
                alert(`✅ Verification Successful: ${kyc.fullName}`);

                // Auto-populate
                setIntakeForm(prev => ({
                    ...prev,
                    isAadhaarVerified: true,
                    firstName: kyc.fullName.split(' ')[0],
                    lastName: kyc.fullName.split(' ').slice(1).join(' '),
                    dob: kyc.dob,
                    gender: kyc.gender,
                    address: kyc.address
                }));
                // Reset OTP UI
                setOtpSent(false);
                setAadhaarOtp('');
            }
        } catch (err) {
            alert(err.response?.data?.message || "Invalid OTP");
        } finally {
            setVerifyingAadhaar(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);

        if (!intakeForm.firstName || !intakeForm.mobile) {
            alert("Name and Mobile are required.");
            setSaving(false); return;
        }

        try {
            let userId = selectedPatientId;

            // 1. Register/Find User
            const regRes = await receptionAPI.registerPatient({
                name: `${intakeForm.firstName} ${intakeForm.lastName}`.trim(),
                email: intakeForm.email,
                phone: intakeForm.mobile,
            });

            if (regRes.success && regRes.user) {
                userId = regRes.user._id;
            } else {
                throw new Error(regRes.message || "Registration failed.");
            }

            // 2. Update Profile (Vitals + Basic Info + Aadhaar)
            await receptionAPI.updateIntake(userId, intakeForm);

            // 3. Book Appointment
            if (intakeForm.doctor && intakeForm.visitDate && intakeForm.visitTime) {
                const bookingRes = await receptionAPI.bookAppointment({
                    patientId: userId,
                    doctorId: intakeForm.doctor,
                    date: intakeForm.visitDate,
                    time: intakeForm.visitTime,
                    notes: `Walk-in. Vitals: ${intakeForm.height}cm/${intakeForm.weight}kg. Reason: ${intakeForm.reasonForVisit}`
                });

                if (bookingRes.success) {
                    alert("✅ Patient Registered & Assigned to Doctor!");
                    // Generate Simple Receipt
                    const doc = new jsPDF();
                    doc.setFontSize(18);
                    doc.text("REGISTRATION SLIP", 105, 20, { align: 'center' });

                    doc.setFontSize(12);
                    doc.text(`Patient: ${intakeForm.firstName} ${intakeForm.lastName}`, 20, 40);
                    doc.text(`MRN / ID: ${regRes.user?.patientId || 'N/A'}`, 20, 48);
                    doc.text(`Aadhaar Verified: ${intakeForm.isAadhaarVerified ? 'YES' : 'NO'}`, 120, 48);

                    doc.text(`Doctor: Dr. ${doctorsList.find(d => d._id === intakeForm.doctor)?.name}`, 20, 58);
                    doc.text(`Date: ${intakeForm.visitDate} @ ${intakeForm.visitTime}`, 20, 66);
                    doc.text(`Fee: ${intakeForm.consultationFee}`, 20, 74);

                    doc.save("Receipt.pdf");

                    fetchAppointments();
                    setViewMode('dashboard');
                } else {
                    alert("Booking Failed: " + bookingRes.message);
                }
            } else {
                alert("Please select a Doctor and Time Slot.");
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'An unexpected error occurred.';
            alert("❌ Error: " + msg);
        } finally {
            setSaving(false);
        }
    };

    if (viewMode === 'intake') {
        return (
            <div className="intake-full-page">
                <div className="context-bar">
                    <h3>New Registration</h3>
                    <button className="btn-cancel" onClick={() => setViewMode('dashboard')}>Close ✖</button>
                </div>
                <div className="intake-container">
                    <form onSubmit={handleSave}>
                        <div className="form-section">
                            <h4>1. Patient Identity & KYC</h4>

                            {/* AADHAAR VERIFICATION ROW */}
                            <div className="form-row" style={{ alignItems: 'flex-end', backgroundColor: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px dashed #22c55e', gap: '15px' }}>
                                {/* AADHAAR INPUT */}
                                <div className="field" style={{ flex: 2 }}>
                                    <label>Aadhaar Number {intakeForm.isAadhaarVerified && '✅ Verified'}</label>
                                    <input
                                        name="aadhaar"
                                        maxLength="12"
                                        placeholder="Enter 12-digit Aadhaar"
                                        value={intakeForm.aadhaar}
                                        onChange={handleInputChange}
                                        disabled={intakeForm.isAadhaarVerified || otpSent}
                                        style={{
                                            borderColor: intakeForm.isAadhaarVerified ? 'green' : '#ccc',
                                            backgroundColor: intakeForm.isAadhaarVerified ? '#e6fffa' : 'white',
                                            fontWeight: 'bold'
                                        }}
                                    />
                                </div>

                                {/* OTP INPUT (Conditional) */}
                                {otpSent && !intakeForm.isAadhaarVerified && (
                                    <div className="field verified-anim" style={{ flex: 1 }}>
                                        <label>Enter OTP</label>
                                        <input
                                            type="text"
                                            maxLength="6"
                                            placeholder="Ex: 123456"
                                            value={aadhaarOtp}
                                            onChange={(e) => setAadhaarOtp(e.target.value)}
                                            style={{ borderColor: '#2563eb' }}
                                        />
                                    </div>
                                )}

                                {/* ACTION BUTTONS */}
                                <div className="field" style={{ flex: 1 }}>
                                    {!intakeForm.isAadhaarVerified ? (
                                        !otpSent ? (
                                            <button
                                                type="button"
                                                onClick={handleSendOTP}
                                                className="btn-save"
                                                style={{ width: '100%', backgroundColor: '#2563eb' }}
                                                disabled={verifyingAadhaar || !intakeForm.aadhaar}
                                            >
                                                {verifyingAadhaar ? 'Sending...' : 'Send OTP'}
                                            </button>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <button
                                                    type="button"
                                                    onClick={handleVerifyOTP}
                                                    className="btn-save"
                                                    style={{ flex: 2, backgroundColor: '#059669' }}
                                                    disabled={verifyingAadhaar}
                                                >
                                                    {verifyingAadhaar ? '...' : 'Verify OTP'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setOtpSent(false); setAadhaarOtp(''); }}
                                                    className="btn-cancel"
                                                    style={{ flex: 1, padding: '0 5px', fontSize: '0.8rem', height: '100%' }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setIntakeForm({ ...intakeForm, isAadhaarVerified: false, aadhaar: '' })}
                                            className="btn-cancel"
                                            style={{ width: '100%' }}
                                        >
                                            Reset / Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="form-row" style={{ marginTop: '10px' }}>
                                <div className="field"><label>First Name</label><input name="firstName" value={intakeForm.firstName} onChange={handleInputChange} /></div>
                                <div className="field"><label>Last Name</label><input name="lastName" value={intakeForm.lastName} onChange={handleInputChange} /></div>
                                <div className="field"><label>Mobile</label><input name="mobile" value={intakeForm.mobile} onChange={handleInputChange} /></div>
                                <div className="field"><label>Age</label><input name="age" value={intakeForm.age} onChange={handleInputChange} /></div>
                            </div>
                            <div className="form-row">
                                <div className="field"><label>Partner Name</label><input name="partnerFirstName" value={intakeForm.partnerFirstName} onChange={handleInputChange} /></div>
                                <div className="field"><label>Partner Mobile</label><input name="partnerMobile" value={intakeForm.partnerMobile} onChange={handleInputChange} /></div>
                            </div>
                        </div>

                        <div className="form-section">
                            <h4>2. Vitals & Payment</h4>
                            <div className="form-row">
                                <div className="field"><label>Height (cm)</label><input name="height" value={intakeForm.height} onChange={handleInputChange} /></div>
                                <div className="field"><label>Weight (kg)</label><input name="weight" value={intakeForm.weight} onChange={handleInputChange} /></div>
                                <div className="field"><label>BMI</label><input name="bmi" value={intakeForm.bmi} readOnly /></div>
                                <div className="field"><label>Consultation Fee</label><input name="consultationFee" value={intakeForm.consultationFee} onChange={handleInputChange} /></div>
                            </div>
                        </div>

                        <div className="form-section" style={{ backgroundColor: '#e3f2fd' }}>
                            <h4>3. Assign to Doctor/Counselor</h4>
                            <div className="form-row">
                                <div className="field">
                                    <label>Select Specialist</label>
                                    <select name="doctor" value={intakeForm.doctor} onChange={handleInputChange}>
                                        <option value="">-- Choose --</option>
                                        {doctorsList.map(doc => (
                                            <option key={doc._id} value={doc._id}>{doc.name} ({doc.specialty})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Date</label>
                                    <input type="date" name="visitDate" value={intakeForm.visitDate} onChange={handleInputChange} min={new Date().toISOString().split('T')[0]} />
                                </div>
                            </div>
                            {intakeForm.doctor && (
                                <div className="slot-grid">
                                    {timeSlots.map(time => (
                                        <button
                                            key={time} type="button"
                                            className={`slot-btn ${availabilityCheck.bookedSlots.includes(time) ? 'booked' : ''} ${intakeForm.visitTime === time ? 'selected' : ''}`}
                                            onClick={() => !availabilityCheck.bookedSlots.includes(time) && setIntakeForm({ ...intakeForm, visitTime: time })}
                                        >
                                            {time}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="form-footer">
                            <button type="submit" className="btn-save" disabled={saving}>
                                {saving ? 'Assigning...' : 'Confirm Assignment'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // PROFILE VIEW MODE
    if (viewMode === 'profile' && profilePatient) {
        const fp = profilePatient.fertilityProfile || {};
        return (
            <div className="reception-dashboard" style={{ maxWidth: '900px', margin: '0 auto' }}>
                <div className="dashboard-header">
                    <button onClick={() => setViewMode('dashboard')} style={{ padding: '8px 20px', background: '#f1f5f9', border: '2px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' }}>← Back to Dashboard</button>
                    <button className="btn-save" onClick={() => handleEditPatient(profilePatient)} style={{ padding: '10px 24px', fontSize: '1rem' }}>📋 Book Appointment</button>
                </div>

                {/* Patient Identity Card */}
                <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: '18px', padding: '28px', color: 'white', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '18px' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: '800' }}>
                            {(profilePatient.name || 'P')[0].toUpperCase()}
                        </div>
                        <div>
                            <h2 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: '800' }}>{profilePatient.name}</h2>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(59,130,246,0.2)', color: '#93c5fd', fontSize: '0.8rem', fontWeight: '600' }}>MRN: {profilePatient.patientId || 'N/A'}</span>
                                <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', fontSize: '0.8rem', fontWeight: '600' }}>📱 {profilePatient.phone || '-'}</span>
                                {fp.bloodGroup && <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: '0.8rem', fontWeight: '600' }}>🩸 {fp.bloodGroup}</span>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Vitals & Demographics */}
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#1e40af' }}>📋 Demographics & Vitals</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                        {[
                            ['Age', fp.age || '-'],
                            ['Gender', fp.gender || '-'],
                            ['Height', `${fp.height || '-'} cm`],
                            ['Weight', `${fp.weight || '-'} kg`],
                            ['BMI', fp.bmi || '-'],
                            ['Blood Group', fp.bloodGroup || '-'],
                            ['Email', profilePatient.email || '-'],
                            ['Address', fp.address || profilePatient.address || '-'],
                        ].map(([label, val], i) => (
                            <div key={i} style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700', marginBottom: '4px' }}>{label}</div>
                                <div style={{ fontSize: '0.92rem', fontWeight: '600', color: '#1e293b' }}>{val}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Spouse Info */}
                {(fp.partnerFirstName || fp.husbandAge) && (
                    <div style={{ background: '#f0fdf4', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #bbf7d0' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#166534' }}>👫 Spouse / Partner Details</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                            {[
                                ['Name', `${fp.partnerTitle || ''} ${fp.partnerFirstName || ''} ${fp.partnerLastName || ''}`.trim() || '-'],
                                ['Age', fp.partnerAge || fp.husbandAge || '-'],
                                ['Phone', fp.partnerMobile || '-'],
                                ['Blood Group', fp.partnerBloodGroup || '-'],
                            ].map(([label, val], i) => (
                                <div key={i} style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#166534', fontWeight: '700', marginBottom: '4px' }}>{label}</div>
                                    <div style={{ fontSize: '0.92rem', fontWeight: '600', color: '#1e293b' }}>{val}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Fertility / Clinical profile */}
                {(fp.chiefComplaint || fp.medicalHistory) && (
                    <div style={{ background: 'white', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#1e40af' }}>🏥 Clinical Summary</h3>
                        {fp.chiefComplaint && <div style={{ marginBottom: '12px' }}><strong>Chief Complaint:</strong> {fp.chiefComplaint}</div>}
                        {fp.medicalHistory && <div style={{ marginBottom: '12px' }}><strong>Medical History:</strong> {fp.medicalHistory}</div>}
                        {fp.surgicalHistory && <div style={{ marginBottom: '12px' }}><strong>Surgical History:</strong> {fp.surgicalHistory}</div>}
                        {fp.reasonForVisit && <div><strong>Reason for Visit:</strong> {fp.reasonForVisit}</div>}
                    </div>
                )}

                {/* Appointment History */}
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#1e40af' }}>📅 Appointment History ({profileAppointments.length})</h3>
                    {profileAppointments.length === 0 ? (
                        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>No appointment history found.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {profileAppointments.map(apt => (
                                <div key={apt._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <div>
                                        <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{new Date(apt.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{apt.appointmentTime} • {apt.serviceName || 'Consultation'}</div>
                                    </div>
                                    <span style={{
                                        padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: '700', textTransform: 'capitalize',
                                        background: apt.status === 'confirmed' ? '#dcfce7' : apt.status === 'completed' ? '#dbeafe' : '#fef3c7',
                                        color: apt.status === 'confirmed' ? '#166534' : apt.status === 'completed' ? '#1e40af' : '#92400e'
                                    }}>{apt.status}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="reception-dashboard">
            <div className="dashboard-header">
                <h1>Reception Desk</h1>
                <button className="btn-save" onClick={handleNewWalkIn} style={{ padding: '10px 20px', fontSize: '1rem' }}>+ New Patient Registration</button>
            </div>

            {/* SEARCH SECTION */}
            <div className="search-section card" style={{ padding: '20px', marginBottom: '20px', position: 'relative' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        placeholder="🔍 Search Patient by Name, Mobile or MRN..."
                        value={searchQuery}
                        onChange={handleSearch}
                        style={{ flex: 1, padding: '12px', fontSize: '1rem', borderRadius: '6px', border: '1px solid #ddd' }}
                    />
                </div>
                {searchResults.length > 0 && (
                    <div className="search-results-dropdown" style={{
                        position: 'absolute', top: '70px', left: '20px', right: '20px',
                        background: 'white', border: '1px solid #eee', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 1000, maxHeight: '300px', overflowY: 'auto', borderRadius: '8px'
                    }}>
                        {searchResults.map(p => (
                            <div key={p._id} style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{p.name} <span style={{ color: '#666', fontSize: '0.9rem' }}>({p.patientId || 'N/A'})</span></div>
                                    <div style={{ fontSize: '0.9rem', color: '#888' }}>📱 {p.phone}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => handleViewProfile(p)}
                                        style={{ padding: '6px 15px', fontSize: '0.9rem', background: '#f0f4ff', color: '#3b82f6', border: '2px solid #3b82f6', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                                    >
                                        👁 View Profile
                                    </button>
                                    <button
                                        onClick={() => handleEditPatient(p)}
                                        className="btn-save"
                                        style={{ padding: '6px 15px', fontSize: '0.9rem' }}
                                    >
                                        Select / Book
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Widget Area */}
            <div className="availability-widget card">
                <h3>📅 Quick Check Availability</h3>
                <div className="widget-controls">
                    <select className="avail-select" onChange={(e) => setAvailabilityCheck({ ...availabilityCheck, doctorId: e.target.value })}>
                        <option value="">Select Doctor</option>
                        {doctorsList.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                    </select>
                    <input type="date" value={availabilityCheck.date} onChange={(e) => setAvailabilityCheck({ ...availabilityCheck, date: e.target.value })} />
                </div>
                {availabilityCheck.doctorId && (
                    <div className="slot-grid">
                        {timeSlots.map(t => (
                            <button key={t} className={`slot-btn ${availabilityCheck.bookedSlots.includes(t) ? 'booked' : ''}`} onClick={() => handleSlotClick(t)}>{t}</button>
                        ))}
                    </div>
                )}
            </div>

            <div className="appointments-list">
                <h3>Today's Queue</h3>
                <table className="reception-table">
                    <thead><tr><th>Patient</th><th>Assigned To</th><th>Time</th><th>Status</th></tr></thead>
                    <tbody>
                        {appointments.map(apt => (
                            <tr key={apt._id}>
                                <td>{apt.userId?.name}<br /><small>{apt.userId?.phone}</small></td>
                                <td>{apt.doctorName}</td>
                                <td>{apt.appointmentTime}</td>
                                <td><span className={`status ${apt.status}`}>{apt.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ReceptionDashboard;