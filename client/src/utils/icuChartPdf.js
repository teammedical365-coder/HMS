import jsPDF from 'jspdf';
import {
    COMMON_NABH_LOGO_URL,
    escapeHtml,
    sanitizeImageUrl,
    resolvePatientChartDetails,
    resolveHospitalChartBranding,
    loadImageForPdf,
    drawPatientBannerPdf
} from './tprChartPdf.js';

export const ICU_CHART_TEMPLATE_PAGE1_URL = '/assets/icu-chart-page1-template.png';
export const ICU_CHART_TEMPLATE_PAGE2_URL = '/assets/icu-chart-page2-template.png';
export { COMMON_NABH_LOGO_URL };

// Document dimensions matching exact reference ICU CHART.pdf (Landscape, 602.88 x 499.2 pt)
export const ICU_PDF_WIDTH_PT = 602.88;
export const ICU_PDF_HEIGHT_PT = 499.2;
const TEMPLATE_IMG_WIDTH_PX = 1600;
const TEMPLATE_IMG_HEIGHT_PX = 1324;
const SCALE_X = ICU_PDF_WIDTH_PT / TEMPLATE_IMG_WIDTH_PX;
const SCALE_Y = (498.88) / TEMPLATE_IMG_HEIGHT_PX;

export const ptX = (px) => px * SCALE_X;
export const ptY = (py) => py * SCALE_Y;

// Hourly Row Y Centers on Page 1 (24 hours: 8 AM to 7 AM)
export const MAIN_GRID_ROW_Y_CENTERS = [
    698, 722.5, 747.5, 773, 797.5, 821, 846, 871, 895.5, 920.5, 945, 969.5,
    994, 1018, 1043, 1068, 1092, 1116.5, 1141.5, 1166, 1190.5, 1215.5, 1240, 1265
];

export const ICU_HOURS_LABELS = [
    '8 AM', '9 AM', '10 AM', '11 AM', '12 MD', '1 PM', '2 PM', '3 PM',
    '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM',
    '12 MN', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM', '7 AM'
];

/**
 * Format date as DD/MM/YYYY
 */
const formatDDMMYYYY = (val) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * Calculate ICU Days difference between admission date and chart observation date
 */
const calculateICUDays = (admissionDate, chartDate) => {
    if (!admissionDate) return '';
    const adm = new Date(admissionDate);
    const target = chartDate ? new Date(chartDate) : new Date();
    if (isNaN(adm.getTime()) || isNaN(target.getTime())) return '';
    const diffMs = Math.max(0, target.getTime() - adm.getTime());
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return `${days} Day${days > 1 ? 's' : ''}`;
};

/**
 * Get hour slot index (0 to 23) for an observation relative to the 8 AM cycle
 */
export const getICUHourSlotIndex = (timestamp, chartDate) => {
    if (!timestamp) return -1;
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return -1;

    let targetDateStr = '';
    if (chartDate) {
        if (typeof chartDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(chartDate)) {
            targetDateStr = chartDate.slice(0, 10);
        } else {
            const cd = new Date(chartDate);
            if (!isNaN(cd.getTime())) {
                const pad = (n) => String(n).padStart(2, '0');
                targetDateStr = `${cd.getFullYear()}-${pad(cd.getMonth() + 1)}-${pad(cd.getDate())}`;
            }
        }
    }

    const pad = (n) => String(n).padStart(2, '0');
    const obsDateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hour = d.getHours();

    if (targetDateStr) {
        const [y, m, day] = targetDateStr.split('-').map(Number);
        const nextDate = new Date(y, m - 1, day + 1);
        const nextDateStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;

        if (hour >= 8 && obsDateStr === targetDateStr) {
            return hour - 8;
        } else if (hour < 8 && obsDateStr === nextDateStr) {
            return hour + 16;
        }
        return -1;
    }

    return hour >= 8 ? hour - 8 : hour + 16;
};

/**
 * Build complete ICU Chart View Model strictly adhering to existing database records
 * and leaving any unavailable data as empty strings (NO '—', NO 'N/A', NO fake data).
 */
export const buildICUChartViewModel = ({
    admission = {},
    patient = {},
    hospital = {},
    icuData = {},
    chartDate = null
} = {}) => {
    const rawPatient = admission?.patientId && typeof admission.patientId === 'object'
        ? admission.patientId
        : (patient || {});
    const rawDoctor = admission?.doctorId && typeof admission.doctorId === 'object'
        ? admission.doctorId
        : {};
    const rawBed = admission?.bedId && typeof admission.bedId === 'object'
        ? admission.bedId
        : {};

    const ptDetails = resolvePatientChartDetails({ patient: rawPatient, admission });
    const branding = resolveHospitalChartBranding({
        tenantHospital: hospital,
        branding: hospital?.branding
    });

    const activeChartDate = chartDate ? new Date(chartDate) : (admission?.admissionDate ? new Date(admission.admissionDate) : new Date());
    const formattedChartDate = formatDDMMYYYY(activeChartDate);

    // Bed number
    const bedNo = rawBed.bedNumber || admission?.bedNumber || '';
    const ward = admission?.ward || rawBed.ward || '';
    const wardBed = [ward, bedNo ? `Bed ${bedNo}` : ''].filter(Boolean).join(' / ');

    // Demographics
    const bloodGroup = rawPatient?.bloodGroup || icuData?.clinicalNote?.patientData?.bloodGroup || '';
    const rawAllergy = rawPatient?.allergies || icuData?.clinicalNote?.patientData?.allergies || admission?.allergies || '';
    const allergy = Array.isArray(rawAllergy) ? rawAllergy.join(', ') : (typeof rawAllergy === 'string' ? rawAllergy.trim() : '');

    const diagnosis = admission?.provisionalDiagnosis ||
        admission?.diagnosis ||
        icuData?.clinicalNote?.patientData?.diagnosis ||
        icuData?.clinicalNote?.doctorNotes ||
        '';

    const procedure = icuData?.surgeries?.[0]?.surgeryName ||
        icuData?.surgeries?.[0]?.procedureName ||
        icuData?.clinicalNote?.patientData?.surgery ||
        '';

    const icuDays = calculateICUDays(admission?.admissionDate, activeChartDate);

    // Nursing Staff on Duty (Shifts 1, 2, 3)
    const staffMorning = new Set();
    const staffEvening = new Set();
    const staffNight = new Set();

    // Intake/Output accumulator for 24h summary
    let sumOral = 0, sumNG = 0, sumIV = 0, sumInfusion = 0, sumTotalIntake = 0;
    let sumUrine = 0, sumDrain = 0, sumStool = 0, sumRTA = 0, sumTotalOutput = 0;
    let hasIntakeData = false;
    let hasOutputData = false;

    // 24 Hourly Grid Data Rows
    const hourlyRows = Array.from({ length: 24 }, (_, i) => ({
        slot: i,
        hourLabel: ICU_HOURS_LABELS[i],
        yCenter: MAIN_GRID_ROW_Y_CENTERS[i],
        // Vitals
        pulse: '',
        rr: '',
        temp: '',
        bp: '',
        spo2: '',
        o2: '',
        cvp: '',
        gcs: '',
        remark: '',
        // Intake
        oral: '',
        ng: '',
        iv: '',
        infusion: '',
        totIntake: '',
        // Output
        urine: '',
        drain: '',
        stool: '',
        rta: '',
        totOutput: '',
        // Drug
        sno: '',
        drugName: '',
        dose: '',
        route: '',
        freq: '',
        time: '',
        sign: ''
    }));

    // Populate vitals
    const vitalsList = Array.isArray(icuData?.vitals) ? icuData.vitals : [];
    vitalsList.forEach((v) => {
        const slot = getICUHourSlotIndex(v.recordedAt || v.createdAt, activeChartDate);
        if (slot >= 0 && slot < 24) {
            const row = hourlyRows[slot];
            if (v.pulse || v.pulseRate) row.pulse = String(v.pulse || v.pulseRate);
            if (v.respiratoryRate || v.rr) row.rr = String(v.respiratoryRate || v.rr);
            if (v.temperature || v.temp) {
                const t = String(v.temperature || v.temp);
                row.temp = t.includes('°') ? t : `${t}°F`;
            }
            if (v.bloodPressure || v.bp) {
                row.bp = String(v.bloodPressure || v.bp);
            } else if (v.systolicBP && v.diastolicBP) {
                row.bp = `${v.systolicBP}/${v.diastolicBP}`;
            } else if (v.systolic && v.diastolic) {
                row.bp = `${v.systolic}/${v.diastolic}`;
            }
            if (v.spo2 || v.oxygenSaturation) row.spo2 = String(v.spo2 || v.oxygenSaturation);
            if (v.oxygenFlow || v.o2) row.o2 = String(v.oxygenFlow || v.o2);
            if (v.cvp) row.cvp = String(v.cvp);
            if (v.gcs) row.gcs = String(v.gcs);
            if (v.remark || v.remarks || v.notes) row.remark = String(v.remark || v.remarks || v.notes);

            // Staff shift tracking
            const nurseName = v.recordedBy?.name || v.recordedByName || v.nurseName || '';
            if (nurseName) {
                if (slot >= 0 && slot <= 5) staffMorning.add(nurseName);
                else if (slot >= 6 && slot <= 11) staffEvening.add(nurseName);
                else staffNight.add(nurseName);
            }
        }
    });

    // Populate Intake/Output
    const ioList = Array.isArray(icuData?.intakeOutput) ? icuData.intakeOutput : [];
    ioList.forEach((io) => {
        const slot = getICUHourSlotIndex(io.recordedAt || io.createdAt, activeChartDate);
        if (slot >= 0 && slot < 24) {
            const row = hourlyRows[slot];
            if (io.oral !== undefined && io.oral !== null && io.oral !== '') {
                row.oral = String(io.oral);
                sumOral += Number(io.oral) || 0;
                hasIntakeData = true;
            }
            if (io.ngTube !== undefined && io.ngTube !== null && io.ngTube !== '') {
                row.ng = String(io.ngTube);
                sumNG += Number(io.ngTube) || 0;
                hasIntakeData = true;
            }
            if (io.ivFluid !== undefined && io.ivFluid !== null && io.ivFluid !== '') {
                row.iv = String(io.ivFluid);
                sumIV += Number(io.ivFluid) || 0;
                hasIntakeData = true;
            }
            if (io.infusion !== undefined && io.infusion !== null && io.infusion !== '') {
                row.infusion = String(io.infusion);
                sumInfusion += Number(io.infusion) || 0;
                hasIntakeData = true;
            }
            const intakeRowTot = (Number(row.oral) || 0) + (Number(row.ng) || 0) + (Number(row.iv) || 0) + (Number(row.infusion) || 0);
            if (intakeRowTot > 0) {
                row.totIntake = String(intakeRowTot);
                sumTotalIntake += intakeRowTot;
            }

            if (io.urine !== undefined && io.urine !== null && io.urine !== '') {
                row.urine = String(io.urine);
                sumUrine += Number(io.urine) || 0;
                hasOutputData = true;
            }
            if (io.drain !== undefined && io.drain !== null && io.drain !== '') {
                row.drain = String(io.drain);
                sumDrain += Number(io.drain) || 0;
                hasOutputData = true;
            }
            if (io.stool !== undefined && io.stool !== null && io.stool !== '') {
                row.stool = String(io.stool);
                sumStool += Number(io.stool) || 1;
                hasOutputData = true;
            }
            if (io.rta !== undefined && io.rta !== null && io.rta !== '') {
                row.rta = String(io.rta);
                sumRTA += Number(io.rta) || 0;
                hasOutputData = true;
            }
            const outputRowTot = (Number(row.urine) || 0) + (Number(row.drain) || 0) + (Number(row.rta) || 0);
            if (outputRowTot > 0) {
                row.totOutput = String(outputRowTot);
                sumTotalOutput += outputRowTot;
            }
        }
    });

    // Populate Medication Orders onto Main Grid Rows (strictly numeric dose, clean route/timing)
    const ordersList = Array.isArray(icuData?.orders) ? icuData.orders : [];
    ordersList.slice(0, 24).forEach((ord, idx) => {
        const row = hourlyRows[idx];
        row.sno = String(idx + 1);
        row.drugName = (ord.medicineName || ord.drugName || ord.name || '').trim();

        // Extract strictly numeric dose value (prevent strings like "23 capsuleOral" or mixed text)
        let rawDose = '';
        if (typeof ord.dosage === 'string' && ord.dosage.trim()) {
            rawDose = ord.dosage.trim();
        } else if (ord.dosage && typeof ord.dosage === 'object') {
            rawDose = ord.dosage.value || ord.dosage.dose || '';
        } else if (ord.dosageValue) {
            rawDose = ord.dosageValue;
        } else if (ord.dose) {
            rawDose = typeof ord.dose === 'object' ? (ord.dose.value || ord.dose.dose || '') : String(ord.dose).trim();
        }

        let numDose = '';
        if (rawDose) {
            const match = String(rawDose).match(/^(\d+(?:\.\d+)?)/);
            if (match) {
                numDose = match[1];
            } else {
                numDose = String(rawDose).replace(/[^\d.]/g, '').trim();
            }
        }
        row.dose = numDose;

        // Route: e.g. Oral, IV, IM, SC
        let routeVal = ord.route || ord.dosage?.route || '';
        if (!routeVal && rawDose) {
            const rMatch = String(rawDose).match(/\b(oral|iv|im|sc|sublingual|topical|inhalation|rectal)\b/i);
            if (rMatch) routeVal = rMatch[1];
        }
        row.route = routeVal ? (routeVal.length <= 4 ? routeVal.toUpperCase() : routeVal) : '';

        // Frequency: e.g. TDS, BD, OD, QID, STAT
        row.freq = (ord.frequency || ord.dosage?.frequency || '').toUpperCase();

        // Timing: scheduled timing or times
        row.time = ord.timing || (Array.isArray(ord.scheduledTimes) ? ord.scheduledTimes.join(', ') : '') || (Array.isArray(ord.timeSlots) ? ord.timeSlots.join(', ') : '') || '';

        // Doctor Sign
        let docSign = ord.doctorId?.name || ord.prescribedBy?.name || ord.doctorName || '';
        if (docSign && !/^dr\./i.test(docSign)) {
            docSign = `Dr. ${docSign}`;
        }
        row.sign = docSign;
    });

    // Nursing Staff shift lists
    const nursingStaff = {
        morning: Array.from(staffMorning).join(', '),
        evening: Array.from(staffEvening).join(', '),
        night: Array.from(staffNight).join(', ')
    };

    // Intake/Output summary block
    const ioSummary = {
        prev24hIntake: '',
        todayIntake: hasIntakeData ? `${sumTotalIntake || (sumOral + sumNG + sumIV + sumInfusion)} ml` : '',
        balanceIntake: hasIntakeData && hasOutputData ? `${(sumTotalIntake || (sumOral + sumNG + sumIV + sumInfusion)) - (sumTotalOutput || (sumUrine + sumDrain + sumRTA))} ml` : '',
        prev24hOutput: '',
        todayOutput: hasOutputData ? `${sumTotalOutput || (sumUrine + sumDrain + sumRTA)} ml` : '',
        balanceOutput: '',
        drain: sumDrain > 0 ? `${sumDrain} ml` : '',
        bowel: sumStool > 0 ? `${sumStool} x` : ''
    };

    // Investigations Done List (recent lab reports)
    const investigations = (icuData?.labReports || []).slice(0, 5).map((lab, i) => {
        const testName = lab.testName || lab.title || lab.name || 'Lab Test';
        const result = lab.result || lab.status || '';
        return `${i + 1}. ${testName}${result ? `: ${result}` : ''}`;
    });

    // ICU Devices (Lines & Catheters)
    const linesList = Array.isArray(icuData?.lines) ? icuData.lines : [];
    const cathList = Array.isArray(icuData?.catheters) ? icuData.catheters : [];
    const findDevice = (typeRegex) => {
        const item = [...linesList, ...cathList].find(d => typeRegex.test(d.type || d.name || ''));
        if (!item) return null;
        return {
            day: item.insertedAt ? calculateICUDays(item.insertedAt, activeChartDate) : '',
            date: item.insertedAt ? formatDDMMYYYY(item.insertedAt) : '',
            site: item.site || item.location || '',
            condition: item.condition || item.status || 'Intact'
        };
    };

    const devices = {
        peripheralLine: findDevice(/peripheral|iv\s*cannula|cannula/i) || { day: '', date: '', site: '', condition: '' },
        centralLine: findDevice(/central|cvp|cvc|subclavian|jugular/i) || { day: '', date: '', site: '', condition: '' },
        rylesTube: findDevice(/ryles|ng\s*tube|nasogastric/i) || { day: '', date: '', site: '', condition: '' },
        foleys: findDevice(/foley|urinary|catheter/i) || { day: '', date: '', site: '', condition: '' },
        etTube: findDevice(/et\s*tube|endotracheal|tracheostomy/i) || { day: '', date: '', site: '', condition: '' },
        ventilatorCircuit: findDevice(/ventilator|circuit/i) || { day: '', date: '', site: '', condition: '' }
    };

    // Page 2: Ventilatory Settings
    const ventRows = Array.from({ length: 24 }, (_, i) => ({
        slot: i,
        time: ICU_HOURS_LABELS[i],
        yCenter: MAIN_GRID_ROW_Y_CENTERS[i],
        mode: '',
        tv: '',
        rr: '',
        peep: '',
        pip: '',
        ie: '',
        fio2: '',
        ps: '',
        remark: ''
    }));

    // Page 2: Nursing Notes (divided into Morning, Evening, Night)
    const notesList = Array.isArray(icuData?.nursingNotes) ? icuData.nursingNotes : [];
    const notesMorning = [];
    const notesEvening = [];
    const notesNight = [];
    notesList.forEach((n) => {
        const text = n.note || n.content || n.notes || '';
        if (!text) return;
        const shift = String(n.shift || '').toLowerCase();
        if (shift.includes('morning') || shift.includes('day')) {
            notesMorning.push(text);
        } else if (shift.includes('evening')) {
            notesEvening.push(text);
        } else if (shift.includes('night')) {
            notesNight.push(text);
        } else {
            // Check timestamp
            const slot = getICUHourSlotIndex(n.createdAt || n.recordedAt, activeChartDate);
            if (slot >= 0 && slot <= 5) notesMorning.push(text);
            else if (slot >= 6 && slot <= 11) notesEvening.push(text);
            else notesNight.push(text);
        }
    });

    // Page 2: Diabetic Chart
    const diabeticRows = [];
    vitalsList.filter(v => v.bloodSugar || v.rbs || v.cbg).forEach((v) => {
        const d = new Date(v.recordedAt || v.createdAt);
        const timeStr = !isNaN(d.getTime()) ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        diabeticRows.push({
            time: timeStr,
            sugar: String(v.bloodSugar || v.rbs || v.cbg),
            insulin: v.insulinDose ? `${v.insulinDose} ${v.insulinType || 'Regular'}` : '',
            sign: v.recordedByName || v.recordedBy?.name || ''
        });
    });

    // Page 2: Diet Chart Orders
    const dietOrders = [];
    if (admission?.diet || admission?.dietOrder) {
        dietOrders.push(String(admission.diet || admission.dietOrder));
    }
    if (icuData?.clinicalNote?.doctorNotes && /diet|npo|feeds/i.test(icuData.clinicalNote.doctorNotes)) {
        dietOrders.push(icuData.clinicalNote.doctorNotes);
    }

    return {
        patientBanner: {
            name: ptDetails.name !== '—' ? ptDetails.name : '',
            uhid: ptDetails.uhid !== '—' ? ptDetails.uhid : '',
            ipd: ptDetails.ipdNumber !== '—' ? ptDetails.ipdNumber : '',
            gender: ptDetails.gender !== '—' ? ptDetails.gender : '',
            age: ptDetails.age !== '—' ? ptDetails.age : ''
        },
        branding,
        demographics: {
            date: formattedChartDate,
            bedNo,
            patientName: ptDetails.name !== '—' ? ptDetails.name : '',
            ipdNo: ptDetails.ipdNumber !== '—' ? ptDetails.ipdNumber : '',
            wardBed,
            icuDays,
            bloodGroup,
            allergy,
            diagnosis,
            procedure
        },
        nursingStaff,
        ioSummary,
        investigations,
        devices,
        hourlyRows,
        page2: {
            ventRows,
            notesMorning,
            notesEvening,
            notesNight,
            diabeticRows: diabeticRows.slice(0, 13),
            dietOrders
        }
    };
};

/**
 * Render Page 1 of ICU Daily Observation Chart
 */
export const renderICUChartPage1 = (doc, viewModel, { hospImg, nabhImg, templateImg1 }) => {
    // 1. Draw base high-res background template
    if (templateImg1) {
        doc.addImage(templateImg1.dataUrl || templateImg1, 'PNG', 0, 0, ICU_PDF_WIDTH_PT, 498.88);
    }

    // 2. Top Blue Times Patient Banner (identical to reference PDF)
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(0, 30, 255);
    const pb = viewModel.patientBanner;
    const bannerLine = `Patient Name : ${pb.name}   UHID : ${pb.uhid}   IPD : ${pb.ipd}   Gender : ${pb.gender}   Age : ${pb.age}`;
    doc.text(bannerLine, 28, 20);

    // 3. Header White-Label Branding Area (x=42 to 656, y=129 to 258)
    const branding = viewModel.branding;
    const isAccredited = branding?.accreditation?.enabled === true;

    if (isAccredited && nabhImg) {
        // NABH Seal
        doc.addImage(nabhImg.dataUrl || nabhImg, 'PNG', ptX(55), ptY(140), ptX(100), ptY(80));
        if (branding.accreditation.certNo) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(4.6);
            doc.setTextColor(185, 28, 28);
            doc.text(branding.accreditation.certNo, ptX(105), ptY(235), { align: 'center' });
        }
    }

    // Hospital Logo
    const logoX = isAccredited ? ptX(220) : ptX(120);
    const logoMaxW = isAccredited ? ptX(380) : ptX(480);
    const logoH = ptY(85);

    let hospDrawn = false;
    if (hospImg) {
        try {
            const aspect = hospImg.naturalWidth && hospImg.naturalHeight
                ? hospImg.naturalWidth / hospImg.naturalHeight
                : 3.5;
            let drawW = logoH * aspect;
            let drawH = logoH;
            if (drawW > logoMaxW) {
                drawW = logoMaxW;
                drawH = drawW / aspect;
            }
            const drawY = ptY(145) + (logoH - drawH) / 2;
            doc.addImage(hospImg.dataUrl || hospImg, 'PNG', logoX, drawY, drawW, drawH);
            hospDrawn = true;
        } catch (_) {}
    }
    if (!hospDrawn) {
        doc.setFont('times', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text(branding.name || 'Hospital', logoX + logoMaxW / 2, ptY(190), { align: 'center' });
    }

    // 4. Upper Block 1: Demographics
    const d = viewModel.demographics;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(15, 23, 42);

    if (d.date) doc.text(d.date, ptX(85), ptY(284));
    if (d.bedNo) doc.text(d.bedNo, ptX(365), ptY(284));
    if (d.patientName) doc.text(d.patientName, ptX(140), ptY(324));
    if (d.ipdNo) doc.text(d.ipdNo, ptX(85), ptY(375));
    if (d.wardBed) doc.text(d.wardBed, ptX(140), ptY(427));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    if (d.icuDays) doc.text(d.icuDays, ptX(215), ptY(462));
    if (d.bloodGroup) doc.text(d.bloodGroup, ptX(215), ptY(487));
    if (d.allergy) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(185, 28, 28);
        doc.text(d.allergy, ptX(215), ptY(512), { maxWidth: ptX(250) });
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'normal');
    }
    if (d.diagnosis) doc.text(d.diagnosis, ptX(215), ptY(542), { maxWidth: ptX(250) });
    if (d.procedure) doc.text(d.procedure, ptX(215), ptY(600), { maxWidth: ptX(250) });

    // 5. Block 2: Nursing Staff on Duty
    const ns = viewModel.nursingStaff;
    if (ns.morning) doc.text(ns.morning, ptX(500), ptY(324), { maxWidth: ptX(140) });
    if (ns.evening) doc.text(ns.evening, ptX(500), ptY(374), { maxWidth: ptX(140) });
    if (ns.night) doc.text(ns.night, ptX(500), ptY(424), { maxWidth: ptX(140) });

    // 6. Block 3: Intake / Output Summary
    const io = viewModel.ioSummary;
    if (io.prev24hIntake) doc.text(io.prev24hIntake, ptX(960), ptY(272));
    if (io.todayIntake) doc.text(io.todayIntake, ptX(960), ptY(292));
    if (io.balanceIntake) doc.text(io.balanceIntake, ptX(960), ptY(313));
    if (io.prev24hOutput) doc.text(io.prev24hOutput, ptX(960), ptY(333));
    if (io.todayOutput) doc.text(io.todayOutput, ptX(960), ptY(354));
    if (io.balanceOutput) doc.text(io.balanceOutput, ptX(960), ptY(375));
    if (io.drain) doc.text(io.drain, ptX(960), ptY(396));
    if (io.bowel) doc.text(io.bowel, ptX(960), ptY(416));

    // 7. Block 4: Investigations Done
    (viewModel.investigations || []).forEach((inv, idx) => {
        doc.text(inv, ptX(1210), ptY(320 + idx * 26), { maxWidth: ptX(330) });
    });

    // 8. ICU Devices Table
    const dev = viewModel.devices;
    const drawDevRow = (dObj, yPx) => {
        if (!dObj) return;
        if (dObj.day) doc.text(dObj.day, ptX(640), ptY(yPx));
        if (dObj.date) doc.text(dObj.date, ptX(850), ptY(yPx));
        const conditionDesc = [dObj.site, dObj.condition].filter(Boolean).join(', ');
        if (conditionDesc) doc.text(conditionDesc, ptX(1250), ptY(yPx));
    };

    drawDevRow(dev.peripheralLine, 488);
    drawDevRow(dev.centralLine, 508);
    drawDevRow(dev.rylesTube, 529);
    drawDevRow(dev.foleys, 549);
    drawDevRow(dev.etTube, 570);
    drawDevRow(dev.ventilatorCircuit, 591);

    // 9. Main Hourly Grid Rows (8 AM to 7 AM)
    doc.setFontSize(5.5);
    (viewModel.hourlyRows || []).forEach((row) => {
        const y = ptY(row.yCenter + 4);

        // Vitals
        if (row.pulse) doc.text(row.pulse, ptX(96.5), y, { align: 'center' });
        if (row.rr) doc.text(row.rr, ptX(133.5), y, { align: 'center' });
        if (row.temp) doc.text(row.temp, ptX(170.5), y, { align: 'center' });
        if (row.bp) doc.text(row.bp, ptX(207.5), y, { align: 'center' });
        if (row.spo2) doc.text(row.spo2, ptX(244.5), y, { align: 'center' });
        if (row.o2) doc.text(row.o2, ptX(281.5), y, { align: 'center' });
        if (row.cvp) doc.text(row.cvp, ptX(318.5), y, { align: 'center' });
        if (row.gcs) doc.text(row.gcs, ptX(355.5), y, { align: 'center' });
        if (row.remark) {
            doc.setFontSize(4.8);
            doc.text(String(row.remark).trim(), ptX(404.5), y, { align: 'center', maxWidth: ptX(56) });
            doc.setFontSize(5.5);
        }

        // Intake
        if (row.oral) doc.text(row.oral, ptX(453.5), y, { align: 'center' });
        if (row.ng) doc.text(row.ng, ptX(490.5), y, { align: 'center' });
        if (row.iv) doc.text(row.iv, ptX(527.5), y, { align: 'center' });
        if (row.infusion) doc.text(row.infusion, ptX(558.5), y, { align: 'center' });
        if (row.totIntake) doc.text(row.totIntake, ptX(583.5), y, { align: 'center' });

        // Output
        if (row.urine) doc.text(row.urine, ptX(608.5), y, { align: 'center' });
        if (row.drain) doc.text(row.drain, ptX(633.5), y, { align: 'center' });
        if (row.stool) doc.text(row.stool, ptX(664.5), y, { align: 'center' });
        if (row.rta) doc.text(row.rta, ptX(701.0), y, { align: 'center' });
        if (row.totOutput) doc.text(row.totOutput, ptX(737.5), y, { align: 'center' });

        // Drug Details (Aligned columns: Drugs Name, numeric Dose, Route, Freq, widened Timing, Sign)
        if (row.sno) doc.text(row.sno, ptX(901.5), y, { align: 'center' });
        if (row.drugName) doc.text(row.drugName, ptX(918), y, { maxWidth: ptX(280) });
        if (row.dose) doc.text(row.dose, ptX(1228.5), y, { align: 'center', maxWidth: ptX(32) });
        if (row.route) doc.text(row.route, ptX(1265.5), y, { align: 'center', maxWidth: ptX(34) });
        if (row.freq) doc.text(row.freq, ptX(1303.0), y, { align: 'center', maxWidth: ptX(36) });
        if (row.time) {
            doc.setFontSize(4.8);
            doc.text(row.time, ptX(1328), y, { align: 'left', maxWidth: ptX(138) });
            doc.setFontSize(5.5);
        }
        if (row.sign) doc.text(row.sign, ptX(1515), y, { align: 'center', maxWidth: ptX(80) });
    });
};

/**
 * Render Page 2 of ICU Daily Observation Chart
 */
export const renderICUChartPage2 = (doc, viewModel, { templateImg2 }) => {
    // 1. Draw base high-res background template
    if (templateImg2) {
        doc.addImage(templateImg2.dataUrl || templateImg2, 'PNG', 0, 0, ICU_PDF_WIDTH_PT, 498.88);
    }

    // 2. Top Blue Times Patient Banner (identical to reference PDF)
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(0, 30, 255);
    const pb = viewModel.patientBanner;
    const bannerLine = `Patient Name : ${pb.name}   UHID : ${pb.uhid}   IPD : ${pb.ipd}   Gender : ${pb.gender}   Age : ${pb.age}`;
    doc.text(bannerLine, 28, 20);

    const p2 = viewModel.page2;

    // 3. Ventilatory Settings (Left columns)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(15, 23, 42);
    (p2.ventRows || []).forEach((row) => {
        const y = ptY(row.yCenter + 4);
        if (row.mode) doc.text(row.mode, ptX(107), y, { align: 'center' });
        if (row.tv) doc.text(row.tv, ptX(152), y, { align: 'center' });
        if (row.rr) doc.text(row.rr, ptX(198), y, { align: 'center' });
        if (row.peep) doc.text(row.peep, ptX(244), y, { align: 'center' });
        if (row.pip) doc.text(row.pip, ptX(290), y, { align: 'center' });
        if (row.ie) doc.text(row.ie, ptX(335), y, { align: 'center' });
        if (row.fio2) doc.text(row.fio2, ptX(381), y, { align: 'center' });
        if (row.ps) doc.text(row.ps, ptX(426), y, { align: 'center' });
        if (row.remark) doc.text(row.remark, ptX(472), y, { align: 'center' });
    });

    // 4. Clinical & Nursing Notes (Morning, Evening, Night ruled sections)
    doc.setFontSize(6.5);
    const drawShiftNotes = (notesList, startYPx, maxYPx) => {
        let curY = startYPx;
        const linePitch = 33.4;
        (notesList || []).forEach((noteText) => {
            if (curY >= maxYPx) return;
            const lines = doc.splitTextToSize(String(noteText).trim(), ptX(565));
            lines.forEach((line) => {
                if (curY < maxYPx) {
                    doc.text(line, ptX(515), ptY(curY));
                    curY += linePitch;
                }
            });
        });
    };

    drawShiftNotes(p2.notesMorning, 235, 600);
    drawShiftNotes(p2.notesEvening, 665, 970);
    drawShiftNotes(p2.notesNight, 1035, 1300);

    // 5. Diabetic Chart (Top Right, x = 1120 to 1561)
    doc.setFontSize(6.0);
    (p2.diabeticRows || []).forEach((dr, idx) => {
        const y = ptY(240 + idx * 25);
        if (dr.time) doc.text(dr.time, ptX(1146), y, { align: 'center' });
        if (dr.sugar) doc.text(dr.sugar, ptX(1219), y, { align: 'center' });
        if (dr.insulin) doc.text(dr.insulin, ptX(1303), y, { align: 'center' });
        if (dr.sign) doc.text(dr.sign, ptX(1470), y, { align: 'center' });
    });

    // 6. Diet Chart (Bottom Right, x = 1120 to 1561)
    doc.setFontSize(7.0);
    let dietY = 780;
    (p2.dietOrders || []).forEach((orderText, i) => {
        if (dietY < 1290) {
            const prefix = `${i + 1}. `;
            const lines = doc.splitTextToSize(prefix + orderText, ptX(430));
            lines.forEach((l) => {
                if (dietY < 1290) {
                    doc.text(l, ptX(1145), ptY(dietY));
                    dietY += 25;
                }
            });
        }
    });
};

/**
 * Generate full 2-page jsPDF Document object
 */
export const generateICUChartPdfDoc = async ({
    admission = {},
    patient = {},
    hospital = {},
    icuData = {},
    chartDate = null
} = {}) => {
    const viewModel = buildICUChartViewModel({ admission, patient, hospital, icuData, chartDate });

    // Preload image assets
    const [hospImg, nabhImg, templateImg1, templateImg2] = await Promise.all([
        viewModel.branding?.logoUrl ? loadImageForPdf(viewModel.branding.logoUrl) : null,
        viewModel.branding?.accreditation?.enabled ? loadImageForPdf(COMMON_NABH_LOGO_URL) : null,
        loadImageForPdf(ICU_CHART_TEMPLATE_PAGE1_URL),
        loadImageForPdf(ICU_CHART_TEMPLATE_PAGE2_URL)
    ]);

    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: [ICU_PDF_WIDTH_PT, ICU_PDF_HEIGHT_PT]
    });

    // Page 1
    renderICUChartPage1(doc, viewModel, { hospImg, nabhImg, templateImg1 });

    // Page 2
    doc.addPage([ICU_PDF_WIDTH_PT, ICU_PDF_HEIGHT_PT], 'landscape');
    renderICUChartPage2(doc, viewModel, { templateImg2 });

    return { doc, viewModel };
};

/**
 * Download exact 2-page ICU Daily Observation Chart PDF
 */
export const downloadICUChartPdf = async ({
    admission = {},
    patient = {},
    hospital = {},
    icuData = {},
    chartDate = null,
    fileName = ''
} = {}) => {
    const { doc, viewModel } = await generateICUChartPdfDoc({
        admission,
        patient,
        hospital,
        icuData,
        chartDate
    });

    const safePatientName = (viewModel.patientBanner.name || 'Patient').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeIPD = (viewModel.patientBanner.ipd || 'IPD').replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalFileName = fileName || `ICU_Daily_Observation_Chart_${safePatientName}_${safeIPD}.pdf`;

    doc.save(finalFileName);
    return true;
};

/**
 * Print exact 2-page ICU Daily Observation Chart PDF
 */
export const printICUChart = async ({
    admission = {},
    patient = {},
    hospital = {},
    icuData = {},
    chartDate = null
} = {}) => {
    const { doc } = await generateICUChartPdfDoc({
        admission,
        patient,
        hospital,
        icuData,
        chartDate
    });

    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl;

    document.body.appendChild(iframe);

    iframe.onload = () => {
        setTimeout(() => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (err) {
                console.error('Direct print failed, opening in new window:', err);
                window.open(blobUrl, '_blank');
            }
            setTimeout(() => {
                try {
                    document.body.removeChild(iframe);
                    URL.revokeObjectURL(blobUrl);
                } catch (_) {}
            }, 60000);
        }, 300);
    };

    return true;
};
