import jsPDF from 'jspdf';
import {
    COMMON_NABH_LOGO_URL,
    escapeHtml,
    sanitizeImageUrl,
    resolvePatientChartDetails,
    loadImageForPdf,
    drawPatientBannerPdf
} from './tprChartPdf.js';
import { buildProgressNotesHeaderData, drawClinicalSheetLetterhead } from './progressNotesPdf.js';

export const DRUG_CHART_TIME_SLOTS = ['06 AM', '10 AM', '02 PM', '10 PM'];
export const DRUG_CHART_STAT_ROWS_PER_PAGE = 10;
export const DRUG_CHART_IV_ROWS_PER_PAGE = 19;
export const DRUG_CHART_MAR_BLOCKS_PER_PAGE = 12;
export const DRUG_CHART_PAGE2_SUBCOLS_MM = [13, 12, 14, 25];
export const DRUG_CHART_PAGE2_SLOT_MM = 8;

export const STAT_COLS = [
    { key: 'date', label: 'Date', w: 19, align: 'center', widthPct: '10%' },
    { key: 'drugName', label: 'Drug', w: 40, align: 'left', widthPct: '21.05%' },
    { key: 'dose', label: 'Dose', w: 14, align: 'center', widthPct: '7.37%' },
    { key: 'route', label: 'Route', w: 13, align: 'center', widthPct: '6.84%' },
    { key: 'time', label: 'Time', w: 13, align: 'center', widthPct: '6.84%' },
    { key: 'doctorName', label: 'Doctor', w: 23, align: 'left', widthPct: '12.11%' },
    { key: 'givenByName', label: 'Given By', w: 22, align: 'left', widthPct: '11.58%' },
    { key: 'checkedByName', label: 'Checked by', w: 22, align: 'left', widthPct: '11.58%' },
    { key: 'remarks', label: 'Remarks', w: 24, align: 'left', widthPct: '12.63%' }
];

export const IV_COLS = [
    { key: 'date', label: 'Date', w: 19, align: 'center', widthPct: '10%' },
    { key: 'fluidName', label: 'Fluid', w: 45, align: 'left', widthPct: '23.68%' },
    { key: 'volume', label: 'Volume', w: 16, align: 'center', widthPct: '8.42%' },
    { key: 'timeStart', label: 'Time Start', w: 17, align: 'center', widthPct: '8.95%' },
    { key: 'infusionTimeHrs', label: 'Infusion\ntime(hrs.)', w: 22, align: 'center', widthPct: '11.58%' },
    { key: 'doctorName', label: 'Doctor', w: 22, align: 'left', widthPct: '11.58%' },
    { key: 'adminByName', label: 'Admin.by', w: 22, align: 'left', widthPct: '11.58%' },
    { key: 'remarks', label: 'Remarks', w: 27, align: 'left', widthPct: '14.21%' }
];

/**
 * Render Drug Chart Page 2 blue Times-serif patient header banner on one clean line
 * (matching original DRUG CHART.pdf Page 2: no '|' pipes, balanced spacing, no wrap).
 */
export const drawDrugChartPage2Banner = (doc, ptDetails, { x = 10, y = 10.2, maxWidth = 190, headerData = {} } = {}) => {
    const doa = headerData?.doa || ptDetails?.doa || '—';
    const wardBed = headerData?.wardBed || ptDetails?.wardBed || '—';
    const consultant = headerData?.consultant || ptDetails?.consultant || '—';
    const fields = [
        `Patient Name : ${ptDetails?.name || '—'}`,
        `MRN : ${ptDetails?.uhid || '—'}`,
        `IPD : ${ptDetails?.ipdNumber || '—'}`,
        `Age : ${ptDetails?.age || '—'}`,
        `Sex : ${ptDetails?.gender || '—'}`,
        `DOA : ${doa}`,
        `Ward/Bed : ${wardBed}`,
        `Consultant : ${consultant}`
    ];

    doc.setFont('times', 'normal');
    doc.setTextColor(29, 78, 216);

    const minGap = 2.0;
    let fontSize = 9.6;
    let widths = [];
    let totalTextW = 0;

    while (fontSize >= 6.8) {
        doc.setFontSize(fontSize);
        widths = fields.map((f) => doc.getTextWidth(f));
        totalTextW = widths.reduce((sum, w) => sum + w, 0);
        if (totalTextW + minGap * (fields.length - 1) <= maxWidth) break;
        fontSize = Number((fontSize - 0.25).toFixed(2));
    }

    const gap = Math.min(7.5, Math.max(1.5, (maxWidth - totalTextW) / (fields.length - 1)));
    let cursorX = x;
    fields.forEach((txt, idx) => {
        doc.text(txt, cursorX, y);
        cursorX += widths[idx] + gap;
    });
};

export const toLocalDateKey = (dtVal) => {
    if (!dtVal) return '';
    const d = new Date(dtVal);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const formatDateDisplay = (dateKeyOrDate) => {
    if (!dateKeyOrDate) return '';
    const str = String(dateKeyOrDate).trim();
    const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
    const d = new Date(dateKeyOrDate);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatShortTime = (dtVal) => {
    if (!dtVal) return '';
    const d = new Date(dtVal);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const getStaffInitials = (name) => {
    if (!name) return '';
    const clean = String(name).trim().replace(/^dr\.?\s+/i, '');
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return parts.map(p => p[0]).join('').slice(0, 3).toUpperCase();
};

/**
 * Map a scheduledTime timestamp to the closest 4-slot drug chart column ('06 AM' | '10 AM' | '02 PM' | '10 PM')
 */
export const mapScheduledTimeToDrugChartSlot = (mar) => {
    if (mar?.scheduledSlot && DRUG_CHART_TIME_SLOTS.includes(mar.scheduledSlot)) {
        return mar.scheduledSlot;
    }
    const dt = new Date(mar?.scheduledTime || Date.now());
    if (isNaN(dt.getTime())) return '10 AM';
    const hour = dt.getHours();
    if (hour < 8) return '06 AM';
    if (hour < 12) return '10 AM';
    if (hour < 18) return '02 PM';
    return '10 PM';
};

/**
 * Normalize MAR visual status for cells & badges
 */
export const formatMarCellStatus = (mar) => {
    if (!mar) return { code: 'NONE', label: '', shortLabel: '', color: '#0f172a' };
    const st = String(mar.status || '').toUpperCase();
    if (st === 'ADMINISTERED') {
        return { code: 'GIVEN', label: 'Given', shortLabel: 'Given', color: '#15803d' };
    }
    if (st === 'HELD') {
        return { code: 'HELD', label: 'Held', shortLabel: 'Held', color: '#7e22ce' };
    }
    if (st === 'REFUSED') {
        return { code: 'REFUSED', label: 'Refused', shortLabel: 'Refused', color: '#b91c1c' };
    }
    if (st === 'MISSED' || st === 'NOT_GIVEN') {
        return { code: 'NOT_GIVEN', label: 'Not Given', shortLabel: 'N/G', color: '#475569' };
    }
    if (st === 'CANCELLED') {
        return { code: 'CANCELLED', label: 'Cancelled', shortLabel: 'Canc.', color: '#64748b' };
    }
    return { code: 'PENDING', label: 'Pending', shortLabel: 'Pend.', color: '#b45309' };
};

/**
 * Compute sorted unique YYYY-MM-DD dates spanning admission / orders / MAR records, grouped into 4-day pages.
 */
export const buildDrugChartDateWindows = ({ admission = {}, orders = [], marRecords = [] } = {}) => {
    const dateSet = new Set();

    if (admission?.admissionDate) {
        const k = toLocalDateKey(admission.admissionDate);
        if (k) dateSet.add(k);
    }
    (Array.isArray(orders) ? orders : []).forEach((o) => {
        if (o.startDate) {
            const k = toLocalDateKey(o.startDate);
            if (k) dateSet.add(k);
        }
    });
    (Array.isArray(marRecords) ? marRecords : []).forEach((m) => {
        const k = m.scheduledDateKey || toLocalDateKey(m.scheduledTime);
        if (k) dateSet.add(k);
    });

    const todayKey = toLocalDateKey(new Date());
    if (todayKey) dateSet.add(todayKey);

    const sorted = [...dateSet].filter(Boolean).sort();
    const anchorStr = sorted[0] || todayKey;
    const anchorDate = new Date(`${anchorStr}T00:00:00`);

    // Ensure at least 4 contiguous day slots, and pad every chunk to 4 days
    const lastStr = sorted[sorted.length - 1] || anchorStr;
    const lastDate = new Date(`${lastStr}T00:00:00`);
    const totalDaysSpan = Math.max(4, Math.ceil((lastDate - anchorDate) / (24 * 60 * 60 * 1000)) + 1);
    const numChunks = Math.ceil(totalDaysSpan / 4);

    const windows = [];
    for (let c = 0; c < numChunks; c++) {
        const chunk = [];
        for (let d = 0; d < 4; d++) {
            const dt = new Date(anchorDate);
            dt.setDate(dt.getDate() + c * 4 + d);
            chunk.push(toLocalDateKey(dt));
        }
        windows.push(chunk);
    }
    return windows;
};

/**
 * Merge DrugChart STAT entries + any unlinked STAT InpatientOrders cleanly without marking pending orders as Given.
 */
export const buildCombinedStatRows = (drugChart = {}, orders = [], admission = {}) => {
    const admDocRaw = admission?.doctorId?.name || admission?.admittedBy?.name || admission?.doctorName || '';
    const admDocName = admDocRaw ? (/^dr\.?\s*/i.test(admDocRaw) ? admDocRaw : `Dr. ${admDocRaw}`) : '';

    const savedStats = (Array.isArray(drugChart?.statDoses) ? drugChart.statDoses : []).map(s => {
        const doc = String(s.doctorName || '').trim();
        const given = String(s.givenByName || '').trim();
        const author = String(s.authorName || '').trim();
        const isNurseAuthor = String(s.authorRole || '').toLowerCase().includes('nurse');
        let cleanDoc = doc;
        if (!cleanDoc || (given && cleanDoc.toLowerCase() === given.toLowerCase()) || (isNurseAuthor && cleanDoc.toLowerCase() === author.toLowerCase()) || /\(nurse\)/i.test(cleanDoc)) {
            cleanDoc = admDocName || '';
        } else if (!/^dr\.?\s*/i.test(cleanDoc)) {
            cleanDoc = `Dr. ${cleanDoc}`;
        }
        return {
            ...s,
            doctorName: cleanDoc
        };
    });
    const linkedOrderIds = new Set(savedStats.map(s => s.orderId && String(s.orderId)).filter(Boolean));

    const extraStatOrders = (Array.isArray(orders) ? orders : [])
        .filter(o => String(o.frequency || '').toUpperCase().trim() === 'STAT' && !linkedOrderIds.has(String(o._id)))
        .map(o => ({
            _id: `order-${o._id}`,
            orderId: o._id,
            date: formatDateDisplay(o.startDate || o.createdAt),
            time: formatShortTime(o.startDate || o.createdAt),
            drugName: o.medicineName,
            dose: `${o.dosageValue ?? o.dosage?.value ?? ''} ${o.dosageUnit || o.dosage?.unit || ''}`.trim(),
            route: o.route || 'IV',
            doctorName: o.doctorId?.name
                ? (/^dr\.?\s/i.test(o.doctorId.name) ? o.doctorId.name : `Dr. ${o.doctorId.name}`)
                : (admDocName || ''),
            status: 'PENDING',
            givenByName: '',
            checkedByName: '',
            remarks: o.instructions || '',
            fromOrderOnly: true
        }));

    return [...savedStats, ...extraStatOrders];
};

/**
 * Merge DrugChart IV Fluid entries + any unlinked IV InpatientOrders cleanly.
 */
export const buildCombinedIVFluidRows = (drugChart = {}, orders = [], admission = {}) => {
    const admDocRaw = admission?.doctorId?.name || admission?.admittedBy?.name || admission?.doctorName || '';
    const admDocName = admDocRaw ? (/^dr\.?\s*/i.test(admDocRaw) ? admDocRaw : `Dr. ${admDocRaw}`) : '';

    const savedIVs = (Array.isArray(drugChart?.ivFluids) ? drugChart.ivFluids : []).map(iv => {
        const doc = String(iv.doctorName || '').trim();
        const admin = String(iv.adminByName || '').trim();
        const author = String(iv.authorName || '').trim();
        const isNurseAuthor = String(iv.authorRole || '').toLowerCase().includes('nurse');
        let cleanDoc = doc;
        if (!cleanDoc || (admin && cleanDoc.toLowerCase() === admin.toLowerCase()) || (isNurseAuthor && cleanDoc.toLowerCase() === author.toLowerCase()) || /\(nurse\)/i.test(cleanDoc)) {
            cleanDoc = admDocName || '';
        } else if (!/^dr\.?\s*/i.test(cleanDoc)) {
            cleanDoc = `Dr. ${cleanDoc}`;
        }
        return {
            ...iv,
            doctorName: cleanDoc
        };
    });
    const linkedOrderIds = new Set(savedIVs.map(s => s.orderId && String(s.orderId)).filter(Boolean));

    const extraIVOrders = (Array.isArray(orders) ? orders : [])
        .filter(o => {
            if (linkedOrderIds.has(String(o._id))) return false;
            const r = (o.route || '').toLowerCase();
            const m = (o.medicineName || '').toLowerCase();
            const u = (o.dosageUnit || o.dosage?.unit || '').toLowerCase().trim();
            const isFluidVol = (u === 'ml' || u === 'l') && Number(o.dosageValue ?? o.dosage?.value ?? 0) >= 100;
            return (
                r.includes('infusion') ||
                (r.includes('iv') && (m.includes('saline') || m.includes('dextrose') || m.includes('ringer') || m.includes('rl') || m.includes('ns') || m.includes('fluid') || isFluidVol))
            );
        })
        .map(o => ({
            _id: `ivorder-${o._id}`,
            orderId: o._id,
            date: formatDateDisplay(o.startDate || o.createdAt),
            fluidName: o.medicineName,
            volume: `${o.dosageValue ?? ''} ${o.dosageUnit || 'ml'}`.trim(),
            timeStart: formatShortTime(o.startDate || o.createdAt),
            infusionTimeHrs: o.duration || '',
            doctorName: o.doctorId?.name
                ? (/^dr\.?\s/i.test(o.doctorId.name) ? o.doctorId.name : `Dr. ${o.doctorId.name}`)
                : (admDocName || ''),
            status: 'PENDING',
            adminByName: '',
            remarks: o.instructions || '',
            fromOrderOnly: true
        }));

    return [...savedIVs, ...extraIVOrders];
};

/**
 * Draw tabular grid with clipped text cleanly
 */
const drawCellGridTable = ({
    doc,
    x,
    y,
    colDefs,
    headerHeight,
    rowHeight,
    rowCount,
    rowsData = [],
    isBlank = false
}) => {
    const totalW = colDefs.reduce((s, c) => s + c.w, 0);

    // Thick top border rule matching DRUG CHART.pdf
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.55);
    doc.line(x, y, x + totalW, y);

    // Header row text & bottom rule
    let colX = x;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(15, 23, 42);
    colDefs.forEach((c) => {
        const lines = String(c.label).split('\n');
        if (lines.length > 1) {
            doc.text(lines[0], colX + c.w / 2, y + headerHeight * 0.42, { align: 'center', maxWidth: c.w - 1.5 });
            doc.text(lines[1], colX + c.w / 2, y + headerHeight * 0.80, { align: 'center', maxWidth: c.w - 1.5 });
        } else {
            doc.text(lines[0], colX + c.w / 2, y + headerHeight * 0.65, { align: 'center', maxWidth: c.w - 1.5 });
        }
        colX += c.w;
    });

    const bodyTop = y + headerHeight;
    doc.setLineWidth(0.38);
    doc.line(x, bodyTop, x + totalW, bodyTop);

    // Body horizontal rows
    for (let r = 0; r < rowCount; r++) {
        const rTop = bodyTop + r * rowHeight;
        const rBottom = rTop + rowHeight;
        doc.setDrawColor(55, 65, 81);
        doc.setLineWidth(r === rowCount - 1 ? 0.42 : 0.22);
        doc.line(x, rBottom, x + totalW, rBottom);

        if (!isBlank && rowsData[r]) {
            const rowVals = rowsData[r];
            let cx = x;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.1);
            doc.setTextColor(15, 23, 42);
            colDefs.forEach((c) => {
                const val = rowVals[c.key] ? String(rowVals[c.key]).trim() : '';
                if (val) {
                    const line = doc.splitTextToSize(val, c.w - 2.2)[0] || '';
                    doc.text(line, c.align === 'center' ? cx + c.w / 2 : cx + 1.2, rTop + rowHeight * 0.68, {
                        align: c.align === 'center' ? 'center' : 'left'
                    });
                }
                cx += c.w;
            });
        }
    }

    // Vertical column borders spanning full height
    const tableBottom = bodyTop + rowCount * rowHeight;
    let vx = x;
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.28);
    doc.line(vx, y, vx, tableBottom);
    colDefs.forEach((c) => {
        vx += c.w;
        doc.line(vx, y, vx, tableBottom);
    });

    return tableBottom;
};

/**
 * Generate and download exact 2-Page (+ Continuation Sheets) A4 DRUG CHART PDF
 */
export const downloadDrugChartPdf = async ({
    hospital = {},
    patient = {},
    admission = {},
    drugChart = {},
    existingAllergies = {},
    orders = [],
    marRecords = [],
    isBlank = false,
    fileName = ''
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

    const allStatRows = isBlank ? [] : buildCombinedStatRows(drugChart, orders, admission).map(s => ({
        date: s.date || '',
        drugName: s.drugName || '',
        dose: s.dose || '',
        route: s.route || '',
        time: s.time || '',
        doctorName: s.doctorName || '',
        givenByName: s.givenByName || '',
        checkedByName: s.checkedByName || '',
        remarks: s.status === 'PENDING' && !s.remarks ? 'Pending' : (s.remarks || (s.status && s.status !== 'ADMINISTERED' ? `${s.status}` : ''))
    }));

    const allIvRows = isBlank ? [] : buildCombinedIVFluidRows(drugChart, orders, admission).map(iv => ({
        date: iv.date || '',
        fluidName: iv.fluidName || '',
        volume: iv.volume || '',
        timeStart: iv.timeStart || '',
        infusionTimeHrs: iv.infusionTimeHrs || '',
        doctorName: iv.doctorName || '',
        adminByName: iv.adminByName || '',
        remarks: iv.remarks || ''
    }));

    const statChunksCount = Math.max(1, Math.ceil(allStatRows.length / DRUG_CHART_STAT_ROWS_PER_PAGE));
    const ivChunksCount = Math.max(1, Math.ceil(allIvRows.length / DRUG_CHART_IV_ROWS_PER_PAGE));
    const page1SheetCount = isBlank ? 1 : Math.max(statChunksCount, ivChunksCount);

    const allergyObj = drugChart?.drugAllergies || {};
    const suggestionList = Array.isArray(existingAllergies?.combinedSuggestions) ? existingAllergies.combinedSuggestions : [];
    const allergy1 = isBlank ? '' : (allergyObj.slot1 || suggestionList[0] || '');
    const allergy2 = isBlank ? '' : (allergyObj.slot2 || suggestionList[1] || '');
    const baseSheetNo = isBlank ? '' : (allergyObj.sheetNo || '1');

    // ==================== PAGE 1 (+ Continuation if STAT or IV rows overflow) ====================
    for (let p1 = 0; p1 < page1SheetCount; p1++) {
        if (p1 > 0) doc.addPage();

        drawPatientBannerPdf(doc, ptDetails, { x: leftX + 1, y: 10.2, maxWidth: tableW - 2, headerData });

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

        // Section A — DRUG ALLERGY : 1. ...... 2. ...... Sheet No. ......
        const allergyY = 50.2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor(15, 23, 42);
        doc.text('DRUG ALLERGY :', leftX, allergyY);

        const drawDottedSegment = (label, value, xS, xE) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.6);
            doc.text(label, xS, allergyY);
            const lw = doc.getTextWidth(label);
            const ls = xS + lw + 1.2;
            doc.setLineDashPattern([0.5, 0.9], 0);
            doc.setDrawColor(71, 85, 105);
            doc.setLineWidth(0.25);
            doc.line(ls, allergyY + 0.5, xE, allergyY + 0.5);
            doc.setLineDashPattern([], 0);
            if (value) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.2);
                doc.setTextColor(185, 28, 28);
                const fitted = doc.splitTextToSize(value, Math.max(8, xE - ls - 1))[0] || '';
                doc.text(fitted, ls + 1, allergyY);
                doc.setTextColor(15, 23, 42);
            }
        };

        drawDottedSegment('1.', allergy1, leftX + 34, leftX + 86);
        drawDottedSegment('2.', allergy2, leftX + 88, leftX + 140);
        const sheetLabelVal = isBlank ? '' : (p1 === 0 ? baseSheetNo : `${baseSheetNo}.${p1 + 1}`);
        drawDottedSegment('Sheet No.', sheetLabelVal, leftX + 143, rightX);

        // Section B — ONCE-ONLY PRESCRIPTION (STAT-DOSES)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text('ONCE-ONLY PRESCRIPTION (STAT-DOSES)', pageWidth / 2, 56.5, { align: 'center' });

        const statSlice = allStatRows.slice(p1 * DRUG_CHART_STAT_ROWS_PER_PAGE, (p1 + 1) * DRUG_CHART_STAT_ROWS_PER_PAGE);
        drawCellGridTable({
            doc,
            x: leftX,
            y: 58.5,
            colDefs: STAT_COLS,
            headerHeight: 7.2,
            rowHeight: 6.1,
            rowCount: DRUG_CHART_STAT_ROWS_PER_PAGE,
            rowsData: statSlice,
            isBlank
        });

        // Section C — I.V. FLUIDS
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text('I.V. FLUIDS', pageWidth / 2, 132.5, { align: 'center' });

        const ivSlice = allIvRows.slice(p1 * DRUG_CHART_IV_ROWS_PER_PAGE, (p1 + 1) * DRUG_CHART_IV_ROWS_PER_PAGE);
        drawCellGridTable({
            doc,
            x: leftX,
            y: 134.5,
            colDefs: IV_COLS,
            headerHeight: 9.5,
            rowHeight: 7.25,
            rowCount: DRUG_CHART_IV_ROWS_PER_PAGE,
            rowsData: ivSlice,
            isBlank
        });
    }

    // ==================== PAGE 2 (+ Continuation Pages): MEDICATION ADMINISTRATION GRID ====================
    const gridLeft = 9;
    const gridRight = 201; // 192mm total
    const subColWidths = DRUG_CHART_PAGE2_SUBCOLS_MM; // [13, 12, 14, 25] => 64mm
    const medInfoW = subColWidths.reduce((s, w) => s + w, 0); // 64mm (33.33%)
    const slotColW = DRUG_CHART_PAGE2_SLOT_MM; // 16 slots * 8mm = 128mm (66.67%)
    const slotsStartX = gridLeft + medInfoW; // 73mm
    const dateGroupW = slotColW * 4; // 32mm

    // Index MAR records by (orderId, dateKey, slot)
    const marCellLookup = new Map();
    if (!isBlank) {
        (Array.isArray(marRecords) ? marRecords : []).forEach((m) => {
            const ordId = String(m.orderId?._id || m.orderId || '');
            const dKey = m.scheduledDateKey || toLocalDateKey(m.scheduledTime);
            const slot = mapScheduledTimeToDrugChartSlot(m);
            if (!ordId || !dKey || !slot) return;
            const composite = `${ordId}::${dKey}::${slot}`;
            const existing = marCellLookup.get(composite);
            const completed = ['ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN'];
            if (!existing || completed.includes(String(m.status).toUpperCase())) {
                marCellLookup.set(composite, m);
            }
        });
    }

    // Exclude one-off STAT orders that live strictly in Section B unless they have MAR records
    const marOrders = isBlank
        ? []
        : (Array.isArray(orders) ? orders : []).filter(o => {
            const isStat = String(o.frequency || '').toUpperCase().trim() === 'STAT';
            if (!isStat) return true;
            return (Array.isArray(marRecords) ? marRecords : []).some(m => String(m.orderId?._id || m.orderId) === String(o._id));
        });

    const dateWindows = isBlank
        ? [['', '', '', '']]
        : buildDrugChartDateWindows({ admission, orders: marOrders, marRecords });
    const orderChunksCount = isBlank ? 1 : Math.max(1, Math.ceil(marOrders.length / DRUG_CHART_MAR_BLOCKS_PER_PAGE));

    for (let dcIdx = 0; dcIdx < dateWindows.length; dcIdx++) {
        const fourDates = dateWindows[dcIdx];
        for (let ocIdx = 0; ocIdx < orderChunksCount; ocIdx++) {
            doc.addPage();
            const orderSlice = isBlank
                ? []
                : marOrders.slice(ocIdx * DRUG_CHART_MAR_BLOCKS_PER_PAGE, (ocIdx + 1) * DRUG_CHART_MAR_BLOCKS_PER_PAGE);

            // Top Blue Patient Banner (Page 2 reference format: single clean line, no '|' pipes)
            drawDrugChartPage2Banner(doc, ptDetails, { x: gridLeft + 1, y: 10.2, maxWidth: gridRight - gridLeft - 2, headerData });

            // Top Grid Header (y = 14.5mm to 38mm)
            const hdrTopY = 14.5;
            const dateRowH = 8.0;
            const timeRowH = 15.5;
            const hdrBottomY = hdrTopY + dateRowH + timeRowH; // 38.0mm

            doc.setDrawColor(15, 23, 42);
            doc.setLineWidth(0.55);
            doc.rect(gridLeft, hdrTopY, gridRight - gridLeft, dateRowH + timeRowH);

            doc.setLineWidth(0.38);
            doc.line(gridLeft, hdrTopY + dateRowH, gridRight, hdrTopY + dateRowH);

            // Labels "Date" and "Time" right-aligned in left box
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(15, 23, 42);
            doc.text('Date', slotsStartX - 2.5, hdrTopY + 5.4, { align: 'right' });
            doc.text('Time', slotsStartX - 2.5, hdrTopY + dateRowH + 9.2, { align: 'right' });

            // 4 Date day-group columns + 16 rotated Time Slot headers
            for (let dCol = 0; dCol < 4; dCol++) {
                const dgX = slotsStartX + dCol * dateGroupW;
                doc.setDrawColor(15, 23, 42);
                doc.setLineWidth(dCol === 0 ? 0.48 : 0.42);
                doc.line(dgX, hdrTopY, dgX, hdrBottomY);

                const dateKey = fourDates[dCol];
                if (!isBlank && dateKey) {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8.2);
                    doc.setTextColor(15, 23, 42);
                    doc.text(formatDateDisplay(dateKey), dgX + dateGroupW / 2, hdrTopY + 5.3, { align: 'center' });
                }

                for (let sIdx = 0; sIdx < 4; sIdx++) {
                    const sx = dgX + sIdx * slotColW;
                    if (sIdx > 0) {
                        doc.setDrawColor(30, 41, 59);
                        doc.setLineWidth(0.24);
                        doc.line(sx, hdrTopY + dateRowH, sx, hdrBottomY);
                    }
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.4);
                    doc.setTextColor(15, 23, 42);
                    const slotLabel = DRUG_CHART_TIME_SLOTS[sIdx];
                    const labelLen = doc.getTextWidth(slotLabel);
                    const slotCenterY = hdrTopY + dateRowH + (timeRowH + labelLen) / 2;
                    doc.text(slotLabel, sx + slotColW * 0.62, slotCenterY, { angle: 90 });
                }
            }

            // 12 Repeating Medication Blocks
            const blockStartTopY = 40.5;
            const blockH = 18.4;
            const blockGap = 2.1;

            for (let b = 0; b < DRUG_CHART_MAR_BLOCKS_PER_PAGE; b++) {
                const bTop = blockStartTopY + b * (blockH + blockGap);
                const bMidSubHdrTop = bTop + 8.4;
                const bMidSubValTop = bTop + 12.8;
                const bBottom = bTop + blockH;
                const ord = orderSlice[b] || null;

                // Block outer box border
                doc.setDrawColor(15, 23, 42);
                doc.setLineWidth(0.45);
                doc.rect(gridLeft, bTop, gridRight - gridLeft, blockH);

                // Left section horizontal bands (Drug name top -> Date|Route|Dose|Prescribed by -> values)
                doc.setLineWidth(0.28);
                doc.line(gridLeft, bMidSubHdrTop, slotsStartX, bMidSubHdrTop);
                doc.line(gridLeft, bMidSubValTop, slotsStartX, bMidSubValTop);

                // Subcolumn labels and dividers
                let sxLeft = gridLeft;
                const subLabels = ['Date', 'Route', 'Dose', 'Prescribed by'];
                subLabels.forEach((lbl, sIdx) => {
                    const cw = subColWidths[sIdx];
                    if (sIdx > 0) {
                        doc.setDrawColor(55, 65, 81);
                        doc.setLineWidth(0.24);
                        doc.line(sxLeft, bMidSubHdrTop, sxLeft, bBottom);
                    }
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(6.6);
                    doc.setTextColor(15, 23, 42);
                    doc.text(lbl, sxLeft + cw / 2, bMidSubHdrTop + 3.1, { align: 'center', maxWidth: cw - 1 });
                    sxLeft += cw;
                });

                // Left section actual Order data if present
                if (ord && !isBlank) {
                    const statusSuffix = ['CANCELLED', 'ON_HOLD', 'COMPLETED'].includes(ord.status)
                        ? ` [${ord.status === 'CANCELLED' ? 'DISCONTINUED' : ord.status}]`
                        : '';
                    const medTitle = `${ord.medicineName || ''}${ord.frequency ? ` (${ord.frequency})` : ''}${statusSuffix}`;

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.6);
                    doc.setTextColor(ord.status === 'CANCELLED' ? 127 : 15, ord.status === 'CANCELLED' ? 29 : 23, ord.status === 'CANCELLED' ? 29 : 42);
                    const wrappedTitle = doc.splitTextToSize(medTitle, medInfoW - 3);
                    doc.text(wrappedTitle.slice(0, 2), gridLeft + 1.5, bTop + 3.8);

                    const startStr = ord.startDate ? new Date(ord.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '';
                    const routeStr = ord.route || '';
                    const doseStr = `${ord.dosageValue ?? ord.dosage?.value ?? ''} ${ord.dosageUnit || ord.dosage?.unit || ''}`.trim();
                    const drRaw = ord.doctorId?.name || '';
                    const drStr = drRaw ? (/^dr/i.test(drRaw) ? drRaw : `Dr. ${drRaw}`) : '';
                    const subVals = [startStr, routeStr, doseStr, drStr];

                    let vxLeft = gridLeft;
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(6.3);
                    doc.setTextColor(15, 23, 42);
                    subVals.forEach((sv, sIdx) => {
                        const cw = subColWidths[sIdx];
                        if (sv) {
                            const line = doc.splitTextToSize(sv, cw - 1.5)[0] || '';
                            doc.text(line, vxLeft + cw / 2, bMidSubValTop + 3.9, { align: 'center' });
                        }
                        vxLeft += cw;
                    });
                }

                // Right 16 vertical administration grid cells
                for (let dCol = 0; dCol < 4; dCol++) {
                    const dgX = slotsStartX + dCol * dateGroupW;
                    const dateKey = fourDates[dCol];
                    for (let sIdx = 0; sIdx < 4; sIdx++) {
                        const cx = dgX + sIdx * slotColW;
                        doc.setDrawColor(30, 41, 59);
                        doc.setLineWidth(sIdx === 0 ? 0.42 : 0.22);
                        doc.line(cx, bTop, cx, bBottom);

                        if (ord && !isBlank && dateKey) {
                            const slotName = DRUG_CHART_TIME_SLOTS[sIdx];
                            const mar = marCellLookup.get(`${String(ord._id)}::${dateKey}::${slotName}`);
                            if (mar) {
                                const info = formatMarCellStatus(mar);
                                doc.setFont('helvetica', 'bold');
                                doc.setFontSize(4.8);
                                if (info.code === 'GIVEN') doc.setTextColor(21, 128, 61);
                                else if (info.code === 'HELD') doc.setTextColor(126, 34, 206);
                                else if (info.code === 'REFUSED') doc.setTextColor(185, 28, 28);
                                else if (info.code === 'NOT_GIVEN') doc.setTextColor(71, 85, 105);
                                else doc.setTextColor(180, 83, 9);

                                doc.text(info.shortLabel, cx + slotColW / 2, bTop + 4.4, { align: 'center' });

                                if (info.code === 'GIVEN' && mar.administeredTime) {
                                    doc.setFont('helvetica', 'normal');
                                    doc.setFontSize(5.2);
                                    doc.text(formatShortTime(mar.administeredTime), cx + slotColW / 2, bTop + 8.6, { align: 'center' });
                                }
                                if (mar.actualDose && info.code === 'GIVEN') {
                                    doc.setFontSize(4.9);
                                    const adLine = doc.splitTextToSize(mar.actualDose, slotColW - 0.8)[0] || '';
                                    doc.text(adLine, cx + slotColW / 2, bTop + 12.2, { align: 'center' });
                                }
                                const byName = mar.administeredByName || mar.administeredBy?.name || '';
                                const initials = getStaffInitials(byName);
                                if (initials) {
                                    doc.setFont('helvetica', 'bold');
                                    doc.setFontSize(5.3);
                                    doc.text(initials, cx + slotColW / 2, bTop + 16.0, { align: 'center' });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    const safeName = (ptDetails.name || 'Patient').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeIpd = (ptDetails.ipdNumber || 'IPD').replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(fileName || `Drug_Chart_${safeName}_${safeIpd}.pdf`);
};

/**
 * Open Print Window reproducing exact 2-page (+ continuation sheets) DRUG CHART layout
 */
export const printDrugChart = ({
    hospital = {},
    patient = {},
    admission = {},
    drugChart = {},
    existingAllergies = {},
    orders = [],
    marRecords = [],
    isBlank = false
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

    const bannerHtml = `
        <div class="dc-banner">
            <span>Patient Name : ${escapeHtml(ptDetails.name)}</span>
            <span class="dc-sep">|</span>
            <span>UHID : ${escapeHtml(ptDetails.uhid)}</span>
            <span class="dc-sep">|</span>
            <span>IPD : ${escapeHtml(ptDetails.ipdNumber)}</span>
            <span class="dc-sep">|</span>
            <span>Gender : ${escapeHtml(ptDetails.gender)}</span>
            <span class="dc-sep">|</span>
            <span>Age : ${escapeHtml(ptDetails.age)}</span>
        </div>
    `;

    const allStats = isBlank ? [] : buildCombinedStatRows(drugChart, orders, admission);
    const allIVs = isBlank ? [] : buildCombinedIVFluidRows(drugChart, orders, admission);
    const p1Count = isBlank
        ? 1
        : Math.max(1, Math.ceil(allStats.length / DRUG_CHART_STAT_ROWS_PER_PAGE), Math.ceil(allIVs.length / DRUG_CHART_IV_ROWS_PER_PAGE));

    const allergyObj = drugChart?.drugAllergies || {};
    const suggestionList = Array.isArray(existingAllergies?.combinedSuggestions) ? existingAllergies.combinedSuggestions : [];
    const allergy1 = isBlank ? '' : (allergyObj.slot1 || suggestionList[0] || '');
    const allergy2 = isBlank ? '' : (allergyObj.slot2 || suggestionList[1] || '');
    const baseSheetNo = isBlank ? '' : (allergyObj.sheetNo || '1');

    const page1Html = Array.from({ length: p1Count }, (_, p1) => {
        const statSlice = allStats.slice(p1 * DRUG_CHART_STAT_ROWS_PER_PAGE, (p1 + 1) * DRUG_CHART_STAT_ROWS_PER_PAGE);
        const ivSlice = allIVs.slice(p1 * DRUG_CHART_IV_ROWS_PER_PAGE, (p1 + 1) * DRUG_CHART_IV_ROWS_PER_PAGE);

        return `
            <div class="dc-page page-break">
                ${bannerHtml}
                <div class="dc-letterhead">
                    <div class="dc-logos">
                        ${isAccredited ? `
                            <div class="dc-nabh">
                                <img src="${COMMON_NABH_LOGO_URL}" alt="NABH" />
                                ${certNumber ? `<div class="dc-cert">${escapeHtml(certNumber)}</div>` : ''}
                            </div>
                        ` : ''}
                        <div class="dc-hosp">
                            ${hospitalLogo ? `<img src="${escapeHtml(hospitalLogo)}" alt="${escapeHtml(hospitalName)}" />` : `<div class="dc-hosp-text">${escapeHtml(hospitalName)}</div>`}
                        </div>
                    </div>
                    <div class="dc-info-box">
                        <div class="dc-info-row"><span>Name</span><span class="dc-fill">${escapeHtml(headerData.name)}</span></div>
                        <div class="dc-info-row">
                            <span>Age</span><span class="dc-fill w-sm">${escapeHtml(headerData.age)}</span>
                            <span>Sex</span><span class="dc-fill w-xs">${escapeHtml(headerData.sex)}</span>
                            <span>DOA</span><span class="dc-fill w-sm">${escapeHtml(headerData.doa)}</span>
                        </div>
                        <div class="dc-info-row">
                            <span>Registration No.</span><span class="dc-fill w-md">${escapeHtml(headerData.regdNo)}</span>
                            <span>IPD No</span><span class="dc-fill w-sm">${escapeHtml(headerData.ipdNo)}</span>
                        </div>
                        <div class="dc-info-row"><span>Ward/Bed</span><span class="dc-fill">${escapeHtml(headerData.wardBed)}</span></div>
                        <div class="dc-info-row"><span>Consultant</span><span class="dc-fill">${escapeHtml(headerData.consultant)}</span></div>
                    </div>
                </div>

                <div class="dc-allergy-line">
                    <strong>DRUG ALLERGY :</strong>
                    <span>1.</span><span class="dc-dots">${escapeHtml(allergy1)}</span>
                    <span>2.</span><span class="dc-dots">${escapeHtml(allergy2)}</span>
                    <span>Sheet No.</span><span class="dc-dots sm">${isBlank ? '' : escapeHtml(p1 === 0 ? baseSheetNo : `${baseSheetNo}.${p1 + 1}`)}</span>
                </div>

                <div class="dc-sec-title">ONCE-ONLY PRESCRIPTION (STAT-DOSES)</div>
                <table class="dc-grid-table">
                    <thead>
                        <tr>
                            <th style="width:10%">Date</th>
                            <th style="width:21%">Drug</th>
                            <th style="width:7.5%">Dose</th>
                            <th style="width:7%">Route</th>
                            <th style="width:7%">Time</th>
                            <th style="width:12%">Doctor</th>
                            <th style="width:11.5%">Given By</th>
                            <th style="width:11.5%">Checked by</th>
                            <th style="width:12.5%">Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Array.from({ length: DRUG_CHART_STAT_ROWS_PER_PAGE }, (_, r) => {
                            const s = statSlice[r];
                            return `<tr>
                                <td class="c">${s ? escapeHtml(s.date) : ''}</td>
                                <td>${s ? escapeHtml(s.drugName) : ''}</td>
                                <td class="c">${s ? escapeHtml(s.dose) : ''}</td>
                                <td class="c">${s ? escapeHtml(s.route) : ''}</td>
                                <td class="c">${s ? escapeHtml(s.time) : ''}</td>
                                <td>${s ? escapeHtml(s.doctorName) : ''}</td>
                                <td>${s ? escapeHtml(s.givenByName) : ''}</td>
                                <td>${s ? escapeHtml(s.checkedByName) : ''}</td>
                                <td>${s ? escapeHtml(s.remarks || (s.status === 'PENDING' ? 'Pending' : s.status || '')) : ''}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>

                <div class="dc-sec-title" style="margin-top:8px;">I.V. FLUIDS</div>
                <table class="dc-grid-table iv-table">
                    <thead>
                        <tr>
                            <th style="width:10%">Date</th>
                            <th style="width:23.5%">Fluid</th>
                            <th style="width:8.5%">Volume</th>
                            <th style="width:9%">Time Start</th>
                            <th style="width:11.5%">Infusion<br/>time(hrs.)</th>
                            <th style="width:11.5%">Doctor</th>
                            <th style="width:11.5%">Admin.by</th>
                            <th style="width:14.5%">Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Array.from({ length: DRUG_CHART_IV_ROWS_PER_PAGE }, (_, r) => {
                            const iv = ivSlice[r];
                            return `<tr>
                                <td class="c">${iv ? escapeHtml(iv.date) : ''}</td>
                                <td>${iv ? escapeHtml(iv.fluidName) : ''}</td>
                                <td class="c">${iv ? escapeHtml(iv.volume) : ''}</td>
                                <td class="c">${iv ? escapeHtml(iv.timeStart) : ''}</td>
                                <td class="c">${iv ? escapeHtml(iv.infusionTimeHrs) : ''}</td>
                                <td>${iv ? escapeHtml(iv.doctorName) : ''}</td>
                                <td>${iv ? escapeHtml(iv.adminByName) : ''}</td>
                                <td>${iv ? escapeHtml(iv.remarks || '') : ''}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }).join('');

    const marCellLookup = new Map();
    if (!isBlank) {
        (Array.isArray(marRecords) ? marRecords : []).forEach((m) => {
            const ordId = String(m.orderId?._id || m.orderId || '');
            const dKey = m.scheduledDateKey || toLocalDateKey(m.scheduledTime);
            const slot = mapScheduledTimeToDrugChartSlot(m);
            if (!ordId || !dKey || !slot) return;
            const composite = `${ordId}::${dKey}::${slot}`;
            const existing = marCellLookup.get(composite);
            const completed = ['ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN'];
            if (!existing || completed.includes(String(m.status).toUpperCase())) {
                marCellLookup.set(composite, m);
            }
        });
    }

    const marOrders = isBlank
        ? []
        : (Array.isArray(orders) ? orders : []).filter(o => {
            const isStat = String(o.frequency || '').toUpperCase().trim() === 'STAT';
            if (!isStat) return true;
            return (Array.isArray(marRecords) ? marRecords : []).some(m => String(m.orderId?._id || m.orderId) === String(o._id));
        });

    const dateWindows = isBlank ? [['', '', '', '']] : buildDrugChartDateWindows({ admission, orders: marOrders, marRecords });
    const orderChunksCount = isBlank ? 1 : Math.max(1, Math.ceil(marOrders.length / DRUG_CHART_MAR_BLOCKS_PER_PAGE));

    const p2Pages = [];
    for (let dc = 0; dc < dateWindows.length; dc++) {
        for (let oc = 0; oc < orderChunksCount; oc++) {
            p2Pages.push({ fourDates: dateWindows[dc], orderSlice: marOrders.slice(oc * DRUG_CHART_MAR_BLOCKS_PER_PAGE, (oc + 1) * DRUG_CHART_MAR_BLOCKS_PER_PAGE) });
        }
    }

    const page2BannerHtml = `
        <div class="dc-banner dc-banner-p2">
            <span>Patient Name : ${escapeHtml(ptDetails.name)}</span>
            <span>UHID : ${escapeHtml(ptDetails.uhid)}</span>
            <span>IPD : ${escapeHtml(ptDetails.ipdNumber)}</span>
            <span>Gender : ${escapeHtml(ptDetails.gender)}</span>
            <span>Age : ${escapeHtml(ptDetails.age)}</span>
        </div>
    `;

    const marColGroupHtml = `
        <colgroup>
            ${DRUG_CHART_PAGE2_SUBCOLS_MM.map(w => `<col style="width:${w}mm;" />`).join('')}
            ${Array.from({ length: 16 }, () => `<col style="width:${DRUG_CHART_PAGE2_SLOT_MM}mm;" />`).join('')}
        </colgroup>
    `;

    const page2Html = p2Pages.map((pg, idx) => `
        <div class="dc-page ${idx < p2Pages.length - 1 ? 'page-break' : ''}">
            ${page2BannerHtml}
            <table class="dc-mar-header-table">
                ${marColGroupHtml}
                <tr>
                    <td colspan="4" class="mar-lbl-cell">Date</td>
                    ${pg.fourDates.map(d => `<td colspan="4" class="mar-date-cell">${isBlank || !d ? '' : escapeHtml(formatDateDisplay(d))}</td>`).join('')}
                </tr>
                <tr>
                    <td colspan="4" class="mar-lbl-cell" style="height:15.5mm;">Time</td>
                    ${pg.fourDates.map(() => DRUG_CHART_TIME_SLOTS.map(s => `<td class="mar-slot-hdr"><span>${s}</span></td>`).join('')).join('')}
                </tr>
            </table>
            ${Array.from({ length: DRUG_CHART_MAR_BLOCKS_PER_PAGE }, (_, bIdx) => {
                const ord = pg.orderSlice[bIdx] || null;
                const startStr = ord?.startDate ? new Date(ord.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '';
                const doseStr = ord ? `${ord.dosageValue ?? ord.dosage?.value ?? ''} ${ord.dosageUnit || ord.dosage?.unit || ''}`.trim() : '';
                const drRaw = ord?.doctorId?.name || '';
                const drStr = drRaw ? (/^dr/i.test(drRaw) ? drRaw : `Dr. ${drRaw}`) : '';

                return `
                    <table class="dc-mar-block">
                        ${marColGroupHtml}
                        <tr>
                            <td colspan="4" class="mar-med-name">${ord ? escapeHtml(`${ord.medicineName || ''}${ord.status === 'CANCELLED' ? ' [DISCONTINUED]' : ''}`) : ''}</td>
                            ${pg.fourDates.map((dKey) => DRUG_CHART_TIME_SLOTS.map((slotName, sIdx) => {
                                const mar = (ord && dKey) ? marCellLookup.get(`${String(ord._id)}::${dKey}::${slotName}`) : null;
                                const st = mar ? formatMarCellStatus(mar) : null;
                                return `<td rowspan="3" class="mar-slot-cell ${sIdx === 0 ? 'day-edge' : ''}">
                                    ${st ? `<div style="color:${st.color};font-weight:700;font-size:6.8px;">${escapeHtml(st.shortLabel)}</div>` : ''}
                                    ${mar?.administeredTime && st?.code === 'GIVEN' ? `<div style="font-size:6.5px;">${escapeHtml(formatShortTime(mar.administeredTime))}</div>` : ''}
                                    ${mar?.administeredByName || mar?.administeredBy?.name ? `<div style="font-size:6.5px;font-weight:700;">${escapeHtml(getStaffInitials(mar.administeredByName || mar.administeredBy?.name))}</div>` : ''}
                                </td>`;
                            }).join('')).join('')}
                        </tr>
                        <tr>
                            <th>Date</th>
                            <th>Route</th>
                            <th>Dose</th>
                            <th>Prescribed by</th>
                        </tr>
                        <tr>
                            <td class="sub-val">${escapeHtml(startStr)}</td>
                            <td class="sub-val">${ord ? escapeHtml(ord.route || '') : ''}</td>
                            <td class="sub-val">${escapeHtml(doseStr)}</td>
                            <td class="sub-val">${escapeHtml(drStr)}</td>
                        </tr>
                    </table>
                `;
            }).join('')}
        </div>
    `).join('');

    const win = window.open('', '_blank', 'width=940,height=1050');
    if (!win) return;

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Drug Chart - ${escapeHtml(ptDetails.name)}</title>
            <style>
                @page { size: A4 portrait; margin: 8mm; }
                * { box-sizing: border-box; }
                body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; }
                .no-print-bar {
                    background: #0f766e; color: #fff; padding: 10px 16px; text-align: center;
                    font-weight: 700; cursor: pointer; font-size: 13px;
                }
                .dc-page { width: 194mm; margin: 0 auto; padding: 2mm 0; background: #fff; }
                .page-break { page-break-after: always; }
                .dc-banner {
                    font-family: Georgia, 'Times New Roman', serif;
                    font-size: 12px; color: #2563eb; margin-bottom: 5px;
                    display: flex; flex-wrap: wrap; align-items: center;
                }
                .dc-banner .dc-sep { margin: 0 8px; color: #64748b; }
                .dc-letterhead { display: flex; justify-content: space-between; align-items: stretch; gap: 8px; margin-bottom: 6px; }
                .dc-logos { flex: 1; display: flex; align-items: center; gap: 12px; padding: 3px 0; }
                .dc-nabh { text-align: center; flex-shrink: 0; }
                .dc-nabh img { height: 50px; width: auto; display: block; margin: 0 auto; }
                .dc-cert { color: #b91c1c; font-weight: 700; font-size: 8px; margin-top: 2px; }
                .dc-hosp { flex: 1; display: flex; justify-content: center; align-items: center; }
                .dc-hosp img { max-height: 58px; max-width: 240px; object-fit: contain; }
                .dc-hosp-text { font-family: Georgia, serif; font-size: 20px; font-weight: 700; }
                .dc-info-box {
                    width: 85mm; border: 1.5px solid #111827; padding: 4px 8px;
                    display: flex; flex-direction: column; justify-content: space-between; font-size: 10px;
                }
                .dc-info-row { display: flex; align-items: baseline; gap: 4px; line-height: 1.4; }
                .dc-fill { flex: 1; border-bottom: 1px solid #374151; font-weight: 700; min-height: 12px; padding: 0 3px; }
                .dc-fill.w-xs { flex: 0.7; }
                .dc-fill.w-sm { flex: 1; }
                .dc-fill.w-md { flex: 1.4; }
                .dc-allergy-line {
                    display: flex; align-items: baseline; gap: 6px; font-size: 11px; margin: 6px 0 8px; font-weight: 700;
                }
                .dc-dots { flex: 1; border-bottom: 1.4px dotted #334155; color: #b91c1c; min-height: 13px; padding: 0 4px; }
                .dc-dots.sm { flex: 0.55; color: #0f172a; }
                .dc-sec-title { text-align: center; font-weight: 700; font-size: 12px; margin-bottom: 3px; }
                .dc-grid-table { width: 100%; border-collapse: collapse; border: 1px solid #111827; border-top: 2px solid #111827; }
                .dc-grid-table th, .dc-grid-table td {
                    border: 1px solid #334155; padding: 2px 3px; font-size: 9.5px; height: 6mm;
                }
                .dc-grid-table.iv-table td { height: 6.9mm; }
                .dc-grid-table th { font-size: 10px; font-weight: 700; text-align: center; height: 7.5mm; }
                .dc-grid-table td.c { text-align: center; }
                .dc-banner-p2 {
                    flex-wrap: nowrap; justify-content: space-between; gap: 10px;
                    font-size: clamp(9.5px, 1.45vw, 12px); color: #1d4ed8;
                    white-space: nowrap; overflow: hidden;
                }
                .dc-mar-header-table { width: 192mm; border-collapse: collapse; table-layout: fixed; border: 1.6px solid #0f172a; margin-bottom: 2mm; }
                .dc-mar-header-table td { border: 1px solid #0f172a; text-align: center; font-weight: 700; overflow: hidden; }
                .mar-lbl-cell { text-align: right !important; padding-right: 6px; font-size: 11px; height: 8mm; }
                .mar-date-cell { font-size: 9.5px; white-space: nowrap; }
                .mar-slot-hdr { height: 15.5mm; vertical-align: middle; text-align: center; }
                .mar-slot-hdr span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 8.8px; font-weight: 700; display: inline-block; line-height: 1; }
                .dc-mar-block { width: 192mm; border-collapse: collapse; border: 1.4px solid #0f172a; margin-bottom: 1.9mm; table-layout: fixed; }
                .dc-mar-block th, .dc-mar-block td { border: 1px solid #334155; padding: 1px 2px; font-size: 8.2px; overflow: hidden; }
                .mar-med-name { height: 7.8mm; font-weight: 700; font-size: 9.2px !important; vertical-align: top; padding: 2px 4px !important; }
                .dc-mar-block th { height: 4.2mm; font-size: 7.4px; text-align: center; white-space: nowrap; }
                .sub-val { height: 5.2mm; text-align: center; font-size: 7.8px !important; word-break: break-word; }
                .mar-slot-cell { text-align: center; vertical-align: middle; line-height: 1.15; }
                .mar-slot-cell.day-edge { border-left: 1.4px solid #0f172a !important; }
                @media print { .no-print-bar { display: none; } .dc-page { width: 100%; } }
            </style>
        </head>
        <body>
            <div class="no-print-bar" onclick="window.print()">Click Here to Print / Save PDF</div>
            ${page1Html}
            ${page2Html}
        </body>
        </html>
    `);
    win.document.close();
};

