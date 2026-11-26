const mongoose = require('mongoose');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const Hospital = require('../models/hospital.model');
const LabTest = require('../models/labTest.model');
const TestPackage = require('../models/testPackage.model');
const LabCounter = require('../models/labCounter.model');
const LabOrder = require('../models/labOrder.model');
const LabSample = require('../models/labSample.model');
const LabReport = require('../models/labReport.model');

/**
 * Infer sensible clinical specimen, container, and department when a doctor prescribes
 * an investigation name not yet explicitly configured in the LabTest catalogue.
 */
function inferClinicalSpecimenDefaults(testNameRaw) {
    const lower = String(testNameRaw || '').toLowerCase();

    if (/\burine\b|\burinalysis\b/.test(lower)) {
        return {
            specimenType: 'Urine',
            containerType: 'Sterile Urine Container',
            requiredVolume: '10-15 mL',
            department: 'Clinical Pathology'
        };
    }
    if (/\bstool\b|\bfecal\b|\boccult\b/.test(lower)) {
        return {
            specimenType: 'Stool',
            containerType: 'Sterile Stool Container',
            requiredVolume: '5 g',
            department: 'Clinical Pathology'
        };
    }
    if (/\bsputum\b|\bswab\b|\bculture\b|\bpus\b/.test(lower)) {
        return {
            specimenType: 'Swab / Body Fluid',
            containerType: 'Sterile Culture Container',
            requiredVolume: 'Adequate',
            department: 'Microbiology'
        };
    }
    if (/\bfbs\b|\bppbs\b|\brbs\b|\bglucose\b|\bsugar\b/.test(lower)) {
        return {
            specimenType: 'Fluoride Plasma',
            containerType: 'Fluoride Grey Tube',
            requiredVolume: '2 mL',
            department: 'Biochemistry'
        };
    }
    if (/\bpt\b|\binr\b|\baptt\b|\bd-dimer\b|\bcoagulation\b|\bfibrinogen\b/.test(lower)) {
        return {
            specimenType: 'Citrated Plasma',
            containerType: 'Citrate Blue Tube',
            requiredVolume: '2.7 mL',
            department: 'Hematology'
        };
    }
    if (/\bcbc\b|\bhemogram\b|\bhemoglobin\b|\bhb\b|\bhba1c\b|\besr\b|\bplatelet\b|\bwbc\b|\bblood group\b|\bmalaria\b/.test(lower)) {
        return {
            specimenType: 'Whole Blood',
            containerType: 'EDTA Tube',
            requiredVolume: '2-3 mL',
            department: 'Hematology'
        };
    }
    if (/\blft\b|\bkft\b|\brft\b|\blipid\b|\bthyroid\b|\btsh\b|\bt3\b|\bt4\b|\bamh\b|\bfsh\b|\blh\b|\bprolactin\b|\bhcg\b|\bvitamin\b|\bcreatinine\b|\burea\b|\bbilirubin\b|\bserum\b|\belectrolyte\b|\bhiv\b|\bhbsag\b|\bhcv\b|\bvdrl\b|\bdengue\b|\bwidal\b|\bcrp\b/.test(lower)) {
        return {
            specimenType: 'Serum',
            containerType: 'Plain Red / SST Gel Tube',
            requiredVolume: '3-4 mL',
            department: 'Biochemistry'
        };
    }

    return {
        specimenType: 'Whole Blood',
        containerType: 'EDTA Tube',
        requiredVolume: '2-3 mL',
        department: 'General Pathology'
    };
}

/**
 * Normalize any labTests input (array of strings/objects, JSON string, comma-separated string)
 * into a deduplicated array of clean strings/identifiers.
 */
function normalizePrescribedTests(rawLabTests) {
    if (!rawLabTests) return [];

    let arr = rawLabTests;
    if (typeof rawLabTests === 'string') {
        const trimmed = rawLabTests.trim();
        if (!trimmed) return [];
        try {
            const parsed = JSON.parse(trimmed);
            arr = Array.isArray(parsed) ? parsed : trimmed.split(',');
        } catch (_) {
            arr = trimmed.split(',');
        }
    }

    if (!Array.isArray(arr)) return [];

    const seen = new Set();
    const cleaned = [];

    for (const item of arr) {
        if (!item) continue;
        if (typeof item === 'string') {
            const val = item.trim();
            if (!val) continue;
            const key = val.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                cleaned.push({ rawName: val, testId: null, code: null });
            }
        } else if (typeof item === 'object') {
            const nameVal = String(item.testName || item.name || item.code || '').trim();
            const idVal = item.testId || item._id || null;
            if (!nameVal && !idVal) continue;
            const key = (idVal ? String(idVal) : nameVal).toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                cleaned.push({
                    rawName: nameVal || 'Prescribed Test',
                    testId: idVal,
                    code: item.testCode || item.code || null
                });
            }
        }
    }

    return cleaned;
}

/**
 * Resolve tenant-specific tariff price for a LabTest document
 */
function resolveHospitalTestPrice(testDoc, hospitalIdStr) {
    if (!testDoc) return 0;
    if (hospitalIdStr && testDoc.hospitalPrices) {
        if (typeof testDoc.hospitalPrices.has === 'function' && testDoc.hospitalPrices.has(hospitalIdStr)) {
            const val = Number(testDoc.hospitalPrices.get(hospitalIdStr));
            if (!Number.isNaN(val)) return val;
        } else if (typeof testDoc.hospitalPrices === 'object' && testDoc.hospitalPrices[hospitalIdStr] !== undefined) {
            const val = Number(testDoc.hospitalPrices[hospitalIdStr]);
            if (!Number.isNaN(val)) return val;
        }
    }
    return Number(testDoc.standardPrice ?? testDoc.price ?? 0) || 0;
}

/**
 * Derive specimen-wise sample placeholders (1 per unique specimenType + containerType)
 */
async function buildSamplePlaceholders(verifiedTests, verifiedPackages, hospitalId) {
    const testMap = new Map();

    verifiedTests.forEach((t) => {
        testMap.set(String(t.testId), t);
    });

    const pkgTestIds = [];
    verifiedPackages.forEach((p) => {
        (p.tests || []).forEach((tid) => pkgTestIds.push(tid));
    });

    if (pkgTestIds.length > 0) {
        const pkgTests = await LabTest.find({
            _id: { $in: pkgTestIds },
            $or: [{ hospitalId }, { hospitalId: null }, { hospitalId: { $exists: false } }]
        }).lean();

        pkgTests.forEach((t) => {
            if (!testMap.has(String(t._id))) {
                testMap.set(String(t._id), {
                    testId: t._id,
                    testCode: t.testCode || t.code || 'TEST',
                    testName: t.testName || t.name,
                    specimenType: t.specimenType || 'Whole Blood',
                    containerType: t.containerType || 'EDTA Tube',
                    requiredVolume: t.requiredVolume || '2-3 mL'
                });
            }
        });
    }

    const grouping = new Map();
    testMap.forEach((t) => {
        const specimen = String(t.specimenType || 'Whole Blood').trim();
        const container = String(t.containerType || 'EDTA Tube').trim();
        const key = `${specimen.toLowerCase()}|||${container.toLowerCase()}`;

        if (!grouping.has(key)) {
            grouping.set(key, {
                specimenType: specimen,
                containerType: container,
                requiredVolume: t.requiredVolume || '2-3 mL',
                testCodes: [],
                testNames: []
            });
        }

        const grp = grouping.get(key);
        const code = t.testCode || 'TEST';
        const name = t.testName || 'Test';
        if (!grp.testCodes.includes(code)) {
            grp.testCodes.push(code);
        }
        if (!grp.testNames.includes(name)) {
            grp.testNames.push(name);
        }
    });

    const placeholders = [];
    let idx = 1;
    grouping.forEach((grp) => {
        placeholders.push({
            samplePlaceholderId: `SMP-${String(idx++).padStart(2, '0')}`,
            specimenType: grp.specimenType,
            containerType: grp.containerType,
            requiredVolume: grp.requiredVolume,
            testCodes: grp.testCodes,
            testNames: grp.testNames,
            status: 'Pending Collection'
        });
    });

    return placeholders;
}

/**
 * Resolve existing Medical365 HMS patient record without EVER creating duplicate registrations.
 */
async function resolveExistingHmsPatient({ hospitalId, userId, patientId, clinicPatientId }) {
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        const byId = await User.findOne({
            _id: userId,
            ...(hospitalId ? { $or: [{ hospitalId }, { hospitalId: null }, { hospitalId: { $exists: false } }] } : {})
        }).lean();
        if (byId) return byId;
    }

    if (patientId) {
        if (mongoose.Types.ObjectId.isValid(patientId) && String(patientId).length === 24) {
            const byObjId = await User.findOne({ _id: patientId }).lean();
            if (byObjId && (!byObjId.hospitalId || String(byObjId.hospitalId) === String(hospitalId))) {
                return byObjId;
            }
        }
        const byCode = await User.findOne({
            ...(hospitalId ? { hospitalId } : {}),
            $or: [
                { patientId: String(patientId).trim() },
                { mrn: String(patientId).trim() },
                { uhid: String(patientId).trim() }
            ]
        }).lean();
        if (byCode) return byCode;
    }

    if (clinicPatientId && mongoose.Types.ObjectId.isValid(clinicPatientId)) {
        try {
            const ClinicPatient = require('../models/clinicPatient.model');
            const cp = await ClinicPatient.findById(clinicPatientId).lean();
            if (cp) {
                const orClauses = [];
                if (cp.patientUid) {
                    orClauses.push({ patientId: cp.patientUid }, { mrn: cp.patientUid }, { uhid: cp.patientUid });
                }
                if (cp.phone) {
                    orClauses.push({ phone: cp.phone });
                }
                if (orClauses.length > 0) {
                    const matchedUser = await User.findOne({
                        ...(hospitalId ? { hospitalId } : {}),
                        $or: orClauses
                    }).lean();
                    if (matchedUser) return matchedUser;
                }
            }
        } catch (_) {}
    }

    return null;
}

/**
 * Resolve doctor display name from HMS Doctor / User collection
 */
async function resolveDoctorDisplayName({ doctorId, doctorName }) {
    if (doctorName && String(doctorName).trim()) {
        const clean = String(doctorName).trim();
        return /^dr\.?\s/i.test(clean) ? clean : `Dr. ${clean}`;
    }
    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) return '';

    const docRecord = await Doctor.findOne({
        $or: [{ _id: doctorId }, { userId: doctorId }]
    }).select('name').lean();
    if (docRecord?.name) {
        return /^dr\.?\s/i.test(docRecord.name) ? docRecord.name.trim() : `Dr. ${docRecord.name.trim()}`;
    }

    const docUser = await User.findById(doctorId).select('name').lean();
    if (docUser?.name) {
        return /^dr\.?\s/i.test(docUser.name) ? docUser.name.trim() : `Dr. ${docUser.name.trim()}`;
    }

    return '';
}

/**
 * Idempotently synchronize HMS Doctor-prescribed / Reception-confirmed laboratory tests
 * into a Phase 4 LabOrder with specimen placeholders so Phlebotomy / Sample Collection
 * receives the order automatically without duplicate patient registration.
 *
 * Returns null if no lab tests are prescribed.
 */
async function syncPrescribedTestsToLmsOrder({
    hospitalId,
    appointmentId = null,
    clinicalVisitId = null,
    legacyLabReportId = null,
    userId = null,
    patientId = null,
    clinicPatientId = null,
    doctorId = null,
    doctorName = '',
    labTests = [],
    priority = 'Routine',
    collectionType = 'Walk-in',
    sourceModule = 'HMS_DOCTOR',
    notes = '',
    actorId = null
}) {
    if (!hospitalId || !mongoose.Types.ObjectId.isValid(hospitalId)) {
        return null;
    }

    const normalizedItems = normalizePrescribedTests(labTests);

    // Locate any existing LabOrder linked to this HMS consultation/appointment/report
    const refClauses = [];
    if (appointmentId && mongoose.Types.ObjectId.isValid(appointmentId)) {
        refClauses.push({ appointmentId });
    }
    if (clinicalVisitId && mongoose.Types.ObjectId.isValid(clinicalVisitId)) {
        refClauses.push({ clinicalVisitId });
    }
    if (legacyLabReportId && mongoose.Types.ObjectId.isValid(legacyLabReportId)) {
        refClauses.push({ legacyLabReportId });
    }

    let existingOrder = refClauses.length > 0
        ? await LabOrder.findOne({
            hospitalId,
            status: { $ne: 'Cancelled' },
            $or: refClauses
        })
        : null;

    // RULE: Appointments without prescribed lab tests must NOT go to LMS
    if (normalizedItems.length === 0) {
        if (existingOrder && existingOrder.status === 'Confirmed') {
            const activeSamplesCount = await LabSample.countDocuments({
                hospitalId,
                orderId: existingOrder._id,
                status: { $ne: 'CANCELLED' }
            });
            if (activeSamplesCount === 0) {
                existingOrder.status = 'Cancelled';
                existingOrder.cancellation = {
                    isCancelled: true,
                    cancelledAt: new Date(),
                    cancelledBy: actorId || null,
                    reason: 'Prescribed lab tests cleared during consultation update'
                };
                (existingOrder.samplePlaceholders || []).forEach((ph) => {
                    ph.status = 'Cancelled';
                });
                await existingOrder.save();
            }
        }
        return null;
    }

    // 1. Resolve existing Medical365 Patient (NEVER register a duplicate patient)
    const patientDoc = await resolveExistingHmsPatient({
        hospitalId,
        userId,
        patientId,
        clinicPatientId
    });

    if (!patientDoc) {
        return null;
    }

    // 2. Match prescribed items against tenant + global LabTest & TestPackage catalog
    const hidStr = String(hospitalId);
    const [catalogTests, catalogPackages] = await Promise.all([
        LabTest.find({
            $or: [{ hospitalId }, { hospitalId: null }, { hospitalId: { $exists: false } }],
            isActive: { $ne: false }
        }).lean(),
        TestPackage.find({
            $or: [{ hospitalId }, { hospitalId: null }, { hospitalId: { $exists: false } }],
            isActive: { $ne: false }
        }).lean()
    ]);

    // Prefer tenant-specific test definition over global definition when names match
    const sortedCatalogTests = [...catalogTests].sort((a, b) => {
        const aTenant = a.hospitalId && String(a.hospitalId) === hidStr ? 1 : 0;
        const bTenant = b.hospitalId && String(b.hospitalId) === hidStr ? 1 : 0;
        return bTenant - aTenant;
    });

    const verifiedTests = [];
    const verifiedPackages = [];
    let totalStandardTestsPrice = 0;
    let totalStandardPkgsPrice = 0;
    let totalDiscountedPkgsPrice = 0;
    let totalPackageSavings = 0;

    for (const item of normalizedItems) {
        const lowerName = item.rawName.toLowerCase();
        const lowerCode = item.code ? String(item.code).toLowerCase() : lowerName;
        const parenMatch = String(item.rawName || '').match(/\(([a-zA-Z0-9\-\s]{2,15})\)/);
        const parenCode = parenMatch ? parenMatch[1].trim().toLowerCase() : '';
        const normBase = lowerName
            .replace(/\([^)]*\)/g, ' ')
            .replace(/&/g, ' and ')
            .replace(/\bmicroscopy\b/g, '')
            .replace(/\bexamination\b/g, '')
            .replace(/\btest\b/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

        // Try exact match in LabTest catalog first (preferring multi-parameter configured catalog entries)
        const richFirstCatalog = [...sortedCatalogTests].sort((a, b) => {
            const aRich = (a.parameters || []).length > 1 ? 0 : 1;
            const bRich = (b.parameters || []).length > 1 ? 0 : 1;
            return aRich - bRich;
        });

        let matchedTest = richFirstCatalog.find((t) => {
            if (item.testId && String(t._id) === String(item.testId)) return true;
            const tName = String(t.testName || t.name || '').trim().toLowerCase();
            const pName = String(t.name || '').trim().toLowerCase();
            const tCode = String(t.testCode || t.code || '').trim().toLowerCase();
            const sName = String(t.shortName || '').trim().toLowerCase();
            return (
                (tName && tName === lowerName) ||
                (pName && pName === lowerName) ||
                (tCode && (tCode === lowerCode || tCode === lowerName)) ||
                (sName && sName === lowerName)
            );
        });

        // Secondary normalized match (e.g. "Complete Blood Count (CBC)" -> CBC or "Urine Routine & Microscopy" -> Urine Routine)
        if (!matchedTest) {
            matchedTest = richFirstCatalog.find((t) => {
                const tRaw = String(t.testName || t.name || '').trim().toLowerCase();
                const tCode = String(t.testCode || t.code || '').trim().toLowerCase();
                const sName = String(t.shortName || '').trim().toLowerCase();
                const tBase = tRaw
                    .replace(/\([^)]*\)/g, ' ')
                    .replace(/&/g, ' and ')
                    .replace(/\bmicroscopy\b/g, '')
                    .replace(/\bexamination\b/g, '')
                    .replace(/\btest\b/g, '')
                    .replace(/[^a-z0-9]+/g, ' ')
                    .trim();
                return (
                    (parenCode && (tCode === parenCode || sName === parenCode)) ||
                    (normBase && tBase && normBase === tBase)
                );
            });
        }

        if (!matchedTest) {
            // Check if prescribed item matches a TestPackage
            const matchedPkg = catalogPackages.find((p) => {
                const pName = String(p.packageName || p.name || '').trim().toLowerCase();
                const pCode = String(p.packageCode || p.code || '').trim().toLowerCase();
                return (pName && pName === lowerName) || (pCode && pCode === lowerCode);
            });

            if (matchedPkg) {
                const std = Number(matchedPkg.standardPrice || matchedPkg.price || 0);
                const disc = Number(matchedPkg.discountedPrice || std);
                const sav = Number(matchedPkg.savings || Math.max(0, std - disc));
                totalStandardPkgsPrice += std;
                totalDiscountedPkgsPrice += disc;
                totalPackageSavings += sav;

                verifiedPackages.push({
                    packageId: matchedPkg._id,
                    packageCode: matchedPkg.packageCode || matchedPkg.code || 'PKG',
                    packageName: matchedPkg.packageName || matchedPkg.name,
                    tests: matchedPkg.tests || [],
                    standardPrice: std,
                    discountedPrice: disc,
                    savings: sav
                });
                continue;
            }

            // Auto-provision tenant LabTest entry if doctor prescribed a custom test name
            // so downstream Specimen Collection, Result Entry & Report Generation work seamlessly
            const defaults = inferClinicalSpecimenDefaults(item.rawName);
            const cleanAlpha = item.rawName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'TEST';
            const autoCode = `${cleanAlpha}-${Date.now().toString(36).slice(-3).toUpperCase()}`;

            const createdTest = await LabTest.create({
                hospitalId,
                name: item.rawName,
                testName: item.rawName,
                code: autoCode,
                testCode: autoCode,
                department: defaults.department,
                category: defaults.department,
                specimenType: defaults.specimenType,
                containerType: defaults.containerType,
                requiredVolume: defaults.requiredVolume,
                turnaroundTime: 24,
                tatUnit: 'Hours',
                price: 0,
                standardPrice: 0,
                parameters: [{
                    parameterName: item.rawName,
                    parameterCode: cleanAlpha,
                    unit: '',
                    dataType: 'Text',
                    displayOrder: 1,
                    isRequired: true,
                    isActive: true
                }],
                isActive: true
            });
            matchedTest = createdTest.toObject ? createdTest.toObject() : createdTest;
            sortedCatalogTests.unshift(matchedTest);
        }

        if (verifiedTests.some((vt) => String(vt.testId) === String(matchedTest._id))) {
            continue;
        }

        const price = resolveHospitalTestPrice(matchedTest, hidStr);
        totalStandardTestsPrice += price;

        verifiedTests.push({
            testId: matchedTest._id,
            testCode: matchedTest.testCode || matchedTest.code || 'TEST',
            testName: matchedTest.testName || matchedTest.name,
            department: matchedTest.department || 'General Pathology',
            specimenType: matchedTest.specimenType || 'Whole Blood',
            containerType: matchedTest.containerType || 'EDTA Tube',
            requiredVolume: matchedTest.requiredVolume || '2-3 mL',
            fastingRequired: Boolean(matchedTest.fastingRequired),
            fastingInstructions: matchedTest.fastingInstructions || '',
            turnaroundTime: Number(matchedTest.turnaroundTime) || 24,
            tatUnit: matchedTest.tatUnit || 'Hours',
            standardPrice: price,
            price
        });
    }

    const pricing = {
        totalStandardPrice: totalStandardTestsPrice + totalStandardPkgsPrice,
        totalDiscount: totalPackageSavings,
        netAmount: totalStandardTestsPrice + totalDiscountedPkgsPrice,
        currency: 'INR'
    };

    const placeholders = await buildSamplePlaceholders(verifiedTests, verifiedPackages, hospitalId);
    const resolvedDocName = await resolveDoctorDisplayName({ doctorId, doctorName });

    // Derive patient age cleanly
    let resolvedAge = Number(patientDoc.age || patientDoc.fertilityProfile?.age || 0);
    const rawDob = patientDoc.dob || patientDoc.fertilityProfile?.dob || null;
    const parsedDob = rawDob ? new Date(rawDob) : null;
    if ((!resolvedAge || Number.isNaN(resolvedAge)) && parsedDob && !Number.isNaN(parsedDob.getTime())) {
        resolvedAge = Math.max(0, Math.floor((Date.now() - parsedDob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
    }

    const resolvedMrn = patientDoc.mrn || patientDoc.patientId || patientDoc.uhid || '';
    const resolvedUhid = patientDoc.uhid || patientDoc.mrn || patientDoc.patientId || '';

    const patientSnapshot = {
        name: patientDoc.name || 'Registered Patient',
        uhid: resolvedUhid,
        mrn: resolvedMrn,
        phone: patientDoc.phone || patientDoc.mobile || '0000000000',
        gender: patientDoc.gender || patientDoc.fertilityProfile?.gender || 'Other',
        age: Number.isNaN(resolvedAge) ? 0 : resolvedAge,
        dob: parsedDob && !Number.isNaN(parsedDob.getTime()) ? parsedDob : null,
        email: patientDoc.email || '',
        address: patientDoc.address || '',
        city: patientDoc.city || '',
        state: patientDoc.state || '',
        pinCode: patientDoc.pinCode || patientDoc.zipCode || ''
    };

    const validPriority = ['Routine', 'Urgent', 'STAT'].includes(priority) ? priority : 'Routine';
    const validCollectionType = ['Walk-in', 'Home Collection', 'Collection Centre'].includes(collectionType)
        ? collectionType
        : 'Walk-in';

    let savedOrder;

    // 3. Idempotent Update vs Atomic New LabOrder Creation
    if (existingOrder) {
        const existingSamples = await LabSample.find({
            hospitalId,
            orderId: existingOrder._id,
            status: { $ne: 'CANCELLED' }
        }).lean();

        if (existingSamples.length === 0) {
            // Safe to refresh full test list & placeholders before any barcode/sample is drawn
            existingOrder.tests = verifiedTests;
            existingOrder.packages = verifiedPackages;
            existingOrder.samplePlaceholders = placeholders;
            existingOrder.pricing = pricing;
            if (resolvedDocName) existingOrder.referringDoctorName = resolvedDocName;
            if (appointmentId && !existingOrder.appointmentId) existingOrder.appointmentId = appointmentId;
            if (clinicalVisitId && !existingOrder.clinicalVisitId) existingOrder.clinicalVisitId = clinicalVisitId;
            if (legacyLabReportId && !existingOrder.legacyLabReportId) existingOrder.legacyLabReportId = legacyLabReportId;
            existingOrder.updatedBy = actorId || existingOrder.updatedBy;
            savedOrder = await existingOrder.save();
        } else {
            // Samples already generated/collected: append ONLY newly added tests & uncollected specimen groups
            const existingTestIds = new Set((existingOrder.tests || []).map((t) => String(t.testId)));
            const addedTests = verifiedTests.filter((vt) => !existingTestIds.has(String(vt.testId)));

            if (addedTests.length > 0) {
                existingOrder.tests.push(...addedTests);
                existingOrder.pricing = pricing;

                const existingKeys = new Set(
                    (existingOrder.samplePlaceholders || []).map(
                        (p) => `${String(p.specimenType).toLowerCase()}|||${String(p.containerType).toLowerCase()}`
                    )
                );
                let nextIdx = (existingOrder.samplePlaceholders || []).length + 1;

                placeholders.forEach((ph) => {
                    const key = `${String(ph.specimenType).toLowerCase()}|||${String(ph.containerType).toLowerCase()}`;
                    if (!existingKeys.has(key)) {
                        existingOrder.samplePlaceholders.push({
                            ...ph,
                            samplePlaceholderId: `SMP-${String(nextIdx++).padStart(2, '0')}`
                        });
                        existingKeys.add(key);
                    }
                });
            }
            if (legacyLabReportId && !existingOrder.legacyLabReportId) {
                existingOrder.legacyLabReportId = legacyLabReportId;
            }
            savedOrder = await existingOrder.save();
        }
    } else {
        const hospital = await Hospital.findById(hospitalId);
        if (!hospital) return null;

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const hospitalCode = await Hospital.ensureHospitalCode(hospital);
        const [orderSeq, tokenNumber] = await Promise.all([
            LabCounter.getNextSequence(hospitalId, 'order', dateStr),
            LabCounter.getNextSequence(hospitalId, 'token', dateStr)
        ]);
        const orderNumber = `ORD-${hospitalCode}-${dateStr}-${String(orderSeq).padStart(4, '0')}`;

        const newOrder = new LabOrder({
            hospitalId,
            orderNumber,
            tokenNumber,
            patient: patientDoc._id,
            patientSnapshot,
            referringDoctorName: resolvedDocName,
            appointmentId: appointmentId && mongoose.Types.ObjectId.isValid(appointmentId) ? appointmentId : null,
            clinicalVisitId: clinicalVisitId && mongoose.Types.ObjectId.isValid(clinicalVisitId) ? clinicalVisitId : null,
            legacyLabReportId: legacyLabReportId && mongoose.Types.ObjectId.isValid(legacyLabReportId) ? legacyLabReportId : null,
            prescribingDoctorUserId: doctorId && mongoose.Types.ObjectId.isValid(doctorId) ? doctorId : null,
            sourceModule,
            priority: validPriority,
            collectionType: validCollectionType,
            tests: verifiedTests,
            packages: verifiedPackages,
            samplePlaceholders: placeholders,
            pricing,
            status: 'Confirmed',
            notes: notes ? String(notes).trim() : 'Prescribed via Medical365 HMS Consultation',
            createdBy: actorId || null,
            updatedBy: actorId || null
        });

        savedOrder = await newOrder.save();
    }

    // Link orderId & orderNumber back onto legacy HMS LabReport so HMS & LMS stay synchronized
    // without double-counting in LabAdminDashboard summary queries
    if (savedOrder && legacyLabReportId && mongoose.Types.ObjectId.isValid(legacyLabReportId)) {
        await LabReport.updateOne(
            { _id: legacyLabReportId },
            {
                $set: {
                    orderId: savedOrder._id,
                    orderNumber: savedOrder.orderNumber,
                    tokenNumber: savedOrder.tokenNumber
                }
            }
        ).catch(() => {});
    }

    return savedOrder;
}

module.exports = {
    syncPrescribedTestsToLmsOrder,
    normalizePrescribedTests
};
