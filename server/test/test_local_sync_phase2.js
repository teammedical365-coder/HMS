/**
 * Automated Test Suite — Medical365 Cloud -> Local Data Synchronization (Phase 2)
 *
 * Validates:
 * 1. Cloud creates patient -> Sync event generated
 * 2. Local receives event -> Local patient created
 * 3. Cloud updates patient -> Local patient updated
 * 4. Duplicate event received -> No duplicate record created (Idempotency)
 * 5. Old version arrives after newer version -> Newer version remains intact (Versioning)
 * 6. Soft-delete handling -> Local record flagged inactive/deleted
 * 7. Durable Queue -> Persistent queue with retry backoff and failure tracking
 * 8. Multi-tenant isolation -> Installation for Hospital A cannot fetch Hospital B data
 * 9. Sync checkpoint / cursor -> Resumes from last processed version
 * 10. Acknowledgement pipeline -> Cloud tracks delivery and updates metrics
 * 11. Initial sync chunking -> Memory-safe batch streaming across 7 entities
 * 12. Partial initial sync recovery -> Resumes without corruption
 * 13. Scope enforcement guarantee -> Financial & clinical entities are rejected
 */

const assert = require('assert');
const mongoose = require('mongoose');

const syncEventService = require('../src/services/localAgent/syncEvent.service');
const initialSyncService = require('../src/services/localAgent/initialSync.service');
const syncEmitter = require('../src/services/localAgent/syncEmitter');
const syncExecutor = require('../../local-agent/src/sync/syncExecutor');
const syncQueue = require('../../local-agent/src/sync/syncQueue');
const LocalInstallation = require('../src/models/localInstallation.model');
const SyncEvent = require('../src/models/syncEvent.model');
const Hospital = require('../src/models/hospital.model');
const Department = require('../src/models/department.model');
const Doctor = require('../src/models/doctor.model');
const Service = require('../src/models/service.model');
const Bed = require('../src/models/bed.model');
const Medicine = require('../src/models/medicine.model');
const User = require('../src/models/user.model');

async function runTests() {
    console.log('\n======================================================');
    console.log('--- RUNNING CLOUD -> LOCAL SYNC (PHASE 2) TESTS ---');
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
            if (err.stack) {
                console.error(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
            }
            failed++;
        }
    };

    const hospitalAId = new mongoose.Types.ObjectId();
    const hospitalBId = new mongoose.Types.ObjectId();
    const installationAId = 'MED365-LOCAL-TEST-A';
    const installationBId = 'MED365-LOCAL-TEST-B';

    // ── Local In-Memory Mock Database for Local Agent ─────────────────────────
    const localStore = {
        hospitals: new Map(),
        departments: new Map(),
        doctors: new Map(),
        services: new Map(),
        beds: new Map(),
        medicines: new Map(),
        patients: new Map(),
        sync_applied_events: new Map(),
        sync_checkpoints: new Map(),
        sync_queue: new Map()
    };

    // Mock local MongoDB collections
    const createMockCollection = (name) => ({
        findOne: async (query) => {
            const store = localStore[name];
            for (const doc of store.values()) {
                let match = true;
                for (const [k, v] of Object.entries(query)) {
                    if (String(doc[k]) !== String(v)) {
                        match = false;
                        break;
                    }
                }
                if (match) return JSON.parse(JSON.stringify(doc));
            }
            return null;
        },
        updateOne: async (filter, update, options = {}) => {
            const store = localStore[name];
            let targetKey = null;

            for (const [key, doc] of store.entries()) {
                let match = true;
                for (const [k, v] of Object.entries(filter)) {
                    if (String(doc[k]) !== String(v)) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    targetKey = key;
                    break;
                }
            }

            if (targetKey) {
                const existing = store.get(targetKey);
                if (update.$set) Object.assign(existing, update.$set);
                if (update.$inc) {
                    for (const [k, v] of Object.entries(update.$inc)) {
                        existing[k] = (existing[k] || 0) + v;
                    }
                }
                return { modifiedCount: 1, upsertedCount: 0 };
            } else if (options.upsert) {
                const newDoc = { ...filter, ...(update.$set || {}), ...(update.$setOnInsert || {}) };
                const id = newDoc._id || newDoc.eventId || newDoc.checkpointId || String(store.size + 1);
                newDoc._id = id;
                store.set(String(id), newDoc);
                return { modifiedCount: 0, upsertedCount: 1 };
            }
            return { modifiedCount: 0, upsertedCount: 0 };
        },
        insertOne: async (doc) => {
            const store = localStore[name];
            const id = doc.eventId || doc._id || String(store.size + 1);
            store.set(String(id), JSON.parse(JSON.stringify(doc)));
            return { insertedId: id };
        },
        bulkWrite: async (ops) => {
            let upsertedCount = 0;
            let modifiedCount = 0;
            for (const op of ops) {
                if (op.updateOne) {
                    const res = await createMockCollection(name).updateOne(
                        op.updateOne.filter,
                        op.updateOne.update,
                        { upsert: op.updateOne.upsert }
                    );
                    upsertedCount += res.upsertedCount;
                    modifiedCount += res.modifiedCount;
                }
            }
            return { upsertedCount, modifiedCount };
        },
        find: (query) => ({
            sort: () => ({
                limit: (lim) => ({
                    toArray: async () => Array.from(localStore[name].values()).slice(0, lim)
                })
            })
        })
    });

    // Mock db.getDb()
    syncExecutor.getCollection = (colName) => createMockCollection(colName);
    syncQueue.getCollection = () => createMockCollection('sync_queue');

    // Mock Cloud Models for LocalInstallation and SyncEvent
    const cloudInstallations = [
        {
            hospitalId: hospitalAId,
            installationId: installationAId,
            status: 'ONLINE',
            syncStatus: {
                initialSync: { status: 'NOT_STARTED', progress: {} },
                pendingEventsCount: 0,
                failedEventsCount: 0,
                totalRecordsSynced: 0
            }
        },
        {
            hospitalId: hospitalBId,
            installationId: installationBId,
            status: 'ONLINE',
            syncStatus: {
                initialSync: { status: 'NOT_STARTED', progress: {} },
                pendingEventsCount: 0,
                failedEventsCount: 0,
                totalRecordsSynced: 0
            }
        }
    ];

    const cloudEvents = [];

    LocalInstallation.find = (filter) => ({
        select: () => ({
            lean: async () => cloudInstallations.filter(inst => {
                if (filter.hospitalId && String(inst.hospitalId) !== String(filter.hospitalId)) return false;
                if (filter.status && filter.status.$ne && inst.status === filter.status.$ne) return false;
                return true;
            })
        })
    });

    LocalInstallation.findOne = async (filter) => {
        const found = cloudInstallations.find(inst => {
            if (filter.hospitalId && String(inst.hospitalId) !== String(filter.hospitalId)) return false;
            if (filter.installationId && inst.installationId !== filter.installationId) return false;
            return true;
        }) || null;
        if (found) {
            found.save = async () => found;
            found.markModified = () => {};
        }
        return found;
    };

    // Mock 7 Entity Cloud Models for Initial Sync
    const mockEntities = {
        Hospital: [{ _id: hospitalAId, name: 'Apollo Metro Hospital' }],
        Department: [{ _id: 'DEP-1', name: 'Cardiology', hospitalId: hospitalAId }],
        Doctor: [{ _id: 'DOC-1', name: 'Dr. Rao', hospitalId: hospitalAId }],
        Service: [{ _id: 'SRV-1', name: 'Consultation Fee', hospitalId: hospitalAId }],
        Bed: [{ _id: 'BED-1', number: '101', hospitalId: hospitalAId }],
        Medicine: [{ _id: 'MED-1', name: 'Paracetamol 500mg' }],
        User: [{ _id: 'PAT-1', name: 'Rohan Verma', role: 'patient', hospitalId: hospitalAId }]
    };

    Hospital.findById = () => ({ lean: async () => mockEntities.Hospital[0] });
    Hospital.countDocuments = async () => mockEntities.Hospital.length;

    const mockQuery = (items) => ({
        select: () => mockQuery(items),
        skip: (s) => ({
            limit: (l) => ({
                lean: async () => items.slice(s, s + l)
            })
        }),
        lean: async () => items
    });

    Department.countDocuments = async () => mockEntities.Department.length;
    Department.find = () => mockQuery(mockEntities.Department);

    Doctor.countDocuments = async () => mockEntities.Doctor.length;
    Doctor.find = () => mockQuery(mockEntities.Doctor);

    Service.countDocuments = async () => mockEntities.Service.length;
    Service.find = () => mockQuery(mockEntities.Service);

    Bed.countDocuments = async () => mockEntities.Bed.length;
    Bed.find = () => mockQuery(mockEntities.Bed);

    Medicine.countDocuments = async () => mockEntities.Medicine.length;
    Medicine.find = () => mockQuery(mockEntities.Medicine);

    User.countDocuments = async () => mockEntities.User.length;
    User.find = () => mockQuery(mockEntities.User);

    LocalInstallation.updateOne = async (filter, update) => {
        const inst = await LocalInstallation.findOne(filter);
        if (inst) {
            if (update.$set) {
                for (const [k, v] of Object.entries(update.$set)) {
                    if (k.startsWith('syncStatus.')) {
                        const sub = k.split('.')[1];
                        inst.syncStatus[sub] = v;
                    } else {
                        inst[k] = v;
                    }
                }
            }
            if (update.$inc) {
                for (const [k, v] of Object.entries(update.$inc)) {
                    if (k.startsWith('syncStatus.')) {
                        const sub = k.split('.')[1];
                        inst.syncStatus[sub] = (inst.syncStatus[sub] || 0) + v;
                    }
                }
            }
        }
        return { modifiedCount: inst ? 1 : 0 };
    };

    LocalInstallation.updateMany = async (filter, update) => {
        for (const inst of cloudInstallations) {
            if (filter.hospitalId && String(inst.hospitalId) === String(filter.hospitalId)) {
                if (update.$inc) {
                    for (const [k, v] of Object.entries(update.$inc)) {
                        if (k.startsWith('syncStatus.')) {
                            const sub = k.split('.')[1];
                            inst.syncStatus[sub] = (inst.syncStatus[sub] || 0) + v;
                        }
                    }
                }
            }
        }
        return { modifiedCount: 1 };
    };

    SyncEvent.create = async (doc) => {
        const eventDoc = { ...doc, _id: new mongoose.Types.ObjectId(), createdAt: new Date() };
        cloudEvents.push(eventDoc);
        return eventDoc;
    };

    SyncEvent.find = (filter) => ({
        sort: () => ({
            limit: (lim) => ({
                lean: async () => cloudEvents.filter(e => {
                    if (filter.hospitalId && String(e.hospitalId) !== String(filter.hospitalId)) return false;
                    if (filter.version && filter.version.$gt && e.version <= filter.version.$gt) return false;
                    return true;
                }).slice(0, lim)
            })
        })
    });

    SyncEvent.countDocuments = async (filter) => {
        return cloudEvents.filter(e => {
            if (filter.hospitalId && String(e.hospitalId) !== String(filter.hospitalId)) return false;
            if (filter['installations.installationId']) {
                const targetInst = e.installations.find(i => i.installationId === filter['installations.installationId']);
                if (!targetInst) return false;
                if (filter['installations.status']) {
                    if (typeof filter['installations.status'] === 'string' && targetInst.status !== filter['installations.status']) return false;
                    if (filter['installations.status'].$ne && targetInst.status === filter['installations.status'].$ne) return false;
                }
            }
            return true;
        }).length;
    };

    SyncEvent.updateOne = async (filter, update) => {
        const evt = cloudEvents.find(e => {
            if (filter.eventId && e.eventId !== filter.eventId) return false;
            if (filter.hospitalId && String(e.hospitalId) !== String(filter.hospitalId)) return false;
            return true;
        });
        if (evt) {
            if (update.$set) {
                if (update.$set['installations.$.status']) {
                    const inst = evt.installations.find(i => i.installationId === filter['installations.installationId']);
                    if (inst) {
                        inst.status = update.$set['installations.$.status'];
                        inst.acknowledgedAt = update.$set['installations.$.acknowledgedAt'];
                        inst.errorMessage = update.$set['installations.$.errorMessage'];
                    }
                }
                if (update.$set.status) {
                    evt.status = update.$set.status;
                }
            }
        }
        return { modifiedCount: evt ? 1 : 0 };
    };

    // ─── TESTS ────────────────────────────────────────────────────────────────

    // 1. Cloud creates patient -> Sync event generated
    let testPatientEventId = null;
    await test('1. Cloud creates patient -> Sync event generated with sanitized payload', async () => {
        const patientDoc = {
            _id: 'PAT-1001',
            name: 'Aarav Sharma',
            phone: '9876543210',
            gender: 'Male',
            age: 32,
            password: 'SUPER_SECRET_HASH',
            hospitalId: hospitalAId
        };

        const event = await syncEventService.createSyncEvent({
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: 'PAT-1001',
            operation: 'CREATE',
            payload: patientDoc,
            version: 1000
        });

        assert.ok(event.eventId, 'Should generate eventId');
        assert.strictEqual(event.entityType, 'Patient');
        assert.strictEqual(event.operation, 'CREATE');
        assert.strictEqual(event.payload.password, undefined, 'Sensitive password field must be sanitized');
        assert.strictEqual(event.payload.name, 'Aarav Sharma');
        assert.strictEqual(event.installations.length, 1);
        assert.strictEqual(event.installations[0].installationId, installationAId);
        testPatientEventId = event.eventId;
    });

    // 2. Local receives event -> Local patient created
    await test('2. Local receives event -> Local patient created in Local MongoDB', async () => {
        const cloudEvt = cloudEvents.find(e => e.eventId === testPatientEventId);
        assert.ok(cloudEvt, 'Cloud event should exist');

        const result = await syncExecutor.applyEvent({
            eventId: cloudEvt.eventId,
            entityType: cloudEvt.entityType,
            entityId: cloudEvt.entityId,
            operation: cloudEvt.operation,
            payload: cloudEvt.payload,
            version: cloudEvt.version
        });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.applied, true);

        const localPatient = localStore.patients.get('PAT-1001');
        assert.ok(localPatient, 'Patient should exist in local MongoDB store');
        assert.strictEqual(localPatient.name, 'Aarav Sharma');
        assert.strictEqual(localPatient._cloudVersion, 1000);
    });

    // 3. Cloud updates patient -> Local patient updated
    await test('3. Cloud updates patient -> Local patient updated with newer version', async () => {
        const updateEvent = await syncEventService.createSyncEvent({
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: 'PAT-1001',
            operation: 'UPDATE',
            payload: { _id: 'PAT-1001', name: 'Aarav Sharma (VIP)', phone: '9876543210', age: 33 },
            version: 2000
        });

        const result = await syncExecutor.applyEvent({
            eventId: updateEvent.eventId,
            entityType: updateEvent.entityType,
            entityId: updateEvent.entityId,
            operation: updateEvent.operation,
            payload: updateEvent.payload,
            version: updateEvent.version
        });

        assert.strictEqual(result.applied, true);
        const localPatient = localStore.patients.get('PAT-1001');
        assert.strictEqual(localPatient.name, 'Aarav Sharma (VIP)');
        assert.strictEqual(localPatient._cloudVersion, 2000);
    });

    // 4. Duplicate event received -> Skipped idempotently
    await test('4. Duplicate event received -> Skipped idempotently without duplicate records', async () => {
        const duplicateResult = await syncExecutor.applyEvent({
            eventId: testPatientEventId, // already applied in test 2
            entityType: 'Patient',
            entityId: 'PAT-1001',
            operation: 'CREATE',
            payload: { _id: 'PAT-1001', name: 'Aarav Sharma' },
            version: 1000
        });

        assert.strictEqual(duplicateResult.skipped, true);
        assert.strictEqual(duplicateResult.reason, 'ALREADY_APPLIED');
        // Ensure local document was NOT reverted back to old name
        const localPatient = localStore.patients.get('PAT-1001');
        assert.strictEqual(localPatient.name, 'Aarav Sharma (VIP)');
    });

    // 5. Old version arrives after newer version -> Protected against stale updates
    await test('5. Old version arrives after newer version -> Stale event rejected and newer intact', async () => {
        const staleEventResult = await syncExecutor.applyEvent({
            eventId: 'EVT-STALE-999',
            entityType: 'Patient',
            entityId: 'PAT-1001',
            operation: 'UPDATE',
            payload: { _id: 'PAT-1001', name: 'Old Stale Name' },
            version: 1500 // less than current 2000
        });

        assert.strictEqual(staleEventResult.skipped, true);
        assert.strictEqual(staleEventResult.reason, 'STALE_VERSION');

        const localPatient = localStore.patients.get('PAT-1001');
        assert.strictEqual(localPatient.name, 'Aarav Sharma (VIP)', 'Must retain newer version data');
        assert.strictEqual(localPatient._cloudVersion, 2000);
    });

    // 6. Soft delete handling
    await test('6. Soft-delete operation -> Local record flagged inactive and deleted', async () => {
        const deleteEvent = await syncEventService.createSyncEvent({
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: 'PAT-1001',
            operation: 'DELETE',
            payload: { _id: 'PAT-1001' },
            version: 3000
        });

        const deleteResult = await syncExecutor.applyEvent({
            eventId: deleteEvent.eventId,
            entityType: deleteEvent.entityType,
            entityId: deleteEvent.entityId,
            operation: deleteEvent.operation,
            payload: deleteEvent.payload,
            version: deleteEvent.version
        });

        assert.strictEqual(deleteResult.applied, true);
        const localPatient = localStore.patients.get('PAT-1001');
        assert.strictEqual(localPatient.isActive, false);
        assert.strictEqual(localPatient._isDeleted, true);
        assert.strictEqual(localPatient._cloudVersion, 3000);
    });

    // 7. Durable Queue
    await test('7. Durable Queue -> Persistent queue with retry backoff and failure tracking', async () => {
        const queueEvents = [
            { eventId: 'EVT-Q-1', entityType: 'Doctor', entityId: 'DOC-1', operation: 'CREATE', version: 4000, payload: { name: 'Dr. Rao' } },
            { eventId: 'EVT-Q-2', entityType: 'Department', entityId: 'DEP-1', operation: 'CREATE', version: 4001, payload: { name: 'Cardiology' } }
        ];

        const enqueuedCount = await syncQueue.enqueue(queueEvents);
        assert.strictEqual(enqueuedCount, 2);

        const pending = await syncQueue.getPending(10);
        assert.strictEqual(pending.length, 2);

        // Mark 1 completed, 1 failed
        await syncQueue.markCompleted('EVT-Q-1');
        await syncQueue.markFailed('EVT-Q-2', 'Connection timeout');

        const failedItem = localStore.sync_queue.get('EVT-Q-2');
        assert.strictEqual(failedItem.status, 'FAILED');
        assert.strictEqual(failedItem.retryCount, 1);
        assert.strictEqual(failedItem.lastError, 'Connection timeout');
    });

    // 8. Multi-tenant isolation
    await test('8. Multi-tenant isolation -> Installation of Hospital A cannot fetch Hospital B data', async () => {
        // Create event for Hospital B
        await syncEventService.createSyncEvent({
            hospitalId: hospitalBId,
            entityType: 'Department',
            entityId: 'DEP-B-99',
            operation: 'CREATE',
            payload: { name: 'Secret Oncology Wing (Hospital B)' },
            version: 5000
        });

        // Request events for Installation A (Hospital A)
        const pendingForA = await syncEventService.getPendingEvents({
            hospitalId: hospitalAId,
            installationId: installationAId,
            afterVersion: 0
        });

        const hasHospitalBEvent = pendingForA.events.some(e => String(e.hospitalId) === String(hospitalBId));
        assert.strictEqual(hasHospitalBEvent, false, 'Hospital A must NEVER receive Hospital B data');
    });

    // 9. Sync Checkpoint / Cursor
    await test('9. Sync checkpoint / cursor -> Resumes from last processed version', async () => {
        const eventsSinceVersion = await syncEventService.getPendingEvents({
            hospitalId: hospitalAId,
            installationId: installationAId,
            afterVersion: 2500 // after version 2000
        });

        assert.ok(eventsSinceVersion.events.every(e => e.version > 2500), 'All returned events must be newer than cursor');
    });

    // 10. Acknowledgement pipeline
    await test('10. Acknowledgement pipeline -> Cloud tracks delivery and decrements pending', async () => {
        const ackResult = await syncEventService.acknowledgeEvents({
            hospitalId: hospitalAId,
            installationId: installationAId,
            acks: [
                { eventId: testPatientEventId, status: 'ACKNOWLEDGED', version: 1000 }
            ]
        });

        assert.strictEqual(ackResult.success, true);
        assert.strictEqual(ackResult.acknowledgedCount, 1);

        const cloudEvt = cloudEvents.find(e => e.eventId === testPatientEventId);
        const instAck = cloudEvt.installations.find(i => i.installationId === installationAId);
        assert.strictEqual(instAck.status, 'ACKNOWLEDGED');
        assert.ok(instAck.acknowledgedAt);
    });

    // 11. Initial Sync Chunking & Manifest
    await test('11. Initial sync chunking -> Memory-safe batch streaming across 7 entities', async () => {
        const initialResult = await initialSyncService.startInitialSync(hospitalAId, installationAId);
        assert.strictEqual(initialResult.success, true);
        assert.strictEqual(initialResult.status, 'IN_PROGRESS');
        assert.strictEqual(initialResult.entityOrder.length, 7);
        assert.strictEqual(initialResult.entityOrder[0], 'Hospital');
        assert.strictEqual(initialResult.entityOrder[6], 'Patient');

        // Test chunking for Department
        const batch = await initialSyncService.getInitialSyncBatch({
            hospitalId: hospitalAId,
            installationId: installationAId,
            entityType: 'Department',
            skip: 0,
            limit: 2
        });

        assert.strictEqual(batch.entityType, 'Department');
        assert.ok(Array.isArray(batch.records));
    });

    // 12. Partial initial sync recovery
    await test('12. Partial initial sync recovery -> Resumes safely and records progress', async () => {
        const progressResult = await initialSyncService.reportInitialSyncProgress({
            hospitalId: hospitalAId,
            installationId: installationAId,
            entityType: 'Department',
            syncedCount: 5,
            isCompleted: false
        });

        assert.strictEqual(progressResult.success, true);
        assert.strictEqual(progressResult.progress.Department.synced, 5);

        // Resume / complete
        const completedResult = await initialSyncService.reportInitialSyncProgress({
            hospitalId: hospitalAId,
            installationId: installationAId,
            entityType: 'Patient',
            syncedCount: 10,
            isCompleted: true
        });

        assert.strictEqual(completedResult.success, true);
        assert.strictEqual(completedResult.status, 'COMPLETED');
    });

    // 13. Scope Enforcement Guarantee
    await test('13. Scope enforcement guarantee -> Unauthorized financial / clinical entities are rejected', async () => {
        const forbiddenEntities = ['Payment', 'PaymentTransaction', 'Refund', 'ClinicalNote', 'Prescription', 'LabReport'];

        for (const ent of forbiddenEntities) {
            let errorCaught = false;
            try {
                await syncEventService.createSyncEvent({
                    hospitalId: hospitalAId,
                    entityType: ent,
                    entityId: 'TXN-123',
                    operation: 'CREATE',
                    payload: { amount: 5000 }
                });
            } catch (err) {
                errorCaught = true;
                assert.ok(err.message.includes('not supported in Phase 2 sync'));
            }
            assert.strictEqual(errorCaught, true, `Entity '${ent}' must be rejected in Phase 2 sync`);
        }
    });

    console.log('\n======================================================');
    console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
    console.log('======================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal Test Runner Exception:', err);
    process.exit(1);
});
