/**
 * relationshipResolver.js — Session-scoped identity mapping & relationship resolution.
 *
 * Tracks legacy hospital identifiers and resolves foreign references
 * across staged entities (e.g. Patient:P1001 -> Appointment.patientId).
 *
 * STRICT GUARANTEES:
 * - Scoped strictly to { hospitalId, migrationId }. Never crosses tenants or sessions.
 * - If a referenced record is missing, flags a RELATIONSHIP error.
 * - NEVER invents fake patients, doctors, or foreign keys.
 */

const { getEntityRelationships } = require('./dependencyResolver');

class SessionIdentityRegistry {
    constructor(hospitalId, migrationId) {
        this.hospitalId = String(hospitalId);
        this.migrationId = String(migrationId);

        // Map: entity -> legacyId (lowercase) -> stagingId
        this.legacyMap = new Map();
        // Map: entity -> name (lowercase) -> stagingId
        this.nameMap = new Map();
        // Map: entity -> phone -> stagingId
        this.phoneMap = new Map();
        // Map: entity -> uhid (lowercase) -> stagingId
        this.uhidMap = new Map();

        // Staging ID -> summary info
        this.recordIndex = new Map();
    }

    _getMap(container, entity) {
        if (!container.has(entity)) {
            container.set(entity, new Map());
        }
        return container.get(entity);
    }

    /**
     * Register a staged entity's identities into the session registry.
     */
    register(entity, stagingId, legacyId, transformedData = {}, sourceData = {}) {
        if (!entity || !stagingId) return;

        // 1. Primary legacy ID
        if (legacyId) {
            const cleanId = String(legacyId).trim().toLowerCase();
            this._getMap(this.legacyMap, entity).set(cleanId, stagingId);
        }

        // 2. UHID / MRN
        const uhid = transformedData.uhid || sourceData.uhid || sourceData.UHID || sourceData.mrn || sourceData.MRN;
        if (uhid) {
            const cleanUhid = String(uhid).trim().toLowerCase();
            this._getMap(this.uhidMap, entity).set(cleanUhid, stagingId);
            this._getMap(this.legacyMap, entity).set(cleanUhid, stagingId);
        }

        // 3. Name
        const name = transformedData.name || sourceData.name || sourceData.Name;
        if (name) {
            const cleanName = String(name).trim().toLowerCase();
            this._getMap(this.nameMap, entity).set(cleanName, stagingId);
        }

        // 4. Phone
        const phone = transformedData.phone || sourceData.phone || sourceData.mobile;
        if (phone) {
            const cleanPhone = String(phone).replace(/\D/g, '');
            if (cleanPhone.length >= 10) {
                this._getMap(this.phoneMap, entity).set(cleanPhone.slice(-10), stagingId);
            }
        }

        this.recordIndex.set(stagingId, {
            entity,
            stagingId,
            legacyId: legacyId || '',
            name: name || '',
            uhid: uhid || ''
        });
    }

    /**
     * Look up a target entity's stagingId by reference value.
     */
    resolve(targetEntity, refValue) {
        if (!refValue) return null;
        const val = String(refValue).trim();
        const lower = val.toLowerCase();
        const digits = val.replace(/\D/g, '');

        // 1. Try legacy ID
        const legMap = this._getMap(this.legacyMap, targetEntity);
        if (legMap.has(lower)) {
            return legMap.get(lower);
        }

        // 2. Try UHID
        const uhidMap = this._getMap(this.uhidMap, targetEntity);
        if (uhidMap.has(lower)) {
            return uhidMap.get(lower);
        }

        // 3. Try Phone if numeric and >= 10 digits
        if (digits.length >= 10) {
            const phoneMap = this._getMap(this.phoneMap, targetEntity);
            const last10 = digits.slice(-10);
            if (phoneMap.has(last10)) {
                return phoneMap.get(last10);
            }
        }

        // 4. Try Exact Name
        const nameMap = this._getMap(this.nameMap, targetEntity);
        if (nameMap.has(lower)) {
            return nameMap.get(lower);
        }

        return null;
    }

    /**
     * Resolves foreign references for a single record.
     * Returns { relationships, issues }
     */
    resolveRecord(entity, transformedData = {}, sourceData = {}) {
        const rules = getEntityRelationships(entity);
        const relationships = [];
        const issues = [];

        // Check if patient identity is completely satisfied by at least one field (e.g. UHID or Name)
        const patientRules = rules.filter(r => r.targetEntity === 'Patient');
        let patientResolved = false;

        for (const rule of rules) {
            const { sourceField, targetEntity, required, description } = rule;
            // Check both transformedData and sourceData
            let rawValue = transformedData[sourceField];
            if (rawValue === undefined || rawValue === null || rawValue === '') {
                rawValue = sourceData[sourceField];
            }

            // Also check alternate casing in source data
            if (!rawValue) {
                const keys = Object.keys(sourceData);
                const matchKey = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === sourceField.toLowerCase());
                if (matchKey) {
                    rawValue = sourceData[matchKey];
                }
            }

            const cleanVal = rawValue ? String(rawValue).trim() : '';

            // If empty
            if (!cleanVal) {
                // If it's a Patient rule and another patient rule already resolved the patient, skip
                if (targetEntity === 'Patient' && patientResolved) {
                    continue;
                }
                if (required) {
                    issues.push({
                        category: 'RELATIONSHIP',
                        severity: 'ERROR',
                        field: sourceField,
                        message: `Missing required reference to ${targetEntity} (${description}).`,
                        currentValue: '',
                        suggestedAction: `Provide a valid ${targetEntity} identifier or name in the source file.`
                    });
                }
                continue;
            }

            // Attempt resolution
            const resolvedStagingId = this.resolve(targetEntity, cleanVal);

            if (resolvedStagingId) {
                if (targetEntity === 'Patient') patientResolved = true;
                relationships.push({
                    field: sourceField,
                    targetEntity,
                    legacyId: cleanVal,
                    resolvedStagingId,
                    status: 'RESOLVED',
                    error: ''
                });
            } else {
                // If it's a Patient rule and another patient rule already resolved the patient, don't flag error
                if (targetEntity === 'Patient' && patientResolved) {
                    continue;
                }

                const severity = required ? 'ERROR' : 'WARNING';
                const message = `Referenced ${targetEntity} '${cleanVal}' was not found in source data.`;

                relationships.push({
                    field: sourceField,
                    targetEntity,
                    legacyId: cleanVal,
                    resolvedStagingId: null,
                    status: 'UNRESOLVED',
                    error: message
                });

                issues.push({
                    category: 'RELATIONSHIP',
                    severity,
                    field: sourceField,
                    message,
                    currentValue: cleanVal,
                    suggestedAction: `Ensure ${targetEntity} file is included and contains '${cleanVal}'.`
                });
            }
        }

        return { relationships, issues };
    }
}

// Registry Cache scoped to `${hospitalId}:${migrationId}`
const activeRegistries = new Map();

function getOrCreateRegistry(hospitalId, migrationId) {
    const key = `${hospitalId}:${migrationId}`;
    if (!activeRegistries.has(key)) {
        activeRegistries.set(key, new SessionIdentityRegistry(hospitalId, migrationId));
    }
    return activeRegistries.get(key);
}

function clearRegistry(hospitalId, migrationId) {
    const key = `${hospitalId}:${migrationId}`;
    activeRegistries.delete(key);
}

module.exports = {
    SessionIdentityRegistry,
    getOrCreateRegistry,
    clearRegistry
};
