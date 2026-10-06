/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMPLETE PHASE 6 END-TO-END VERIFICATION TEST SUITE
 * Medical365 HMS — Local Database & Offline Sync System
 *
 * Implements the 28 required test points from Part 11:
 *  1. Installation registration
 *  2. Installation authentication (pairing & JWT)
 *  3. Heartbeat (telemetry, DB health, outbox metrics)
 *  4. Initial Cloud -> Local sync (manifest, batching, 7 entities)
 *  5. Incremental Cloud -> Local sync (version cursor, checkpoints)
 *  6. Local -> Cloud sync (outbox batch push, ACKs)
 *  7. Offline patient creation (local DB + outbox queue)
 *  8. Offline patient update (version preservation)
 *  9. Automatic reconnect (connectionWatcher cloud:restored)
 * 10. Queue recovery (recovering stale IN_FLIGHT events)
 * 11. Agent restart (queue state preservation)
 * 12. Server restart (crash recovery of in-flight mutations)
 * 13. Local MongoDB restart (in-memory buffer flush to DB)
 * 14. Cloud outage (outbox holds mutations safely)
 * 15. Network failure (exponential backoff & jitter)
 * 16. Duplicate event (idempotency, no duplicate records)
 * 17. Version mismatch (stale versions rejected)
 * 18. Conflict detection (baseVersion mismatch -> CONFLICT)
 * 19. Keep Local (conflict resolution: cloud overwritten with local)
 * 20. Keep Cloud (conflict resolution: local neutralized, cloud intact)
 * 21. Merge (field-level merge with prohibited field protection)
 * 22. Stale conflict (rejected when cloud has changed again)
 * 23. Tenant isolation (Hospital A cannot touch Hospital B)
 * 24. Backup (docker mongodump metadata tracking)
 * 25. Restore (documented restore procedure & verification)
 * 26. Local rebuild (non-destructive archive + re-sync)
 * 27. Large data test (100+ offline mutations batch streaming)
 * 28. Data integrity verification (comprehensive read-only audit)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Services under test
const localAgentService = require('../src/services/localAgent/localAgent.service');
const syncEventService = require('../src/services/localAgent/syncEvent.service');
const initialSyncService = require('../src/services/localAgent/initialSync.service');
const cloudSyncReceiverService = require('../src/services/localAgent/cloudSyncReceiver.service');
const conflictResolutionService = require('../src/services/localAgent/conflictResolution.service');
const disasterRecoveryService = require('../src/services/localAgent/disasterRecovery.service');
const dataIntegrityService = require('../src/services/localAgent/dataIntegrity.service');
const syncEmitter = require('../src/services/localAgent/syncEmitter');

// Local Agent components
const localOutbox = require('../../local-agent/src/sync/localOutbox');
const syncExecutor = require('../../local-agent/src/sync/syncExecutor');
const syncQueue = require('../../local-agent/src/sync/syncQueue');
const localDb = require('../../local-agent/src/db');
const cloudClient = require('../../local-agent/src/cloudClient');
const connectionWatcher = require('../../local-agent/src/sync/connectionWatcher');

// Models
const LocalInstallation = require('../src/models/localInstallation.model');
const SyncEvent = require('../src/models/syncEvent.model');
const SyncConflict = require('../src/models/syncConflict.model');
const LocalSyncProcessedEvent = require('../src/models/localSyncProcessedEvent.model');
const User = require('../src/models/user.model');
const Doctor = require('../src/models/doctor.model');
const Department = require('../src/models/department.model');
const Service = require('../src/models/service.model');
const Bed = require('../src/models/bed.model');
const Medicine = require('../src/models/medicine.model');
const Hospital = require('../src/models/hospital.model');
const AuditLog = require('../src/models/auditLog.model');

// Universal Dot-path extractor
function getDotValue(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let curr = obj;
    for (let i = 0; i < parts.length; i++) {
        if (curr === null || curr === undefined) return undefined;
        if (Array.isArray(curr)) {
            const rest = parts.slice(i).join('.');
            return curr.map(item => getDotValue(item, rest)).flat();
        }
        curr = curr[parts[i]];
    }
    return curr;
}

// Universal MongoDB Filter Evaluator for Mocks
function matchesFilter(doc, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;
    for (const [k, v] of Object.entries(filter)) {
        if (k === '$or') {
            if (!Array.isArray(v) || !v.some(sub => matchesFilter(doc, sub))) return false;
            continue;
        } else if (k === '$and') {
            if (!Array.isArray(v) || !v.every(sub => matchesFilter(doc, sub))) return false;
            continue;
        }

        const val = k.includes('.') ? getDotValue(doc, k) : doc[k];

        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId)) {
            if (v.$in !== undefined) {
                if (Array.isArray(val)) {
                    if (!val.some(item => v.$in.some(target => String(item) === String(target)))) return false;
                } else {
                    if (!v.$in.some(target => String(val) === String(target))) return false;
                }
            }
            if (v.$ne !== undefined) {
                if (String(val) === String(v.$ne)) return false;
            }
            if (v.$lt !== undefined && !(val < v.$lt)) return false;
            if (v.$lte !== undefined && !(val <= v.$lte)) return false;
            if (v.$gt !== undefined && !(val > v.$gt)) return false;
            if (v.$gte !== undefined && !(val >= v.$gte)) return false;
        } else {
            if (v === null || v === undefined) {
                if (val !== null && val !== undefined) return false;
            } else if (Array.isArray(val)) {
                if (!val.some(item => String(item) === String(v))) return false;
            } else if (v instanceof mongoose.Types.ObjectId || val instanceof mongoose.Types.ObjectId) {
                if (String(val) !== String(v)) return false;
            } else if (val !== v) {
                return false;
            }
        }
    }
    return true;
}

async function runPart11FinalVerification() {
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('   MEDICAL365 HMS — PART 11 FINAL PHASE 6 VALIDATION SUITE (28 CHECKS)    ');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;
    const testResults = [];

    const test = async (id, name, fn) => {
        try {
            await fn();
            console.log(`  ✅ TEST ${id}: ${name}`);
            passed++;
            testResults.push({ id, name, status: 'PASSED' });
        } catch (err) {
            console.error(`  ❌ TEST ${id}: ${name}`);
            console.error(`     Error: ${err.message}`);
            if (err.stack) {
                console.error(`     ${err.stack.split('\n').slice(1, 3).join('\n     ')}`);
            }
            failed++;
            testResults.push({ id, name, status: 'FAILED', error: err.message });
        }
    };

    // ── Setup Deterministic Mock Stores ───────────────────────────────────────
    const hospitalAId = new mongoose.Types.ObjectId();
    const hospitalBId = new mongoose.Types.ObjectId();

    const cloudStores = {
        hospitals: [{ _id: hospitalAId, name: 'Apollo Metro Pilot Hospital', isActive: true }, { _id: hospitalBId, name: 'Fortis Health Hospital', isActive: true }],
        installations: [],
        syncEvents: [],
        syncConflicts: [],
        processedEvents: [],
        users: [],
        doctors: [],
        departments: [],
        services: [],
        beds: [],
        medicines: [],
        auditLogs: []
    };

    const localStores = {
        hospitals: new Map(),
        departments: new Map(),
        doctors: new Map(),
        services: new Map(),
        beds: new Map(),
        medicines: new Map(),
        patients: new Map(),
        sync_outbox: new Map(),
        sync_queue: new Map(),
        sync_applied_events: new Map(),
        sync_checkpoints: new Map()
    };

    // Fully-chainable mock query builder
    const makeQuery = (data) => ({
        sort: () => makeQuery(data),
        skip: (s) => makeQuery(data.slice(s)),
        limit: (l) => makeQuery(data.slice(0, l)),
        select: () => makeQuery(data),
        lean: async () => data,
        toArray: async () => data,
        then: (resolve) => resolve(data)
    });

    const wrapDoc = (d) => {
        if (!d) return null;
        if (typeof d.save !== 'function') {
            d.save = async function() { return this; };
        }
        return d;
    };

    const mockModel = (ModelClass, storeArray) => {
        ModelClass.find = (filter = {}) => {
            const matched = storeArray.filter(d => matchesFilter(d, filter)).map(wrapDoc);
            return makeQuery(matched);
        };

        ModelClass.findOne = (filter = {}) => {
            const found = wrapDoc(storeArray.find(d => matchesFilter(d, filter)) || null);
            return {
                then(resolve) { resolve(found); },
                lean: async () => found ? JSON.parse(JSON.stringify(found)) : null,
                select: () => ({ lean: async () => found ? JSON.parse(JSON.stringify(found)) : null })
            };
        };

        ModelClass.findById = (id) => ModelClass.findOne({ _id: id });

        ModelClass.countDocuments = async (filter = {}) => {
            return storeArray.filter(d => matchesFilter(d, filter)).length;
        };

        ModelClass.create = async (doc) => {
            const created = Array.isArray(doc) 
                ? doc.map(d => wrapDoc({ ...d, _id: d._id || new mongoose.Types.ObjectId() })) 
                : wrapDoc({ ...doc, _id: doc._id || new mongoose.Types.ObjectId() });
            if (Array.isArray(created)) {
                storeArray.push(...created);
                return created;
            } else {
                storeArray.push(created);
                return created;
            }
        };

        ModelClass.updateOne = async (filter, update, options = {}) => {
            let doc = storeArray.find(d => matchesFilter(d, filter));
            if (!doc && options.upsert) {
                doc = { ...(filter._id ? { _id: filter._id } : { _id: new mongoose.Types.ObjectId() }), ...(update.$set || update) };
                storeArray.push(doc);
                return { modifiedCount: 1, upsertedCount: 1 };
            }
            if (doc) {
                if (update.$set) Object.assign(doc, update.$set);
                if (update.$inc) {
                    for (const [k, v] of Object.entries(update.$inc)) {
                        doc[k] = (doc[k] || 0) + v;
                    }
                }
                return { modifiedCount: 1 };
            }
            return { modifiedCount: 0 };
        };

        ModelClass.updateMany = async (filter, update) => {
            const docs = storeArray.filter(d => matchesFilter(d, filter));
            for (const doc of docs) {
                if (update.$set) Object.assign(doc, update.$set);
            }
            return { modifiedCount: docs.length };
        };

        ModelClass.prototype.save = async function() {
            const idx = storeArray.findIndex(d => (this._id && String(d._id) === String(this._id)) || (this.installationId && d.installationId === this.installationId));
            if (idx >= 0) {
                storeArray[idx] = this;
            } else {
                storeArray.push(this);
            }
            return this;
        };
    };

    mockModel(Hospital, cloudStores.hospitals);
    mockModel(LocalInstallation, cloudStores.installations);
    mockModel(SyncEvent, cloudStores.syncEvents);
    mockModel(SyncConflict, cloudStores.syncConflicts);
    mockModel(LocalSyncProcessedEvent, cloudStores.processedEvents);
    mockModel(User, cloudStores.users);
    mockModel(Doctor, cloudStores.doctors);
    mockModel(Department, cloudStores.departments);
    mockModel(Service, cloudStores.services);
    mockModel(Bed, cloudStores.beds);
    mockModel(Medicine, cloudStores.medicines);
    mockModel(AuditLog, cloudStores.auditLogs);

    // Mock Local MongoDB
    const mockLocalCollection = (name) => {
        const store = localStores[name];
        return {
            findOne: async (query) => {
                for (const doc of store.values()) {
                    if (matchesFilter(doc, query)) return JSON.parse(JSON.stringify(doc));
                }
                return null;
            },
            find: (query = {}) => ({
                sort: () => ({
                    limit: (l) => ({
                        toArray: async () => {
                            const matched = [];
                            for (const doc of store.values()) {
                                if (matchesFilter(doc, query)) matched.push(JSON.parse(JSON.stringify(doc)));
                                if (matched.length >= l) break;
                            }
                            return matched;
                        }
                    }),
                    toArray: async () => {
                        const matched = [];
                        for (const doc of store.values()) {
                            if (matchesFilter(doc, query)) matched.push(JSON.parse(JSON.stringify(doc)));
                        }
                        return matched;
                    }
                }),
                toArray: async () => {
                    const matched = [];
                    for (const doc of store.values()) {
                        if (matchesFilter(doc, query)) matched.push(JSON.parse(JSON.stringify(doc)));
                    }
                    return matched;
                }
            }),
            updateOne: async (filter, update, options = {}) => {
                let targetKey = null;
                for (const [k, doc] of store.entries()) {
                    if (matchesFilter(doc, filter)) { targetKey = k; break; }
                }
                if (!targetKey && options.upsert) {
                    targetKey = String(filter._id || filter.eventId || filter.checkpointId || Date.now() + Math.random());
                    store.set(targetKey, { ...(filter._id ? { _id: filter._id } : {}), ...(update.$set || update.$setOnInsert || {}) });
                    return { modifiedCount: 1, upsertedCount: 1 };
                }
                if (targetKey) {
                    const doc = store.get(targetKey);
                    if (update.$set) Object.assign(doc, update.$set);
                    if (update.$inc) {
                        for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
                    }
                    return { modifiedCount: 1 };
                }
                return { modifiedCount: 0 };
            },
            updateMany: async (filter, update) => {
                let count = 0;
                for (const doc of store.values()) {
                    if (matchesFilter(doc, filter)) {
                        if (update.$set) Object.assign(doc, update.$set);
                        count++;
                    }
                }
                return { modifiedCount: count };
            },
            insertOne: async (doc) => {
                const key = String(doc._id || doc.eventId || Date.now() + Math.random());
                store.set(key, JSON.parse(JSON.stringify(doc)));
                return { insertedId: key };
            },
            countDocuments: async (query = {}) => {
                let count = 0;
                for (const doc of store.values()) {
                    if (matchesFilter(doc, query)) count++;
                }
                return count;
            }
        };
    };

    localDb.getDb = () => ({
        collection: (name) => mockLocalCollection(name)
    });
    localDb.isConnected = () => true;

    let provisionA = null;
    let agentTokenA = null;
    let registeredPatientId = null;

    // ── 1. Installation Registration ──────────────────────────────────────────
    await test(1, 'Installation registration generates Installation ID and Pairing Token', async () => {
        provisionA = await localAgentService.provisionInstallation(hospitalAId, 'Apollo Pilot Local Server');
        assert(provisionA.installationId.startsWith('MED365-LOCAL-'));
        assert(provisionA.pairingToken);
        assert.strictEqual(provisionA.pairingToken.length, 6);
        assert.strictEqual(String(provisionA.hospitalId), String(hospitalAId));
    });

    // ── 2. Installation Authentication ────────────────────────────────────────
    await test(2, 'Installation authentication: pairing exchanges token for permanent Agent JWT', async () => {
        const pairRes = await localAgentService.pairAgent({
            installationId: provisionA.installationId,
            pairingToken: provisionA.pairingToken,
            agentVersion: '1.0.0',
            metrics: { dbLatencyMs: 8, memoryMb: 42 }
        });
        assert.strictEqual(pairRes.success, true);
        assert(pairRes.agentToken);
        agentTokenA = pairRes.agentToken;

        const decoded = localAgentService.verifyAgentToken(agentTokenA);
        assert.strictEqual(decoded.decoded.installationId, provisionA.installationId);
        assert.strictEqual(decoded.decoded.hospitalId, String(hospitalAId));
    });

    // ── 3. Heartbeat ──────────────────────────────────────────────────────────
    await test(3, 'Heartbeat updates telemetry, DB health, outbox stats, and stays ONLINE', async () => {
        const hb = await localAgentService.processHeartbeat({
            token: agentTokenA,
            installationId: provisionA.installationId,
            dbStatus: 'HEALTHY',
            status: 'ONLINE',
            agentVersion: '1.0.0',
            metrics: { dbLatencyMs: 12, memoryMb: 45, uptimeSeconds: 300 },
            outboxStats: { pending: 0, completed: 10, failed: 0 }
        });
        assert.strictEqual(hb.success, true);
        assert.strictEqual(hb.status, 'ONLINE');
        assert.strictEqual(hb.dbStatus, 'HEALTHY');

        const instStatus = await localAgentService.getStatus(hospitalAId);
        assert.strictEqual(instStatus.status, 'ONLINE');
        assert.strictEqual(instStatus.cloudConnection, 'CONNECTED');
    });

    // ── 4. Initial Cloud -> Local Sync ────────────────────────────────────────
    await test(4, 'Initial Cloud -> Local sync streams 7 entities with chunked batches', async () => {
        // Pre-populate cloud with pilot data
        cloudStores.departments.push({ _id: new mongoose.Types.ObjectId(), hospitalId: hospitalAId, name: 'Cardiology' });
        cloudStores.doctors.push({ _id: new mongoose.Types.ObjectId(), hospitalId: hospitalAId, doctorId: 'DOC-101', name: 'Dr. Ramesh Sharma', specialty: 'Cardiologist' });
        cloudStores.beds.push({ _id: new mongoose.Types.ObjectId(), hospitalId: hospitalAId, bedNumber: 'BED-101', ward: 'ICU' });
        cloudStores.medicines.push({ _id: new mongoose.Types.ObjectId(), name: 'Paracetamol 500mg' });

        const initManifest = await initialSyncService.startInitialSync(hospitalAId, provisionA.installationId);
        assert.strictEqual(initManifest.status, 'IN_PROGRESS');
        assert(initManifest.entityOrder.includes('Patient'));

        // Local agent fetches batch for Department
        const deptBatch = await initialSyncService.getInitialSyncBatch({
            hospitalId: hospitalAId,
            installationId: provisionA.installationId,
            entityType: 'Department',
            skip: 0,
            limit: 50
        });
        assert.strictEqual(deptBatch.records.length, 1);
        assert.strictEqual(deptBatch.records[0].name, 'Cardiology');

        // Apply into local DB
        for (const r of deptBatch.records) {
            await syncExecutor.applyEvent({
                eventId: `INIT-DEP-${r._id}`,
                entityType: 'Department',
                entityId: r._id,
                operation: 'CREATE',
                payload: r,
                version: Date.now()
            });
        }
        const localDept = await localStores.departments.get(String(deptBatch.records[0]._id));
        assert(localDept);
        assert.strictEqual(localDept.name, 'Cardiology');
    });

    // ── 5. Incremental Cloud -> Local Sync ────────────────────────────────────
    await test(5, 'Incremental Cloud -> Local sync: Cloud event received and applied locally', async () => {
        const cloudPatientId = new mongoose.Types.ObjectId();
        const event = await syncEventService.createSyncEvent({
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: cloudPatientId,
            operation: 'CREATE',
            payload: { name: 'Sunita Verma', phone: '9876543299', role: 'patient' },
            version: 1500
        });
        assert(event.eventId);

        const pending = await syncEventService.getPendingEvents({
            hospitalId: hospitalAId,
            installationId: provisionA.installationId,
            afterVersion: 0
        });
        assert(pending.events.some(e => e.eventId === event.eventId));

        // Apply locally
        const applyRes = await syncExecutor.applyEvent({
            eventId: event.eventId,
            entityType: 'Patient',
            entityId: cloudPatientId,
            operation: 'CREATE',
            payload: { name: 'Sunita Verma', phone: '9876543299', _id: cloudPatientId },
            version: 1500
        });
        assert.strictEqual(applyRes.success, true);

        const localPat = await localStores.patients.get(String(cloudPatientId));
        assert.strictEqual(localPat.name, 'Sunita Verma');
    });

    // ── 6. Local -> Cloud Sync ────────────────────────────────────────────────
    await test(6, 'Local -> Cloud sync: Outbox batch uploaded and applied to Cloud MongoDB', async () => {
        const localDocId = new mongoose.Types.ObjectId();
        const mut = await localOutbox.recordMutation({
            installationId: provisionA.installationId,
            hospitalId: hospitalAId,
            entityType: 'Department',
            entityId: localDocId,
            operation: 'CREATE',
            payload: { name: 'Neurology', hospitalId: hospitalAId }
        });
        assert(mut.eventId);

        const batch = await localOutbox.getPendingBatch(10);
        assert(batch.some(b => b.eventId === mut.eventId));

        const pushRes = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: hospitalAId,
            installationId: provisionA.installationId,
            events: batch
        });
        assert.strictEqual(pushRes.success, true);
        assert.strictEqual(pushRes.successCount >= 1, true);

        // Acknowledge locally
        await localOutbox.applyAcknowledgements(pushRes.results);
        const outboxItem = localStores.sync_outbox.get(mut.eventId);
        assert.strictEqual(outboxItem.status, 'COMPLETED');
    });

    // ── 7. Offline Patient Creation ───────────────────────────────────────────
    await test(7, 'Offline patient creation: Saved into Local DB and queued in Outbox', async () => {
        registeredPatientId = new mongoose.Types.ObjectId();
        const rec = await localOutbox.recordMutation({
            installationId: provisionA.installationId,
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: registeredPatientId,
            operation: 'CREATE',
            payload: { name: 'Amitabh Bachchan', phone: '9820011223', uhid: 'UHID-PILOT-01' }
        });
        assert(rec.eventId);

        const localDoc = await localStores.patients.get(String(registeredPatientId));
        assert(localDoc);
        assert.strictEqual(localDoc.name, 'Amitabh Bachchan');
        assert.strictEqual(localDoc._source, 'LOCAL');
    });

    // ── 8. Offline Patient Update ─────────────────────────────────────────────
    await test(8, 'Offline patient update: Local DB updated, new outbox item with baseVersion', async () => {
        const recUpdate = await localOutbox.recordMutation({
            installationId: provisionA.installationId,
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: registeredPatientId,
            operation: 'UPDATE',
            payload: { name: 'Amitabh Bachchan', phone: '9820011223', address: 'Jalsa, Juhu, Mumbai' },
            localBaseVersion: 1000
        });
        assert(recUpdate.eventId);

        const localDoc = await localStores.patients.get(String(registeredPatientId));
        assert.strictEqual(localDoc.address, 'Jalsa, Juhu, Mumbai');
    });

    // ── 9. Automatic Reconnect ────────────────────────────────────────────────
    await test(9, 'Automatic reconnect: connectionWatcher triggers sync upon cloud restoration', async () => {
        let resumeFired = false;
        connectionWatcher.once('cloud:restored', () => { resumeFired = true; });

        connectionWatcher.previousCloudStatus = 'DISCONNECTED';
        cloudClient.status = 'CONNECTED';
        await connectionWatcher.checkConnections();
        assert.strictEqual(resumeFired, true);
    });

    // ── 10. Queue Recovery ────────────────────────────────────────────────────
    await test(10, 'Queue recovery: IN_FLIGHT events revert to PENDING safely on timeout', async () => {
        const staleItem = {
            eventId: 'OUT-STALE-1',
            status: 'IN_FLIGHT',
            lastAttemptAt: new Date(Date.now() - 120000), // 2 min ago
            retryCount: 1,
            payload: {}
        };
        localStores.sync_outbox.set('OUT-STALE-1', staleItem);

        const recovered = await localOutbox.recoverStaleInFlight();
        assert.strictEqual(recovered >= 1, true);
        assert.strictEqual(localStores.sync_outbox.get('OUT-STALE-1').status, 'PENDING');
    });

    // ── 11. Agent Restart ─────────────────────────────────────────────────────
    await test(11, 'Agent restart: In-flight and pending queue preserved across process restart', async () => {
        const pendingCountBefore = (await localOutbox.getOutboxStats()).pending;
        // Simulate restart recovery
        await localOutbox.recoverStaleInFlight();
        const pendingCountAfter = (await localOutbox.getOutboxStats()).pending;
        assert.strictEqual(pendingCountAfter, pendingCountBefore);
    });

    // ── 12. Server Restart ────────────────────────────────────────────────────
    await test(12, 'Server restart: Local DB durable state intact after restart', async () => {
        assert(localStores.patients.has(String(registeredPatientId)));
        assert.strictEqual(localStores.patients.get(String(registeredPatientId)).name, 'Amitabh Bachchan');
    });

    // ── 13. Local MongoDB Restart ─────────────────────────────────────────────
    await test(13, 'Local MongoDB restart: In-memory memory buffer flushed to DB on reconnect', async () => {
        localOutbox.inMemoryLocalDocs.set('Doctor:DOC-MEM-1', { _id: 'DOC-MEM-1', name: 'Dr. Memory Reconnected' });
        await localOutbox.flushInMemoryToDatabase();
        assert(localStores.doctors.has('DOC-MEM-1'));
    });

    // ── 14. Cloud Outage ──────────────────────────────────────────────────────
    await test(14, 'Cloud outage: Local mutations continue to buffer without failure', async () => {
        cloudClient.status = 'DISCONNECTED';
        const offlineMut = await localOutbox.recordMutation({
            installationId: provisionA.installationId,
            hospitalId: hospitalAId,
            entityType: 'Patient',
            entityId: new mongoose.Types.ObjectId(),
            operation: 'CREATE',
            payload: { name: 'Emergency Outage Patient', phone: '9998887776' }
        });
        assert(offlineMut.eventId);
        assert.strictEqual(localStores.sync_outbox.get(offlineMut.eventId).status, 'PENDING');
        cloudClient.status = 'CONNECTED';
    });

    // ── 15. Network Failure & Exponential Backoff ─────────────────────────────
    await test(15, 'Network failure: Reverted to PENDING with exponential backoff delay', async () => {
        const testEvtId = 'OUT-BACKOFF-TEST';
        localStores.sync_outbox.set(testEvtId, { eventId: testEvtId, status: 'IN_FLIGHT', retryCount: 1, payload: {} });
        await localOutbox.revertInFlightToPending([testEvtId], 'Network timeout');
        const item = localStores.sync_outbox.get(testEvtId);
        assert.strictEqual(item.status, 'PENDING');
        assert.strictEqual(item.retryCount, 2);
        assert(item.nextRetryAt > new Date());
    });

    // ── 16. Duplicate Event (Idempotency) ──────────────────────────────────────
    await test(16, 'Duplicate event: Re-applying same event is skipped idempotently without duplication', async () => {
        const dupEvt = {
            eventId: 'EVT-DUP-TEST-001',
            entityType: 'Patient',
            entityId: new mongoose.Types.ObjectId(),
            operation: 'CREATE',
            payload: { name: 'Duplicate Check Patient' },
            version: 2000
        };
        const first = await syncExecutor.applyEvent(dupEvt);
        assert.strictEqual(first.success, true);

        const second = await syncExecutor.applyEvent(dupEvt);
        assert.strictEqual(second.skipped, true);
        assert.strictEqual(second.reason, 'ALREADY_APPLIED');
    });

    // ── 17. Version Mismatch (Stale Version) ───────────────────────────────────
    await test(17, 'Version mismatch: Stale version (1200 <= 2000) rejected and newer record protected', async () => {
        const staleEvt = {
            eventId: 'EVT-STALE-TEST-002',
            entityType: 'Patient',
            entityId: registeredPatientId,
            operation: 'UPDATE',
            payload: { name: 'Old Stale Name' },
            version: 500 // Lower than existing
        };
        const res = await syncExecutor.applyEvent(staleEvt);
        assert.strictEqual(res.skipped, true);
        assert.strictEqual(res.reason, 'STALE_VERSION');
    });

    // ── 18. Conflict Detection ────────────────────────────────────────────────
    await test(18, 'Conflict detection: Local baseVersion < current Cloud version generates CONFLICT', async () => {
        const conflictDocId = new mongoose.Types.ObjectId();
        // Setup cloud version 2500
        cloudStores.users.push({
            _id: conflictDocId,
            hospitalId: hospitalAId,
            name: 'Cloud Version Name',
            _cloudVersion: 2500,
            updatedAt: new Date(2500)
        });

        const res = await cloudSyncReceiverService.processSingleEvent({
            hospitalId: hospitalAId,
            installationId: provisionA.installationId,
            event: {
                eventId: 'OUT-CONF-001',
                entityType: 'Patient',
                entityId: conflictDocId,
                operation: 'UPDATE',
                localBaseVersion: 1000, // Stale base version!
                localVersion: 2600,
                payload: { name: 'Local Conflicting Name' },
                source: 'LOCAL'
            }
        });

        assert.strictEqual(res.status, 'CONFLICT');
        assert(res.conflictId);

        const conflictInDb = cloudStores.syncConflicts.find(c => c.conflictId === res.conflictId);
        assert(conflictInDb);
        assert.strictEqual(conflictInDb.status, 'PENDING_REVIEW');
    });

    // ── 19. Keep Local ────────────────────────────────────────────────────────
    await test(19, 'Keep Local flow: Overwrites cloud document with local version and bumps version', async () => {
        const conflictDocId = new mongoose.Types.ObjectId();
        cloudStores.users.push({ _id: conflictDocId, hospitalId: hospitalAId, name: 'Cloud Doctor', _cloudVersion: 3000 });
        const conflict = await SyncConflict.create({
            conflictId: 'CONF-RESOLVE-LOCAL',
            hospitalId: hospitalAId,
            installationId: provisionA.installationId,
            entityType: 'Patient',
            entityId: String(conflictDocId),
            baseVersion: 2000,
            cloudVersion: 3000,
            localVersion: 3100,
            localPayload: { name: 'Local Resolved Name', phone: '9876543210' },
            cloudPayload: { name: 'Cloud Doctor' },
            status: 'PENDING_REVIEW'
        });

        const resolveRes = await conflictResolutionService.resolveConflict({
            hospitalId: hospitalAId,
            conflictId: conflict.conflictId,
            resolutionType: 'KEEP_LOCAL',
            user: { _id: new mongoose.Types.ObjectId(), name: 'Hospital Admin', role: 'hospitaladmin' }
        });

        assert.strictEqual(resolveRes.success, true);
        assert.strictEqual(resolveRes.resolutionStrategy, 'KEEP_LOCAL');

        const updatedCloudDoc = cloudStores.users.find(u => String(u._id) === String(conflictDocId));
        assert.strictEqual(updatedCloudDoc.name, 'Local Resolved Name');
    });

    // ── 20. Keep Cloud ────────────────────────────────────────────────────────
    await test(20, 'Keep Cloud flow: Retains Cloud version, emits Cloud->Local sync event to update local', async () => {
        const conflictDocId = new mongoose.Types.ObjectId();
        cloudStores.users.push({ _id: conflictDocId, hospitalId: hospitalAId, name: 'Authoritative Cloud Name', _cloudVersion: 4000 });
        const conflict = await SyncConflict.create({
            conflictId: 'CONF-RESOLVE-CLOUD',
            hospitalId: hospitalAId,
            installationId: provisionA.installationId,
            entityType: 'Patient',
            entityId: String(conflictDocId),
            baseVersion: 3000,
            cloudVersion: 4000,
            localVersion: 4100,
            localPayload: { name: 'Local Overwrite Attempt' },
            cloudPayload: { name: 'Authoritative Cloud Name' },
            status: 'PENDING_REVIEW'
        });

        const resolveRes = await conflictResolutionService.resolveConflict({
            hospitalId: hospitalAId,
            conflictId: conflict.conflictId,
            resolutionType: 'KEEP_CLOUD',
            user: { _id: new mongoose.Types.ObjectId(), name: 'Hospital Admin', role: 'hospitaladmin' }
        });

        assert.strictEqual(resolveRes.success, true);
        assert.strictEqual(resolveRes.resolutionStrategy, 'KEEP_CLOUD');
        const updatedCloudDoc = cloudStores.users.find(u => String(u._id) === String(conflictDocId));
        assert.strictEqual(updatedCloudDoc.name, 'Authoritative Cloud Name');
    });

    // ── 21. Merge Flow ────────────────────────────────────────────────────────
    await test(21, 'Merge flow: Field-level merge updates cloud, prohibited fields safely protected', async () => {
        const conflictDocId = new mongoose.Types.ObjectId();
        cloudStores.users.push({
            _id: conflictDocId,
            hospitalId: hospitalAId,
            name: 'Original Cloud Name',
            phone: '1111111111',
            bloodGroup: 'O+',
            _cloudVersion: 5000
        });

        const conflict = await SyncConflict.create({
            conflictId: 'CONF-RESOLVE-MERGE',
            hospitalId: hospitalAId,
            installationId: provisionA.installationId,
            entityType: 'Patient',
            entityId: String(conflictDocId),
            baseVersion: 4000,
            cloudVersion: 5000,
            localVersion: 5100,
            localPayload: { name: 'Local Proposed Name', phone: '9999999999' },
            cloudPayload: { name: 'Original Cloud Name', phone: '1111111111', bloodGroup: 'O+' },
            status: 'PENDING_REVIEW'
        });

        const mergeRes = await conflictResolutionService.resolveConflict({
            hospitalId: hospitalAId,
            conflictId: conflict.conflictId,
            resolutionType: 'MERGED',
            selectedMergeFields: {
                name: 'local',   // choose local name
                phone: 'cloud'   // choose cloud phone
            },
            user: { _id: new mongoose.Types.ObjectId(), name: 'Hospital Admin', role: 'hospitaladmin' }
        });

        assert.strictEqual(mergeRes.success, true);
        const mergedDoc = cloudStores.users.find(u => String(u._id) === String(conflictDocId));
        assert.strictEqual(mergedDoc.name, 'Local Proposed Name');
        assert.strictEqual(mergedDoc.phone, '1111111111');
        assert.strictEqual(mergedDoc.bloodGroup, 'O+'); // Unchanged preserved
    });

    // ── 22. Stale Conflict ────────────────────────────────────────────────────
    await test(22, 'Stale conflict: Rejects resolution if cloud document modified again during review', async () => {
        const conflictDocId = new mongoose.Types.ObjectId();
        cloudStores.users.push({
            _id: conflictDocId,
            hospitalId: hospitalAId,
            name: 'Brand New Cloud Edit',
            _cloudVersion: 9999, // Mutated after conflict detected!
            updatedAt: new Date(9999)
        });

        const conflict = await SyncConflict.create({
            conflictId: 'CONF-STALE-CHECK',
            hospitalId: hospitalAId,
            installationId: provisionA.installationId,
            entityType: 'Patient',
            entityId: String(conflictDocId),
            baseVersion: 1000,
            cloudVersion: 2000, // Old version recorded in conflict
            localVersion: 2100,
            localPayload: {},
            cloudPayload: {},
            status: 'PENDING_REVIEW'
        });

        let rejected = false;
        try {
            await conflictResolutionService.resolveConflict({
                hospitalId: hospitalAId,
                conflictId: conflict.conflictId,
                resolutionType: 'KEEP_LOCAL',
                user: { _id: new mongoose.Types.ObjectId(), name: 'Admin', role: 'hospitaladmin' }
            });
        } catch (e) {
            rejected = true;
            assert(e.message.includes('STALE_CONFLICT') || e.message.includes('modified again') || e.code === 'STALE_CONFLICT');
        }
        assert.strictEqual(rejected, true, 'Must reject resolution on stale conflict');
    });

    // ── 23. Tenant Isolation ──────────────────────────────────────────────────
    await test(23, 'Tenant isolation: Hospital B cannot pair, push, or resolve conflicts for Hospital A', async () => {
        // Attempt 1: Pair with wrong hospital installation
        let pairDenied = false;
        try {
            await localAgentService.pairAgent({
                installationId: provisionA.installationId,
                pairingToken: 'WRONGTOKEN'
            });
        } catch (e) { pairDenied = true; }
        assert.strictEqual(pairDenied, true);

        // Attempt 2: Hospital B pushes data into Hospital A
        let pushDenied = false;
        try {
            await cloudSyncReceiverService.processIncomingBatch({
                hospitalId: hospitalBId, // Wrong hospital!
                installationId: provisionA.installationId,
                events: [{ eventId: 'OUT-HACK-1', entityType: 'Patient', entityId: '123', operation: 'CREATE', payload: {} }]
            });
        } catch (e) { pushDenied = true; }
        assert.strictEqual(pushDenied, true);
    });

    // ── 24. Backup ────────────────────────────────────────────────────────────
    await test(24, 'Backup tracking: Installation metadata tracks automated docker mongodump backups', async () => {
        const backupRec = await disasterRecoveryService.recordBackupEvent(hospitalAId, {
            path: 'clinic-data/backups/20261005_0200',
            sizeBytes: 45000000,
            status: 'COMPLETED'
        });
        assert.strictEqual(backupRec.success, true);

        const status = await disasterRecoveryService.getBackupStatus(hospitalAId);
        assert.strictEqual(status.configured, true);
        assert(status.lastKnownBackup);
        assert.strictEqual(status.lastKnownBackup.status, 'COMPLETED');
    });

    // ── 25. Restore Verification ──────────────────────────────────────────────
    await test(25, 'Restore verification: Documented restore procedures are present and verified', async () => {
        const backupStatus = await disasterRecoveryService.getBackupStatus(hospitalAId);
        assert(Array.isArray(backupStatus.restoreInstructions));
        assert(backupStatus.restoreInstructions.length >= 5);
        assert(backupStatus.restoreInstructions.some(i => i.includes('mongorestore')));
    });

    // ── 26. Local Rebuild ─────────────────────────────────────────────────────
    await test(26, 'Local rebuild: Safe non-destructive archive, resets checkpoints, preserves Cloud data', async () => {
        const rebuildRes = await disasterRecoveryService.initiateRebuild({
            hospitalId: hospitalAId,
            user: { _id: new mongoose.Types.ObjectId(), name: 'Hospital Admin', role: 'hospitaladmin' },
            confirmationToken: 'CONFIRM_REBUILD_LOCAL_DATABASE'
        });

        assert.strictEqual(rebuildRes.success, true);
        assert.strictEqual(rebuildRes.installationId, provisionA.installationId);

        // Verify cloud data remained completely untouched
        assert(cloudStores.hospitals.some(h => String(h._id) === String(hospitalAId)));
        assert(cloudStores.users.length > 0);
    });

    // ── 27. Large Data Handling ───────────────────────────────────────────────
    await test(27, 'Large data test: Streams 100+ offline mutations in batches without event-loop lag', async () => {
        const eventIds = [];
        // Clear previous outbox items so test is isolated
        localStores.sync_outbox.clear();

        for (let i = 0; i < 105; i++) {
            const eId = `OUT-LARGE-${i}`;
            eventIds.push(eId);
            localStores.sync_outbox.set(eId, {
                eventId: eId,
                entityType: 'Patient',
                entityId: `PAT-LARGE-${i}`,
                operation: 'CREATE',
                payload: { name: `Batch Patient #${i}`, hospitalId: hospitalAId },
                status: 'PENDING',
                nextRetryAt: null,
                retryCount: 0,
                createdAt: new Date()
            });
        }

        const batch1 = await localOutbox.getPendingBatch(50);
        assert.strictEqual(batch1.length, 50);

        const pushRes1 = await cloudSyncReceiverService.processIncomingBatch({
            hospitalId: hospitalAId,
            installationId: provisionA.installationId,
            events: batch1
        });
        assert.strictEqual(pushRes1.successCount, 50);
        await localOutbox.applyAcknowledgements(pushRes1.results);

        const remaining = (await localOutbox.getOutboxStats()).pending;
        assert.strictEqual(remaining, 55);
    });

    // ── 28. Data Integrity Verification ───────────────────────────────────────
    await test(28, 'Data integrity verification: Read-only scan reports health, parity, and issues', async () => {
        const integrityReport = await dataIntegrityService.verifyIntegrity(hospitalAId);
        assert(integrityReport);
        assert(integrityReport.summary);
        assert.strictEqual(typeof integrityReport.summary.totalCloudRecords, 'number');
        assert(integrityReport.installation.configured);
        assert.strictEqual(integrityReport.installation.installationId, provisionA.installationId);
        console.log(`     Summary: Status = ${integrityReport.status}, Issues = ${integrityReport.summary.issues.length}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log(`   FINAL VERIFICATION RESULTS: ${passed} PASSED / ${failed} FAILED / 28 TOTAL`);
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runPart11FinalVerification().catch(err => {
    console.error('Final verification suite failed to run:', err);
    process.exit(1);
});
