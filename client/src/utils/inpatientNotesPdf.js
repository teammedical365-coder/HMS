import jsPDF from 'jspdf';
import {
    COMMON_NABH_LOGO_URL,
    escapeHtml,
    sanitizeImageUrl,
    resolvePatientChartDetails,
    loadImageForPdf,
    drawPatientBannerPdf
} from './tprChartPdf.js';

const formatShortDate = (dtVal) => {
    const d = dtVal ? new Date(dtVal) : new Date();
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatShortTime = (dtVal) => {
    const d = dtVal ? new Date(dtVal) : new Date();
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

/**
 * Build synchronized default form/document state from Patient, Admission, Latest Vitals, and saved ClinicalNote.
 */
export const buildDefaultClinicalNoteState = ({
    patient = {},
    admission = {},
    latestVitals = null,
    clinicalNote = null,
    isBlank = false
} = {}) => {
    if (isBlank) {
        return {
            patientName: '',
            age: '',
            sex: '',
            regdNo: '',
            ipdNo: '',
            noteDate: '',
            noteTime: '',
            ward: '',
            bedNo: '',
            consultantName: '',
            historyAndComplaints: '',
            relevantPhysicalExamination: '',
            historyOfPresentIllness: '',
            pastMedicalSurgicalHistory: '',
            personalSocialHistory: '',
            anyDrugAllergy: '',
            generalExamination: { bp: '', temp: '', pallor: '', pulse: '', spo2: '', pain: '' },
            systemicExamination: '',
            provisionalDiagnosis: '',
            investigations: '',
            dischargeAndFollowUp: '',
            footer: { consultantName: '', signature: '', signDate: '', signTime: '' },
            continuationPages: [],
            handwritingStrokes: { page1: [], page2: [] },
            aiScribeSessions: []
        };
    }

    const ptDetails = resolvePatientChartDetails({ patient, admission });
    const pt = patient || (typeof admission?.patientId === 'object' ? admission.patientId : {}) || {};
    const docObj = (admission && typeof admission.doctorId === 'object' ? admission.doctorId : null) || {};
    const apptObj = (admission && typeof admission.appointmentId === 'object' ? admission.appointmentId : null) || {};
    const admittedByObj = (admission && typeof admission.admittedBy === 'object' ? admission.admittedBy : null) || {};

    let candidate =
        docObj.name ||
        admission?.consultant ||
        admission?.attendingDoctor ||
        apptObj.doctorName ||
        (typeof admission?.doctorName === 'string' ? admission.doctorName : '') ||
        (admittedByObj.name && /doctor/i.test(admittedByObj.role) ? admittedByObj.name : '') ||
        '';
    if (/nurse/i.test(candidate)) {
        candidate = '';
    }
    const resolvedConsultant = candidate
        ? (/^dr\.?\s*/i.test(candidate) ? candidate : `Dr. ${candidate}`)
        : '';

    const vit = latestVitals || {};
    const bpDefault = vit.systolicBP ? `${vit.systolicBP}/${vit.diastolicBP || ''}` : '';
    const tempDefault = vit.temperature ? `${vit.temperature}°F` : '';
    const pulseDefault = vit.pulse ? `${vit.pulse} bpm` : '';
    const spo2Default = vit.spo2 ? `${vit.spo2}%` : '';
    const painDefault = vit.painScore !== undefined && vit.painScore !== null ? `${vit.painScore}/10` : '';

    const saved = clinicalNote || {};
    const savedGen = saved.generalExamination || {};
    const savedFoot = saved.footer || {};

    return {
        patientName: saved.patientName || (ptDetails.name !== '—' ? ptDetails.name : ''),
        age: saved.age || (ptDetails.age !== '—' ? ptDetails.age : ''),
        sex: saved.sex || (ptDetails.gender !== '—' ? ptDetails.gender : (pt.gender || '')),
        regdNo: saved.regdNo || (ptDetails.uhid !== '—' ? ptDetails.uhid : ''),
        ipdNo: saved.ipdNo || (ptDetails.ipdNumber !== '—' ? ptDetails.ipdNumber : ''),
        noteDate: saved.noteDate || (admission?.admissionDate ? formatShortDate(admission.admissionDate) : formatShortDate()),
        noteTime: saved.noteTime || admission?.admissionTime || formatShortTime(admission?.createdAt),
        ward: saved.ward || admission?.ward || '',
        bedNo: saved.bedNo || admission?.bedNumber || admission?.bedId?.bedNumber || '',
        consultantName: saved.consultantName || resolvedConsultant,

        historyAndComplaints: saved.historyAndComplaints || admission?.reasonForAdmission || '',
        relevantPhysicalExamination: saved.relevantPhysicalExamination || '',
        historyOfPresentIllness: saved.historyOfPresentIllness || '',
        pastMedicalSurgicalHistory: saved.pastMedicalSurgicalHistory || '',
        personalSocialHistory: saved.personalSocialHistory || '',
        anyDrugAllergy: saved.anyDrugAllergy || '',

        generalExamination: {
            bp: savedGen.bp ?? bpDefault,
            temp: savedGen.temp ?? tempDefault,
            pallor: savedGen.pallor ?? '',
            pulse: savedGen.pulse ?? pulseDefault,
            spo2: savedGen.spo2 ?? spo2Default,
            pain: savedGen.pain ?? painDefault
        },
        systemicExamination: saved.systemicExamination || '',
        provisionalDiagnosis: saved.provisionalDiagnosis || admission?.diagnosis || '',
        investigations: saved.investigations || '',
        dischargeAndFollowUp: saved.dischargeAndFollowUp || '',

        footer: {
            consultantName: savedFoot.consultantName || saved.consultantName || resolvedConsultant,
            signature: savedFoot.signature || '',
            signDate: savedFoot.signDate || '',
            signTime: savedFoot.signTime || ''
        },
        continuationPages: Array.isArray(saved.continuationPages) ? saved.continuationPages : [],
        handwritingStrokes: saved.handwritingStrokes || { page1: [], page2: [] },
        aiScribeSessions: Array.isArray(saved.aiScribeSessions) ? saved.aiScribeSessions : []
    };
};

/**
 * Helper to draw ruled horizontal lines + wrapped clinical text onto a boxed section in jsPDF
 */
const drawRuledTextSection = ({ doc, x, y, width, title, text = '', lineCount = 5, lineHeightMm = 6.8 }) => {
    const headerHeight = 6.2;

    // Grey section title bar
    doc.setFillColor(214, 217, 222);
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.32);
    doc.rect(x, y, width, headerHeight, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(title, x + 2.2, y + 4.3);

    const bodyTop = y + headerHeight;
    const totalBodyH = lineCount * lineHeightMm;

    // Draw individual ruled line bands
    doc.setDrawColor(55, 65, 81);
    doc.setLineWidth(0.22);
    for (let i = 1; i <= lineCount; i++) {
        const lineY = bodyTop + i * lineHeightMm;
        doc.line(x, lineY, x + width, lineY);
    }

    // Wrap and render actual entered text across the ruled lines
    if (text && String(text).trim()) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        const lines = doc.splitTextToSize(String(text).trim(), width - 5);
        const textOffset = Math.min(lineHeightMm - 1.8, 5.2);
        lines.slice(0, lineCount).forEach((ln, idx) => {
            doc.text(ln, x + 2.4, bodyTop + idx * lineHeightMm + textOffset);
        });
    }

    return bodyTop + totalBodyH;
};

/**
 * Generate and download exact two-page A4 IN PATIENT CLINICAL NOTES PDF
 */
export const downloadInpatientClinicalNotesPdf = async ({
    hospital = {},
    patient = {},
    admission = {},
    latestVitals = null,
    clinicalNote = null,
    isBlank = false
}) => {
    const JsPDFCtor = typeof jsPDF === 'function' ? jsPDF : jsPDF?.jsPDF;
    const doc = new JsPDFCtor({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = 210;
    const boxLeft = 10;
    const boxRight = pageWidth - 10;
    const boxWidth = boxRight - boxLeft; // 190mm
    const boxTopY = 16.5;
    const boxBottomY = 285.5;

    const ptDetails = resolvePatientChartDetails({ patient, admission, isBlank });
    const data = buildDefaultClinicalNoteState({ patient, admission, latestVitals, clinicalNote, isBlank });

    const hospitalName = hospital.name || hospital.appName || 'Hospital';
    const hospitalLogo = sanitizeImageUrl(hospital.logoUrl || hospital.logo || '');
    const accreditation = hospital.accreditation || {};
    const isAccredited = accreditation.enabled === true;
    const rawCert = isAccredited && accreditation.certNo ? String(accreditation.certNo).trim() : '';
    const certNumber = rawCert
        ? (/^cert\.?\s*no/i.test(rawCert) ? rawCert : `Cert. No. : ${rawCert}`)
        : '';
    const accreditationLogo = isAccredited ? COMMON_NABH_LOGO_URL : '';

    const [hospImg, accredImg] = await Promise.all([
        hospitalLogo ? loadImageForPdf(hospitalLogo) : Promise.resolve(null),
        isAccredited && accreditationLogo ? loadImageForPdf(accreditationLogo) : Promise.resolve(null)
    ]);

    const drawTopBluePatientBanner = () => {
        drawPatientBannerPdf(doc, ptDetails, {
            x: boxLeft + 2,
            y: 10.5,
            maxWidth: boxWidth - 4
        });
    };

    const drawOuterFrame = () => {
        doc.setDrawColor(17, 24, 39);
        doc.setLineWidth(0.55);
        doc.rect(boxLeft, boxTopY, boxWidth, boxBottomY - boxTopY);
    };

    // ==================== PAGE 1 ====================
    drawTopBluePatientBanner();
    drawOuterFrame();

    // Letterhead inside top of frame (16.5mm -> 42.5mm)
    const headerDividerY = 42.5;
    if (isAccredited) {
        if (accredImg) {
            try {
                const aspect = accredImg.naturalWidth && accredImg.naturalHeight
                    ? accredImg.naturalWidth / accredImg.naturalHeight
                    : 1.25;
                const hMm = 15.5;
                const wMm = Math.min(24, hMm * aspect);
                doc.addImage(accredImg.dataUrl || accredImg, 'PNG', boxLeft + 7, 19.5, wMm, hMm);
                if (certNumber) {
                    doc.setTextColor(185, 28, 28);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(6.2);
                    doc.text(certNumber, boxLeft + 7 + wMm / 2, 38.2, { align: 'center' });
                }
            } catch (_) {}
        } else if (certNumber) {
            doc.setTextColor(185, 28, 28);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.text(certNumber, boxLeft + 7, 28);
        }
    }

    // Right hospital logo ONLY (fallback to hospital name ONLY when logo missing)
    const rightLogoEdge = boxRight - 8;
    let hospLogoRendered = false;
    if (hospImg) {
        try {
            const maxH = 17.5;
            const maxW = 86;
            const aspect = hospImg.naturalWidth && hospImg.naturalHeight
                ? hospImg.naturalWidth / hospImg.naturalHeight
                : 2.2;
            let drawH = maxH;
            let drawW = drawH * aspect;
            if (drawW > maxW) {
                drawW = maxW;
                drawH = drawW / aspect;
            }
            doc.addImage(hospImg.dataUrl || hospImg, 'PNG', rightLogoEdge - drawW, 19 + (maxH - drawH) / 2, drawW, drawH);
            hospLogoRendered = true;
        } catch (_) {}
    }
    if (!hospLogoRendered) {
        doc.setFont('times', 'bold');
        doc.setFontSize(19);
        doc.setTextColor(15, 23, 42);
        doc.text(hospitalName, rightLogoEdge, 29.5, { align: 'right', maxWidth: 96 });
    }

    // Horizontal line separating letterhead
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.32);
    doc.line(boxLeft, headerDividerY, boxRight, headerDividerY);

    // Centered Underlined Title: "IN PATIENT CLINICAL NOTES"
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    const titleStr = 'IN PATIENT CLINICAL NOTES';
    doc.text(titleStr, pageWidth / 2, 49.5, { align: 'center' });
    const titleW = doc.getTextWidth(titleStr);
    doc.setLineWidth(0.35);
    doc.line(pageWidth / 2 - titleW / 2, 50.4, pageWidth / 2 + titleW / 2, 50.4);

    // Three Demographic Dotted Field Lines (56.5 -> 77)
    const drawInlineField = (label, value, xStart, xEnd, baselineY) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.6);
        doc.setTextColor(17, 24, 39);
        doc.text(label, xStart, baselineY);
        const labelW = doc.getTextWidth(label);
        const lineStart = xStart + labelW + 1.5;
        doc.setLineDashPattern([0.5, 0.9], 0);
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.25);
        doc.line(lineStart, baselineY + 0.5, xEnd, baselineY + 0.5);
        doc.setLineDashPattern([], 0);
        if (value && String(value).trim()) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.4);
            doc.text(String(value).trim(), lineStart + 1, baselineY - 0.3, { maxWidth: Math.max(10, xEnd - lineStart - 2) });
        }
    };

    const pad = 2.5;
    // Row 1: Patient's Name | Age | Sex
    drawInlineField("Patient's Name", data.patientName, boxLeft + pad, boxLeft + 128, 57.5);
    drawInlineField('Age', data.age, boxLeft + 129, boxLeft + 165, 57.5);
    drawInlineField('Sex', data.sex, boxLeft + 166, boxRight - pad, 57.5);

    // Row 2: Regd. No. | IPD No. | Date | Time
    drawInlineField('Regd. No.', data.regdNo, boxLeft + pad, boxLeft + 62, 65);
    drawInlineField('IPD No.', data.ipdNo, boxLeft + 63, boxLeft + 118, 65);
    drawInlineField('Date', data.noteDate, boxLeft + 119, boxLeft + 155, 65);
    drawInlineField('Time', data.noteTime, boxLeft + 156, boxRight - pad, 65);

    // Row 3: Ward | Bed No. | Consultant
    drawInlineField('Ward', data.ward, boxLeft + pad, boxLeft + 56, 72.5);
    drawInlineField('Bed No.', data.bedNo, boxLeft + 57, boxLeft + 116, 72.5);
    drawInlineField('Consultant', data.consultantName, boxLeft + 117, boxRight - pad, 72.5);

    let cursorY = 76.5;
    cursorY = drawRuledTextSection({
        doc,
        x: boxLeft,
        y: cursorY,
        width: boxWidth,
        title: 'History & Complaints',
        text: data.historyAndComplaints,
        lineCount: 7,
        lineHeightMm: 7.4
    });

    cursorY = drawRuledTextSection({
        doc,
        x: boxLeft,
        y: cursorY,
        width: boxWidth,
        title: 'Relevant Physical Examination',
        text: data.relevantPhysicalExamination,
        lineCount: 7,
        lineHeightMm: 7.4
    });

    cursorY = drawRuledTextSection({
        doc,
        x: boxLeft,
        y: cursorY,
        width: boxWidth,
        title: 'History Of Present Illness',
        text: data.historyOfPresentIllness,
        lineCount: 4,
        lineHeightMm: 7.4
    });

    cursorY = drawRuledTextSection({
        doc,
        x: boxLeft,
        y: cursorY,
        width: boxWidth,
        title: 'Past Medical History / Surgical History',
        text: data.pastMedicalSurgicalHistory,
        lineCount: 3,
        lineHeightMm: 7.4
    });

    // Bottom 2-column split row: PERSONAL / SOCIAL HISTORY (~68%) | ANY DRUG ALLERGY (~32%)
    const leftSplitW = 128;
    const rightSplitW = boxWidth - leftSplitW;
    const remainingH = boxBottomY - cursorY;
    const splitHeaderH = 6.2;
    const splitLineH = Math.max(5.5, (remainingH - splitHeaderH) / 2);

    drawRuledTextSection({
        doc,
        x: boxLeft,
        y: cursorY,
        width: leftSplitW,
        title: 'PERSONAL / SOCIAL HISTORY',
        text: data.personalSocialHistory,
        lineCount: 2,
        lineHeightMm: splitLineH
    });

    drawRuledTextSection({
        doc,
        x: boxLeft + leftSplitW,
        y: cursorY,
        width: rightSplitW,
        title: 'ANY DRUG ALLERGY',
        text: data.anyDrugAllergy,
        lineCount: 2,
        lineHeightMm: splitLineH
    });

    // Helper to draw vector pen strokes from tablet canvas onto jsPDF
    const drawVectorStrokes = (strokes) => {
        if (!Array.isArray(strokes) || strokes.length === 0) return;
        const screenW = 746;
        const screenH = 1055;
        strokes.forEach((stroke) => {
            if (!stroke.points || stroke.points.length === 0) return;
            const colorHex = stroke.color || '#1d4ed8';
            let r = 29, g = 78, b = 216;
            if (colorHex.startsWith('#') && colorHex.length >= 7) {
                r = parseInt(colorHex.slice(1, 3), 16) || 29;
                g = parseInt(colorHex.slice(3, 5), 16) || 78;
                b = parseInt(colorHex.slice(5, 7), 16) || 216;
            }
            doc.setDrawColor(r, g, b);
            doc.setFillColor(r, g, b);
            doc.setLineWidth(Math.max(0.2, (stroke.width || 2) * 0.15));

            // Support single-point dots in PDF output
            if (stroke.points.length === 1) {
                const pt = stroke.points[0];
                const x = boxLeft + (pt.x / screenW) * boxWidth;
                const y = boxTopY + (pt.y / screenH) * boxHeight;
                const radius = Math.max(0.25, (stroke.width || 2) * 0.12);
                doc.circle(x, y, radius, 'F');
                return;
            }

            for (let i = 1; i < stroke.points.length; i++) {
                const p1 = stroke.points[i - 1];
                const p2 = stroke.points[i];
                const x1 = boxLeft + (p1.x / screenW) * boxWidth;
                const y1 = boxTopY + (p1.y / screenH) * boxHeight;
                const x2 = boxLeft + (p2.x / screenW) * boxWidth;
                const y2 = boxTopY + (p2.y / screenH) * boxHeight;
                doc.line(x1, y1, x2, y2);
            }
        });
    };

    // Render Page 1 vector strokes
    drawVectorStrokes(data.handwritingStrokes?.page1);

    // Outer frame redraw cleanly on Page 1
    drawOuterFrame();

    // ==================== PAGE 2 ====================
    doc.addPage();
    drawTopBluePatientBanner();
    drawOuterFrame();

    let p2Y = boxTopY;
    // GENERAL EXAMINATION header
    doc.setFillColor(214, 217, 222);
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.32);
    doc.rect(boxLeft, p2Y, boxWidth, 6.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('GENERAL EXAMINATION', boxLeft + 2.2, p2Y + 4.3);
    p2Y += 6.2;

    // 2 rows x 3 columns grid: [BP | Temp. | Pallor] / [Pulse | SPO2 | Pain]
    const colW = boxWidth / 3;
    const genRowH = 6.5;
    const genRows = [
        [
            { label: 'BP', val: data.generalExamination?.bp },
            { label: 'Temp.', val: data.generalExamination?.temp },
            { label: 'Pallor', val: data.generalExamination?.pallor }
        ],
        [
            { label: 'Pulse', val: data.generalExamination?.pulse },
            { label: 'SPO2', val: data.generalExamination?.spo2 },
            { label: 'Pain', val: data.generalExamination?.pain }
        ]
    ];

    genRows.forEach((rowCells) => {
        rowCells.forEach((cell, cIdx) => {
            const cX = boxLeft + cIdx * colW;
            doc.setDrawColor(45, 55, 72);
            doc.setLineWidth(0.25);
            doc.rect(cX, p2Y, colW, genRowH);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(17, 24, 39);
            doc.text(cell.label, cX + 2.2, p2Y + 4.4);
            if (cell.val) {
                doc.setFont('helvetica', 'normal');
                doc.text(`:  ${cell.val}`, cX + 16, p2Y + 4.4, { maxWidth: colW - 18 });
            }
        });
        p2Y += genRowH;
    });

    p2Y = drawRuledTextSection({
        doc,
        x: boxLeft,
        y: p2Y,
        width: boxWidth,
        title: 'SYSTEMIC',
        text: data.systemicExamination,
        lineCount: 7,
        lineHeightMm: 6.4
    });

    p2Y = drawRuledTextSection({
        doc,
        x: boxLeft,
        y: p2Y,
        width: boxWidth,
        title: 'PROV. DIAGNOSIS',
        text: data.provisionalDiagnosis,
        lineCount: 3,
        lineHeightMm: 6.4
    });

    p2Y = drawRuledTextSection({
        doc,
        x: boxLeft,
        y: p2Y,
        width: boxWidth,
        title: 'INVESTIGATIONS',
        text: data.investigations,
        lineCount: 8,
        lineHeightMm: 6.4
    });

    p2Y = drawRuledTextSection({
        doc,
        x: boxLeft,
        y: p2Y,
        width: boxWidth,
        title: 'DISCHARGE & FOLLOW UP',
        text: data.dischargeAndFollowUp,
        lineCount: 8,
        lineHeightMm: 6.4
    });

    // Bottom signature footer bar inside Page 2 frame
    const footerY = Math.min(boxBottomY - 4.5, Math.max(p2Y + 9, boxBottomY - 5));
    drawInlineField('Name of Consultant', data.footer?.consultantName, boxLeft + 2.5, boxLeft + 92, footerY);
    drawInlineField('Signature', data.footer?.signature, boxLeft + 94, boxLeft + 140, footerY);
    drawInlineField('Date', data.footer?.signDate, boxLeft + 141.5, boxLeft + 170, footerY);
    drawInlineField('Time', data.footer?.signTime, boxLeft + 171, boxRight - 2.5, footerY);

    drawOuterFrame();
    drawVectorStrokes(data.handwritingStrokes?.page2);

    // ==================== CONTINUATION PAGES (PAGE 3+) ====================
    if (Array.isArray(data.continuationPages) && data.continuationPages.length > 0) {
        data.continuationPages.forEach((cp, cpIdx) => {
            const pageNum = cp.pageNumber || (cpIdx + 3);
            doc.addPage();
            drawTopBluePatientBanner();
            drawOuterFrame();

            let contY = drawHospitalHeader();

            // Continuation Title
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10.5);
            doc.setTextColor(15, 23, 42);
            const titleText = `IN PATIENT CLINICAL NOTES — ${cp.title || 'CONTINUATION SHEET'} (PAGE ${pageNum})`;
            const titleW = doc.getTextWidth(titleText);
            doc.text(titleText, (pageWidth - titleW) / 2, contY + 5.5);
            doc.setDrawColor(15, 23, 42);
            doc.setLineWidth(0.3);
            doc.line((pageWidth - titleW) / 2, contY + 6.5, (pageWidth + titleW) / 2, contY + 6.5);
            contY += 8.5;

            // Demographic meta row
            drawInlineField('Date', data.noteDate, boxLeft + 2, boxLeft + 35, contY);
            drawInlineField('Time', data.noteTime, boxLeft + 37, boxLeft + 70, contY);
            drawInlineField('Ward', data.ward, boxLeft + 72, boxLeft + 105, contY);
            drawInlineField('Bed No.', data.bedNo, boxLeft + 107, boxLeft + 140, contY);
            drawInlineField('Consultant', data.consultantName, boxLeft + 142, boxRight - 2, contY);
            contY += 7.2;

            // 26 ruled observation lines
            contY = drawRuledTextSection({
                doc,
                x: boxLeft,
                y: contY,
                width: boxWidth,
                title: 'CLINICAL OBSERVATIONS & NOTES (CONTINUED)',
                text: cp.notes || '',
                lineCount: 26,
                lineHeightMm: 6.8
            });

            // Footer
            const contFooterY = Math.min(boxBottomY - 4.5, Math.max(contY + 7, boxBottomY - 5));
            drawInlineField('Name of Consultant', data.footer?.consultantName, boxLeft + 2.5, boxLeft + 92, contFooterY);
            drawInlineField('Signature', data.footer?.signature, boxLeft + 94, boxLeft + 140, contFooterY);
            drawInlineField('Date', data.footer?.signDate, boxLeft + 141.5, boxLeft + 170, contFooterY);
            drawInlineField('Time', data.footer?.signTime, boxLeft + 171, boxRight - 2.5, contFooterY);

            drawOuterFrame();
            drawVectorStrokes(data.handwritingStrokes?.[`page${pageNum}`]);
        });
    }

    const cleanName = (isBlank ? 'Blank' : ptDetails.name).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanIpd = (isBlank ? 'Template' : ptDetails.ipdNumber).replace(/[^a-zA-Z0-9_-]/g, '');
    doc.save(`In_Patient_Clinical_Notes_${cleanName}_${cleanIpd}.pdf`);
    return true;
};

/**
 * Render empty or filled ruled writing lines for print HTML output
 */
const buildPrintRuledLinesHtml = (text, count) => {
    const rawLines = (text ? String(text).split(/\r?\n/) : []).filter((l) => l.length > 0);
    // Approximate chars per line on A4 width (~105 chars)
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

    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="ipn-ruled-line">${escapeHtml(wrapped[i] || '')}</div>`;
    }
    return html;
};

/**
 * Open a crisp 2-page print window reproducing IN PATIENT NOTES.pdf
 */
export const printInpatientClinicalNotes = ({
    hospital = {},
    patient = {},
    admission = {},
    latestVitals = null,
    clinicalNote = null,
    isBlank = false
}) => {
    const ptDetails = resolvePatientChartDetails({ patient, admission, isBlank });
    const data = buildDefaultClinicalNoteState({ patient, admission, latestVitals, clinicalNote, isBlank });

    const hospitalName = hospital.name || hospital.appName || 'Hospital';
    const hospitalLogo = sanitizeImageUrl(hospital.logoUrl || hospital.logo || '');
    const accreditation = hospital.accreditation || {};
    const isAccredited = accreditation.enabled === true;
    const rawCert = isAccredited && accreditation.certNo ? String(accreditation.certNo).trim() : '';
    const certNumber = rawCert
        ? (/^cert\.?\s*no/i.test(rawCert) ? rawCert : `Cert. No. : ${rawCert}`)
        : '';
    const accreditationLogo = isAccredited ? COMMON_NABH_LOGO_URL : '';

    const bannerHtml = `
        <div class="ipn-top-banner">
            <span>Patient Name : ${escapeHtml(ptDetails.name)}</span>
            <span class="sep">|</span><span>UHID : ${escapeHtml(ptDetails.uhid)}</span>
            <span class="sep">|</span><span>IPD : ${escapeHtml(ptDetails.ipdNumber)}</span>
            <span class="sep">|</span><span>Gender : ${escapeHtml(ptDetails.gender)}</span>
            <span class="sep">|</span><span>Age : ${escapeHtml(ptDetails.age)}</span>
        </div>
    `;

    const printWin = window.open('', '_blank', 'width=960,height=1050');
    if (!printWin) {
        alert('Please allow popups to print the In-Patient Clinical Notes.');
        return false;
    }

    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <title>IN PATIENT CLINICAL NOTES — ${escapeHtml(ptDetails.name)}</title>
            <style>
                @page { size: A4 portrait; margin: 8mm 10mm; }
                * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
                .ipn-print-bar { background: #0d9488; color: #fff; padding: 10px 18px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; }
                .ipn-print-bar button { background: #fff; color: #0f766e; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 700; cursor: pointer; }
                @media print { .ipn-print-bar { display: none !important; } }
                .ipn-page { width: 190mm; margin: 0 auto; padding-top: 2mm; page-break-after: always; }
                .ipn-page:last-child { page-break-after: auto; }
                .ipn-top-banner { display: flex; flex-wrap: wrap; align-items: center; font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #2563eb; margin-bottom: 4mm; padding-left: 2mm; line-height: 1.4; }
                .ipn-top-banner .sep { display: inline-block; margin: 0 9px; color: #64748b; font-weight: 400; }
                .ipn-box { border: 1.5px solid #111827; width: 100%; }
                .ipn-letterhead { display: flex; justify-content: space-between; align-items: center; padding: 3mm 5mm; border-bottom: 1px solid #111827; min-height: 24mm; }
                .ipn-nabh { display: flex; flex-direction: column; align-items: center; }
                .ipn-nabh img { height: 50px; width: auto; object-fit: contain; }
                .ipn-cert { font-size: 8px; font-weight: 700; color: #b91c1c; margin-top: 2px; }
                .ipn-hosp img { height: 54px; max-width: 260px; width: auto; object-fit: contain; }
                .ipn-hosp-name { font-family: 'Times New Roman', Times, serif; font-size: 24px; font-weight: 700; color: #0f172a; }
                .ipn-title { text-align: center; font-size: 13px; font-weight: 700; text-decoration: underline; margin: 3.5mm 0 3mm; letter-spacing: 0.4px; }
                .ipn-meta-rows { padding: 0 3mm 2.5mm; font-size: 11px; }
                .ipn-meta-row { display: flex; gap: 6px; margin-bottom: 3mm; align-items: baseline; }
                .ipn-field { display: flex; align-items: baseline; flex: 1; gap: 4px; min-width: 0; }
                .ipn-field-val { flex: 1; border-bottom: 1px dotted #475569; min-height: 14px; font-weight: 600; font-size: 11px; padding: 0 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .ipn-sec-hdr { background: #d6d9de; border-top: 1px solid #1f2937; border-bottom: 1px solid #1f2937; padding: 3px 8px; font-size: 11px; font-weight: 700; }
                .ipn-ruled-line { border-bottom: 1px solid #374151; height: 6.4mm; padding: 1mm 6px 0; font-size: 11px; white-space: nowrap; overflow: hidden; }
                .ipn-split-row { display: grid; grid-template-columns: 68% 32%; }
                .ipn-split-left { border-right: 1px solid #1f2937; }
                .ipn-gen-grid { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid #1f2937; }
                .ipn-gen-cell { border-right: 1px solid #374151; border-bottom: 1px solid #374151; padding: 3px 6px; font-size: 11px; height: 6.8mm; display: flex; align-items: center; gap: 6px; }
                .ipn-gen-cell:nth-child(3n) { border-right: none; }
                .ipn-gen-cell:nth-child(n+4) { border-bottom: none; }
                .ipn-gen-lbl { font-weight: 700; min-width: 44px; }
                .ipn-footer-sign { display: flex; gap: 8px; padding: 5mm 3mm 2.5mm; font-size: 10.5px; font-weight: 700; align-items: baseline; }
            </style>
        </head>
        <body>
            <div class="ipn-print-bar">
                <span>IN PATIENT CLINICAL NOTES — 2-Page A4 Document</span>
                <button onclick="window.print()">Print / Save PDF</button>
            </div>

            <div class="ipn-page">
                ${bannerHtml}
                <div class="ipn-box">
                    <div class="ipn-letterhead">
                        <div class="ipn-nabh">
                            ${isAccredited ? `
                                ${accreditationLogo ? `<img src="${escapeHtml(accreditationLogo)}" alt="NABH" onerror="this.style.display='none'" />` : ''}
                                ${certNumber ? `<div class="ipn-cert">${escapeHtml(certNumber)}</div>` : ''}
                            ` : ''}
                        </div>
                        <div class="ipn-hosp">
                            ${hospitalLogo
                                ? `<img src="${escapeHtml(hospitalLogo)}" alt="${escapeHtml(hospitalName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><div class="ipn-hosp-name" style="display:none;">${escapeHtml(hospitalName)}</div>`
                                : `<div class="ipn-hosp-name">${escapeHtml(hospitalName)}</div>`
                            }
                        </div>
                    </div>

                    <div class="ipn-title">IN PATIENT CLINICAL NOTES</div>

                    <div class="ipn-meta-rows">
                        <div class="ipn-meta-row">
                            <div class="ipn-field" style="flex:4.2"><span>Patient&apos;s Name</span><span class="ipn-field-val">${escapeHtml(data.patientName)}</span></div>
                            <div class="ipn-field" style="flex:1.1"><span>Age</span><span class="ipn-field-val">${escapeHtml(data.age)}</span></div>
                            <div class="ipn-field" style="flex:0.9"><span>Sex</span><span class="ipn-field-val">${escapeHtml(data.sex)}</span></div>
                        </div>
                        <div class="ipn-meta-row">
                            <div class="ipn-field" style="flex:1.5"><span>Regd. No.</span><span class="ipn-field-val">${escapeHtml(data.regdNo)}</span></div>
                            <div class="ipn-field" style="flex:1.5"><span>IPD No.</span><span class="ipn-field-val">${escapeHtml(data.ipdNo)}</span></div>
                            <div class="ipn-field" style="flex:1.1"><span>Date</span><span class="ipn-field-val">${escapeHtml(data.noteDate)}</span></div>
                            <div class="ipn-field" style="flex:1"><span>Time</span><span class="ipn-field-val">${escapeHtml(data.noteTime)}</span></div>
                        </div>
                        <div class="ipn-meta-row" style="margin-bottom:0;">
                            <div class="ipn-field" style="flex:1.3"><span>Ward</span><span class="ipn-field-val">${escapeHtml(data.ward)}</span></div>
                            <div class="ipn-field" style="flex:1.2"><span>Bed No.</span><span class="ipn-field-val">${escapeHtml(data.bedNo)}</span></div>
                            <div class="ipn-field" style="flex:2"><span>Consultant</span><span class="ipn-field-val">${escapeHtml(data.consultantName)}</span></div>
                        </div>
                    </div>

                    <div class="ipn-sec-hdr">History &amp; Complaints</div>
                    ${buildPrintRuledLinesHtml(data.historyAndComplaints, 7)}

                    <div class="ipn-sec-hdr">Relevant Physical Examination</div>
                    ${buildPrintRuledLinesHtml(data.relevantPhysicalExamination, 7)}

                    <div class="ipn-sec-hdr">History Of Present Illness</div>
                    ${buildPrintRuledLinesHtml(data.historyOfPresentIllness, 4)}

                    <div class="ipn-sec-hdr">Past Medical History / Surgical History</div>
                    ${buildPrintRuledLinesHtml(data.pastMedicalSurgicalHistory, 3)}

                    <div class="ipn-split-row">
                        <div class="ipn-split-left">
                            <div class="ipn-sec-hdr">PERSONAL / SOCIAL HISTORY</div>
                            ${buildPrintRuledLinesHtml(data.personalSocialHistory, 2)}
                        </div>
                        <div>
                            <div class="ipn-sec-hdr">ANY DRUG ALLERGY</div>
                            ${buildPrintRuledLinesHtml(data.anyDrugAllergy, 2)}
                        </div>
                    </div>
                </div>
            </div>

            <div class="ipn-page">
                ${bannerHtml}
                <div class="ipn-box">
                    <div class="ipn-sec-hdr" style="border-top:none;">GENERAL EXAMINATION</div>
                    <div class="ipn-gen-grid">
                        <div class="ipn-gen-cell"><span class="ipn-gen-lbl">BP</span><span>${escapeHtml(data.generalExamination?.bp || '')}</span></div>
                        <div class="ipn-gen-cell"><span class="ipn-gen-lbl">Temp.</span><span>${escapeHtml(data.generalExamination?.temp || '')}</span></div>
                        <div class="ipn-gen-cell"><span class="ipn-gen-lbl">Pallor</span><span>${escapeHtml(data.generalExamination?.pallor || '')}</span></div>
                        <div class="ipn-gen-cell"><span class="ipn-gen-lbl">Pulse</span><span>${escapeHtml(data.generalExamination?.pulse || '')}</span></div>
                        <div class="ipn-gen-cell"><span class="ipn-gen-lbl">SPO2</span><span>${escapeHtml(data.generalExamination?.spo2 || '')}</span></div>
                        <div class="ipn-gen-cell"><span class="ipn-gen-lbl">Pain</span><span>${escapeHtml(data.generalExamination?.pain || '')}</span></div>
                    </div>

                    <div class="ipn-sec-hdr" style="border-top:none;">SYSTEMIC</div>
                    ${buildPrintRuledLinesHtml(data.systemicExamination, 7)}

                    <div class="ipn-sec-hdr">PROV. DIAGNOSIS</div>
                    ${buildPrintRuledLinesHtml(data.provisionalDiagnosis, 3)}

                    <div class="ipn-sec-hdr">INVESTIGATIONS</div>
                    ${buildPrintRuledLinesHtml(data.investigations, 8)}

                    <div class="ipn-sec-hdr">DISCHARGE &amp; FOLLOW UP</div>
                    ${buildPrintRuledLinesHtml(data.dischargeAndFollowUp, 8)}

                    <div class="ipn-footer-sign">
                        <div class="ipn-field" style="flex:2.4"><span>Name of Consultant</span><span class="ipn-field-val">${escapeHtml(data.footer?.consultantName || '')}</span></div>
                        <div class="ipn-field" style="flex:1.4"><span>Signature</span><span class="ipn-field-val">${escapeHtml(data.footer?.signature || '')}</span></div>
                        <div class="ipn-field" style="flex:0.9"><span>Date</span><span class="ipn-field-val">${escapeHtml(data.footer?.signDate || '')}</span></div>
                        <div class="ipn-field" style="flex:0.8"><span>Time</span><span class="ipn-field-val">${escapeHtml(data.footer?.signTime || '')}</span></div>
                    </div>
                </div>
            </div>

            ${(data.continuationPages || []).map((cp, idx) => `
                <div class="ipn-page">
                    ${bannerHtml}
                    <div class="ipn-box">
                        <div class="ipn-letterhead">
                            <div class="ipn-nabh">
                                ${isAccredited ? `
                                    ${accreditationLogo ? `<img src="${escapeHtml(accreditationLogo)}" alt="NABH" onerror="this.style.display='none'" />` : ''}
                                    ${certNumber ? `<div class="ipn-cert">${escapeHtml(certNumber)}</div>` : ''}
                                ` : ''}
                            </div>
                            <div class="ipn-hosp">
                                ${hospitalLogo
                                    ? `<img src="${escapeHtml(hospitalLogo)}" alt="${escapeHtml(hospitalName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><div class="ipn-hosp-name" style="display:none;">${escapeHtml(hospitalName)}</div>`
                                    : `<div class="ipn-hosp-name">${escapeHtml(hospitalName)}</div>`
                                }
                            </div>
                        </div>

                        <div class="ipn-title">IN PATIENT CLINICAL NOTES — ${escapeHtml(cp.title || 'CONTINUATION SHEET')} (PAGE ${cp.pageNumber || idx + 3})</div>

                        <div class="ipn-meta-rows">
                            <div class="ipn-meta-row" style="margin-bottom:0;">
                                <div class="ipn-field" style="flex:1.1"><span>Date</span><span class="ipn-field-val">${escapeHtml(data.noteDate)}</span></div>
                                <div class="ipn-field" style="flex:1"><span>Time</span><span class="ipn-field-val">${escapeHtml(data.noteTime)}</span></div>
                                <div class="ipn-field" style="flex:1.3"><span>Ward</span><span class="ipn-field-val">${escapeHtml(data.ward)}</span></div>
                                <div class="ipn-field" style="flex:1.2"><span>Bed No.</span><span class="ipn-field-val">${escapeHtml(data.bedNo)}</span></div>
                                <div class="ipn-field" style="flex:2"><span>Consultant</span><span class="ipn-field-val">${escapeHtml(data.consultantName)}</span></div>
                            </div>
                        </div>

                        <div class="ipn-sec-hdr">CLINICAL OBSERVATIONS &amp; NOTES (CONTINUED)</div>
                        ${buildPrintRuledLinesHtml(cp.notes || '', 26)}

                        <div class="ipn-footer-sign">
                            <div class="ipn-field" style="flex:2.4"><span>Name of Consultant</span><span class="ipn-field-val">${escapeHtml(data.footer?.consultantName || '')}</span></div>
                            <div class="ipn-field" style="flex:1.4"><span>Signature</span><span class="ipn-field-val">${escapeHtml(data.footer?.signature || '')}</span></div>
                            <div class="ipn-field" style="flex:0.9"><span>Date</span><span class="ipn-field-val">${escapeHtml(data.footer?.signDate || '')}</span></div>
                            <div class="ipn-field" style="flex:0.8"><span>Time</span><span class="ipn-field-val">${escapeHtml(data.footer?.signTime || '')}</span></div>
                        </div>
                    </div>
                </div>
            `).join('')}

            <script>
                window.onload = function() {
                    setTimeout(function() { window.print(); }, 250);
                };
            </script>
        </body>
        </html>
    `;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    return true;
};
