const pdfParse = require('pdf-parse');

class InvoiceParseError extends Error {
    constructor(code, message, details = null) {
        super(message);
        this.name = 'InvoiceParseError';
        this.code = code || 'PDF_PARSE_ERROR';
        this.details = details;
    }
}

const DEFAULT_COLUMN_ALIASES = {
    srNo: ['sr no', 'sr.no', 'sr.', 's.no', 's. no', 'sl no', 'sl.no', 'sl', 'sr', '#'],
    medicineName: [
        'item description', 'product description', 'medicine description', 'goods description',
        'medicine name', 'product name', 'item name', 'item particulars', 'particulars',
        'drug name', 'name of medicine', 'product', 'medicine', 'description', 'item'
    ],
    salt: ['salt', 'composition', 'generic name', 'generic', 'formula', 'molecules', 'ingredients'],
    manufacturer: ['mfg by', 'mfr', 'mfg', 'manufacturer', 'company', 'make', 'brand'],
    category: ['category', 'dosage form', 'schedule', 'sch', 'form'],
    hsnCode: ['hsn/sac', 'hsn code', 'hsn', 'sac'],
    packSize: ['pack size', 'packing', 'pack', 'pkg', 'pck', 'strip size', 'unit'],
    batch: ['batch no.', 'batch no', 'batch #', 'b.no', 'b no', 'lot no', 'batch', 'lot'],
    mfgDate: ['mfg date', 'mfg. date', 'mfd date', 'mfd', 'mfg dt'],
    expiry: ['expiry date', 'exp date', 'exp. dt', 'exp dt', 'expiry', 'exp.', 'exp', 'valid upto'],
    purchaseQty: ['quantity ordered', 'billed qty', 'bill qty', 'purchase qty', 'quantity', 'qnty', 'qty', 'nos', 'pcs'],
    freeQty: ['free qty', 'free', 'scheme', 'bonus', 'fr'],
    mrp: ['maximum retail price', 'max retail price', 'm.r.p.', 'm.r.p', 'mrp'],
    purchaseRate: [
        'purchase rate', 'pur rate', 'p.rate', 'sale rate', 'net rate',
        'unit price', 'basic rate', 'ptr', 'pts', 'rate', 'cost', 'price'
    ],
    discount: ['discount %', 'discount', 'disc %', 'disc%', 'disc', 'dis%', 'dis', 'cd%'],
    cgst: ['cgst %', 'cgst%', 'cgst'],
    sgst: ['sgst %', 'sgst%', 'sgst'],
    igst: ['igst %', 'igst%', 'igst'],
    gst: ['gst %', 'gst%', 'gst', 'tax %', 'tax%', 'tax'],
    amount: [
        'net amount', 'net amt', 'taxable value', 'taxable amt', 'total amount',
        'amount', 'amt', 'total', 'value'
    ]
};

const HEADER_STOP_MARKERS = [
    'total bulk quantity',
    'grand total',
    'net payable',
    'amount in words',
    'terms and conditions',
    'terms & conditions',
    'bank details',
    'authorised signatory',
    'authorized signatory',
    'e-way bill',
    'transport & dispatch',
    'receiver\'s seal',
    'sub total',
    'subtotal',
    'gst summary',
    'round off'
];

const STANDALONE_LOWER_WORDS = new Set([
    'of', 'and', 'or', 'in', 'with', 'for', 'to', 'by', 'per', 'on', 'at', 'from', 'as', 'the',
    'box', 'pack', 'strip', 'strips', 'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules',
    'inj', 'injection', 'syp', 'syrup', 'gel', 'cream', 'ointment', 'drops', 'drop', 'vial', 'vials', 'amp',
    'powder', 'solution', 'suspension', 'infusion', 'bottle', 'pen', 'unit', 'units', 'nos', 'pcs', 'etc',
    'mg', 'ml', 'mcg', 'gm', 'g', 'kg', 'iu', 'wfi', 'sr', 'er', 'dt', 'md', 'iv', 'im',
    'coated', 'dispersible', 'sustained', 'extended', 'delayed', 'chewable', 'oral', 'sterile',
    'aqua', 'plain', 'forte', 'junior', 'adult', 'plus', 'extra', 'free', 'dry', 'softgel', 'eye', 'ear', 'nasal', 'skin'
]);

const NON_ROW_LINE_PREFIXES = [
    'taxable @', 'cgst =', 'sgst =', 'igst =', 'total taxable', 'total gst',
    'amount in words', 'terms and conditions', 'bank details', 'for ', 'authorised signatory',
    'transport & dispatch', 'receiver', 'page ', 'e. & o.e', 'e.&o.e'
];

function normalizeHeaderText(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[₹$€£():,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate raw uploaded PDF buffer (size, empty, PDF magic header, encryption heuristic).
 */
function validatePdfBuffer(buffer, { maxBytes = 10 * 1024 * 1024 } = {}) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new InvoiceParseError('EMPTY_PDF', 'The uploaded PDF file is empty (0 bytes). Please upload a valid vendor invoice PDF.');
    }
    if (buffer.length > maxBytes) {
        throw new InvoiceParseError('FILE_TOO_LARGE', `PDF size exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB limit.`);
    }

    const head = buffer.subarray(0, Math.min(1024, buffer.length)).toString('latin1');
    if (!head.includes('%PDF-')) {
        throw new InvoiceParseError('INVALID_PDF', 'Unsupported or spoofed file content. Please upload an authentic PDF document.');
    }
}

/**
 * Parse Indian or standard decimal number strings (e.g., "1,71,494.40", "20,26,222.40").
 */
function parseIndianNumber(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const cleaned = String(raw)
        .replace(/[₹Rs.\s]/gi, (m) => (m === '.' ? '.' : ''))
        .replace(/,/g, '')
        .trim();
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const num = Number(match[0]);
    return Number.isFinite(num) ? num : null;
}

/**
 * Smartly join wrapped text fragments inside a column cell.
 */
function joinWrappedTokens(fragments, colRightX = null) {
    const cleanFrags = fragments
        .map((f) => (typeof f === 'string' ? { text: f.trim(), x: 0, right: 0 } : f))
        .filter((f) => f && f.text);

    if (cleanFrags.length === 0) return '';
    if (cleanFrags.length === 1) return cleanFrags[0].text.replace(/\s+/g, ' ').trim();

    let combined = cleanFrags[0].text;
    for (let i = 1; i < cleanFrags.length; i += 1) {
        const prev = cleanFrags[i - 1];
        const curr = cleanFrags[i];
        const prevTrim = combined.trimEnd();
        const currTrim = curr.text.trimStart();
        if (!currTrim) continue;

        // Fix split numeric decimals across wrapped lines, e.g., "1,07,730.0" + "0" -> "1,07,730.00"
        if (/\d\.$/.test(prevTrim) || (/\.\d$/.test(prevTrim) && /^\d+$/.test(currTrim))) {
            combined = `${prevTrim}${currTrim}`;
            continue;
        }
        if (/,$/.test(prevTrim) && /^\d/.test(currTrim) && !/\s/.test(currTrim)) {
            combined = `${prevTrim}${currTrim}`;
            continue;
        }

        // Preserve hyphenated compounds split across line wraps cleanly
        if (/-$/.test(prevTrim) && !/\s-$/.test(prevTrim)) {
            combined = `${prevTrim}${currTrim}`;
            continue;
        }

        // Detect mid-word hard break inside narrow column (prev ends with >=3 letters, next starts with lowercase word fragment)
        const firstCurrWord = (currTrim.match(/^([a-z]+)/) || [])[1] || '';
        const prevEndsAlpha = /[A-Za-z]{3,}$/.test(prevTrim);
        const nearColEdge = !colRightX || !prev.right || prev.right >= colRightX - 24;
        if (
            prevEndsAlpha &&
            /^[a-z]/.test(currTrim) &&
            firstCurrWord &&
            !STANDALONE_LOWER_WORDS.has(firstCurrWord) &&
            (nearColEdge || firstCurrWord.length <= 6)
        ) {
            combined = `${prevTrim}${currTrim}`;
            continue;
        }

        combined = `${prevTrim} ${currTrim}`;
    }

    return combined.replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a raw header string into a canonical Medical365 target field key.
 * Checks vendor-learned column mappings first, then standard aliases.
 */
function resolveHeaderFieldKey(rawHeaderText, vendorColumnMappings = {}) {
    const norm = normalizeHeaderText(rawHeaderText);
    if (!norm || norm.length < 1) return null;

    if (vendorColumnMappings && typeof vendorColumnMappings === 'object') {
        const directLearned = vendorColumnMappings[norm];
        if (directLearned) return directLearned;
    }

    // Specific multi-word check first to avoid generic substrings overriding specific columns
    for (const [fieldKey, variants] of Object.entries(DEFAULT_COLUMN_ALIASES)) {
        for (const variant of variants) {
            if (norm === variant) return fieldKey;
        }
    }

    // Boundary / token inclusion match (ordered by longest variant first per pass)
    const allPairs = [];
    for (const [fieldKey, variants] of Object.entries(DEFAULT_COLUMN_ALIASES)) {
        for (const variant of variants) {
            allPairs.push({ fieldKey, variant });
        }
    }
    allPairs.sort((a, b) => b.variant.length - a.variant.length);

    for (const { fieldKey, variant } of allPairs) {
        const rx = new RegExp(`(?:^|\\s|\\b)${escapeRegex(variant)}(?:$|\\s|\\b)`, 'i');
        if (rx.test(norm)) {
            return fieldKey;
        }
    }

    // Composite header like "Item Description (Tablets, Inj, etc.)" or "GST %"
    if (norm.includes('descriptio') || norm.includes('particular') || norm.includes('medicine') || norm.includes('product')) {
        return 'medicineName';
    }
    if (norm.includes('batch') || norm.includes('lot')) return 'batch';
    if (norm.includes('exp')) return 'expiry';
    if (norm.includes('qty') || norm.includes('quantity')) return 'purchaseQty';
    if (norm.includes('mrp')) return 'mrp';
    if (norm.includes('rate') || norm.includes('ptr') || norm.includes('pts') || norm.includes('price')) return 'purchaseRate';
    if (norm.includes('disc')) return 'discount';
    if (norm.includes('cgst')) return 'cgst';
    if (norm.includes('sgst')) return 'sgst';
    if (norm.includes('igst')) return 'igst';
    if (norm.includes('gst') || norm.includes('tax')) return 'gst';
    if (norm.includes('hsn')) return 'hsnCode';
    if (norm.includes('amount') || norm.includes('amt') || norm.includes('total')) return 'amount';
    if (norm === 'sr' || norm.startsWith('sr ') || norm === 'sl' || norm === 's no') return 'srNo';

    return null;
}

/**
 * Layer 1: Extract per-page positioned text items and embedded image stats via PDF.js inside pdf-parse.
 * Always wraps Node Buffer into a fresh Uint8Array copy to avoid Node 24 "bad XRef entry" bug.
 */
async function extractPdfPagesWithCoordinates(buffer, { timeoutMs = 25000 } = {}) {
    validatePdfBuffer(buffer);

    const uint8 = Uint8Array.from(buffer);
    const pages = [];

    const parsePromise = pdfParse(uint8, {
        pagerender: async (pageData) => {
            const vp = pageData.getViewport(1.0);
            const tc = await pageData.getTextContent({
                normalizeWhitespace: true,
                disableCombineTextItems: false
            });

            let imageOpCount = 0;
            try {
                const ops = await pageData.getOperatorList();
                if (ops && Array.isArray(ops.fnArray)) {
                    // PDF.js OPS image operator codes typically 82..88 (paintImageXObject / paintInlineImageXObject / paintJpegXObject)
                    imageOpCount = ops.fnArray.filter((fn) => fn >= 82 && fn <= 88).length;
                }
            } catch (_) {
                imageOpCount = 0;
            }

            const tokens = [];
            for (const item of (tc.items || [])) {
                const rawStr = String(item.str || '').replace(/\uFFFD/g, '-');
                if (!rawStr || !rawStr.trim()) continue;
                const x = Number(item.transform?.[4]) || 0;
                const y = (vp.height || 842) - (Number(item.transform?.[5]) || 0);
                const h = Math.max(6, Math.abs(Number(item.height) || Number(item.transform?.[0]) || 9));
                const w = Math.max(2, Number(item.width) || (rawStr.length * h * 0.48));
                tokens.push({
                    str: rawStr.trim(),
                    x,
                    y,
                    w,
                    h,
                    right: x + w
                });
            }

            // Cluster tokens into horizontal lines by Y coordinate
            const sorted = [...tokens].sort((a, b) => (a.y - b.y) || (a.x - b.x));
            const visualLines = [];
            for (const tok of sorted) {
                const lastLine = visualLines[visualLines.length - 1];
                const tol = lastLine ? Math.max(3.5, Math.min(7, lastLine.avgH * 0.55)) : 4.5;
                if (lastLine && Math.abs(tok.y - lastLine.y) <= tol) {
                    lastLine.tokens.push(tok);
                    lastLine.tokens.sort((a, b) => a.x - b.x);
                    lastLine.y = lastLine.tokens.reduce((s, t) => s + t.y, 0) / lastLine.tokens.length;
                } else {
                    visualLines.push({
                        y: tok.y,
                        avgH: tok.h,
                        tokens: [tok]
                    });
                }
            }

            const formattedLines = visualLines.map((ln) => {
                let lineText = '';
                for (let idx = 0; idx < ln.tokens.length; idx += 1) {
                    const t = ln.tokens[idx];
                    if (idx > 0) {
                        const prev = ln.tokens[idx - 1];
                        const gap = t.x - prev.right;
                        lineText += gap > 14 ? '   ' : (gap > 1.2 ? ' ' : '');
                    }
                    lineText += t.str;
                }
                return {
                    y: ln.y,
                    tokens: ln.tokens,
                    text: lineText.trim()
                };
            }).filter((ln) => ln.text.length > 0);

            pages.push({
                pageNumber: pageData.pageNumber || (pages.length + 1),
                width: vp.width || 595,
                height: vp.height || 842,
                tokens,
                visualLines: formattedLines,
                imageOpCount,
                textLength: formattedLines.reduce((acc, l) => acc + l.text.length, 0)
            });

            return formattedLines.map((l) => l.text).join('\n');
        }
    });

    let timerHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timerHandle = setTimeout(() => {
            reject(new InvoiceParseError('EXTRACTION_TIMEOUT', 'PDF processing timed out. Try uploading a smaller or split PDF.'));
        }, timeoutMs);
    });

    try {
        const rawResult = await Promise.race([parsePromise, timeoutPromise]);
        clearTimeout(timerHandle);
        pages.sort((a, b) => a.pageNumber - b.pageNumber);
        const fullText = pages.map((p) => p.visualLines.map((l) => l.text).join('\n')).join('\n\n') || rawResult.text || '';
        const nonWhitespaceChars = fullText.replace(/\s+/g, '').length;
        const totalImages = pages.reduce((acc, p) => acc + (p.imageOpCount || 0), 0);

        return {
            numPages: rawResult.numpages || pages.length || 1,
            pages,
            fullText,
            nonWhitespaceChars,
            totalImages,
            likelyScanned: nonWhitespaceChars < Math.max(60, (pages.length || 1) * 35) || (nonWhitespaceChars < 120 && totalImages > 0)
        };
    } catch (err) {
        clearTimeout(timerHandle);
        if (err instanceof InvoiceParseError) throw err;
        const msg = String(err?.message || err || '');
        const name = String(err?.name || '');
        if (name === 'PasswordException' || /password/i.test(msg)) {
            throw new InvoiceParseError('PASSWORD_PROTECTED', 'This PDF is password-protected. Please upload an unlocked copy of the invoice.');
        }
        if (name === 'InvalidPDFException' || /invalid pdf|xref|corrupt|startxref|missing pdf/i.test(msg)) {
            throw new InvoiceParseError('CORRUPTED_PDF', 'This PDF appears corrupted or unreadable. Please verify or re-export the PDF and retry.');
        }
        throw new InvoiceParseError('PDF_PARSE_ERROR', `Unable to read this PDF file: ${msg || 'Unknown PDF format error'}`);
    }
}

/**
 * Layer 2: Detect table header band across 1 to 3 adjacent visual lines and build X-column boundaries.
 */
function detectTableHeaderInPage(page, vendorColumnMappings = {}) {
    const lines = page.visualLines || [];
    let bestMatch = null;

    for (let i = 0; i < lines.length; i += 1) {
        const baseLine = lines[i];
        const lowerBase = baseLine.text.toLowerCase();

        if (HEADER_STOP_MARKERS.some((sw) => lowerBase.includes(sw))) continue;
        if (/\b(?:gstin|dl\s*no|billed\s*to|shipped\s*to|dated:|bill\s*no:|invoice\s*number:|invoice\s*no:|mobile:|email:)\b/i.test(lowerBase)) continue;

        // Consider consecutive header lines stepped within <= 16pt vertically (total span <= 40pt)
        // so metadata lines separated by blank whitespace never merge into table column headers.
        const bandLines = [baseLine];
        for (let k = i + 1; k < Math.min(lines.length, i + 6); k += 1) {
            const cand = lines[k];
            const prevInBand = bandLines[bandLines.length - 1];
            if (cand.y - prevInBand.y > 16) break;
            if (cand.y - baseLine.y > 40) break;
            const candLower = cand.text.toLowerCase();
            // Stop extending header band if the next line looks like real medicine/numeric data row (has Batch, Expiry or Price decimal)
            if (/\b(?:0?[1-9]|1[0-2])[\/\-](?:20\d{2}|\d{2})\b/.test(cand.text)) break;
            if (/\b\d[\d,]*\.\d{2}\b/.test(cand.text)) break;
            if (/^\d{1,3}\s+[A-Za-z0-9]/.test(cand.text) && /\d/.test(cand.text)) break;
            if (HEADER_STOP_MARKERS.some((sw) => candLower.includes(sw))) break;
            bandLines.push(cand);
        }

        // Try 1-line, 2-line, ... span combinations and pick the richest valid header
        for (let span = 1; span <= bandLines.length; span += 1) {
            const activeLines = bandLines.slice(0, span);
            const allTokens = activeLines.flatMap((l) => l.tokens);

            // Group horizontally adjacent tokens per visual line into header cell chunks
            const rowCells = [];
            for (const ln of activeLines) {
                const sortedToks = [...ln.tokens].sort((a, b) => a.x - b.x);
                let curCell = null;
                for (const tok of sortedToks) {
                    // Tight horizontal threshold preserves multi-word headers ("Billed Qty", "Valid Upto")
                    // without accidentally fusing adjacent column headers ("Billed Qty" | "PTR")
                    const maxIntraCellGap = Math.max(3.5, Math.min(5.2, (tok.h || 8) * 0.58));
                    if (curCell && (tok.x - curCell.right) <= maxIntraCellGap) {
                        curCell.text += ` ${tok.str}`;
                        curCell.right = Math.max(curCell.right, tok.right);
                        curCell.x = Math.min(curCell.x, tok.x);
                    } else {
                        if (curCell) rowCells.push({ ...curCell, lineY: ln.y });
                        curCell = { text: tok.str, x: tok.x, right: tok.right, center: tok.x + tok.w / 2 };
                    }
                }
                if (curCell) rowCells.push({ ...curCell, lineY: ln.y });
            }

            // Stack vertically aligned cells (same X column across multi-line header) into composite column cells
            const columns = [];
            const sortedCells = [...rowCells].sort((a, b) => (a.x - b.x) || (a.lineY - b.lineY));
            for (const cell of sortedCells) {
                cell.center = (cell.x + cell.right) / 2;
                const matchCol = columns.find((col) => {
                    if (Math.abs(col.lastLineY - cell.lineY) < 2) return false;
                    const overlap = Math.min(col.right, cell.right) - Math.max(col.x, cell.x);
                    const centerDist = Math.abs(col.center - cell.center);
                    return overlap > -2 || centerDist <= 12;
                });
                if (matchCol) {
                    matchCol.parts.push(cell.text);
                    matchCol.text = matchCol.parts.join(' ').replace(/\s+/g, ' ').trim();
                    matchCol.x = Math.min(matchCol.x, cell.x);
                    matchCol.right = Math.max(matchCol.right, cell.right);
                    matchCol.center = (matchCol.x + matchCol.right) / 2;
                    matchCol.lastLineY = cell.lineY;
                } else {
                    columns.push({
                        parts: [cell.text],
                        text: cell.text,
                        x: cell.x,
                        right: cell.right,
                        center: cell.center,
                        lastLineY: cell.lineY
                    });
                }
            }

            columns.sort((a, b) => a.x - b.x);

            const mappedCols = [];
            const usedKeys = new Set();
            let distinctKnown = 0;

            for (const col of columns) {
                const key = resolveHeaderFieldKey(col.text, vendorColumnMappings);
                if (key && !usedKeys.has(key)) {
                    usedKeys.add(key);
                    distinctKnown += 1;
                }
                mappedCols.push({
                    rawHeader: col.text,
                    normHeader: normalizeHeaderText(col.text),
                    key: key || null,
                    x: col.x,
                    right: col.right,
                    center: col.center
                });
            }

            // Valid medicine table header requires >= 3 recognized columns AND a primary item or pricing/qty column
            const hasCoreCol = usedKeys.has('medicineName') || usedKeys.has('batch') || usedKeys.has('purchaseQty');
            if (distinctKnown >= 3 && hasCoreCol) {
                // Compute monotonic left/right X-bounds per column using adjacent gap midpoints (or center midpoints if overlapping)
                const withBounds = mappedCols.map((col, idx) => {
                    const prev = mappedCols[idx - 1];
                    const next = mappedCols[idx + 1];
                    const leftBound = idx === 0
                        ? 0
                        : (prev.right <= col.x ? (prev.right + col.x) / 2 : (prev.center + col.center) / 2);
                    const rightBound = !next
                        ? (page.width || 650)
                        : (col.right <= next.x ? (col.right + next.x) / 2 : (col.center + next.center) / 2);
                    return {
                        ...col,
                        leftBound,
                        rightBound
                    };
                });

                const score = distinctKnown * 10 + (usedKeys.has('medicineName') ? 8 : 0) + (usedKeys.has('batch') ? 4 : 0) + span * 0.25;
                const bottomY = Math.max(...allTokens.map((t) => t.y)) + 2;

                if (!bestMatch || score > bestMatch.score) {
                    bestMatch = {
                        score,
                        headerLineIdx: i,
                        headerEndLineIdx: i + span - 1,
                        headerBottomY: bottomY,
                        columns: withBounds
                    };
                }
            }
        }
    }

    return bestMatch;
}

/**
 * Determine if a visual line looks like a table footer or grand summary line that ends medicine rows.
 */
function isFooterOrSummaryLine(lineText, colBuckets = {}) {
    const lower = String(lineText || '').toLowerCase().trim();
    if (!lower) return false;
    if (NON_ROW_LINE_PREFIXES.some((p) => lower.startsWith(p))) return true;
    if (/^(?:grand\s*total|sub\s*total|subtotal|net\s*payable|total\s*(?:bulk|gst|taxable|amount|qty)|amount\s*in\s*words|round\s*off)\b/i.test(lower)) {
        return true;
    }
    if (HEADER_STOP_MARKERS.some((sw) => lower.includes(sw))) {
        // Real item rows generally carry an expiry token or numeric rate+qty together
        if (!colBuckets.expiry && !colBuckets.purchaseQty) return true;
    }
    return false;
}

function isPageFooterNoise(lineText, lineY, pageHeight) {
    const lower = String(lineText || '').toLowerCase().trim();
    if (/^page\s+\d+\s*(?:of\s+\d+)?$/i.test(lower)) return true;
    if (lineY > pageHeight - 48 && /page\s+\d+\s*(?:of\s+\d+)?/i.test(lower)) return true;
    if (lineY > pageHeight - 48 && /tax invoice|wholesale|continued on/i.test(lower) && !/\d+\.\d{2}/.test(lower)) return true;
    return false;
}

/**
 * Normalize an expiry token like "08/28", "08-2028", "Aug-28", "N/A" -> { expiryISO, expiryRaw, status }.
 */
function parseExpiryValue(raw) {
    if (!raw || typeof raw !== 'string') return { expiry: '', expiryRaw: '', isNA: false, valid: false };
    const clean = raw.trim();
    if (/^(n\/a|na|nil|-|--|none)$/i.test(clean)) {
        return { expiry: '', expiryRaw: clean, isNA: true, valid: true };
    }

    const mmYy = clean.match(/\b(0?[1-9]|1[0-2])\s*[\/\-]\s*(20\d{2}|\d{2})\b/);
    if (mmYy) {
        const month = parseInt(mmYy[1], 10);
        let year = parseInt(mmYy[2], 10);
        if (year < 100) year += 2000;
        if (year >= 2000 && year <= 2099 && month >= 1 && month <= 12) {
            return {
                expiry: `${year}-${String(month).padStart(2, '0')}-01`,
                expiryRaw: mmYy[0],
                isNA: false,
                valid: true
            };
        }
    }

    const ddMmYy = clean.match(/\b(\d{1,2})[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})\b/);
    if (ddMmYy) {
        const day = Math.min(28, Math.max(1, parseInt(ddMmYy[1], 10)));
        const month = parseInt(ddMmYy[2], 10);
        let year = parseInt(ddMmYy[3], 10);
        if (year < 100) year += 2000;
        return {
            expiry: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            expiryRaw: ddMmYy[0],
            isNA: false,
            valid: true
        };
    }

    const monthNames = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const monYr = clean.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s\-\/]*(20\d{2}|\d{2})\b/i);
    if (monYr) {
        const key = monYr[1].toLowerCase().slice(0, 3);
        const month = monthNames[key];
        let year = parseInt(monYr[2], 10);
        if (year < 100) year += 2000;
        if (month) {
            return {
                expiry: `${year}-${String(month).padStart(2, '0')}-01`,
                expiryRaw: monYr[0],
                isNA: false,
                valid: true
            };
        }
    }

    return { expiry: '', expiryRaw: clean, isNA: false, valid: false };
}

/**
 * Parse medicine description to infer unit, pack size, unitsPerStrip, and category without fabricating missing values.
 */
function enrichMedicineMetadata(rawName) {
    const clean = String(rawName || '').replace(/\s+/g, ' ').trim();
    const lower = clean.toLowerCase();

    let unit = 'Tablets';
    let category = '';
    if (/\b(tab|tabs|tablet|tablets)\b/i.test(lower)) {
        unit = 'Tablets';
        category = 'Tablets';
    } else if (/\b(cap|caps|capsule|capsules|softgel)\b/i.test(lower)) {
        unit = 'Capsules';
        category = 'Capsules';
    } else if (/\b(inj|injection|vial|amp|ampoule|cartridge)\b/i.test(lower)) {
        unit = 'Injection';
        category = 'Injection';
    } else if (/\b(syrup|syp|gel|suspension|drops|inhaler|fluid|iv fluid|ns|bottle)\b/i.test(lower)) {
        unit = 'Syrup';
        category = /\bdrop/i.test(lower) ? 'Drops' : /\binhaler/i.test(lower) ? 'Inhaler' : /\biv fluid|ns\b/i.test(lower) ? 'IV Fluids' : 'Syrup';
    } else if (/\b(ointment|cream|lotion)\b/i.test(lower)) {
        unit = 'Ointment';
        category = 'Ointment / Topical';
    } else if (/\b(powder|ors|sachet)\b/i.test(lower)) {
        unit = /\bsachet\b/i.test(lower) ? 'Sachets' : 'Powder';
        category = 'Powder / ORS';
    } else if (/\b(mask|masks|glove|gloves|thermometer|syringe|bandage|device)\b/i.test(lower)) {
        unit = 'Number';
        category = 'Surgical / Consumables';
    } else if (/\b(strip|strips)\b/i.test(lower)) {
        unit = 'Strip';
        category = 'General';
    }

    let packSize = '';
    let unitsPerStrip = 1;
    const multMatch = clean.match(/\((\d+)\s*[×x*]\s*(\d+)(?:\s*(?:box|pack|tab|tabs|cap|ml))?\)/i)
        || clean.match(/\b(\d+)\s*[×x*]\s*(\d+)\b/i);
    if (multMatch) {
        packSize = `${multMatch[1]}×${multMatch[2]}`;
        const n1 = parseInt(multMatch[1], 10);
        const n2 = parseInt(multMatch[2], 10);
        if (['Tablets', 'Capsules', 'Strip'].includes(unit) && n2 > 1 && n2 <= 100) {
            unitsPerStrip = n2;
        } else if (['Tablets', 'Capsules', 'Strip'].includes(unit) && n1 > 1 && n1 <= 30 && n2 === 1) {
            unitsPerStrip = n1;
        }
    } else {
        const boxOfMatch = clean.match(/\((?:box|pack)\s*of\s*(\d+)(?:\s*[a-z]+)?\)/i);
        if (boxOfMatch) {
            packSize = `Box of ${boxOfMatch[1]}`;
            const n = parseInt(boxOfMatch[1], 10);
            if (['Tablets', 'Capsules', 'Strip'].includes(unit) && n > 1 && n <= 200) {
                unitsPerStrip = n;
            }
        } else {
            const volMatch = clean.match(/\b(\d+(?:\.\d+)?\s*(?:ml|g|gm|mg|mcg|iu))\b/i);
            if (volMatch) packSize = volMatch[1];
        }
    }

    return {
        normalizedName: clean,
        unit,
        category: category || 'General',
        packSize,
        unitsPerStrip
    };
}

/**
 * Extract structured rows from pages using Layer 2 Coordinate Column Assignment.
 */
function extractTableRowsByCoordinates(pages, vendorColumnMappings = {}) {
    let activeColumns = null;
    const rawItems = [];
    const headerNamesSet = new Set();
    const columnMappingUsed = {};

    for (let pIdx = 0; pIdx < pages.length; pIdx += 1) {
        const page = pages[pIdx];
        const detected = detectTableHeaderInPage(page, vendorColumnMappings);

        let startLineIdx = 0;
        if (detected) {
            activeColumns = detected.columns;
            startLineIdx = detected.headerEndLineIdx + 1;
            activeColumns.forEach((col) => {
                if (col.rawHeader) headerNamesSet.add(col.rawHeader);
                if (col.key && col.normHeader) columnMappingUsed[col.normHeader] = col.key;
            });
        } else if (!activeColumns) {
            // No header found yet on Page 1; continue scanning
            continue;
        }

        const medNameCol = activeColumns.find((c) => c.key === 'medicineName');
        const srCol = activeColumns.find((c) => c.key === 'srNo');
        const batchCol = activeColumns.find((c) => c.key === 'batch');
        const qtyCol = activeColumns.find((c) => c.key === 'purchaseQty');
        const mrpCol = activeColumns.find((c) => c.key === 'mrp');
        const rateCol = activeColumns.find((c) => c.key === 'purchaseRate');
        const amtCol = activeColumns.find((c) => c.key === 'amount');

        // Collect classified table lines from startLineIdx until footer/summary
        const pageEntries = [];
        let tableEnded = false;
        for (let lIdx = startLineIdx; lIdx < page.visualLines.length; lIdx += 1) {
            const ln = page.visualLines[lIdx];
            if (isPageFooterNoise(ln.text, ln.y, page.height)) continue;

            // Bucket every token on this visual line into its column by X center
            const lineBuckets = {};
            for (const tok of ln.tokens) {
                const tokCenter = (tok.x + tok.right) / 2;
                let assignedCol = activeColumns.find((c) => tokCenter >= c.leftBound && tokCenter < c.rightBound);
                if (!assignedCol) {
                    let bestDist = Infinity;
                    for (const col of activeColumns) {
                        const d = Math.abs(tokCenter - col.center);
                        if (d < bestDist) {
                            bestDist = d;
                            assignedCol = col;
                        }
                    }
                }
                if (assignedCol && assignedCol.key) {
                    if (!lineBuckets[assignedCol.key]) lineBuckets[assignedCol.key] = [];
                    lineBuckets[assignedCol.key].push({ text: tok.str, x: tok.x, right: tok.right });
                }
            }

            if (isFooterOrSummaryLine(ln.text, lineBuckets)) {
                tableEnded = true;
                break;
            }

            const srText = joinWrappedTokens(lineBuckets.srNo || []);
            const hasSrNum = srCol && /^\d{1,4}\.?$/.test(srText);
            const hasBatch = batchCol && Boolean(lineBuckets.batch?.length);
            const hasQty = qtyCol && Boolean(lineBuckets.purchaseQty?.length);
            const hasPrice = (mrpCol && Boolean(lineBuckets.mrp?.length)) || (rateCol && Boolean(lineBuckets.purchaseRate?.length));
            const anchorCount = [hasBatch, hasQty, hasPrice, Boolean(lineBuckets.expiry?.length)].filter(Boolean).length;

            pageEntries.push({
                y: ln.y,
                lineBuckets,
                isAnchor: Boolean(hasSrNum || anchorCount >= 2)
            });
        }

        // Partition wrapped continuation lines cleanly between row anchors using largest vertical cell gap
        const anchorIndices = [];
        pageEntries.forEach((entry, idx) => {
            if (entry.isAnchor) anchorIndices.push(idx);
        });

        if (anchorIndices.length > 0) {
            const rowSlices = anchorIndices.map(() => []);

            // Leading wrapped description lines before first anchor -> belong to first anchor (ignoring header leftovers)
            for (let i = 0; i < anchorIndices[0]; i += 1) {
                const descPreview = joinWrappedTokens(pageEntries[i].lineBuckets.medicineName || []).trim();
                if (!descPreview || /^(?:inj,?\s*etc\.?\)|n\s*\(tablets.*)$/i.test(descPreview)) continue;
                rowSlices[0].push(pageEntries[i]);
            }

            for (let a = 0; a < anchorIndices.length; a += 1) {
                const startA = anchorIndices[a];
                rowSlices[a].push(pageEntries[startA]);

                if (a + 1 < anchorIndices.length) {
                    const nextA = anchorIndices[a + 1];
                    if (nextA - startA > 1) {
                        // Find largest Y-gap in the interval [startA .. nextA] to separate row `a` tail from row `a+1` head
                        let splitAfter = startA;
                        let bestGap = -1;
                        let bestMidTie = Infinity;
                        const midY = (pageEntries[startA].y + pageEntries[nextA].y) / 2;

                        for (let g = startA; g < nextA; g += 1) {
                            const gap = pageEntries[g + 1].y - pageEntries[g].y;
                            const gapMid = (pageEntries[g].y + pageEntries[g + 1].y) / 2;
                            const midDist = Math.abs(gapMid - midY);
                            if (gap > bestGap + 1.5 || (Math.abs(gap - bestGap) <= 1.5 && midDist < bestMidTie)) {
                                bestGap = gap;
                                splitAfter = g;
                                bestMidTie = midDist;
                            }
                        }

                        for (let k = startA + 1; k <= splitAfter; k += 1) {
                            rowSlices[a].push(pageEntries[k]);
                        }
                        for (let k = splitAfter + 1; k < nextA; k += 1) {
                            rowSlices[a + 1].push(pageEntries[k]);
                        }
                    }
                } else {
                    // Trailing wrapped lines after last anchor on page -> belong to last anchor
                    for (let k = startA + 1; k < pageEntries.length; k += 1) {
                        rowSlices[a].push(pageEntries[k]);
                    }
                }
            }

            // Merge each row slice into its buckets and sort sub-lines vertically before flushing
            for (const slice of rowSlices) {
                slice.sort((u, v) => u.y - v.y);
                const buckets = {};
                for (const entry of slice) {
                    const lb = entry.lineBuckets;
                    if (!entry.isAnchor && !lb.medicineName?.length && lb.amount?.length && buckets.amount?.length) {
                        const existingAmt = joinWrappedTokens(buckets.amount).trim();
                        if (/\.\d{2}$/.test(existingAmt)) continue;
                    }
                    for (const [k, toks] of Object.entries(lb)) {
                        if (k === 'amount' && buckets.amount?.length) {
                            const existingAmt = joinWrappedTokens(buckets.amount).trim();
                            if (/\.\d{2}$/.test(existingAmt)) continue;
                        }
                        if (!buckets[k]) buckets[k] = [];
                        buckets[k].push(...toks);
                    }
                }
                const medText = joinWrappedTokens(buckets.medicineName || [], medNameCol?.rightBound);
                if (medText && medText.length >= 2) {
                    rawItems.push({
                        pageNumber: page.pageNumber,
                        buckets,
                        colBounds: activeColumns
                    });
                }
            }
        }
        if (tableEnded && pIdx === pages.length - 1) break;
    }

    // Transform raw bucketed rows into normalized intermediate item objects
    const medicines = [];
    for (const raw of rawItems) {
        const b = raw.buckets;
        const findRight = (k) => raw.colBounds.find((c) => c.key === k)?.rightBound;

        const srStr = joinWrappedTokens(b.srNo || []);
        const rawMedicineName = joinWrappedTokens(b.medicineName || [], findRight('medicineName'));
        const salt = joinWrappedTokens(b.salt || [], findRight('salt'));
        const manufacturer = joinWrappedTokens(b.manufacturer || [], findRight('manufacturer'));
        const hsnRaw = joinWrappedTokens(b.hsnCode || []);
        const batchRaw = joinWrappedTokens(b.batch || []);
        const expStr = joinWrappedTokens(b.expiry || []);
        const mfgRaw = joinWrappedTokens(b.mfgDate || []);
        const qtyStr = joinWrappedTokens(b.purchaseQty || []);
        const freeStr = joinWrappedTokens(b.freeQty || []);
        const mrpStr = joinWrappedTokens(b.mrp || []);
        const rateStr = joinWrappedTokens(b.purchaseRate || []);
        const discStr = joinWrappedTokens(b.discount || []);
        const cgstStr = joinWrappedTokens(b.cgst || []);
        const sgstStr = joinWrappedTokens(b.sgst || []);
        const igstStr = joinWrappedTokens(b.igst || []);
        const gstStr = joinWrappedTokens(b.gst || []);
        const amtStr = joinWrappedTokens(b.amount || [], findRight('amount'));
        const catRaw = joinWrappedTokens(b.category || []);
        const packRaw = joinWrappedTokens(b.packSize || []);

        if (!rawMedicineName || rawMedicineName.length < 2) continue;
        const lowerName = rawMedicineName.toLowerCase();
        if (/^(sgst|cgst|igst|cess|total|sub total|grand total|net payable|taxable)/i.test(lowerName)) continue;

        let purchaseQty = null;
        let freeQty = 0;
        const schemeMatch = qtyStr.match(/(\d+)\s*\+\s*(\d+)/);
        if (schemeMatch) {
            purchaseQty = parseInt(schemeMatch[1], 10);
            freeQty = parseInt(schemeMatch[2], 10);
        } else {
            const qNum = parseIndianNumber(qtyStr);
            if (qNum !== null && qNum >= 0) purchaseQty = qNum;
        }
        if (freeStr) {
            const fNum = parseIndianNumber(freeStr);
            if (fNum !== null && fNum >= 0) freeQty = fNum;
        }

        const purchaseRate = parseIndianNumber(rateStr);
        const mrp = parseIndianNumber(mrpStr);
        const discount = parseIndianNumber(discStr);
        const cgstVal = parseIndianNumber(cgstStr);
        const sgstVal = parseIndianNumber(sgstStr);
        const igstVal = parseIndianNumber(igstStr);
        let gst = parseIndianNumber(gstStr);
        if (gst === null && (cgstVal !== null || sgstVal !== null)) {
            gst = (cgstVal || 0) + (sgstVal || 0);
        } else if (gst === null && igstVal !== null) {
            gst = igstVal;
        }
        const cgst = cgstVal !== null ? cgstVal : (gst !== null ? Number((gst / 2).toFixed(2)) : null);
        const sgst = sgstVal !== null ? sgstVal : (gst !== null ? Number((gst / 2).toFixed(2)) : null);

        const amount = parseIndianNumber(amtStr);
        const expParsed = parseExpiryValue(expStr);
        const mfgParsed = parseExpiryValue(mfgRaw);
        const hsnCode = (hsnRaw.match(/\b\d{4,8}\b/) || [])[0] || hsnRaw.replace(/[^0-9A-Za-z]/g, '');
        const batch = batchRaw.split(/\s+/)[0] || '';

        const enriched = enrichMedicineMetadata(rawMedicineName);

        medicines.push({
            rowNumber: parseInt(srStr, 10) || (medicines.length + 1),
            pageNumber: raw.pageNumber,
            medicineName: enriched.normalizedName,
            rawMedicineName,
            salt,
            category: catRaw || enriched.category,
            manufacturer,
            packSize: packRaw || enriched.packSize,
            unit: enriched.unit,
            unitsPerStrip: enriched.unitsPerStrip,
            hsnCode,
            batch,
            expiry: expParsed.expiry,
            expiryRaw: expParsed.expiryRaw || expStr,
            expiryIsNA: expParsed.isNA,
            mfgDate: mfgParsed.expiry || '',
            purchaseQty,
            freeQty,
            purchaseRate,
            mrp,
            discount,
            discountType: 'Percentage',
            gst,
            cgst,
            sgst,
            igst: igstVal,
            amount
        });
    }

    return {
        medicines,
        detectedHeaders: Array.from(headerNamesSet),
        columnMappingUsed
    };
}

/**
 * Extract Vendor & Invoice header/footer metadata cleanly from Page 1 & Last Page coordinate text.
 */
function extractInvoiceMetadata(pages, fullText) {
    const cleanText = String(fullText || '');
    const page1 = pages[0];
    const lastPage = pages[pages.length - 1];
    const p1Lines = (page1?.visualLines || []).map((l) => l.text);

    // 1. Extract GSTINs (first non-buyer GSTIN is vendor GSTIN)
    const gstRegex = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/g;
    const allGstins = [...cleanText.matchAll(gstRegex)].map((m) => m[1]);
    const vendorGST = allGstins[0] || '';

    // 2. Drug License (DL No.)
    const dlMatch = cleanText.match(/(?:DL\s*No\.?|D\.L\.?\s*No\.?|Drug\s*Lic\.?)[\s:#\-]*([A-Z0-9\-\/]+(?:\s*\/\s*[A-Z0-9\-\/]+)?)/i);
    const vendorDL = dlMatch ? dlMatch[1].trim() : '';

    // 3. Invoice Number & Date (coordinate-aware: handles both inline "Inv No: X" and vertical box labels)
    const BLACKLIST_INV_WORDS = /^(invoice|bill|date|number|no|amount|gstin|place|due|order|ref|reverse|supply|dated)$/i;
    let invoiceNumber = '';
    if (page1?.visualLines?.length) {
        for (let i = 0; i < Math.min(page1.visualLines.length, 16); i += 1) {
            const ln = page1.visualLines[i];
            if (ln.y > 230) break;
            // Group tokens on this line into phrases split by horizontal gaps (>18pt)
            const sortedToks = [...(ln.tokens || [])].sort((a, b) => a.x - b.x);
            const phrases = [];
            for (const tk of sortedToks) {
                const lastP = phrases[phrases.length - 1];
                if (lastP && (tk.x - lastP.right) <= 10) {
                    lastP.text += ` ${tk.str}`;
                    lastP.right = Math.max(lastP.right, tk.right);
                } else {
                    phrases.push({ text: tk.str, x: tk.x, right: tk.right, y: ln.y });
                }
            }
            const invLbl = phrases.find((p) => /^(?:invoice\s*(?:no\.?|number|#)|bill\s*no\.?)$/i.test(p.text.trim()));
            if (invLbl) {
                const lblCenter = (invLbl.x + invLbl.right) / 2;
                // Find token on a lower line aligned vertically beneath the label
                for (let j = i + 1; j < Math.min(page1.visualLines.length, i + 4); j += 1) {
                    const below = page1.visualLines[j];
                    if (below.y - ln.y > 28) break;
                    const belowTok = (below.tokens || []).find((t) => {
                        const tCenter = (t.x + t.right) / 2;
                        return Math.abs(tCenter - lblCenter) <= 55 && !BLACKLIST_INV_WORDS.test(t.str.trim());
                    });
                    if (belowTok && /[A-Z0-9]{2,}/i.test(belowTok.str)) {
                        invoiceNumber = belowTok.str.trim();
                        break;
                    }
                }
            }
            if (invoiceNumber) break;
        }
    }
    if (!invoiceNumber) {
        const invNumPatterns = [
            /(?:Invoice\s*(?:No\.?|Number|#)|Bill\s*No\.?|Inv\.?\s*No\.?)\s*[:#\-\s]+([A-Z0-9][A-Z0-9\/\-\_]{2,29})/i
        ];
        for (const rx of invNumPatterns) {
            const m = cleanText.match(rx);
            if (m && m[1] && !BLACKLIST_INV_WORDS.test(m[1].trim())) {
                invoiceNumber = m[1].trim();
                break;
            }
        }
    }

    let invoiceDate = null;
    let invoiceDateRaw = '';
    const invDateMatch = cleanText.match(/(?:Invoice\s*\/?\s*Bill\s*Date|Invoice\s*Date|Bill\s*Date|Dated?)[:\s\-\n]*(\d{1,2}[\-\/ ](?:[A-Za-z]{3,9}|\d{1,2})[\-\/ ]\d{2,4})/i);
    if (invDateMatch && invDateMatch[1]) {
        invoiceDateRaw = invDateMatch[1].trim();
        const d = new Date(invoiceDateRaw);
        if (!Number.isNaN(d.getTime())) {
            invoiceDate = d.toISOString();
        } else {
            const parts = invoiceDateRaw.split(/[\/\-]/);
            if (parts.length === 3) {
                const dd = parseInt(parts[0], 10);
                const mm = parseInt(parts[1], 10);
                let yy = parseInt(parts[2], 10);
                if (yy < 100) yy += 2000;
                if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
                    invoiceDate = new Date(Date.UTC(yy, mm - 1, dd)).toISOString();
                }
            }
        }
    }

    const orderRefMatch = cleanText.match(/(?:Order\s*\/?\s*PO\s*Ref\.?|PO\s*No\.?)[:\s\-\n]*([A-Z0-9\-\/]{3,32})/i);
    const orderRef = orderRefMatch ? orderRefMatch[1].trim() : '';

    // 4. Vendor Name (from top-left coordinate region of Page 1, below document title banner)
    let vendorName = '';
    let vendorAddress = '';
    let vendorPhone = '';
    if (page1) {
        const pageW = page1.width || 595;
        // Split each top visual line at any wide horizontal column gap (>35pt) so right-column
        // invoice metadata ("Invoice Number: ...") never pollutes the left-column vendor name.
        const topLeftLines = [];
        for (const l of page1.visualLines) {
            if (l.y >= 230 || !l.tokens?.length) continue;
            const sortedToks = [...l.tokens].sort((a, b) => a.x - b.x);
            if (sortedToks[0].x >= pageW * 0.56) continue;
            const leftToks = [sortedToks[0]];
            for (let t = 1; t < sortedToks.length; t += 1) {
                const gap = sortedToks[t].x - sortedToks[t - 1].right;
                if (gap > 35 && sortedToks[t].x >= pageW * 0.42) break;
                leftToks.push(sortedToks[t]);
            }
            const segText = leftToks.map((tk) => tk.str).join(' ').replace(/\s+/g, ' ').trim();
            if (segText) topLeftLines.push({ y: l.y, text: segText });
        }

        for (let idx = 0; idx < topLeftLines.length; idx += 1) {
            const txt = topLeftLines[idx].text.trim();
            if (!txt) continue;
            if (/^(tax\s*invoice|gst\s*invoice|original\s*copy|duplicate\s*copy|billing\s*details|billed\s*to|place\s*of\s*supply)/i.test(txt)) {
                continue;
            }
            if (/tax\s*invoice|bulk\s*wholesale\s*order|invoice\s*number|bill\s*no/i.test(txt)) {
                continue;
            }
            if (/^(gstin|dl\s*no|mobile|phone|email|tel)[:\s]/i.test(txt)) continue;
            if (!vendorName && /[A-Za-z]{3,}/.test(txt) && !/plot|road|street|floor|nagar|marg|sector|shop\s*no/i.test(txt)) {
                vendorName = txt.replace(/\s+/g, ' ').trim();
                // Capture next 1-2 lines as address before Mobile/GSTIN/Billed To
                const addrParts = [];
                for (let j = idx + 1; j < Math.min(topLeftLines.length, idx + 4); j += 1) {
                    const aTxt = topLeftLines[j].text.trim();
                    if (/^(mobile|phone|email|gstin|dl\s*no|billing\s*details|billed\s*to|invoice)/i.test(aTxt)) break;
                    addrParts.push(aTxt);
                }
                vendorAddress = addrParts.join(', ');
                break;
            }
        }
    }
    if (!vendorName && p1Lines.length > 0) {
        for (const l of p1Lines.slice(0, 12)) {
            if (!/tax\s*invoice|gst\s*invoice|original|billed\s*to|invoice\s*number/i.test(l) && /[A-Za-z]{3,}/.test(l)) {
                vendorName = l.trim();
                break;
            }
        }
    }

    const phoneMatch = cleanText.match(/(?:Mobile|Phone|Tel|Mob\.?)[:\s]*(?:\+?91[\s\-]?)?(\d{5}[\-\s]?\d{5})/i);
    if (phoneMatch) {
        vendorPhone = phoneMatch[1].replace(/\D/g, '').slice(-10);
    }

    // 5. Financial Totals (Last page footer or full text)
    const footerText = lastPage
        ? lastPage.visualLines.map((l) => l.text).join('\n')
        : cleanText;

    const extractAmt = (rxList) => {
        for (const rx of rxList) {
            const m = footerText.match(rx) || cleanText.match(rx);
            if (m && m[1]) {
                const n = parseIndianNumber(m[1]);
                if (n !== null && n >= 0) return n;
            }
        }
        return null;
    };

    const grandTotal = extractAmt([
        /Grand\s*Total\s*=?\s*₹?\s*([\d,]+\.\d{1,2})/i,
        /Net\s*Payable\s*(?:\(Incl\.?\s*GST\))?\s*[:=\s₹]*([\d,\s]+\.\d{1,2})/i,
        /Total\s*Bulk\s*Quantity[^\n]*\n?\s*(?:[\d,]+\s+)?Net\s*Payable[^\n]*\s*([\d,]+\.\d{1,2})/i
    ]) || 0;

    const taxableAmount = extractAmt([
        /Total\s*Taxable\s*Value\s*=?\s*₹?\s*([\d,]+\.\d{1,2})/i,
        /Taxable\s*(?:Amount|Value)\s*[:=\s₹]*([\d,]+\.\d{1,2})/i
    ]) || 0;

    const totalGstFooter = extractAmt([
        /Total\s*GST\s*=?\s*₹?\s*([\d,]+\.\d{1,2})/i
    ]);

    let cgst = 0;
    let sgst = 0;
    const cgstAll = [...footerText.matchAll(/CGST\s*=?\s*₹?\s*([\d,]+\.\d{1,2})/gi)];
    const sgstAll = [...footerText.matchAll(/SGST\s*=?\s*₹?\s*([\d,]+\.\d{1,2})/gi)];
    if (cgstAll.length > 0) cgst = Number(cgstAll.reduce((s, m) => s + (parseIndianNumber(m[1]) || 0), 0).toFixed(2));
    if (sgstAll.length > 0) sgst = Number(sgstAll.reduce((s, m) => s + (parseIndianNumber(m[1]) || 0), 0).toFixed(2));
    if (cgst === 0 && sgst === 0 && totalGstFooter) {
        cgst = Number((totalGstFooter / 2).toFixed(2));
        sgst = Number((totalGstFooter / 2).toFixed(2));
    }

    return {
        vendorName,
        vendorGST,
        vendorDL,
        vendorAddress,
        vendorPhone,
        invoiceNumber,
        invoiceDate,
        invoiceDateRaw,
        orderRef,
        taxableAmount,
        cgst,
        sgst,
        igst: 0,
        grandTotal
    };
}

/**
 * Fallback heuristic line-based parser when a text PDF lacks recognizable aligned column headers.
 */
function heuristicTextLineFallback(fullText) {
    const lines = String(fullText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = [];
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (HEADER_STOP_MARKERS.some((sw) => lower.includes(sw))) break;

        const expMatch = line.match(/\b(0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})\b/);
        const decimals = line.match(/\b\d[\d,]*\.\d{2}\b/g);
        if (!expMatch || !decimals || decimals.length < 2) continue;

        const qtyMatch = line.match(/^(?:\d+[\.\)]\s+)?([A-Za-z][A-Za-z0-9\s\-\+&\.\/\(\)×*]{2,}?)\s+(?:\d{4,8}\s+)?([A-Z0-9\-]{2,15})\s+(?:0?[1-9]|1[0-2])[\/\-](?:20\d{2}|\d{2})\s+(\d+(?:\+\d+)?)\s+/i);
        if (qtyMatch) {
            const name = qtyMatch[1].trim();
            const batch = qtyMatch[2].trim();
            const qParts = qtyMatch[3].split('+');
            const purchaseQty = parseInt(qParts[0], 10);
            const freeQty = qParts[1] ? parseInt(qParts[1], 10) : 0;
            const mrp = parseIndianNumber(decimals[0]);
            const purchaseRate = parseIndianNumber(decimals[1]);
            const amount = decimals.length >= 3 ? parseIndianNumber(decimals[decimals.length - 1]) : null;
            const expParsed = parseExpiryValue(expMatch[0]);
            const meta = enrichMedicineMetadata(name);
            items.push({
                rowNumber: items.length + 1,
                medicineName: meta.normalizedName,
                rawMedicineName: name,
                salt: '',
                category: meta.category,
                manufacturer: '',
                packSize: meta.packSize,
                unit: meta.unit,
                unitsPerStrip: meta.unitsPerStrip,
                hsnCode: '',
                batch,
                expiry: expParsed.expiry,
                expiryRaw: expParsed.expiryRaw,
                purchaseQty,
                freeQty,
                purchaseRate,
                mrp,
                discount: null,
                discountType: 'Percentage',
                gst: null,
                cgst: null,
                sgst: null,
                amount
            });
        }
    }
    return items;
}

/**
 * Main Layer 1 + Layer 2 PDF parser (backwards compatible `parseInvoice(buffer, options)`).
 */
async function parseInvoice(buffer, options = {}) {
    const vendorColumnMappings = options.vendorColumnMappings || {};
    const extracted = await extractPdfPagesWithCoordinates(buffer, options);

    const headerMeta = extractInvoiceMetadata(extracted.pages, extracted.fullText);
    let { medicines, detectedHeaders, columnMappingUsed } = extractTableRowsByCoordinates(
        extracted.pages,
        vendorColumnMappings
    );
    let method = 'native_coordinates';

    if (medicines.length === 0 && !extracted.likelyScanned && extracted.nonWhitespaceChars > 100) {
        const heuristicMeds = heuristicTextLineFallback(extracted.fullText);
        if (heuristicMeds.length > 0) {
            medicines = heuristicMeds;
            method = 'heuristic_text';
        }
    }

    const totalPurchaseQty = medicines.reduce((s, m) => s + (Number(m.purchaseQty) || 0), 0);
    const totalFreeQty = medicines.reduce((s, m) => s + (Number(m.freeQty) || 0), 0);
    const lineSumAmount = Number(medicines.reduce((s, m) => s + (Number(m.amount) || 0), 0).toFixed(2));

    return {
        invoice: {
            ...headerMeta,
            totalMedicines: medicines.length,
            purchaseQty: totalPurchaseQty,
            freeQty: totalFreeQty
        },
        medicines,
        extractionMeta: {
            method,
            pageCount: extracted.numPages,
            nonWhitespaceChars: extracted.nonWhitespaceChars,
            totalImages: extracted.totalImages,
            likelyScanned: extracted.likelyScanned,
            detectedHeaders,
            columnMappings: columnMappingUsed,
            lineSumAmount
        },
        rawTextSample: extracted.fullText.slice(0, 4000)
    };
}

module.exports = {
    InvoiceParseError,
    DEFAULT_COLUMN_ALIASES,
    validatePdfBuffer,
    parseIndianNumber,
    parseExpiryValue,
    enrichMedicineMetadata,
    normalizeHeaderText,
    resolveHeaderFieldKey,
    joinWrappedTokens,
    extractPdfPagesWithCoordinates,
    extractInvoiceMetadata,
    parseInvoice
};
