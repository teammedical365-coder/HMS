const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken, requirePermission } = require('../middleware/auth.middleware');
const VoiceScribe = require('../models/voiceScribe.model');
const Appointment = require('../models/appointment.model');
const voiceScribeService = require('../services/ai/voiceScribe.service');

// Multer: accept audio uploads up to 50MB in memory
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        // Accept all audio / webm streams
        cb(null, true);
    }
});

// All routes require authentication + doctor-level permissions
router.use(verifyToken);

// ── POST /api/voice-scribe/analyze ─────────────────────────────────────────────
// Upload audio → transcribe via Gemini → return structured clinical analysis
router.post('/analyze',
    requirePermission('visit_diagnose', 'doctor_dashboard', 'admin_manage_roles', 'admin_view_stats', 'emr_access', 'reception_access'),
    (req, res, next) => {
        const ct = req.headers['content-type'] || '';
        if (ct.includes('multipart/form-data')) {
            return upload.single('audio')(req, res, (err) => {
                if (err) {
                    console.warn('[Voice Scribe] Multer parsing warning:', err.message);
                }
                next();
            });
        }
        next();
    },
    async (req, res) => {
        try {
            const rawAudio = req.body?.audioBase64 || req.body?.audio;
            let audioBase64 = null;

            if (req.file && req.file.buffer) {
                audioBase64 = req.file.buffer.toString('base64');
            } else if (typeof rawAudio === 'string' && rawAudio.trim()) {
                // If it's a data URI, strip prefix
                if (rawAudio.startsWith('data:')) {
                    const commaIdx = rawAudio.indexOf(',');
                    audioBase64 = rawAudio.substring(commaIdx + 1);
                } else {
                    audioBase64 = rawAudio;
                }
            }

            if (!audioBase64) {
                return res.status(400).json({
                    success: false,
                    message: 'No audio data received. Please ensure your microphone is working and try recording again.'
                });
            }

            const mimeType = req.body?.mimeType || req.file?.mimetype || 'audio/webm';
            const outputLanguage = req.body?.outputLanguage || 'English';
            const liveTranscript = req.body?.liveTranscript || '';

            const userContext = {
                hospitalId: req.user?.hospitalId,
                userId: req.user?._id || req.user?.userId,
                userRole: req.user?._roleData?.name || req.user?.role || 'doctor',
                userName: req.user?.name || req.user?.username || 'Doctor',
                patientId: req.body?.patientId || null
            };

            const result = await voiceScribeService.transcribeAndAnalyze(
                audioBase64,
                mimeType,
                outputLanguage,
                userContext,
                liveTranscript
            );

            res.json({
                success: true,
                data: result
            });
        } catch (err) {
            console.error('[Voice Scribe] Analyze error:', err);
            res.status(500).json({
                success: false,
                message: err.message || 'Voice transcription failed. Please try again.',
                error: err.message
            });
        }
    }
);

// ── POST /api/voice-scribe/save-draft ──────────────────────────────────────────
// Save a draft voice scribe session (before doctor approval)
router.post('/save-draft',
    requirePermission('visit_diagnose', 'doctor_dashboard', 'admin_manage_roles', 'admin_view_stats', 'emr_access', 'reception_access'),
    async (req, res) => {
        try {
            const hospitalId = req.user.hospitalId;
            const doctorId = req.user._id || req.user.userId;
            const {
                appointmentId, patientId,
                transcript, speakerSegments, detectedLanguages, outputLanguage,
                clinicalSummary, soap,
                durationSeconds, recordingStartedAt, recordingEndedAt,
                consentRecordedAt, consentText
            } = req.body;

            if (!appointmentId || !patientId) {
                return res.status(400).json({ success: false, message: 'appointmentId and patientId are required.' });
            }

            // Verify appointment belongs to this hospital
            const appointment = await Appointment.findOne({
                _id: appointmentId,
                hospitalId
            }).lean();

            if (!appointment) {
                return res.status(404).json({ success: false, message: 'Appointment not found.' });
            }

            // Upsert: update existing draft or create new one
            const scribe = await VoiceScribe.findOneAndUpdate(
                { hospitalId, appointmentId, status: 'DRAFT' },
                {
                    hospitalId,
                    patientId,
                    doctorId,
                    appointmentId,
                    transcript: transcript || '',
                    speakerSegments: speakerSegments || [],
                    detectedLanguages: detectedLanguages || [],
                    outputLanguage: outputLanguage || 'English',
                    clinicalSummary: clinicalSummary || {},
                    soap: soap || {},
                    durationSeconds: durationSeconds || 0,
                    recordingStartedAt,
                    recordingEndedAt,
                    consentRecordedAt,
                    consentText: consentText || 'AI-assisted recording and transcription is enabled for this consultation.',
                    status: 'DRAFT'
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            res.json({ success: true, data: scribe });
        } catch (err) {
            console.error('[Voice Scribe] Save draft error:', err.message);
            res.status(500).json({ success: false, message: 'Failed to save draft.' });
        }
    }
);

// ── PUT /api/voice-scribe/:id/approve ──────────────────────────────────────────
// Doctor approves the AI-generated note → merge into appointment record
router.put('/:id/approve',
    requirePermission('visit_diagnose', 'doctor_dashboard', 'admin_manage_roles', 'admin_view_stats', 'emr_access', 'reception_access'),
    async (req, res) => {
        try {
            const hospitalId = req.user.hospitalId;
            const doctorId = req.user._id || req.user.userId;

            const scribe = await VoiceScribe.findOne({
                _id: req.params.id,
                hospitalId
            });

            if (!scribe) {
                return res.status(404).json({ success: false, message: 'Voice Scribe session not found.' });
            }

            if (scribe.status === 'APPROVED') {
                return res.status(400).json({ success: false, message: 'This session has already been approved.' });
            }

            if (scribe.status === 'DISCARDED') {
                return res.status(400).json({ success: false, message: 'This session was discarded.' });
            }

            // Accept doctor's edited data
            const {
                clinicalSummary, soap,
                transcript, speakerSegments,
                mergeDiagnosis, mergeNotes
            } = req.body;

            if (clinicalSummary) scribe.clinicalSummary = clinicalSummary;
            if (soap) scribe.soap = soap;
            if (transcript) scribe.transcript = transcript;
            if (speakerSegments) scribe.speakerSegments = speakerSegments;

            scribe.status = 'APPROVED';
            scribe.approvedAt = new Date();
            scribe.approvedBy = doctorId;

            // Build merge data for appointment
            const diagnosisText = mergeDiagnosis || (scribe.clinicalSummary?.assessment || []).join(', ') || '';
            const notesText = mergeNotes || _buildClinicalNotesText(scribe);

            scribe.mergedData = {
                diagnosis: diagnosisText,
                notes: notesText
            };

            await scribe.save();

            // Merge into the appointment record (append, don't overwrite existing data)
            if (scribe.appointmentId) {
                const appointment = await Appointment.findOne({
                    _id: scribe.appointmentId,
                    hospitalId
                });

                if (appointment) {
                    // Append AI scribe notes to existing doctor notes
                    const existingNotes = appointment.doctorNotes || '';
                    const scribeNote = `\n\n--- AI Voice Scribe (${new Date().toLocaleDateString('en-IN')}) ---\n${notesText}`;
                    appointment.doctorNotes = existingNotes ? existingNotes + scribeNote : scribeNote.trim();

                    // Set diagnosis if not already set
                    if (!appointment.diagnosis && diagnosisText) {
                        appointment.diagnosis = diagnosisText;
                    }

                    // Set symptoms if extracted
                    const symptoms = (scribe.clinicalSummary?.symptoms || []).join(', ');
                    if (symptoms && !appointment.symptoms) {
                        appointment.symptoms = symptoms;
                    }

                    await appointment.save();
                }
            }

            // Log audit event
            try {
                const AuditLog = require('../models/auditLog.model');
                await AuditLog.create({
                    clinicId: hospitalId,
                    userId: doctorId,
                    userName: req.user.name || 'Doctor',
                    role: req.user._roleData?.name || 'doctor',
                    action: 'VOICE_SCRIBE_APPROVED',
                    targetModel: 'VoiceScribe',
                    targetId: scribe._id,
                    targetLabel: `Voice Scribe for Appointment ${scribe.appointmentId}`,
                    ip: req.ip,
                    userAgent: req.headers['user-agent'] || '',
                    success: true
                });
            } catch (auditErr) {
                // Non-blocking — don't fail the request if audit fails
                console.warn('[Voice Scribe] Audit log warning:', auditErr.message);
            }

            res.json({
                success: true,
                message: 'Voice Scribe approved and saved to clinical record.',
                data: scribe
            });
        } catch (err) {
            console.error('[Voice Scribe] Approve error:', err.message);
            res.status(500).json({ success: false, message: 'Failed to approve voice scribe.' });
        }
    }
);

// ── PUT /api/voice-scribe/:id/discard ──────────────────────────────────────────
// Doctor discards the AI-generated note
router.put('/:id/discard',
    requirePermission('visit_diagnose', 'doctor_dashboard', 'admin_manage_roles', 'admin_view_stats', 'emr_access', 'reception_access'),
    async (req, res) => {
        try {
            const hospitalId = req.user.hospitalId;

            const scribe = await VoiceScribe.findOneAndUpdate(
                { _id: req.params.id, hospitalId, status: { $in: ['DRAFT', 'REVIEWED'] } },
                { status: 'DISCARDED', discardedAt: new Date() },
                { new: true }
            );

            if (!scribe) {
                return res.status(404).json({ success: false, message: 'Draft not found or already finalized.' });
            }

            // Audit
            try {
                const AuditLog = require('../models/auditLog.model');
                await AuditLog.create({
                    clinicId: hospitalId,
                    userId: req.user._id || req.user.userId,
                    userName: req.user.name || 'Doctor',
                    role: req.user._roleData?.name || 'doctor',
                    action: 'VOICE_SCRIBE_DISCARDED',
                    targetModel: 'VoiceScribe',
                    targetId: scribe._id,
                    targetLabel: `Voice Scribe for Appointment ${scribe.appointmentId}`,
                    ip: req.ip,
                    userAgent: req.headers['user-agent'] || '',
                    success: true
                });
            } catch (auditErr) {
                console.warn('[Voice Scribe] Audit log warning:', auditErr.message);
            }

            res.json({ success: true, message: 'Voice Scribe draft discarded.', data: scribe });
        } catch (err) {
            console.error('[Voice Scribe] Discard error:', err.message);
            res.status(500).json({ success: false, message: 'Failed to discard.' });
        }
    }
);

// ── GET /api/voice-scribe/appointment/:appointmentId ───────────────────────────
// Get the voice scribe session for a specific appointment
router.get('/appointment/:appointmentId',
    requirePermission('visit_diagnose', 'doctor_dashboard', 'admin_manage_roles', 'admin_view_stats', 'emr_access', 'reception_access'),
    async (req, res) => {
        try {
            const hospitalId = req.user.hospitalId;

            const scribe = await VoiceScribe.findOne({
                appointmentId: req.params.appointmentId,
                hospitalId
            }).sort({ createdAt: -1 }).lean();

            res.json({
                success: true,
                data: scribe || null
            });
        } catch (err) {
            console.error('[Voice Scribe] Get error:', err.message);
            res.status(500).json({ success: false, message: 'Failed to fetch voice scribe data.' });
        }
    }
);


/**
 * Build a readable clinical notes string from the scribe data for merging into appointment.
 */
function _buildClinicalNotesText(scribe) {
    const parts = [];
    const cs = scribe.clinicalSummary || {};
    const soap = scribe.soap || {};

    if (cs.chiefComplaint?.length) parts.push(`Chief Complaint: ${cs.chiefComplaint.join(', ')}`);
    if (cs.historyOfPresentIllness) parts.push(`HPI: ${cs.historyOfPresentIllness}`);
    if (cs.symptoms?.length) parts.push(`Symptoms: ${cs.symptoms.join(', ')}`);
    if (cs.duration?.length) parts.push(`Duration: ${cs.duration.join(', ')}`);
    if (cs.associatedSymptoms?.length) parts.push(`Associated: ${cs.associatedSymptoms.join(', ')}`);
    if (cs.relevantHistory?.length) parts.push(`History: ${cs.relevantHistory.join(', ')}`);
    if (cs.medicationsMentioned?.length) parts.push(`Medications: ${cs.medicationsMentioned.join(', ')}`);
    if (cs.allergiesMentioned?.length) parts.push(`Allergies: ${cs.allergiesMentioned.join(', ')}`);
    if (cs.examinationFindings?.length) parts.push(`Examination: ${cs.examinationFindings.join(', ')}`);
    if (cs.vitalsMentioned?.length) parts.push(`Vitals: ${cs.vitalsMentioned.join(', ')}`);
    if (cs.investigationsMentioned?.length) parts.push(`Investigations: ${cs.investigationsMentioned.join(', ')}`);
    if (cs.assessment?.length) parts.push(`Assessment: ${cs.assessment.join(', ')}`);
    if (cs.plan?.length) parts.push(`Plan: ${cs.plan.join(', ')}`);
    if (cs.followUp) parts.push(`Follow-up: ${cs.followUp}`);

    if (soap.subjective || soap.objective || soap.assessment || soap.plan) {
        parts.push('');
        parts.push('SOAP Note:');
        if (soap.subjective) parts.push(`S: ${soap.subjective}`);
        if (soap.objective) parts.push(`O: ${soap.objective}`);
        if (soap.assessment) parts.push(`A: ${soap.assessment}`);
        if (soap.plan) parts.push(`P: ${soap.plan}`);
    }

    return parts.join('\n');
}


module.exports = router;
