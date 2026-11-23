import jsPDF from 'jspdf';
import {
    COMMON_NABH_LOGO_URL,
    escapeHtml,
    sanitizeImageUrl,
    resolvePatientChartDetails,
    loadImageForPdf,
    drawPatientBannerPdf
} from './tprChartPdf.js';

export const PROGRESS_ROWS_PER_PAGE = 32;

const formatShortDate = (dtVal) => {
    if (!dtVal) return '';
    const d = new Date(dtVal);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatShortTime = (dtVal) => {
    if (!dtVal) return '';
    const d = new Date(dtVal);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

/**
 * Build Patient Info Box fields matching the original PROGRESS NOTES.pdf right-hand box.
 */
export const buildProgressNotesHeaderData = ({
    patient = {},
    admission = {},
    isBlank = false
} = {}) => {
    if (isBlank) {
        return {
            name: '',
            age: '',
            sex: '',
            doa: '',
            regdNo: '',
            ipdNo: '',
            wardBed: '',
            consultant: ''
        };
    }

    const ptDetails = resolvePatientChartDetails({ patient, admission });
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
    const consultant = candidate
        ? (/^dr\.?\s*/i.test(candidate) ? candidate : `Dr. ${candidate}`)
        : '';

    const ward = admission?.ward || '';
    const bed = admission?.bedNumber || admission?.bedId?.bedNumber || '';
    const wardBed = [ward, bed ? `Bed ${bed}` : ''].filter(Boolean).join(' / ');

    return {
        name: ptDetails.name !== '—' ? ptDetails.name : '',
        age: ptDetails.age !== '—' ? ptDetails.age : '',
        sex: ptDetails.gender !== '—' ? ptDetails.gender : '',
        doa: admission?.admissionDate ? formatShortDate(admission.admissionDate) : '',
        regdNo: ptDetails.uhid !== '—' ? ptDetails.uhid : '',
        ipdNo: ptDetails.ipdNumber !== '—' ? ptDetails.ipdNumber : '',
        wardBed,
        consultant
    };
};

/**
 * Convert chronological progress notes into paginated sheets of ruled lines (32 rows/page).
 * Preserves wrapped lines cleanly without clipping and flows long notes onto Continuation Sheets.
 */
export const paginateProgressNotes = (notes = [], rowsPerPage = PROGRESS_ROWS_PER_PAGE, manualExtraSheets = 0) => {
    const pages = [];
    let currentRows = [];

    const pushCurrentPage = () => {
        pages.push({
            sheetNo: String(pages.length + 1),
            rows: [
                ...currentRows,
                ...Array.from({ length: Math.max(0, rowsPerPage - currentRows.length) }, () => ({
                    dateTimeText: '',
                    noteText: '',
                    isMeta: false,
                    noteId: null
                }))
            ]
        });
        currentRows = [];
    };

    const sortedNotes = [...(Array.isArray(notes) ? notes : [])].sort(
        (a, b) => new Date(a.recordedAt || a.createdAt || 0) - new Date(b.recordedAt || b.createdAt || 0)
    );

    const wrapParagraph = (text, maxChars = 94) => {
        const result = [];
        const paras = String(text ?? '').split(/\r?\n/);
        for (let pIdx = 0; pIdx < paras.length; pIdx++) {
            let rest = paras[pIdx];
            if (!rest) {
                result.push('');
                continue;
            }
            while (rest.length > maxChars) {
                let cut = rest.lastIndexOf(' ', maxChars);
                if (cut < Math.floor(maxChars * 0.45)) cut = maxChars;
                result.push(rest.slice(0, cut));
                rest = rest.slice(cut);
                if (rest.startsWith(' ')) {
                    rest = rest.slice(1);
                }
            }
            result.push(rest);
        }
        return result.length > 0 ? result : [''];
    };

    sortedNotes.forEach((entry) => {
        // Skip empty placeholder notes that have no actual content and are not active drafts
        if ((!entry.note || !String(entry.note).trim()) && !entry.isNew) {
            return;
        }

        const dt = entry.recordedAt || entry.createdAt;
        const dateStr = formatShortDate(dt);
        const timeStr = formatShortTime(dt);

        const wrappedLines = wrapParagraph(entry.note || '');
        const hasEdits = Array.isArray(entry.editHistory) && entry.editHistory.length > 0;
        const isNurseAuthor = /nurse/i.test(entry.authorRole || '');
        const isAssistantAuthor = /assistant/i.test(entry.authorRole || '');
        const isDoctorAuthor = !isAssistantAuthor && /doctor|physician|surgeon|consultant|resident/i.test(entry.authorRole || '');

        let cleanAuthorName = entry.authorName || 'Clinical Staff';
        if (isDoctorAuthor) {
            cleanAuthorName = /^dr\.?\s*/i.test(cleanAuthorName) ? cleanAuthorName : `Dr. ${cleanAuthorName}`;
        } else if (isNurseAuthor || isAssistantAuthor) {
            cleanAuthorName = cleanAuthorName.replace(/^dr\.?\s*/i, '');
        }

        const isUpdatedByAssistant = /assistant/i.test(entry.updatedByRole || '');
        const isUpdatedByDoctor = !isUpdatedByAssistant && /doctor|physician|surgeon|consultant|resident/i.test(entry.updatedByRole || '');
        let cleanUpdatedByName = entry.updatedByName || 'Staff';
        if (isUpdatedByDoctor) {
            cleanUpdatedByName = /^dr\.?\s*/i.test(cleanUpdatedByName) ? cleanUpdatedByName : `Dr. ${cleanUpdatedByName}`;
        } else if (/nurse/i.test(entry.updatedByRole || '') || isUpdatedByAssistant) {
            cleanUpdatedByName = cleanUpdatedByName.replace(/^dr\.?\s*/i, '');
        }

        const metaLine = hasEdits
            ? `— Logged by ${cleanAuthorName} (${entry.authorRole || 'Clinician'}) • Edited ${entry.editHistory.length}x, last by ${cleanUpdatedByName}`
            : `— ${cleanAuthorName}${entry.authorRole ? ` (${entry.authorRole})` : ''}`;

        const entryRows = [];

        // All text lines belong to this single note entry
        for (let i = 0; i < wrappedLines.length; i++) {
            let dtCell = '';
            if (i === 0) dtCell = dateStr;
            else if (i === 1 && timeStr) dtCell = timeStr;

            entryRows.push({
                dateTimeText: dtCell,
                noteText: wrappedLines[i],
                isMeta: false,
                noteId: entry._id || null,
                lineIdx: i,
                totalLines: wrappedLines.length,
                isSigRow: false
            });
        }

        // Author attribution row AFTER the complete multi-line note
        entryRows.push({
            dateTimeText: '',
            noteText: metaLine,
            isMeta: true,
            noteId: entry._id || null,
            lineIdx: wrappedLines.length,
            isSigRow: true
        });

        // Position rows: if note has explicit target rowIndex on page, pad blank rows up to it
        if (typeof entry.rowIndex === 'number' && entry.rowIndex >= 0) {
            const targetSheetNo = parseInt(entry.sheetNo, 10) || 1;
            while (pages.length < targetSheetNo - 1) {
                pushCurrentPage();
            }
            while (currentRows.length < entry.rowIndex && currentRows.length < rowsPerPage) {
                currentRows.push({ dateTimeText: '', noteText: '', isMeta: false, noteId: null });
            }
        } else {
            // Sequential placement: if the start of a new entry only has 1 row left on page, start on next sheet
            if (currentRows.length > 0 && currentRows.length + 2 > rowsPerPage && entryRows.length >= 2) {
                pushCurrentPage();
            }
        }

        entryRows.forEach((r) => {
            if (currentRows.length >= rowsPerPage) {
                pushCurrentPage();
            }
            currentRows.push(r);
        });

        // Blank spacer row between distinct chronological entries if space permits and no explicit next rowIndex
        if (currentRows.length < rowsPerPage && (entry.rowIndex === null || entry.rowIndex === undefined)) {
            currentRows.push({ dateTimeText: '', noteText: '', isMeta: false, noteId: null });
        }
    });

    if (pages.length === 0 || currentRows.length > 0) {
        pushCurrentPage();
    }

    // Manual extra sheets created via "Add Sheet"
    const extraSheetsToAdd = Math.max(0, Number(manualExtraSheets) || 0);
    for (let s = 0; s < extraSheetsToAdd; s++) {
        pages.push({
            sheetNo: String(pages.length + 1),
            rows: Array.from({ length: rowsPerPage }, () => ({
                dateTimeText: '',
                noteText: '',
                isMeta: false,
                noteId: null
            }))
        });
    }

    return pages;
};

/**
 * Draw shared inline labeled underline field inside the right-hand Patient Info Panel
 */
const drawPanelInlineField = (doc, label, value, xStart, xEnd, y) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(30, 41, 59);
    doc.text(label, xStart, y);

    const labelW = doc.getTextWidth(label);
    const lineStart = xStart + labelW + 1.5;
    doc.setDrawColor(55, 65, 81);
    doc.setLineWidth(0.22);
    doc.line(lineStart, y + 0.7, xEnd, y + 0.7);

    if (value && String(value).trim()) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.0);
        doc.setTextColor(15, 23, 42);
        const availW = Math.max(8, xEnd - lineStart - 1.5);
        const fitted = doc.splitTextToSize(String(value).trim(), availW)[0] || '';
        doc.text(fitted, lineStart + 1.2, y - 0.15);
    }
};

/**
 * Shared Letterhead renderer matching PROGRESS NOTES.pdf & DRUG CHART.pdf Page 1:
 * - NABH seal on far left + Cert. No. below (only if Central Admin enabled NABH)
 * - Hospital logo ONLY beside it (no address, phone, or tagline)
 * - Right-hand bordered Patient Details panel
 */
export const drawClinicalSheetLetterhead = ({
    doc,
    hospitalName,
    hospImg,
    accredImg,
    isAccredited,
    certNumber,
    headerData,
    pageLeft = 10,
    pageRight = 200
}) => {
    const logoZoneTop = 15.5;
    const panelLeft = 112;
    const panelRight = pageRight;
    const panelW = panelRight - panelLeft; // 88mm
    const panelH = 29.5; // 15.5 -> 45.0

    // Leftmost NABH logo (only when Central Admin checkbox enabled)
    let hospitalLogoLeftEdge = pageLeft + 2;
    if (isAccredited) {
        if (accredImg) {
            try {
                const aspect = accredImg.naturalWidth && accredImg.naturalHeight
                    ? accredImg.naturalWidth / accredImg.naturalHeight
                    : 1.2;
                const hMm = 14.8;
                const wMm = Math.min(20, hMm * aspect);
                doc.addImage(accredImg.dataUrl || accredImg, 'PNG', pageLeft + 1.5, 20.5, wMm, hMm);
                if (certNumber) {
                    doc.setTextColor(185, 28, 28);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(5.7);
                    doc.text(certNumber, pageLeft + 1.5 + wMm / 2, 38.2, { align: 'center', maxWidth: 23 });
                }
                hospitalLogoLeftEdge = pageLeft + wMm + 4.5;
            } catch (_) {}
        } else if (certNumber) {
            doc.setTextColor(185, 28, 28);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.2);
            doc.text(certNumber, pageLeft + 2, 29);
            hospitalLogoLeftEdge = pageLeft + 26;
        }
    }

    // Beside NABH: Hospital logo ONLY (no address, no phone, no tagline)
    const availLogoW = Math.max(30, panelLeft - hospitalLogoLeftEdge - 4);
    const maxLogoH = 19;
    let hospRendered = false;
    if (hospImg) {
        try {
            const aspect = hospImg.naturalWidth && hospImg.naturalHeight
                ? hospImg.naturalWidth / hospImg.naturalHeight
                : 2.2;
            let drawH = maxLogoH;
            let drawW = drawH * aspect;
            if (drawW > availLogoW) {
                drawW = availLogoW;
                drawH = drawW / aspect;
            }
            const drawX = hospitalLogoLeftEdge + Math.max(0, (availLogoW - drawW) / 2);
            const drawY = 20 + (maxLogoH - drawH) / 2;
            doc.addImage(hospImg.dataUrl || hospImg, 'PNG', drawX, drawY, drawW, drawH);
            hospRendered = true;
        } catch (_) {}
    }
    if (!hospRendered) {
        doc.setFont('times', 'bold');
        doc.setFontSize(17);
        doc.setTextColor(15, 23, 42);
        doc.text(hospitalName, hospitalLogoLeftEdge + availLogoW / 2, 30.5, {
            align: 'center',
            maxWidth: availLogoW
        });
    }

    // Right Patient Information Box
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.42);
    doc.rect(panelLeft, logoZoneTop, panelW, panelH);

    const pL = panelLeft + 2.2;
    const pR = panelRight - 2.2;
    drawPanelInlineField(doc, 'Name', headerData.name, pL, pR, 20.0);
    drawPanelInlineField(doc, 'Age', headerData.age, pL, panelLeft + 34.5, 25.6);
    drawPanelInlineField(doc, 'Sex', headerData.sex, panelLeft + 36.5, panelLeft + 57.5, 25.6);
    drawPanelInlineField(doc, 'DOA', headerData.doa, panelLeft + 59.5, pR, 25.6);
    drawPanelInlineField(doc, 'Registration No.', headerData.regdNo, pL, panelLeft + 50.0, 31.2);
    drawPanelInlineField(doc, 'IPD No', headerData.ipdNo, panelLeft + 52.0, pR, 31.2);
    drawPanelInlineField(doc, 'Ward/Bed', headerData.wardBed, pL, pR, 36.8);
    drawPanelInlineField(doc, 'Consultant', headerData.consultant, pL, pR, 42.4);
};

/**
 * Helper to draw vector pen strokes from tablet canvas onto jsPDF
 */
export const drawVectorStrokes = (doc, strokes, { boxLeft = 0, boxTopY = 0, boxWidth = 210, boxHeight = 297 } = {}) => {
    if (!Array.isArray(strokes) || strokes.length === 0) return;

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

        const screenW = Number(stroke.canvasWidth) || 790;
        const screenH = Number(stroke.canvasHeight) || 1117;
        const pdfLineWidth = Math.max(0.2, (Number(stroke.width) || 2) * 0.18);
        doc.setLineWidth(pdfLineWidth);

        if (stroke.points.length === 1) {
            const pt = stroke.points[0];
            const x = boxLeft + (pt.x / screenW) * boxWidth;
            const y = boxTopY + (pt.y / screenH) * boxHeight;
            const radius = Math.max(0.25, (Number(stroke.width) || 2) * 0.14);
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

/**
 * Generate vector SVG overlay string for browser print
 */
export const generateStrokesSvg = (strokes, screenW = 790, screenH = 1117) => {
    if (!Array.isArray(strokes) || strokes.length === 0) return '';
    const paths = strokes.map(stroke => {
        if (!stroke.points || stroke.points.length === 0) return '';
        const color = stroke.color || '#1d4ed8';
        const width = stroke.width || 2;
        if (stroke.points.length === 1) {
            const pt = stroke.points[0];
            return `<circle cx="${pt.x}" cy="${pt.y}" r="${Math.max(1, width / 2)}" fill="${color}" />`;
        }
        const d = stroke.points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
        return `<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
    }).join('');

    return `
        <svg class="pn-print-strokes-svg" viewBox="0 0 ${screenW} ${screenH}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:20;">
            ${paths}
        </svg>
    `;
};

/**
 * Generate and download exact A4 1-Page (+ Continuation Sheets) PROGRESS NOTES PDF
 */
export const downloadProgressNotesPdf = async ({
    hospital = {},
    patient = {},
    admission = {},
    progressNotes = [],
    handwritingStrokes = {},
    isBlank = false,
    fileName = '',
    manualExtraSheets = 0
}) => {
    const JsPDFCtor = typeof jsPDF === 'function' ? jsPDF : jsPDF?.jsPDF;
    const doc = new JsPDFCtor({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = 210;
    const leftX = 10;
    const rightX = pageWidth - 10;
    const tableW = rightX - leftX; // 190mm
    const dateColSplitX = leftX + 24; // 34mm (matches exact column proportion in PROGRESS NOTES.pdf)

    const ptDetails = resolvePatientChartDetails({ patient, admission, isBlank });
    const headerData = buildProgressNotesHeaderData({ patient, admission, isBlank });

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

    const pages = isBlank
        ? paginateProgressNotes([], PROGRESS_ROWS_PER_PAGE, manualExtraSheets)
        : paginateProgressNotes(progressNotes, PROGRESS_ROWS_PER_PAGE, manualExtraSheets);

    pages.forEach((pg, pageIndex) => {
        if (pageIndex > 0) doc.addPage();

        // Top Patient Banner Strip (light blue text + light slate-black |)
        drawPatientBannerPdf(doc, ptDetails, { x: leftX + 1, y: 10.2, maxWidth: tableW - 2, headerData });

        // Letterhead (NABH left + Hospital Logo beside it + Patient Info Box right)
        drawClinicalSheetLetterhead({
            doc,
            hospitalName,
            hospImg,
            accredImg,
            isAccredited,
            certNumber,
            headerData,
            pageLeft: leftX,
            pageRight: rightX
        });

        // Heavy top border of Progress Notes table
        const tableTopY = 47.0;
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.65);
        doc.line(leftX, tableTopY, rightX, tableTopY);

        // Table Header Row (Date & Time | Clinical Progress Notes | Sheet No. .....)
        const headerBottomY = 56.2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text('Date &', leftX + 12, 50.6, { align: 'center' });
        doc.text('Time', leftX + 12, 54.6, { align: 'center' });
        doc.text('Clinical Progress Notes', leftX + 88, 52.6, { align: 'center' });

        const sheetLabel = 'Sheet No.';
        doc.text(sheetLabel, rightX - 42, 52.6);
        const sheetStart = rightX - 42 + doc.getTextWidth(sheetLabel) + 1.5;
        doc.setLineDashPattern([0.55, 0.95], 0);
        doc.setDrawColor(71, 85, 105);
        doc.setLineWidth(0.28);
        doc.line(sheetStart, 53.1, rightX - 1, 53.1);
        doc.setLineDashPattern([], 0);
        if (!isBlank) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(pg.sheetNo, sheetStart + 4, 52.4);
        }

        // Bottom rule under header row
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.45);
        doc.line(leftX, headerBottomY, rightX, headerBottomY);

        // Ruled Writing Rows (32 evenly spaced lines down to 280.2mm)
        const rowH = 7.0;
        const rowsBottomY = headerBottomY + PROGRESS_ROWS_PER_PAGE * rowH;

        for (let r = 0; r < PROGRESS_ROWS_PER_PAGE; r++) {
            const rowTopY = headerBottomY + r * rowH;
            const rowLineY = rowTopY + rowH;

            doc.setDrawColor(55, 65, 81);
            doc.setLineWidth(r === PROGRESS_ROWS_PER_PAGE - 1 ? 0.35 : 0.24);
            doc.line(leftX, rowLineY, rightX, rowLineY);

            const rowObj = pg.rows[r];
            if (rowObj && !isBlank) {
                if (rowObj.dateTimeText) {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.4);
                    doc.setTextColor(30, 41, 59);
                    doc.text(rowObj.dateTimeText, leftX + 12, rowTopY + 4.9, { align: 'center', maxWidth: 22 });
                }
                if (rowObj.noteText) {
                    doc.setFont('helvetica', rowObj.isMeta ? 'italic' : 'normal');
                    doc.setFontSize(rowObj.isMeta ? 7.2 : 8.5);
                    doc.setTextColor(rowObj.isMeta ? 100 : 15, rowObj.isMeta ? 116 : 23, rowObj.isMeta ? 139 : 42);
                    doc.text(rowObj.noteText, dateColSplitX + 2.5, rowTopY + 4.9, { maxWidth: rightX - dateColSplitX - 4 });
                }
            }
        }

        // Single Continuous Vertical Divider between Date & Time and Clinical Progress Notes
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.45);
        doc.line(dateColSplitX, tableTopY, dateColSplitX, rowsBottomY + 2.5);

        // Bottom exact continuation footer label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text('Progress Sheet Cond ......', rightX - 58, rowsBottomY + 6.5);

        // Render vector pen strokes overlay on this page
        const pageKey = `pn_page_${pageIndex}`;
        const pageStrokes = handwritingStrokes?.[pageKey];
        if (Array.isArray(pageStrokes) && pageStrokes.length > 0) {
            drawVectorStrokes(doc, pageStrokes, { boxLeft: 0, boxTopY: 0, boxWidth: 210, boxHeight: 297 });
        }
    });

    const safeName = (ptDetails.name || 'Patient').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeIpd = (ptDetails.ipdNumber || 'IPD').replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(fileName || `Progress_Notes_${safeName}_${safeIpd}.pdf`);
};

/**
 * Open Print Window with exact PROGRESS NOTES layout + continuation pages
 */
export const printProgressNotes = ({
    hospital = {},
    patient = {},
    admission = {},
    progressNotes = [],
    handwritingStrokes = {},
    isBlank = false,
    manualExtraSheets = 0
}) => {
    const ptDetails = resolvePatientChartDetails({ patient, admission, isBlank });
    const headerData = buildProgressNotesHeaderData({ patient, admission, isBlank });

    const hospitalName = hospital.name || hospital.appName || 'Hospital';
    const hospitalLogo = sanitizeImageUrl(hospital.logoUrl || hospital.logo || '');
    const accreditation = hospital.accreditation || {};
    const isAccredited = accreditation.enabled === true;
    const rawCert = isAccredited && accreditation.certNo ? String(accreditation.certNo).trim() : '';
    const certNumber = rawCert
        ? (/^cert\.?\s*no/i.test(rawCert) ? rawCert : `Cert. No. : ${rawCert}`)
        : '';

    const pages = isBlank
        ? paginateProgressNotes([], PROGRESS_ROWS_PER_PAGE, manualExtraSheets)
        : paginateProgressNotes(progressNotes, PROGRESS_ROWS_PER_PAGE, manualExtraSheets);

    const bannerHtml = `
        <div class="pn-banner">
            <span>Patient Name : ${escapeHtml(ptDetails.name)}</span>
            <span>UHID : ${escapeHtml(ptDetails.uhid)}</span>
            <span>IPD : ${escapeHtml(ptDetails.ipdNumber)}</span>
            <span>Gender : ${escapeHtml(ptDetails.gender)}</span>
            <span>Age : ${escapeHtml(ptDetails.age)}</span>
        </div>
    `;

    const pagesHtml = pages.map((pg, idx) => {
        const pageKey = `pn_page_${idx}`;
        const pageStrokes = handwritingStrokes?.[pageKey] || [];
        const strokesSvg = generateStrokesSvg(pageStrokes);
        return `
        <div class="pn-page ${idx < pages.length - 1 ? 'page-break' : ''}" style="position:relative;">
            ${strokesSvg}
            ${bannerHtml}
            <div class="pn-letterhead">
                <div class="pn-logos">
                    ${isAccredited ? `
                        <div class="pn-nabh">
                            <img src="${COMMON_NABH_LOGO_URL}" alt="NABH" />
                            ${certNumber ? `<div class="pn-cert">${escapeHtml(certNumber)}</div>` : ''}
                        </div>
                    ` : ''}
                    <div class="pn-hosp">
                        ${hospitalLogo ? `<img src="${escapeHtml(hospitalLogo)}" alt="${escapeHtml(hospitalName)}" />` : `<div class="pn-hosp-text">${escapeHtml(hospitalName)}</div>`}
                    </div>
                </div>
                <div class="pn-info-box">
                    <div class="pn-info-row"><span>Name</span><span class="pn-fill">${escapeHtml(headerData.name)}</span></div>
                    <div class="pn-info-row">
                        <span>Age</span><span class="pn-fill w-sm">${escapeHtml(headerData.age)}</span>
                        <span>Sex</span><span class="pn-fill w-xs">${escapeHtml(headerData.sex)}</span>
                        <span>DOA</span><span class="pn-fill w-sm">${escapeHtml(headerData.doa)}</span>
                    </div>
                    <div class="pn-info-row">
                        <span>Registration No.</span><span class="pn-fill w-md">${escapeHtml(headerData.regdNo)}</span>
                        <span>IPD No</span><span class="pn-fill w-sm">${escapeHtml(headerData.ipdNo)}</span>
                    </div>
                    <div class="pn-info-row"><span>Ward/Bed</span><span class="pn-fill">${escapeHtml(headerData.wardBed)}</span></div>
                    <div class="pn-info-row"><span>Consultant</span><span class="pn-fill">${escapeHtml(headerData.consultant)}</span></div>
                </div>
            </div>

            <table class="pn-table">
                <thead>
                    <tr>
                        <th class="col-dt">Date &amp;<br/>Time</th>
                        <th class="col-notes">
                            <div class="pn-th-flex">
                                <span class="pn-th-title">Clinical Progress Notes</span>
                                <span class="pn-th-sheet">Sheet No. <span class="pn-dots">${isBlank ? '' : escapeHtml(pg.sheetNo)}</span></span>
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    ${pg.rows.map(r => `
                        <tr>
                            <td class="col-dt">${isBlank ? '' : escapeHtml(r.dateTimeText)}</td>
                            <td class="col-notes ${r.isMeta ? 'meta-line' : ''}">${isBlank ? '' : escapeHtml(r.noteText)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="pn-footer">Progress Sheet Cond ......</div>
        </div>
        `;
    }).join('');

    const win = window.open('', '_blank', 'width=940,height=1050');
    if (!win) return;

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Progress Notes - ${escapeHtml(ptDetails.name)}</title>
            <style>
                @page { size: A4 portrait; margin: 8mm; }
                * { box-sizing: border-box; }
                body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; }
                .no-print-bar {
                    background: #0f766e; color: #fff; padding: 10px 16px; text-align: center;
                    font-weight: 700; cursor: pointer; font-size: 13px;
                }
                .pn-page { width: 194mm; margin: 0 auto; padding: 2mm 0; background: #fff; }
                .page-break { page-break-after: always; }
                .pn-banner {
                    font-family: Georgia, 'Times New Roman', serif;
                    font-size: 12.5px; color: #2563eb; margin-bottom: 5px;
                    display: flex; flex-wrap: wrap; align-items: center;
                }
                .pn-banner .pn-sep { margin: 0 8px; color: #64748b; }
                .pn-letterhead {
                    display: flex; justify-content: space-between; align-items: stretch; gap: 8px; margin-bottom: 6px;
                }
                .pn-logos {
                    flex: 1; display: flex; align-items: center; gap: 12px; padding: 4px 2px;
                }
                .pn-nabh { text-align: center; flex-shrink: 0; }
                .pn-nabh img { height: 52px; width: auto; display: block; margin: 0 auto; }
                .pn-cert { color: #b91c1c; font-weight: 700; font-size: 8.5px; margin-top: 2px; }
                .pn-hosp { flex: 1; display: flex; justify-content: center; align-items: center; }
                .pn-hosp img { max-height: 60px; max-width: 240px; object-fit: contain; }
                .pn-hosp-text { font-family: Georgia, serif; font-size: 20px; font-weight: 700; }
                .pn-info-box {
                    width: 85mm; border: 1.5px solid #111827; padding: 5px 8px;
                    display: flex; flex-direction: column; justify-content: space-between; font-size: 10.5px;
                }
                .pn-info-row { display: flex; align-items: baseline; gap: 4px; line-height: 1.45; }
                .pn-fill {
                    flex: 1; border-bottom: 1px solid #374151; font-weight: 700; min-height: 13px; padding: 0 3px;
                }
                .pn-fill.w-xs { flex: 0.7; }
                .pn-fill.w-sm { flex: 1; }
                .pn-fill.w-md { flex: 1.4; }
                .pn-table { width: 100%; border-collapse: collapse; border-top: 2.2px solid #0f172a; }
                .pn-table th, .pn-table td {
                    border-bottom: 1px solid #475569; padding: 2px 6px; font-size: 11px; height: 6.75mm;
                }
                .pn-table th { border-bottom: 1.8px solid #0f172a; font-size: 12px; height: 9mm; }
                .col-dt { width: 24mm; border-right: 1.6px solid #0f172a; text-align: center; font-weight: 700; font-size: 9.5px; }
                .col-notes { text-align: left; }
                .col-notes.meta-line { font-style: italic; color: #64748b; font-size: 9.5px; }
                .pn-th-flex { display: flex; justify-content: space-between; align-items: center; }
                .pn-th-title { margin-left: 28%; }
                .pn-th-sheet { font-size: 11.5px; font-weight: 700; }
                .pn-dots { display: inline-block; min-width: 24mm; border-bottom: 1.5px dotted #334155; text-align: center; }
                .pn-footer { text-align: right; padding-right: 14mm; margin-top: 4px; font-weight: 700; font-size: 12px; }
                @media print { .no-print-bar { display: none; } .pn-page { width: 100%; } }
            </style>
        </head>
        <body>
            <div class="no-print-bar" onclick="window.print()">Click Here to Print / Save PDF</div>
            ${pagesHtml}
        </body>
        </html>
    `);
    win.document.close();
};

