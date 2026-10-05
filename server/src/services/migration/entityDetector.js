/**
 * entityDetector.js — Automatically detect Medical365 entity from filename & headers.
 *
 * Designed for Medical365 HMS Data Migration Phase 1.
 */

const { CANONICAL_SCHEMAS, getSupportedEntities } = require('./canonicalSchema');

// Entity signature keywords with high diagnostic value
const ENTITY_SIGNATURES = {
    Patient: {
        filenameKeywords: ['patient', 'pat', 'client', 'demographic', 'customer'],
        keyHeaders: ['uhid', 'mrn', 'patient_name', 'dob', 'blood_group', 'bloodgroup', 'aadhaar', 'guardian', 'father_name'],
        weight: 1.0
    },
    Doctor: {
        filenameKeywords: ['doctor', 'doc', 'physician', 'consultant', 'faculty'],
        keyHeaders: ['doctor_id', 'doctor_name', 'specialty', 'speciality', 'qualification', 'degree', 'opd_fee'],
        weight: 1.0
    },
    Appointment: {
        filenameKeywords: ['appointment', 'appt', 'booking', 'schedule', 'queue', 'slot'],
        keyHeaders: ['appointment_date', 'token_no', 'token_number', 'appointment_time', 'time_slot', 'doctor_name', 'visit_type'],
        weight: 1.0
    },
    Admission: {
        filenameKeywords: ['admission', 'admit', 'ipd', 'inpatient', 'discharge', 'bed_allocation'],
        keyHeaders: ['admission_date', 'discharge_date', 'bed_no', 'bed_number', 'ward', 'admitting_doctor', 'ip_number'],
        weight: 1.0
    },
    Department: {
        filenameKeywords: ['department', 'dept', 'specialties', 'division'],
        keyHeaders: ['dept_name', 'department_name', 'dept_code', 'department_code'],
        weight: 1.0
    },
    Service: {
        filenameKeywords: ['service', 'procedure', 'tariff', 'investigation_master'],
        keyHeaders: ['service_title', 'service_name', 'procedure_name', 'tariff', 'service_price'],
        weight: 1.0
    },
    Medicine: {
        filenameKeywords: ['medicine', 'drug', 'pharmacy_master', 'formulation'],
        keyHeaders: ['generic_name', 'salt_name', 'medicine_name', 'dosage_form', 'salt'],
        weight: 1.0
    },
    Inventory: {
        filenameKeywords: ['inventory', 'stock', 'store', 'batch', 'warehouse', 'supplies'],
        keyHeaders: ['batch_no', 'batch_number', 'expiry_date', 'exp_date', 'mrp', 'stock', 'buying_price', 'reorder_level'],
        weight: 1.0
    },
    Payment: {
        filenameKeywords: ['payment', 'receipt', 'collection', 'cash', 'transaction'],
        keyHeaders: ['transaction_id', 'tx_id', 'payment_mode', 'paid_amount', 'utr', 'payment_date'],
        weight: 1.0
    },
    Invoice: {
        filenameKeywords: ['invoice', 'bill', 'billing'],
        keyHeaders: ['invoice_no', 'invoice_number', 'bill_no', 'bill_number', 'tax_amount', 'grand_total'],
        weight: 1.0
    },
    Lab: {
        filenameKeywords: ['lab', 'pathology', 'radiology', 'diagnostic', 'test_master'],
        keyHeaders: ['test_code', 'test_name', 'sample_type', 'reference_range', 'test_category'],
        weight: 1.0
    },
    Prescription: {
        filenameKeywords: ['prescription', 'rx', 'medication_order'],
        keyHeaders: ['rx', 'frequency', 'duration', 'instructions', 'medicine_name', 'dosage'],
        weight: 1.0
    }
};

/**
 * Detect the entity represented by a file based on its name and column headers.
 *
 * @param {string} fileName - E.g. "patients_2026.xlsx"
 * @param {string[]} headers - E.g. ["UHID", "Name", "Mobile", "DOB", "BloodGrp"]
 * @returns {{ entity: string, confidence: number, reasoning: string }}
 */
function detectEntity(fileName, headers = []) {
    const cleanFileName = String(fileName || '').toLowerCase();
    const cleanHeaders = (headers || []).map(h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '_'));

    const scores = {};
    const supportedEntities = getSupportedEntities();

    supportedEntities.forEach(entity => {
        scores[entity] = 0;
        const sig = ENTITY_SIGNATURES[entity];
        if (!sig) return;

        // 1. Filename match (+35 points)
        if (sig.filenameKeywords.some(kw => cleanFileName.includes(kw))) {
            scores[entity] += 35;
        }

        // 2. Key signature header matches (+25 points each)
        sig.keyHeaders.forEach(kh => {
            if (cleanHeaders.some(h => h.includes(kh) || kh.includes(h))) {
                scores[entity] += 25;
            }
        });

        // 3. Canonical field / alias matches (+8 points each)
        const canonicalFields = CANONICAL_SCHEMAS[entity] || [];
        canonicalFields.forEach(field => {
            const allTerms = [field.fieldName.toLowerCase(), ...(field.aliases || [])];
            if (cleanHeaders.some(h => allTerms.some(t => h === t || h.includes(t)))) {
                scores[entity] += 8;
            }
        });
    });

    // Find highest score
    let bestEntity = 'Patient';
    let maxScore = -1;

    Object.entries(scores).forEach(([entity, score]) => {
        if (score > maxScore) {
            maxScore = score;
            bestEntity = entity;
        }
    });

    // Calculate normalized confidence (between 0.60 and 0.99)
    let confidence = 0.65;
    if (maxScore >= 120) {
        confidence = 0.98;
    } else if (maxScore >= 80) {
        confidence = 0.93;
    } else if (maxScore >= 50) {
        confidence = 0.86;
    } else if (maxScore >= 30) {
        confidence = 0.76;
    } else {
        confidence = 0.62;
    }

    return {
        entity: bestEntity,
        confidence,
        rawScore: maxScore,
        reasoning: `Matched ${maxScore} points based on column headers and file name against ${bestEntity} signature.`
    };
}

module.exports = {
    detectEntity,
    ENTITY_SIGNATURES
};
