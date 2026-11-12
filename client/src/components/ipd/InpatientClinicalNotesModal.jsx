import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { ipdClinicalAPI, admissionAPI, hospitalAPI } from '../../utils/api';
import { resolveHospitalChartBranding, resolvePatientChartDetails } from '../../utils/tprChartPdf';
import {
    buildDefaultClinicalNoteState,
    downloadInpatientClinicalNotesPdf,
    printInpatientClinicalNotes
} from '../../utils/inpatientNotesPdf';
import { FiX, FiPrinter, FiDownload, FiFileText, FiSave, FiMessageSquare, FiEdit2, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import './InpatientClinicalNotesModal.css';

const splitLinesForPreview = (text, count) => {
    const rawLines = (text ? String(text).split(/\r?\n/) : []).filter((l) => l.length > 0);
    const wrapped = [];
    rawLines.forEach((p) => {
        let rest = p;
        while (rest.length > 105) {
            let cut = rest.lastIndexOf(' ', 105);
            if (cut < 40) cut = 105;
            wrapped.push(rest.slice(0, cut));
            rest = rest.slice(cut).trimStart();
        }
        wrapped.push(rest);
    });
    return Array.from({ length: count }, (_, idx) => wrapped[idx] || '');
};

const InpatientClinicalNotesModal = ({
    isOpen,
    onClose,
    admissionId,
    admission: initialAdmission,
    patient: initialPatient,
    initialTab = 'notes', // 'notes' | 'communication'
    isBlank = false
}) => {
    const { user } = useAuth();
    const { branding, hospitalName: brandingHospitalName } = useBranding();

    const [activeSectionTab, setActiveSectionTab] = useState(initialTab);
    const [noteViewMode, setNoteViewMode] = useState('preview'); // 'preview' | 'edit'
    const [loading, setLoading] = useState(false);
    const [savingNotes, setSavingNotes] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const [admission, setAdmission] = useState(initialAdmission || null);
    const [latestVitals, setLatestVitals] = useState(null);
    const [savedNoteDoc, setSavedNoteDoc] = useState(null);
    const [tenantHospital, setTenantHospital] = useState(null);
    const [hospLogoFailed, setHospLogoFailed] = useState(false);
    const [formState, setFormState] = useState(() =>
        buildDefaultClinicalNoteState({ patient: initialPatient, admission: initialAdmission, isBlank })
    );

    // Part 4: Patient & Nurse Communication state
    const [commMessages, setCommMessages] = useState([]);
    const [commLoading, setCommLoading] = useState(false);
    const [commInput, setCommInput] = useState('');
    const [commSenderRole, setCommSenderRole] = useState('Nurse');
    const [commSending, setCommSending] = useState(false);
    const [editingCommId, setEditingCommId] = useState(null);
    const [editingCommText, setEditingCommText] = useState('');
    const [expandedHistoryMap, setExpandedHistoryMap] = useState({});

    const effectiveAdmissionId = admissionId || initialAdmission?._id || null;

    useEffect(() => {
        if (isOpen) {
            setActiveSectionTab(initialTab || 'notes');
            setHospLogoFailed(false);
        }
    }, [isOpen, initialTab]);

    const loadAllData = useCallback(async () => {
        if (!isOpen) return;
        setLoading(true);
        try {
            const brandingPromise = user?.hospitalId
                ? hospitalAPI.getMyBranding().catch(() => null)
                : Promise.resolve(null);

            if (!effectiveAdmissionId || isBlank) {
                const brandRes = await brandingPromise;
                if (brandRes?.hospital) setTenantHospital(brandRes.hospital);
                setFormState(buildDefaultClinicalNoteState({ patient: initialPatient, admission: initialAdmission, isBlank }));
                return;
            }

            const [brandRes, notesRes, admRes, commRes] = await Promise.all([
                brandingPromise,
                ipdClinicalAPI.getInpatientClinicalNotes(effectiveAdmissionId).catch(() => null),
                !initialAdmission ? admissionAPI.getAdmissionById(effectiveAdmissionId).catch(() => null) : Promise.resolve(null),
                ipdClinicalAPI.getPatientNurseCommunication(effectiveAdmissionId).catch(() => ({ messages: [] }))
            ]);

            if (brandRes?.hospital) setTenantHospital(brandRes.hospital);
            const resolvedAdm = notesRes?.admission || admRes?.admission || admRes?.data || initialAdmission || null;
            if (resolvedAdm) setAdmission(resolvedAdm);
            if (notesRes?.latestVitals) setLatestVitals(notesRes.latestVitals);
            const loadedNote = notesRes?.clinicalNote || null;
            setSavedNoteDoc(loadedNote);

            setFormState(
                buildDefaultClinicalNoteState({
                    patient: initialPatient || resolvedAdm?.patientId,
                    admission: resolvedAdm,
                    latestVitals: notesRes?.latestVitals || null,
                    clinicalNote: loadedNote,
                    isBlank
                })
            );
            setCommMessages(commRes?.messages || []);
        } finally {
            setLoading(false);
        }
    }, [isOpen, effectiveAdmissionId, isBlank, user?.hospitalId, initialAdmission, initialPatient]);

    useEffect(() => {
        if (isOpen) loadAllData();
    }, [isOpen, loadAllData]);

    const hospitalObj = useMemo(
        () => resolveHospitalChartBranding({ tenantHospital, branding, brandingHospitalName, user }),
        [tenantHospital, branding, brandingHospitalName, user]
    );

    const ptBannerDetails = useMemo(
        () => resolvePatientChartDetails({
            patient: initialPatient || admission?.patientId,
            admission,
            isBlank
        }),
        [initialPatient, admission, isBlank]
    );

    const handleSaveNotes = async (e) => {
        if (e) e.preventDefault();
        if (!effectiveAdmissionId) {
            toast.error('An active admission is required to save In-Patient Clinical Notes.');
            return;
        }
        setSavingNotes(true);
        try {
            const res = await ipdClinicalAPI.saveInpatientClinicalNotes(effectiveAdmissionId, formState);
            if (res?.success) {
                setSavedNoteDoc(res.clinicalNote);
                toast.success('In-Patient Clinical Notes saved');
                setNoteViewMode('preview');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save In-Patient Clinical Notes');
        } finally {
            setSavingNotes(false);
        }
    };

    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            await downloadInpatientClinicalNotesPdf({
                hospital: hospitalObj,
                patient: initialPatient || admission?.patientId,
                admission,
                latestVitals,
                clinicalNote: formState,
                isBlank
            });
            toast.success('2-Page In-Patient Clinical Notes PDF downloaded');
        } catch (err) {
            toast.error('Failed to generate Clinical Notes PDF');
        } finally {
            setDownloading(false);
        }
    };

    const handlePrint = () => {
        printInpatientClinicalNotes({
            hospital: hospitalObj,
            patient: initialPatient || admission?.patientId,
            admission,
            latestVitals,
            clinicalNote: formState,
            isBlank
        });
    };

    const handleSendCommunication = async (e) => {
        e.preventDefault();
        if (!effectiveAdmissionId || !commInput.trim()) return;
        setCommSending(true);
        try {
            const res = await ipdClinicalAPI.addPatientNurseCommunication(effectiveAdmissionId, {
                message: commInput.trim(),
                senderRole: commSenderRole,
                senderName: commSenderRole === 'Patient' ? (ptBannerDetails.name !== '—' ? ptBannerDetails.name : 'Patient') : undefined
            });
            if (res?.entry) {
                setCommMessages(prev => [...prev, res.entry]);
                setCommInput('');
                toast.success('Communication note added');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save communication note');
        } finally {
            setCommSending(false);
        }
    };

    const handleSaveCommEdit = async (noteId) => {
        if (!effectiveAdmissionId || !noteId || !editingCommText.trim()) return;
        setCommLoading(true);
        try {
            const res = await ipdClinicalAPI.editPatientNurseCommunication(effectiveAdmissionId, noteId, {
                message: editingCommText.trim()
            });
            if (res?.entry) {
                setCommMessages(prev => prev.map(m => (String(m._id) === String(noteId) ? res.entry : m)));
                setEditingCommId(null);
                setEditingCommText('');
                toast.success('Communication note updated with audit trail');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to edit communication note');
        } finally {
            setCommLoading(false);
        }
    };

    const updateField = (key, value) => setFormState(prev => ({ ...prev, [key]: value }));
    const updateGenField = (key, value) =>
        setFormState(prev => ({ ...prev, generalExamination: { ...prev.generalExamination, [key]: value } }));
    const updateFooterField = (key, value) =>
        setFormState(prev => ({ ...prev, footer: { ...prev.footer, [key]: value } }));

    if (!isOpen) return null;

    const renderBanner = () => (
        <div className="ipn-doc-banner">
            <span>Patient Name : {ptBannerDetails.name}</span>
            <span className="ipn-sep">|</span>
            <span>UHID : {ptBannerDetails.uhid}</span>
            <span className="ipn-sep">|</span>
            <span>IPD : {ptBannerDetails.ipdNumber}</span>
            <span className="ipn-sep">|</span>
            <span>Gender : {ptBannerDetails.gender}</span>
            <span className="ipn-sep">|</span>
            <span>Age : {ptBannerDetails.age}</span>
        </div>
    );

    const renderRuledLines = (text, lineCount) => (
        <div className="ipn-doc-ruled-lines">
            {splitLinesForPreview(text, lineCount).map((line, idx) => (
                <div key={idx} className="ipn-doc-ruled-line">{line}</div>
            ))}
        </div>
    );

    return (
        <div className="ipn-modal-overlay" onClick={onClose}>
            <div className="ipn-modal-container" onClick={e => e.stopPropagation()}>
                <div className="ipn-modal-header">
                    <div className="ipn-modal-title-group">
                        <h3>
                            <FiFileText color="#0d9488" />
                            <span>In-Patient Clinical Notes (2-Page IPD Document)</span>
                        </h3>
                        <span className="ipn-modal-subtitle">
                            {loading ? 'Loading clinical notes…' : savedNoteDoc?.updatedByName
                                ? `Last saved by ${savedNoteDoc.updatedByName} (${savedNoteDoc.updatedByRole || 'Staff'})`
                                : 'Auto-populated from patient admission & latest vitals'}
                        </span>
                    </div>

                    <div className="ipn-modal-actions">
                        {activeSectionTab === 'notes' && !isBlank && (
                            <button
                                type="button"
                                className="ipn-btn ipn-btn-save"
                                onClick={handleSaveNotes}
                                disabled={savingNotes}
                            >
                                <FiSave size={14} />
                                <span>{savingNotes ? 'Saving…' : 'Save Clinical Notes'}</span>
                            </button>
                        )}
                        {activeSectionTab === 'notes' && (
                            <>
                                <button type="button" className="ipn-btn ipn-btn-outline" onClick={handlePrint}>
                                    <FiPrinter size={14} />
                                    <span>Print 2-Page</span>
                                </button>
                                <button type="button" className="ipn-btn ipn-btn-outline" onClick={handleDownloadPdf} disabled={downloading}>
                                    <FiDownload size={14} />
                                    <span>{downloading ? 'Generating…' : 'Download PDF'}</span>
                                </button>
                            </>
                        )}
                        <button type="button" className="ipn-btn-close" onClick={onClose} title="Close">
                            <FiX />
                        </button>
                    </div>
                </div>

                <div className="ipn-tab-bar">
                    <div className="ipn-tabs-left">
                        <button
                            type="button"
                            className={`ipn-tab-btn ${activeSectionTab === 'notes' ? 'active' : ''}`}
                            onClick={() => setActiveSectionTab('notes')}
                        >
                            <FiFileText size={14} />
                            <span>In-Patient Clinical Notes</span>
                        </button>
                        {!isBlank && (
                            <button
                                type="button"
                                className={`ipn-tab-btn ${activeSectionTab === 'communication' ? 'active' : ''}`}
                                onClick={() => setActiveSectionTab('communication')}
                            >
                                <FiMessageSquare size={14} />
                                <span>Patient &amp; Nurse Communication ({commMessages.length})</span>
                            </button>
                        )}
                    </div>

                    {activeSectionTab === 'notes' && (
                        <div className="ipn-mode-toggle">
                            <button
                                type="button"
                                className={`ipn-mode-pill ${noteViewMode === 'preview' ? 'active' : ''}`}
                                onClick={() => setNoteViewMode('preview')}
                            >
                                Exact 2-Page Preview
                            </button>
                            <button
                                type="button"
                                className={`ipn-mode-pill ${noteViewMode === 'edit' ? 'active' : ''}`}
                                onClick={() => setNoteViewMode('edit')}
                            >
                                Fill / Edit Fields
                            </button>
                        </div>
                    )}
                </div>

                <div className="ipn-modal-body">
                    {activeSectionTab === 'notes' && noteViewMode === 'preview' && (
                        <div className="ipn-sheets-stack">
                            {/* PAGE 1 */}
                            <div className="ipn-sheet-paper">
                                {renderBanner()}
                                <div className="ipn-doc-box">
                                    <div className="ipn-doc-letterhead">
                                        <div className="ipn-doc-nabh">
                                            {hospitalObj.accreditation?.enabled === true ? (
                                                <>
                                                    {hospitalObj.accreditation.logoUrl && (
                                                        <img
                                                            src={hospitalObj.accreditation.logoUrl}
                                                            alt="NABH Seal"
                                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                        />
                                                    )}
                                                    {hospitalObj.accreditation.certNo && (
                                                        <div className="ipn-doc-cert">{hospitalObj.accreditation.certNo}</div>
                                                    )}
                                                </>
                                            ) : null}
                                        </div>
                                        <div className="ipn-doc-hosp">
                                            {hospitalObj.logoUrl && !hospLogoFailed ? (
                                                <img
                                                    src={hospitalObj.logoUrl}
                                                    alt={hospitalObj.name}
                                                    onError={() => setHospLogoFailed(true)}
                                                />
                                            ) : (
                                                <div className="ipn-doc-hosp-name">{hospitalObj.name}</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="ipn-doc-title">IN PATIENT CLINICAL NOTES</div>

                                    <div className="ipn-doc-meta-rows">
                                        <div className="ipn-doc-meta-row">
                                            <div className="ipn-doc-field" style={{ flex: 4.2 }}><span>Patient&apos;s Name</span><span className="ipn-doc-field-val">{formState.patientName}</span></div>
                                            <div className="ipn-doc-field" style={{ flex: 1.2 }}><span>Age</span><span className="ipn-doc-field-val">{formState.age}</span></div>
                                            <div className="ipn-doc-field" style={{ flex: 0.9 }}><span>Sex</span><span className="ipn-doc-field-val">{formState.sex}</span></div>
                                        </div>
                                        <div className="ipn-doc-meta-row">
                                            <div className="ipn-doc-field" style={{ flex: 1.5 }}><span>Regd. No.</span><span className="ipn-doc-field-val">{formState.regdNo}</span></div>
                                            <div className="ipn-doc-field" style={{ flex: 1.5 }}><span>IPD No.</span><span className="ipn-doc-field-val">{formState.ipdNo}</span></div>
                                            <div className="ipn-doc-field" style={{ flex: 1.1 }}><span>Date</span><span className="ipn-doc-field-val">{formState.noteDate}</span></div>
                                            <div className="ipn-doc-field" style={{ flex: 1 }}><span>Time</span><span className="ipn-doc-field-val">{formState.noteTime}</span></div>
                                        </div>
                                        <div className="ipn-doc-meta-row" style={{ marginBottom: 0 }}>
                                            <div className="ipn-doc-field" style={{ flex: 1.3 }}><span>Ward</span><span className="ipn-doc-field-val">{formState.ward}</span></div>
                                            <div className="ipn-doc-field" style={{ flex: 1.2 }}><span>Bed No.</span><span className="ipn-doc-field-val">{formState.bedNo}</span></div>
                                            <div className="ipn-doc-field" style={{ flex: 2 }}><span>Consultant</span><span className="ipn-doc-field-val">{formState.consultantName}</span></div>
                                        </div>
                                    </div>

                                    <div className="ipn-doc-sec-hdr">History &amp; Complaints</div>
                                    {renderRuledLines(formState.historyAndComplaints, 7)}

                                    <div className="ipn-doc-sec-hdr">Relevant Physical Examination</div>
                                    {renderRuledLines(formState.relevantPhysicalExamination, 7)}

                                    <div className="ipn-doc-sec-hdr">History Of Present Illness</div>
                                    {renderRuledLines(formState.historyOfPresentIllness, 4)}

                                    <div className="ipn-doc-sec-hdr">Past Medical History / Surgical History</div>
                                    {renderRuledLines(formState.pastMedicalSurgicalHistory, 3)}

                                    <div className="ipn-doc-split-row">
                                        <div className="ipn-doc-split-left">
                                            <div className="ipn-doc-sec-hdr">PERSONAL / SOCIAL HISTORY</div>
                                            {renderRuledLines(formState.personalSocialHistory, 2)}
                                        </div>
                                        <div>
                                            <div className="ipn-doc-sec-hdr">ANY DRUG ALLERGY</div>
                                            {renderRuledLines(formState.anyDrugAllergy, 2)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* PAGE 2 */}
                            <div className="ipn-sheet-paper">
                                {renderBanner()}
                                <div className="ipn-doc-box">
                                    <div className="ipn-doc-sec-hdr" style={{ borderTop: 'none' }}>GENERAL EXAMINATION</div>
                                    <div className="ipn-doc-gen-grid">
                                        <div className="ipn-doc-gen-cell"><span className="ipn-doc-gen-lbl">BP</span><span>{formState.generalExamination?.bp}</span></div>
                                        <div className="ipn-doc-gen-cell"><span className="ipn-doc-gen-lbl">Temp.</span><span>{formState.generalExamination?.temp}</span></div>
                                        <div className="ipn-doc-gen-cell"><span className="ipn-doc-gen-lbl">Pallor</span><span>{formState.generalExamination?.pallor}</span></div>
                                        <div className="ipn-doc-gen-cell"><span className="ipn-doc-gen-lbl">Pulse</span><span>{formState.generalExamination?.pulse}</span></div>
                                        <div className="ipn-doc-gen-cell"><span className="ipn-doc-gen-lbl">SPO2</span><span>{formState.generalExamination?.spo2}</span></div>
                                        <div className="ipn-doc-gen-cell"><span className="ipn-doc-gen-lbl">Pain</span><span>{formState.generalExamination?.pain}</span></div>
                                    </div>

                                    <div className="ipn-doc-sec-hdr" style={{ borderTop: 'none' }}>SYSTEMIC</div>
                                    {renderRuledLines(formState.systemicExamination, 7)}

                                    <div className="ipn-doc-sec-hdr">PROV. DIAGNOSIS</div>
                                    {renderRuledLines(formState.provisionalDiagnosis, 3)}

                                    <div className="ipn-doc-sec-hdr">INVESTIGATIONS</div>
                                    {renderRuledLines(formState.investigations, 8)}

                                    <div className="ipn-doc-sec-hdr">DISCHARGE &amp; FOLLOW UP</div>
                                    {renderRuledLines(formState.dischargeAndFollowUp, 8)}

                                    <div className="ipn-doc-footer-sign">
                                        <div className="ipn-doc-field" style={{ flex: 2.3 }}><span>Name of Consultant</span><span className="ipn-doc-field-val">{formState.footer?.consultantName}</span></div>
                                        <div className="ipn-doc-field" style={{ flex: 1.4 }}><span>Signature</span><span className="ipn-doc-field-val">{formState.footer?.signature}</span></div>
                                        <div className="ipn-doc-field" style={{ flex: 0.9 }}><span>Date</span><span className="ipn-doc-field-val">{formState.footer?.signDate}</span></div>
                                        <div className="ipn-doc-field" style={{ flex: 0.8 }}><span>Time</span><span className="ipn-doc-field-val">{formState.footer?.signTime}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSectionTab === 'notes' && noteViewMode === 'edit' && (
                        <form className="ipn-editor-card" onSubmit={handleSaveNotes}>
                            <div className="ipn-editor-section-title" style={{ marginTop: 0 }}>Page 1 — Patient &amp; Admission Header</div>
                            <div className="ipn-editor-grid-3">
                                <div className="ipn-form-field">
                                    <label>Patient&apos;s Name</label>
                                    <input value={formState.patientName} onChange={e => updateField('patientName', e.target.value)} />
                                </div>
                                <div className="ipn-form-field">
                                    <label>Age</label>
                                    <input value={formState.age} onChange={e => updateField('age', e.target.value)} />
                                </div>
                                <div className="ipn-form-field">
                                    <label>Sex</label>
                                    <input value={formState.sex} onChange={e => updateField('sex', e.target.value)} />
                                </div>
                            </div>
                            <div className="ipn-editor-grid-4">
                                <div className="ipn-form-field">
                                    <label>Regd. No. / UHID</label>
                                    <input value={formState.regdNo} onChange={e => updateField('regdNo', e.target.value)} />
                                </div>
                                <div className="ipn-form-field">
                                    <label>IPD No.</label>
                                    <input value={formState.ipdNo} onChange={e => updateField('ipdNo', e.target.value)} />
                                </div>
                                <div className="ipn-form-field">
                                    <label>Date</label>
                                    <input value={formState.noteDate} onChange={e => updateField('noteDate', e.target.value)} />
                                </div>
                                <div className="ipn-form-field">
                                    <label>Time</label>
                                    <input value={formState.noteTime} onChange={e => updateField('noteTime', e.target.value)} />
                                </div>
                            </div>
                            <div className="ipn-editor-grid-3">
                                <div className="ipn-form-field">
                                    <label>Ward</label>
                                    <input value={formState.ward} onChange={e => updateField('ward', e.target.value)} />
                                </div>
                                <div className="ipn-form-field">
                                    <label>Bed No.</label>
                                    <input value={formState.bedNo} onChange={e => updateField('bedNo', e.target.value)} />
                                </div>
                                <div className="ipn-form-field">
                                    <label>Consultant</label>
                                    <input value={formState.consultantName} onChange={e => updateField('consultantName', e.target.value)} />
                                </div>
                            </div>

                            <div className="ipn-editor-section-title">Page 1 — Clinical Assessment</div>
                            <div className="ipn-form-field">
                                <label>History &amp; Complaints</label>
                                <textarea rows={3} value={formState.historyAndComplaints} onChange={e => updateField('historyAndComplaints', e.target.value)} />
                            </div>
                            <div className="ipn-form-field">
                                <label>Relevant Physical Examination</label>
                                <textarea rows={3} value={formState.relevantPhysicalExamination} onChange={e => updateField('relevantPhysicalExamination', e.target.value)} />
                            </div>
                            <div className="ipn-form-field">
                                <label>History Of Present Illness</label>
                                <textarea rows={2} value={formState.historyOfPresentIllness} onChange={e => updateField('historyOfPresentIllness', e.target.value)} />
                            </div>
                            <div className="ipn-form-field">
                                <label>Past Medical History / Surgical History</label>
                                <textarea rows={2} value={formState.pastMedicalSurgicalHistory} onChange={e => updateField('pastMedicalSurgicalHistory', e.target.value)} />
                            </div>
                            <div className="ipn-editor-grid-2">
                                <div className="ipn-form-field">
                                    <label>PERSONAL / SOCIAL HISTORY</label>
                                    <textarea rows={2} value={formState.personalSocialHistory} onChange={e => updateField('personalSocialHistory', e.target.value)} />
                                </div>
                                <div className="ipn-form-field">
                                    <label>ANY DRUG ALLERGY</label>
                                    <textarea rows={2} value={formState.anyDrugAllergy} onChange={e => updateField('anyDrugAllergy', e.target.value)} />
                                </div>
                            </div>

                            <div className="ipn-editor-section-title">Page 2 — General Examination &amp; Clinical Plan</div>
                            <div className="ipn-editor-grid-3">
                                <div className="ipn-form-field"><label>BP</label><input value={formState.generalExamination.bp} onChange={e => updateGenField('bp', e.target.value)} placeholder="120/80 mmHg" /></div>
                                <div className="ipn-form-field"><label>Temp.</label><input value={formState.generalExamination.temp} onChange={e => updateGenField('temp', e.target.value)} placeholder="98.6°F" /></div>
                                <div className="ipn-form-field"><label>Pallor</label><input value={formState.generalExamination.pallor} onChange={e => updateGenField('pallor', e.target.value)} placeholder="Absent / Mild" /></div>
                                <div className="ipn-form-field"><label>Pulse</label><input value={formState.generalExamination.pulse} onChange={e => updateGenField('pulse', e.target.value)} placeholder="78 bpm" /></div>
                                <div className="ipn-form-field"><label>SPO2</label><input value={formState.generalExamination.spo2} onChange={e => updateGenField('spo2', e.target.value)} placeholder="98%" /></div>
                                <div className="ipn-form-field"><label>Pain</label><input value={formState.generalExamination.pain} onChange={e => updateGenField('pain', e.target.value)} placeholder="2/10" /></div>
                            </div>

                            <div className="ipn-form-field">
                                <label>SYSTEMIC</label>
                                <textarea rows={3} value={formState.systemicExamination} onChange={e => updateField('systemicExamination', e.target.value)} />
                            </div>
                            <div className="ipn-form-field">
                                <label>PROV. DIAGNOSIS</label>
                                <textarea rows={2} value={formState.provisionalDiagnosis} onChange={e => updateField('provisionalDiagnosis', e.target.value)} />
                            </div>
                            <div className="ipn-form-field">
                                <label>INVESTIGATIONS</label>
                                <textarea rows={3} value={formState.investigations} onChange={e => updateField('investigations', e.target.value)} />
                            </div>
                            <div className="ipn-form-field">
                                <label>DISCHARGE &amp; FOLLOW UP</label>
                                <textarea rows={3} value={formState.dischargeAndFollowUp} onChange={e => updateField('dischargeAndFollowUp', e.target.value)} />
                            </div>

                            <div className="ipn-editor-grid-4">
                                <div className="ipn-form-field"><label>Name of Consultant</label><input value={formState.footer.consultantName} onChange={e => updateFooterField('consultantName', e.target.value)} /></div>
                                <div className="ipn-form-field"><label>Signature</label><input value={formState.footer.signature} onChange={e => updateFooterField('signature', e.target.value)} /></div>
                                <div className="ipn-form-field"><label>Date</label><input value={formState.footer.signDate} onChange={e => updateFooterField('signDate', e.target.value)} /></div>
                                <div className="ipn-form-field"><label>Time</label><input value={formState.footer.signTime} onChange={e => updateFooterField('signTime', e.target.value)} /></div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                <button type="button" className="ipn-btn ipn-btn-outline" onClick={() => setNoteViewMode('preview')}>
                                    View Exact 2-Page Preview
                                </button>
                                <button type="submit" className="ipn-btn ipn-btn-save" disabled={savingNotes}>
                                    <FiSave size={14} /> {savingNotes ? 'Saving…' : 'Save Clinical Notes'}
                                </button>
                            </div>
                        </form>
                    )}

                    {activeSectionTab === 'communication' && (
                        <div className="ipn-comm-wrapper">
                            <div className="ipn-comm-header">
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#0f172a' }}>
                                        Patient &amp; Nurse Communication
                                    </h4>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                        Chronological interaction notes for {ptBannerDetails.name} ({ptBannerDetails.ipdNumber}). Original authorship and full edit history are preserved.
                                    </p>
                                </div>
                            </div>

                            <div className="ipn-comm-timeline">
                                {commMessages.length === 0 ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                                        No communication notes recorded yet for this admission.
                                    </div>
                                ) : (
                                    commMessages.map(item => {
                                        const isPatientRole = item.senderRole === 'Patient';
                                        const isEditingThis = editingCommId === item._id;
                                        const hasEdits = Array.isArray(item.editHistory) && item.editHistory.length > 0;
                                        const historyExpanded = Boolean(expandedHistoryMap[item._id]);

                                        return (
                                            <div key={item._id} className={`ipn-comm-item ${isPatientRole ? 'role-patient' : ''}`}>
                                                <div className="ipn-comm-item-top">
                                                    <div className="ipn-comm-sender">
                                                        <span>{item.senderName}</span>
                                                        <span className="ipn-comm-role-pill">{item.senderRole}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span className="ipn-comm-time">
                                                            <FiClock size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                                                            {new Date(item.createdAt).toLocaleString()}
                                                        </span>
                                                        {!isEditingThis && (
                                                            <button
                                                                type="button"
                                                                className="ipn-btn ipn-btn-outline"
                                                                style={{ padding: '3px 8px', fontSize: '11.5px' }}
                                                                onClick={() => {
                                                                    setEditingCommId(item._id);
                                                                    setEditingCommText(item.message);
                                                                }}
                                                            >
                                                                <FiEdit2 size={11} /> Edit
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {isEditingThis ? (
                                                    <div style={{ marginTop: '6px' }}>
                                                        <textarea
                                                            rows={2}
                                                            value={editingCommText}
                                                            onChange={e => setEditingCommText(e.target.value)}
                                                            style={{ width: '100%', padding: '8px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                                        />
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '6px' }}>
                                                            <button
                                                                type="button"
                                                                className="ipn-btn ipn-btn-outline"
                                                                onClick={() => { setEditingCommId(null); setEditingCommText(''); }}
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="ipn-btn ipn-btn-save"
                                                                disabled={commLoading || !editingCommText.trim()}
                                                                onClick={() => handleSaveCommEdit(item._id)}
                                                            >
                                                                Save Edit
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="ipn-comm-msg">{item.message}</div>
                                                )}

                                                {item.editedAt && (
                                                    <div className="ipn-comm-edit-meta">
                                                        <span>
                                                            Edited by <strong>{item.editedByName || 'Staff'}</strong> at {new Date(item.editedAt).toLocaleString()}
                                                        </span>
                                                        {hasEdits && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedHistoryMap(prev => ({ ...prev, [item._id]: !prev[item._id] }))}
                                                                style={{ background: 'none', border: 'none', color: '#0f2e7a', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '11px' }}
                                                            >
                                                                {historyExpanded ? 'Hide Edit History' : `View Edit History (${item.editHistory.length})`}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                {historyExpanded && hasEdits && (
                                                    <div className="ipn-comm-history-list">
                                                        <strong style={{ display: 'block', marginBottom: '4px' }}>Previous Versions (Audit Trail):</strong>
                                                        {item.editHistory.map((h, hIdx) => (
                                                            <div key={hIdx} style={{ padding: '4px 0', borderTop: hIdx > 0 ? '1px solid #e2e8f0' : 'none' }}>
                                                                <div>&ldquo;{h.previousMessage}&rdquo;</div>
                                                                <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                                                                    Replaced by {h.editedByName} ({h.editedByRole || 'Staff'}) on {new Date(h.editedAt).toLocaleString()}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <form className="ipn-comm-composer" onSubmit={handleSendCommunication}>
                                <div className="ipn-editor-grid-3" style={{ alignItems: 'end', marginBottom: '8px' }}>
                                    <div className="ipn-form-field" style={{ marginBottom: 0 }}>
                                        <label>Entry Author / Role</label>
                                        <select value={commSenderRole} onChange={e => setCommSenderRole(e.target.value)}>
                                            <option value="Nurse">Nurse / Attending Staff ({user?.name || 'Staff'})</option>
                                            <option value="Patient">Patient ({ptBannerDetails.name !== '—' ? ptBannerDetails.name : 'Bedside Statement'})</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="ipn-form-field">
                                    <label>New Message / Clinical Observation</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Record patient symptom report, nurse counseling, bedside query, or follow-up response..."
                                        value={commInput}
                                        onChange={e => setCommInput(e.target.value)}
                                        required
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button type="submit" className="ipn-btn ipn-btn-save" disabled={commSending || !commInput.trim()}>
                                        <FiMessageSquare size={14} />
                                        <span>{commSending ? 'Posting…' : 'Post Communication Note'}</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InpatientClinicalNotesModal;

