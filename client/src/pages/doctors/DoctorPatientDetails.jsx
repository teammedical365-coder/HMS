import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doctorAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './DoctorPatientDetails.css';

const DoctorPatientDetails = () => {
    const { appointmentId } = useParams();
    const navigate = useNavigate();
    const [appointment, setAppointment] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Tab State for Left Panel
    const [activeTab, setActiveTab] = useState('overview');

    // Doctor's Session Notepad (Right Panel)
    const [sessionData, setSessionData] = useState({
        diagnosis: '', notes: '', prescription: '', labTests: ''
    });

    // Patient Intake Profile (Left Panel - Editable by Doctor)
    const [intakeData, setIntakeData] = useState({});

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await doctorAPI.getAppointmentDetails(appointmentId);
                if (res.success) {
                    setAppointment(res.appointment);
                    setIntakeData(res.appointment.userId?.fertilityProfile || {});

                    if (res.appointment.userId?._id) {
                        const histRes = await doctorAPI.getPatientHistory(res.appointment.userId._id);
                        if (histRes.success) setHistory(histRes.history || []);
                    }

                    setSessionData({
                        diagnosis: res.appointment.diagnosis || '',
                        notes: res.appointment.doctorNotes || '',
                        prescription: '',
                        labTests: (res.appointment.labTests || []).join(', ')
                    });
                }
            } catch (err) { console.error(err); }
            finally { setLoading(false); }
        };
        fetchDetails();
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
        setSessionData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSaveProfile = async () => {
        if (!appointment?.userId?._id) return;
        setSaving(true);
        try {
            await doctorAPI.updatePatientProfile(appointment.userId._id, intakeData);
            alert("✅ Patient profile saved successfully!");
        } catch (err) {
            alert("Error saving profile: " + err.message);
        } finally { setSaving(false); }
    };

    const handleSaveAndMerge = async () => {
        if (!window.confirm("Save all changes and finish session?")) return;
        setSaving(true);
        try {
            // 1. Save Profile
            if (appointment.userId?._id) {
                await doctorAPI.updatePatientProfile(appointment.userId._id, intakeData);
            }

            // 2. Save Session
            const payload = {
                status: 'completed',
                diagnosis: sessionData.diagnosis,
                notes: sessionData.notes,
                labTests: sessionData.labTests.split(',').map(s => s.trim()).filter(Boolean),
                pharmacy: sessionData.prescription.split('\n').filter(Boolean).map(m => ({ medicineName: m.trim() }))
            };
            await doctorAPI.updateSession(appointmentId, payload);

            // 3. Generate PDF
            generateCumulativePDF(intakeData, history, payload);

            alert("✅ Session completed & report generated!");
            navigate('/doctor/patients');
        } catch (err) {
            alert("Error: " + err.message);
        } finally { setSaving(false); }
    };

    const generateCumulativePDF = (intake, pastHistory, currentData) => {
        const doc = new jsPDF();
        let y = 20;

        doc.setFontSize(22);
        doc.setTextColor(41, 128, 185);
        doc.text("PAWAN HARISH IVF CENTER", 105, y, { align: 'center' });
        y += 10;
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Excellence in Fertility Care", 105, y, { align: 'center' });
        y += 15;

        doc.setLineWidth(0.5);
        doc.setDrawColor(200);
        doc.line(10, y, 200, y);
        y += 10;

        doc.setFontSize(18);
        doc.setTextColor(0);
        doc.text("CLINICAL RECORD / PRESCRIPTION", 105, y, { align: 'center' }); y += 15;

        doc.setFillColor(240, 240, 240); doc.rect(14, y, 182, 35, 'F');
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

        y += 45;

        const profileData = [
            ["Chief Complaint", intake.chiefComplaint || '-'],
            ["Medical History", intake.medicalHistory || '-'],
            ["Height / Weight / BMI", `${intake.height || '-'} cm / ${intake.weight || '-'} kg / ${intake.bmi || '-'}`],
            ["Blood Group", intake.bloodGroup || '-'],
            ["Obstetric Hx", `G${intake.gravida || '-'} P${intake.para || '-'} A${intake.abortion || '-'} L${intake.living || '-'}`]
        ];
        autoTable(doc, {
            startY: y,
            head: [['Clinical Summary', 'Details']],
            body: profileData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            columnStyles: { 0: { fontStyle: 'bold', width: 50 } }
        });
        y = doc.lastAutoTable.finalY + 10;

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

        doc.text("Prescription:", 16, y); y += 6;
        const rx = (currentData.pharmacy || []).map(p => p.medicineName).join('\n');
        doc.text(rx || '-', 16, y);

        doc.save("Patient_Record.pdf");
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

    const patient = appointment.userId || {};
    const profile = patient.fertilityProfile || intakeData;

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📋' },
        { id: 'vitals', label: 'Vitals', icon: '💓' },
        { id: 'clinical', label: 'Clinical', icon: '🏥' },
        { id: 'obstetric', label: 'Obstetric', icon: '🤰' },
        { id: 'spouse', label: 'Spouse/Partner', icon: '👫' },
        { id: 'menstrual', label: 'Menstrual', icon: '📅' },
        { id: 'treatment', label: 'Treatment Hx', icon: '💊' },
        { id: 'history', label: 'Past Visits', icon: '📜' },
    ];

    return (
        <div className="dpd-container">
            {/* LEFT PANEL */}
            <div className="dpd-left">
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
                                {profile.bloodGroup && <span className="dpd-tag tag-blood">🩸 {profile.bloodGroup}</span>}
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
                            <span className={`dpd-appt-status status-${appointment.status}`}>{appointment.status}</span>
                        </div>
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Service</span>
                            <span className="dpd-appt-value">{appointment.serviceName || 'Consultation'}</span>
                        </div>
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="dpd-tabs-nav">
                    {tabs.map(tab => (
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

                {/* Tab Content */}
                <div className="dpd-tab-content">
                    {/* OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="dpd-tab-panel fade-in">
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
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Height</span>
                                    <span className="dpd-ov-value">{profile.height || intakeData.height || '-'} cm</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Weight</span>
                                    <span className="dpd-ov-value">{profile.weight || intakeData.weight || '-'} kg</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">BMI</span>
                                    <span className="dpd-ov-value">{profile.bmi || intakeData.bmi || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Address</span>
                                    <span className="dpd-ov-value">{patient.address || profile.address || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Chief Complaint</span>
                                    <span className="dpd-ov-value">{profile.chiefComplaint || intakeData.chiefComplaint || '-'}</span>
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

                    {/* VITALS */}
                    {activeTab === 'vitals' && (
                        <div className="dpd-tab-panel fade-in">
                            <h3 className="dpd-panel-title">💓 Vitals & Measurements</h3>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Height (cm)</label>
                                    <input name="height" type="number" value={intakeData.height || ''} onChange={handleIntakeChange} placeholder="e.g. 165" />
                                </div>
                                <div className="dpd-field">
                                    <label>Weight (kg)</label>
                                    <input name="weight" type="number" value={intakeData.weight || ''} onChange={handleIntakeChange} placeholder="e.g. 65" />
                                </div>
                                <div className="dpd-field">
                                    <label>BMI (Auto)</label>
                                    <input name="bmi" value={intakeData.bmi || ''} readOnly className="dpd-readonly" />
                                </div>
                                <div className="dpd-field">
                                    <label>Blood Group</label>
                                    <select name="bloodGroup" value={intakeData.bloodGroup || ''} onChange={handleIntakeChange}>
                                        <option value="">-- Select --</option>
                                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                                            <option key={bg} value={bg}>{bg}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="dpd-field">
                                    <label>Blood Pressure</label>
                                    <input name="historyBp" value={intakeData.historyBp || ''} onChange={handleIntakeChange} placeholder="e.g. 120/80 mmHg" />
                                </div>
                                <div className="dpd-field">
                                    <label>Pulse</label>
                                    <input name="historyPulse" value={intakeData.historyPulse || ''} onChange={handleIntakeChange} placeholder="e.g. 72 bpm" />
                                </div>
                            </div>
                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Vitals'}
                            </button>
                        </div>
                    )}

                    {/* CLINICAL HISTORY */}
                    {activeTab === 'clinical' && (
                        <div className="dpd-tab-panel fade-in">
                            <h3 className="dpd-panel-title">🏥 Clinical History</h3>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Wife's Age</label>
                                    <input name="wifeAge" value={intakeData.wifeAge || ''} onChange={handleIntakeChange} placeholder="Wife Age" />
                                </div>
                                <div className="dpd-field">
                                    <label>Husband's Age</label>
                                    <input name="husbandAge" value={intakeData.husbandAge || ''} onChange={handleIntakeChange} placeholder="Husband Age" />
                                </div>
                            </div>
                            <div className="dpd-field-full">
                                <label>Chief Complaint (Duration of Infertility)</label>
                                <textarea name="chiefComplaint" value={intakeData.chiefComplaint || ''} onChange={handleIntakeChange} placeholder="e.g. Primary Infertility for 3 years..." />
                            </div>
                            <div className="dpd-field-full">
                                <label>Medical History (Diabetes, HTN, TB, Thyroid, Asthma, Epilepsy)</label>
                                <textarea name="medicalHistory" value={intakeData.medicalHistory || ''} onChange={handleIntakeChange} placeholder="Check relevant history..." />
                            </div>
                            <div className="dpd-field-full">
                                <label>Surgical History (Laparoscopy, Appendectomy, etc.)</label>
                                <textarea name="surgicalHistory" value={intakeData.surgicalHistory || ''} onChange={handleIntakeChange} />
                            </div>
                            <div className="dpd-field-full">
                                <label>Family History (Premature menopause, Genetic disorders)</label>
                                <textarea name="familyHistory" value={intakeData.familyHistory || ''} onChange={handleIntakeChange} />
                            </div>
                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Clinical Data'}
                            </button>
                        </div>
                    )}

                    {/* OBSTETRIC */}
                    {activeTab === 'obstetric' && (
                        <div className="dpd-tab-panel fade-in">
                            <h3 className="dpd-panel-title">🤰 Obstetric History</h3>
                            <div className="dpd-form-grid dpd-grid-4">
                                <div className="dpd-field">
                                    <label>Gravida (G)</label>
                                    <input name="gravida" value={intakeData.gravida || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Para (P)</label>
                                    <input name="para" value={intakeData.para || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Abortion (A)</label>
                                    <input name="abortion" value={intakeData.abortion || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Living (L)</label>
                                    <input name="living" value={intakeData.living || ''} onChange={handleIntakeChange} />
                                </div>
                            </div>
                            <div className="dpd-field-full">
                                <label>Details of Previous Pregnancies</label>
                                <textarea name="obstetricDetails" value={intakeData.obstetricDetails || ''} onChange={handleIntakeChange} placeholder="1. 2018 - FTND - Male - Healthy..." />
                            </div>
                            <div className="dpd-field-full">
                                <label>History of Ectopic Pregnancy?</label>
                                <input name="ectopicHistory" value={intakeData.ectopicHistory || ''} onChange={handleIntakeChange} placeholder="Details if any..." />
                            </div>
                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Obstetric Data'}
                            </button>
                        </div>
                    )}

                    {/* SPOUSE / PARTNER */}
                    {activeTab === 'spouse' && (
                        <div className="dpd-tab-panel fade-in">
                            <h3 className="dpd-panel-title">👫 Spouse / Partner Details</h3>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Partner Title</label>
                                    <select name="partnerTitle" value={intakeData.partnerTitle || ''} onChange={handleIntakeChange}>
                                        <option value="">--</option>
                                        <option value="Mr.">Mr.</option>
                                        <option value="Mrs.">Mrs.</option>
                                        <option value="Dr.">Dr.</option>
                                    </select>
                                </div>
                                <div className="dpd-field">
                                    <label>Partner First Name</label>
                                    <input name="partnerFirstName" value={intakeData.partnerFirstName || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Last Name</label>
                                    <input name="partnerLastName" value={intakeData.partnerLastName || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Age</label>
                                    <input name="partnerAge" type="number" value={intakeData.partnerAge || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner DOB</label>
                                    <input name="partnerDob" type="date" value={intakeData.partnerDob || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Mobile</label>
                                    <input name="partnerMobile" value={intakeData.partnerMobile || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Email</label>
                                    <input name="partnerEmail" value={intakeData.partnerEmail || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Blood Group</label>
                                    <select name="partnerBloodGroup" value={intakeData.partnerBloodGroup || ''} onChange={handleIntakeChange}>
                                        <option value="">-- Select --</option>
                                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                                            <option key={bg} value={bg}>{bg}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <h4 className="dpd-sub-title">📏 Partner Vitals</h4>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Partner Height (cm)</label>
                                    <input name="partnerHeight" type="number" value={intakeData.partnerHeight || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Weight (kg)</label>
                                    <input name="partnerWeight" type="number" value={intakeData.partnerWeight || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner BP</label>
                                    <input name="partnerBp" value={intakeData.partnerBp || ''} onChange={handleIntakeChange} placeholder="e.g. 120/80" />
                                </div>
                            </div>

                            <div className="dpd-field-full">
                                <label>Partner Medical Comments</label>
                                <textarea name="partnerMedicalComments" value={intakeData.partnerMedicalComments || ''} onChange={handleIntakeChange} placeholder="Any medical conditions, allergies, etc." />
                            </div>

                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Partner Details'}
                            </button>
                        </div>
                    )}

                    {/* MENSTRUAL */}
                    {activeTab === 'menstrual' && (
                        <div className="dpd-tab-panel fade-in">
                            <h3 className="dpd-panel-title">📅 Menstrual History</h3>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Age of Menarche</label>
                                    <input name="menarcheAge" value={intakeData.menarcheAge || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>LMP (Last Menstrual Period)</label>
                                    <input type="date" name="lmp" value={intakeData.lmp || intakeData.lmpDate || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Cycle Regularity</label>
                                    <select name="cycleRegularity" value={intakeData.cycleRegularity || intakeData.menstrualRegularity || ''} onChange={handleIntakeChange}>
                                        <option value="">-- Select --</option>
                                        <option value="Regular">Regular (28-30 days)</option>
                                        <option value="Irregular">Irregular</option>
                                        <option value="Oligomenorrhea">Oligomenorrhea (Delayed)</option>
                                        <option value="Polymenorrhea">Polymenorrhea (Frequent)</option>
                                    </select>
                                </div>
                                <div className="dpd-field">
                                    <label>Flow Duration (Days)</label>
                                    <input name="flowDuration" value={intakeData.flowDuration || intakeData.menstrualFlow || ''} onChange={handleIntakeChange} placeholder="e.g. 3-4 days" />
                                </div>
                            </div>
                            <div className="dpd-field-full">
                                <label>Dysmenorrhea (Painful Periods)?</label>
                                <input name="dysmenorrhea" value={intakeData.dysmenorrhea || intakeData.menstrualPain || ''} onChange={handleIntakeChange} placeholder="Mild / Moderate / Severe" />
                            </div>
                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Menstrual Data'}
                            </button>
                        </div>
                    )}

                    {/* TREATMENT HISTORY */}
                    {activeTab === 'treatment' && (
                        <div className="dpd-tab-panel fade-in">
                            <h3 className="dpd-panel-title">💊 Previous Investigations & Treatments</h3>
                            <div className="dpd-field-full">
                                <label>Hysterosalpingography (HSG) Status</label>
                                <input name="hsgStatus" value={intakeData.hsgStatus || ''} onChange={handleIntakeChange} placeholder="Patent / Blocked / Not done" />
                            </div>
                            <div className="dpd-field-full">
                                <label>Previous IUI Cycles</label>
                                <textarea name="prevIUI" value={intakeData.prevIUI || ''} onChange={handleIntakeChange} placeholder="Number of cycles, stimulation details, outcome..." />
                            </div>
                            <div className="dpd-field-full">
                                <label>Previous IVF/ICSI Cycles</label>
                                <textarea name="prevIVF" value={intakeData.prevIVF || ''} onChange={handleIntakeChange} placeholder="Date, No. of oocytes, Embryos, ET outcome..." />
                            </div>
                            <div className="dpd-field-full">
                                <label>Treatment History Summary</label>
                                <textarea name="treatmentHistory" value={intakeData.treatmentHistory || ''} onChange={handleIntakeChange} placeholder="Summary of all previous treatments..." />
                            </div>
                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Treatment Data'}
                            </button>
                        </div>
                    )}

                    {/* PAST VISITS HISTORY */}
                    {activeTab === 'history' && (
                        <div className="dpd-tab-panel fade-in">
                            <h3 className="dpd-panel-title">📜 Previous Consultations ({history.length})</h3>
                            {history.length === 0 ? (
                                <div className="dpd-empty-hist">
                                    <p>No previous visits recorded.</p>
                                </div>
                            ) : (
                                <div className="dpd-history-list">
                                    {history.map(h => (
                                        <div key={h._id} className={`dpd-history-card ${h._id === appointmentId ? 'current' : ''}`}>
                                            <div className="dpd-hist-top">
                                                <span className="dpd-hist-date">
                                                    {new Date(h.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <span className={`dpd-hist-status status-${h.status}`}>{h.status}</span>
                                            </div>
                                            <div className="dpd-hist-diagnosis">
                                                <strong>Diagnosis:</strong> {h.diagnosis || 'No diagnosis recorded'}
                                            </div>
                                            {h.doctorNotes && (
                                                <div className="dpd-hist-notes">
                                                    <strong>Notes:</strong> {h.doctorNotes}
                                                </div>
                                            )}
                                            {h.serviceName && (
                                                <span className="dpd-hist-service">{h.serviceName}</span>
                                            )}
                                            {h.prescriptions && h.prescriptions.filter(p => p.type === 'lab_report').map((file, idx) => (
                                                <div key={idx} className="dpd-hist-file">
                                                    🧪 <a href={file.url} target="_blank" rel="noopener noreferrer">View Lab Report</a>
                                                </div>
                                            ))}
                                            {h._id === appointmentId && <span className="dpd-current-badge">📌 Current Session</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT PANEL - SESSION NOTEPAD */}
            <div className="dpd-right">
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
                        />
                    </div>

                    <div className="dpd-session-field">
                        <label>💊 Prescription (one medicine per line)</label>
                        <textarea
                            name="prescription"
                            value={sessionData.prescription}
                            onChange={handleSessionChange}
                            placeholder={"Tab. Folic Acid 5mg - 1 OD\nTab. Progesterone 200mg - 1 BD\nInj. HCG 5000 IU"}
                            className="dpd-prescription-textarea"
                        />
                    </div>

                    <div className="dpd-session-field">
                        <label>🧪 Lab Tests (comma-separated)</label>
                        <input
                            name="labTests"
                            value={sessionData.labTests}
                            onChange={handleSessionChange}
                            placeholder="e.g. CBC, TSH, AMH, Prolactin"
                        />
                    </div>
                </div>

                <div className="dpd-right-footer">
                    <button className="dpd-btn-save-draft" onClick={handleSaveProfile} disabled={saving}>
                        💾 Save Profile
                    </button>
                    <button className="dpd-btn-finish" onClick={handleSaveAndMerge} disabled={saving}>
                        {saving ? '⏳ Processing...' : '✅ Complete Session & Generate Report'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DoctorPatientDetails;