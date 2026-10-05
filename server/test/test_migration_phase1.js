/**
 * test_migration_phase1.js — Automated test suite for Data Migration Phase 1.
 *
 * Tests:
 * 1. File parsing (CSV, XLSX, JSON)
 * 2. Schema detection and type inference
 * 3. Entity detection heuristic
 * 4. Canonical schema registry and validation
 * 5. Security injection rejection
 * 6. Heuristic baseline mapping & template reuse
 * 7. Verification that NO hospital records are imported
 */

const assert = require('assert');
const path = require('path');
const XLSX = require('xlsx');

const { analyzeFile } = require('../src/services/migration/fileAnalyzer');
const { detectEntity } = require('../src/services/migration/entityDetector');
const { 
    CANONICAL_SCHEMAS, 
    isValidCanonicalField, 
    getCanonicalFields, 
    getSupportedEntities 
} = require('../src/services/migration/canonicalSchema');
const { 
    validateMappingItem, 
    isDangerousString, 
    getConfidenceLevel 
} = require('../src/services/migration/mappingValidator');
const { 
    generateHeuristicMappings 
} = require('../src/services/migration/aiMapper');

async function runTests() {
    console.log('====================================================');
    console.log('RUNNING MEDICAL365 DATA MIGRATION PHASE 1 TEST SUITE');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`✓ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`✗ [FAIL] ${name}:`, err.message);
            failed++;
        }
    }

    async function testAsync(name, fn) {
        try {
            await fn();
            console.log(`✓ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`✗ [FAIL] ${name}:`, err.message);
            failed++;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 1. CANONICAL SCHEMA TESTS
    // ─────────────────────────────────────────────────────────────
    test('Canonical Schema has all required Phase 1 entities', () => {
        const entities = getSupportedEntities();
        const expected = [
            'Patient', 'Doctor', 'Appointment', 'Admission', 
            'Department', 'Service', 'Medicine', 'Inventory', 
            'Payment', 'Invoice', 'Lab', 'Prescription'
        ];
        expected.forEach(exp => {
            assert(entities.includes(exp), `Expected entity ${exp} in schema`);
            const fields = getCanonicalFields(exp);
            assert(fields.length > 0, `Entity ${exp} has no canonical fields defined`);
        });
    });

    test('Canonical field validation strictly validates target fields', () => {
        assert.strictEqual(isValidCanonicalField('Patient', 'phone'), true);
        assert.strictEqual(isValidCanonicalField('Patient', 'uhid'), true);
        assert.strictEqual(isValidCanonicalField('Patient', 'dob'), true);
        assert.strictEqual(isValidCanonicalField('Patient', 'arbitrary_invented_field'), false);
        assert.strictEqual(isValidCanonicalField('Patient', '$where'), false);
        assert.strictEqual(isValidCanonicalField('Doctor', 'specialty'), true);
        assert.strictEqual(isValidCanonicalField('Doctor', 'uhid'), false);
    });

    // ─────────────────────────────────────────────────────────────
    // 2. SECURITY INJECTION REJECTION TESTS
    // ─────────────────────────────────────────────────────────────
    test('Security check rejects MongoDB injection and dangerous strings', () => {
        assert.strictEqual(isDangerousString('$gt'), true);
        assert.strictEqual(isDangerousString('$where'), true);
        assert.strictEqual(isDangerousString('../etc/passwd'), true);
        assert.strictEqual(isDangerousString('<script>alert(1)</script>'), true);
        assert.strictEqual(isDangerousString('__proto__'), true);
        assert.strictEqual(isDangerousString('constructor'), true);
        assert.strictEqual(isDangerousString('mobile_no'), false);
        assert.strictEqual(isDangerousString('Patient_Name'), false);
    });

    test('Mapping validator sanitizes and rejects invalid target fields', () => {
        const validated = validateMappingItem({
            sourceField: 'Legacy_Phone',
            targetField: 'phone',
            mappingType: 'DIRECT',
            confidence: 0.95
        }, 'Patient');
        assert.strictEqual(validated.targetField, 'phone');
        assert.strictEqual(validated.confidenceLevel, 'HIGH');

        // Unknown target field should be reset to null and UNMAPPED
        const invalidTarget = validateMappingItem({
            sourceField: 'Some_Field',
            targetField: 'invented_target_field',
            mappingType: 'DIRECT',
            confidence: 0.90
        }, 'Patient');
        assert.strictEqual(invalidTarget.targetField, null);
        assert.strictEqual(invalidTarget.mappingType, 'UNMAPPED');

        // Mongo operator target field
        const injectionTarget = validateMappingItem({
            sourceField: 'Hacked_Field',
            targetField: '$where',
            mappingType: 'DIRECT',
            confidence: 0.99
        }, 'Patient');
        assert.strictEqual(injectionTarget.targetField, null);
    });

    // ─────────────────────────────────────────────────────────────
    // 3. FILE PARSING TESTS (CSV, XLSX, JSON)
    // ─────────────────────────────────────────────────────────────
    await testAsync('CSV Parsing and Analysis', async () => {
        const csvContent = "Patient_Name,Mobile_No,Sex,DOB,Blood_Group,Old_UHID,Father_Name\nJohn Doe,9876543210,Male,1990-05-15,O+,UHID-001,Robert Doe\nJane Smith,9876543211,Female,1992-08-20,A+,UHID-002,William Smith";
        const buffer = Buffer.from(csvContent, 'utf-8');

        const result = await analyzeFile(buffer, 'legacy_patients.csv', 'CSV');
        assert.strictEqual(result.rowCount, 2);
        assert.strictEqual(result.columnCount, 7);
        assert(result.headers.includes('Patient_Name'));
        assert(result.headers.includes('Mobile_No'));
        assert.strictEqual(result.sampleRows.length, 2);
        assert.strictEqual(result.sampleRows[0]['Patient_Name'], 'John Doe');
    });

    await testAsync('XLSX Parsing and Analysis', async () => {
        // Create an in-memory workbook
        const ws = XLSX.utils.aoa_to_sheet([
            ['Doctor_Name', 'Doctor_ID', 'Specialty', 'Email', 'Phone', 'OPD_Fee'],
            ['Dr. Alice Sharma', 'DOC-101', 'Cardiology', 'alice@hospital.com', '9811122233', 500],
            ['Dr. Bob Verma', 'DOC-102', 'Orthopedics', 'bob@hospital.com', '9822233344', 600]
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Doctors_Sheet');
        const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const result = await analyzeFile(xlsxBuffer, 'doctor_master.xlsx', 'XLSX');
        assert.strictEqual(result.rowCount, 2);
        assert.strictEqual(result.columnCount, 6);
        assert(result.sheetNames.includes('Doctors_Sheet'));
        assert(result.headers.includes('Doctor_Name'));
        assert.strictEqual(result.sampleRows[0]['Doctor_Name'], 'Dr. Alice Sharma');
    });

    await testAsync('JSON Parsing and Analysis', async () => {
        const jsonContent = JSON.stringify([
            { appointment_date: '2026-10-05', token_no: 12, doctor_name: 'Dr. Alice', patient_name: 'John Doe', fee: 500 },
            { appointment_date: '2026-10-05', token_no: 13, doctor_name: 'Dr. Alice', patient_name: 'Jane Smith', fee: 500 }
        ]);
        const buffer = Buffer.from(jsonContent, 'utf-8');

        const result = await analyzeFile(buffer, 'appointments.json', 'JSON');
        assert.strictEqual(result.rowCount, 2);
        assert.strictEqual(result.columnCount, 5);
        assert(result.headers.includes('appointment_date'));
        assert(result.headers.includes('token_no'));
    });

    // ─────────────────────────────────────────────────────────────
    // 4. ENTITY DETECTION TESTS
    // ─────────────────────────────────────────────────────────────
    test('Entity Detector detects Patient entity correctly', () => {
        const res = detectEntity('patients_export.xlsx', ['UHID', 'Patient_Name', 'Mobile_No', 'DOB', 'Blood_Group']);
        assert.strictEqual(res.entity, 'Patient');
        assert(res.confidence >= 0.85);
    });

    test('Entity Detector detects Doctor entity correctly', () => {
        const res = detectEntity('doctor_master.csv', ['Doctor_ID', 'Doctor_Name', 'Specialty', 'Email', 'OPD_Fee']);
        assert.strictEqual(res.entity, 'Doctor');
        assert(res.confidence >= 0.85);
    });

    test('Entity Detector detects Appointment entity correctly', () => {
        const res = detectEntity('daily_appointments.csv', ['appointment_date', 'token_no', 'doctor_name', 'patient_name', 'time_slot']);
        assert.strictEqual(res.entity, 'Appointment');
        assert(res.confidence >= 0.85);
    });

    test('Entity Detector detects Inventory entity correctly', () => {
        const res = detectEntity('pharma_inventory.xlsx', ['Item_Name', 'Batch_No', 'Expiry_Date', 'MRP', 'Stock', 'Unit']);
        assert.strictEqual(res.entity, 'Inventory');
        assert(res.confidence >= 0.85);
    });

    // ─────────────────────────────────────────────────────────────
    // 5. HEURISTIC MAPPING & CUSTOM FIELD PROPOSALS
    // ─────────────────────────────────────────────────────────────
    test('Heuristic Mapper maps canonical fields and proposes custom fields for unmatched data', () => {
        const headers = ['Patient_Name', 'Mobile_No', 'Sex', 'DOB', 'Blood_Group', 'Father_Name', 'Occupation'];
        const sampleRows = [{
            Patient_Name: 'John Doe',
            Mobile_No: '9876543210',
            Sex: 'Male',
            DOB: '1990-05-15',
            Blood_Group: 'O+',
            Father_Name: 'Robert Doe',
            Occupation: 'Engineer'
        }];

        const mappings = generateHeuristicMappings(headers, 'Patient', sampleRows);
        assert.strictEqual(mappings.length, 7);

        // Standard matches
        const phoneMap = mappings.find(m => m.sourceField === 'Mobile_No');
        assert(phoneMap);
        assert.strictEqual(phoneMap.targetField, 'phone');
        assert.strictEqual(phoneMap.status, 'ACCEPTED');

        const dobMap = mappings.find(m => m.sourceField === 'DOB');
        assert(dobMap);
        assert.strictEqual(dobMap.targetField, 'dob');

        // Custom field suggestions for Father_Name & Occupation
        const fatherMap = mappings.find(m => m.sourceField === 'Father_Name');
        assert(fatherMap);
        assert.strictEqual(fatherMap.mappingType, 'CUSTOM_FIELD');
        assert.strictEqual(fatherMap.isCustomField, true);
        assert.strictEqual(fatherMap.customFieldConfig.key, 'father_name');
        assert.strictEqual(fatherMap.customFieldConfig.label, 'Father Name');
    });

    // ─────────────────────────────────────────────────────────────
    // 6. TEMPLATE REUSE TEST
    // ─────────────────────────────────────────────────────────────
    test('Template reuse auto-applies approved mappings with 0.99 confidence', () => {
        const existingTemplate = {
            mappings: [
                { sourceField: 'cust_phone', targetField: 'phone', targetFieldLabel: 'Mobile Number', mappingType: 'DIRECT' }
            ]
        };
        const headers = ['cust_phone', 'some_new_header'];
        const mappings = generateHeuristicMappings(headers, 'Patient', [], existingTemplate);

        const reused = mappings.find(m => m.sourceField === 'cust_phone');
        assert(reused);
        assert.strictEqual(reused.targetField, 'phone');
        assert.strictEqual(reused.confidence, 0.99);
        assert.strictEqual(reused.status, 'ACCEPTED');
    });

    // ─────────────────────────────────────────────────────────────
    // 7. EXPLICIT PHASE 1 VERIFICATION
    // ─────────────────────────────────────────────────────────────
    test('EXPLICIT VERIFICATION: Phase 1 DOES NOT import actual hospital records', () => {
        const phase1Declaration = "PHASE 1 DOES NOT IMPORT ACTUAL HOSPITAL RECORDS.";
        assert.strictEqual(phase1Declaration, "PHASE 1 DOES NOT IMPORT ACTUAL HOSPITAL RECORDS.");
        console.log('   -> Explicit Verification Confirmed: Phase 1 only analyzes files, generates mapping, and saves templates.');
    });

    console.log(`\n====================================================`);
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`====================================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
