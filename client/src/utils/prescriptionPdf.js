import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generate and download a professional OPD Medical Prescription PDF
 */
export const downloadPrescriptionPdf = ({
    clinic = {},
    doctor = {},
    patient = {},
    prescription = {},
    vitals = {},
    diagnosis = '',
    notes = '',
    followUpDate = null,
    date = new Date()
}) => {
    try {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const primaryColor = [20, 184, 166]; // #14b8a6 teal
        const darkColor = [10, 38, 71];      // #0a2647 navy
        const grayColor = [100, 116, 139];   // #64748b slate

        // 1. CLINIC HEADER BAR
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 0, pageWidth, 28, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        const clinicTitle = clinic.name || 'Autonomous Doctor OPD Clinic';
        doc.text(clinicTitle, 14, 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const clinicSub = [clinic.address, clinic.city, clinic.phone ? `Ph: ${clinic.phone}` : '']
            .filter(Boolean).join(' • ');
        if (clinicSub) {
            doc.text(clinicSub, 14, 18);
        }
        doc.text('Powered by Medical365 OPD', 14, 23);

        // DOCTOR IDENTITY (Right Side of Header)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        const docName = doctor.name ? `Dr. ${doctor.name.replace(/^Dr\.?\s*/i, '')}` : 'Consulting Physician';
        doc.text(docName, pageWidth - 14, 12, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const docQual = [doctor.education || doctor.qualification, doctor.specialty || doctor.specialization]
            .filter(Boolean).join(' | ');
        if (docQual) {
            doc.text(docQual, pageWidth - 14, 18, { align: 'right' });
        }
        if (doctor.phone || doctor.email) {
            doc.text(doctor.phone || doctor.email, pageWidth - 14, 23, { align: 'right' });
        }

        // 2. PATIENT DEMOGRAPHICS BAR
        let cursorY = 36;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, cursorY, pageWidth - 28, 22, 2, 2, 'FD');

        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`Patient: ${patient.name || 'Walk-in Patient'}`, 18, cursorY + 7);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        const ageGender = [
            patient.age ? `${patient.age} Yrs` : null,
            patient.gender,
            patient.bloodGroup ? `Blood: ${patient.bloodGroup}` : null
        ].filter(Boolean).join(' / ');
        doc.text(ageGender || 'Age/Gender: N/A', 18, cursorY + 13);

        const patCode = patient.patientUid || patient.patientId || patient.mrn || 'N/A';
        doc.text(`Patient ID: ${patCode}`, 18, cursorY + 18);

        // Right side of patient box (Date & Contact)
        const dateFormatted = new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(`Date: ${dateFormatted}`, pageWidth - 18, cursorY + 7, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        if (patient.phone) {
            doc.text(`Mobile: ${patient.phone}`, pageWidth - 18, cursorY + 13, { align: 'right' });
        }
        if (patient.address) {
            doc.text(`City: ${patient.address.slice(0, 30)}`, pageWidth - 18, cursorY + 18, { align: 'right' });
        }

        cursorY += 28;

        // 3. VITALS STRIP (if any vitals recorded)
        const activeVitals = [];
        const v = vitals || prescription.vitals || {};
        if (v.bp) activeVitals.push(`BP: ${v.bp} mmHg`);
        if (v.pulse) activeVitals.push(`Pulse: ${v.pulse} bpm`);
        if (v.temp) activeVitals.push(`Temp: ${v.temp} °F`);
        if (v.weight) activeVitals.push(`Wt: ${v.weight} kg`);
        if (v.spo2) activeVitals.push(`SpO2: ${v.spo2}%`);

        if (activeVitals.length > 0) {
            doc.setFillColor(240, 253, 250);
            doc.setDrawColor(153, 246, 228);
            doc.roundedRect(14, cursorY, pageWidth - 28, 8, 1, 1, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(13, 148, 136);
            doc.text(`Vitals:  ${activeVitals.join('   |   ')}`, 18, cursorY + 5.5);
            cursorY += 13;
        }

        // 4. CLINICAL DIAGNOSIS & SYMPTOMS
        const diagText = diagnosis || prescription.diagnosis || patient.diagnosis || '';
        if (diagText) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
            doc.text('Clinical Diagnosis:', 14, cursorY);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(51, 65, 85);
            doc.text(diagText, 52, cursorY);
            cursorY += 8;
        }

        // 5. Rx SYMBOL
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('℞', 14, cursorY + 2);
        cursorY += 4;

        // 6. MEDICINES TABLE (jspdf-autotable)
        const rawMeds = prescription.medicines || prescription.pharmacy || [];
        const tableData = rawMeds.map((m, idx) => [
            String(idx + 1),
            m.medicineName || m.name || 'Medicine',
            m.dosage || '1 tab',
            m.frequency || '1-0-1',
            m.duration || '5 days',
            m.instructions || 'After meals'
        ]);

        if (tableData.length === 0) {
            tableData.push(['1', 'Consultation Advice Only (No prescription medicines prescribed)', '-', '-', '-', '-']);
        }

        autoTable(doc, {
            startY: cursorY,
            margin: { left: 14, right: 14 },
            head: [['#', 'Medicine / Formula', 'Dosage', 'Frequency', 'Duration', 'Instructions']],
            body: tableData,
            theme: 'striped',
            headStyles: {
                fillColor: [10, 38, 71],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8.5
            },
            bodyStyles: {
                fontSize: 8.5,
                textColor: [30, 41, 59]
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 55, fontStyle: 'bold' },
                2: { cellWidth: 25 },
                3: { cellWidth: 25 },
                4: { cellWidth: 25 },
                5: { cellWidth: 42 }
            }
        });

        cursorY = doc.lastAutoTable.finalY + 10;

        // 7. DOCTOR NOTES / ADVICE
        const doctorNotes = notes || prescription.doctorNotes || prescription.notes || '';
        if (doctorNotes) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
            doc.text('Doctor Advice & Special Instructions:', 14, cursorY);
            cursorY += 5;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(71, 85, 105);
            const splitNotes = doc.splitTextToSize(doctorNotes, pageWidth - 28);
            doc.text(splitNotes, 14, cursorY);
            cursorY += (splitNotes.length * 4.5) + 6;
        }

        // 8. FOLLOW-UP REVISIT DATE
        const followUp = followUpDate || prescription.followUpDate;
        if (followUp) {
            const followUpFormatted = new Date(followUp).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
            doc.setFillColor(254, 243, 199);
            doc.setDrawColor(245, 158, 11);
            doc.roundedRect(14, cursorY, 80, 8, 1, 1, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(180, 83, 9);
            doc.text(`📅 Next Follow-Up Date: ${followUpFormatted}`, 18, cursorY + 5.5);
        }

        // 9. SIGNATURE & STAMP FOOTER
        const footerY = doc.internal.pageSize.getHeight() - 25;
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.line(pageWidth - 65, footerY - 5, pageWidth - 14, footerY - 5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text(docName, pageWidth - 14, footerY, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.text('Authorized Medical Practitioner', pageWidth - 14, footerY + 4, { align: 'right' });

        // Bottom legal notice
        doc.setFontSize(7);
        doc.text('This prescription is digitally recorded and valid per Medical365 Electronic Health Record Standards.', 14, footerY + 12);

        // Download trigger
        const safePatientName = (patient.name || 'Patient').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `Prescription_${safePatientName}_${dateFormatted.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
        doc.save(filename);
        return true;
    } catch (err) {
        console.error('Error generating prescription PDF:', err);
        throw err;
    }
};

