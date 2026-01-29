import React, { useState, useEffect } from 'react';
import { receptionAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './ReceptionDashboard.css';

const ReceptionDashboard = () => {
    // --- STATES ---
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);

    // View State
    const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard', 'intake'
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [saving, setSaving] = useState(false);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    // Accordion State
    const [activeSection, setActiveSection] = useState('couple');

    const toggleSection = (section) => {
        setActiveSection(activeSection === section ? null : section);
    };

    // --- COMPREHENSIVE INTAKE STATE ---
    const [intakeForm, setIntakeForm] = useState({
        // A. Header Context
        coupleId: '', referredBy: '',

        // B. Female Patient (Personal)
        title: 'Mrs.', firstName: '', middleName: '', lastName: '',
        dob: '', age: '', gender: 'Female', maritalStatus: '', occupation: '',
        aadhaar: '', mobile: '', altPhone: '', email: '', patientCategory: '',
        address: '', area: '', city: '', state: '', country: '', pinCode: '',
        nationality: '', isInternational: false, language: '', languagesKnown: '',
        height: '', weight: '', bmi: '', bloodGroup: '',

        // C. Male Partner
        partnerTitle: 'Mr.', partnerFirstName: '', partnerLastName: '',
        partnerDob: '', partnerAge: '', partnerAadhaar: '',
        partnerMobile: '', partnerAltPhone: '', partnerEmail: '',
        partnerAddressSame: false, partnerAddress: '', partnerArea: '', partnerCity: '',
        partnerState: '', partnerCountry: '', partnerPinCode: '', partnerNationality: '',
        partnerHeight: '', partnerWeight: '', partnerBmi: '', partnerBloodGroup: '',

        // D. Visit Details
        reasonForVisit: '', speciality: '', doctor: '', referralType: '', visitDate: '', visitTime: '',

        // E. History Section
        infertilityType: '', chiefComplaint: '',
        historyPulse: '', historyBp: '', infertilityDuration: '', marriageDuration: '', generalComments: '',

        // F. Menstrual History
        lmpDate: '', menstrualRegularity: '', menstrualFlow: '', menstrualPain: '', cycleDetails: '',

        // G. Family & Medical
        familyHistory: '', medicalHistoryDiabetes: false, medicalHistoryHypertension: false,
        medicalHistoryThyroid: false, medicalHistoryHeart: false, medicalHistoryAsthma: false,
        medicalHistoryTb: false, medicalHistoryOther: '', medicalHistoryPcos: false,

        // H. Obstetric
        para: '', abortion: '', ectopic: '', liveBirth: '', recurrentLoss: false, obstetricComments: '',

        // I. Past Investigations
        pastInvestigations: '',

        // J. Partner History
        partnerBp: '', partnerMedicalComments: '',

        // L. Other History
        labResults: '', hormonalValues: '', usgRemarks: '', psychiatricHistory: '',
        sexualHistory: '', identificationMarks: '', addictionHistory: '',

        // M. Treatment History
        treatmentHistory: '',

        // N. Examination
        examGeneral: '', examSystemic: '', examBreast: '', examAbdomen: '', examSpeculum: '', examVaginal: '',
        hirsutism: '', galactorrhoea: '', papSmear: '',

        // O. USG
        usgType: '', afcRight: '', afcLeft: '', amh: '', uterusSize: '', uterusPosition: '',
        ovaryRightSize: '', ovaryLeftSize: '', endometriumThickness: '',

        // P. Diagnosis
        diagnosisInfertilityType: '', maleFactor: '', femaleFactor: '', diagnosisYears: '', diagnosisOthers: '',

        // Q. Doctor Notes
        doctorNotes: '',

        // S. Prescription
        prescriptionComments: '',

        // U. Procedure Advice
        procedureAdvice: '',

        // V. Follow Up
        followUpDate: ''
    });

    // --- EFFECTS ---
    useEffect(() => {
        fetchAppointments();
    }, []);

    const fetchAppointments = async () => {
        try {
            setLoading(true);
            const response = await receptionAPI.getAllAppointments();
            if (response.success) {
                setAppointments(response.appointments);
            }
        } catch (err) {
            console.error("Error fetching appointments:", err);
        } finally {
            setLoading(false);
        }
    };

    // --- ACTIONS ---
    const handleNewWalkIn = () => {
        setSelectedPatientId(null);
        // Reset Form - Explicitly set every field to ''
        setIntakeForm({
            coupleId: '', referredBy: '',
            title: 'Mrs.', firstName: '', middleName: '', lastName: '',
            dob: '', age: '', gender: 'Female', maritalStatus: '', occupation: '',
            aadhaar: '', mobile: '', altPhone: '', email: '', patientCategory: '',
            address: '', area: '', city: '', state: '', country: '', pinCode: '',
            nationality: '', isInternational: false, language: '', languagesKnown: '',
            height: '', weight: '', bmi: '', bloodGroup: '',
            partnerTitle: 'Mr.', partnerFirstName: '', partnerLastName: '',
            partnerDob: '', partnerAge: '', partnerAadhaar: '',
            partnerMobile: '', partnerAltPhone: '', partnerEmail: '',
            partnerAddressSame: false, partnerAddress: '', partnerArea: '', partnerCity: '',
            partnerState: '', partnerCountry: '', partnerPinCode: '', partnerNationality: '',
            partnerHeight: '', partnerWeight: '', partnerBmi: '', partnerBloodGroup: '',
            reasonForVisit: '', speciality: '', doctor: '', referralType: '', visitDate: '', visitTime: '',
            infertilityType: '', chiefComplaint: '',
            historyPulse: '', historyBp: '', infertilityDuration: '', marriageDuration: '', generalComments: '',
            lmpDate: '', menstrualRegularity: '', menstrualFlow: '', menstrualPain: '', cycleDetails: '',
            familyHistory: '', medicalHistoryDiabetes: false, medicalHistoryHypertension: false,
            medicalHistoryThyroid: false, medicalHistoryHeart: false, medicalHistoryAsthma: false,
            medicalHistoryTb: false, medicalHistoryOther: '', medicalHistoryPcos: false,
            para: '', abortion: '', ectopic: '', liveBirth: '', recurrentLoss: false, obstetricComments: '',
            pastInvestigations: '',
            partnerBp: '', partnerMedicalComments: '',
            labResults: '', hormonalValues: '', usgRemarks: '', psychiatricHistory: '',
            sexualHistory: '', identificationMarks: '', addictionHistory: '',
            treatmentHistory: '',
            examGeneral: '', examSystemic: '', examBreast: '', examAbdomen: '', examSpeculum: '', examVaginal: '',
            hirsutism: '', galactorrhoea: '', papSmear: '',
            usgType: '', afcRight: '', afcLeft: '', amh: '', uterusSize: '', uterusPosition: '',
            ovaryRightSize: '', ovaryLeftSize: '', endometriumThickness: '',
            diagnosisInfertilityType: '', maleFactor: '', femaleFactor: '', diagnosisYears: '', diagnosisOthers: '',
            doctorNotes: '',
            prescriptionComments: '',
            procedureAdvice: '',
            followUpDate: ''
        });
        setViewMode('intake');
    };

    const handleEditPatient = (patient) => {
        setSelectedPatientId(patient._id);
        const p = patient.fertilityProfile || {};

        // Helper to safely get value or default to empty string
        const getVal = (val) => (val !== undefined && val !== null) ? val : '';
        const getBool = (val) => val === true;

        setIntakeForm(prev => ({
            ...prev,
            // Root fields
            firstName: getVal(patient.name).split(' ')[0] || '',
            lastName: getVal(patient.name).split(' ').slice(1).join(' ') || '',
            mobile: getVal(patient.phone),
            email: getVal(patient.email),

            // Spread profile fields safely
            ...p,

            // Then override explicit fields to ensure safety
            partnerFirstName: getVal(p.partnerFirstName),
            partnerLastName: getVal(p.partnerLastName),
            medicalHistoryDiabetes: getBool(p.medicalHistoryDiabetes),
            medicalHistoryHypertension: getBool(p.medicalHistoryHypertension),
            medicalHistoryThyroid: getBool(p.medicalHistoryThyroid),
            medicalHistoryHeart: getBool(p.medicalHistoryHeart),
            medicalHistoryAsthma: getBool(p.medicalHistoryAsthma),
            medicalHistoryTb: getBool(p.medicalHistoryTb),
            medicalHistoryPcos: getBool(p.medicalHistoryPcos),
            isInternational: getBool(p.isInternational),
            partnerAddressSame: getBool(p.partnerAddressSame),
            recurrentLoss: getBool(p.recurrentLoss),
            medicalHistoryOther: getVal(p.medicalHistoryOther),
            examGeneral: getVal(p.examGeneral),
            examAbdomen: getVal(p.examAbdomen),
            doctorNotes: getVal(p.doctorNotes),
            infertilityType: getVal(p.infertilityType)
        }));
        setViewMode('intake');
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : value;

        // Auto-Calculate BMI
        if (name === 'height' || name === 'weight') {
            const h = name === 'height' ? value : intakeForm.height;
            const w = name === 'weight' ? value : intakeForm.weight;
            if (h && w) {
                const hM = h / 100;
                const bmi = (w / (hM * hM)).toFixed(2);
                setIntakeForm(prev => ({ ...prev, [name]: val, bmi }));
                return;
            }
        }
        // Partner BMI
        if (name === 'partnerHeight' || name === 'partnerWeight') {
            const h = name === 'partnerHeight' ? value : intakeForm.partnerHeight;
            const w = name === 'partnerWeight' ? value : intakeForm.partnerWeight;
            if (h && w) {
                const hM = h / 100;
                const bmi = (w / (hM * hM)).toFixed(2);
                setIntakeForm(prev => ({ ...prev, [name]: val, partnerBmi: bmi }));
                return;
            }
        }

        setIntakeForm(prev => ({ ...prev, [name]: val }));
    };

    // --- PDF GENERATION LOGIC ---
    const generatePDF = () => {
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.width;
            let yPos = 20;

            const addSectionTitle = (title) => {
                if (yPos > 270) { doc.addPage(); yPos = 20; }
                doc.setFillColor(240, 240, 240);
                doc.rect(14, yPos - 6, pageWidth - 28, 8, 'F');
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(String(title), 16, yPos);
                yPos += 10;
            };

            const addField = (label, value, x = 16) => {
                const valStr = String(value || '');
                if (!valStr.trim()) return;
                if (yPos > 280) { doc.addPage(); yPos = 20; }
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text(`${label}:`, x, yPos);
                doc.setFont('helvetica', 'normal');
                doc.text(valStr, x + 35, yPos);
            };

            // Header
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('Patient Clinical Record', 105, yPos, { align: 'center' });
            yPos += 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Generated: ${new Date().toLocaleString()}`, 105, yPos, { align: 'center' });
            yPos += 15;

            // Details
            addSectionTitle('Couple Details');
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Female Patient:', 16, yPos);
            yPos += 6;
            addField('Name', `${intakeForm.title} ${intakeForm.firstName} ${intakeForm.lastName}`, 16);
            addField('Age/Sex', `${intakeForm.age} / ${intakeForm.gender}`, 110);
            yPos += 6;
            addField('Mobile', intakeForm.mobile, 16);
            addField('BMI', intakeForm.bmi, 110);
            yPos += 10;

            doc.setFont('helvetica', 'bold');
            doc.text('Male Partner:', 16, yPos);
            yPos += 6;
            addField('Name', `${intakeForm.partnerTitle} ${intakeForm.partnerFirstName} ${intakeForm.partnerLastName}`, 16);
            addField('Age', intakeForm.partnerAge, 110);
            yPos += 6;
            addField('Mobile', intakeForm.partnerMobile, 16);
            addField('BMI', intakeForm.partnerBmi, 110);
            yPos += 12;

            addSectionTitle('Clinical History');
            const historyData = [
                ['Infertility Type', String(intakeForm.infertilityType || '-'), 'Duration', `${intakeForm.infertilityDuration || '-'} Years`],
                ['Marriage Duration', `${intakeForm.marriageDuration || '-'} Years`, 'LMP', String(intakeForm.lmpDate || '-')],
                ['Cycle', `${intakeForm.menstrualRegularity || '-'}, ${intakeForm.menstrualFlow || '-'}`, '', '']
            ];
            doc.autoTable({
                startY: yPos,
                head: [['Metric', 'Value', 'Metric', 'Value']],
                body: historyData,
                theme: 'plain',
                styles: { fontSize: 9, cellPadding: 2 },
                columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } },
                margin: { left: 16, right: 16 }
            });
            yPos = doc.lastAutoTable.finalY + 10;

            // Medical & Obstetric
            let medHistory = [];
            if (intakeForm.medicalHistoryDiabetes) medHistory.push('Diabetes');
            if (intakeForm.medicalHistoryHypertension) medHistory.push('Hypertension');
            if (intakeForm.medicalHistoryThyroid) medHistory.push('Thyroid');
            if (intakeForm.medicalHistoryPcos) medHistory.push('PCOS');
            if (intakeForm.medicalHistoryOther) medHistory.push(String(intakeForm.medicalHistoryOther));

            doc.setFont('helvetica', 'bold');
            doc.text('Medical History:', 16, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(medHistory.length > 0 ? medHistory.join(', ') : 'None Recorded', 50, yPos);
            yPos += 6;

            doc.setFont('helvetica', 'bold');
            doc.text('Obstetric:', 16, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(`G${intakeForm.para || '-'} P${intakeForm.liveBirth || '-'} A${intakeForm.abortion || '-'} E${intakeForm.ectopic || '-'}`, 50, yPos);
            yPos += 12;

            // --- 4. EXAMINATION ---
            addSectionTitle('Examination Findings');

            const examData = [
                ['General Exam', String(intakeForm.examGeneral || '-')],
                ['P/A & Pelvic', String(intakeForm.examAbdomen || '-')],
                ['USG Findings', `Uterus: ${intakeForm.uterusSize || '-'}, ET: ${intakeForm.endometriumThickness || '-'} mm`],
                ['Ovaries', `Right: ${intakeForm.ovaryRightSize || '-'}, Left: ${intakeForm.ovaryLeftSize || '-'}`],
                ['AFC', `Right: ${intakeForm.afcRight || '-'}, Left: ${intakeForm.afcLeft || '-'}`]
            ];

            doc.autoTable({
                startY: yPos,
                head: [['Parameter', 'Findings']],
                body: examData,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 3 },
                headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
                margin: { left: 16, right: 16 }
            });
            yPos = doc.lastAutoTable.finalY + 10;

            // --- 5. DIAGNOSIS & PLAN ---
            addSectionTitle('Diagnosis & Plan');

            doc.setFont('helvetica', 'bold');
            doc.text(`Diagnosis: ${intakeForm.diagnosisInfertilityType || 'Pending'}`, 16, yPos);
            yPos += 8;

            if (intakeForm.doctorNotes) {
                doc.setFont('helvetica', 'bold');
                doc.text('Doctor Notes / Plan:', 16, yPos);
                yPos += 6;
                doc.setFont('helvetica', 'normal');

                // Safe split logic
                try {
                    const notesStr = String(intakeForm.doctorNotes);
                    const splitNotes = doc.splitTextToSize(notesStr, pageWidth - 32);
                    doc.text(splitNotes, 16, yPos);
                    yPos += splitNotes.length * 5 + 10;
                } catch (e) {
                    doc.text(String(intakeForm.doctorNotes), 16, yPos);
                    yPos += 10;
                }
            }

            // --- FOOTER ---
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text('Confidential Medical Record - Generated by Hospital EMR', pageWidth / 2, 285, { align: 'center' });

            // Save
            const filename = `${intakeForm.firstName || 'Patient'}_${intakeForm.lastName || 'Record'}_Intake.pdf`;
            doc.save(filename);
        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert(`Failed to generate PDF: ${error.message}. Please check console for details.`);
        }
    };

    const handleSave = async (e, shouldPrint = false) => {
        e.preventDefault();
        setSaving(true);

        // 1. Authentication Check (Critical)
        const token = localStorage.getItem('token');
        if (!token) {
            alert("Authentication Error: You are not logged in. Please log in again.");
            setSaving(false);
            // Optional: window.location.href = '/login';
            return;
        }

        // 2. Role Check (Optional but good for debugging)
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            if (!['reception', 'admin', 'administrator'].includes(user.role)) {
                console.warn("User role might not be authorized:", user.role);
            }
        }

        if (!intakeForm.firstName || !intakeForm.mobile) {
            alert("Please enter at least First Name and Mobile Number.");
            setSaving(false);
            return;
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
                throw new Error(regRes.message || "Could not register/find patient.");
            }

            // 2. Update Details
            const updateRes = await receptionAPI.updateIntake(userId, intakeForm);

            if (!updateRes.success) {
                throw new Error(updateRes.message || "Failed to update intake details.");
            }

            alert("✅ Patient Record Saved!");

            if (shouldPrint) {
                // Generate PDF immediately after successful save logic
                setTimeout(() => {
                    generatePDF();
                }, 500); // Small delay to ensure state/UI isn't frozen
            }

            // Optional: stay on page to continue editing or refresh
            if (!shouldPrint) {
                fetchAppointments();
            }
        } catch (err) {
            console.error("Save Failed:", err);
            // Improved error message extraction
            const status = err.response?.status;
            const msg = err.response?.data?.message || err.message || "Unknown Error";

            if (status === 401 || status === 403) {
                alert(`Authentication Failed (${status}): ${msg}. Please re-login.`);
            } else {
                alert(`Save Failed: ${msg}`);
            }
        } finally {
            setSaving(false);
        }
    };

    // --- RENDER HELPERS ---
    const SectionHeader = ({ title, id }) => (
        <div className={`section-header ${activeSection === id ? 'active' : ''}`} onClick={() => toggleSection(id)}>
            <span>{title}</span>
            <span>{activeSection === id ? '▼' : '▶'}</span>
        </div>
    );

    if (viewMode === 'intake') {
        return (
            <div className="intake-full-page">
                {/* A. HEADER / CONTEXT BAR */}
                <div className="context-bar">
                    <div className="context-left">
                        <div className="context-couple-info">
                            <div className="patient-brief">
                                <div className="patient-photo-thumb">
                                    <span style={{ display: 'block', textAlign: 'center', marginTop: '10px' }}>♀</span>
                                </div>
                                <div className="patient-details-text">
                                    <span className="patient-name">{intakeForm.firstName} {intakeForm.lastName}</span>
                                    <span className="patient-meta">{intakeForm.age ? `${intakeForm.age}Y` : ''} • {intakeForm.mobile}</span>
                                </div>
                            </div>
                            {intakeForm.partnerFirstName && (
                                <div className="patient-brief">
                                    <div className="patient-photo-thumb">
                                        <span style={{ display: 'block', textAlign: 'center', marginTop: '10px' }}>♂</span>
                                    </div>
                                    <div className="patient-details-text">
                                        <span className="patient-name">{intakeForm.partnerFirstName}</span>
                                        <span className="patient-meta">{intakeForm.partnerMobile}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <span className="badge">New Visit</span>
                    </div>
                    <div className="context-right">
                        <button className="btn-cancel" onClick={() => setViewMode('dashboard')}>Close ✖</button>
                    </div>
                </div>

                <div className="intake-container">
                    <form onSubmit={(e) => handleSave(e, false)}>

                        {/* B. COUPLE DETAILS */}
                        <SectionHeader title="B. Patient Details (Female)" id="couple" />
                        {activeSection === 'couple' && (
                            <div className="form-section">
                                <div className="form-row">
                                    <div className="field"><label>Title</label><select name="title" value={intakeForm.title} onChange={handleInputChange}><option>Mrs.</option><option>Ms.</option><option>Dr.</option></select></div>
                                    <div className="field"><label>First Name</label><input name="firstName" value={intakeForm.firstName} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Last Name</label><input name="lastName" value={intakeForm.lastName} onChange={handleInputChange} /></div>
                                    <div className="field"><label>DOB</label><input type="date" name="dob" value={intakeForm.dob} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Age</label><input name="age" value={intakeForm.age} onChange={handleInputChange} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="field"><label>Mobile</label><input name="mobile" value={intakeForm.mobile} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Email</label><input name="email" value={intakeForm.email} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Aadhaar</label><input name="aadhaar" value={intakeForm.aadhaar} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Occupation</label><input name="occupation" value={intakeForm.occupation} onChange={handleInputChange} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="field"><label>Height (cm)</label><input name="height" value={intakeForm.height} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Weight (kg)</label><input name="weight" value={intakeForm.weight} onChange={handleInputChange} /></div>
                                    <div className="field"><label>BMI</label><input name="bmi" value={intakeForm.bmi} readOnly className="read-only" /></div>
                                    <div className="field"><label>Blood Group</label><input name="bloodGroup" value={intakeForm.bloodGroup} onChange={handleInputChange} /></div>
                                </div>
                                <div className="form-row full-width">
                                    <div className="field"><label>Address</label><input name="address" value={intakeForm.address} onChange={handleInputChange} /></div>
                                </div>
                            </div>
                        )}

                        {/* C. PARTNER DETAILS */}
                        <SectionHeader title="C. Partner Details (Male)" id="partner" />
                        {activeSection === 'partner' && (
                            <div className="form-section">
                                <div className="form-row">
                                    <div className="field"><label>Title</label><select name="partnerTitle" value={intakeForm.partnerTitle} onChange={handleInputChange}><option>Mr.</option><option>Dr.</option></select></div>
                                    <div className="field"><label>First Name</label><input name="partnerFirstName" value={intakeForm.partnerFirstName} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Last Name</label><input name="partnerLastName" value={intakeForm.partnerLastName} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Mobile</label><input name="partnerMobile" value={intakeForm.partnerMobile} onChange={handleInputChange} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="field"><label>Height</label><input name="partnerHeight" value={intakeForm.partnerHeight} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Weight</label><input name="partnerWeight" value={intakeForm.partnerWeight} onChange={handleInputChange} /></div>
                                    <div className="field"><label>BMI</label><input name="partnerBmi" value={intakeForm.partnerBmi} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Blood Group</label><input name="partnerBloodGroup" value={intakeForm.partnerBloodGroup} onChange={handleInputChange} /></div>
                                </div>
                            </div>
                        )}

                        {/* E. HISTORY */}
                        <SectionHeader title="E. History Section" id="history" />
                        {activeSection === 'history' && (
                            <div className="form-section">
                                <div className="subtitle">1. Infertility Details</div>
                                <div className="form-row">
                                    <div className="field"><label>Type</label><select name="infertilityType" value={intakeForm.infertilityType} onChange={handleInputChange}><option>Primary</option><option>Secondary</option></select></div>
                                    <div className="field"><label>Duration (Years)</label><input name="infertilityDuration" value={intakeForm.infertilityDuration} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Marriage Duration</label><input name="marriageDuration" value={intakeForm.marriageDuration} onChange={handleInputChange} /></div>
                                </div>

                                <div className="subtitle">2. Menstrual History</div>
                                <div className="form-row">
                                    <div className="field"><label>LMP Date</label><input type="date" name="lmpDate" value={intakeForm.lmpDate} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Regularity</label><select name="menstrualRegularity" value={intakeForm.menstrualRegularity} onChange={handleInputChange}><option>Regular</option><option>Irregular</option></select></div>
                                    <div className="field"><label>Flow</label><select name="menstrualFlow" value={intakeForm.menstrualFlow} onChange={handleInputChange}><option>Normal</option><option>Heavy</option><option>Scanty</option></select></div>
                                </div>

                                <div className="subtitle">3. Medical History</div>
                                <div className="checkbox-group">
                                    <label><input type="checkbox" name="medicalHistoryDiabetes" checked={intakeForm.medicalHistoryDiabetes} onChange={handleInputChange} /> Diabetes</label>
                                    <label><input type="checkbox" name="medicalHistoryHypertension" checked={intakeForm.medicalHistoryHypertension} onChange={handleInputChange} /> Hypertension</label>
                                    <label><input type="checkbox" name="medicalHistoryThyroid" checked={intakeForm.medicalHistoryThyroid} onChange={handleInputChange} /> Thyroid</label>
                                    <label><input type="checkbox" name="medicalHistoryPcos" checked={intakeForm.medicalHistoryPcos} onChange={handleInputChange} /> PCOS</label>
                                </div>
                            </div>
                        )}

                        {/* N. EXAMINATION */}
                        <SectionHeader title="N. Examination" id="exam" />
                        {activeSection === 'exam' && (
                            <div className="form-section">
                                <div className="form-row full-width">
                                    <div className="field"><label>General Examination</label><textarea name="examGeneral" value={intakeForm.examGeneral} onChange={handleInputChange} rows="2" /></div>
                                </div>
                                <div className="form-row full-width">
                                    <div className="field"><label>Per Abdomen / Pelvic</label><textarea name="examAbdomen" value={intakeForm.examAbdomen} onChange={handleInputChange} rows="2" /></div>
                                </div>
                            </div>
                        )}

                        {/* O. USG */}
                        <SectionHeader title="O. USG Examination" id="usg" />
                        {activeSection === 'usg' && (
                            <div className="form-section">
                                <div className="form-row">
                                    <div className="field"><label>USG Type</label><select name="usgType" value={intakeForm.usgType} onChange={handleInputChange}><option>TVS</option><option>TAS</option></select></div>
                                    <div className="field"><label>Endometrium (mm)</label><input name="endometriumThickness" value={intakeForm.endometriumThickness} onChange={handleInputChange} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="field"><label>Ovary Right (Size)</label><input name="ovaryRightSize" value={intakeForm.ovaryRightSize} onChange={handleInputChange} /></div>
                                    <div className="field"><label>Ovary Left (Size)</label><input name="ovaryLeftSize" value={intakeForm.ovaryLeftSize} onChange={handleInputChange} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="field"><label>AFC Right</label><input name="afcRight" value={intakeForm.afcRight} onChange={handleInputChange} /></div>
                                    <div className="field"><label>AFC Left</label><input name="afcLeft" value={intakeForm.afcLeft} onChange={handleInputChange} /></div>
                                </div>
                            </div>
                        )}

                        {/* P. DIAGNOSIS */}
                        <SectionHeader title="P. Diagnosis & Plan" id="diagnosis" />
                        {activeSection === 'diagnosis' && (
                            <div className="form-section">
                                <div className="form-row">
                                    <div className="field"><label>Infertility Type</label><select name="diagnosisInfertilityType" value={intakeForm.diagnosisInfertilityType} onChange={handleInputChange}><option>Female Factor</option><option>Male Factor</option><option>Unexplained</option><option>Mixed</option></select></div>
                                    <div className="field"><label>Years Infertile</label><input name="diagnosisYears" value={intakeForm.diagnosisYears} onChange={handleInputChange} /></div>
                                </div>
                                <div className="form-row full-width">
                                    <div className="field"><label>Doctor Notes / Plan</label><textarea name="doctorNotes" value={intakeForm.doctorNotes} onChange={handleInputChange} rows="4" /></div>
                                </div>
                            </div>
                        )}

                        {/* W. FOOTER CONTROLS */}
                        <div className="form-footer">
                            <div className="record-info">
                                Recorded by: Reception Desk | Date: {new Date().toLocaleDateString()}
                            </div>
                            <button type="button" className="btn-cancel" onClick={() => setViewMode('dashboard')}>Cancel</button>
                            <button type="button" className="btn-save" onClick={(e) => handleSave(e, true)} disabled={saving}>
                                {saving ? 'Saving...' : 'SAVE & PRINT PDF'}
                            </button>
                            <button type="submit" className="btn-save" style={{ background: 'var(--success-text)', color: 'white' }} disabled={saving}>
                                {saving ? 'Saving...' : 'SAVE ONLY'}
                            </button>
                        </div>

                    </form>
                </div>
            </div>
        );
    }

    // --- DASHBOARD VIEW ---
    return (
        <div className="reception-dashboard">
            <div className="dashboard-header">
                <h1>Reception Desk</h1>
                <button className="btn-register" onClick={handleNewWalkIn}>+ New Couple / Visit</button>
            </div>

            {/* Search */}
            <div className="search-bar-container">
                <input
                    type="text"
                    placeholder="Search MRN, Name, Phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyUp={(e) => {
                        if (e.key === 'Enter' && searchQuery.length > 2) {
                            receptionAPI.searchPatients(searchQuery).then(res => {
                                if (res.success) setSearchResults(res.patients);
                            });
                        }
                    }}
                />
                {searchResults.length > 0 && (
                    <div className="search-results-dropdown">
                        {searchResults.map(p => (
                            <div key={p._id} className="search-result-item" onClick={() => handleEditPatient(p)}>
                                <strong>{p.name}</strong> <span>{p.phone}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* List */}
            <div className="appointments-list">
                <h3>Today's Visits</h3>
                <table className="reception-table">
                    <thead><tr><th>Patient</th><th>Partner</th><th>Doctor</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                        {appointments.map(apt => (
                            <tr key={apt._id}>
                                <td>{apt.userId?.name}<br /><small>{apt.userId?.phone}</small></td>
                                <td>{apt.userId?.fertilityProfile?.partnerFirstName || '-'}</td>
                                <td>{apt.doctorName || apt.doctorId?.name}</td>
                                <td><span className={`status ${apt.status}`}>{apt.status}</span></td>
                                <td>
                                    <button onClick={() => handleEditPatient(apt.userId)}>Open File</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ReceptionDashboard;