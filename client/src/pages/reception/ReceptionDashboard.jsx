import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { receptionAPI, publicAPI, hospitalAPI, uploadAPI, admissionAPI, patientAuthAPI, bedAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import { getSubdomain } from '../../utils/subdomain';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
    FiSearch, FiUserPlus, FiFileText, FiDollarSign, FiUsers, FiCalendar, FiHome, FiPlusSquare, 
    FiActivity, FiSliders, FiPhone, FiEye, FiUpload, FiMoreVertical, FiCpu, FiCheckCircle, FiClock, 
    FiPrinter, FiFilter, FiX 
} from 'react-icons/fi';
import { FaRupeeSign, FaHeartbeat } from 'react-icons/fa';
import PaymentSection from '../../components/PaymentSection';
import SlotPicker from '../../components/SlotPicker';
import { useBranding } from '../../context/BrandingContext';
import { TopBar } from '../../components/layouts/DashboardLayout';
import './ReceptionDashboard.css';
import './PatientRegistration.css';

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

const combineDateTime = (dateVal, timeStr) => {
    if (!dateVal) return new Date();
    const d = new Date(dateVal);
    if (!timeStr) return d;
    const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const meridiem = match[3];
        if (meridiem) {
            if (meridiem.toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (meridiem.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        d.setHours(hours, minutes, 0, 0);
    }
    return d;
};

const getInitialBgColor = (name = '') => {
    const colors = [
        '#8b5cf6', // purple
        '#0d9488', // teal
        '#f59e0b', // amber
        '#3b82f6', // blue
        '#ec4899', // pink
        '#10b981', // emerald
        '#6366f1'  // indigo
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) {
        sum += name.charCodeAt(i);
    }
    return colors[sum % colors.length];
};

const computeStayDurationAndCost = (startDateTime, endDateTime, dailyRate) => {
    if (!startDateTime || !endDateTime) return { durationText: '0 Hours', amount: 0, hourlyRate: 0, totalHours: 0, fullDays: 0, remainingHours: 0 };
    const start = new Date(startDateTime).getTime();
    const end = new Date(endDateTime).getTime();
    if (isNaN(start) || isNaN(end) || end < start) {
        return { durationText: 'Invalid Range', amount: 0, hourlyRate: 0, totalHours: 0, fullDays: 0, remainingHours: 0 };
    }
    const diffMs = Math.max(0, end - start);
    const totalHoursRaw = diffMs / (1000 * 60 * 60);
    const totalHours = Math.max(0.5, Math.round(totalHoursRaw * 10) / 10);
    
    const ratePerDay = Number(dailyRate) || 0;
    const hourlyRate = Math.round((ratePerDay / 24) * 100) / 100;
    
    const fullDays = Math.floor(totalHours / 24);
    const remainingHours = Math.round((totalHours % 24) * 10) / 10;
    
    let durationText = '';
    let amount = 0;

    if (totalHours < 24) {
        const billedHrs = Math.max(1, Math.round(totalHours));
        durationText = `${billedHrs} Hour${billedHrs > 1 ? 's' : ''}`;
        amount = Math.round(billedHrs * (ratePerDay / 24));
    } else {
        if (remainingHours >= 0.5) {
            const remHrsRound = Math.round(remainingHours);
            durationText = `${fullDays} Day${fullDays > 1 ? 's' : ''} ${remHrsRound} Hr${remHrsRound > 1 ? 's' : ''}`;
            amount = Math.round((fullDays * ratePerDay) + (remHrsRound * (ratePerDay / 24)));
        } else {
            durationText = `${fullDays} Day${fullDays > 1 ? 's' : ''}`;
            amount = Math.round(fullDays * ratePerDay);
        }
    }
    
    return {
        totalHours: Math.max(1, Math.round(totalHours)),
        fullDays,
        remainingHours,
        durationText,
        ratePerDay,
        hourlyRate,
        amount
    };
};

const ReceptionDashboard = ({ isPatientPortal = false }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user: currentUser } = useAuth();
    const { branding, hospitalName } = useBranding();
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
    const [stats, setStats] = useState({
        todayRegistrations: 0,
        totalPatients: 0,
        todayAppointments: 0,
        todayCollections: 0,
        pendingBills: 0,
        regTrend: '',
        apptTrend: '',
        collTrend: ''
    });
    
    // New states for Reception Dashboard Filtering
    const [listTab, setListTab] = useState('queue'); // 'queue', 'all', 'hospitalized'
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isEditingProfileOnly, setIsEditingProfileOnly] = useState(false);

    const timeOfDay = new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening';

    const handleCloseRegistration = useCallback(() => {
        if (isPatientPortal) {
            navigate('/patient/dashboard');
        } else {
            setSelectedPatientId(null);
            setIsEditingProfileOnly(false);
            setViewMode('list');
            navigate('/reception/dashboard?view=desk', { replace: true });
        }
    }, [isPatientPortal, navigate]);

    // Token mode — next token preview
    const [nextToken, setNextToken] = useState(null);

    // Payment confirm modal
    const [paymentModal, setPaymentModal] = useState({ open: false, appointment: null, splitPayments: [{ method: 'Cash', amount: '' }] });
    const [confirmingPayment, setConfirmingPayment] = useState(false);

    // Hospitalization modal
    const [hospitalizeModal, setHospitalizeModal] = useState({ open: false, appointment: null });
    const [hospitalizeForm, setHospitalizeForm] = useState({
        ward: '',
        bedId: '',
        admissionDate: new Date().toISOString().split('T')[0],
        admissionTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        notes: ''
    });
    const [hospitalizingSaving, setHospitalizingSaving] = useState(false);
    const [availableBeds, setAvailableBeds] = useState([]);

    // Transfer Modal
    const [transferModal, setTransferModal] = useState({
        open: false,
        admission: null,
        newWard: '',
        newBedId: '',
        transferDate: new Date().toISOString().split('T')[0],
        transferTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        notes: '',
        saving: false
    });

    // Discharge Modal
    const [dischargeModal, setDischargeModal] = useState({
        open: false,
        admission: null,
        dischargeDate: new Date().toISOString().split('T')[0],
        dischargeTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        notes: '',
        saving: false
    });

    const fetchAvailableBeds = async () => {
        try {
            const res = await bedAPI.getBeds({ status: 'AVAILABLE' });
            if (res.success) {
                setAvailableBeds(res.beds || []);
            }
        } catch (err) {
            console.error("Failed to fetch beds", err);
        }
    };

    useEffect(() => {
        fetchAvailableBeds();
    }, []);

    useEffect(() => {
        if (hospitalizeModal.open) {
            fetchAvailableBeds();
        }
    }, [hospitalizeModal.open]);

    const [upiOptions, setUpiOptions] = useState([]);
    const [intakePaymentData, setIntakePaymentData] = useState({ upiId: '', transactionId: '', cardDetails: '', bankReference: '' });

    // Availability
    const [availabilityCheck, setAvailabilityCheck] = useState({
        doctorId: '', date: new Date().toISOString().split('T')[0], bookedSlots: []
    });
    const [selectedTimeSlot, setSelectedTimeSlot] = useState('09:00');

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
    const [activeStep, setActiveStep] = useState(1);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const filePhotoInputRef = useRef(null);
    const activeStreamRef = useRef(null);

    // High-performance IntersectionObserver Scroll-Spy (Zero scroll lag, butter smooth)
    useEffect(() => {
        if (viewMode !== 'intake' && !isPatientPortal) return;

        const stepIds = [
            'reg-step-card-1',
            'reg-step-card-2',
            'reg-step-card-3',
            'reg-step-card-4',
            'reg-step-card-5'
        ];

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const idx = stepIds.indexOf(entry.target.id);
                    if (idx !== -1) {
                        setActiveStep(prev => prev === idx + 1 ? prev : idx + 1);
                    }
                }
            });
        }, {
            root: null,
            rootMargin: '-15% 0px -65% 0px',
            threshold: 0.05
        });

        stepIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });

        return () => {
            observer.disconnect();
        };
    }, [viewMode, isPatientPortal]);

    const scrollToStep = (stepNum) => {
        setActiveStep(stepNum);
        const el = document.getElementById(`reg-step-card-${stepNum}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const startCamera = async () => {
        setCameraCapturedPreview(null);
        setCameraCapturedBlob(null);
        setShowCameraModal(true);
        try {
            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } } 
                });
            } catch (e1) {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
            activeStreamRef.current = stream;
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(e => console.warn("Video play exception:", e));
                }
            }, 80);
        } catch (err) {
            console.error("Camera access error:", err);
            toast.error("Camera access failed. Please allow camera permissions or click 'Upload Photo'.");
        }
    };

    const handleFilePhotoSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setProfilePhoto(file);
            setProfilePhotoPreview(URL.createObjectURL(file));
            toast.success("Photo selected successfully!");
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
                    if (activeStreamRef.current) {
                        activeStreamRef.current.getTracks().forEach(track => track.stop());
                    }
                }
            }, 'image/jpeg', 0.92);
        }
    };

    const saveCapturedPhoto = () => {
        if (cameraCapturedBlob) {
            const file = new File([cameraCapturedBlob], 'patient_photo.jpg', { type: 'image/jpeg' });
            setProfilePhoto(file);
            setProfilePhotoPreview(URL.createObjectURL(file));
            toast.success("Photo captured and saved!");
        }
        setCameraCapturedPreview(null);
        setCameraCapturedBlob(null);
        setShowCameraModal(false);
        if (activeStreamRef.current) {
            activeStreamRef.current.getTracks().forEach(track => track.stop());
            activeStreamRef.current = null;
        }
    };

    const retakePhoto = async () => {
        setCameraCapturedPreview(null);
        setCameraCapturedBlob(null);
        try {
            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } } 
                });
            } catch (e1) {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
            activeStreamRef.current = stream;
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(e => console.warn("Video play exception:", e));
                }
            }, 80);
        } catch (err) {
            toast.error("Camera access denied or unavailable.");
        }
    };

    const stopCamera = () => {
        if (activeStreamRef.current) {
            activeStreamRef.current.getTracks().forEach(track => track.stop());
            activeStreamRef.current = null;
        }
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setCameraCapturedPreview(null);
        setCameraCapturedBlob(null);
        setShowCameraModal(false);
    };

    const renderCameraModal = () => {
        if (!showCameraModal) return null;
        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', padding: '24px', borderRadius: '20px', textAlign: 'center', width: '90%', maxWidth: '580px', boxShadow: '0 25px 70px rgba(0,0,0,0.4)', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                            {cameraCapturedPreview ? '📷 Photo Preview' : '📷 Live Camera Capture'}
                        </h3>
                        <button 
                            type="button"
                            onClick={stopCamera}
                            style={{ border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'grid', placeItems: 'center' }}
                        >
                            ✕
                        </button>
                    </div>

                    <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#000', borderRadius: '16px', overflow: 'hidden', marginBottom: '20px' }}>
                        {cameraCapturedPreview ? (
                            <img src={cameraCapturedPreview} alt="Captured" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <>
                                <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} autoPlay playsInline muted />
                                <canvas ref={canvasRef} style={{ display: 'none' }} />
                                <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)' }}>
                                    <button
                                        type="button"
                                        onClick={capturePhotoFromCamera}
                                        style={{
                                            width: '64px', height: '64px', borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.95)', border: '4px solid #16c7c0',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 4px 18px rgba(0,0,0,0.3)', transition: 'transform 0.15s'
                                        }}
                                        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                        title="Snap Photo"
                                    >
                                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#16c7c0' }} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                        {cameraCapturedPreview ? (
                            <>
                                <button type="button" onClick={retakePhoto} style={{ padding: '10px 24px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', color: '#475569' }}>
                                    🔄 Retake
                                </button>
                                <button type="button" onClick={saveCapturedPhoto} style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #16c7c0, #4f7cff)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 4px 12px rgba(79,124,255,0.3)' }}>
                                    ✓ Save Photo
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={stopCamera} style={{ padding: '10px 24px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', color: '#475569' }}>
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
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
            handleEditPatient(location.state.patient, location.state?.isEditingExisting || false);
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

    const fetchStats = async () => {
        try {
            const res = await receptionAPI.getStats();
            if (res.success && res.stats) {
                setStats(res.stats);
            }
        } catch (err) {
            console.error('Error fetching reception stats:', err);
        }
    };

    useEffect(() => {
        if (!isPatientPortal) {
            fetchStats();
            fetchHospitalizedPatients();
            fetchTransactions();
            fetchAppointments();
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

    const handleEditPatient = (patient, isEditOnly = false) => {
        setIsEditingProfileOnly(isEditOnly);
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
        handleEditPatient(patient, false);
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
        if (!patient) return;
        const pid = patient._id || patient.patientId || patient.id || (typeof patient.userId === 'object' ? (patient.userId?._id || patient.userId?.patientId) : patient.userId);
        const dept = patient.department || patient.serviceName || (patient.userId && (patient.userId.department || patient.userId.serviceName)) || 'Unassigned';
        if (pid) {
            navigate(`/patient/${pid}/department/${encodeURIComponent(dept)}`);
        }
    };

    const openHospitalizeModal = (apt) => {
        setHospitalizeForm({
            ward: '',
            bedId: '',
            admissionDate: new Date().toISOString().split('T')[0],
            admissionTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            notes: ''
        });
        setHospitalizeModal({ open: true, appointment: apt });
        fetchAvailableBeds();
    };

    const handleHospitalize = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const { appointment } = hospitalizeModal;
        if (!hospitalizeForm.ward) return alert('Please select a Ward');
        if (!hospitalizeForm.bedId) return alert('Please select an available Bed');
        if (!hospitalizeForm.admissionDate) return alert('Please specify Admission Date');
        if (!hospitalizeForm.admissionTime) return alert('Please specify Admission Time');

        setHospitalizingSaving(true);
        try {
            await admissionAPI.createAdmission({
                patientId: appointment.userId?._id || appointment.patientId,
                appointmentId: appointment._id,
                ward: hospitalizeForm.ward,
                bedId: hospitalizeForm.bedId,
                admissionDate: hospitalizeForm.admissionDate,
                admissionTime: hospitalizeForm.admissionTime,
                notes: hospitalizeForm.notes,
            });
            alert('Patient admitted successfully!');
            setHospitalizeModal({ open: false, appointment: null });
            fetchAppointments();
            fetchHospitalizedPatients();
            fetchAvailableBeds();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to admit patient');
        } finally {
            setHospitalizingSaving(false);
        }
    };

    const openTransferModal = (adm) => {
        let rate = Number(adm.wardRatePerDay) || 0;
        if (rate === 0) {
            const matching = hospitalContext?.facilities?.find(f => 
                (f.name || '').toLowerCase().includes((adm.ward || '').toLowerCase()) ||
                (adm.ward || '').toLowerCase().includes((f.name || '').toLowerCase())
            );
            rate = matching?.pricePerDay || ((adm.ward || '').toLowerCase().includes('icu') ? 20000 : 5000);
        }
        adm.wardRatePerDay = rate;
        adm.wardHourlyRate = Math.round((rate / 24) * 100) / 100;

        setTransferModal({
            open: true,
            admission: adm,
            newWard: '',
            newBedId: '',
            transferDate: new Date().toISOString().split('T')[0],
            transferTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            notes: '',
            saving: false
        });
        fetchAvailableBeds();
    };

    const handleTransferSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const { admission, newWard, newBedId, transferDate, transferTime, notes } = transferModal;
        if (!newWard) return alert('Please select New Ward');
        if (!newBedId) return alert('Please select New Bed');
        if (!transferDate) return alert('Please select Transfer Date');
        if (!transferTime) return alert('Please select Transfer Time');

        setTransferModal(prev => ({ ...prev, saving: true }));
        try {
            const res = await admissionAPI.transferBed(admission._id, {
                newWard,
                newBedId,
                transferDate,
                transferTime,
                notes
            });
            if (res.success) {
                alert('Patient transferred successfully!');
                setTransferModal({ open: false, admission: null, newWard: '', newBedId: '', transferDate: '', transferTime: '', notes: '', saving: false });
                fetchHospitalizedPatients();
                fetchAvailableBeds();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to transfer patient');
        } finally {
            setTransferModal(prev => ({ ...prev, saving: false }));
        }
    };

    const openDischargeModal = (adm) => {
        let rate = Number(adm.wardRatePerDay) || 0;
        if (rate === 0) {
            const matching = hospitalContext?.facilities?.find(f => 
                (f.name || '').toLowerCase().includes((adm.ward || '').toLowerCase()) ||
                (adm.ward || '').toLowerCase().includes((f.name || '').toLowerCase())
            );
            rate = matching?.pricePerDay || ((adm.ward || '').toLowerCase().includes('icu') ? 20000 : 5000);
        }
        adm.wardRatePerDay = rate;
        adm.wardHourlyRate = Math.round((rate / 24) * 100) / 100;

        setDischargeModal({
            open: true,
            admission: adm,
            dischargeDate: new Date().toISOString().split('T')[0],
            dischargeTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            notes: '',
            saving: false
        });
    };

    const generateDischargeReceiptPDF = (adm, shouldSave = true) => {
        const doc = new jsPDF();
        const hName = hospitalContext?.name || 'HOSPITAL';
        const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
        const hPhone = hospitalContext?.phone || '';
        const hEmail = hospitalContext?.email || '';
        const issuedBy = currentUser?.name || 'Reception Desk';
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
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38);
        doc.text('INPATIENT DISCHARGE BILL & RECEIPT', 105, y, { align: 'center' }); y += 5;
        doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.5);
        doc.line(14, y, 196, y); y += 8;
        doc.setTextColor(0); doc.setFont('helvetica', 'normal');

        const ptName = adm.patientId?.name || 'Inpatient';
        const ptId = adm.patientId?.patientId || adm.patientId?.mrn || 'N/A';
        const admDateStr = `${new Date(adm.admissionDate).toLocaleDateString('en-IN')} ${adm.admissionTime || ''}`;
        const disDateStr = `${new Date(adm.dischargeDate || new Date()).toLocaleDateString('en-IN')} ${adm.dischargeTime || ''}`;

        autoTable(doc, {
            startY: y,
            body: [
                ['Patient Name', ptName, 'MRN / Patient ID', ptId],
                ['Admission Time', admDateStr, 'Discharge Time', disDateStr],
                ['Final Ward & Bed', `${adm.ward || 'General Ward'} (Bed ${adm.bedNumber || '-'})`, 'Payment Status', (adm.paymentStatus || 'Paid').toUpperCase() + ' \u2713'],
            ],
            theme: 'grid',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 2: { fontStyle: 'bold', cellWidth: 42 } },
            bodyStyles: { fontSize: 9 },
        });

        y = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
        doc.text('Stay & Ward Breakdown (Hourly / Daily Pro-rated):', 14, y); y += 6;

        let tableRows = [];
        if (adm.selectedFacilities && adm.selectedFacilities.length > 0) {
            tableRows = adm.selectedFacilities.map((f, i) => [
                i + 1,
                f.facilityName,
                f.durationText || (f.days > 0 ? `${f.days} Day(s)` : `${f.hours || 1} Hour(s)`),
                `Rs. ${Number(f.pricePerDay || 0).toLocaleString('en-IN')}/day (${Number(f.hourlyRate || Math.round((f.pricePerDay || 0)/24)).toLocaleString('en-IN')}/hr)`,
                `Rs. ${Number(f.totalAmount || 0).toLocaleString('en-IN')}`
            ]);
        } else {
            let idx = 1;
            (adm.transferHistory || []).forEach(th => {
                tableRows.push([
                    idx++,
                    th.fromWard,
                    th.durationText || `${th.durationDays || 1} Day(s)`,
                    `Rs. ${Number(th.ratePerDay || 0).toLocaleString('en-IN')}/day`,
                    `Rs. ${Number(th.segmentAmount || 0).toLocaleString('en-IN')}`
                ]);
            });
            const finalRate = adm.wardRatePerDay || 5000;
            tableRows.push([
                idx,
                adm.ward || 'General Ward',
                'Final Stay',
                `Rs. ${Number(finalRate).toLocaleString('en-IN')}/day`,
                `Rs. ${Number(adm.totalAmount || finalRate).toLocaleString('en-IN')}`
            ]);
        }

        autoTable(doc, {
            startY: y,
            head: [['#', 'Ward / Service', 'Duration', 'Rate Basis', 'Amount (INR)']],
            body: tableRows,
            foot: [['', '', '', 'TOTAL INPATIENT CHARGES:', `Rs. ${Number(adm.totalAmount || 0).toLocaleString('en-IN')}`]],
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 10 }, 4: { halign: 'right', fontStyle: 'bold' } }
        });

        y = doc.lastAutoTable.finalY + 12;
        doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
        doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Issued by: ${issuedBy}`, 14, y);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
        y += 5;
        doc.text(`Thank you for choosing ${hName}`, 105, y, { align: 'center' });

        const filename = `Discharge_Bill_${ptId}_${new Date().toISOString().split('T')[0]}.pdf`;
        if (shouldSave) {
            doc.save(filename);
        }
        return { doc, filename };
    };

    const handleDischargeSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const { admission, dischargeDate, dischargeTime, notes } = dischargeModal;
        if (!dischargeDate) return alert('Please select Discharge Date');
        if (!dischargeTime) return alert('Please select Discharge Time');

        setDischargeModal(prev => ({ ...prev, saving: true }));
        try {
            const res = await admissionAPI.dischargePatient(admission._id, {
                dischargeDate,
                dischargeTime,
                notes
            });
            if (res.success) {
                const pdf = generateDischargeReceiptPDF(res.admission || admission, false);
                setPendingDownload({ doc: pdf.doc, filename: pdf.filename, title: 'Discharge Bill & Receipt' });
                alert('Patient discharged successfully!');
                setDischargeModal({ open: false, admission: null, dischargeDate: '', dischargeTime: '', notes: '', saving: false });
                fetchHospitalizedPatients();
                fetchAvailableBeds();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to discharge patient.');
        } finally {
            setDischargeModal(prev => ({ ...prev, saving: false }));
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
            toast.error("Mobile number must be exactly 10 digits.");
            setSaving(false); return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (intakeForm.email && !emailRegex.test(intakeForm.email)) {
            toast.error("Please enter a valid email address (e.g. patient@gmail.com).");
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
            toast.error(`Please upload a payment screenshot/proof for non-cash payment before booking.`);
            setSaving(false); return;
        }

        const isTokenMode = hospitalContext?.appointmentMode === 'token';
        const isBooking = intakeForm.doctor && intakeForm.visitDate && (intakeForm.visitTime || isTokenMode);
        
        if (isBooking && Number(intakeForm.consultationFee) > 0) {
            const totalSplit = intakeForm.splitPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
            if (totalSplit !== Number(intakeForm.consultationFee)) {
                toast.error(`Payment is incomplete. Total paid (₹${totalSplit}) must match the full Consultation Fee (₹${intakeForm.consultationFee}) before booking.`);
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
                    toast.success("Patient Profile Registered Successfully! Redirecting...");
                    localU.registrationStatus = 'Completed';
                    if (userId) localU.linkedPatientProfileId = userId;
                    localStorage.setItem('patientUser', JSON.stringify(localU));
                    navigate('/patient/dashboard');
                    return;
                }
                if (selectedPatientId) {
                    toast.success("Patient profile and demographics updated successfully!");
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
                        if (isReBook) {
                            toast.success(`Appointment Booked Successfully!${tokenMsg}`);
                        } else {
                            toast.success(`Patient Registered & Assigned to Doctor!${tokenMsg}`);
                        }
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
                            ? `Appointment Booked Successfully!${tokenMsg}`
                            : `Patient Registered & Assigned to Doctor!${tokenMsg}`;
                        toast.success(successMsg);
                    }
                } else {
                    toast.error("Booking Failed: " + bookingRes.message);
                }
            } else if (selectedPatientId) {
                // Editing existing patient — profile saved, no appointment needed
                toast.success("Patient details updated successfully!");
                setViewMode('list');
            } else {
                toast.error("Please select a Doctor and Time Slot to complete the registration.");
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'An unexpected error occurred.';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    // Determine if reception is rebooking an existing patient (not patient portal, not new registration)
    const isRebookingMode = !!selectedPatientId && !isPatientPortal && !isEditingProfileOnly;

    if (viewMode === 'intake') {
        // ─── RECEPTION REBOOKING MODE (identical layout to Patient Rebooking) ────
        if (isRebookingMode) {
            const patientName = [intakeForm.firstName, intakeForm.lastName].filter(Boolean).join(' ') || 'Patient';
            return (
                <div className="intake-full-page" data-lenis-prevent="true">
                    <div className="context-bar">
                        <h3>{followupStatus?.active ? 'Re-Book Appointment' : 'Book Appointment'}</h3>
                        <button type="button" className="btn-cancel" onClick={handleCloseRegistration}>Close ✖</button>
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
                                <button type="button" className="btn-cancel" onClick={handleCloseRegistration} disabled={saving} style={{ marginLeft: '10px' }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        }

        // ─── NEW REGISTRATION / PATIENT PORTAL MODE (UPGRADED WITH MODERN AI DESIGN) ────────────
        return (
            <div className="reg-page-root" data-lenis-prevent="true">
                {/* Animated Background AI Particles */}
                <div className="ai-particles">
                    <div className="particle p1"></div>
                    <div className="particle p2"></div>
                    <div className="particle p3"></div>
                    <div className="particle p4"></div>
                    <div className="particle p5"></div>
                    <div className="particle p6"></div>
                </div>

                {/* Real Dashboard TopBar with search, notifications, profile dropdown & branding */}
                <TopBar toggleSidebar={() => {}} sidebarOpen={false} />

                <main className="reg-main">
                    {/* Centered Colorful Page Heading with Right Close Button */}
                    <div className="reg-page-heading-row">
                        <div className="reg-heading-placeholder"></div>
                        <div className="reg-heading-center">
                            <h1 className="reg-title-gradient">
                                {isPatientPortal ? (followupStatus?.active ? 'Re-Book Appointment' : 'Book Appointment') : 'New Patient Registration'}
                            </h1>
                            <div className="reg-title-glow-accent"></div>
                        </div>
                        <div className="reg-heading-right-action">
                            <button 
                                type="button" 
                                className="reg-btn-close-prominent" 
                                onClick={handleCloseRegistration}
                            >
                                ✕ Close
                            </button>
                        </div>
                    </div>

                    <div className="reg-workspace">
                        {/* LEFT STEP SIDEBAR */}
                        <aside className="reg-steps">
                            <div className="reg-steps-title">Registration Flow</div>

                            <div className={`reg-step ${activeStep === 1 ? 'active' : ''}`} onClick={() => scrollToStep(1)}>
                                <div className="reg-step-num">01</div>
                                <div className="reg-step-text">
                                    <strong>Patient Identity</strong>
                                    <span>KYC & basic details</span>
                                </div>
                            </div>

                            <div className={`reg-step ${activeStep === 2 ? 'active' : ''}`} onClick={() => scrollToStep(2)}>
                                <div className="reg-step-num">02</div>
                                <div className="reg-step-text">
                                    <strong>Address</strong>
                                    <span>Contact information</span>
                                </div>
                            </div>

                            <div className={`reg-step ${activeStep === 3 ? 'active' : ''}`} onClick={() => scrollToStep(3)}>
                                <div className="reg-step-num">03</div>
                                <div className="reg-step-text">
                                    <strong>Source</strong>
                                    <span>Referral details</span>
                                </div>
                            </div>

                            <div className={`reg-step ${activeStep === 4 ? 'active' : ''}`} onClick={() => scrollToStep(4)}>
                                <div className="reg-step-num">04</div>
                                <div className="reg-step-text">
                                    <strong>Vitals</strong>
                                    <span>Health measurements</span>
                                </div>
                            </div>

                            <div className={`reg-step ${activeStep === 5 ? 'active' : ''}`} onClick={() => scrollToStep(5)}>
                                <div className="reg-step-num">05</div>
                                <div className="reg-step-text">
                                    <strong>Assignment</strong>
                                    <span>Doctor & consultant</span>
                                </div>
                            </div>

                            <div className="reg-steps-ai">
                                <div className="reg-scan">
                                    <div className="reg-scan-icon">✦</div>
                                    AI Verification
                                </div>
                                <div className="reg-scan-line"></div>
                            </div>
                        </aside>

                        {/* MAIN FORM AREA */}
                        <section className="reg-form-area">
                            <form onSubmit={handleSave}>
                                {/* CARD 1: PATIENT IDENTITY & KYC */}
                                <div className="reg-form-card" id="reg-step-card-1">
                                    <div className="reg-card-head">
                                        <div className="reg-card-title">
                                            <div className="reg-card-icon">◉</div>
                                            <div>
                                                <h2>Patient Identity & KYC</h2>
                                                <p>Secure identification details</p>
                                            </div>
                                        </div>
                                        <div className="reg-ai-tag">AI VERIFIED</div>
                                    </div>

                                    <div className="reg-card-body">
                                        <div className="reg-identity-grid">
                                            {/* Photo Box */}
                                            <div className="reg-photo-box">
                                                <input 
                                                    type="file" 
                                                    ref={filePhotoInputRef} 
                                                    accept="image/*" 
                                                    style={{ display: 'none' }} 
                                                    onChange={handleFilePhotoSelect} 
                                                />
                                                <div className="reg-photo-frame">
                                                    {profilePhotoPreview || (profilePhoto && URL.createObjectURL(profilePhoto)) ? (
                                                        <img 
                                                            src={profilePhoto ? URL.createObjectURL(profilePhoto) : profilePhotoPreview} 
                                                            alt="Patient" 
                                                            className="reg-photo-preview-img"
                                                        />
                                                    ) : (
                                                        <div className="reg-photo-placeholder">
                                                            <span className="reg-photo-avatar-icon">👤</span>
                                                            <span className="reg-photo-prompt">Patient Photo</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="reg-photo-actions-row">
                                                    <button 
                                                        type="button" 
                                                        className="reg-capture-btn-main" 
                                                        onClick={startCamera}
                                                    >
                                                        📷 {profilePhoto || profilePhotoPreview ? 'Retake' : 'Capture'}
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        className="reg-upload-icon-btn" 
                                                        onClick={() => filePhotoInputRef.current?.click()}
                                                        title="Upload photo from device"
                                                    >
                                                        📁
                                                    </button>
                                                </div>
                                            </div>

                                            {/* KYC Fields */}
                                            <div className="reg-fields">
                                                <div className="reg-field full">
                                                    <label>Aadhaar Number <em>*</em></label>
                                                    <input 
                                                        className="reg-input"
                                                        name="aadhaar"
                                                        maxLength={12}
                                                        placeholder="Enter 12-digit Aadhaar"
                                                        value={intakeForm.aadhaar || ''}
                                                        onChange={handleInputChange}
                                                        required
                                                        pattern="^\d{12}$"
                                                        title="Aadhaar number must be exactly 12 digits"
                                                    />
                                                </div>

                                                <div className="reg-field">
                                                    <label>First Name <em>*</em></label>
                                                    <input 
                                                        className="reg-input"
                                                        name="firstName" 
                                                        placeholder="First Name"
                                                        value={intakeForm.firstName} 
                                                        onChange={handleInputChange} 
                                                        required 
                                                        minLength={2} 
                                                    />
                                                </div>

                                                <div className="reg-field">
                                                    <label>Last Name</label>
                                                    <input 
                                                        className="reg-input"
                                                        name="lastName" 
                                                        placeholder="Last Name"
                                                        value={intakeForm.lastName} 
                                                        onChange={handleInputChange} 
                                                    />
                                                </div>

                                                <div className="reg-field">
                                                    <label>Age <em>*</em></label>
                                                    <input 
                                                        className="reg-input"
                                                        type="number" 
                                                        name="age" 
                                                        placeholder="Age"
                                                        value={intakeForm.age} 
                                                        onChange={handleInputChange} 
                                                        required 
                                                        min="1" 
                                                    />
                                                </div>

                                                <div className="reg-field">
                                                    <label>Mobile <em>*</em></label>
                                                    <input 
                                                        className="reg-input"
                                                        name="mobile" 
                                                        placeholder="10-digit mobile"
                                                        value={intakeForm.mobile} 
                                                        onChange={handleInputChange} 
                                                        required 
                                                        pattern="^\d{10}$" 
                                                        title="Phone number must be exactly 10 digits" 
                                                    />
                                                </div>

                                                <div className="reg-field">
                                                    <label>Email Address <em>*</em></label>
                                                    <input 
                                                        className="reg-input"
                                                        name="email" 
                                                        type="email" 
                                                        placeholder="patient@gmail.com" 
                                                        value={intakeForm.email} 
                                                        onChange={handleInputChange} 
                                                        required 
                                                    />
                                                </div>

                                                <div className="reg-field">
                                                    <label>Gender <em>*</em></label>
                                                    <select 
                                                        className="reg-select"
                                                        name="gender" 
                                                        value={intakeForm.gender} 
                                                        onChange={handleInputChange} 
                                                        required
                                                    >
                                                        <option value="">Select Gender</option>
                                                        <option value="Male">Male</option>
                                                        <option value="Female">Female</option>
                                                        <option value="Other">Other</option>
                                                    </select>
                                                </div>

                                                <div className="reg-field">
                                                    <label>Relative Name</label>
                                                    <input 
                                                        className="reg-input"
                                                        name="partnerFirstName" 
                                                        placeholder="Relative Name" 
                                                        value={intakeForm.partnerFirstName} 
                                                        onChange={handleInputChange} 
                                                    />
                                                </div>

                                                <div className="reg-field">
                                                    <label>Relation To Patient</label>
                                                    <select 
                                                        className="reg-select"
                                                        name="relationToPatient" 
                                                        value={intakeForm.relationToPatient || ''} 
                                                        onChange={handleInputChange}
                                                    >
                                                        <option value="">-- Select Relation --</option>
                                                        <option value="Father">Father</option>
                                                        <option value="Mother">Mother</option>
                                                        <option value="Spouse">Spouse</option>
                                                        <option value="Husband">Husband</option>
                                                        <option value="Wife">Wife</option>
                                                        <option value="Brother">Brother</option>
                                                        <option value="Sister">Sister</option>
                                                        <option value="Son">Son</option>
                                                        <option value="Others">Others</option>
                                                    </select>
                                                </div>

                                                <div className="reg-field">
                                                    <label>Relative Mobile</label>
                                                    <input 
                                                        className="reg-input"
                                                        name="partnerMobile" 
                                                        placeholder="Relative Mobile" 
                                                        value={intakeForm.partnerMobile} 
                                                        onChange={handleInputChange} 
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* CARD 2: ADDRESS INFORMATION */}
                                <div className="reg-form-card" id="reg-step-card-2">
                                    <div className="reg-card-head">
                                        <div className="reg-card-title">
                                            <div className="reg-card-icon">⌖</div>
                                            <div>
                                                <h2>Address Information</h2>
                                                <p>Patient residential information</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="reg-card-body">
                                        <div className="reg-fields">
                                            <div className="reg-field">
                                                <label>House No / Flat / Building Name</label>
                                                <input 
                                                    className="reg-input"
                                                    name="houseNo"
                                                    placeholder="House No / Flat / Building Name"
                                                    value={intakeForm.houseNo || ''}
                                                    onChange={handleInputChange}
                                                />
                                            </div>

                                            <div className="reg-field">
                                                <label>Street / Area / Locality</label>
                                                <input 
                                                    className="reg-input"
                                                    name="street"
                                                    placeholder="Street / Area / Locality"
                                                    value={intakeForm.street || ''}
                                                    onChange={handleInputChange}
                                                />
                                            </div>

                                            <div className="reg-field">
                                                <label>City</label>
                                                <input 
                                                    className="reg-input"
                                                    name="city"
                                                    placeholder="City"
                                                    value={intakeForm.city || ''}
                                                    onChange={handleInputChange}
                                                />
                                            </div>

                                            <div className="reg-field">
                                                <label>State</label>
                                                <input 
                                                    className="reg-input"
                                                    name="state"
                                                    placeholder="State"
                                                    value={intakeForm.state || ''}
                                                    onChange={handleInputChange}
                                                />
                                            </div>

                                            <div className="reg-field">
                                                <label>Pincode</label>
                                                <input 
                                                    className="reg-input"
                                                    name="zipCode"
                                                    placeholder="Pincode"
                                                    value={intakeForm.zipCode || ''}
                                                    onChange={handleInputChange}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* CARD 3: PATIENT SOURCE INFORMATION */}
                                <div className="reg-form-card" id="reg-step-card-3">
                                    <div className="reg-card-head">
                                        <div className="reg-card-title">
                                            <div className="reg-card-icon">⌁</div>
                                            <div>
                                                <h2>Patient Source Information</h2>
                                                <p>Referral and acquisition details</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="reg-card-body">
                                        <div className="reg-field">
                                            <label>Referral Type</label>
                                            <select 
                                                className="reg-select"
                                                name="referralType" 
                                                value={intakeForm.referralType || ''} 
                                                onChange={handleInputChange}
                                            >
                                                <option value="">-- Select Source / Referral --</option>
                                                <option value="Walk In">Walk In</option>
                                                <option value="Doctor Referral">Doctor Referral</option>
                                                <option value="Hospital Referral">Hospital Referral</option>
                                                <option value="Online">Online</option>
                                                <option value="Social Media">Social Media (FB/Insta)</option>
                                                <option value="Google/Website">Google Search / Website</option>
                                                <option value="Friend/Relative">Friend / Relative</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* CARD 4: VITALS */}
                                <div className="reg-form-card" id="reg-step-card-4">
                                    <div className="reg-card-head">
                                        <div className="reg-card-title">
                                            <div className="reg-card-icon">♥</div>
                                            <div>
                                                <h2>Vitals</h2>
                                                <p>Initial patient measurements</p>
                                            </div>
                                        </div>
                                        <div className="reg-ai-tag">SMART MONITOR</div>
                                    </div>

                                    <div className="reg-card-body">
                                        <div className="reg-vitals-grid">
                                            <div className="reg-vital-box">
                                                <label>Height (cm)</label>
                                                <input 
                                                    className="reg-input"
                                                    name="height" 
                                                    placeholder="Height"
                                                    value={intakeForm.height} 
                                                    onChange={handleInputChange} 
                                                />
                                            </div>

                                            <div className="reg-vital-box">
                                                <label>Weight (kg)</label>
                                                <input 
                                                    className="reg-input"
                                                    name="weight" 
                                                    placeholder="Weight"
                                                    value={intakeForm.weight} 
                                                    onChange={handleInputChange} 
                                                />
                                            </div>

                                            <div className="reg-vital-box">
                                                <label>BMI</label>
                                                <input 
                                                    className="reg-input"
                                                    name="bmi" 
                                                    placeholder="BMI"
                                                    value={intakeForm.bmi} 
                                                    readOnly 
                                                    style={{ backgroundColor: '#f8fafc', fontWeight: 'bold' }}
                                                />
                                            </div>

                                            <div className="reg-vital-box">
                                                <label>Consultation Fee</label>
                                                <input 
                                                    className="reg-input"
                                                    name="consultationFee" 
                                                    value={intakeForm.consultationFee || '500'} 
                                                    onChange={handleInputChange}
                                                    style={{ fontWeight: 'bold', color: '#15803d' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* CARD 5: PAYMENT */}
                                {!isEditingProfileOnly && (
                                    <div className="reg-form-card" id="reg-step-card-5-payment">
                                        <div className="reg-card-head">
                                            <div className="reg-card-title">
                                                <div className="reg-card-icon">₹</div>
                                                <div>
                                                    <h2>Payment</h2>
                                                    <p>Registration payment details</p>
                                                </div>
                                            </div>
                                            <div className="reg-ai-tag">SECURE</div>
                                        </div>

                                        <div className="reg-card-body">
                                            {followupStatus && followupStatus.lastConsultation && (
                                                <div style={{
                                                    padding: '12px 16px', borderRadius: '12px', border: '1px solid',
                                                    backgroundColor: followupStatus.active ? '#f0fdf4' : '#fef2f2',
                                                    borderColor: followupStatus.active ? '#bbf7d0' : '#fecaca',
                                                    color: followupStatus.active ? '#15803d' : '#b91c1c',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px'
                                                }}>
                                                    <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                                                        {followupStatus.active ? '✅ Follow-up Visit - Payment Not Required' : '🔴 Follow-up Expired'}
                                                    </div>
                                                    <div style={{ fontSize: '12px' }}>
                                                        Fee: <strong>₹{followupStatus.active ? '0' : (followupStatus.fee || intakeForm.consultationFee)}</strong>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="reg-payment-box">
                                                <div className="reg-payment-row">
                                                    <div className="reg-field">
                                                        <label>Payment Mode</label>
                                                        <select 
                                                            className="reg-select"
                                                            value={intakeForm.splitPayments?.[0]?.method || 'Cash'}
                                                            onChange={(e) => handleIntakeSplitPaymentChange(0, 'method', e.target.value)}
                                                        >
                                                            <option value="Cash">Cash</option>
                                                            <option value="UPI">UPI</option>
                                                            <option value="Card">Card</option>
                                                            <option value="Online">Online</option>
                                                        </select>
                                                    </div>

                                                    <div className="reg-field">
                                                        <label>Amount</label>
                                                        <input 
                                                            className="reg-input"
                                                            placeholder="Amount"
                                                            value={intakeForm.splitPayments?.[0]?.amount || intakeForm.consultationFee || '500'}
                                                            onChange={(e) => handleIntakeSplitPaymentChange(0, 'amount', e.target.value)}
                                                        />
                                                    </div>
                                                </div>

                                                {intakeForm.splitPayments?.some(p => p.method !== 'Cash') && (
                                                    <div style={{ marginTop: '12px' }}>
                                                        <label style={{ fontSize: '10px', fontWeight: 800, color: '#60738d', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                                                            Payment Screenshot / Proof <span style={{ color: '#ef4444' }}>*Required for non-cash</span>
                                                        </label>
                                                        <input
                                                            type="file"
                                                            accept="image/*,application/pdf"
                                                            onChange={e => setPaymentScreenshot(e.target.files[0])}
                                                            style={{ padding: '8px', border: '1.5px dashed #6366f1', borderRadius: '8px', background: '#ffffff', width: '100%', fontSize: '12px' }}
                                                        />
                                                        {paymentScreenshot && (
                                                            <span style={{ fontSize: '12px', color: '#059669', marginTop: '4px', display: 'block' }}>
                                                                ✅ {paymentScreenshot.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="reg-payment-status">
                                                    <div className="reg-check-badge">✓</div>
                                                    Payment Confirmed — Paid
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* CARD 6: ASSIGN TO DOCTOR / COUNSELLOR */}
                                {!isEditingProfileOnly && (
                                    <div className="reg-form-card" id="reg-step-card-5">
                                        <div className="reg-card-head">
                                            <div className="reg-card-title">
                                                <div className="reg-card-icon">⚕</div>
                                                <div>
                                                    <h2>Assign To Doctor / Counsellor</h2>
                                                    <p>Choose the appropriate medical professional</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="reg-card-body">
                                            <div className="reg-assign-grid">
                                                <div className="reg-field">
                                                    <label>Department {followupStatus?.active && '(Read Only)'}</label>
                                                    <select 
                                                        className="reg-select"
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

                                                <div className="reg-field">
                                                    <label>Select Specialist {followupStatus?.active && '(Read Only)'}</label>
                                                    <select
                                                        className="reg-select"
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
                                                                <option value="">-- Select Specialist --</option>
                                                                {doctorsList.filter(doc => (doc.departments || []).includes(intakeForm.department)).map(doc => (
                                                                    <option key={doc._id} value={doc._id}>{doc.name} {doc.departments?.length > 0 ? `(${doc.departments.join(', ')})` : ''}</option>
                                                                ))}
                                                            </>
                                                        )}
                                                    </select>
                                                </div>

                                                <div className="reg-field">
                                                    <label>Date</label>
                                                    <input 
                                                        className="reg-input"
                                                        type="date" 
                                                        name="visitDate" 
                                                        value={intakeForm.visitDate} 
                                                        min={todayStr} 
                                                        onChange={handleInputChange} 
                                                        disabled={!intakeForm.doctor} 
                                                        style={!intakeForm.doctor ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}} 
                                                    />
                                                </div>
                                            </div>

                                            {intakeForm.doctor && (
                                                hospitalContext?.appointmentMode === 'token' ? (
                                                    <div style={{ marginTop: '14px', padding: '16px 20px', background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: '14px', border: '2px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                        <span style={{ fontSize: '2.2rem' }}>🎟️</span>
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#78350f' }}>Token Queue Mode Active</div>
                                                            {nextToken !== null ? (
                                                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#92400e' }}>
                                                                    Next Token: <span style={{ fontSize: '1.8rem', color: '#d97706' }}>#{nextToken}</span>
                                                                </div>
                                                            ) : (
                                                                <div style={{ color: '#92400e', fontSize: '0.85rem' }}>Select doctor and date to see next token</div>
                                                            )}
                                                            <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '2px', opacity: 0.8 }}>Tokens reset daily at midnight</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ marginTop: '14px' }}>
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
                                )}

                                {/* CARD 7: PATIENT NOTES & FOOTER */}
                                <div className="reg-form-card" id="reg-step-card-notes">
                                    <div className="reg-card-head">
                                        <div className="reg-card-title">
                                            <div className="reg-card-icon">✎</div>
                                            <div>
                                                <h2>Patient Notes</h2>
                                                <p>Additional clinical information</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="reg-card-body">
                                        <div className="reg-field">
                                            <label>Bio</label>
                                            <textarea 
                                                className="reg-textarea"
                                                name="bio"
                                                placeholder="Patient's profile bio or initial clinical observations..."
                                                value={intakeForm.bio || ''}
                                                onChange={handleInputChange}
                                            />
                                        </div>
                                    </div>

                                    <div className="reg-form-footer">
                                        <div className="reg-footer-info">
                                            🔒 Patient information is encrypted & securely stored
                                        </div>

                                        <div className="reg-actions">
                                            <button 
                                                type="button" 
                                                className="reg-btn reg-btn-cancel" 
                                                onClick={handleCloseRegistration}
                                                disabled={saving}
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                type="submit" 
                                                className="reg-btn reg-btn-save" 
                                                disabled={saving}
                                            >
                                                {saving
                                                    ? 'Saving...'
                                                    : (() => {
                                                        if (isEditingProfileOnly) return '✓ Save Patient Details';
                                                        const isTokenMode = hospitalContext?.appointmentMode === 'token';
                                                        const canBook = intakeForm.doctor && intakeForm.visitDate && (intakeForm.visitTime || isTokenMode);
                                                        const actionText = followupStatus?.active ? 'Re-Book Appointment' : (isTokenMode && !isPatientPortal ? 'Issue Token' : 'Book Appointment');
                                                        if (isPatientPortal) return canBook ? actionText : '✓ Complete Profile & Continue';
                                                        return canBook ? `✓ Register, ${actionText} & Receipt` : '✓ Save Patient Details';
                                                    })()
                                                }
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </section>
                    </div>
                </main>
                {renderCameraModal()}
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
                                        
                                        <button onClick={() => openHospitalizeModal(apt)} style={{ padding: '6px 12px', background: isHospitalized ? '#fef2f2' : '#eff6ff', color: isHospitalized ? '#ef4444' : '#3b82f6', border: `1px solid ${isHospitalized ? '#fecaca' : '#bfdbfe'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>{isHospitalized ? 'Hospitalized' : 'Hospitalize'}</button>
                                        
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
        <div className="rec-queue-box" style={{ marginTop: '16px' }}>
            <div className="rec-queue-head">
                <div className="rec-queue-title">
                    <div className="rec-queue-icon hosp">
                        <FiHome />
                    </div>
                    <div>
                        <h3>Hospitalized In-Patients</h3>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                            Active IPD admissions and ward allocations
                        </p>
                    </div>
                </div>
                <button
                    className="rec-tab-pill-btn active-queue"
                    onClick={() => setListTab('queue')}
                >
                    <FiUsers size={13} />
                    <span>Back to Today's Queue</span>
                </button>
            </div>
            
            <div className="rec-table-wrap">
                <table className="rec-table rec-table-colorful">
                    <thead>
                        <tr>
                            <th style={{ width: '45px' }}>#</th>
                            <th>PATIENT</th>
                            <th>MRN</th>
                            <th>WARD & BED</th>
                            <th>DOCTOR & DEPT</th>
                            <th>ADMISSION DATE</th>
                            <th>STATUS</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loadingHospitalized ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>Loading hospitalized patients...</td></tr>
                        ) : hospitalizedPatients.length === 0 ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>No hospitalized patients found.</td></tr>
                        ) : (
                            hospitalizedPatients.map((adm, idx) => {
                                const pName = adm.patientId?.name || 'In-Patient';
                                const pPhone = adm.patientId?.phone || '-';
                                const pMrn = adm.patientId?.patientId || adm.patientId?.mrn || '-';
                                const dName = adm.appointmentId?.doctorName || adm.appointmentId?.doctorId?.name || 'Attending Physician';
                                const dept = adm.appointmentId?.department || adm.appointmentId?.serviceName || 'General';

                                return (
                                    <tr key={adm._id || idx} className="rec-row-hosp">
                                        <td className="rec-td-num">{String(idx + 1).padStart(2, '0')}</td>
                                        <td>
                                            <div 
                                                className="rec-patient-cell"
                                                onClick={() => handleViewProfile(adm.patientId || adm)}
                                                style={{ cursor: 'pointer' }}
                                                title="Click to view Patient Profile"
                                            >
                                                <div
                                                    className="rec-avatar-circle"
                                                    style={{ background: getInitialBgColor(pName) }}
                                                >
                                                    {pName.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="rec-patient-names">
                                                    <span className="rec-p-name">{pName}</span>
                                                    <span className="rec-p-phone"><FiPhone size={10} style={{ display: 'inline', marginRight: '3px' }} />{pPhone}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span 
                                                className="rec-mrn-pill" 
                                                onClick={() => handleViewProfile(adm.patientId || adm)}
                                                style={{ cursor: 'pointer' }}
                                                title="Click to view Patient Profile"
                                            >
                                                {pMrn}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="rec-hosp-bed-cell">
                                                <span className="rec-ward-pill">{adm.ward || 'Ward'}</span>
                                                <span className="rec-bed-pill">Bed #{adm.bedNumber || '-'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="rec-doc-cell">
                                                <div className="rec-doc-avatar hosp-doc">
                                                    {dName.replace('Dr. ', '').substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.84rem' }}>{dName}</span>
                                                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{dept}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="rec-time-cell">
                                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.82rem' }}>
                                                    {new Date(adm.admissionDate || adm.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{adm.admissionTime || '10:00 AM'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`rec-status-pill status-${(adm.status || 'admitted').toLowerCase()}`}>
                                                {String(adm.status || 'ADMITTED').toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="rec-actions-group">
                                                <button
                                                    className="rec-tbl-btn rec-btn-profile"
                                                    title="View Patient Profile"
                                                    onClick={() => handleViewProfile(adm.patientId || adm)}
                                                    style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}
                                                >
                                                    <FiEye size={13} />
                                                    <span>Profile</span>
                                                </button>
                                                {adm.status === 'Admitted' ? (
                                                    <>
                                                        <button 
                                                            className="rec-tbl-btn rec-btn-transfer"
                                                            onClick={() => openTransferModal(adm)} 
                                                            style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}
                                                        >
                                                            <FiSliders size={13} />
                                                            <span>Transfer</span>
                                                        </button>
                                                        <button 
                                                            className="rec-tbl-btn rec-btn-discharge"
                                                            onClick={() => openDischargeModal(adm)} 
                                                            style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3' }}
                                                        >
                                                            <FiHome size={13} />
                                                            <span>Discharge</span>
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button 
                                                        className="rec-tbl-btn rec-btn-print"
                                                        onClick={() => {
                                                            try {
                                                                generateDischargeReceiptPDF(adm, true);
                                                            } catch (e) {
                                                                console.error("Error generating discharge bill:", e);
                                                                alert("Error generating receipt: " + e.message);
                                                            }
                                                        }} 
                                                    >
                                                        <FiPrinter size={13} />
                                                        <span>Receipt</span>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
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

            {/* ====== HOSPITALIZE PATIENT MODAL ====== */}
            {hospitalizeModal.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>🏥 Hospitalize Patient</h2>
                                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                    {hospitalizeModal.appointment?.userId?.name || 'Patient'} — Dr. {hospitalizeModal.appointment?.doctorName || 'Doctor'}
                                </p>
                            </div>
                            <button onClick={() => setHospitalizeModal({ open: false, appointment: null })} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#64748b' }}>✕</button>
                        </div>

                        <form onSubmit={handleHospitalize}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Select Ward *</label>
                                    <select
                                        required
                                        value={hospitalizeForm.ward}
                                        name="ward" 
                                        onChange={(e) => setHospitalizeForm(prev => ({ ...prev, ward: e.target.value, bedId: '' }))}
                                        style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', background: '#fff' }}
                                    >
                                        <option value="">-- Choose Ward --</option>
                                        {Array.from(new Set(availableBeds.map(b => b.ward))).map(w => (
                                            <option key={w} value={w}>{w}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Select Available Bed *</label>
                                    <select
                                        required
                                        value={hospitalizeForm.bedId}
                                        name="bedId" 
                                        onChange={(e) => setHospitalizeForm(prev => ({ ...prev, bedId: e.target.value }))}
                                        disabled={!hospitalizeForm.ward}
                                        style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', background: hospitalizeForm.ward ? '#fff' : '#f8fafc' }}
                                    >
                                        <option value="">{hospitalizeForm.ward ? '-- Choose Available Bed --' : '-- Select Ward First --'}</option>
                                        {availableBeds.filter(b => b.ward === hospitalizeForm.ward).map(b => (
                                            <option key={b._id} value={b._id}>{b.bedNumber} ({b.bedType})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Admission Date *</label>
                                    <input
                                        type="date"
                                        required
                                        value={hospitalizeForm.admissionDate}
                                        onChange={(e) => setHospitalizeForm(prev => ({ ...prev, admissionDate: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Admission Time *</label>
                                    <input
                                        type="time"
                                        required
                                        value={hospitalizeForm.admissionTime}
                                        onChange={(e) => setHospitalizeForm(prev => ({ ...prev, admissionTime: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            {hospitalizeForm.ward && (() => {
                                const matchedFacility = hospitalContext?.facilities?.find(f => 
                                    f.name.toLowerCase().includes(hospitalizeForm.ward.toLowerCase()) || 
                                    hospitalizeForm.ward.toLowerCase().includes(f.name.toLowerCase())
                                );
                                const pricePerDay = matchedFacility?.pricePerDay || 0;
                                const hourlyRate = Math.round((pricePerDay / 24) * 100) / 100;
                                return (
                                    <div style={{ background: '#eff6ff', padding: '14px 16px', borderRadius: '10px', border: '1px solid #bfdbfe', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <div>
                                                <span style={{ fontWeight: 700, color: '#1e40af', fontSize: '1rem' }}>{hospitalizeForm.ward}</span>
                                                <div style={{ fontSize: '0.8rem', color: '#3b82f6' }}>Dynamic Duration &amp; Inpatient Billing</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 800, color: '#1d4ed8', fontSize: '1.1rem' }}>
                                                    ₹{pricePerDay.toLocaleString('en-IN')}/day
                                                </div>
                                                <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                                                    (₹{hourlyRate.toLocaleString('en-IN')}/hour)
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#475569', background: '#fff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #dbeafe', marginTop: '6px' }}>
                                            ℹ️ <strong>Hourly &amp; Daily Billing:</strong> Charges will be calculated dynamically based on exact hours and days spent in this ward when transferred or discharged (e.g. 4 hrs in ICU = ₹{(hourlyRate * 4).toLocaleString('en-IN')}).
                                        </div>
                                    </div>
                                );
                            })()}

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Admission Notes (optional)</label>
                                <textarea
                                    placeholder="Any clinical observations or admission reasons..."
                                    value={hospitalizeForm.notes}
                                    onChange={(e) => setHospitalizeForm(prev => ({ ...prev, notes: e.target.value }))}
                                    rows={2}
                                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                                <button type="button" onClick={() => setHospitalizeModal({ open: false, appointment: null })} style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={hospitalizingSaving}
                                    style={{ padding: '10px 24px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: hospitalizingSaving ? 0.6 : 1 }}
                                >
                                    {hospitalizingSaving ? 'Admitting...' : '✓ Hospitalize Patient'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ====== WARD / BED TRANSFER MODAL ====== */}
            {transferModal.open && transferModal.admission && (() => {
                const prevTransfer = transferModal.admission.transferHistory && transferModal.admission.transferHistory.length > 0
                    ? transferModal.admission.transferHistory[transferModal.admission.transferHistory.length - 1]
                    : null;

                const prevStartDateTime = prevTransfer
                    ? combineDateTime(prevTransfer.transferDate, prevTransfer.transferTime)
                    : combineDateTime(transferModal.admission.admissionDate, transferModal.admission.admissionTime);

                const currentTransferDateTime = combineDateTime(transferModal.transferDate, transferModal.transferTime);
                const liveCalc = computeStayDurationAndCost(prevStartDateTime, currentTransferDateTime, transferModal.admission.wardRatePerDay);

                const newMatchedFacility = hospitalContext?.facilities?.find(f => 
                    transferModal.newWard && (f.name.toLowerCase().includes(transferModal.newWard.toLowerCase()) || transferModal.newWard.toLowerCase().includes(f.name.toLowerCase()))
                );
                const newDaily = newMatchedFacility?.pricePerDay || 0;
                const newHourly = Math.round((newDaily / 24) * 100) / 100;

                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                        <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>🔄 Transfer Ward / Bed</h2>
                                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                        Patient: <strong>{transferModal.admission.patientId?.name}</strong> (MRN: {transferModal.admission.patientId?.patientId || '-'})
                                    </p>
                                </div>
                                <button onClick={() => setTransferModal({ open: false, admission: null })} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#64748b' }}>✕</button>
                            </div>

                            {/* Live Current Ward Stay & Cost Card */}
                            <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Current Stay Segment:</div>
                                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem' }}>
                                            {transferModal.admission.ward} (Bed {transferModal.admission.bedNumber})
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                                            From: {prevStartDateTime.toLocaleDateString('en-IN')} {prevStartDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Calculated Duration:</div>
                                        <div style={{ fontWeight: 800, color: '#7c3aed', fontSize: '1.05rem' }}>
                                            ⏱️ {liveCalc.durationText}
                                        </div>
                                        <div style={{ fontWeight: 800, color: '#16a34a', fontSize: '0.95rem', marginTop: '2px' }}>
                                            Segment Cost: ₹{liveCalc.amount.toLocaleString('en-IN')}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }}>
                                    Rate: ₹{(transferModal.admission.wardRatePerDay || 0).toLocaleString('en-IN')}/day (₹{liveCalc.hourlyRate}/hr)
                                </div>
                            </div>

                            <form onSubmit={handleTransferSubmit}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Select New Ward *</label>
                                        <select
                                            required
                                            value={transferModal.newWard}
                                            onChange={(e) => setTransferModal(prev => ({ ...prev, newWard: e.target.value, newBedId: '' }))}
                                            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', background: '#fff' }}
                                        >
                                            <option value="">-- Choose New Ward --</option>
                                            {Array.from(new Set(availableBeds.map(b => b.ward))).map(w => (
                                                <option key={w} value={w}>{w}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Select Available Bed *</label>
                                        <select
                                            required
                                            value={transferModal.newBedId}
                                            onChange={(e) => setTransferModal(prev => ({ ...prev, newBedId: e.target.value }))}
                                            disabled={!transferModal.newWard}
                                            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', background: transferModal.newWard ? '#fff' : '#f8fafc' }}
                                        >
                                            <option value="">{transferModal.newWard ? '-- Choose New Bed --' : '-- Select Ward First --'}</option>
                                            {availableBeds.filter(b => b.ward === transferModal.newWard && String(b._id) !== String(transferModal.admission.bedId)).map(b => (
                                                <option key={b._id} value={b._id}>{b.bedNumber} ({b.bedType})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {transferModal.newWard && (
                                    <div style={{ background: '#faf5ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e9d5ff', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '0.85rem', color: '#6b21a8', fontWeight: 600 }}>
                                            New Ward Rate:
                                        </div>
                                        <div style={{ fontWeight: 800, color: '#7e22ce', fontSize: '0.95rem' }}>
                                            ₹{newDaily.toLocaleString('en-IN')}/day (₹{newHourly}/hr)
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Transfer Date *</label>
                                        <input
                                            type="date"
                                            required
                                            value={transferModal.transferDate}
                                            onChange={(e) => setTransferModal(prev => ({ ...prev, transferDate: e.target.value }))}
                                            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Transfer Time *</label>
                                        <input
                                            type="time"
                                            required
                                            value={transferModal.transferTime}
                                            onChange={(e) => setTransferModal(prev => ({ ...prev, transferTime: e.target.value }))}
                                            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Transfer Reason / Notes</label>
                                    <textarea
                                        placeholder="Reason for transferring patient (e.g., condition stabilized, shifted to General Ward)..."
                                        value={transferModal.notes}
                                        onChange={(e) => setTransferModal(prev => ({ ...prev, notes: e.target.value }))}
                                        rows={2}
                                        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                                    <button type="button" onClick={() => setTransferModal({ open: false, admission: null })} style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={transferModal.saving}
                                        style={{ padding: '10px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: transferModal.saving ? 0.6 : 1 }}
                                    >
                                        {transferModal.saving ? 'Transferring...' : `✓ Confirm Transfer (₹${liveCalc.amount.toLocaleString('en-IN')})`}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* ====== DISCHARGE PATIENT MODAL ====== */}
            {dischargeModal.open && dischargeModal.admission && (() => {
                const prevTransfer = dischargeModal.admission.transferHistory && dischargeModal.admission.transferHistory.length > 0
                    ? dischargeModal.admission.transferHistory[dischargeModal.admission.transferHistory.length - 1]
                    : null;

                const finalStartDateTime = prevTransfer
                    ? combineDateTime(prevTransfer.transferDate, prevTransfer.transferTime)
                    : combineDateTime(dischargeModal.admission.admissionDate, dischargeModal.admission.admissionTime);

                const currentDischargeDateTime = combineDateTime(dischargeModal.dischargeDate, dischargeModal.dischargeTime);
                const finalCalc = computeStayDurationAndCost(finalStartDateTime, currentDischargeDateTime, dischargeModal.admission.wardRatePerDay);

                const pastSegmentsTotal = (dischargeModal.admission.transferHistory || []).reduce((acc, th) => acc + (Number(th.segmentAmount) || 0), 0);
                const grandTotal = pastSegmentsTotal + finalCalc.amount;

                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                        <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>🚪 Discharge Patient &amp; Settle Inpatient Bill</h2>
                                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                        Patient: <strong>{dischargeModal.admission.patientId?.name}</strong> (MRN: {dischargeModal.admission.patientId?.patientId || '-'})
                                    </p>
                                </div>
                                <button onClick={() => setDischargeModal({ open: false, admission: null })} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#64748b' }}>✕</button>
                            </div>

                            {/* Itemized Live Stay Breakdown Table */}
                            <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
                                <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '10px', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>📋 Itemized Stay &amp; Hourly/Daily Calculation:</span>
                                    <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 'normal' }}>
                                        Adm: {new Date(dischargeModal.admission.admissionDate).toLocaleDateString('en-IN')} {dischargeModal.admission.admissionTime || ''}
                                    </span>
                                </div>

                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                                    <thead>
                                        <tr style={{ background: '#e2e8f0', color: '#334155', textAlign: 'left' }}>
                                            <th style={{ padding: '6px 8px', borderRadius: '4px 0 0 4px' }}>Ward</th>
                                            <th style={{ padding: '6px 8px' }}>Duration</th>
                                            <th style={{ padding: '6px 8px' }}>Rate</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right', borderRadius: '0 4px 4px 0' }}>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(dischargeModal.admission.transferHistory || []).map((th, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0f172a' }}>{th.fromWard}</td>
                                                <td style={{ padding: '6px 8px', color: '#475569' }}>{th.durationText || `${th.durationDays}d`}</td>
                                                <td style={{ padding: '6px 8px', color: '#64748b' }}>₹{th.ratePerDay}/d (₹{th.hourlyRate || Math.round(th.ratePerDay/24)}/h)</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>₹{Number(th.segmentAmount || 0).toLocaleString('en-IN')}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
                                            <td style={{ padding: '6px 8px', fontWeight: 700, color: '#166534' }}>{dischargeModal.admission.ward} (Current)</td>
                                            <td style={{ padding: '6px 8px', fontWeight: 700, color: '#166534' }}>{finalCalc.durationText}</td>
                                            <td style={{ padding: '6px 8px', color: '#166534' }}>₹{dischargeModal.admission.wardRatePerDay}/d (₹{finalCalc.hourlyRate}/h)</td>
                                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#166534' }}>₹{finalCalc.amount.toLocaleString('en-IN')}</td>
                                        </tr>
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9' }}>
                                            <td colSpan={3} style={{ padding: '8px', fontWeight: 800, color: '#0f172a' }}>TOTAL INPATIENT CHARGES:</td>
                                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 900, color: '#2563eb', fontSize: '1.05rem' }}>₹{grandTotal.toLocaleString('en-IN')}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <form onSubmit={handleDischargeSubmit}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Discharge Date *</label>
                                        <input
                                            type="date"
                                            required
                                            value={dischargeModal.dischargeDate}
                                            onChange={(e) => setDischargeModal(prev => ({ ...prev, dischargeDate: e.target.value }))}
                                            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Discharge Time *</label>
                                        <input
                                            type="time"
                                            required
                                            value={dischargeModal.dischargeTime}
                                            onChange={(e) => setDischargeModal(prev => ({ ...prev, dischargeTime: e.target.value }))}
                                            style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Discharge Summary / Notes (optional)</label>
                                    <textarea
                                        placeholder="Discharge condition, doctor advice, recovery notes..."
                                        value={dischargeModal.notes}
                                        onChange={(e) => setDischargeModal(prev => ({ ...prev, notes: e.target.value }))}
                                        rows={2}
                                        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                                    <button type="button" onClick={() => setDischargeModal({ open: false, admission: null })} style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={dischargeModal.saving}
                                        style={{ padding: '10px 24px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: dischargeModal.saving ? 0.6 : 1 }}
                                    >
                                        {dischargeModal.saving ? 'Discharging...' : `✓ Confirm Discharge & Print Bill (₹${grandTotal.toLocaleString('en-IN')})`}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}
        </>
    );

    if (viewMode === 'welcome' || !viewMode || viewMode === 'dashboard') {
        return (
            <>
                <div className="reception-dashboard" style={{ padding: '0 0 24px 0', margin: 0 }}>
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

                    {/* WELCOME BANNER */}
                    <div className="rec-welcome-wrap">
                        {/* 1. Hero Greeting Banner */}
                        <div className="rec-hero-card">
                            <div className="rec-hero-left">
                                <div className="rec-badge-pill">
                                    <span>👋</span>
                                    <span>RECEPTIONIST</span>
                                </div>
                                <h1 className="rec-hero-title">
                                    Good {timeOfDay.toLowerCase()}, <span className="rec-name-highlight">{currentUser?.name || 'Aman Sharma'}</span>
                                </h1>
                                <p className="rec-hero-subtitle">
                                    Here's your workspace. Pick any section to get started.
                                </p>
                            </div>

                            {/* Right Side: AI Receptionist Desk Visual */}
                            <div className="rec-hero-art">
                                <img 
                                    src="/assets/receptionist_ai_desk.jpg" 
                                    alt="Receptionist Desk" 
                                    className="rec-hero-img" 
                                />
                            </div>
                        </div>

                        {/* 2. Quick Access Section - Half-Color Top / Half-White Bottom with Proper Buttons */}
                        <div className="rec-quick-section">
                            <div className="rec-section-heading">
                                <span className="rec-heading-badge">⚡ QUICK ACCESS</span>
                                <span className="rec-heading-sub">Frequently used workflows & portals</span>
                            </div>

                            <div className="rec-quick-grid">
                                {/* Card 1: Patient Registration (Half Mint / Half White) */}
                                <div 
                                    className="rec-quick-card rec-split-card rec-split-mint"
                                    onClick={() => navigate('/reception/dashboard?view=intake')}
                                >
                                    {/* Top Half: Soft Pastel Mint Gradient */}
                                    <div className="rec-card-top-half">
                                        <div className="rec-card-icon-box rec-box-mint">
                                            <FiUserPlus />
                                        </div>
                                        <div className="rec-card-content">
                                            <h4>Patient Registration</h4>
                                            <p>Register new patients and manage records</p>
                                        </div>
                                    </div>

                                    {/* Bottom Half: Crisp Pure White with Proper Action Button */}
                                    <div className="rec-card-bottom-half">
                                        <button className="rec-action-btn rec-btn-mint">
                                            <span>Get Started</span>
                                            <span className="rec-btn-arrow">→</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Card 2: Patient Search (Half Blue / Half White) */}
                                <div 
                                    className="rec-quick-card rec-split-card rec-split-blue"
                                    onClick={() => navigate('/reception/patients')}
                                >
                                    {/* Top Half: Soft Pastel Blue Gradient */}
                                    <div className="rec-card-top-half">
                                        <div className="rec-card-icon-box rec-box-blue">
                                            <FiSearch />
                                        </div>
                                        <div className="rec-card-content">
                                            <h4>Patient Search</h4>
                                            <p>Search and view patient information quickly</p>
                                        </div>
                                    </div>

                                    {/* Bottom Half: Crisp Pure White with Proper Action Button */}
                                    <div className="rec-card-bottom-half">
                                        <button className="rec-action-btn rec-btn-blue">
                                            <span>Search Now</span>
                                            <span className="rec-btn-arrow">→</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Card 3: Finance & Accounting (Half Purple / Half White) */}
                                <div 
                                    className="rec-quick-card rec-split-card rec-split-purple"
                                    onClick={() => {
                                        fetchTransactions();
                                        setViewMode('transactions');
                                        navigate('/reception/dashboard?view=transactions');
                                    }}
                                >
                                    {/* Top Half: Soft Pastel Purple Gradient */}
                                    <div className="rec-card-top-half">
                                        <div className="rec-card-icon-box rec-box-purple">
                                            <FaRupeeSign />
                                        </div>
                                        <div className="rec-card-content">
                                            <h4>Finance & Accounting</h4>
                                            <p>Access billing, payments and financial reports</p>
                                        </div>
                                    </div>

                                    {/* Bottom Half: Crisp Pure White with Proper Action Button */}
                                    <div className="rec-card-bottom-half">
                                        <button className="rec-action-btn rec-btn-purple">
                                            <span>Open Finance</span>
                                            <span className="rec-btn-arrow">→</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. Inspirational Quote / Footer Banner */}
                        <div className="rec-quote-banner">
                            <div className="rec-quote-left">
                                <div className="rec-quote-icon">“</div>
                                <div className="rec-quote-text">
                                    <h5>Compassionate care, every patient, every time.</h5>
                                    <p>Let's make a difference together!</p>
                                </div>
                            </div>

                            {/* Glowing 3D Heart Art */}
                            <div className="rec-quote-art">
                                <svg viewBox="0 0 140 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <defs>
                                        <linearGradient id="heartGlow" x1="0" y1="0" x2="1" y2="1">
                                            <stop offset="0%" stopColor="#34d399" />
                                            <stop offset="100%" stopColor="#059669" />
                                        </linearGradient>
                                    </defs>
                                    <g transform="translate(45, 2)">
                                        <path d="M20 7 C 12 -2, 0 5, 0 14 C 0 24, 18 34, 20 36 C 22 34, 40 24, 40 14 C 40 5, 28 -2, 20 7 Z" fill="url(#heartGlow)" />
                                        <path d="M 8 18 L 14 18 L 17 12 L 21 24 L 24 16 L 27 19 L 32 19" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M 3 24 Q -4 16 2 8 Q 8 20 3 24 Z" fill="#6ee7b7" opacity="0.8" />
                                        <path d="M 37 24 Q 44 16 38 8 Q 32 20 37 24 Z" fill="#6ee7b7" opacity="0.8" />
                                    </g>
                                    <circle cx="105" cy="14" r="2" fill="#34d399" />
                                    <circle cx="118" cy="24" r="1.5" fill="#10b981" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
                {renderModals()}
            </>
        );
    }

    return (
        <div className="reception-dashboard rec-modern-dashboard">
            {pendingDownload && (
                <div style={{
                    margin: '0 0 20px 0',
                    padding: '12px 20px',
                    background: '#ecfdf5',
                    border: '1.5px solid #a7f3d0',
                    borderRadius: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)',
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

            {/* TOP SEARCH BAR WITH AUTOCOMPLETE */}
            <div className="rec-search-container" style={{ position: 'relative', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '16px', padding: '10px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <FiSearch style={{ color: '#94a3b8', fontSize: '1.1rem', marginRight: '12px', flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="Search Patient by Name, Mobile or MRN..."
                        value={searchQuery}
                        onChange={handleSearch}
                        style={{ width: '100%', border: 'none', outline: 'none', fontSize: '0.92rem', color: '#1e293b', fontWeight: 500 }}
                    />
                </div>
                {searchQuery.trim().length > 0 && searchResults.length > 0 && (
                    <div style={{
                        position: 'absolute', top: '56px', left: 0, right: 0,
                        background: '#ffffff', border: '1.5px solid #e2e8f0', boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                        zIndex: 1000, maxHeight: '320px', overflowY: 'auto', borderRadius: '14px', padding: '6px'
                    }}>
                        {searchResults.map(p => (
                            <div key={p._id} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '8px', transition: 'background 0.15s' }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{p.name} <span style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>({p.patientId || 'N/A'})</span></div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>📱 {p.phone}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => handleSelectSearchResult(p)}
                                        style={{ padding: '6px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
                                    >
                                        📋 Book Appointment
                                    </button>
                                    <button
                                        onClick={() => handleViewProfile(p)}
                                        style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}
                                    >
                                        👤 View Profile
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rec-modern-layout-full">
                {/* 1. HERO BANNER WITH RECEPTIONIST ILLUSTRATION & QUICK ACTIONS */}
                <div className="rec-hero-banner">
                    <div className="rec-hero-text">
                        <span className="rec-hero-greet">Good {timeOfDay}, Receptionist 👋</span>
                        <h1 className="rec-hero-title">Welcome Back!</h1>
                        <p className="rec-hero-subtitle">Here's what's happening today</p>
                    </div>

                    {/* Central Vector Illustration */}
                    <div className="rec-hero-illustration">
                        <svg viewBox="0 0 260 160" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', maxWidth: '240px' }}>
                            <ellipse cx="130" cy="90" rx="95" ry="55" fill="#ede9fe" opacity="0.6" />
                            <circle cx="110" cy="50" r="18" fill="#fbcfe8" opacity="0.5" />
                            <circle cx="180" cy="70" r="10" fill="#bae6fd" opacity="0.7" />
                            <rect x="50" y="115" width="160" height="12" rx="4" fill="#6366f1" opacity="0.85" />
                            <rect x="65" y="127" width="8" height="25" rx="2" fill="#4f46e5" />
                            <rect x="187" y="127" width="8" height="25" rx="2" fill="#4f46e5" />
                            <rect x="75" y="90" width="38" height="25" rx="3" fill="#1e293b" />
                            <rect x="78" y="93" width="32" height="19" rx="1.5" fill="#38bdf8" />
                            <path d="M 70 115 L 118 115 L 114 118 L 74 118 Z" fill="#94a3b8" />
                            <rect x="180" y="100" width="14" height="15" rx="2" fill="#f59e0b" />
                            <path d="M 187 100 Q 180 85 175 88 Q 185 92 187 100 Z" fill="#10b981" />
                            <path d="M 187 100 Q 194 82 200 87 Q 192 92 187 100 Z" fill="#34d399" />
                            <path d="M 187 100 Q 187 78 184 75 Q 189 85 187 100 Z" fill="#059669" />
                            <circle cx="140" cy="62" r="22" fill="#1e293b" />
                            <path d="M 118 115 C 118 92 162 92 162 115 Z" fill="#7c3aed" />
                            <path d="M 132 92 L 140 106 L 148 92 Z" fill="#ffffff" />
                            <rect x="135" y="68" width="10" height="12" rx="3" fill="#fed7aa" />
                            <circle cx="140" cy="60" r="14" fill="#fde68a" />
                            <path d="M 126 56 C 126 44 154 44 154 56 C 154 50 148 46 140 46 C 132 46 126 50 126 56 Z" fill="#0f172a" />
                            <circle cx="136" cy="60" r="1.5" fill="#0f172a" />
                            <circle cx="144" cy="60" r="1.5" fill="#0f172a" />
                            <path d="M 138 65 Q 140 68 142 65" stroke="#0f172a" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                            <path d="M 122 102 Q 106 108 98 115" stroke="#7c3aed" strokeWidth="6" strokeLinecap="round" />
                            <path d="M 158 102 Q 170 108 174 115" stroke="#7c3aed" strokeWidth="6" strokeLinecap="round" />
                            <path d="M 110 35 Q 110 20 122 24" stroke="#94a3b8" strokeWidth="2" fill="none" />
                            <path d="M 118 20 L 126 28 L 115 28 Z" fill="#facc15" />
                            <circle cx="120" cy="27" r="4" fill="#fef08a" opacity="0.8" />
                        </svg>
                    </div>

                    {/* 3 Right Action Mini-Cards */}
                    <div className="rec-hero-actions">
                        <div className="rec-action-chip rec-chip-purple" onClick={() => { fetchTransactions(); setViewMode('transactions'); }}>
                            <div className="rec-chip-icon rec-icon-purple"><FaRupeeSign /></div>
                            <div className="rec-chip-info">
                                <h4>Transactions</h4>
                                <span>View all</span>
                            </div>
                        </div>

                        <div className="rec-action-chip rec-chip-teal" onClick={() => navigate('/billing/patient')}>
                            <div className="rec-chip-icon rec-icon-teal"><FiFileText /></div>
                            <div className="rec-chip-info">
                                <h4>Patient Billing</h4>
                                <span>Manage</span>
                            </div>
                        </div>

                        <div className="rec-action-chip rec-chip-blue" onClick={handleNewWalkIn}>
                            <div className="rec-chip-icon rec-icon-blue"><FiUserPlus /></div>
                            <div className="rec-chip-info">
                                <h4>New Registration</h4>
                                <span>Add Patient</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. 4 HOSPITALIZATION & PATIENT KPI METRICS */}
                {(() => {
                    const totalTodayPatients = appointments?.length || stats.todayAppointments || 0;
                    const totalHospitalized = hospitalizedPatients?.filter(adm => adm.status === 'Admitted').length || stats.currentlyHospitalized || 0;
                    const todayAdmissionsCount = hospitalizedPatients?.filter(adm => {
                        const d = adm.admissionDate ? new Date(adm.admissionDate).toISOString().split('T')[0] : (adm.createdAt ? new Date(adm.createdAt).toISOString().split('T')[0] : '');
                        return d === todayStr;
                    }).length || stats.todayAdmissions || 0;
                    const totalVacantBeds = availableBeds?.length || stats.availableBeds || 0;

                    return (
                        <div className="rec-kpi-grid">
                            <div className="rec-kpi-card rec-kpi-teal" onClick={() => setListTab('queue')}>
                                <div className="rec-kpi-icon-wrap rec-bg-teal"><FiUsers /></div>
                                <div className="rec-kpi-content">
                                    <div className="rec-kpi-val">{String(totalTodayPatients).padStart(2, '0')}</div>
                                    <div className="rec-kpi-label">Today's Patients</div>
                                    <div className="rec-kpi-subtext">Live OPD Queue</div>
                                </div>
                                <svg className="rec-kpi-sparkline" viewBox="0 0 60 20" fill="none">
                                    <path d="M2 14 C 15 18, 30 6, 45 10 C 52 12, 58 4, 58 4" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" />
                                </svg>
                            </div>

                            <div className="rec-kpi-card rec-kpi-purple" onClick={() => setListTab('hospitalized')}>
                                <div className="rec-kpi-icon-wrap rec-bg-purple"><FiHome /></div>
                                <div className="rec-kpi-content">
                                    <div className="rec-kpi-val">{String(totalHospitalized).padStart(2, '0')}</div>
                                    <div className="rec-kpi-label">Hospitalized</div>
                                    <div className="rec-kpi-subtext">Active In-Patients</div>
                                </div>
                                <svg className="rec-kpi-sparkline" viewBox="0 0 60 20" fill="none">
                                    <path d="M2 12 C 14 4, 28 16, 42 6 C 50 2, 58 8, 58 8" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" />
                                </svg>
                            </div>

                            <div className="rec-kpi-card rec-kpi-orange" onClick={() => setListTab('hospitalized')}>
                                <div className="rec-kpi-icon-wrap rec-bg-orange"><FiActivity /></div>
                                <div className="rec-kpi-content">
                                    <div className="rec-kpi-val">{String(todayAdmissionsCount).padStart(2, '0')}</div>
                                    <div className="rec-kpi-label">Today's Admissions</div>
                                    <div className="rec-kpi-subtext">New IPD Admitted</div>
                                </div>
                                <svg className="rec-kpi-sparkline" viewBox="0 0 60 20" fill="none">
                                    <path d="M2 12 C 12 6, 25 16, 38 8 C 48 2, 58 10, 58 10" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" />
                                </svg>
                            </div>

                            <div className="rec-kpi-card rec-kpi-blue" onClick={() => fetchAvailableBeds()}>
                                <div className="rec-kpi-icon-wrap rec-bg-blue"><FiCheckCircle /></div>
                                <div className="rec-kpi-content">
                                    <div className="rec-kpi-val">{String(totalVacantBeds).padStart(2, '0')}</div>
                                    <div className="rec-kpi-label">Available Beds</div>
                                    <div className="rec-kpi-subtext">Vacant for Admission</div>
                                </div>
                                <svg className="rec-kpi-sparkline" viewBox="0 0 60 20" fill="none">
                                    <path d="M2 16 C 18 10, 32 14, 44 4 C 52 -2, 58 2, 58 2" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
                                </svg>
                            </div>
                        </div>
                    );
                })()}

                {/* 3. DYNAMIC CHECK DOCTOR AVAILABILITY CARD WITH 3D CLOCK */}
                {(() => {
                    const selectedDoctorObj = doctorsList.find(d => String(d._id) === String(availabilityCheck.doctorId));
                    const availableSlots = timeSlots.filter(time => {
                        const isBooked = availabilityCheck.bookedSlots.includes(time);
                        const isPast = isSlotInPast(time);
                        return !isBooked && !isPast;
                    });

                    return (
                        <div className="rec-avail-box">
                            <div className="rec-avail-left">
                                <div className="rec-avail-head">
                                    <div className="rec-avail-title-row">
                                        <div className="rec-avail-icon-calendar"><FiCalendar /></div>
                                        <h3>Check Doctor Availability</h3>
                                        <span className="rec-sparkle-star">✦</span>
                                    </div>
                                    <div className="rec-avail-controls">
                                        <div className="rec-select-wrapper">
                                            <select
                                                className="rec-doctor-select"
                                                value={availabilityCheck.doctorId}
                                                onChange={(e) => setAvailabilityCheck({ ...availabilityCheck, doctorId: e.target.value })}
                                            >
                                                <option value="">Select Doctor</option>
                                                {doctorsList.map(d => (
                                                    <option key={d._id} value={d._id}>
                                                        {d.name} {d.departments?.length > 0 ? `(${d.departments[0]})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="rec-date-wrapper">
                                            <input
                                                type="date"
                                                className="rec-date-input"
                                                value={availabilityCheck.date}
                                                onChange={(e) => setAvailabilityCheck({ ...availabilityCheck, date: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Dynamic Slot Container — Only Show Available Slots When Doctor Selected */}
                                <div className="rec-slots-container">
                                    {!availabilityCheck.doctorId ? (
                                        <div className="rec-avail-prompt-box">
                                            <div className="rec-avail-prompt-icon-badge">
                                                <FiClock size={24} />
                                            </div>
                                            <div className="rec-avail-prompt-content">
                                                <h4>Select a Doctor Above</h4>
                                                <p>Choose any doctor and date from the dropdown to check real-time slot availability.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rec-avail-active-view">
                                            <div className="rec-avail-active-header">
                                                <span className="rec-avail-badge-count">
                                                    <FiCheckCircle size={13} /> {availableSlots.length} Slots Available
                                                </span>
                                                <span className="rec-avail-doc-tag">
                                                    Dr. {selectedDoctorObj?.name || 'Doctor'} • {new Date(availabilityCheck.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                            </div>

                                            {availableSlots.length > 0 ? (
                                                <div className="rec-slots-grid">
                                                    {availableSlots.map(time => {
                                                        const isSelected = selectedTimeSlot === time;
                                                        return (
                                                            <button
                                                                key={time}
                                                                type="button"
                                                                className={`rec-slot-chip available ${isSelected ? 'selected' : ''}`}
                                                                onClick={() => {
                                                                    setSelectedTimeSlot(time);
                                                                    handleSlotClick(time);
                                                                }}
                                                                title={`Click to book appointment at ${time}`}
                                                            >
                                                                <FiClock size={12} />
                                                                <span>{time}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="rec-avail-no-slots">
                                                    <span className="rec-no-slots-icon">⚠️</span>
                                                    <div>
                                                        <strong>No Available Slots</strong>
                                                        <p>All slots for Dr. {selectedDoctorObj?.name} on this date are fully booked or past. Please choose another date or doctor.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 3D Clock Art on Pedestal */}
                            <div className="rec-avail-clock-art">
                                <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '135px', height: '135px' }}>
                                    <ellipse cx="80" cy="140" rx="55" ry="12" fill="#c4b5fd" opacity="0.4" />
                                    <path d="M 45 115 L 115 115 L 135 130 L 25 130 Z" fill="#8b5cf6" />
                                    <path d="M 25 130 L 135 130 L 135 138 L 25 138 Z" fill="#6d28d9" />
                                    <ellipse cx="80" cy="75" rx="42" ry="42" fill="#f8fafc" stroke="#8b5cf6" strokeWidth="4" />
                                    <ellipse cx="80" cy="75" rx="35" ry="35" fill="linear-gradient(135deg, #ede9fe 0%, #ffffff 100%)" />
                                    <circle cx="80" cy="75" r="32" stroke="#ddd6fe" strokeWidth="1.5" />
                                    <rect x="79" y="47" width="2" height="5" rx="1" fill="#7c3aed" />
                                    <rect x="79" y="98" width="2" height="5" rx="1" fill="#7c3aed" />
                                    <rect x="52" y="74" width="5" height="2" rx="1" fill="#7c3aed" />
                                    <rect x="103" y="74" width="5" height="2" rx="1" fill="#7c3aed" />
                                    <line x1="80" y1="75" x2="80" y2="55" stroke="#6d28d9" strokeWidth="3" strokeLinecap="round" />
                                    <line x1="80" y1="75" x2="98" y2="70" stroke="#8b5cf6" strokeWidth="2.2" strokeLinecap="round" />
                                    <circle cx="80" cy="75" r="4" fill="#7c3aed" />
                                </svg>
                            </div>
                        </div>
                    );
                })()}

                {/* 4. COLORFUL TODAY'S QUEUE & HOSPITALIZED INPATIENTS TABLES */}
                <div className="rec-queue-box">
                    <div className="rec-queue-head">
                        <div className="rec-queue-title">
                            <div className={`rec-queue-icon ${listTab === 'hospitalized' ? 'hosp' : 'queue'}`}>
                                {listTab === 'hospitalized' ? <FiHome /> : <FiUsers />}
                            </div>
                            <div>
                                <h3>{listTab === 'hospitalized' ? 'Hospitalized In-Patients' : "Today's Appointment Queue"}</h3>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                                    {listTab === 'hospitalized' 
                                        ? 'Active IPD admissions and bed allocations across all wards' 
                                        : 'Live walk-in registrations and scheduled OPD consultations'}
                                </p>
                            </div>
                        </div>

                        {/* Modern Toggle Tab Pills */}
                        <div className="rec-queue-tabs">
                            <button
                                className={`rec-tab-pill-btn ${listTab === 'queue' ? 'active-queue' : ''}`}
                                onClick={() => setListTab('queue')}
                            >
                                <FiUsers size={13} />
                                <span>Today's Queue</span>
                                <span className="rec-tab-count">{appointments?.length || 0}</span>
                            </button>
                            <button
                                className={`rec-tab-pill-btn ${listTab === 'hospitalized' ? 'active-hosp' : ''}`}
                                onClick={() => setListTab('hospitalized')}
                            >
                                <FiHome size={13} />
                                <span>Hospitalized</span>
                                <span className="rec-tab-count">{hospitalizedPatients?.filter(adm => adm.status === 'Admitted').length || 0}</span>
                            </button>
                        </div>
                    </div>

                    {listTab === 'hospitalized' ? (
                        /* Colorful Hospitalized In-Patients Table */
                        <div className="rec-table-wrap">
                            <table className="rec-table rec-table-colorful rec-table-hosp">
                                <thead>
                                    <tr>
                                        <th style={{ width: '45px' }}>#</th>
                                        <th>PATIENT</th>
                                        <th>MRN</th>
                                        <th>WARD & BED</th>
                                        <th>DOCTOR & DEPT</th>
                                        <th>ADMISSION DATE</th>
                                        <th>STAY DURATION</th>
                                        <th>STATUS</th>
                                        <th style={{ textAlign: 'right' }}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {hospitalizedPatients && hospitalizedPatients.filter(adm => adm.status === 'Admitted').length > 0 ? (
                                        hospitalizedPatients.filter(adm => adm.status === 'Admitted').map((adm, idx) => {
                                            const pName = adm.patientId?.name || 'In-Patient';
                                            const pPhone = adm.patientId?.phone || '-';
                                            const pMrn = adm.patientId?.patientId || adm.patientId?.mrn || '-';
                                            const dName = adm.appointmentId?.doctorName || adm.appointmentId?.doctorId?.name || 'Attending Physician';
                                            const dept = adm.appointmentId?.department || adm.appointmentId?.serviceName || 'General';

                                            const admDate = adm.admissionDate ? new Date(adm.admissionDate) : new Date(adm.createdAt || Date.now());
                                            const now = new Date();
                                            const diffMs = Math.max(0, now - admDate);
                                            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                                            const stayDays = Math.floor(diffHours / 24);
                                            const stayHours = diffHours % 24;
                                            const stayText = stayDays > 0 ? `${stayDays}d ${stayHours}h` : `${Math.max(1, diffHours)}h`;

                                            return (
                                                <tr key={adm._id || idx} className="rec-row-hosp">
                                                    <td className="rec-td-num">{String(idx + 1).padStart(2, '0')}</td>
                                                    <td>
                                                        <div 
                                                            className="rec-patient-cell"
                                                            onClick={() => handleViewProfile(adm.patientId || adm)}
                                                            style={{ cursor: 'pointer' }}
                                                            title="Click to view Full Patient Profile"
                                                        >
                                                            <div
                                                                className="rec-avatar-circle"
                                                                style={{ background: getInitialBgColor(pName) }}
                                                            >
                                                                {pName.substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <div className="rec-patient-names">
                                                                <span className="rec-p-name" style={{ textDecoration: 'underline', textDecorationColor: 'transparent', transition: 'text-decoration-color 0.2s' }} onMouseOver={e => e.currentTarget.style.textDecorationColor = '#7c3aed'} onMouseOut={e => e.currentTarget.style.textDecorationColor = 'transparent'}>{pName}</span>
                                                                <span className="rec-p-phone"><FiPhone size={10} style={{ display: 'inline', marginRight: '3px' }} />{pPhone}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span 
                                                            className="rec-mrn-pill" 
                                                            onClick={() => handleViewProfile(adm.patientId || adm)}
                                                            style={{ cursor: 'pointer' }}
                                                            title="View Patient"
                                                        >
                                                            {pMrn}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="rec-hosp-bed-cell">
                                                            <span className="rec-ward-pill">{adm.ward || 'Ward'}</span>
                                                            <span className="rec-bed-pill">Bed #{adm.bedNumber || '-'}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="rec-doc-cell">
                                                            <div className="rec-doc-avatar hosp-doc">
                                                                {dName.replace('Dr. ', '').substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <div className="rec-doc-names">
                                                                <span className="rec-doc-name">{dName}</span>
                                                                <span className="rec-doc-dept">{dept}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="rec-time-cell">
                                                            <span className="rec-date-val">
                                                                {admDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </span>
                                                            <span className="rec-time-val">{adm.admissionTime || '10:00 AM'}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="rec-stay-badge">
                                                            ⏱️ {stayText}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className="rec-status-pill status-admitted">
                                                            ADMITTED
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <div className="rec-actions-group">
                                                            <button
                                                                className="rec-tbl-btn rec-btn-profile"
                                                                title="View Patient Profile"
                                                                onClick={() => handleViewProfile(adm.patientId || adm)}
                                                                style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}
                                                            >
                                                                <FiEye size={13} />
                                                                <span>Profile</span>
                                                            </button>
                                                            <button
                                                                className="rec-tbl-btn rec-btn-transfer"
                                                                title="Transfer Ward or Bed"
                                                                onClick={() => openTransferModal(adm)}
                                                                style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}
                                                            >
                                                                <FiSliders size={13} />
                                                                <span>Transfer</span>
                                                            </button>
                                                            <button
                                                                className="rec-tbl-btn rec-btn-discharge"
                                                                title="Discharge & Settle Account"
                                                                onClick={() => openDischargeModal(adm)}
                                                                style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3' }}
                                                            >
                                                                <FiHome size={13} />
                                                                <span>Discharge</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '2rem' }}>🛏️</span>
                                                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>No In-Patients Currently Hospitalized</div>
                                                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.82rem' }}>You can hospitalize a patient directly from Today's Queue using the "Hospitalize" button.</p>
                                                    <button
                                                        onClick={() => setListTab('queue')}
                                                        style={{
                                                            marginTop: '8px', padding: '8px 18px', background: '#8b5cf6',
                                                            color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700,
                                                            fontSize: '0.82rem', cursor: 'pointer'
                                                        }}
                                                    >
                                                        ← View Today's Queue
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        /* Colorful Today's Appointment Queue Table */
                        <div className="rec-table-wrap">
                            <table className="rec-table rec-table-colorful rec-table-queue">
                                <thead>
                                    <tr>
                                        <th style={{ width: '45px' }}>#</th>
                                        <th>PATIENT</th>
                                        <th>MRN</th>
                                        <th>DOCTOR</th>
                                        <th>TIME</th>
                                        <th>STATUS</th>
                                        <th style={{ textAlign: 'right' }}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {appointments && appointments.length > 0 ? (
                                        appointments.map((apt, idx) => {
                                            const isHospitalized = hospitalizedPatients.some(adm => 
                                                (adm.appointmentId?._id === apt._id || adm.appointmentId === apt._id) && adm.status === 'Admitted'
                                            );
                                            const pName = apt.userId?.name || apt.patientName || 'Patient';
                                            const pPhone = apt.userId?.phone || apt.patientPhone || '-';
                                            const pMrn = apt.patientId || apt.userId?.patientId || '-';
                                            const dName = apt.doctorName || apt.doctorId?.name || 'Doctor';
                                            const aTime = apt.appointmentTime || '10:00 AM';
                                            const st = (apt.status || 'CONFIRMED').toUpperCase();

                                            return (
                                                <tr key={apt._id || idx} className="rec-row-queue">
                                                    <td className="rec-td-num">{String(idx + 1).padStart(2, '0')}</td>
                                                    <td>
                                                        <div 
                                                            className="rec-patient-cell"
                                                            onClick={() => handleViewProfile(apt.userId || apt)}
                                                            style={{ cursor: 'pointer' }}
                                                            title="Click to view Patient Profile"
                                                        >
                                                            <div
                                                                className="rec-avatar-circle"
                                                                style={{ background: getInitialBgColor(pName) }}
                                                            >
                                                                {pName.substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <div className="rec-patient-names">
                                                                <span className="rec-p-name" style={{ textDecoration: 'underline', textDecorationColor: 'transparent', transition: 'text-decoration-color 0.2s' }} onMouseOver={e => e.currentTarget.style.textDecorationColor = '#0d9488'} onMouseOut={e => e.currentTarget.style.textDecorationColor = 'transparent'}>{pName}</span>
                                                                <span className="rec-p-phone"><FiPhone size={10} style={{ display: 'inline', marginRight: '3px' }} />{pPhone}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span 
                                                            className="rec-mrn-pill" 
                                                            onClick={() => handleViewProfile(apt.userId || apt)}
                                                            style={{ cursor: 'pointer' }}
                                                            title="Click to view Patient Profile"
                                                        >
                                                            {pMrn}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="rec-doc-cell">
                                                            <div className="rec-doc-avatar">
                                                                {dName.replace('Dr. ', '').substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <span className="rec-doc-name">{dName}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="rec-time-badge">
                                                            <FiClock size={13} />
                                                            <span>{aTime}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`rec-status-pill status-${st.toLowerCase().replace(/\s+/g, '')}`}>
                                                            {st}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <div className="rec-actions-group">
                                                            <button
                                                                className="rec-tbl-btn rec-btn-profile"
                                                                title="View Patient Profile"
                                                                onClick={() => handleViewProfile(apt.userId || apt)}
                                                                style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}
                                                            >
                                                                <FiEye size={13} />
                                                                <span>Profile</span>
                                                            </button>
                                                            <button
                                                                className="rec-tbl-btn rec-btn-print"
                                                                title="Print Receipt"
                                                                onClick={() => {
                                                                    const pdf = generateReceiptPDF(apt, apt.paymentMethod || 'Cash', false);
                                                                    setPendingDownload({ doc: pdf.doc, filename: pdf.filename, title: 'Payment Receipt' });
                                                                }}
                                                            >
                                                                <FiPrinter size={13} />
                                                                <span>Print</span>
                                                            </button>
                                                            <button
                                                                className={`rec-tbl-btn rec-btn-hosp ${isHospitalized ? 'admitted' : ''}`}
                                                                title="Hospitalize Patient"
                                                                onClick={() => openHospitalizeModal(apt)}
                                                            >
                                                                <FiHome size={13} />
                                                                <span>{isHospitalized ? 'Hospitalized' : 'Hospitalize'}</span>
                                                            </button>
                                                            <button
                                                                className="rec-tbl-btn rec-btn-cancel-appt"
                                                                title="Cancel Appointment"
                                                                onClick={() => handleCancelAppointment(apt._id)}
                                                            >
                                                                <FiX size={13} />
                                                                <span>Cancel</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: '40px 20px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '2rem' }}>🏥</span>
                                                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>No Appointments in Today's Queue</div>
                                                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.82rem' }}>Register walk-in patients or check doctor availability above to add appointments.</p>
                                                    <button
                                                        onClick={handleNewWalkIn}
                                                        style={{
                                                            marginTop: '8px', padding: '8px 18px', background: '#0d9488',
                                                            color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700,
                                                            fontSize: '0.82rem', cursor: 'pointer'
                                                        }}
                                                    >
                                                        + New Walk-In Registration
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
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
        </div>
    );
};

export default ReceptionDashboard;