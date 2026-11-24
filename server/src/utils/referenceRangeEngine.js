/**
 * Reference Range Evaluation Engine — Medical365 LMS Phase 7
 * Clinical-grade server-side reference range matching, abnormal flag evaluation,
 * and critical value threshold detection based on patient age, gender, and Phase 3 master data.
 */

/**
 * Normalizes patient age into years, months, and days.
 * @param {object} patient - { age, gender, dob }
 * @returns {object} { years, months, days, gender }
 */
function normalizePatientDemographics(patient = {}) {
    let years = Number(patient.age) || 0;
    let months = years * 12;
    let days = Math.round(years * 365.25);

    if (patient.dob) {
        const birthDate = new Date(patient.dob);
        const now = new Date();
        if (!isNaN(birthDate.getTime())) {
            const diffTime = Math.abs(now - birthDate);
            days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            months = Math.floor(days / 30.4375);
            years = Math.floor(days / 365.25);
        }
    }

    const rawGender = String(patient.gender || 'Any').trim().toLowerCase();
    let gender = 'Any';
    if (rawGender.startsWith('m')) gender = 'Male';
    else if (rawGender.startsWith('f')) gender = 'Female';
    else if (rawGender === 'other') gender = 'Other';

    return { years, months, days, gender };
}

/**
 * Matches the applicable reference range from a parameter's configured ranges.
 * Considers patient age, age unit, and gender.
 * Specific gender takes precedence over 'Any'.
 * @param {Array} referenceRanges - Array of reference range subdocuments
 * @param {object} demo - Normalized demographics { years, months, days, gender }
 * @returns {object|null} Matching reference range or null
 */
function findMatchingReferenceRange(referenceRanges = [], demo) {
    if (!Array.isArray(referenceRanges) || referenceRanges.length === 0) {
        return null;
    }

    // Filter ranges that cover the patient's age
    const ageMatches = referenceRanges.filter(range => {
        const unit = range.ageUnit || 'Years';
        let patientAgeVal = demo.years;
        if (unit === 'Months') patientAgeVal = demo.months;
        if (unit === 'Days') patientAgeVal = demo.days;

        const min = range.minAge != null ? Number(range.minAge) : 0;
        const max = range.maxAge != null ? Number(range.maxAge) : 120;

        return patientAgeVal >= min && patientAgeVal <= max;
    });

    if (ageMatches.length === 0) {
        return null;
    }

    // Try finding exact gender match first
    const exactGenderMatch = ageMatches.find(r => r.gender === demo.gender);
    if (exactGenderMatch) return exactGenderMatch;

    // Fall back to 'Any'
    const anyGenderMatch = ageMatches.find(r => r.gender === 'Any' || !r.gender);
    if (anyGenderMatch) return anyGenderMatch;

    // Default to first age match if no explicit gender restriction
    return ageMatches[0];
}

/**
 * Evaluates a single parameter's entered value against clinical master data.
 * @param {object} params
 * @param {object} params.parameter - Phase 3 Test Parameter definition
 * @param {any} params.enteredValue - Value entered by technician
 * @param {object} params.patient - Patient demographics { age, gender, dob }
 * @returns {object} Evaluated parameter result with flags, text, and snapshot
 */
function evaluateParameter({ parameter, enteredValue, patient }) {
    const dataType = parameter.dataType || 'Numeric';
    const unit = parameter.unit || '';
    const demo = normalizePatientDemographics(patient);
    const range = findMatchingReferenceRange(parameter.referenceRanges, demo);

    let abnormalFlag = 'NORMAL';
    let criticalFlag = false;
    let numericValue = null;
    let referenceRangeText = '';
    let referenceRangeSnapshot = null;

    if (range) {
        referenceRangeSnapshot = {
            minAge: range.minAge,
            maxAge: range.maxAge,
            ageUnit: range.ageUnit,
            gender: range.gender,
            normalMin: range.normalMin,
            normalMax: range.normalMax,
            criticalLow: range.criticalLow,
            criticalHigh: range.criticalHigh,
            unit: range.unit || unit,
            interpretationNotes: range.interpretationNotes || ''
        };

        if (range.normalMin != null && range.normalMax != null) {
            referenceRangeText = `${range.normalMin} - ${range.normalMax} ${unit}`.trim();
        } else if (range.normalMin != null) {
            referenceRangeText = `>= ${range.normalMin} ${unit}`.trim();
        } else if (range.normalMax != null) {
            referenceRangeText = `<= ${range.normalMax} ${unit}`.trim();
        } else {
            referenceRangeText = range.interpretationNotes || 'Clinical correlation';
        }
    } else {
        referenceRangeText = 'Not Configured';
        abnormalFlag = 'RANGE_NOT_CONFIGURED';
    }

    // Process according to Data Type
    if (dataType === 'Numeric') {
        const rawStr = String(enteredValue != null ? enteredValue : '').trim();
        if (rawStr === '') {
            return {
                enteredValue: '',
                numericValue: null,
                abnormalFlag: 'NOT_APPLICABLE',
                criticalFlag: false,
                referenceRangeText,
                referenceRangeSnapshot
            };
        }

        const parsed = Number(rawStr);
        if (isNaN(parsed)) {
            throw new Error(`Invalid numeric value "${rawStr}" for parameter "${parameter.parameterName}"`);
        }

        const decimals = parameter.decimalPlaces != null ? Number(parameter.decimalPlaces) : 0;
        numericValue = Number(parsed.toFixed(decimals));

        if (range) {
            const cLow = range.criticalLow != null ? Number(range.criticalLow) : null;
            const cHigh = range.criticalHigh != null ? Number(range.criticalHigh) : null;
            const nMin = range.normalMin != null ? Number(range.normalMin) : null;
            const nMax = range.normalMax != null ? Number(range.normalMax) : null;

            // Check Critical Limits First
            if (cLow != null && numericValue < cLow) {
                criticalFlag = true;
                abnormalFlag = 'LOW';
            } else if (cHigh != null && numericValue > cHigh) {
                criticalFlag = true;
                abnormalFlag = 'HIGH';
            } else if (nMin != null && numericValue < nMin) {
                // Abnormal Low
                abnormalFlag = 'LOW';
                criticalFlag = false;
            } else if (nMax != null && numericValue > nMax) {
                // Abnormal High
                abnormalFlag = 'HIGH';
                criticalFlag = false;
            } else {
                // Normal
                abnormalFlag = 'NORMAL';
                criticalFlag = false;
            }
        }
    } else if (dataType === 'Choice') {
        const strVal = String(enteredValue != null ? enteredValue : '').trim();
        const configuredChoices = (parameter.choices || []).map(c => String(c).trim());

        if (strVal && configuredChoices.length > 0) {
            const match = configuredChoices.find(c => c.toLowerCase() === strVal.toLowerCase());
            if (!match) {
                throw new Error(`Value "${strVal}" is not an authorized choice for "${parameter.parameterName}". Allowed: ${configuredChoices.join(', ')}`);
            }
            enteredValue = match;
        }

        // Determine abnormal flag for common qualitative tests
        const lower = strVal.toLowerCase();
        if (['positive', 'reactive', 'present', 'detected', 'abnormal'].includes(lower)) {
            abnormalFlag = 'ABNORMAL';
            // Specific qualitative critical markers
            if (['reactive', 'positive'].includes(lower) && ['hiv', 'hcv', 'hbsag', 'troponin', 'malaria'].some(k => parameter.parameterName.toLowerCase().includes(k))) {
                criticalFlag = true;
            }
        } else if (['negative', 'non-reactive', 'absent', 'not detected', 'normal'].includes(lower)) {
            abnormalFlag = 'NORMAL';
            criticalFlag = false;
        } else {
            abnormalFlag = 'NOT_APPLICABLE';
        }
    } else {
        // Text Parameter
        abnormalFlag = 'NOT_APPLICABLE';
        criticalFlag = false;
    }

    return {
        enteredValue: dataType === 'Numeric' && numericValue != null ? String(numericValue) : String(enteredValue || ''),
        numericValue,
        abnormalFlag,
        criticalFlag,
        referenceRangeText,
        referenceRangeSnapshot
    };
}

module.exports = {
    normalizePatientDemographics,
    findMatchingReferenceRange,
    evaluateParameter
};
