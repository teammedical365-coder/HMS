import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Shared static asset path for the single Medical365-wide common NABH PNG seal.
 * Individual hospitals cannot upload/override this file; visibility is controlled
 * exclusively by Central Admin per hospital.
 */
export const COMMON_NABH_LOGO_URL = '/assets/nabh-logo.png';

/**
 * Shared 10-column proportions matching VITAL CHART.pdf reference sheet (sum = 186mm on A4 with 12mm margins)
 */
export const TPR_COLUMN_DEFS = [
    { key: 'date', label: 'Date', widthMm: 18.5, pct: '10.0%', align: 'center' },
    { key: 'time', label: 'Time', widthMm: 16.5, pct: '8.8%', align: 'center' },
    { key: 'bp', label: 'BP', widthMm: 16.2, pct: '8.7%', align: 'center' },
    { key: 'temp', label: 'Temp.', widthMm: 16.5, pct: '8.8%', align: 'center' },
    { key: 'pulse', label: 'Pulse', widthMm: 16.2, pct: '8.7%', align: 'center' },
    { key: 'rr', label: 'RR', widthMm: 16.2, pct: '8.7%', align: 'center' },
    { key: 'input', label: 'Input', widthMm: 16.2, pct: '8.7%', align: 'center' },
    { key: 'output', label: 'Output', widthMm: 16.5, pct: '8.8%', align: 'center' },
    { key: 'remark', label: 'Remark', widthMm: 21.0, pct: '11.3%', align: 'left' },
    { key: 'emp', label: 'Emp. Name & ID', widthMm: 32.2, pct: '17.5%', align: 'left' }
];

export const escapeHtml = (val) => {
    if (val === undefined || val === null) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

export const sanitizeImageUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (
        trimmed.startsWith('https://') ||
        trimmed.startsWith('http://') ||
        trimmed.startsWith('data:image/') ||
        trimmed.startsWith('/')
    ) {
        return trimmed;
    }
    return '';
};

/**
 * Parse DOB strings flexibly (ISO, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or timestamps)
 */
export const parseFlexibleDate = (rawVal) => {
    if (!rawVal) return null;
    if (rawVal instanceof Date) return isNaN(rawVal.getTime()) ? null : rawVal;
    if (typeof rawVal === 'number') {
        const dt = new Date(rawVal);
        return isNaN(dt.getTime()) ? null : dt;
    }

    const str = String(rawVal).trim();
    if (!str) return null;

    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
        const day = Number(dmy[1]);
        const month = Number(dmy[2]);
        const year = Number(dmy[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2150) {
            const dt = new Date(year, month - 1, day);
            if (!isNaN(dt.getTime()) && dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day) {
                return dt;
            }
        }
    }

    // YYYY-MM-DD (avoid timezone off-by-one)
    const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (ymd) {
        const year = Number(ymd[1]);
        const month = Number(ymd[2]);
        const day = Number(ymd[3]);
        const dt = new Date(year, month - 1, day);
        if (!isNaN(dt.getTime())) return dt;
    }

    const dt = new Date(str);
    return isNaN(dt.getTime()) ? null : dt;
};

/**
 * Format patient age in the exact "Y Y, M M, D D" or "Y Y" format
 */
export const formatPatientAge = (patient) => {
    if (!patient) return '—';
    if (typeof patient === 'string') return patient;

    const pt = (patient.patientId && typeof patient.patientId === 'object') ? patient.patientId : patient;
    const rawDob = pt.dob || pt.dateOfBirth || pt.birthDate || patient.dob || patient.dateOfBirth || patient.birthDate;
    const bDate = parseFlexibleDate(rawDob);
    if (bDate) {
        const now = new Date();
        let y = now.getFullYear() - bDate.getFullYear();
        let m = now.getMonth() - bDate.getMonth();
        let d = now.getDate() - bDate.getDate();
        if (d < 0) {
            m -= 1;
            const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
            d += prevMonthLastDay;
        }
        if (m < 0) {
            y -= 1;
            m += 12;
        }
        if (y >= 0) {
            return `${y} Y, ${m} M, ${d} D`;
        }
    }

    const fallbackAge = pt.age ?? patient.age;
    if (fallbackAge !== undefined && fallbackAge !== null && fallbackAge !== '') {
        const ageStr = String(fallbackAge).trim();
        if (/[a-zA-Z]/.test(ageStr)) return ageStr;
        return `${ageStr} Y`;
    }
    return '—';
};

/**
 * Resolve patient & admission metadata consistently across Preview, Print, and PDF
 */
export const resolvePatientChartDetails = ({ patient = {}, admission = {}, isBlank = false } = {}) => {
    if (isBlank) {
        return {
            name: '_________________________',
            uhid: '___________',
            ipdNumber: '___________',
            gender: '_________',
            age: '____________',
            isBlank: true
        };
    }

    const ptRecord = patient || {};
    const admPtRecord = (admission && typeof admission.patientId === 'object' && admission.patientId) || {};

    const name = ptRecord.name || admPtRecord.name || '—';
    const uhid =
        ptRecord.uhid ||
        ptRecord.patientId ||
        ptRecord.mrn ||
        admPtRecord.uhid ||
        admPtRecord.patientId ||
        admPtRecord.mrn ||
        '—';
    const ipdNumber =
        admission?.ipdNumber ||
        admission?.admissionNumber ||
        (admission?._id ? String(admission._id).slice(-6).toUpperCase() : '—');
    const gender = ptRecord.gender || ptRecord.sex || admPtRecord.gender || admPtRecord.sex || '—';

    const dobSource =
        ptRecord.dob || ptRecord.dateOfBirth || ptRecord.birthDate
            ? ptRecord
            : (admPtRecord.dob || admPtRecord.dateOfBirth || admPtRecord.birthDate ? admPtRecord : ptRecord);
    const age = formatPatientAge(dobSource);

    return {
        name,
        uhid,
        ipdNumber,
        gender,
        age,
        dob: dobSource?.dob || dobSource?.dateOfBirth || dobSource?.birthDate || null,
        rawAge: ptRecord.age ?? admPtRecord.age ?? null
    };
};

/**
 * Resolve tenant hospital branding strictly scoped to the authenticated tenant.
 * Prevents platform defaults ('Medical 365', 'Healthcare Suite', '/assets/logo.png') or cross-tenant bleed.
 */
export const resolveHospitalChartBranding = ({
    tenantHospital = null,
    branding = {},
    brandingHospitalName = '',
    user = null
} = {}) => {
    const authHospitalId = user?.hospitalId ? String(user.hospitalId) : null;
    const fetchedHospitalId = (tenantHospital?.id || tenantHospital?._id)
        ? String(tenantHospital.id || tenantHospital._id)
        : null;
    const ctxHospitalId = branding?.hospitalId ? String(branding.hospitalId) : null;

    const validTenantDoc =
        tenantHospital && (!authHospitalId || !fetchedHospitalId || fetchedHospitalId === authHospitalId)
            ? tenantHospital
            : null;

    const validCtxBranding =
        branding && (!authHospitalId || !ctxHospitalId || ctxHospitalId === authHospitalId)
            ? branding
            : {};

    const fetchedB = validTenantDoc?.branding || {};
    const fetchedBS = validTenantDoc?.brandingSchema || {};

    const cleanPlatformDefault = (val, platformVals) => {
        if (!val || typeof val !== 'string') return '';
        const trimmed = val.trim();
        return platformVals.includes(trimmed) ? '' : trimmed;
    };

    const rawCtxName = cleanPlatformDefault(validCtxBranding.appName, ['Medical 365']);
    const rawCtxHospitalName = cleanPlatformDefault(brandingHospitalName, ['Medical 365']);

    const name =
        fetchedB.appName?.trim() ||
        fetchedBS.appName?.trim() ||
        validTenantDoc?.name?.trim() ||
        rawCtxName ||
        rawCtxHospitalName ||
        user?.hospitalName?.trim() ||
        'Hospital';

    const ctxLogo = cleanPlatformDefault(validCtxBranding.logoUrl || validCtxBranding.logo, ['/assets/logo.png']);
    const logoUrl = sanitizeImageUrl(
        fetchedB.logoUrl ||
        fetchedBS.logoUrl ||
        validTenantDoc?.logo ||
        ctxLogo ||
        user?.hospitalLogo ||
        ''
    );

    // Format verified Certificate Number cleanly when configured by Central Admin
    const formatCertNumber = (rawCert) => {
        if (!rawCert) return '';
        const cleaned = String(rawCert).trim();
        if (!cleaned) return '';
        return /^cert\.?\s*no/i.test(cleaned) ? cleaned : `Cert. No. : ${cleaned}`;
    };

    // Accreditation shown strictly when enabled by Central Admin for THIS hospital.
    // Ignore any unverified/deprecated sub-fields inside brandingSchema.
    const authoritativeAcc =
        validTenantDoc?.accreditation !== undefined
            ? validTenantDoc.accreditation
            : validCtxBranding?.accreditation;

    const isAccredited = authoritativeAcc?.enabled === true;
    const accCertNo = isAccredited ? formatCertNumber(authoritativeAcc?.certNo) : '';
    const accLogo = isAccredited ? COMMON_NABH_LOGO_URL : '';

    return {
        name,
        logoUrl,
        tagline: '',
        contactLine: '',
        accreditation: {
            enabled: isAccredited,
            certNo: accCertNo,
            logoUrl: accLogo
        }
    };
};

const isSameOriginAssetUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('/')) return true;
    if (typeof window !== 'undefined' && window.location?.origin) {
        return url.startsWith(window.location.origin);
    }
    return false;
};

const rasterizeImageToPng = (img) => {
    try {
        if (typeof document !== 'undefined') {
            const w = img.naturalWidth || img.width || 200;
            const h = img.naturalHeight || img.height || 200;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Fill white base so alpha-transparent PNGs always render crisply inside jsPDF
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/png');
                return { dataUrl, naturalWidth: w, naturalHeight: h };
            }
        }
    } catch (_) {}
    return null;
};

const loadImageViaElement = (src, useCrossOrigin) => {
    return new Promise((resolve) => {
        if (!src || typeof Image === 'undefined') return resolve(null);
        const img = new Image();
        if (useCrossOrigin) {
            img.crossOrigin = 'Anonymous';
        }
        img.onload = () => {
            const rasterized = rasterizeImageToPng(img);
            resolve(rasterized || img);
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
};

export const loadImageForPdf = async (url) => {
    if (!url) return null;

    if (url.startsWith('data:image/')) {
        return await loadImageViaElement(url, false);
    }

    // For same-origin static assets (e.g. /assets/nabh-logo.png), fetch via Blob first so
    // non-CORS <img> HTTP cache entries never cause canvas/CORS errors on PDF generation.
    if (isSameOriginAssetUrl(url) && typeof fetch === 'function') {
        try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) {
                const blob = await res.blob();
                const objUrl = URL.createObjectURL(blob);
                try {
                    const loaded = await loadImageViaElement(objUrl, false);
                    if (loaded) return loaded;
                } finally {
                    URL.revokeObjectURL(objUrl);
                }
            }
        } catch (_) {}
        return await loadImageViaElement(url, false);
    }

    const withCors = await loadImageViaElement(url, true);
    if (withCors) return withCors;

    // Retry external image without CORS header if server blocks preflight
    return await loadImageViaElement(url, false);
};

/**
 * Draw formatted patient demographic banner in pleasant light blue with light slate/black "|" dividers.
 */
export const drawPatientBannerPdf = (doc, ptDetails = {}, { x = 14, y = 10.5, maxWidth = 182, headerData = {} } = {}) => {
    const doa = headerData?.doa || ptDetails.doa || '—';
    const wardBed = headerData?.wardBed || ptDetails.wardBed || '—';
    const consultant = headerData?.consultant || ptDetails.consultant || '—';
    const segments = [
        `Patient Name : ${ptDetails.name || '—'}`,
        `MRN : ${ptDetails.uhid || '—'}`,
        `IPD : ${ptDetails.ipdNumber || '—'}`,
        `Age : ${ptDetails.age || '—'}`,
        `Sex : ${ptDetails.gender || '—'}`,
        `DOA : ${doa}`,
        `Ward/Bed : ${wardBed}`,
        `Consultant : ${consultant}`
    ];

    doc.setFont('times', 'normal');
    let fontSize = 9;
    doc.setFontSize(fontSize);

    const sepStr = '  |  ';
    const fullStr = segments.join(sepStr);
    const totalW = doc.getTextWidth(fullStr);
    if (totalW > maxWidth && totalW > 0) {
        fontSize = Math.max(6.5, (fontSize * maxWidth) / totalW);
        doc.setFontSize(fontSize);
    }

    const sepW = doc.getTextWidth(sepStr);
    let cursorX = x;
    segments.forEach((seg, idx) => {
        doc.setTextColor(37, 99, 235); // Soft light royal blue (#2563eb)
        doc.text(seg, cursorX, y);
        cursorX += doc.getTextWidth(seg);

        if (idx < segments.length - 1) {
            doc.setTextColor(100, 116, 139); // Soft muted slate-black (#64748b)
            doc.text(sepStr, cursorX, y);
            cursorX += sepW;
        }
    });
};

const extractStaffDisplay = (recordedBy) => {
    if (!recordedBy) return '';
    if (typeof recordedBy === 'object') {
        const staffName = (recordedBy.name || '').trim() || 'Staff';
        const staffId = (recordedBy.employeeId || recordedBy.staffId || recordedBy.empId || '').trim();
        return staffId ? `${staffName} (${staffId})` : staffName;
    }
    return String(recordedBy).trim();
};

const extractActualRemark = (...candidates) => {
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
};

/**
 * Merge Vitals and Intake/Output records into unified rows sorted chronologically.
 * Strictly maps only actual recorded remarks/observations (never auto-injects SpO2 or I/O source).
 */
export const mergeTPRRecords = (vitalsList = [], intakeOutputList = []) => {
    const rows = [];

    // 1. Process Vitals
    vitalsList.forEach(v => {
        const dt = new Date(v.recordedAt || v.createdAt);
        const validDt = !isNaN(dt.getTime());
        const dateStr = validDt ? dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        const timeStr = validDt ? dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

        let bpStr = '';
        if (v.systolicBP || v.diastolicBP) {
            bpStr = `${v.systolicBP || ''}${v.diastolicBP ? '/' + v.diastolicBP : ''}`;
        }

        const empDisplay = extractStaffDisplay(v.recordedBy);
        const actualRemark = extractActualRemark(v.remark, v.remarks, v.notes, v.observation);

        rows.push({
            timestamp: validDt ? dt.getTime() : 0,
            date: dateStr,
            time: timeStr,
            bp: bpStr,
            temp: v.temperature !== undefined && v.temperature !== null && v.temperature !== '' ? `${v.temperature}\u00b0F` : '',
            pulse: v.pulse !== undefined && v.pulse !== null && v.pulse !== '' ? String(v.pulse) : '',
            rr: v.respiratoryRate !== undefined && v.respiratoryRate !== null && v.respiratoryRate !== '' ? String(v.respiratoryRate) : '',
            input: '',
            output: '',
            remark: actualRemark,
            emp: empDisplay
        });
    });

    // 2. Process Fluid Intake / Output
    intakeOutputList.forEach(io => {
        const dt = new Date(io.recordedAt || io.createdAt);
        const validDt = !isNaN(dt.getTime());
        const dateStr = validDt ? dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        const timeStr = validDt ? dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

        const isIntake = io.category === 'INTAKE';
        const formattedAmount = `${io.amount} ${io.unit || 'ml'}`;
        const detail = io.type ? `${io.type}: ${formattedAmount}` : formattedAmount;
        const empDisplay = extractStaffDisplay(io.recordedBy);
        const actualIoRemark = extractActualRemark(io.remark, io.remarks, io.notes);

        // Try matching with an existing vital entry within 10 minutes
        const ts = validDt ? dt.getTime() : 0;
        const match = validDt
            ? rows.find(r => r.timestamp > 0 && Math.abs(r.timestamp - ts) <= 10 * 60 * 1000)
            : null;

        if (match) {
            if (isIntake) {
                match.input = match.input ? `${match.input}, ${detail}` : detail;
            } else {
                match.output = match.output ? `${match.output}, ${detail}` : detail;
            }
            if (actualIoRemark) {
                if (!match.remark) {
                    match.remark = actualIoRemark;
                } else if (!match.remark.includes(actualIoRemark)) {
                    match.remark = `${match.remark}; ${actualIoRemark}`;
                }
            }
            if (!match.emp && empDisplay) {
                match.emp = empDisplay;
            }
        } else {
            rows.push({
                timestamp: ts,
                date: dateStr,
                time: timeStr,
                bp: '',
                temp: '',
                pulse: '',
                rr: '',
                input: isIntake ? detail : '',
                output: !isIntake ? detail : '',
                remark: actualIoRemark,
                emp: empDisplay
            });
        }
    });

    rows.sort((a, b) => a.timestamp - b.timestamp);
    return rows;
};

/**
 * Generate and download TPR Chart PDF matching the exact VITAL CHART.pdf visual layout
 */
export const downloadTPRChartPdf = async ({
    hospital = {},
    patient = {},
    admission = {},
    vitals = [],
    intakeOutput = [],
    isBlank = false
}) => {
    try {
        const JsPDFCtor = typeof jsPDF === 'function' ? jsPDF : jsPDF?.jsPDF;
        const doc = new JsPDFCtor({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = 210;
        const pageHeight = 297;
        const marginLeft = 12;
        const marginRight = 12;
        const marginBottom = 12;
        const printableWidth = pageWidth - marginLeft - marginRight; // 186mm
        const fixedTableTopY = 44;

        const ptDetails = resolvePatientChartDetails({ patient, admission, isBlank });
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

        const drawHeader = () => {
            // 1. Top Patient Details Line in pleasant light blue with subtle "|" dividers
            drawPatientBannerPdf(doc, ptDetails, {
                x: marginLeft + 2,
                y: 10.5,
                maxWidth: printableWidth - 4
            });

            // 2. Left side: Common NABH PNG seal & verified certificate number ONLY when Central Admin enabled it
            if (isAccredited) {
                if (accredImg) {
                    try {
                        const aspect = accredImg.naturalWidth && accredImg.naturalHeight
                            ? accredImg.naturalWidth / accredImg.naturalHeight
                            : 1.25;
                        const hMm = 17;
                        const wMm = Math.min(26, hMm * aspect);
                        doc.addImage(accredImg.dataUrl || accredImg, 'PNG', marginLeft + 2, 15, wMm, hMm);
                        if (certNumber) {
                            doc.setTextColor(185, 28, 28);
                            doc.setFont('helvetica', 'bold');
                            doc.setFontSize(6.5);
                            doc.text(certNumber, marginLeft + 2 + wMm / 2, 34.5, { align: 'center' });
                        }
                    } catch (_) {}
                } else if (certNumber) {
                    doc.setTextColor(185, 28, 28);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.text(certNumber, marginLeft + 2, 24);
                }
            }

            // 3. Right side: Show ONLY the hospital's configured logo (clean, balanced, right-aligned).
            // Fall back to hospital name text ONLY if no hospital logo URL is configured/loadable.
            const rightEdge = pageWidth - marginRight - 1;
            let logoRendered = false;
            if (hospImg) {
                try {
                    const maxLogoH = 17.5;
                    const maxLogoW = printableWidth * 0.48;
                    const aspect = hospImg.naturalWidth && hospImg.naturalHeight
                        ? hospImg.naturalWidth / hospImg.naturalHeight
                        : 2.2;
                    let drawH = maxLogoH;
                    let drawW = drawH * aspect;
                    if (drawW > maxLogoW) {
                        drawW = maxLogoW;
                        drawH = drawW / aspect;
                    }
                    const logoX = rightEdge - drawW;
                    const logoY = 14.5 + (maxLogoH - drawH) / 2;
                    doc.addImage(hospImg.dataUrl || hospImg, 'PNG', logoX, logoY, drawW, drawH);
                    logoRendered = true;
                } catch (_) {}
            }

            if (!logoRendered) {
                doc.setFont('times', 'bold');
                let nameFontSize = 21;
                doc.setFontSize(nameFontSize);
                let nameWidth = doc.getTextWidth(hospitalName);
                const maxNameAreaWidth = printableWidth * 0.56;
                if (nameWidth > maxNameAreaWidth && nameWidth > 0) {
                    nameFontSize = Math.max(12, Math.floor((nameFontSize * maxNameAreaWidth) / nameWidth));
                    doc.setFontSize(nameFontSize);
                }
                doc.setTextColor(15, 23, 42);
                doc.text(hospitalName, rightEdge, 24.5, { align: 'right' });
            }

            // 4. Centered Heading: "TPR – CHART" right above table top line
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('TPR \u2013 CHART', pageWidth / 2, fixedTableTopY - 1.5, { align: 'center' });
        };

        drawHeader();

        const mergedRecords = isBlank ? [] : mergeTPRRecords(vitals, intakeOutput);
        const tableRows = mergedRecords.length > 0
            ? mergedRecords.map(rec => [
                rec.date,
                rec.time,
                rec.bp,
                rec.temp,
                rec.pulse,
                rec.rr,
                rec.input,
                rec.output,
                rec.remark,
                rec.emp
            ])
            : [['', '', '', '', '', '', '', '', '', '']];

        const columnStyles = {};
        TPR_COLUMN_DEFS.forEach((col, idx) => {
            columnStyles[idx] = { cellWidth: col.widthMm, halign: col.align };
        });

        const drawExactReferenceGrid = (data) => {
            const headerRow = data.table?.head?.[0];
            const headerTopY = headerRow?.cells?.[0]?.y ?? fixedTableTopY;
            const headerHeight = headerRow?.height ?? 8.5;
            const headerBottomY = headerTopY + headerHeight;
            const gridBottomY = Math.max(data.cursor?.y || headerBottomY, pageHeight - marginBottom);

            doc.setDrawColor(40, 40, 40);
            doc.setLineWidth(0.26);

            // Top line, header separator line, and bottom closing line (no outer left/right borders)
            doc.line(marginLeft, headerTopY, marginLeft + printableWidth, headerTopY);
            doc.line(marginLeft, headerBottomY, marginLeft + printableWidth, headerBottomY);
            doc.line(marginLeft, gridBottomY, marginLeft + printableWidth, gridBottomY);

            // Continuous 9 inner vertical column dividers running top to bottom
            let curX = marginLeft;
            for (let i = 0; i < TPR_COLUMN_DEFS.length - 1; i++) {
                curX += TPR_COLUMN_DEFS[i].widthMm;
                doc.line(curX, headerTopY, curX, gridBottomY);
            }
        };

        autoTable(doc, {
            startY: fixedTableTopY,
            head: [TPR_COLUMN_DEFS.map(c => c.label)],
            body: tableRows,
            theme: 'plain',
            rowPageBreak: 'avoid',
            margin: { left: marginLeft, right: marginRight, top: fixedTableTopY, bottom: marginBottom + 3 },
            tableWidth: printableWidth,
            styles: {
                lineWidth: 0,
                textColor: [0, 0, 0],
                font: 'times',
                fontSize: 8,
                cellPadding: { top: 1.8, bottom: 1.8, left: 1.2, right: 1.2 },
                valign: 'top',
                minCellHeight: 6.5
            },
            headStyles: {
                fillColor: false,
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                font: 'helvetica',
                fontSize: 8.5,
                lineWidth: 0,
                halign: 'center',
                valign: 'middle',
                minCellHeight: 8.5,
                cellPadding: { top: 2, bottom: 2, left: 1, right: 1 }
            },
            columnStyles,
            didDrawPage: (data) => {
                if (data.pageNumber > 1) {
                    drawHeader();
                }
                drawExactReferenceGrid(data);
            }
        });

        const cleanPtName = (isBlank ? 'Blank' : ptDetails.name).replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanIpd = (isBlank ? 'Template' : ptDetails.ipdNumber).replace(/[^a-zA-Z0-9_-]/g, '');
        doc.save(`TPR_Chart_${cleanPtName}_${cleanIpd}.pdf`);
        return true;
    } catch (err) {
        console.error('Error generating TPR Chart PDF:', err);
        throw err;
    }
};

/**
 * Open a clean printable window and trigger browser print dialog matching VITAL CHART.pdf exactly
 */
export const printTPRChart = ({
    hospital = {},
    patient = {},
    admission = {},
    vitals = [],
    intakeOutput = [],
    isBlank = false
}) => {
    const ptDetails = resolvePatientChartDetails({ patient, admission, isBlank });
    const hospitalName = hospital.name || hospital.appName || 'Hospital';
    const hospitalLogo = sanitizeImageUrl(hospital.logoUrl || hospital.logo || '');

    const accreditation = hospital.accreditation || {};
    const isAccredited = accreditation.enabled === true;
    const rawCert = accreditation.certNo ? String(accreditation.certNo).trim() : '';
    const certNumber = isAccredited && rawCert
        ? (/^cert\.?\s*no/i.test(rawCert) ? rawCert : `Cert. No. : ${rawCert}`)
        : '';
    const accreditationLogo = isAccredited ? COMMON_NABH_LOGO_URL : '';

    const mergedRecords = isBlank ? [] : mergeTPRRecords(vitals, intakeOutput);

    let rowsHtml = mergedRecords
        .map(rec => `
            <tr class="tpr-data-row">
                <td class="col-center">${escapeHtml(rec.date)}</td>
                <td class="col-center">${escapeHtml(rec.time)}</td>
                <td class="col-center">${escapeHtml(rec.bp)}</td>
                <td class="col-center">${escapeHtml(rec.temp)}</td>
                <td class="col-center">${escapeHtml(rec.pulse)}</td>
                <td class="col-center">${escapeHtml(rec.rr)}</td>
                <td class="col-center">${escapeHtml(rec.input)}</td>
                <td class="col-center">${escapeHtml(rec.output)}</td>
                <td class="col-left">${escapeHtml(rec.remark)}</td>
                <td class="col-left">${escapeHtml(rec.emp)}</td>
            </tr>
        `)
        .join('');

    // Extend uninterrupted vertical column lines down to fill page height without inner horizontal bars
    const approxRowsPerPage = 29;
    const fillerHeightPx = mergedRecords.length === 0
        ? 820
        : mergedRecords.length < approxRowsPerPage
            ? Math.max(100, 820 - mergedRecords.length * 25)
            : 60;

    rowsHtml += `
        <tr class="tpr-spacer-row" style="height: ${fillerHeightPx}px;">
            <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
    `;

    const printWin = window.open('', '_blank', 'width=950,height=1000');
    if (!printWin) {
        alert('Please allow popups to print the TPR Chart.');
        return false;
    }

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>TPR – CHART : ${escapeHtml(ptDetails.name)} (${escapeHtml(ptDetails.ipdNumber)})</title>
            <style>
                @page {
                    size: A4 portrait;
                    margin: 0;
                }
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                body {
                    margin: 0;
                    padding: 0;
                    font-family: 'Times New Roman', Times, serif;
                    color: #000000;
                    background: #ffffff;
                }
                .tpr-print-container {
                    width: 210mm;
                    max-width: 100%;
                    margin: 0 auto;
                    padding: 0 12mm;
                }
                .tpr-action-bar {
                    background: #0d9488;
                    color: #ffffff;
                    padding: 10px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    font-size: 13px;
                    font-weight: 700;
                    border-radius: 6px;
                    margin: 10px 0 6px 0;
                }
                .tpr-btn-print {
                    background: #ffffff;
                    color: #0d9488;
                    border: none;
                    padding: 6px 16px;
                    border-radius: 4px;
                    font-weight: 700;
                    cursor: pointer;
                }
                @media print {
                    .tpr-print-container {
                        width: 100%;
                        padding: 0 12mm;
                    }
                    .tpr-action-bar {
                        display: none !important;
                    }
                }
                /* Top Demographics Bar matching pleasant light blue + subtle "|" dividers */
                .tpr-patient-line {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    font-size: 13px;
                    font-weight: normal;
                    color: #2563eb;
                    margin-bottom: 10px;
                    line-height: 1.4;
                    padding-left: 4px;
                }
                .tpr-patient-line span.sep {
                    display: inline-block;
                    margin: 0 9px;
                    color: #64748b;
                    font-weight: 400;
                }
                /* Letterhead Header */
                .tpr-letterhead {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    min-height: 66px;
                    padding: 0 4px;
                }
                .tpr-accreditation {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .tpr-accred-img {
                    height: 54px;
                    width: auto;
                    object-fit: contain;
                }
                .tpr-cert-no {
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 8.5px;
                    font-weight: bold;
                    color: #b91c1c;
                    margin-top: 2px;
                }
                .tpr-hosp-branding {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    text-align: right;
                    margin-left: auto;
                }
                .tpr-hosp-logo {
                    height: 54px;
                    width: auto;
                    max-width: 280px;
                    object-fit: contain;
                }
                .tpr-hosp-text {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .tpr-hosp-name {
                    font-size: 27px;
                    font-weight: bold;
                    color: #0f172a;
                    line-height: 1.05;
                    letter-spacing: 0.2px;
                }
                .tpr-hosp-tagline {
                    font-size: 11px;
                    color: #64748b;
                    margin-top: 2px;
                    text-align: center;
                }
                .tpr-hosp-contact {
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 9px;
                    color: #64748b;
                    margin-top: 2px;
                }
                /* Title directly above top horizontal line */
                .tpr-title-heading {
                    text-align: center;
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 11.5px;
                    font-weight: bold;
                    text-transform: uppercase;
                    letter-spacing: 0.4px;
                    margin: 6px 0 3px 0;
                    color: #111827;
                }
                /* Exact vertical open-column table grid (no outer left/right border, no empty horizontal bars) */
                .tpr-table {
                    width: 100%;
                    border-collapse: collapse;
                    border: none;
                    table-layout: fixed;
                }
                .tpr-table thead {
                    display: table-header-group;
                }
                .tpr-table tfoot {
                    display: table-footer-group;
                }
                .tpr-table thead td.tpr-repeat-head-cell {
                    border: none !important;
                    padding: 8mm 0 2px 0;
                    text-align: left;
                }
                .tpr-table tfoot td.tpr-repeat-foot-cell {
                    border: none !important;
                    border-top: 1px solid #262626 !important;
                    height: 10mm;
                    padding: 0;
                }
                .tpr-table th {
                    border-top: 1px solid #262626;
                    border-bottom: 1px solid #262626;
                    border-left: none;
                    border-right: 1px solid #262626;
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 11px;
                    font-weight: bold;
                    text-align: center;
                    padding: 5px 2px;
                    background: #ffffff;
                    color: #111827;
                }
                .tpr-table th:last-child {
                    border-right: none;
                }
                .tpr-table td {
                    border-top: none;
                    border-bottom: none;
                    border-left: none;
                    border-right: 1px solid #262626;
                    font-size: 10.5px;
                    padding: 4px 3px;
                    vertical-align: top;
                    word-wrap: break-word;
                }
                .tpr-table td:last-child {
                    border-right: none;
                }
                .tpr-table tbody tr.tpr-data-row {
                    break-inside: avoid;
                    page-break-inside: avoid;
                }
                .tpr-table tbody tr.tpr-data-row td {
                    height: 24px;
                }
                .col-center {
                    text-align: center;
                }
                .col-left {
                    text-align: left;
                    padding-left: 5px !important;
                }
                .w-date   { width: 10.0%; }
                .w-time   { width: 8.8%;  }
                .w-bp     { width: 8.7%;  }
                .w-temp   { width: 8.8%;  }
                .w-pulse  { width: 8.7%;  }
                .w-rr     { width: 8.7%;  }
                .w-input  { width: 8.7%;  }
                .w-output { width: 8.8%;  }
                .w-remark { width: 11.3%; }
                .w-emp    { width: 17.5%; }
            </style>
        </head>
        <body>
            <div class="tpr-print-container">
                <div class="tpr-action-bar">
                    <span>TPR Chart — Print Ready</span>
                    <button class="tpr-btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
                </div>

                <!-- Exact 10-Column Table with Repeating Letterhead + Patient Demographics per A4 Page -->
                <table class="tpr-table">
                    <thead>
                        <tr>
                            <td colspan="10" class="tpr-repeat-head-cell">
                                <!-- 1. Patient Demographics Top Line -->
                                <div class="tpr-patient-line">
                                    <span>Patient Name : ${escapeHtml(ptDetails.name)}</span>
                                    <span class="sep">|</span>
                                    <span>UHID : ${escapeHtml(ptDetails.uhid)}</span>
                                    <span class="sep">|</span>
                                    <span>IPD : ${escapeHtml(ptDetails.ipdNumber)}</span>
                                    <span class="sep">|</span>
                                    <span>Gender : ${escapeHtml(ptDetails.gender)}</span>
                                    <span class="sep">|</span>
                                    <span>Age : ${escapeHtml(ptDetails.age)}</span>
                                </div>

                                <!-- 2. Letterhead: Left Accreditation & Right Hospital Branding -->
                                <div class="tpr-letterhead">
                                    <div class="tpr-accreditation">
                                        ${isAccredited ? `
                                            ${accreditationLogo ? `<img class="tpr-accred-img" src="${escapeHtml(accreditationLogo)}" alt="NABH Accreditation" onerror="this.style.display='none'" />` : ''}
                                            ${certNumber ? `<div class="tpr-cert-no">${escapeHtml(certNumber)}</div>` : ''}
                                        ` : ''}
                                    </div>

                                    <div class="tpr-hosp-branding">
                                        ${hospitalLogo
                                            ? `<img class="tpr-hosp-logo" src="${escapeHtml(hospitalLogo)}" alt="${escapeHtml(hospitalName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><div class="tpr-hosp-text" style="display:none;"><div class="tpr-hosp-name">${escapeHtml(hospitalName)}</div></div>`
                                            : `<div class="tpr-hosp-text"><div class="tpr-hosp-name">${escapeHtml(hospitalName)}</div></div>`
                                        }
                                    </div>
                                </div>

                                <!-- 3. Centered Heading -->
                                <div class="tpr-title-heading">TPR – CHART</div>
                            </td>
                        </tr>
                        <tr>
                            ${TPR_COLUMN_DEFS.map(c => `<th class="w-${c.key}">${escapeHtml(c.label)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="10" class="tpr-repeat-foot-cell"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 300);
                };
            </script>
        </body>
        </html>
    `;

    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
    return true;
};
