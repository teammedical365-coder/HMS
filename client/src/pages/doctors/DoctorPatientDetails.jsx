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
        doc.setFontSize(18); doc.text("CLINICAL RECORD", 105, y, { align: 'center' }); y += 15;

        // PROFILE SECTION
        doc.setFillColor(230, 230, 230); doc.rect(14, y, 180, 8, 'F');
        doc.setFontSize(12); doc.text("PATIENT PROFILE (Updated)", 16, y + 6); y += 12;

        const profileData = [
            ["Name", `${intake.firstName || ''} ${intake.lastName || ''}`],
            ["Complaint", intake.chiefComplaint || '-'],
            ["History", intake.medicalHistory || '-'],
            ["Obstetric", `G${intake.para || '-'} P${intake.liveBirth || '-'} A${intake.abortion || '-'}`]
        ];
        autoTable(doc, { startY: y, body: profileData, theme: 'plain' });
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
                <div className="tabs">
                    <button className={`tab-btn ${activeTab === 'clinical' ? 'active' : ''}`} onClick={() => setActiveTab('clinical')}>Clinical Profile</button>
                    <button className={`tab-btn ${activeTab === 'obstetric' ? 'active' : ''}`} onClick={() => setActiveTab('obstetric')}>Obstetric</button>
                    <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Past Visits</button>
                </div>

                {activeTab === 'clinical' && (
                    <div className="form-section">
                        <h4>Chief Complaint & History</h4>
                        <textarea name="chiefComplaint" value={intakeData.chiefComplaint || ''} onChange={handleIntakeChange} placeholder="Chief Complaint" style={{ width: '100%', height: '60px' }} />
                        <textarea name="medicalHistory" value={intakeData.medicalHistory || ''} onChange={handleIntakeChange} placeholder="Medical History (Diabetes, HTN...)" style={{ width: '100%', height: '60px', marginTop: '10px' }} />
                        <label>Infertility Duration (Years)</label>
                        <input name="infertilityDuration" value={intakeData.infertilityDuration || ''} onChange={handleIntakeChange} style={{ width: '100%' }} />
                    </div>
                )}

                {activeTab === 'obstetric' && (
                    <div className="form-section">
                        <h4>Obstetric Score</h4>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input placeholder="G" name="para" value={intakeData.para || ''} onChange={handleIntakeChange} />
                            <input placeholder="P" name="liveBirth" value={intakeData.liveBirth || ''} onChange={handleIntakeChange} />
                            <input placeholder="A" name="abortion" value={intakeData.abortion || ''} onChange={handleIntakeChange} />
                            <input placeholder="E" name="ectopic" value={intakeData.ectopic || ''} onChange={handleIntakeChange} />
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="history-list">
                        <h4>Previous Consultations</h4>
                        {history.map(h => (
                            <div key={h._id} style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                                <b>{new Date(h.appointmentDate).toLocaleDateString()}</b>: {h.diagnosis || 'No Diagnosis'}
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