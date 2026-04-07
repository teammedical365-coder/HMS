import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { receptionAPI, publicAPI, hospitalAPI, uploadAPI, admissionAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import { getSubdomain } from '../../utils/subdomain';
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
    const { user: currentUser } = useAuth();
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
    const [transactions, setTransactions] = useState([]);

    // Token mode — next token preview
    const [nextToken, setNextToken] = useState(null);

    // Payment confirm modal
    const [paymentModal, setPaymentModal] = useState({ open: false, appointment: null, method: 'Cash' });
    const [confirmingPayment, setConfirmingPayment] = useState(false);

    // Hospitalization modal
    const [hospitalizeModal, setHospitalizeModal] = useState({ open: false, appointment: null });
    const [hospitalizeForm, setHospitalizeForm] = useState({ ward: '', bedNumber: '', admissionDate: new Date().toISOString().split('T')[0], notes: '', facilityDays: {} });
    const [hospitalizingSaving, setHospitalizingSaving] = useState(false);

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
        consultationFee: '',

        // Assignment
        department: '', doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: '',
        referralType: '', reasonForVisit: '', paymentMethod: 'Cash'
    });

    const [paymentScreenshot, setPaymentScreenshot] = useState(null);
    const [verifyingAadhaar, setVerifyingAadhaar] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [aadhaarOtp, setAadhaarOtp] = useState('');
    const [hospitalContext, setHospitalContext] = useState(null);

    useEffect(() => {
        const fetchHospital = async () => {
            try {
                const sub = getSubdomain();
                const res = await hospitalAPI.resolveHospital(sub);
                if (res.success) setHospitalContext(res.hospital);
            } catch (err) { console.error('Error fetching hospital context:', err); }
        };
        fetchHospital();
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

    // Fetch next token number when doctor + date selected and hospital is in token mode
    useEffect(() => {
        const isTokenMode = hospitalContext?.appointmentMode === 'token';
        if (!isTokenMode || !intakeForm.doctor || !intakeForm.visitDate || !hospitalContext?._id) {
            setNextToken(null);
            return;
        }
        hospitalAPI.getNextToken(hospitalContext._id, intakeForm.doctor, intakeForm.visitDate)
            .then(res => { if (res.success) setNextToken(res.nextToken); })
            .catch(() => setNextToken(null));
    }, [intakeForm.doctor, intakeForm.visitDate, hospitalContext]);

    const fetchAppointments = async () => {
        setLoading(true);
        try {
            const response = await receptionAPI.getAllAppointments();
            if (response.success) setAppointments(response.appointments);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const fetchTransactions = async () => {
        try {
            const res = await receptionAPI.getTransactions();
            if (res.success) setTransactions(res.transactions);
        } catch (err) { console.error(err); }
    };

    const fetchDoctors = async () => {
        try {
            const response = await publicAPI.getDoctors();
            if (response.success && Array.isArray(response.doctors)) setDoctorsList(response.doctors);
        } catch (err) { console.error(err); }
    };

    const fetchBookedSlots = async (doctorId, date) => {
        try {
            const hospitalId = hospitalContext?._id || '';
            const response = await receptionAPI.getBookedSlots(doctorId, date, hospitalId);
            if (response.success) setAvailabilityCheck(prev => ({ ...prev, bookedSlots: response.bookedSlots || [] }));
        } catch (err) { console.error(err); }
    };

    const todayStr = new Date().toISOString().split('T')[0];

    const isSlotInPast = (time) => {
        if (intakeForm.visitDate !== todayStr) return false;
        const now = new Date();
        const [h, m] = time.split(':').map(Number);
        const slotTime = new Date();
        slotTime.setHours(h, m, 0, 0);
        return slotTime <= now;
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
        setOtpSent(false);
        setAadhaarOtp('');
        setVerifyingAadhaar(false);
        setIntakeForm({
            title: 'Mrs.', firstName: '', middleName: '', lastName: '',
            dob: '', age: '', gender: 'Female', mobile: '', email: '',
            address: '', aadhaar: '', isAadhaarVerified: false,
            partnerTitle: 'Mr.', partnerFirstName: '', partnerLastName: '', partnerMobile: '',
            height: '', weight: '', bmi: '', bloodGroup: '',
            paymentStatus: 'Pending', consultationFee: hospitalContext?.appointmentFee ?? '500',
            department: '', doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: '',
            referralType: '', reasonForVisit: '', paymentMethod: 'Cash'
        });
        setViewMode('intake');
    };

    const handleEditPatient = (patient) => {
        setSelectedPatientId(patient._id);
        setOtpSent(false);
        setAadhaarOtp('');
        setVerifyingAadhaar(false);
        const p = patient.fertilityProfile || {};
        const getVal = (val) => val || '';

        setIntakeForm(prev => ({
            ...prev,
            firstName: getVal(patient.name).split(' ')[0],
            lastName: getVal(patient.name).split(' ').slice(1).join(' '),
            mobile: getVal(patient.phone),
            email: getVal(patient.email),
            aadhaar: p.aadhaar || '',
            isAadhaarVerified: p.aadhaar ? true : false,
            ...p,
            consultationFee: hospitalContext?.appointmentFee ?? '500',
            department: '', doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: ''
        }));
        setViewMode('intake');
    };

    const handleViewProfile = (patient) => {
        navigate(`/patient/${patient._id}`);
    };

    const openHospitalizeModal = (apt) => {
        setHospitalizeForm({ ward: '', bedNumber: '', admissionDate: new Date().toISOString().split('T')[0], notes: '', facilityDays: {} });
        setHospitalizeModal({ open: true, appointment: apt });
    };

    const handleHospitalize = async () => {
        const { appointment } = hospitalizeModal;
        const facilities = hospitalContext?.facilities || [];
        const selectedFacilities = facilities
            .filter(f => hospitalizeForm.facilityDays[f.name] > 0)
            .map(f => ({
                facilityName: f.name,
                pricePerDay: f.pricePerDay,
                days: Number(hospitalizeForm.facilityDays[f.name]),
                totalAmount: f.pricePerDay * Number(hospitalizeForm.facilityDays[f.name]),
            }));

        setHospitalizingSaving(true);
        try {
            await admissionAPI.createAdmission({
                patientId: appointment.userId?._id || appointment.patientId,
                appointmentId: appointment._id,
                ward: hospitalizeForm.ward,
                bedNumber: hospitalizeForm.bedNumber,
                admissionDate: hospitalizeForm.admissionDate,
                notes: hospitalizeForm.notes,
                selectedFacilities,
            });
            alert(`Patient admitted successfully!`);
            setHospitalizeModal({ open: false, appointment: null });
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to admit patient');
        } finally {
            setHospitalizingSaving(false);
        }
    };

    const handleCancelAppointment = async (appointmentId) => {
        if (!window.confirm('Cancel this appointment?')) return;
        try {
            const res = await receptionAPI.cancelAppointment(appointmentId);
            if (res.success) fetchAppointments();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to cancel appointment.');
        }
    };

    // ─── RECEIPT PDF GENERATOR ────────────────────────────────────────────────
    const generateReceiptPDF = (apt, paymentMethodOverride) => {
        const doc = new jsPDF();
        const hName = hospitalContext?.name || 'HOSPITAL';
        const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
        const hPhone = hospitalContext?.phone || '';
        const hEmail = hospitalContext?.email || '';
        const issuedBy = currentUser?.name || 'Reception Staff';
        let y = 18;

        doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
        doc.text(hName, 105, y, { align: 'center' }); y += 7;
        if (hAddr) {
            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
            doc.text(hAddr, 105, y, { align: 'center' }); y += 5;
        }
        if (hPhone || hEmail) {
            const contact = [hPhone && `Ph: ${hPhone}`, hEmail && `Email: ${hEmail}`].filter(Boolean).join('  |  ');
            doc.setFontSize(9); doc.setTextColor(100);
            doc.text(contact, 105, y, { align: 'center' }); y += 5;
        }
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(41, 128, 185);
        doc.text('Consultation Receipt', 105, y, { align: 'center' }); y += 5;
        doc.setDrawColor(41, 128, 185); doc.setLineWidth(0.5);
        doc.line(14, y, 196, y); y += 8;
        doc.setTextColor(0); doc.setFont('helvetica', 'normal');

        const isToken = apt.tokenNumber != null;
        const dateDisplay = new Date(apt.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        autoTable(doc, {
            startY: y,
            body: [
                ['Patient Name', apt.userId?.name || 'Walk-in'],
                ['MRN / ID', apt.userId?.patientId || apt.patientId || 'N/A'],
                ['Phone', apt.userId?.phone || '-'],
                ['Doctor', `Dr. ${apt.doctorName || '-'}`],
                isToken
                    ? ['Date / Token', `${dateDisplay}  —  Token #${apt.tokenNumber}`]
                    : ['Date & Time', `${dateDisplay} @ ${apt.appointmentTime || '-'}`],
                ['Service', apt.serviceName || 'Consultation'],
                ['Consultation Fee', `Rs. ${Number(apt.amount || 0).toLocaleString('en-IN')}`],
                ['Payment Method', paymentMethodOverride || apt.paymentMethod || 'Cash'],
                ['Payment Status', 'PAID ✓'],
            ],
            theme: 'grid',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
            bodyStyles: { fontSize: 10 },
            alternateRowStyles: { fillColor: [245, 249, 255] },
        });

        y = doc.lastAutoTable.finalY + 10;
        doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
        doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Issued by: ${issuedBy}`, 14, y);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
        y += 5;
        doc.text(`Thank you for choosing ${hName}`, 105, y, { align: 'center' });
        const pid = apt.userId?.patientId || apt.patientId || 'Patient';
        doc.save(`Receipt_${pid}.pdf`);
    };

    const handleConfirmPayment = async () => {
        setConfirmingPayment(true);
        const { appointment, method } = paymentModal;
        try {
            await receptionAPI.confirmPayment(appointment._id, method, appointment.amount);
            generateReceiptPDF({ ...appointment, paymentMethod: method, paymentStatus: 'Paid' }, method);
            setPaymentModal({ open: false, appointment: null, method: 'Cash' });
            fetchAppointments();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to confirm payment.');
        } finally {
            setConfirmingPayment(false);
        }
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

        if (name === 'department' && hospitalContext) {
            const defaultFee = hospitalContext.departmentFees?.[value] ?? hospitalContext.appointmentFee ?? 500;
            setIntakeForm(prev => ({
                ...prev, [name]: value, consultationFee: defaultFee, doctor: '', visitTime: ''
            }));
            setAvailabilityCheck(prev => ({ ...prev, doctorId: '', bookedSlots: [] }));
            return;
        }

        if (name === 'visitDate') {
            // Prevent past dates
            if (value < todayStr) return;
            // Reset time slot when date changes (past slot may no longer be valid)
            setIntakeForm(prev => ({ ...prev, visitDate: value, visitTime: '' }));
            return;
        }

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

        if (intakeForm.doctor && intakeForm.visitTime && intakeForm.paymentMethod !== 'Cash' && !paymentScreenshot) {
            alert(`Please upload a payment screenshot/proof for ${intakeForm.paymentMethod} payment before booking.`);
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

            // 3. Book Appointment (optional when editing existing patient)
            const isTokenMode = hospitalContext?.appointmentMode === 'token';
            if (intakeForm.doctor && intakeForm.visitDate && (intakeForm.visitTime || isTokenMode)) {
                // Upload payment screenshot if non-cash and screenshot provided
                let screenshotNote = '';
                if (intakeForm.paymentMethod !== 'Cash' && paymentScreenshot) {
                    try {
                        const fd = new FormData();
                        fd.append('images', paymentScreenshot);
                        const upRes = await uploadAPI.uploadImages(fd);
                        if (upRes.success && upRes.files?.length > 0) {
                            screenshotNote = ` | Screenshot: ${upRes.files[0].url}`;
                        }
                    } catch { /* non-fatal */ }
                }

                const bookingRes = await receptionAPI.bookAppointment({
                    patientId: userId,
                    doctorId: intakeForm.doctor,
                    date: intakeForm.visitDate,
                    time: isTokenMode ? undefined : intakeForm.visitTime,
                    notes: `Walk-in. Vitals: ${intakeForm.height}cm/${intakeForm.weight}kg. Reason: ${intakeForm.reasonForVisit}${screenshotNote}`,
                    paymentMethod: intakeForm.paymentMethod,
                    paymentStatus: 'Paid',
                    amount: intakeForm.consultationFee
                });

                if (bookingRes.success) {
                    // --- Dynamic Receipt PDF (generate BEFORE alert so it isn't blocked) ---
                    const doc = new jsPDF();
                    const hName = hospitalContext?.name || 'HOSPITAL';
                    const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
                    const hPhone = hospitalContext?.phone || '';
                    const hEmail = hospitalContext?.email || '';
                    const issuedBy = currentUser?.name || 'Reception Staff';
                    const selectedDoc = doctorsList.find(d => d._id === intakeForm.doctor);
                    let y = 18;

                    // Hospital header
                    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
                    doc.text(hName, 105, y, { align: 'center' }); y += 7;
                    if (hAddr) {
                        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
                        doc.text(hAddr, 105, y, { align: 'center' }); y += 5;
                    }
                    if (hPhone || hEmail) {
                        const contact = [hPhone && `Ph: ${hPhone}`, hEmail && `Email: ${hEmail}`].filter(Boolean).join('  |  ');
                        doc.setFontSize(9); doc.setTextColor(100);
                        doc.text(contact, 105, y, { align: 'center' }); y += 5;
                    }
                    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(41, 128, 185);
                    doc.text('Registration Slip / Receipt', 105, y, { align: 'center' }); y += 5;
                    doc.setDrawColor(41, 128, 185); doc.setLineWidth(0.5);
                    doc.line(14, y, 196, y); y += 8;
                    doc.setTextColor(0); doc.setFont('helvetica', 'normal');

                    autoTable(doc, {
                        startY: y,
                        body: [
                            ['Patient Name', `${intakeForm.firstName} ${intakeForm.lastName}`],
                            ['MRN / ID', regRes.user?.patientId || bookingRes.appointment?.patientId || 'N/A'],
                            ['Phone', intakeForm.mobile || '-'],
                            ['Aadhaar Verified', intakeForm.isAadhaarVerified ? 'YES - Verified' : 'NO'],
                            ['Department', intakeForm.department || '-'],
                            ['Doctor', `Dr. ${selectedDoc?.name || '-'}`],
                            isTokenMode
                                ? ['Date / Token', `${intakeForm.visitDate}  —  Token #${bookingRes.appointment?.tokenNumber || '?'}`]
                                : ['Date & Time', `${intakeForm.visitDate} @ ${intakeForm.visitTime}`],
                            ['Consultation Fee', `Rs. ${Number(intakeForm.consultationFee || 0).toLocaleString('en-IN')}`],
                            ['Payment Method', intakeForm.paymentMethod || 'Cash'],
                            ['Payment Status', 'PAID'],
                        ],
                        theme: 'grid',
                        headStyles: { fillColor: [41, 128, 185] },
                        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
                        bodyStyles: { fontSize: 10 },
                        alternateRowStyles: { fillColor: [245, 249, 255] },
                    });

                    y = doc.lastAutoTable.finalY + 10;
                    doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
                    doc.setFontSize(8); doc.setTextColor(120);
                    doc.text(`Issued by: ${issuedBy}`, 14, y);
                    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
                    y += 5;
                    doc.text('Thank you for choosing ' + hName, 105, y, { align: 'center' });
                    const receiptPatientId = regRes.user?.patientId || bookingRes.appointment?.patientId || 'Patient';
                    doc.save(`Receipt_${receiptPatientId}.pdf`);

                    const tokenMsg = bookingRes.appointment?.tokenNumber
                        ? ` Token #${bookingRes.appointment.tokenNumber} assigned.` : '';
                    alert(`Patient Registered & Assigned to Doctor!${tokenMsg}`);

                    setPaymentScreenshot(null);
                    fetchAppointments();
                    setViewMode('dashboard');
                } else {
                    alert("Booking Failed: " + bookingRes.message);
                }
            } else if (selectedPatientId) {
                // Editing existing patient — profile saved, no appointment needed
                alert("✅ Patient details updated successfully!");
                setViewMode('dashboard');
            } else {
                alert("Please select a Doctor and Time Slot to complete the registration.");
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
                    <h3>{selectedPatientId ? 'Edit Patient Details' : 'New Registration'}</h3>
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
                                <div className="field"><label>Consultation Fee</label><input name="consultationFee" value={intakeForm.consultationFee} readOnly style={{ backgroundColor: '#f1f5f9', color: '#475569', cursor: 'not-allowed' }} /></div>
                            </div>
                            <div className="form-row">
                                <div className="field">
                                    <label>Payment Method</label>
                                    <select name="paymentMethod" value={intakeForm.paymentMethod} onChange={handleInputChange}>
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI</option>
                                        <option value="Card">Card</option>
                                        <option value="Cheque">Cheque</option>
                                        <option value="NEFT/RTGS">NEFT / RTGS</option>
                                    </select>
                                </div>
                                <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', marginTop: '22px' }}>
                                    <span style={{ fontSize: '18px' }}>✅</span>
                                    <span style={{ fontWeight: 600, color: '#15803d', fontSize: '14px' }}>Payment Confirmed — Paid</span>
                                </div>
                            </div>
                            {intakeForm.paymentMethod !== 'Cash' && (
                                <div className="form-row" style={{ marginTop: '6px' }}>
                                    <div className="field" style={{ flex: 1 }}>
                                        <label>Payment Screenshot / Proof <span style={{ color: '#ef4444', fontSize: '12px' }}>*Required for {intakeForm.paymentMethod}</span></label>
                                        <input
                                            type="file"
                                            accept="image/*,application/pdf"
                                            onChange={e => setPaymentScreenshot(e.target.files[0])}
                                            style={{ padding: '8px', border: '2px dashed #6366f1', borderRadius: '8px', background: '#f5f3ff', width: '100%' }}
                                        />
                                        {paymentScreenshot && (
                                            <span style={{ fontSize: '12px', color: '#059669', marginTop: '4px', display: 'block' }}>
                                                ✅ {paymentScreenshot.name}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="form-section" style={{ backgroundColor: '#e3f2fd' }}>
                            <h4>3. Assign to Doctor/Counselor</h4>
                            <div className="form-row">
                                <div className="field">
                                    <label>Department</label>
                                    <select name="department" value={intakeForm.department} onChange={handleInputChange}>
                                        <option value="">-- Choose Department --</option>
                                        {[...new Set([...(hospitalContext?.departments || []), ...doctorsList.flatMap(d => d.departments || [])])].filter(Boolean).map(dept => (
                                            <option key={dept} value={dept}>{dept}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Select Specialist</label>
                                    <select 
                                        name="doctor" 
                                        value={intakeForm.doctor} 
                                        onChange={handleInputChange}
                                        disabled={!intakeForm.department}
                                        style={!intakeForm.department ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}}
                                    >
                                        {!intakeForm.department ? (
                                            <option value="">-- Select Department First --</option>
                                        ) : (
                                            <>
                                                <option value="">-- Choose Specialist --</option>
                                                {doctorsList.filter(doc => (doc.departments || []).includes(intakeForm.department)).map(doc => (
                                                    <option key={doc._id} value={doc._id}>{doc.name} {doc.departments?.length > 0 ? `(${doc.departments.join(', ')})` : ''}</option>
                                                ))}
                                            </>
                                        )}
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Date</label>
                                    <input type="date" name="visitDate" value={intakeForm.visitDate} min={todayStr} onChange={handleInputChange} disabled={!intakeForm.doctor} style={!intakeForm.doctor ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}} />
                                </div>
                            </div>
                            {intakeForm.doctor && (
                                hospitalContext?.appointmentMode === 'token' ? (
                                    /* Token mode: show next token number */
                                    <div style={{ margin: '14px 0', padding: '18px 24px', background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: '12px', border: '2px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '18px' }}>
                                        <span style={{ fontSize: '2.5rem' }}>🎟️</span>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#78350f', marginBottom: '2px' }}>Token Queue Mode Active</div>
                                            {nextToken !== null ? (
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#92400e' }}>
                                                    Next Token: <span style={{ fontSize: '2rem', color: '#d97706' }}>#{nextToken}</span>
                                                </div>
                                            ) : (
                                                <div style={{ color: '#92400e', fontSize: '0.9rem' }}>Select doctor and date to see next token</div>
                                            )}
                                            <div style={{ fontSize: '0.8rem', color: '#92400e', marginTop: '4px', opacity: 0.8 }}>Tokens reset daily at midnight</div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Slot mode: existing time slot grid */
                                    <div className="slot-grid">
                                        {timeSlots.map(time => {
                                            const isBooked = availabilityCheck.bookedSlots.includes(time);
                                            const isPast = isSlotInPast(time);
                                            const isDisabled = isBooked || isPast;
                                            return (
                                                <button
                                                    key={time} type="button"
                                                    className={`slot-btn ${isBooked ? 'booked' : ''} ${isPast ? 'booked' : ''} ${intakeForm.visitTime === time ? 'selected' : ''}`}
                                                    onClick={() => !isDisabled && setIntakeForm({ ...intakeForm, visitTime: time })}
                                                    disabled={isDisabled}
                                                >
                                                    {time}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )
                            )}
                        </div>

                        <div className="form-footer">
                            <button type="submit" className="btn-save" disabled={saving}>
                                {saving
                                    ? 'Saving...'
                                    : (() => {
                                        const isTokenMode = hospitalContext?.appointmentMode === 'token';
                                        const canBook = intakeForm.doctor && intakeForm.visitDate && (intakeForm.visitTime || isTokenMode);
                                        if (selectedPatientId) return canBook ? (isTokenMode ? 'Save & Issue Token + Receipt' : 'Save & Generate Receipt') : 'Save Patient Details';
                                        return canBook ? (isTokenMode ? 'Register & Issue Token + Receipt' : 'Register & Generate Receipt') : 'Save Patient Details';
                                    })()
                                }
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

    if (viewMode === 'transactions') {
        const totalCollected = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        return (
            <div className="reception-dashboard" style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <div className="dashboard-header">
                    <button onClick={() => setViewMode('dashboard')} style={{ padding: '8px 20px', background: '#f1f5f9', border: '2px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>← Back to Dashboard</button>
                    <h2>Transaction History</h2>
                </div>

                <div className="card" style={{ padding: '20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e0f2fe', border: '1px solid #bae6fd' }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#0369a1' }}>Total Collected</h3>
                        <p style={{ margin: '5px 0 0', fontSize: '1.5rem', fontWeight: 'bold', color: '#0284c7' }}>₹{totalCollected.toLocaleString('en-IN')}</p>
                    </div>
                </div>

                <div className="card" style={{ padding: '20px' }}>
                    <table className="reception-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Patient</th>
                                <th>Doctor</th>
                                <th>Method</th>
                                <th>Status</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>No transactions found.</td></tr>
                            ) : (
                                transactions.map(t => (
                                    <tr key={t._id}>
                                        <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                                        <td>{t.userId?.name || 'Walk-in'}</td>
                                        <td>{t.doctorName || '-'}</td>
                                        <td>{t.paymentMethod || 'Cash'}</td>
                                        <td>
                                            <span style={{
                                                padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold',
                                                background: (t.paymentStatus || '').toLowerCase() === 'paid' ? '#dcfce7' : '#fef3c7',
                                                color: (t.paymentStatus || '').toLowerCase() === 'paid' ? '#166534' : '#92400e'
                                            }}>
                                                {t.paymentStatus || 'Pending'}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 'bold', color: '#16a34a' }}>₹{t.amount}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <>
        <div className="reception-dashboard">
            <div className="dashboard-header">
                <h1>Reception Desk</h1>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-cancel" onClick={() => { fetchTransactions(); setViewMode('transactions'); }} style={{ padding: '10px 20px', fontSize: '1rem', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1' }}>💰 Transactions</button>
                    <button className="btn-cancel" onClick={() => navigate('/billing/patient')} style={{ padding: '10px 20px', fontSize: '1rem', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>🧾 Patient Billing</button>
                    <button className="btn-save" onClick={handleNewWalkIn} style={{ padding: '10px 20px', fontSize: '1rem' }}>+ New Registration</button>
                </div>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    <h3 style={{ margin: 0 }}>Today's Queue</h3>
                    {hospitalContext?.appointmentMode === 'token' && (
                        <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '3px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700 }}>
                            🎟️ Token Queue Mode
                        </span>
                    )}
                </div>
                <div className="table-responsive">
                    <table className="reception-table">
                        <thead>
                            <tr>
                                <th>Patient</th>
                                <th>Assigned To</th>
                                <th>{hospitalContext?.appointmentMode === 'token' ? 'Token #' : 'Time'}</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.map(apt => (
                                <tr key={apt._id}>
                                    <td>{apt.userId?.name}<br /><small>{apt.userId?.phone}</small></td>
                                    <td>{apt.doctorName}</td>
                                    <td>
                                        {apt.tokenNumber != null
                                            ? <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#d97706' }}>#{apt.tokenNumber}</span>
                                            : apt.appointmentTime?.startsWith('token-')
                                                ? <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#d97706' }}>#{apt.appointmentTime.replace('token-', '')}</span>
                                                : apt.appointmentTime}
                                    </td>
                                    <td><span className={`status ${apt.status}`}>{apt.status}</span></td>
                                    <td style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {/* Confirm Payment — show when not yet paid */}
                                        {(apt.paymentStatus || '').toLowerCase() !== 'paid' && apt.status !== 'cancelled' && (
                                            <button
                                                onClick={() => setPaymentModal({ open: true, appointment: apt, method: apt.paymentMethod || 'Cash' })}
                                                style={{ padding: '4px 10px', fontSize: '12px', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: '5px', cursor: 'pointer', fontWeight: '600' }}
                                            >
                                                💰 Confirm Payment
                                            </button>
                                        )}
                                        {/* Print Receipt — show when paid */}
                                        {(apt.paymentStatus || '').toLowerCase() === 'paid' && (
                                            <button
                                                onClick={() => generateReceiptPDF(apt)}
                                                style={{ padding: '4px 10px', fontSize: '12px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '5px', cursor: 'pointer', fontWeight: '600' }}
                                            >
                                                🧾 Print Receipt
                                            </button>
                                        )}
                                        {apt.status !== 'cancelled' && apt.status !== 'completed' && (
                                            <>
                                                <button
                                                    onClick={() => openHospitalizeModal(apt)}
                                                    style={{ padding: '4px 10px', fontSize: '12px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '5px', cursor: 'pointer', fontWeight: '600' }}
                                                >
                                                    Hospitalize
                                                </button>
                                                <button
                                                    onClick={() => handleCancelAppointment(apt._id)}
                                                    style={{ padding: '4px 10px', fontSize: '12px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '5px', cursor: 'pointer', fontWeight: '600' }}
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Payment Confirmation Modal */}
        {paymentModal.open && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>💰 Confirm Payment</h2>
                            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.88rem' }}>
                                {paymentModal.appointment?.userId?.name} — Rs. {Number(paymentModal.appointment?.amount || 0).toLocaleString('en-IN')}
                            </p>
                        </div>
                        <button onClick={() => setPaymentModal({ open: false, appointment: null, method: 'Cash' })} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                    </div>
                    <div style={{ marginBottom: '18px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '7px' }}>Payment Method</label>
                        <select
                            value={paymentModal.method}
                            onChange={e => setPaymentModal(p => ({ ...p, method: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}
                        >
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                            <option value="Card">Card</option>
                            <option value="Cheque">Cheque</option>
                            <option value="NEFT/RTGS">NEFT / RTGS</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={handleConfirmPayment}
                            disabled={confirmingPayment}
                            style={{ flex: 1, padding: '11px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
                        >
                            {confirmingPayment ? 'Confirming...' : '✓ Confirm & Print Receipt'}
                        </button>
                        <button
                            onClick={() => setPaymentModal({ open: false, appointment: null, method: 'Cash' })}
                            style={{ padding: '11px 18px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Hospitalize Modal */}
        {hospitalizeModal.open && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Hospitalize Patient</h2>
                            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                {hospitalizeModal.appointment?.userId?.name} — {hospitalizeModal.appointment?.doctorName}
                            </p>
                        </div>
                        <button onClick={() => setHospitalizeModal({ open: false, appointment: null })} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                    </div>

                    {/* Bed & Ward */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Ward / Room</label>
                            <input
                                type="text"
                                placeholder="e.g. General Ward, ICU"
                                value={hospitalizeForm.ward}
                                onChange={e => setHospitalizeForm(p => ({ ...p, ward: e.target.value }))}
                                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Bed Number</label>
                            <input
                                type="text"
                                placeholder="e.g. B-12"
                                value={hospitalizeForm.bedNumber}
                                onChange={e => setHospitalizeForm(p => ({ ...p, bedNumber: e.target.value }))}
                                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Admission Date</label>
                        <input
                            type="date"
                            value={hospitalizeForm.admissionDate}
                            onChange={e => setHospitalizeForm(p => ({ ...p, admissionDate: e.target.value }))}
                            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}
                        />
                    </div>

                    {/* Facilities */}
                    {(hospitalContext?.facilities?.length > 0) ? (
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>
                                Select Facilities &amp; Days
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {hospitalContext.facilities.map(f => (
                                    <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>₹{f.pricePerDay}/day</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.82rem', color: '#475569' }}>Days:</label>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                value={hospitalizeForm.facilityDays[f.name] || ''}
                                                onChange={e => setHospitalizeForm(p => ({ ...p, facilityDays: { ...p.facilityDays, [f.name]: e.target.value } }))}
                                                style={{ width: '70px', padding: '6px 10px', border: '1.5px solid #e2e8f0', borderRadius: '7px', fontSize: '0.9rem', textAlign: 'center' }}
                                            />
                                        </div>
                                        {hospitalizeForm.facilityDays[f.name] > 0 && (
                                            <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.9rem', minWidth: '70px', textAlign: 'right' }}>
                                                ₹{(f.pricePerDay * Number(hospitalizeForm.facilityDays[f.name])).toLocaleString('en-IN')}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {/* Total */}
                            {Object.values(hospitalizeForm.facilityDays).some(d => d > 0) && (
                                <div style={{ marginTop: '12px', padding: '10px 14px', background: '#eff6ff', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                    <span>Total Facility Cost:</span>
                                    <span style={{ color: '#1d4ed8' }}>
                                        ₹{(hospitalContext.facilities.reduce((sum, f) => sum + (f.pricePerDay * (Number(hospitalizeForm.facilityDays[f.name]) || 0)), 0)).toLocaleString('en-IN')}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ padding: '12px 14px', background: '#fef9c3', borderRadius: '8px', fontSize: '0.88rem', color: '#92400e', marginBottom: '16px' }}>
                            No facilities configured. Hospital admin can add facilities from the Hospital Admin Dashboard.
                        </div>
                    )}

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Notes (optional)</label>
                        <textarea
                            placeholder="Any notes for admission..."
                            value={hospitalizeForm.notes}
                            onChange={e => setHospitalizeForm(p => ({ ...p, notes: e.target.value }))}
                            rows={2}
                            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setHospitalizeModal({ open: false, appointment: null })} style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                            Cancel
                        </button>
                        <button
                            onClick={handleHospitalize}
                            disabled={hospitalizingSaving}
                            style={{ padding: '10px 24px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: hospitalizingSaving ? 0.6 : 1 }}
                        >
                            {hospitalizingSaving ? 'Admitting...' : 'Admit Patient'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default ReceptionDashboard;