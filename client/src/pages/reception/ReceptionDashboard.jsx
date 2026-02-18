import React, { useState, useEffect } from 'react';
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
    const [appointments, setAppointments] = useState([]);
    const [doctorsList, setDoctorsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('dashboard');
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

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

    const handleAadhaarVerify = async () => {
        if (!intakeForm.aadhaar || intakeForm.aadhaar.length !== 12) {
            alert("Please enter a valid 12-digit Aadhaar number.");
            return;
        }

        setVerifyingAadhaar(true);
        try {
            const res = await receptionAPI.verifyAadhaar(intakeForm.aadhaar);
            if (res.success && res.data) {
                const kyc = res.data;
                alert(`✅ Aadhaar Verified: ${kyc.fullName}`);

                // Auto-populate from KYC Data
                setIntakeForm(prev => ({
                    ...prev,
                    isAadhaarVerified: true,
                    firstName: kyc.fullName.split(' ')[0],
                    lastName: kyc.fullName.split(' ').slice(1).join(' '),
                    dob: kyc.dob,
                    gender: kyc.gender,
                    address: kyc.address
                }));
            }
        } catch (err) {
            alert(err.response?.data?.message || "Verification Failed");
            setIntakeForm(prev => ({ ...prev, isAadhaarVerified: false }));
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
                throw new Error("Registration failed.");
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
            alert("Error: " + err.message);
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
                            <div className="form-row" style={{ alignItems: 'flex-end', backgroundColor: '#f0fdf4', padding: '10px', borderRadius: '6px', border: '1px dashed #22c55e' }}>
                                <div className="field" style={{ flex: 2 }}>
                                    <label>Aadhaar Number (12-Digit) {intakeForm.isAadhaarVerified && '✅'}</label>
                                    <input
                                        name="aadhaar"
                                        maxLength="12"
                                        placeholder="Enter Aadhaar Number"
                                        value={intakeForm.aadhaar}
                                        onChange={handleInputChange}
                                        disabled={intakeForm.isAadhaarVerified}
                                        style={{ borderColor: intakeForm.isAadhaarVerified ? 'green' : '#ccc' }}
                                    />
                                </div>
                                <div className="field" style={{ flex: 1 }}>
                                    {!intakeForm.isAadhaarVerified ? (
                                        <button
                                            type="button"
                                            onClick={handleAadhaarVerify}
                                            className="btn-save"
                                            style={{ width: '100%', backgroundColor: '#2563eb' }}
                                            disabled={verifyingAadhaar}
                                        >
                                            {verifyingAadhaar ? 'Verifying...' : 'Verify Identity'}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setIntakeForm({ ...intakeForm, isAadhaarVerified: false, aadhaar: '' })}
                                            className="btn-cancel"
                                            style={{ width: '100%', fontSize: '0.8rem' }}
                                        >
                                            Reset KYC
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

    return (
        <div className="reception-dashboard">
            <div className="dashboard-header">
                <h1>Reception Desk</h1>
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