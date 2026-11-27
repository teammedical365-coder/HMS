import { PROGRESS_ROWS_PER_PAGE, paginateProgressNotes } from './progressNotesPdf.js';

const formatShortDate = (dtVal) => {
    const d = dtVal ? new Date(dtVal) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatShortTime = (dtVal) => {
    const d = dtVal ? new Date(dtVal) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

/**
 * Format patient's actual latest recorded IPDVitals without inventing missing values.
 * Any vital not recorded in the database is represented as '—'.
 */
export function formatRecordedVitalsSnapshot(latestVitals = null) {
    const v = latestVitals && typeof latestVitals === 'object' ? latestVitals : null;

    const hasVal = (val) => val !== undefined && val !== null && String(val).trim() !== '';

    const bp = v && hasVal(v.systolicBP)
        ? `${v.systolicBP}${hasVal(v.diastolicBP) ? `/${v.diastolicBP}` : ''} mmHg`
        : '—';
    const pulse = v && hasVal(v.pulse) ? `${v.pulse} bpm` : '—';
    const temp = v && hasVal(v.temperature) ? `${v.temperature}°F` : '—';
    const spo2 = v && hasVal(v.spo2) ? `${v.spo2}%` : '—';
    const rr = v && hasVal(v.respiratoryRate) ? `${v.respiratoryRate}/min` : '—';
    const pain = v && hasVal(v.painScore) ? `${v.painScore}/10` : '—';

    const rawRecordedAt = v ? (v.recordedAt || v.createdAt || null) : null;
    const recDate = rawRecordedAt ? formatShortDate(rawRecordedAt) : '';
    const recTime = rawRecordedAt ? formatShortTime(rawRecordedAt) : '';
    const recordedAtDisplay = [recDate, recTime].filter(Boolean).join(', ');

    const hasAnyVital = [bp, pulse, temp, spo2, rr, pain].some((item) => item !== '—');

    const summaryLine = hasAnyVital
        ? `Vitals${recordedAtDisplay ? ` (Recorded ${recordedAtDisplay})` : ''}: BP: ${bp} | Pulse: ${pulse} | Temp: ${temp} | SpO2: ${spo2} | RR: ${rr} | Pain: ${pain}`
        : 'Vitals (Not Recorded): BP: — | Pulse: — | Temp: — | SpO2: — | RR: — | Pain: —';

    return {
        bp,
        pulse,
        temp,
        spo2,
        rr,
        pain,
        recordedAt: rawRecordedAt ? new Date(rawRecordedAt).toISOString() : '',
        recordedAtDisplay,
        hasAnyVital,
        summaryLine
    };
}

/**
 * Compute deterministic idempotency signature for an AI Voice Scribe approval payload
 * so accidental double-clicks never create duplicate clinical sheets.
 */
export function computeAiSummarySignature({ sections = {}, session = {} } = {}) {
    if (session?.sessionId) {
        return `sid:${session.sessionId}`;
    }
    const normSections = JSON.stringify(sections || {});
    const normTranscript = String(session?.rawTranscript || '').trim();
    const recIso = session?.recordedAt ? String(session.recordedAt) : '';
    return `sig:${recIso}::${normTranscript}::${normSections}`;
}

/**
 * Format approved AI clinical sections into clean medical documentation text.
 * Optionally includes the recorded vitals header line (used on Progress Notes ruled sheets).
 */
export function formatAiSummarySheetText({
    sections = {},
    latestVitals = null,
    entryDateTime = new Date(),
    includeVitalsLine = true
} = {}) {
    const lines = [];
    const dtLabel = [formatShortDate(entryDateTime), formatShortTime(entryDateTime)].filter(Boolean).join(' ');
    lines.push(`[AI Voice Scribe Clinical Summary${dtLabel ? ` — ${dtLabel}` : ''}]`);

    if (includeVitalsLine) {
        const vitSnap = formatRecordedVitalsSnapshot(latestVitals);
        lines.push(vitSnap.summaryLine);
    }

    // If clinician also approved dictated exam vitals from speech, append without overwriting recorded vitals
    if (sections.generalExamination && typeof sections.generalExamination === 'object') {
        const spokenParts = Object.entries(sections.generalExamination)
            .filter(([, val]) => val && String(val).trim())
            .map(([k, val]) => `${k.toUpperCase()}: ${String(val).trim()}`);
        if (spokenParts.length > 0) {
            lines.push(`Dictated Exam Findings: ${spokenParts.join(' | ')}`);
        }
    }

    const orderedFields = [
        ['historyAndComplaints', 'History & Chief Complaints'],
        ['historyOfPresentIllness', 'History of Present Illness'],
        ['pastMedicalSurgicalHistory', 'Past Medical / Surgical History'],
        ['relevantPhysicalExamination', 'Physical Examination'],
        ['systemicExamination', 'Systemic Examination'],
        ['provisionalDiagnosis', 'Provisional Diagnosis / Impression'],
        ['investigations', 'Investigations Advised'],
        ['dischargeAndFollowUp', 'Treatment Plan & Follow-Up']
    ];

    orderedFields.forEach(([key, label]) => {
        const raw = sections[key];
        if (typeof raw === 'string' && raw.trim()) {
            lines.push(`${label}: ${raw.trim()}`);
        }
    });

    return lines.join('\n');
}

/**
 * Compute the next sequential Sheet Number for Progress Notes so AI summaries
 * NEVER overwrite or merge into existing clinical notes or handwritten sheets.
 */
export function computeNextProgressSheetNumber(progressNotes = [], handwritingStrokes = {}) {
    const validNotes = (Array.isArray(progressNotes) ? progressNotes : []).filter(
        (n) => n && n.note && String(n.note).trim().length > 0
    );

    let maxStrokePage = 0;
    if (handwritingStrokes && typeof handwritingStrokes === 'object') {
        Object.entries(handwritingStrokes).forEach(([key, arr]) => {
            const m = /^pn_page_(\d+)$/.exec(key);
            if (m && Array.isArray(arr) && arr.length > 0) {
                maxStrokePage = Math.max(maxStrokePage, Number(m[1]) + 1);
            }
        });
    }

    if (validNotes.length === 0 && maxStrokePage === 0) {
        return 1;
    }

    const paginated = paginateProgressNotes(validNotes, PROGRESS_ROWS_PER_PAGE, 0);
    const maxNoteSheet = validNotes.reduce((acc, n) => {
        const s = parseInt(n.sheetNo, 10) || 1;
        return Math.max(acc, s);
    }, 1);

    const occupiedCount = Math.max(paginated.length, maxNoteSheet, maxStrokePage);
    return occupiedCount + 1;
}

/**
 * Append an approved AI Voice Scribe summary as a NEW sequential clinical sheet
 * in InpatientClinicalNotesModal state without modifying Page 1, Page 2, or prior sheets.
 */
export function appendAiSummaryToInpatientNoteState(prevState, {
    sections = {},
    session = {},
    latestVitals = null,
    doctorName = '',
    entryDateTime = new Date()
} = {}) {
    const prev = prevState || {};
    const existingCont = Array.isArray(prev.continuationPages) ? prev.continuationPages : [];
    const nextPageNumber = existingCont.length + 3;
    const nextSheetNumber = existingCont.length + 2; // Sheet #1 is initial 2-page assessment; sequential sheets start at #2

    const vitalsSnapshot = formatRecordedVitalsSnapshot(latestVitals);
    const signature = computeAiSummarySignature({ sections, session });

    const noteBody = formatAiSummarySheetText({
        sections,
        latestVitals,
        entryDateTime,
        includeVitalsLine: false
    });

    const newSheet = {
        pageNumber: nextPageNumber,
        sheetNumber: nextSheetNumber,
        title: `CLINICAL SUMMARY SHEET #${nextSheetNumber}`,
        noteDate: formatShortDate(entryDateTime),
        noteTime: formatShortTime(entryDateTime),
        consultantName: doctorName || prev.consultantName || prev.footer?.consultantName || '',
        vitalsSnapshot,
        isAiSummarySheet: true,
        sessionSignature: signature,
        notes: noteBody,
        createdAt: entryDateTime instanceof Date ? entryDateTime.toISOString() : new Date().toISOString()
    };

    const nextAiSessions = [
        ...(Array.isArray(prev.aiScribeSessions) ? prev.aiScribeSessions : []),
        {
            recordedAt: session?.recordedAt || entryDateTime,
            durationSeconds: Number(session?.durationSeconds) || 0,
            rawTranscript: String(session?.rawTranscript || ''),
            approvedSections: sections,
            sheetNumber: nextSheetNumber,
            pageNumber: nextPageNumber,
            sessionSignature: signature
        }
    ];

    return {
        nextState: {
            ...prev,
            continuationPages: [...existingCont, newSheet],
            aiScribeSessions: nextAiSessions
        },
        createdSheet: newSheet
    };
}
