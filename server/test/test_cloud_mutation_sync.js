const assert = require('assert');
const mongoose = require('mongoose');

// Models & Services
const User = require('../src/models/user.model');
const Doctor = require('../src/models/doctor.model');
const Department = require('../src/models/department.model');
const Bed = require('../src/models/bed.model');
const LocalInstallation = require('../src/models/localInstallation.model');
const SyncEvent = require('../src/models/syncEvent.model');
const syncEventService = require('../src/services/localAgent/syncEvent.service');

async function testCloudMutationAutoSync() {
    console.log('\n--- TESTING CLOUD MUTATION -> AUTO SYNC EVENT GENERATION ---');

    const hospitalId = new mongoose.Types.ObjectId();
    const installationId = 'MED365-AUTO-SYNC-INST';

    // Mock LocalInstallation so syncEventService knows this hospital has an active installation
    const inMemoryEvents = [];
    LocalInstallation.find = () => ({
        select: () => ({
            lean: async () => [{ installationId }]
        })
    });
    LocalInstallation.updateMany = async () => ({ modifiedCount: 1 });

    SyncEvent.create = async (doc) => {
        inMemoryEvents.push(doc);
        return doc;
    };

    // Test: User model save triggers sync event
    const testPatient = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Suresh Kumar',
        phone: '9876543210',
        role: 'patient',
        hospitalId
    });

    // Mock password hashing pre-save
    testPatient.isModified = () => false;

    // Trigger post-save hook directly
    await new Promise((resolve) => {
        testPatient.schema.s.hooks.execPost('save', testPatient, [testPatient], () => resolve());
    });

    // Wait 50ms for setImmediate to execute
    await new Promise(r => setTimeout(r, 100));

    console.log(`Events captured after patient save: ${inMemoryEvents.length}`);
    assert(inMemoryEvents.length >= 1, 'Sync event must be emitted automatically on Patient save');
    const evt = inMemoryEvents[0];
    assert.strictEqual(evt.entityType, 'Patient');
    assert.strictEqual(String(evt.hospitalId), String(hospitalId));
    assert.strictEqual(evt.payload.name, 'Suresh Kumar');
    console.log('  ✓ Patient save automatically created SyncEvent with correct tenant scope');

    console.log('\n--- AUTO SYNC TEST PASSED ---');
}

testCloudMutationAutoSync().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
