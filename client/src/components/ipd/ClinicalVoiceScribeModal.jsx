import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    FiMic, FiMicOff, FiPlay, FiPause, FiSquare, FiX,
    FiCheck, FiTrash2, FiAlertCircle, FiZap, FiEdit3
} from 'react-icons/fi';
import { voiceScribeAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import './ClinicalVoiceScribeModal.css';

/**
 * Intelligent Clinical NLP Rule Parser to parse medical dictations / doctor-patient dialogues
 * into structured clinical note sections.
 */
const parseSpeechToClinicalSections = (transcript) => {
    if (!transcript || !transcript.trim()) return {};

    const clean = transcript.trim();
    const sentences = clean.split(/(?<=[.?!])\s+/).filter(Boolean);

    const proposals = {
        historyAndComplaints: [],
        relevantPhysicalExamination: [],
        historyOfPresentIllness: [],
        pastMedicalSurgicalHistory: [],
        generalExamination: {},
        systemicExamination: [],
        provisionalDiagnosis: [],
        investigations: [],
        dischargeAndFollowUp: []
    };

    sentences.forEach((sentence) => {
        const s = sentence.trim();
        const lower = s.toLowerCase();

        // 1. Vital Signs detection
        const bpMatch = s.match(/(?:bp|blood\s*pressure)(?:\s*(?:is|of|:)?\s*)(\d{2,3}\s*\/\s*\d{2,3})/i);
        if (bpMatch) proposals.generalExamination.bp = bpMatch[1].replace(/\s+/g, '') + ' mmHg';

        const pulseMatch = s.match(/(?:pulse|heart\s*rate)(?:\s*(?:is|of|:)?\s*)(\d{2,3})/i);
        if (pulseMatch) proposals.generalExamination.pulse = pulseMatch[1] + ' bpm';

        const tempMatch = s.match(/(?:temp|temperature|fever)(?:\s*(?:is|of|:)?\s*)(\d{2,3}(?:\.\d)?)/i);
        if (tempMatch) proposals.generalExamination.temp = tempMatch[1] + '°F';

        const spo2Match = s.match(/(?:spo2|saturation|oxygen)(?:\s*(?:is|of|:)?\s*)(\d{2,3})/i);
        if (spo2Match) proposals.generalExamination.spo2 = spo2Match[1] + '%';

        const painMatch = s.match(/pain(?:\s*(?:score|is|level|:)?\s*)(\d{1,2}(?:\/10)?)/i);
        if (painMatch) proposals.generalExamination.pain = painMatch[1].includes('/') ? painMatch[1] : `${painMatch[1]}/10`;

        // 2. Provisional Diagnosis
        if (
            lower.includes('diagnosis') ||
            lower.includes('provisional') ||
            lower.includes('impression') ||
            lower.includes('suffering from') ||
            lower.includes('presents with acute')
        ) {
            proposals.provisionalDiagnosis.push(s);
        }
        // 3. Investigations
        else if (
            lower.includes('investigation') ||
            lower.includes('advised') ||
            lower.includes('x-ray') ||
            lower.includes('cbc') ||
            lower.includes('lft') ||
            lower.includes('kft') ||
            lower.includes('ct scan') ||
            lower.includes('mri') ||
            lower.includes('ecg') ||
            lower.includes('blood test') ||
            lower.includes('urine test') ||
            lower.includes('ultrasound')
        ) {
            proposals.investigations.push(s);
        }
        // 4. Discharge & Follow Up / Treatment Plan
        else if (
            lower.includes('treatment') ||
            lower.includes('prescribe') ||
            lower.includes('discharge') ||
            lower.includes('follow up') ||
            lower.includes('review after') ||
            lower.includes('continue tab') ||
            lower.includes('start iv') ||
            lower.includes('injection')
        ) {
            proposals.dischargeAndFollowUp.push(s);
        }
        // 5. Relevant Physical Examination & Systemic
        else if (
            lower.includes('examination') ||
            lower.includes('on exam') ||
            lower.includes('chest') ||
            lower.includes('clear') ||
            lower.includes('crepitations') ||
            lower.includes('wheeze') ||
            lower.includes('abdomen') ||
            lower.includes('soft') ||
            lower.includes('tenderness') ||
            lower.includes('pallor') ||
            lower.includes('edema') ||
            lower.includes('cyanosis') ||
            lower.includes('pupils') ||
            lower.includes('cvs') ||
            lower.includes('cns') ||
            lower.includes('s1 s2')
        ) {
            if (lower.includes('chest') || lower.includes('cvs') || lower.includes('cns') || lower.includes('rs') || lower.includes('systemic')) {
                proposals.systemicExamination.push(s);
            } else {
                proposals.relevantPhysicalExamination.push(s);
            }
        }
        // 6. History of Present Illness
        else if (
            lower.includes('since') ||
            lower.includes('days ago') ||
            lower.includes('hours ago') ||
            lower.includes('onset') ||
            lower.includes('gradually') ||
            lower.includes('suddenly') ||
            lower.includes('history of present')
        ) {
            proposals.historyOfPresentIllness.push(s);
        }
        // 7. Past Medical / Surgical History
        else if (
            lower.includes('past history') ||
            lower.includes('history of dm') ||
            lower.includes('history of htn') ||
            lower.includes('diabetic') ||
            lower.includes('hypertensive') ||
            lower.includes('prior surgery') ||
            lower.includes('underwent')
        ) {
            proposals.pastMedicalSurgicalHistory.push(s);
        }
        // 8. Default to History & Complaints
        else {
            proposals.historyAndComplaints.push(s);
        }
    });

    const result = {};
    if (proposals.historyAndComplaints.length) result.historyAndComplaints = proposals.historyAndComplaints.join(' ');
    if (proposals.relevantPhysicalExamination.length) result.relevantPhysicalExamination = proposals.relevantPhysicalExamination.join(' ');
    if (proposals.historyOfPresentIllness.length) result.historyOfPresentIllness = proposals.historyOfPresentIllness.join(' ');
    if (proposals.pastMedicalSurgicalHistory.length) result.pastMedicalSurgicalHistory = proposals.pastMedicalSurgicalHistory.join(' ');
    if (proposals.systemicExamination.length) result.systemicExamination = proposals.systemicExamination.join(' ');
    if (proposals.provisionalDiagnosis.length) result.provisionalDiagnosis = proposals.provisionalDiagnosis.join(' ');
    if (proposals.investigations.length) result.investigations = proposals.investigations.join(' ');
    if (proposals.dischargeAndFollowUp.length) result.dischargeAndFollowUp = proposals.dischargeAndFollowUp.join(' ');
    if (Object.keys(proposals.generalExamination).length) result.generalExamination = proposals.generalExamination;

    // If nothing caught by rules, assign everything to History & Complaints
    if (Object.keys(result).length === 0 && clean.length > 0) {
        result.historyAndComplaints = clean;
    }

    return result;
};

const ClinicalVoiceScribeModal = ({
    isOpen,
    onClose,
    onApproveAndInsert,
    patientName = '',
    uhid = '',
    ipdNumber = ''
}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [hasRecorded, setHasRecorded] = useState(false);
    const [isStructuring, setIsStructuring] = useState(false);
    const [inputLanguage, setInputLanguage] = useState('auto');
    const [outputLanguage, setOutputLanguage] = useState('English');

    // Structured proposed sections
    const [proposedSections, setProposedSections] = useState({});
    const [selectedSections, setSelectedSections] = useState({});

    const recognitionRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);

    // Reset or cleanup on close
    useEffect(() => {
        if (!isOpen) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try { mediaRecorderRef.current.stop(); } catch (e) {}
            }
            if (streamRef.current) {
                try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
            }
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) {}
            }
            if (timerRef.current) clearInterval(timerRef.current);
            setIsRecording(false);
            setIsPaused(false);
            setSeconds(0);
            setTranscript('');
            setInterimTranscript('');
            setHasRecorded(false);
            setProposedSections({});
            setSelectedSections({});
            return;
        }

        // Setup SpeechRecognition for real-time live transcript preview if available
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = inputLanguage === 'hi-IN' ? 'hi-IN' : 'en-IN';

            recognition.onresult = (event) => {
                let finalStr = '';
                let interimStr = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalStr += event.results[i][0].transcript + ' ';
                    } else {
                        interimStr += event.results[i][0].transcript;
                    }
                }
                if (finalStr) {
                    setTranscript((prev) => (prev ? prev + ' ' + finalStr : finalStr).trim());
                }
                setInterimTranscript(interimStr);
            };

            recognition.onerror = (event) => {
                console.warn('[ClinicalVoiceScribe] SpeechRecognition notice:', event.error);
            };

            recognition.onend = () => {
                if (isRecording && !isPaused) {
                    try { recognition.start(); } catch (e) {}
                }
            };

            recognitionRef.current = recognition;
        }

        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try { mediaRecorderRef.current.stop(); } catch (e) {}
            }
            if (streamRef.current) {
                try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
            }
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) {}
            }
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isOpen]);

    // Duration timer handler
    useEffect(() => {
        if (isRecording && !isPaused) {
            timerRef.current = setInterval(() => {
                setSeconds((s) => s + 1);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isRecording, isPaused]);

    const formatDuration = (totalSec) => {
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const handleStartRecording = async () => {
        try {
            // Request actual microphone audio
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const chunks = [];
            audioChunksRef.current = chunks;

            let mime = 'audio/webm';
            if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mime = 'audio/webm;codecs=opus';
                else if (MediaRecorder.isTypeSupported('audio/webm')) mime = 'audio/webm';
                else if (MediaRecorder.isTypeSupported('audio/ogg')) mime = 'audio/ogg';
            }

            const recorder = new MediaRecorder(stream, { mimeType: mime });
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };
            recorder.start(250);
            mediaRecorderRef.current = recorder;

            if (recognitionRef.current) {
                try { recognitionRef.current.start(); } catch (e) {}
            }

            setIsRecording(true);
            setIsPaused(false);
            setHasRecorded(true);
            toast.success('AI Voice Scribe recording with Gemini AI… speak naturally');
        } catch (err) {
            console.error('Microphone recording start error:', err);
            toast.error(err.message || 'Microphone access denied. Please grant microphone permissions.');
        }
    };

    const handlePauseResume = () => {
        if (!isRecording) return;
        if (isPaused) {
            try {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
                    mediaRecorderRef.current.resume();
                }
                recognitionRef.current?.start();
                setIsPaused(false);
                toast('Recording resumed');
            } catch (e) {}
        } else {
            try {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.pause();
                }
                recognitionRef.current?.stop();
                setIsPaused(true);
                toast('Recording paused');
            } catch (e) {}
        }
    };

    const handleStopRecording = () => {
        setIsRecording(false);
        setIsPaused(false);
        if (timerRef.current) clearInterval(timerRef.current);
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.onstop = async () => {
                const chunks = audioChunksRef.current || [];
                const blob = new Blob(chunks, { type: mediaRecorderRef.current.mimeType || 'audio/webm' });
                if (streamRef.current) {
                    try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
                }
                await processWithGemini(blob, transcript);
            };
            try { mediaRecorderRef.current.stop(); } catch (e) {}
        } else {
            processWithGemini(null, transcript);
        }
    };

    const processWithGemini = async (blob, currentTranscript) => {
        setIsStructuring(true);
        const liveText = (currentTranscript || transcript || '').trim();

        try {
            const formData = new FormData();
            if (blob) {
                formData.append('audio', blob, 'clinical_encounter.webm');
                formData.append('mimeType', blob.type || 'audio/webm');
            }
            formData.append('liveTranscript', liveText);
            formData.append('outputLanguage', outputLanguage || 'English');
            formData.append('inputLanguage', inputLanguage || 'auto');
            formData.append('patientName', patientName || '');
            formData.append('uhid', uhid || '');
            formData.append('ipdNumber', ipdNumber || '');

            const res = await voiceScribeAPI.analyze(formData);
            if (res?.success && res?.data) {
                const data = res.data;
                const cs = data.clinicalSummary || {};
                const soap = data.soap || {};

                if (data.transcript && data.transcript.trim()) {
                    setTranscript(data.transcript);
                }

                // Map Gemini structured clinical intelligence into standard hospital note fields
                const geminiSections = {
                    historyAndComplaints: [
                        ...(cs.chiefComplaint || []),
                        ...(cs.symptoms || []),
                        cs.historyOfPresentIllness
                    ].filter(Boolean).join('\n') || liveText,

                    relevantPhysicalExamination: (cs.examinationFindings || []).join('\n') || (soap.objective || ''),

                    generalExamination: {
                        bp: (cs.vitalsMentioned || []).find(v => /bp|blood pressure/i.test(v)) || '',
                        pulse: (cs.vitalsMentioned || []).find(v => /pulse|heart rate/i.test(v)) || '',
                        temp: (cs.vitalsMentioned || []).find(v => /temp|temperature|fever/i.test(v)) || '',
                        spo2: (cs.vitalsMentioned || []).find(v => /spo2|saturation/i.test(v)) || '',
                        pain: ''
                    },

                    systemicExamination: (cs.examinationFindings || []).join('\n'),

                    provisionalDiagnosis: Array.isArray(cs.assessment) && cs.assessment.length > 0
                        ? cs.assessment.filter(a => !/not explicitly documented/i.test(a)).join('\n')
                        : (soap.assessment && !/not explicitly documented/i.test(soap.assessment) ? soap.assessment : ''),

                    investigations: (cs.investigationsMentioned || []).join('\n'),

                    dischargeAndFollowUp: [
                        ...(cs.plan || []),
                        cs.followUp
                    ].filter(Boolean).join('\n')
                };

                setProposedSections(geminiSections);
                const initialSelected = {};
                Object.keys(geminiSections).forEach(k => {
                    const v = geminiSections[k];
                    if (typeof v === 'string' && v.trim().length > 0) initialSelected[k] = true;
                    else if (typeof v === 'object' && Object.values(v).some(Boolean)) initialSelected[k] = true;
                });
                setSelectedSections(initialSelected);
                toast.success('Clinical conversation structured with Gemini Flash AI!');
                return;
            }
        } catch (err) {
            console.warn('[ClinicalVoiceScribe] Gemini analyze error:', err);
            toast.error(err.message || 'Gemini processing issue; reviewing consultation transcript');
        } finally {
            setIsStructuring(false);
        }

        // Fallback local rule parsing if offline or network unavailable
        const fallback = parseSpeechToClinicalSections(liveText);
        setProposedSections(fallback);
        const initialSelected = {};
        Object.keys(fallback).forEach(k => { initialSelected[k] = true; });
        setSelectedSections(initialSelected);
    };

    const handleDiscardAndClose = () => {
        if (isRecording) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try { mediaRecorderRef.current.stop(); } catch (e) {}
            }
            if (streamRef.current) {
                try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
            }
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) {}
            }
        }
        onClose();
    };

    const handleApprove = () => {
        const approvedData = {};
        Object.keys(selectedSections).forEach((key) => {
            if (selectedSections[key] && proposedSections[key]) {
                approvedData[key] = proposedSections[key];
            }
        });

        if (Object.keys(approvedData).length === 0) {
            toast.error('Please select at least one section to insert into the document.');
            return;
        }

        // Pass structured sections and raw session metadata to parent
        onApproveAndInsert({
            sections: approvedData,
            session: {
                recordedAt: new Date(),
                durationSeconds: seconds,
                rawTranscript: transcript
            }
        });

        toast.success('Approved AI content inserted into document lines');
        onClose();
    };

    const toggleSection = (key) => {
        setSelectedSections((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const updateProposedText = (key, text) => {
        setProposedSections((prev) => ({ ...prev, [key]: text }));
    };

    if (!isOpen) return null;

    const SECTION_LABELS = {
        historyAndComplaints: 'Page 1 — History & Complaints',
        relevantPhysicalExamination: 'Page 1 — Relevant Physical Examination',
        historyOfPresentIllness: 'Page 1 — History Of Present Illness',
        pastMedicalSurgicalHistory: 'Page 1 — Past Medical / Surgical History',
        generalExamination: 'Page 2 — General Examination (Vitals)',
        systemicExamination: 'Page 2 — Systemic Examination',
        provisionalDiagnosis: 'Page 2 — Provisional Diagnosis',
        investigations: 'Page 2 — Investigations Advised',
        dischargeAndFollowUp: 'Page 2 — Discharge & Follow Up / Plan'
    };

    return (
        <div className="cvs-modal-overlay" onClick={handleDiscardAndClose}>
            <div className="cvs-modal-card" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="cvs-header">
                    <div className="cvs-title-group">
                        <div className="cvs-icon-badge">
                            <FiZap />
                        </div>
                        <div>
                            <h3>AI Voice Scribe &amp; Clinical Dictation</h3>
                            <p className="cvs-subtitle">
                                Ambient conversation capture &bull; SOAP clinical note extraction &bull; Human-in-the-loop review
                            </p>
                        </div>
                    </div>
                    <button className="cvs-close-btn" onClick={handleDiscardAndClose} title="Cancel and Close">
                        <FiX />
                    </button>
                </div>

                {/* Body */}
                <div className="cvs-body">
                    {/* Language Selector Bar */}
                    <div className="cvs-lang-bar" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 14px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        color: '#334155'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, color: '#475569' }}>Spoken Dialogue:</span>
                            <select
                                value={inputLanguage}
                                onChange={(e) => setInputLanguage(e.target.value)}
                                disabled={isRecording}
                                style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '12px',
                                    background: '#f8fafc',
                                    fontWeight: 500,
                                    cursor: isRecording ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <option value="auto">Auto Detect (Hindi / English / Mixed)</option>
                                <option value="hi-IN">Hindi (हिन्दी)</option>
                                <option value="en-IN">Indian English</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, color: '#475569' }}>Document Output:</span>
                            <select
                                value={outputLanguage}
                                onChange={(e) => setOutputLanguage(e.target.value)}
                                disabled={isRecording}
                                style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '12px',
                                    background: '#f8fafc',
                                    fontWeight: 500,
                                    cursor: isRecording ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <option value="English">English</option>
                                <option value="Hindi">Hindi (हिन्दी)</option>
                            </select>
                        </div>
                    </div>

                    {/* Live Recording Control Console */}
                    <div className="cvs-recording-panel">
                        <div className="cvs-record-status-row">
                            <div className="cvs-live-indicator">
                                {isRecording ? (
                                    <>
                                        <div className="cvs-pulse-dot" />
                                        <span style={{ color: '#dc2626' }}>
                                            {isPaused ? 'Recording Paused' : 'Listening & Dictating Live…'}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <FiMicOff style={{ color: '#64748b', fontSize: '18px' }} />
                                        <span style={{ color: '#475569' }}>Microphone Idle</span>
                                    </>
                                )}
                            </div>

                            <div className="cvs-duration-clock">
                                {formatDuration(seconds)}
                            </div>
                        </div>

                        {/* Animated Sound Wave Visualizer */}
                        <div className="cvs-wave-visualizer">
                            <div className={`cvs-wave-bar ${isRecording && !isPaused ? 'active' : ''}`} />
                            <div className={`cvs-wave-bar ${isRecording && !isPaused ? 'active' : ''}`} />
                            <div className={`cvs-wave-bar ${isRecording && !isPaused ? 'active' : ''}`} />
                            <div className={`cvs-wave-bar ${isRecording && !isPaused ? 'active' : ''}`} />
                            <div className={`cvs-wave-bar ${isRecording && !isPaused ? 'active' : ''}`} />
                            <div className={`cvs-wave-bar ${isRecording && !isPaused ? 'active' : ''}`} />
                        </div>

                        {/* Action Buttons */}
                        <div className="cvs-controls-row">
                            {!isRecording ? (
                                <button type="button" className="cvs-ctl-btn cvs-btn-start" onClick={handleStartRecording}>
                                    <FiMic /> Start AI Voice Scribe
                                </button>
                            ) : (
                                <>
                                    <button type="button" className="cvs-ctl-btn cvs-btn-pause" onClick={handlePauseResume}>
                                        {isPaused ? <><FiPlay /> Resume</> : <><FiPause /> Pause</>}
                                    </button>
                                    <button type="button" className="cvs-ctl-btn cvs-btn-stop" onClick={handleStopRecording}>
                                        <FiSquare /> Stop &amp; Structure Clinical Note
                                    </button>
                                </>
                            )}
                            <button type="button" className="cvs-ctl-btn cvs-btn-cancel" onClick={handleDiscardAndClose}>
                                Cancel
                            </button>
                        </div>
                    </div>

                    {/* Speech Transcript Section */}
                    <div className="cvs-section-card">
                        <div className="cvs-section-title">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FiEdit3 color="#0284c7" />
                                <span>Spoken Transcript (Doctor / Patient)</span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                                Editable before clinical structuring
                            </span>
                        </div>
                        <textarea
                            className="cvs-transcript-textarea"
                            value={transcript + (interimTranscript ? ' ' + interimTranscript : '')}
                            onChange={(e) => {
                                setTranscript(e.target.value);
                                processTranscriptStructuring(e.target.value);
                            }}
                            placeholder="Voice dictation or doctor-patient dialogue will appear here live. You can also paste or edit text directly..."
                        />
                    </div>

                    {/* AI Structured Review Interface (STRICT SAFETY GATEWAY) */}
                    <div className="cvs-section-card">
                        <div className="cvs-section-title">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FiZap color="#0d9488" />
                                <span>AI Review &amp; Insertion Approval</span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#0d9488', fontWeight: 700 }}>
                                Select &amp; Edit proposed lines before insertion
                            </span>
                        </div>

                        {Object.keys(proposedSections).length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                                Speak into the microphone above or type a transcript to extract clinical document sections.
                            </div>
                        ) : (
                            <div className="cvs-ai-proposals">
                                {Object.keys(proposedSections).map((secKey) => {
                                    const val = proposedSections[secKey];
                                    const isSelected = Boolean(selectedSections[secKey]);
                                    const isGeneralExam = secKey === 'generalExamination';

                                    return (
                                        <div key={secKey} className={`cvs-proposal-item ${isSelected ? 'selected' : ''}`}>
                                            <div className="cvs-proposal-header">
                                                <label className="cvs-proposal-chk-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSection(secKey)}
                                                    />
                                                    <span>{SECTION_LABELS[secKey] || secKey}</span>
                                                </label>
                                                <span className="cvs-proposal-mode-toggle">
                                                    {isSelected ? '✓ Will Insert' : '✕ Excluded'}
                                                </span>
                                            </div>

                                            {isGeneralExam ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '12px' }}>
                                                    {Object.entries(val).map(([vitalKey, vitalVal]) => (
                                                        <div key={vitalKey} style={{ background: '#f1f5f9', padding: '6px 8px', borderRadius: '4px' }}>
                                                            <strong>{vitalKey.toUpperCase()}:</strong> {vitalVal}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <textarea
                                                    className="cvs-proposal-input"
                                                    value={val}
                                                    onChange={(e) => updateProposedText(secKey, e.target.value)}
                                                    disabled={!isSelected}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="cvs-footer">
                    <div className="cvs-footer-hint">
                        <FiAlertCircle color="#0284c7" />
                        <span>AI drafts are never finalized automatically. Human review is strictly enforced.</span>
                    </div>
                    <div className="cvs-footer-actions">
                        <button type="button" className="cvs-btn-discard" onClick={handleDiscardAndClose}>
                            <FiTrash2 style={{ marginRight: '4px' }} /> Discard Draft
                        </button>
                        <button
                            type="button"
                            className="cvs-btn-approve"
                            onClick={handleApprove}
                            disabled={Object.keys(proposedSections).length === 0}
                        >
                            <FiCheck /> Approve &amp; Insert into Progress Notes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClinicalVoiceScribeModal;
