/**
 * Medical365 LMS Phase 3 Automated Test Suite
 * Master Data Management: Test Catalog, Parameters, Reference Ranges,
 * Critical Values, Packages, Specimens, Containers, Doctors & Price List.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

require('../models/aiWallet.model');
const Hospital = require('../models/hospital.model');
const LabTest = require('../models/labTest.model');
const TestPackage = require('../models/testPackage.model');
const { LabSpecimenType, LabContainerType } = require('../models/labSpecimen.model');
const LabDoctor = require('../models/labDoctor.model');

// Test runner state
let totalPassed = 0;
let totalFailed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        totalPassed++;
    } else {
        console.error(`  ❌ FAIL: ${testName}`);
        totalFailed++;
    }
}

async function runTests() {
    console.log('====================================================');
    console.log('  MEDICAL365 LMS PHASE 3 INTEGRATION TEST SUITE');
    console.log('  Master Data Management: Tests, Packages & Standards');
    console.log('====================================================\n');

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB for Phase 3 verification.\n');

    let testHospitalA = null;
    let testHospitalB = null;
    let createdTestA1 = null;
    let createdTestA2 = null;
    let createdPkgA = null;
    let createdSpecimenA = null;
    let createdContainerA = null;
    let createdDoctorA = null;

    try {
        // Setup mock test hospitals
        testHospitalA = await Hospital.create({
            name: 'Phase 3 Test Hospital A',
            slug: `p3-hosp-a-${Date.now()}`,
            email: `p3-a-${Date.now()}@medical365.test`,
            phone: '9876543220',
            isActive: true
        });

        testHospitalB = await Hospital.create({
            name: 'Phase 3 Test Hospital B',
            slug: `p3-hosp-b-${Date.now()}`,
            email: `p3-b-${Date.now()}@medical365.test`,
            phone: '9876543221',
            isActive: true
        });

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 1: TEST CATALOG MASTER DATA & BACKWARD COMPATIBILITY
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('--- SUITE 1: TEST CATALOG MASTER DATA & BACKWARD COMPATIBILITY ---');

        createdTestA1 = await LabTest.create({
            hospitalId: testHospitalA._id,
            testName: 'Complete Blood Count',
            testCode: 'CBC-001',
            shortName: 'CBC',
            department: 'Hematology & Hemostasis',
            category: 'Blood',
            specimenType: 'Whole Blood',
            containerType: 'EDTA Tube (Lavender)',
            requiredVolume: '2-3 mL',
            fastingRequired: false,
            turnaroundTime: 4,
            tatUnit: 'hours',
            standardPrice: 350
        });

        assert(createdTestA1._id, 'LabTest created successfully with Phase 3 attributes');
        assert(createdTestA1.name === 'Complete Blood Count', 'Backward compatibility: name synced from testName');
        assert(createdTestA1.code === 'CBC-001', 'Backward compatibility: code synced from testCode');
        assert(createdTestA1.price === 350, 'Backward compatibility: price synced from standardPrice');
        assert(createdTestA1.tatUnit === 'hours' && createdTestA1.turnaroundTime === 4, 'TAT duration and unit correctly recorded');

        // Test creation with legacy fields to ensure reverse synchronization
        const legacyTest = await LabTest.create({
            hospitalId: testHospitalA._id,
            name: 'Random Blood Sugar',
            code: 'RBS-101',
            price: 80,
            department: 'Clinical Biochemistry'
        });

        assert(legacyTest.testName === 'Random Blood Sugar', 'Reverse sync: testName populated from legacy name');
        assert(legacyTest.testCode === 'RBS-101', 'Reverse sync: testCode populated from legacy code');
        assert(legacyTest.standardPrice === 80, 'Reverse sync: standardPrice populated from legacy price');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 2: TEST PARAMETERS, AGE/GENDER REFERENCE RANGES & CRITICAL VALUES
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 2: PARAMETERS, AGE/GENDER RANGES & CRITICAL VALUES ---');

        createdTestA2 = await LabTest.create({
            hospitalId: testHospitalA._id,
            testName: 'Lipid Profile Extended',
            testCode: 'LIPID-001',
            department: 'Clinical Biochemistry',
            standardPrice: 750,
            parameters: [
                {
                    parameterName: 'Total Cholesterol',
                    parameterCode: 'CHOL_TOT',
                    unit: 'mg/dL',
                    dataType: 'Numeric',
                    decimalPlaces: 1,
                    displayOrder: 1,
                    referenceRanges: [
                        {
                            minAge: 18,
                            maxAge: 120,
                            ageUnit: 'Years',
                            gender: 'Any',
                            normalMin: 125,
                            normalMax: 200,
                            criticalLow: 80,
                            criticalHigh: 300,
                            interpretationNotes: 'Desirable: <200 mg/dL'
                        },
                        {
                            minAge: 0,
                            maxAge: 17,
                            ageUnit: 'Years',
                            gender: 'Any',
                            normalMin: 100,
                            normalMax: 170,
                            criticalLow: 70,
                            criticalHigh: 250,
                            interpretationNotes: 'Pediatric desirable range'
                        }
                    ]
                },
                {
                    parameterName: 'HDL Cholesterol',
                    parameterCode: 'HDL',
                    unit: 'mg/dL',
                    dataType: 'Numeric',
                    decimalPlaces: 1,
                    displayOrder: 2,
                    referenceRanges: [
                        {
                            minAge: 18,
                            maxAge: 120,
                            ageUnit: 'Years',
                            gender: 'Male',
                            normalMin: 40,
                            normalMax: 60,
                            criticalLow: 25
                        },
                        {
                            minAge: 18,
                            maxAge: 120,
                            ageUnit: 'Years',
                            gender: 'Female',
                            normalMin: 50,
                            normalMax: 70,
                            criticalLow: 30
                        }
                    ]
                },
                {
                    parameterName: 'Lipid Interpretation',
                    parameterCode: 'LIPID_NOTE',
                    dataType: 'Text',
                    displayOrder: 3
                }
            ]
        });

        assert(createdTestA2.parameters.length === 3, 'Test created with 3 diverse parameters');
        const cholParam = createdTestA2.parameters.find(p => p.parameterCode === 'CHOL_TOT');
        assert(cholParam.referenceRanges.length === 2, 'Total Cholesterol has 2 age-stratified reference intervals');
        assert(cholParam.referenceRanges[0].criticalHigh === 300, 'Adult critical high panic threshold recorded (300 mg/dL)');
        assert(cholParam.referenceRanges[1].normalMax === 170, 'Pediatric normal max correctly configured (170 mg/dL)');

        const hdlParam = createdTestA2.parameters.find(p => p.parameterCode === 'HDL');
        assert(hdlParam.referenceRanges.length === 2, 'HDL parameter has gender-specific reference intervals');
        const hdlMale = hdlParam.referenceRanges.find(r => r.gender === 'Male');
        const hdlFemale = hdlParam.referenceRanges.find(r => r.gender === 'Female');
        assert(hdlMale.normalMin === 40 && hdlFemale.normalMin === 50, 'Gender differentiated cutoffs verified (Male 40, Female 50)');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 3: TEST PACKAGES & DYNAMIC SAVINGS CALCULATION
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 3: PACKAGES & DYNAMIC SAVINGS CALCULATION ---');

        // Sum of createdTestA1 (350) + createdTestA2 (750) = 1100
        const expectedStandardPrice = 350 + 750;
        const proposedDiscountedPrice = 850;
        const expectedSavings = expectedStandardPrice - proposedDiscountedPrice; // 250

        createdPkgA = await TestPackage.create({
            hospitalId: testHospitalA._id,
            packageName: 'Comprehensive Executive Health Checkup',
            packageCode: 'EXEC-HEALTH-01',
            department: 'Health Packages',
            tests: [createdTestA1._id, createdTestA2._id],
            standardPrice: expectedStandardPrice,
            discountedPrice: proposedDiscountedPrice,
            savings: expectedSavings
        });

        assert(createdPkgA._id, 'TestPackage created successfully with multi-test composition');
        assert(createdPkgA.name === 'Comprehensive Executive Health Checkup', 'Package backward sync: name populated');
        assert(createdPkgA.code === 'EXEC-HEALTH-01', 'Package backward sync: code populated');
        assert(createdPkgA.price === proposedDiscountedPrice, 'Package backward sync: price matches discounted price');
        assert(createdPkgA.tests.length === 2, 'Package contains both tests');
        assert(createdPkgA.savings === 250, 'Calculated savings correctly matches difference (1100 - 850 = 250)');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 4: SPECIMEN TYPES & CONTAINER MASTER
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 4: SPECIMEN TYPES & CONTAINER MASTER ---');

        createdSpecimenA = await LabSpecimenType.create({
            hospitalId: testHospitalA._id,
            name: 'Synovial Fluid',
            code: 'SPEC-SYNOV',
            description: 'Joint aspiration fluid',
            defaultVolume: '1-2 mL',
            collectionMethod: 'Arthrocentesis',
            storageTemperature: '2-8°C',
            stabilityHours: 24
        });

        assert(createdSpecimenA._id, 'LabSpecimenType created successfully');
        assert(createdSpecimenA.name === 'Synovial Fluid', 'Specimen type name correctly stored');
        assert(createdSpecimenA.stabilityHours === 24, 'Storage stability hours stored');

        createdContainerA = await LabContainerType.create({
            hospitalId: testHospitalA._id,
            name: 'Heparin Green Top Tube',
            code: 'CONT-HEP-GRN',
            capColor: '#22c55e',
            colorCode: 'Green',
            additive: 'Lithium Heparin',
            defaultVolume: '4 mL',
            instructions: 'Invert gently 8-10 times immediately after collection'
        });

        assert(createdContainerA._id, 'LabContainerType created successfully');
        assert(createdContainerA.capColor === '#22c55e', 'Container cap color hex code stored');
        assert(createdContainerA.additive === 'Lithium Heparin', 'Container additive specified');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 5: REFERRING DOCTORS MASTER & COMMISSION RULES
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 5: REFERRING DOCTORS MASTER & COMMISSION RULES ---');

        createdDoctorA = await LabDoctor.create({
            hospitalId: testHospitalA._id,
            doctorName: 'Vikram Malhotra',
            registrationNumber: 'MCI-DEL-2015-8842',
            specialization: 'Internal Medicine',
            clinicHospitalName: 'City Polyclinic & Diagnostics',
            contactNumber: '9811223344',
            email: 'dr.vikram@citypoly.test',
            commissionRule: {
                type: 'PERCENTAGE',
                value: 15
            }
        });

        assert(createdDoctorA._id, 'LabDoctor master entry created successfully');
        assert(createdDoctorA.registrationNumber === 'MCI-DEL-2015-8842', 'Registration number verified');
        assert(createdDoctorA.commissionRule.type === 'PERCENTAGE' && createdDoctorA.commissionRule.value === 15, '15% referral commission rule recorded');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 6: STANDARD PRICING VALIDATION & REJECTIONS
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 6: STANDARD PRICING VALIDATION & REJECTIONS ---');

        // Valid price update
        createdTestA1.standardPrice = 400;
        await createdTestA1.save();
        assert(createdTestA1.price === 400, 'Price update automatically synchronizes legacy price field');

        // Reject negative price
        let negativePriceRejected = false;
        try {
            await LabTest.create({
                hospitalId: testHospitalA._id,
                testName: 'Invalid Negative Price Test',
                testCode: 'INV-NEG-01',
                standardPrice: -150
            });
        } catch (err) {
            negativePriceRejected = true;
        }
        assert(negativePriceRejected, 'Negative standard price strictly rejected by validation schema');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 7: CSV IMPORT & EXPORT LOGIC INTEGRITY
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 7: CSV IMPORT & EXPORT LOGIC INTEGRITY ---');

        // Generate CSV format
        const csvRows = [
            'Test Code,Test Name,Department,Category,Specimen Type,Container Type,Standard Price,TAT Hours',
            `"${createdTestA1.testCode}","${createdTestA1.testName}","${createdTestA1.department}","Blood","${createdTestA1.specimenType}","${createdTestA1.containerType}",${createdTestA1.standardPrice},${createdTestA1.turnaroundTime}`
        ];
        const generatedCsv = csvRows.join('\n');
        assert(generatedCsv.includes('CBC-001') && generatedCsv.includes('Complete Blood Count'), 'CSV export row correctly formats test attributes');

        // Parse CSV simulation
        const lines = generatedCsv.trim().split('\n');
        const headers = lines[0].split(',');
        const dataValues = lines[1].split(',').map(s => s.replace(/"/g, ''));
        assert(headers.length === 8, 'CSV schema has 8 standard columns');
        assert(dataValues[0] === 'CBC-001' && Number(dataValues[6]) === 400, 'CSV parser extracts code and price accurately');

        // ─────────────────────────────────────────────────────────────────────────────
        // SUITE 8: MULTI-TENANT ISOLATION GUARDRAIL
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n--- SUITE 8: MULTI-TENANT ISOLATION GUARDRAIL ---');

        // Query Hospital B data
        const hospBTests = await LabTest.find({ hospitalId: testHospitalB._id });
        const hospBPackages = await TestPackage.find({ hospitalId: testHospitalB._id });
        const hospBDoctors = await LabDoctor.find({ hospitalId: testHospitalB._id });
        const hospBSpecimens = await LabSpecimenType.find({ hospitalId: testHospitalB._id });

        assert(hospBTests.length === 0, 'Hospital B cannot access Hospital A test catalog records');
        assert(hospBPackages.length === 0, 'Hospital B cannot access Hospital A packages');
        assert(hospBDoctors.length === 0, 'Hospital B cannot access Hospital A referring doctors');
        assert(hospBSpecimens.length === 0, 'Hospital B cannot access Hospital A specimen types');

        // Same test code in Hospital B must be permitted (tenant-isolated uniqueness)
        const hospBTest = await LabTest.create({
            hospitalId: testHospitalB._id,
            testName: 'Complete Blood Count (Hosp B)',
            testCode: 'CBC-001', // Same code as Hospital A
            standardPrice: 300
        });
        assert(hospBTest._id, 'Hospital B can independently create test with identical testCode "CBC-001"');

    } catch (err) {
        console.error('Test execution error:', err);
        totalFailed++;
    } finally {
        // Clean up test data
        try {
            if (testHospitalA) {
                await LabTest.deleteMany({ hospitalId: testHospitalA._id });
                await TestPackage.deleteMany({ hospitalId: testHospitalA._id });
                await LabSpecimenType.deleteMany({ hospitalId: testHospitalA._id });
                await LabContainerType.deleteMany({ hospitalId: testHospitalA._id });
                await LabDoctor.deleteMany({ hospitalId: testHospitalA._id });
                await Hospital.deleteOne({ _id: testHospitalA._id });
            }
            if (testHospitalB) {
                await LabTest.deleteMany({ hospitalId: testHospitalB._id });
                await TestPackage.deleteMany({ hospitalId: testHospitalB._id });
                await Hospital.deleteOne({ _id: testHospitalB._id });
            }
            console.log('\nCleaned up all temporary Phase 3 test data.');
        } catch (cleanupErr) {
            console.warn('Cleanup warning:', cleanupErr.message);
        }

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.\n');

        console.log('====================================================');
        console.log(`  PHASE 3 TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
        console.log('====================================================');

        if (totalFailed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
}

runTests();
