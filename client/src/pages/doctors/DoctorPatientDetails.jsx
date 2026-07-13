import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doctorAPI, labTestAPI, questionLibraryAPI, hospitalAPI, patientAPI, receptionAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './DoctorPatientDetails.css';
import DynamicQuestionForm from '../../components/DynamicQuestionForm';
import { useAuth } from '../../store/hooks';

import AppointmentReports from '../../components/AppointmentReports';

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
    const { appointmentId } = useParams();
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
    const [toast, setToast] = useState({ show: false, message: '', title: '' });

    // Modal States
    const [showPrescribeModal, setShowPrescribeModal] = useState(false);
    const [pendingDownload, setPendingDownload] = useState(null);

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
            try {
                const res = await doctorAPI.getAppointmentDetails(appointmentId);
                if (res.success) {
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
                        setToast({
                            show: true,
                            title: '✅ Session Completed Successfully',
                            message: 'This consultation has already been completed. This record is now read-only.'
                        });
                        setTimeout(() => {
                            setToast(prev => ({ ...prev, show: false }));
                        }, 3000);
                    }

                    const pId = res.appointment.clinicPatientId?._id || res.appointment.clinicPatientId || res.appointment.userId?._id;
                    if (pId) {
                        const histRes = await doctorAPI.getPatientHistory(pId);
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
                }
            } catch (err) { console.error(err); }

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
    }, [appointmentId]);

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

    const handleSaveProfile = async () => {
        const patientId = appointment?.clinicPatientId?._id || appointment?.userId?._id;
        if (!patientId) return;
        setSaving(true);
        try {
            await doctorAPI.updatePatientProfile(patientId, intakeData);
            alert("✅ Patient profile saved successfully!");
        } catch (err) {
            alert("Error saving profile: " + (err.response?.data?.message || err.message));
        } finally { setSaving(false); }
    };

    const handleSaveAndMerge = async () => {
        if (!window.confirm("Save all changes and finish session?")) return;
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
            setToast({
                show: true,
                title: '✅ Session Completed Successfully',
                message: 'This consultation has already been completed. This record is now read-only.'
            });
            setTimeout(() => {
                setToast(prev => ({ ...prev, show: false }));
            }, 3000);

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
            alert("Error: " + (err.response?.data?.message || err.message));
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
        { id: 'history', label: 'Past Visits', icon: '📜' },
        { id: 'reports', label: 'Reports & Files', icon: '📁' },
    ];

    // Dynamic Form Tabs Injection
    let dynamicTabs = [];
    if (dynamicLibrary) {
        let allowedDepts = hospitalDepartments.length > 0 ? hospitalDepartments : Object.keys(dynamicLibrary);
        
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

    return (
        <div className="dpd-container" style={isJrDoctor ? { gridTemplateColumns: '1fr' } : {}}>
            <div className="dpd-left">
                {pendingDownload && (
                    <div style={{
                        margin: '12px',
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
                {/* Patient Header Card */}
                <div className="dpd-patient-header">
                    <button className="dpd-back-link" onClick={() => navigate('/doctor/patients')}>
                        ← Back
                    </button>
                    <div className="dpd-patient-identity">
                        <div className="dpd-patient-avatar">
                            {(patient.name || 'P')[0].toUpperCase()}
                        </div>
                        <div className="dpd-patient-meta">
                            <h2>{patient.name || 'Unknown Patient'}</h2>
                            <div className="dpd-patient-tags">
                                <span className="dpd-tag tag-mrn">MRN: {patient.patientId || 'N/A'}</span>
                                <span className="dpd-tag tag-phone">📱 {patient.phone || '-'}</span>
                                {profile.age && <span className="dpd-tag tag-age">Age: {profile.age}</span>}
                                {profile.gender && <span className="dpd-tag tag-gender">{profile.gender}</span>}
                                {profile.bloodGroup && <span className="dpd-tag tag-blood">{profile.bloodGroup}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="dpd-appt-info">
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Date</span>
                            <span className="dpd-appt-value">{new Date(appointment.appointmentDate).toLocaleDateString('en-IN')}</span>
                        </div>
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Time</span>
                            <span className="dpd-appt-value">{appointment.appointmentTime}</span>
                        </div>
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Status</span>
                            <span className={`dpd-appt-status status-${appointment.status}`}>
                                {appointment.status} {isLocked && '🔒 Locked'}
                            </span>
                        </div>
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Service</span>
                            <span className="dpd-appt-value">{appointment.serviceName || 'Consultation'}</span>
                        </div>
                    </div>
                    {/* Follow-up Card from Reception Dashboard */}
                    {currentFollowupStatus && (
                        <div style={{
                            display: 'flex', flexDirection: 'column',
                            background: currentFollowupStatus.active ? '#f0fdf4' : '#fef2f2',
                            border: '1px solid',
                            borderColor: currentFollowupStatus.active ? '#bbf7d0' : '#fecaca',
                            borderLeft: currentFollowupStatus.active ? '4px solid #22c55e' : '4px solid #ef4444',
                            borderRadius: '12px', padding: '12px 16px', minWidth: '160px', marginLeft: '16px'
                        }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: currentFollowupStatus.active ? '#166534' : '#991b1b', letterSpacing: '0.5px' }}>FOLLOW-UP</span>
                            <span style={{ fontSize: '18px', fontWeight: 'bold', color: currentFollowupStatus.active ? '#15803d' : '#b91c1c', marginTop: '4px' }}>
                                {currentFollowupStatus.active ? 'Active' : 'Expired'}
                            </span>
                            <span style={{ fontSize: '12px', color: currentFollowupStatus.active ? '#166534' : '#7f1d1d', marginTop: '6px' }}>
                                {currentFollowupStatus.active ? (() => {
                                    const remain = Math.max(0, Math.ceil((new Date(currentFollowupStatus.validUntil).getTime() - new Date().getTime()) / (1000 * 3600 * 24)));
                                    return `Valid: ${remain} Day${remain > 1 ? 's' : ''}`;
                                })() : `Last: ${currentFollowupStatus.lastConsultation ? new Date(currentFollowupStatus.lastConsultation).toLocaleDateString('en-IN') : 'N/A'}`}
                            </span>
                        </div>
                    )}
                </div>

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

                    {/* PAST VISITS HISTORY */}
                    {activeTab === 'history' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">📜 Previous Consultations ({history.length})</h3>
                            {history.length === 0 ? (
                                <div className="dpd-empty-hist">
                                    <p>No previous visits recorded.</p>
                                </div>
                            ) : (
                                <div className="dpd-history-list">
                                    {history.map(h => (
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
                    )}

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
                                    alert("Historical data copied into your Current Session editor!");
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
                            <div>
                                <h2>📝 Current Session</h2>
                                <p className="dpd-right-subtitle">Record diagnosis, notes & prescription</p>
                            </div>
                            <span className={`dpd-session-status status-${appointment.status}`}>
                                {appointment.status}
                            </span>
                        </div>

                        <div className="dpd-right-content">
                            <div className="dpd-session-field">
                                <label>🔍 Diagnosis</label>
                                <input
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
                                    name="notes"
                                    value={sessionData.notes}
                                    onChange={handleSessionChange}
                                    placeholder="Write detailed clinical notes, observations, examination findings..."
                                    className="dpd-notes-textarea"
                                    disabled={isLocked}
                                />
                            </div>

                            <div className="dpd-session-field">
                                {!isLocked && (
                                    <button
                                        type="button"
                                        onClick={() => setShowPrescribeModal(true)}
                                        style={{ padding: '14px', fontSize: '15px', background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(79, 70, 229, 0.25)', marginTop: '10px' }}
                                    >
                                        💊 / 🧪 Prescribe Medicines & Lab Tests
                                    </button>
                                )}

                                {(sessionData.medicines?.length > 0 || sessionData.labTests || (isLocked && appointment.pharmacy?.length > 0)) && (
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '10px', fontSize: '13px', color: '#475569' }}>
                                        {(sessionData.medicines?.length > 0 || (isLocked && appointment.pharmacy?.length > 0)) && <div style={{ marginBottom: '4px' }}><b>✅ Medicines included ({sessionData.medicines?.length || appointment.pharmacy?.length || 0})</b></div>}
                                        {(sessionData.labTests || (isLocked && appointment.labTests?.length > 0)) && <div><b>✅ Lab Tests included</b></div>}
                                        {!isLocked && (
                                            <div style={{ marginTop: '8px', fontSize: '12px', color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setShowPrescribeModal(true)}>
                                                Click above button to view/edit details.
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
                                        💾 Save Profile
                                    </button>
                                    <button className="dpd-btn-finish" onClick={handleSaveAndMerge} disabled={saving}>
                                        {saving ? '⏳ Saving...' : '✅ Save & Generate Prescription'}
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
            {toast.show && (
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
                        <div style={{ fontWeight: '700', color: '#065f46', fontSize: '15px' }}>{toast.title}</div>
                        <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.4' }}>{toast.message}</div>
                    </div>
                </>
            )}
        </div>
    );
};

export default DoctorPatientDetails;