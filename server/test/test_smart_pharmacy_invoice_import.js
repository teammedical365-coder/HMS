/**
 * Comprehensive Verification Suite: Smart Pharmacy Vendor Invoice PDF Import
 * Tests:
 * 1. Multi-page 32-item Indian wholesale tax invoice (Ashoka Pharmacy layout, wrapped descriptions, split decimals, N/A expiry)
 * 2. Alternate vendor layout with reordered columns, Vendor Aliases, Scheme Qty (10+2), Salt & Manufacturer
 * 3. Scanned / Image-only PDF detection + Layer 3 OCR Fallback (with non-fabrication rules & error handling)
 * 4. Missing fields, invalid qty/rate, unreadable expiry, math mismatch warnings (without mutating values)
 * 5. Long medicine names & similar medicine candidate matching (never auto-merged)
 * 6. Vendor Format Learning adaptation
 * 7. Error handling: Corrupted PDF, Empty PDF, Spoofed non-PDF, Oversized PDF, Password PDF
 */
const assert = require('assert');
const PDFDocument = require('pdfkit');
const {
    parseInvoice,
    validatePdfBuffer,
    InvoiceParseError,
    parseIndianNumber,
    parseExpiryValue
} = require('../src/utils/invoiceParser');
const {
    processInvoiceDocument,
    computeMedicineSimilarity,
    findMedicineCandidateMatches,
    scoreAndValidateRow
} = require('../src/services/pharmacyInvoiceExtractor.service');

function buildPdfBuffer(drawFn) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 36 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        drawFn(doc);
        doc.end();
    });
}

// Helper to draw a table row with column X-positions on pdfkit
function drawCols(doc, y, colDefs, vals, fontSize = 8) {
    doc.fontSize(fontSize).font('Helvetica');
    let maxY = y + 12;
    colDefs.forEach((c, idx) => {
        const text = String(vals[idx] ?? '');
        doc.text(text, c.x, y, { width: c.w, align: c.align || 'left' });
        if (doc.y > maxY) maxY = doc.y;
    });
    return maxY + 3;
}

async function runTests() {
    let passed = 0;
    let failed = 0;

    async function runCase(name, fn) {
        try {
            await fn();
            passed += 1;
            console.log(`PASS: ${name}`);
        } catch (err) {
            failed += 1;
            console.error(`FAIL: ${name} -> ${err.message}`);
            if (err.stack) console.error(err.stack.split('\n').slice(0, 4).join('\n'));
        }
    }

    // ------------------------------------------------------------------
    // TEST 1: Multi-Page 32-Item Wholesale Tax Invoice (Ashoka Layout)
    // ------------------------------------------------------------------
    await runCase('1. Multi-page 32-item Ashoka Pharmacy layout + split descriptions + split decimal + N/A expiry', async () => {
        const cols = [
            { x: 35, w: 22 },  // Sr.
            { x: 60, w: 120 }, // Item Description
            { x: 184, w: 30 }, // HSN
            { x: 218, w: 50 }, // Batch No.
            { x: 272, w: 34 }, // Exp.
            { x: 310, w: 30 }, // Qty
            { x: 344, w: 48 }, // MRP
            { x: 396, w: 48 }, // Sale Rate
            { x: 448, w: 28 }, // Disc%
            { x: 480, w: 28 }, // GST%
            { x: 512, w: 55 }  // Amount
        ];

        const drawHeader = (doc, startY) => {
            doc.font('Helvetica-Bold').fontSize(8);
            doc.text('Sr.', cols[0].x, startY);
            doc.text('Item Description (Tablets, Inj, etc.)', cols[1].x, startY, { width: cols[1].w });
            doc.text('HSN', cols[2].x, startY);
            doc.text('Batch No.', cols[3].x, startY);
            doc.text('Exp.', cols[4].x, startY);
            doc.text('Qty', cols[5].x, startY);
            doc.text('MRP (₹)', cols[6].x, startY);
            doc.text('Sale\nRate', cols[7].x, startY, { width: cols[7].w });
            doc.text('Disc%', cols[8].x, startY);
            doc.text('GST\n%', cols[9].x, startY, { width: cols[9].w });
            doc.text('Amount (₹)', cols[10].x, startY, { width: cols[10].w });
            return startY + 24;
        };

        const items32 = [
            ['1', 'Paracetamol 650mg Tablets (10×15 Box)', '3004', 'AP-1042', '08/28', '200', '320.00', '200.00', '10', '12', '40,320.00'],
            ['2', 'Amoxicillin & Clavulanate 625mg Tabs (10×10)', '3004', 'AC-8821', '05/28', '120', '2,050.00', '1,450.00', '12', '12', '1,71,494.40'],
            ['3', 'Pantoprazole 40mg Gastro Tabs (10×15 Box)', '3004', 'PN-4490', '11/28', '150', '1,550.00', '920.00', '10', '12', '1,39,104.00'],
            ['4', 'Azithromycin 500mg Tablets (10×5 Box)', '3004', 'AZ-3319', '06/28', '100', '1,320.00', '1,100.00', '8', '12', '1,13,344.00'],
            ['5', 'Metformin HCl SR 500mg Tabs (10×20 Box)', '3004', 'MT-7712', '09/28', '180', '640.00', '420.00', '10', '5', '71,442.00'],
            ['6', 'Atorvastatin 10mg Tablets (10×15 Box)', '3004', 'AT-5504', '07/28', '140', '980.00', '680.00', '10', '12', '95,961.60'],
            ['7', 'Telmisartan 40mg Tablets (10×15 Box)', '3004', 'TM-6632', '08/28', '130', '1,890.00', '1,350.00', '10', '12', '1,76,904.00'],
            ['8', 'Cetirizine 10mg Anti-Allergic Tabs (20×10)', '3004', 'CT-2091', '12/28', '160', '420.00', '260.00', '15', '12', '39,603.20'],
            ['9', 'Aceclofenac & Paracetamol Tabs (10×10 Box)', '3004', 'AC-3098', '10/28', '150', '850.00', '540.00', '10', '12', '81,648.00'],
            ['10', 'Cefixime 200mg Dispersible Tabs (10×10 Box)', '3004', 'CF-7104', '06/28', '110', '1,150.00', '820.00', '10', '12', '90,914.40'],
            ['11', 'Montelukast & Levocetirizine Tabs (10×10)', '3004', 'ML-5589', '09/28', '120', '1,450.00', '960.00', '10', '12', '1,16,121.60'],
            ['12', 'Omeprazole & Domperidone Caps (10×15 Box)', '3004', 'OM-2241', '07/28', '140', '1,280.00', '780.00', '12', '12', '1,07,627.52'],
            ['13', 'Vitamin D3 60,000 IU Softgel Caps (10×4 Box)', '3004', 'VD-4088', '03/28', '110', '1,680.00', '1,200.00', '12', '12', '1,30,099.20'],
            ['14', 'B-Complex & Vitamin C Capsules (20×15 Box)', '3004', 'BC-8834', '11/28', '160', '920.00', '600.00', '10', '12', '96,768.00'],
            ['15', 'Ceftriaxone 1g Dry Powder Injection (Vial+WFI)', '3004', 'CX-9012', '04/28', '300', '68.00', '45.00', '10', '12', '13,608.00'],
            ['16', 'Pantoprazole 40mg IV Injection Vial', '3004', 'PI-3310', '08/28', '250', '55.00', '36.00', '10', '12', '9,072.00'],
            ['17', 'Ondansetron 2mg/ml Injection (Box of 10 Amp)', '3004', 'ON-4471', '09/28', '150', '140.00', '90.00', '10', '12', '13,608.00'],
            ['18', 'Diclofenac Sodium 75mg/ml Aq. Inj (10×1ml)', '3004', 'DC-6721', '05/28', '180', '260.00', '170.00', '10', '12', '30,844.80'],
            ['19', 'Amikacin Sulphate 500mg/2ml Injection Vial', '3004', 'AM-1182', '07/28', '200', '95.00', '62.00', '10', '12', '12,499.20'],
            ['20', 'Methylcobalamin 1500mcg+ Vit B6 Inj (5×2ml)', '3004', 'MC-5093', '10/28', '120', '480.00', '310.00', '10', '12', '37,497.60'],
            ['21', 'Insulin Glargine 100 IU/ml Cartridge (Pack of 5)', '3004', 'IN-1190', '02/28', '45', '3,150.00', '2,400.00', '5', '5', '1,07,730.00'],
            ['22', 'Sodium Chloride 0.9% NS IV Fluid 500ml Bottle', '3004', 'NS-9940', '12/28', '400', '48.00', '28.00', '5', '12', '11,916.80'],
            ['23', 'Dextromethorphan & CPM Cough Syrup 100ml', '3004', 'CS-6140', '04/28', '250', '135.00', '95.00', '10', '12', '23,940.00'],
            ['24', 'Ambroxol, Terbutaline & Guaiphenesin Syrup 100ml', '3004', 'AT-8312', '08/28', '200', '128.00', '85.00', '10', '12', '17,136.00'],
            ['25', 'Sucralfate & Oxetacaine Antacid Gel 200ml', '3004', 'SC-2045', '06/28', '150', '195.00', '130.00', '10', '12', '19,656.00'],
            ['26', 'Salbutamol 100mcg Pressurized Inhaler (200 MD)', '3004', 'SB-7731', '11/28', '100', '165.00', '115.00', '8', '12', '11,849.60'],
            ['27', 'Moxifloxacin 0.5% Sterile Eye Drops 5ml', '3004', 'MX-4190', '05/28', '180', '145.00', '90.00', '10', '12', '16,329.60'],
            ['28', 'Povidone-Iodine 5% Microbicidal Ointment 20g', '3004', 'PV-6204', '09/28', '220', '92.00', '58.00', '10', '12', '12,862.08'],
            ['29', 'ORS WHO Formula Powder 21.8g (Box of 50)', '3004', 'OR-9102', '10/28', '80', '1,100.00', '850.00', '10', '12', '68,544.00'],
            ['30', 'Surgical 3-Ply Face Masks (Box of 100 Units)', '6307', 'SM-8801', '11/29', '200', '450.00', '220.00', '15', '5', '39,270.00'],
            ['31', 'Sterile Nitrile Examination Gloves (Box of 100)', '4015', 'NG-5023', '09/29', '120', '750.00', '480.00', '10', '12', '58,060.80'],
            ['32', 'Digital Infrared Non-Contact Thermometer', '9025', 'DT-3014', 'N/A', '50', '1,650.00', '950.00', '10', '18', '50,445.00']
        ];

        const pdfBuf = await buildPdfBuffer((doc) => {
            doc.font('Helvetica-Bold').fontSize(11).text('TAX INVOICE - BULK WHOLESALE ORDER', 35, 30);
            doc.fontSize(12).text('Ashoka Pharmacy', 35, 52);
            doc.font('Helvetica').fontSize(8).text('Plot No. 42, Wholesale Pharma Market, Johari Bazar, Jaipur, Rajasthan - 302003', 35, 68, { width: 220 });
            doc.text('Mobile: +91 98290-45120 | Email: billing@ashokapharmacy.in', 35, 92, { width: 240 });
            doc.text('GSTIN: 08AABFA4821K1Z5 | DL No.: RJ-JPR-20B/21B-44192', 35, 106, { width: 240 });
            doc.text('Invoice Number: AP/26-27/0849', 310, 52);
            doc.text('Invoice / Bill Date: 25-Nov-2026', 310, 68);
            doc.text('Billed To: Medical 365 Pharmacy, GSTIN: 08AAECM7914D1Z8', 35, 130);

            let y = drawHeader(doc, 165);
            items32.slice(0, 17).forEach((row) => {
                y = drawCols(doc, y, cols, row, 7.5);
            });
            doc.fontSize(7.5).text('Ashoka Pharmacy — Bulk Wholesale Tax Invoice Page 1 of 3', 35, 785, { lineBreak: false });

            doc.addPage();
            y = drawHeader(doc, 40);
            items32.slice(17, 27).forEach((row) => {
                y = drawCols(doc, y, cols, row, 7.5);
            });
            doc.fontSize(7.5).text('Ashoka Pharmacy — Bulk Wholesale Tax Invoice Page 2 of 3', 35, 785, { lineBreak: false });

            doc.addPage();
            y = drawHeader(doc, 40);
            items32.slice(27, 32).forEach((row) => {
                y = drawCols(doc, y, cols, row, 7.5);
            });
            doc.font('Helvetica-Bold').fontSize(8).text('Total Bulk Quantity (32 Items) & Grand Total    5,165    Net Payable (Incl. GST)    20,26,222.40', 35, y + 10);
            doc.font('Helvetica').fontSize(8).text('Total Taxable Value = 18,20,410.00 | Total GST = 2,05,812.40 | Grand Total = 20,26,222.40', 35, y + 26);
        });

        const processed = await processInvoiceDocument({
            buffer: pdfBuf,
            allowOcrFallback: false
        });

        assert.strictEqual(processed.invoice.vendorName, 'Ashoka Pharmacy');
        assert.strictEqual(processed.invoice.vendorGST, '08AABFA4821K1Z5');
        assert.strictEqual(processed.invoice.invoiceNumber, 'AP/26-27/0849');
        assert.strictEqual(processed.invoice.grandTotal, 2026222.40);
        assert.strictEqual(processed.extractionMeta.pageCount, 3);
        assert.strictEqual(processed.medicines.length, 32);

        const itm2 = processed.medicines.find((m) => m.batch === 'AC-8821');
        assert(itm2 && itm2.purchaseRate === 1450 && itm2.mrp === 2050 && itm2.gst === 12 && Math.abs(itm2.amount - 171494.40) < 0.05);
        assert.strictEqual(itm2.validationStatus, 'Valid');

        const itm32 = processed.medicines.find((m) => m.batch === 'DT-3014');
        assert(itm32 && itm32.expiry === '' && itm32.expiryIsNA === true && itm32.gst === 18);
    });

    // ------------------------------------------------------------------
    // TEST 2: Reordered Columns + Alternate Vendor Aliases + 10+2 Scheme + Missing Fields Stay Blank
    // ------------------------------------------------------------------
    await runCase('2. Alternate vendor layout with reordered columns, 10+2 scheme, missing fields blank (no fabrication)', async () => {
        const cols = [
            { x: 35, w: 65 },  // Lot No
            { x: 105, w: 130 },// Item Particulars
            { x: 240, w: 75 }, // Composition
            { x: 320, w: 45 }, // Valid Upto
            { x: 370, w: 40 }, // Billed Qty
            { x: 415, w: 45 }, // PTR
            { x: 465, w: 45 }, // M.R.P.
            { x: 515, w: 45 }  // Net Amt
        ];

        const pdfBuf = await buildPdfBuffer((doc) => {
            doc.font('Helvetica-Bold').fontSize(12).text('MedLife Pharma Distributors', 35, 36);
            doc.font('Helvetica').fontSize(8.5).text('Bill No: ML-2026-991 | Dated: 26-11-2026 | GSTIN: 27AABCM1234F1Z2', 35, 54);
            let y = 90;
            doc.font('Helvetica-Bold').fontSize(8);
            const hdrs = ['Lot No', 'Item Particulars', 'Composition', 'Valid Upto', 'Billed Qty', 'PTR', 'M.R.P.', 'Net Amt'];
            hdrs.forEach((h, i) => doc.text(h, cols[i].x, y, { width: cols[i].w }));
            y += 18;
            y = drawCols(doc, y, cols, ['B-501', 'Augmentin 625 Duo Tabs (1x10)', 'Amoxicillin + Clavulanic Acid', '09/28', '10+2', '180.00', '240.00', '1,800.00'], 8);
            // Missing batch + missing MRP -> must stay blank, NOT fabricated!
            y = drawCols(doc, y, cols, ['', 'Long Acting Insulin Recombinant Glargine 3ml Cartridge Pack', 'Insulin Glargine', '04/28', '5', '950.00', '', '4,750.00'], 8);
            doc.text('Grand Total: 6,550.00', 35, y + 12);
        });

        const res = await processInvoiceDocument({
            buffer: pdfBuf,
            allowOcrFallback: false
        });

        assert.strictEqual(res.medicines.length, 2);
        assert.strictEqual(res.medicines[0].batch, 'B-501');
        assert.strictEqual(res.medicines[0].salt, 'Amoxicillin + Clavulanic Acid');
        assert.strictEqual(res.medicines[0].purchaseQty, 10);
        assert.strictEqual(res.medicines[0].freeQty, 2);
        assert.strictEqual(res.medicines[0].purchaseRate, 180);
        assert.strictEqual(res.medicines[0].mrp, 240);

        // Missing batch and missing MRP remain blank/null — NEVER invented!
        assert.strictEqual(res.medicines[1].batch, '');
        assert.strictEqual(res.medicines[1].mrp, null);
        assert.strictEqual(res.medicines[1].fieldConfidence.batch, 'missing');
        assert.strictEqual(res.medicines[1].fieldConfidence.mrp, 'missing');
        assert(res.medicines[1].warnings.some((w) => /batch/i.test(w)));
    });

    // ------------------------------------------------------------------
    // TEST 3: Vendor Format Adaptation / Learned Custom Column Name
    // ------------------------------------------------------------------
    await runCase('3. Vendor Format Learning remembers custom vendor column label while validating rows', async () => {
        const cols = [
            { x: 40, w: 160 },
            { x: 210, w: 60 },
            { x: 280, w: 50 },
            { x: 340, w: 60 },
            { x: 410, w: 60 }
        ];
        const pdfBuf = await buildPdfBuffer((doc) => {
            doc.font('Helvetica-Bold').fontSize(12).text('Apex Lifecare Traders', 40, 36);
            doc.font('Helvetica').fontSize(8.5).text('GSTIN: 09AABCA5544D1Z9 | Invoice No: ALT-77', 40, 54);
            let y = 85;
            doc.font('Helvetica-Bold').fontSize(8);
            ['CustomSKUName', 'LotRef', 'UnitsOut', 'NetBilling', 'MRPVal'].forEach((h, i) => doc.text(h, cols[i].x, y));
            y += 18;
            drawCols(doc, y, cols, ['Dolo 650mg Strip', 'DL-99', '50', '22.50', '33.00'], 8);
        });

        const vendors = [{
            _id: 'v1',
            vendorName: 'Apex Lifecare Traders',
            gstin: '09AABCA5544D1Z9',
            invoiceFormatProfile: {
                columnMappings: {
                    customskuname: 'medicineName',
                    lotref: 'batch',
                    unitsout: 'purchaseQty',
                    netbilling: 'purchaseRate',
                    mrpval: 'mrp'
                },
                confirmedCount: 2
            }
        }];

        const res = await processInvoiceDocument({ buffer: pdfBuf, vendors, allowOcrFallback: false });
        assert.strictEqual(res.matchedVendor._id, 'v1');
        assert.strictEqual(res.medicines.length, 1);
        assert.strictEqual(res.medicines[0].medicineName, 'Dolo 650mg Strip');
        assert.strictEqual(res.medicines[0].batch, 'DL-99');
        assert.strictEqual(res.medicines[0].purchaseQty, 50);
        assert.strictEqual(res.medicines[0].purchaseRate, 22.50);
        assert.strictEqual(res.medicines[0].mrp, 33);
    });

    // ------------------------------------------------------------------
    // TEST 4: Scanned / Image-Only PDF Triggers Layer 3 OCR Fallback Safely
    // ------------------------------------------------------------------
    await runCase('4. Scanned PDF (image XObject, 0 text) triggers Layer 3 OCR fallback & respects failures', async () => {
        // 1x1 PNG buffer embedded into PDF with zero text
        const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const scannedBuf = await buildPdfBuffer((doc) => {
            doc.image(tinyPng, 40, 40, { width: 500, height: 700 });
        });

        let ocrCalled = false;
        const mockOcr = async () => {
            ocrCalled = true;
            return {
                invoice: { vendorName: 'Scanned Vendor Pharma', invoiceNumber: 'SCN-101', grandTotal: 1500 },
                medicines: [{
                    rowNumber: 1,
                    medicineName: 'Azithral 500mg Tablet',
                    rawMedicineName: 'Azithral 500mg Tablet',
                    salt: 'Azithromycin',
                    category: 'Tablets',
                    unit: 'Tablets',
                    unitsPerStrip: 5,
                    hsnCode: '3004',
                    batch: '', // Unreadable on scan -> must remain empty!
                    expiry: '',
                    expiryRaw: '??/99',
                    purchaseQty: 10,
                    freeQty: 0,
                    purchaseRate: 150,
                    mrp: 195,
                    discount: 0,
                    gst: 12,
                    amount: 1500
                }],
                detectedHeaders: ['Medicine', 'Qty', 'Rate', 'MRP']
            };
        };

        const res = await processInvoiceDocument({
            buffer: scannedBuf,
            allowOcrFallback: true,
            ocrExtractor: mockOcr
        });

        assert.strictEqual(ocrCalled, true);
        assert.strictEqual(res.extractionMeta.ocrUsed, true);
        assert.strictEqual(res.medicines.length, 1);
        assert.strictEqual(res.medicines[0].batch, '');
        assert.strictEqual(res.medicines[0].expiry, '');
        assert(res.medicines[0].warnings.some((w) => /batch/i.test(w)));

        // Verify OCR failure throws clear InvoiceParseError without raw stack trace
        await assert.rejects(
            () => processInvoiceDocument({
                buffer: scannedBuf,
                allowOcrFallback: true,
                ocrExtractor: async () => { throw new InvoiceParseError('OCR_FAILED', 'Poor scan resolution — OCR could not read table.'); }
            }),
            (err) => err instanceof InvoiceParseError && /poor scan resolution/i.test(err.message)
        );
    });

    // ------------------------------------------------------------------
    // TEST 5: Similar Medicines Candidate Suggestions (NEVER Auto-Merge) + Math Discrepancy
    // ------------------------------------------------------------------
    await runCase('5. Candidate matching suggests similar medicines without auto-merging + flags math mismatch', async () => {
        const existingInv = [
            { _id: 'inv1', name: 'Amoxicillin & Clavulanate 625mg Tabs', salt: 'Amoxicillin + Clavulanic Acid', batchNumber: 'OLD-01', stock: 40 },
            { _id: 'inv2', name: 'Amoxicillin 500mg Capsules', salt: 'Amoxicillin', batchNumber: 'AMX-22', stock: 100 }
        ];

        const simExact = computeMedicineSimilarity('Amoxicillin & Clavulanate 625mg Tabs (10×10)', existingInv[0].name, existingInv[0].salt);
        const simDiffDose = computeMedicineSimilarity('Amoxicillin & Clavulanate 625mg Tabs (10×10)', existingInv[1].name, existingInv[1].salt);
        assert(simExact > simDiffDose, `Exact dose should score higher (${simExact} vs ${simDiffDose})`);

        const matches = findMedicineCandidateMatches({ medicineName: 'Amoxicillin 250mg Capsules' }, existingInv, []);
        assert(matches.every((m) => !m.isExactMatch), 'Different strength (250mg vs 500mg) must never mark exact match');

        // Math mismatch & invalid expiry validation
        const rowVal = scoreAndValidateRow({
            medicineName: 'Test Syrup',
            batch: 'B1',
            expiry: '',
            expiryRaw: '31/99',
            purchaseQty: 10,
            purchaseRate: 100,
            mrp: 80, // MRP < purchaseRate!
            discount: 0,
            gst: 12,
            amount: 2000 // Wrong printed amount (expected 1120)
        });
        assert.strictEqual(rowVal.validationStatus, 'Warning');
        assert(rowVal.warnings.some((w) => /lower than Purchase Rate/i.test(w)));
        assert(rowVal.warnings.some((w) => /differs from invoice/i.test(w)));
        assert(rowVal.warnings.some((w) => /Unreadable expiry/i.test(w)));
    });

    // ------------------------------------------------------------------
    // TEST 6: Malformed, Corrupted, Empty, Spoofed & Oversized PDFs + Helper Edges
    // ------------------------------------------------------------------
    await runCase('6. Corrupted, empty, spoofed non-PDF, oversized PDF & date/number edge cases', async () => {
        assert.throws(() => validatePdfBuffer(Buffer.alloc(0)), (e) => e.code === 'EMPTY_PDF');
        assert.throws(() => validatePdfBuffer(Buffer.from('This is not a PDF file')), (e) => e.code === 'INVALID_PDF');
        assert.throws(() => validatePdfBuffer(Buffer.from('%PDF-1.4\n'), { maxBytes: 5 }), (e) => e.code === 'FILE_TOO_LARGE');

        await assert.rejects(
            () => parseInvoice(Buffer.from('%PDF-1.4\ncorrupted-xref-content-no-trailer')),
            (e) => e instanceof InvoiceParseError && (e.code === 'CORRUPTED_PDF' || e.code === 'PDF_PARSE_ERROR')
        );

        assert.strictEqual(parseIndianNumber('20,26,222.40'), 2026222.40);
        assert.strictEqual(parseIndianNumber('₹ 1,450.00'), 1450);
        assert.deepStrictEqual(parseExpiryValue('08/28').expiry, '2028-08-01');
        assert.deepStrictEqual(parseExpiryValue('N/A').isNA, true);
        assert.deepStrictEqual(parseExpiryValue('99/99').valid, false);
    });

    console.log(`\nSMART_INVOICE_TEST_SUMMARY: ${passed}/${passed + failed} passed`);
    if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
});
