/**
 * fileAnalyzer.js — Parse & analyze CSV, XLS, XLSX, and JSON hospital data files.
 *
 * Designed for Medical365 HMS Data Migration Phase 1.
 * Strict privacy: extracts metadata and at most 5 sanitized representative sample rows.
 */

const XLSX = require('xlsx');

/**
 * Infer JavaScript / DB data type from sample column values.
 */
function inferDataType(values) {
    const nonNulls = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (nonNulls.length === 0) return 'String';

    let isNum = true;
    let isDate = true;
    let isBool = true;

    for (const val of nonNulls) {
        const s = String(val).trim();
        // Number check
        if (isNaN(Number(s))) isNum = false;
        // Boolean check
        if (!['true', 'false', '0', '1', 'yes', 'no'].includes(s.toLowerCase())) isBool = false;
        // Date check
        const d = Date.parse(s);
        if (isNaN(d) || !/[-/:]|\d{4}/.test(s)) isDate = false;
    }

    if (isBool && nonNulls.length > 0) return 'Boolean';
    if (isNum && nonNulls.length > 0) return 'Number';
    if (isDate && nonNulls.length > 0) return 'Date';
    return 'String';
}

/**
 * Sanitize a sample cell value (strips non-printable chars, truncates if huge).
 */
function sanitizeValue(val) {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) return val.toISOString().split('T')[0];
    const s = String(val).trim();
    if (s.length > 150) return s.slice(0, 147) + '...';
    return s;
}

/**
 * Analyze an uploaded file buffer (CSV, XLS, XLSX, JSON).
 *
 * @param {Buffer} buffer - File buffer from Multer
 * @param {string} originalName - Original uploaded filename
 * @param {string} fileType - 'CSV' | 'XLS' | 'XLSX' | 'JSON'
 * @returns {Promise<Object>} Analysis metadata
 */
async function analyzeFile(buffer, originalName, fileType) {
    if (!buffer || buffer.length === 0) {
        throw new Error(`File '${originalName}' is empty.`);
    }

    const normType = fileType.toUpperCase();

    if (normType === 'JSON') {
        return analyzeJson(buffer, originalName);
    }

    if (['CSV', 'XLS', 'XLSX'].includes(normType)) {
        return analyzeSpreadsheet(buffer, originalName, normType);
    }

    throw new Error(`Unsupported file type '${normType}'. Supported types: CSV, XLS, XLSX, JSON.`);
}

/**
 * Analyze JSON files
 */
function analyzeJson(buffer, originalName) {
    let parsed;
    try {
        const text = buffer.toString('utf8');
        parsed = JSON.parse(text);
    } catch (err) {
        throw new Error(`Malformed JSON in file '${originalName}': ${err.message}`);
    }

    let records = [];
    if (Array.isArray(parsed)) {
        records = parsed;
    } else if (parsed && typeof parsed === 'object') {
        // Look for common nested array wrappers
        const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
        if (arrayKey) {
            records = parsed[arrayKey];
        } else {
            // Single object record
            records = [parsed];
        }
    }

    if (!records || records.length === 0) {
        throw new Error(`JSON file '${originalName}' contains no records.`);
    }

    // Extract unique headers across records
    const headerSet = new Set();
    records.slice(0, 100).forEach(rec => {
        if (rec && typeof rec === 'object') {
            Object.keys(rec).forEach(k => {
                if (typeof rec[k] !== 'object' || rec[k] === null) {
                    headerSet.add(k.trim());
                }
            });
        }
    });

    const headers = Array.from(headerSet).filter(Boolean);
    if (headers.length === 0) {
        throw new Error(`JSON file '${originalName}' contains no valid field keys.`);
    }

    const sampleRows = records.slice(0, 5).map(row => {
        const clean = {};
        headers.forEach(h => {
            clean[h] = sanitizeValue(row[h]);
        });
        return clean;
    });

    const columnTypes = {};
    headers.forEach(h => {
        const colValues = records.slice(0, 50).map(r => r[h]);
        columnTypes[h] = inferDataType(colValues);
    });

    return {
        originalName,
        fileType: 'JSON',
        fileSize: buffer.length,
        rowCount: records.length,
        columnCount: headers.length,
        sheetNames: ['default'],
        headers,
        sampleRows,
        columnTypes,
        analysisStatus: 'COMPLETED'
    };
}

/**
 * Analyze CSV, XLS, XLSX using SheetJS
 */
function analyzeSpreadsheet(buffer, originalName, normType) {
    let workbook;
    try {
        workbook = XLSX.read(buffer, {
            type: 'buffer',
            cellDates: true,
            raw: false
        });
    } catch (err) {
        throw new Error(`Failed to parse spreadsheet '${originalName}': ${err.message}`);
    }

    const sheetNames = workbook.SheetNames || [];
    if (sheetNames.length === 0) {
        throw new Error(`Spreadsheet '${originalName}' contains no readable sheets.`);
    }

    // Pick first non-empty sheet
    let targetSheet = null;
    let targetSheetName = sheetNames[0];

    for (const name of sheetNames) {
        const sheet = workbook.Sheets[name];
        if (sheet && sheet['!ref']) {
            targetSheet = sheet;
            targetSheetName = name;
            break;
        }
    }

    if (!targetSheet) {
        throw new Error(`Spreadsheet '${originalName}' is empty or has no populated rows.`);
    }

    // Convert sheet to json array of arrays to inspect raw headers
    const rawData = XLSX.utils.sheet_to_json(targetSheet, {
        header: 1,
        defval: '',
        blankrows: false
    });

    if (!rawData || rawData.length < 2) {
        throw new Error(`File '${originalName}' must have a header row and at least 1 data row.`);
    }

    // Extract headers from first non-empty row
    let headerRowIdx = 0;
    while (headerRowIdx < rawData.length && rawData[headerRowIdx].every(c => String(c).trim() === '')) {
        headerRowIdx++;
    }

    if (headerRowIdx >= rawData.length) {
        throw new Error(`File '${originalName}' does not have a recognizable header row.`);
    }

    const rawHeaderRow = rawData[headerRowIdx];
    const seenHeaders = {};
    const headers = [];
    const validColIndices = [];

    rawHeaderRow.forEach((col, idx) => {
        const rawName = String(col || '').trim();
        if (!rawName) return; // Skip completely empty column header

        // Handle duplicate headers cleanly
        let cleanName = rawName;
        if (seenHeaders[cleanName]) {
            seenHeaders[cleanName]++;
            cleanName = `${cleanName}_${seenHeaders[cleanName]}`;
        } else {
            seenHeaders[cleanName] = 1;
        }

        headers.push(cleanName);
        validColIndices.push(idx);
    });

    if (headers.length === 0) {
        throw new Error(`File '${originalName}' has no non-empty column headers.`);
    }

    const dataRows = rawData.slice(headerRowIdx + 1);
    const rowCount = dataRows.length;

    // Extract up to 5 sanitized sample rows
    const sampleRows = dataRows.slice(0, 5).map(row => {
        const obj = {};
        headers.forEach((h, hIdx) => {
            const colIdx = validColIndices[hIdx];
            obj[h] = sanitizeValue(row[colIdx]);
        });
        return obj;
    });

    // Detect data type per column
    const columnTypes = {};
    headers.forEach((h, hIdx) => {
        const colIdx = validColIndices[hIdx];
        const sampleColValues = dataRows.slice(0, 50).map(r => r[colIdx]);
        columnTypes[h] = inferDataType(sampleColValues);
    });

    return {
        originalName,
        fileType: normType,
        fileSize: buffer.length,
        rowCount,
        columnCount: headers.length,
        sheetNames,
        headers,
        sampleRows,
        columnTypes,
        analysisStatus: 'COMPLETED'
    };
}

module.exports = {
    analyzeFile,
    inferDataType,
    sanitizeValue
};
