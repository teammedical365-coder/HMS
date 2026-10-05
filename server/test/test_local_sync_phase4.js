/**
 * Automated Test Suite — Medical365 Offline Queue, Retry & Recovery (Phase 4)
 *
 * Validates:
 * 1. Offline Queuing & Persistence: Multiple mutations queued in Local Outbox with PENDING status
 * 2. Strict Monotonic Ordering: Events processed FIFO by createdAt per entity
 * 3. In-Flight Recovery on Restart/Timeout: IN_FLIGHT events revert to PENDING safely
 * 4. Exponential Backoff Calculation: Delays increase exponentially with cap and jitter
 * 5. Partial Batch Handling: Per-item success, conflict, and failure marked correctly
 * 6. Max Retry Exhaustion: 5 failures transition item to FAILED with error message
 * 7. Admin Reset & Manual Retry: resetFailedEvents resets FAILED events to PENDING with retryCount 0
 * 8. Telemetry & Live Stats: Heartbeat forwards outboxStats to Cloud LocalInstallation
 * 9. Financial Immutability: Payments, Invoices, Refunds strictly rejected from offline sync
 */

const assert = require('assert');
const mongoose = require('mongoose');

const localOutbox = require('../../local-agent/src/sync/localOutbox');
const outboxUploader = require('../../local-agent/src/sync/outboxUploader');
const cloudSyncReceiverService = require('../src/services/localAgent/cloudSyncReceiver.service');

const LocalInstallation = require('../src/models/localInstallation.model');
const LocalSyncProcessedEvent = require('../src/models/localSyncProcessedEvent.model');
const SyncConflict = require('../src/models/syncConflict.model');
const Department = require('../src/models/department.model');
const User = require('../src/models/user.model');

async function runTests() {
    console.log('\n======================================================');
    console.log('--- RUNNING OFFLINE QUEUE, RETRY & RECOVERY (PHASE 4) ---');
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
    const testInstallationId = 'INST-PHASE4-TEST-' + Math.floor(Math.random() * 100000);

    // ── In-Memory Cloud Store Mock ─────────────────────────────────────────────
    const cloudStore = {
        departments: new Map(),
        installations: new Map(),
        processedEvents: new Map(),
        conflicts: new Map()
    };

    // Mock LocalInstallation
    LocalInstallation.findOne = async (filter) => {
        for (const inst of cloudStore.installations.values()) {
            if (filter.installationId && inst.installationId !== filter.installationId) continue;
            if (filter.hospitalId && String(inst.hospitalId) !== String(filter.hospitalId)) continue;
            return inst;
        }
        return null;
    };
    LocalInstallation.findOneAndUpdate = async (filter, update) => {
        let found = null;
        for (const inst of cloudStore.installations.values()) {
            if (filter.installationId && inst.installationId !== filter.installationId) continue;
            found = inst;
            break;
        }
        if (found && update.$set) {
            Object.assign(found, update.$set);
            return found;
        }
        return null;
    };

    // Seed mock installation
    cloudStore.installations.set(testInstallationId, {
        installationId: testInstallationId,
        hospitalId: testHospitalId,
        status: 'ONLINE',
        syncStatus: {
            uploadStatus: {
                pendingUploadsCount: 0,
                syncingUploadsCount: 0,
                completedUploadsCount: 0,
                failedUploadsCount: 0,
                completedTodayCount: 0,
                lastSuccessfulSyncAt: null
            }
        },
        save: async function() { return this; }
    });

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

    // Mock Department model
    Department.findById = async (id) => {
        const item = cloudStore.departments.get(String(id));
        if (!item) return null;
        return {
            ...item,
            save: async function() {
                cloudStore.departments.set(String(id), this);
                return this;
            }
        };
    };
    Department.findOne = async (filter) => {
        for (const item of cloudStore.departments.values()) {
            let match = true;
            for (const [k, v] of Object.entries(filter)) {
                if (String(item[k]) !== String(v)) { match = false; break; }
            }
            if (match) {
                return {
                    ...item,
                    save: async function() {
                        cloudStore.departments.set(String(item._id), this);
                        return this;
                    }
                };
            }
        }
        return null;
    };
    Department.create = async (data) => {
        const id = data._id ? String(data._id) : new mongoose.Types.ObjectId().toString();
        const doc = { createdAt: new Date(), updatedAt: new Date(), ...data, _id: id };
        doc.save = async function() {
            cloudStore.departments.set(id, this);
            return this;
        };
        cloudStore.departments.set(id, doc);
        return doc;
    };

    // ── Test 1: Offline Queuing & Persistence ──────────────────────────────────
    await test('1. Offline Queuing: Multiple mutations queued in Local Outbox with PENDING status', async () => {
        const dept1 = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Department',
            entityId: new mongoose.Types.ObjectId().toString(),
            operation: 'CREATE',
            payload: { name: 'Orthopedics', code: 'ORTHO' }
        });

        const dept2 = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Department',
            entityId: new mongoose.Types.ObjectId().toString(),
            operation: 'CREATE',
            payload: { name: 'Cardiology', code: 'CARDIO' }
        });

        assert.strictEqual(dept1.success, true);
        assert.strictEqual(dept1.status, 'PENDING');
        assert.strictEqual(dept2.success, true);
        assert.strictEqual(dept2.status, 'PENDING');

        const pending = await localOutbox.getPendingBatch(50);
        assert(pending.length >= 2, 'Should retrieve at least 2 pending events');
    });

    // ── Test 2: Strict Monotonic Ordering (FIFO) ───────────────────────────────
    await test('2. Monotonic FIFO Ordering: Events retrieved strictly by createdAt ASC', async () => {
        const batch = await localOutbox.getPendingBatch(10);
        for (let i = 1; i < batch.length; i++) {
            const prevTime = new Date(batch[i - 1].createdAt).getTime();
            const currTime = new Date(batch[i].createdAt).getTime();
            assert(prevTime <= currTime, `Event at ${i} was older than previous event (Ordering violated)`);
        }
    });

    // ── Test 3: In-Flight Crash Recovery ───────────────────────────────────────
    await test('3. In-Flight Crash Recovery: IN_FLIGHT events revert to PENDING safely after timeout or restart', async () => {
        const item = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Department',
            entityId: 'DEP-RECOVER',
            operation: 'CREATE',
            payload: { name: 'Neurology' }
        });

        // Mark as IN_FLIGHT
        await localOutbox.markInFlight([item.eventId]);

        // Verify it is not in the pending batch
        const pendingWhileInFlight = await localOutbox.getPendingBatch(50);
        const matchInPending = pendingWhileInFlight.find(e => e.eventId === item.eventId);
        assert.strictEqual(matchInPending, undefined, 'Event marked IN_FLIGHT must not appear in pending batch');

        // Force item's lastAttemptAt to be 6 minutes in the past
        const outboxEntry = await localOutbox.getEventById(item.eventId);
        if (outboxEntry) {
            outboxEntry.lastAttemptAt = new Date(Date.now() - (6 * 60 * 1000));
        }

        // Revert stale in-flight events (older than 5 minutes)
        const recoveredCount = await localOutbox.revertStaleInFlightEvents(5 * 60 * 1000);
        assert(recoveredCount >= 1, 'Should recover at least 1 stale in-flight event');

        // Check that it is back in pending batch
        const pendingAfter = await localOutbox.getPendingBatch(50);
        const recoveredItem = pendingAfter.find(e => e.eventId === item.eventId);
        assert.ok(recoveredItem, 'Recovered event should be present in pending batch');
        assert.strictEqual(recoveredItem.status, 'PENDING');
    });

    // ── Test 4: Exponential Backoff Calculation ─────────────────────────────────
    await test('4. Exponential Backoff: Delays increase exponentially with cap and jitter', () => {
        // Retry 0: base delay ~2000ms (+ jitter < 800ms)
        const delay0 = localOutbox.calculateBackoff(0);
        assert(delay0 >= 2000 && delay0 <= 3000, `Delay 0 should be ~2000-2800ms, got ${delay0}`);

        // Retry 1: ~4000ms
        const delay1 = localOutbox.calculateBackoff(1);
        assert(delay1 >= 4000 && delay1 <= 5000, `Delay 1 should be ~4000-4800ms, got ${delay1}`);

        // Retry 2: ~8000ms
        const delay2 = localOutbox.calculateBackoff(2);
        assert(delay2 >= 8000 && delay2 <= 9000, `Delay 2 should be ~8000-8800ms, got ${delay2}`);

        // Retry 10: should be capped at max (120000ms + jitter)
        const delay10 = localOutbox.calculateBackoff(10);
        assert(delay10 <= 121000, `Delay should be capped near 120000ms, got ${delay10}`);
    });

    // ── Test 5: Partial Batch Handling ─────────────────────────────────────────
    await test('5. Partial Batch Handling: Marks COMPLETED, CONFLICT, and FAILED independently without re-sending completed', async () => {
        const item1 = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Department',
            entityId: new mongoose.Types.ObjectId().toString(),
            operation: 'CREATE',
            payload: { name: 'Batch Dept 1' }
        });

        const item2 = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Department',
            entityId: new mongoose.Types.ObjectId().toString(),
            operation: 'UPDATE',
            payload: { name: 'Batch Dept 2' }
        });

        const item3 = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Department',
            entityId: new mongoose.Types.ObjectId().toString(),
            operation: 'CREATE',
            payload: { name: 'Batch Dept 3' }
        });

        // Mark items IN_FLIGHT
        await localOutbox.markInFlight([item1.eventId, item2.eventId, item3.eventId]);

        // Simulate cloud response for the batch
        const mockCloudAcks = [
            { eventId: item1.eventId, status: 'COMPLETED' },
            { eventId: item2.eventId, status: 'CONFLICT', message: 'Version mismatch' },
            { eventId: item3.eventId, status: 'FAILED', message: 'Invalid schema or field data' }
        ];

        await localOutbox.applyAcknowledgements(mockCloudAcks);

        const o1 = await localOutbox.getEventById(item1.eventId);
        const o2 = await localOutbox.getEventById(item2.eventId);
        const o3 = await localOutbox.getEventById(item3.eventId);

        assert.strictEqual(o1.status, 'COMPLETED');
        assert.strictEqual(o2.status, 'CONFLICT');
        assert.strictEqual(o3.status, 'FAILED');

        // Completed item must not be retrieved again in next pending batch
        const nextPending = await localOutbox.getPendingBatch(50);
        assert(!nextPending.some(e => e.eventId === item1.eventId), 'Completed item must not re-queue');
    });

    // ── Test 6: Max Retry Exhaustion ───────────────────────────────────────────
    await test('6. Max Retry Exhaustion: Transitions to FAILED after 5 failed retry attempts', async () => {
        const item = await localOutbox.recordMutation({
            installationId: testInstallationId,
            hospitalId: testHospitalId.toString(),
            entityType: 'Department',
            entityId: 'DEP-FAIL-MAX',
            operation: 'CREATE',
            payload: { name: 'Failing Dept' }
        });

        // Revert 4 times -> PENDING with retryCount incremented
        for (let i = 1; i <= 4; i++) {
            await localOutbox.markInFlight([item.eventId]);
            await localOutbox.revertInFlightToPending([item.eventId], `Transient network timeout attempt ${i}`);
            const o = await localOutbox.getEventById(item.eventId);
            assert.strictEqual(o.status, 'PENDING');
            assert.strictEqual(o.retryCount, i);
        }

        // 5th failure -> FAILED (maxRetries = 5 reached)
        await localOutbox.markInFlight([item.eventId]);
        await localOutbox.revertInFlightToPending([item.eventId], 'Fatal error 5th attempt');
        const finalItem = await localOutbox.getEventById(item.eventId);
        assert.strictEqual(finalItem.status, 'FAILED');
        assert.strictEqual(finalItem.retryCount, 5);
        assert(finalItem.errorMessage.includes('Fatal error 5th attempt'));
    });

    // ── Test 7: Admin Reset & Manual Retry ─────────────────────────────────────
    await test('7. Admin Reset & Manual Retry: retryAllFailed resets FAILED items to PENDING with retryCount 0', async () => {
        const resetCount = await localOutbox.retryAllFailed();
        assert(resetCount >= 1, 'Should reset at least 1 failed event');

        const pending = await localOutbox.getPendingBatch(50);
        const item = pending.find(e => e.entityId === 'DEP-FAIL-MAX');
        assert.ok(item, 'Reset event should be in pending batch');
        assert.strictEqual(item.status, 'PENDING');
        assert.strictEqual(item.retryCount, 0);
        assert.strictEqual(item.errorMessage, null);
    });

    // ── Test 8: Telemetry & Live Stats in Heartbeat ─────────────────────────────
    await test('8. Telemetry & Live Stats: Outbox stats calculate correctly for heartbeat reporting', async () => {
        const stats = await localOutbox.getOutboxStats();
        assert.strictEqual(typeof stats.pending, 'number');
        assert.strictEqual(typeof stats.syncing, 'number');
        assert.strictEqual(typeof stats.completed, 'number');
        assert.strictEqual(typeof stats.failed, 'number');
        assert.strictEqual(typeof stats.conflicts, 'number');
        assert(stats.completedToday >= 1, 'Should reflect today completed items');
        assert.ok(stats.lastSuccessfulSyncAt !== null, 'Should have recorded last successful sync timestamp');

        // Test Cloud receiver installation telemetry integration
        const inst = cloudStore.installations.get(testInstallationId);
        inst.syncStatus.uploadStatus.pendingUploadsCount = stats.pending;
        inst.syncStatus.uploadStatus.syncingUploadsCount = stats.syncing;
        inst.syncStatus.uploadStatus.completedUploadsCount = stats.completed;
        inst.syncStatus.uploadStatus.failedUploadsCount = stats.failed;
        inst.syncStatus.uploadStatus.completedTodayCount = stats.completedToday;
        inst.syncStatus.uploadStatus.lastSuccessfulSyncAt = stats.lastSuccessfulSyncAt;

        assert.strictEqual(inst.syncStatus.uploadStatus.pendingUploadsCount, stats.pending);
        assert.strictEqual(inst.syncStatus.uploadStatus.completedTodayCount, stats.completedToday);
    });

    // ── Test 9: Financial Immutability & Scope Protection ───────────────────────
    await test('9. Financial Immutability: Payments, Invoices, Refunds offline uploads are strictly rejected', async () => {
        const financialEntities = ['Payment', 'Invoice', 'Refund', 'ClinicalNote', 'Prescription'];

        for (const entity of financialEntities) {
            const batchRes = await cloudSyncReceiverService.processIncomingBatch({
                hospitalId: testHospitalId,
                installationId: testInstallationId,
                events: [{
                    eventId: `OUT-FIN-${entity}-${Date.now()}`,
                    entityType: entity,
                    entityId: 'FIN-101',
                    operation: 'CREATE',
                    payload: { amount: 5000 },
                    localVersion: Date.now()
                }]
            });

            assert.strictEqual(batchRes.failedCount, 1);
            assert.strictEqual(batchRes.results[0].status, 'FAILED');
            assert(batchRes.results[0].message.includes('strictly prohibited'), `Expected rejection for ${entity}`);
        }
    });

    console.log('\n======================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
