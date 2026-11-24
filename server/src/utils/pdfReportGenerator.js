const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

/**
 * High-fidelity Vector PDF Report Generator for Medical365 LMS Phase 8
 * Generates print-ready A4 diagnostic laboratory reports with:
 * - Hospital header & accreditation branding
 * - Patient demographics and order metadata
 * - Diagnostic test & parameter tables with biological reference ranges
 * - Color-coded abnormal (amber) and critical (red) flags
 * - Watermarking for non-released reports (PRELIMINARY, SUPERSEDED, etc.)
 * - Pathologist verification credentials and signature block
 * - Security verification QR code linking to verified portal check
 * - Multi-page numbering ("Page X of Y")
 */

/**
 * Format date nicely for report display
 */
function formatDate(date) {
  if (!date) return 'N/A';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (err) {
    return 'N/A';
  }
}

/**
 * Generate a PDF Buffer from lab report data and template
 * @param {Object} report Report document or populated plain object
 * @param {Object} [template] Optional LabReportTemplate object
 * @param {Object} [options] Optional flags (e.g. verificationUrl)
 * @returns {Promise<Buffer>}
 */
async function generateReportPDF(report, template = {}, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 36, bottom: 45, left: 36, right: 36 },
        bufferPages: true,
        info: {
          Title: `Medical365 Lab Report - ${report.reportNumber || 'DRAFT'}`,
          Author: 'Medical365 LIS',
          Subject: `Diagnostic Pathology Report for ${report.patientSnapshot?.name || 'Patient'}`,
          Keywords: 'Lab Report, Pathology, Diagnostics, Medical365'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const primaryColor = template?.primaryColor || '#0284c7';
      const accentColor = template?.accentColor || '#0f172a';
      const hospitalHeader = template?.hospitalHeader || {};

      const hospitalName = hospitalHeader.name || report.hospitalName || 'Medical365 Diagnostic Centre';
      const hospitalTagline = hospitalHeader.tagline || 'Excellence in Healthcare & Clinical Pathology';
      const hospitalAddress = hospitalHeader.address || '100 Medical Boulevard, Healthcare City';
      const hospitalContact = `Phone: ${hospitalHeader.phone || '+91 98765 43210'} | Email: ${hospitalHeader.email || 'lab@medical365.com'}`;
      const accreditationText = hospitalHeader.accreditationText || 'NABL (ISO 15189:2022) & CAP Certified Reference Laboratory';

      // Verification QR Code Generation
      const qrContent = options.verificationUrl || `https://medical365.app/verify/report/${report._id || report.reportNumber}`;
      let qrBuffer = null;
      try {
        qrBuffer = await QRCode.toBuffer(qrContent, {
          width: 80,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' }
        });
      } catch (e) {
        qrBuffer = null;
      }

      // Check report status for watermark
      const status = report.reportStatus || 'GENERATED';
      let watermarkText = null;
      if (status === 'SUPERSEDED') watermarkText = 'SUPERSEDED - AMENDED';
      else if (status === 'REJECTED') watermarkText = 'REJECTED / VOID';
      else if (status === 'CANCELLED') watermarkText = 'CANCELLED';
      else if (status !== 'RELEASED' && status !== 'APPROVED') watermarkText = 'PRELIMINARY REPORT';

      // --- 1. HEADER SECTION ---
      doc.save();
      // Top colored banner bar
      doc.rect(0, 0, doc.page.width, 6).fill(primaryColor);

      // Hospital Header Text
      doc.fillColor(primaryColor).fontSize(16).font('Helvetica-Bold').text(hospitalName, 36, 18);
      doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(hospitalTagline, 36, 36);
      doc.fillColor('#475569').fontSize(7.5).text(hospitalAddress, 36, 47);
      doc.fillColor('#475569').fontSize(7.5).text(hospitalContact, 36, 57);

      // Accreditation badge on top right
      doc.rect(370, 16, 189, 46).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.fillColor('#0369a1').fontSize(7.5).font('Helvetica-Bold').text('ACCREDITATION & QUALITY ASSURANCE', 376, 22);
      doc.fillColor('#475569').fontSize(7).font('Helvetica').text(accreditationText, 376, 33, { width: 177 });

      // Title Bar
      doc.rect(36, 70, 523, 20).fill('#f1f5f9');
      const repTitle = report.supersededBy ? 'AMENDED DIAGNOSTIC REPORT' : 'DIAGNOSTIC PATHOLOGY REPORT';
      doc.fillColor(accentColor).fontSize(10).font('Helvetica-Bold').text(repTitle, 44, 75);

      const statusBadge = `STATUS: ${status}`;
      doc.fillColor(status === 'RELEASED' ? '#166534' : '#b45309').fontSize(8).font('Helvetica-Bold')
        .text(statusBadge, 400, 76, { align: 'right', width: 150 });

      // --- 2. PATIENT & ORDER DEMOGRAPHICS BOX ---
      const demoY = 96;
      doc.rect(36, demoY, 523, 62).fillAndStroke('#ffffff', '#e2e8f0');

      const pat = report.patientSnapshot || {};
      const refDoc = report.referringDoctor || {};

      // Left Column: Patient Details
      doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('PATIENT NAME', 44, demoY + 6);
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text((pat.name || 'N/A').toUpperCase(), 44, demoY + 16);

      doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('AGE / GENDER', 44, demoY + 30);
      const ageStr = `${pat.age || 0} ${pat.ageUnit || 'Years'} / ${pat.gender || 'Unknown'}`;
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica').text(ageStr, 44, demoY + 40);

      doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('PATIENT UHID / MRN', 160, demoY + 6);
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica').text(pat.uhid || pat.mrn || 'N/A', 160, demoY + 16);

      doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('PHONE NUMBER', 160, demoY + 30);
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica').text(pat.phone || 'N/A', 160, demoY + 40);

      // Vertical separator
      doc.strokeColor('#e2e8f0').moveTo(270, demoY + 4).lineTo(270, demoY + 58).stroke();

      // Right Column: Order / Sample / Doctor Details
      doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('REPORT NUMBER', 280, demoY + 6);
      doc.fillColor('#0284c7').fontSize(8.5).font('Helvetica-Bold').text(report.reportNumber || 'DRAFT', 280, demoY + 16);

      doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('ORDER NO / TOKEN', 280, demoY + 30);
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica').text(`${report.orderNumber || 'N/A'} (Token: ${report.tokenNumber || '-'})`, 280, demoY + 40);

      doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('REFERRING DOCTOR', 415, demoY + 6);
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica').text(refDoc.name || 'Self / Direct', 415, demoY + 16, { width: 135 });

      doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('REPORTED DATE', 415, demoY + 30);
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica').text(formatDate(report.releasedAt || report.approvedAt || report.generatedAt), 415, demoY + 40);

      // Amendment notification banner if amended
      let curY = demoY + 68;
      if (report.revisionNumber > 1 || report.amendmentReason) {
        doc.rect(36, curY, 523, 20).fillAndStroke('#fef3c7', '#fde68a');
        doc.fillColor('#92400e').fontSize(7.5).font('Helvetica-Bold')
          .text(`REVISION ${report.revisionNumber}: AMENDED REPORT. Reason: ${report.amendmentReason || 'Clinical revision'}. Original Report: ${report.originalReportId || 'Previous'}`, 44, curY + 5, { width: 507 });
        curY += 25;
      }

      // --- 3. TEST RESULTS & PARAMETERS ---
      doc.restore();

      const tests = Array.isArray(report.tests) ? report.tests : [];

      for (const t of tests) {
        // Check if page overflow
        if (curY > 670) {
          doc.addPage();
          curY = 36;
        }

        // Test Section Header
        doc.rect(36, curY, 523, 22).fill('#f8fafc');
        doc.fillColor(primaryColor).fontSize(9.5).font('Helvetica-Bold').text((t.testName || 'Test').toUpperCase(), 44, curY + 6);
        
        let metaRight = [];
        if (t.barcode) metaRight.push(`Barcode: ${t.barcode}`);
        if (t.sampleType) metaRight.push(`Sample: ${t.sampleType}`);
        if (t.methodology) metaRight.push(`Method: ${t.methodology}`);
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(metaRight.join(' | '), 300, curY + 7, { align: 'right', width: 250 });

        curY += 24;

        // Table Column Headers
        doc.rect(36, curY, 523, 16).fill('#0f172a');
        doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
        doc.text('INVESTIGATION / PARAMETER', 44, curY + 4);
        doc.text('OBSERVED VALUE', 230, curY + 4);
        doc.text('UNIT', 320, curY + 4);
        doc.text('REFERENCE INTERVAL', 370, curY + 4);
        doc.text('STATUS / FLAG', 485, curY + 4);

        curY += 18;

        const params = Array.isArray(t.parameters) ? t.parameters : [];
        if (params.length === 0) {
          doc.fillColor('#64748b').fontSize(8).font('Helvetica-Oblique').text('No discrete parameters recorded for this test.', 44, curY + 4);
          curY += 16;
        }

        for (let i = 0; i < params.length; i++) {
          const p = params[i];
          if (curY > 700) {
            doc.addPage();
            curY = 36;
          }

          // Alternating row background
          if (i % 2 === 0) {
            doc.rect(36, curY - 2, 523, 16).fill('#fbfcfd');
          }

          const isCritical = p.criticalFlag || p.abnormalFlag === 'CRITICAL_LOW' || p.abnormalFlag === 'CRITICAL_HIGH';
          const isAbnormal = isCritical || p.abnormalFlag === 'ABNORMAL' || p.abnormalFlag === 'HIGH' || p.abnormalFlag === 'LOW';

          // Parameter Name
          doc.fillColor(isCritical ? '#991b1b' : '#1e293b').fontSize(8).font(isCritical ? 'Helvetica-Bold' : 'Helvetica')
            .text(p.parameterName || '-', 44, curY + 2, { width: 180, ellipsis: true });

          // Observed Value
          const valStr = p.enteredValue || (p.numericValue !== null && p.numericValue !== undefined ? String(p.numericValue) : '-');
          doc.fillColor(isCritical ? '#b91c1c' : (isAbnormal ? '#b45309' : '#0f172a'))
            .fontSize(8.5).font(isAbnormal ? 'Helvetica-Bold' : 'Helvetica')
            .text(valStr, 230, curY + 2, { width: 85 });

          // Unit
          doc.fillColor('#475569').fontSize(7.5).font('Helvetica').text(p.unit || '-', 320, curY + 2, { width: 45 });

          // Reference Interval
          doc.fillColor('#475569').fontSize(7.5).font('Helvetica').text(p.referenceRangeText || 'As per age/sex', 370, curY + 2, { width: 110 });

          // Flag / Status
          if (isCritical) {
            doc.fillColor('#dc2626').fontSize(7.5).font('Helvetica-Bold').text('* CRITICAL *', 485, curY + 2);
          } else if (isAbnormal) {
            doc.fillColor('#d97706').fontSize(7.5).font('Helvetica-Bold').text(p.abnormalFlag || 'ABNORMAL', 485, curY + 2);
          } else {
            doc.fillColor('#16a34a').fontSize(7.5).font('Helvetica').text('NORMAL', 485, curY + 2);
          }

          curY += 16;
        }

        // Test remarks / notes if present
        if (t.overallRemarks || t.clinicalNotes) {
          const notes = [t.overallRemarks, t.clinicalNotes].filter(Boolean).join(' | ');
          doc.fillColor('#64748b').fontSize(7).font('Helvetica-Oblique').text(`Note: ${notes}`, 44, curY + 2, { width: 507 });
          curY += 14;
        }

        curY += 8;
      }

      // --- 4. OVERALL INTERPRETATION / CLINICAL NOTES ---
      if (report.overallInterpretation || report.clinicalNotes) {
        if (curY > 660) {
          doc.addPage();
          curY = 36;
        }
        doc.rect(36, curY, 523, 30).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fillColor('#0369a1').fontSize(8).font('Helvetica-Bold').text('CLINICAL IMPRESSION & INTERPRETATION:', 44, curY + 4);
        const interpText = [report.overallInterpretation, report.clinicalNotes].filter(Boolean).join('\n');
        doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(interpText, 44, curY + 14, { width: 507 });
        curY += 36;
      }

      // End of Test Results marker
      doc.strokeColor('#cbd5e1').moveTo(36, curY + 2).lineTo(559, curY + 2).stroke();
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Bold').text('*** END OF REPORT ***', 36, curY + 6, { align: 'center', width: 523 });
      curY += 18;

      // Ensure space for Sign-off block
      if (curY > 680) {
        doc.addPage();
        curY = 36;
      }

      // --- 5. SIGN-OFF, QR CODE & DISCLAIMER SECTION ---
      const sigY = Math.max(curY + 10, doc.page.height - 130);
      const sigConfig = template?.signatureConfig || {};

      // QR Code on bottom left
      if (qrBuffer) {
        doc.image(qrBuffer, 44, sigY - 10, { width: 65, height: 65 });
        doc.fillColor('#64748b').fontSize(6).font('Helvetica').text('Scan to Verify Online', 40, sigY + 57, { width: 75, align: 'center' });
      }

      // Legal Disclaimer in Center
      const disclaimer = template?.disclaimer || 'Clinical correlation is advised. Partial reproduction prohibited.';
      const footerMsg = template?.footerText || 'This is an electronically validated diagnostic report.';
      doc.fillColor('#64748b').fontSize(6.5).font('Helvetica')
        .text(disclaimer, 130, sigY + 10, { width: 230 });
      doc.fillColor('#94a3b8').fontSize(6).font('Helvetica')
        .text(footerMsg, 130, sigY + 36, { width: 230 });

      // Pathologist Signature on Right
      doc.strokeColor('#0f172a').moveTo(390, sigY + 24).lineTo(540, sigY + 24).stroke();

      const signatoryName = report.approvedByName || report.releasedByName || sigConfig.signatoryName || 'Dr. Sarah Jenkins, MD, FRCPath';
      const signatoryDesignation = sigConfig.signatoryDesignation || 'Chief Pathologist & Lab Director';
      const signatoryReg = sigConfig.signatoryRegistration || 'MCI-REG-847291';

      doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold').text(signatoryName, 380, sigY + 28, { width: 170, align: 'center' });
      doc.fillColor('#475569').fontSize(7).font('Helvetica').text(signatoryDesignation, 380, sigY + 40, { width: 170, align: 'center' });
      doc.fillColor('#64748b').fontSize(6.5).font('Helvetica').text(`Reg No: ${signatoryReg}`, 380, sigY + 50, { width: 170, align: 'center' });

      // --- 6. WATERMARK & MULTI-PAGE NUMBERING ---
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);

        // Watermark if applicable
        if (watermarkText) {
          doc.save();
          doc.fillColor('#94a3b8', 0.12);
          doc.fontSize(44).font('Helvetica-Bold');
          doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
          doc.text(watermarkText, 50, doc.page.height / 2 - 20, {
            align: 'center',
            width: doc.page.width
          });
          doc.restore();
        }

        // Bottom colored line
        doc.rect(0, doc.page.height - 4, doc.page.width, 4).fill(primaryColor);

        // Page Numbering Footer
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(
          `Page ${i + 1} of ${range.count}  |  Report ID: ${report.reportNumber || 'DRAFT'}  |  Generated by Medical365 LIS`,
          36,
          doc.page.height - 18,
          { align: 'center', width: doc.page.width - 72 }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateReportPDF
};
