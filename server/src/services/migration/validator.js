/**
 * validator.js — Comprehensive validation engine for staged migration records.
 *
 * Implements strict Medical365 domain validations across categories:
 * - STRUCTURE
 * - TRANSFORMATION
 * - REQUIRED_FIELD
 * - FORMAT
 * - ENUM
 * - RELATIONSHIP
 * - DUPLICATE
 * - BUSINESS_RULE
 * - CUSTOM_FIELD
 *
 * Assigns Record Status:
 * VALID | WARNING | ERROR | DUPLICATE | SKIPPED
 */

const { CANONICAL_SCHEMAS } = require('./canonicalSchema');

const ALLOWED_ENUMS = {
    gender: ['Male', 'Female', 'Other'],
    bloodGroup: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    maritalStatus: ['Single', 'Married', 'Divorced', 'Widowed', 'Other'],
    paymentMode: ['Cash', 'UPI', 'Card', 'NetBanking', 'Cheque', 'Insurance', 'Other'],
    paymentStatus: ['Paid', 'Pending', 'Failed', 'Refunded', 'Cancelled'],
    invoiceStatus: ['Draft', 'Issued', 'Paid', 'Cancelled', 'Overdue'],
    appointmentStatus: ['Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No-Show', 'Pending'],
    admissionStatus: ['Admitted', 'Discharged', 'Transferred', 'Planned']
};

/**
 * Validate a staged record.
 *
 * @param {Object} options
 * @param {String} options.entity
 * @param {Object} options.transformedData
 * @param {Object} options.sourceData
 * @param {Number} options.rowNumber
 * @param {Array} options.transformationIssues
 * @param {Array} options.relationshipIssues
 * @param {Object} options.duplicateInfo
 * @param {Array} options.customFieldConfigs
 *
 * @returns {Object} { status, issues }
 */
function validateRecord({
    entity,
    transformedData = {},
    sourceData = {},
    rowNumber = 1,
    transformationIssues = [],
    relationshipIssues = [],
    duplicateInfo = { matchType: 'NO_MATCH' },
    customFieldConfigs = []
}) {
    const issues = [];

    // 1. Incorporate transformation issues
    for (const tIssue of transformationIssues) {
        issues.push({
            category: tIssue.category || 'TRANSFORMATION',
            severity: tIssue.severity || 'ERROR',
            field: tIssue.field || '',
            message: tIssue.message || 'Transformation failed',
            currentValue: tIssue.currentValue || '',
            suggestedAction: tIssue.suggestedAction || 'Check source value format.'
        });
    }

    // 2. Incorporate relationship issues
    for (const rIssue of relationshipIssues) {
        issues.push({
            category: 'RELATIONSHIP',
            severity: rIssue.severity || 'ERROR',
            field: rIssue.field || '',
            message: rIssue.message,
            currentValue: rIssue.currentValue || '',
            suggestedAction: rIssue.suggestedAction || 'Ensure referenced master record exists.'
        });
    }

    // 3. Required Fields & Canonical Schema checks
    const canonicalFields = CANONICAL_SCHEMAS[entity] || [];
    for (const fieldDef of canonicalFields) {
        const val = transformedData[fieldDef.fieldName];
        const isEmpty = val === undefined || val === null || val === '';

        // Required check
        if (fieldDef.required && isEmpty) {
            // For Patient: check if either name or (firstName + lastName) exists
            if (entity === 'Patient' && fieldDef.fieldName === 'name') {
                const hasFirstLast = transformedData.firstName && transformedData.lastName;
                if (!hasFirstLast) {
                    issues.push({
                        category: 'REQUIRED_FIELD',
                        severity: 'ERROR',
                        field: fieldDef.fieldName,
                        message: `Patient Name is required.`,
                        currentValue: '',
                        suggestedAction: 'Map a source column containing the patient full or first name.'
                    });
                }
            } else {
                issues.push({
                    category: 'REQUIRED_FIELD',
                    severity: 'ERROR',
                    field: fieldDef.fieldName,
                    message: `Required field '${fieldDef.label || fieldDef.fieldName}' is missing.`,
                    currentValue: '',
                    suggestedAction: `Ensure column for '${fieldDef.label}' is populated in source file.`
                });
            }
        }

        // Data type & Format checks if value is present
        if (!isEmpty) {
            // Number format
            if (fieldDef.dataType === 'Number') {
                const num = Number(val);
                if (isNaN(num)) {
                    issues.push({
                        category: 'FORMAT',
                        severity: 'ERROR',
                        field: fieldDef.fieldName,
                        message: `Field '${fieldDef.label}' must be a valid number, got '${val}'.`,
                        currentValue: String(val),
                        suggestedAction: 'Ensure numeric value without letters or special characters.'
                    });
                }
            }

            // Date format check
            if (fieldDef.dataType === 'Date') {
                if (!/^\d{4}-\d{2}-\d{2}/.test(String(val))) {
                    issues.push({
                        category: 'FORMAT',
                        severity: 'ERROR',
                        field: fieldDef.fieldName,
                        message: `Field '${fieldDef.label}' is not a valid ISO date: '${val}'.`,
                        currentValue: String(val),
                        suggestedAction: 'Correct date to DD/MM/YYYY or YYYY-MM-DD.'
                    });
                }
            }
        }
    }

    // 4. Specific Field Validations (Phone, Email, Aadhaar, Enum checks)
    // Phone
    if (transformedData.phone) {
        const cleanPhone = String(transformedData.phone).replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            issues.push({
                category: 'FORMAT',
                severity: 'ERROR',
                field: 'phone',
                message: `Phone number '${transformedData.phone}' must be exactly 10 digits.`,
                currentValue: String(transformedData.phone),
                suggestedAction: 'Correct phone number to standard 10-digit mobile.'
            });
        }
    }

    // Email
    if (transformedData.email) {
        if (!/^\S+@\S+\.\S+$/.test(String(transformedData.email))) {
            issues.push({
                category: 'FORMAT',
                severity: 'ERROR',
                field: 'email',
                message: `Email address '${transformedData.email}' is invalid.`,
                currentValue: String(transformedData.email),
                suggestedAction: 'Fix email domain or address formatting.'
            });
        }
    }

    // Aadhaar
    if (transformedData.aadhaarNumber) {
        const cleanAadhaar = String(transformedData.aadhaarNumber).replace(/\D/g, '');
        if (cleanAadhaar.length !== 12) {
            issues.push({
                category: 'FORMAT',
                severity: 'ERROR',
                field: 'aadhaarNumber',
                message: `Aadhaar number '${transformedData.aadhaarNumber}' must be exactly 12 digits.`,
                currentValue: String(transformedData.aadhaarNumber),
                suggestedAction: 'Verify 12-digit Indian national UID.'
            });
        }
    }

    // PIN code
    if (transformedData.zipCode) {
        const cleanPin = String(transformedData.zipCode).replace(/\D/g, '');
        if (cleanPin.length !== 6) {
            issues.push({
                category: 'FORMAT',
                severity: 'WARNING',
                field: 'zipCode',
                message: `Postal PIN code '${transformedData.zipCode}' is not standard 6-digits.`,
                currentValue: String(transformedData.zipCode),
                suggestedAction: 'Verify 6-digit postal code.'
            });
        }
    }

    // Age bounds check
    if (transformedData.age !== undefined && transformedData.age !== null && transformedData.age !== '') {
        const ageNum = Number(transformedData.age);
        if (isNaN(ageNum) || ageNum < 0 || ageNum > 125) {
            issues.push({
                category: 'BUSINESS_RULE',
                severity: 'WARNING',
                field: 'age',
                message: `Age '${transformedData.age}' is out of normal human range (0-125).`,
                currentValue: String(transformedData.age),
                suggestedAction: 'Verify age in source record.'
            });
        }
    }

    // Enum checks
    if (transformedData.gender && !ALLOWED_ENUMS.gender.includes(transformedData.gender)) {
        issues.push({
            category: 'ENUM',
            severity: 'ERROR',
            field: 'gender',
            message: `Gender '${transformedData.gender}' is invalid. Allowed: ${ALLOWED_ENUMS.gender.join(', ')}`,
            currentValue: String(transformedData.gender),
            suggestedAction: 'Update gender to Male, Female, or Other.'
        });
    }

    if (transformedData.bloodGroup && !ALLOWED_ENUMS.bloodGroup.includes(transformedData.bloodGroup)) {
        issues.push({
            category: 'ENUM',
            severity: 'WARNING',
            field: 'bloodGroup',
            message: `Blood group '${transformedData.bloodGroup}' does not match standard ABO types.`,
            currentValue: String(transformedData.bloodGroup),
            suggestedAction: 'Map to standard A+, B+, AB+, O+, etc.'
        });
    }

    // 5. Financial Data Validations (Payment / Invoice)
    if (entity === 'Payment') {
        const amt = Number(transformedData.amount);
        if (isNaN(amt) || amt <= 0) {
            issues.push({
                category: 'BUSINESS_RULE',
                severity: 'ERROR',
                field: 'amount',
                message: `Payment amount must be greater than zero. Got '${transformedData.amount}'.`,
                currentValue: String(transformedData.amount),
                suggestedAction: 'Verify transaction amount in source file.'
            });
        }

        if (transformedData.paymentMode) {
            const matchesEnum = ALLOWED_ENUMS.paymentMode.some(m => m.toLowerCase() === String(transformedData.paymentMode).toLowerCase());
            if (!matchesEnum) {
                issues.push({
                    category: 'ENUM',
                    severity: 'WARNING',
                    field: 'paymentMode',
                    message: `Payment mode '${transformedData.paymentMode}' is unconventional.`,
                    currentValue: String(transformedData.paymentMode),
                    suggestedAction: `Expected: ${ALLOWED_ENUMS.paymentMode.join(', ')}`
                });
            }
        }
    }

    if (entity === 'Invoice') {
        const total = Number(transformedData.totalAmount);
        if (isNaN(total) || total < 0) {
            issues.push({
                category: 'BUSINESS_RULE',
                severity: 'ERROR',
                field: 'totalAmount',
                message: `Invoice total amount cannot be negative. Got '${transformedData.totalAmount}'.`,
                currentValue: String(transformedData.totalAmount),
                suggestedAction: 'Verify total bill charges in invoice file.'
            });
        }
    }

    // 6. Custom Fields Validation
    for (const cf of customFieldConfigs) {
        if (cf.entity === entity) {
            const cfVal = transformedData[cf.fieldKey];
            if (cfVal !== undefined && cfVal !== null && cfVal !== '') {
                if (cf.dataType === 'Number' && isNaN(Number(cfVal))) {
                    issues.push({
                        category: 'CUSTOM_FIELD',
                        severity: 'WARNING',
                        field: cf.fieldKey,
                        message: `Custom field '${cf.fieldLabel}' expected a Number, got '${cfVal}'.`,
                        currentValue: String(cfVal),
                        suggestedAction: 'Verify custom field values.'
                    });
                }
                if (cf.dataType === 'Date' && !/^\d{4}-\d{2}-\d{2}/.test(String(cfVal))) {
                    issues.push({
                        category: 'CUSTOM_FIELD',
                        severity: 'WARNING',
                        field: cf.fieldKey,
                        message: `Custom field '${cf.fieldLabel}' expected a Date (YYYY-MM-DD), got '${cfVal}'.`,
                        currentValue: String(cfVal),
                        suggestedAction: 'Verify custom field date formatting.'
                    });
                }
            }
        }
    }

    // 7. Duplicate issues
    if (duplicateInfo.matchType === 'EXACT_DUPLICATE') {
        issues.push({
            category: 'DUPLICATE',
            severity: 'WARNING',
            field: (duplicateInfo.matchedFields && duplicateInfo.matchedFields[0]) || 'uhid',
            message: duplicateInfo.matchedRecordSummary || 'Exact duplicate detected with existing hospital record.',
            currentValue: '',
            suggestedAction: 'Select resolution action: [Use Existing] or [Create New] in duplicate review.'
        });
    } else if (duplicateInfo.matchType === 'POSSIBLE_DUPLICATE') {
        issues.push({
            category: 'DUPLICATE',
            severity: 'WARNING',
            field: (duplicateInfo.matchedFields && duplicateInfo.matchedFields[0]) || 'phone',
            message: duplicateInfo.matchedRecordSummary || 'Potential duplicate patient detected with matching phone or email.',
            currentValue: '',
            suggestedAction: 'Review record details before import.'
        });
    }

    // 8. Determine final Record Status
    let status = 'VALID';
    const hasErrors = issues.some(i => i.severity === 'ERROR');
    const hasWarnings = issues.some(i => i.severity === 'WARNING');

    if (hasErrors) {
        status = 'ERROR';
    } else if (duplicateInfo.matchType === 'EXACT_DUPLICATE') {
        status = 'DUPLICATE';
    } else if (hasWarnings) {
        status = 'WARNING';
    } else {
        status = 'VALID';
    }

    return { status, issues };
}

module.exports = {
    validateRecord,
    ALLOWED_ENUMS
};
