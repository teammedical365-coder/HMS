import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../store/hooks';
import { reportAPI, patientAPI, admissionAPI, doctorAPI } from '../../utils/api';
import {
    FiSearch,
    FiFileText,
    FiUploadCloud,
    FiDownload,
    FiEye,
    FiUser,
    FiShield,
    FiPrinter,
    FiRefreshCw,
    FiFolder,
    FiX,
    FiCheckCircle,
    FiInfo
} from 'react-icons/fi';
import './NursePatientDocuments.css';

const REPORT_CATEGORIES = [
    { value: 'LAB_REPORT', label: '🔬 Blood / Lab Investigation' },
    { value: 'RADIOLOGY', label: '🩻 Radiology (X-Ray / CT / MRI / USG)' },
    { value: 'CARDIOLOGY', label: '❤️ ECG / 2D-Echo / Cardiac' },
    { value: 'PATHOLOGY', label: '🧪 Pathology / Biopsy Report' },
    { value: 'DISCHARGE_SUMMARY', label: '📑 Previous Hospital Discharge' },
    { value: 'SURGERY_NOTES', label: '🏥 Operation / Procedure Notes' },
    { value: 'PRESCRIPTION', label: '💊 External Prescription / RX' },
    { value: 'OTHER', label: '📁 Other Clinical Record' }
];

const CONSENT_TEMPLATES = [
    {
        value: 'GENERAL_ADMISSION',
        label: '🏥 General Inpatient Admission & Treatment Consent',
        title: 'GENERAL INFORMED ADMISSION & TREATMENT CONSENT',
        description: 'Standard consent for inpatient admission, routine clinical diagnostic tests, vital monitoring, and general nursing care.'
    },
    {
        value: 'SURGERY_PROCEDURE',
        label: '🔪 Surgical Operation & Invasive Procedure Consent',
        title: 'INFORMED CONSENT FOR SURGERY / INVASIVE PROCEDURE',
        description: 'Specific consent explaining operative procedure, surgical risks, alternatives, and emergency contingency interventions.'
    },
    {
        value: 'ANESTHESIA',
        label: '💉 General / Regional Anesthesia Administration Consent',
        title: 'CONSENT FOR ANESTHESIA & ANALGESIC ADMINISTRATION',
        description: 'Consent for general, spinal, epidural, or local sedation detailing anesthetic risks and hemodynamic monitoring.'
    },
    {
        value: 'HIGH_RISK',
        label: '⚠️ High-Risk Clinical Treatment & Critical Care Consent',
        title: 'HIGH-RISK CLINICAL INTERVENTION & ICU CARE CONSENT',
        description: 'Consent for critical care management, mechanical ventilation, central venous line access, and advanced life support.'
    },
    {
        value: 'BLOOD_TRANSFUSION',
        label: '🩸 Blood & Blood Component Transfusion Consent',
        title: 'CONSENT FOR BLOOD & BLOOD PRODUCTS TRANSFUSION',
        description: 'Consent explaining transfusion indication, compatibility cross-matching, and potential immunological/allergic risks.'
    },
    {
        value: 'DAMA',
        label: '🚪 Discharge Against Medical Advice (DAMA) Declaration',
        title: 'DISCHARGE AGAINST MEDICAL ADVICE (DAMA) REFUSAL',
        description: 'Patient/Family legal declaration releasing hospital and doctors from liability upon self-directed premature discharge.'
    }
];

// Helper to accurately extract patient age
const getPatientAge = (pt) => {
    if (!pt) return '—';
    if (pt.age && Number(pt.age) > 0) return `${pt.age} yrs`;
    const rawDob = pt.dob || pt.dateOfBirth || pt.birthDate;
    if (rawDob) {
        try {
            const bDate = new Date(rawDob);
            if (!isNaN(bDate.getTime())) {
                const now = new Date();
                let age = now.getFullYear() - bDate.getFullYear();
                const m = now.getMonth() - bDate.getMonth();
                if (m < 0 || (m === 0 && now.getDate() < bDate.getDate())) {
                    age--;
                }
                if (age >= 0) return `${age} yrs`;
            }
        } catch (e) {}
    }
    return '—';
};

const getPatientGender = (pt) => {
    if (!pt) return '—';
    return pt.gender || pt.sex || '—';
};

const NursePatientDocuments = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('reports'); // 'reports' | 'consent'

    // Patient selection
    const [patients, setPatients] = useState([]);
    const [admissions, setAdmissions] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [loadingPatients, setLoadingPatients] = useState(true);

    // Reports state
    const [reportsList, setReportsList] = useState([]);
    const [loadingReports, setLoadingReports] = useState(false);
    const [reportForm, setReportForm] = useState({
        category: 'LAB_REPORT',
        title: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
        file: null
    });
    const [uploadingReport, setUploadingReport] = useState(false);

    // Consent forms state
    const [consentList, setConsentList] = useState([]);
    const [loadingConsents, setLoadingConsents] = useState(false);
    const [selectedDownloadTemplate, setSelectedDownloadTemplate] = useState('GENERAL_ADMISSION');
    const [customDoctorName, setCustomDoctorName] = useState('');
    const [consentForm, setConsentForm] = useState({
        consentType: 'GENERAL_ADMISSION',
        procedureName: '',
        doctorName: '',
        witnessName: '',
        witnessRelation: 'Self',
        witnessPhone: '',
        notes: '',
        file: null
    });
    const [uploadingConsent, setUploadingConsent] = useState(false);

    // Toast notification
    const [toast, setToast] = useState(null);
    const toastTimerRef = useRef(null);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 3500);
    }, []);

    // ── Fetch Patients & IPD Admissions ──
    const fetchInitialData = useCallback(async () => {
        setLoadingPatients(true);
        try {
            const [ptsRes, admRes] = await Promise.all([
                patientAPI.search('').catch(() => ({ data: [] })),
                admissionAPI.getActiveAdmissions().catch(() => ({ admissions: [] }))
            ]);

            const rawPts = ptsRes.data || ptsRes.patients || [];
            const activeAdms = admRes.admissions || admRes.data || [];

            setPatients(rawPts);
            setAdmissions(activeAdms);

            // Auto-select first patient if none selected
            if (rawPts.length > 0) {
                const firstPt = rawPts[0];
                const matchAdm = activeAdms.find(a => String(a.patientId?._id || a.patientId) === String(firstPt._id));
                setSelectedPatient({ ...firstPt, admission: matchAdm });
            }
        } catch (err) {
            console.error('Error fetching patients:', err);
            showToast('Failed to load patient directory', 'error');
        } finally {
            setLoadingPatients(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    // ── Fetch Selected Patient's Reports & Consents ──
    const fetchPatientRecords = useCallback(async () => {
        if (!selectedPatient?._id) return;
        const patientId = selectedPatient._id;

        // Fetch reports
        setLoadingReports(true);
        try {
            const [repRes, docRes, userHistory] = await Promise.all([
                reportAPI.getReportsByPatient(patientId).catch(() => ({ reports: [] })),
                patientAPI.getDocuments(patientId).catch(() => ({ documents: [] })),
                patientAPI.getFullHistory(patientId).catch(() => ({}))
            ]);

            const serverReports = repRes.reports || [];
            const docs = docRes.documents || docRes.data || [];
            const userReports = userHistory.patient?.fertilityProfile?.reports || [];

            // Combine unique reports by url/fileId
            const combined = [...serverReports];
            const seen = new Set(serverReports.map(r => r.url || r.fileId));

            docs.forEach(d => {
                if (d.url && !seen.has(d.url)) {
                    seen.add(d.url);
                    combined.push(d);
                }
            });

            userReports.forEach(ur => {
                if (ur.url && !seen.has(ur.url)) {
                    seen.add(ur.url);
                    combined.push({
                        ...ur,
                        fileName: ur.name || ur.fileName || 'Diagnostic Report',
                        uploadedAt: ur.date || ur.uploadedAt || new Date()
                    });
                }
            });

            setReportsList(combined);
        } catch (err) {
            console.warn('Could not load reports:', err);
        } finally {
            setLoadingReports(false);
        }

        // Fetch consents
        setLoadingConsents(true);
        try {
            const consentRes = await patientAPI.getConsent(patientId).catch(() => ({ consentForms: [] }));
            setConsentList(consentRes.consentForms || consentRes.data || []);
        } catch (err) {
            console.warn('Could not load consents:', err);
        } finally {
            setLoadingConsents(false);
        }
    }, [selectedPatient]);

    useEffect(() => {
        fetchPatientRecords();
    }, [fetchPatientRecords]);

    // ── Filtered Patients List ──
    const filteredPatients = useMemo(() => {
        if (!searchTerm.trim()) return patients;

        const q = searchTerm.toLowerCase().trim();
        return patients.filter(p => {
            const name = (p.name || '').toLowerCase();
            const mrn = (p.patientId || p.mrn || p.uhid || '').toLowerCase();
            const phone = (p.phone || '').toLowerCase();
            return name.includes(q) || mrn.includes(q) || phone.includes(q);
        });
    }, [patients, searchTerm]);

    // ── Handle Upload Diagnostic Report ──
    const handleReportSubmit = async (e) => {
        e.preventDefault();
        if (!selectedPatient?._id) {
            showToast('Please select a patient first', 'error');
            return;
        }
        if (!reportForm.file) {
            showToast('Please select a report file to upload', 'error');
            return;
        }

        setUploadingReport(true);
        try {
            const formData = new FormData();
            formData.append('reportFile', reportForm.file);
            formData.append('patientId', selectedPatient._id);
            formData.append('category', reportForm.category);
            formData.append('reportName', reportForm.title || reportForm.file.name);
            formData.append('notes', reportForm.notes);

            if (selectedPatient.admission?._id) {
                formData.append('admissionId', selectedPatient.admission._id);
            }

            let uploadSuccess = false;

            try {
                const res = await reportAPI.uploadReport(formData);
                if (res.success || res.report) uploadSuccess = true;
            } catch (rErr) {
                console.warn('reportAPI.uploadReport failed, falling back to patient document upload...', rErr);
                const docFormData = new FormData();
                docFormData.append('document', reportForm.file);
                docFormData.append('docType', reportForm.category);
                docFormData.append('title', reportForm.title || reportForm.file.name);
                docFormData.append('notes', reportForm.notes);
                const docRes = await patientAPI.uploadDocument(selectedPatient._id, docFormData);
                if (docRes.success || docRes.document) uploadSuccess = true;
            }

            if (uploadSuccess) {
                showToast('Diagnostic report uploaded successfully!', 'success');
                setReportForm({
                    category: 'LAB_REPORT',
                    title: '',
                    date: new Date().toISOString().split('T')[0],
                    notes: '',
                    file: null
                });
                fetchPatientRecords();
            } else {
                showToast('Failed to upload report. Please check file.', 'error');
            }
        } catch (err) {
            console.error('Report upload failed:', err);
            showToast(err.response?.data?.message || err.message || 'Error uploading report', 'error');
        } finally {
            setUploadingReport(false);
        }
    };

    // ── Handle Consent Template Download & Print ──
    const handlePrintConsentForm = (templateKey, isBlank = false) => {
        if (!selectedPatient && !isBlank) {
            showToast('Please select a patient first', 'error');
            return;
        }

        const template = CONSENT_TEMPLATES.find(t => t.value === templateKey) || CONSENT_TEMPLATES[0];
        const ptName = isBlank ? '______________________________' : (selectedPatient?.name || '—');
        const ptMRN = isBlank ? '___________________' : (selectedPatient?.patientId || selectedPatient?.mrn || 'N/A');
        const ptAge = isBlank ? '______' : getPatientAge(selectedPatient);
        const ptGender = isBlank ? '______' : getPatientGender(selectedPatient);
        const ptPhone = isBlank ? '___________________' : (selectedPatient?.phone || '—');
        const docName = customDoctorName.trim() || (user?.name ? `Dr. ${user.name}` : 'Attending Physician');
        const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

        const printWindow = window.open('', '_blank', 'width=850,height=900');
        if (!printWindow) {
            showToast('Please allow popups in your browser to print the consent form', 'error');
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${template.title} - ${ptName}</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Arial, sans-serif;
                        color: #0f172a;
                        padding: 30px 40px;
                        line-height: 1.5;
                        font-size: 13.5px;
                    }
                    .h-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 2px solid #0284c7;
                        padding-bottom: 12px;
                        margin-bottom: 16px;
                    }
                    .h-logo {
                        font-size: 20px;
                        font-weight: 800;
                        color: #0284c7;
                        letter-spacing: -0.02em;
                    }
                    .h-sub {
                        font-size: 11px;
                        color: #64748b;
                        text-align: right;
                    }
                    .doc-title {
                        text-align: center;
                        font-size: 16px;
                        font-weight: 800;
                        color: #0f172a;
                        margin: 14px 0 16px;
                        text-transform: uppercase;
                        letter-spacing: 0.04em;
                        border-bottom: 1px dashed #cbd5e1;
                        padding-bottom: 8px;
                    }
                    .pt-box {
                        background: #f8fafc;
                        border: 1px solid #cbd5e1;
                        border-radius: 8px;
                        padding: 12px 16px;
                        margin-bottom: 18px;
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px;
                        font-size: 12.5px;
                    }
                    .pt-row {
                        display: flex;
                        gap: 6px;
                    }
                    .pt-row strong {
                        color: #334155;
                        min-width: 90px;
                    }
                    .clause-list {
                        padding-left: 18px;
                        margin-bottom: 20px;
                    }
                    .clause-list li {
                        margin-bottom: 10px;
                        text-align: justify;
                    }
                    .sig-section {
                        margin-top: 40px;
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 30px;
                    }
                    .sig-box {
                        border-top: 1px solid #475569;
                        padding-top: 6px;
                        font-size: 12px;
                    }
                    .sig-box strong {
                        display: block;
                        font-size: 13px;
                        margin-bottom: 2px;
                    }
                    .btn-print-bar {
                        background: #0284c7;
                        color: #fff;
                        padding: 10px;
                        text-align: center;
                        font-weight: 700;
                        margin-bottom: 20px;
                        border-radius: 6px;
                        cursor: pointer;
                    }
                    @media print {
                        .btn-print-bar { display: none; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="btn-print-bar" onclick="window.print()">🖨️ CLICK HERE TO PRINT / SAVE AS PDF</div>
                <div class="h-header">
                    <div>
                        <div class="h-logo">🏥 MEDICAL365 HEALTHCARE SYSTEM</div>
                        <div style="font-size: 11px; color: #475569;">Clinical Documentation & Legal Medical Records</div>
                    </div>
                    <div class="h-sub">
                        <div>Date: <strong>${dateStr}</strong></div>
                        <div>Hospital Record ID: <strong>${ptMRN}</strong></div>
                    </div>
                </div>

                <div class="doc-title">${template.title}</div>

                <div class="pt-box">
                    <div class="pt-row"><strong>Patient Name:</strong> <span>${ptName}</span></div>
                    <div class="pt-row"><strong>MRN / UHID:</strong> <span>${ptMRN}</span></div>
                    <div class="pt-row"><strong>Age / Gender:</strong> <span>${ptAge} / ${ptGender}</span></div>
                    <div class="pt-row"><strong>Contact Phone:</strong> <span>${ptPhone}</span></div>
                    <div class="pt-row"><strong>Doctor In-Charge:</strong> <span>${docName}</span></div>
                    <div class="pt-row"><strong>Date of Consent:</strong> <span>${dateStr}</span></div>
                </div>

                <ol class="clause-list">
                    <li><strong>Acknowledgment of Clinical Examination & Treatment:</strong> I hereby give my informed consent to undergo the medical evaluation, inpatient admission, nursing care, diagnostic examinations, and therapeutic treatments deemed clinically appropriate by the attending physicians and nursing staff.</li>
                    <li><strong>Explanation of Risks & Alternatives:</strong> The purpose, potential medical benefits, risks, foreseeable side effects, and available alternative courses of treatment have been thoroughly explained to me in a language that I understand.</li>
                    <li><strong>Medication & Emergency Interventions:</strong> I authorize the medical and nursing team to administer prescribed medications, IV fluids, injections, and life-saving emergency medical interventions as required during the course of my treatment.</li>
                    <li><strong>Accuracy of Information:</strong> I confirm that I have disclosed all known past medical illnesses, prior surgeries, drug allergies, and current ongoing medications accurately to the healthcare team.</li>
                    <li><strong>Voluntary Consent:</strong> I confirm that I am signing this informed consent document voluntarily, in a sound state of mind, without any coercion or undue influence.</li>
                </ol>

                <div class="sig-section">
                    <div class="sig-box">
                        <strong>Patient / Legal Guardian Signature</strong>
                        <div>Name: _______________________________</div>
                        <div>Relationship to Patient: _______________</div>
                        <div>Date & Time: ________________________</div>
                    </div>
                    <div class="sig-box">
                        <strong>Attending Doctor / Witness Signature</strong>
                        <div>Name: ${docName}</div>
                        <div>Designation / Staff ID: _______________</div>
                        <div>Date & Time: ________________________</div>
                    </div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        showToast('Printable consent form opened in new window!', 'success');
    };

    // ── Handle Upload Signed Consent Form ──
    const handleConsentSubmit = async (e) => {
        e.preventDefault();
        if (!selectedPatient?._id) {
            showToast('Please select a patient first', 'error');
            return;
        }
        if (!consentForm.file) {
            showToast('Please attach the signed consent document or photo', 'error');
            return;
        }

        setUploadingConsent(true);
        try {
            const formData = new FormData();
            formData.append('consentFile', consentForm.file);
            formData.append('consentType', consentForm.consentType);
            formData.append('procedureName', consentForm.procedureName);
            formData.append('doctorName', consentForm.doctorName);
            formData.append('witnessName', consentForm.witnessName);
            formData.append('witnessRelation', consentForm.witnessRelation);
            formData.append('witnessPhone', consentForm.witnessPhone);
            formData.append('notes', consentForm.notes);

            const res = await patientAPI.uploadConsent(selectedPatient._id, formData);
            if (res.success || res.consent) {
                showToast('Patient signed consent recorded and archived!', 'success');
                setConsentForm({
                    consentType: 'GENERAL_ADMISSION',
                    procedureName: '',
                    doctorName: '',
                    witnessName: '',
                    witnessRelation: 'Self',
                    witnessPhone: '',
                    notes: '',
                    file: null
                });
                fetchPatientRecords();
            } else {
                showToast(res.message || 'Failed to upload consent form', 'error');
            }
        } catch (err) {
            console.error('Consent upload failed:', err);
            showToast(err.response?.data?.message || err.message || 'Error uploading consent', 'error');
        } finally {
            setUploadingConsent(false);
        }
    };

    return (
        <div className="npd-container">
            {/* ── Centered Toast Notification ── */}
            {toast && (
                <div className={`npd-toast ${toast.type}`}>
                    <span>{toast.message}</span>
                </div>
            )}

            {/* ── Page Header ── */}
            <div className="npd-header">
                <div>
                    <span className="npd-badge">CLINICAL DOCUMENTATION PORTAL</span>
                    <h1 className="npd-title">Patient Reports & Consent Management</h1>
                    <p className="npd-subtitle">
                        Download hospital consent forms, upload signed clinical documentation, and attach diagnostic lab reports synced with Doctor and Reception profiles.
                    </p>
                </div>
                <div className="npd-header-stats">
                    <div className="npd-stat-chip">
                        <span className="stat-val">{patients.length}</span>
                        <span className="stat-lbl">Patients</span>
                    </div>
                    <div className="npd-stat-chip teal">
                        <span className="stat-val">{reportsList.length}</span>
                        <span className="stat-lbl">Reports</span>
                    </div>
                    <div className="npd-stat-chip purple">
                        <span className="stat-val">{consentList.length}</span>
                        <span className="stat-lbl">Consents</span>
                    </div>
                </div>
            </div>

            {/* ── Main Layout: Left Directory + Right Workspace ── */}
            <div className="npd-layout">
                {/* ── LEFT PANEL: PATIENT DIRECTORY ── */}
                <div className="npd-sidebar-card">
                    <div className="npd-sidebar-header">
                        <h3><FiUser /> Patient Directory ({patients.length})</h3>
                    </div>

                    <div className="npd-search-box">
                        <FiSearch className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search by patient name, MRN, phone..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
                                <FiX size={12} />
                            </button>
                        )}
                    </div>

                    {loadingPatients ? (
                        <div className="npd-loading-small">Loading patient list...</div>
                    ) : filteredPatients.length === 0 ? (
                        <div className="npd-empty-small">
                            <FiUser size={24} color="#94a3b8" />
                            <p>No matching patients found.</p>
                        </div>
                    ) : (
                        <div className="npd-pt-list">
                            {filteredPatients.map(pt => {
                                const isSelected = selectedPatient?._id === pt._id;
                                const matchAdm = admissions.find(a => String(a.patientId?._id || a.patientId) === String(pt._id));
                                const initials = (pt.name || 'PT').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                                return (
                                    <div
                                        key={pt._id}
                                        className={`npd-pt-card ${isSelected ? 'selected' : ''}`}
                                        onClick={() => setSelectedPatient({ ...pt, admission: matchAdm })}
                                    >
                                        <div className="pt-avatar">{initials}</div>
                                        <div className="pt-info">
                                            <div className="pt-name-row">
                                                <strong className="pt-name">{pt.name}</strong>
                                                {matchAdm && (
                                                    <span className="pt-ipd-badge">IPD: {matchAdm.ward}</span>
                                                )}
                                            </div>
                                            <div className="pt-meta-row">
                                                <span>MRN: {pt.patientId || pt.mrn || 'N/A'}</span>
                                                <span>•</span>
                                                <span>{getPatientGender(pt)} {getPatientAge(pt) !== '—' ? `• ${getPatientAge(pt)}` : ''}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── RIGHT PANEL: WORKSPACE ── */}
                <div className="npd-workspace">
                    {selectedPatient ? (
                        <>
                            {/* Selected Patient Overview Banner */}
                            <div className="npd-patient-banner">
                                <div className="banner-left">
                                    <div className="banner-avatar">
                                        {(selectedPatient.name || 'PT').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="banner-details">
                                        <h2>{selectedPatient.name}</h2>
                                        <div className="banner-chips">
                                            <span className="banner-chip">MRN: <strong>{selectedPatient.patientId || selectedPatient.mrn || 'N/A'}</strong></span>
                                            <span className="banner-chip">Age/Gender: <strong>{getPatientAge(selectedPatient)} / {getPatientGender(selectedPatient)}</strong></span>
                                            <span className="banner-chip">Phone: <strong>{selectedPatient.phone || '—'}</strong></span>
                                            {selectedPatient.admission && (
                                                <span className="banner-chip ipd">
                                                    🟢 IPD Admitted: {selectedPatient.admission.ward} (Bed {selectedPatient.admission.bedNumber || 'Assigned'})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="npd-refresh-btn"
                                    onClick={fetchPatientRecords}
                                    title="Refresh patient documentation records"
                                >
                                    <FiRefreshCw size={14} className={loadingReports || loadingConsents ? 'spinning' : ''} />
                                    <span>Sync</span>
                                </button>
                            </div>

                            {/* Sub-Tabs: Reports vs Consents */}
                            <div className="npd-nav-tabs">
                                <button
                                    type="button"
                                    className={`npd-nav-tab ${activeTab === 'reports' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('reports')}
                                >
                                    <FiFolder />
                                    <span>Diagnostic & Clinical Reports</span>
                                    <span className="count-pill">{reportsList.length}</span>
                                </button>

                                <button
                                    type="button"
                                    className={`npd-nav-tab ${activeTab === 'consent' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('consent')}
                                >
                                    <FiShield />
                                    <span>Signed Consent Forms</span>
                                    <span className="count-pill">{consentList.length}</span>
                                </button>
                            </div>

                            {/* ════════════════════════════════════════════════════════
                                TAB 1: DIAGNOSTIC & LAB REPORTS
                                ════════════════════════════════════════════════════════ */}
                            {activeTab === 'reports' && (
                                <div className="npd-tab-pane">
                                    {/* Upload Form Card */}
                                    <div className="npd-card npd-form-card">
                                        <div className="npd-card-header">
                                            <h3><FiUploadCloud /> Upload Diagnostic / Lab Report</h3>
                                            <span className="npd-card-sub">Will be instantly visible to Doctor & Reception</span>
                                        </div>

                                        <form onSubmit={handleReportSubmit}>
                                            <div className="npd-form-grid-3">
                                                <div className="npd-form-group">
                                                    <label>Report Category <span className="req">*</span></label>
                                                    <select
                                                        value={reportForm.category}
                                                        onChange={e => setReportForm({ ...reportForm, category: e.target.value })}
                                                    >
                                                        {REPORT_CATEGORIES.map(c => (
                                                            <option key={c.value} value={c.value}>{c.label}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="npd-form-group">
                                                    <label>Report Title / Investigation Name</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Complete Blood Count (CBC), Chest X-Ray"
                                                        value={reportForm.title}
                                                        onChange={e => setReportForm({ ...reportForm, title: e.target.value })}
                                                    />
                                                </div>

                                                <div className="npd-form-group">
                                                    <label>Report Date</label>
                                                    <input
                                                        type="date"
                                                        value={reportForm.date}
                                                        onChange={e => setReportForm({ ...reportForm, date: e.target.value })}
                                                    />
                                                </div>
                                            </div>

                                            <div className="npd-form-grid-2" style={{ marginTop: '14px' }}>
                                                <div className="npd-form-group">
                                                    <label>Select Document / File <span className="req">*</span></label>
                                                    <div className="file-input-wrapper">
                                                        <input
                                                            type="file"
                                                            accept=".pdf,image/*"
                                                            id="report-file-input"
                                                            onChange={e => setReportForm({ ...reportForm, file: e.target.files[0] })}
                                                            required
                                                        />
                                                        <label htmlFor="report-file-input" className="custom-file-label">
                                                            <FiUploadCloud size={16} />
                                                            <span>{reportForm.file ? reportForm.file.name : 'Choose PDF / Image File...'}</span>
                                                        </label>
                                                    </div>
                                                </div>

                                                <div className="npd-form-group">
                                                    <label>Clinical Notes / Findings (Optional)</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Platelets normal, slight leukocytosis..."
                                                        value={reportForm.notes}
                                                        onChange={e => setReportForm({ ...reportForm, notes: e.target.value })}
                                                    />
                                                </div>
                                            </div>

                                            <div className="npd-form-actions">
                                                <button
                                                    type="submit"
                                                    className="npd-btn-submit"
                                                    disabled={uploadingReport || !reportForm.file}
                                                >
                                                    <FiUploadCloud />
                                                    <span>{uploadingReport ? 'Uploading Report...' : 'Upload & Save to Profile'}</span>
                                                </button>
                                            </div>
                                        </form>
                                    </div>

                                    {/* Uploaded Reports List */}
                                    <div className="npd-card">
                                        <div className="npd-card-header">
                                            <h3><FiFolder /> Patient Uploaded Reports & Files ({reportsList.length})</h3>
                                            <button className="npd-btn-link" onClick={fetchPatientRecords}>
                                                <FiRefreshCw size={12} /> Refresh List
                                            </button>
                                        </div>

                                        {loadingReports ? (
                                            <div className="npd-loading-state">Loading patient reports...</div>
                                        ) : reportsList.length === 0 ? (
                                            <div className="npd-empty-state">
                                                <FiFileText size={32} color="#94a3b8" />
                                                <h4>No diagnostic reports uploaded yet</h4>
                                                <p>Use the form above to upload lab, radiology, or external reports for this patient.</p>
                                            </div>
                                        ) : (
                                            <div className="npd-records-grid">
                                                {reportsList.map((rep, idx) => (
                                                    <div key={rep._id || idx} className="npd-record-card">
                                                        <div className="record-top">
                                                            <div className="record-icon-box">
                                                                <FiFileText size={20} color="#0284c7" />
                                                            </div>
                                                            <div className="record-info">
                                                                <h4 className="record-name">{rep.fileName || rep.name || 'Clinical Report'}</h4>
                                                                <span className="record-date">
                                                                    {new Date(rep.uploadedAt || rep.createdAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {rep.extractedText && (
                                                            <div className="record-ocr-snippet">
                                                                <strong>AI OCR Summary:</strong>
                                                                <p>{rep.extractedText.substring(0, 140)}...</p>
                                                            </div>
                                                        )}

                                                        <div className="record-actions">
                                                            {rep.url && (
                                                                <>
                                                                    <a
                                                                        href={rep.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="record-btn preview"
                                                                    >
                                                                        <FiEye size={13} /> View
                                                                    </a>
                                                                    <a
                                                                        href={rep.url}
                                                                        download
                                                                        className="record-btn download"
                                                                    >
                                                                        <FiDownload size={13} /> Download
                                                                    </a>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ════════════════════════════════════════════════════════
                                TAB 2: CONSENT FORMS (DOWNLOAD TEMPLATE -> UPLOAD SIGNED COPY)
                                ════════════════════════════════════════════════════════ */}
                            {activeTab === 'consent' && (
                                <div className="npd-tab-pane">
                                    {/* ── STEP 1: DOWNLOAD / PRINT CONSENT TEMPLATE ── */}
                                    <div className="npd-card consent-download-card">
                                        <div className="npd-card-header">
                                            <h3><FiPrinter /> Step 1: Download & Print Official Consent Form</h3>
                                            <span className="npd-card-sub purple">Print first for physical patient signature</span>
                                        </div>
                                        <p className="npd-step-desc">
                                            Select the required clinical consent form. You can print the form pre-filled with this patient's details or print a blank copy to get signed physically.
                                        </p>

                                        <div className="npd-form-grid-3" style={{ alignItems: 'flex-end' }}>
                                            <div className="npd-form-group">
                                                <label>Select Consent Type</label>
                                                <select
                                                    value={selectedDownloadTemplate}
                                                    onChange={e => setSelectedDownloadTemplate(e.target.value)}
                                                >
                                                    {CONSENT_TEMPLATES.map(t => (
                                                        <option key={t.value} value={t.value}>{t.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="npd-form-group">
                                                <label>Doctor Name on Form (Optional)</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Dr. Ramesh Singh"
                                                    value={customDoctorName}
                                                    onChange={e => setCustomDoctorName(e.target.value)}
                                                />
                                            </div>

                                            <div className="npd-consent-print-btns">
                                                <button
                                                    type="button"
                                                    className="npd-btn-print"
                                                    onClick={() => handlePrintConsentForm(selectedDownloadTemplate, false)}
                                                >
                                                    <FiPrinter size={15} />
                                                    <span>Print Pre-Filled Form</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="npd-btn-print outline"
                                                    onClick={() => handlePrintConsentForm(selectedDownloadTemplate, true)}
                                                >
                                                    <FiDownload size={14} />
                                                    <span>Blank Form</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── STEP 2: UPLOAD SIGNED CONSENT COPY ── */}
                                    <div className="npd-card npd-form-card">
                                        <div className="npd-card-header">
                                            <h3><FiUploadCloud /> Step 2: Upload Signed Patient Consent Form</h3>
                                            <span className="npd-card-sub">Upload scanned paper copy or photo signed by patient/witness</span>
                                        </div>

                                        <form onSubmit={handleConsentSubmit}>
                                            <div className="npd-form-grid-3">
                                                <div className="npd-form-group">
                                                    <label>Consent Type <span className="req">*</span></label>
                                                    <select
                                                        value={consentForm.consentType}
                                                        onChange={e => setConsentForm({ ...consentForm, consentType: e.target.value })}
                                                    >
                                                        {CONSENT_TEMPLATES.map(ct => (
                                                            <option key={ct.value} value={ct.value}>{ct.label}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="npd-form-group">
                                                    <label>Procedure / Treatment Name</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Inpatient Care, Laparoscopic Surgery"
                                                        value={consentForm.procedureName}
                                                        onChange={e => setConsentForm({ ...consentForm, procedureName: e.target.value })}
                                                    />
                                                </div>

                                                <div className="npd-form-group">
                                                    <label>Attending / Operating Doctor</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Dr. Ramesh Singh"
                                                        value={consentForm.doctorName}
                                                        onChange={e => setConsentForm({ ...consentForm, doctorName: e.target.value })}
                                                    />
                                                </div>
                                            </div>

                                            <div className="npd-form-grid-3" style={{ marginTop: '14px' }}>
                                                <div className="npd-form-group">
                                                    <label>Signatory / Witness Name</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Patient or Guardian full name"
                                                        value={consentForm.witnessName}
                                                        onChange={e => setConsentForm({ ...consentForm, witnessName: e.target.value })}
                                                    />
                                                </div>

                                                <div className="npd-form-group">
                                                    <label>Relationship to Patient</label>
                                                    <select
                                                        value={consentForm.witnessRelation}
                                                        onChange={e => setConsentForm({ ...consentForm, witnessRelation: e.target.value })}
                                                    >
                                                        <option value="Self">Self (Patient)</option>
                                                        <option value="Spouse">Spouse (Husband / Wife)</option>
                                                        <option value="Father">Father</option>
                                                        <option value="Mother">Mother</option>
                                                        <option value="Son">Son</option>
                                                        <option value="Daughter">Daughter</option>
                                                        <option value="Guardian">Legal Guardian</option>
                                                        <option value="Other">Other Relative</option>
                                                    </select>
                                                </div>

                                                <div className="npd-form-group">
                                                    <label>Signatory Contact Phone</label>
                                                    <input
                                                        type="tel"
                                                        placeholder="e.g. 9876543210"
                                                        value={consentForm.witnessPhone}
                                                        onChange={e => setConsentForm({ ...consentForm, witnessPhone: e.target.value })}
                                                    />
                                                </div>
                                            </div>

                                            <div className="npd-form-grid-2" style={{ marginTop: '14px' }}>
                                                <div className="npd-form-group">
                                                    <label>Upload Signed Document / Photo <span className="req">*</span></label>
                                                    <div className="file-input-wrapper">
                                                        <input
                                                            type="file"
                                                            accept=".pdf,image/*"
                                                            id="consent-file-input"
                                                            onChange={e => setConsentForm({ ...consentForm, file: e.target.files[0] })}
                                                            required
                                                        />
                                                        <label htmlFor="consent-file-input" className="custom-file-label purple">
                                                            <FiShield size={16} />
                                                            <span>{consentForm.file ? consentForm.file.name : 'Choose Signed Consent Copy (PDF / Image)...'}</span>
                                                        </label>
                                                    </div>
                                                </div>

                                                <div className="npd-form-group">
                                                    <label>Additional Notes / Remarks</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Risks explained in Hindi, signed in presence of staff..."
                                                        value={consentForm.notes}
                                                        onChange={e => setConsentForm({ ...consentForm, notes: e.target.value })}
                                                    />
                                                </div>
                                            </div>

                                            <div className="npd-form-actions">
                                                <button
                                                    type="submit"
                                                    className="npd-btn-submit purple"
                                                    disabled={uploadingConsent || !consentForm.file}
                                                >
                                                    <FiCheckCircle />
                                                    <span>{uploadingConsent ? 'Archiving Consent...' : 'Save Signed Consent Form'}</span>
                                                </button>
                                            </div>
                                        </form>
                                    </div>

                                    {/* ── STEP 3: SIGNED CONSENTS ARCHIVE ── */}
                                    <div className="npd-card">
                                        <div className="npd-card-header">
                                            <h3><FiShield /> Patient's Signed Consent Documents ({consentList.length})</h3>
                                            <button className="npd-btn-link" onClick={fetchPatientRecords}>
                                                <FiRefreshCw size={12} /> Refresh List
                                            </button>
                                        </div>

                                        {loadingConsents ? (
                                            <div className="npd-loading-state">Loading patient consent forms...</div>
                                        ) : consentList.length === 0 ? (
                                            <div className="npd-empty-state">
                                                <FiShield size={32} color="#94a3b8" />
                                                <h4>No signed consent forms archived yet</h4>
                                                <p>Print the template above, get it signed by the patient, and upload the scanned copy.</p>
                                            </div>
                                        ) : (
                                            <div className="npd-records-grid">
                                                {consentList.map((con, idx) => (
                                                    <div key={con._id || idx} className="npd-record-card consent-card">
                                                        <div className="record-top">
                                                            <div className="record-icon-box purple">
                                                                <FiShield size={20} color="#7c3aed" />
                                                            </div>
                                                            <div className="record-info">
                                                                <h4 className="record-name">{con.procedureName || con.title || con.fileName || 'Signed Consent Form'}</h4>
                                                                <span className="record-date">
                                                                    Uploaded {new Date(con.uploadedAt || con.createdAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                    {con.uploadedBy ? ` by ${con.uploadedBy}` : ''}
                                                                </span>
                                                                {con.witnessName && (
                                                                    <div style={{ fontSize: '11px', color: '#6b21a8', marginTop: '3px' }}>
                                                                        Signatory: <strong>{con.witnessName}</strong> ({con.witnessRelation || 'Self'})
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="record-actions">
                                                            {con.url && (
                                                                <>
                                                                    <a
                                                                        href={con.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="record-btn preview"
                                                                    >
                                                                        <FiEye size={13} /> View Consent
                                                                    </a>
                                                                    <a
                                                                        href={con.url}
                                                                        download
                                                                        className="record-btn download"
                                                                    >
                                                                        <FiDownload size={13} /> Download
                                                                    </a>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="npd-card npd-no-selection">
                            <FiUser size={48} color="#94a3b8" />
                            <h3>Select a Patient</h3>
                            <p>Choose a patient from the directory on the left to upload reports and manage clinical consent forms.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NursePatientDocuments;
