import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { receptionAPI, publicAPI, hospitalAPI, uploadAPI, admissionAPI, patientAuthAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import { getSubdomain } from '../../utils/subdomain';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FiSearch, FiUserPlus, FiFileText, FiDollarSign, FiUsers, FiCalendar, FiHome, FiPlusSquare } from 'react-icons/fi';
import './ReceptionDashboard.css';

console.log("--- DASHBOARD FILE IS RUNNING ---");

const timeSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30'
];

const isWithin24Hours = (dateString) => {
    if (!dateString) return false;
    const then = new Date(dateString).getTime();
    const now = new Date().getTime();
    const diffHours = (now - then) / (1000 * 60 * 60);
    return diffHours <= 24;
};

const ReceptionDashboard = ({ isPatientPortal = false }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user: currentUser } = useAuth();
    const [appointments, setAppointments] = useState([]);
    const [doctorsList, setDoctorsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('welcome');
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [profilePatient, setProfilePatient] = useState(null);
    const [profileAppointments, setProfileAppointments] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [hospitalizedPatients, setHospitalizedPatients] = useState([]);
    const [loadingHospitalized, setLoadingHospitalized] = useState(true);
    const [hospitalizedSearch, setHospitalizedSearch] = useState('');
    const [hospitalizedWardFilter, setHospitalizedWardFilter] = useState('');
    const [hospitalizedDoctorFilter, setHospitalizedDoctorFilter] = useState('');

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
        dob: '', age: '', gender: '', mobile: '', email: '',
        address: '', houseNo: '', street: '', city: '', state: '', zipCode: '',
        aadhaar: '', isAadhaarVerified: false,
        relationToPatient: '',
        avatar: '',

        // Partner / Relative
        partnerTitle: 'Mr.', partnerFirstName: '', partnerLastName: '', partnerMobile: '',

        // Vitals / Payment (Reception Duties)
        height: '', weight: '', bmi: '', bloodGroup: '',
        consultationFee: '',

        // Assignment
        department: '', doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: '',
        referralType: '', reasonForVisit: '', paymentMethod: 'Cash'
    });

    const [profilePhoto, setProfilePhoto] = useState(null);
    const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);
    const [paymentScreenshot, setPaymentScreenshot] = useState(null);
    const [verifyingAadhaar, setVerifyingAadhaar] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [aadhaarOtp, setAadhaarOtp] = useState('');
    const [hospitalContext, setHospitalContext] = useState(null);
    const [pendingDownload, setPendingDownload] = useState(null);
    const [followupStatus, setFollowupStatus] = useState(null);

    const processFormChange = useCallback((e, formSetter) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            const cleanVal = value.replace(/\D/g, '').slice(0, 10);
            formSetter(prev => ({ ...prev, [name]: cleanVal }));
        } else if (name === 'aadhaarNumber') {
            const cleanVal = value.replace(/\D/g, '').slice(0, 12);
            formSetter(prev => ({ ...prev, [name]: cleanVal }));
        } else {
            formSetter(prev => ({ ...prev, [name]: value }));
        }
    }, []);

    const handleHospitalizeFormChange = useCallback(
        (e) => processFormChange(e, setHospitalizeForm), 
        [processFormChange]
    );

    const handleIntakeFormChange = useCallback(
        (e) => processFormChange(e, setIntakeForm), 
        [processFormChange]
    );


    useEffect(() => {
        const fetchHospital = async () => {
            try {
                const sub = getSubdomain();
                const res = await hospitalAPI.resolveHospital(sub);
                if (res.success) {
                    setHospitalContext(res.hospital);
                    fetchDoctors(res.hospital._id);
                }
            } catch (err) { console.error('Error fetching hospital context:', err); }
        };
        fetchHospital();

        if (!isPatientPortal) {
            fetchAppointments();
            fetchHospitalizedPatients();
        }
    }, [isPatientPortal]);

    const fetchHospitalizedPatients = async () => {
        try {
            setLoadingHospitalized(true);
            const res = await admissionAPI.getActiveAdmissions();
            if (res.success) {
                setHospitalizedPatients(res.admissions || []);
            }
        } catch (err) {
            console.error('Error fetching hospitalized patients:', err);
        } finally {
            setLoadingHospitalized(false);
        }
    };

    const viewParam = new URLSearchParams(location.search).get('view');
    const patientStateId = location.state?.patient?._id || location.state?.patient?.patientId;

    useEffect(() => {
        if (isPatientPortal) {
            setViewMode('intake');
            const pUserStr = localStorage.getItem('patientUser');
            const pUser = pUserStr ? JSON.parse(pUserStr) : (currentUser || null);
            if (pUser) {
                if (pUser.linkedPatientProfileId) {
                    setSelectedPatientId(pUser.linkedPatientProfileId);
                }
                const searchParams = new URLSearchParams(location.search);
                const queryDept = searchParams.get('department') || '';
                setIntakeForm(prev => ({
                    ...prev,
                    firstName: pUser.name?.split(' ')[0] || '',
                    lastName: pUser.name?.split(' ').slice(1).join(' ') || '',
                    mobile: pUser.mobile || '',
                    email: pUser.email || '',
                    ...(queryDept ? { department: queryDept } : {})
                }));
                if (pUser.linkedPatientProfileId) {
                    patientAuthAPI.getPatientProfile().then(res => {
                        if (res.success && res.profile) {
                            const p = res.profile;
                            setIntakeForm(prev => ({
                                ...prev,
                                title: p.title || prev.title,
                                firstName: p.firstName || prev.firstName,
                                middleName: p.middleName || prev.middleName,
                                lastName: p.lastName || prev.lastName,
                                dob: p.dob ? new Date(p.dob).toISOString().split('T')[0] : prev.dob,
                                age: p.age || prev.age,
                                gender: p.gender || prev.gender,
                                mobile: p.mobile || prev.mobile,
                                email: p.email || prev.email,
                                address: p.address || prev.address,
                                houseNo: p.houseNo || prev.houseNo,
                                street: p.street || prev.street,
                                city: p.city || prev.city,
                                state: p.state || prev.state,
                                zipCode: p.zipCode || prev.zipCode,
                                aadhaar: p.aadhaar || prev.aadhaar,
                                isAadhaarVerified: p.isAadhaarVerified || prev.isAadhaarVerified
                            }));
                        }
                    }).catch(e => console.error("Error loading patient profile in portal:", e));
                }
            }
            return;
        }
        if (location.state?.patient) {
            handleEditPatient(location.state.patient);
        } else if (viewParam === 'intake') {
            handleNewWalkIn();
        } else if (viewParam === 'transactions') {
            fetchTransactions();
            setViewMode('transactions');
        } else if (viewParam === 'list' || viewParam === 'desk' || viewParam === 'availability') {
            setViewMode('list');
        } else {
            setViewMode('welcome');
        }
    }, [patientStateId, viewParam, hospitalContext, isPatientPortal, currentUser]);

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

    // Fetch followup status when department is selected for an existing patient
    useEffect(() => {
        if ((!selectedPatientId && !isPatientPortal) || !intakeForm.department) {
            setFollowupStatus(null);
            return;
        }
        const fetchStatus = async () => {
            try {
                const res = isPatientPortal
                    ? await patientAuthAPI.getFollowupStatus(intakeForm.department, intakeForm.visitDate)
                    : await receptionAPI.getFollowupStatus(selectedPatientId, intakeForm.department, intakeForm.visitDate);
                if (res.success) {
                    setFollowupStatus(res);
                    if (res.active) {
                        setIntakeForm(prev => ({ ...prev, consultationFee: '0' }));
                    } else if (res.fee !== undefined) {
                        setIntakeForm(prev => ({ ...prev, consultationFee: res.fee.toString() }));
                    }
                }
            } catch (err) {
                console.error("Failed to fetch followup status", err);
            }
        };
        fetchStatus();
    }, [selectedPatientId, intakeForm.department, intakeForm.visitDate, isPatientPortal]);

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

    const fetchDoctors = async (hospitalId = '') => {
        try {
            const hid = hospitalId || hospitalContext?._id || '';
            if (!hid) return;
            const response = await publicAPI.getDoctors(null, hid);
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
        setProfilePhoto(null);
        setProfilePhotoPreview(null);
        setIntakeForm({
            title: 'Mrs.', firstName: '', middleName: '', lastName: '',
            dob: '', age: '', gender: '', mobile: '', email: '',
            address: '', houseNo: '', street: '', city: '', state: '', zipCode: '',
            aadhaar: '', isAadhaarVerified: false, relationToPatient: '', avatar: '',
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
        setProfilePhoto(null);
        setProfilePhotoPreview(patient.avatar || null);
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
            relationToPatient: p.relationToPatient || patient.relationToPatient || '',
            address: patient.address || '',
            houseNo: patient.houseNo || '',
            street: patient.street || '',
            city: patient.city || '',
            state: patient.state || '',
            zipCode: patient.zipCode || '',
            avatar: patient.avatar || '',
            age: patient.age || patient.fertilityProfile?.age || '',
            gender: patient.gender || patient.fertilityProfile?.gender || '',
            bloodGroup: patient.bloodGroup || patient.fertilityProfile?.bloodGroup || '',
            dob: patient.dob || patient.fertilityProfile?.dob || '',
            ...p,
            consultationFee: hospitalContext?.appointmentFee ?? '500',
            department: '', doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: ''
        }));
        setViewMode('intake');
    };

    const handleSelectSearchResult = async (patient) => {
        handleEditPatient(patient);
        setSearchResults([]);

        try {
            const res = await receptionAPI.getFollowupStatus(patient._id || patient.patientId, 'auto', new Date().toISOString().split('T')[0]);
            if (res.success && res.department) {
                setIntakeForm(prev => ({ ...prev, department: res.department }));
            }
        } catch (err) {
            console.error("Failed to auto-fetch followup status", err);
        }
    };

    const handleViewProfile = (patient) => {
        const dept = patient.department || patient.serviceName || 'Unassigned';
        navigate(`/patient/${patient._id || patient.patientId || patient.id}/department/${encodeURIComponent(dept)}`);
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
            fetchAppointments();
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
    const generateReceiptPDF = (apt, paymentMethodOverride, shouldSave = true) => {
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
        const filename = `Receipt_${pid}.pdf`;
        if (shouldSave) {
            doc.save(filename);
        }
        return { doc, filename };
    };

    const handleConfirmPayment = async () => {
        setConfirmingPayment(true);
        const { appointment, method, data } = paymentModal;
        try {
            await receptionAPI.confirmPayment(appointment._id, method, appointment.amount, data || {});
            const pdf = generateReceiptPDF({ ...appointment, paymentMethod: method, paymentStatus: 'Paid' }, method, false);
            setPendingDownload({ doc: pdf.doc, filename: pdf.filename, title: 'Payment Receipt' });
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

        if (name === 'mobile' || name === 'partnerMobile') {
            const cleaned = value.replace(/\D/g, '');
            if (cleaned.length > 10) return;
            setIntakeForm(prev => ({ ...prev, [name]: cleaned }));
            return;
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

        if (intakeForm.firstName.trim().length < 2) {
            alert("Name must be at least 2 characters.");
            setSaving(false); return;
        }

        if (!intakeForm.age || intakeForm.age < 1) {
            alert("Age is required and must be a positive number greater than 0.");
            setSaving(false); return;
        }

        if (!intakeForm.aadhaar || !/^\d{12}$/.test(intakeForm.aadhaar)) {
            alert("Aadhaar Number is required and must be exactly 12 digits.");
            setSaving(false); return;
        }

        if (!/^\d{10}$/.test(intakeForm.mobile)) {
            alert("Mobile number must be exactly 10 digits.");
            setSaving(false); return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!intakeForm.email || !emailRegex.test(intakeForm.email)) {
            alert("Please enter a valid email address (e.g. patient@gmail.com).");
            setSaving(false); return;
        }

        // Compile full address
        const fullAddress = [intakeForm.houseNo, intakeForm.street, intakeForm.city, intakeForm.state, intakeForm.zipCode]
            .map(s => String(s || '').trim())
            .filter(Boolean)
            .join(', ');
        intakeForm.address = fullAddress || intakeForm.address || '';

        if (!selectedPatientId && intakeForm.doctor && intakeForm.visitTime && intakeForm.paymentMethod !== 'Cash' && !paymentScreenshot) {
            alert(`Please upload a payment screenshot/proof for ${intakeForm.paymentMethod} payment before booking.`);
            setSaving(false); return;
        }

        try {
            let userId = selectedPatientId;

            if (isPatientPortal && !userId) {
                const pU = JSON.parse(localStorage.getItem('patientUser') || '{}');
                userId = pU.linkedPatientProfileId;
            }

            // 1. Register/Find User (If new walk-in OR new patient portal onboarding)
            if (!userId) {
                const regRes = await receptionAPI.registerPatient({
                    name: `${intakeForm.firstName || ''} ${intakeForm.lastName || ''}`.trim(),
                    email: intakeForm.email,
                    phone: intakeForm.mobile,
                    age: intakeForm.age,
                    aadhaarNumber: intakeForm.aadhaar
                });

                if (regRes.success && regRes.user) {
                    userId = regRes.user._id;
                    if (isPatientPortal) {
                        const pU = JSON.parse(localStorage.getItem('patientUser') || '{}');
                        pU.linkedPatientProfileId = userId;
                        pU.mrn = regRes.user.patientId || regRes.user.mrn;
                        localStorage.setItem('patientUser', JSON.stringify(pU));
                        setSelectedPatientId(userId);
                    }
                } else {
                    throw new Error(regRes.message || "Registration failed.");
                }
            }

            // 2. Upload profile photo if selected
            let avatarUrl = null;
            if (profilePhoto) {
                try {
                    const photoFD = new FormData();
                    photoFD.append('images', profilePhoto);
                    const photoRes = await uploadAPI.uploadImages(photoFD);
                    if (photoRes.success && photoRes.files?.length > 0) {
                        avatarUrl = photoRes.files[0].url;
                    }
                } catch { /* non-fatal */ }
            }

            // 3. Update Profile (Vitals + Basic Info + Aadhaar + Avatar)
            const intakePayload = { ...intakeForm };
            if (avatarUrl) intakePayload.avatar = avatarUrl;
            await receptionAPI.updateIntake(userId, intakePayload);

            const isTokenMode = hospitalContext?.appointmentMode === 'token';
            const canBook = intakeForm.doctor && intakeForm.visitDate && (intakeForm.visitTime || isTokenMode);

            if (!canBook) {
                if (isPatientPortal) {
                    const localU = JSON.parse(localStorage.getItem('patientUser') || '{}');
                    alert("✅ Patient Profile Registered Successfully!\n\nRedirecting to your Dashboard...");
                    localU.registrationStatus = 'Completed';
                    if (userId) localU.linkedPatientProfileId = userId;
                    localStorage.setItem('patientUser', JSON.stringify(localU));
                    navigate('/patient/dashboard');
                    return;
                }
                if (selectedPatientId) {
                    alert("✅ Patient profile and demographics updated successfully!");
                    setSaving(false);
                    if (location.state?.isEditingExisting) {
                        navigate(`/patient/${userId}`);
                        return;
                    }
                    fetchAppointments();
                    setViewMode('list');
                    return;
                }
            }

            // 3. Book Appointment (optional when editing existing patient)
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
                    department: intakeForm.department,
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
                            ['MRN / ID', bookingRes.appointment?.patientId || 'N/A'],
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
                    const receiptPatientId = bookingRes.appointment?.patientId || 'Patient';
                    setPendingDownload({ doc, filename: `Receipt_${receiptPatientId}.pdf`, title: 'Registration Receipt' });

                    setPaymentScreenshot(null);
                    fetchAppointments();
                    if (intakeForm.doctor && intakeForm.visitDate) {
                        fetchBookedSlots(intakeForm.doctor, intakeForm.visitDate);
                    }
                    setViewMode('list');

                    const tokenMsg = bookingRes.appointment?.tokenNumber
                        ? ` Token #${bookingRes.appointment.tokenNumber} assigned.` : '';

                    if (isPatientPortal) {
                        const localU = JSON.parse(localStorage.getItem('patientUser') || '{}');
                        const isReBook = selectedPatientId || localU.linkedPatientProfileId;
                        const msg = isReBook
                            ? `✅ Appointment Booked Successfully!${tokenMsg}\n\nRedirecting to your Dashboard...`
                            : `Patient Registered & Assigned to Doctor!${tokenMsg}\n\nYour Patient Dashboard is now Activated!`;
                        alert(msg);
                        localU.registrationStatus = 'Completed';
                        if (bookingRes.appointment?.userId) {
                            localU.linkedPatientProfileId = bookingRes.appointment.userId;
                        }
                        if (receiptPatientId) {
                            localU.mrn = receiptPatientId;
                        }
                        localStorage.setItem('patientUser', JSON.stringify(localU));
                        navigate('/patient/dashboard');
                        return;
                    } else {
                        alert(`Patient Registered & Assigned to Doctor!${tokenMsg}`);
                    }
                } else {
                    alert("Booking Failed: " + bookingRes.message);
                }
            } else if (selectedPatientId) {
                // Editing existing patient — profile saved, no appointment needed
                alert("✅ Patient details updated successfully!");
                setViewMode('list');
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
            <div className="intake-full-page" data-lenis-prevent="true">
                <div className="context-bar">
                    <h3>{isPatientPortal ? (followupStatus?.active ? 'Re-Book Appointment' : 'Book Appointment') : (selectedPatientId ? 'Edit Patient Details' : 'New Registration')}</h3>
                    <button type="button" className="btn-cancel" onClick={() => isPatientPortal ? navigate('/patient/dashboard') : setViewMode('list')}>Close ✖</button>
                </div>
                <div className="intake-container">
                    <form onSubmit={handleSave}>
                        {/* Unifying Sections 1, 2, and 3 into a single card container */}
                        <div className="form-section">
                            <h4>1. Patient Identity & KYC</h4>

                            {/* PATIENT PROFILE PHOTO */}
                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '6px' }}>Patient Photo</label>
                                <div
                                    onClick={() => document.getElementById('avatarFileInput').click()}
                                    style={{
                                        cursor: 'pointer',
                                        border: '1.5px dashed #cbd5e1',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        backgroundColor: '#f8fafc',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.borderColor = '#14b8a6'}
                                    onMouseOut={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                                >
                                    {profilePhotoPreview || (profilePhoto && URL.createObjectURL(profilePhoto)) ? (
                                        <img
                                            src={profilePhoto ? URL.createObjectURL(profilePhoto) : profilePhotoPreview}
                                            alt="Patient"
                                            style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <span style={{ fontSize: '1.25rem' }}>📷</span>
                                    )}
                                    <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
                                        {profilePhoto || profilePhotoPreview ? 'Change Photo' : 'Open Camera / Upload'}
                                    </span>
                                </div>
                                <input
                                    id="avatarFileInput"
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            setProfilePhoto(file);
                                            setProfilePhotoPreview(URL.createObjectURL(file));
                                        }
                                    }}
                                    style={{ display: 'none' }}
                                />
                            </div>

                            {/* AADHAAR VERIFICATION ROW */}
                            <div className="form-row" style={{ alignItems: 'flex-end', backgroundColor: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px dashed #22c55e', gap: '15px' }}>
                                {/* AADHAAR INPUT */}
                                <div className="field" style={{ flex: 1 }}>
                                    <label>Aadhaar Number</label>
                                    <input
                                        name="aadhaar"
                                        maxLength={12}
                                        placeholder="Enter 12-digit Aadhaar"
                                        value={intakeForm.aadhaar || ''}
                                        onChange={handleInputChange}
                                        required
                                        pattern="^\d{12}$"
                                        title="Aadhaar number must be exactly 12 digits"
                                        style={{
                                            borderColor: '#ccc',
                                            fontWeight: 'bold'
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="form-row" style={{ marginTop: '14px' }}>
                                <div className="field"><label>First Name <span style={{ color: '#ef4444', fontSize: '12px' }}>*</span></label><input name="firstName" value={intakeForm.firstName} onChange={handleInputChange} required minLength={2} /></div>
                                <div className="field"><label>Last Name</label><input name="lastName" value={intakeForm.lastName} onChange={handleInputChange} /></div>
                                <div className="field"><label>Mobile <span style={{ color: '#ef4444', fontSize: '12px' }}>*</span></label><input name="mobile" value={intakeForm.mobile} onChange={handleInputChange} required pattern="^\d{10}$" title="Phone number must be exactly 10 digits" /></div>
                                <div className="field"><label>Age <span style={{ color: '#ef4444', fontSize: '12px' }}>*</span></label><input type="number" name="age" value={intakeForm.age} onChange={handleInputChange} required min="1" /></div>
                            </div>
                            <div className="form-row" style={{ marginTop: '0px' }}>
                                <div className="field" style={{ flex: '7' }}>
                                    <label>Email Address <span style={{ color: '#ef4444', fontSize: '12px' }}>*</span></label>
                                    <input name="email" type="email" placeholder="patient@gmail.com" value={intakeForm.email} onChange={handleInputChange} required />
                                </div>
                                <div className="field" style={{ flex: '3' }}>
                                    <label>Gender <span style={{ color: '#ef4444', fontSize: '12px' }}>*</span></label>
                                    <select name="gender" value={intakeForm.gender} onChange={handleInputChange} required>
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="field"><label>Relative Name</label><input name="partnerFirstName" placeholder="Relative Name" value={intakeForm.partnerFirstName} onChange={handleInputChange} /></div>
                                <div className="field">
                                    <label>Relation To Patient</label>
                                    <select name="relationToPatient" value={intakeForm.relationToPatient || ''} onChange={handleInputChange}>
                                        <option value="">-- Select Relation --</option>
                                        <option value="Husband">Husband</option>
                                        <option value="Wife">Wife</option>
                                        <option value="Father">Father</option>
                                        <option value="Mother">Mother</option>
                                        <option value="Son">Son</option>
                                        <option value="Others">Others</option>
                                    </select>
                                </div>
                                <div className="field"><label>Relative Mobile</label><input name="partnerMobile" placeholder="Relative Mobile" value={intakeForm.partnerMobile} onChange={handleInputChange} /></div>
                            </div>

                            <hr style={{ border: '0', borderTop: '1px solid #e2e8f0', margin: '24px 0' }} />

                            <h4>2. Address Information</h4>
                            <div className="form-row">
                                <div className="field">
                                    <label>House No / Flat No / Building Name</label>
                                    <input
                                        name="houseNo"
                                        placeholder="House No / Flat No / Building Name"
                                        value={intakeForm.houseNo || ''}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div className="field">
                                    <label>Street / Area / Locality</label>
                                    <input
                                        name="street"
                                        placeholder="Street / Area / Locality"
                                        value={intakeForm.street || ''}
                                        onChange={handleInputChange}
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="field">
                                    <label>City</label>
                                    <input
                                        name="city"
                                        placeholder="City"
                                        value={intakeForm.city || ''}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div className="field">
                                    <label>State</label>
                                    <input
                                        name="state"
                                        placeholder="State"
                                        value={intakeForm.state || ''}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div className="field">
                                    <label>Pincode</label>
                                    <input
                                        name="zipCode"
                                        placeholder="Pincode"
                                        value={intakeForm.zipCode || ''}
                                        onChange={handleInputChange}
                                    />
                                </div>
                            </div>

                            <hr style={{ border: '0', borderTop: '1px solid #e2e8f0', margin: '24px 0' }} />

                            <h4>3. Patient Source Information</h4>
                            <div className="form-row">
                                <div className="field">
                                    <label>Referral Type</label>
                                    <select name="referralType" value={intakeForm.referralType || ''} onChange={handleInputChange}>
                                        <option value="">-- Select Source / Referral --</option>
                                        <option value="Self">Self / Direct</option>
                                        <option value="Doctor Referral">Doctor Referral</option>
                                        <option value="Social Media">Social Media (FB/Insta)</option>
                                        <option value="Google/Website">Google Search / Website</option>
                                        <option value="Newspaper/Banner">Newspaper / Banner</option>
                                        <option value="Friend/Relative">Friend / Relative</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>

                            <hr style={{ border: '0', borderTop: '1px solid #e2e8f0', margin: '24px 0' }} />

                            <h4>4. Vitals & Payment</h4>
                            <div className="form-row">
                                <div className="field"><label>Height (cm)</label><input name="height" value={intakeForm.height} onChange={handleInputChange} /></div>
                                <div className="field"><label>Weight (kg)</label><input name="weight" value={intakeForm.weight} onChange={handleInputChange} /></div>
                                <div className="field"><label>BMI</label><input name="bmi" value={intakeForm.bmi} readOnly /></div>
                                <div className="field">
                                    <label>Consultation Fee</label>
                                    <input name="consultationFee" value={intakeForm.consultationFee} readOnly style={{ backgroundColor: '#f1f5f9', color: '#475569', cursor: 'not-allowed' }} />
                                </div>
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

                            {/* FOLLOW UP STATUS CARD RELOCATED HERE */}
                            {followupStatus && followupStatus.lastConsultation && (
                                <div className="form-row" style={{ marginTop: '0px' }}>
                                    <div className="field" style={{ flex: 1 }}>
                                        <div style={{
                                            padding: '12px 16px', borderRadius: '8px', border: '1px solid',
                                            backgroundColor: followupStatus.active ? '#f0fdf4' : '#fef2f2',
                                            borderColor: followupStatus.active ? '#bbf7d0' : '#fecaca',
                                            color: followupStatus.active ? '#15803d' : '#b91c1c',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                                                <span>{followupStatus.active ? '🟢 Follow-up Active' : '🔴 Follow-up Expired'}</span>
                                            </div>
                                            <div style={{ fontSize: '13px', display: 'flex', gap: '24px', alignItems: 'center' }}>
                                                {followupStatus.active ? (
                                                    <>
                                                        <div>Last Visit: <strong>{new Date(followupStatus.lastConsultation).toLocaleDateString('en-IN')}</strong></div>
                                                        <div>Valid Till: <strong>{new Date(followupStatus.validUntil).toLocaleDateString('en-IN')}</strong></div>
                                                        {(() => {
                                                            const remaining = Math.max(0, Math.ceil((new Date(followupStatus.validUntil).getTime() - new Date(intakeForm.visitDate || new Date()).getTime()) / (1000 * 3600 * 24)));
                                                            return <div>Remaining Days: <strong>{remaining === 0 ? 'Expires Today' : `${remaining} Day${remaining > 1 ? 's' : ''}`}</strong></div>;
                                                        })()}
                                                        <div>Fee: <strong>₹0</strong></div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div>Last Visit: <strong>{new Date(followupStatus.lastConsultation).toLocaleDateString('en-IN')}</strong></div>
                                                        <div>Expired On: <strong>{new Date(followupStatus.validUntil).toLocaleDateString('en-IN')}</strong></div>
                                                        <div>Fee Applicable: <strong>₹{followupStatus.fee || intakeForm.consultationFee}</strong></div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

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

                            <hr style={{ border: '0', borderTop: '1px solid #e2e8f0', margin: '24px 0' }} />

                            <div style={{ backgroundColor: '#eff6ff', padding: '20px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                                <h4 style={{ color: '#1e40af', fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', borderBottom: '2px solid #bfdbfe', paddingBottom: '10px' }}>5. Assign to Doctor/Counselor</h4>
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
                        </div>

                        <div className="form-footer">
                            <button type="submit" className="btn-save" disabled={saving}>
                                {saving
                                    ? 'Saving...'
                                    : (() => {
                                        const isTokenMode = hospitalContext?.appointmentMode === 'token';
                                        const canBook = intakeForm.doctor && intakeForm.visitDate && (intakeForm.visitTime || isTokenMode);
                                        const actionText = followupStatus?.active ? 'Re-Book Appointment' : (isTokenMode && !isPatientPortal ? 'Issue Token' : 'Book Appointment');
                                        if (isPatientPortal) return canBook ? actionText : 'Complete Profile & Continue';
                                        if (selectedPatientId) return canBook ? `${actionText} & Receipt` : 'Save Patient Details';
                                        return canBook ? `Register, ${actionText} & Receipt` : 'Save Patient Details';
                                    })()
                                }
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    if (viewMode === 'transactions') {
        const totalCollected = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        return (
            <div className="reception-dashboard" style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <div className="dashboard-header">
                    <button onClick={() => navigate('/reception/dashboard')} style={{ padding: '8px 20px', background: '#f1f5f9', border: '2px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>← Back to Dashboard</button>
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
                                <th style={{ whiteSpace: 'nowrap' }}>Doctor</th>
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
                                        <td style={{ whiteSpace: 'nowrap' }}>{t.doctorName || '-'}</td>
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

    const renderTodaysQueue = () => (
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
                            <th style={{ whiteSpace: 'nowrap' }}>Doctor</th>
                            <th>{hospitalContext?.appointmentMode === 'token' ? 'Token #' : 'Time'}</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {appointments.map(apt => (
                            <tr key={apt._id}>
                                <td>{apt.userId?.name}<br /><small>{apt.userId?.phone}</small></td>
                                <td style={{ whiteSpace: 'nowrap' }}>{apt.doctorName || '-'}</td>
                                <td>
                                    {apt.tokenNumber != null
                                        ? <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#d97706' }}>#{apt.tokenNumber}</span>
                                        : apt.appointmentTime?.startsWith('token-')
                                            ? <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#d97706' }}>#{apt.appointmentTime.replace('token-', '')}</span>
                                            : apt.appointmentTime}
                                </td>
                                <td><span className={`status ${apt.status}`}>{apt.status}</span></td>
                                <td style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {(apt.paymentStatus || '').toLowerCase() !== 'paid' && apt.status !== 'cancelled' && (
                                        <button
                                            onClick={() => setPaymentModal({ open: true, appointment: apt, method: apt.paymentMethod || 'Cash' })}
                                            style={{ padding: '4px 10px', fontSize: '12px', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: '5px', cursor: 'pointer', fontWeight: '600' }}
                                        >
                                            💰 Confirm Payment
                                        </button>
                                    )}
                                    {(apt.paymentStatus || '').toLowerCase() === 'paid' && (
                                        <button
                                            onClick={() => generateReceiptPDF(apt)}
                                            style={{ padding: '4px 10px', fontSize: '12px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '5px', cursor: 'pointer', fontWeight: '600' }}
                                        >
                                            🧾 Print Receipt
                                        </button>
                                    )}
                                    {apt.status !== 'cancelled' && (
                                        <>
                                            {console.log('DEBUG apt:', apt._id, 'createdAt:', apt.createdAt, 'isWithin24Hours:', isWithin24Hours(apt.createdAt))}
                                            {isWithin24Hours(apt.createdAt) && (
                                                <button
                                                    onClick={() => openHospitalizeModal(apt)}
                                                    disabled={false}
                                                    style={{
                                                        padding: '4px 10px',
                                                        fontSize: '12px',
                                                        background: apt.isHospitalized ? '#fff1f2' : '#dbeafe',
                                                        color: apt.isHospitalized ? '#be123c' : '#1d4ed8',
                                                        border: apt.isHospitalized ? '1px solid #fda4af' : '1px solid #93c5fd',
                                                        borderRadius: '5px',
                                                        cursor: 'pointer',
                                                        fontWeight: '600'
                                                    }}
                                                >
                                                    {apt.isHospitalized ? '🏥 Hospitalized' : 'Hospitalize'}
                                                </button>
                                            )}
                                            {apt.status !== 'completed' && (
                                                <button
                                                    onClick={() => handleCancelAppointment(apt._id)}
                                                    style={{ padding: '4px 10px', fontSize: '12px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '5px', cursor: 'pointer', fontWeight: '600' }}
                                                >Cancel</button>
                                            )}
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderModals = () => (
        <>
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Ward / Room</label>
                                <input
                                    type="text"
                                    placeholder="e.g. General Ward, ICU"
                                    value={hospitalizeForm.ward}
                                    name="ward" onChange={handleHospitalizeFormChange}
                                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Bed Number</label>
                                <input
                                    type="text"
                                    placeholder="e.g. B-12"
                                    value={hospitalizeForm.bedNumber}
                                    name="bedNumber" onChange={handleHospitalizeFormChange}
                                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Admission Date</label>
                            <input
                                type="date"
                                value={hospitalizeForm.admissionDate}
                                name="admissionDate" onChange={handleHospitalizeFormChange}
                                style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}
                            />
                        </div>

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
                                name="notes" onChange={handleHospitalizeFormChange}
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

    if (viewMode === 'welcome') {
        const timeOfDay = new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening';
        return (
            <>
                <div className="reception-dashboard" style={{ padding: '10px 0' }}>
                    {pendingDownload && (
                        <div style={{
                            margin: '0 0 20px 0',
                            padding: '12px 20px',
                            background: '#ecfdf5',
                            border: '1.5px solid #a7f3d0',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)',
                            fontFamily: 'var(--font-primary)'
                        }}>
                            <span style={{ color: '#065f46', fontWeight: 600, fontSize: '0.95rem' }}>
                                ✅ {pendingDownload.title || 'Document Generated'} — {pendingDownload.filename} is ready
                            </span>
                            <button
                                onClick={() => {
                                    pendingDownload.doc.save(pendingDownload.filename);
                                    setPendingDownload(null);
                                }}
                                style={{
                                    padding: '8px 16px',
                                    background: '#059669',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                📥 Download
                            </button>
                        </div>
                    )}

                    {/* WELCOME BANNER (Matched to Reference Image) */}
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '24px',
                        padding: '44px 34px',
                        marginBottom: '36px',
                        boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.06), 0 4px 12px -2px rgba(0, 0, 0, 0.03)',
                        border: '1px solid #f1f5f9',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <span style={{ fontSize: '2.2rem' }}>👋</span>
                            <span style={{
                                background: '#0d9488',
                                color: '#ffffff',
                                padding: '5px 14px',
                                borderRadius: '20px',
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                boxShadow: '0 4px 10px rgba(13, 148, 136, 0.2)'
                            }}>
                                RECEPTIONIST
                            </span>
                        </div>
                        <h1 style={{ margin: '0 0 10px', fontSize: '2.4rem', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.02em' }}>
                            Good {timeOfDay.toLowerCase()}, <span style={{ color: '#0d9488' }}>{currentUser?.name || 'vedika singh'}</span>
                        </h1>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '1.05rem', fontWeight: 500 }}>
                            Here's your workspace. Pick any section to get started.
                        </p>
                    </div>

                    {/* QUICK ACCESS CARDS */}
                    <div style={{ marginBottom: '34px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>⚡ QUICK ACCESS</span>
                            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '22px'
                        }}>
                            {/* Card 1: Patient Registration */}
                            <div
                                onClick={() => navigate('/reception/dashboard?view=intake')}
                                style={{
                                    background: '#ffffff',
                                    borderRadius: '16px',
                                    padding: '26px',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '18px'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 20px -5px rgba(13, 148, 136, 0.12)'; e.currentTarget.style.borderColor = '#99f6e4'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                            >
                                <div style={{
                                    width: '54px',
                                    height: '54px',
                                    borderRadius: '14px',
                                    background: '#f0fdf4',
                                    color: '#16a34a',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.6rem',
                                    flexShrink: 0
                                }}>
                                    <FiUserPlus />
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Patient Registration</h4>
                                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: '1.4' }}>
                                        View and manage patient records
                                    </p>
                                </div>
                            </div>

                            {/* Card 2: Patient Search */}
                            <div
                                onClick={() => navigate('/reception/patients')}
                                style={{
                                    background: '#ffffff',
                                    borderRadius: '16px',
                                    padding: '26px',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '18px'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 20px -5px rgba(37, 99, 235, 0.12)'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                            >
                                <div style={{
                                    width: '54px',
                                    height: '54px',
                                    borderRadius: '14px',
                                    background: '#eff6ff',
                                    color: '#2563eb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.6rem',
                                    flexShrink: 0
                                }}>
                                    <FiSearch />
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Patient Search</h4>
                                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: '1.4' }}>
                                        View and manage patient records
                                    </p>
                                </div>
                            </div>

                            {/* Card 3: Finance & Accounting */}
                            <div
                                onClick={() => {
                                    fetchTransactions();
                                    setViewMode('transactions');
                                    navigate('/reception/dashboard?view=transactions');
                                }}
                                style={{
                                    background: '#ffffff',
                                    borderRadius: '16px',
                                    padding: '26px',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '18px'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 20px -5px rgba(217, 119, 6, 0.12)'; e.currentTarget.style.borderColor = '#fde68a'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                            >
                                <div style={{
                                    width: '54px',
                                    height: '54px',
                                    borderRadius: '14px',
                                    background: '#fffbeb',
                                    color: '#d97706',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.6rem',
                                    flexShrink: 0
                                }}>
                                    <FiDollarSign />
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Finance & Accounting</h4>
                                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: '1.4' }}>
                                        Access Finance & Accounting
                                    </p>
                                </div>
                            </div>

                            {/* Card 4: Patient Billing */}

                        </div>
                    </div>
                </div>
                {renderModals()}
            </>
        );
    }

    return (
        <>
            <div className="reception-dashboard">
                {pendingDownload && (
                    <div style={{
                        margin: '0 0 20px 0',
                        padding: '12px 20px',
                        background: '#ecfdf5',
                        border: '1.5px solid #a7f3d0',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)',
                        fontFamily: 'var(--font-primary)'
                    }}>
                        <span style={{ color: '#065f46', fontWeight: 600, fontSize: '0.95rem' }}>
                            ✅ {pendingDownload.title || 'Document Generated'} — {pendingDownload.filename} is ready
                        </span>
                        <button
                            onClick={() => {
                                pendingDownload.doc.save(pendingDownload.filename);
                                setPendingDownload(null);
                            }}
                            style={{
                                padding: '8px 16px',
                                background: '#059669',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            📥 Download
                        </button>
                    </div>
                )}

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
                                            onClick={() => handleSelectSearchResult(p)}
                                            style={{ padding: '6px 14px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
                                        >
                                            📋 Book Appointment
                                        </button>
                                        <button
                                            onClick={() => handleViewProfile(p)}
                                            style={{ padding: '6px 14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
                                        >
                                            👤 View Profile
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

                {renderTodaysQueue()}
            </div>

            {renderModals()}
        </>
    );
};

export default ReceptionDashboard;