/**
 * Automated Test Suite — Medical365 Local -> Cloud Data Synchronization (Phase 3)
 *
 * Validates:
 * 1. Local Outbox Queuing: Saves offline changes to Local DB & queues PENDING outbox event
 * 2. Loop Prevention on Local Agent: Rejects events with source 'CLOUD' or _source 'CLOUD'
 * 3. Loop Prevention on Cloud Emitter: Rejects docs with _source 'LOCAL_SYNC_APPLIED'
 * 4. Scope Protection Guarantee: Rejects Payment, Invoice, Refund, ClinicalNote, Prescription
 * 5. Batch Processing & Cloud Ingestion: Applies offline mutations and returns ACKs
 * 6. Idempotency Guarantee: Repeated batch submission does not duplicate operations
 * 7. Conflict Detection: Base version mismatch creates SyncConflict and prevents overwrite
 * 8. Acknowledgement Flow: Local Outbox marks items COMPLETED / CONFLICT
 * 9. Network Drop Recovery: In-flight events revert to PENDING safely on timeout
 * 10. Multi-Tenant Isolation: Cross-hospital mutations rejected / scoped strictly
 * 11. Telemetry & History: Upload stats and activity stream updated in LocalInstallation
 */

const assert = require('assert');
const mongoose = require('mongoose');

const cloudSyncReceiverService = require('../src/services/localAgent/cloudSyncReceiver.service');
const syncEmitter = require('../src/services/localAgent/syncEmitter');
const localOutbox = require('../../local-agent/src/sync/localOutbox');

const LocalInstallation = require('../src/models/localInstallation.model');
const LocalSyncProcessedEvent = require('../src/models/localSyncProcessedEvent.model');
const SyncConflict = require('../src/models/syncConflict.model');
const Department = require('../src/models/department.model');
const Doctor = require('../src/models/doctor.model');
const User = require('../src/models/user.model');
const Bed = require('../src/models/bed.model');
const Medicine = require('../src/models/medicine.model');
const Service = require('../src/models/service.model');

async function runTests() {
    console.log('\n======================================================');
    console.log('--- RUNNING LOCAL -> CLOUD SYNC (PHASE 3) TESTS ---');
    console.log('======================================================\n');

    let passed = 0;
    let failed = 0;

    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${name}`);
            console.error(`    Error: ${err.message}`);
            if (err.stack) console.error(`    ${err.stack.split('\n')[1]}`);
            failed++;
        }
    };

    const testHospitalId = new mongoose.Types.ObjectId();
    const testInstallationId = 'INST-PHASE3-TEST-' + Math.floor(Math.random() * 100000);

    // ── In-Memory Cloud Stores for Standalone Test Reliability ─────────────────
    const cloudStore = {
        installations: new Map(),
        processedEvents: new Map(),
        conflicts: new Map(),
        departments: new Map(),
        doctors: new Map(),
        users: new Map(),
        beds: new Map(),
        medicines: new Map(),
        services: new Map()
    };

    // Seed mock active installation
    const mockInstDoc = {
        _id: new mongoose.Types.ObjectId(),
        hospitalId: testHospitalId,
        installationId: testInstallationId,
        status: 'ONLINE',
        pairingStatus: 'ACTIVE',
        name: 'Phase 3 Test Facility',
        syncStatus: {
            initialSync: { status: 'COMPLETED' },
            uploadStatus: {
                pendingUploadsCount: 0,
                completedUploadsCount: 0,
                failedUploadsCount: 0,
                conflictsCount: 0,
                lastUploadAt: null
            },
            recentActivities: []
        },
        save: async function() { return this; },
        markModified: function() {}
    };
    cloudStore.installations.set(testInstallationId, mockInstDoc);

    // Mock LocalInstallation
    LocalInstallation.findOne = async (filter) => {
        for (const inst of cloudStore.installations.values()) {
            if (filter.installationId && inst.installationId !== filter.installationId) continue;
            if (filter.hospitalId && String(inst.hospitalId) !== String(filter.hospitalId)) continue;
            return inst;
        }
        return null;
    };

    // Mock LocalSyncProcessedEvent
    LocalSyncProcessedEvent.findOne = async (filter) => {
        return cloudStore.processedEvents.get(filter.eventId) || null;
    };
    LocalSyncProcessedEvent.create = async (doc) => {
        const item = { ...doc, _id: new mongoose.Types.ObjectId() };
        cloudStore.processedEvents.set(doc.eventId, item);
        return item;
    };

    // Mock SyncConflict
    SyncConflict.create = async (doc) => {
        const item = { ...doc, _id: new mongoose.Types.ObjectId() };
        cloudStore.conflicts.set(doc.eventId, item);
        return item;
    };
    SyncConflict.findOne = async (filter) => {
        for (const c of cloudStore.conflicts.values()) {
            if (filter.eventId && c.eventId !== filter.eventId) continue;
            if (filter.conflictId && c.conflictId !== filter.conflictId) continue;
            return c;
        }
        return null;
    };

    // Generic Mock Model Factory
    const setupMockModel = (Model, storeMap) => {
        Model.findById = async (id) => {
            const item = storeMap.get(String(id));
            if (!item) return null;
            return {
                ...item,
                save: async function() {
                    storeMap.set(String(id), this);
                    return this;
                }
            };
        };
        Model.findOne = async (filter) => {
            for (const item of storeMap.values()) {
                let match = true;
                for (const [k, v] of Object.entries(filter)) {
                    if (String(item[k]) !== String(v)) { match = false; break; }
                }
                if (match) {
                    return {
                        ...item,
                        save: async function() {
                            storeMap.set(String(item._id), this);
                            return this;
                        }
                    };
                }
            }
            return null;
        };
        Model.create = async (data) => {
            const id = data._id ? String(data._id) : new mongoose.Types.ObjectId().toString();
            const doc = { createdAt: new Date(), updatedAt: new Date(), ...data, _id: id };
            doc.save = async function() {
                storeMap.set(id, this);
                return this;
            };
            storeMap.set(id, doc);
            return doc;
        };
        Model.updateOne = async (filter, update, options = {}) => {
            let found = null;
            for (const item of storeMap.values()) {
                if (filter._id && String(item._id) === String(filter._id)) {
                    found = item;
                    break;
                }
            }
            if (found && update.$set) {
                Object.assign(found, update.$set);
                return { modifiedCount: 1, upsertedCount: 0 };
            } else if (!found && options && options.upsert) {
                const targetId = filter._id ? String(filter._id) : new mongoose.Types.ObjectId().toString();
                const newDoc = {
                    _id: targetId,
                    ...(update.$set || {})
                };
                newDoc.save = async function() {
                    storeMap.set(targetId, this);
                    return this;
                };
                storeMap.set(targetId, newDoc);
                return { modifiedCount: 0, upsertedCount: 1, upsertedId: targetId };
            }
            return { modifiedCount: 0 };
        };
    };

    setupMockModel(Department, cloudStore.departments);
    setupMockModel(Doctor, cloudStore.doctors);
    setupMockModel(User, cloudStore.users);
    setupMockModel(Bed, cloudStore.beds);
    setupMockModel(Medicine, cloudStore.medicines);
    setupMockModel(Service, cloudStore.services);

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Local Outbox Queuing
    // ──────────────────────────────────────────────────────────────────────────
    await test('1. Local Outbox saves offline changes & queues PENDING outbox event', async () => {
        const patientId = new mongoose.Types.ObjectId().toString();
        const res = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Patient',
            entityId: patientId,
            operation: 'CREATE',
            payload: {
                firstName: 'Offline',
                lastName: 'Patient',
                email: 'offline.patient@example.com',
                phone: '9876543210'
            },
            source: 'LOCAL'
        });

        assert.strictEqual(res.success, true);
        assert.ok(res.eventId.startsWith('OUT-'));
        assert.strictEqual(res.status, 'PENDING');

        const pending = await localOutbox.getPendingBatch(10);
        const match = pending.find(p => p.eventId === res.eventId);
        assert.ok(match, 'Event should exist in pending outbox');
        assert.strictEqual(match.entityType, 'Patient');
        assert.strictEqual(match.entityId, patientId);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Loop Prevention on Local Agent
    // ──────────────────────────────────────────────────────────────────────────
    await test('2. Loop Prevention: Local Outbox ignores mutations originating from CLOUD', async () => {
        const res = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Patient',
            entityId: 'PAT-CLOUD-1',
            operation: 'UPDATE',
            payload: {
                firstName: 'Cloud',
                lastName: 'Synced',
                _source: 'CLOUD'
            },
            source: 'CLOUD'
        });

        assert.strictEqual(res.ignored, true);
        assert.strictEqual(res.reason, 'CLOUD_ORIGIN');

        const pending = await localOutbox.getPendingBatch(50);
        const match = pending.find(p => p.entityId === 'PAT-CLOUD-1');
        assert.strictEqual(match, undefined, 'Cloud origin event MUST NOT be added to Local Outbox');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Loop Prevention on Cloud Sync Emitter
    // ──────────────────────────────────────────────────────────────────────────
    await test('3. Loop Prevention: Cloud SyncEmitter ignores docs with _source LOCAL_SYNC_APPLIED', async () => {
        const mockDoc = {
            _id: new mongoose.Types.ObjectId(),
            hospitalId: testHospitalId,
            role: 'patient',
            name: 'Local Applied Patient',
            _source: 'LOCAL_SYNC_APPLIED'
        };

        const event = await syncEmitter.emitEntityChange({
            entityType: 'User',
            doc: mockDoc,
            operation: 'UPDATE'
        });

        assert.strictEqual(event, null, 'SyncEmitter must return null for LOCAL_SYNC_APPLIED changes');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Scope Protection Guarantee
    // ──────────────────────────────────────────────────────────────────────────
    await test('4. Scope Protection: Cloud rejects Financial & Clinical entities with prohibited status', async () => {
        const forbiddenEntities = ['Payment', 'Invoice', 'Refund', 'ClinicalNote', 'Prescription'];

        for (const ent of forbiddenEntities) {
            const batchRes = await cloudSyncReceiverService.processIncomingBatch({
                hospitalId: testHospitalId,
                installationId: testInstallationId,
                events: [{
                    eventId: `OUT-FORBIDDEN-${ent}`,
                    entityType: ent,
                    entityId: 'FIN-12345',
                    operation: 'CREATE',
                    payload: { amount: 5000 },
                    localVersion: Date.now()
                }]
            });

            assert.strictEqual(batchRes.failedCount, 1);
            assert.strictEqual(batchRes.results[0].status, 'FAILED');
            assert.ok(batchRes.results[0].message.includes('strictly prohibited'), `Message should indicate prohibited entity for ${ent}`);
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Batch Processing & Cloud Ingestion
    // ──────────────────────────────────────────────────────────────────────────
    await test('5. Cloud Receiver applies offline Department, Doctor & Patient batch', async () => {
        const deptId = new mongoose.Types.ObjectId();
        const docId = new mongoose.Types.ObjectId();
        const patId = new mongoose.Types.ObjectId();

        const batch = [
            {
                eventId: 'OUT-BATCH-DEPT-1',
                entityType: 'Department',
                entityId: deptId.toString(),
                operation: 'CREATE',
                payload: {
                    name: 'Orthopedics Phase 3',
                    code: 'ORTHO-P3',
                    isActive: true
                },
                localVersion: 1000
            },
            {
                eventId: 'OUT-BATCH-DOC-1',
                entityType: 'Doctor',
                entityId: docId.toString(),
                operation: 'CREATE',
                payload: {
                    name: 'Dr. John Doe',
                    email: 'dr.john.p3@example.com',
                    specialization: 'Orthopedics',
                    licenseNumber: 'DOC-P3-123',
                    isActive: true
                },
                localVersion: 1000
            },
            {
                eventId: 'OUT-BATCH-PAT-1',
                entityType: 'Patient',
                entityId: patId.toString(),
                operation: 'CREATE',
                payload: {
                    name: 'Alice Wonder',
                    email: 'alice.p3@example.com',
                    phone: '9876543299',
                    isActive: true
                },
                localVersion: 1000
            }
        ];

        const res = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: testHospitalId,
            installationId: testInstallationId,
            events: batch
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.totalReceived, 3);
        assert.strictEqual(res.successCount, 3);
        assert.strictEqual(res.conflictCount, 0);
        assert.strictEqual(res.failedCount, 0);

        // Verify records in DB
        const savedDept = await Department.findById(deptId);
        assert.ok(savedDept, 'Department must exist in Cloud DB');
        assert.strictEqual(savedDept.name, 'Orthopedics Phase 3');

        const savedUser = await User.findById(patId);
        assert.ok(savedUser, 'Patient must exist in Cloud User collection');
        assert.strictEqual(savedUser.name, 'Alice Wonder');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 6. Idempotent Resending
    // ──────────────────────────────────────────────────────────────────────────
    await test('6. Idempotency: Duplicate batch push returns SUCCESS without re-executing', async () => {
        const batch = [
            {
                eventId: 'OUT-BATCH-DEPT-1', // Same ID as Test 5
                entityType: 'Department',
                entityId: new mongoose.Types.ObjectId().toString(),
                operation: 'CREATE',
                payload: { name: 'Ignored Duplicate Name' },
                localVersion: 1000
            }
        ];

        const res = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: testHospitalId,
            installationId: testInstallationId,
            events: batch
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.results[0].status, 'SUCCESS');
        assert.strictEqual(res.results[0].message, 'Already processed (idempotent)');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 7. Conflict Detection
    // ──────────────────────────────────────────────────────────────────────────
    await test('7. Conflict Detection: Local baseVersion mismatch triggers CONFLICT & protects Cloud data', async () => {
        const testDept = await Department.create({
            _id: new mongoose.Types.ObjectId().toString(),
            hospitalId: testHospitalId,
            name: 'Cloud Master Cardiology',
            code: 'CARD-MASTER',
            _syncVersion: 5000,
            updatedAt: new Date(5000)
        });

        // Simulate local agent that was based on version 2000 trying to overwrite version 5000
        const conflictingEvent = {
            eventId: 'OUT-CONFLICT-DEPT-1',
            entityType: 'Department',
            entityId: testDept._id.toString(),
            operation: 'UPDATE',
            payload: {
                name: 'Local Offline Cardiology Overwrite'
            },
            localBaseVersion: 2000, // Older than Cloud's 5000
            localVersion: 6000
        };

        const res = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: testHospitalId,
            installationId: testInstallationId,
            events: [conflictingEvent]
        });

        assert.strictEqual(res.conflictCount, 1);
        assert.strictEqual(res.results[0].status, 'CONFLICT');

        // Verify Cloud data was NOT overwritten
        const preservedDept = await Department.findById(testDept._id);
        assert.strictEqual(preservedDept.name, 'Cloud Master Cardiology', 'Cloud record MUST NOT be overwritten on conflict');

        // Verify SyncConflict record was created
        const conflictDoc = await SyncConflict.findOne({ eventId: 'OUT-CONFLICT-DEPT-1' });
        assert.ok(conflictDoc, 'SyncConflict record must be created');
        assert.strictEqual(conflictDoc.status, 'PENDING_REVIEW');
        assert.strictEqual(conflictDoc.cloudVersion, 5000);
        assert.strictEqual(conflictDoc.localVersion, 6000);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 8. Acknowledgement Flow in Local Outbox
    // ──────────────────────────────────────────────────────────────────────────
    await test('8. Local Outbox applies ACKs: Transitions IN_FLIGHT -> COMPLETED or CONFLICT', async () => {
        const ev1 = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Bed',
            entityId: 'BED-101',
            operation: 'CREATE',
            payload: { number: 'B-101' },
            source: 'LOCAL'
        });

        const ev2 = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Bed',
            entityId: 'BED-102',
            operation: 'UPDATE',
            payload: { number: 'B-102-Conflicted' },
            source: 'LOCAL'
        });

        await localOutbox.markInFlight([ev1.eventId, ev2.eventId]);

        await localOutbox.applyAcknowledgements([
            { eventId: ev1.eventId, status: 'SUCCESS', cloudVersion: 12345 },
            { eventId: ev2.eventId, status: 'CONFLICT', message: 'Version discrepancy' }
        ]);

        const stats = await localOutbox.getOutboxStats();
        assert.ok(stats.completed >= 1, 'Completed count should be incremented');
        assert.ok(stats.conflicts >= 1, 'Conflict count should be incremented');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 9. Network Drop Recovery (In-Flight Reversion)
    // ──────────────────────────────────────────────────────────────────────────
    await test('9. Network Drop: IN_FLIGHT events revert to PENDING safely on timeout', async () => {
        const ev = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Medicine',
            entityId: 'MED-501',
            operation: 'CREATE',
            payload: { name: 'Paracetamol 500mg' },
            source: 'LOCAL'
        });

        await localOutbox.markInFlight([ev.eventId]);
        await localOutbox.revertInFlightToPending([ev.eventId], 'Connection timed out');

        const evRecord = await localOutbox.getEventById(ev.eventId);
        assert.ok(evRecord, 'Event must exist in local outbox');
        assert.strictEqual(evRecord.status, 'PENDING');
        assert.strictEqual(evRecord.errorMessage, 'Connection timed out');

        const pending = await localOutbox.getPendingBatch(10, true);
        const found = pending.find(p => p.eventId === ev.eventId);
        assert.ok(found, 'Event must revert to PENDING so it is not lost');
        assert.strictEqual(found.status, 'PENDING');
        assert.strictEqual(found.errorMessage, 'Connection timed out');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 10. Multi-Tenant Isolation
    // ──────────────────────────────────────────────────────────────────────────
    await test('10. Multi-Tenant Isolation: Cross-hospital mutations rejected or isolated', async () => {
        const otherHospitalId = new mongoose.Types.ObjectId();
        const foreignDeptId = new mongoose.Types.ObjectId().toString();

        // Installation belonging to testHospitalId attempts to update otherHospitalId's department
        const res = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: testHospitalId,
            installationId: testInstallationId,
            events: [{
                eventId: 'OUT-CROSS-TENANT-1',
                entityType: 'Department',
                entityId: foreignDeptId,
                operation: 'CREATE',
                payload: {
                    hospitalId: otherHospitalId, // Attacking payload
                    name: 'Spoofed Department'
                },
                localVersion: 1000
            }]
        });

        assert.strictEqual(res.success, true);
        const createdDept = await Department.findById(foreignDeptId);
        assert.ok(createdDept);
        // Cloud receiver must have stamped testHospitalId, completely overriding the spoofed ID
        assert.strictEqual(createdDept.hospitalId.toString(), testHospitalId.toString(), 'Must be isolated to authenticated hospital');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 11. Telemetry & History in LocalInstallation
    // ──────────────────────────────────────────────────────────────────────────
    await test('11. LocalInstallation tracks upload metrics and activity stream', async () => {
        const inst = await LocalInstallation.findOne({ hospitalId: testHospitalId });
        assert.ok(inst, 'Installation must exist');
        assert.ok(inst.syncStatus.uploadStatus.completedUploadsCount > 0, 'Completed uploads count must be recorded');
        assert.ok(inst.syncStatus.uploadStatus.conflictsCount > 0, 'Conflict count must be recorded');
        assert.ok(inst.syncStatus.uploadStatus.lastUploadAt !== null, 'Last upload timestamp must be updated');
        assert.ok(inst.syncStatus.recentActivities.length > 0, 'Recent activity stream must contain logged events');
    });

    console.log('\n======================================================');
    console.log(`--- TEST RESULTS: ${passed} PASSED, ${failed} FAILED ---`);
    console.log('======================================================\n');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
