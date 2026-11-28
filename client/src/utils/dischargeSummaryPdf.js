import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const escapeHtml = (val) => {
    if (val === null || val === undefined) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const formatDate = (val, withTime = false) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    if (withTime) {
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const cleanText = (v) => (v !== null && v !== undefined ? String(v).trim() : '');

/**
 * Normalize all 22 applicable medical document sections strictly from saved database records.
 * Never fabricates clinical data — empty optional sections are cleanly omitted.
 */
export function buildDischargeDocumentModel({
    hospital = {},
    branding = {},
    admission = {},
    patient = {},
    dischargeSummary = {},
    clinicalNote = null,
    latestVitals = null,
    inpatientOrders = [],
    labReports = [],
    surgeries = [],
    signingDoctor = null
}) {
    const ptObj = (admission?.patientId && typeof admission.patientId === 'object')
        ? { ...admission.patientId, ...patient }
        : patient;

    const docObj = signingDoctor ||
        (admission?.doctorId && typeof admission.doctorId === 'object' ? admission.doctorId : null);

    const hospName = cleanText(hospital?.name || branding?.hospitalName || branding?.name) || 'Medical365 Hospital';
    const logoUrl = cleanText(hospital?.branding?.logoUrl || hospital?.logo || branding?.logoUrl || branding?.logo || '');
    const hospAddress = [
        hospital?.address || branding?.address,
        hospital?.city || branding?.city,
        hospital?.state || branding?.state,
        hospital?.pincode || branding?.pincode
    ].filter(Boolean).join(', ');
    const hospContact = [
        hospital?.phone || branding?.phone ? `Ph: ${hospital?.phone || branding?.phone}` : '',
        hospital?.email || branding?.email ? `Email: ${hospital?.email || branding?.email}` : ''
    ].filter(Boolean).join('  |  ');

    const patientName = cleanText(ptObj?.name || 'Patient');
    const ageGender = [
        ptObj?.age ? `${ptObj.age} Yrs` : '',
        ptObj?.gender || ''
    ].filter(Boolean).join(' / ');
    const mrn = cleanText(ptObj?.patientId || ptObj?.mrn || ptObj?.mrnNo || '');
    const ipdNo = cleanText(admission?.ipdNumber || (admission?._id ? String(admission._id).slice(-8).toUpperCase() : ''));
    const wardBed = [
        admission?.ward || admission?.bedId?.ward,
        admission?.bedNumber || admission?.bedId?.bedNumber ? `Bed ${admission?.bedNumber || admission?.bedId?.bedNumber}` : ''
    ].filter(Boolean).join(' — ');
    const department = cleanText(admission?.department || admission?.appointmentId?.department || docObj?.departments?.[0] || '');
    const consultantName = docObj?.name
        ? (docObj.name.match(/^Dr\.?\s/i) ? docObj.name : `Dr. ${docObj.name}`)
        : cleanText(admission?.consultant || '');

    const admDate = formatDate(admission?.admissionDate);
    const admDateFull = [admDate, cleanText(admission?.admissionTime)].filter(Boolean).join(' ');
    const disDate = formatDate(admission?.dischargeDate || dischargeSummary?.doctorSignedAt);
    const disDateFull = [disDate, cleanText(admission?.dischargeTime)].filter(Boolean).join(' ');

    // Derived clinical fields (prefer explicit dischargeSummary, fall back to saved IPD clinical notes / orders if recorded)
    const admissionReason = cleanText(dischargeSummary?.admissionReason || clinicalNote?.chiefComplaints || clinicalNote?.presentingComplaints || admission?.notes);
    const clinicalHistory = cleanText(
        dischargeSummary?.clinicalHistory ||
        [
            clinicalNote?.historyOfPresentIllness ? `HPI: ${clinicalNote.historyOfPresentIllness}` : '',
            clinicalNote?.pastMedicalHistory ? `Past History: ${clinicalNote.pastMedicalHistory}` : '',
            clinicalNote?.allergies ? `Allergies: ${clinicalNote.allergies}` : ''
        ].filter(Boolean).join('\n')
    );
    const diagnosis = cleanText(dischargeSummary?.diagnosis || admission?.diagnosis || clinicalNote?.provisionalDiagnosis);
    const clinicalExamination = cleanText(
        dischargeSummary?.clinicalExamination ||
        clinicalNote?.physicalExamination ||
        clinicalNote?.generalExamination ||
        clinicalNote?.systemicExamination
    );

    const labFindingsList = (Array.isArray(labReports) ? labReports : [])
        .map((r) => {
            const title = cleanText(r.testName || r.reportTitle || r.title);
            const summary = cleanText(r.resultSummary || r.findings || r.impression || r.status);
            const dt = formatDate(r.completedAt || r.createdAt);
            return title ? `• ${title}${dt ? ` (${dt})` : ''}${summary ? `: ${summary}` : ''}` : '';
        })
        .filter(Boolean);
    const investigationsText = [
        cleanText(dischargeSummary?.keyInvestigationsSummary),
        labFindingsList.length > 0 ? labFindingsList.join('\n') : ''
    ].filter(Boolean).join('\n');

    const medOrdersSummary = (Array.isArray(inpatientOrders) ? inpatientOrders : [])
        .filter((o) => o && o.status !== 'CANCELLED')
        .map((o) => {
            const dose = [o.dosageValue ?? o.dosage?.value, o.dosageUnit ?? o.dosage?.unit].filter(Boolean).join('');
            return `• ${o.medicineName}${dose ? ` (${dose})` : ''}${o.route ? `, ${o.route}` : ''}${o.frequency ? `, ${o.frequency}` : ''}`;
        });
    const treatmentText = [
        cleanText(dischargeSummary?.treatmentSummary),
        !cleanText(dischargeSummary?.treatmentSummary) && medOrdersSummary.length > 0
            ? `Inpatient Medications / Orders Administered:\n${medOrdersSummary.join('\n')}`
            : ''
    ].filter(Boolean).join('\n');

    const surgeryListText = (Array.isArray(surgeries) ? surgeries : [])
        .map((s) => {
            const name = cleanText(s.procedureName || s.surgeryName || s.title);
            const dt = formatDate(s.scheduledDate || s.completedAt || s.createdAt);
            const surg = s.surgeonId?.name ? `Surgeon: ${s.surgeonId.name}` : '';
            return name ? `• ${name}${dt ? ` (${dt})` : ''}${surg ? ` — ${surg}` : ''}` : '';
        })
        .filter(Boolean)
        .join('\n');
    const proceduresText = [
        cleanText(dischargeSummary?.proceduresSummary),
        surgeryListText
    ].filter(Boolean).join('\n');

    const hospitalCourse = cleanText(dischargeSummary?.hospitalCourse);

    // Vitals & observations
    const vitParts = [];
    if (latestVitals) {
        if (latestVitals.systolicBP || latestVitals.diastolicBP) {
            vitParts.push(`BP: ${latestVitals.systolicBP || '-'}/${latestVitals.diastolicBP || '-'} mmHg`);
        }
        if (latestVitals.pulse !== undefined && latestVitals.pulse !== '') vitParts.push(`Pulse: ${latestVitals.pulse} bpm`);
        if (latestVitals.temperature !== undefined && latestVitals.temperature !== '') vitParts.push(`Temp: ${latestVitals.temperature} °F`);
        if (latestVitals.spo2 !== undefined && latestVitals.spo2 !== '') vitParts.push(`SpO2: ${latestVitals.spo2}%`);
        if (latestVitals.respiratoryRate !== undefined && latestVitals.respiratoryRate !== '') vitParts.push(`RR: ${latestVitals.respiratoryRate} /min`);
        if (latestVitals.remark || latestVitals.notes) vitParts.push(`Notes: ${latestVitals.remark || latestVitals.notes}`);
    }
    const vitalsObservedAt = latestVitals?.recordedAt ? `Recorded on ${formatDate(latestVitals.recordedAt, true)}` : '';
    const vitalsText = [
        cleanText(dischargeSummary?.vitalsSummary),
        vitParts.length > 0 ? `${vitParts.join('  |  ')}${vitalsObservedAt ? ` (${vitalsObservedAt})` : ''}` : ''
    ].filter(Boolean).join('\n');

    const conditionAtDischarge = cleanText(dischargeSummary?.conditionAtDischarge);
    const dischargeAdvice = cleanText(dischargeSummary?.dischargeAdvice);
    const followUpDateText = formatDate(dischargeSummary?.followUpDate);
    const followUpInstructions = cleanText(dischargeSummary?.followUpInstructions);
    const returnPrecautions = cleanText(dischargeSummary?.returnPrecautions);

    const medications = (Array.isArray(dischargeSummary?.dischargeMedications) ? dischargeSummary.dischargeMedications : [])
        .filter((m) => m && cleanText(m.medicineName));

    const doctorQual = [docObj?.education, docObj?.specialization].filter(Boolean).join(' | ');
    const doctorReg = cleanText(docObj?.licenseNumber || '');
    const signedAtText = formatDate(dischargeSummary?.doctorSignedAt, true);
    const statusLabel = dischargeSummary?.status === 'FINALIZED' ? 'FINALIZED & SIGNED' : 'DRAFT';

    // Assemble ordered narrative clinical sections (only included when non-empty)
    const clinicalSections = [
        { title: 'Final Diagnosis', body: diagnosis },
        { title: 'Admission Reason & Chief Complaints', body: admissionReason },
        { title: 'Clinical History', body: clinicalHistory },
        { title: 'Clinical Examination', body: clinicalExamination },
        { title: 'Vitals & Clinical Observations', body: vitalsText },
        { title: 'Investigations & Key Findings', body: investigationsText },
        { title: 'Treatment Provided During Hospitalization', body: treatmentText },
        { title: 'Procedures / Surgeries Performed', body: proceduresText },
        { title: 'Hospital Course & Progress', body: hospitalCourse },
        { title: 'Condition at Discharge', body: conditionAtDischarge },
        { title: 'Discharge Advice', body: dischargeAdvice },
        {
            title: 'Follow-Up & Emergency Return Precautions',
            body: [
                followUpDateText ? `Follow-Up Date: ${followUpDateText}` : '',
                followUpInstructions ? `Follow-Up Instructions: ${followUpInstructions}` : '',
                returnPrecautions ? `Emergency Return Precautions: ${returnPrecautions}` : ''
            ].filter(Boolean).join('\n')
        }
    ].filter((s) => Boolean(cleanText(s.body)));

    return {
        hospName,
        logoUrl,
        hospAddress,
        hospContact,
        patientName,
        ageGender,
        patientPhone: cleanText(ptObj?.phone),
        bloodGroup: cleanText(ptObj?.bloodGroup),
        mrn,
        ipdNo,
        admDateFull,
        disDateFull,
        wardBed,
        department,
        consultantName,
        clinicalSections,
        medications,
        doctorName: consultantName,
        doctorQual,
        doctorReg,
        signedAtText,
        statusLabel
    };
}

/**
 * Load an image URL into a dataURL safely for jsPDF embedding (returns null on timeout/CORS failure).
 */
function loadImageAsDataUrl(url, timeoutMs = 1800) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                resolve(null);
            }
        }, timeoutMs);

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve({
                    dataUrl: canvas.toDataURL('image/png'),
                    width: canvas.width,
                    height: canvas.height
                });
            } catch (_) {
                resolve(null);
            }
        };
        img.onerror = () => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(null);
            }
        };
        img.src = url;
    });
}

/**
 * Download complete multi-page A4 Discharge Summary PDF via jsPDF + autoTable.
 */
export async function downloadDischargeSummaryPdf(params) {
    const model = buildDischargeDocumentModel(params);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    let y = 14;

    const ensureSpace = (needed = 16) => {
        if (y + needed > pageHeight - 18) {
            doc.addPage();
            y = 16;
        }
    };

    // 1. Hospital Letterhead & Logo
    const logoImg = await loadImageAsDataUrl(model.logoUrl);
    let headerTextX = margin;
    if (logoImg?.dataUrl) {
        const maxH = 14;
        const ratio = logoImg.width && logoImg.height ? logoImg.width / logoImg.height : 1;
        const drawW = Math.min(28, maxH * ratio);
        try {
            doc.addImage(logoImg.dataUrl, 'PNG', margin, y, drawW, maxH);
            headerTextX = margin + drawW + 4;
        } catch (_) {}
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(model.hospName, headerTextX, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    if (model.hospAddress) {
        const addrLines = doc.splitTextToSize(model.hospAddress, contentWidth - (headerTextX - margin) - 42);
        doc.text(addrLines, headerTextX, y + 9.5);
    }
    if (model.hospContact) {
        doc.text(model.hospContact, headerTextX, y + 14.5);
    }

    // Status pill right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(model.statusLabel.includes('FINALIZED') ? 21 : 180, model.statusLabel.includes('FINALIZED') ? 128 : 83, model.statusLabel.includes('FINALIZED') ? 61 : 9);
    doc.text(model.statusLabel, pageWidth - margin, y + 5, { align: 'right' });

    y += 19;
    doc.setDrawColor(13, 148, 136);
    doc.setLineWidth(0.7);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 118, 110);
    doc.text('INPATIENT DISCHARGE SUMMARY', pageWidth / 2, y, { align: 'center' });
    y += 6;

    // 2. Patient & Admission Details Table (2 columns)
    const metaRows = [
        [
            `Patient Name: ${model.patientName || '—'}`,
            `MRN / UHID: ${model.mrn || '—'}`
        ],
        [
            `Age / Gender: ${model.ageGender || '—'}${model.bloodGroup ? ` | Blood: ${model.bloodGroup}` : ''}`,
            `IPD Admission No.: ${model.ipdNo || '—'}`
        ],
        [
            `Phone: ${model.patientPhone || '—'}`,
            `Ward / Bed: ${model.wardBed || '—'}`
        ],
        [
            `Admission Date: ${model.admDateFull || '—'}`,
            `Discharge Date: ${model.disDateFull || '—'}`
        ],
        [
            `Department: ${model.department || '—'}`,
            `Consultant: ${model.doctorName || '—'}`
        ]
    ];

    autoTable(doc, {
        startY: y,
        body: metaRows,
        theme: 'grid',
        margin: { left: margin, right: margin },
        styles: {
            fontSize: 8.5,
            cellPadding: 2.3,
            textColor: [15, 23, 42],
            lineColor: [203, 213, 225],
            lineWidth: 0.2
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: contentWidth / 2 }, 1: { cellWidth: contentWidth / 2 } }
    });
    y = doc.lastAutoTable.finalY + 7;

    // 3. Clinical Narrative Sections (with page-break safety keeping heading + body together)
    for (const sec of model.clinicalSections) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const bodyLines = doc.splitTextToSize(sec.body, contentWidth - 4);
        const blockHeight = 6 + Math.min(bodyLines.length, 4) * 4.2 + 4;
        ensureSpace(blockHeight);

        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y - 3.5, contentWidth, 5.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(sec.title.toUpperCase(), margin + 2, y + 0.5);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        for (const line of bodyLines) {
            if (y > pageHeight - 16) {
                doc.addPage();
                y = 16;
            }
            doc.text(line, margin + 2, y);
            y += 4.3;
        }
        y += 3.5;
    }

    // 4. Take-Home Discharge Medications Table (repeating headers automatically across pages)
    if (model.medications.length > 0) {
        ensureSpace(22);
        doc.setFillColor(240, 253, 250);
        doc.rect(margin, y - 3.5, contentWidth, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 118, 110);
        doc.text('TAKE-HOME DISCHARGE MEDICATIONS', margin + 2, y + 0.5);
        y += 4;

        autoTable(doc, {
            startY: y,
            head: [['#', 'Medicine Name', 'Composition / Salt', 'Dosage', 'Route', 'Frequency', 'Duration', 'Qty', 'Instructions']],
            body: model.medications.map((m, idx) => [
                String(idx + 1),
                m.medicineName || '',
                m.composition || m.salt || '—',
                m.dosage || '—',
                m.route || 'Oral',
                m.frequency || '—',
                m.duration || '—',
                m.quantity || '—',
                m.instructions || '—'
            ]),
            margin: { left: margin, right: margin },
            showHead: 'everyPage',
            styles: {
                fontSize: 7.8,
                cellPadding: 2,
                textColor: [15, 23, 42],
                lineColor: [203, 213, 225],
                lineWidth: 0.2,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: [13, 148, 136],
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // 5. Doctor Sign-off Footer
    ensureSpace(24);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    if (model.signedAtText) {
        doc.text(`Signed / Updated: ${model.signedAtText}`, margin, y);
    }
    doc.text(`Document Status: ${model.statusLabel}`, margin, y + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(model.doctorName || 'Attending Physician', pageWidth - margin, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    if (model.doctorQual) {
        doc.text(model.doctorQual, pageWidth - margin, y + 4.5, { align: 'right' });
    }
    if (model.doctorReg) {
        doc.text(`Reg. No: ${model.doctorReg}`, pageWidth - margin, y + 9, { align: 'right' });
    }

    // Add page numbers on all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }

    const safeFilePart = (model.patientName || 'Patient').replace(/[^a-z0-9]+/gi, '_');
    doc.save(`Discharge_Summary_${safeFilePart}_${model.ipdNo || 'IPD'}.pdf`);
}

/**
 * Render and print the COMPLETE multi-page A4 Discharge Summary inside an isolated print iframe
 * so no dashboard navigation, modals, or scrollbars ever clip or appear on print.
 */
export function printDischargeSummaryDocument(params) {
    const model = buildDischargeDocumentModel(params);

    const sectionsHtml = model.clinicalSections.map((sec) => `
        <section class="ds-section">
            <h3 class="ds-section-heading">${escapeHtml(sec.title)}</h3>
            <div class="ds-section-body">${escapeHtml(sec.body).replace(/\n/g, '<br/>')}</div>
        </section>
    `).join('');

    const medsHtml = model.medications.length > 0 ? `
        <section class="ds-section">
            <h3 class="ds-section-heading">Take-Home Discharge Medications</h3>
            <table class="ds-med-table">
                <thead>
                    <tr>
                        <th style="width:28px">#</th>
                        <th>Medicine Name</th>
                        <th>Composition / Salt</th>
                        <th>Dosage</th>
                        <th>Route</th>
                        <th>Frequency</th>
                        <th>Duration</th>
                        <th>Qty</th>
                        <th>Instructions</th>
                    </tr>
                </thead>
                <tbody>
                    ${model.medications.map((m, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td><strong>${escapeHtml(m.medicineName)}</strong></td>
                            <td>${escapeHtml(m.composition || m.salt || '—')}</td>
                            <td>${escapeHtml(m.dosage || '—')}</td>
                            <td>${escapeHtml(m.route || 'Oral')}</td>
                            <td>${escapeHtml(m.frequency || '—')}</td>
                            <td>${escapeHtml(m.duration || '—')}</td>
                            <td>${escapeHtml(m.quantity || '—')}</td>
                            <td>${escapeHtml(m.instructions || '—')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </section>
    ` : '';

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Discharge Summary - ${escapeHtml(model.patientName)}</title>
<style>
    @page { size: A4 portrait; margin: 13mm 13mm 15mm 13mm; }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
        color: #0f172a;
        font-size: 11px;
        line-height: 1.45;
        background: #ffffff;
    }
    .ds-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
        border-bottom: 2px solid #0d9488;
        padding-bottom: 10px;
        margin-bottom: 10px;
    }
    .ds-brand {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .ds-logo {
        max-height: 52px;
        max-width: 140px;
        object-fit: contain;
    }
    .ds-hosp-name {
        margin: 0;
        font-size: 17px;
        font-weight: 800;
        color: #0f172a;
    }
    .ds-hosp-meta {
        margin: 2px 0 0;
        font-size: 10px;
        color: #475569;
    }
    .ds-status {
        font-size: 10px;
        font-weight: 800;
        padding: 3px 8px;
        border-radius: 4px;
        border: 1px solid #0d9488;
        color: #0f766e;
        white-space: nowrap;
    }
    .ds-doc-title {
        text-align: center;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0.06em;
        color: #0f766e;
        margin: 6px 0 10px;
        text-transform: uppercase;
    }
    .ds-meta-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 12px;
        font-size: 10.5px;
    }
    .ds-meta-table td {
        border: 1px solid #cbd5e1;
        padding: 5px 8px;
        width: 50%;
        vertical-align: top;
    }
    .ds-meta-table tr:nth-child(even) td {
        background: #f8fafc;
    }
    .ds-section {
        margin-bottom: 10px;
    }
    .ds-section-heading {
        margin: 0 0 4px;
        padding: 4px 8px;
        background: #f1f5f9;
        border-left: 3px solid #0d9488;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        color: #0f172a;
        break-after: avoid;
        page-break-after: avoid;
    }
    .ds-section-body {
        padding: 2px 8px 4px;
        color: #1e293b;
        word-break: break-word;
    }
    .ds-med-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 4px;
        font-size: 10px;
    }
    .ds-med-table thead {
        display: table-header-group;
    }
    .ds-med-table tr {
        break-inside: avoid;
        page-break-inside: avoid;
    }
    .ds-med-table th {
        background: #0d9488;
        color: #ffffff;
        font-weight: 700;
        text-align: left;
        padding: 5px 6px;
        border: 1px solid #0f766e;
    }
    .ds-med-table td {
        padding: 5px 6px;
        border: 1px solid #cbd5e1;
        vertical-align: top;
    }
    .ds-med-table tbody tr:nth-child(even) {
        background: #f8fafc;
    }
    .ds-signoff {
        margin-top: 18px;
        padding-top: 10px;
        border-top: 1px solid #cbd5e1;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        break-inside: avoid;
        page-break-inside: avoid;
    }
    .ds-sign-right {
        text-align: right;
    }
    .ds-sign-right strong {
        font-size: 11.5px;
        display: block;
    }
    .ds-muted {
        font-size: 9.5px;
        color: #475569;
    }
</style>
</head>
<body>
    <header class="ds-header">
        <div class="ds-brand">
            ${model.logoUrl ? `<img src="${escapeHtml(model.logoUrl)}" class="ds-logo" alt="${escapeHtml(model.hospName)}" onerror="this.style.display='none'" />` : ''}
            <div>
                <h1 class="ds-hosp-name">${escapeHtml(model.hospName)}</h1>
                ${model.hospAddress ? `<p class="ds-hosp-meta">${escapeHtml(model.hospAddress)}</p>` : ''}
                ${model.hospContact ? `<p class="ds-hosp-meta">${escapeHtml(model.hospContact)}</p>` : ''}
            </div>
        </div>
        <div class="ds-status">${escapeHtml(model.statusLabel)}</div>
    </header>

    <div class="ds-doc-title">Inpatient Discharge Summary</div>

    <table class="ds-meta-table">
        <tbody>
            <tr>
                <td><strong>Patient Name:</strong> ${escapeHtml(model.patientName || '—')}</td>
                <td><strong>MRN / UHID:</strong> ${escapeHtml(model.mrn || '—')}</td>
            </tr>
            <tr>
                <td><strong>Age / Gender:</strong> ${escapeHtml(model.ageGender || '—')}${model.bloodGroup ? ` | <strong>Blood:</strong> ${escapeHtml(model.bloodGroup)}` : ''}</td>
                <td><strong>IPD Admission No.:</strong> ${escapeHtml(model.ipdNo || '—')}</td>
            </tr>
            <tr>
                <td><strong>Phone:</strong> ${escapeHtml(model.patientPhone || '—')}</td>
                <td><strong>Ward / Bed:</strong> ${escapeHtml(model.wardBed || '—')}</td>
            </tr>
            <tr>
                <td><strong>Admission Date:</strong> ${escapeHtml(model.admDateFull || '—')}</td>
                <td><strong>Discharge Date:</strong> ${escapeHtml(model.disDateFull || '—')}</td>
            </tr>
            <tr>
                <td><strong>Department:</strong> ${escapeHtml(model.department || '—')}</td>
                <td><strong>Consultant:</strong> ${escapeHtml(model.doctorName || '—')}</td>
            </tr>
        </tbody>
    </table>

    ${sectionsHtml}
    ${medsHtml}

    <footer class="ds-signoff">
        <div>
            ${model.signedAtText ? `<div class="ds-muted">Signed / Updated: ${escapeHtml(model.signedAtText)}</div>` : ''}
            <div class="ds-muted">Status: ${escapeHtml(model.statusLabel)}</div>
        </div>
        <div class="ds-sign-right">
            <strong>${escapeHtml(model.doctorName || 'Attending Physician')}</strong>
            ${model.doctorQual ? `<div class="ds-muted">${escapeHtml(model.doctorQual)}</div>` : ''}
            ${model.doctorReg ? `<div class="ds-muted">Reg. No: ${escapeHtml(model.doctorReg)}</div>` : ''}
        </div>
    </footer>
</body>
</html>`;

    const existing = document.getElementById('m365-discharge-print-frame');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'm365-discharge-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    let printed = false;
    const triggerPrint = () => {
        if (printed) return;
        printed = true;
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } finally {
            setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 1500);
        }
    };

    iframe.onload = () => setTimeout(triggerPrint, 250);
    setTimeout(triggerPrint, 700);
}
