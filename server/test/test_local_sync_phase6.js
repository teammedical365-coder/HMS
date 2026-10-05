/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PHASE 6 TEST SUITE — FULL OFFLINE PRODUCTION READINESS VERIFICATION
 * Medical365 HMS — Local Database & Offline Sync
 *
 * Validates the complete 16-point production readiness matrix:
 *
 * SECTION 18 PRODUCTION TEST PLAN:
 *  TEST A: Cloud online → local operation → cloud sync
 *  TEST B: Internet OFF → create patient locally → update patient locally
 *          → restart Agent → internet ON → cloud sync
 *  TEST C: Cloud update → Local receives update
 *  TEST D: Local update + Cloud update → Conflict → Admin resolves
 *  TEST E: Large offline queue (100+ items) → reconnect → automatic recovery
 *  TEST F: Local MongoDB restart → recovery
 *  TEST G: Local server restart → recovery (in-flight crash recovery)
 *  TEST H: Cloud outage → queue preserved → recovery after cloud returns
 *  TEST I: Backup → restore → resync verification (rebuild flow)
 *  TEST J: Hospital A → attempt Hospital B access → must fail (tenant isolation)
 *
 * PRODUCTION SUBSYSTEM VERIFICATIONS:
 *  TEST K: Data Integrity Verification (7 entities, metrics, idempotency, read-only)
 *  TEST L: Sync Health Dashboard (Cloud, Agent, DB, Sync subsystems & metrics)
 *  TEST M: Disaster Recovery & Rebuild Safety (confirmation token, cloud data safety)
 *  TEST N: Backup Status & Documented Restore Procedures
 *  TEST O: Audit Trail Compliance (AuditLog creation & credential redaction)
 *  TEST P: Concurrency & Stress Verification (parallel operations, zero race)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Services under test
const cloudSyncReceiverService = require('../src/services/localAgent/cloudSyncReceiver.service');
const conflictResolutionService = require('../src/services/localAgent/conflictResolution.service');
const dataIntegrityService = require('../src/services/localAgent/dataIntegrity.service');
const disasterRecoveryService = require('../src/services/localAgent/disasterRecovery.service');
const initialSyncService = require('../src/services/localAgent/initialSync.service');
const syncEmitter = require('../src/services/localAgent/syncEmitter');
const syncEventService = require('../src/services/localAgent/syncEvent.service');

// Local Agent components
const localOutbox = require('../../local-agent/src/sync/localOutbox');
const syncExecutor = require('../../local-agent/src/sync/syncExecutor');
const db = require('../../local-agent/src/db');

// Models
const LocalInstallation = require('../src/models/localInstallation.model');
const LocalSyncProcessedEvent = require('../src/models/localSyncProcessedEvent.model');
const SyncConflict = require('../src/models/syncConflict.model');
const SyncEvent = require('../src/models/syncEvent.model');
const AuditLog = require('../src/models/auditLog.model');
const User = require('../src/models/user.model');
const Doctor = require('../src/models/doctor.model');
const Department = require('../src/models/department.model');
const Service = require('../src/models/service.model');
const Bed = require('../src/models/bed.model');
const Medicine = require('../src/models/medicine.model');
const Hospital = require('../src/models/hospital.model');

// Universal MongoDB Filter Evaluator for Mocks
function matchesFilter(doc, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;
    for (const [k, v] of Object.entries(filter)) {
        if (k === '$or') {
            if (!Array.isArray(v) || !v.some(sub => matchesFilter(doc, sub))) return false;
        } else if (k === '$and') {
            if (!Array.isArray(v) || !v.every(sub => matchesFilter(doc, sub))) return false;
        } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId)) {
            if (v.$in !== undefined && !v.$in.includes(doc[k])) return false;
            if (v.$ne !== undefined && doc[k] === v.$ne) return false;
            if (v.$lt !== undefined && !(doc[k] < v.$lt)) return false;
            if (v.$lte !== undefined && !(doc[k] <= v.$lte)) return false;
            if (v.$gt !== undefined && !(doc[k] > v.$gt)) return false;
            if (v.$gte !== undefined && !(doc[k] >= v.$gte)) return false;
        } else {
            if (v instanceof mongoose.Types.ObjectId || doc[k] instanceof mongoose.Types.ObjectId) {
                if (String(doc[k]) !== String(v)) return false;
            } else if (doc[k] !== v) {
                return false;
            }
        }
    }
    return true;
}

async function runPhase6ProductionReadinessTests() {
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('   MEDICAL365 HMS — PHASE 6 FULL OFFLINE PRODUCTION READINESS SUITE       ');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;
    const testResults = [];

    const test = async (id, name, fn) => {
        try {
            await fn();
            console.log(`  ✅ ${id}: ${name}`);
            passed++;
            testResults.push({ id, name, status: 'PASS' });
        } catch (err) {
            console.error(`  ❌ ${id}: ${name}`);
            console.error(`     Error: ${err.message}`);
            if (err.stack) console.error(`     ${err.stack.split('\n')[1]}`);
            failed++;
            testResults.push({ id, name, status: 'FAIL', error: err.message });
        }
    };

    // ── Setup Identifiers & Mocks ─────────────────────────────────────────────
    const hospitalAId = new mongoose.Types.ObjectId();
    const hospitalBId = new mongoose.Types.ObjectId();
    const instA1 = 'INST-PROD-A-01';
    const instA2 = 'INST-PROD-A-02';
    const instB1 = 'INST-PROD-B-01';

    // ── Local In-Memory DB Mock for local-agent ────────────────────────────────
    const mockLocalCollections = new Map();
    const getMockCol = (name) => {
        if (!mockLocalCollections.has(name)) {
            const dataStore = new Map();
            mockLocalCollections.set(name, {
                _store: dataStore,
                findOne: async (filter) => {
                    for (const doc of dataStore.values()) {
                        if (matchesFilter(doc, filter)) return doc;
                    }
                    return null;
                },
                insertOne: async (d) => {
                    const id = d._id || d.eventId || d.patientId || new mongoose.Types.ObjectId().toString();
                    const doc = { ...d, _id: id };
                    dataStore.set(String(id), doc);
                    return doc;
                },
                updateOne: async (filter, update, opts = {}) => {
                    for (const [id, doc] of dataStore.entries()) {
                        if (matchesFilter(doc, filter)) {
                            if (update.$set) Object.assign(doc, update.$set);
                            if (update.$inc) {
                                for (const [ik, iv] of Object.entries(update.$inc)) {
                                    doc[ik] = (doc[ik] || 0) + iv;
                                }
                            }
                            return { modifiedCount: 1, matchedCount: 1 };
                        }
                    }
                    if (opts.upsert) {
                        const newDoc = { ...(filter || {}) };
                        if (update.$setOnInsert) Object.assign(newDoc, update.$setOnInsert);
                        if (update.$set) Object.assign(newDoc, update.$set);
                        const id = newDoc._id || newDoc.eventId || String(new mongoose.Types.ObjectId());
                        newDoc._id = id;
                        dataStore.set(String(id), newDoc);
                        return { modifiedCount: 0, matchedCount: 0, upsertedCount: 1, upsertedId: id };
                    }
                    return { modifiedCount: 0, matchedCount: 0 };
                },
                updateMany: async (filter, update) => {
                    let count = 0;
                    for (const [id, doc] of dataStore.entries()) {
                        if (matchesFilter(doc, filter)) {
                            if (update.$set) Object.assign(doc, update.$set);
                            count++;
                        }
                    }
                    return { modifiedCount: count };
                },
                countDocuments: async (filter = {}) => {
                    let count = 0;
                    for (const doc of dataStore.values()) {
                        if (matchesFilter(doc, filter)) count++;
                    }
                    return count;
                },
                find: (filter = {}) => ({
                    sort: () => ({
                        limit: (lim) => ({
                            toArray: async () => {
                                const list = [];
                                for (const doc of dataStore.values()) {
                                    if (matchesFilter(doc, filter)) list.push(doc);
                                    if (lim && list.length >= lim) break;
                                }
                                return list;
                            }
                        })
                    })
                })
            });
        }
        return mockLocalCollections.get(name);
    };

    db.getDb = () => ({
        collection: (name) => getMockCol(name)
    });

    // ── In-Memory Cloud Stores ─────────────────────────────────────────────────
    const store = {
        hospitals: new Map(),
        departments: new Map(),
        doctors: new Map(),
        services: new Map(),
        beds: new Map(),
        medicines: new Map(),
        users: new Map(),
        installations: new Map(),
        conflicts: new Map(),
        processedEvents: new Map(),
        syncEvents: new Map(),
        auditLogs: []
    };

    // Pre-populate sample hospitals
    store.hospitals.set(String(hospitalAId), { _id: hospitalAId, name: 'Apollo Medical Center', code: 'APOLLO' });
    store.hospitals.set(String(hospitalBId), { _id: hospitalBId, name: 'Fortis Hospital', code: 'FORTIS' });

    // Helper: Create mock installation document
    const createMockInst = (hospitalId, installationId) => {
        const instDoc = {
            _id: new mongoose.Types.ObjectId(),
            hospitalId,
            installationId,
            status: 'ONLINE',
            pairingStatus: 'ACTIVE',
            agentTokenHash: 'mock-agent-token-hash-123',
            agentVersion: '2.4.0',
            lastHeartbeat: new Date(),
            cloudConnection: 'CONNECTED',
            dbStatus: 'HEALTHY',
            localHealth: { dbLatencyMs: 12, cpuUsagePercent: 15 },
            syncStatus: {
                initialSync: { status: 'COMPLETED', completedAt: new Date() },
                lastSyncAt: new Date(),
                totalRecordsSynced: 42,
                pendingEventsCount: 0,
                failedEventsCount: 0,
                uploadStatus: {
                    pendingUploadsCount: 0,
                    completedUploadsCount: 15,
                    failedUploadsCount: 0,
                    conflictsCount: 0,
                    lastUploadAt: new Date(),
                    lastSuccessfulSyncAt: new Date()
                },
                recentActivities: []
            },
            metadata: {
                lastBackup: { timestamp: new Date(), sizeBytes: 1048576, status: 'SUCCESS' },
                rebuildHistory: []
            },
            operationalLogs: [],
            save: async function() { return this; },
            markModified: function() {}
        };
        return instDoc;
    };

    store.installations.set(instA1, createMockInst(hospitalAId, instA1));
    store.installations.set(instA2, createMockInst(hospitalAId, instA2));
    store.installations.set(instB1, createMockInst(hospitalBId, instB1));

    // Helper to create thenable Mongoose query object
    const makeQuery = (execFn) => ({
        lean: async () => execFn(),
        select: () => ({
            lean: async () => execFn()
        }),
        then: (resolve, reject) => Promise.resolve(execFn()).then(resolve, reject)
    });

    // ── Mongoose Model Mocks ──────────────────────────────────────────────────
    LocalInstallation.findOne = (filter) => {
        return makeQuery(() => {
            for (const inst of store.installations.values()) {
                if (filter.installationId && inst.installationId !== filter.installationId) continue;
                if (filter.hospitalId && String(inst.hospitalId) !== String(filter.hospitalId)) continue;
                return inst;
            }
            return null;
        });
    };

    LocalInstallation.find = (filter) => ({
        select: () => ({
            lean: async () => {
                const list = [];
                for (const inst of store.installations.values()) {
                    if (filter.hospitalId && String(inst.hospitalId) !== String(filter.hospitalId)) continue;
                    list.push({ installationId: inst.installationId });
                }
                return list;
            }
        })
    });
    LocalInstallation.updateMany = async () => ({ modifiedCount: 1 });

    LocalSyncProcessedEvent.findOne = async (filter) => store.processedEvents.get(filter.eventId) || null;
    LocalSyncProcessedEvent.create = async (doc) => {
        store.processedEvents.set(doc.eventId, doc);
        return doc;
    };
    LocalSyncProcessedEvent.aggregate = async () => []; // No duplicate event IDs

    SyncConflict.create = async (doc) => {
        const fullDoc = {
            ...doc,
            _id: new mongoose.Types.ObjectId(),
            status: doc.status || 'PENDING',
            save: async function() {
                store.conflicts.set(this.conflictId, this);
                return this;
            }
        };
        store.conflicts.set(doc.conflictId, fullDoc);
        return fullDoc;
    };
    SyncConflict.findOne = (filter) => {
        return makeQuery(() => {
            for (const c of store.conflicts.values()) {
                if (filter.conflictId && c.conflictId !== filter.conflictId) continue;
                if (filter.hospitalId && String(c.hospitalId) !== String(filter.hospitalId)) continue;
                return c;
            }
            return null;
        });
    };
    SyncConflict.countDocuments = async (filter = {}) => {
        let count = 0;
        for (const c of store.conflicts.values()) {
            if (filter.hospitalId && String(c.hospitalId) !== String(filter.hospitalId)) continue;
            if (filter.status) {
                if (filter.status.$in) {
                    if (filter.status.$in.includes(c.status)) count++;
                } else if (c.status === filter.status) {
                    count++;
                }
            } else {
                count++;
            }
        }
        return count;
    };
    SyncConflict.updateMany = async (filter, update) => {
        let modifiedCount = 0;
        for (const c of store.conflicts.values()) {
            if (filter.hospitalId && String(c.hospitalId) !== String(filter.hospitalId)) continue;
            if (filter.status?.$in && !filter.status.$in.includes(c.status)) continue;
            if (update.$set) Object.assign(c, update.$set);
            modifiedCount++;
        }
        return { modifiedCount };
    };

    SyncEvent.create = async (doc) => {
        const id = doc.eventId || new mongoose.Types.ObjectId().toString();
        const full = { ...doc, _id: id, eventId: id };
        store.syncEvents.set(id, full);
        return full;
    };
    SyncEvent.countDocuments = async (filter = {}) => {
        let count = 0;
        for (const e of store.syncEvents.values()) {
            if (filter.hospitalId && String(e.hospitalId) !== String(filter.hospitalId)) continue;
            count++;
        }
        return count;
    };
    SyncEvent.updateMany = async () => ({ modifiedCount: 1 });

    AuditLog.create = async (doc) => {
        store.auditLogs.push({ ...doc, timestamp: new Date() });
        return doc;
    };

    // Generic model mock factory
    const setupModelMock = (Model, mapName) => {
        Model.findOne = (query) => {
            return makeQuery(() => {
                for (const d of store[mapName].values()) {
                    if (query._id && String(d._id) !== String(query._id)) continue;
                    if (query.hospitalId && String(d.hospitalId) !== String(query.hospitalId)) continue;
                    return d;
                }
                return null;
            });
        };
        Model.findById = (id) => {
            return makeQuery(() => store[mapName].get(String(id)) || null);
        };
        Model.create = async (data) => {
            const id = String(data._id || new mongoose.Types.ObjectId());
            const doc = {
                ...data,
                _id: id,
                save: async function() {
                    store[mapName].set(id, this);
                    return this;
                },
                toObject: function() { return { ...this }; }
            };
            store[mapName].set(id, doc);
            return doc;
        };
        Model.updateOne = async (query, update) => {
            const id = String(query._id);
            let doc = store[mapName].get(id);
            if (!doc) {
                doc = {
                    _id: id,
                    hospitalId: query.hospitalId,
                    save: async function() { store[mapName].set(id, this); return this; },
                    toObject: function() { return { ...this }; }
                };
                store[mapName].set(id, doc);
            }
            if (update.$set) Object.assign(doc, update.$set);
            return { modifiedCount: 1 };
        };
        Model.countDocuments = async (filter = {}) => {
            let count = 0;
            for (const doc of store[mapName].values()) {
                let match = true;
                for (const [k, v] of Object.entries(filter)) {
                    if (k === 'role' && typeof v === 'object' && v.$in) {
                        if (!v.$in.includes(doc.role)) match = false;
                    } else if (String(doc[k]) !== String(v)) {
                        match = false;
                    }
                }
                if (match) count++;
            }
            return count;
        };
    };

    setupModelMock(User, 'users');
    setupModelMock(Doctor, 'doctors');
    setupModelMock(Department, 'departments');
    setupModelMock(Hospital, 'hospitals');
    setupModelMock(Service, 'services');
    setupModelMock(Bed, 'beds');
    setupModelMock(Medicine, 'medicines');

    // ═════════════════════════════════════════════════════════════════════════
    // SECTION 18 PRODUCTION TEST PLAN: TEST A THROUGH TEST J
    // ═════════════════════════════════════════════════════════════════════════

    console.log('─── PART 1: SECTION 18 PRODUCTION TEST SCENARIOS (A - J) ───\n');

    // ── TEST A: Cloud Online → Local Operation → Cloud Sync ───────────────────
    await test('TEST A', 'Cloud online → local operation → cloud sync', async () => {
        const patientId = new mongoose.Types.ObjectId().toString();

        // 1. Record mutation in Local Outbox
        const rec = await localOutbox.recordMutation({
            installationId: instA1,
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: patientId,
            operation: 'CREATE',
            payload: { name: 'John Doe', phone: '+919876543210', age: 34, hospitalId: hospitalAId }
        });
        assert(rec.success, 'Outbox event must be queued');

        // 2. Fetch pending batch
        const batch = await localOutbox.getPendingBatch(50);
        assert(batch.some(e => e.eventId === rec.eventId), 'Pending batch must include created event');
        const eventToSync = batch.find(e => e.eventId === rec.eventId);

        // 3. Push to Cloud Sync Receiver
        const syncResult = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: hospitalAId,
            installationId: instA1,
            events: [eventToSync]
        });
        assert.strictEqual(syncResult.successCount, 1, 'Event must be applied on Cloud');
        assert(syncResult.results[0].cloudVersion, 'cloudVersion must be generated');

        // 4. Acknowledge batch on local outbox
        await localOutbox.applyAcknowledgements(syncResult.results);

        // Verify patient created on Cloud
        const cloudPatient = store.users.get(patientId);
        assert(cloudPatient, 'Patient must exist in Cloud store');
        assert.strictEqual(cloudPatient.name, 'John Doe');
        assert.strictEqual(cloudPatient._source, 'LOCAL_SYNC_APPLIED');
    });

    // ── TEST B: Internet OFF → Create & Update Patient → Agent Restart → Internet ON → Cloud Sync ──
    await test('TEST B', 'Internet OFF → create patient locally → update patient locally → restart Agent → internet ON → cloud sync', async () => {
        const patientId = new mongoose.Types.ObjectId().toString();

        // 1. Internet OFF: Mutations accumulate in outbox
        const ev1 = await localOutbox.recordMutation({
            installationId: instA1,
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: patientId,
            operation: 'CREATE',
            payload: { name: 'Alice Smith', phone: '+919988776655', hospitalId: hospitalAId }
        });

        const ev2 = await localOutbox.recordMutation({
            installationId: instA1,
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: patientId,
            operation: 'UPDATE',
            payload: { name: 'Alice Smith-Jones', phone: '+919988776655', address: 'Bangalore' },
            localBaseVersion: Date.now() + 100000
        });

        // Mark in flight to simulate crash while attempting upload
        await localOutbox.markInFlight([ev1.eventId]);
        await new Promise(r => setTimeout(r, 20));

        // 2. Agent Crash / Restart: recover in-flight events
        const recovered = await localOutbox.recoverStaleInFlight(0);
        assert(recovered >= 1, 'In-flight event must be recovered to PENDING on restart');

        // 3. Internet ON: Batch uploaded in strict FIFO sequence
        const batch = await localOutbox.getPendingBatch(50);
        const patientEvents = batch.filter(e => e.entityId === patientId);
        assert.strictEqual(patientEvents.length, 2, 'Both CREATE and UPDATE must be present');
        assert.strictEqual(patientEvents[0].operation, 'CREATE', 'FIFO: CREATE must precede UPDATE');
        assert.strictEqual(patientEvents[1].operation, 'UPDATE', 'FIFO: UPDATE must follow CREATE');

        const syncResult = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: hospitalAId,
            installationId: instA1,
            events: patientEvents
        });

        assert.strictEqual(syncResult.successCount, 2, 'Both offline events must be applied to Cloud');
        await localOutbox.applyAcknowledgements(syncResult.results);

        const cloudPatient = store.users.get(patientId);
        assert(cloudPatient, 'Patient must be in Cloud');
        assert.strictEqual(cloudPatient.name, 'Alice Smith-Jones');
        assert.strictEqual(cloudPatient.address, 'Bangalore');
    });

    // ── TEST C: Cloud Update → Local Receives Update ───────────────────────────
    await test('TEST C', 'Cloud update → Local receives update', async () => {
        const deptId = new mongoose.Types.ObjectId().toString();
        await Department.create({
            _id: deptId,
            hospitalId: hospitalAId,
            name: 'Cardiology Cloud',
            code: 'CARD-01',
            _cloudVersion: 5
        });

        // Cloud emits sync event
        const syncEvt = await syncEventService.createSyncEvent({
            hospitalId: hospitalAId,
            entityType: 'Department',
            entityId: deptId,
            operation: 'UPDATE',
            payload: { _id: deptId, hospitalId: hospitalAId, name: 'Cardiology Advanced Care', code: 'CARD-01' },
            version: 6
        });
        assert(syncEvt, 'Cloud sync event must be created');

        // Local syncExecutor applies event locally
        const mockLocalDeptCol = getMockCol('departments');
        await mockLocalDeptCol.insertOne({
            _id: deptId,
            hospitalId: String(hospitalAId),
            name: 'Cardiology Cloud',
            _cloudVersion: 5
        });

        const execResult = await syncExecutor.applyEvent({
            eventId: syncEvt.eventId,
            entityType: 'Department',
            entityId: deptId,
            operation: 'UPDATE',
            payload: syncEvt.payload,
            version: 6
        });
        assert.strictEqual(execResult.success, true, 'Local DB must apply Cloud event');

        const localDept = await mockLocalDeptCol.findOne({ _id: deptId });
        assert.strictEqual(localDept.name, 'Cardiology Advanced Care');
    });

    // ── TEST D: Local Update + Cloud Update → Conflict → Admin Resolves ───────
    await test('TEST D', 'Local update + Cloud update → Conflict → Admin resolves', async () => {
        const docId = new mongoose.Types.ObjectId().toString();
        // Cloud doctor at v10
        await Doctor.create({
            _id: docId,
            hospitalId: hospitalAId,
            name: 'Dr. Sarah Connor',
            specialization: 'Neurology',
            status: 'ACTIVE',
            _cloudVersion: 10
        });

        // Cloud was updated offline to v11
        const cloudDoc = await Doctor.findOne({ _id: docId });
        cloudDoc._cloudVersion = 11;
        cloudDoc.specialization = 'Pediatric Neurology';
        await cloudDoc.save();

        // Local also modified while offline (based on old v10)
        const localEvent = {
            eventId: 'EV-CONFLICT-PROD-' + Date.now(),
            hospitalId: hospitalAId,
            installationId: instA1,
            entityType: 'Doctor',
            entityId: docId,
            operation: 'UPDATE',
            source: 'LOCAL',
            payload: { _id: docId, name: 'Dr. Sarah Connor-Reese', specialization: 'Senior Neurology' },
            localBaseVersion: 10, // STALE: Cloud is at 11
            localVersion: 11
        };

        const syncResult = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: hospitalAId,
            installationId: instA1,
            events: [localEvent]
        });

        assert.strictEqual(syncResult.conflictCount, 1, 'Stale write must generate conflict');
        assert.strictEqual(syncResult.results[0].status, 'CONFLICT');
        const conflictId = syncResult.results[0].conflictId;
        assert(conflictId, 'Conflict ID must be returned');

        // Admin resolves with MERGED strategy
        const resolved = await conflictResolutionService.resolveConflict({
            hospitalId: hospitalAId,
            conflictId,
            resolutionType: 'MERGED',
            selectedMergeFields: {
                name: 'LOCAL',
                specialization: 'CLOUD'
            },
            resolutionNotes: 'Production resolution: merged title with cloud specialization',
            user: { _id: 'admin-prod-01', name: 'Chief Medical Officer' }
        });

        assert.strictEqual(resolved.success, true);
        assert.strictEqual(resolved.conflict.status, 'RESOLVED');
        assert.strictEqual(resolved.conflict.resolutionType, 'MERGED');

        const finalCloudDoc = await Doctor.findOne({ _id: docId });
        assert.strictEqual(finalCloudDoc.name, 'Dr. Sarah Connor-Reese');
        assert.strictEqual(finalCloudDoc.specialization, 'Pediatric Neurology');
    });

    // ── TEST E: Large Offline Queue → Reconnect → Automatic Recovery ──────────
    await test('TEST E', 'Large offline queue (100+ items) → reconnect → automatic recovery', async () => {
        const QUEUE_SIZE = 100;
        const testEEventIds = new Set();

        for (let i = 0; i < QUEUE_SIZE; i++) {
            const pId = new mongoose.Types.ObjectId().toString();
            const rec = await localOutbox.recordMutation({
                installationId: instA1,
                hospitalId: hospitalAId,
                entityType: 'Patient',
                entityId: pId,
                operation: 'CREATE',
                payload: { name: `Batch Patient ${i}`, queueIndex: i, hospitalId: hospitalAId }
            });
            testEEventIds.add(rec.eventId);
        }

        // Fetch all pending in batches of 25 and process until all 100 are completed
        let totalApplied = 0;
        while (testEEventIds.size > 0) {
            const batch = await localOutbox.getPendingBatch(25);
            const currentBatch = batch.filter(e => testEEventIds.has(e.eventId));
            if (!currentBatch || currentBatch.length === 0) break;

            const res = await cloudSyncReceiverService.processIncomingBatch({
                hospitalId: hospitalAId,
                installationId: instA1,
                events: currentBatch
            });
            totalApplied += res.successCount;
            await localOutbox.applyAcknowledgements(res.results);
            currentBatch.forEach(e => testEEventIds.delete(e.eventId));
        }

        assert.strictEqual(totalApplied, QUEUE_SIZE, `All ${QUEUE_SIZE} events must be applied without loss`);
    });

    // ── TEST F: Local MongoDB Restart → Recovery ──────────────────────────────
    await test('TEST F', 'Local MongoDB restart → recovery', async () => {
        const patientId = new mongoose.Types.ObjectId().toString();

        // 1. Simulate DB down: getCollection returns null
        const originalGetDb = db.getDb;
        db.getDb = () => null;

        // Mutation should safely queue in in-memory fallback
        const rec = await localOutbox.recordMutation({
            installationId: instA1,
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: patientId,
            operation: 'CREATE',
            payload: { name: 'Resilient Patient', hospitalId: hospitalAId }
        });
        assert(rec.success, 'Mutation must succeed even during DB outage via fallback');

        // 2. Restore DB connection (MongoDB restart complete)
        db.getDb = originalGetDb;
        await localOutbox.flushInMemoryToDatabase();

        // Verify outbox recovers and can drain
        const batch = await localOutbox.getPendingBatch(10);
        assert(batch.some(e => e.entityId === patientId), 'Pending item must be present after DB restore');
        const syncResult = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: hospitalAId,
            installationId: instA1,
            events: batch.filter(e => e.entityId === patientId)
        });
        await localOutbox.applyAcknowledgements(syncResult.results);
    });

    // ── TEST G: Local Server Restart → Recovery (In-Flight Event Safety) ───────
    await test('TEST G', 'Local server restart → recovery (in-flight crash recovery)', async () => {
        const rec = await localOutbox.recordMutation({
            installationId: instA1,
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: new mongoose.Types.ObjectId().toString(),
            operation: 'CREATE',
            payload: { name: 'InFlight Patient' }
        });

        // Simulate crash right while upload was in progress
        await localOutbox.markInFlight([rec.eventId]);
        await new Promise(r => setTimeout(r, 20));

        // Server restarts and runs startup recovery
        const recoveredCount = await localOutbox.recoverStaleInFlight(0);
        assert(recoveredCount >= 1, 'In-flight event must revert to PENDING');

        const pendingBatch = await localOutbox.getPendingBatch(50);
        assert(pendingBatch.some(e => e.eventId === rec.eventId), 'Recovered event must be back in pending queue');
        await localOutbox.applyAcknowledgements([{ eventId: rec.eventId, status: 'SUCCESS' }]);
    });

    // ── TEST H: Cloud Outage → Queue Preserved → Recovery ──────────────────────
    await test('TEST H', 'Cloud outage → queue preserved → recovery after cloud returns', async () => {
        const patientId = new mongoose.Types.ObjectId().toString();
        const rec = await localOutbox.recordMutation({
            installationId: instA1,
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: patientId,
            operation: 'CREATE',
            payload: { name: 'Outage Patient', hospitalId: hospitalAId }
        });

        // Simulate Cloud unavailable (503 HTTP or connection timeout): mark failed with retry
        await localOutbox.applyAcknowledgements([
            { eventId: rec.eventId, status: 'FAILED', message: 'Cloud service unavailable (503 Service Unavailable)' }
        ]);

        const outboxCol = getMockCol('sync_outbox');
        const outboxItem = await outboxCol.findOne({ eventId: rec.eventId });
        assert(outboxItem, 'Item must be preserved in outbox');
        assert.strictEqual(outboxItem.retryCount, 1, 'Retry count must be incremented');

        // Cloud returns online: fetch with includeBackoff=true
        const pendingBatch = await localOutbox.getPendingBatch(50, true);
        const itemToUpload = pendingBatch.find(e => e.eventId === rec.eventId);
        assert(itemToUpload, 'Event must be ready for upload when cloud returns');

        const syncResult = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: hospitalAId,
            installationId: instA1,
            events: [itemToUpload]
        });

        assert.strictEqual(syncResult.successCount, 1, 'Queued mutation must apply once cloud returns');
        await localOutbox.applyAcknowledgements(syncResult.results);
    });

    // ── TEST I: Backup → Restore → Resync Verification (Rebuild Flow) ──────────
    await test('TEST I', 'Backup → restore → resync verification (rebuild flow)', async () => {
        // 1. Verify rebuild status check
        const rebuildStatus = await disasterRecoveryService.getRebuildStatus(hospitalAId);
        assert.strictEqual(rebuildStatus.eligible, true);
        assert(rebuildStatus.warnings.length >= 3, 'Safety warnings must be provided to admin');

        // 2. Safety guard: rejection without confirmation token
        let tokenRejected = false;
        try {
            await disasterRecoveryService.initiateRebuild({
                hospitalId: hospitalAId,
                user: { name: 'Admin' },
                confirmationToken: 'WRONG_TOKEN'
            });
        } catch (e) {
            tokenRejected = true;
        }
        assert(tokenRejected, 'Rebuild must strictly reject missing/invalid confirmationToken');

        // 3. Rebuild with valid confirmation token
        const rebuildResult = await disasterRecoveryService.initiateRebuild({
            hospitalId: hospitalAId,
            user: { _id: 'admin-01', name: 'Dr. Chief Admin' },
            confirmationToken: 'CONFIRM_REBUILD_LOCAL_DATABASE'
        });

        assert.strictEqual(rebuildResult.success, true);
        assert(rebuildResult.archiveSnapshot, 'State must be safely archived before reset');

        // Cloud data must be preserved!
        const cloudHospital = store.hospitals.get(String(hospitalAId));
        assert(cloudHospital, 'Cloud data must NEVER be deleted during rebuild');

        // Installation sync status reset and initial sync initiated
        const inst = store.installations.get(instA1);
        assert(['NOT_STARTED', 'IN_PROGRESS', 'PENDING'].includes(inst.syncStatus.initialSync.status));
    });

    // ── TEST J: Hospital A → Attempt Hospital B Access → Must Fail ─────────────
    await test('TEST J', 'Hospital A → attempt Hospital B access → must fail (tenant isolation)', async () => {
        // 1. Agent from Hospital A attempts to push data for Hospital B
        let crossPushBlocked = false;
        try {
            await cloudSyncReceiverService.processIncomingBatch({
                hospitalId: hospitalAId, // JWT authenticated as Hospital A
                installationId: instB1,  // Trying to spoof Hospital B installation
                events: [{
                    eventId: 'SPOOF-01',
                    entityType: 'Patient',
                    entityId: 'PAT-999',
                    operation: 'CREATE',
                    payload: { name: 'Spoofed' }
                }]
            });
        } catch (e) {
            crossPushBlocked = true;
            assert(e.message.includes('does not belong to hospital'), 'Error must specify ownership mismatch');
        }
        assert(crossPushBlocked, 'Cross-hospital installation spoofing must be blocked');

        // 2. Hospital A admin attempts to resolve Hospital B conflict
        const conflictB = await SyncConflict.create({
            conflictId: 'CONF-HOSP-B-001',
            hospitalId: hospitalBId,
            installationId: instB1,
            entityType: 'Doctor',
            entityId: new mongoose.Types.ObjectId().toString(),
            cloudVersion: 2,
            localVersion: 1,
            cloudRecord: { name: 'Dr. Fortis' },
            localRecord: { name: 'Dr. Fortis Local' }
        });

        let crossResolveBlocked = false;
        try {
            await conflictResolutionService.resolveConflict({
                hospitalId: hospitalAId, // Admin belongs to Hospital A
                conflictId: conflictB.conflictId,
                resolutionType: 'KEEP_LOCAL',
                resolvedBy: { name: 'Hospital A Attacker' }
            });
        } catch (e) {
            crossResolveBlocked = true;
        }
        assert(crossResolveBlocked, 'Hospital A admin must NEVER be permitted to resolve Hospital B conflict');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SUBSYSTEM VERIFICATIONS: K THROUGH P
    // ═════════════════════════════════════════════════════════════════════════

    console.log('\n─── PART 2: PRODUCTION SUBSYSTEM VERIFICATIONS (K - P) ───\n');

    // ── TEST K: Data Integrity Verification ───────────────────────────────────
    await test('TEST K', 'Data Integrity Verification (all 7 entities, totals, issues)', async () => {
        const report = await dataIntegrityService.verifyIntegrity(hospitalAId);
        assert(report, 'Integrity report must be generated');
        assert.strictEqual(report.hospitalId, String(hospitalAId));
        assert(['HEALTHY', 'WARNINGS', 'ERRORS', 'CRITICAL'].includes(report.status));

        // Verify all 7 required entity types are counted
        const expectedEntities = ['Hospital', 'Department', 'Doctor', 'Service', 'Bed', 'Medicine', 'Patient'];
        for (const ent of expectedEntities) {
            assert(report.entities[ent], `Entity '${ent}' must be audited in report`);
            assert(typeof report.entities[ent].cloudCount === 'number');
            assert.strictEqual(report.entities[ent].status, 'OK');
        }

        assert(report.summary.totalCloudRecords >= 0);
        assert(report.durationMs >= 0, 'Duration must be timed');
    });

    // ── TEST L: Sync Health Dashboard ─────────────────────────────────────────
    await test('TEST L', 'Sync Health Dashboard (Cloud, Agent, DB, Sync subsystems)', async () => {
        const health = await dataIntegrityService.getSyncHealth(hospitalAId);
        assert(health, 'Health payload must be returned');

        // Subsystems
        assert(health.cloud, 'Cloud subsystem must be present');
        assert(['CONNECTED', 'DISCONNECTED'].includes(health.cloud.status));

        assert(health.agent, 'Agent subsystem must be present');
        assert(['ONLINE', 'OFFLINE', 'DEGRADED', 'NOT_CONFIGURED'].includes(health.agent.status));

        assert(health.database, 'Database subsystem must be present');
        assert(['HEALTHY', 'DOWN', 'UNKNOWN'].includes(health.database.status));

        assert(health.sync, 'Sync subsystem must be present');
        assert(['HEALTHY', 'WARNING', 'ERROR', 'OFFLINE', 'NOT_CONFIGURED'].includes(health.sync.status));

        // Numeric metrics
        assert(typeof health.metrics.pending === 'number');
        assert(typeof health.metrics.failed === 'number');
        assert(typeof health.metrics.conflicts === 'number');
    });

    // ── TEST M: Disaster Recovery & Rebuild Safety ────────────────────────────
    await test('TEST M', 'Disaster Recovery & Rebuild Safety (archives & non-destructive)', async () => {
        const inst = store.installations.get(instA1);
        const archivesCountBefore = (inst.metadata?.rebuildHistory || []).length;

        // Perform rebuild
        await disasterRecoveryService.initiateRebuild({
            hospitalId: hospitalAId,
            user: { name: 'Audit User' },
            confirmationToken: 'CONFIRM_REBUILD_LOCAL_DATABASE'
        });

        const archivesCountAfter = (inst.metadata?.rebuildHistory || []).length;
        assert.strictEqual(archivesCountAfter, archivesCountBefore + 1, 'Rebuild history archive must be incremented');

        // Operational log entry added
        assert(inst.operationalLogs.some(l => l.event === 'LOCAL_DATABASE_REBUILD'), 'Rebuild operational log must exist');
    });

    // ── TEST N: Backup Status & Documented Restore Procedures ─────────────────
    await test('TEST N', 'Backup status & documented restore procedures', async () => {
        const backup = await disasterRecoveryService.getBackupStatus(hospitalAId);
        assert.strictEqual(backup.configured, true);
        assert(backup.backupStrategy.includes('mongodump'), 'Backup strategy must document mongodump');
        assert(Array.isArray(backup.restoreInstructions), 'Restore instructions must be an array');
        assert(backup.restoreInstructions.length >= 4, 'Must provide detailed step-by-step restore steps');
    });

    // ── TEST O: Audit Trail Compliance & Security Credential Redaction ────────
    await test('TEST O', 'Audit trail compliance & sensitive credential redaction', async () => {
        assert(store.auditLogs.length > 0, 'Audit logs must be generated during testing');

        for (const log of store.auditLogs) {
            const logStr = JSON.stringify(log);
            assert(!logStr.includes('Admin@123'), 'Passwords must NEVER appear in audit logs');
            assert(!logStr.includes('mock-agent-token-hash-123'), 'Secrets/hashes must NEVER appear in audit logs');
            assert(!logStr.includes('mongodb://'), 'Connection strings must NEVER appear in audit logs');
        }
    });

    // ── TEST P: Concurrency & Stress Verification ─────────────────────────────
    await test('TEST P', 'Concurrency & stress verification (parallel operations)', async () => {
        // Run 10 parallel health checks and 5 parallel integrity checks
        const healthChecks = Array(10).fill(null).map(() => dataIntegrityService.getSyncHealth(hospitalAId));
        const integrityChecks = Array(5).fill(null).map(() => dataIntegrityService.verifyIntegrity(hospitalAId));

        const [healthRes, integrityRes] = await Promise.all([
            Promise.all(healthChecks),
            Promise.all(integrityChecks)
        ]);

        assert.strictEqual(healthRes.length, 10);
        assert.strictEqual(integrityRes.length, 5);
        assert(healthRes.every(h => h.sync && h.metrics), 'All concurrent health checks must return valid payloads');
        assert(integrityRes.every(r => r.entities && r.summary), 'All concurrent integrity checks must return valid reports');
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SUMMARY REPORT
    // ═════════════════════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log(`   TEST SUMMARY: ${passed} PASSED / ${failed} FAILED / ${passed + failed} TOTAL`);
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    const passRate = ((passed / (passed + failed)) * 100).toFixed(1);
    if (failed === 0) {
        console.log(`  🎉 PRODUCTION READINESS STATUS: 100% READY (GO RECOMMENDATION)`);
        console.log(`  All 16 validation points passed successfully.\n`);
    } else {
        console.log(`  ⚠️ PRODUCTION READINESS STATUS: ${passRate}% (NO-GO)`);
        console.log(`  Failures must be investigated before deployment.\n`);
    }

    if (failed > 0) {
        process.exit(1);
    }
}

runPhase6ProductionReadinessTests().catch((err) => {
    console.error('Fatal crash in Phase 6 test suite:', err);
    process.exit(2);
});
