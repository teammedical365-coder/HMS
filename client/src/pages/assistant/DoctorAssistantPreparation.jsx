import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { assistantAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import './DoctorAssistantPreparation.css';
import './DoctorAssistantDashboard.css';
import DynamicQuestionForm from '../../components/DynamicQuestionForm';
import {
    FiUserCheck, FiHeart, FiActivity, FiFileText, FiBookOpen,
    FiPaperclip, FiCheckSquare, FiSave, FiArrowLeft, FiClock,
    FiAlertCircle, FiCheck, FiPlus, FiTrash2, FiUploadCloud
} from 'react-icons/fi';

const DoctorAssistantPreparation = () => {
    const { appointmentId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [markingReady, setMarkingReady] = useState(false);

    const [appointment, setAppointment] = useState(null);
    const [department, setDepartment] = useState('General');
    const [preparation, setPreparation] = useState(null);
    const [departmentQuestions, setDepartmentQuestions] = useState({});
    const [availableDepartments, setAvailableDepartments] = useState([]);

    // Active Tab in Workspace
    const [activeTab, setActiveTab] = useState('vitals'); // 'vitals' | 'history' | 'questions' | 'reports' | 'investigations' | 'notes'

    // Form States
    const [vitals, setVitals] = useState({
        height: '', weight: '', bmi: '', bp: '', pulse: '',
        temperature: '', spo2: '', rr: '', bloodSugar: '', painScore: ''
    });

    const [clinicalHistory, setClinicalHistory] = useState({
        chiefComplaint: '', historyOfPresentIllness: '', pastMedicalHistory: '',
        pastSurgicalHistory: '', familyHistory: '', allergies: '',
        currentMedicines: '', lifestyle: '', assistantRemarks: ''
    });

    const [questionnaireAnswers, setQuestionnaireAnswers] = useState({});
    const [draftNotes, setDraftNotes] = useState('');
    const [investigations, setInvestigations] = useState([]);
    const [newInvestigation, setNewInvestigation] = useState({ testName: '', notes: '', urgency: 'Routine' });

    // Report Upload state
    const [uploadingReport, setUploadingReport] = useState(false);
    const [reportFile, setReportFile] = useState(null);
    const [reportName, setReportName] = useState('');
    const [reportDocType, setReportDocType] = useState('Previous Report');

    const fetchPreparationDetails = useCallback(async (deptToFetch) => {
        if (!appointmentId) return;
        setLoading(true);
        try {
            const params = deptToFetch ? { dept: deptToFetch } : {};
            const res = await assistantAPI.getPreparation(appointmentId, params);
            if (res.success) {
                setAppointment(res.appointment);
                setDepartment(res.department || 'General');
                setPreparation(res.preparation);
                setDepartmentQuestions(res.departmentQuestions || {});
                setAvailableDepartments(res.availableDepartments || []);

                const p = res.preparation || {};
                setVitals({
                    height: p.vitals?.height || res.appointment?.vitals?.height || '',
                    weight: p.vitals?.weight || res.appointment?.vitals?.weight || '',
                    bmi: p.vitals?.bmi || res.appointment?.vitals?.bmi || '',
                    bp: p.vitals?.bp || res.appointment?.vitals?.bp || '',
                    pulse: p.vitals?.pulse || res.appointment?.vitals?.pulse || '',
                    temperature: p.vitals?.temperature || res.appointment?.vitals?.temperature || '',
                    spo2: p.vitals?.spo2 || res.appointment?.vitals?.spo2 || '',
                    rr: p.vitals?.rr || res.appointment?.vitals?.rr || '',
                    bloodSugar: p.vitals?.bloodSugar || '',
                    painScore: p.vitals?.painScore || ''
                });

                setClinicalHistory({
                    chiefComplaint: p.preparation?.chiefComplaint || '',
                    historyOfPresentIllness: p.preparation?.historyOfPresentIllness || '',
                    pastMedicalHistory: p.preparation?.pastMedicalHistory || '',
                    pastSurgicalHistory: p.preparation?.pastSurgicalHistory || '',
                    familyHistory: p.preparation?.familyHistory || '',
                    allergies: p.preparation?.allergies || '',
                    currentMedicines: p.preparation?.currentMedicines || '',
                    lifestyle: p.preparation?.lifestyle || '',
                    assistantRemarks: p.preparation?.assistantRemarks || ''
                });

                setQuestionnaireAnswers(p.questionnaireAnswers || {});
                setDraftNotes(p.draftClinicalNotes || '');
                setInvestigations(p.investigationSuggestions || []);
            } else {
                toast.error(res.message || 'Failed to load preparation');
            }
        } catch (error) {
            console.error('Preparation fetch error:', error);
            toast.error('Error connecting to server');
        } finally {
            setLoading(false);
        }
    }, [appointmentId]);

    useEffect(() => {
        fetchPreparationDetails();
    }, [fetchPreparationDetails]);

    // BMI Auto-calculation
    const handleVitalsChange = (field, value) => {
        setVitals(prev => {
            const updated = { ...prev, [field]: value };
            if (field === 'height' || field === 'weight') {
                const h = field === 'height' ? value : prev.height;
                const w = field === 'weight' ? value : prev.weight;
                if (h && w && parseFloat(h) > 0 && parseFloat(w) > 0) {
                    const hM = parseFloat(h) / 100;
                    updated.bmi = (parseFloat(w) / (hM * hM)).toFixed(1);
                }
            }
            return updated;
        });
    };

    // Save Vitals
    const handleSaveVitals = async () => {
        setSaving(true);
        try {
            const res = await assistantAPI.updateVitals(appointmentId, vitals);
            if (res.success) {
                setPreparation(res.preparation);
                toast.success('Vitals saved successfully');
            } else {
                toast.error(res.message || 'Failed to save vitals');
            }
        } catch (error) {
            toast.error('Error saving vitals');
        } finally {
            setSaving(false);
        }
    };

    // Save Clinical History
    const handleSaveHistory = async () => {
        setSaving(true);
        try {
            const res = await assistantAPI.updateHistory(appointmentId, clinicalHistory);
            if (res.success) {
                setPreparation(res.preparation);
                toast.success('Clinical history saved');
            } else {
                toast.error(res.message || 'Failed to save history');
            }
        } catch (error) {
            toast.error('Error saving clinical history');
        } finally {
            setSaving(false);
        }
    };

    // Save Questionnaire Answers
    const handleSaveQuestionnaire = async () => {
        setSaving(true);
        try {
            const res = await assistantAPI.updateQuestionnaire(appointmentId, { questionnaireAnswers });
            if (res.success) {
                setPreparation(res.preparation);
                toast.success('Questionnaire answers saved');
            } else {
                toast.error(res.message || 'Failed to save questionnaire');
            }
        } catch (error) {
            toast.error('Error saving questionnaire');
        } finally {
            setSaving(false);
        }
    };

    // Upload Report
    const handleUploadReport = async (e) => {
        e.preventDefault();
        if (!reportFile) {
            toast.error('Please select a file to upload');
            return;
        }
        setUploadingReport(true);
        try {
            const formData = new FormData();
            formData.append('file', reportFile);
            formData.append('name', reportName || reportFile.name);
            formData.append('docType', reportDocType);

            const res = await assistantAPI.uploadReports(appointmentId, formData);
            if (res.success) {
                setPreparation(res.preparation);
                setReportFile(null);
                setReportName('');
                toast.success('Report uploaded successfully');
            } else {
                toast.error(res.message || 'Upload failed');
            }
        } catch (error) {
            toast.error('Error uploading file');
        } finally {
            setUploadingReport(false);
        }
    };

    // Save Suggested Investigations
    const handleAddInvestigation = () => {
        if (!newInvestigation.testName.trim()) {
            toast.error('Please enter a test name');
            return;
        }
        const updated = [...investigations, { ...newInvestigation }];
        setInvestigations(updated);
        setNewInvestigation({ testName: '', notes: '', urgency: 'Routine' });
        assistantAPI.updateInvestigations(appointmentId, { investigations: updated })
            .then(res => { if (res.success) setPreparation(res.preparation); })
            .catch(() => toast.error('Error saving investigation'));
    };

    const handleRemoveInvestigation = (index) => {
        const updated = investigations.filter((_, i) => i !== index);
        setInvestigations(updated);
        assistantAPI.updateInvestigations(appointmentId, { investigations: updated })
            .then(res => { if (res.success) setPreparation(res.preparation); });
    };

    // Save Draft Notes
    const handleSaveDraftNotes = async () => {
        setSaving(true);
        try {
            const res = await assistantAPI.updateNotes(appointmentId, { draftClinicalNotes: draftNotes });
            if (res.success) {
                setPreparation(res.preparation);
                toast.success('Draft notes saved');
            } else {
                toast.error(res.message || 'Failed to save notes');
            }
        } catch (error) {
            toast.error('Error saving notes');
        } finally {
            setSaving(false);
        }
    };

    // Save All
    const handleSaveAll = async () => {
        setSaving(true);
        try {
            await Promise.all([
                assistantAPI.updateVitals(appointmentId, vitals),
                assistantAPI.updateHistory(appointmentId, clinicalHistory),
                assistantAPI.updateQuestionnaire(appointmentId, { questionnaireAnswers }),
                assistantAPI.updateNotes(appointmentId, { draftClinicalNotes: draftNotes })
            ]);
            await fetchPreparationDetails();
            toast.success('All preparation sections saved successfully');
        } catch (error) {
            toast.error('Error saving sections');
        } finally {
            setSaving(false);
        }
    };

    // Mark Ready for Doctor
    const handleMarkReady = async () => {
        // Quick verification of required items
        if (!vitals.bp && !vitals.pulse && !vitals.temperature && !vitals.weight) {
            toast.error('Please record patient vitals before marking ready for doctor');
            setActiveTab('vitals');
            return;
        }

        setMarkingReady(true);
        try {
            // Ensure latest changes are persisted
            await Promise.all([
                assistantAPI.updateVitals(appointmentId, vitals),
                assistantAPI.updateHistory(appointmentId, clinicalHistory),
                assistantAPI.updateQuestionnaire(appointmentId, { questionnaireAnswers }),
                assistantAPI.updateNotes(appointmentId, { draftClinicalNotes: draftNotes })
            ]);

            const res = await assistantAPI.markReady(appointmentId);
            if (res.success) {
                setPreparation(res.preparation);
                toast.success('🎉 Patient marked READY FOR DOCTOR! Notification sent to doctor.');
            } else {
                toast.error(res.message || 'Failed to mark ready');
            }
        } catch (error) {
            toast.error('Error updating status');
        } finally {
            setMarkingReady(false);
        }
    };

    const patient = appointment?.userId || {};
    const doctor = appointment?.doctorId || {};
    const progress = preparation?.progressPercentage || 0;
    const isReady = preparation?.status === 'ready_for_doctor';
    const isCompleted = preparation?.status === 'completed' || appointment?.status === 'completed';

    const questionCategories = Object.keys(departmentQuestions || {});

    return (
        <div className="dap-container">
            {/* Top Navigation & Patient Header */}
            <div style={{ marginBottom: '16px' }}>
                <button
                    className="da-btn da-btn-secondary"
                    onClick={() => navigate('/assistant/dashboard')}
                >
                    <FiArrowLeft /> Back to Dashboard
                </button>
            </div>

            {/* Patient Header Card */}
            <div className="dap-patient-header">
                <div className="dap-patient-info">
                    <div className="dap-patient-avatar">
                        {patient.name ? patient.name.charAt(0).toUpperCase() : 'P'}
                    </div>
                    <div>
                        <h1 className="dap-patient-name">{patient.name || 'Unknown Patient'}</h1>
                        <div className="dap-patient-meta">
                            <span><strong>UHID:</strong> {patient.uhid || patient.patientId || 'N/A'}</span>
                            <span><strong>Age/Gender:</strong> {patient.age ? `${patient.age} yrs` : 'N/A'} / {patient.gender || 'N/A'}</span>
                            <span><strong>Blood Group:</strong> {patient.bloodGroup || 'N/A'}</span>
                            <span><strong>Phone:</strong> {patient.phone || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <div className="dap-doctor-tag">
                        👨‍⚕️ {doctor.name || appointment?.doctorName || 'Doctor'} • {department}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="da-patient-uhid">
                            Appt: {appointment?.appointmentTime || 'Today'}
                        </span>
                        {isReady ? (
                            <span className="da-badge ready_for_doctor">● Ready For Doctor</span>
                        ) : isCompleted ? (
                            <span className="da-badge completed">✓ Consultation Completed</span>
                        ) : (
                            <span className="da-badge preparation_in_progress">● In Preparation</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Preparation Checklist & Progress Banner */}
            <div className="dap-checklist-banner">
                <div>
                    <h3 className="dap-checklist-title">
                        <FiCheckSquare style={{ color: '#0ea5e9' }} />
                        Preparation Progress: {progress}%
                    </h3>
                </div>
                <div className="dap-checklist-items">
                    <span className={`dap-chk-item ${vitals.bp || vitals.pulse ? 'done' : ''}`}>
                        {vitals.bp || vitals.pulse ? <FiCheck color="#059669" /> : '○'} Vitals
                    </span>
                    <span className={`dap-chk-item ${clinicalHistory.chiefComplaint ? 'done' : ''}`}>
                        {clinicalHistory.chiefComplaint ? <FiCheck color="#059669" /> : '○'} Chief Complaint
                    </span>
                    <span className={`dap-chk-item ${clinicalHistory.historyOfPresentIllness ? 'done' : ''}`}>
                        {clinicalHistory.historyOfPresentIllness ? <FiCheck color="#059669" /> : '○'} History
                    </span>
                    <span className={`dap-chk-item ${Object.keys(questionnaireAnswers).length > 0 ? 'done' : ''}`}>
                        {Object.keys(questionnaireAnswers).length > 0 ? <FiCheck color="#059669" /> : '○'} {department} Questions
                    </span>
                    <span className={`dap-chk-item ${draftNotes ? 'done' : ''}`}>
                        {draftNotes ? <FiCheck color="#059669" /> : '○'} Draft Notes
                    </span>
                </div>
            </div>

            {/* Tabs Bar */}
            <div className="dap-tabs-bar">
                <button
                    className={`dap-tab-btn ${activeTab === 'vitals' ? 'active' : ''}`}
                    onClick={() => setActiveTab('vitals')}
                >
                    <FiHeart /> 1. Vitals & Biometrics
                </button>
                <button
                    className={`dap-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    <FiActivity /> 2. Clinical History
                </button>
                <button
                    className={`dap-tab-btn ${activeTab === 'questions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('questions')}
                >
                    <FiBookOpen /> 3. {department} Questionnaire
                </button>
                <button
                    className={`dap-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
                    onClick={() => setActiveTab('reports')}
                >
                    <FiPaperclip /> 4. Reports & Files
                </button>
                <button
                    className={`dap-tab-btn ${activeTab === 'investigations' ? 'active' : ''}`}
                    onClick={() => setActiveTab('investigations')}
                >
                    <FiActivity /> 5. Suggested Tests
                </button>
                <button
                    className={`dap-tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('notes')}
                >
                    <FiFileText /> 6. Draft Clinical Notes
                </button>
            </div>

            {/* TAB 1: VITALS */}
            {activeTab === 'vitals' && (
                <div className="dap-form-panel">
                    <h2 className="dap-panel-heading">
                        <FiHeart style={{ color: '#ef4444' }} />
                        Patient Vitals & Biometrics
                    </h2>
                    <div className="dap-grid-4">
                        <div className="dap-form-group">
                            <label className="dap-label">Height (cm)</label>
                            <input
                                type="number"
                                placeholder="e.g. 170"
                                value={vitals.height}
                                onChange={(e) => handleVitalsChange('height', e.target.value)}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Weight (kg)</label>
                            <input
                                type="number"
                                placeholder="e.g. 70"
                                value={vitals.weight}
                                onChange={(e) => handleVitalsChange('weight', e.target.value)}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">BMI (Auto-calculated)</label>
                            <input
                                type="text"
                                placeholder="Auto"
                                value={vitals.bmi}
                                readOnly
                                className="dap-input"
                                style={{ background: '#f8fafc', fontWeight: 700 }}
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Blood Pressure (mmHg)</label>
                            <input
                                type="text"
                                placeholder="e.g. 120/80"
                                value={vitals.bp}
                                onChange={(e) => handleVitalsChange('bp', e.target.value)}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Pulse Rate (bpm)</label>
                            <input
                                type="number"
                                placeholder="e.g. 72"
                                value={vitals.pulse}
                                onChange={(e) => handleVitalsChange('pulse', e.target.value)}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Temperature (°F)</label>
                            <input
                                type="text"
                                placeholder="e.g. 98.6"
                                value={vitals.temperature}
                                onChange={(e) => handleVitalsChange('temperature', e.target.value)}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">SpO2 Oxygen Saturation (%)</label>
                            <input
                                type="number"
                                placeholder="e.g. 99"
                                value={vitals.spo2}
                                onChange={(e) => handleVitalsChange('spo2', e.target.value)}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Respiratory Rate (breaths/min)</label>
                            <input
                                type="number"
                                placeholder="e.g. 16"
                                value={vitals.rr}
                                onChange={(e) => handleVitalsChange('rr', e.target.value)}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Random Blood Sugar (mg/dL)</label>
                            <input
                                type="text"
                                placeholder="e.g. 110"
                                value={vitals.bloodSugar}
                                onChange={(e) => handleVitalsChange('bloodSugar', e.target.value)}
                                className="dap-input"
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <label className="dap-label">Pain Score Rating (0 = No Pain, 10 = Unbearable)</label>
                        <div className="dap-pain-bar">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
                                <button
                                    key={score}
                                    type="button"
                                    className={`dap-pain-btn ${String(vitals.painScore) === String(score) ? 'selected' : ''}`}
                                    onClick={() => handleVitalsChange('painScore', String(score))}
                                >
                                    {score}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className="da-btn da-btn-primary"
                            onClick={handleSaveVitals}
                            disabled={saving}
                        >
                            <FiSave /> {saving ? 'Saving...' : 'Save Vitals'}
                        </button>
                    </div>
                </div>
            )}

            {/* TAB 2: CLINICAL HISTORY */}
            {activeTab === 'history' && (
                <div className="dap-form-panel">
                    <h2 className="dap-panel-heading">
                        <FiActivity style={{ color: '#0ea5e9' }} />
                        Preliminary Clinical History & Intake
                    </h2>

                    <div className="dap-grid-2">
                        <div className="dap-form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="dap-label">Chief Complaint (Primary Reason for Visit) *</label>
                            <textarea
                                rows={2}
                                placeholder="e.g. Chest discomfort on exertion for 3 days, mild shortness of breath..."
                                value={clinicalHistory.chiefComplaint}
                                onChange={(e) => setClinicalHistory(prev => ({ ...prev, chiefComplaint: e.target.value }))}
                                className="dap-textarea"
                            />
                        </div>

                        <div className="dap-form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="dap-label">History of Present Illness (HPI)</label>
                            <textarea
                                rows={3}
                                placeholder="Details regarding onset, duration, character, radiation, aggravating and relieving factors..."
                                value={clinicalHistory.historyOfPresentIllness}
                                onChange={(e) => setClinicalHistory(prev => ({ ...prev, historyOfPresentIllness: e.target.value }))}
                                className="dap-textarea"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Known Allergies (Food, Drugs, Environmental)</label>
                            <input
                                type="text"
                                placeholder="e.g. Penicillin, Peanuts (or None)"
                                value={clinicalHistory.allergies}
                                onChange={(e) => setClinicalHistory(prev => ({ ...prev, allergies: e.target.value }))}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Current Medicines & Dosages</label>
                            <input
                                type="text"
                                placeholder="e.g. Telmisartan 40mg OD, Metformin 500mg BD"
                                value={clinicalHistory.currentMedicines}
                                onChange={(e) => setClinicalHistory(prev => ({ ...prev, currentMedicines: e.target.value }))}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Past Medical History</label>
                            <input
                                type="text"
                                placeholder="e.g. Hypertension (5 yrs), Type 2 Diabetes"
                                value={clinicalHistory.pastMedicalHistory}
                                onChange={(e) => setClinicalHistory(prev => ({ ...prev, pastMedicalHistory: e.target.value }))}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Past Surgical / Hospitalization History</label>
                            <input
                                type="text"
                                placeholder="e.g. Appendectomy in 2018"
                                value={clinicalHistory.pastSurgicalHistory}
                                onChange={(e) => setClinicalHistory(prev => ({ ...prev, pastSurgicalHistory: e.target.value }))}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Family Medical History</label>
                            <input
                                type="text"
                                placeholder="e.g. Father had CAD at age 52, Mother has Type 2 DM"
                                value={clinicalHistory.familyHistory}
                                onChange={(e) => setClinicalHistory(prev => ({ ...prev, familyHistory: e.target.value }))}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group">
                            <label className="dap-label">Lifestyle / Habits</label>
                            <input
                                type="text"
                                placeholder="e.g. Non-smoker, occasional alcohol, sedentary"
                                value={clinicalHistory.lifestyle}
                                onChange={(e) => setClinicalHistory(prev => ({ ...prev, lifestyle: e.target.value }))}
                                className="dap-input"
                            />
                        </div>

                        <div className="dap-form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="dap-label">Assistant Remarks / Observations</label>
                            <textarea
                                rows={2}
                                placeholder="Any additional observational notes for the consulting doctor..."
                                value={clinicalHistory.assistantRemarks}
                                onChange={(e) => setClinicalHistory(prev => ({ ...prev, assistantRemarks: e.target.value }))}
                                className="dap-textarea"
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className="da-btn da-btn-primary"
                            onClick={handleSaveHistory}
                            disabled={saving}
                        >
                            <FiSave /> {saving ? 'Saving...' : 'Save Clinical History'}
                        </button>
                    </div>
                </div>
            )}

            {/* TAB 3: DEPARTMENT QUESTIONS */}
            {activeTab === 'questions' && (
                <div className="dap-form-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h2 className="dap-panel-heading" style={{ margin: 0 }}>
                                <FiBookOpen style={{ color: '#0ea5e9' }} />
                                {department} Clinical Intake Questionnaire
                            </h2>
                            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0 0' }}>
                                Structured clinical questions for {doctor.name || 'Doctor'} ({appointment?.department || department})
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>Switch Protocol:</label>
                            <select
                                className="dap-select"
                                style={{ padding: '6px 12px', fontSize: '0.85rem', minWidth: '180px' }}
                                value={department}
                                onChange={(e) => fetchPreparationDetails(e.target.value)}
                            >
                                {(availableDepartments.length > 0 ? availableDepartments : [
                                    'General Medicine', 'Cardiology', 'ENT', 'Orthopedics', 'Pediatrics',
                                    'Gynecology & Obstetrics', 'Dermatology', 'Ophthalmology', 'Neurology',
                                    'Gastroenterology', 'Pulmonology', 'Dentistry', 'IVF & Fertility',
                                    'General Surgery', 'Urology'
                                ]).map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {questionCategories.length === 0 ? (
                        <div className="da-empty-state">
                            No specific intake questionnaires configured for {department}. You can select another specialty from the dropdown above or proceed with vitals and general history.
                        </div>
                    ) : (
                        questionCategories.map(catName => (
                            <div key={catName} style={{ marginBottom: '24px' }}>
                                <DynamicQuestionForm
                                    categoryName={catName}
                                    questions={departmentQuestions[catName] || []}
                                    intakeData={questionnaireAnswers}
                                    setIntakeData={setQuestionnaireAnswers}
                                    readOnly={isCompleted}
                                />
                            </div>
                        ))
                    )}

                    {questionCategories.length > 0 && (
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                className="da-btn da-btn-primary"
                                onClick={handleSaveQuestionnaire}
                                disabled={saving}
                            >
                                <FiSave /> {saving ? 'Saving...' : 'Save Questionnaire Responses'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 4: REPORTS & FILES */}
            {activeTab === 'reports' && (
                <div className="dap-form-panel">
                    <h2 className="dap-panel-heading">
                        <FiPaperclip style={{ color: '#0ea5e9' }} />
                        Previous Reports & External Prescriptions
                    </h2>

                    {/* Upload Box */}
                    <form onSubmit={handleUploadReport} style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '0 0 12px 0' }}>Upload New File / Report</h3>
                        <div className="dap-grid-3">
                            <div className="dap-form-group">
                                <label className="dap-label">Document Title</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Previous Echo Report, Blood Test"
                                    value={reportName}
                                    onChange={(e) => setReportName(e.target.value)}
                                    className="dap-input"
                                />
                            </div>

                            <div className="dap-form-group">
                                <label className="dap-label">Document Type</label>
                                <select
                                    value={reportDocType}
                                    onChange={(e) => setReportDocType(e.target.value)}
                                    className="dap-select"
                                >
                                    <option value="Previous Report">Previous Medical Report</option>
                                    <option value="External Prescription">External Prescription</option>
                                    <option value="Lab Test Result">Lab Test Result</option>
                                    <option value="X-Ray / Scan">X-Ray / Scan</option>
                                    <option value="Other Document">Other Document</option>
                                </select>
                            </div>

                            <div className="dap-form-group">
                                <label className="dap-label">Select File (PDF, JPEG, PNG)</label>
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,application/pdf"
                                    onChange={(e) => setReportFile(e.target.files?.[0] || null)}
                                    className="dap-input"
                                    style={{ padding: '6px' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="submit"
                                className="da-btn da-btn-primary"
                                disabled={uploadingReport}
                            >
                                <FiUploadCloud /> {uploadingReport ? 'Uploading...' : 'Upload Document'}
                            </button>
                        </div>
                    </form>

                    {/* List of Uploaded Reports */}
                    <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '0 0 12px 0' }}>Uploaded Patient Documents</h3>
                    {(preparation?.reportReferences || []).length === 0 ? (
                        <div className="da-empty-state">No previous reports uploaded yet.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {preparation.reportReferences.map((rep, rIdx) => (
                                <div
                                    key={rIdx}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '12px 16px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        background: '#ffffff'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{rep.name}</div>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                            {rep.docType} • Uploaded by {rep.uploadedBy} on {new Date(rep.uploadedAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <a
                                        href={rep.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="da-action-btn view"
                                    >
                                        View Document ↗
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 5: SUGGESTED INVESTIGATIONS */}
            {activeTab === 'investigations' && (
                <div className="dap-form-panel">
                    <h2 className="dap-panel-heading">
                        <FiActivity style={{ color: '#0ea5e9' }} />
                        Suggested Investigations for Doctor Review
                    </h2>
                    <p style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '-10px', marginBottom: '16px' }}>
                        Note: Assistant suggestions are preliminary flags for the consulting doctor. The doctor retains final ordering authority.
                    </p>

                    {/* Add Investigation Form */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="e.g. ECG, Complete Blood Count (CBC), Serum Creatinine"
                            value={newInvestigation.testName}
                            onChange={(e) => setNewInvestigation(prev => ({ ...prev, testName: e.target.value }))}
                            className="dap-input"
                            style={{ flex: 2, minWidth: '220px' }}
                        />
                        <input
                            type="text"
                            placeholder="Clinical indication / notes (optional)"
                            value={newInvestigation.notes}
                            onChange={(e) => setNewInvestigation(prev => ({ ...prev, notes: e.target.value }))}
                            className="dap-input"
                            style={{ flex: 2, minWidth: '200px' }}
                        />
                        <select
                            value={newInvestigation.urgency}
                            onChange={(e) => setNewInvestigation(prev => ({ ...prev, urgency: e.target.value }))}
                            className="dap-select"
                            style={{ flex: 1, minWidth: '120px' }}
                        >
                            <option value="Routine">Routine</option>
                            <option value="Urgent">Urgent</option>
                            <option value="Stat">Stat</option>
                        </select>
                        <button
                            type="button"
                            className="da-btn da-btn-primary"
                            onClick={handleAddInvestigation}
                        >
                            <FiPlus /> Suggest Test
                        </button>
                    </div>

                    {/* List of Investigations */}
                    {investigations.length === 0 ? (
                        <div className="da-empty-state">No investigations suggested yet.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {investigations.map((inv, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '10px 14px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        background: '#f8fafc'
                                    }}
                                >
                                    <div>
                                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{inv.testName}</span>
                                        {inv.notes && <span style={{ color: '#64748b', fontSize: '0.82rem', marginLeft: '8px' }}>— {inv.notes}</span>}
                                        <span style={{
                                            marginLeft: '10px',
                                            fontSize: '0.72rem',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontWeight: 700,
                                            background: inv.urgency === 'Urgent' ? '#fee2e2' : '#e0f2fe',
                                            color: inv.urgency === 'Urgent' ? '#b91c1c' : '#0369a1'
                                        }}>
                                            {inv.urgency}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveInvestigation(idx)}
                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                                    >
                                        <FiTrash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 6: DRAFT CLINICAL NOTES */}
            {activeTab === 'notes' && (
                <div className="dap-form-panel">
                    <div className="dap-draft-banner">
                        <FiAlertCircle size={18} />
                        <span>DRAFT — FOR DOCTOR REVIEW ONLY. This preliminary note will be available for doctor review and consultation import.</span>
                    </div>

                    <h2 className="dap-panel-heading">
                        <FiFileText style={{ color: '#0ea5e9' }} />
                        Assistant Draft Clinical Notes
                    </h2>

                    <div className="dap-form-group">
                        <textarea
                            rows={8}
                            placeholder="Draft your clinical intake summary, key observations, and pre-consultation notes here for the doctor..."
                            value={draftNotes}
                            onChange={(e) => setDraftNotes(e.target.value)}
                            className="dap-textarea"
                            style={{ minHeight: '180px' }}
                        />
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className="da-btn da-btn-primary"
                            onClick={handleSaveDraftNotes}
                            disabled={saving}
                        >
                            <FiSave /> {saving ? 'Saving...' : 'Save Draft Notes'}
                        </button>
                    </div>
                </div>
            )}

            {/* Action Footer Bar */}
            <div className="dap-footer-bar">
                <div className="dap-footer-status">
                    <span>
                        Status: {isReady ? 'Ready For Doctor' : isCompleted ? 'Completed' : 'In Preparation'}
                    </span>
                    {preparation?.readyAt && (
                        <span style={{ fontSize: '0.8rem', color: '#059669' }}>
                            • Marked ready on {new Date(preparation.readyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                </div>

                <div className="dap-footer-actions">
                    <button
                        className="da-btn da-btn-secondary"
                        onClick={handleSaveAll}
                        disabled={saving}
                    >
                        <FiSave /> {saving ? 'Saving...' : 'Save Progress'}
                    </button>

                    <button
                        className="dap-btn-ready"
                        onClick={handleMarkReady}
                        disabled={markingReady || isCompleted}
                    >
                        <FiCheckCircle />
                        {markingReady ? 'Marking Ready...' : isReady ? 'Update Ready Status' : 'MARK READY FOR DOCTOR'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DoctorAssistantPreparation;
