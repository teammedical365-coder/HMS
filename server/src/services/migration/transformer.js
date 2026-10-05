/**
 * transformer.js — Deterministic data transformation & normalization engine.
 *
 * Implements Medical365 standard normalization for dates, phones, genders,
 * blood groups, currency amounts, and custom fields.
 *
 * RULE 8 & 40: NEVER invent or guess data. If a value is invalid, flag it
 * as an issue and preserve the original value safely for human review.
 */

/**
 * Normalize text string:
 * - Trims whitespace
 * - Collapses duplicate internal spaces
 * - Treats "", " ", "NULL", "N/A", "NA", "null", "undefined" as empty string
 */
function normalizeString(val) {
    if (val === null || val === undefined) return '';
    const s = String(val).trim().replace(/\s+/g, ' ');
    const lower = s.toLowerCase();
    if (['', 'null', 'n/a', 'na', 'none', 'undefined', '-', '.'].includes(lower)) {
        return '';
    }
    return s;
}

/**
 * Normalize Indian 10-digit mobile number:
 * - Strips +91, 0 prefix, spaces, hyphens, brackets
 * - Verifies exact 10 digits
 */
function normalizePhone(val) {
    const raw = normalizeString(val);
    if (!raw) return { value: '', error: null };

    // Strip non-digit characters
    let cleaned = raw.replace(/\D/g, '');

    // Strip leading 91 (country code) if 12 digits
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        cleaned = cleaned.slice(2);
    }
    // Strip leading 0 if 11 digits
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
        cleaned = cleaned.slice(1);
    }

    if (/^\d{10}$/.test(cleaned)) {
        return { value: cleaned, error: null };
    }

    return {
        value: raw,
        error: 'INVALID_PHONE',
        message: `Phone number '${raw}' is not a valid 10-digit number.`
    };
}

/**
 * Normalize email address:
 * - Trims and lowercases
 * - Validates standard RFC email format
 */
function normalizeEmail(val) {
    const raw = normalizeString(val);
    if (!raw) return { value: '', error: null };

    const clean = raw.toLowerCase();
    if (/^\S+@\S+\.\S+$/.test(clean)) {
        return { value: clean, error: null };
    }

    return {
        value: raw,
        error: 'INVALID_EMAIL',
        message: `Email address '${raw}' is not formatted correctly.`
    };
}

/**
 * Normalize dates:
 * - Supports DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY
 * - Supports Excel serial numbers (e.g. 44561)
 * - Returns ISO format 'YYYY-MM-DD'
 * - Rejects impossible dates (e.g. 31/15/1990)
 */
function normalizeDate(val) {
    const raw = normalizeString(val);
    if (!raw) return { value: '', error: null };

    // 1. Check if already Date object
    if (val instanceof Date && !isNaN(val.getTime())) {
        return { value: val.toISOString().split('T')[0], error: null };
    }

    // 2. Check if numeric Excel serial date (e.g. 25569 = 1970-01-01)
    if (/^\d{5}$/.test(raw)) {
        const serial = Number(raw);
        if (serial > 10000 && serial < 80000) {
            const excelEpoch = new Date(Date.UTC(1899, 11, 30));
            const date = new Date(excelEpoch.getTime() + serial * 86400000);
            if (!isNaN(date.getTime())) {
                return { value: date.toISOString().split('T')[0], error: null };
            }
        }
    }

    // 3. String date parsing
    // Match DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10);
        const year = parseInt(dmyMatch[3], 10);

        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return { value: raw, error: 'INVALID_DATE', message: `Invalid calendar date '${raw}'` };
        }

        const date = new Date(Date.UTC(year, month - 1, day));
        // Verify calendar validity (e.g. Feb 30 becomes Mar 2)
        if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
            return { value: date.toISOString().split('T')[0], error: null };
        } else {
            return { value: raw, error: 'INVALID_DATE', message: `Impossible calendar date '${raw}'` };
        }
    }

    // Match YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        const month = parseInt(ymdMatch[2], 10);
        const day = parseInt(ymdMatch[3], 10);

        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return { value: raw, error: 'INVALID_DATE', message: `Invalid calendar date '${raw}'` };
        }

        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
            return { value: date.toISOString().split('T')[0], error: null };
        } else {
            return { value: raw, error: 'INVALID_DATE', message: `Impossible calendar date '${raw}'` };
        }
    }

    // Fallback: standard Date.parse
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) {
        const d = new Date(parsed);
        return { value: d.toISOString().split('T')[0], error: null };
    }

    return {
        value: raw,
        error: 'INVALID_DATE',
        message: `Date '${raw}' is not in a recognizable standard format.`
    };
}

/**
 * Normalize Gender:
 * - Male / M / MALE -> 'Male'
 * - Female / F / FEMALE -> 'Female'
 * - Other / Transgender -> 'Other'
 */
function normalizeGender(val) {
    const raw = normalizeString(val);
    if (!raw) return { value: '', error: null };

    const lower = raw.toLowerCase();
    if (['m', 'male', 'man', 'boy'].includes(lower)) {
        return { value: 'Male', error: null };
    }
    if (['f', 'female', 'woman', 'girl'].includes(lower)) {
        return { value: 'Female', error: null };
    }
    if (['o', 'other', 'transgender', 't'].includes(lower)) {
        return { value: 'Other', error: null };
    }

    return {
        value: raw,
        error: 'INVALID_GENDER',
        message: `Gender value '${raw}' does not match allowed options (Male, Female, Other).`
    };
}

/**
 * Normalize Blood Group:
 * - Maps positive, negative, ve variations to standard A+, B+, etc.
 */
function normalizeBloodGroup(val) {
    const raw = normalizeString(val);
    if (!raw) return { value: '', error: null };

    let clean = raw.toUpperCase()
        .replace(/\s+/g, '')
        .replace(/POSITIVE/g, '+')
        .replace(/NEGATIVE/g, '-')
        .replace(/POS/g, '+')
        .replace(/NEG/g, '-')
        .replace(/VE/g, '');

    const valid = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (valid.includes(clean)) {
        return { value: clean, error: null };
    }

    return {
        value: raw,
        error: 'INVALID_BLOOD_GROUP',
        message: `Blood group '${raw}' does not match standard ABO/Rh types.`
    };
}

/**
 * Normalize 6-digit Indian PIN code.
 */
function normalizePincode(val) {
    const raw = normalizeString(val);
    if (!raw) return { value: '', error: null };

    const cleaned = raw.replace(/\D/g, '');
    if (/^\d{6}$/.test(cleaned)) {
        return { value: cleaned, error: null };
    }

    return {
        value: raw,
        error: 'INVALID_PINCODE',
        message: `PIN code '${raw}' must be a 6-digit number.`
    };
}

/**
 * Normalize currency / monetary amount:
 * - Strips currency symbols (₹, INR, $, commas)
 * - Returns float rounded to 2 decimals
 * - Rejects NaN
 */
function normalizeAmount(val) {
    const raw = normalizeString(val);
    if (!raw) return { value: 0, error: null };

    const cleaned = raw.replace(/[₹$,\sA-Za-z]/g, '');
    const num = parseFloat(cleaned);

    if (isNaN(num)) {
        return {
            value: raw,
            error: 'INVALID_AMOUNT',
            message: `Amount '${raw}' is not a valid number.`
        };
    }

    return { value: Math.round(num * 100) / 100, error: null };
}

/**
 * Normalize 12-digit Indian Aadhaar number.
 */
function normalizeAadhaar(val) {
    const raw = normalizeString(val);
    if (!raw) return { value: '', error: null };

    const cleaned = raw.replace(/\D/g, '');
    if (/^\d{12}$/.test(cleaned)) {
        return { value: cleaned, error: null };
    }

    return {
        value: raw,
        error: 'INVALID_AADHAAR',
        message: `Aadhaar number '${raw}' must be a 12-digit numeric identity.`
    };
}

/**
 * Transform a single raw source record according to session mappings and custom fields.
 *
 * @param {Object} rawRecord - Raw row dictionary
 * @param {Array} mappings - Approved field mappings list
 * @param {Array} customFields - Session custom fields list
 * @param {string} entity - Target entity ('Patient', 'Doctor', etc.)
 * @returns {{ transformedData: Object, issues: Array<Object>, legacyId: string }}
 */
function transformRecord(rawRecord, mappings = [], customFields = [], entity = 'Patient') {
    const transformed = { customFields: {} };
    const issues = [];
    let legacyId = '';

    // Create lookup of mappings by sourceField
    const mappingMap = {};
    mappings.forEach(m => {
        if (m.sourceField) {
            mappingMap[m.sourceField.trim().toLowerCase()] = m;
        }
    });

    Object.keys(rawRecord).forEach(rawKey => {
        const cleanKey = rawKey.trim();
        const lowerKey = cleanKey.toLowerCase();
        const rawVal = rawRecord[rawKey];
        const mapping = mappingMap[lowerKey];

        if (!mapping || mapping.mappingType === 'IGNORE') {
            return; // Ignored or unmapped
        }

        // 1. Handle Custom Fields
        if (mapping.mappingType === 'CUSTOM_FIELD' || mapping.isCustomField) {
            const fieldKey = mapping.customFieldConfig?.key || lowerKey.replace(/[^a-z0-9_]/g, '_');
            const dataType = mapping.customFieldConfig?.dataType || 'Text';

            let normVal = normalizeString(rawVal);
            if (dataType === 'Number') {
                const amtRes = normalizeAmount(rawVal);
                normVal = amtRes.error ? rawVal : amtRes.value;
                if (amtRes.error) {
                    issues.push({
                        category: 'CUSTOM_FIELD',
                        severity: 'WARNING',
                        field: fieldKey,
                        message: `Custom field '${fieldKey}' expected a number, got '${rawVal}'`,
                        currentValue: String(rawVal)
                    });
                }
            } else if (dataType === 'Date') {
                const dtRes = normalizeDate(rawVal);
                normVal = dtRes.error ? rawVal : dtRes.value;
                if (dtRes.error) {
                    issues.push({
                        category: 'CUSTOM_FIELD',
                        severity: 'WARNING',
                        field: fieldKey,
                        message: `Custom field '${fieldKey}' expected a date, got '${rawVal}'`,
                        currentValue: String(rawVal)
                    });
                }
            }

            transformed.customFields[fieldKey] = normVal;
            transformed[fieldKey] = normVal;
            return;
        }

        // 2. Handle Canonical Target Fields
        const targetField = mapping.targetField;
        if (!targetField) return;

        let normResult = { value: normalizeString(rawVal), error: null };

        // Apply specialized normalizer based on target field name
        if (['phone', 'alternateMobile', 'emergencyContactPhone', 'patientPhone'].includes(targetField)) {
            normResult = normalizePhone(rawVal);
        } else if (['email'].includes(targetField)) {
            normResult = normalizeEmail(rawVal);
        } else if (['dob', 'appointmentDate', 'admissionDate', 'dischargeDate', 'expiryDate', 'paymentDate', 'invoiceDate'].includes(targetField)) {
            normResult = normalizeDate(rawVal);
        } else if (['gender'].includes(targetField)) {
            normResult = normalizeGender(rawVal);
        } else if (['bloodGroup'].includes(targetField)) {
            normResult = normalizeBloodGroup(rawVal);
        } else if (['zipCode'].includes(targetField)) {
            normResult = normalizePincode(rawVal);
        } else if (['amount', 'fee', 'price', 'buyingPrice', 'sellingPrice', 'totalAmount', 'opdFee', 'taxAmount'].includes(targetField)) {
            normResult = normalizeAmount(rawVal);
        } else if (['aadhaarNumber'].includes(targetField)) {
            normResult = normalizeAadhaar(rawVal);
        } else {
            normResult = { value: normalizeString(rawVal), error: null };
        }

        if (normResult.error) {
            issues.push({
                category: 'TRANSFORMATION',
                severity: 'ERROR',
                field: targetField,
                message: normResult.message || `Failed to normalize '${cleanKey}'`,
                currentValue: String(rawVal),
                suggestedAction: 'Verify source data format or correct mapping.'
            });
        }

        transformed[targetField] = normResult.value;

        // Detect primary legacy ID (UHID, Doctor ID, Ticket ID, etc.)
        if (['uhid', 'patientId', 'doctorId', 'tokenNumber', 'invoiceNumber', 'code', 'id'].includes(targetField) && !legacyId) {
            legacyId = String(normResult.value || '').trim();
        }
    });

    // Handle Composite Name: If firstName and lastName exist but name doesn't
    if (transformed.firstName && !transformed.name) {
        transformed.name = `${transformed.firstName} ${transformed.lastName || ''}`.trim();
    }
    // If name exists but firstName doesn't
    if (transformed.name && !transformed.firstName) {
        const parts = transformed.name.split(' ');
        transformed.firstName = parts[0] || '';
        transformed.lastName = parts.slice(1).join(' ') || '';
    }

    // Fallback legacy ID check: check if raw record had UHID/ID
    if (!legacyId) {
        const idKeys = ['uhid', 'patient_id', 'mrn', 'doctor_id', 'doc_id', 'id', 'code', 'reg_no'];
        for (const k of Object.keys(rawRecord)) {
            if (idKeys.includes(k.toLowerCase().trim())) {
                legacyId = String(rawRecord[k]).trim();
                break;
            }
        }
    }

    return { transformedData: transformed, issues, legacyId };
}

module.exports = {
    normalizeString,
    normalizePhone,
    normalizeEmail,
    normalizeDate,
    normalizeGender,
    normalizeBloodGroup,
    normalizePincode,
    normalizeAmount,
    normalizeAadhaar,
    transformRecord
};
