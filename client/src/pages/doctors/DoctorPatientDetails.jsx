import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doctorAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Patient.css';

const DoctorPatientDetails = () => {
    const { appointmentId } = useParams();
    const navigate = useNavigate();
    const [appointment, setAppointment] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    // Tab State for Left Panel (Intake/History)
    const [activeTab, setActiveTab] = useState('history'); // 'clinical', 'history', 'obstetric'

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
                    // Load existing profile into editable state
                    setIntakeData(res.appointment.userId?.fertilityProfile || {});

                    if (res.appointment.userId?._id) {
                        const histRes = await doctorAPI.getPatientHistory(res.appointment.userId._id);
                        if (histRes.success) setHistory(histRes.history);
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
        setIntakeData({ ...intakeData, [e.target.name]: e.target.value });
    };

    const handleSessionChange = (e) => {
        setSessionData({ ...sessionData, [e.target.name]: e.target.value });
    };

    const handleSaveAndMerge = async () => {
        if (!window.confirm("Save Profile changes and Finish Session?")) return;

        try {
            // 1. Save Profile (Intake Data) - Doctor updating history
            await doctorAPI.updatePatientProfile(appointment.userId._id, intakeData);

            // 2. Save Session (Notes)
            const payload = {
                status: 'completed',
                diagnosis: sessionData.diagnosis,
                notes: sessionData.notes,
                labTests: sessionData.labTests.split(','),
                pharmacy: sessionData.prescription.split('\n').map(m => ({ medicineName: m }))
            };
            await doctorAPI.updateSession(appointmentId, payload);

            // 3. Generate PDF
            generateCumulativePDF(intakeData, history, payload);

            alert("✅ Saved & Generated!");
            navigate('/doctor/patients');

        } catch (err) { alert("Error: " + err.message); }
    };

    const generateCumulativePDF = (intake, pastHistory, currentData) => {
        const doc = new jsPDF();
        let y = 20;

        // HEADER
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

        // PROFILE SECTION
        doc.setFillColor(240, 240, 240); doc.rect(14, y, 182, 35, 'F');
        doc.setFontSize(11);

        const cardX = 20;
        let cardY = y + 8;

        // Patient Identifiers
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

        // MEDICAL SUMMARY TABLE
        const profileData = [
            ["Chief Complaint", intake.chiefComplaint || '-'],
            ["Medical History", intake.medicalHistory || '-'],
            ["Obstetric Hx", `G${intake.para || '-'} P${intake.liveBirth || '-'} A${intake.abortion || '-'}`]
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

        // PAST SESSIONS
        if (pastHistory.length > 0) {
            doc.setFillColor(220, 240, 255); doc.rect(14, y, 180, 8, 'F');
            doc.text("PAST SESSIONS", 16, y + 6); y += 12;
            const rows = pastHistory.filter(h => h.status === 'completed' && h._id !== appointmentId).map(h => [
                new Date(h.appointmentDate).toLocaleDateString(), h.diagnosis, h.doctorNotes
            ]);
            if (rows.length > 0) {
                autoTable(doc, { startY: y, head: [['Date', 'Diagnosis', 'Notes']], body: rows });
                y = doc.lastAutoTable.finalY + 10;
            }
        }

        // CURRENT SESSION
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFillColor(200, 255, 200); doc.rect(14, y, 180, 8, 'F');
        doc.text(`CURRENT SESSION: ${new Date().toLocaleDateString()}`, 16, y + 6); y += 12;

        doc.setFontSize(10);
        doc.text(`Diagnosis: ${currentData.diagnosis}`, 16, y); y += 10;
        doc.text("Notes:", 16, y); y += 6;
        const notes = doc.splitTextToSize(currentData.notes, 170);
        doc.text(notes, 16, y); y += (notes.length * 5) + 10;

        doc.text("Prescription:", 16, y); y += 6;
        const rx = currentData.pharmacy.map(p => p.medicineName).join('\n');
        doc.text(rx, 16, y);

        doc.save("Patient_Record.pdf");
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="patient-details-page" style={{ display: 'flex', gap: '20px', padding: '20px', height: '90vh' }}>

            {/* LEFT: EDITABLE INTAKE / HISTORY */}
            <div className="left-panel" style={{ flex: 1, background: 'white', padding: '20px', overflowY: 'auto' }}>
                {/* TAB NAVIGATION */}
                <div className="tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '15px' }}>
                    {['clinical', 'obstetric', 'menstrual', 'sexual', 'treatment', 'history'].map(tab => (
                        <button
                            key={tab}
                            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                            style={{ flex: '1 1 auto', fontSize: '0.9rem', padding: '8px' }}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                {/* 1. CLINICAL PROFILE */}
                {activeTab === 'clinical' && (
                    <div className="form-section fade-in">
                        <h4>📋 Clinical History</h4>
                        <div className="input-group">
                            <label>Age of Wife / Husband</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input name="wifeAge" placeholder="Wife Age" value={intakeData.wifeAge || ''} onChange={handleIntakeChange} />
                                <input name="husbandAge" placeholder="Husband Age" value={intakeData.husbandAge || ''} onChange={handleIntakeChange} />
                            </div>
                        </div>

                        <label>Chief Complaint (Duration of Infertility)</label>
                        <textarea name="chiefComplaint" value={intakeData.chiefComplaint || ''} onChange={handleIntakeChange} placeholder="e.g. Primary Infertility for 3 years..." />

                        <label>Medical History (Diabetes, HTN, TB, Thyroid, Asthma, Epilepsy)</label>
                        <textarea name="medicalHistory" value={intakeData.medicalHistory || ''} onChange={handleIntakeChange} placeholder="Check relevant history..." />

                        <label>Surgical History (Laparoscopy, Appendectomy, etc.)</label>
                        <textarea name="surgicalHistory" value={intakeData.surgicalHistory || ''} onChange={handleIntakeChange} />

                        <label>Family History (Premature menopause, Genetic disorders)</label>
                        <textarea name="familyHistory" value={intakeData.familyHistory || ''} onChange={handleIntakeChange} />
                    </div>
                )}

                {/* 2. OBSTETRIC HISTORY */}
                {activeTab === 'obstetric' && (
                    <div className="form-section fade-in">
                        <h4>🤰 Obstetric History</h4>
                        <div className="gpa-inputs" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            <div style={{ flex: 1 }}><label>Gravida (G)</label><input name="gravida" value={intakeData.gravida || ''} onChange={handleIntakeChange} /></div>
                            <div style={{ flex: 1 }}><label>Para (P)</label><input name="para" value={intakeData.para || ''} onChange={handleIntakeChange} /></div>
                            <div style={{ flex: 1 }}><label>Abortion (A)</label><input name="abortion" value={intakeData.abortion || ''} onChange={handleIntakeChange} /></div>
                            <div style={{ flex: 1 }}><label>Living (L)</label><input name="living" value={intakeData.living || ''} onChange={handleIntakeChange} /></div>
                        </div>

                        <label>Details of Previous Pregnancies (Year, Mode, Outcome, Complications)</label>
                        <textarea name="obstetricDetails" value={intakeData.obstetricDetails || ''} onChange={handleIntakeChange} placeholder="1. 2018 - FTND - Male - Healthy..." style={{ height: '100px' }} />

                        <label>History of Ectopic Pregnancy?</label>
                        <input name="ectopicHistory" value={intakeData.ectopicHistory || ''} onChange={handleIntakeChange} placeholder="Details if any..." />
                    </div>
                )}

                {/* 3. MENSTRUAL HISTORY */}
                {activeTab === 'menstrual' && (
                    <div className="form-section fade-in">
                        <h4>🩸 Menstrual History</h4>
                        <div className="input-row" style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <div style={{ flex: 1 }}>
                                <label>Age of Menarche</label>
                                <input name="menarcheAge" value={intakeData.menarcheAge || ''} onChange={handleIntakeChange} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label>LMP (Last Menstrual Period)</label>
                                <input type="date" name="lmp" value={intakeData.lmp || ''} onChange={handleIntakeChange} />
                            </div>
                        </div>

                        <label>Cycle Regularity</label>
                        <select name="cycleRegularity" value={intakeData.cycleRegularity || ''} onChange={handleIntakeChange} style={{ width: '100%', padding: '8px', marginBottom: '10px' }}>
                            <option value="">-- Select --</option>
                            <option value="Regular">Regular (28-30 days)</option>
                            <option value="Irregular">Irregular</option>
                            <option value="Oligomenorrhea">Oligomenorrhea (Delayed)</option>
                            <option value="Polymenorrhea">Polymenorrhea (Frequent)</option>
                        </select>

                        <label>Flow Duration (Days)</label>
                        <input name="flowDuration" value={intakeData.flowDuration || ''} onChange={handleIntakeChange} placeholder="e.g. 3-4 days" />

                        <label>Dysmenorrhea (Painful Periods)?</label>
                        <input name="dysmenorrhea" value={intakeData.dysmenorrhea || ''} onChange={handleIntakeChange} placeholder="Mild / Moderate / Severe" />
                    </div>
                )}

                {/* 4. SEXUAL / COITAL HISTORY */}
                {activeTab === 'sexual' && (
                    <div className="form-section fade-in">
                        <h4>👩‍❤️‍👨 Sexual History</h4>
                        <label>Frequency of Intercourse</label>
                        <input name="coitalFrequency" value={intakeData.coitalFrequency || ''} onChange={handleIntakeChange} placeholder="e.g. 2-3 times/week" />

                        <label>Dyspareunia (Pain during intercourse)?</label>
                        <input name="dyspareunia" value={intakeData.dyspareunia || ''} onChange={handleIntakeChange} placeholder="Yes/No, details..." />

                        <label>Use of Lubricants / Contraception?</label>
                        <input name="contraception" value={intakeData.contraception || ''} onChange={handleIntakeChange} />
                    </div>
                )}

                {/* 5. PREVIOUS INVESTIGATIONS & TREATMENTS */}
                {activeTab === 'treatment' && (
                    <div className="form-section fade-in">
                        <h4>💊 Previous Treatments</h4>
                        <label>Hysterosalpingography (HSG) Status</label>
                        <input name="hsgStatus" value={intakeData.hsgStatus || ''} onChange={handleIntakeChange} placeholder="Patent / Blocked / Not done" />

                        <label>Previous IUI Cycles</label>
                        <textarea name="prevIUI" value={intakeData.prevIUI || ''} onChange={handleIntakeChange} placeholder="Number of cycles, stimulation details, outcome..." />

                        <label>Previous IVF/ICSI Cycles</label>
                        <textarea name="prevIVF" value={intakeData.prevIVF || ''} onChange={handleIntakeChange} placeholder="Date, No. of oocytes, Embryos, ET outcome..." style={{ height: '80px' }} />
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="history-list">
                        <h4>Previous Consultations</h4>
                        {history.map(h => (
                            <div key={h._id} style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                                <div><b>{new Date(h.appointmentDate).toLocaleDateString()}</b>: {h.diagnosis || 'No Diagnosis'}</div>
                                {h.prescriptions && h.prescriptions.filter(p => p.type === 'lab_report').map((file, idx) => (
                                    <div key={idx} style={{ marginTop: '5px', fontSize: '0.9rem' }}>
                                        🧪 <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>
                                            View Lab Report
                                        </a>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* RIGHT: CURRENT SESSION NOTEPAD */}
            <div className="right-panel" style={{ flex: 1, background: 'white', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h2 style={{ color: '#0056b3' }}>Current Session</h2>
                <input name="diagnosis" value={sessionData.diagnosis} onChange={handleSessionChange} placeholder="Diagnosis" style={{ padding: '10px', fontWeight: 'bold' }} />
                <textarea name="notes" value={sessionData.notes} onChange={handleSessionChange} placeholder="Clinical Notes..." style={{ flex: 1, padding: '10px' }} />
                <textarea name="prescription" value={sessionData.prescription} onChange={handleSessionChange} placeholder="Prescription" style={{ height: '100px', padding: '10px' }} />

                <button onClick={handleSaveAndMerge} style={{ padding: '15px', background: '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}>
                    💾 Save All & Generate Report
                </button>
            </div>
        </div>
    );
};

export default DoctorPatientDetails;