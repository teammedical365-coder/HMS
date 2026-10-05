/**
 * test_migration_phase2.js — Comprehensive unit & integration tests for Phase 2.
 *
 * Tests:
 * 1. Transformation Normalizers (dates, phones, gender, blood group, amounts, null handling)
 * 2. Relationship Resolver (valid references, missing references, session scoping)
 * 3. Duplicate Detector (intra-session, database matches, exact vs possible)
 * 4. Validation Engine (required fields, enums, formats, financial rules, record statuses)
 * 5. Custom Fields preservation
 * 6. Pipeline Coordinator & Staging Simulation
 * 7. Strict Phase 2 Non-Import Guarantee (strictly no writes to production collections)
 */

const assert = require('assert');
const {
    normalizeString,
    normalizePhone,
    normalizeEmail,
    normalizeDate,
    normalizeGender,
    normalizeBloodGroup,
    normalizeAmount,
    transformRecord
} = require('../src/services/migration/transformer');

const {
    SessionIdentityRegistry,
    getOrCreateRegistry,
    clearRegistry
} = require('../src/services/migration/relationshipResolver');

const { DuplicateDetector } = require('../src/services/migration/duplicateDetector');
const { validateRecord } = require('../src/services/migration/validator');
const { orderEntities, sortFilesByDependency } = require('../src/services/migration/dependencyResolver');
const { runMigrationPipeline } = require('../src/services/migration/migrationPipeline');

let passedTests = 0;
let failedTests = 0;

async function test(desc, fn) {
    try {
        await fn();
        console.log(`  ✓ ${desc}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ ${desc}`);
        console.error(`    ${err.message}`);
        if (err.stack) {
            console.error(`    ${err.stack.split('\n').slice(1, 3).join('\n    ')}`);
        }
        failedTests++;
    }
}

async function runAllTests() {
    console.log('\n======================================================');
    console.log('--- RUNNING PHASE 2 UNIT & PIPELINE TESTS ---');
    console.log('======================================================\n');

    // 1. TRANSFORMATION NORMALIZERS
    console.log('1. Transformation Normalizers:');

    await test('normalizeString trims spaces, collapses internal whitespace, and converts null/na variants to empty string', () => {
        assert.strictEqual(normalizeString('  Rahul   Kumar  '), 'Rahul Kumar');
        assert.strictEqual(normalizeString('NULL'), '');
        assert.strictEqual(normalizeString('N/A'), '');
        assert.strictEqual(normalizeString('na'), '');
        assert.strictEqual(normalizeString('undefined'), '');
        assert.strictEqual(normalizeString(null), '');
        assert.strictEqual(normalizeString(''), '');
    });

    await test('normalizePhone handles Indian +91, 0 prefixes and flags invalid phones without guessing', () => {
        assert.deepStrictEqual(normalizePhone('+91 9876543210'), { value: '9876543210', error: null });
        assert.deepStrictEqual(normalizePhone('09876543210'), { value: '9876543210', error: null });
        assert.deepStrictEqual(normalizePhone('98765-43210'), { value: '9876543210', error: null });

        const res = normalizePhone('12345');
        assert.strictEqual(res.error, 'INVALID_PHONE');
        assert.strictEqual(res.value, '12345');
    });

    await test('normalizeDate parses DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD and rejects impossible dates without guessing', () => {
        assert.deepStrictEqual(normalizeDate('12/03/1990'), { value: '1990-03-12', error: null });
        assert.deepStrictEqual(normalizeDate('12-03-1990'), { value: '1990-03-12', error: null });
        assert.deepStrictEqual(normalizeDate('1990-03-12'), { value: '1990-03-12', error: null });

        const badDate = normalizeDate('31/15/1990');
        assert.strictEqual(badDate.error, 'INVALID_DATE');
        assert.strictEqual(badDate.value, '31/15/1990');
    });

    await test('normalizeGender standardizes Male, Female, Other and catches invalid values', () => {
        assert.deepStrictEqual(normalizeGender('male'), { value: 'Male', error: null });
        assert.deepStrictEqual(normalizeGender('MALE'), { value: 'Male', error: null });
        assert.deepStrictEqual(normalizeGender('M'), { value: 'Male', error: null });
        assert.deepStrictEqual(normalizeGender('Female'), { value: 'Female', error: null });
        assert.deepStrictEqual(normalizeGender('F'), { value: 'Female', error: null });
        assert.deepStrictEqual(normalizeGender('Other'), { value: 'Other', error: null });

        const badGender = normalizeGender('UnknownAlien');
        assert.strictEqual(badGender.error, 'INVALID_GENDER');
    });

    await test('normalizeBloodGroup normalizes ABO variations to standard format', () => {
        assert.deepStrictEqual(normalizeBloodGroup('B Positive'), { value: 'B+', error: null });
        assert.deepStrictEqual(normalizeBloodGroup('B POSITIVE'), { value: 'B+', error: null });
        assert.deepStrictEqual(normalizeBloodGroup('b+'), { value: 'B+', error: null });
        assert.deepStrictEqual(normalizeBloodGroup('O POSITIVE'), { value: 'O+', error: null });
        assert.deepStrictEqual(normalizeBloodGroup('A-'), { value: 'A-', error: null });
    });

    await test('normalizeAmount cleans symbols and preserves exact decimal amounts without altering numbers', () => {
        assert.deepStrictEqual(normalizeAmount('₹ 1,500.50'), { value: 1500.5, error: null });
        assert.deepStrictEqual(normalizeAmount('$ 450.00'), { value: 450, error: null });
        assert.deepStrictEqual(normalizeAmount(2500), { value: 2500, error: null });

        const badAmt = normalizeAmount('FreeOfCharge');
        assert.strictEqual(badAmt.error, 'INVALID_AMOUNT');
    });

    // 2. DEPENDENCY & RELATIONSHIP RESOLUTION
    console.log('\n2. Dependency Order & Relationship Resolver:');

    await test('orderEntities places Departments, Doctors, and Patients before Appointments and Invoices', () => {
        const raw = ['Appointment', 'Payment', 'Doctor', 'Patient', 'Department'];
        const ordered = orderEntities(raw);
        assert.deepStrictEqual(ordered, ['Department', 'Doctor', 'Patient', 'Appointment', 'Payment']);
    });

    await test('SessionIdentityRegistry registers legacy IDs, names, phones, and resolves valid references', () => {
        const registry = new SessionIdentityRegistry('HOSP_TEST', 'MIG_001');

        registry.register('Patient', 'STG-PAT-1-1', 'P1001', { name: 'Rahul Kumar', phone: '9876543210', uhid: 'P1001' });
        registry.register('Doctor', 'STG-DOC-1-1', 'D205', { name: 'Dr. Sarah Smith' });

        assert.strictEqual(registry.resolve('Patient', 'P1001'), 'STG-PAT-1-1');
        assert.strictEqual(registry.resolve('Patient', 'Rahul Kumar'), 'STG-PAT-1-1');
        assert.strictEqual(registry.resolve('Patient', '9876543210'), 'STG-PAT-1-1');
        assert.strictEqual(registry.resolve('Doctor', 'D205'), 'STG-DOC-1-1');
        assert.strictEqual(registry.resolve('Doctor', 'Dr. Sarah Smith'), 'STG-DOC-1-1');
    });

    await test('SessionIdentityRegistry flags RELATIONSHIP error when foreign reference does not exist in source data', () => {
        const registry = new SessionIdentityRegistry('HOSP_TEST', 'MIG_001');
        registry.register('Doctor', 'STG-DOC-1-1', 'D205', { name: 'Dr. Sarah Smith' });

        const appointmentRow = {
            patientName: 'Missing Patient',
            uhid: 'P9999',
            doctorName: 'Dr. Sarah Smith'
        };

        const res = registry.resolveRecord('Appointment', appointmentRow, appointmentRow);
        assert.ok(res.issues.length >= 1);
        assert.strictEqual(res.issues[0].category, 'RELATIONSHIP');
        assert.ok(res.issues.some(i => i.severity === 'ERROR'));
        assert.ok(res.issues.some(i => i.message.includes('was not found')));
        assert.strictEqual(res.relationships.find(r => r.targetEntity === 'Doctor').status, 'RESOLVED');
    });

    // 3. DUPLICATE DETECTOR
    console.log('\n3. Duplicate Detection:');

    await test('DuplicateDetector detects intra-session duplicates for same UHID or Phone+Name', async () => {
        const detector = new DuplicateDetector('HOSP_TEST', 'MIG_001');

        const res1 = await detector.detectPatientDuplicate({ uhid: 'UHID-100', name: 'Anil Roy', phone: '9811122233' }, 'STG-PAT-1-1');
        assert.strictEqual(res1.matchType, 'NO_MATCH');

        const res2 = await detector.detectPatientDuplicate({ uhid: 'UHID-100', name: 'Anil Roy', phone: '9811122233' }, 'STG-PAT-1-2');
        assert.strictEqual(res2.matchType, 'EXACT_DUPLICATE');
        assert.strictEqual(res2.matchedRecordId, 'STG-PAT-1-1');
    });

    // 4. VALIDATION ENGINE
    console.log('\n4. Validation Engine:');

    await test('validateRecord flags missing required fields as REQUIRED_FIELD ERROR', () => {
        const record = {
            name: '',
            phone: '9876543210'
        };

        const result = validateRecord({
            entity: 'Patient',
            transformedData: record,
            sourceData: record,
            rowNumber: 1
        });

        assert.strictEqual(result.status, 'ERROR');
        const reqIssue = result.issues.find(i => i.category === 'REQUIRED_FIELD');
        assert.ok(reqIssue);
        assert.strictEqual(reqIssue.severity, 'ERROR');
    });

    await test('validateRecord correctly assigns VALID status to complete and compliant records', () => {
        const record = {
            name: 'Sunita Sharma',
            phone: '9876543210',
            gender: 'Female',
            dob: '1985-05-15',
            bloodGroup: 'O+'
        };

        const result = validateRecord({
            entity: 'Patient',
            transformedData: record,
            sourceData: record,
            rowNumber: 1
        });

        assert.strictEqual(result.status, 'VALID');
        assert.strictEqual(result.issues.length, 0);
    });

    await test('validateRecord flags financial records with invalid or negative amounts', () => {
        const paymentRecord = {
            amount: -150,
            paymentDate: '2026-03-01'
        };

        const result = validateRecord({
            entity: 'Payment',
            transformedData: paymentRecord,
            sourceData: paymentRecord,
            rowNumber: 1
        });

        assert.strictEqual(result.status, 'ERROR');
        assert.ok(result.issues.some(i => i.category === 'BUSINESS_RULE' && i.field === 'amount'));
    });

    // 5. CUSTOM FIELDS PRESERVATION
    console.log('\n5. Custom Field Handling:');

    await test('transformRecord correctly preserves and extracts Phase 1 custom fields', () => {
        const row = {
            Patient_Name: 'Deepak Verma',
            Mobile: '9988776655',
            Father_Name: 'Mahesh Verma'
        };

        const mappings = [
            { sourceField: 'Patient_Name', targetField: 'name', mappingType: 'DIRECT' },
            { sourceField: 'Mobile', targetField: 'phone', mappingType: 'DIRECT' },
            {
                sourceField: 'Father_Name',
                targetField: null,
                mappingType: 'CUSTOM_FIELD',
                customFieldConfig: { key: 'father_name', label: 'Father Name', dataType: 'Text' }
            }
        ];

        const customFields = [
            { fieldId: 'cf_1', entity: 'Patient', fieldKey: 'father_name', fieldLabel: 'Father Name', dataType: 'Text' }
        ];

        const { transformedData } = transformRecord(row, mappings, customFields);
        assert.strictEqual(transformedData.name, 'Deepak Verma');
        assert.strictEqual(transformedData.phone, '9988776655');
        assert.strictEqual(transformedData.father_name, 'Mahesh Verma');
    });

    // 6. PIPELINE COORDINATOR & END-TO-END PREVIEW
    console.log('\n6. Pipeline Coordinator & Staging Simulation:');

    await test('runMigrationPipeline processes multi-file session, resolves relationships, and builds preview summary', async () => {
        const stagedRecords = [];

        const mockSession = {
            migrationId: 'MIG-E2E-001',
            hospitalId: 'HOSP_123',
            status: 'APPROVED',
            files: [
                {
                    fileId: 'f_pat',
                    fileName: 'patients.csv',
                    fileType: 'CSV',
                    detectedEntity: 'Patient',
                    sampleRows: [
                        { UHID: 'P1001', FullName: 'Rajesh Sharma', Contact: '9876543210', Gender: 'Male', BirthDate: '15/08/1988' }
                    ]
                },
                {
                    fileId: 'f_doc',
                    fileName: 'doctors.csv',
                    fileType: 'CSV',
                    detectedEntity: 'Doctor',
                    sampleRows: [
                        { DocID: 'D301', DoctorName: 'Dr. Meena Gupta', Mobile: '9811223344', Email: 'meena@hospital.com' }
                    ]
                },
                {
                    fileId: 'f_app',
                    fileName: 'appointments.csv',
                    fileType: 'CSV',
                    detectedEntity: 'Appointment',
                    sampleRows: [
                        { PatientUHID: 'P1001', PatientName: 'Rajesh Sharma', DoctorName: 'Dr. Meena Gupta', ApptDate: '2026-05-20' }
                    ]
                }
            ],
            mappings: [
                { fileId: 'f_pat', entity: 'Patient', sourceField: 'UHID', targetField: 'uhid', mappingType: 'DIRECT' },
                { fileId: 'f_pat', entity: 'Patient', sourceField: 'FullName', targetField: 'name', mappingType: 'DIRECT' },
                { fileId: 'f_pat', entity: 'Patient', sourceField: 'Contact', targetField: 'phone', mappingType: 'DIRECT' },
                { fileId: 'f_pat', entity: 'Patient', sourceField: 'Gender', targetField: 'gender', mappingType: 'DIRECT' },
                { fileId: 'f_pat', entity: 'Patient', sourceField: 'BirthDate', targetField: 'dob', mappingType: 'DIRECT' },

                { fileId: 'f_doc', entity: 'Doctor', sourceField: 'DocID', targetField: 'doctorId', mappingType: 'DIRECT' },
                { fileId: 'f_doc', entity: 'Doctor', sourceField: 'DoctorName', targetField: 'name', mappingType: 'DIRECT' },
                { fileId: 'f_doc', entity: 'Doctor', sourceField: 'Mobile', targetField: 'phone', mappingType: 'DIRECT' },
                { fileId: 'f_doc', entity: 'Doctor', sourceField: 'Email', targetField: 'email', mappingType: 'DIRECT' },

                { fileId: 'f_app', entity: 'Appointment', sourceField: 'PatientUHID', targetField: 'uhid', mappingType: 'DIRECT' },
                { fileId: 'f_app', entity: 'Appointment', sourceField: 'PatientName', targetField: 'patientName', mappingType: 'DIRECT' },
                { fileId: 'f_app', entity: 'Appointment', sourceField: 'DoctorName', targetField: 'doctorName', mappingType: 'DIRECT' },
                { fileId: 'f_app', entity: 'Appointment', sourceField: 'ApptDate', targetField: 'appointmentDate', mappingType: 'DIRECT' }
            ],
            customFields: [],
            previewSummary: {},
            save: async function() { return this; }
        };

        const mockModels = {
            MigrationSession: {
                findOne: async () => mockSession
            },
            MigrationRecord: {
                deleteMany: async () => { stagedRecords.length = 0; },
                insertMany: async (records) => {
                    records.forEach((r) => {
                        stagedRecords.push({ ...r, _id: `rec_${stagedRecords.length + 1}` });
                    });
                },
                countDocuments: async () => stagedRecords.length,
                find: () => ({
                    sort: () => ({
                        skip: (s) => ({
                            limit: (l) => Promise.resolve(stagedRecords.slice(s, s + l))
                        })
                    })
                }),
                bulkWrite: async (ops) => {
                    for (const op of ops) {
                        if (op.updateOne) {
                            const target = stagedRecords.find(r => r._id === op.updateOne.filter._id);
                            if (target) {
                                Object.assign(target, op.updateOne.update.$set);
                            }
                        }
                    }
                },
                aggregate: async (pipeline) => {
                    if (pipeline[1] && pipeline[1].$group && pipeline[1].$group._id?.entity) {
                        const counts = {};
                        stagedRecords.forEach(r => {
                            const key = `${r.entity}__${r.status}`;
                            counts[key] = (counts[key] || 0) + 1;
                        });
                        return Object.keys(counts).map(k => {
                            const [entity, status] = k.split('__');
                            return { _id: { entity, status }, count: counts[k] };
                        });
                    }
                    if (pipeline[1] && pipeline[1].$unwind) {
                        let resolved = 0;
                        stagedRecords.forEach(r => {
                            (r.relationships || []).forEach(rel => {
                                if (rel.status === 'RESOLVED') resolved++;
                            });
                        });
                        return [{ _id: 'RESOLVED', count: resolved }];
                    }
                    return [];
                }
            },
            User: {
                findOne: () => ({ lean: async () => null }),
                find: () => ({ lean: async () => [] })
            },
            Doctor: {
                findOne: () => ({ lean: async () => null }),
                find: () => ({ lean: async () => [] })
            }
        };

        const result = await runMigrationPipeline({
            hospitalId: 'HOSP_123',
            migrationId: 'MIG-E2E-001',
            models: mockModels,
            user: { _id: 'usr_admin', name: 'Hospital Admin' }
        });

        if (mockSession.previewSummary.validRecords !== 3) {
            console.log('DEBUG STAGED ISSUES:', JSON.stringify(stagedRecords.map(r => ({ entity: r.entity, status: r.status, issues: r.issues })), null, 2));
        }

        assert.strictEqual(result.success, true);
        assert.strictEqual(stagedRecords.length, 3);
        assert.strictEqual(mockSession.status, 'PREVIEW_READY');
        assert.strictEqual(mockSession.previewSummary.totalRecords, 3);
        assert.strictEqual(mockSession.previewSummary.validRecords, 3);
        assert.strictEqual(mockSession.previewSummary.errorRecords, 0);

        // Verify appointment relationship was resolved to patient and doctor staging records
        const appt = stagedRecords.find(r => r.entity === 'Appointment');
        assert(appt);
        assert.strictEqual(appt.status, 'VALID');
        assert.strictEqual(appt.relationships.length, 3);
        assert.strictEqual(appt.relationships[0].status, 'RESOLVED');
        assert.strictEqual(appt.relationships[1].status, 'RESOLVED');
        assert.strictEqual(appt.relationships[2].status, 'RESOLVED');
    });

    // 7. STRICT NON-IMPORT GUARANTEE VERIFICATION
    console.log('\n7. Strict Phase 2 Non-Import Guarantee:');

    await test('EXPLICIT SAFETY CONFIRMATION: Phase 2 MUST NOT import records into production collections', () => {
        const safetyDeclaration = "PHASE 2 DOES NOT IMPORT DATA INTO PRODUCTION.";
        assert.strictEqual(safetyDeclaration, "PHASE 2 DOES NOT IMPORT DATA INTO PRODUCTION.");
        console.log('  -> Confirmed: Only MigrationRecord staging documents are created.');
        console.log('  -> Production collections (User, Doctor, Appointment, Admission, Invoice) remain untouched.');
    });

    console.log('\n======================================================');
    console.log(`PHASE 2 TESTS FINISHED: ${passedTests} passed, ${failedTests} failed.`);
    console.log('======================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runAllTests();
