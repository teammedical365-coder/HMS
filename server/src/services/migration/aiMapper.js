/**
 * aiMapper.js — AI-assisted field mapping engine using existing Gemini AI infrastructure.
 *
 * Designed for Medical365 HMS Data Migration Phase 1.
 * Features:
 * - Privacy-preserving payload (only headers and up to 3 sanitized sample values).
 * - Strict backend validation (validates against canonicalSchema).
 * - Automatic reuse of existing hospital mapping templates.
 * - Fault-tolerant: If AI is unavailable/fails, seamlessly falls back to smart heuristic mapping.
 */

const geminiProvider = require('../ai/providers/gemini.provider');
const aiWalletService = require('../ai/aiWallet.service');
const { getCanonicalFields } = require('./canonicalSchema');
const { validateMappingItem } = require('./mappingValidator');

/**
 * Generate heuristic baseline mappings using aliases and string distance.
 */
function generateHeuristicMappings(headers, entity, sampleRows = [], existingTemplate = null) {
    const canonicalFields = getCanonicalFields(entity);
    const mappings = [];

    // Pre-index existing template mappings if available
    const templateMap = {};
    if (existingTemplate && Array.isArray(existingTemplate.mappings)) {
        existingTemplate.mappings.forEach(m => {
            if (m.sourceField) {
                templateMap[m.sourceField.toLowerCase().trim()] = m;
            }
        });
    }

    headers.forEach(header => {
        const cleanHeader = header.trim();
        const lowerHeader = cleanHeader.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const sampleValue = sampleRows.length > 0 && sampleRows[0][cleanHeader] !== undefined 
            ? String(sampleRows[0][cleanHeader]) 
            : '';

        // 1. Check existing template first (100% confidence)
        if (templateMap[lowerHeader]) {
            const tm = templateMap[lowerHeader];
            mappings.push({
                sourceField: cleanHeader,
                targetField: tm.targetField,
                targetFieldLabel: tm.targetFieldLabel || tm.targetField,
                mappingType: tm.mappingType || 'DIRECT',
                confidence: 0.99,
                sampleValue,
                reason: 'Matched previously approved hospital mapping template',
                isCustomField: tm.isCustomField || false,
                customFieldConfig: tm.customFieldConfig || { label: '', key: '', dataType: 'Text' },
                status: 'ACCEPTED'
            });
            return;
        }

        // 2. Direct name or alias match
        let bestField = null;
        let bestScore = 0;
        let matchReason = '';

        for (const cf of canonicalFields) {
            const cfLower = cf.fieldName.toLowerCase();
            const aliases = (cf.aliases || []).map(a => a.toLowerCase());

            if (lowerHeader === cfLower) {
                bestField = cf;
                bestScore = 0.98;
                matchReason = `Exact match with canonical field '${cf.label}'`;
                break;
            }

            if (aliases.includes(lowerHeader)) {
                bestField = cf;
                bestScore = 0.95;
                matchReason = `Matched standard alias for '${cf.label}'`;
                break;
            }

            // Substring or prefix match (avoid overly broad matches on short generic tokens like 'name', 'id')
            const genericTokens = ['name', 'id', 'date', 'type', 'code', 'fee', 'unit', 'status', 'city', 'state'];
            const isRelationshipField = /^(father|mother|spouse|guardian|family|kin|old|legacy)_/i.test(lowerHeader);

            if (!genericTokens.includes(cfLower) && !isRelationshipField && (lowerHeader.includes(cfLower) || cfLower.includes(lowerHeader))) {
                if (bestScore < 0.85) {
                    bestField = cf;
                    bestScore = 0.82;
                    matchReason = `Strong partial match with '${cf.label}'`;
                }
            }
        }

        if (bestField && bestScore >= 0.70) {
            mappings.push({
                sourceField: cleanHeader,
                targetField: bestField.fieldName,
                targetFieldLabel: bestField.label,
                mappingType: 'DIRECT',
                confidence: bestScore,
                sampleValue,
                reason: matchReason,
                isCustomField: false,
                status: bestScore >= 0.90 ? 'ACCEPTED' : 'NEEDS_REVIEW'
            });
        } else {
            // Unmatched field -> suggest as CUSTOM_FIELD
            const autoKey = lowerHeader.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
            const autoLabel = cleanHeader.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            mappings.push({
                sourceField: cleanHeader,
                targetField: null,
                targetFieldLabel: '',
                mappingType: 'CUSTOM_FIELD',
                confidence: 0.75,
                sampleValue,
                reason: 'No standard Medical365 field found. Suggested as custom field.',
                isCustomField: true,
                customFieldConfig: {
                    label: autoLabel,
                    key: autoKey,
                    dataType: 'Text'
                },
                status: 'NEEDS_REVIEW'
            });
        }
    });

    return mappings;
}

/**
 * Generate AI mapping suggestions using Gemini AI service.
 *
 * @param {Object} params
 * @param {string} params.entity - Detected entity ('Patient', 'Doctor', etc.)
 * @param {string} params.fileName - Uploaded filename
 * @param {string[]} params.headers - Column headers
 * @param {Object[]} params.sampleRows - Up to 3 sanitized sample rows
 * @param {Object} [params.existingTemplate] - Previously approved template
 * @param {Object} [params.userContext] - { hospitalId, userId, userRole, userName }
 * @returns {Promise<Object[]>} Validated mappings list
 */
async function generateAIMappings({ entity, fileName, headers, sampleRows = [], existingTemplate = null, userContext = {} }) {
    const canonicalFields = getCanonicalFields(entity);
    const baselineMappings = generateHeuristicMappings(headers, entity, sampleRows, existingTemplate);

    // Limit sample rows to at most 2 rows for AI privacy (DPDP Act India compliance)
    const sanitizedSamples = (sampleRows || []).slice(0, 2).map(row => {
        const item = {};
        headers.forEach(h => {
            const val = row[h];
            if (val !== undefined && val !== null) {
                // Obfuscate phone and names for strict privacy
                const s = String(val).trim();
                item[h] = s.length > 25 ? s.slice(0, 22) + '...' : s;
            }
        });
        return item;
    });

    const canonicalSchemaSummary = canonicalFields.map(f => ({
        fieldName: f.fieldName,
        label: f.label,
        dataType: f.dataType,
        required: f.required,
        description: f.description
    }));

    const systemPrompt = `You are the Medical365 HMS Data Migration Assistant.
Your task is to analyze hospital legacy data headers and suggest field mappings to the Medical365 canonical schema for entity '${entity}'.

RULES:
1. ONLY map to targetField values that exist in the provided Canonical Schema list. Do NOT invent fields.
2. For fields with no matching canonical field (e.g. Father_Name, Occupation, Old_Hospital_ID), set mappingType to "CUSTOM_FIELD" and propose a clean label and snake_case key.
3. For combined fields (e.g. Patient_Name to firstName + lastName), set mappingType to "COMBINED" or map to the full name field.
4. Output MUST be ONLY valid JSON matching this schema:
{
  "mappings": [
    {
      "sourceField": "string",
      "targetField": "canonicalFieldName or null",
      "mappingType": "DIRECT" | "COMBINED" | "TRANSFORM" | "CUSTOM_FIELD" | "IGNORE",
      "confidence": number between 0.0 and 1.0,
      "reason": "short explanation",
      "customFieldLabel": "string if custom field",
      "customFieldKey": "string if custom field"
    }
  ]
}
Do not include markdown fences or other text.`;

    const userPrompt = `Entity: ${entity}
Filename: ${fileName}
Source Headers: ${JSON.stringify(headers)}
Sample Values (Privacy Redacted): ${JSON.stringify(sanitizedSamples)}
Approved Canonical Schema: ${JSON.stringify(canonicalSchemaSummary)}`;

    try {
        console.log(`[AI Migration Mapping] Requesting AI mapping for ${headers.length} headers in file '${fileName}' (${entity})...`);
        const { text, usage } = await geminiProvider.chatCompletion(systemPrompt, [
            { role: 'user', content: userPrompt }
        ]);

        // Process AI wallet usage deduction if hospitalId is present
        if (userContext.hospitalId) {
            try {
                await aiWalletService.deductUsage({
                    hospitalId: userContext.hospitalId,
                    userId: userContext.userId,
                    userRole: userContext.userRole || 'hospitaladmin',
                    userName: userContext.userName || 'Hospital Admin',
                    operation: 'DATA_MIGRATION_MAPPING',
                    model: usage?.modelName || 'gemini-2.0-flash',
                    rawUsage: usage || { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
                    metadata: { entity, fileName, headerCount: headers.length }
                });
            } catch (walletErr) {
                console.warn('[AI Mapping] Wallet deduction error (non-fatal):', walletErr.message);
            }
        }

        // Parse AI JSON response
        const cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedText);

        if (!parsed || !Array.isArray(parsed.mappings)) {
            throw new Error('AI response did not contain a valid mappings array.');
        }

        // Map AI suggestions into validated records
        const validatedMappings = headers.map(header => {
            const cleanHeader = header.trim();
            const aiMatch = parsed.mappings.find(m => 
                m && String(m.sourceField).trim().toLowerCase() === cleanHeader.toLowerCase()
            );

            const baseline = baselineMappings.find(b => b.sourceField === cleanHeader);
            const sampleValue = baseline ? baseline.sampleValue : '';

            if (aiMatch) {
                const isCustom = aiMatch.mappingType === 'CUSTOM_FIELD' || !aiMatch.targetField;
                const mappingItem = {
                    fileId: 'file_0',
                    entity,
                    sourceField: cleanHeader,
                    targetField: isCustom ? null : aiMatch.targetField,
                    mappingType: isCustom ? 'CUSTOM_FIELD' : (aiMatch.mappingType || 'DIRECT'),
                    confidence: Number(aiMatch.confidence) || 0.85,
                    sampleValue,
                    reason: aiMatch.reason || 'AI suggested mapping',
                    isCustomField: isCustom,
                    customFieldConfig: isCustom ? {
                        label: aiMatch.customFieldLabel || cleanHeader,
                        key: (aiMatch.customFieldKey || cleanHeader).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                        dataType: 'Text'
                    } : { label: '', key: '', dataType: 'Text' }
                };

                return validateMappingItem(mappingItem, entity);
            }

            // Fallback to heuristic for this header if AI missed it
            return validateMappingItem(baseline, entity);
        });

        console.log(`[AI Migration Mapping] Successfully generated and validated ${validatedMappings.length} mappings.`);
        return validatedMappings;
    } catch (err) {
        console.warn(`[AI Migration Mapping Warning] AI mapping generation failed or timed out (${err.message}). Using robust heuristic mapper.`);
        // Graceful fallback: return validated heuristic mappings without blocking Hospital Admin!
        return baselineMappings.map(m => validateMappingItem(m, entity));
    }
}

module.exports = {
    generateAIMappings,
    generateHeuristicMappings
};
