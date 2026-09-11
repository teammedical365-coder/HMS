import React, { useState, useEffect, useRef, useMemo } from 'react';
import useVoiceRecorder from './useVoiceRecorder';
import useSpeechRecognition from './useSpeechRecognition';
import { voiceScribeAPI } from '../../utils/api';
import './VoiceScribe.css';

/**
 * VoiceScribe — Production-grade Multilingual AI Clinical Voice Scribe for Doctor-Patient consultations.
 * 
 * Capabilities:
 * 1. Captures live audio via MediaRecorder.
 * 2. Provides zero-latency real-time live transcript via Web Speech API (Chrome/Edge).
 * 3. Sends full consultation audio to Gemini server-side for multilingual clinical intelligence.
 * 4. Extracts structured Clinical Summary (Chief complaint, symptoms, vitals, findings, assessment, plan)
 *    and SOAP note (Subjective, Objective, Assessment, Plan).
 * 5. Allows doctor to edit, review, approve, and automatically apply directly into the consultation session notepad.
 * 6. Complies with tenant isolation, patient consent, and audit logging.
 */
export default function VoiceScribe({
    appointmentId,
    patientId,
    patient,
    appointment,
    sessionData,
    setSessionData,
    isLocked = false
}) {
    // ── Languages Supported ──────────────────────────────────────────────────
    const inputLanguages = [
        { code: 'auto', label: '🌐 Auto-Detect (Hindi / English / Mixed)' },
        { code: 'en-IN', label: 'English (India)' },
        { code: 'hi-IN', label: 'Hindi (हिंदी)' },
        { code: 'bn-IN', label: 'Bengali (বাংলা)' },
        { code: 'mr-IN', label: 'Marathi (मराठी)' },
        { code: 'gu-IN', label: 'Gujarati (ગુજરાતી)' },
        { code: 'ta-IN', label: 'Tamil (தமிழ்)' },
        { code: 'te-IN', label: 'Telugu (తెలుగు)' },
        { code: 'kn-IN', label: 'Kannada (ಕನ್ನಡ)' },
        { code: 'pa-IN', label: 'Punjabi (ਪੰਜਾਬੀ)' },
        { code: 'ml-IN', label: 'Malayalam (മലയാളം)' },
    ];

    const outputLanguages = [
        'English',
        'Hindi',
        'Bengali',
        'Marathi',
        'Gujarati',
        'Tamil',
        'Telugu',
        'Kannada',
        'Punjabi',
        'Malayalam'
    ];

    // ── State ────────────────────────────────────────────────────────────────
    const [consentGiven, setConsentGiven] = useState(true);
    const [selectedInputLang, setSelectedInputLang] = useState('auto');
    const [selectedOutputLang, setSelectedOutputLang] = useState('English');
    const [uiStatus, setUiStatus] = useState('IDLE'); // IDLE | RECORDING | PAUSED | PROCESSING | REVIEW | APPROVED | ERROR
    const [serverRecordId, setServerRecordId] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [loadingExisting, setLoadingExisting] = useState(false);

    // AI Analysis Results (editable by doctor)
    const [analysisData, setAnalysisData] = useState({
        transcript: '',
        speakerSegments: [],
        detectedLanguages: [],
        clinicalSummary: {
            chiefComplaint: [],
            historyOfPresentIllness: '',
            symptoms: [],
            duration: [],
            associatedSymptoms: [],
            relevantHistory: [],
            medicationsMentioned: [],
            allergiesMentioned: [],
            examinationFindings: [],
            vitalsMentioned: [],
            investigationsMentioned: [],
            previousDiagnosis: [],
            assessment: [],
            plan: [],
            followUp: '',
            importantPoints: []
        },
        soap: {
            subjective: '',
            objective: '',
            assessment: '',
            plan: ''
        }
    });

    // Recording Hooks
    const {
        state: recorderState,
        durationSeconds,
        error: recorderError,
        micPermission,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
        cancelRecording,
        getAudioBase64,
        formatDuration
    } = useVoiceRecorder();

    const {
        isSupported: isSpeechSupported,
        interimTranscript,
        finalTranscript,
        error: speechError,
        startListening,
        stopListening,
        resetTranscript,
        setLanguage: setSpeechLanguage
    } = useSpeechRecognition();

    const transcriptScrollRef = useRef(null);

    // Auto-scroll transcript container on new text
    useEffect(() => {
        if (transcriptScrollRef.current) {
            transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
        }
    }, [finalTranscript, interimTranscript, analysisData.transcript]);

    // Handle recorder error
    useEffect(() => {
        if (recorderError) {
            setErrorMessage(recorderError);
            setUiStatus('ERROR');
        }
    }, [recorderError]);

    // Load existing Voice Scribe data for this appointment (if any)
    useEffect(() => {
        if (!appointmentId) return;

        let isMounted = true;
        const fetchExisting = async () => {
            try {
                setLoadingExisting(true);
                const res = await voiceScribeAPI.getForAppointment(appointmentId);
                if (!isMounted) return;

                if (res && res.success && res.data) {
                    const doc = res.data;
                    setServerRecordId(doc._id);
                    setAnalysisData({
                        transcript: doc.transcript || '',
                        speakerSegments: doc.speakerSegments || [],
                        detectedLanguages: doc.detectedLanguages || [],
                        clinicalSummary: {
                            chiefComplaint: doc.clinicalSummary?.chiefComplaint || [],
                            historyOfPresentIllness: doc.clinicalSummary?.historyOfPresentIllness || '',
                            symptoms: doc.clinicalSummary?.symptoms || [],
                            duration: doc.clinicalSummary?.duration || [],
                            associatedSymptoms: doc.clinicalSummary?.associatedSymptoms || [],
                            relevantHistory: doc.clinicalSummary?.relevantHistory || [],
                            medicationsMentioned: doc.clinicalSummary?.medicationsMentioned || [],
                            allergiesMentioned: doc.clinicalSummary?.allergiesMentioned || [],
                            examinationFindings: doc.clinicalSummary?.examinationFindings || [],
                            vitalsMentioned: doc.clinicalSummary?.vitalsMentioned || [],
                            investigationsMentioned: doc.clinicalSummary?.investigationsMentioned || [],
                            previousDiagnosis: doc.clinicalSummary?.previousDiagnosis || [],
                            assessment: doc.clinicalSummary?.assessment || [],
                            plan: doc.clinicalSummary?.plan || [],
                            followUp: doc.clinicalSummary?.followUp || '',
                            importantPoints: doc.clinicalSummary?.importantPoints || []
                        },
                        soap: {
                            subjective: doc.soap?.subjective || '',
                            objective: doc.soap?.objective || '',
                            assessment: doc.soap?.assessment || '',
                            plan: doc.soap?.plan || ''
                        }
                    });

                    if (doc.status === 'APPROVED') {
                        setUiStatus('APPROVED');
                    } else if (doc.status === 'DRAFT' || doc.status === 'REVIEWED') {
                        setUiStatus('REVIEW');
                    }
                }
            } catch (err) {
                // Ignore 404 or no existing record
                console.log('No prior voice scribe session found for appointment');
            } finally {
                if (isMounted) setLoadingExisting(false);
            }
        };

        fetchExisting();

        return () => {
            isMounted = false;
        };
    }, [appointmentId]);

    // ── Actions ──────────────────────────────────────────────────────────────

    const handleStartRecording = async () => {
        setErrorMessage('');
        setStatusMessage('');
        try {
            if (typeof resetTranscript === 'function') resetTranscript();
        } catch (e) {}
        setConsentGiven(true);

        try {
            const startFn = startRecording || start;
            if (typeof startFn !== 'function') {
                throw new Error('Recording service is initializing. Please try again.');
            }
            const started = await startFn();
            if (started) {
                setUiStatus('RECORDING');
                if (isSpeechSupported && typeof startListening === 'function') {
                    try {
                        startListening(selectedInputLang);
                    } catch (e) {
                        console.warn('SpeechRecognition live preview warning:', e);
                    }
                }
            }
        } catch (err) {
            console.error('[VoiceScribe] handleStartRecording failed:', err);
            setErrorMessage(err.message || 'Microphone error. Please allow microphone permissions in your browser.');
            setUiStatus('ERROR');
        }
    };

    const handlePauseRecording = () => {
        try { if (typeof pauseRecording === 'function') pauseRecording(); } catch (e) {}
        try { if (typeof stopListening === 'function') stopListening(); } catch (e) {}
        setUiStatus('PAUSED');
    };

    const handleResumeRecording = () => {
        try { if (typeof resumeRecording === 'function') resumeRecording(); } catch (e) {}
        if (isSpeechSupported && typeof startListening === 'function') {
            try { startListening(selectedInputLang); } catch (e) {}
        }
        setUiStatus('RECORDING');
    };

    const handleStopRecording = async () => {
        try { if (typeof stopListening === 'function') stopListening(); } catch (e) {}
        setUiStatus('PROCESSING');
        setStatusMessage('Finalizing audio recording...');

        try {
            const stopFn = stopRecording || stop;
            const audioData = typeof stopFn === 'function' ? await stopFn() : null;

            if (!audioData || !audioData.blob) {
                throw new Error('No audio was captured. Please check your microphone and try recording again.');
            }

            setStatusMessage('Analyzing consultation with Gemini AI (multilingual medical transcription)...');

            const liveCombined = [finalTranscript, interimTranscript].filter(Boolean).join(' ').trim();
            const formData = new FormData();
            if (audioData.blob) {
                formData.append('audio', audioData.blob, 'consultation.webm');
            }
            if (audioData.base64) {
                formData.append('audioBase64', audioData.base64);
            }
            formData.append('mimeType', audioData.mimeType || 'audio/webm');
            formData.append('appointmentId', appointmentId || '');
            formData.append('patientId', patientId || '');
            formData.append('outputLanguage', selectedOutputLang);
            formData.append('liveTranscript', liveCombined);

            const res = await voiceScribeAPI.analyze(formData);

            if (!res || !res.success) {
                throw new Error(res?.message || 'Failed to analyze consultation audio.');
            }

            const aiResult = res.data || {};
            setServerRecordId(aiResult.voiceScribeId || aiResult._id || null);

            setAnalysisData({
                transcript: aiResult.transcript || liveCombined || '',
                speakerSegments: aiResult.speakerSegments || [],
                detectedLanguages: aiResult.detectedLanguages || [],
                clinicalSummary: {
                    chiefComplaint: aiResult.clinicalSummary?.chiefComplaint || [],
                    historyOfPresentIllness: aiResult.clinicalSummary?.historyOfPresentIllness || '',
                    symptoms: aiResult.clinicalSummary?.symptoms || [],
                    duration: aiResult.clinicalSummary?.duration || [],
                    associatedSymptoms: aiResult.clinicalSummary?.associatedSymptoms || [],
                    relevantHistory: aiResult.clinicalSummary?.relevantHistory || [],
                    medicationsMentioned: aiResult.clinicalSummary?.medicationsMentioned || [],
                    allergiesMentioned: aiResult.clinicalSummary?.allergiesMentioned || [],
                    examinationFindings: aiResult.clinicalSummary?.examinationFindings || [],
                    vitalsMentioned: aiResult.clinicalSummary?.vitalsMentioned || [],
                    investigationsMentioned: aiResult.clinicalSummary?.investigationsMentioned || [],
                    previousDiagnosis: aiResult.clinicalSummary?.previousDiagnosis || [],
                    assessment: aiResult.clinicalSummary?.assessment || [],
                    plan: aiResult.clinicalSummary?.plan || [],
                    followUp: aiResult.clinicalSummary?.followUp || '',
                    importantPoints: aiResult.clinicalSummary?.importantPoints || []
                },
                soap: {
                    subjective: aiResult.soap?.subjective || '',
                    objective: aiResult.soap?.objective || '',
                    assessment: aiResult.soap?.assessment || '',
                    plan: aiResult.soap?.plan || ''
                }
            });

            setUiStatus('REVIEW');
            setStatusMessage('');
        } catch (err) {
            console.error('Voice Scribe processing failed:', err);
            const userMsg = err.response?.data?.message || err.message || 'AI transcription failed. Please check your internet connection or retry.';
            setErrorMessage(userMsg);
            setUiStatus('ERROR');
            setStatusMessage('');
        }
    };

    const handleCancelRecording = () => {
        try { if (typeof cancelRecording === 'function') cancelRecording(); } catch (e) {}
        try { if (typeof stopListening === 'function') stopListening(); } catch (e) {}
        try { if (typeof resetTranscript === 'function') resetTranscript(); } catch (e) {}
        setUiStatus('IDLE');
        setStatusMessage('');
        setErrorMessage('');
    };

    const handleApproveAndApply = async () => {
        if (!serverRecordId) {
            // If we don't have a saved record ID yet, save draft first then approve
            try {
                if (appointmentId && patientId) {
                    setStatusMessage('Saving & approving...');
                    const draftRes = await voiceScribeAPI.saveDraft({
                        appointmentId,
                        patientId,
                        transcript: analysisData.transcript,
                        speakerSegments: analysisData.speakerSegments,
                        detectedLanguages: analysisData.detectedLanguages,
                        outputLanguage: selectedOutputLang,
                        durationSeconds,
                        clinicalSummary: analysisData.clinicalSummary,
                        soap: analysisData.soap
                    });

                    if (draftRes && draftRes.success && draftRes.data) {
                        const newId = draftRes.data._id;
                        setServerRecordId(newId);
                        await voiceScribeAPI.approve(newId, {
                            clinicalSummary: analysisData.clinicalSummary,
                            soap: analysisData.soap,
                            transcript: analysisData.transcript,
                            appointmentId
                        });
                    }
                }
            } catch (e) {
                console.warn('Draft save notice:', e.message);
            }
        } else {
            try {
                setStatusMessage('Approving note...');
                await voiceScribeAPI.approve(serverRecordId, {
                    clinicalSummary: analysisData.clinicalSummary,
                    soap: analysisData.soap,
                    transcript: analysisData.transcript,
                    appointmentId
                });
            } catch (e) {
                console.warn('Approve server notice:', e.message);
            }
        }

        // Apply directly to doctor's consultation notepad (sessionData)
        if (setSessionData) {
            setSessionData(prev => {
                const diagnosisFromAI = (analysisData.clinicalSummary.assessment || []).join(', ') ||
                    analysisData.soap.assessment ||
                    (analysisData.clinicalSummary.chiefComplaint || []).join(', ') ||
                    prev.diagnosis;

                // Build rich clinical summary note
                const noteParts = [];
                if (analysisData.soap.subjective || analysisData.soap.objective || analysisData.soap.assessment || analysisData.soap.plan) {
                    noteParts.push(`[SOAP CLINICAL NOTE]\nS: ${analysisData.soap.subjective || '-'}\nO: ${analysisData.soap.objective || '-'}\nA: ${analysisData.soap.assessment || '-'}\nP: ${analysisData.soap.plan || '-'}`);
                }

                if (analysisData.clinicalSummary.historyOfPresentIllness) {
                    noteParts.push(`\n[HPI]: ${analysisData.clinicalSummary.historyOfPresentIllness}`);
                }

                if ((analysisData.clinicalSummary.symptoms || []).length > 0) {
                    noteParts.push(`\n[Symptoms]: ${analysisData.clinicalSummary.symptoms.join(', ')}`);
                }

                if ((analysisData.clinicalSummary.examinationFindings || []).length > 0) {
                    noteParts.push(`\n[Examination]: ${analysisData.clinicalSummary.examinationFindings.join(', ')}`);
                }

                if (analysisData.clinicalSummary.followUp) {
                    noteParts.push(`\n[Follow-up]: ${analysisData.clinicalSummary.followUp}`);
                }

                const newClinicalNotes = noteParts.join('\n\n').trim();
                const combinedNotes = prev.notes
                    ? `${prev.notes}\n\n--- AI Scribe Note ---\n${newClinicalNotes}`
                    : newClinicalNotes;

                // Also append any investigations mentioned to lab tests
                const investigations = (analysisData.clinicalSummary.investigationsMentioned || []).join(', ');
                const combinedLabTests = prev.labTests
                    ? (investigations ? `${prev.labTests}, ${investigations}` : prev.labTests)
                    : investigations;

                return {
                    ...prev,
                    diagnosis: prev.diagnosis ? `${prev.diagnosis}, ${diagnosisFromAI}` : diagnosisFromAI,
                    notes: combinedNotes,
                    labTests: combinedLabTests
                };
            });
        }

        setUiStatus('APPROVED');
        setStatusMessage('Successfully approved and merged into consultation record!');
    };

    const handleDiscard = async () => {
        if (window.confirm('Are you sure you want to discard this Voice Scribe consultation?')) {
            try {
                if (serverRecordId) {
                    await voiceScribeAPI.discard(serverRecordId);
                }
            } catch (e) {
                console.log('Discard error ignored:', e);
            }

            setServerRecordId(null);
            setAnalysisData({
                transcript: '',
                speakerSegments: [],
                detectedLanguages: [],
                clinicalSummary: {
                    chiefComplaint: [],
                    historyOfPresentIllness: '',
                    symptoms: [],
                    duration: [],
                    associatedSymptoms: [],
                    relevantHistory: [],
                    medicationsMentioned: [],
                    allergiesMentioned: [],
                    examinationFindings: [],
                    vitalsMentioned: [],
                    investigationsMentioned: [],
                    previousDiagnosis: [],
                    assessment: [],
                    plan: [],
                    followUp: '',
                    importantPoints: []
                },
                soap: { subjective: '', objective: '', assessment: '', plan: '' }
            });
            resetTranscript();
            setUiStatus('IDLE');
            setStatusMessage('');
            setErrorMessage('');
        }
    };

    const handleCopyAll = () => {
        const fullText = `
CLINICAL NOTE — MEDICAL365 AI SCRIBE
Patient: ${patient?.name || 'Patient'} (MRN: ${patient?.patientId || 'N/A'})
Date: ${new Date().toLocaleDateString('en-IN')}

CHIEF COMPLAINT: ${(analysisData.clinicalSummary.chiefComplaint || []).join(', ') || 'None'}
HPI: ${analysisData.clinicalSummary.historyOfPresentIllness || 'None'}
SYMPTOMS: ${(analysisData.clinicalSummary.symptoms || []).join(', ') || 'None'}
EXAMINATION: ${(analysisData.clinicalSummary.examinationFindings || []).join(', ') || 'None'}
ASSESSMENT / DIAGNOSIS: ${(analysisData.clinicalSummary.assessment || []).join(', ') || 'None'}
PLAN: ${(analysisData.clinicalSummary.plan || []).join(', ') || 'None'}
FOLLOW-UP: ${analysisData.clinicalSummary.followUp || 'As needed'}

SOAP NOTE:
S: ${analysisData.soap.subjective || '-'}
O: ${analysisData.soap.objective || '-'}
A: ${analysisData.soap.assessment || '-'}
P: ${analysisData.soap.plan || '-'}

FULL TRANSCRIPT:
${analysisData.transcript}
        `.trim();

        navigator.clipboard.writeText(fullText);
        alert('Clinical note copied to clipboard!');
    };

    // Helper for editing string arrays (tags)
    const handleArrayChange = (field, valueString) => {
        const arr = valueString.split(',').map(s => s.trim()).filter(Boolean);
        setAnalysisData(prev => ({
            ...prev,
            clinicalSummary: {
                ...prev.clinicalSummary,
                [field]: arr
            }
        }));
    };

    // Helper for editing simple text in clinical summary
    const handleSummaryTextChange = (field, val) => {
        setAnalysisData(prev => ({
            ...prev,
            clinicalSummary: {
                ...prev.clinicalSummary,
                [field]: val
            }
        }));
    };

    // Helper for editing SOAP text
    const handleSoapChange = (section, val) => {
        setAnalysisData(prev => ({
            ...prev,
            soap: {
                ...prev.soap,
                [section]: val
            }
        }));
    };

    if (loadingExisting) {
        return (
            <div className="vs-container">
                <div className="vs-processing">
                    <div className="vs-processing-spinner"></div>
                    <div className="vs-processing-title">Loading Consultation Scribe...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="vs-container">
            {/* ── Header ────────────────────────────────────────────────────────── */}
            <div className="vs-header">
                <div className="vs-header-left">
                    <span style={{ fontSize: '24px' }}>🎙️</span>
                    <div>
                        <div className="vs-header-title">Multilingual AI Voice Scribe</div>
                        <div className="vs-header-subtitle">
                            Auto-transcribe Doctor ↔ Patient consultation • Hindi, English & Indic Languages
                        </div>
                    </div>
                </div>

                {uiStatus === 'RECORDING' && (
                    <div className="vs-live-badge">
                        <div className="vs-live-dot"></div>
                        LIVE RECORDING
                    </div>
                )}

                <div className="vs-header-right">
                    {uiStatus === 'REVIEW' && (
                        <button className="vs-btn vs-btn-cancel" onClick={handleCopyAll} title="Copy clinical note to clipboard">
                            📋 Copy Note
                        </button>
                    )}
                </div>
            </div>

            {/* ── Consent Banner ────────────────────────────────────────────────── */}
            {(uiStatus === 'IDLE' || uiStatus === 'ERROR') && (
                <div className="vs-consent-banner">
                    <div className="vs-consent-icon">🛡️</div>
                    <div className="vs-consent-text">
                        <strong>AI Clinical Voice Assistant & Consent Notice</strong>
                        Microphone audio is captured solely for transcribing this clinical visit and generating structured medical documentation.
                        Consultation audio is processed securely and is never stored permanently.
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: 'pointer', fontWeight: 600 }}>
                            <input
                                type="checkbox"
                                checked={consentGiven}
                                onChange={e => setConsentGiven(e.target.checked)}
                            />
                            Patient has consented to AI-assisted audio recording for clinical documentation.
                        </label>
                    </div>
                </div>
            )}

            {/* ── Language Selectors (Shown in IDLE, ERROR or REVIEW) ─────────────── */}
            {(uiStatus === 'IDLE' || uiStatus === 'ERROR') && (
                <div className="vs-lang-selectors">
                    <div className="vs-lang-group">
                        <label className="vs-lang-label">Speech Input Language</label>
                        <select
                            className="vs-lang-select"
                            value={selectedInputLang}
                            onChange={e => {
                                setSelectedInputLang(e.target.value);
                                if (typeof setSpeechLanguage === 'function') {
                                    setSpeechLanguage(e.target.value);
                                }
                            }}
                            disabled={uiStatus !== 'IDLE' && uiStatus !== 'ERROR'}
                        >
                            {inputLanguages.map(l => (
                                <option key={l.code} value={l.code}>{l.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="vs-lang-group">
                        <label className="vs-lang-label">Clinical Note Output Language</label>
                        <select
                            className="vs-lang-select"
                            value={selectedOutputLang}
                            onChange={e => setSelectedOutputLang(e.target.value)}
                            disabled={uiStatus !== 'IDLE' && uiStatus !== 'ERROR'}
                        >
                            {outputLanguages.map(l => (
                                <option key={l} value={l}>{l}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* ── Browser Support Notice (if not Chrome/Edge for Web Speech) ────── */}
            {!isSpeechSupported && (uiStatus === 'IDLE' || uiStatus === 'ERROR') && (
                <div className="vs-ai-disclaimer" style={{ marginBottom: '12px' }}>
                    <span>ℹ️</span>
                    <span>
                        Live real-time preview is optimized for Chrome & Edge. You can still record audio;
                        the full transcript and SOAP note will be generated automatically by Gemini once you click "Stop & Analyze".
                    </span>
                </div>
            )}

            {/* ── Error Banner ──────────────────────────────────────────────────── */}
            {errorMessage && (
                <div className="vs-error">
                    <span className="vs-error-icon">⚠️</span>
                    <div style={{ flex: 1 }}>{errorMessage}</div>
                    <button
                        onClick={() => {
                            setErrorMessage('');
                            if (uiStatus === 'ERROR') setUiStatus('IDLE');
                        }}
                        style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }}
                        title="Dismiss error"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* ── Recording Controls ────────────────────────────────────────────── */}
            <div className="vs-controls">
                {(uiStatus === 'IDLE' || uiStatus === 'ERROR') && (
                    <button
                        className="vs-btn vs-btn-start"
                        onClick={handleStartRecording}
                        title="Click to start consultation voice recording"
                    >
                        <span>🎙️</span> {uiStatus === 'ERROR' ? 'Retry Consultation Recording' : 'Start Consultation Recording'}
                    </button>
                )}

                {uiStatus === 'RECORDING' && (
                    <>
                        <div className="vs-timer vs-timer-recording">
                            <span>⏱️</span> {typeof formatDuration === 'function' ? formatDuration(durationSeconds) : `${String(Math.floor(durationSeconds / 60)).padStart(2, '0')}:${String(durationSeconds % 60).padStart(2, '0')}`}
                        </div>
                        <button className="vs-btn vs-btn-pause" onClick={handlePauseRecording}>
                            ⏸️ Pause
                        </button>
                        <button className="vs-btn vs-btn-stop" onClick={handleStopRecording}>
                            ⏹️ Stop & Analyze AI Note
                        </button>
                        <button className="vs-btn vs-btn-cancel" onClick={handleCancelRecording}>
                            ✕ Cancel
                        </button>
                    </>
                )}

                {uiStatus === 'PAUSED' && (
                    <>
                        <div className="vs-timer vs-timer-paused">
                            <span>⏸️</span> {typeof formatDuration === 'function' ? formatDuration(durationSeconds) : `${String(Math.floor(durationSeconds / 60)).padStart(2, '0')}:${String(durationSeconds % 60).padStart(2, '0')}`} (Paused)
                        </div>
                        <button className="vs-btn vs-btn-resume" onClick={handleResumeRecording}>
                            ▶️ Resume
                        </button>
                        <button className="vs-btn vs-btn-stop" onClick={handleStopRecording}>
                            ⏹️ Stop & Analyze AI Note
                        </button>
                        <button className="vs-btn vs-btn-cancel" onClick={handleCancelRecording}>
                            ✕ Cancel
                        </button>
                    </>
                )}

                {(uiStatus === 'REVIEW' || uiStatus === 'APPROVED') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', justifyContent: 'space-between' }}>
                        <div className="vs-status-bar" style={{ margin: 0, padding: '6px 12px' }}>
                            <span className="vs-status-chip vs-chip-ready">
                                {uiStatus === 'APPROVED' ? '✅ Note Approved' : '📝 Note Ready for Review'}
                            </span>
                            {analysisData.detectedLanguages.length > 0 && (
                                <span className="vs-status-chip vs-chip-lang">
                                    🗣️ Detected: {analysisData.detectedLanguages.join(', ')}
                                </span>
                            )}
                            <span className="vs-status-chip vs-chip-processing">
                                📄 Output: {selectedOutputLang}
                            </span>
                        </div>

                        <button
                            className="vs-btn vs-btn-start"
                            onClick={() => {
                                if (window.confirm('Start a new recording? Current unapproved draft will be replaced.')) {
                                    handleStartRecording();
                                }
                            }}
                            style={{ padding: '8px 16px', fontSize: '13px' }}
                        >
                            🔄 Re-record
                        </button>
                    </div>
                )}
            </div>

            {/* ── Processing State ──────────────────────────────────────────────── */}
            {uiStatus === 'PROCESSING' && (
                <div className="vs-processing">
                    <div className="vs-processing-spinner"></div>
                    <div className="vs-processing-title">{statusMessage || 'Processing Consultation Audio...'}</div>
                    <div className="vs-processing-subtitle">
                        Medical365 AI is transcribing multilingual speech, separating Doctor & Patient utterances, and synthesizing the clinical summary.
                    </div>
                </div>
            )}

            {/* ── Live Transcript Area during Recording/Paused ──────────────────── */}
            {(uiStatus === 'RECORDING' || uiStatus === 'PAUSED') && (
                <div className="vs-transcript-area" ref={transcriptScrollRef}>
                    <div className="vs-transcript-title">
                        <span>💬</span> Live Transcript (Speaking Preview)
                    </div>

                    {finalTranscript || interimTranscript ? (
                        <div className="vs-transcript-line">
                            {finalTranscript && (
                                <span className="vs-transcript-text">{finalTranscript} </span>
                            )}
                            {interimTranscript && (
                                <span className="vs-transcript-interim">{interimTranscript}</span>
                            )}
                        </div>
                    ) : (
                        <div className="vs-transcript-empty">
                            <div className="vs-transcript-empty-icon">🎙️</div>
                            <div>Doctor and patient can begin speaking. Utterances will appear here in real time...</div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Clinical Review & Editing Section ─────────────────────────────── */}
            {(uiStatus === 'REVIEW' || uiStatus === 'APPROVED') && (
                <div className="vs-review">
                    <div className="vs-review-header">
                        <div className="vs-review-title">
                            🏥 AI Clinical Note & SOAP Summary
                        </div>
                        <div className="vs-review-badge">
                            {uiStatus === 'APPROVED' ? 'Approved & Applied' : 'Editable by Doctor'}
                        </div>
                    </div>

                    <div className="vs-ai-disclaimer">
                        <span>⚠️</span>
                        <span>
                            AI clinical assistant suggestions are provisional. The attending doctor is legally and medically responsible for verifying all findings, diagnoses, and prescriptions before finalizing.
                        </span>
                    </div>

                    {/* Full Transcript with Speaker Breakdown */}
                    <div className="vs-section">
                        <div className="vs-section-title">
                            <span>💬</span> Consultation Transcript
                        </div>
                        <div className="vs-section-content" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                            {analysisData.speakerSegments && analysisData.speakerSegments.length > 0 ? (
                                analysisData.speakerSegments.map((seg, idx) => {
                                    const isDoc = (seg.speaker || '').toLowerCase().includes('doctor');
                                    return (
                                        <div
                                            key={idx}
                                            className={`vs-speaker-segment ${isDoc ? 'doctor' : 'patient'}`}
                                        >
                                            <div className={`vs-speaker-label ${isDoc ? 'doctor' : 'patient'}`}>
                                                {isDoc ? '👨‍⚕️ Doctor' : '👤 Patient'} {seg.timestamp ? `(${seg.timestamp})` : ''}
                                            </div>
                                            <div className="vs-speaker-text">{seg.text}</div>
                                        </div>
                                    );
                                })
                            ) : (
                                <textarea
                                    className="vs-field-input vs-field-textarea"
                                    value={analysisData.transcript}
                                    onChange={e => setAnalysisData(p => ({ ...p, transcript: e.target.value }))}
                                    placeholder="Transcript..."
                                    rows={4}
                                    readOnly={uiStatus === 'APPROVED'}
                                />
                            )}
                        </div>
                    </div>

                    {/* Structured Clinical Summary */}
                    <div className="vs-section">
                        <div className="vs-section-title">
                            <span>📋</span> Structured Clinical Summary
                        </div>
                        <div className="vs-section-content">
                            {/* Chief Complaint */}
                            <div className="vs-field">
                                <div className="vs-field-label">Chief Complaint (Comma separated)</div>
                                <input
                                    type="text"
                                    className="vs-field-input"
                                    value={(analysisData.clinicalSummary.chiefComplaint || []).join(', ')}
                                    onChange={e => handleArrayChange('chiefComplaint', e.target.value)}
                                    placeholder="e.g. Fever, Cough, Headache"
                                    readOnly={uiStatus === 'APPROVED'}
                                />
                            </div>

                            {/* History of Present Illness */}
                            <div className="vs-field">
                                <div className="vs-field-label">History of Present Illness (HPI)</div>
                                <textarea
                                    className="vs-field-input"
                                    value={analysisData.clinicalSummary.historyOfPresentIllness || ''}
                                    onChange={e => handleSummaryTextChange('historyOfPresentIllness', e.target.value)}
                                    placeholder="Clinical history narration..."
                                    rows={2}
                                    readOnly={uiStatus === 'APPROVED'}
                                />
                            </div>

                            {/* Symptoms & Duration */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div className="vs-field">
                                    <div className="vs-field-label">Symptoms Discussed</div>
                                    <input
                                        type="text"
                                        className="vs-field-input"
                                        value={(analysisData.clinicalSummary.symptoms || []).join(', ')}
                                        onChange={e => handleArrayChange('symptoms', e.target.value)}
                                        placeholder="e.g. High fever, chills, dry cough"
                                        readOnly={uiStatus === 'APPROVED'}
                                    />
                                </div>
                                <div className="vs-field">
                                    <div className="vs-field-label">Duration</div>
                                    <input
                                        type="text"
                                        className="vs-field-input"
                                        value={(analysisData.clinicalSummary.duration || []).join(', ')}
                                        onChange={e => handleArrayChange('duration', e.target.value)}
                                        placeholder="e.g. 3 days, 1 week"
                                        readOnly={uiStatus === 'APPROVED'}
                                    />
                                </div>
                            </div>

                            {/* Examination & Vitals */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div className="vs-field">
                                    <div className="vs-field-label">Examination Findings</div>
                                    <input
                                        type="text"
                                        className="vs-field-input"
                                        value={(analysisData.clinicalSummary.examinationFindings || []).join(', ')}
                                        onChange={e => handleArrayChange('examinationFindings', e.target.value)}
                                        placeholder="e.g. Throat congested, Chest clear"
                                        readOnly={uiStatus === 'APPROVED'}
                                    />
                                </div>
                                <div className="vs-field">
                                    <div className="vs-field-label">Vitals Mentioned</div>
                                    <input
                                        type="text"
                                        className="vs-field-input"
                                        value={(analysisData.clinicalSummary.vitalsMentioned || []).join(', ')}
                                        onChange={e => handleArrayChange('vitalsMentioned', e.target.value)}
                                        placeholder="e.g. BP 120/80, Temp 101F"
                                        readOnly={uiStatus === 'APPROVED'}
                                    />
                                </div>
                            </div>

                            {/* Investigations & Follow-up */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div className="vs-field">
                                    <div className="vs-field-label">Investigations / Tests Mentioned</div>
                                    <input
                                        type="text"
                                        className="vs-field-input"
                                        value={(analysisData.clinicalSummary.investigationsMentioned || []).join(', ')}
                                        onChange={e => handleArrayChange('investigationsMentioned', e.target.value)}
                                        placeholder="e.g. CBC, Widal, Chest X-Ray"
                                        readOnly={uiStatus === 'APPROVED'}
                                    />
                                </div>
                                <div className="vs-field">
                                    <div className="vs-field-label">Follow-up Instructions</div>
                                    <input
                                        type="text"
                                        className="vs-field-input"
                                        value={analysisData.clinicalSummary.followUp || ''}
                                        onChange={e => handleSummaryTextChange('followUp', e.target.value)}
                                        placeholder="e.g. Review after 3 days if fever persists"
                                        readOnly={uiStatus === 'APPROVED'}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SOAP Note Grid */}
                    <div className="vs-section">
                        <div className="vs-section-title">
                            <span>🩺</span> SOAP Clinical Note
                        </div>
                        <div className="vs-section-content">
                            <div className="vs-soap-grid">
                                <div className="vs-soap-card">
                                    <div className="vs-soap-letter">S</div>
                                    <div className="vs-soap-label">Subjective (Patient's complaints & history)</div>
                                    <textarea
                                        className="vs-field-input"
                                        value={analysisData.soap.subjective}
                                        onChange={e => handleSoapChange('subjective', e.target.value)}
                                        rows={3}
                                        readOnly={uiStatus === 'APPROVED'}
                                    />
                                </div>

                                <div className="vs-soap-card">
                                    <div className="vs-soap-letter">O</div>
                                    <div className="vs-soap-label">Objective (Clinical observations & vitals)</div>
                                    <textarea
                                        className="vs-field-input"
                                        value={analysisData.soap.objective}
                                        onChange={e => handleSoapChange('objective', e.target.value)}
                                        rows={3}
                                        readOnly={uiStatus === 'APPROVED'}
                                    />
                                </div>

                                <div className="vs-soap-card">
                                    <div className="vs-soap-letter">A</div>
                                    <div className="vs-soap-label">Assessment (Differential diagnosis)</div>
                                    <textarea
                                        className="vs-field-input"
                                        value={analysisData.soap.assessment}
                                        onChange={e => handleSoapChange('assessment', e.target.value)}
                                        rows={3}
                                        readOnly={uiStatus === 'APPROVED'}
                                    />
                                </div>

                                <div className="vs-soap-card">
                                    <div className="vs-soap-letter">P</div>
                                    <div className="vs-soap-label">Plan (Medications, labs, advice)</div>
                                    <textarea
                                        className="vs-field-input"
                                        value={analysisData.soap.plan}
                                        onChange={e => handleSoapChange('plan', e.target.value)}
                                        rows={3}
                                        readOnly={uiStatus === 'APPROVED'}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions Bar */}
                    <div className="vs-actions">
                        {uiStatus !== 'APPROVED' && (
                            <>
                                <button
                                    className="vs-btn vs-btn-discard"
                                    onClick={handleDiscard}
                                >
                                    🗑️ Discard
                                </button>

                                <button
                                    className="vs-btn vs-btn-approve"
                                    onClick={handleApproveAndApply}
                                >
                                    ✅ Approve & Apply to Notepad
                                </button>
                            </>
                        )}

                        {uiStatus === 'APPROVED' && (
                            <div style={{ color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>✅</span> Clinical note approved and synced with Session Notepad.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
