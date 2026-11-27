const geminiProvider = require('./ai/providers/gemini.provider');
const aiWalletService = require('./ai/aiWallet.service');
const {
    parseInvoice,
    parseIndianNumber,
    parseExpiryValue,
    enrichMedicineMetadata,
    normalizeHeaderText,
    InvoiceParseError
} = require('../utils/invoiceParser');

/**
 * Normalize a medicine string for token comparison / matching without modifying user-facing display names.
 */
function normalizeMedicineForMatch(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|inj|injection|syp|syrup|susp|suspension|oint|ointment|gel|drop|drops|vial|amp|box|pack|strip|strips)\b/gi, ' ')
        .replace(/[^a-z0-9.+]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Token-level + character similarity score (0..1) for medicine candidate matching.
 */
function computeMedicineSimilarity(queryName, candidateName, candidateSalt = '') {
    const qNorm = normalizeMedicineForMatch(queryName);
    const cNorm = normalizeMedicineForMatch(candidateName);
    if (!qNorm || !cNorm) return 0;
    if (qNorm === cNorm) return 1.0;

    const qTokens = new Set(qNorm.split(' ').filter((t) => t.length >= 2));
    const cTokens = new Set(cNorm.split(' ').filter((t) => t.length >= 2));

    let overlap = 0;
    for (const t of qTokens) {
        if (cTokens.has(t)) overlap += 1;
    }

    const unionSize = new Set([...qTokens, ...cTokens]).size || 1;
    let score = (2 * overlap) / (qTokens.size + cTokens.size || 1);

    // Substring containment boost when brand + strength match
    if (cNorm.includes(qNorm) || qNorm.includes(cNorm)) {
        score = Math.max(score, Math.min(0.92, Math.min(qNorm.length, cNorm.length) / Math.max(qNorm.length, cNorm.length) + 0.25));
    }

    // Penalize dosage mismatch if both specify mg/mcg/ml/iu explicitly and differ
    const qDose = (qNorm.match(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|iu|g|gm)\b/g) || []).join(' ');
    const cDose = (cNorm.match(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|iu|g|gm)\b/g) || []).join(' ');
    if (qDose && cDose && qDose !== cDose) {
        score *= 0.65;
    }

    // Slight boost if candidate salt words appear inside query
    if (candidateSalt) {
        const sTokens = normalizeMedicineForMatch(candidateSalt).split(' ').filter((t) => t.length >= 4);
        const sHits = sTokens.filter((t) => qNorm.includes(t)).length;
        if (sHits > 0 && overlap > 0) {
            score = Math.min(0.95, score + 0.08);
        }
    }

    return Number(Math.min(1, Math.max(0, score)).toFixed(2));
}

/**
 * Find up to 3 closest existing Inventory / Medicine matches WITHOUT auto-merging.
 */
function findMedicineCandidateMatches(item, existingInventory = [], masterMedicines = []) {
    const matches = [];
    const seenIds = new Set();

    for (const inv of existingInventory) {
        const score = computeMedicineSimilarity(item.medicineName, inv.name, inv.salt);
        if (score >= 0.45) {
            seenIds.add(String(inv._id));
            matches.push({
                inventoryId: inv._id,
                source: 'inventory',
                name: inv.name,
                salt: inv.salt || '',
                category: inv.category || 'General',
                unit: inv.unit || 'Tablets',
                batchNumber: inv.batchNumber || '',
                stock: Number(inv.stock) || 0,
                matchScore: Math.round(score * 100),
                isExactMatch: score >= 0.96,
                matchReason: score >= 0.96 ? 'Exact normalized match in inventory' : 'Similar name / composition in inventory'
            });
        }
    }

    // Master Medicine catalog suggestions (for composition / salt auto-hinting)
    for (const m of masterMedicines) {
        const score = computeMedicineSimilarity(item.medicineName, m.name, m.genericName);
        if (score >= 0.65) {
            matches.push({
                inventoryId: null,
                masterMedicineId: m._id,
                source: 'master_catalog',
                name: m.name,
                salt: m.genericName || '',
                category: m.category || 'General',
                unit: 'Tablets',
                batchNumber: '',
                stock: 0,
                matchScore: Math.round(score * 100),
                isExactMatch: score >= 0.96,
                matchReason: 'Master medicine catalog match'
            });
        }
    }

    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches.slice(0, 3);
}

/**
 * Evaluate per-field confidence and mathematical consistency without silently mutating extracted invoice figures.
 */
function scoreAndValidateRow(item, extractionMethod = 'native_coordinates') {
    const isOcr = extractionMethod === 'ocr_gemini' || extractionMethod === 'heuristic_text';
    const highConf = isOcr ? 'medium' : 'high';
    const warnings = [];
    const fieldConfidence = {};

    // Medicine Name
    if (item.medicineName && item.medicineName.trim().length >= 3) {
        fieldConfidence.medicineName = highConf;
    } else if (item.medicineName && item.medicineName.trim().length > 0) {
        fieldConfidence.medicineName = 'low';
        warnings.push('Medicine name appears too short or incomplete');
    } else {
        fieldConfidence.medicineName = 'missing';
        warnings.push('Medicine name is required');
    }

    // Quantity
    const qty = Number(item.purchaseQty);
    if (Number.isFinite(qty) && qty > 0) {
        fieldConfidence.purchaseQty = highConf;
    } else if (Number.isFinite(qty) && qty === 0 && Number(item.freeQty) > 0) {
        fieldConfidence.purchaseQty = 'medium';
    } else {
        fieldConfidence.purchaseQty = 'missing';
        warnings.push('Valid purchase quantity (> 0) is required');
    }

    // Purchase Rate
    const rate = Number(item.purchaseRate);
    if (Number.isFinite(rate) && rate > 0) {
        fieldConfidence.purchaseRate = highConf;
    } else if (item.purchaseRate === 0) {
        fieldConfidence.purchaseRate = 'low';
        warnings.push('Purchase rate is 0 — please confirm');
    } else {
        fieldConfidence.purchaseRate = 'missing';
        warnings.push('Purchase rate is required');
    }

    // MRP
    const mrp = Number(item.mrp);
    if (Number.isFinite(mrp) && mrp > 0) {
        fieldConfidence.mrp = highConf;
        if (Number.isFinite(rate) && rate > 0 && mrp < rate) {
            fieldConfidence.mrp = 'low';
            warnings.push(`MRP (₹${mrp}) is lower than Purchase Rate (₹${rate})`);
        }
    } else {
        fieldConfidence.mrp = 'missing';
        warnings.push('MRP is missing — selling price should be reviewed');
    }

    // Batch Number
    if (item.batch && item.batch.trim().length >= 2) {
        fieldConfidence.batch = highConf;
    } else if (item.batch && item.batch.trim().length === 1) {
        fieldConfidence.batch = 'low';
        warnings.push('Batch number looks incomplete');
    } else {
        fieldConfidence.batch = 'missing';
        warnings.push('Batch number not detected');
    }

    // Expiry Date
    const isConsumableOrDevice = /consumable|surgical|thermometer|mask|glove|syringe/i.test(`${item.category} ${item.medicineName}`);
    if (item.expiry) {
        const d = new Date(item.expiry);
        if (!Number.isNaN(d.getTime())) {
            fieldConfidence.expiry = highConf;
            if (d < new Date()) {
                warnings.push('Expiry date appears to be in the past');
            }
        } else {
            fieldConfidence.expiry = 'low';
            warnings.push('Unreadable expiry date format — please enter YYYY-MM-DD');
        }
    } else if (item.expiryIsNA || isConsumableOrDevice) {
        fieldConfidence.expiry = 'medium';
        if (item.expiryRaw && !item.expiryIsNA) {
            warnings.push(`Expiry could not be parsed ("${item.expiryRaw}")`);
        }
    } else {
        fieldConfidence.expiry = 'missing';
        warnings.push(item.expiryRaw ? `Unreadable expiry ("${item.expiryRaw}")` : 'Expiry date missing');
    }

    // GST & Discount
    const gst = Number(item.gst);
    fieldConfidence.gst = Number.isFinite(gst) && [0, 5, 12, 18, 28].includes(gst)
        ? highConf
        : (Number.isFinite(gst) ? 'medium' : 'missing');

    const disc = Number(item.discount);
    fieldConfidence.discount = Number.isFinite(disc) && disc >= 0 && disc <= 100
        ? highConf
        : (item.discount !== null && item.discount !== undefined ? 'low' : 'missing');

    // Mathematical consistency check: Qty * Rate * (1 - Disc%) * (1 + GST%) vs Invoice Amount
    if (Number.isFinite(qty) && qty > 0 && Number.isFinite(rate) && rate > 0 && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0) {
        const dPct = Number.isFinite(disc) && disc >= 0 ? disc : 0;
        const gPct = Number.isFinite(gst) && gst >= 0 ? gst : 0;
        const gross = qty * rate;
        const taxable = gross * (1 - dPct / 100);
        const expected = taxable * (1 + gPct / 100);
        const extractedAmt = Number(item.amount);
        const tolerance = Math.max(2, extractedAmt * 0.015);
        if (Math.abs(expected - extractedAmt) > tolerance) {
            warnings.push(`Calculated net ₹${expected.toFixed(2)} differs from invoice ₹${extractedAmt.toFixed(2)}`);
        }
    }

    // Overall numeric confidence 0..100
    const scoreWeights = { high: 1, medium: 0.72, low: 0.35, missing: 0 };
    const trackedKeys = ['medicineName', 'purchaseQty', 'purchaseRate', 'mrp', 'batch', 'expiry'];
    const totalScore = trackedKeys.reduce((acc, k) => acc + (scoreWeights[fieldConfidence[k]] || 0), 0);
    const confidence = Math.round((totalScore / trackedKeys.length) * 100);

    const hasMissingRequired = !item.medicineName?.trim() || !(Number(item.purchaseQty) > 0) || !(Number(item.purchaseRate) > 0);
    const validationStatus = hasMissingRequired
        ? 'Incomplete'
        : (warnings.length > 0 ? 'Warning' : 'Valid');

    return {
        confidence,
        fieldConfidence,
        warnings,
        validationStatus
    };
}

/**
 * Layer 3: OCR Fallback using Medical365's approved & wallet-billed Gemini multimodal integration.
 * Triggered ONLY when native text extraction detects a scanned/image PDF or fails to find a table.
 */
async function extractViaGeminiOCR(buffer, { hospitalId = null, user = null, timeoutMs = 45000 } = {}) {
    const keys = geminiProvider._getApiKeys ? geminiProvider._getApiKeys() : [];
    if (!keys || keys.length === 0) {
        throw new InvoiceParseError('OCR_UNAVAILABLE', 'Scanned/image PDF detected, and no OCR AI key is configured. Please configure GEMINI_API_KEY or enter medicines manually.');
    }

    if (hospitalId) {
        const walletCheck = await aiWalletService.checkBalance(hospitalId);
        if (!walletCheck.allowed) {
            throw new InvoiceParseError('OCR_CREDITS_EXHAUSTED', walletCheck.message || 'AI OCR credits exhausted. Please enter medicines manually or recharge AI credits.');
        }
    }

    const prompt = `You are a pharmaceutical invoice OCR & structured extraction engine.
Read EVERY page of this vendor purchase invoice PDF carefully.
Extract the invoice header/totals and EVERY medicine/product line item strictly as visible.

CRITICAL ACCURACY RULES:
1. NEVER invent, guess, or fabricate medicine names, batch numbers, expiry dates, HSN codes, quantities, rates, MRP, or GST.
2. If any value is unreadable, smudged, cut off, or not printed on the invoice, set it to null or "".
3. Distinguish "Sale Rate" (vendor's billing rate to pharmacy = purchaseRate) from "MRP" (maximum retail price).
4. Return STRICT VALID JSON ONLY (no markdown fences) with this exact schema:
{
  "invoice": {
    "vendorName": "",
    "vendorGST": "",
    "vendorDL": "",
    "vendorAddress": "",
    "vendorPhone": "",
    "invoiceNumber": "",
    "invoiceDate": "YYYY-MM-DD or null",
    "orderRef": "",
    "taxableAmount": number or null,
    "cgst": number or null,
    "sgst": number or null,
    "igst": number or null,
    "grandTotal": number or null
  },
  "detectedHeaders": ["exact column header names visible"],
  "medicines": [
    {
      "rowNumber": 1,
      "medicineName": "",
      "salt": "",
      "manufacturer": "",
      "hsnCode": "",
      "batch": "",
      "expiryRaw": "",
      "mfgDateRaw": "",
      "purchaseQty": number or null,
      "freeQty": number or 0,
      "mrp": number or null,
      "purchaseRate": number or null,
      "discount": number or null,
      "gst": number or null,
      "amount": number or null,
      "ocrUncertaintyNote": ""
    }
  ]
}`;

    const base64Pdf = buffer.toString('base64');
    const ocrCall = geminiProvider.analyzeImage(prompt, base64Pdf, 'application/pdf');
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new InvoiceParseError('OCR_TIMEOUT', 'OCR extraction timed out. Please retry or add rows manually.')), timeoutMs);
    });

    try {
        const { text, usage } = await Promise.race([ocrCall, timeoutPromise]);
        clearTimeout(timer);

        if (hospitalId && usage) {
            await aiWalletService.deductUsage({
                hospitalId,
                userId: user?._id || user?.id || null,
                userRole: user?.role || 'pharmacist',
                userName: user?.name || 'Pharmacy Staff',
                operation: 'PHARMACY_INVOICE_OCR',
                model: usage.modelName,
                rawUsage: usage,
                metadata: { source: 'vendor_invoice_pdf' }
            }).catch(() => {});
        }

        const cleaned = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new InvoiceParseError('OCR_INVALID_RESPONSE', 'OCR could not structure a medicine table from this scanned document.');
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const rawMeds = Array.isArray(parsed.medicines) ? parsed.medicines : [];
        const medicines = rawMeds.map((m, idx) => {
            const rawName = String(m.medicineName || '').trim();
            const meta = enrichMedicineMetadata(rawName);
            const expParsed = parseExpiryValue(String(m.expiryRaw || ''));
            const mfgParsed = parseExpiryValue(String(m.mfgDateRaw || ''));
            const gst = parseIndianNumber(m.gst);

            return {
                rowNumber: Number(m.rowNumber) || (idx + 1),
                medicineName: meta.normalizedName,
                rawMedicineName: rawName,
                salt: String(m.salt || '').trim(),
                category: meta.category,
                manufacturer: String(m.manufacturer || '').trim(),
                packSize: meta.packSize,
                unit: meta.unit,
                unitsPerStrip: meta.unitsPerStrip,
                hsnCode: String(m.hsnCode || '').trim(),
                batch: String(m.batch || '').trim(),
                expiry: expParsed.expiry,
                expiryRaw: String(m.expiryRaw || '').trim(),
                expiryIsNA: expParsed.isNA,
                mfgDate: mfgParsed.expiry || '',
                purchaseQty: parseIndianNumber(m.purchaseQty),
                freeQty: parseIndianNumber(m.freeQty) || 0,
                purchaseRate: parseIndianNumber(m.purchaseRate),
                mrp: parseIndianNumber(m.mrp),
                discount: parseIndianNumber(m.discount),
                discountType: 'Percentage',
                gst,
                cgst: gst !== null ? Number((gst / 2).toFixed(2)) : null,
                sgst: gst !== null ? Number((gst / 2).toFixed(2)) : null,
                igst: null,
                amount: parseIndianNumber(m.amount)
            };
        }).filter((m) => m.medicineName.length >= 2);

        const inv = parsed.invoice || {};
        return {
            invoice: {
                vendorName: String(inv.vendorName || '').trim(),
                vendorGST: String(inv.vendorGST || '').trim(),
                vendorDL: String(inv.vendorDL || '').trim(),
                vendorAddress: String(inv.vendorAddress || '').trim(),
                vendorPhone: String(inv.vendorPhone || '').trim(),
                invoiceNumber: String(inv.invoiceNumber || '').trim(),
                invoiceDate: inv.invoiceDate && !Number.isNaN(new Date(inv.invoiceDate).getTime()) ? new Date(inv.invoiceDate).toISOString() : null,
                orderRef: String(inv.orderRef || '').trim(),
                taxableAmount: parseIndianNumber(inv.taxableAmount) || 0,
                cgst: parseIndianNumber(inv.cgst) || 0,
                sgst: parseIndianNumber(inv.sgst) || 0,
                igst: parseIndianNumber(inv.igst) || 0,
                grandTotal: parseIndianNumber(inv.grandTotal) || 0
            },
            medicines,
            detectedHeaders: Array.isArray(parsed.detectedHeaders) ? parsed.detectedHeaders : [],
            columnMappings: {}
        };
    } catch (err) {
        clearTimeout(timer);
        if (hospitalId) {
            await aiWalletService.recordFailure({
                hospitalId,
                userId: user?._id || user?.id || null,
                userRole: user?.role || 'pharmacist',
                userName: user?.name || 'Pharmacy Staff',
                operation: 'PHARMACY_INVOICE_OCR',
                error: err.message
            }).catch(() => {});
        }
        if (err instanceof InvoiceParseError) throw err;
        throw new InvoiceParseError('OCR_FAILED', `OCR fallback could not extract medicines: ${err.message}`);
    }
}

/**
 * Full 4-layer orchestration:
 *  Layer 1/2 (Native Coordinates + Table Structure + Vendor Learning)
 *  -> Layer 3 (OCR Fallback when scanned or table undetected)
 *  -> Layer 4 (Normalization, Existing Inventory Matching, Confidence & Math Consistency Validation)
 */
async function processInvoiceDocument({
    buffer,
    hospitalId = null,
    user = null,
    vendors = [],
    existingInventory = [],
    masterMedicines = [],
    allowOcrFallback = true,
    ocrExtractor = extractViaGeminiOCR
}) {
    // Pass 1: Detect metadata & vendor first so we can apply vendor-specific learned column mappings if available
    const initialParsed = await parseInvoice(buffer, {});

    // Find matching Vendor in this tenant by GSTIN first, then normalized vendor name
    let matchedVendor = null;
    const invGst = String(initialParsed.invoice?.vendorGST || '').toUpperCase().trim();
    const invVendorNorm = normalizeHeaderText(initialParsed.invoice?.vendorName || '');

    if (invGst) {
        matchedVendor = vendors.find((v) => String(v.gstin || '').toUpperCase().trim() === invGst) || null;
    }
    if (!matchedVendor && invVendorNorm) {
        matchedVendor = vendors.find((v) => {
            const vNorm = normalizeHeaderText(v.vendorName);
            return vNorm && (vNorm === invVendorNorm || invVendorNorm.includes(vNorm) || vNorm.includes(invVendorNorm));
        }) || null;
    }

    let finalParsed = initialParsed;
    const learnedMappings = matchedVendor?.invoiceFormatProfile?.columnMappings || null;

    // Re-run Layer 2 with vendor's learned mappings ONLY as hints (never assuming identical layout without re-validating!)
    if (learnedMappings && Object.keys(learnedMappings).length > 0 && !initialParsed.extractionMeta?.likelyScanned) {
        const reParsed = await parseInvoice(buffer, { vendorColumnMappings: learnedMappings });
        if ((reParsed.medicines?.length || 0) >= (initialParsed.medicines?.length || 0)) {
            finalParsed = reParsed;
        }
    }

    let ocrUsed = false;
    let ocrNotice = '';

    // Layer 3: Trigger OCR fallback when scanned/image PDF OR native extraction found 0 rows
    const shouldTryOcr = allowOcrFallback && (
        finalParsed.extractionMeta?.likelyScanned ||
        (finalParsed.medicines?.length || 0) === 0
    );

    if (shouldTryOcr) {
        try {
            const ocrResult = await ocrExtractor(buffer, { hospitalId, user });
            if (ocrResult && Array.isArray(ocrResult.medicines) && ocrResult.medicines.length > 0) {
                ocrUsed = true;
                finalParsed = {
                    invoice: {
                        ...finalParsed.invoice,
                        ...Object.fromEntries(Object.entries(ocrResult.invoice || {}).filter(([, v]) => v !== '' && v !== null && v !== 0)),
                        totalMedicines: ocrResult.medicines.length,
                        purchaseQty: ocrResult.medicines.reduce((s, m) => s + (Number(m.purchaseQty) || 0), 0),
                        freeQty: ocrResult.medicines.reduce((s, m) => s + (Number(m.freeQty) || 0), 0)
                    },
                    medicines: ocrResult.medicines,
                    extractionMeta: {
                        ...finalParsed.extractionMeta,
                        method: 'ocr_gemini',
                        ocrUsed: true,
                        detectedHeaders: ocrResult.detectedHeaders || [],
                        columnMappings: ocrResult.columnMappings || {},
                        lineSumAmount: Number(ocrResult.medicines.reduce((s, m) => s + (Number(m.amount) || 0), 0).toFixed(2))
                    }
                };
            }
        } catch (ocrErr) {
            ocrNotice = ocrErr.message || 'OCR fallback did not succeed.';
            if (finalParsed.extractionMeta?.likelyScanned) {
                throw new InvoiceParseError(
                    ocrErr.code || 'SCANNED_PDF_UNREADABLE',
                    ocrErr.message || 'Scanned PDF detected, but OCR could not extract readable medicine rows. You can retry with a clearer scan or add rows manually.'
                );
            }
        }
    }

    // Enrich rows with Layer 4 validation, confidence, originalExtracted snapshot & candidate matches
    const methodUsed = finalParsed.extractionMeta?.method || 'native_coordinates';
    const enrichedMedicines = (finalParsed.medicines || []).map((item, idx) => {
        const scoring = scoreAndValidateRow(item, methodUsed);
        const suggestedMatches = findMedicineCandidateMatches(item, existingInventory, masterMedicines);

        // Suggest link ONLY if exact high-confidence normalized match found — user still reviews/confirms!
        const exactMatch = suggestedMatches.find((m) => m.source === 'inventory' && m.isExactMatch) || null;
        const originalSnapshot = {
            medicineName: item.medicineName,
            rawMedicineName: item.rawMedicineName || item.medicineName,
            salt: item.salt || '',
            category: item.category || 'General',
            manufacturer: item.manufacturer || '',
            packSize: item.packSize || '',
            unit: item.unit || 'Tablets',
            unitsPerStrip: item.unitsPerStrip || 1,
            hsnCode: item.hsnCode || '',
            batch: item.batch || '',
            expiry: item.expiry || '',
            expiryRaw: item.expiryRaw || '',
            mfgDate: item.mfgDate || '',
            purchaseQty: item.purchaseQty,
            freeQty: item.freeQty || 0,
            purchaseRate: item.purchaseRate,
            mrp: item.mrp,
            discount: item.discount,
            discountType: item.discountType || 'Percentage',
            gst: item.gst,
            cgst: item.cgst,
            sgst: item.sgst,
            amount: item.amount
        };

        return {
            ...originalSnapshot,
            rowNumber: item.rowNumber || (idx + 1),
            pageNumber: item.pageNumber || 1,
            expiryIsNA: Boolean(item.expiryIsNA),
            confidence: scoring.confidence,
            fieldConfidence: scoring.fieldConfidence,
            warnings: scoring.warnings,
            validationStatus: scoring.validationStatus,
            suggestedMatches,
            matchedInventoryId: exactMatch ? exactMatch.inventoryId : null,
            importAction: exactMatch ? 'link_existing' : 'create_new',
            included: true,
            originalExtracted: originalSnapshot
        };
    });

    // Invoice-level math validation & warnings
    const invoiceWarnings = [];
    const grandTotal = Number(finalParsed.invoice?.grandTotal) || 0;
    const lineSumAmount = Number(enrichedMedicines.reduce((s, m) => s + (Number(m.amount) || 0), 0).toFixed(2));
    let mathMismatch = false;
    if (grandTotal > 0 && lineSumAmount > 0 && Math.abs(grandTotal - lineSumAmount) > Math.max(5, grandTotal * 0.015)) {
        mathMismatch = true;
        invoiceWarnings.push(`Sum of line amounts (₹${lineSumAmount.toLocaleString('en-IN')}) differs from printed Grand Total (₹${grandTotal.toLocaleString('en-IN')}). Values were preserved as extracted — please review.`);
    }
    if (ocrNotice) invoiceWarnings.push(ocrNotice);
    if (!finalParsed.invoice?.invoiceNumber) invoiceWarnings.push('Invoice Number could not be auto-detected — please verify.');
    if (!finalParsed.invoice?.vendorName) invoiceWarnings.push('Vendor Name could not be auto-detected — please select or enter vendor.');

    const overallConfidence = enrichedMedicines.length > 0
        ? Math.round(enrichedMedicines.reduce((s, m) => s + m.confidence, 0) / enrichedMedicines.length)
        : 0;

    return {
        invoice: {
            ...finalParsed.invoice,
            vendorId: matchedVendor?._id || null,
            matchedVendorName: matchedVendor?.vendorName || null,
            totalMedicines: enrichedMedicines.length
        },
        medicines: enrichedMedicines,
        matchedVendor: matchedVendor
            ? {
                _id: matchedVendor._id,
                vendorName: matchedVendor.vendorName,
                gstin: matchedVendor.gstin,
                dlNumber: matchedVendor.dlNumber,
                learnedMappingsCount: Object.keys(matchedVendor.invoiceFormatProfile?.columnMappings || {}).length
            }
            : null,
        extractionMeta: {
            ...finalParsed.extractionMeta,
            ocrUsed,
            ocrNotice,
            overallConfidence,
            lineSumAmount,
            mathMismatch,
            warnings: invoiceWarnings
        }
    };
}

module.exports = {
    normalizeMedicineForMatch,
    computeMedicineSimilarity,
    findMedicineCandidateMatches,
    scoreAndValidateRow,
    extractViaGeminiOCR,
    processInvoiceDocument
};
