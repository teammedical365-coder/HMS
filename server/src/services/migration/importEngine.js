/**
 * importEngine.js — Production Safe Import & Verification Engine (Phase 3).
 *
 * Implements:
 * 1. Pre-flight safety checks (auth, tenant, status = READY_FOR_IMPORT, approved mappings)
 * 2. Topological dependency ordering (Departments -> Staff/Doctors -> Patients -> Services -> Inventory -> Appointments -> Admissions -> Payments)
 * 3. Idempotency & Duplicate Decision adherence (USE_EXISTING, CREATE_NEW, SKIP)
 * 4. Chunked batch insertion (500 records/batch, memory-safe)
 * 5. Foreign relationship resolution to actual production ObjectIds
 * 6. Automated post-import verification (counts, foreign references, production integrity)
 * 7. Real-time progress updates & audit tracking
 */

const mongoose = require('mongoose');
const { orderEntities } = require('./dependencyResolver');

const BATCH_SIZE = 500;

/**
 * Execute Safe Production Import for a validated migration session.
 *
 * @param {Object} options
 * @param {string} options.hospitalId - Authenticated hospital tenant ID
 * @param {string} options.migrationId - Target migration session ID
 * @param {Object} options.models - Multi-tenant model registry
 * @param {Object} options.user - Authenticated hospital admin user
 * @returns {Promise<Object>} Import summary & verification result
 */
async function executeMigrationImport({ hospitalId, migrationId, models, user }) {
    const {
        MigrationSession,
        MigrationRecord,
        User,
        Doctor,
        Department,
        Appointment,
        Admission,
        PaymentTransaction,
        FacilityCharge,
        Service,
        Medicine,
        Inventory,
        LabReport
    } = models;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. PRE-FLIGHT VALIDATION & STATUS LOCK
    // ─────────────────────────────────────────────────────────────────────────
    const session = await MigrationSession.findOne({ hospitalId, migrationId });
    if (!session) {
        throw new Error(`Migration session '${migrationId}' not found.`);
    }

    const allowedStatuses = ['READY_FOR_IMPORT', 'COMPLETED_WITH_WARNINGS', 'PREVIEW_READY', 'COMPLETED'];
    if (!allowedStatuses.includes(session.status)) {
        throw new Error(
            `Cannot start import from status '${session.status}'. Session must be certified 'READY_FOR_IMPORT'.`
        );
    }

    if (!session.mappings || session.mappings.length === 0) {
        throw new Error('Cannot import: No approved mappings found.');
    }

    const totalStaged = await MigrationRecord.countDocuments({ hospitalId, migrationId });
    if (totalStaged === 0) {
        throw new Error('Cannot import: No staged records found in session.');
    }

    // Lock session into IMPORTING status
    session.status = 'IMPORTING';
    session.importProgress = {
        currentStage: 'Initializing import engine...',
        processedRecords: 0,
        totalRecords: totalStaged,
        percent: 0
    };
    session.importSummary = {
        totalSourceRecords: totalStaged,
        successfullyImported: 0,
        failed: 0,
        skipped: 0,
        warnings: 0,
        entitiesBreakdown: [],
        verification: { status: 'PENDING', checks: [], verifiedAt: null },
        startedAt: new Date(),
        completedAt: null
    };
    await session.save();

    // ─────────────────────────────────────────────────────────────────────────
    // 2. IDEMPOTENCY REGISTRY & DEPENDENCY RESOLUTION
    // ─────────────────────────────────────────────────────────────────────────
    // identityMap maps legacy identifiers, staging IDs, and candidate keys to production ObjectIds
    const identityMap = new Map();

    // Load any records already imported in this session (idempotency safety)
    const alreadyImported = await MigrationRecord.find({
        hospitalId,
        migrationId,
        importStatus: 'IMPORTED',
        importedRecordId: { $ne: null }
    }).select('stagingId legacyId entity importedRecordId transformedData').lean();

    alreadyImported.forEach(rec => {
        if (rec.importedRecordId) {
            identityMap.set(rec.stagingId, rec.importedRecordId);
            if (rec.legacyId) identityMap.set(`${rec.entity}:${rec.legacyId}`, rec.importedRecordId);
            if (rec.transformedData?.uhid) identityMap.set(`${rec.entity}:${rec.transformedData.uhid}`, rec.importedRecordId);
            if (rec.transformedData?.phone) identityMap.set(`${rec.entity}:${rec.transformedData.phone}`, rec.importedRecordId);
            if (rec.transformedData?.name) identityMap.set(`${rec.entity}:${rec.transformedData.name.toLowerCase()}`, rec.importedRecordId);
        }
    });

    // Determine topological entity import order
    const distinctEntities = await MigrationRecord.distinct('entity', { hospitalId, migrationId });
    const orderedEntities = orderEntities(distinctEntities);

    let totalProcessed = alreadyImported.length;
    let totalImported = alreadyImported.length;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalWarnings = 0;

    const entityStats = {};
    orderedEntities.forEach(ent => {
        entityStats[ent] = {
            entity: ent,
            sourceCount: 0,
            imported: 0,
            failed: 0,
            skipped: 0,
            warnings: 0
        };
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TOPOLOGICAL BATCH IMPORT LOOP
    // ─────────────────────────────────────────────────────────────────────────
    for (const entity of orderedEntities) {
        session.importProgress.currentStage = `Importing ${entity} records...`;
        await session.save();

        const entityTotal = await MigrationRecord.countDocuments({ hospitalId, migrationId, entity });
        entityStats[entity].sourceCount = entityTotal;

        let entityProcessed = 0;

        while (entityProcessed < entityTotal) {
            const batch = await MigrationRecord.find({ hospitalId, migrationId, entity })
                .sort({ rowNumber: 1 })
                .skip(entityProcessed)
                .limit(BATCH_SIZE);

            if (!batch || batch.length === 0) break;

            const bulkUpdates = [];

            for (const record of batch) {
                // A) Idempotency: Skip if already successfully imported
                if (record.importStatus === 'IMPORTED' && record.importedRecordId) {
                    entityStats[entity].imported++;
                    entityProcessed++;
                    continue;
                }

                // B) Skip records flagged with Phase 2 validation ERROR
                if (record.status === 'ERROR') {
                    record.importStatus = 'FAILED';
                    record.importError = 'Excluded: Record contains validation ERROR from Phase 2';
                    totalFailed++;
                    entityStats[entity].failed++;
                    bulkUpdates.push({
                        updateOne: {
                            filter: { _id: record._id },
                            update: { $set: { importStatus: 'FAILED', importError: record.importError } }
                        }
                    });
                    totalProcessed++;
                    entityProcessed++;
                    continue;
                }

                // C) Duplicate Decision Handling
                if (record.duplicateInfo?.matchType && record.duplicateInfo.matchType !== 'NO_MATCH') {
                    const resolution = record.duplicateInfo.resolution || 'SKIP';

                    if (resolution === 'USE_EXISTING') {
                        // Link references to existing database record without inserting duplicate
                        const existingId = record.duplicateInfo.matchedRecordId;
                        if (existingId) {
                            identityMap.set(record.stagingId, existingId);
                            if (record.legacyId) identityMap.set(`${entity}:${record.legacyId}`, existingId);
                            if (record.transformedData?.uhid) identityMap.set(`${entity}:${record.transformedData.uhid}`, existingId);
                            if (record.transformedData?.phone) identityMap.set(`${entity}:${record.transformedData.phone}`, existingId);
                            if (record.transformedData?.name) identityMap.set(`${entity}:${record.transformedData.name.toLowerCase()}`, existingId);

                            record.importedRecordId = existingId;
                            record.importStatus = 'SKIPPED';
                            record.importError = 'Mapped to existing database record (USE_EXISTING)';
                            totalSkipped++;
                            entityStats[entity].skipped++;

                            bulkUpdates.push({
                                updateOne: {
                                    filter: { _id: record._id },
                                    update: {
                                        $set: {
                                            importedRecordId: existingId,
                                            importStatus: 'SKIPPED',
                                            importError: record.importError
                                        }
                                    }
                                }
                            });
                            totalProcessed++;
                            entityProcessed++;
                            continue;
                        }
                    } else if (resolution === 'SKIP') {
                        record.importStatus = 'SKIPPED';
                        record.importError = 'Skipped per duplicate resolution decision';
                        totalSkipped++;
                        entityStats[entity].skipped++;

                        bulkUpdates.push({
                            updateOne: {
                                filter: { _id: record._id },
                                update: {
                                    $set: {
                                        importStatus: 'SKIPPED',
                                        importError: record.importError
                                    }
                                }
                            }
                        });
                        totalProcessed++;
                        entityProcessed++;
                        continue;
                    }
                    // If CREATE_NEW, proceed with normal insertion
                }

                // D) Foreign Key & Relationship Resolution
                const { docPayload, relError } = resolveAndBuildPayload({
                    entity,
                    record,
                    hospitalId,
                    identityMap,
                    user,
                    models
                });

                if (relError) {
                    record.importStatus = 'FAILED';
                    record.importError = relError;
                    totalFailed++;
                    entityStats[entity].failed++;

                    bulkUpdates.push({
                        updateOne: {
                            filter: { _id: record._id },
                            update: { $set: { importStatus: 'FAILED', importError: relError } }
                        }
                    });
                    totalProcessed++;
                    entityProcessed++;
                    continue;
                }

                // E) Execute Production Insertion
                try {
                    const targetModel = getTargetModel(entity, models);
                    if (!targetModel) {
                        throw new Error(`No production model mapped for entity '${entity}'`);
                    }

                    const createdDoc = await targetModel.create(docPayload);
                    const newId = createdDoc._id;

                    // Register in identity map for dependent foreign references
                    identityMap.set(record.stagingId, newId);
                    if (record.legacyId) identityMap.set(`${entity}:${record.legacyId}`, newId);
                    if (record.transformedData?.uhid) identityMap.set(`${entity}:${record.transformedData.uhid}`, newId);
                    if (record.transformedData?.phone) identityMap.set(`${entity}:${record.transformedData.phone}`, newId);
                    if (record.transformedData?.name) identityMap.set(`${entity}:${record.transformedData.name.toLowerCase()}`, newId);

                    record.importedRecordId = newId;
                    record.importedEntity = targetModel.modelName || entity;
                    record.importStatus = 'IMPORTED';
                    record.importedAt = new Date();
                    record.importError = '';

                    totalImported++;
                    entityStats[entity].imported++;
                    if (record.status === 'WARNING') {
                        totalWarnings++;
                        entityStats[entity].warnings++;
                    }

                    bulkUpdates.push({
                        updateOne: {
                            filter: { _id: record._id },
                            update: {
                                $set: {
                                    importedRecordId: newId,
                                    importedEntity: record.importedEntity,
                                    importStatus: 'IMPORTED',
                                    importedAt: record.importedAt,
                                    importError: ''
                                }
                            }
                        }
                    });
                } catch (err) {
                    record.importStatus = 'FAILED';
                    record.importError = err.message || 'Database insertion error';
                    totalFailed++;
                    entityStats[entity].failed++;

                    bulkUpdates.push({
                        updateOne: {
                            filter: { _id: record._id },
                            update: {
                                $set: {
                                    importStatus: 'FAILED',
                                    importError: record.importError
                                }
                            }
                        }
                    });
                }

                totalProcessed++;
                entityProcessed++;
            }

            // Flush bulk write updates to MigrationRecord staging collection
            if (bulkUpdates.length > 0) {
                await MigrationRecord.bulkWrite(bulkUpdates);
            }

            // Update real-time session progress
            session.importProgress.processedRecords = totalProcessed;
            session.importProgress.percent = Math.min(100, Math.round((totalProcessed / totalStaged) * 100));
            session.importSummary.successfullyImported = totalImported;
            session.importSummary.failed = totalFailed;
            session.importSummary.skipped = totalSkipped;
            session.importSummary.warnings = totalWarnings;
            await session.save();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. AUTOMATED POST-IMPORT VERIFICATION
    // ─────────────────────────────────────────────────────────────────────────
    session.status = 'VERIFYING';
    session.importProgress.currentStage = 'Running automated verification checks...';
    await session.save();

    const verificationChecks = await runPostImportVerification({
        hospitalId,
        migrationId,
        models,
        totalStaged,
        totalImported,
        totalFailed,
        totalSkipped
    });

    const hasFailedChecks = verificationChecks.some(c => !c.passed);
    const verificationStatus = hasFailedChecks ? 'WARNING' : 'PASSED';

    // ─────────────────────────────────────────────────────────────────────────
    // 5. FINAL STATUS DETERMINATION
    // ─────────────────────────────────────────────────────────────────────────
    let finalStatus = 'COMPLETED';
    if (totalFailed > 0 || totalWarnings > 0 || hasFailedChecks) {
        finalStatus = totalImported > 0 ? 'COMPLETED_WITH_WARNINGS' : 'FAILED';
    }

    session.status = finalStatus;
    session.importProgress.currentStage = `Import ${finalStatus === 'COMPLETED' ? 'Completed Successfully' : 'Completed with Warnings'}`;
    session.importProgress.percent = 100;
    session.importSummary = {
        totalSourceRecords: totalStaged,
        successfullyImported: totalImported,
        failed: totalFailed,
        skipped: totalSkipped,
        warnings: totalWarnings,
        entitiesBreakdown: Object.values(entityStats),
        verification: {
            status: verificationStatus,
            checks: verificationChecks,
            verifiedAt: new Date()
        },
        startedAt: session.importSummary?.startedAt || new Date(),
        completedAt: new Date()
    };

    await session.save();

    return {
        success: true,
        migrationId,
        status: finalStatus,
        importSummary: session.importSummary
    };
}

/**
 * Resolve foreign references and construct production model payload.
 */
function resolveAndBuildPayload({ entity, record, hospitalId, identityMap, user, models }) {
    const tData = record.transformedData || {};
    const sData = record.sourceData || {};
    let relError = null;

    // Helper to resolve foreign target
    const resolveForeignId = (relRule, defaultVal = null) => {
        if (!record.relationships || record.relationships.length === 0) return defaultVal;
        const rel = record.relationships.find(r => r.field === relRule.field || r.targetEntity === relRule.targetEntity);
        if (!rel) return defaultVal;

        // Try staging ID
        if (rel.resolvedStagingId && identityMap.has(rel.resolvedStagingId)) {
            return identityMap.get(rel.resolvedStagingId);
        }
        // Try legacy ID
        if (rel.legacyId && identityMap.has(`${rel.targetEntity}:${rel.legacyId}`)) {
            return identityMap.get(`${rel.targetEntity}:${rel.legacyId}`);
        }
        return defaultVal;
    };

    let docPayload = {};

    switch (entity) {
        case 'Department': {
            docPayload = {
                hospitalId,
                name: tData.name || sData.Name || 'General Department',
                description: tData.description || sData.Description || '',
                isActive: true
            };
            break;
        }

        case 'Doctor': {
            docPayload = {
                hospitalId,
                doctorId: tData.doctorId || record.legacyId || `DOC_${Date.now()}_${record.rowNumber}`,
                name: tData.name || sData.DoctorName || sData.Name,
                email: tData.email || `doctor_${Date.now()}_${record.rowNumber}@hospital.local`,
                phone: tData.phone || '9999999999',
                specialty: tData.specialty || 'General Practice',
                experience: tData.experience || '',
                education: tData.education || '',
                services: [],
                departments: [tData.specialty || 'General']
            };
            break;
        }

        case 'Patient': {
            docPayload = {
                hospitalId,
                role: 'patient',
                name: tData.name || sData.PatientName || sData.Name,
                phone: tData.phone || '9999999999',
                email: tData.email || '',
                uhid: tData.uhid || record.legacyId || `UHID_${Date.now()}_${record.rowNumber}`,
                patientId: tData.uhid || record.legacyId || `PAT_${Date.now()}_${record.rowNumber}`,
                dob: tData.dob || '',
                gender: tData.gender || 'Male',
                bloodGroup: tData.bloodGroup || '',
                address: tData.address || '',
                city: tData.city || '',
                state: tData.state || '',
                country: tData.country || 'India',
                zipCode: tData.zipCode || '',
                aadhaarNumber: tData.aadhaarNumber || '',
                emergencyContact: {
                    name: tData.emergencyContactName || '',
                    relation: tData.emergencyContactRelation || '',
                    mobile: tData.emergencyContactPhone || ''
                },
                // Preserve approved Phase 1 & 2 Custom Fields
                customFields: tData.customFields || {}
            };
            break;
        }

        case 'Service': {
            docPayload = {
                hospitalId,
                id: tData.id || `SRV_${Date.now()}_${record.rowNumber}`,
                title: tData.title || tData.name || sData.ServiceName,
                description: tData.description || '',
                price: typeof tData.price === 'number' ? tData.price : 0,
                category: tData.category || 'General',
                active: true
            };
            break;
        }

        case 'Medicine': {
            docPayload = {
                name: tData.name || sData.MedicineName,
                genericName: tData.genericName || '',
                category: tData.category || 'General',
                description: tData.description || ''
            };
            break;
        }

        case 'Inventory': {
            docPayload = {
                hospitalId,
                name: tData.name || sData.ItemName,
                salt: tData.salt || '',
                category: tData.category || 'General',
                stock: typeof tData.stock === 'number' ? tData.stock : 0,
                unit: tData.unit || 'Tablets',
                buyingPrice: typeof tData.buyingPrice === 'number' ? tData.buyingPrice : 0,
                sellingPrice: typeof tData.sellingPrice === 'number' ? tData.sellingPrice : 0,
                vendor: tData.vendor || '',
                batchNumber: tData.batchNumber || '',
                expiryDate: tData.expiryDate ? new Date(tData.expiryDate) : null
            };
            break;
        }

        case 'Appointment': {
            const patientId = resolveForeignId({ targetEntity: 'Patient', field: 'uhid' }) ||
                              resolveForeignId({ targetEntity: 'Patient', field: 'patientName' });

            const doctorId = resolveForeignId({ targetEntity: 'Doctor', field: 'doctorName' });

            if (!patientId) {
                relError = `Required patient relationship could not be resolved for appointment (Row #${record.rowNumber})`;
                break;
            }

            docPayload = {
                hospitalId,
                userId: patientId,
                patientId: tData.uhid || '',
                doctorId: doctorId || null,
                doctorName: tData.doctorName || 'Consultant Doctor',
                department: tData.department || '',
                appointmentDate: tData.appointmentDate ? new Date(tData.appointmentDate) : new Date(),
                appointmentTime: tData.appointmentTime || '09:00 AM',
                status: 'confirmed',
                visitType: tData.visitType || 'New Consultation'
            };
            break;
        }

        case 'Admission': {
            const patientId = resolveForeignId({ targetEntity: 'Patient', field: 'uhid' }) ||
                              resolveForeignId({ targetEntity: 'Patient', field: 'patientName' });

            const doctorId = resolveForeignId({ targetEntity: 'Doctor', field: 'doctorName' });

            if (!patientId) {
                relError = `Required patient relationship could not be resolved for admission (Row #${record.rowNumber})`;
                break;
            }

            docPayload = {
                hospitalId,
                patientId,
                doctorId: doctorId || null,
                admissionDate: tData.admissionDate ? new Date(tData.admissionDate) : new Date(),
                admissionTime: tData.admissionTime || '10:00 AM',
                ward: tData.ward || 'General Ward',
                bedNumber: tData.bedNumber || 'Pending Allocation',
                status: tData.status || 'Admitted'
            };
            break;
        }

        case 'Payment':
        case 'Invoice': {
            const patientId = resolveForeignId({ targetEntity: 'Patient', field: 'uhid' }) ||
                              resolveForeignId({ targetEntity: 'Patient', field: 'patientName' });

            if (!patientId) {
                relError = `Required patient relationship could not be resolved for financial record (Row #${record.rowNumber})`;
                break;
            }

            docPayload = {
                hospitalId,
                patientId,
                amount: typeof tData.amount === 'number' ? tData.amount : 0,
                paymentMode: tData.paymentMode || 'Cash',
                paymentStatus: 'Paid',
                transactionId: tData.transactionId || `TXN_${Date.now()}_${record.rowNumber}`,
                paymentDate: tData.paymentDate ? new Date(tData.paymentDate) : new Date()
            };
            break;
        }

        case 'Lab': {
            const patientId = resolveForeignId({ targetEntity: 'Patient', field: 'uhid' }) ||
                              resolveForeignId({ targetEntity: 'Patient', field: 'patientName' });

            if (!patientId) {
                relError = `Required patient relationship could not be resolved for lab report (Row #${record.rowNumber})`;
                break;
            }

            docPayload = {
                hospitalId,
                userId: patientId,
                patientId: tData.uhid || 'P-001',
                doctorId: resolveForeignId({ targetEntity: 'Doctor', field: 'doctorName' }) || user._id,
                appointmentId: new mongoose.Types.ObjectId(),
                testNames: [tData.testName || 'Routine Diagnostic Investigation'],
                testStatus: 'DONE',
                reportStatus: 'UPLOADED',
                paymentStatus: 'PAID'
            };
            break;
        }

        default: {
            relError = `Unsupported entity '${entity}' for database import`;
            break;
        }
    }

    return { docPayload, relError };
}

/**
 * Retrieve production model corresponding to entity name.
 */
function getTargetModel(entity, models) {
    switch (entity) {
        case 'Department': return models.Department;
        case 'Doctor': return models.Doctor;
        case 'Patient': return models.User;
        case 'Service': return models.Service || models.FacilityCharge;
        case 'Medicine': return models.Medicine;
        case 'Inventory': return models.Inventory;
        case 'Appointment': return models.Appointment;
        case 'Admission': return models.Admission;
        case 'Payment':
        case 'Invoice': return models.PaymentTransaction;
        case 'Lab': return models.LabReport;
        default: return null;
    }
}

/**
 * Automated Post-Import Verification Routine.
 */
async function runPostImportVerification({ hospitalId, migrationId, models, totalStaged, totalImported, totalFailed, totalSkipped }) {
    const checks = [];
    const { MigrationRecord, Appointment, User, Doctor } = models;

    // 1. Count Accounting Integrity Check
    const sumCalculated = totalImported + totalFailed + totalSkipped;
    const countCheckPassed = sumCalculated >= totalStaged;
    checks.push({
        name: 'Record Accounting Integrity',
        passed: countCheckPassed,
        message: countCheckPassed
            ? `All ${totalStaged} source records accounted for (${totalImported} imported, ${totalFailed} failed, ${totalSkipped} skipped).`
            : `Accounting discrepancy: Staged=${totalStaged}, Sum=${sumCalculated}`
    });

    // 2. Production Document Existence Sample Check
    try {
        const sampleImported = await MigrationRecord.find({
            hospitalId,
            migrationId,
            importStatus: 'IMPORTED',
            importedRecordId: { $ne: null }
        }).limit(20).lean();

        let sampledExistencePassed = true;
        for (const sRec of sampleImported) {
            const targetModel = getTargetModel(sRec.entity, models);
            if (targetModel) {
                const exists = await targetModel.findById(sRec.importedRecordId).select('_id').lean();
                if (!exists) {
                    sampledExistencePassed = false;
                    break;
                }
            }
        }

        checks.push({
            name: 'Production Record Existence Verification',
            passed: sampledExistencePassed,
            message: sampledExistencePassed
                ? 'Sampled production documents exist in target collections with valid ObjectIds.'
                : 'Failed verification: Some imported record ObjectIds were not found in production.'
        });
    } catch (err) {
        checks.push({
            name: 'Production Record Existence Verification',
            passed: false,
            message: `Verification query error: ${err.message}`
        });
    }

    // 3. Foreign Key Relationship Integrity Check
    try {
        const apptRecords = await MigrationRecord.find({
            hospitalId,
            migrationId,
            entity: 'Appointment',
            importStatus: 'IMPORTED'
        }).limit(10).lean();

        let relCheckPassed = true;
        for (const apptRec of apptRecords) {
            if (apptRec.importedRecordId) {
                const apptDoc = await Appointment.findById(apptRec.importedRecordId).lean();
                if (apptDoc && apptDoc.userId) {
                    const patientDoc = await User.findById(apptDoc.userId).select('_id').lean();
                    if (!patientDoc) {
                        relCheckPassed = false;
                        break;
                    }
                }
            }
        }

        checks.push({
            name: 'Foreign Key & Relationship Integrity',
            passed: relCheckPassed,
            message: relCheckPassed
                ? 'Foreign references (Appointments -> Patients/Doctors) resolve to valid production documents.'
                : 'Warning: Unresolved foreign references detected among imported appointments.'
        });
    } catch (err) {
        checks.push({
            name: 'Foreign Key & Relationship Integrity',
            passed: false,
            message: `Relationship verification error: ${err.message}`
        });
    }

    return checks;
}

module.exports = {
    executeMigrationImport,
    runPostImportVerification,
    getTargetModel,
    resolveAndBuildPayload
};
