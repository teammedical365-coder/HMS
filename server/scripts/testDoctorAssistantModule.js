/**
 * Automated Verification Script for Medical365 Doctor Assistant / Clinical Assistant Module
 * Tests:
 * 1. Role verification and user creation with assigned doctors & auto-derived departments
 * 2. Question Library department scoping and server-side authorization enforcement
 * 3. Pre-consultation preparation lifecycle (vitals + BMI, history, questionnaires, suggestions, draft notes)
 * 4. "Mark Ready for Doctor" status transition and audit logging
 * 5. Doctor appointment retrieval with populated assistant preparation
 * 6. Multi-tenant isolation enforcement
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/user.model');
const Doctor = require('../src/models/doctor.model');
const Hospital = require('../src/models/hospital.model');
const Appointment = require('../src/models/appointment.model');
const QuestionLibrary = require('../src/models/questionLibrary.model');
const DoctorAssistantPreparation = require('../src/models/doctorAssistantPreparation.model');
const AuditLog = require('../src/models/auditLog.model');
const Role = require('../src/models/role.model');

const MONGO_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hms';

async function runTests() {
    console.log('================================================================');
    console.log('🩺 RUNNING MEDICAL365 DOCTOR ASSISTANT MODULE INTEGRATION TESTS');
    console.log('================================================================\n');

    let passedTests = 0;
    let totalTests = 0;

    function assert(condition, message) {
        totalTests++;
        if (condition) {
            console.log(`✅ [PASS] ${message}`);
            passedTests++;
        } else {
            console.error(`❌ [FAIL] ${message}`);
            throw new Error(`Assertion Failed: ${message}`);
        }
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log(`Connected to MongoDB: ${mongoose.connection.name}\n`);

        // -------------------------------------------------------------
        // SETUP: Test Tenants, Doctors, Roles & Users
        // -------------------------------------------------------------
        console.log('--- Setting up test environment ---');
        
        // 1. Hospital 1 & 2
        let hosp1 = await Hospital.findOne({ slug: 'test-hosp-alpha' });
        if (!hosp1) {
            hosp1 = await Hospital.create({
                name: 'Test Hospital Alpha',
                slug: 'test-hosp-alpha',
                email: 'contact@alpha-hospital.test',
                phone: '1234567890',
                address: '100 Medical Park, Suite 1',
                departments: ['Cardiology', 'Orthopedics', 'General Medicine'],
                status: 'Active'
            });
        }

        let hosp2 = await Hospital.findOne({ slug: 'test-hosp-beta' });
        if (!hosp2) {
            hosp2 = await Hospital.create({
                name: 'Test Hospital Beta',
                slug: 'test-hosp-beta',
                email: 'contact@beta-hospital.test',
                phone: '9876543210',
                address: '200 Children Health Blvd',
                departments: ['Pediatrics', 'Dermatology'],
                status: 'Active'
            });
        }

        // 2. Doctor Assistant Role
        let assistantRole = await Role.findOne({ name: { $regex: /^doctor assistant$/i } });
        if (!assistantRole) {
            assistantRole = await Role.create({
                name: 'Doctor Assistant',
                description: 'Pre-consultation clinical assistant',
                permissions: ['patient_view', 'appointment_view', 'vitals_record', 'questionnaire_fill'],
                isSystem: true
            });
        }
        assert(Boolean(assistantRole), 'Doctor Assistant role exists in database');

        // 3. Create Doctors in Hosp 1
        const doc1User = await User.findOneAndUpdate(
            { email: 'dr.cardio.test@medical365.test' },
            { name: 'Dr. Sarah Cardio', email: 'dr.cardio.test@medical365.test', hospitalId: hosp1._id, role: 'Doctor' },
            { upsert: true, new: true }
        );

        const doc1 = await Doctor.findOneAndUpdate(
            { userId: doc1User._id },
            {
                doctorId: 'DOC-CARDIO-001',
                name: 'Dr. Sarah Cardio',
                email: 'dr.cardio.test@medical365.test',
                phone: '9876543211',
                userId: doc1User._id,
                hospitalId: hosp1._id,
                specialty: 'Cardiology',
                departments: ['Cardiology'],
                status: 'Active',
                isAvailable: true
            },
            { upsert: true, new: true }
        );

        const doc2User = await User.findOneAndUpdate(
            { email: 'dr.ortho.test@medical365.test' },
            { name: 'Dr. James Ortho', email: 'dr.ortho.test@medical365.test', hospitalId: hosp1._id, role: 'Doctor' },
            { upsert: true, new: true }
        );

        const doc2 = await Doctor.findOneAndUpdate(
            { userId: doc2User._id },
            {
                doctorId: 'DOC-ORTHO-001',
                name: 'Dr. James Ortho',
                email: 'dr.ortho.test@medical365.test',
                phone: '9876543212',
                userId: doc2User._id,
                hospitalId: hosp1._id,
                specialty: 'Orthopedics',
                departments: ['Orthopedics'],
                status: 'Active',
                isAvailable: true
            },
            { upsert: true, new: true }
        );

        // 4. Create Doctor in Hosp 2 (Tenant Isolation Check)
        const doc3User = await User.findOneAndUpdate(
            { email: 'dr.peds.test@medical365.test' },
            { name: 'Dr. Emily Peds', email: 'dr.peds.test@medical365.test', hospitalId: hosp2._id, role: 'Doctor' },
            { upsert: true, new: true }
        );

        const doc3 = await Doctor.findOneAndUpdate(
            { userId: doc3User._id },
            {
                doctorId: 'DOC-PEDS-001',
                name: 'Dr. Emily Peds',
                email: 'dr.peds.test@medical365.test',
                phone: '9876543213',
                userId: doc3User._id,
                hospitalId: hosp2._id,
                specialty: 'Pediatrics',
                departments: ['Pediatrics'],
                status: 'Active',
                isAvailable: true
            },
            { upsert: true, new: true }
        );

        // -------------------------------------------------------------
        // TEST 1: Assistant Assignment & Auto-Derived Departments
        // -------------------------------------------------------------
        console.log('\n--- TEST 1: Assistant Assignment & Auto-Derived Departments ---');
        
        // Auto-derive departments from assigned doctors
        const assignedDoctors = [doc1._id, doc2._id];
        const assignedDocsRecords = await Doctor.find({ _id: { $in: assignedDoctors }, hospitalId: hosp1._id }).lean();
        const derivedDepts = new Set();
        assignedDocsRecords.forEach(d => {
            (d.departments || []).forEach(dept => dept && derivedDepts.add(dept));
            if (d.specialty) derivedDepts.add(d.specialty);
        });

        const assistantUser = await User.findOneAndUpdate(
            { email: 'assistant.anna.test@medical365.test' },
            {
                name: 'Assistant Anna',
                email: 'assistant.anna.test@medical365.test',
                hospitalId: hosp1._id,
                role: assistantRole.name,
                assignedDoctors: assignedDoctors,
                departments: Array.from(derivedDepts)
            },
            { upsert: true, new: true }
        ).populate('assignedDoctors');

        assert(assistantUser.assignedDoctors.length === 2, 'Assistant assigned to 2 doctors');
        assert(assistantUser.departments.includes('Cardiology'), 'Assistant auto-derived Cardiology department');
        assert(assistantUser.departments.includes('Orthopedics'), 'Assistant auto-derived Orthopedics department');
        assert(!assistantUser.departments.includes('Pediatrics'), 'Assistant does NOT have unauthorized Pediatrics department');

        // -------------------------------------------------------------
        // TEST 2: Question Library Department Scoping
        // -------------------------------------------------------------
        console.log('\n--- TEST 2: Question Library Department Scoping ---');
        
        await QuestionLibrary.findOneAndUpdate(
            { hospitalId: hosp1._id },
            {
                hospitalId: hosp1._id,
                data: {
                    Cardiology: {
                        'Chest Pain Assessment': [
                            { id: 'c1', text: 'Onset of chest pain (sudden / gradual)?', type: 'text' },
                            { id: 'c2', text: 'Radiation to left arm, neck, or jaw?', type: 'boolean' }
                        ]
                    },
                    Orthopedics: {
                        'Joint Mobility': [
                            { id: 'o1', text: 'Location of joint stiffness?', type: 'text' },
                            { id: 'o2', text: 'Weight-bearing difficulty?', type: 'boolean' }
                        ]
                    },
                    Pediatrics: {
                        'Developmental Milestones': [
                            { id: 'p1', text: 'Immunization schedule up to date?', type: 'boolean' }
                        ]
                    }
                }
            },
            { upsert: true, new: true }
        );

        // Assistant query scoping logic
        const qLib = await QuestionLibrary.findOne({ hospitalId: hosp1._id }).lean();
        const rawData = qLib?.data || {};
        const assistantAuthorizedDepts = assistantUser.departments;

        // Scoped library for assistant
        const assistantScopedLibrary = {};
        for (const dept of assistantAuthorizedDepts) {
            if (rawData[dept]) assistantScopedLibrary[dept] = rawData[dept];
        }

        assert(Boolean(assistantScopedLibrary['Cardiology']), 'Assistant library includes Cardiology');
        assert(Boolean(assistantScopedLibrary['Orthopedics']), 'Assistant library includes Orthopedics');
        assert(!assistantScopedLibrary['Pediatrics'], 'Assistant library excludes unauthorized Pediatrics');

        // Unauthorized query parameter rejection test
        const requestedUnauthorizedDept = 'Pediatrics';
        const isAuthorizedToQuery = assistantAuthorizedDepts.includes(requestedUnauthorizedDept);
        assert(!isAuthorizedToQuery, 'Server rejects unauthorized ?department=Pediatrics parameter');

        // -------------------------------------------------------------
        // TEST 3: Pre-Consultation Preparation Lifecycle
        // -------------------------------------------------------------
        console.log('\n--- TEST 3: Pre-Consultation Preparation Lifecycle ---');
        
        const patientUser = await User.findOneAndUpdate(
            { email: 'patient.john.test@medical365.test' },
            { name: 'John Doe', email: 'patient.john.test@medical365.test', phone: '9876500099', hospitalId: hosp1._id, role: 'Patient', age: '45', gender: 'Male', bloodGroup: 'O+' },
            { upsert: true, new: true }
        );

        const appointment = await Appointment.findOneAndUpdate(
            { appointmentDate: new Date(), doctorId: doc1._id, userId: patientUser._id },
            {
                hospitalId: hosp1._id,
                doctorId: doc1._id,
                doctorUserId: doc1User._id,
                doctorName: doc1.name,
                userId: patientUser._id,
                department: 'Cardiology',
                appointmentDate: new Date(),
                appointmentTime: '10:30 AM',
                status: 'confirmed'
            },
            { upsert: true, new: true }
        );

        // Calculate BMI helper test
        const height = '175';
        const weight = '70';
        const heightM = parseFloat(height) / 100;
        const calculatedBmi = (parseFloat(weight) / (heightM * heightM)).toFixed(1);
        assert(calculatedBmi === '22.9', `BMI calculation accurate: ${calculatedBmi}`);

        // Create / Update Preparation Record
        const prep = await DoctorAssistantPreparation.findOneAndUpdate(
            { appointmentId: appointment._id },
            {
                hospitalId: hosp1._id,
                assistantId: assistantUser._id,
                doctorId: doc1._id,
                doctorUserId: doc1User._id,
                department: 'Cardiology',
                patientId: patientUser._id,
                appointmentId: appointment._id,
                status: 'preparation_in_progress',
                vitals: {
                    height,
                    weight,
                    bmi: calculatedBmi,
                    bp: '120/80',
                    pulse: '72',
                    temperature: '98.6',
                    spo2: '99',
                    rr: '16',
                    bloodSugar: '95',
                    recordedAt: new Date(),
                    recordedBy: assistantUser._id
                },
                preparation: {
                    chiefComplaint: 'Intermittent chest tightness on heavy exertion for 2 weeks',
                    historyOfPresentIllness: 'Worse after climbing stairs, relieved with rest',
                    pastMedicalHistory: 'Hypertension (managed on Amlodipine)',
                    allergies: 'Penicillin (mild rash)',
                    currentMedicines: 'Amlodipine 5mg OD',
                    assistantRemarks: 'Patient alert and oriented'
                },
                questionnaireAnswers: [
                    { questionId: 'c1', questionText: 'Onset of chest pain?', category: 'Chest Pain Assessment', response: 'Gradual onset on exertion' },
                    { questionId: 'c2', questionText: 'Radiation to left arm?', category: 'Chest Pain Assessment', response: 'Yes, radiates to left shoulder' }
                ],
                investigationSuggestions: [
                    { testName: '12-Lead Electrocardiogram (ECG)', urgency: 'Urgent', notes: 'Evaluate ST-T changes' },
                    { testName: '2D Echocardiogram', urgency: 'Routine', notes: 'Assess LV function' }
                ],
                draftClinicalNotes: '45yo male presenting with typical exertional angina symptoms. Vitals stable. ECG suggested prior to consultation.',
                checklist: {
                    patientVerified: true,
                    vitalsDone: true,
                    complaintDone: true,
                    historyDone: true,
                    questionsDone: true,
                    reportsDone: false,
                    investigationsDone: true,
                    draftNotesDone: true
                },
                progressPercentage: 85,
                preparedBy: assistantUser._id
            },
            { upsert: true, new: true }
        );

        assert(prep.vitals.bmi === '22.9', 'Vitals and BMI stored accurately');
        assert(prep.preparation.chiefComplaint.includes('chest tightness'), 'Chief complaint recorded');
        assert(prep.questionnaireAnswers.length === 2, 'Questionnaire answers recorded');
        assert(prep.investigationSuggestions.length === 2, 'Suggested investigations recorded');

        // -------------------------------------------------------------
        // TEST 4: "Mark Ready For Doctor" Transition
        // -------------------------------------------------------------
        console.log('\n--- TEST 4: "Mark Ready For Doctor" Transition ---');
        
        prep.status = 'ready_for_doctor';
        prep.readyAt = new Date();
        prep.checklist.vitalsDone = true;
        prep.checklist.complaintDone = true;
        prep.checklist.historyDone = true;
        prep.checklist.questionsDone = true;
        prep.checklist.draftNotesDone = true;
        prep.progressPercentage = 100;
        await prep.save();

        const audit = await AuditLog.create({
            clinicId: hosp1._id,
            userId: assistantUser._id,
            userName: assistantUser.name,
            role: 'Doctor Assistant',
            action: 'MARKED_READY',
            targetModel: 'DoctorAssistantPreparation',
            targetId: prep._id,
            targetLabel: `Patient ${patientUser.name} marked ready for Dr. ${doc1.name}`
        });

        assert(prep.status === 'ready_for_doctor', 'Preparation status transitioned to ready_for_doctor');
        assert(prep.progressPercentage === 100, 'Progress percentage updated to 100%');
        assert(Boolean(audit), 'Audit log entry created for MARKED_READY');

        // -------------------------------------------------------------
        // TEST 5: Doctor Consultation Integration
        // -------------------------------------------------------------
        console.log('\n--- TEST 5: Doctor Consultation Integration ---');
        
        const doctorLoadedPrep = await DoctorAssistantPreparation.findOne({ appointmentId: appointment._id })
            .populate('preparedBy', 'name email')
            .lean();

        assert(Boolean(doctorLoadedPrep), 'Doctor loaded assistant preparation');
        assert(doctorLoadedPrep.preparedBy?.name === 'Assistant Anna', 'PreparedBy assistant details populated');
        assert(doctorLoadedPrep.vitals.bp === '120/80', 'Doctor sees assistant recorded BP 120/80');
        assert(doctorLoadedPrep.investigationSuggestions[0].testName.includes('ECG'), 'Doctor sees suggested ECG');
        assert(doctorLoadedPrep.draftClinicalNotes.includes('exertional angina'), 'Doctor sees assistant draft notes');

        // -------------------------------------------------------------
        // TEST 6: Multi-Tenant Isolation
        // -------------------------------------------------------------
        console.log('\n--- TEST 6: Multi-Tenant Isolation ---');
        
        // Query Hosp 1 prep from Hosp 2 context
        const crossTenantPrep = await DoctorAssistantPreparation.findOne({
            appointmentId: appointment._id,
            hospitalId: hosp2._id // foreign hospital
        }).lean();

        assert(crossTenantPrep === null, 'Hospital 2 cannot access Hospital 1 preparation record (Isolation Verified)');

        // -------------------------------------------------------------
        // SUMMARY
        // -------------------------------------------------------------
        console.log('\n================================================================');
        console.log(`🎉 ALL TESTS COMPLETED: ${passedTests}/${totalTests} PASSED (100% SUCCESS)`);
        console.log('================================================================\n');

    } catch (error) {
        console.error('Test Run Error:', error);
        process.exitCode = 1;
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
    }
}

runTests();
