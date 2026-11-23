import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { ipdClinicalAPI, admissionAPI, hospitalAPI } from '../../utils/api';
import { resolveHospitalChartBranding, resolvePatientChartDetails } from '../../utils/tprChartPdf';
import {
    buildDefaultClinicalNoteState,
    downloadInpatientClinicalNotesPdf,
    printInpatientClinicalNotes
} from '../../utils/inpatientNotesPdf';
import RuledSectionEditor from './RuledSectionEditor';
import TabletPenCanvas from './TabletPenCanvas';
import {
    FiX, FiPrinter, FiDownload, FiFileText, FiSave,
    FiMessageSquare, FiEdit2, FiClock, FiRotateCcw, FiRotateCw,
    FiPlus, FiTrash2, FiZap, FiCheck, FiSend
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import './InpatientClinicalNotesModal.css';

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

    const userRole = (user?.role || '').toLowerCase();
    const isNurse = userRole === 'nurse';
    const canUsePenTool = !isNurse;

    const [activeSectionTab, setActiveSectionTab] = useState(initialTab);
    const [loading, setLoading] = useState(false);
    const [savingNotes, setSavingNotes] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Active tool: 'type' | 'pen' | 'eraser'
    const [activeTool, setActiveTool] = useState('type');
    const [penColor, setPenColor] = useState('#1d4ed8'); // Medical blue
    const [penWidth, setPenWidth] = useState(2);

    const [admission, setAdmission] = useState(initialAdmission || null);
    const [latestVitals, setLatestVitals] = useState(null);
    const [savedNoteDoc, setSavedNoteDoc] = useState(null);
    const [tenantHospital, setTenantHospital] = useState(null);
    const [hospLogoFailed, setHospLogoFailed] = useState(false);

    // Unified Form State (primary document source)
    const [formState, setFormState] = useState(() =>
        buildDefaultClinicalNoteState({ patient: initialPatient, admission: initialAdmission, isBlank })
    );

    // History stack for Undo/Redo
    const [historyStack, setHistoryStack] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Communication state (Patient & Nurse Notes)
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
            setHasUnsavedChanges(false);
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
                const initSt = buildDefaultClinicalNoteState({ patient: initialPatient, admission: initialAdmission, isBlank });
                setFormState(initSt);
                setHistoryStack([initSt]);
                setHistoryIndex(0);
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

            const initState = buildDefaultClinicalNoteState({
                patient: initialPatient || resolvedAdm?.patientId,
                admission: resolvedAdm,
                latestVitals: notesRes?.latestVitals || null,
                clinicalNote: loadedNote,
                isBlank
            });
            setFormState(initState);
            setHistoryStack([initState]);
            setHistoryIndex(0);
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

    // Push new state onto history stack (supporting Undo/Redo)
    const commitStateUpdate = useCallback((updater) => {
        setFormState((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            setHistoryStack((oldStack) => {
                const trimmed = oldStack.slice(0, historyIndex + 1);
                return [...trimmed, next].slice(-50);
            });
            setHistoryIndex((oldIdx) => Math.min(oldIdx + 1, 49));
            setHasUnsavedChanges(true);
            return next;
        });
    }, [historyIndex]);

    const handleUndo = useCallback(() => {
        if (historyIndex > 0) {
            const targetIdx = historyIndex - 1;
            const targetState = historyStack[targetIdx];
            if (targetState) {
                setHistoryIndex(targetIdx);
                setFormState(targetState);
                toast('Undo performed');
            }
        }
    }, [historyIndex, historyStack]);

    const handleRedo = useCallback(() => {
        if (historyIndex < historyStack.length - 1) {
            const targetIdx = historyIndex + 1;
            const targetState = historyStack[targetIdx];
            if (targetState) {
                setHistoryIndex(targetIdx);
                setFormState(targetState);
                toast('Redo performed');
            }
        }
    }, [historyIndex, historyStack]);

    // Keyboard shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    handleRedo();
                } else {
                    e.preventDefault();
                    handleUndo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, handleUndo, handleRedo]);

    // Field update helpers with automatic MS Word-style continuation page generation
    const updateField = (key, val) => {
        commitStateUpdate((prev) => {
            const next = { ...prev, [key]: val };
            const lineLimits = {
                historyAndComplaints: 7,
                relevantPhysicalExamination: 7,
                historyOfPresentIllness: 4,
                pastMedicalSurgicalHistory: 3,
                systemicExamination: 7,
                investigations: 8,
                dischargeAndFollowUp: 8
            };
            const limit = lineLimits[key];
            if (limit) {
                const totalLines = (val ? String(val).split(/\r?\n/) : []).length;
                if (totalLines > limit) {
                    const currentCont = Array.isArray(prev.continuationPages) ? prev.continuationPages : [];
                    if (currentCont.length === 0) {
                        const newPageNum = 3;
                        next.continuationPages = [
                            {
                                pageNumber: newPageNum,
                                title: `CONTINUATION SHEET (PAGE ${newPageNum})`,
                                notes: ''
                            }
                        ];
                        toast('Text overflow detected: Continuation Page 3 automatically added', { icon: '📄' });
                    }
                }
            }
            return next;
        });
    };

    const updateGenField = (vitalKey, val) => {
        commitStateUpdate((prev) => ({
            ...prev,
            generalExamination: { ...prev.generalExamination, [vitalKey]: val }
        }));
    };

    const updateFooterField = (footerKey, val) => {
        commitStateUpdate((prev) => ({
            ...prev,
            footer: { ...prev.footer, [footerKey]: val }
        }));
    };

    // Strokes update helper for TabletPenCanvas
    const handleSavePageStrokes = (pageKey, newStrokes) => {
        commitStateUpdate((prev) => ({
            ...prev,
            handwritingStrokes: {
                ...(prev.handwritingStrokes || {}),
                [pageKey]: newStrokes
            }
        }));
    };

    // Continuation Page Management
    const handleAddContinuationPage = () => {
        commitStateUpdate((prev) => {
            const currentCont = Array.isArray(prev.continuationPages) ? prev.continuationPages : [];
            const newPageNum = currentCont.length + 3;
            const newCont = [
                ...currentCont,
                {
                    pageNumber: newPageNum,
                    title: `CONTINUATION SHEET (PAGE ${newPageNum})`,
                    notes: ''
                }
            ];
            toast.success(`Continuation Page ${newPageNum} added`);
            return { ...prev, continuationPages: newCont };
        });
    };

    const handleDeleteContinuationPage = (idx) => {
        if (!window.confirm('Are you sure you want to delete this continuation page?')) return;
        commitStateUpdate((prev) => {
            const currentCont = [...(prev.continuationPages || [])];
            currentCont.splice(idx, 1);
            // Renumber remaining continuation sheets
            const renumbered = currentCont.map((cp, i) => ({
                ...cp,
                pageNumber: i + 3,
                title: `CONTINUATION SHEET (PAGE ${i + 3})`
            }));
            toast.success('Continuation page removed');
            return { ...prev, continuationPages: renumbered };
        });
    };

    const handleContinuationNotesChange = (idx, newNotes) => {
        commitStateUpdate((prev) => {
            const currentCont = [...(prev.continuationPages || [])];
            if (currentCont[idx]) {
                currentCont[idx] = { ...currentCont[idx], notes: newNotes };
            }
            return { ...prev, continuationPages: currentCont };
        });
    };

    // Save Clinical Notes
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
                setHasUnsavedChanges(false);
                toast.success('In-Patient Clinical Notes saved successfully');
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
            toast.success('Official In-Patient Clinical Notes PDF downloaded');
        } catch (err) {
            console.error('PDF error:', err);
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

    // Communication API handlers
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

    if (!isOpen) return null;

    const renderBanner = () => (
        <div className="ipn-doc-banner">
            <span><strong>Patient Name :</strong> {ptBannerDetails.name}</span>
            <span><strong>UHID :</strong> {ptBannerDetails.uhid}</span>
            <span><strong>IPD :</strong> {ptBannerDetails.ipdNumber}</span>
            <span><strong>Gender :</strong> {ptBannerDetails.gender}</span>
            <span><strong>Age :</strong> {ptBannerDetails.age}</span>
        </div>
    );

    return (
        <div className="ipn-modal-overlay" onClick={onClose}>
            <div className="ipn-modal-container" onClick={e => e.stopPropagation()}>
                {/* Header Strip */}
                <div className="ipn-modal-header">
                    <div className="ipn-modal-title-group">
                        <h3>
                            <FiFileText color="#0d9488" />
                            <span>In-Patient Clinical Notes (Advanced Ruled Document Workspace)</span>
                        </h3>
                        <span className="ipn-modal-subtitle">
                            {loading ? 'Loading clinical notes…' : savedNoteDoc?.updatedByName
                                ? `Last saved by ${savedNoteDoc.updatedByName} (${savedNoteDoc.updatedByRole || 'Staff'})`
                                : 'Unified clinical records • Auto-synced across Nurse, Doctor & Assistant Dashboards'}
                        </span>
                    </div>

                    <div className="ipn-modal-actions">
                        {!isBlank && (
                            <button
                                type="button"
                                className="ipn-btn ipn-btn-save"
                                onClick={handleSaveNotes}
                                disabled={savingNotes}
                            >
                                <FiSave size={13} />
                                <span>{savingNotes ? 'Saving…' : hasUnsavedChanges ? 'Save Changes ●' : 'Save Notes'}</span>
                            </button>
                        )}
                        <button type="button" className="ipn-btn ipn-btn-outline" onClick={handlePrint}>
                            <FiPrinter size={13} />
                            <span>Print</span>
                        </button>
                        <button type="button" className="ipn-btn ipn-btn-outline" onClick={handleDownloadPdf} disabled={downloading}>
                            <FiDownload size={13} />
                            <span>{downloading ? 'Generating…' : 'PDF'}</span>
                        </button>
                        <button type="button" className="ipn-btn-close" onClick={onClose} title="Close">
                            <FiX />
                        </button>
                    </div>
                </div>

                {/* Compact MS Word-like Editing Toolbar */}
                <div className="ipn-doc-toolbar">
                    <div className="ipn-toolbar-group">
                        <button
                            type="button"
                            className={`ipn-tool-btn ${activeTool === 'type' ? 'active' : ''}`}
                            onClick={() => setActiveTool('type')}
                            title="Type directly on any ruled line or grid cell"
                        >
                            <FiEdit2 size={12} />
                            <span>Type Mode</span>
                        </button>
                        {canUsePenTool && (
                            <>
                                <button
                                    type="button"
                                    className={`ipn-tool-btn ${activeTool === 'pen' ? 'active' : ''}`}
                                    onClick={() => setActiveTool('pen')}
                                    title="Tablet pen / Stylus ink handwriting"
                                >
                                    <span>✍️ Pen</span>
                                </button>
                                <button
                                    type="button"
                                    className={`ipn-tool-btn ${activeTool === 'eraser' ? 'active' : ''}`}
                                    onClick={() => setActiveTool('eraser')}
                                    title="Erase handwriting ink strokes"
                                >
                                    <span>🧹 Eraser</span>
                                </button>

                                {activeTool === 'pen' && (
                                    <div className="ipn-pen-palette">
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>Ink:</span>
                                        <div
                                            className={`ipn-color-dot ${penColor === '#1d4ed8' ? 'active' : ''}`}
                                            style={{ background: '#1d4ed8' }}
                                            onClick={() => setPenColor('#1d4ed8')}
                                            title="Medical Blue"
                                        />
                                        <div
                                            className={`ipn-color-dot ${penColor === '#0f172a' ? 'active' : ''}`}
                                            style={{ background: '#0f172a' }}
                                            onClick={() => setPenColor('#0f172a')}
                                            title="Black"
                                        />
                                        <div
                                            className={`ipn-color-dot ${penColor === '#dc2626' ? 'active' : ''}`}
                                            style={{ background: '#dc2626' }}
                                            onClick={() => setPenColor('#dc2626')}
                                            title="Red / Alert"
                                        />
                                        <select
                                            className="ipn-stroke-width-select"
                                            value={penWidth}
                                            onChange={(e) => setPenWidth(Number(e.target.value))}
                                        >
                                            <option value={1.5}>Fine (1.5px)</option>
                                            <option value={2.5}>Medium (2.5px)</option>
                                            <option value={4}>Bold (4px)</option>
                                        </select>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="ipn-toolbar-group">
                        <button
                            type="button"
                            className="ipn-tool-btn"
                            onClick={handleUndo}
                            disabled={historyIndex <= 0}
                            title="Undo (Ctrl+Z)"
                        >
                            <FiRotateCcw size={12} />
                            <span>Undo</span>
                        </button>
                        <button
                            type="button"
                            className="ipn-tool-btn"
                            onClick={handleRedo}
                            disabled={historyIndex >= historyStack.length - 1}
                            title="Redo (Ctrl+Y)"
                        >
                            <FiRotateCw size={12} />
                            <span>Redo</span>
                        </button>

                        <div className="ipn-tool-divider" />

                        <button
                            type="button"
                            className="ipn-tool-btn"
                            onClick={handleAddContinuationPage}
                            title="Add a continuation page for extensive clinical notes"
                        >
                            <FiPlus size={12} />
                            <span>Add Continuation Page</span>
                        </button>
                    </div>
                </div>

                {/* Modal Main Body */}
                <div className="ipn-modal-body">
                    <div className="ipn-sheets-stack">
                            {/* ==================== PAGE 1 ==================== */}
                            <div className="ipn-sheet-paper">
                                <span className="ipn-sheet-badge">PAGE 1 — CLINICAL ASSESSMENT</span>

                                {/* Tablet Pen Overlay for Page 1 */}
                                <TabletPenCanvas
                                    pageKey="page1"
                                    strokes={formState.handwritingStrokes?.page1 || []}
                                    activeTool={canUsePenTool ? activeTool : 'type'}
                                    penColor={penColor}
                                    penWidth={penWidth}
                                    onSaveStrokes={(newStrokes) => handleSavePageStrokes('page1', newStrokes)}
                                />

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

                                    {/* Page 1 Demographics Meta Row (Click to edit inline) */}
                                    <div className="ipn-doc-meta-rows">
                                        <div className="ipn-doc-meta-row">
                                            <div className="ipn-doc-field" style={{ flex: 4.2 }}>
                                                <span>Patient&apos;s Name :</span>
                                                <div className="ipn-doc-field-val">
                                                    <input
                                                        className="ipn-inline-field-input"
                                                        value={formState.patientName || ''}
                                                        onChange={(e) => updateField('patientName', e.target.value)}
                                                        placeholder="Full Patient Name"
                                                    />
                                                </div>
                                            </div>
                                            <div className="ipn-doc-field" style={{ flex: 1.2 }}>
                                                <span>Age :</span>
                                                <div className="ipn-doc-field-val">
                                                    <input
                                                        className="ipn-inline-field-input"
                                                        value={formState.age || ''}
                                                        onChange={(e) => updateField('age', e.target.value)}
                                                        placeholder="Age"
                                                    />
                                                </div>
                                            </div>
                                            <div className="ipn-doc-field" style={{ flex: 0.9 }}>
                                                <span>Sex :</span>
                                                <div className="ipn-doc-field-val">
                                                    <input
                                                        className="ipn-inline-field-input"
                                                        value={formState.sex || ''}
                                                        onChange={(e) => updateField('sex', e.target.value)}
                                                        placeholder="M/F"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="ipn-doc-meta-row">
                                            <div className="ipn-doc-field" style={{ flex: 1.5 }}>
                                                <span>Regd. No. :</span>
                                                <div className="ipn-doc-field-val">
                                                    <input
                                                        className="ipn-inline-field-input"
                                                        value={formState.regdNo || ''}
                                                        onChange={(e) => updateField('regdNo', e.target.value)}
                                                        placeholder="UHID"
                                                    />
                                                </div>
                                            </div>
                                            <div className="ipn-doc-field" style={{ flex: 1.5 }}>
                                                <span>IPD No. :</span>
                                                <div className="ipn-doc-field-val">
                                                    <input
                                                        className="ipn-inline-field-input"
                                                        value={formState.ipdNo || ''}
                                                        onChange={(e) => updateField('ipdNo', e.target.value)}
                                                        placeholder="IPD Number"
                                                    />
                                                </div>
                                            </div>
                                            <div className="ipn-doc-field" style={{ flex: 1.1 }}>
                                                <span>Date :</span>
                                                <div className="ipn-doc-field-val">
                                                    <input
                                                        className="ipn-inline-field-input"
                                                        value={formState.noteDate || ''}
                                                        onChange={(e) => updateField('noteDate', e.target.value)}
                                                        placeholder="DD/MM/YYYY"
                                                    />
                                                </div>
                                            </div>
                                            <div className="ipn-doc-field" style={{ flex: 1 }}>
                                                <span>Time :</span>
                                                <div className="ipn-doc-field-val">
                                                    <input
                                                        className="ipn-inline-field-input"
                                                        value={formState.noteTime || ''}
                                                        onChange={(e) => updateField('noteTime', e.target.value)}
                                                        placeholder="HH:MM"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="ipn-doc-meta-row" style={{ marginBottom: 0 }}>
                                            <div className="ipn-doc-field" style={{ flex: 1.3 }}>
                                                <span>Ward :</span>
                                                <div className="ipn-doc-field-val">
                                                    <input
                                                        className="ipn-inline-field-input"
                                                        value={formState.ward || ''}
                                                        onChange={(e) => updateField('ward', e.target.value)}
                                                        placeholder="Ward"
                                                    />
                                                </div>
                                            </div>
                                            <div className="ipn-doc-field" style={{ flex: 1.2 }}>
                                                <span>Bed No. :</span>
                                                <div className="ipn-doc-field-val">
                                                    <input
                                                        className="ipn-inline-field-input"
                                                        value={formState.bedNo || ''}
                                                        onChange={(e) => updateField('bedNo', e.target.value)}
                                                        placeholder="Bed"
                                                    />
                                                </div>
                                            </div>
                                            <div className="ipn-doc-field" style={{ flex: 2 }}>
                                                <span>Consultant :</span>
                                                <div className="ipn-doc-field-val">
                                                    <input
                                                        className="ipn-inline-field-input"
                                                        value={formState.consultantName || ''}
                                                        onChange={(e) => updateField('consultantName', e.target.value)}
                                                        placeholder="Consultant Doctor"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ruled Sections */}
                                    <div className="ipn-doc-sec-hdr">History &amp; Complaints</div>
                                    <RuledSectionEditor
                                        sectionKey="historyAndComplaints"
                                        text={formState.historyAndComplaints}
                                        lineCount={7}
                                        onChange={(val) => updateField('historyAndComplaints', val)}
                                        placeholder="Click to type clinical complaints or dictate…"
                                    />

                                    <div className="ipn-doc-sec-hdr">Relevant Physical Examination</div>
                                    <RuledSectionEditor
                                        sectionKey="relevantPhysicalExamination"
                                        text={formState.relevantPhysicalExamination}
                                        lineCount={7}
                                        onChange={(val) => updateField('relevantPhysicalExamination', val)}
                                        placeholder="Click to type physical examination findings…"
                                    />

                                    <div className="ipn-doc-sec-hdr">History Of Present Illness</div>
                                    <RuledSectionEditor
                                        sectionKey="historyOfPresentIllness"
                                        text={formState.historyOfPresentIllness}
                                        lineCount={4}
                                        onChange={(val) => updateField('historyOfPresentIllness', val)}
                                        placeholder="Onset, duration and progress of symptoms…"
                                    />

                                    <div className="ipn-doc-sec-hdr">Past Medical History / Surgical History</div>
                                    <RuledSectionEditor
                                        sectionKey="pastMedicalSurgicalHistory"
                                        text={formState.pastMedicalSurgicalHistory}
                                        lineCount={3}
                                        onChange={(val) => updateField('pastMedicalSurgicalHistory', val)}
                                        placeholder="Previous illnesses, hospitalizations or surgeries…"
                                    />

                                    <div className="ipn-doc-split-row">
                                        <div className="ipn-doc-split-left">
                                            <div className="ipn-doc-sec-hdr">PERSONAL / SOCIAL HISTORY</div>
                                            <RuledSectionEditor
                                                sectionKey="personalSocialHistory"
                                                text={formState.personalSocialHistory}
                                                lineCount={2}
                                                onChange={(val) => updateField('personalSocialHistory', val)}
                                                placeholder="Habits, lifestyle, smoking/alcohol…"
                                            />
                                        </div>
                                        <div>
                                            <div className="ipn-doc-sec-hdr">ANY DRUG ALLERGY</div>
                                            <RuledSectionEditor
                                                sectionKey="anyDrugAllergy"
                                                text={formState.anyDrugAllergy}
                                                lineCount={2}
                                                onChange={(val) => updateField('anyDrugAllergy', val)}
                                                placeholder="Known drug allergies / sensitivities…"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ==================== PAGE 2 ==================== */}
                            <div className="ipn-sheet-paper">
                                <span className="ipn-sheet-badge">PAGE 2 — GENERAL EXAM &amp; PLAN</span>
                                {renderBanner()}

                                {/* Tablet Pen Overlay for Page 2 */}
                                <TabletPenCanvas
                                    pageKey="page2"
                                    strokes={formState.handwritingStrokes?.page2 || []}
                                    activeTool={canUsePenTool ? activeTool : 'type'}
                                    penColor={penColor}
                                    penWidth={penWidth}
                                    onSaveStrokes={(newStrokes) => handleSavePageStrokes('page2', newStrokes)}
                                />

                                <div className="ipn-doc-box">
                                    <div className="ipn-doc-sec-hdr" style={{ borderTop: 'none' }}>GENERAL EXAMINATION</div>
                                    <div className="ipn-doc-gen-grid">
                                        <div className="ipn-doc-gen-cell">
                                            <span className="ipn-doc-gen-lbl">BP</span>
                                            <input
                                                className="ipn-inline-cell-input"
                                                value={formState.generalExamination?.bp || ''}
                                                onChange={(e) => updateGenField('bp', e.target.value)}
                                                placeholder="120/80 mmHg"
                                            />
                                        </div>
                                        <div className="ipn-doc-gen-cell">
                                            <span className="ipn-doc-gen-lbl">Temp.</span>
                                            <input
                                                className="ipn-inline-cell-input"
                                                value={formState.generalExamination?.temp || ''}
                                                onChange={(e) => updateGenField('temp', e.target.value)}
                                                placeholder="98.6°F"
                                            />
                                        </div>
                                        <div className="ipn-doc-gen-cell">
                                            <span className="ipn-doc-gen-lbl">Pallor</span>
                                            <input
                                                className="ipn-inline-cell-input"
                                                value={formState.generalExamination?.pallor || ''}
                                                onChange={(e) => updateGenField('pallor', e.target.value)}
                                                placeholder="Absent / Mild"
                                            />
                                        </div>
                                        <div className="ipn-doc-gen-cell">
                                            <span className="ipn-doc-gen-lbl">Pulse</span>
                                            <input
                                                className="ipn-inline-cell-input"
                                                value={formState.generalExamination?.pulse || ''}
                                                onChange={(e) => updateGenField('pulse', e.target.value)}
                                                placeholder="72 bpm"
                                            />
                                        </div>
                                        <div className="ipn-doc-gen-cell">
                                            <span className="ipn-doc-gen-lbl">SPO2</span>
                                            <input
                                                className="ipn-inline-cell-input"
                                                value={formState.generalExamination?.spo2 || ''}
                                                onChange={(e) => updateGenField('spo2', e.target.value)}
                                                placeholder="98%"
                                            />
                                        </div>
                                        <div className="ipn-doc-gen-cell">
                                            <span className="ipn-doc-gen-lbl">Pain</span>
                                            <input
                                                className="ipn-inline-cell-input"
                                                value={formState.generalExamination?.pain || ''}
                                                onChange={(e) => updateGenField('pain', e.target.value)}
                                                placeholder="0/10"
                                            />
                                        </div>
                                    </div>

                                    <div className="ipn-doc-sec-hdr" style={{ borderTop: 'none' }}>SYSTEMIC</div>
                                    <RuledSectionEditor
                                        sectionKey="systemicExamination"
                                        text={formState.systemicExamination}
                                        lineCount={7}
                                        onChange={(val) => updateField('systemicExamination', val)}
                                        placeholder="CNS, CVS, RS, PA examination findings…"
                                    />

                                    <div className="ipn-doc-sec-hdr">PROV. DIAGNOSIS</div>
                                    <RuledSectionEditor
                                        sectionKey="provisionalDiagnosis"
                                        text={formState.provisionalDiagnosis}
                                        lineCount={3}
                                        onChange={(val) => updateField('provisionalDiagnosis', val)}
                                        placeholder="Clinical impression / provisional diagnosis…"
                                    />

                                    <div className="ipn-doc-sec-hdr">INVESTIGATIONS</div>
                                    <RuledSectionEditor
                                        sectionKey="investigations"
                                        text={formState.investigations}
                                        lineCount={8}
                                        onChange={(val) => updateField('investigations', val)}
                                        placeholder="Advised diagnostic tests, labs, radiology…"
                                    />

                                    <div className="ipn-doc-sec-hdr">DISCHARGE &amp; FOLLOW UP</div>
                                    <RuledSectionEditor
                                        sectionKey="dischargeAndFollowUp"
                                        text={formState.dischargeAndFollowUp}
                                        lineCount={8}
                                        onChange={(val) => updateField('dischargeAndFollowUp', val)}
                                        placeholder="Treatment plan, discharge criteria, review date…"
                                    />

                                    {/* Footer Sign-off (Inline editable) */}
                                    <div className="ipn-doc-footer-sign">
                                        <div className="ipn-doc-field" style={{ flex: 2.3 }}>
                                            <span>Name of Consultant :</span>
                                            <div className="ipn-doc-field-val">
                                                <input
                                                    className="ipn-inline-field-input"
                                                    value={formState.footer?.consultantName || ''}
                                                    onChange={(e) => updateFooterField('consultantName', e.target.value)}
                                                    placeholder="Dr. Name"
                                                />
                                            </div>
                                        </div>
                                        <div className="ipn-doc-field" style={{ flex: 1.4 }}>
                                            <span>Signature :</span>
                                            <div className="ipn-doc-field-val">
                                                <input
                                                    className="ipn-inline-field-input"
                                                    value={formState.footer?.signature || ''}
                                                    onChange={(e) => updateFooterField('signature', e.target.value)}
                                                    placeholder="Sign / Initial"
                                                />
                                            </div>
                                        </div>
                                        <div className="ipn-doc-field" style={{ flex: 0.9 }}>
                                            <span>Date :</span>
                                            <div className="ipn-doc-field-val">
                                                <input
                                                    className="ipn-inline-field-input"
                                                    value={formState.footer?.signDate || ''}
                                                    onChange={(e) => updateFooterField('signDate', e.target.value)}
                                                    placeholder="DD/MM/YYYY"
                                                />
                                            </div>
                                        </div>
                                        <div className="ipn-doc-field" style={{ flex: 0.8 }}>
                                            <span>Time :</span>
                                            <div className="ipn-doc-field-val">
                                                <input
                                                    className="ipn-inline-field-input"
                                                    value={formState.footer?.signTime || ''}
                                                    onChange={(e) => updateFooterField('signTime', e.target.value)}
                                                    placeholder="HH:MM"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ==================== CONTINUATION PAGES (PAGE 3+) ==================== */}
                            {(formState.continuationPages || []).map((cp, idx) => {
                                const pageNum = cp.pageNumber || idx + 3;
                                const pageKey = `page${pageNum}`;

                                return (
                                    <div key={pageNum} className="ipn-sheet-paper">
                                        <span className="ipn-sheet-badge">PAGE {pageNum} — CONTINUATION SHEET</span>
                                        <button
                                            type="button"
                                            className="ipn-sheet-delete-btn"
                                            onClick={() => handleDeleteContinuationPage(idx)}
                                            title="Delete this continuation page"
                                        >
                                            <FiTrash2 size={11} /> Delete Page
                                        </button>

                                        {renderBanner()}

                                        {/* Tablet Pen Overlay for Continuation Page */}
                                        <TabletPenCanvas
                                            pageKey={pageKey}
                                            strokes={formState.handwritingStrokes?.[pageKey] || []}
                                            activeTool={canUsePenTool ? activeTool : 'type'}
                                            penColor={penColor}
                                            penWidth={penWidth}
                                            onSaveStrokes={(newStrokes) => handleSavePageStrokes(pageKey, newStrokes)}
                                        />

                                        <div className="ipn-doc-box">
                                            <div className="ipn-doc-letterhead">
                                                <div className="ipn-doc-nabh">
                                                    {hospitalObj.accreditation?.enabled === true && hospitalObj.accreditation.logoUrl && (
                                                        <img src={hospitalObj.accreditation.logoUrl} alt="NABH" />
                                                    )}
                                                </div>
                                                <div className="ipn-doc-hosp">
                                                    {hospitalObj.logoUrl && !hospLogoFailed ? (
                                                        <img src={hospitalObj.logoUrl} alt={hospitalObj.name} onError={() => setHospLogoFailed(true)} />
                                                    ) : (
                                                        <div className="ipn-doc-hosp-name">{hospitalObj.name}</div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="ipn-doc-title">
                                                IN PATIENT CLINICAL NOTES — {cp.title || 'CONTINUATION SHEET'} (PAGE {pageNum})
                                            </div>

                                            <div className="ipn-doc-meta-rows">
                                                <div className="ipn-doc-meta-row" style={{ marginBottom: 0 }}>
                                                    <div className="ipn-doc-field" style={{ flex: 1.1 }}><span>Date :</span><span className="ipn-doc-field-val">{formState.noteDate}</span></div>
                                                    <div className="ipn-doc-field" style={{ flex: 1 }}><span>Time :</span><span className="ipn-doc-field-val">{formState.noteTime}</span></div>
                                                    <div className="ipn-doc-field" style={{ flex: 1.3 }}><span>Ward :</span><span className="ipn-doc-field-val">{formState.ward}</span></div>
                                                    <div className="ipn-doc-field" style={{ flex: 1.2 }}><span>Bed No. :</span><span className="ipn-doc-field-val">{formState.bedNo}</span></div>
                                                    <div className="ipn-doc-field" style={{ flex: 2 }}><span>Consultant :</span><span className="ipn-doc-field-val">{formState.consultantName}</span></div>
                                                </div>
                                            </div>

                                            <div className="ipn-doc-sec-hdr">CLINICAL OBSERVATIONS &amp; NOTES (CONTINUED)</div>
                                            <RuledSectionEditor
                                                sectionKey={`cont_${pageNum}`}
                                                text={cp.notes || ''}
                                                lineCount={26}
                                                onChange={(val) => handleContinuationNotesChange(idx, val)}
                                                placeholder="Continue writing clinical notes, daily progress or orders directly on these ruled lines…"
                                            />

                                            <div className="ipn-doc-footer-sign">
                                                <div className="ipn-doc-field" style={{ flex: 2.3 }}>
                                                    <span>Name of Consultant :</span>
                                                    <div className="ipn-doc-field-val">{formState.footer?.consultantName}</div>
                                                </div>
                                                <div className="ipn-doc-field" style={{ flex: 1.4 }}>
                                                    <span>Signature :</span>
                                                    <div className="ipn-doc-field-val">{formState.footer?.signature}</div>
                                                </div>
                                                <div className="ipn-doc-field" style={{ flex: 0.9 }}>
                                                    <span>Date :</span>
                                                    <div className="ipn-doc-field-val">{formState.footer?.signDate}</div>
                                                </div>
                                                <div className="ipn-doc-field" style={{ flex: 0.8 }}>
                                                    <span>Time :</span>
                                                    <div className="ipn-doc-field-val">{formState.footer?.signTime}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                </div>
            </div>
        </div>
    );
};

export default InpatientClinicalNotesModal;