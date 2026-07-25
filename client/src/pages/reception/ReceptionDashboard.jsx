import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { receptionAPI, publicAPI, hospitalAPI, uploadAPI, admissionAPI, patientAuthAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import { getSubdomain } from '../../utils/subdomain';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FiSearch, FiUserPlus, FiFileText, FiDollarSign, FiUsers, FiCalendar, FiHome, FiPlusSquare } from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa';
import PaymentSection from '../../components/PaymentSection';
import SlotPicker from '../../components/SlotPicker';
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
    const [loadingHospitalized, setLoadingHospitalized] = useState(false);
    
    // New states for Reception Dashboard Filtering
    const [listTab, setListTab] = useState('queue'); // 'queue', 'all', 'hospitalized'
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 500);
        return () => clearTimeout(handler);
    }, [searchQuery]);


    // Token mode — next token preview
    const [nextToken, setNextToken] = useState(null);

    // Payment confirm modal
    const [paymentModal, setPaymentModal] = useState({ open: false, appointment: null, splitPayments: [{ method: 'Cash', amount: '' }] });
    const [confirmingPayment, setConfirmingPayment] = useState(false);

    // Hospitalization modal
    const [hospitalizeModal, setHospitalizeModal] = useState({ open: false, appointment: null });
    const [hospitalizeForm, setHospitalizeForm] = useState({ ward: '', bedNumber: '', admissionDate: new Date().toISOString().split('T')[0], notes: '', facilityDays: {} });
    const [hospitalizingSaving, setHospitalizingSaving] = useState(false);

    const [upiOptions, setUpiOptions] = useState([]);
    const [intakePaymentData, setIntakePaymentData] = useState({ upiId: '', transactionId: '', cardDetails: '', bankReference: '' });

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
        referralType: '', reasonForVisit: '', paymentMethod: 'Cash',
        splitPayments: [{ method: 'Cash', amount: '' }]
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
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [cameraCapturedPreview, setCameraCapturedPreview] = useState(null); // blob URL for preview before saving
    const [cameraCapturedBlob, setCameraCapturedBlob] = useState(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    const startCamera = async () => {
        setCameraCapturedPreview(null);
        setCameraCapturedBlob(null);
        setShowCameraModal(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
        } catch (err) {
            alert("Camera access denied or unavailable.");
            setShowCameraModal(false);
        }
    };

    const capturePhotoFromCamera = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth || 640;
            canvasRef.current.height = videoRef.current.videoHeight || 480;
            context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
            canvasRef.current.toBlob(blob => {
                if (blob) {
                    setCameraCapturedBlob(blob);
                    setCameraCapturedPreview(URL.createObjectURL(blob));
                    // Pause camera stream (don't stop yet — retake needs it)
                    if (videoRef.current && videoRef.current.srcObject) {
                        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
                    }
                }
            }, 'image/jpeg');
        }
    };

    const saveCapturedPhoto = () => {
        if (cameraCapturedBlob) {
            const file = new File([cameraCapturedBlob], 'patient_photo.jpg', { type: 'image/jpeg' });
            setProfilePhoto(file);
            setProfilePhotoPreview(URL.createObjectURL(file));
        }
        setCameraCapturedPreview(null);
        setCameraCapturedBlob(null);
        setShowCameraModal(false);
    };

    const retakePhoto = async () => {
        setCameraCapturedPreview(null);
        setCameraCapturedBlob(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
        } catch (err) {
            alert("Camera access denied or unavailable.");
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        }
        setCameraCapturedPreview(null);
        setCameraCapturedBlob(null);
        setShowCameraModal(false);
    };

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

    const handleIntakeSplitPaymentChange = (index, field, value) => {
        const newSplits = [...intakeForm.splitPayments];
        newSplits[index][field] = value;
        setIntakeForm(prev => ({ ...prev, splitPayments: newSplits }));
    };

    const addIntakeSplitPayment = () => {
        setIntakeForm(prev => ({ ...prev, splitPayments: [...prev.splitPayments, { method: 'Cash', amount: '' }] }));
    };

    const removeIntakeSplitPayment = (index) => {
        setIntakeForm(prev => ({ ...prev, splitPayments: prev.splitPayments.filter((_, i) => i !== index) }));
    };

    const totalIntakeSplitAmount = (intakeForm.splitPayments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);


    useEffect(() => {
        const fetchHospital = async () => {
            try {
                const sub = getSubdomain();
                const res = await hospitalAPI.resolveHospital(sub);
                if (res.success) {
                    setHospitalContext(res.hospital);
                    fetchDoctors(res.hospital._id);
                    const upiRes = await hospitalAPI.getUpiIds();
                    if (upiRes.success) {
                        // Try to fetch department-specific UPI for Reception
                        try {
                            const deptUpiRes = await hospitalAPI.getDepartmentUpiByRole('Reception');
                            if (deptUpiRes.success && deptUpiRes.departmentUpi) {
                                const du = deptUpiRes.departmentUpi;
                                setUpiOptions([{ label: du.label, upiId: du.upiId }]);
                            } else {
                                // Fallback to legacy hospital-wide UPI list
                                setUpiOptions(upiRes.upiIds || []);
                            }
                        } catch {
                            setUpiOptions(upiRes.upiIds || []);
                        }
                    }
                }
            } catch (err) { console.error('Error fetching hospital context:', err); }
        };
        fetchHospital();

        if (!isPatientPortal) {
            // Initial fetch handled by another useEffect below
        }
    }, [isPatientPortal]);

    const fetchHospitalizedPatients = async () => {
        try {
            setLoadingHospitalized(true);
            const params = {
                department: departmentFilter,
                search: debouncedSearch
            };
            const res = await admissionAPI.getActiveAdmissions(params);
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
            const params = {
                all: listTab === 'all' ? 'true' : 'false',
                department: departmentFilter,
                search: debouncedSearch
            };
            const response = await receptionAPI.getAllAppointments(params);
            if (response.success) setAppointments(response.appointments);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => {
        if (!isPatientPortal) {
            fetchHospitalizedPatients();
            if (listTab === 'queue' || listTab === 'all') {
                fetchAppointments();
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listTab, departmentFilter, debouncedSearch, isPatientPortal]);

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
            referralType: '', reasonForVisit: '', paymentMethod: 'Cash',
            splitPayments: [{ method: 'Cash', amount: '' }]
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
                setIntakeForm(prev => ({ 
                    ...prev, 
                    department: res.department,
                    doctor: res.doctorId || prev.doctor
                }));
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
            fetchHospitalizedPatients();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to admit patient');
        } finally {
            setHospitalizingSaving(false);
        }
    };

    const handleDischargePatient = async (admissionId) => {
        if (!window.confirm('Are you sure you want to discharge this patient?')) return;
        try {
            const res = await admissionAPI.dischargePatient(admissionId, { dischargeDate: new Date() });
            if (res.success) {
                alert('Patient discharged successfully!');
                fetchHospitalizedPatients();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to discharge patient.');
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
        const { appointment, splitPayments, data } = paymentModal;
        const totalSplit = splitPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
        
        if (totalSplit !== Number(appointment.amount || 0)) {
            alert(`Total split amount (₹${totalSplit}) must match the appointment fee (₹${appointment.amount}).`);
            return;
        }

        setConfirmingPayment(true);
        
        try {
            await receptionAPI.confirmPayment(appointment._id, splitPayments[0].method, appointment.amount, { ...(data || {}), splitPayments });
            const paymentMethodStr = splitPayments.map(p => `${p.method} (${p.amount})`).join(' + ');
            const pdf = generateReceiptPDF({ ...appointment, paymentMethod: paymentMethodStr, paymentStatus: 'Paid' }, paymentMethodStr, false);
            setPendingDownload({ doc: pdf.doc, filename: pdf.filename, title: 'Payment Receipt' });
            setPaymentModal({ open: false, appointment: null, splitPayments: [{ method: 'Cash', amount: '' }] });
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
        if (query.trim().length === 0) {
            setSearchResults([]);
            return;
        }
        try {
            const res = await receptionAPI.searchPatients(query);
            if (res.success) {
                setSearchQuery(current => {
                    if (current === query) {
                        setSearchResults(res.patients);
                    }
                    return current;
                });
            }
        } catch (err) { console.error(err); }
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

            // Validate doctor availability for the selected day
            if (intakeForm.doctor) {
                const selectedDoc = doctorsList.find(d => d._id === intakeForm.doctor);
                if (selectedDoc && selectedDoc.availability) {
                    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                    // Parse locally to avoid timezone shifts
                    const [year, month, day] = value.split('-');
                    const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
                    const dayName = daysOfWeek[dateObj.getDay()];
                    
                    const isAvailable = selectedDoc.availability[dayName] && selectedDoc.availability[dayName].available === true;
                    if (!isAvailable) {
                        const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
                        alert(`Doctor ${selectedDoc.name} is not available on ${capitalizedDay}s. Please select another date.`);
                        return; // Prevent updating state
                    }
                }
            }

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

        if (name === 'doctor' && intakeForm.visitDate) {
            const selectedDoc = doctorsList.find(d => d._id === value);
            if (selectedDoc && selectedDoc.availability) {
                const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                // Parse locally to avoid timezone shifts
                const [year, month, day] = intakeForm.visitDate.split('-');
                const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
                const dayName = daysOfWeek[dateObj.getDay()];
                
                const isAvailable = selectedDoc.availability[dayName] && selectedDoc.availability[dayName].available === true;
                if (!isAvailable) {
                    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
                    alert(`Doctor ${selectedDoc.name} is not available on ${capitalizedDay}s. Please select another date before assigning this doctor.`);
                    return; // Prevent updating state
                }
            }
            // Also reset time slot when doctor changes
            setIntakeForm(prev => ({ ...prev, doctor: value, visitTime: '' }));
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

        const hasNonCash = intakeForm.splitPayments.some(p => p.method !== 'Cash');
        if (intakeForm.doctor && intakeForm.visitTime && hasNonCash && !paymentScreenshot && !followupStatus?.active) {
            alert(`Please upload a payment screenshot/proof for non-cash payment before booking.`);
            setSaving(false); return;
        }

        const isTokenMode = hospitalContext?.appointmentMode === 'token';
        const isBooking = intakeForm.doctor && intakeForm.visitDate && (intakeForm.visitTime || isTokenMode);
        
        if (isBooking && Number(intakeForm.consultationFee) > 0) {
            const totalSplit = intakeForm.splitPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
            if (totalSplit !== Number(intakeForm.consultationFee)) {
                alert(`Payment is incomplete. Total paid (,1${totalSplit}) must match the full Consultation Fee (,1${intakeForm.consultationFee}) before booking.`);
                setSaving(false); return;
            }
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
                const hasNonCash = intakeForm.splitPayments.some(p => p.method !== 'Cash');
                if (hasNonCash && paymentScreenshot) {
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
                    splitPayments: intakeForm.splitPayments,
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
                            ['Payment Method', intakeForm.splitPayments.map(p => `${p.method} (${p.amount})`).join(' + ')],
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
                        const successMsg = selectedPatientId
                            ? `✅ Appointment Booked Successfully!${tokenMsg}`
                            : `Patient Registered & Assigned to Doctor!${tokenMsg}`;
                        alert(successMsg);
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

    // Determine if reception is rebooking an existing patient (not patient portal, not new registration)
    const isRebookingMode = !!selectedPatientId && !isPatientPortal;

    if (viewMode === 'intake') {
        // ─── RECEPTION REBOOKING MODE (identical layout to Patient Rebooking) ────
        if (isRebookingMode) {
            const patientName = [intakeForm.firstName, intakeForm.lastName].filter(Boolean).join(' ') || 'Patient';
            return (
                <div className="intake-full-page" data-lenis-prevent="true">
                    <div className="context-bar">
                        <h3>{followupStatus?.active ? 'Re-Book Appointment' : 'Book Appointment'}</h3>
                        <button type="button" className="btn-cancel" onClick={() => setViewMode('list')}>Close ✖</button>
                    </div>
                    <div className="intake-container" style={{ maxWidth: '650px', margin: '0 auto' }}>
                        <form onSubmit={handleSave}>
                            <div className="form-section" style={{ padding: '24px' }}>
                                {/* Patient Summary Header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '14px',
                                    padding: '16px', background: '#f8fafc', borderRadius: '10px',
                                    border: '1px solid #e2e8f0', marginBottom: '20px'
                                }}>
                                    {profilePhotoPreview ? (
                                        <img src={profilePhotoPreview} alt="Patient" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }} />
                                    ) : (
                                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>👤</div>
                                    )}
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{patientName}</div>
                                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                            {intakeForm.mobile && <span>📱 {intakeForm.mobile}</span>}
                                            {intakeForm.age && <span style={{ marginLeft: '12px' }}>Age: {intakeForm.age}</span>}
                                            {intakeForm.gender && <span style={{ marginLeft: '12px' }}>{intakeForm.gender}</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* Follow-up Status Card */}
                                {followupStatus && followupStatus.lastConsultation && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{
                                            padding: '12px 16px', borderRadius: '8px', border: '1px solid',
                                            backgroundColor: followupStatus.active ? '#f0fdf4' : '#fef2f2',
                                            borderColor: followupStatus.active ? '#bbf7d0' : '#fecaca',
                                            color: followupStatus.active ? '#15803d' : '#b91c1c',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                                                <span>{followupStatus.active ? '✅ Follow-up Visit - Payment Not Required' : '🔴 Follow-up Expired'}</span>
                                            </div>
                                            <div style={{ fontSize: '13px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                {followupStatus.active ? (
                                                    <>
                                                        <div>Last Paid Visit: <strong>{new Date(followupStatus.lastConsultation).toLocaleDateString('en-IN')}</strong></div>
                                                        <div>Valid Till: <strong>{new Date(followupStatus.validUntil).toLocaleDateString('en-IN')}</strong></div>
                                                        {(() => {
                                                            const [vY, vM, vD] = String(followupStatus.validUntil).split('T')[0].split('-');
                                                            const validTillDate = new Date(Number(vY), Number(vM) - 1, Number(vD)).getTime();
                                                            
                                                            let todayDate = new Date();
                                                            todayDate.setHours(0,0,0,0);
                                                            todayDate = todayDate.getTime();
                                                            if (intakeForm.visitDate) {
                                                                const [y, m, d] = String(intakeForm.visitDate).split('-');
                                                                todayDate = new Date(Number(y), Number(m) - 1, Number(d)).getTime();
                                                            }
                                                            
                                                            const remaining = Math.max(0, Math.ceil((validTillDate - todayDate) / (1000 * 3600 * 24)));
                                                            return <div>Remaining Days: <strong>{remaining === 0 ? 'Expires Today' : `${remaining} Day${remaining > 1 ? 's' : ''}`}</strong></div>;
                                                        })()}
                                                        <div>Fee: <strong>₹0</strong></div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div>Last Paid Visit: <strong>{new Date(followupStatus.lastConsultation).toLocaleDateString('en-IN')}</strong></div>
                                                        <div>Expired On: <strong>{new Date(followupStatus.validUntil).toLocaleDateString('en-IN')}</strong></div>
                                                        <div>Fee Applicable: <strong>₹{followupStatus.fee || intakeForm.consultationFee}</strong></div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Payment Confirmed Banner (when follow-up is active) */}
                                {followupStatus?.active && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', justifyContent: 'center', marginBottom: '20px' }}>
                                        <span style={{ fontSize: '18px' }}>✅</span>
                                        <span style={{ fontWeight: 600, color: '#15803d', fontSize: '16px' }}>Payment Confirmed — Paid</span>
                                    </div>
                                )}

                                {/* Payment Section (when follow-up is NOT active) */}
                                {!followupStatus?.active && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div className="field" style={{ flexBasis: '100%' }}>
                                            <PaymentSection
                                                splitPayments={intakeForm.splitPayments}
                                                onSplitChange={handleIntakeSplitPaymentChange}
                                                onAddSplit={addIntakeSplitPayment}
                                                onRemoveSplit={removeIntakeSplitPayment}
                                                totalAmount={Number(intakeForm.consultationFee) || 0}
                                                upiOptions={upiOptions}
                                                paymentData={intakePaymentData}
                                                onPaymentDataChange={setIntakePaymentData}
                                                proofFile={paymentScreenshot}
                                                onProofFileChange={setPaymentScreenshot}
                                                allowCash={true}
                                            />
                                        </div>
                                        {intakeForm.splitPayments.some(p => p.method !== 'Cash') && (
                                            <div style={{ marginTop: '8px' }}>
                                                <label>Payment Screenshot / Proof <span style={{ color: '#ef4444', fontSize: '12px' }}>*Required for non-cash payment</span></label>
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
                                        )}
                                    </div>
                                )}

                                {/* Assign to Doctor/Counselor */}
                                <div style={{ backgroundColor: '#eff6ff', padding: '20px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                                    <h4 style={{ color: '#1e40af', fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', borderBottom: '2px solid #bfdbfe', paddingBottom: '10px' }}>Assign to Doctor/Counselor</h4>
                                    <div className="form-row">
                                        <div className="field">
                                            <label>Department {followupStatus?.active && '(Read Only)'}</label>
                                            <select
                                                name="department"
                                                value={intakeForm.department}
                                                onChange={handleInputChange}
                                                disabled={followupStatus?.active}
                                                style={followupStatus?.active ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}}
                                            >
                                                <option value="">-- Choose Department --</option>
                                                {[...new Set([...(hospitalContext?.departments || []), ...doctorsList.flatMap(d => d.departments || [])])].filter(Boolean).map(dept => (
                                                    <option key={dept} value={dept}>{dept}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="field">
                                            <label>Select Specialist {followupStatus?.active && '(Read Only)'}</label>
                                            <select
                                                name="doctor"
                                                value={intakeForm.doctor}
                                                onChange={handleInputChange}
                                                disabled={!intakeForm.department || followupStatus?.active}
                                                style={(!intakeForm.department || followupStatus?.active) ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}}
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
                                    </div>
                                    <div className="form-row" style={{ marginTop: '10px' }}>
                                        <div className="field">
                                            <label>Appointment Date</label>
                                            <input type="date" name="visitDate" value={intakeForm.visitDate} min={todayStr} onChange={handleInputChange} disabled={!intakeForm.doctor} style={!intakeForm.doctor ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}} />
                                        </div>
                                    </div>
                                    {intakeForm.doctor && intakeForm.visitDate && (
                                        hospitalContext?.appointmentMode === 'token' ? (
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
                                            <div style={{ marginTop: '10px' }}>
                                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.85rem', color: '#475569' }}>Available Slots</label>
                                                <SlotPicker
                                                    doctorId={intakeForm.doctor}
                                                    date={intakeForm.visitDate}
                                                    selectedTime={intakeForm.visitTime}
                                                    onSelectTime={(time) => setIntakeForm({ ...intakeForm, visitTime: time })}
                                                />
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>

                            <div className="form-footer">
                                <button type="submit" className="btn-save" disabled={saving}>
                                    {saving
                                        ? 'Booking...'
                                        : (() => {
                                            const isTokenMode = hospitalContext?.appointmentMode === 'token';
                                            const canBook = intakeForm.doctor && intakeForm.visitDate && (intakeForm.visitTime || isTokenMode);
                                            const actionText = followupStatus?.active ? 'Re-Book Appointment' : 'Book Appointment';
                                            return canBook ? `${actionText} & Receipt` : 'Select Doctor & Slot';
                                        })()
                                    }
                                </button>
                                <button type="button" className="btn-cancel" onClick={() => setViewMode('list')} disabled={saving} style={{ marginLeft: '10px' }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        }

        // ─── NEW REGISTRATION / PATIENT PORTAL MODE (unchanged) ────────────
        return (
            <div className="intake-full-page" data-lenis-prevent="true">
                <div className="context-bar">
                    <h3>{isPatientPortal ? (followupStatus?.active ? 'Re-Book Appointment' : 'Book Appointment') : 'New Registration'}</h3>
                    <button type="button" className="btn-cancel" onClick={() => isPatientPortal ? navigate('/patient/dashboard') : setViewMode('list')}>Close ✖</button>
                </div>
                <div className="intake-container">
                    <form onSubmit={handleSave}>
                        {/* Unifying Sections 1, 2, and 3 into a single card container */}
                        <div className="form-section">
                            <fieldset disabled={false} style={{ border: 'none', padding: 0, margin: 0 }}>
                            <h4>1. Patient Identity & KYC</h4>

                            {/* PATIENT PROFILE PHOTO */}
                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '6px' }}>Patient Photo</label>
                                <div
                                    onClick={startCamera}
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
                                        {profilePhoto || profilePhotoPreview ? 'Change Photo' : 'Capture Photo'}
                                    </span>
                                </div>
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
                            </fieldset>

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
                            {(true) && (
                                <div className="form-row" style={followupStatus?.active ? { display: 'flex', flexDirection: 'column', gap: '10px' } : {}}>
                                    {!followupStatus?.active && (
                                        <div className="field" style={{ flexBasis: '100%' }}>
                                            <PaymentSection
                                                splitPayments={intakeForm.splitPayments}
                                                onSplitChange={handleIntakeSplitPaymentChange}
                                                onAddSplit={addIntakeSplitPayment}
                                                onRemoveSplit={removeIntakeSplitPayment}
                                                totalAmount={Number(intakeForm.consultationFee) || 0}
                                                upiOptions={upiOptions}
                                                paymentData={intakePaymentData}
                                                onPaymentDataChange={setIntakePaymentData}
                                                proofFile={paymentScreenshot}
                                                onProofFileChange={setPaymentScreenshot}
                                                allowCash={!isPatientPortal}
                                            />
                                        </div>
                                    )}
                                    <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', height: 'fit-content', width: '100%', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '18px' }}>✅</span>
                                        <span style={{ fontWeight: 600, color: '#15803d', fontSize: '16px' }}>Payment Confirmed — Paid</span>
                                    </div>
                                </div>
                            )}

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
                                                <span>{followupStatus.active ? '✅ Follow-up Visit - Payment Not Required' : '🔴 Follow-up Expired'}</span>
                                            </div>
                                            <div style={{ fontSize: '13px', display: 'flex', gap: '24px', alignItems: 'center' }}>
                                                {followupStatus.active ? (
                                                    <>
                                                        <div>Last Paid Visit: <strong>{new Date(followupStatus.lastConsultation).toLocaleDateString('en-IN')}</strong></div>
                                                        <div>Valid Till: <strong>{new Date(followupStatus.validUntil).toLocaleDateString('en-IN')}</strong></div>
                                                        {(() => {
                                                            const [vY, vM, vD] = String(followupStatus.validUntil).split('T')[0].split('-');
                                                            const validTillDate = new Date(Number(vY), Number(vM) - 1, Number(vD)).getTime();
                                                            
                                                            let todayDate = new Date();
                                                            todayDate.setHours(0,0,0,0);
                                                            todayDate = todayDate.getTime();
                                                            if (intakeForm.visitDate) {
                                                                const [y, m, d] = String(intakeForm.visitDate).split('-');
                                                                todayDate = new Date(Number(y), Number(m) - 1, Number(d)).getTime();
                                                            }
                                                            
                                                            const remaining = Math.max(0, Math.ceil((validTillDate - todayDate) / (1000 * 3600 * 24)));
                                                            return <div>Remaining Days: <strong>{remaining === 0 ? 'Expires Today' : `${remaining} Day${remaining > 1 ? 's' : ''}`}</strong></div>;
                                                        })()}
                                                        <div>Fee: <strong>₹0</strong></div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div>Last Paid Visit: <strong>{new Date(followupStatus.lastConsultation).toLocaleDateString('en-IN')}</strong></div>
                                                        <div>Expired On: <strong>{new Date(followupStatus.validUntil).toLocaleDateString('en-IN')}</strong></div>
                                                        <div>Fee Applicable: <strong>₹{followupStatus.fee || intakeForm.consultationFee}</strong></div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!followupStatus?.active && intakeForm.splitPayments.some(p => p.method !== 'Cash') && (
                                <div className="form-row" style={{ marginTop: '6px' }}>
                                    <div className="field" style={{ flex: 1 }}>
                                        <label>Payment Screenshot / Proof <span style={{ color: '#ef4444', fontSize: '12px' }}>*Required for non-cash payment</span></label>
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

                            {(true) && (
                                <div style={{ backgroundColor: '#eff6ff', padding: '20px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                                    <h4 style={{ color: '#1e40af', fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', borderBottom: '2px solid #bfdbfe', paddingBottom: '10px' }}>5. Assign to Doctor/Counselor</h4>
                                    <div className="form-row">
                                        <div className="field">
                                            <label>Department {followupStatus?.active && '(Read Only)'}</label>
                                            <select 
                                                name="department" 
                                                value={intakeForm.department} 
                                                onChange={handleInputChange}
                                                disabled={followupStatus?.active}
                                                style={followupStatus?.active ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}}
                                            >
                                                <option value="">-- Choose Department --</option>
                                                {[...new Set([...(hospitalContext?.departments || []), ...doctorsList.flatMap(d => d.departments || [])])].filter(Boolean).map(dept => (
                                                    <option key={dept} value={dept}>{dept}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="field">
                                            <label>Select Specialist {followupStatus?.active && '(Read Only)'}</label>
                                            <select
                                                name="doctor"
                                                value={intakeForm.doctor}
                                                onChange={handleInputChange}
                                                disabled={!intakeForm.department || followupStatus?.active}
                                                style={(!intakeForm.department || followupStatus?.active) ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}}
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
                                            /* Slot mode: using unified SlotPicker component */
                                            <SlotPicker
                                                doctorId={intakeForm.doctor}
                                                date={intakeForm.visitDate}
                                                selectedTime={intakeForm.visitTime}
                                                onSelectTime={(time) => setIntakeForm({ ...intakeForm, visitTime: time })}
                                            />
                                        )
                                    )}
                                </div>
                            )}
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
        const totalBills = transactions.length;
        const pendingBills = transactions.filter(t => (t.paymentStatus || '').toLowerCase() !== 'paid').length;
        
        return (
            <div className="reception-dashboard" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
                <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button onClick={() => navigate('/reception/dashboard')} style={{ padding: '10px 16px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#475569', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                            <span>←</span> Back
                        </button>
                        <h2 style={{ margin: 0, fontSize: '1.75rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: '#3b82f6' }}>💳</span> Patient Billing & Transactions
                        </h2>
                    </div>
                </div>

                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                    <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', padding: '24px', borderRadius: '16px', border: '1px solid #bfdbfe', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                        <h3 style={{ margin: '0 0 8px 0', color: '#1e40af', fontSize: '1.1rem', fontWeight: 600 }}>Total Collected</h3>
                        <p style={{ margin: 0, fontSize: '2.25rem', fontWeight: 800, color: '#1d4ed8' }}>₹{totalCollected.toLocaleString('en-IN')}</p>
                        <p style={{ margin: '8px 0 0 0', fontSize: '0.875rem', color: '#3b82f6', fontWeight: 500 }}>Lifetime collections</p>
                    </div>
                    <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', padding: '24px', borderRadius: '16px', border: '1px solid #bbf7d0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                        <h3 style={{ margin: '0 0 8px 0', color: '#166534', fontSize: '1.1rem', fontWeight: 600 }}>Total Transactions</h3>
                        <p style={{ margin: 0, fontSize: '2.25rem', fontWeight: 800, color: '#15803d' }}>{totalBills}</p>
                        <p style={{ margin: '8px 0 0 0', fontSize: '0.875rem', color: '#22c55e', fontWeight: 500 }}>Total bills generated</p>
                    </div>
                    <div style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', padding: '24px', borderRadius: '16px', border: '1px solid #fecaca', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                        <h3 style={{ margin: '0 0 8px 0', color: '#991b1b', fontSize: '1.1rem', fontWeight: 600 }}>Pending Payments</h3>
                        <p style={{ margin: 0, fontSize: '2.25rem', fontWeight: 800, color: '#b91c1c' }}>{pendingBills}</p>
                        <p style={{ margin: '8px 0 0 0', fontSize: '0.875rem', color: '#ef4444', fontWeight: 500 }}>Requires attention</p>
                    </div>
                </div>

                <div className="card" style={{ padding: '0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>Recent Transactions</h3>
                        <div style={{ position: 'relative', width: '300px' }}>
                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
                            <input type="text" placeholder="Search by patient name..." style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="reception-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: '16px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>Date & Time</th>
                                    <th style={{ padding: '16px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>Patient Name</th>
                                    <th style={{ padding: '16px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>Doctor</th>
                                    <th style={{ padding: '16px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>Payment Method</th>
                                    <th style={{ padding: '16px', textAlign: 'center', color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>Status</th>
                                    <th style={{ padding: '16px', textAlign: 'right', color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                                            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🧾</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>No transactions found</div>
                                            <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>There are no recent billing records to display.</div>
                                        </td>
                                    </tr>
                                ) : (
                                    transactions.map(t => (
                                        <tr key={t._id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.2s' }}>
                                            <td style={{ padding: '16px', fontSize: '0.95rem', color: '#334155' }}>
                                                {new Date(t.createdAt).toLocaleDateString('en-IN')}
                                                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{new Date(t.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                                            </td>
                                            <td style={{ padding: '16px', fontSize: '0.95rem', fontWeight: 500, color: '#0f172a' }}>{t.userId?.name || 'Walk-in'}</td>
                                            <td style={{ padding: '16px', fontSize: '0.95rem', color: '#334155', whiteSpace: 'nowrap' }}>{t.doctorName || '-'}</td>
                                            <td style={{ padding: '16px', fontSize: '0.95rem', color: '#475569' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                                                    {t.paymentMethod === 'Cash' ? '💵' : t.paymentMethod === 'UPI' ? '📱' : '💳'} {t.paymentMethod || 'Cash'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-flex', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
                                                    background: (t.paymentStatus || '').toLowerCase() === 'paid' ? '#dcfce7' : '#fef3c7',
                                                    color: (t.paymentStatus || '').toLowerCase() === 'paid' ? '#166534' : '#92400e',
                                                    border: `1px solid ${(t.paymentStatus || '').toLowerCase() === 'paid' ? '#86efac' : '#fde68a'}`
                                                }}>
                                                    {(t.paymentStatus || '').toLowerCase() === 'paid' ? 'Paid ✓' : 'Pending'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
                                                ₹{t.amount}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    const renderTodaysQueue = () => (
        <div className="appointments-list">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>Today's Queue</h3>
                <button 
                    onClick={() => setListTab(listTab === 'hospitalized' ? 'queue' : 'hospitalized')}
                    style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', background: listTab === 'hospitalized' ? '#3b82f6' : '#f1f5f9', color: listTab === 'hospitalized' ? '#fff' : '#475569', transition: 'all 0.2s' }}
                >
                    {listTab === 'hospitalized' ? 'Back to Today\'s Queue' : 'View Hospitalized'}
                </button>
            </div>
            
            <div className="table-responsive">
                <table className="reception-table">
                    <thead>
                        <tr>
                            <th style={{ textTransform: 'uppercase' }}>Patient</th>
                            <th style={{ textTransform: 'uppercase' }}>Doctor</th>
                            <th style={{ textTransform: 'uppercase' }}>Time</th>
                            <th style={{ textTransform: 'uppercase' }}>Status</th>
                            <th style={{ textTransform: 'uppercase' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {appointments.map(apt => {
                            const isHospitalized = hospitalizedPatients.some(adm => 
                                (adm.appointmentId?._id === apt._id || adm.appointmentId === apt._id) && adm.status === 'Admitted'
                            );
                            
                            return (
                            <tr key={apt._id}>
                                <td>{apt.userId?.name}<br /><small style={{ color: '#64748b' }}>{apt.userId?.phone}</small></td>
                                <td>{apt.doctorName || apt.doctorId?.name}</td>
                                <td>{apt.appointmentTime || '-'}</td>
                                <td><span className={`status ${apt.status}`}>{String(apt.status).toUpperCase()}</span></td>
                                <td>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <button onClick={() => {
                                            const pdf = generateReceiptPDF(apt, apt.paymentMethod || 'Cash', false);
                                            setPendingDownload({ doc: pdf.doc, filename: pdf.filename, title: 'Payment Receipt' });
                                        }} style={{ padding: '6px 12px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>📄 Print Receipt</button>
                                        
                                        <button onClick={() => setHospitalizeModal({ open: true, appointment: apt })} style={{ padding: '6px 12px', background: isHospitalized ? '#fef2f2' : '#eff6ff', color: isHospitalized ? '#ef4444' : '#3b82f6', border: `1px solid ${isHospitalized ? '#fecaca' : '#bfdbfe'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>{isHospitalized ? 'Hospitalized' : 'Hospitalize'}</button>
                                        
                                        <button onClick={() => handleCancelAppointment(apt._id)} style={{ padding: '6px 12px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                                    </div>
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderHospitalized = () => (
        <div className="appointments-list">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <button 
                    onClick={() => setListTab('queue')} 
                    style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b', padding: '0 8px 0 0' }}
                    title="Back to Today's Queue"
                >
                    ←
                </button>
                <h3 style={{ margin: 0 }}>Hospitalized Patients</h3>
            </div>
            <div className="table-responsive">
                <table className="reception-table">
                    <thead>
                        <tr>
                            <th>Patient Name</th>
                            <th>MRN</th>
                            <th>Department</th>
                            <th>Doctor</th>
                            <th>Admission Date</th>
                            <th>Ward / Bed</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loadingHospitalized ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>Loading...</td></tr>
                        ) : hospitalizedPatients.length === 0 ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>No hospitalized patients found.</td></tr>
                        ) : (
                            hospitalizedPatients.map(adm => (
                                <tr key={adm._id}>
                                    <td style={{ fontWeight: 600 }}>{adm.patientId?.name || 'Unknown'}<br /><small>{adm.patientId?.phone}</small></td>
                                    <td>{adm.patientId?.patientId || '-'}</td>
                                    <td>{adm.appointmentId?.department || adm.appointmentId?.serviceName || '-'}</td>
                                    <td>{adm.appointmentId?.doctorName || '-'}</td>
                                    <td>
                                        <div>{new Date(adm.admissionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                        {adm.status === 'Discharged' && adm.dischargeDate && (
                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                Discharged: {new Date(adm.dischargeDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </div>
                                        )}
                                    </td>
                                    <td>{adm.ward || '-'}<br /><small>Bed: {adm.bedNumber || '-'}</small></td>
                                    <td>
                                        <span style={{
                                            display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600,
                                            background: adm.status === 'Admitted' ? '#dcfce7' : '#f1f5f9',
                                            color: adm.status === 'Admitted' ? '#166534' : '#475569'
                                        }}>
                                            {String(adm.status).toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        {adm.status === 'Admitted' ? (
                                            <button 
                                                onClick={() => handleDischargePatient(adm._id)} 
                                                style={{ padding: '6px 12px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
                                            >
                                                Discharge
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => {
                                                    const fakeApt = {
                                                        ...adm.appointmentId,
                                                        userId: adm.patientId,
                                                        patientId: adm.patientId?.patientId,
                                                        appointmentDate: adm.admissionDate,
                                                        amount: adm.totalAmount || 0,
                                                        paymentMethod: 'Hospital Bill'
                                                    };
                                                    const pdf = generateReceiptPDF(fakeApt, 'Hospital Bill', false);
                                                    setPendingDownload({ doc: pdf.doc, filename: pdf.filename, title: 'Discharge Summary / Receipt' });
                                                }} 
                                                style={{ padding: '6px 12px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
                                            >
                                                Receipt
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
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
                            <button onClick={() => setPaymentModal({ open: false, appointment: null, splitPayments: [{ method: 'Cash', amount: '' }] })} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                        </div>
                        <div style={{ marginBottom: '18px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '7px' }}>Payment Breakdown</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {paymentModal.splitPayments?.map((split, index) => (
                                    <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <select
                                            value={split.method}
                                            onChange={e => {
                                                const newSplits = [...paymentModal.splitPayments];
                                                newSplits[index].method = e.target.value;
                                                setPaymentModal(p => ({ ...p, splitPayments: newSplits }));
                                            }}
                                            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}
                                        >
                                            <option value="Cash">Cash</option>
                                            <option value="UPI">UPI</option>
                                            <option value="Card">Card</option>
                                            <option value="Cheque">Cheque</option>
                                            <option value="NEFT/RTGS">NEFT / RTGS</option>
                                        </select>
                                        <input
                                            type="number"
                                            value={split.amount}
                                            onChange={e => {
                                                const newSplits = [...paymentModal.splitPayments];
                                                newSplits[index].amount = e.target.value;
                                                setPaymentModal(p => ({ ...p, splitPayments: newSplits }));
                                            }}
                                            style={{ width: '120px', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}
                                        />
                                        {paymentModal.splitPayments.length > 1 && (
                                            <button type="button" onClick={() => {
                                                const newSplits = paymentModal.splitPayments.filter((_, i) => i !== index);
                                                setPaymentModal(p => ({ ...p, splitPayments: newSplits }));
                                            }} style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                                        )}
                                    </div>
                                ))}
                                <button type="button" onClick={() => {
                                    setPaymentModal(p => ({ ...p, splitPayments: [...(p.splitPayments || []), { method: 'Cash', amount: '' }] }));
                                }} style={{ alignSelf: 'flex-start', padding: '6px 12px', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>+ Add Payment Method</button>
                            </div>
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
                                onClick={() => setPaymentModal({ open: false, appointment: null, splitPayments: [{ method: 'Cash', amount: '' }] })}
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
                                    <FaRupeeSign />
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
                    {searchQuery.trim().length > 0 && searchResults.length > 0 && (
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

                {listTab === 'hospitalized' ? renderHospitalized() : renderTodaysQueue()}
            </div>

            {/* Camera Modal */}
            {showCameraModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', textAlign: 'center', width: '90%', maxWidth: '640px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <h3 style={{ marginTop: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                            {cameraCapturedPreview ? '📷 Photo Preview' : '📷 Capture Patient Photo'}
                        </h3>

                        <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#000', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
                            {cameraCapturedPreview ? (
                                <img src={cameraCapturedPreview} alt="Captured" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <>
                                    <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} autoPlay playsInline muted />
                                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                                    {/* Capture button overlay */}
                                    <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)' }}>
                                        <button
                                            onClick={capturePhotoFromCamera}
                                            style={{
                                                width: '64px', height: '64px', borderRadius: '50%',
                                                background: 'rgba(255,255,255,0.9)', border: '4px solid #10b981',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                boxShadow: '0 4px 15px rgba(0,0,0,0.3)', transition: 'transform 0.15s'
                                            }}
                                            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                            title="Capture Photo"
                                        >
                                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#10b981' }} />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
                            {cameraCapturedPreview ? (
                                <>
                                    <button onClick={retakePhoto} style={{ padding: '12px 28px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: '#475569' }}>
                                        🔄 Retake
                                    </button>
                                    <button onClick={saveCapturedPhoto} style={{ padding: '12px 28px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 2px 8px rgba(16,185,129,0.4)' }}>
                                        ✅ Save Photo
                                    </button>
                                </>
                            ) : (
                                <button onClick={stopCamera} style={{ padding: '12px 28px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: '#475569' }}>
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {renderModals()}
        </>
    );
};

export default ReceptionDashboard;