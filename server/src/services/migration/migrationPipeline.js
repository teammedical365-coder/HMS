/**
 * migrationPipeline.js — End-to-end Phase 2 Pipeline Coordinator.
 *
 * Coordinates:
 * 1. Dependency ordering
 * 2. Memory-safe chunked reading
 * 3. Deterministic transformation
 * 4. Relationship resolution
 * 5. Multi-field duplicate detection
 * 6. Multi-category domain validation
 * 7. Staging record persistence
 * 8. Preview summary computation
 *
 * CRITICAL SAFETY GUARANTEE:
 * Does NOT write any hospital records to production collections (User, Doctor, Appointment, etc.).
 * All output is isolated to MigrationRecord staging collection and MigrationSession.
 */

const { sortFilesByDependency } = require('./dependencyResolver');
const { getOrCreateRegistry, clearRegistry } = require('./relationshipResolver');
const { DuplicateDetector } = require('./duplicateDetector');
const { validateRecord } = require('./validator');
const { transformRecord } = require('./transformer');
const { readSourceDataChunked } = require('./sourceDataReader');

/**
 * Executes the complete Phase 2 preparation, transformation, resolution, and validation pipeline.
 *
 * @param {Object} params
 * @param {String|ObjectId} params.hospitalId
 * @param {String} params.migrationId
 * @param {Object} params.models - Tenant models (MigrationSession, MigrationRecord, User, Doctor, etc.)
 * @param {Object} params.user - Authenticated user details
 */
async function runMigrationPipeline({ hospitalId, migrationId, models, user }) {
    const { MigrationSession, MigrationRecord } = models;

    // 1. Fetch Migration Session
    const session = await MigrationSession.findOne({ hospitalId, migrationId });
    if (!session) {
        throw new Error(`Migration session '${migrationId}' was not found.`);
    }

    const allowableStatuses = [
        'APPROVED', 'PREPARING', 'TRANSFORMING', 'VALIDATING',
        'PREVIEW_READY', 'REVIEW_REQUIRED', 'READY_FOR_IMPORT', 'FAILED'
    ];
    if (!allowableStatuses.includes(session.status)) {
        throw new Error(`Cannot run preparation on session with status '${session.status}'. Mappings must be APPROVED first.`);
    }

    // 2. Set Status: PREPARING
    session.status = 'PREPARING';
    await session.save();

    // Clean up any previously staged records for this session
    await MigrationRecord.deleteMany({ hospitalId, migrationId });

    // Initialize session identity registry
    clearRegistry(hospitalId, migrationId);
    const registry = getOrCreateRegistry(hospitalId, migrationId);

    // 3. Set Status: TRANSFORMING
    session.status = 'TRANSFORMING';
    await session.save();

    // Sort files by dependency order (Departments & Masters first, Transactions last)
    const sortedFiles = sortFilesByDependency(session.files || []);

    // PASS 1: Read, Transform, Register Identity, and Stage
    let globalRowIndex = 0;
    const recordsToInsert = [];
    const BATCH_SIZE = 500;

    for (let fileIdx = 0; fileIdx < sortedFiles.length; fileIdx++) {
        const fileMeta = sortedFiles[fileIdx];
        const entity = fileMeta.detectedEntity || 'Unknown';

        // Filter mappings relevant to this file or entity
        const fileMappings = (session.mappings || []).filter(
            m => m.fileId === fileMeta.fileId || (m.entity === entity && m.targetField)
        );

        let fileRowNumber = 0;

        for await (const chunk of readSourceDataChunked(fileMeta, BATCH_SIZE)) {
            for (const row of chunk) {
                fileRowNumber++;
                globalRowIndex++;

                const stagingId = `STG-${entity.toUpperCase().slice(0, 3)}-${fileIdx + 1}-${fileRowNumber}`;

                // Deterministic Transformation
                const { transformedData, issues: transIssues, legacyId } = transformRecord(
                    row,
                    fileMappings,
                    session.customFields || []
                );

                // Register identities in session registry
                registry.register(entity, stagingId, legacyId, transformedData, row);

                // Temporary staging object
                recordsToInsert.push({
                    migrationId,
                    hospitalId,
                    sourceFileId: fileMeta.fileId,
                    entity,
                    rowNumber: fileRowNumber,
                    stagingId,
                    legacyId: legacyId || '',
                    sourceData: row,
                    transformedData,
                    status: 'VALID', // placeholder, computed in Pass 2
                    issues: transIssues.map(ti => ({
                        category: ti.category || 'TRANSFORMATION',
                        severity: ti.severity || 'ERROR',
                        field: ti.field || '',
                        message: ti.message || 'Transformation error',
                        currentValue: ti.currentValue || '',
                        suggestedAction: ti.suggestedAction || 'Check source format.'
                    })),
                    relationships: [],
                    duplicateInfo: { matchType: 'NO_MATCH', resolution: 'PENDING' }
                });

                if (recordsToInsert.length >= BATCH_SIZE) {
                    await MigrationRecord.insertMany(recordsToInsert);
                    recordsToInsert.length = 0;
                }
            }
        }
    }

    if (recordsToInsert.length > 0) {
        await MigrationRecord.insertMany(recordsToInsert);
        recordsToInsert.length = 0;
    }

    // 4. Set Status: VALIDATING
    session.status = 'VALIDATING';
    await session.save();

    const duplicateDetector = new DuplicateDetector(hospitalId, migrationId);

    // PASS 2: Relationship Resolution, Duplicate Detection & Validation
    const totalStaged = await MigrationRecord.countDocuments({ hospitalId, migrationId });
    let processed = 0;

    while (processed < totalStaged) {
        const batch = await MigrationRecord.find({ hospitalId, migrationId })
            .sort({ _id: 1 })
            .skip(processed)
            .limit(BATCH_SIZE);

        if (!batch || batch.length === 0) break;

        const bulkOps = [];

        for (const record of batch) {
            // 1. Resolve relationships
            const { relationships, issues: relIssues } = registry.resolveRecord(
                record.entity,
                record.transformedData,
                record.sourceData
            );

            // 2. Duplicate detection
            const duplicateInfo = await duplicateDetector.detectDuplicate(
                record.entity,
                record.transformedData,
                record.stagingId,
                models
            );

            // 3. Comprehensive Domain Validation
            const { status, issues: finalIssues } = validateRecord({
                entity: record.entity,
                transformedData: record.transformedData,
                sourceData: record.sourceData,
                rowNumber: record.rowNumber,
                transformationIssues: record.issues || [],
                relationshipIssues: relIssues,
                duplicateInfo,
                customFieldConfigs: session.customFields || []
            });

            bulkOps.push({
                updateOne: {
                    filter: { _id: record._id },
                    update: {
                        $set: {
                            status,
                            relationships,
                            duplicateInfo,
                            issues: finalIssues
                        }
                    }
                }
            });
        }

        if (bulkOps.length > 0) {
            await MigrationRecord.bulkWrite(bulkOps);
        }

        processed += batch.length;
    }

    // PASS 3: Compute Preview Summary
    const breakdownAgg = await MigrationRecord.aggregate([
        { $match: { hospitalId, migrationId } },
        {
            $group: {
                _id: { entity: '$entity', status: '$status' },
                count: { $sum: 1 }
            }
        }
    ]);

    const entitySummaryMap = {};
    let totalValid = 0;
    let totalWarnings = 0;
    let totalErrors = 0;
    let totalDuplicates = 0;
    let totalSkipped = 0;

    for (const item of breakdownAgg) {
        const entity = item._id.entity;
        const status = item._id.status;
        const count = item.count;

        if (!entitySummaryMap[entity]) {
            entitySummaryMap[entity] = {
                entity,
                totalRecords: 0,
                valid: 0,
                warnings: 0,
                errors: 0,
                duplicates: 0,
                skipped: 0
            };
        }

        entitySummaryMap[entity].totalRecords += count;

        if (status === 'VALID') {
            entitySummaryMap[entity].valid += count;
            totalValid += count;
        } else if (status === 'WARNING') {
            entitySummaryMap[entity].warnings += count;
            totalWarnings += count;
        } else if (status === 'ERROR') {
            entitySummaryMap[entity].errors += count;
            totalErrors += count;
        } else if (status === 'DUPLICATE') {
            entitySummaryMap[entity].duplicates += count;
            totalDuplicates += count;
        } else if (status === 'SKIPPED') {
            entitySummaryMap[entity].skipped += count;
            totalSkipped += count;
        }
    }

    // Relationship stats
    const relAgg = await MigrationRecord.aggregate([
        { $match: { hospitalId, migrationId, 'relationships.0': { $exists: true } } },
        { $unwind: '$relationships' },
        {
            $group: {
                _id: '$relationships.status',
                count: { $sum: 1 }
            }
        }
    ]);

    let resolvedRefs = 0;
    let brokenRefs = 0;
    let totalRefs = 0;

    for (const r of relAgg) {
        totalRefs += r.count;
        if (r._id === 'RESOLVED') resolvedRefs += r.count;
        if (r._id === 'UNRESOLVED') brokenRefs += r.count;
    }

    const entitiesBreakdown = Object.values(entitySummaryMap);
    const totalRecords = totalStaged;

    session.previewSummary = {
        totalRecords,
        validRecords: totalValid,
        warningRecords: totalWarnings,
        errorRecords: totalErrors,
        duplicateRecords: totalDuplicates,
        skippedRecords: totalSkipped,
        entitiesBreakdown,
        relationshipsSummary: {
            totalReferences: totalRefs,
            resolvedReferences: resolvedRefs,
            brokenReferences: brokenRefs
        },
        processedAt: new Date()
    };

    // Determine final session status
    if (totalErrors > 0 || totalDuplicates > 0) {
        session.status = 'REVIEW_REQUIRED';
    } else {
        session.status = 'PREVIEW_READY';
    }

    await session.save();

    return {
        success: true,
        previewSummary: session.previewSummary,
        status: session.status
    };
}

module.exports = {
    runMigrationPipeline
};
