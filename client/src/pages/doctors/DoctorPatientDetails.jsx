import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { confirmToast } from '../../utils/confirmToast';
import { doctorAPI, assistantAPI, labTestAPI, questionLibraryAPI, hospitalAPI, patientAPI, receptionAPI, otAPI, adminEntitiesAPI, referralAPI, publicAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './DoctorPatientDetails.css';
import DynamicQuestionForm from '../../components/DynamicQuestionForm';
import { useAuth } from '../../store/hooks';
import { MASTER_DEFAULT_QUESTION_LIBRARY, resolveDepartmentKey, DEPARTMENT_ICONS } from '../../config/masterQuestionLibrary';

import AppointmentReports from '../../components/AppointmentReports';
import { 
    FiArrowLeft, FiBell, FiChevronDown, FiChevronRight, 
    FiUser, FiCalendar, FiClock, FiCheck, FiCopy, 
    FiFileText, FiFolder, FiMoreHorizontal, FiPaperclip, 
    FiSave, FiArrowRight, FiRefreshCw, FiActivity, FiClipboard, FiFile, FiCheckCircle, FiX,
    FiSearch, FiTrash2, FiPlus
} from 'react-icons/fi';

const doseOptions = [
    'OD – Once Daily',
    'BD – Twice Daily',
    'TDS – Three Times Daily',
    'QID – Four Times Daily',
    'OM – Every Morning',
    'ON – Every Night',
    'QOD – Every Alternate Day',
    'OW – Once Weekly',
    'SOS – As Needed'
];

const timingOptions = [
    'Before Breakfast (BBF)',
    'After Breakfast (ABF)',
    'Before Lunch (BL)',
    'After Lunch (AL)',
    'Before Dinner (BDN)',
    'After Dinner (ADN)',
    'Before Meals (AC)',
    'After Meals (PC)',
    'With Food',
    'On Empty Stomach',
    'At Bedtime (HS)'
];

const COMMON_LAB_PRESETS = [
    { label: 'CBC', name: 'Complete Blood Count (CBC)', category: 'Hematology' },
    { label: 'Lipid Profile', name: 'Lipid Profile', category: 'Biochemistry' },
    { label: 'LFT', name: 'Liver Function Test (LFT)', category: 'Biochemistry' },
    { label: 'KFT', name: 'Kidney Function Test (KFT)', category: 'Biochemistry' },
    { label: 'HbA1c', name: 'HbA1c Glycated Hemoglobin', category: 'Diabetes' },
    { label: 'Thyroid', name: 'Thyroid Profile (T3, T4, TSH)', category: 'Endocrinology' },
    { label: 'Urine R/M', name: 'Urine Routine & Microscopy', category: 'Pathology' },
    { label: 'Chest X-Ray', name: 'Chest X-Ray (PA View)', category: 'Radiology' },
    { label: 'USG Abdomen', name: 'Ultrasound Abdomen & Pelvis', category: 'Radiology' },
    { label: '12-Lead ECG', name: '12-Lead Electrocardiogram (ECG)', category: 'Cardiology' },
    { label: 'Serum Creatinine', name: 'Serum Creatinine & Urea', category: 'Biochemistry' },
    { label: 'Serum Electrolytes', name: 'Serum Electrolytes (Na+, K+, Cl-)', category: 'Biochemistry' },
    { label: 'Vitamin D3', name: 'Vitamin D3 (25-OH)', category: 'Immunoassay' },
    { label: 'Vitamin B12', name: 'Vitamin B12', category: 'Immunoassay' },
    { label: 'Dengue Serology', name: 'Dengue NS1 Antigen & IgG/IgM', category: 'Serology' },
    { label: 'Blood Glucose', name: 'Blood Glucose (Fasting & PP)', category: 'Diabetes' },
    { label: 'CRP', name: 'C-Reactive Protein (CRP)', category: 'Biochemistry' },
    { label: 'ESR', name: 'Erythrocyte Sedimentation Rate (ESR)', category: 'Hematology' },
    { label: 'CT Scan Brain', name: 'CT Scan Brain (Plain)', category: 'Radiology' },
    { label: 'MRI Spine', name: 'MRI Lumbar Spine', category: 'Radiology' }
];

const QUICK_LAB_CHIPS = [
    { label: 'CBC', name: 'Complete Blood Count (CBC)' },
    { label: 'Lipid Profile', name: 'Lipid Profile' },
    { label: 'LFT', name: 'Liver Function Test (LFT)' },
    { label: 'KFT', name: 'Kidney Function Test (KFT)' },
    { label: 'HbA1c', name: 'HbA1c Glycated Hemoglobin' },
    { label: 'Thyroid', name: 'Thyroid Profile (T3, T4, TSH)' },
    { label: 'Urine R/M', name: 'Urine Routine & Microscopy' },
    { label: 'Chest X-Ray', name: 'Chest X-Ray (PA View)' },
    { label: 'USG Abdomen', name: 'Ultrasound Abdomen & Pelvis' },
    { label: '12-Lead ECG', name: '12-Lead Electrocardiogram (ECG)' }
];

const DoctorPatientDetails = () => {
    const { id } = useParams();
    const location = useLocation();
    const [appointmentId, setAppointmentId] = useState(location.state?.appointmentId);
    
    const navigate = useNavigate();
    const { user } = useAuth();
    
    // Check if the current user is a Junior Doctor
    const roleName = user?._roleData?.name?.toLowerCase() || (typeof user?.role === 'string' ? user.role.toLowerCase() : '');
    const isJrDoctor = roleName.includes('jr') && roleName.includes('doctor');
    const [medSearch, setMedSearch] = useState('');
    const [labSearch, setLabSearch] = useState('');

    const [appointment, setAppointment] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [catalogTests, setCatalogTests] = useState([]);
    const [catalogMedicines, setCatalogMedicines] = useState([]);
    const [dynamicLibrary, setDynamicLibrary] = useState(null);
    const [hospitalDepartments, setHospitalDepartments] = useState([]);
    const [selectedDeptOverride, setSelectedDeptOverride] = useState('');
    const [isLocked, setIsLocked] = useState(false);
    const [hospitalContext, setHospitalContext] = useState(null);
    const [customBannerToast, setCustomBannerToast] = useState({ show: false, message: '', title: '' });

    // Assistant Preparation State
    const [assistantPrep, setAssistantPrep] = useState(null);
    const [showAnswersModal, setShowAnswersModal] = useState(false);

    // Modal States
    const [showPrescribeModal, setShowPrescribeModal] = useState(false);
    const [pendingDownload, setPendingDownload] = useState(null);

    // Surgery Plan States
    const [operationRequired, setOperationRequired] = useState(false);
    const [showSurgeryPlanModal, setShowSurgeryPlanModal] = useState(false);
    const [surgeonsList, setSurgeonsList] = useState([]);
    const [patientSurgeryPlans, setPatientSurgeryPlans] = useState([]);
    const [loadingSurgeryPlans, setLoadingSurgeryPlans] = useState(false);
    const [surgeryPlanData, setSurgeryPlanData] = useState({
        surgery: '', diagnosis: '', surgeonId: '', preferredDate: '', preferredTime: '', admissionRequired: false, admissionDate: '', preOpRequired: false, notes: ''
    });

    // Referral States
    const [showReferralModal, setShowReferralModal] = useState(false);
    const [referralData, setReferralData] = useState({ referredToDoctorId: '', reason: '', notes: '' });
    const [patientReferrals, setPatientReferrals] = useState([]);
    const [showReferralReviewModal, setShowReferralReviewModal] = useState(false);
    const [activeReferralForReview, setActiveReferralForReview] = useState(null);

    // Tab State (Default to Doctor Consultation & Rx)
    const [activeTab, setActiveTab] = useState('session');

    // Time Machine Feature State
    const [viewingPastSession, setViewingPastSession] = useState(null);

    // Doctor's Session Notepad (Right Panel)
    const [sessionData, setSessionData] = useState({
        diagnosis: '', notes: '', medicines: [], labTests: ''
    });

    const availableLabTests = useMemo(() => {
        const list = [...COMMON_LAB_PRESETS];
        if (catalogTests && catalogTests.length > 0) {
            catalogTests.forEach(ct => {
                const name = ct.name || ct.testName || ct.title;
                if (name && !list.some(item => item.name.toLowerCase() === name.toLowerCase())) {
                    list.push({ label: name, name: name, category: ct.category || 'Diagnostic Test' });
                }
            });
        }
        return list;
    }, [catalogTests]);

    const handleAddLabTest = (testNameToAdd) => {
        const name = (testNameToAdd || labSearch).trim();
        if (!name) return;
        const currentList = (sessionData.labTests || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!currentList.some(item => item.toLowerCase() === name.toLowerCase())) {
            const updatedList = [...currentList, name];
            setSessionData(prev => ({ ...prev, labTests: updatedList.join(', ') }));
        }
        setLabSearch('');
    };

    const handleRemoveLabTest = (testNameToRemove) => {
        const updated = (sessionData.labTests || '')
            .split(',')
            .map(s => s.trim())
            .filter(s => s && s.toLowerCase() !== testNameToRemove.toLowerCase())
            .join(', ');
        setSessionData(prev => ({ ...prev, labTests: updated }));
    };

    // Patient Intake Profile (Left Panel - Editable by Doctor)
    const [intakeData, setIntakeData] = useState({});

    // Follow-up status for Patient
    const [currentFollowupStatus, setCurrentFollowupStatus] = useState(null);

    const diagnosisInputRef = useRef(null);
    const notesTextareaRef = useRef(null);

    // Tab Scrolling Reference
    const tabsRef = useRef(null);

    // Merged Library from Master Defaults + Dynamic DB Question Library
    const mergedLibrary = useMemo(() => {
        const base = { ...MASTER_DEFAULT_QUESTION_LIBRARY };
        if (dynamicLibrary && typeof dynamicLibrary === 'object') {
            Object.keys(dynamicLibrary).forEach(dept => {
                if (dynamicLibrary[dept] && typeof dynamicLibrary[dept] === 'object' && Object.keys(dynamicLibrary[dept]).length > 0) {
                    base[dept] = {
                        ...(base[dept] || {}),
                        ...dynamicLibrary[dept]
                    };
                }
            });
        }
        return base;
    }, [dynamicLibrary]);

    const availableDepts = useMemo(() => Object.keys(mergedLibrary), [mergedLibrary]);

    const docDept = user?.department || user?._roleData?.department || user?.specialty || user?.specialization || '';
    const apptDept = appointment?.department || appointment?.serviceName || appointment?.doctorDepartment || '';
    const patientDept = appointment?.clinicPatientId?.department || appointment?.userId?.department || intakeData?.department || '';
    const asstDept = assistantPrep?.department || '';

    const detectedDept = useMemo(() => {
        return resolveDepartmentKey([selectedDeptOverride, apptDept, docDept, asstDept, patientDept], availableDepts);
    }, [selectedDeptOverride, apptDept, docDept, asstDept, patientDept, availableDepts]);

    const activeDeptKey = selectedDeptOverride || detectedDept || 'General Medicine';

    // Dynamic Form Tabs for the active department
    const dynamicTabs = useMemo(() => {
        const dTabs = [];
        if (activeDeptKey && mergedLibrary[activeDeptKey]) {
            const deptObj = mergedLibrary[activeDeptKey];
            if (typeof deptObj === 'object') {
                Object.keys(deptObj).forEach((catKey, i) => {
                    const qData = deptObj[catKey];
                    if (Array.isArray(qData) && qData.length > 0) {
                        dTabs.push({
                            id: `dyn_${activeDeptKey.replace(/[^a-zA-Z0-9]/g, '')}_${i}`,
                            label: `${activeDeptKey}: ${catKey}`,
                            shortLabel: catKey,
                            categoryName: catKey,
                            deptName: activeDeptKey,
                            icon: DEPARTMENT_ICONS[activeDeptKey] || '📋',
                            theme: 'purple',
                            data: qData
                        });
                    }
                });
            }
        }
        return dTabs;
    }, [activeDeptKey, mergedLibrary]);

    const allTabs = useMemo(() => [
        { id: 'session', label: 'Doctor Consultation', icon: '🩺', theme: 'blue' },
        { id: 'surgery', label: 'Operation & Surgery Plan', icon: '🏥', theme: 'orange' },
        { id: 'history', label: 'Vitals & History', icon: '📊', theme: 'emerald' },
        ...dynamicTabs,
        { id: 'assistant_intake', label: 'Assistant Intake & Q&A', icon: '📝', theme: 'amber' },
        { id: 'reports', label: 'Reports & Files', icon: '📁', theme: 'rose' },
    ], [dynamicTabs]);

    const handleTabsWheel = (e) => {
        if (tabsRef.current) {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                tabsRef.current.scrollBy({ left: e.deltaY, behavior: 'auto' });
            }
        }
    };

    const scrollTabs = (dir) => {
        if (tabsRef.current) {
            tabsRef.current.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
        }
    };

    // Add non-passive event listener for proper wheel interception without console errors
    useEffect(() => {
        const el = tabsRef.current;
        if (el) {
            el.addEventListener('wheel', handleTabsWheel, { passive: false });
        }
        return () => {
            if (el) el.removeEventListener('wheel', handleTabsWheel);
        };
    }, []);

    const [refreshing, setRefreshing] = useState(false);

    const fetchDetails = async (isManualRefresh = false) => {
        if (isManualRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        try {
            let currentApptId = appointmentId || location.state?.appointmentId;
            let refObj = location.state?.referral || null;

            // 1. If referralId is passed, fetch referral data
            if (location.state?.referralId && !refObj) {
                try {
                    const refRes = await referralAPI.getById(location.state.referralId);
                    if (refRes.success && refRes.referral) {
                        refObj = refRes.referral;
                    }
                } catch(e) { console.error("Error fetching referral by ID", e); }
            }

            if (refObj) {
                setActiveReferralForReview(refObj);
                if (!currentApptId && refObj.appointmentId) {
                    currentApptId = typeof refObj.appointmentId === 'object' ? refObj.appointmentId._id : refObj.appointmentId;
                }
                setSurgeryPlanData(prev => ({
                    ...prev,
                    surgery: refObj.reason || prev.surgery,
                    diagnosis: refObj.notes || prev.diagnosis
                }));
            }

            // 2. If no appointmentId yet, search across all appointments in the hospital
            if (!currentApptId && id) {
                try {
                    const apptsRes = await doctorAPI.getAllAppointments().catch(() => null) || await doctorAPI.getAppointments().catch(() => null);
                    if (apptsRes && apptsRes.success) {
                        const ptAppts = (apptsRes.appointments || []).filter(a => 
                            a.userId?.patientId === id || 
                            a.clinicPatientId?.patientUid === id || 
                            a.patientId === id ||
                            (a.userId?._id && a.userId._id.toString() === id.toString()) ||
                            (a.userId?.name || '').replace(/\s+/g, '-') === id ||
                            (a.clinicPatientId?.name || '').replace(/\s+/g, '-') === id ||
                            a._id === id
                        );
                        if (ptAppts.length > 0) {
                            currentApptId = ptAppts[0]._id;
                            setAppointmentId(currentApptId);
                        }
                    }
                } catch(e) { console.error("Error finding appointment", e); }
            }

            // 3. If we have an appointment ID, fetch full appointment details
            if (currentApptId) {
                const res = await doctorAPI.getAppointmentDetails(currentApptId).catch(() => null);
                if (res?.success && res.appointment) {
                    setAppointment(res.appointment);
                    const cp = res.appointment.clinicPatientId || {};
                    const fert = res.appointment.userId?.fertilityProfile || {};
                    setIntakeData({
                        ...cp,
                        ...fert,
                        ...(cp.vitals || {}),
                        age: cp.age || fert.age || res.appointment.userId?.age || '',
                        gender: cp.gender || fert.gender || res.appointment.userId?.gender || '',
                        bloodGroup: cp.bloodGroup || fert.bloodGroup || '',
                        address: cp.address || fert.address || '',
                        allergies: cp.allergies || fert.allergies || '',
                        chronicConditions: cp.chronicConditions || fert.chronicConditions || ''
                    });
                    
                    // Lock if completed
                    if (res.appointment.status === 'completed') {
                        setIsLocked(true);
                        setCustomBannerToast({
                            show: true,
                            title: '✅ Session Completed Successfully',
                            message: 'This consultation has already been completed. This record is now read-only.'
                        });
                        setTimeout(() => {
                            setCustomBannerToast(prev => ({ ...prev, show: false }));
                        }, 3000);
                    }

                    // Load Assistant Preparation if available
                    if (res.assistantPreparation) {
                        setAssistantPrep(res.assistantPreparation);
                    } else if (currentApptId) {
                        try {
                            const prepRes = await assistantAPI.getPreparation(currentApptId);
                            if (prepRes?.success && prepRes.preparation) {
                                setAssistantPrep(prepRes.preparation);
                            }
                        } catch (e) { /* ignore if not present */ }
                    }

                    const pId = res.appointment.clinicPatientId?._id || res.appointment.clinicPatientId || res.appointment.userId?._id;
                    const deptContext = res.appointment.department || res.appointment.serviceName || 'Unassigned';
                    if (pId) {
                        try {
                            const histRes = await doctorAPI.getPatientHistory(pId, deptContext);
                            if (histRes.success) setHistory(histRes.history || histRes.data || []);
                        } catch(e) {}
                        
                        try {
                            const fRes = await receptionAPI.getFollowupStatus(pId, 'auto');
                            if (fRes.success) setCurrentFollowupStatus(fRes);
                        } catch(e) { console.error("Error fetching follow-up", e); }
                    }

                    setSessionData({
                        diagnosis: res.appointment.diagnosis || '',
                        notes: res.appointment.doctorNotes || '',
                        medicines: (res.appointment.pharmacy || []).map(p => ({
                            medicineName: p.medicineName || '',
                            saltName: p.saltName || '',
                            dose: p.frequency || '',
                            days: p.duration || ''
                        })),
                        labTests: (res.appointment.labTests || []).join(', ')
                    });
                    
                    if (res.departments) {
                        setHospitalDepartments(res.departments);
                    }
                }
            } else {
                // 4. Fallback if no appointment is found (e.g. direct referral review or patient MRN)
                const targetPatientId = refObj?.patientId?._id || (typeof refObj?.patientId === 'string' ? refObj.patientId : null) || id;
                if (targetPatientId) {
                    try {
                        const profRes = await doctorAPI.getFullPatientProfile(targetPatientId).catch(() => null) || 
                                        await patientAPI.getPatient(targetPatientId).catch(() => null);
                        if (profRes && (profRes.patient || profRes.user)) {
                            const pt = profRes.patient || profRes.user;
                            const loggedUser = JSON.parse(localStorage.getItem('user') || '{}');
                            const fallbackAppt = {
                                _id: 'session-' + (pt._id || targetPatientId),
                                patientId: pt.patientId || pt.mrn || targetPatientId,
                                userId: pt,
                                doctorName: loggedUser.name || 'Doctor',
                                status: 'in-progress',
                                serviceName: refObj ? 'Surgery Referral Consultation' : 'Doctor Consultation',
                                appointmentDate: new Date(),
                                appointmentTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            };
                            setAppointment(fallbackAppt);

                            const cp = pt.fertilityProfile || {};
                            setIntakeData({
                                ...cp,
                                ...(cp.vitals || {}),
                                age: pt.age || cp.age || '',
                                gender: pt.gender || cp.gender || '',
                                bloodGroup: pt.bloodGroup || cp.bloodGroup || '',
                                address: pt.address || cp.address || '',
                                allergies: pt.allergies || cp.allergies || '',
                                chronicConditions: pt.chronicConditions || cp.chronicConditions || ''
                            });

                            if (profRes.appointments) {
                                setHistory(profRes.appointments);
                            }
                        }
                    } catch(e) { console.error("Error loading fallback profile", e); }
                }
            }

            if (isManualRefresh) {
                toast.success("Patient record refreshed successfully!");
            }
        } catch (err) {
            console.error("Error in fetchDetails:", err);
            if (isManualRefresh) {
                toast.error("Failed to refresh patient details");
            }
        }

        // ALWAYS fetch lab tests, medicines, and dynamic question library without skipping
        try {
            const [testRes, medRes, libRes] = await Promise.allSettled([
                labTestAPI.getLabTests().catch(() => null),
                doctorAPI.getMedicines().catch(() => null),
                questionLibraryAPI.getLibrary().catch(() => null)
            ]);

            if (testRes.status === 'fulfilled' && testRes.value?.success) {
                setCatalogTests(testRes.value.data || []);
            }
            if (medRes.status === 'fulfilled' && medRes.value?.success) {
                setCatalogMedicines(medRes.value.medicines || []);
            }
            if (libRes.status === 'fulfilled' && libRes.value) {
                const rawData = libRes.value.data?.data || libRes.value.data || libRes.value.library?.data || libRes.value.library;
                if (rawData && typeof rawData === 'object' && Object.keys(rawData).length > 0) {
                    setDynamicLibrary(rawData);
                }
            }
        } catch (err) {
            console.error("Error fetching ancillary catalogs:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchDetails();

        // Fetch hospital context for PDF branding
        const fetchHospital = async () => {
            try {
                const res = await hospitalAPI.getMyHospital();
                if (res.success) setHospitalContext(res.hospital);
            } catch (err) { /* ignore */ }
        };
        fetchHospital();

        // Fetch surgeons list
        const fetchSurgeons = async () => {
            try {
                const hospitalId = user?.hospitalId || appointment?.hospitalId || '';
                const res = await publicAPI.getDoctors(null, hospitalId || null);
                let docs = (res.doctors || res.data || []).slice();
                const currentDocId = user?._id || user?.id;
                if (currentDocId && !docs.some(d => (d.userId?._id || d.userId || d._id)?.toString() === currentDocId?.toString())) {
                    docs.push({
                        _id: currentDocId,
                        userId: currentDocId,
                        name: user.name || 'Current Doctor',
                        specialty: user.specialty || ''
                    });
                }
                setSurgeonsList(docs);
            } catch (err) {
                console.error("fetchSurgeons error:", err);
                const currentDocId = user?._id || user?.id;
                if (currentDocId) {
                    setSurgeonsList([{
                        _id: currentDocId,
                        userId: currentDocId,
                        name: user.name || 'Current Doctor',
                        specialty: user.specialty || ''
                    }]);
                }
            }
        };
        fetchSurgeons();
    }, [appointmentId, user, appointment?.hospitalId]);

    const fetchPatientSurgeryPlans = useCallback(async (targetPtId) => {
        try {
            const pid = targetPtId || 
                appointment?.clinicPatientId?._id || 
                appointment?.userId?._id || 
                (typeof appointment?.clinicPatientId === 'string' ? appointment.clinicPatientId : null) || 
                (typeof appointment?.userId === 'string' ? appointment.userId : null) || 
                (typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/) ? id : null) || 
                appointment?.patientId || 
                intakeData?.userId || 
                id;
            if (!pid) return;
            setLoadingSurgeryPlans(true);
            const res = await otAPI.getPatientSurgeryPlans(pid);
            if (res.success) {
                const plans = res.plans || res.surgeries || res.data || [];
                setPatientSurgeryPlans(plans);
                if (plans.length > 0) {
                    setOperationRequired(true);
                }
            }
        } catch (err) {
            console.error('fetchPatientSurgeryPlans error:', err);
        } finally {
            setLoadingSurgeryPlans(false);
        }
    }, [appointment, id, intakeData]);

    useEffect(() => {
        const fetchPatientReferrals = async () => {
            try {
                const pid = appointment?.clinicPatientId?._id || appointment?.userId?._id || appointment?.patientId;
                if (!pid) return;
                const res = await referralAPI.getPatientReferrals(pid);
                if (res.success) setPatientReferrals(res.referrals || []);
            } catch (err) { /* ignore */ }
        };
        if (appointment) {
            fetchPatientReferrals();
            fetchPatientSurgeryPlans();
        }
    }, [appointment, fetchPatientSurgeryPlans]);

    const handleIntakeChange = (e) => {
        const { name, value } = e.target;
        // Handle BMI calculation
        if (name === 'height' || name === 'weight') {
            const h = name === 'height' ? value : intakeData.height;
            const w = name === 'weight' ? value : intakeData.weight;
            if (h && w) {
                const hM = parseFloat(h) / 100;
                const bmi = (parseFloat(w) / (hM * hM)).toFixed(2);
                setIntakeData(prev => ({ ...prev, [name]: value, bmi }));
                return;
            }
        }
        setIntakeData(prev => ({ ...prev, [name]: value }));
    };

    const handleSessionChange = (e) => {
        if (isLocked) return;
        setSessionData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleCreateReferral = async (e) => {
        e.preventDefault();
        try {
            const dataToSubmit = {
                patientId: appointment?.userId?._id || appointment?.patientId || intakeData?.userId,
                appointmentId: appointment?._id,
                referredToDoctorId: referralData.referredToDoctorId,
                reason: referralData.reason,
                notes: referralData.notes
            };
            const res = await referralAPI.create(dataToSubmit);
            if (res.success) {
                toast.success('Referral created successfully!');
                setShowReferralModal(false);
                setReferralData({ referredToDoctorId: '', reason: '', notes: '' });
                // Refresh referrals list
                const pid = appointment?.userId?._id || appointment?.patientId;
                if (pid) {
                    const refRes = await referralAPI.getPatientReferrals(pid);
                    if (refRes.success) setPatientReferrals(refRes.referrals || []);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error creating referral');
        }
    };

    const handleReviewReferral = async (referralId, status, reviewNotes) => {
        try {
            const res = await referralAPI.review(referralId, { status, reviewNotes });
            if (res.success) {
                toast.success(`Referral ${status.toLowerCase()} successfully!`);
                setShowReferralReviewModal(false);
                setActiveReferralForReview(null);
                // Refresh
                const pid = appointment?.userId?._id || appointment?.patientId;
                if (pid) {
                    const refRes = await referralAPI.getPatientReferrals(pid);
                    if (refRes.success) setPatientReferrals(refRes.referrals || []);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error reviewing referral');
        }
    };

    const openCreateSurgeryModal = () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const defaultDate = tomorrow.toISOString().split('T')[0];
        
        setSurgeryPlanData(prev => ({
            ...prev,
            diagnosis: sessionData.diagnosis || prev.diagnosis || '',
            surgeonId: prev.surgeonId || user?._id || user?.id || '',
            preferredDate: prev.preferredDate || defaultDate,
            preferredTime: prev.preferredTime || '10:00'
        }));
        setShowSurgeryPlanModal(true);
    };

    const handleCancelSurgeryPlan = async (planId) => {
        if (!(await confirmToast('Are you sure you want to cancel this surgery plan?', { title: 'Cancel Surgery Plan' }))) return;
        try {
            const res = await otAPI.cancelSurgery(planId);
            if (res.success) {
                toast.success('Surgery plan cancelled');
                fetchPatientSurgeryPlans();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error cancelling surgery plan');
        }
    };

    const handleCreateSurgeryPlan = async (e) => {
        e.preventDefault();
        try {
            const resolvedPtId = appointment?.userId?._id || 
                appointment?.clinicPatientId?._id || 
                (typeof appointment?.clinicPatientId === 'string' ? appointment.clinicPatientId : null) || 
                (typeof appointment?.userId === 'string' ? appointment.userId : null) || 
                (typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/) ? id : null) || 
                appointment?.patientId || 
                intakeData?.userId || 
                id;

            const resolvedSurgeonId = (typeof surgeryPlanData.surgeonId === 'object' && surgeryPlanData.surgeonId?._id)
                ? surgeryPlanData.surgeonId._id
                : (surgeryPlanData.surgeonId || user?._id);

            const dataToSubmit = {
                ...surgeryPlanData,
                surgeonId: resolvedSurgeonId,
                patientId: resolvedPtId,
                appointmentId: appointment?._id,
                referralId: surgeryPlanData.referralId || undefined,
                referringDoctorId: surgeryPlanData.referringDoctorId || undefined
            };
            const res = await otAPI.createSurgeryPlan(dataToSubmit);
            if(res.success) {
                toast.success('Surgery Plan created & pushed to OT Dashboard!');
                setShowSurgeryPlanModal(false);
                setOperationRequired(true);
                fetchPatientSurgeryPlans(resolvedPtId);
                // Reset form
                setSurgeryPlanData({
                    surgery: '', diagnosis: '', surgeonId: '', preferredDate: '', preferredTime: '', admissionRequired: false, admissionDate: '', preOpRequired: false, notes: ''
                });
            }
        } catch(err) {
            toast.error(err.response?.data?.message || 'Error creating surgery plan');
        }
    };

    // Assistant Intake Handlers
    const handleAcceptVitals = () => {
        if (!assistantPrep?.vitals) return;
        const v = assistantPrep.vitals;
        setIntakeData(prev => ({
            ...prev,
            height: v.height || prev.height,
            weight: v.weight || prev.weight,
            bmi: v.bmi || prev.bmi,
            bp: v.bp || prev.bp,
            pulse: v.pulse || prev.pulse,
            temperature: v.temperature || prev.temperature,
            spo2: v.spo2 || prev.spo2,
            rr: v.rr || prev.rr,
            bloodSugar: v.bloodSugar || prev.bloodSugar,
            painScore: v.painScore || prev.painScore,
            vitals: {
                ...(prev.vitals || {}),
                height: v.height || prev.vitals?.height,
                weight: v.weight || prev.vitals?.weight,
                bmi: v.bmi || prev.vitals?.bmi,
                bloodPressure: v.bp || prev.vitals?.bloodPressure || prev.vitals?.bp,
                pulse: v.pulse || prev.vitals?.pulse,
                temperature: v.temperature || prev.vitals?.temperature,
                spo2: v.spo2 || prev.vitals?.spo2,
                respiratoryRate: v.rr || prev.vitals?.respiratoryRate || prev.vitals?.rr,
                bloodSugar: v.bloodSugar || prev.vitals?.bloodSugar,
                painScale: v.painScore || prev.vitals?.painScale
            }
        }));
        toast.success("Assistant vitals accepted into current session!");
    };

    const handleImportNotes = () => {
        const noteContent = assistantPrep?.draftClinicalNotes || assistantPrep?.draftNotes;
        if (!noteContent) return;
        setSessionData(prev => {
            const current = (prev.notes || '').trim();
            const formattedDraft = `\n\n--- Assistant Pre-Consultation Notes (${assistantPrep.preparedBy?.name || 'Assistant'}) ---\n${noteContent}`;
            return {
                ...prev,
                notes: current ? `${current}${formattedDraft}` : formattedDraft.trim()
            };
        });
        toast.success("Assistant draft notes imported to clinical notes!");
    };

    const handleAddSuggestedInvestigations = () => {
        const suggestions = (assistantPrep?.investigationSuggestions && assistantPrep.investigationSuggestions.length > 0)
            ? assistantPrep.investigationSuggestions
            : (assistantPrep?.suggestedInvestigations || []);
        if (suggestions.length === 0) return;
        
        const testNames = suggestions.map(s => typeof s === 'string' ? s : s.testName).filter(Boolean);
        setSessionData(prev => {
            const currentTests = (prev.labTests || '').split(',').map(t => t.trim()).filter(Boolean);
            const combined = Array.from(new Set([...currentTests, ...testNames]));
            return {
                ...prev,
                labTests: combined.join(', ')
            };
        });
        toast.success(`Added ${testNames.length} assistant suggested test(s) to orders!`);
    };

    const handleImportAllIntakeToNotes = () => {
        if (!assistantPrep) return;
        const lines = [];
        lines.push(`--- Assistant Clinical Intake & Questionnaire (${assistantPrep.preparedBy?.name || 'Doctor Assistant'}) ---`);
        
        const h = assistantPrep.preparation || {};
        if (h.chiefComplaint) lines.push(`• Chief Complaint: ${h.chiefComplaint}`);
        if (h.historyOfPresentIllness) lines.push(`• HPI: ${h.historyOfPresentIllness}`);
        if (h.allergies) lines.push(`• Allergies: ${h.allergies}`);
        if (h.currentMedicines) lines.push(`• Current Meds: ${h.currentMedicines}`);
        if (h.pastMedicalHistory) lines.push(`• Past Medical History: ${h.pastMedicalHistory}`);
        if (h.pastSurgicalHistory) lines.push(`• Past Surgical History: ${h.pastSurgicalHistory}`);
        if (h.familyHistory) lines.push(`• Family History: ${h.familyHistory}`);
        if (h.lifestyle) lines.push(`• Lifestyle: ${h.lifestyle}`);
        if (h.assistantRemarks) lines.push(`• Assistant Remarks: ${h.assistantRemarks}`);

        // Questionnaire Answers
        const qAnswers = assistantPrep.questionnaireAnswers || {};
        const qEntries = Object.entries(qAnswers);
        if (qEntries.length > 0) {
            lines.push(`\nDepartment Questionnaire Responses:`);
            qEntries.forEach(([q, ans]) => {
                const ansStr = Array.isArray(ans) ? ans.join(', ') : (typeof ans === 'object' ? JSON.stringify(ans) : String(ans));
                if (ansStr && ansStr.trim()) {
                    lines.push(`- ${q}: ${ansStr}`);
                }
            });
        }

        const draft = assistantPrep.draftClinicalNotes || assistantPrep.draftNotes;
        if (draft) {
            lines.push(`\nDraft Notes: ${draft}`);
        }

        const formattedIntake = lines.join('\n');
        setSessionData(prev => {
            const current = (prev.notes || '').trim();
            return {
                ...prev,
                notes: current ? `${current}\n\n${formattedIntake}` : formattedIntake
            };
        });
        toast.success("Full clinical intake & questionnaire responses imported to notes!");
    };

    const handleSaveProfile = async () => {
        const patientId = appointment?.clinicPatientId?._id || appointment?.userId?._id;
        if (!patientId) return;
        setSaving(true);
        try {
            await doctorAPI.updatePatientProfile(patientId, intakeData);
            toast.success("Patient profile saved successfully!");
        } catch (err) {
            toast.error("Error saving profile: " + (err.response?.data?.message || err.message));
        } finally { setSaving(false); }
    };

    const handleSaveAndMerge = async () => {
        if (!(await confirmToast("Save all changes and finish session?", { title: "Finish Consultation", danger: false, confirmText: "Save & Finish" }))) return;
        setSaving(true);
        try {
            // 1. Save Profile
            const patientId = appointment?.clinicPatientId?._id || appointment?.userId?._id;
            if (patientId) {
                await doctorAPI.updatePatientProfile(patientId, intakeData);
            }

            // 2. Save Session
            const payload = {
                status: 'completed',
                diagnosis: sessionData.diagnosis,
                notes: sessionData.notes,
                labTests: sessionData.labTests.split(',').map(s => s.trim()).filter(Boolean),
                pharmacy: (sessionData.medicines || []).filter(m => m.medicineName?.trim()).map(m => ({
                    medicineName: m.medicineName?.trim() || '',
                    saltName: m.saltName?.trim() || '',
                    frequency: m.dose?.trim() || '',
                    duration: m.days?.trim() || ''
                }))
            };
            await doctorAPI.updateSession(appointmentId, payload);

            // Immediately lock UI and update appointment status locally
            setIsLocked(true);

            // Transition check to Reception
            if (await confirmToast("Consultation Completed. Do you want to transition to the Reception Desk to Admit/Hospitalize this patient?", { title: "Admit Patient?", danger: false, confirmText: "Go to Reception", cancelText: "Stay Here" })) {
                const patientData = appointment?.userId || appointment?.clinicPatientId || appointment;
                navigate('/reception/dashboard?view=intake', { state: { patient: patientData } });
                return;
            } else {
                toast.success("Consultation completed successfully!");
            }

            setAppointment(prev => ({
                ...prev,
                status: 'completed',
                diagnosis: sessionData.diagnosis,
                doctorNotes: sessionData.notes,
                labTests: payload.labTests,
                pharmacy: payload.pharmacy,
                vitals: {
                    ...prev?.vitals,
                    weight: intakeData.weight || prev?.vitals?.weight || '',
                    height: intakeData.height || prev?.vitals?.height || '',
                    bmi: intakeData.bmi || prev?.vitals?.bmi || '',
                    bp: intakeData.historyBp || intakeData.bp || intakeData.bloodPressure || prev?.vitals?.bp || '',
                    pulse: intakeData.historyPulse || intakeData.pulse || intakeData.pulseRate || prev?.vitals?.pulse || '',
                    temperature: intakeData.temperature || intakeData.temp || prev?.vitals?.temperature || '',
                    spo2: intakeData.spo2 || prev?.vitals?.spo2 || '',
                    rr: intakeData.respiratoryRate || intakeData.rr || prev?.vitals?.rr || ''
                }
            }));

            // 3. Generate & download official Prescription PDF with toast notification
            generatePrescriptionPDF(true);
            toast.success("Official Prescription PDF downloaded successfully!", { duration: 3000 });
        } catch (err) {
            toast.error("Error: " + (err.response?.data?.message || err.message));
        } finally { setSaving(false); }
    };

    const generateCumulativePDF = (intake, pastHistory, currentData) => {
        const doc = new jsPDF();
        let y = 20;

        doc.setFontSize(22);
        doc.setTextColor(41, 128, 185);
        doc.text(hospitalContext?.name || "HOSPITAL", 105, y, { align: 'center' });
        y += 10;
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(hospitalContext?.tagline || "Excellence in Healthcare", 105, y, { align: 'center' });
        y += 15;

        doc.setLineWidth(0.5);
        doc.setDrawColor(200);
        doc.line(10, y, 200, y);
        y += 10;

        doc.setFontSize(18);
        doc.setTextColor(0);
        doc.text("CLINICAL RECORD / PRESCRIPTION", 105, y, { align: 'center' }); y += 15;

        doc.setFillColor(240, 240, 240); doc.rect(14, y, 182, 42, 'F');
        doc.setFontSize(11);

        const cardX = 20;
        let cardY = y + 8;

        doc.setFont("helvetica", "bold");
        doc.text(`Patient Name:`, cardX, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${intake.firstName || appointment.userId?.name || ''} ${intake.lastName || ''}`, cardX + 30, cardY);

        doc.setFont("helvetica", "bold");
        doc.text(`MRN / ID:`, cardX + 100, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${appointment.userId?.patientId || 'N/A'}`, cardX + 130, cardY);

        cardY += 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Age / Gender:`, cardX, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${intake.age || '-'} / ${intake.gender || '-'}`, cardX + 30, cardY);

        doc.setFont("helvetica", "bold");
        doc.text(`Date:`, cardX + 100, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${new Date().toLocaleDateString()}`, cardX + 130, cardY);

        cardY += 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Contact:`, cardX, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${appointment.userId?.phone || '-'}`, cardX + 30, cardY);

        // Doctor Name
        doc.setFont("helvetica", "bold");
        doc.text(`Doctor:`, cardX + 100, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`Dr. ${appointment.doctorName || user?.name || '-'}`, cardX + 130, cardY);

        y += 50;

        // Iterate over dynamic intake data
        const dynamicEntries = Object.entries(intake).filter(([key, val]) => 
            key !== '_id' && key !== 'createdAt' && key !== 'updatedAt' && key !== '__v' 
            && typeof val !== 'object' && val !== ''
        ).map(([key, val]) => [key, String(val)]);

        if (dynamicEntries.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['Clinical Questionnaire', 'Response']],
                body: dynamicEntries,
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                columnStyles: { 0: { fontStyle: 'bold', width: 80 } }
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        if (pastHistory.length > 0) {
            doc.setFillColor(220, 240, 255); doc.rect(14, y, 180, 8, 'F');
            doc.text("PAST SESSIONS", 16, y + 6); y += 12;
            const rows = pastHistory.filter(h => h.status === 'completed' && h._id !== appointmentId).map(h => [
                new Date(h.appointmentDate).toLocaleDateString(), h.diagnosis || '-', h.doctorNotes || '-'
            ]);
            if (rows.length > 0) {
                autoTable(doc, { startY: y, head: [['Date', 'Diagnosis', 'Notes']], body: rows });
                y = doc.lastAutoTable.finalY + 10;
            }
        }

        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFillColor(200, 255, 200); doc.rect(14, y, 180, 8, 'F');
        doc.text(`CURRENT SESSION: ${new Date().toLocaleDateString()}`, 16, y + 6); y += 12;

        doc.setFontSize(10);
        doc.text(`Diagnosis: ${currentData.diagnosis}`, 16, y); y += 10;
        doc.text("Notes:", 16, y); y += 6;
        const notes = doc.splitTextToSize(currentData.notes, 170);
        doc.text(notes, 16, y); y += (notes.length * 5) + 10;

        // Medicines
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        doc.text("Prescription / Medicines:", 16, y); y += 8;
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        const rxItems = (currentData.pharmacy || []);
        if (rxItems.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['#', 'Medicine Name', 'Salt / Generic', 'Dose / Frequency', 'Days']],
                body: rxItems.map((p, i) => [i + 1, p.medicineName, p.saltName || '-', p.frequency || '-', p.duration || '-']),
                theme: 'striped',
                headStyles: { fillColor: [76, 175, 80], textColor: 255 },
                columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 2: { cellWidth: 45 }, 3: { cellWidth: 40 }, 4: { cellWidth: 20 } },
            });
            y = doc.lastAutoTable.finalY + 10;
        } else {
            doc.text('No medicines prescribed.', 16, y); y += 8;
        }

        // Lab Tests
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        doc.text("Lab Tests Ordered:", 16, y); y += 8;
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        const labItems = (currentData.labTests || []);
        if (labItems.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['#', 'Test Name']],
                body: labItems.map((t, i) => [i + 1, t]),
                theme: 'striped',
                headStyles: { fillColor: [33, 150, 243], textColor: 255 },
            });
            y = doc.lastAutoTable.finalY + 10;
        } else {
            doc.text('No lab tests ordered.', 16, y); y += 8;
        }

        // Footer
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setDrawColor(200); doc.line(14, y, 196, y); y += 10;
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Doctor: Dr. ${appointment.doctorName || user?.name || 'N/A'}`, 16, y);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 130, y);

        doc.save("Patient_Record.pdf");
    };

    // ─── STANDALONE PRESCRIPTION PDF ─────────────────────────────────────────
    const generatePrescriptionPDF = (shouldSave = true) => {
        const pt = patient;
        const prof = profile;
        const doc = new jsPDF();
        const hName = hospitalContext?.name || 'HOSPITAL';
        const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
        const hPhone = hospitalContext?.phone || '';
        let y = 18;

        // Header
        doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
        doc.text(hName, 105, y, { align: 'center' }); y += 7;
        if (hAddr) {
            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
            doc.text(hAddr, 105, y, { align: 'center' }); y += 5;
        }
        if (hPhone) { doc.text(`Ph: ${hPhone}`, 105, y, { align: 'center' }); y += 5; }
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(76, 175, 80);
        doc.text('PRESCRIPTION SLIP', 105, y, { align: 'center' }); y += 5;
        doc.setDrawColor(76, 175, 80); doc.setLineWidth(0.5);
        doc.line(14, y, 196, y); y += 8;
        doc.setTextColor(0); doc.setFont('helvetica', 'normal');

        // Patient Info
        autoTable(doc, {
            startY: y,
            body: [
                ['Patient', pt.name || '-', 'MRN', pt.patientId || 'N/A'],
                ['Age / Gender', `${profile?.age || '-'} / ${profile?.gender || '-'}`, 'Phone', pt.phone || '-'],
                ['Doctor', `Dr. ${appointment?.doctorName || user?.name || '-'}`, 'Date', new Date().toLocaleDateString('en-IN')],
                ['Diagnosis', appointment?.diagnosis || sessionData.diagnosis || '-', '', ''],
            ],
            theme: 'grid',
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 38 },
                2: { fontStyle: 'bold', cellWidth: 28 },
            },
            bodyStyles: { fontSize: 10 },
        });
        y = doc.lastAutoTable.finalY + 10;

        // Medicines
        const rxItems = sessionData.medicines?.length > 0
            ? sessionData.medicines.filter(m => m.medicineName?.trim())
            : (appointment?.pharmacy || []).map(p => ({ medicineName: p.medicineName, saltName: p.saltName || '', dose: p.frequency || '', days: p.duration || '' }));

        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
        doc.text('Medicines Prescribed', 14, y); y += 6;
        if (rxItems.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['#', 'Medicine Name', 'Salt / Generic', 'Dose / Frequency', 'Days']],
                body: rxItems.map((m, i) => [i + 1, m.medicineName || '-', m.saltName || '-', m.dose || '-', m.days || '-']),
                theme: 'striped',
                headStyles: { fillColor: [76, 175, 80], textColor: 255 },
                bodyStyles: { fontSize: 10 },
                columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 2: { cellWidth: 50 }, 3: { cellWidth: 40 }, 4: { cellWidth: 20 } },
            });
            y = doc.lastAutoTable.finalY + 10;
        } else {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
            doc.text('No medicines prescribed.', 16, y); y += 8;
        }

        // Lab Tests
        const labItems = sessionData.labTests
            ? sessionData.labTests.split(',').map(t => t.trim()).filter(Boolean)
            : (appointment?.labTests || []);

        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
        doc.text('Lab Tests Ordered', 14, y); y += 6;
        if (labItems.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['#', 'Test Name']],
                body: labItems.map((t, i) => [i + 1, t]),
                theme: 'striped',
                headStyles: { fillColor: [33, 150, 243], textColor: 255 },
                bodyStyles: { fontSize: 10 },
            });
            y = doc.lastAutoTable.finalY + 10;
        } else {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
            doc.text('No lab tests ordered.', 16, y); y += 8;
        }

        // Notes
        if (sessionData.notes || appointment?.doctorNotes) {
            const notesText = sessionData.notes || appointment?.doctorNotes || '';
            if (y > 250) { doc.addPage(); y = 20; }
            doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
            doc.text('Clinical Notes', 14, y); y += 6;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60);
            const wrapped = doc.splitTextToSize(notesText, 170);
            doc.text(wrapped, 16, y); y += wrapped.length * 5 + 8;
        }

        // Footer
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Doctor: Dr. ${appointment?.doctorName || user?.name || 'N/A'}`, 14, y);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
        y += 5;
        doc.setFontSize(8);
        doc.text('This prescription is valid for 30 days from the date of issue.', 105, y, { align: 'center' });

        const filename = `Prescription_${pt.patientId || 'Patient'}_${new Date().toISOString().split('T')[0]}.pdf`;
        if (shouldSave) {
            doc.save(filename);
        }
        return { doc, filename };
    };

    // ─── CONSULTATION RECEIPT PDF ─────────────────────────────────────────────
    const generateReceiptPDF = () => {
        const pt = patient;
        const doc = new jsPDF();
        const hName = hospitalContext?.name || 'HOSPITAL';
        const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
        const hPhone = hospitalContext?.phone || '';
        const hEmail = hospitalContext?.email || '';
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
        doc.text('Consultation & Clinical Receipt', 105, y, { align: 'center' }); y += 5;
        doc.setDrawColor(41, 128, 185); doc.setLineWidth(0.5);
        doc.line(14, y, 196, y); y += 8;
        doc.setTextColor(0); doc.setFont('helvetica', 'normal');

        const dateDisplay = new Date(appointment?.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        autoTable(doc, {
            startY: y,
            body: [
                ['Patient Name', pt.name || '-', 'MRN / ID', pt.patientId || 'N/A'],
                ['Phone', pt.phone || '-', 'Date & Time', `${dateDisplay} @ ${appointment?.appointmentTime || '-'}`],
                ['Consulting Doctor', `Dr. ${appointment?.doctorName || user?.name || '-'}`, 'Department', appointment?.department || activeDeptKey || 'General'],
                ['Service', appointment?.serviceName || 'Consultation', 'Consultation Fee', `Rs. ${Number(appointment?.amount || 0).toLocaleString('en-IN')}`],
                ['Payment Method', appointment?.paymentMethod || 'Cash', 'Payment Status', (appointment?.paymentStatus || 'Paid').toUpperCase() + ' \u2713'],
            ],
            theme: 'grid',
            columnStyles: { 
                0: { fontStyle: 'bold', cellWidth: 42 },
                2: { fontStyle: 'bold', cellWidth: 42 }
            },
            bodyStyles: { fontSize: 9.5 },
            alternateRowStyles: { fillColor: [245, 249, 255] },
        });

        y = doc.lastAutoTable.finalY + 8;

        // Clinical Diagnosis & Notes in Receipt
        const diagText = sessionData.diagnosis || appointment?.diagnosis || '';
        const notesText = sessionData.notes || appointment?.doctorNotes || '';

        if (diagText || notesText) {
            if (y > 220) { doc.addPage(); y = 20; }
            doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
            doc.text("Clinical Assessment & Doctor Notes", 14, y); y += 6;

            const clinicalRows = [];
            if (diagText) clinicalRows.push(['Primary Diagnosis', diagText]);
            if (notesText) clinicalRows.push(['Doctor Notes & Advice', notesText]);

            autoTable(doc, {
                startY: y,
                body: clinicalRows,
                theme: 'grid',
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 } },
                bodyStyles: { fontSize: 9, cellPadding: 4 },
                alternateRowStyles: { fillColor: [250, 250, 250] }
            });
            y = doc.lastAutoTable.finalY + 8;
        }

        // Prescriptions Summary in Receipt (if prescribed)
        const rxItems = sessionData.medicines?.length > 0
            ? sessionData.medicines.filter(m => m.medicineName?.trim())
            : (appointment?.pharmacy || []).filter(p => p.medicineName?.trim());

        if (rxItems.length > 0) {
            if (y > 230) { doc.addPage(); y = 20; }
            doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
            doc.text("Prescribed Medicines Summary", 14, y); y += 6;

            autoTable(doc, {
                startY: y,
                head: [['#', 'Medicine Name', 'Dosage / Timing', 'Duration']],
                body: rxItems.map((m, i) => [i + 1, m.medicineName || '-', `${m.dose || m.frequency || '-'} (${m.saltName || 'As directed'})`, m.days || m.duration || '-']),
                theme: 'striped',
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                bodyStyles: { fontSize: 9 },
                columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 70 }, 2: { cellWidth: 70 }, 3: { cellWidth: 32 } }
            });
            y = doc.lastAutoTable.finalY + 8;
        }

        // Lab tests Summary in Receipt (if ordered)
        const labItems = sessionData.labTests
            ? sessionData.labTests.split(',').map(t => t.trim()).filter(Boolean)
            : (appointment?.labTests || []);

        if (labItems.length > 0) {
            if (y > 240) { doc.addPage(); y = 20; }
            doc.setFontSize(10.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
            doc.text("Ordered Diagnostic Tests: " + labItems.join(', '), 14, y);
            y += 8;
        }

        // Footer
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
        doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Attending Physician: Dr. ${appointment?.doctorName || user?.name || 'N/A'}`, 14, y);
        doc.text(`Receipt Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
        y += 5;
        doc.text(`Thank you for choosing ${hName}`, 105, y, { align: 'center' });

        doc.save(`Receipt_${pt.patientId || 'Patient'}.pdf`);
    };

    if (loading) {
        return (
            <div className="dpd-loading">
                <div className="dpd-spinner"></div>
                <p>Loading patient data...</p>
            </div>
        );
    }

    if (!appointment) {
        return (
            <div className="dpd-loading">
                <p>❌ Appointment not found.</p>
                <button onClick={() => navigate('/doctor/patients')} className="dpd-back-btn">← Back to Dashboard</button>
            </div>
        );
    }

    const rawPatient = appointment.userId || {};
    const clinicPatient = appointment.clinicPatientId || {};
    
    // Compute age from dob if not explicitly given
    let calculatedAge = '';
    const dobVal = clinicPatient.dob || rawPatient.dob;
    if (dobVal) {
        const ageDifMs = Date.now() - new Date(dobVal).getTime();
        const ageDate = new Date(ageDifMs);
        calculatedAge = Math.abs(ageDate.getUTCFullYear() - 1970).toString();
    }
    
    const patient = {
        ...rawPatient,
        name: clinicPatient.name || rawPatient.name || 'Unknown Patient',
        patientId: clinicPatient.patientUid || rawPatient.patientId || 'N/A',
        phone: clinicPatient.phone || rawPatient.phone || '-',
        email: clinicPatient.email || rawPatient.email || '-',
        address: clinicPatient.address || rawPatient.address || '-',
    };

    const rawProfile = rawPatient.fertilityProfile || intakeData || {};
    const profile = {
        ...rawProfile,
        age: clinicPatient.age || calculatedAge || rawProfile.age || '-',
        gender: clinicPatient.gender || rawProfile.gender || '-',
        bloodGroup: clinicPatient.bloodGroup || rawProfile.bloodGroup || '-',
        height: clinicPatient.vitals?.height || clinicPatient.height || rawProfile.height || '-',
        weight: clinicPatient.vitals?.weight || clinicPatient.weight || rawProfile.weight || '-',
        bmi: clinicPatient.vitals?.bmi || clinicPatient.bmi || rawProfile.bmi || '-',
        chiefComplaint: clinicPatient.chiefComplaint || rawProfile.chiefComplaint || '-',
        reasonForVisit: clinicPatient.reasonForVisit || rawProfile.reasonForVisit || '-',
        partnerFirstName: clinicPatient.partnerFirstName || rawProfile.partnerFirstName || '',
        partnerLastName: clinicPatient.partnerLastName || rawProfile.partnerLastName || '',
        partnerMobile: clinicPatient.partnerMobile || rawProfile.partnerMobile || '',
        partnerAge: clinicPatient.partnerAge || rawProfile.partnerAge || rawProfile.husbandAge || '',
        partnerBloodGroup: clinicPatient.partnerBloodGroup || rawProfile.partnerBloodGroup || '',
        allergies: clinicPatient.allergies || rawProfile.allergies || '-',
        chronicConditions: clinicPatient.chronicConditions || rawProfile.chronicConditions || '-'
    };



    const doctorName = user?.name || user?.fullName || 'Doctor';
    const doctorDisplayName = doctorName.toLowerCase().startsWith('dr') ? doctorName : `Dr. ${doctorName}`;
    const doctorInitials = doctorName
        .replace(/^dr\.?\s+/i, '')
        .split(' ')
        .filter(Boolean)
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'DR';

    return (
        <div className="dpd-page-wrapper">


            {/* ====== TOP PATIENT SUMMARY BANNER ====== */}
            <div className="dpd-patient-banner">
                <div className="dpd-patient-banner-left">
                    <div className="dpd-patient-avatar-large">
                        {(patient.name || 'P')[0].toUpperCase()}
                    </div>
                    <div className="dpd-patient-main-info">
                        <div className="dpd-patient-name-row">
                            <h2 className="dpd-patient-name-text">{patient.name || 'Unknown Patient'}</h2>
                            <span className={`dpd-clean-status-pill status-${appointment?.status || 'confirmed'}`}>
                                {appointment?.status || 'Confirmed'} {isLocked && '🔒'}
                            </span>
                            {patientReferrals?.length > 0 && (
                                <span className="dpd-ref-pill">
                                    🔄 Referral ({patientReferrals.length})
                                </span>
                            )}
                        </div>
                        <div className="dpd-patient-subtags">
                            <span className="dpd-tag-chip">
                                <strong>Age:</strong> {profile.age || intakeData.age || '-'}
                            </span>
                            <span className="dpd-tag-chip">
                                <strong>Gender:</strong> <span style={{ color: (profile.gender || intakeData.gender) === 'Female' ? '#db2777' : '#2563eb' }}>{profile.gender || intakeData.gender || '-'}</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Banner Action Buttons */}
                <div className="dpd-patient-banner-actions">
                    <button 
                        type="button" 
                        className="dpd-banner-btn-secondary dpd-banner-refresh-btn" 
                        onClick={() => fetchDetails(true)} 
                        disabled={refreshing || loading}
                        title="Refresh Patient Details & Vitals"
                    >
                        <FiRefreshCw className={refreshing ? 'dpd-spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>

                    {!isLocked ? (
                        <>
                            <button 
                                type="button" 
                                className="dpd-banner-btn-secondary" 
                                onClick={() => navigate('/doctor/patients')} 
                                title="Back to Patients Queue"
                            >
                                <FiArrowLeft /> Back
                            </button>
                            <button 
                                type="button" 
                                className="dpd-banner-btn-secondary" 
                                onClick={handleSaveProfile} 
                                disabled={saving}
                                title="Save current intake profile"
                            >
                                <FiSave /> {saving ? 'Saving...' : 'Save Draft'}
                            </button>
                            <button 
                                type="button" 
                                className="dpd-banner-btn-primary" 
                                onClick={handleSaveAndMerge} 
                                disabled={saving}
                                title="Save consultation & finish session"
                            >
                                <span>✨</span> {saving ? 'Finishing...' : 'Finish Consultation'} <FiArrowRight />
                            </button>
                        </>
                    ) : (
                        <>
                            <button 
                                type="button" 
                                className="dpd-banner-btn-secondary" 
                                onClick={generatePrescriptionPDF}
                                title="Download official prescription PDF"
                            >
                                📥 Download Prescription
                            </button>
                            <button 
                                type="button" 
                                className="dpd-banner-btn-secondary" 
                                onClick={() => navigate('/doctor/patients')} 
                                title="Return to doctor patient queue"
                            >
                                ← Back to Queue
                            </button>
                        </>
                    )}
                </div>
            </div>



            {/* ====== FULL-WIDTH TABS WORKSPACE ====== */}
            <div className="dpd-full-tabs-wrapper">
                {/* Tabs Bar */}
                <div className="dpd-tabs-container">
                    <button className="dpd-tab-scroll-btn" onClick={() => scrollTabs('left')} title="Scroll Left">‹</button>
                    <div className="dpd-tabs-nav" ref={tabsRef}>
                        {allTabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`dpd-tab-btn tab-theme-${tab.theme || 'blue'} ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <span className="dpd-tab-icon">{tab.icon}</span>
                                <span className="dpd-tab-label">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                    <button className="dpd-tab-scroll-btn" onClick={() => scrollTabs('right')} title="Scroll Right">›</button>
                </div>

                {/* Tab Content Panels */}
                <div className="dpd-tab-content full-width">
                    {/* ====== TAB 1: DOCTOR CONSULTATION & RX ====== */}
                    {activeTab === 'session' && (
                        <div className="dpd-tab-panel">
                            {viewingPastSession ? (
                                <div className="dpd-time-machine-banner">
                                    <div className="tm-banner-header">
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '1.2rem', fontWeight: 800 }}>🕰️ Past Session Replay (Read-Only)</h3>
                                                <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>Historic</span>
                                            </div>
                                            <p style={{ margin: '4px 0 0', color: '#3b82f6', fontSize: '13px', fontWeight: 600 }}>
                                                Viewing notes from {new Date(viewingPastSession.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSessionData({
                                                        diagnosis: viewingPastSession.diagnosis || '',
                                                        notes: viewingPastSession.doctorNotes || '',
                                                        medicines: viewingPastSession.pharmacy?.map(p => ({
                                                            medicineName: p.medicineName || '',
                                                            saltName: p.saltName || '',
                                                            dose: p.frequency || '',
                                                            days: p.duration || ''
                                                        })) || [],
                                                        labTests: (viewingPastSession.labTests || []).join(', ')
                                                    });
                                                    setViewingPastSession(null);
                                                    toast.success("Historical data copied into current session editor!");
                                                }}
                                                className="dpd-banner-btn-secondary"
                                            >
                                                📋 Copy to Current Session
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setViewingPastSession(null)}
                                                className="dpd-banner-btn-primary"
                                                style={{ background: '#64748b' }}
                                            >
                                                ✕ Exit Time Machine
                                            </button>
                                        </div>
                                    </div>

                                    <div className="dpd-overview-grid" style={{ marginTop: '16px' }}>
                                        <div className="dpd-ov-card" style={{ gridColumn: '1 / -1' }}>
                                            <span className="dpd-ov-label">Past Diagnosis</span>
                                            <span className="dpd-ov-value" style={{ fontWeight: 700 }}>{viewingPastSession.diagnosis || 'No diagnosis recorded'}</span>
                                        </div>
                                        <div className="dpd-ov-card" style={{ gridColumn: '1 / -1' }}>
                                            <span className="dpd-ov-label">Past Clinical Notes</span>
                                            <span className="dpd-ov-value" style={{ whiteSpace: 'pre-wrap' }}>{viewingPastSession.doctorNotes || 'No notes recorded'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Past Medicines Prescribed</span>
                                            <span className="dpd-ov-value">
                                                {viewingPastSession.pharmacy?.length > 0 
                                                    ? viewingPastSession.pharmacy.map((p, i) => `${i + 1}. ${p.medicineName} (${p.frequency || '-'}, ${p.duration || '-'} days)`).join('\n')
                                                    : 'None'}
                                            </span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Past Lab Tests Ordered</span>
                                            <span className="dpd-ov-value">
                                                {viewingPastSession.labTests?.length > 0 
                                                    ? viewingPastSession.labTests.join(', ')
                                                    : 'None'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="dpd-consult-card">
                                    {/* Section 1: Prescriptions & Medication Orders */}
                                    <div className="dpd-consult-section">
                                        <div className="dpd-consult-sec-header">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span className="dpd-sec-badge violet">💊</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <h4 className="dpd-consult-sec-title">Prescriptions & Medication Orders</h4>
                                                    <span className="dpd-count-badge">
                                                        {sessionData.medicines?.length || 0} Prescribed
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="dpd-consult-sec-body">
                                            {/* Medicine Inventory Quick Search & Add Button in Single Row */}
                                            <div className="dpd-med-toolbar-row">
                                                {!isLocked && (
                                                    <div className="dpd-med-search-box">
                                                        <div className="dpd-diag-input-wrapper">
                                                            <FiSearch className="dpd-input-icon" />
                                                            <input
                                                                type="text"
                                                                placeholder="Search pharmacy medicines or salts to prescribe (e.g. Paracetamol, Augmentin)..."
                                                                className="dpd-med-search-input"
                                                                value={medSearch}
                                                                onChange={e => setMedSearch(e.target.value)}
                                                            />
                                                        </div>
                                                        {medSearch && (
                                                            <div className="dpd-med-search-dropdown">
                                                                {catalogMedicines.filter(m => (m.name || '').toLowerCase().includes(medSearch.toLowerCase()) || (m.genericName || '').toLowerCase().includes(medSearch.toLowerCase())).length > 0 ? (
                                                                    catalogMedicines.filter(m => (m.name || '').toLowerCase().includes(medSearch.toLowerCase()) || (m.genericName || '').toLowerCase().includes(medSearch.toLowerCase())).map(med => {
                                                                        const isIncluded = (sessionData.medicines || []).some(m => m.medicineName === med.name);
                                                                        return (
                                                                            <div
                                                                                key={med._id}
                                                                                className="dpd-med-search-item"
                                                                                onClick={() => {
                                                                                    if (!isIncluded) {
                                                                                        setSessionData(prev => ({
                                                                                            ...prev,
                                                                                            medicines: [...prev.medicines, {
                                                                                                medicineName: med.name,
                                                                                                saltName: med.genericName || '',
                                                                                                dose: 'OD – Once Daily',
                                                                                                days: '7'
                                                                                            }]
                                                                                        }));
                                                                                    }
                                                                                    setMedSearch('');
                                                                                }}
                                                                            >
                                                                                <div>
                                                                                    <strong style={{ color: '#0f172a' }}>{med.name}</strong>
                                                                                    <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>({med.category || 'Drug'})</span>
                                                                                </div>
                                                                                <div style={{ fontSize: '11.5px', color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                                                                    {med.genericName || 'Inventory'}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12.5px' }}>
                                                                        No catalog match for "{medSearch}". You can type directly in the table row.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {!isLocked && (
                                                    <button
                                                        type="button"
                                                        className="dpd-table-add-btn"
                                                        onClick={() => setSessionData(prev => ({
                                                            ...prev,
                                                            medicines: [...prev.medicines, { medicineName: '', saltName: '', dose: 'OD – Once Daily', days: '7' }]
                                                        }))}
                                                    >
                                                        <FiPlus /> Add Medicine
                                                    </button>
                                                )}
                                            </div>

                                            {/* Medicines Table */}
                                            <div className="dpd-med-table-wrapper">
                                                <table className="dpd-med-table">
                                                    <thead>
                                                        <tr>
                                                            <th style={{ width: '32%' }}>Medicine & Strength</th>
                                                            <th style={{ width: '24%' }}>Dose / Frequency</th>
                                                            <th style={{ width: '24%' }}>Timing / Food</th>
                                                            <th style={{ width: '12%' }}>Duration</th>
                                                            {!isLocked && <th style={{ width: '8%', textAlign: 'center' }}>Remove</th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(sessionData.medicines || []).map((med, idx) => (
                                                            <tr key={idx}>
                                                                <td>
                                                                    <input
                                                                        value={med.medicineName}
                                                                        onChange={e => setSessionData(prev => {
                                                                            const m = [...prev.medicines];
                                                                            m[idx] = { ...m[idx], medicineName: e.target.value };
                                                                            return { ...prev, medicines: m };
                                                                        })}
                                                                        placeholder="e.g. Tab. Paracetamol 650mg"
                                                                        className="dpd-cell-input"
                                                                        disabled={isLocked}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <select
                                                                        value={med.dose || ''}
                                                                        onChange={e => setSessionData(prev => {
                                                                            const m = [...prev.medicines];
                                                                            m[idx] = { ...m[idx], dose: e.target.value };
                                                                            return { ...prev, medicines: m };
                                                                        })}
                                                                        className="dpd-cell-select"
                                                                        disabled={isLocked}
                                                                    >
                                                                        <option value="">-- Select Dose --</option>
                                                                        {doseOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                    </select>
                                                                </td>
                                                                <td>
                                                                    <select
                                                                        value={med.saltName || ''}
                                                                        onChange={e => setSessionData(prev => {
                                                                            const m = [...prev.medicines];
                                                                            m[idx] = { ...m[idx], saltName: e.target.value };
                                                                            return { ...prev, medicines: m };
                                                                        })}
                                                                        className="dpd-cell-select"
                                                                        disabled={isLocked}
                                                                    >
                                                                        <option value="">-- Select Timing --</option>
                                                                        {timingOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                    </select>
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        value={med.days || ''}
                                                                        onChange={e => setSessionData(prev => {
                                                                            const m = [...prev.medicines];
                                                                            m[idx] = { ...m[idx], days: e.target.value };
                                                                            return { ...prev, medicines: m };
                                                                        })}
                                                                        placeholder="e.g. 5 days"
                                                                        className="dpd-cell-input"
                                                                        disabled={isLocked}
                                                                    />
                                                                </td>
                                                                {!isLocked && (
                                                                    <td style={{ textAlign: 'center' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setSessionData(prev => ({
                                                                                ...prev,
                                                                                medicines: prev.medicines.filter((_, i) => i !== idx)
                                                                            }))}
                                                                            className="dpd-remove-row-btn"
                                                                            title="Delete medicine row"
                                                                        >
                                                                            <FiTrash2 />
                                                                        </button>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))}
                                                        {(!sessionData.medicines || sessionData.medicines.length === 0) && (
                                                            <tr>
                                                                <td colSpan={isLocked ? 4 : 5} className="dpd-empty-table-msg">
                                                                    💊 No medicines prescribed. Search pharmacy above or click "+ Add Medicine".
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 2: Diagnostic Lab Orders */}
                                    <div className="dpd-consult-section">
                                        <div className="dpd-consult-sec-header">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span className="dpd-sec-badge amber">🧪</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <h4 className="dpd-consult-sec-title">Diagnostic Lab & Radiology Orders</h4>
                                                    <span className="dpd-count-badge">
                                                        {(sessionData.labTests || '').split(',').map(s => s.trim()).filter(Boolean).length} Tests
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="dpd-consult-sec-body">
                                            {/* Search & Add Test Toolbar Row */}
                                            {!isLocked && (
                                                <div className="dpd-med-toolbar-row">
                                                    <div className="dpd-med-search-box">
                                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                                                            <FiSearch className="dpd-input-icon" />
                                                            <input
                                                                type="text"
                                                                placeholder="Enter test / scan name and click '+ Add Test' (or press Enter)..."
                                                                className="dpd-med-search-input"
                                                                value={labSearch}
                                                                onChange={e => setLabSearch(e.target.value)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        handleAddLabTest();
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="dpd-table-add-btn"
                                                        onClick={() => handleAddLabTest()}
                                                    >
                                                        <FiPlus /> Add Test
                                                    </button>
                                                </div>
                                            )}

                                            {/* Selected Lab Test Tags (Only rendered when tests are selected) */}
                                            {(sessionData.labTests || '').trim() ? (
                                                <div className="dpd-selected-tests-wrap">
                                                    {(sessionData.labTests || '').split(',').map(s => s.trim()).filter(Boolean).map((testName, tIdx) => (
                                                        <span key={tIdx} className="dpd-test-tag">
                                                            <span>🔬 {testName}</span>
                                                            {!isLocked && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveLabTest(testName)}
                                                                    className="dpd-tag-remove-btn"
                                                                    title="Remove test"
                                                                >
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null}

                                            {/* Common Lab Test Quick Chips */}
                                            {!isLocked && (
                                                <div className="dpd-quick-chips-wrap">
                                                    <span className="dpd-quick-chips-label">⚡ Quick Select:</span>
                                                    {QUICK_LAB_CHIPS.map(test => {
                                                        const isSelected = (sessionData.labTests || '').split(',').map(s => s.trim().toLowerCase()).includes(test.name.toLowerCase());
                                                        return (
                                                            <button
                                                                key={test.label}
                                                                type="button"
                                                                className={`dpd-quick-chip ${isSelected ? 'selected' : ''}`}
                                                                onClick={() => {
                                                                    const currentList = (sessionData.labTests || '').split(',').map(s => s.trim()).filter(Boolean);
                                                                    let updatedList;
                                                                    if (currentList.some(item => item.toLowerCase() === test.name.toLowerCase())) {
                                                                        updatedList = currentList.filter(t => t.toLowerCase() !== test.name.toLowerCase());
                                                                    } else {
                                                                        updatedList = [...currentList, test.name];
                                                                    }
                                                                    setSessionData(prev => ({ ...prev, labTests: updatedList.join(', ') }));
                                                                }}
                                                            >
                                                                {isSelected ? '✓ ' : '+ '} {test.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Section 3: Primary Diagnosis & Quick Chips */}
                                    <div className="dpd-consult-section">
                                        <div className="dpd-consult-sec-header">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span className="dpd-sec-badge blue">🩺</span>
                                                <h4 className="dpd-consult-sec-title">Primary Diagnosis (ICD-10 / Condition)</h4>
                                            </div>
                                        </div>

                                        <div className="dpd-consult-sec-body">
                                            <div className="dpd-diag-input-wrapper">
                                                <FiSearch className="dpd-input-icon" />
                                                <input
                                                    ref={diagnosisInputRef}
                                                    name="diagnosis"
                                                    value={sessionData.diagnosis}
                                                    onChange={handleSessionChange}
                                                    placeholder="Enter primary diagnosis e.g. Acute Viral Bronchitis, Type 2 Diabetes..."
                                                    className="dpd-diag-input"
                                                    disabled={isLocked}
                                                />
                                            </div>

                                            {!isLocked && (
                                                <div className="dpd-quick-chips-wrap">
                                                    <span className="dpd-quick-chips-label">⚡ Suggestions:</span>
                                                    {[
                                                        'Essential Hypertension',
                                                        'Type 2 Diabetes Mellitus',
                                                        'Acute Viral Bronchitis',
                                                        'Acid Peptic Disease / GERD',
                                                        'Upper Respiratory Infection',
                                                        'Migraine without aura',
                                                        'Lumbar Spondylosis',
                                                        'Urinary Tract Infection (UTI)',
                                                        'Allergic Rhinitis',
                                                        'Routine Health Checkup'
                                                    ].map((chip) => {
                                                        const isSelected = (sessionData.diagnosis || '').includes(chip);
                                                        return (
                                                            <button
                                                                key={chip}
                                                                type="button"
                                                                className={`dpd-quick-chip ${isSelected ? 'selected' : ''}`}
                                                                onClick={() => {
                                                                    setSessionData(prev => {
                                                                        const current = (prev.diagnosis || '').trim();
                                                                        if (!current) return { ...prev, diagnosis: chip };
                                                                        if (current.includes(chip)) return prev;
                                                                        return { ...prev, diagnosis: `${current}, ${chip}` };
                                                                    });
                                                                }}
                                                            >
                                                                {isSelected ? '✓ ' : '+ '} {chip}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Section 4: Clinical Notes & Examination */}
                                    <div className="dpd-consult-section">
                                        <div className="dpd-consult-sec-header">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span className="dpd-sec-badge emerald">📋</span>
                                                <h4 className="dpd-consult-sec-title">Clinical Notes & Examination Findings</h4>
                                            </div>

                                            {!isLocked && (
                                                <div className="dpd-notes-templates-row">
                                                    <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 700 }}>Templates:</span>
                                                    {[
                                                        { name: 'General Exam', text: 'General Examination:\n- Conscious, oriented, cooperative.\n- Pallor: Nil, Icterus: Nil, Cyanosis: Nil, Clubbing: Nil, Lymphadenopathy: Nil, Edema: Nil.\n- Chest: Bilateral vesicular breath sounds heard, no added sounds.\n- CVS: S1 S2 heard, no murmurs.\n- P/A: Soft, non-tender, no organomegaly.' },
                                                        { name: 'Follow-up Note', text: 'Follow-up Assessment:\n- Patient reports symptom improvement since last visit.\n- Adherence to prescribed medications verified.\n- Current vitals within normal parameters.\n- Plan: Continue current medication regimen.' },
                                                        { name: 'Pre-Op Clearance', text: 'Pre-Operative Assessment:\n- Medical clearance given for proposed procedure under standard anesthesia risk.\n- Fasting instructions (NPO 8 hours prior) explained.\n- Baseline investigations verified within acceptable range.' },
                                                        { name: 'Acute Illness', text: 'Acute Presentation:\n- Chief Complaints: \n- Onset and Duration: \n- Physical Examination: \n- Provisional Diagnosis: \n- Management Plan: ' }
                                                    ].map(tmpl => (
                                                        <button
                                                            key={tmpl.name}
                                                            type="button"
                                                            className="dpd-template-chip"
                                                            onClick={() => {
                                                                setSessionData(prev => {
                                                                    const current = (prev.notes || '').trim();
                                                                    return {
                                                                        ...prev,
                                                                        notes: current ? `${current}\n\n${tmpl.text}` : tmpl.text
                                                                    };
                                                                });
                                                            }}
                                                        >
                                                            📝 {tmpl.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="dpd-consult-sec-body">
                                            <textarea
                                                ref={notesTextareaRef}
                                                name="notes"
                                                value={sessionData.notes}
                                                onChange={handleSessionChange}
                                                placeholder="Write clinical notes, observations, examination findings, and treatment plan..."
                                                className="dpd-notes-textarea"
                                                rows={4}
                                                disabled={isLocked}
                                            />
                                        </div>
                                    </div>

                                    {/* Action Footer Bar (Active in Edit Mode) */}
                                    {!isLocked && (
                                        <div className="dpd-consult-footer">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                                                <button
                                                    type="button"
                                                    className="dpd-btn-save-draft"
                                                    onClick={handleSaveProfile}
                                                    disabled={saving}
                                                >
                                                    <FiSave style={{ marginRight: '6px' }} /> Save Profile Draft
                                                </button>
                                                <button
                                                    type="button"
                                                    className="dpd-btn-finish"
                                                    onClick={handleSaveAndMerge}
                                                    disabled={saving}
                                                >
                                                    <span>✨</span>
                                                    <span>{saving ? 'Completing Session...' : 'Finish Consultation'}</span>
                                                    <FiArrowRight style={{ fontSize: '16px' }} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ====== TAB 2: OPERATION REQUIRED / SURGERY PLAN ====== */}
                    {activeTab === 'surgery' && (
                        <div className="dpd-tab-panel">
                            {/* Sleek Minimal Header */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '16px',
                                flexWrap: 'wrap',
                                gap: '12px',
                                paddingBottom: '12px',
                                borderBottom: '1.5px solid #f1f5f9'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '10px',
                                        background: '#eff6ff',
                                        color: '#2563eb',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '18px'
                                    }}>
                                        🏥
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            Surgery & OT Planning
                                            {patientSurgeryPlans.length > 0 && (
                                                <span style={{ fontSize: '11.5px', background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                                                    {patientSurgeryPlans.length} Active {patientSurgeryPlans.length === 1 ? 'Plan' : 'Plans'}
                                                </span>
                                            )}
                                        </h3>
                                        <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                                            Direct OT Dashboard Sync
                                        </div>
                                    </div>
                                </div>

                                {/* Direct Action Buttons */}
                                {!isLocked && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={openCreateSurgeryModal}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '8px 16px',
                                                background: '#2563eb',
                                                color: '#ffffff',
                                                border: 'none',
                                                borderRadius: '8px',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <FiPlus /> New Surgery Plan
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReferralData(prev => ({ ...prev, reason: sessionData.diagnosis || '' }));
                                                setShowReferralModal(true);
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '8px 14px',
                                                background: '#f8fafc',
                                                color: '#7c3aed',
                                                border: '1.5px solid #ddd6fe',
                                                borderRadius: '8px',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            🔄 Refer for Surgery
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Pending Referrals (Compact Strip) */}
                            {patientReferrals.filter(r => r.status === 'REFERRED' && (r.referredToDoctorId?._id === user?._id || r.referredToDoctorId === user?._id)).map(ref => (
                                <div key={ref._id} style={{
                                    background: '#fffbeb',
                                    border: '1.5px solid #fde68a',
                                    borderRadius: '10px',
                                    padding: '12px 16px',
                                    marginBottom: '14px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '10px'
                                }}>
                                    <div style={{ fontSize: '13px', color: '#92400e' }}>
                                        <strong>📋 Inbound Referral:</strong> {ref.reason} (Referred by {ref.referringDoctorId?.name || 'Doctor'})
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setActiveReferralForReview(ref); setShowReferralReviewModal(true); }}
                                        style={{
                                            padding: '6px 14px',
                                            background: '#d97706',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: 700,
                                            fontSize: '12px'
                                        }}
                                    >
                                        Review & Accept
                                    </button>
                                </div>
                            ))}

                            {/* Planned Surgeries List / Table */}
                            {loadingSurgeryPlans ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px' }}>
                                    Loading surgery plans...
                                </div>
                            ) : patientSurgeryPlans.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {patientSurgeryPlans.map((plan) => {
                                        const surgeonName = plan.surgeonId?.name || plan.doctorId?.name || 'Assigned Surgeon';
                                        const prefDateStr = plan.preferredDate ? new Date(plan.preferredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD';
                                        const status = plan.status || 'PLANNED';
                                        
                                        return (
                                            <div
                                                key={plan._id}
                                                style={{
                                                    background: '#ffffff',
                                                    border: '1.5px solid #e2e8f0',
                                                    borderRadius: '12px',
                                                    padding: '16px 18px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    flexWrap: 'wrap',
                                                    gap: '14px',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                                }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '240px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                                                            🔪 {plan.surgery}
                                                        </span>
                                                        {plan.planId && (
                                                            <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                                {plan.planId}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '12.5px', color: '#475569' }}>
                                                        <strong>Surgeon:</strong> Dr. {surgeonName.replace(/^Dr\.?\s*/i, '')} &nbsp;•&nbsp; 
                                                        <strong>Date:</strong> {prefDateStr} {plan.preferredTime ? `at ${plan.preferredTime}` : ''}
                                                    </div>
                                                    {plan.diagnosis && (
                                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                                            <strong>Diagnosis:</strong> {plan.diagnosis}
                                                        </div>
                                                    )}
                                                    {plan.admissionRequired && (
                                                        <div style={{ fontSize: '11.5px', color: '#0284c7', fontWeight: 600 }}>
                                                            🛏️ Admission Required {plan.admissionDate ? `(${new Date(plan.admissionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : ''}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Live OT Dashboard Badge & Action */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ textAlign: 'right' }}>
                                                        {status === 'PLANNED' && (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                padding: '4px 10px',
                                                                background: '#dcfce7',
                                                                color: '#15803d',
                                                                borderRadius: '20px',
                                                                fontSize: '12px',
                                                                fontWeight: 750,
                                                                border: '1px solid #bbf7d0'
                                                            }}>
                                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }}></span>
                                                                🟢 Live on OT Dashboard
                                                            </span>
                                                        )}
                                                        {status === 'SCHEDULED' && (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                padding: '4px 10px',
                                                                background: '#eff6ff',
                                                                color: '#1d4ed8',
                                                                borderRadius: '20px',
                                                                fontSize: '12px',
                                                                fontWeight: 750,
                                                                border: '1px solid #bfdbfe'
                                                            }}>
                                                                🏥 OT Scheduled {plan.otRoomId?.roomName ? `(${plan.otRoomId.roomName})` : ''}
                                                            </span>
                                                        )}
                                                        {status === 'IN_PROGRESS' && (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                padding: '4px 10px',
                                                                background: '#fef3c7',
                                                                color: '#b45309',
                                                                borderRadius: '20px',
                                                                fontSize: '12px',
                                                                fontWeight: 750,
                                                                border: '1px solid #fde68a'
                                                            }}>
                                                                ⚡ Surgery In Progress
                                                            </span>
                                                        )}
                                                        {status === 'COMPLETED' && (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                padding: '4px 10px',
                                                                background: '#f1f5f9',
                                                                color: '#334155',
                                                                borderRadius: '20px',
                                                                fontSize: '12px',
                                                                fontWeight: 750
                                                            }}>
                                                                ✅ Completed
                                                            </span>
                                                        )}
                                                        {status === 'CANCELLED' && (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                padding: '4px 10px',
                                                                background: '#fee2e2',
                                                                color: '#b91c1c',
                                                                borderRadius: '20px',
                                                                fontSize: '12px',
                                                                fontWeight: 750
                                                            }}>
                                                                ✕ Cancelled
                                                            </span>
                                                        )}
                                                    </div>

                                                    {!isLocked && status === 'PLANNED' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCancelSurgeryPlan(plan._id)}
                                                            title="Cancel Surgery Plan"
                                                            style={{
                                                                padding: '6px 10px',
                                                                background: '#fee2e2',
                                                                color: '#dc2626',
                                                                border: 'none',
                                                                borderRadius: '6px',
                                                                fontSize: '12px',
                                                                fontWeight: 750,
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            ✕ Cancel
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{
                                    padding: '32px 20px',
                                    textAlign: 'center',
                                    background: '#f8fafc',
                                    borderRadius: '12px',
                                    border: '1.5px dashed #cbd5e1'
                                }}>
                                    <div style={{ fontSize: '1.6rem', marginBottom: '8px' }}>🔪</div>
                                    <div style={{ fontSize: '14.5px', fontWeight: 750, color: '#334155', marginBottom: '4px' }}>
                                        No Surgery Plan Created Yet
                                    </div>
                                    <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '16px' }}>
                                        Create a surgery plan here to instantly send it to the Operation Theater (OT) Dashboard.
                                    </div>
                                    {!isLocked && (
                                        <button
                                            type="button"
                                            onClick={openCreateSurgeryModal}
                                            style={{
                                                padding: '9px 20px',
                                                background: '#2563eb',
                                                color: '#ffffff',
                                                border: 'none',
                                                borderRadius: '8px',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.2)'
                                            }}
                                        >
                                            + Create Surgery Plan & Push to OT Dashboard
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}



                    {/* ====== TAB 3: ASSISTANT INTAKE & Q&A ====== */}
                    {activeTab === 'assistant_intake' && (
                        <div className="dpd-tab-panel">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <h3 className="dpd-panel-title" style={{ margin: 0 }}>
                                        🩺 Assistant Clinical Intake & Questionnaire Responses
                                    </h3>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>
                                        Prepared by {assistantPrep?.preparedBy?.name || 'Doctor Assistant'} • Protocol: {assistantPrep?.department || appointment?.department || 'General Medicine'}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        className="dpd-asst-action-btn asst-btn-vitals"
                                        onClick={handleAcceptVitals}
                                    >
                                        <FiCheck className="btn-icon" /> Accept Vitals
                                    </button>
                                    <button
                                        type="button"
                                        className="dpd-asst-action-btn asst-btn-notes"
                                        onClick={handleImportAllIntakeToNotes}
                                    >
                                        <FiFileText className="btn-icon" /> Import All to Notes
                                    </button>
                                </div>
                            </div>

                            {/* Assistant Vitals Card */}
                            {assistantPrep?.vitals && (
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>💓</span> Preliminary Vitals Recorded
                                    </h4>
                                    <div className="dpd-overview-grid">
                                        {assistantPrep.vitals.bp && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Blood Pressure</span>
                                                <span className="dpd-ov-value">{assistantPrep.vitals.bp}</span>
                                            </div>
                                        )}
                                        {assistantPrep.vitals.pulse && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Pulse Rate</span>
                                                <span className="dpd-ov-value">{assistantPrep.vitals.pulse} bpm</span>
                                            </div>
                                        )}
                                        {assistantPrep.vitals.temperature && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Temperature</span>
                                                <span className="dpd-ov-value">{assistantPrep.vitals.temperature} °F</span>
                                            </div>
                                        )}
                                        {assistantPrep.vitals.spo2 && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Oxygen (SpO2)</span>
                                                <span className="dpd-ov-value">{assistantPrep.vitals.spo2}%</span>
                                            </div>
                                        )}
                                        {assistantPrep.vitals.weight && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Weight</span>
                                                <span className="dpd-ov-value">{assistantPrep.vitals.weight} kg</span>
                                            </div>
                                        )}
                                        {assistantPrep.vitals.height && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Height</span>
                                                <span className="dpd-ov-value">{assistantPrep.vitals.height} cm</span>
                                            </div>
                                        )}
                                        {assistantPrep.vitals.bmi && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">BMI</span>
                                                <span className="dpd-ov-value">{assistantPrep.vitals.bmi}</span>
                                            </div>
                                        )}
                                        {assistantPrep.vitals.bloodSugar && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Blood Sugar</span>
                                                <span className="dpd-ov-value">{assistantPrep.vitals.bloodSugar} mg/dL</span>
                                            </div>
                                        )}
                                        {assistantPrep.vitals.painScore && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Pain Scale</span>
                                                <span className="dpd-ov-value">{assistantPrep.vitals.painScore} / 10</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Clinical History & Complaints */}
                            {assistantPrep?.preparation && (
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>📝</span> Clinical History & Chief Complaints
                                    </h4>
                                    <div className="dpd-overview-grid">
                                        {assistantPrep.preparation.chiefComplaint && (
                                            <div className="dpd-ov-card" style={{ gridColumn: '1 / -1' }}>
                                                <span className="dpd-ov-label">Chief Complaint</span>
                                                <span className="dpd-ov-value" style={{ fontWeight: 600 }}>{assistantPrep.preparation.chiefComplaint}</span>
                                            </div>
                                        )}
                                        {assistantPrep.preparation.historyOfPresentIllness && (
                                            <div className="dpd-ov-card" style={{ gridColumn: '1 / -1' }}>
                                                <span className="dpd-ov-label">History of Present Illness (HPI)</span>
                                                <span className="dpd-ov-value">{assistantPrep.preparation.historyOfPresentIllness}</span>
                                            </div>
                                        )}
                                        {assistantPrep.preparation.allergies && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Allergies</span>
                                                <span className="dpd-ov-value" style={{ color: '#dc2626', fontWeight: 700 }}>{assistantPrep.preparation.allergies}</span>
                                            </div>
                                        )}
                                        {assistantPrep.preparation.currentMedicines && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Current Medicines</span>
                                                <span className="dpd-ov-value">{assistantPrep.preparation.currentMedicines}</span>
                                            </div>
                                        )}
                                        {assistantPrep.preparation.pastMedicalHistory && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Past Medical History</span>
                                                <span className="dpd-ov-value">{assistantPrep.preparation.pastMedicalHistory}</span>
                                            </div>
                                        )}
                                        {assistantPrep.preparation.pastSurgicalHistory && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Past Surgical History</span>
                                                <span className="dpd-ov-value">{assistantPrep.preparation.pastSurgicalHistory}</span>
                                            </div>
                                        )}
                                        {assistantPrep.preparation.familyHistory && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Family History</span>
                                                <span className="dpd-ov-value">{assistantPrep.preparation.familyHistory}</span>
                                            </div>
                                        )}
                                        {assistantPrep.preparation.lifestyle && (
                                            <div className="dpd-ov-card">
                                                <span className="dpd-ov-label">Lifestyle / Habits</span>
                                                <span className="dpd-ov-value">{assistantPrep.preparation.lifestyle}</span>
                                            </div>
                                        )}
                                        {assistantPrep.preparation.assistantRemarks && (
                                            <div className="dpd-ov-card" style={{ gridColumn: '1 / -1' }}>
                                                <span className="dpd-ov-label">Assistant Remarks</span>
                                                <span className="dpd-ov-value">{assistantPrep.preparation.assistantRemarks}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Questionnaire Responses Grid */}
                            {(() => {
                                const rawAns = assistantPrep?.questionnaireAnswers || appointment?.questionnaireAnswers || {};
                                const ansList = Array.isArray(rawAns)
                                    ? rawAns
                                    : Object.entries(rawAns).map(([k, val]) => ({ questionId: k, questionText: k, response: val }));

                                if (ansList.length === 0) {
                                    return (
                                        <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                                            <FiClipboard style={{ fontSize: '28px', color: '#94a3b8', marginBottom: '8px' }} />
                                            <p style={{ margin: 0, fontWeight: 600 }}>No specialty questionnaire responses entered by the assistant yet.</p>
                                        </div>
                                    );
                                }

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                                            📋 Specialty Questionnaire Q&A ({ansList.length} Questions Answered)
                                        </h4>
                                        {ansList.map((item, idx) => {
                                            const formattedResp = Array.isArray(item.response)
                                                ? item.response.join(', ')
                                                : (typeof item.response === 'object' ? JSON.stringify(item.response) : String(item.response || '—'));

                                            return (
                                                <div
                                                    key={idx}
                                                    style={{
                                                        background: '#ffffff',
                                                        border: '1.5px solid #e2e8f0',
                                                        borderRadius: '12px',
                                                        padding: '14px 18px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '8px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px' }}>
                                                            {item.category || assistantPrep?.department || 'Clinical Question'}
                                                        </span>
                                                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                                                            Q{idx + 1}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                                                        {item.questionText || item.questionId}
                                                    </div>
                                                    <div style={{
                                                        fontSize: '13.5px',
                                                        color: '#1e40af',
                                                        background: '#f0f9ff',
                                                        border: '1px solid #bae6fd',
                                                        borderRadius: '8px',
                                                        padding: '8px 12px',
                                                        fontWeight: 600
                                                    }}>
                                                        <strong>Recorded Response: </strong> {formattedResp}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* ====== TAB: VITALS & HISTORY ====== */}
                    {activeTab === 'history' && (() => {
                        const currentDept = (appointment?.department || appointment?.serviceName || '').toLowerCase();
                        const filteredHistory = history.filter(h => {
                            if (!currentDept) return true;
                            if (h._id === appointmentId) return true;
                            const hDept = (h.department || h.serviceName || h.doctorConsultation?.department || '').toLowerCase();
                            return hDept === currentDept;
                        });

                        const apptVitals = appointment?.vitals || {};
                        const vitalsInfo = {
                            height: apptVitals.height || profile.height || intakeData.height || intakeData.vitals?.height,
                            weight: apptVitals.weight || profile.weight || intakeData.weight || intakeData.vitals?.weight,
                            bmi: apptVitals.bmi || profile.bmi || intakeData.bmi || intakeData.vitals?.bmi,
                            bp: apptVitals.bp || profile.bp || profile.bloodPressure || profile.historyBp || intakeData.bp || intakeData.bloodPressure || intakeData.historyBp || intakeData.vitals?.bloodPressure || intakeData.vitals?.bp,
                            pulse: apptVitals.pulse || profile.pulse || profile.pulseRate || profile.historyPulse || intakeData.pulse || intakeData.pulseRate || intakeData.historyPulse || intakeData.vitals?.pulse,
                            rr: apptVitals.rr || apptVitals.respiratoryRate || profile.rr || profile.respiratoryRate || intakeData.rr || intakeData.respiratoryRate || intakeData.vitals?.respiratoryRate,
                            temp: apptVitals.temperature || apptVitals.temp || profile.temperature || profile.temp || intakeData.temperature || intakeData.temp || intakeData.vitals?.temperature,
                            spo2: apptVitals.spo2 || profile.spo2 || intakeData.spo2 || intakeData.vitals?.spo2,
                            bloodSugar: apptVitals.bloodSugar || profile.bloodSugar || profile.blood_sugar || intakeData.bloodSugar || intakeData.blood_sugar,
                            heartRate: apptVitals.heartRate || apptVitals.heart_rate || profile.heartRate || profile.heart_rate || intakeData.heartRate || intakeData.heart_rate,
                            painScale: apptVitals.painScale || apptVitals.pain_scale || profile.painScale || profile.pain_scale || intakeData.painScale || intakeData.pain_scale,
                            allergies: (profile.allergies && profile.allergies !== '-') ? profile.allergies : ((intakeData.allergies && intakeData.allergies !== '-') ? intakeData.allergies : ''),
                            medications: profile.currentMedications || profile.currentMedication || intakeData.currentMedications || intakeData.currentMedication || profile.medications || intakeData.medications,
                            history: (profile.chronicConditions && profile.chronicConditions !== '-') ? profile.chronicConditions : ((intakeData.chronicConditions && intakeData.chronicConditions !== '-') ? intakeData.chronicConditions : '')
                        };

                        const isValAvailable = (val) => val && val !== '-' && val !== 'None' && val.toString().trim() !== '';

                        return (
                            <div className="dpd-tab-panel">
                                {/* Vitals Summary Section */}
                                <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '1.4rem', background: '#eff6ff', padding: '6px 10px', borderRadius: '10px' }}>💓</span>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Patient Vitals & Clinical Indicators</h3>
                                                <div style={{ fontSize: '12px', color: '#64748b' }}>Latest recordings and baseline physiological metrics</div>
                                            </div>
                                        </div>
                                        {assistantPrep?.vitals && (
                                            <button 
                                                type="button" 
                                                className="dpd-asst-action-btn asst-btn-vitals" 
                                                onClick={handleAcceptVitals}
                                                style={{ fontSize: '12px', padding: '6px 12px' }}
                                            >
                                                <FiCheck className="btn-icon" /> Sync Assistant Vitals
                                            </button>
                                        )}
                                    </div>

                                    <div className="dpd-overview-grid">
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Blood Pressure</span>
                                            <span className="dpd-ov-value" style={{ color: '#2563eb' }}>{isValAvailable(vitalsInfo.bp) ? vitalsInfo.bp : '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Pulse / Heart Rate</span>
                                            <span className="dpd-ov-value">{isValAvailable(vitalsInfo.pulse) ? `${vitalsInfo.pulse} bpm` : (isValAvailable(vitalsInfo.heartRate) ? `${vitalsInfo.heartRate} bpm` : '-')}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Body Temperature</span>
                                            <span className="dpd-ov-value">{isValAvailable(vitalsInfo.temp) ? `${vitalsInfo.temp} °F` : '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">SpO₂ Oxygen Saturation</span>
                                            <span className="dpd-ov-value" style={{ color: '#059669' }}>{isValAvailable(vitalsInfo.spo2) ? `${vitalsInfo.spo2}%` : '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Respiratory Rate</span>
                                            <span className="dpd-ov-value">{isValAvailable(vitalsInfo.rr) ? `${vitalsInfo.rr} /min` : '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Random Blood Sugar</span>
                                            <span className="dpd-ov-value">{isValAvailable(vitalsInfo.bloodSugar) ? `${vitalsInfo.bloodSugar} mg/dL` : '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Height & Weight</span>
                                            <span className="dpd-ov-value">{isValAvailable(vitalsInfo.height) ? `${vitalsInfo.height} cm` : '-'} / {isValAvailable(vitalsInfo.weight) ? `${vitalsInfo.weight} kg` : '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">BMI</span>
                                            <span className="dpd-ov-value">{isValAvailable(vitalsInfo.bmi) ? vitalsInfo.bmi : '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Pain Score</span>
                                            <span className="dpd-ov-value">{isValAvailable(vitalsInfo.painScale) ? `${vitalsInfo.painScale} / 10` : '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Blood Group</span>
                                            <span className="dpd-ov-value" style={{ color: '#dc2626', fontWeight: 800 }}>{profile.bloodGroup || intakeData.bloodGroup || '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card" style={{ gridColumn: '1 / -1' }}>
                                            <span className="dpd-ov-label">Known Allergies</span>
                                            <span className="dpd-ov-value" style={{ color: isValAvailable(vitalsInfo.allergies) ? '#dc2626' : '#64748b', fontWeight: isValAvailable(vitalsInfo.allergies) ? 700 : 500 }}>
                                                {isValAvailable(vitalsInfo.allergies) ? `⚠️ ${vitalsInfo.allergies}` : 'No known drug or environmental allergies reported'}
                                            </span>
                                        </div>
                                        {isValAvailable(vitalsInfo.medications) && (
                                            <div className="dpd-ov-card" style={{ gridColumn: '1 / -1' }}>
                                                <span className="dpd-ov-label">Current Medications</span>
                                                <span className="dpd-ov-value">{vitalsInfo.medications}</span>
                                            </div>
                                        )}
                                        {isValAvailable(vitalsInfo.history) && (
                                            <div className="dpd-ov-card" style={{ gridColumn: '1 / -1' }}>
                                                <span className="dpd-ov-label">Medical History / Chronic Conditions</span>
                                                <span className="dpd-ov-value">{vitalsInfo.history}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Previous Consultations Section */}
                                <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                                        <span style={{ fontSize: '1.4rem', background: '#fef3c7', padding: '6px 10px', borderRadius: '10px' }}>📜</span>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Previous Consultations ({filteredHistory.length})</h3>
                                            <div style={{ fontSize: '12px', color: '#64748b' }}>Click any visit to preview past prescriptions, clinical notes, or copy into current session</div>
                                        </div>
                                    </div>

                                    {filteredHistory.length === 0 ? (
                                        <div className="dpd-empty-hist">
                                            <p>No previous visits recorded in this department context.</p>
                                        </div>
                                    ) : (
                                        <div className="dpd-history-list">
                                            {filteredHistory.map(h => (
                                                <div
                                                    key={h._id}
                                                    className={`dpd-history-card ${h._id === appointmentId ? 'current' : ''} ${viewingPastSession && viewingPastSession._id === h._id ? 'viewing-active' : ''}`}
                                                    onClick={() => {
                                                        if (h._id === appointmentId) {
                                                            setActiveTab('session');
                                                            setViewingPastSession(null);
                                                        } else {
                                                            setViewingPastSession(viewingPastSession && viewingPastSession._id === h._id ? null : h);
                                                            setActiveTab('session');
                                                        }
                                                    }}
                                                    style={{ cursor: 'pointer', transition: 'all 0.2s', border: viewingPastSession && viewingPastSession._id === h._id ? '2px solid #3b82f6' : '' }}
                                                >
                                                    {viewingPastSession && viewingPastSession._id === h._id && (
                                                        <div style={{ background: '#3b82f6', color: '#fff', padding: '2px 8px', fontSize: '11px', borderRadius: '4px', display: 'inline-block', marginBottom: '8px', fontWeight: 'bold' }}>
                                                            👁️ Viewing Right Now in Session Tab
                                                        </div>
                                                    )}
                                                    <div className="dpd-hist-top">
                                                        <span className="dpd-hist-date">
                                                            {new Date(h.appointmentDate || h.visitDate || h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </span>
                                                        <span className={`dpd-hist-status status-${h.status}`}>{h.status}</span>
                                                    </div>
                                                    <div className="dpd-hist-diagnosis">
                                                        <strong>Diagnosis:</strong>{' '}
                                                        {h.doctorConsultation?.diagnosis?.length > 0
                                                            ? h.doctorConsultation.diagnosis.join(', ')
                                                            : (h.diagnosis || 'No diagnosis recorded')}
                                                    </div>
                                                    {(h.doctorConsultation?.clinicalNotes || h.doctorNotes) && (
                                                        <div className="dpd-hist-notes">
                                                            <strong>Notes:</strong> {h.doctorConsultation?.clinicalNotes || h.doctorNotes}
                                                        </div>
                                                    )}
                                                    {(h.doctorConsultation?.prescription?.length > 0 || h.pharmacy?.length > 0) && (
                                                        <div className="dpd-hist-notes">
                                                            <strong>💊 Medicines:</strong>{' '}
                                                            {h.doctorConsultation?.prescription?.length > 0
                                                                ? h.doctorConsultation.prescription.map(p => `${p.medicine} (${p.dosage}, ${p.duration})`).join(' · ')
                                                                : h.pharmacy.map(p => `${p.medicineName} (${p.frequency || p.dose || '-'}, ${p.duration || p.days || '-'} days)`).join(' · ')}
                                                        </div>
                                                    )}
                                                    {(h.doctorConsultation?.labTests?.length > 0 || h.labTests?.length > 0) && (
                                                        <div className="dpd-hist-notes">
                                                            <strong>🧪 Lab Tests:</strong>{' '}
                                                            {h.doctorConsultation?.labTests?.length > 0
                                                                ? h.doctorConsultation.labTests.join(', ')
                                                                : (h.labTests || []).join(', ')}
                                                        </div>
                                                    )}
                                                    {h._id === appointmentId && <span className="dpd-current-badge">📌 Current Session</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ====== TAB 6: REPORTS & FILES ====== */}
                    {activeTab === 'reports' && (
                        <AppointmentReports appointmentId={appointment?._id} prescriptions={appointment?.prescriptions} />
                    )}

                    {/* ====== DYNAMIC DEPARTMENT QUESTIONNAIRE TABS ====== */}
                    {dynamicTabs.map(dTab => (
                        activeTab === dTab.id && (
                            <div key={dTab.id} style={{ display: 'block' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '12px',
                                    marginBottom: '16px',
                                    padding: '12px 18px',
                                    background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
                                    border: '1px solid #bae6fd',
                                    borderRadius: '12px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '1.4rem' }}>{dTab.icon || '📋'}</span>
                                        <div>
                                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
                                                {dTab.deptName} Clinical Questionnaire
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                Section: <strong>{dTab.shortLabel || dTab.categoryName}</strong> • {dTab.data?.length || 0} questions
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Department Questionnaire:</label>
                                        <select
                                            value={activeDeptKey}
                                            onChange={(e) => setSelectedDeptOverride(e.target.value)}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '8px',
                                                border: '1.5px solid #0284c7',
                                                background: '#ffffff',
                                                color: '#0f172a',
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {availableDepts.map(dept => (
                                                <option key={dept} value={dept}>
                                                    {DEPARTMENT_ICONS[dept] || '📋'} {dept}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <DynamicQuestionForm
                                    categoryName={dTab.shortLabel || dTab.categoryName || dTab.label}
                                    questions={dTab.data}
                                    intakeData={intakeData}
                                    setIntakeData={setIntakeData}
                                    readOnly={isLocked}
                                />
                                {!isLocked && (
                                    <button 
                                        className="dpd-save-section" 
                                        onClick={handleSaveProfile} 
                                        disabled={saving} 
                                        style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontWeight: 600 }}
                                    >
                                        <FiSave /> {saving ? 'Saving...' : `Save ${dTab.shortLabel || dTab.label} Responses`}
                                    </button>
                                )}
                            </div>
                        )
                    ))}
                </div>
            </div>

            {/* ====== MODALS ====== */}
            {!isJrDoctor && showPrescribeModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '850px', maxWidth: '95vw', height: '85vh', maxHeight: '850px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.4rem', fontWeight: '800' }}>⚕️ Prescribe Medicines & Lab Tests</h3>
                            <button onClick={() => setShowPrescribeModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>✕</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '30px', paddingRight: '8px' }}>

                            {/* Medicines Section */}
                            <div>
                                <h4 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>💊 Medicines Prescribed</h4>

                                {/* Search Medicine From Inventory */}
                                <div style={{ marginBottom: '14px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '6px' }}>Search Medicine From Inventory</label>
                                    <input 
                                        type="text" 
                                        placeholder="Search medicine by name..." 
                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', boxSizing: 'border-box' }} 
                                        value={medSearch} 
                                        onChange={e => setMedSearch(e.target.value)} 
                                    />
                                </div>

                                {medSearch && (
                                    <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', maxHeight: '180px', overflowY: 'auto' }}>
                                        {catalogMedicines.filter(m => m.name.toLowerCase().includes(medSearch.toLowerCase())).length > 0 ? (
                                            catalogMedicines.filter(m => m.name.toLowerCase().includes(medSearch.toLowerCase())).map(med => {
                                                const isIncluded = sessionData.medicines.some(m => m.medicineName === med.name);
                                                return (
                                                    <div
                                                        key={med._id}
                                                        onClick={() => {
                                                            if (!isIncluded) {
                                                                    setSessionData(prev => ({ ...prev, medicines: [...prev.medicines, { medicineName: med.name, saltName: '', dose: '', days: '7' }] }));
                                                            }
                                                            setMedSearch('');
                                                        }}
                                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: '#fff' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                    >
                                                        <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '13px' }}>{med.name}</div>
                                                        <div style={{ fontSize: '11px', color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>{med.genericName || 'Inventory'}</div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No medicines found.</div>
                                        )}
                                    </div>
                                )}

                                {/* Medicine Table */}
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ background: '#f1f5f9' }}>
                                                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '35%' }}>Medicine Name</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '25%' }}>Dose / Frequency</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '25%' }}>Food / Timing Instructions</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '10%' }}>Days</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '5%' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sessionData.medicines.map((med, idx) => (
                                                <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                        <input
                                                            value={med.medicineName}
                                                            onChange={e => setSessionData(prev => { const m = [...prev.medicines]; m[idx] = { ...m[idx], medicineName: e.target.value }; return { ...prev, medicines: m }; })}
                                                            placeholder="Paracetamol 500mg"
                                                            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                        <select
                                                            value={med.dose}
                                                            onChange={e => setSessionData(prev => { const m = [...prev.medicines]; m[idx] = { ...m[idx], dose: e.target.value }; return { ...prev, medicines: m }; })}
                                                            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box', background: '#fff' }}
                                                        >
                                                            <option value="">-- Select Dose --</option>
                                                            {doseOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                        <select
                                                            value={med.saltName}
                                                            onChange={e => setSessionData(prev => { const m = [...prev.medicines]; m[idx] = { ...m[idx], saltName: e.target.value }; return { ...prev, medicines: m }; })}
                                                            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box', background: '#fff' }}
                                                        >
                                                            <option value="">-- Select Timing --</option>
                                                            {timingOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                        <input
                                                            value={med.days}
                                                            onChange={e => setSessionData(prev => { const m = [...prev.medicines]; m[idx] = { ...m[idx], days: e.target.value }; return { ...prev, medicines: m }; })}
                                                            placeholder="e.g. 7"
                                                            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSessionData(prev => ({ ...prev, medicines: prev.medicines.filter((_, i) => i !== idx) }))}
                                                            style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', width: '24px', height: '24px', cursor: 'pointer', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                        >×</button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {sessionData.medicines.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                                        No medicines added yet. Use quick-add above or click "+ Add Row".
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSessionData(prev => ({ ...prev, medicines: [...prev.medicines, { medicineName: '', saltName: '', dose: '', days: '' }] }))}
                                    style={{ marginTop: '8px', padding: '6px 14px', fontSize: '12px', background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: '6px', color: '#16a34a', cursor: 'pointer', fontWeight: '600' }}
                                >
                                    + Add Row
                                </button>
                            </div>

                            <hr style={{ border: 'none', borderTop: '2px dashed #e2e8f0', margin: '0' }} />

                            {/* Lab Tests Section */}
                            <div>
                                <h4 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>🧪 Select Lab Tests</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                                    {catalogTests.length > 0 ? catalogTests.filter(t => t.isActive).map(test => {
                                        const isChecked = sessionData.labTests.split(', ').includes(test.name);
                                        return (
                                            <label key={test._id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', cursor: 'pointer', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', background: isChecked ? '#eff6ff' : '#fafafa', borderColor: isChecked ? '#93c5fd' : '#e2e8f0', transition: 'all 0.2s' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={(e) => {
                                                        let currentTests = sessionData.labTests ? sessionData.labTests.split(', ') : [];
                                                        if (e.target.checked) {
                                                            currentTests.push(test.name);
                                                        } else {
                                                            currentTests = currentTests.filter(t => t !== test.name);
                                                        }
                                                        setSessionData(prev => ({ ...prev, labTests: currentTests.join(', ') }));
                                                    }}
                                                    style={{ marginTop: '2px', cursor: 'pointer', width: '16px', height: '16px' }}
                                                />
                                                <div>
                                                    <div style={{ fontWeight: '700', color: '#0f172a' }}>{test.name}</div>
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{test.category}</div>
                                                </div>
                                            </label>
                                        );
                                    }) : <p style={{ color: '#94a3b8', fontSize: '13px', gridColumn: '1 / -1', textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '8px' }}>No lab tests defined by Super Admin.</p>}
                                </div>
                                <label style={{ fontSize: '13px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Edit Final Lab Tests (Comma separated):</label>
                                <input
                                    name="labTests"
                                    value={sessionData.labTests}
                                    onChange={handleSessionChange}
                                    placeholder="CBC, LFT, KFT..."
                                    className="dpd-diag-input"
                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>

                        </div>

                        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => setShowPrescribeModal(false)} style={{ padding: '12px 24px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Close</button>
                            <button onClick={() => setShowPrescribeModal(false)} style={{ padding: '12px 30px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)' }}>Save Selections & Resume Note</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ====== SURGERY PLAN MODAL ====== */}
            {!isJrDoctor && showSurgeryPlanModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '600px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid #e2e8f0' }}>
                            <div>
                                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.25rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🔪 Create Surgery Plan
                                </h3>
                                <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, marginTop: '2px' }}>
                                    ● Direct Real-Time Push to OT Dashboard
                                </div>
                            </div>
                            <button onClick={() => setShowSurgeryPlanModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#475569' }}>✕</button>
                        </div>
                        
                        <form onSubmit={handleCreateSurgeryPlan} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#334155' }}>
                                <strong>Patient:</strong> {intakeData?.name || appointment?.userId?.name || appointment?.patientId || 'N/A'} &nbsp;|&nbsp;
                                <strong>MRN:</strong> {intakeData?.patientUid || appointment?.userId?.patientId || '-'}
                            </div>

                            {surgeryPlanData.referralId && (
                                <div style={{ background: '#f5f3ff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #ddd6fe', fontSize: '12.5px', color: '#5b21b6', fontWeight: 600 }}>
                                    🔄 Referred Surgery Case (Referral linked)
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '12.5px', color: '#475569' }}>Surgery / Procedure *</label>
                                <input required placeholder="e.g. Laparoscopic Appendectomy" value={surgeryPlanData.surgery} onChange={e => setSurgeryPlanData(prev => ({...prev, surgery: e.target.value}))} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '13.5px' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '12.5px', color: '#475569' }}>Diagnosis / Reason</label>
                                <input placeholder="e.g. Acute Appendicitis" value={surgeryPlanData.diagnosis} onChange={e => setSurgeryPlanData(prev => ({...prev, diagnosis: e.target.value}))} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '13.5px' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '12.5px', color: '#475569' }}>Operating Surgeon *</label>
                                <select required value={surgeryPlanData.surgeonId} onChange={e => setSurgeryPlanData(prev => ({...prev, surgeonId: e.target.value}))} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', background: '#fff', fontSize: '13.5px' }}>
                                    <option value="">-- Select Surgeon --</option>
                                    {surgeonsList.map(s => {
                                        const id = s.userId?._id || s.userId || s._id;
                                        const docName = s.name || s.userId?.name || 'Doctor';
                                        return (
                                            <option key={s._id || id} value={id}>Dr. {docName.replace(/^Dr\.?\s*/i, '')} {s.specialty ? `(${s.specialty})` : ''}</option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '12.5px', color: '#475569' }}>Preferred Date *</label>
                                    <input type="date" required min={new Date().toISOString().split('T')[0]} value={surgeryPlanData.preferredDate} onChange={e => setSurgeryPlanData(prev => ({...prev, preferredDate: e.target.value}))} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '13.5px' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '12.5px', color: '#475569' }}>Preferred Time *</label>
                                    <input type="time" required value={surgeryPlanData.preferredTime} onChange={e => setSurgeryPlanData(prev => ({...prev, preferredTime: e.target.value}))} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '13.5px' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: '600', fontSize: '12.5px', color: '#475569', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={surgeryPlanData.admissionRequired} onChange={e => setSurgeryPlanData(prev => ({...prev, admissionRequired: e.target.checked}))} />
                                    Admission Required
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: '600', fontSize: '12.5px', color: '#475569', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={surgeryPlanData.preOpRequired} onChange={e => setSurgeryPlanData(prev => ({...prev, preOpRequired: e.target.checked}))} />
                                    Pre-Op Preparation Required
                                </label>
                            </div>

                            {surgeryPlanData.admissionRequired && (
                                <div>
                                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '12.5px', color: '#475569' }}>Admission Date *</label>
                                    <input type="date" required={surgeryPlanData.admissionRequired} value={surgeryPlanData.admissionDate} onChange={e => setSurgeryPlanData(prev => ({...prev, admissionDate: e.target.value}))} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '13.5px' }} />
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '12.5px', color: '#475569' }}>Notes / Instructions</label>
                                <textarea value={surgeryPlanData.notes} onChange={e => setSurgeryPlanData(prev => ({...prev, notes: e.target.value}))} placeholder="Specific requirements, anesthesia preferences, etc..." style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', minHeight: '70px', fontSize: '13px' }} />
                            </div>

                            <div style={{ marginTop: '6px', paddingTop: '14px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button type="button" onClick={() => setShowSurgeryPlanModal(false)} style={{ padding: '9px 18px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Cancel</button>
                                <button type="submit" style={{ padding: '9px 22px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)' }}>
                                    ✨ Push to OT Dashboard
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


            {/* ====== REFERRAL MODAL ====== */}
            {showReferralModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '550px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.4rem', fontWeight: '800' }}>🔄 Refer for Surgery</h3>
                            <button onClick={() => setShowReferralModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#475569' }}>✕</button>
                        </div>
                        
                        <form onSubmit={handleCreateReferral} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', color: '#334155' }}>
                                <strong>Patient:</strong> {intakeData?.name || appointment?.userId?.name || 'N/A'} <br/>
                                <strong>MRN:</strong> {intakeData?.patientUid || appointment?.userId?.patientId || '-'}
                            </div>

                            <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '14px', color: '#166534' }}>
                                <strong>Referring Doctor:</strong> {user?.name || 'Current Doctor'} (You)
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#475569' }}>Refer To Doctor / Surgeon *</label>
                                <select 
                                    required 
                                    value={referralData.referredToDoctorId} 
                                    onChange={e => setReferralData(prev => ({...prev, referredToDoctorId: e.target.value}))} 
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', background: '#fff' }}
                                >
                                    <option value="">-- Select Doctor --</option>
                                    {surgeonsList
                                        .filter(s => {
                                            const docUserId = (s.userId?._id || s.userId || s._id)?.toString();
                                            const currentUserId = (user?._id || user?.id)?.toString();
                                            return docUserId !== currentUserId;
                                        })
                                        .map(s => {
                                            const id = s.userId?._id || s.userId || s._id;
                                            const docName = s.name || s.userId?.name || 'Doctor';
                                            return (
                                                <option key={s._id || id} value={id}>Dr. {docName.replace(/^Dr\.?\s*/i, '')} {s.specialty ? `(${s.specialty})` : ''}</option>
                                            );
                                        })}
                                </select>
                                {surgeonsList.filter(s => ((s.userId?._id || s.userId || s._id)?.toString() !== (user?._id || user?.id)?.toString())).length === 0 && (
                                    <small style={{ color: '#ef4444', marginTop: '6px', display: 'block', fontSize: '12px' }}>
                                        ⚠️ No other doctors found in this hospital to refer to. Please create another doctor in Admin &gt; Staff.
                                    </small>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#475569' }}>Reason for Referral *</label>
                                <input required value={referralData.reason} onChange={e => setReferralData(prev => ({...prev, reason: e.target.value}))} placeholder="e.g. Appendectomy required" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#475569' }}>Notes (Optional)</label>
                                <textarea value={referralData.notes} onChange={e => setReferralData(prev => ({...prev, notes: e.target.value}))} placeholder="Any additional information..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', minHeight: '70px' }} />
                            </div>

                            <div style={{ marginTop: '10px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button type="button" onClick={() => setShowReferralModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                                <button type="submit" style={{ padding: '10px 24px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Create Referral</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ====== REFERRAL REVIEW MODAL ====== */}
            {showReferralReviewModal && activeReferralForReview && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '550px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.4rem', fontWeight: '800' }}>📋 Review Referral</h3>
                            <button onClick={() => { setShowReferralReviewModal(false); setActiveReferralForReview(null); }} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#475569' }}>✕</button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', color: '#334155' }}>
                                <strong>Patient:</strong> {activeReferralForReview.patientId?.name || 'N/A'}<br/>
                                <strong>MRN:</strong> {activeReferralForReview.patientId?.patientId || activeReferralForReview.patientId?.mrn || '-'}
                            </div>
                            <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '14px', color: '#92400e' }}>
                                <strong>Referred By:</strong> {activeReferralForReview.referringDoctorId?.name || 'N/A'}<br/>
                                <strong>Reason:</strong> {activeReferralForReview.reason}<br/>
                                {activeReferralForReview.notes && <><strong>Notes:</strong> {activeReferralForReview.notes}<br/></>}
                                <strong>Date:</strong> {new Date(activeReferralForReview.referralDate).toLocaleDateString()}
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                            <label style={{ display: 'block', fontWeight: '700', marginBottom: '12px', fontSize: '15px', color: '#1e293b' }}>Surgery Required?</label>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={() => {
                                        handleReviewReferral(activeReferralForReview._id, 'NOT_REQUIRED', 'Surgery not required after evaluation');
                                    }}
                                    style={{ flex: 1, padding: '12px', background: '#fee2e2', color: '#991b1b', border: '2px solid #fecaca', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                                >
                                    ❌ No — Not Required
                                </button>
                                <button
                                    onClick={() => {
                                        // Accept the referral first
                                        handleReviewReferral(activeReferralForReview._id, 'ACCEPTED', 'Surgery confirmed after evaluation').then(() => {
                                            // Now open surgery plan modal pre-filled
                                            setSurgeryPlanData(prev => ({
                                                ...prev,
                                                diagnosis: activeReferralForReview.reason || '',
                                                surgeonId: user?._id || '',
                                                referralId: activeReferralForReview._id,
                                                referringDoctorId: activeReferralForReview.referringDoctorId?._id || ''
                                            }));
                                            setShowSurgeryPlanModal(true);
                                        });
                                    }}
                                    style={{ flex: 1, padding: '12px', background: '#dcfce7', color: '#166534', border: '2px solid #bbf7d0', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                                >
                                    ✅ Yes — Create Surgery Plan
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Questionnaire Answers Modal */}
            {showAnswersModal && assistantPrep && (
                <div className="dpd-modal-overlay" onClick={() => setShowAnswersModal(false)}>
                    <div className="dpd-modal-card asst-answers-modal" onClick={e => e.stopPropagation()}>
                        <div className="dpd-modal-header">
                            <div>
                                <h3>📋 Department Questionnaire Answers</h3>
                                <p className="dpd-modal-sub">
                                    Recorded by {assistantPrep.preparedBy?.name || 'Doctor Assistant'} for {patient.name}
                                </p>
                            </div>
                            <button type="button" className="dpd-modal-close-btn" onClick={() => setShowAnswersModal(false)}>
                                <FiX />
                            </button>
                        </div>
                        <div className="dpd-modal-body">
                            {(() => {
                                const qList = assistantPrep.questionnaireAnswers
                                    ? (Array.isArray(assistantPrep.questionnaireAnswers)
                                        ? assistantPrep.questionnaireAnswers
                                        : Object.entries(assistantPrep.questionnaireAnswers).map(([k, val]) => ({ questionId: k, questionText: k, response: val })))
                                    : [];

                                if (qList.length === 0) {
                                    return <div className="dpd-empty-answers">No questionnaire answers recorded for this session.</div>;
                                }

                                return (
                                    <div className="dpd-answers-list">
                                        {qList.map((item, idx) => (
                                            <div key={idx} className="dpd-answer-row">
                                                <div className="dpd-answer-header">
                                                    <span className="dpd-answer-category">{item.category || 'General'}</span>
                                                    <span className="dpd-answer-index">Q{idx + 1}</span>
                                                </div>
                                                <div className="dpd-answer-question">{item.questionText || item.questionId}</div>
                                                <div className="dpd-answer-response">
                                                    <strong>Answer:</strong> {typeof item.response === 'object' ? JSON.stringify(item.response) : String(item.response || '—')}
                                                </div>
                                                {item.notes && (
                                                    <div className="dpd-answer-notes">
                                                        <em>Notes: {item.notes}</em>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="dpd-modal-footer">
                            <button type="button" className="dpd-btn-modal-close" onClick={() => setShowAnswersModal(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {customBannerToast.show && (
                <>
                    <style>{`
                        @keyframes slideIn {
                            from { transform: translateY(20px); opacity: 0; }
                            to { transform: translateY(0); opacity: 1; }
                        }
                    `}</style>
                    <div style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        background: '#ffffff',
                        color: '#0f172a',
                        padding: '16px 20px',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        borderLeft: '5px solid #10b981',
                        zIndex: 99999,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        animation: 'slideIn 0.3s ease forwards',
                        fontFamily: 'Inter, sans-serif',
                        minWidth: '300px',
                        maxWidth: '400px'
                    }}>
                        <div style={{ fontWeight: '700', color: '#065f46', fontSize: '15px' }}>{customBannerToast.title}</div>
                        <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.4' }}>{customBannerToast.message}</div>
                    </div>
                </>
            )}
        </div>
    );
};

export default DoctorPatientDetails;