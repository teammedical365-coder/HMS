import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { confirmToast } from '../../utils/confirmToast';
import { doctorAPI, assistantAPI, labTestAPI, questionLibraryAPI, hospitalAPI, patientAPI, receptionAPI, otAPI, adminEntitiesAPI, referralAPI, publicAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './DoctorPatientDetails.css';
import DynamicQuestionForm from '../../components/DynamicQuestionForm';
import { useAuth } from '../../store/hooks';

import AppointmentReports from '../../components/AppointmentReports';
import DoctorIPDOrdersPanel from '../../components/ipd/DoctorIPDOrdersPanel';
import { 
    FiArrowLeft, FiBell, FiChevronDown, FiChevronRight, 
    FiUser, FiCalendar, FiClock, FiCheck, FiCopy, 
    FiFileText, FiFolder, FiMoreHorizontal, FiPaperclip, 
    FiSave, FiArrowRight, FiRefreshCw, FiActivity, FiClipboard, FiFile, FiCheckCircle, FiX 
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

    const [appointment, setAppointment] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [catalogTests, setCatalogTests] = useState([]);
    const [catalogMedicines, setCatalogMedicines] = useState([]);
    const [dynamicLibrary, setDynamicLibrary] = useState(null);
    const [hospitalDepartments, setHospitalDepartments] = useState([]);
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
    const [surgeryPlanData, setSurgeryPlanData] = useState({
        surgery: '', diagnosis: '', surgeonId: '', preferredDate: '', preferredTime: '', admissionRequired: false, admissionDate: '', preOpRequired: false, notes: ''
    });


    // Referral States
    const [showReferralModal, setShowReferralModal] = useState(false);
    const [referralData, setReferralData] = useState({ referredToDoctorId: '', reason: '', notes: '' });
    const [patientReferrals, setPatientReferrals] = useState([]);
    const [showReferralReviewModal, setShowReferralReviewModal] = useState(false);
    const [activeReferralForReview, setActiveReferralForReview] = useState(null);

    // Tab State for Left Panel
    const [activeTab, setActiveTab] = useState('overview');

    // Time Machine Feature State
    const [viewingPastSession, setViewingPastSession] = useState(null);

    // Doctor's Session Notepad (Right Panel)
    const [sessionData, setSessionData] = useState({
        diagnosis: '', notes: '', medicines: [], labTests: ''
    });

    // Patient Intake Profile (Left Panel - Editable by Doctor)
    const [intakeData, setIntakeData] = useState({});

    // Follow-up status for Patient
    const [currentFollowupStatus, setCurrentFollowupStatus] = useState(null);

    const diagnosisInputRef = useRef(null);
    const notesTextareaRef = useRef(null);

    // Tab Scrolling Reference
    const tabsRef = useRef(null);

    const handleTabsWheel = (e) => {
        if (tabsRef.current) {
            // Only convert pure vertical scrolling to horizontal scrolling (mouse wheels)
            // Allow native 2-finger horizontal trackpad scrolling to pass through naturally
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

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true);
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
                    const res = await doctorAPI.getAppointmentDetails(currentApptId);
                    if (res.success && res.appointment) {
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
                            const histRes = await doctorAPI.getPatientHistory(pId, deptContext);
                            if (histRes.success) setHistory(histRes.history || histRes.data || []);
                            
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
                        setLoading(false);
                        return;
                    }
                }

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
                            setLoading(false);
                            return;
                        }
                    } catch(e) { console.error("Error loading fallback profile", e); }
                }
            } catch (err) { console.error(err); }
            finally {
                setLoading(false);
            }

            try {
                const testRes = await labTestAPI.getLabTests();
                if (testRes.success) {
                    setCatalogTests(testRes.data || []);
                }
            } catch (err) { console.error("Error fetching lab test catalog", err); }

            try {
                const medRes = await doctorAPI.getMedicines();
                if (medRes.success) {
                    setCatalogMedicines(medRes.medicines || []);
                }
            } catch (err) { console.error("Error fetching pharmacy inventory", err); }

            try {
                const libRes = await questionLibraryAPI.getLibrary();
                if (libRes.success && libRes.data && libRes.data.data) {
                    setDynamicLibrary(libRes.data.data);
                }
            } catch (err) { console.error("Error fetching dynamic question library", err); }

            finally { setLoading(false); }
        };
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

    useEffect(() => {
        const fetchPatientReferrals = async () => {
            try {
                const pid = appointment?.clinicPatientId?._id || appointment?.userId?._id || appointment?.patientId;
                if (!pid) return;
                const res = await referralAPI.getPatientReferrals(pid);
                if (res.success) setPatientReferrals(res.referrals || []);
            } catch (err) { /* ignore */ }
        };
        if (appointment) fetchPatientReferrals();
    }, [appointment]);

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
                toast.success('Surgery Plan created successfully!');
                setShowSurgeryPlanModal(false);
                setOperationRequired(false);
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

            // 3. Stage Prescription PDF for manual download
            const pdf = generatePrescriptionPDF(false);
            setPendingDownload({
                doc: pdf.doc,
                filename: pdf.filename,
                title: 'Prescription',
                navigateOnClose: true
            });
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
        doc.text('Consultation Receipt', 105, y, { align: 'center' }); y += 5;
        doc.setDrawColor(41, 128, 185); doc.setLineWidth(0.5);
        doc.line(14, y, 196, y); y += 8;
        doc.setTextColor(0); doc.setFont('helvetica', 'normal');

        const dateDisplay = new Date(appointment?.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        autoTable(doc, {
            startY: y,
            body: [
                ['Patient Name', pt.name || '-'],
                ['MRN / ID', pt.patientId || 'N/A'],
                ['Phone', pt.phone || '-'],
                ['Doctor', `Dr. ${appointment?.doctorName || user?.name || '-'}`],
                ['Date & Time', `${dateDisplay} @ ${appointment?.appointmentTime || '-'}`],
                ['Service', appointment?.serviceName || 'Consultation'],
                ['Consultation Fee', `Rs. ${Number(appointment?.amount || 0).toLocaleString('en-IN')}`],
                ['Payment Method', appointment?.paymentMethod || 'Cash'],
                ['Payment Status', (appointment?.paymentStatus || 'Paid').toUpperCase() + ' \u2713'],
            ],
            theme: 'grid',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
            bodyStyles: { fontSize: 10 },
            alternateRowStyles: { fillColor: [245, 249, 255] },
        });

        y = doc.lastAutoTable.finalY + 10;
        doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
        doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Doctor: Dr. ${appointment?.doctorName || user?.name || 'N/A'}`, 14, y);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
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

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📋' },
        { id: 'assistant_intake', label: 'Assistant Intake & Q&A', icon: '🩺' },
        { id: 'ipd_orders', label: 'IPD / Admission Orders', icon: '🏥' },
        { id: 'history', label: 'Past Visits', icon: '📜' },
        { id: 'reports', label: 'Reports & Files', icon: '📁' },
    ];

    // Dynamic Form Tabs Injection
    let dynamicTabs = [];
    if (dynamicLibrary) {
        const docDept = user?.department || user?._roleData?.department || '';
        const apptDept = appointment?.department || appointment?.serviceName || '';
        let targetDept = docDept || apptDept || '';
        const normalizedTarget = targetDept.toLowerCase().trim();

        const isGeneral = !normalizedTarget || 
                         normalizedTarget.includes('general') || 
                         normalizedTarget === 'unassigned';

        let allowedDepts = [];

        if (isGeneral) {
            const generalMatch = Object.keys(dynamicLibrary).find(d => d.toLowerCase() === 'general' || d.toLowerCase() === 'general medicine');
            if (generalMatch) allowedDepts.push(generalMatch);
        } else {
            const exactMatch = Object.keys(dynamicLibrary).find(d => d.toLowerCase() === normalizedTarget);
            if (exactMatch) {
                allowedDepts.push(exactMatch);
            } else {
                const partialMatch = Object.keys(dynamicLibrary).find(d => 
                    d.toLowerCase().includes(normalizedTarget) || normalizedTarget.includes(d.toLowerCase())
                );
                if (partialMatch) allowedDepts.push(partialMatch);
            }
            
            // If specialty has no specific tabs in library, fallback to General
            if (allowedDepts.length === 0) {
                const generalMatch = Object.keys(dynamicLibrary).find(d => d.toLowerCase() === 'general' || d.toLowerCase() === 'general medicine');
                if (generalMatch) allowedDepts.push(generalMatch);
            }
        }
        
        allowedDepts.forEach(dept => {
            if (dynamicLibrary[dept]) {
                Object.keys(dynamicLibrary[dept]).forEach((catKey, i) => {
                    dynamicTabs.push({ 
                        id: `dyn_${dept.replace(/\s/g, '')}_${i}`, 
                        label: `${dept} - ${catKey}`, 
                        icon: '📋', 
                        data: dynamicLibrary[dept][catKey] 
                    });
                });
            }
        });
    }

    const allTabs = [...tabs, ...dynamicTabs];

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
            {/* Top Back Action */}
            <div className="dpd-top-actions">
                <button className="dpd-top-back-btn" onClick={() => navigate('/doctor/patients')}>
                    <FiArrowLeft className="dpd-top-back-icon" />
                    <span>Back to Patients</span>
                </button>
            </div>

            {pendingDownload && (
                <div style={{
                    margin: '0 0 16px',
                    padding: '12px 20px',
                    background: '#ecfdf5',
                    border: '1.5px solid #a7f3d0',
                    borderRadius: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)',
                    fontFamily: 'var(--font-primary)'
                }}>
                    <span style={{ color: '#065f46', fontWeight: 600, fontSize: '0.9rem' }}>
                        ✅ {pendingDownload.title || 'Document Generated'} — {pendingDownload.filename} is ready
                    </span>
                    <button
                        onClick={() => {
                            pendingDownload.doc.save(pendingDownload.filename);
                            setPendingDownload(null);
                            if (pendingDownload.navigateOnClose) navigate('/doctor/patients');
                        }}
                        style={{
                            padding: '8px 16px',
                            background: '#059669',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
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

            <div className="dpd-container" style={isJrDoctor ? { gridTemplateColumns: '1fr' } : {}}>
                <div className="dpd-left">
                    {/* Patient Card Top (Image 2 style) */}
                    <div className="dpd-patient-card-top">
                        <div className="dpd-patient-identity-clean">
                            <div className="dpd-patient-avatar-clean">
                                {(patient.name || 'P')[0].toUpperCase()}
                            </div>
                            <div className="dpd-patient-name-box">
                                <h2>{patient.name || 'Unknown Patient'}</h2>
                                <span className="dpd-active-patient-badge">
                                    <FiRefreshCw className="dpd-badge-refresh-icon" /> Active Patient
                                </span>
                            </div>
                        </div>

                        {/* 3-Col Key Metrics: MRN, Age, Gender */}
                        <div className="dpd-clean-stats-row">
                            <div className="dpd-stat-col">
                                <span className="dpd-stat-label">MRN</span>
                                <div className="dpd-stat-value">
                                    <span>{patient.patientId || 'PCF-M365-001'}</span>
                                    <button 
                                        type="button" 
                                        className="dpd-copy-icon-btn"
                                        onClick={() => {
                                            navigator.clipboard.writeText(patient.patientId || '');
                                            toast.success("MRN copied to clipboard!");
                                        }}
                                        title="Copy MRN"
                                    >
                                        <FiCopy />
                                    </button>
                                </div>
                            </div>
                            <div className="dpd-stat-col">
                                <span className="dpd-stat-label">
                                    <FiUser style={{ fontSize: '11px', color: '#64748b' }} /> Age
                                </span>
                                <div className="dpd-stat-value">
                                    <span>{profile.age || intakeData.age || '-'}</span>
                                </div>
                            </div>
                            <div className="dpd-stat-col">
                                <span className="dpd-stat-label">
                                    <span style={{ color: (profile.gender || intakeData.gender) === 'Female' ? '#ec4899' : '#3b82f6', fontWeight: 'bold' }}>♀</span> Gender
                                </span>
                                <div className="dpd-stat-value" style={{ color: (profile.gender || intakeData.gender) === 'Female' ? '#db2777' : '#2563eb' }}>
                                    <span>{profile.gender || intakeData.gender || '-'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Appointment Info Box */}
                        <div className="dpd-appt-clean-box">
                            <div className="dpd-appt-clean-item">
                                <div className="dpd-appt-circle-icon">
                                    <FiCalendar />
                                </div>
                                <div>
                                    <div className="dpd-appt-clean-val">{new Date(appointment?.appointmentDate || Date.now()).toLocaleDateString('en-IN')}</div>
                                    <div className="dpd-appt-clean-lbl">Last Visit</div>
                                </div>
                            </div>

                            <div className="dpd-appt-clean-item">
                                <div className="dpd-appt-circle-icon">
                                    <FiClock />
                                </div>
                                <div>
                                    <div className="dpd-appt-clean-val">{appointment?.appointmentTime || '13:00'}</div>
                                    <div className="dpd-appt-clean-lbl">Appointment Time</div>
                                </div>
                            </div>

                            <div className="dpd-appt-clean-status">
                                <span className={`dpd-clean-status-pill status-${appointment?.status || 'confirmed'}`}>
                                    {appointment?.status || 'Confirmed'} {isLocked && '🔒'}
                                </span>
                            </div>
                        </div>

                        {/* Visit Type Row */}
                        <div className="dpd-visit-type-card" onClick={() => setActiveTab('overview')}>
                            <div className="dpd-visit-type-left">
                                <div className="dpd-visit-user-icon">
                                    <FiUser />
                                </div>
                                <div>
                                    <div className="dpd-visit-type-title">{appointment?.serviceName || 'Walk-in Visit'}</div>
                                    <div className="dpd-visit-type-sub">
                                        {patientReferrals?.length > 0 ? `Referred (${patientReferrals.length} pending)` : 'No referral source'}
                                    </div>
                                </div>
                            </div>
                            <FiChevronRight className="dpd-visit-type-chevron" />
                        </div>

                    </div>

                    {/* ASSISTANT PREPARATION CARD */}
                    {assistantPrep && (() => {
                        const isReady = ['ready', 'ready_for_doctor'].includes(assistantPrep.status);
                        const isInProgress = ['in_progress', 'preparation_in_progress'].includes(assistantPrep.status);
                        const v = assistantPrep.vitals || {};
                        const hasVitals = Object.values(v).some(val => val !== null && val !== undefined && val !== '');
                        const noteContent = assistantPrep.draftClinicalNotes || assistantPrep.draftNotes;
                        const suggestions = (assistantPrep.investigationSuggestions && assistantPrep.investigationSuggestions.length > 0)
                            ? assistantPrep.investigationSuggestions
                            : (assistantPrep.suggestedInvestigations || []);
                        const rawAnswers = assistantPrep.questionnaireAnswers || appointment?.questionnaireAnswers || {};
                        const answers = Array.isArray(rawAnswers)
                            ? rawAnswers
                            : Object.entries(rawAnswers).map(([k, val]) => ({ questionId: k, questionText: k, response: val }));
                        const prepData = assistantPrep.preparation || {};
                        const hasHistory = prepData.chiefComplaint || prepData.historyOfPresentIllness || prepData.allergies || prepData.currentMedicines;

                        return (
                            <div className={`dpd-assistant-prep-card status-${isReady ? 'ready' : isInProgress ? 'in_progress' : 'draft'}`}>
                                <div className="dpd-assistant-prep-header">
                                    <div className="dpd-assistant-prep-title-wrap">
                                        <span className="dpd-assistant-prep-icon">🩺</span>
                                        <div>
                                            <div className="dpd-assistant-prep-title">
                                                <span>Assistant Clinical Preparation</span>
                                                <span className={`dpd-assistant-badge status-${isReady ? 'ready' : isInProgress ? 'in_progress' : 'draft'}`}>
                                                    {isReady ? '● Ready For Doctor' : isInProgress ? '● In Progress' : '● Draft'}
                                                </span>
                                            </div>
                                            <div className="dpd-assistant-prep-subtitle">
                                                Prepared by: <strong>{assistantPrep.preparedBy?.name || 'Doctor Assistant'}</strong>
                                                {(assistantPrep.readyAt || assistantPrep.markedReadyAt) && ` • Ready at ${new Date(assistantPrep.readyAt || assistantPrep.markedReadyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                                {assistantPrep.updatedAt && !(assistantPrep.readyAt || assistantPrep.markedReadyAt) && ` • Updated at ${new Date(assistantPrep.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="dpd-assistant-prep-actions">
                                        {hasVitals && (
                                            <button 
                                                type="button" 
                                                className="dpd-asst-action-btn asst-btn-vitals" 
                                                onClick={handleAcceptVitals}
                                                title="Accept and apply assistant-recorded vitals into current session"
                                            >
                                                <FiCheck className="btn-icon" /> Accept Vitals
                                            </button>
                                        )}

                                        {noteContent && (
                                            <button 
                                                type="button" 
                                                className="dpd-asst-action-btn asst-btn-notes" 
                                                onClick={handleImportNotes}
                                                title="Import assistant draft notes into clinical notes"
                                            >
                                                <FiFileText className="btn-icon" /> Import Notes
                                            </button>
                                        )}

                                        {suggestions.length > 0 && (
                                            <button 
                                                type="button" 
                                                className="dpd-asst-action-btn asst-btn-tests" 
                                                onClick={handleAddSuggestedInvestigations}
                                                title="Add suggested tests to lab orders"
                                            >
                                                <FiActivity className="btn-icon" /> Add Tests ({suggestions.length})
                                            </button>
                                        )}

                                        {(answers.length > 0 || hasHistory) && (
                                            <button 
                                                type="button" 
                                                className="dpd-asst-action-btn asst-btn-answers" 
                                                onClick={handleImportAllIntakeToNotes}
                                                title="Import all intake questions and answers into clinical notes"
                                            >
                                                <FiClipboard className="btn-icon" /> Import All Q&A
                                            </button>
                                        )}

                                        {answers.length > 0 && (
                                            <button 
                                                type="button" 
                                                className="dpd-asst-action-btn asst-btn-answers" 
                                                onClick={() => setShowAnswersModal(true)}
                                                title="View department questionnaire responses"
                                            >
                                                <FiClipboard className="btn-icon" /> View Dept Answers ({answers.length})
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Vitals Summary Strip */}
                                {hasVitals && (
                                    <div className="dpd-assistant-vitals-strip">
                                        {(v.bp || v.bloodPressure) && (
                                            <div className="dpd-asst-vital-pill">
                                                <span className="pill-lbl">BP:</span>
                                                <span className="pill-val">{v.bp || v.bloodPressure}</span>
                                            </div>
                                        )}
                                        {(v.pulse || v.pulseRate) && (
                                            <div className="dpd-asst-vital-pill">
                                                <span className="pill-lbl">Pulse:</span>
                                                <span className="pill-val">{v.pulse || v.pulseRate} bpm</span>
                                            </div>
                                        )}
                                        {(v.temperature || v.temp) && (
                                            <div className="dpd-asst-vital-pill">
                                                <span className="pill-lbl">Temp:</span>
                                                <span className="pill-val">{v.temperature || v.temp} °F</span>
                                            </div>
                                        )}
                                        {v.spo2 && (
                                            <div className="dpd-asst-vital-pill">
                                                <span className="pill-lbl">SpO2:</span>
                                                <span className="pill-val">{v.spo2}%</span>
                                            </div>
                                        )}
                                        {v.weight && (
                                            <div className="dpd-asst-vital-pill">
                                                <span className="pill-lbl">Weight:</span>
                                                <span className="pill-val">{v.weight} kg</span>
                                            </div>
                                        )}
                                        {v.bmi && (
                                            <div className="dpd-asst-vital-pill">
                                                <span className="pill-lbl">BMI:</span>
                                                <span className="pill-val">{v.bmi}</span>
                                            </div>
                                        )}
                                        {v.bloodSugar && (
                                            <div className="dpd-asst-vital-pill">
                                                <span className="pill-lbl">Sugar:</span>
                                                <span className="pill-val">{v.bloodSugar} mg/dL</span>
                                            </div>
                                        )}
                                        {v.painScore && (
                                            <div className="dpd-asst-vital-pill">
                                                <span className="pill-lbl">Pain:</span>
                                                <span className="pill-val">{v.painScore}/10</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Chief Complaint & Key Intake Strip */}
                                {(prepData.chiefComplaint || prepData.allergies || prepData.currentMedicines) && (
                                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {prepData.chiefComplaint && (
                                            <div>
                                                <strong style={{ color: '#0f172a' }}>Chief Complaint: </strong>
                                                <span style={{ color: '#334155' }}>{prepData.chiefComplaint}</span>
                                            </div>
                                        )}
                                        {prepData.allergies && (
                                            <div>
                                                <strong style={{ color: '#dc2626' }}>Allergies: </strong>
                                                <span style={{ color: '#dc2626', fontWeight: 600 }}>{prepData.allergies}</span>
                                            </div>
                                        )}
                                        {prepData.currentMedicines && (
                                            <div>
                                                <strong style={{ color: '#0284c7' }}>Current Meds: </strong>
                                                <span style={{ color: '#334155' }}>{prepData.currentMedicines}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Questionnaire Answers Inline Preview */}
                                {answers.length > 0 && (
                                    <div style={{ marginTop: '4px', borderTop: '1px dashed #e2e8f0', paddingTop: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                📋 Intake Questionnaire Responses ({answers.length})
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('assistant_intake')}
                                                style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                            >
                                                Open Full Intake Tab →
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                                            {answers.slice(0, 5).map((aItem, aIdx) => {
                                                const respStr = Array.isArray(aItem.response)
                                                    ? aItem.response.join(', ')
                                                    : (typeof aItem.response === 'object' ? JSON.stringify(aItem.response) : String(aItem.response || '—'));
                                                return (
                                                    <div key={aIdx} style={{ background: '#fff', border: '1px solid #edf2f7', borderRadius: '8px', padding: '8px 12px', fontSize: '12.5px' }}>
                                                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '2px' }}>
                                                            {aItem.questionText || aItem.questionId}
                                                        </div>
                                                        <div style={{ color: '#0369a1', fontWeight: 600 }}>
                                                            → {respStr}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {answers.length > 5 && (
                                                <div style={{ textAlign: 'center', fontSize: '11.5px', color: '#64748b' }}>
                                                    + {answers.length - 5} more questions answered. <button type="button" onClick={() => setActiveTab('assistant_intake')} style={{ background: 'none', border: 'none', color: '#0284c7', fontWeight: 600, cursor: 'pointer' }}>View All</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                {/* Tabs Navigation */}
                <div className="dpd-tabs-container">
                    <button className="dpd-tab-scroll-btn" onClick={() => scrollTabs('left')} title="Scroll Left">‹</button>
                    <div className="dpd-tabs-nav" ref={tabsRef}>
                        {allTabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`dpd-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <span className="dpd-tab-icon">{tab.icon}</span>
                                <span className="dpd-tab-label">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                    <button className="dpd-tab-scroll-btn" onClick={() => scrollTabs('right')} title="Scroll Right">›</button>
                </div>

                {/* Tab Content */}
                <div className="dpd-tab-content">
                    {/* OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">📋 Patient Overview</h3>
                            <div className="dpd-overview-grid">
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Full Name</span>
                                    <span className="dpd-ov-value">{patient.name || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Phone</span>
                                    <span className="dpd-ov-value">{patient.phone || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Email</span>
                                    <span className="dpd-ov-value">{patient.email || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Age</span>
                                    <span className="dpd-ov-value">{profile.age || intakeData.age || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Gender</span>
                                    <span className="dpd-ov-value">{profile.gender || intakeData.gender || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Blood Group</span>
                                    <span className="dpd-ov-value">{profile.bloodGroup || intakeData.bloodGroup || '-'}</span>
                                </div>
                                {(() => {
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

                                    const isValAvailable = (val) => {
                                        return val && val !== '-' && val !== 'None' && val.toString().trim() !== '';
                                    };

                                    return (
                                        <>
                                            {isValAvailable(vitalsInfo.height) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Height</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.height} cm</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.weight) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Weight</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.weight} kg</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.bmi) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">BMI</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.bmi}</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.bp) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Blood Pressure</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.bp}</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.pulse) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Pulse Rate</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.pulse} bpm</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.rr) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Respiratory Rate</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.rr} breaths/min</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.temp) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Temperature</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.temp} °F</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.spo2) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Oxygen Saturation (SpO₂)</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.spo2}%</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.bloodSugar) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Blood Sugar</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.bloodSugar}</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.heartRate) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Heart Rate</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.heartRate} bpm</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.painScale) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Pain Scale</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.painScale} / 10</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.allergies) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Allergies</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.allergies}</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.medications) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Current Medications</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.medications}</span>
                                                </div>
                                            )}
                                            {isValAvailable(vitalsInfo.history) && (
                                                <div className="dpd-ov-card">
                                                    <span className="dpd-ov-label">Medical History</span>
                                                    <span className="dpd-ov-value">{vitalsInfo.history}</span>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Address</span>
                                    <span className="dpd-ov-value">{patient.address || profile.address || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Reason for Visit</span>
                                    <span className="dpd-ov-value">{profile.reasonForVisit || intakeData.reasonForVisit || '-'}</span>
                                </div>
                            </div>

                            {/* Partner Quick Info */}
                            {(profile.partnerFirstName || intakeData.partnerFirstName) && (
                                <div className="dpd-partner-quick">
                                    <h4>👫 Spouse/Partner Info</h4>
                                    <div className="dpd-overview-grid">
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Name</span>
                                            <span className="dpd-ov-value">{profile.partnerFirstName || intakeData.partnerFirstName || '-'} {profile.partnerLastName || intakeData.partnerLastName || ''}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Phone</span>
                                            <span className="dpd-ov-value">{profile.partnerMobile || intakeData.partnerMobile || '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Age</span>
                                            <span className="dpd-ov-value">{profile.partnerAge || intakeData.partnerAge || profile.husbandAge || intakeData.husbandAge || '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Blood Group</span>
                                            <span className="dpd-ov-value">{profile.partnerBloodGroup || intakeData.partnerBloodGroup || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ASSISTANT INTAKE & QUESTIONNAIRE TAB */}
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

                    {/* PAST VISITS HISTORY */}
                    {activeTab === 'history' && (() => {
                        const currentDept = (appointment?.department || appointment?.serviceName || '').toLowerCase();
                        const filteredHistory = history.filter(h => {
                            if (!currentDept) return true;
                            if (h._id === appointmentId) return true;
                            const hDept = (h.department || h.serviceName || h.doctorConsultation?.department || '').toLowerCase();
                            return hDept === currentDept;
                        });
                        return (
                            <div className="dpd-tab-panel">
                                <h3 className="dpd-panel-title">📜 Previous Consultations ({filteredHistory.length})</h3>
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
                                                if (h._id === appointmentId) setViewingPastSession(null);
                                                else setViewingPastSession(viewingPastSession && viewingPastSession._id === h._id ? null : h);
                                            }}
                                            style={{ cursor: 'pointer', transition: 'all 0.2s', border: viewingPastSession && viewingPastSession._id === h._id ? '2px solid #3b82f6' : '' }}
                                        >
                                            {viewingPastSession && viewingPastSession._id === h._id && (
                                                <div style={{ background: '#3b82f6', color: '#fff', padding: '2px 8px', fontSize: '11px', borderRadius: '4px', display: 'inline-block', marginBottom: '8px', fontWeight: 'bold' }}>
                                                    👁️ Viewing Right Now
                                                </div>
                                            )}
                                            <div className="dpd-hist-top">
                                                <span className="dpd-hist-date">
                                                    {new Date(h.appointmentDate || h.visitDate || h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <span className={`dpd-hist-status status-${h.status}`}>{h.status}</span>
                                            </div>
                                            {/* Diagnosis */}
                                            <div className="dpd-hist-diagnosis">
                                                <strong>Diagnosis:</strong>{' '}
                                                {h.doctorConsultation?.diagnosis?.length > 0
                                                    ? h.doctorConsultation.diagnosis.join(', ')
                                                    : (h.diagnosis || 'No diagnosis recorded')}
                                            </div>
                                            {/* Notes */}
                                            {(h.doctorConsultation?.clinicalNotes || h.doctorNotes) && (
                                                <div className="dpd-hist-notes">
                                                    <strong>Notes:</strong> {h.doctorConsultation?.clinicalNotes || h.doctorNotes}
                                                </div>
                                            )}
                                            {/* Prescription / Medicines */}
                                            {(h.doctorConsultation?.prescription?.length > 0 || h.pharmacy?.length > 0) && (
                                                <div className="dpd-hist-notes">
                                                    <strong>💊 Medicines:</strong>{' '}
                                                    {h.doctorConsultation?.prescription?.length > 0
                                                        ? h.doctorConsultation.prescription.map(p => `${p.medicine} (${p.dosage}, ${p.duration})`).join(' · ')
                                                        : h.pharmacy.map(p => `${p.medicineName} (${p.frequency || p.dose || '-'}, ${p.duration || p.days || '-'} days)`).join(' · ')}
                                                </div>
                                            )}
                                            {/* Lab Tests */}
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
                    );
                })()}

                    {/* IPD / ADMISSION ORDERS TAB */}
                    {activeTab === 'ipd_orders' && (() => {
                        const resolvedPt = appointment?.userId || appointment?.clinicPatientId || {};
                        const resolvedPtId = resolvedPt?._id || appointment?.userId?._id || appointment?.clinicPatientId?._id || (typeof appointment?.clinicPatientId === 'string' ? appointment.clinicPatientId : null) || (typeof appointment?.userId === 'string' ? appointment.userId : null) || (typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/) ? id : null) || id;
                        return (
                            <DoctorIPDOrdersPanel
                                patientId={resolvedPtId}
                                patient={resolvedPt}
                                appointment={appointment}
                                currentUser={user}
                            />
                        );
                    })()}

                    {/* REPORTS & FILES TAB */}
                    {activeTab === 'reports' && (
                        <AppointmentReports appointmentId={appointment?._id} prescriptions={appointment?.prescriptions} />
                    )}

                    {/* DYNAMIC FORMS RENDERER */}
                    {dynamicTabs.map(dTab => (
                        activeTab === dTab.id && (
                            <div key={dTab.id} style={{ display: 'block' }}>
                                <DynamicQuestionForm
                                    categoryName={dTab.label}
                                    questions={dTab.data}
                                    intakeData={intakeData}
                                    setIntakeData={setIntakeData}
                                    readOnly={isLocked}
                                />
                                {!isLocked && (
                                    <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving} style={{ marginTop: '20px' }}>
                                        {saving ? 'Saving...' : `💾 Save ${dTab.label} Data`}
                                    </button>
                                )}
                            </div>
                        )
                    ))}
                </div>
            </div>

            {/* RIGHT PANEL - SESSION NOTEPAD */}
            {!isJrDoctor && (
                <div className={`dpd-right ${viewingPastSession ? 'time-machine-active' : ''}`} style={viewingPastSession ? { background: '#f8fafc', borderLeft: '4px solid #3b82f6' } : {}}>
                    {viewingPastSession ? (
                    <>
                        <div className="dpd-right-header" style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h2 style={{ color: '#1e3a8a' }}>🕰️ Past Session</h2>
                                    <span style={{ fontSize: '12px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>Read-only</span>
                                </div>
                                <p className="dpd-right-subtitle" style={{ color: '#3b82f6', fontWeight: 600 }}>
                                    Viewing notes from {new Date(viewingPastSession.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                            <button
                                onClick={() => setViewingPastSession(null)}
                                style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                ✕ Exit Time Machine
                            </button>
                        </div>

                        <div className="dpd-right-content">
                            <div className="dpd-session-field">
                                <label>🔍 Diagnosis at the time</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155' }}>
                                    {viewingPastSession.diagnosis || <em style={{ color: '#94a3b8' }}>No diagnosis recorded</em>}
                                </div>
                            </div>

                            <div className="dpd-session-field">
                                <label>📋 Clinical Notes</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155', minHeight: '80px', whiteSpace: 'pre-wrap' }}>
                                    {viewingPastSession.doctorNotes || <em style={{ color: '#94a3b8' }}>No notes recorded</em>}
                                </div>
                            </div>

                            <div className="dpd-session-field">
                                <label>💊 Prescription Given</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155', minHeight: '60px' }}>
                                    {viewingPastSession.pharmacy?.length > 0 ? (
                                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                            {viewingPastSession.pharmacy.map((p, i) => (
                                                <li key={i}><strong>{p.medicineName}</strong></li>
                                            ))}
                                        </ul>
                                    ) : <em style={{ color: '#94a3b8' }}>No prescription recorded</em>}
                                </div>
                            </div>

                            <div className="dpd-session-field">
                                <label>🧪 Lab Tests Ordered</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155' }}>
                                    {(viewingPastSession.labTests || []).length > 0
                                        ? (viewingPastSession.labTests || []).join(', ')
                                        : <em style={{ color: '#94a3b8' }}>No lab tests ordered</em>}
                                </div>
                            </div>
                        </div>

                        <div className="dpd-right-footer" style={{ background: '#f1f5f9' }}>
                            <button
                                onClick={() => {
                                    setSessionData({
                                        diagnosis: viewingPastSession.diagnosis || '',
                                        notes: viewingPastSession.doctorNotes || '',
                                        prescription: viewingPastSession.pharmacy?.map(p => p.medicineName).join('\n') || '',
                                        labTests: (viewingPastSession.labTests || []).join(', ')
                                    });
                                    setViewingPastSession(null);
                                    toast.success("Historical data copied into your Current Session editor!");
                                }}
                                style={{ padding: '10px 18px', background: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                📋 Copy to Current Session
                            </button>
                            <button className="dpd-btn-finish" onClick={() => setViewingPastSession(null)} style={{ background: '#64748b' }}>
                                Return to Current Editing
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="dpd-right-header">
                            <div className="dpd-session-title-wrap">
                                <div className="dpd-session-head-icon">
                                    <FiFileText />
                                </div>
                                <div>
                                    <h2>Current Session</h2>
                                    <p className="dpd-right-subtitle">Record diagnosis, notes & prescription</p>
                                </div>
                            </div>
                            <span className={`dpd-clean-session-status status-${appointment.status}`}>
                                <FiCheck className="dpd-status-check-icon" /> {appointment.status}
                            </span>
                        </div>

                        <div className="dpd-right-content">
                            <div className="dpd-session-field">
                                <label>🩺 Diagnosis</label>
                                <input
                                    ref={diagnosisInputRef}
                                    name="diagnosis"
                                    value={sessionData.diagnosis}
                                    onChange={handleSessionChange}
                                    placeholder="Enter diagnosis..."
                                    className="dpd-diag-input"
                                    disabled={isLocked}
                                />
                            </div>

                            <div className="dpd-session-field dpd-notes-field">
                                <label>📋 Clinical Notes</label>
                                <textarea
                                    ref={notesTextareaRef}
                                    name="notes"
                                    value={sessionData.notes}
                                    onChange={handleSessionChange}
                                    placeholder="Write detailed clinical notes, observations, examination findings..."
                                    className="dpd-notes-textarea"
                                    disabled={isLocked}
                                />
                            </div>

                            {!isLocked && (
                                <div className="dpd-operation-card-clean">
                                    <div className="dpd-op-header-row">
                                        <div className="dpd-op-header-left">
                                            <FiChevronRight className="dpd-op-arrow" />
                                            <FiUser className="dpd-op-icon" />
                                            <span>Operation Required?</span>
                                        </div>
                                        <label className="dpd-switch" title="Toggle Operation Requirement">
                                            <input
                                                type="checkbox"
                                                name="operationRequired"
                                                checked={operationRequired}
                                                onChange={e => setOperationRequired(e.target.checked)}
                                            />
                                            <span className="dpd-slider"></span>
                                        </label>
                                    </div>

                                    {/* Referral Banner for referred doctor */}
                                    {patientReferrals.filter(r => r.status === 'REFERRED' && (r.referredToDoctorId?._id === user?._id || r.referredToDoctorId === user?._id)).length > 0 && (
                                        <div className="referral-banner" style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', padding: '14px', borderRadius: '12px', border: '2px solid #f59e0b', margin: '12px 0' }}>
                                            <div style={{ fontWeight: '700', color: '#92400e', fontSize: '14px', marginBottom: '8px' }}>📋 Surgery Referral Pending</div>
                                            {patientReferrals.filter(r => r.status === 'REFERRED' && (r.referredToDoctorId?._id === user?._id || r.referredToDoctorId === user?._id)).map(ref => (
                                                <div key={ref._id} style={{ marginBottom: '8px' }}>
                                                    <div style={{ fontSize: '13px', color: '#78350f' }}>
                                                        <strong>From:</strong> {ref.referringDoctorId?.name || 'Unknown'} &nbsp;|&nbsp;
                                                        <strong>Reason:</strong> {ref.reason}
                                                    </div>
                                                    <button 
                                                        onClick={() => { setActiveReferralForReview(ref); setShowReferralReviewModal(true); }}
                                                        style={{ marginTop: '6px', padding: '6px 16px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                                                    >
                                                        Review Referral
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {operationRequired && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    setSurgeryPlanData(prev => ({ 
                                                        ...prev, 
                                                        diagnosis: sessionData.diagnosis || prev.diagnosis || '',
                                                        surgeonId: prev.surgeonId || user?._id || user?.id || ''
                                                    }));
                                                    setShowSurgeryPlanModal(true);
                                                }}
                                                style={{ padding: '12px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', width: '100%', fontSize: '14px', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}
                                            >
                                                + Create Surgery Plan (Self / Direct)
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    setReferralData(prev => ({ 
                                                        ...prev, 
                                                        reason: sessionData.diagnosis || ''
                                                    }));
                                                    setShowReferralModal(true);
                                                }}
                                                style={{ padding: '12px 20px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', width: '100%', fontSize: '14px', boxShadow: '0 2px 8px rgba(124,58,237,0.25)' }}
                                            >
                                                🔄 Refer for Surgery (To Another Doctor)
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="dpd-session-field">
                                {!isLocked && (
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowPrescribeModal(true)}
                                            style={{ flex: 1, minWidth: '200px', padding: '13px 16px', fontSize: '14px', background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 3px 10px rgba(79, 70, 229, 0.22)' }}
                                        >
                                            💊 Prescribe Medicines & Lab Tests
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('ipd_orders')}
                                            style={{
                                                padding: '13px 18px',
                                                fontSize: '14px',
                                                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '10px',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                boxShadow: '0 3px 10px rgba(2, 132, 199, 0.22)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            🏥 IPD Orders
                                        </button>
                                    </div>
                                )}

                                {(sessionData.medicines?.length > 0 || sessionData.labTests || (isLocked && appointment.pharmacy?.length > 0)) && (
                                    <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', marginTop: '10px', fontSize: '13px', color: '#475569' }}>
                                        {(sessionData.medicines?.length > 0 || (isLocked && appointment.pharmacy?.length > 0)) && <div style={{ marginBottom: '4px' }}><b>✅ Medicines included ({sessionData.medicines?.length || appointment.pharmacy?.length || 0})</b></div>}
                                        {(sessionData.labTests || (isLocked && appointment.labTests?.length > 0)) && <div><b>✅ Lab Tests included</b></div>}
                                        {!isLocked && (
                                            <div style={{ marginTop: '6px', fontSize: '12px', color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setShowPrescribeModal(true)}>
                                                Click to view / edit prescription details →
                                            </div>
                                        )}
                                        {isLocked && (
                                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '12px' }}>
                                                Check the Consultation Report (PDF) for full history.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="dpd-right-footer">
                            {!isLocked ? (
                                <>
                                    <button className="dpd-btn-save-draft" onClick={handleSaveProfile} disabled={saving}>
                                        <FiSave style={{ marginRight: '6px', fontSize: '16px' }} /> Save Profile
                                    </button>
                                    <button className="dpd-btn-finish" onClick={handleSaveAndMerge} disabled={saving}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                            <span>✨</span>
                                            <span>{saving ? 'Saving...' : 'Save & Generate Prescription'}</span>
                                            <FiArrowRight style={{ fontSize: '16px' }} />
                                        </span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        className="dpd-btn-save-draft"
                                        onClick={generatePrescriptionPDF}
                                    >
                                        📄 Reprint Prescription
                                    </button>
                                    <button className="dpd-btn-finish" onClick={() => navigate('/doctor/patients')} style={{ background: '#64748b' }}>
                                        ← Back to Queue
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
            )}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.4rem', fontWeight: '800' }}>🔪 Create Surgery Plan</h3>
                            <button onClick={() => setShowSurgeryPlanModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#475569' }}>✕</button>
                        </div>
                        
                        <form onSubmit={handleCreateSurgeryPlan} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', color: '#334155' }}>
                                <strong>Patient:</strong> {intakeData?.name || appointment?.userId?.name || appointment?.patientId || 'N/A'} <br/>
                                <strong>MRN / Age / Gender:</strong> {intakeData?.patientUid || appointment?.userId?.patientId || '-'} / {intakeData?.age || '-'} / {intakeData?.gender || '-'}
                            </div>

                            {surgeryPlanData.referralId && (
                                <div style={{ background: '#f5f3ff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd6fe', fontSize: '13px', color: '#5b21b6', fontWeight: 600 }}>
                                    🔄 <strong>Referred Surgery Case</strong> (Referral linked to this Surgery Plan)
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#475569' }}>Surgery / Procedure *</label>
                                <input required value={surgeryPlanData.surgery} onChange={e => setSurgeryPlanData(prev => ({...prev, surgery: e.target.value}))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#475569' }}>Diagnosis / Reason</label>
                                <input value={surgeryPlanData.diagnosis} onChange={e => setSurgeryPlanData(prev => ({...prev, diagnosis: e.target.value}))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#475569' }}>Surgeon *</label>
                                <select required value={surgeryPlanData.surgeonId} onChange={e => setSurgeryPlanData(prev => ({...prev, surgeonId: e.target.value}))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', background: '#fff' }}>
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

                            <div style={{ display: 'flex', gap: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#475569' }}>Preferred Date *</label>
                                    <input type="date" required min={new Date().toISOString().split('T')[0]} value={surgeryPlanData.preferredDate} onChange={e => setSurgeryPlanData(prev => ({...prev, preferredDate: e.target.value}))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#475569' }}>Preferred Time *</label>
                                    <input type="time" required value={surgeryPlanData.preferredTime} onChange={e => setSurgeryPlanData(prev => ({...prev, preferredTime: e.target.value}))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={surgeryPlanData.admissionRequired} onChange={e => setSurgeryPlanData(prev => ({...prev, admissionRequired: e.target.checked}))} />
                                    Admission Required
                                </label>
                            </div>

                            {surgeryPlanData.admissionRequired && (
                                <div>
                                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#475569' }}>Admission Date *</label>
                                    <input type="date" required={surgeryPlanData.admissionRequired} value={surgeryPlanData.admissionDate} onChange={e => setSurgeryPlanData(prev => ({...prev, admissionDate: e.target.value}))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={surgeryPlanData.preOpRequired} onChange={e => setSurgeryPlanData(prev => ({...prev, preOpRequired: e.target.checked}))} />
                                    Pre-Operative Preparation Required
                                </label>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#475569' }}>Notes</label>
                                <textarea value={surgeryPlanData.notes} onChange={e => setSurgeryPlanData(prev => ({...prev, notes: e.target.value}))} placeholder="Any specific requirements..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', minHeight: '80px' }} />
                            </div>

                            <div style={{ marginTop: '10px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button type="button" onClick={() => setShowSurgeryPlanModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                                <button type="submit" style={{ padding: '10px 24px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Save Surgery Plan</button>
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