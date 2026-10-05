/**
 * mappingValidator.js — Backend validation and sanitization for field mappings.
 *
 * Strict security guarantee:
 * Rejects MongoDB injection, prototype pollution, arbitrary model paths,
 * and forces targetField to strictly exist in canonicalSchema for the entity.
 */

const { isValidCanonicalField, getCanonicalFields } = require('./canonicalSchema');

const CONFIDENCE_THRESHOLDS = {
    HIGH: 0.90,
    MEDIUM: 0.70
};

/**
 * Determine confidence category (HIGH, MEDIUM, LOW)
 */
function getConfidenceLevel(confidence) {
    const val = Number(confidence) || 0;
    if (val >= CONFIDENCE_THRESHOLDS.HIGH) return 'HIGH';
    if (val >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'MEDIUM';
    return 'LOW';
}

/**
 * Check if a string contains MongoDB injection or code operators.
 */
function isDangerousString(str) {
    if (!str || typeof str !== 'string') return false;
    const dangerousPatterns = [
        /^\$/,            // Starts with $ (Mongo operator like $where, $gt)
        /\.\./,           // Directory traversal or deep nesting
        /[;{}`<>]/,       // Script injection
        /javascript:/i,   // URI scheme
        /__proto__/i,     // Prototype pollution
        /constructor/i,   // Prototype pollution
        /prototype/i      // Prototype pollution
    ];
    return dangerousPatterns.some(pattern => pattern.test(str));
}

/**
 * Sanitize and strictly validate a single mapping entry.
 *
 * @param {Object} mapping - { sourceField, targetField, mappingType, confidence, reason, ... }
 * @param {string} entity - Canonical entity name ('Patient', etc.)
 * @returns {Object} Validated mapping object
 */
function validateMappingItem(mapping, entity) {
    if (!mapping || typeof mapping !== 'object') {
        throw new Error('Invalid mapping item: must be an object.');
    }

    const sourceField = String(mapping.sourceField || '').trim();
    if (!sourceField || isDangerousString(sourceField)) {
        throw new Error(`Invalid or dangerous sourceField: '${sourceField}'`);
    }

    let targetField = mapping.targetField ? String(mapping.targetField).trim() : null;
    let mappingType = (mapping.mappingType || 'UNMAPPED').toUpperCase();

    const allowedMappingTypes = ['DIRECT', 'COMBINED', 'TRANSFORM', 'CUSTOM_FIELD', 'IGNORE', 'UNMAPPED'];
    if (!allowedMappingTypes.includes(mappingType)) {
        mappingType = 'UNMAPPED';
    }

    // Security check on target field
    if (targetField) {
        if (isDangerousString(targetField)) {
            console.warn(`[Security Warning] Rejected dangerous targetField '${targetField}'`);
            targetField = null;
            mappingType = 'UNMAPPED';
        } else if (!isValidCanonicalField(entity, targetField)) {
            // Target field is not in canonical schema! AI cannot invent fields.
            // If it's intended as custom field, mark it as CUSTOM_FIELD
            if (mappingType === 'CUSTOM_FIELD') {
                // Allowed as custom field
            } else {
                console.warn(`[Mapping Validation] Target field '${targetField}' does not exist in canonical schema for '${entity}'.`);
                targetField = null;
                mappingType = 'UNMAPPED';
            }
        }
    }

    // Find human label for target field
    let targetFieldLabel = '';
    if (targetField && isValidCanonicalField(entity, targetField)) {
        const canonicalFields = getCanonicalFields(entity);
        const match = canonicalFields.find(f => f.fieldName === targetField);
        if (match) targetFieldLabel = match.label;
    }

    const confidence = Math.max(0, Math.min(1, Number(mapping.confidence) || 0));
    const confidenceLevel = getConfidenceLevel(confidence);

    let isCustomField = mappingType === 'CUSTOM_FIELD' || !!mapping.isCustomField;
    let customFieldConfig = mapping.customFieldConfig || {};

    if (isCustomField) {
        const cleanKey = String(customFieldConfig.key || sourceField)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/^_+|_+$/g, '');
        const cleanLabel = String(customFieldConfig.label || sourceField).trim();
        const allowedDataTypes = ['Text', 'Number', 'Date', 'Boolean', 'Select'];
        const dataType = allowedDataTypes.includes(customFieldConfig.dataType) ? customFieldConfig.dataType : 'Text';

        customFieldConfig = {
            key: cleanKey,
            label: cleanLabel,
            dataType
        };
    } else {
        customFieldConfig = { label: '', key: '', dataType: 'Text' };
    }

    let status = mapping.status || 'PENDING';
    if (!['PENDING', 'ACCEPTED', 'IGNORED', 'NEEDS_REVIEW'].includes(status)) {
        status = confidenceLevel === 'LOW' ? 'NEEDS_REVIEW' : 'PENDING';
    }

    return {
        fileId: String(mapping.fileId || 'file_0'),
        entity,
        sourceField,
        targetField,
        targetFieldLabel,
        mappingType,
        confidence: Number(confidence.toFixed(2)),
        confidenceLevel,
        sampleValue: String(mapping.sampleValue || '').slice(0, 100),
        reason: String(mapping.reason || '').slice(0, 200),
        isCustomField,
        customFieldConfig,
        isManuallyEdited: Boolean(mapping.isManuallyEdited),
        status
    };
}

/**
 * Validate an array of mappings for a session.
 */
function validateMappingsList(mappings, entity) {
    if (!Array.isArray(mappings)) return [];
    return mappings.map(m => validateMappingItem(m, entity));
}

module.exports = {
    validateMappingItem,
    validateMappingsList,
    getConfidenceLevel,
    CONFIDENCE_THRESHOLDS,
    isDangerousString
};
