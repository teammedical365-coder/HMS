const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const LabTest = require('../models/labTest.model');
const TestPackage = require('../models/testPackage.model');
const { LabSpecimenType, LabContainerType } = require('../models/labSpecimen.model');
const LabDoctor = require('../models/labDoctor.model');
const { verifyToken } = require('../middleware/auth.middleware');

// All master data endpoints require authentication
router.use(verifyToken);

// Helper: Extract trusted tenant hospital ID
const getTenantHospitalId = (req) => {
    return req.user?.hospitalId ? String(req.user.hospitalId) : null;
};

const isSuperOrCentralAdmin = (req) => {
    const role = (req.user?.roleName || req.user?._roleData?.name || req.user?.role || '').toLowerCase();
    return role === 'superadmin' || role === 'centraladmin';
};

// Check if user is authorized to manage master data
const canManageMaster = (req) => {
    const role = (req.user?.roleName || req.user?._roleData?.name || req.user?.role || '').toLowerCase();
    if (['superadmin', 'centraladmin', 'hospitaladmin', 'lab admin', 'lab manager', 'pathologist'].some(r => role.includes(r))) {
        return true;
    }
    const perms = req.user?._roleData?.permissions || req.user?.permissions || [];
    return perms.includes('*') || perms.includes('tests:manage') || perms.includes('tests:create') || perms.includes('settings:manage');
};

const requireManageMaster = (req, res, next) => {
    if (!canManageMaster(req)) {
        return res.status(403).json({ success: false, message: 'Unauthorized to manage laboratory master data' });
    }
    next();
};

// ============================================================================
// 1. TEST CATALOG & PARAMETERS MANAGEMENT
// ============================================================================

// 1.1 List Tests (with search, category, department, active filters, pagination)
router.get('/tests', async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const { search, department, category, isActive, page = 1, limit = 50 } = req.query;

        let query = {};
        if (isSuperOrCentralAdmin(req)) {
            if (req.query.hospitalId) query.hospitalId = req.query.hospitalId;
        } else if (hid) {
            query.$or = [{ hospitalId: null }, { hospitalId: hid }];
        } else {
            query.hospitalId = null;
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$and = query.$and || [];
            query.$and.push({
                $or: [{ name: regex }, { testName: regex }, { code: regex }, { testCode: regex }, { shortName: regex }]
            });
        }

        if (department && department !== 'all') {
            query.department = department;
        }

        if (category && category !== 'all') {
            query.category = category;
        }

        if (isActive !== undefined && isActive !== 'all') {
            query.isActive = isActive === 'true' || isActive === true;
        }

        const skip = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
        const [tests, total] = await Promise.all([
            LabTest.find(query)
                .sort({ name: 1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            LabTest.countDocuments(query)
        ]);

        // Attach effective standard price for tenant
        const formatted = tests.map(t => {
            const effectivePrice = (hid && t.hospitalPrices && t.hospitalPrices[hid] !== undefined)
                ? t.hospitalPrices[hid]
                : (t.standardPrice || t.price || 0);
            return {
                ...t,
                testName: t.testName || t.name,
                testCode: t.testCode || t.code,
                standardPrice: effectivePrice,
                parametersCount: (t.parameters || []).length
            };
        });

        res.json({
            success: true,
            count: formatted.length,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)) || 1,
            data: formatted
        });
    } catch (err) {
        console.error('Fetch tests error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch test catalog: ' + err.message });
    }
});

// 1.2 Create Test with Parameters & Reference Ranges
router.post('/tests', requireManageMaster, async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const isCentral = isSuperOrCentralAdmin(req);
        const hospitalId = isCentral ? (req.body.hospitalId || null) : hid;

        const {
            testName, name, testCode, code, shortName, department, category, description,
            specimenType, containerType, requiredVolume, fastingRequired, fastingInstructions,
            turnaroundTime, tatUnit, standardPrice, price, parameters = [], isActive = true
        } = req.body;

        const finalName = String(testName || name || '').trim();
        const finalCode = String(testCode || code || '').trim().toUpperCase();

        if (!finalName) {
            return res.status(400).json({ success: false, message: 'Test Name is required.' });
        }

        const finalPrice = Number(standardPrice !== undefined ? standardPrice : price) || 0;
        if (finalPrice < 0) {
            return res.status(400).json({ success: false, message: 'Price cannot be negative.' });
        }

        // Check for duplicate testCode within same tenant scope
        if (finalCode) {
            const existing = await LabTest.findOne({
                hospitalId,
                $or: [{ code: finalCode }, { testCode: finalCode }]
            });
            if (existing) {
                return res.status(400).json({ success: false, message: `Test Code "${finalCode}" already exists in this laboratory.` });
            }
        }

        // Validate parameter reference ranges
        const validatedParams = (parameters || []).map((p, idx) => ({
            parameterName: String(p.parameterName || '').trim(),
            parameterCode: String(p.parameterCode || '').trim().toUpperCase() || `P_${idx + 1}`,
            unit: String(p.unit || '').trim(),
            dataType: ['Numeric', 'Text', 'Choice'].includes(p.dataType) ? p.dataType : 'Numeric',
            decimalPlaces: Number(p.decimalPlaces) || 0,
            displayOrder: Number(p.displayOrder) || (idx + 1),
            isRequired: p.isRequired !== false,
            defaultValue: String(p.defaultValue || ''),
            choices: Array.isArray(p.choices) ? p.choices.filter(Boolean) : [],
            referenceRanges: Array.isArray(p.referenceRanges) ? p.referenceRanges.map(r => ({
                minAge: Number(r.minAge) || 0,
                maxAge: Number(r.maxAge) || 120,
                ageUnit: ['Days', 'Months', 'Years'].includes(r.ageUnit) ? r.ageUnit : 'Years',
                gender: ['Male', 'Female', 'Other', 'Any'].includes(r.gender) ? r.gender : 'Any',
                normalMin: r.normalMin !== null && r.normalMin !== undefined && r.normalMin !== '' ? Number(r.normalMin) : null,
                normalMax: r.normalMax !== null && r.normalMax !== undefined && r.normalMax !== '' ? Number(r.normalMax) : null,
                criticalLow: r.criticalLow !== null && r.criticalLow !== undefined && r.criticalLow !== '' ? Number(r.criticalLow) : null,
                criticalHigh: r.criticalHigh !== null && r.criticalHigh !== undefined && r.criticalHigh !== '' ? Number(r.criticalHigh) : null,
                unit: String(r.unit || p.unit || '').trim(),
                interpretationNotes: String(r.interpretationNotes || '')
            })) : [],
            isActive: p.isActive !== false
        }));

        const newTest = new LabTest({
            name: finalName,
            testName: finalName,
            code: finalCode,
            testCode: finalCode,
            shortName: String(shortName || '').trim(),
            department: String(department || 'General Pathology').trim(),
            category: String(category || 'General').trim(),
            description: String(description || '').trim(),
            specimenType: String(specimenType || 'Whole Blood').trim(),
            containerType: String(containerType || 'EDTA Tube').trim(),
            requiredVolume: String(requiredVolume || '2-3 ml').trim(),
            fastingRequired: Boolean(fastingRequired),
            fastingInstructions: String(fastingInstructions || ''),
            turnaroundTime: Number(turnaroundTime) || 24,
            tatUnit: ['Hours', 'Days', 'Minutes'].includes(tatUnit) ? tatUnit : 'Hours',
            price: finalPrice,
            standardPrice: finalPrice,
            parameters: validatedParams,
            isActive: Boolean(isActive),
            hospitalId,
            createdBy: req.user._id
        });

        await newTest.save();

        res.status(201).json({
            success: true,
            message: `Test "${finalName}" created successfully with ${validatedParams.length} parameter(s).`,
            data: newTest
        });
    } catch (err) {
        console.error('Create test error:', err);
        res.status(500).json({ success: false, message: 'Failed to create test: ' + err.message });
    }
});

// 1.3 Get Single Test Details
router.get('/tests/:id', async (req, res) => {
    try {
        const test = await LabTest.findById(req.params.id).lean();
        if (!test) {
            return res.status(404).json({ success: false, message: 'Laboratory test not found.' });
        }
        res.json({ success: true, data: test });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch test details.' });
    }
});

// 1.4 Update Test
router.put('/tests/:id', requireManageMaster, async (req, res) => {
    try {
        const test = await LabTest.findById(req.params.id);
        if (!test) {
            return res.status(404).json({ success: false, message: 'Laboratory test not found.' });
        }

        const hid = getTenantHospitalId(req);
        if (!isSuperOrCentralAdmin(req) && test.hospitalId && String(test.hospitalId) !== hid) {
            return res.status(403).json({ success: false, message: 'Cannot edit tests belonging to another hospital.' });
        }

        const {
            testName, name, testCode, code, shortName, department, category, description,
            specimenType, containerType, requiredVolume, fastingRequired, fastingInstructions,
            turnaroundTime, tatUnit, standardPrice, price, parameters, isActive
        } = req.body;

        if (testName || name) {
            const n = String(testName || name).trim();
            test.name = n;
            test.testName = n;
        }

        if (testCode || code) {
            const c = String(testCode || code).trim().toUpperCase();
            test.code = c;
            test.testCode = c;
        }

        if (shortName !== undefined) test.shortName = String(shortName).trim();
        if (department !== undefined) test.department = String(department).trim();
        if (category !== undefined) test.category = String(category).trim();
        if (description !== undefined) test.description = String(description).trim();
        if (specimenType !== undefined) test.specimenType = String(specimenType).trim();
        if (containerType !== undefined) test.containerType = String(containerType).trim();
        if (requiredVolume !== undefined) test.requiredVolume = String(requiredVolume).trim();
        if (fastingRequired !== undefined) test.fastingRequired = Boolean(fastingRequired);
        if (fastingInstructions !== undefined) test.fastingInstructions = String(fastingInstructions);
        if (turnaroundTime !== undefined) test.turnaroundTime = Number(turnaroundTime) || 24;
        if (tatUnit !== undefined) test.tatUnit = tatUnit;
        if (isActive !== undefined) test.isActive = Boolean(isActive);

        const newPrice = Number(standardPrice !== undefined ? standardPrice : price);
        if (!isNaN(newPrice)) {
            if (newPrice < 0) return res.status(400).json({ success: false, message: 'Price cannot be negative.' });
            test.price = newPrice;
            test.standardPrice = newPrice;
        }

        if (Array.isArray(parameters)) {
            test.parameters = parameters.map((p, idx) => ({
                _id: p._id || new mongoose.Types.ObjectId(),
                parameterName: String(p.parameterName || '').trim(),
                parameterCode: String(p.parameterCode || '').trim().toUpperCase() || `P_${idx + 1}`,
                unit: String(p.unit || '').trim(),
                dataType: ['Numeric', 'Text', 'Choice'].includes(p.dataType) ? p.dataType : 'Numeric',
                decimalPlaces: Number(p.decimalPlaces) || 0,
                displayOrder: Number(p.displayOrder) || (idx + 1),
                isRequired: p.isRequired !== false,
                defaultValue: String(p.defaultValue || ''),
                choices: Array.isArray(p.choices) ? p.choices.filter(Boolean) : [],
                referenceRanges: Array.isArray(p.referenceRanges) ? p.referenceRanges.map(r => ({
                    _id: r._id || new mongoose.Types.ObjectId(),
                    minAge: Number(r.minAge) || 0,
                    maxAge: Number(r.maxAge) || 120,
                    ageUnit: ['Days', 'Months', 'Years'].includes(r.ageUnit) ? r.ageUnit : 'Years',
                    gender: ['Male', 'Female', 'Other', 'Any'].includes(r.gender) ? r.gender : 'Any',
                    normalMin: r.normalMin !== null && r.normalMin !== undefined && r.normalMin !== '' ? Number(r.normalMin) : null,
                    normalMax: r.normalMax !== null && r.normalMax !== undefined && r.normalMax !== '' ? Number(r.normalMax) : null,
                    criticalLow: r.criticalLow !== null && r.criticalLow !== undefined && r.criticalLow !== '' ? Number(r.criticalLow) : null,
                    criticalHigh: r.criticalHigh !== null && r.criticalHigh !== undefined && r.criticalHigh !== '' ? Number(r.criticalHigh) : null,
                    unit: String(r.unit || p.unit || '').trim(),
                    interpretationNotes: String(r.interpretationNotes || '')
                })) : [],
                isActive: p.isActive !== false
            }));
        }

        test.updatedBy = req.user._id;
        await test.save();

        res.json({
            success: true,
            message: `Test "${test.name}" updated successfully.`,
            data: test
        });
    } catch (err) {
        console.error('Update test error:', err);
        res.status(500).json({ success: false, message: 'Failed to update test: ' + err.message });
    }
});

// 1.5 Toggle Test Status
router.patch('/tests/:id/status', requireManageMaster, async (req, res) => {
    try {
        const test = await LabTest.findById(req.params.id);
        if (!test) return res.status(404).json({ success: false, message: 'Test not found' });

        const hid = getTenantHospitalId(req);
        if (!isSuperOrCentralAdmin(req) && test.hospitalId && String(test.hospitalId) !== hid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        test.isActive = !test.isActive;
        await test.save();

        res.json({
            success: true,
            message: `Test is now ${test.isActive ? 'Active' : 'Inactive'}`,
            isActive: test.isActive
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update status' });
    }
});

// 1.6 Export Tests to CSV
router.get('/tests/export/csv', async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const query = hid ? { $or: [{ hospitalId: null }, { hospitalId: hid }] } : { hospitalId: null };
        const tests = await LabTest.find(query).sort({ name: 1 }).lean();

        const headers = [
            'TestCode', 'TestName', 'ShortName', 'Department', 'Category',
            'SpecimenType', 'ContainerType', 'RequiredVolume', 'FastingRequired',
            'FastingInstructions', 'TAT_Hours', 'StandardPrice', 'ParametersCount', 'IsActive'
        ];

        const rows = tests.map(t => [
            `"${(t.testCode || t.code || '').replace(/"/g, '""')}"`,
            `"${(t.testName || t.name || '').replace(/"/g, '""')}"`,
            `"${(t.shortName || '').replace(/"/g, '""')}"`,
            `"${(t.department || '').replace(/"/g, '""')}"`,
            `"${(t.category || '').replace(/"/g, '""')}"`,
            `"${(t.specimenType || '').replace(/"/g, '""')}"`,
            `"${(t.containerType || '').replace(/"/g, '""')}"`,
            `"${(t.requiredVolume || '').replace(/"/g, '""')}"`,
            t.fastingRequired ? 'YES' : 'NO',
            `"${(t.fastingInstructions || '').replace(/"/g, '""')}"`,
            t.turnaroundTime || 24,
            t.standardPrice || t.price || 0,
            (t.parameters || []).length,
            t.isActive !== false ? 'ACTIVE' : 'INACTIVE'
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="medical365_test_catalog.csv"');
        res.send(csvContent);
    } catch (err) {
        console.error('Export tests CSV error:', err);
        res.status(500).json({ success: false, message: 'Failed to export test catalog CSV' });
    }
});

// 1.7 Import Tests from CSV data
router.post('/tests/import/csv', requireManageMaster, async (req, res) => {
    try {
        const { csvText } = req.body;
        if (!csvText || !csvText.trim()) {
            return res.status(400).json({ success: false, message: 'CSV text content is required' });
        }

        const hid = getTenantHospitalId(req);
        const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) {
            return res.status(400).json({ success: false, message: 'CSV file must have header and at least one data row' });
        }

        const parseCSVLine = (line) => {
            const result = [];
            let inQuotes = false;
            let current = '';
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        };

        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const codeIdx = headers.findIndex(h => h.includes('code'));
        const nameIdx = headers.findIndex(h => h.includes('name'));
        const priceIdx = headers.findIndex(h => h.includes('price'));
        const deptIdx = headers.findIndex(h => h.includes('department') || h.includes('dept'));
        const catIdx = headers.findIndex(h => h.includes('category'));

        if (nameIdx === -1) {
            return res.status(400).json({ success: false, message: 'CSV must contain a "TestName" or "Name" column.' });
        }

        let importedCount = 0;
        let updatedCount = 0;
        const errors = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            if (cols.length === 0 || !cols[nameIdx]) continue;

            const tName = cols[nameIdx];
            const tCode = codeIdx >= 0 && cols[codeIdx] ? cols[codeIdx].toUpperCase() : tName.slice(0, 6).toUpperCase();
            const tPrice = priceIdx >= 0 ? Math.max(0, Number(cols[priceIdx]) || 0) : 0;
            const tDept = deptIdx >= 0 && cols[deptIdx] ? cols[deptIdx] : 'General Pathology';
            const tCat = catIdx >= 0 && cols[catIdx] ? cols[catIdx] : 'General';

            try {
                const existing = await LabTest.findOne({
                    hospitalId: hid,
                    $or: [{ code: tCode }, { testCode: tCode }, { name: tName }]
                });

                if (existing) {
                    existing.price = tPrice;
                    existing.standardPrice = tPrice;
                    existing.department = tDept;
                    existing.category = tCat;
                    await existing.save();
                    updatedCount++;
                } else {
                    await LabTest.create({
                        name: tName,
                        testName: tName,
                        code: tCode,
                        testCode: tCode,
                        price: tPrice,
                        standardPrice: tPrice,
                        department: tDept,
                        category: tCat,
                        hospitalId: hid,
                        createdBy: req.user._id
                    });
                    importedCount++;
                }
            } catch (rowErr) {
                errors.push(`Row ${i + 1} (${tName}): ${rowErr.message}`);
            }
        }

        res.json({
            success: true,
            message: `CSV Import Complete: ${importedCount} created, ${updatedCount} updated.`,
            importedCount,
            updatedCount,
            errors
        });
    } catch (err) {
        console.error('Import CSV error:', err);
        res.status(500).json({ success: false, message: 'Failed to process CSV import: ' + err.message });
    }
});


// ============================================================================
// 2. PACKAGES & PROFILES MANAGEMENT
// ============================================================================

// 2.1 List Packages
router.get('/packages', async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        let query = {};
        if (isSuperOrCentralAdmin(req)) {
            if (req.query.hospitalId) query.hospitalId = req.query.hospitalId;
        } else if (hid) {
            query.$or = [{ hospitalId: null }, { hospitalId: hid }];
        } else {
            query.hospitalId = null;
        }

        const packages = await TestPackage.find(query)
            .populate('tests', 'name testName code testCode price standardPrice department category')
            .sort({ name: 1 })
            .lean();

        const formatted = packages.map(p => {
            const testList = p.tests || [];
            const computedBasePrice = testList.reduce((sum, t) => sum + (Number(t.standardPrice || t.price) || 0), 0);
            const discPrice = Number(p.discountedPrice) || computedBasePrice;
            const savings = Math.max(0, computedBasePrice - discPrice);

            return {
                ...p,
                packageName: p.packageName || p.name,
                packageCode: p.packageCode || p.code,
                standardPrice: computedBasePrice,
                discountedPrice: discPrice,
                savings,
                testCount: testList.length
            };
        });

        res.json({ success: true, count: formatted.length, data: formatted });
    } catch (err) {
        console.error('Fetch packages error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch packages' });
    }
});

// 2.2 Create Package
router.post('/packages', requireManageMaster, async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const {
            packageName, name, packageCode, code, description, tests = [],
            discountedPrice, department, category, isActive = true
        } = req.body;

        const finalName = String(packageName || name || '').trim();
        const finalCode = String(packageCode || code || '').trim().toUpperCase();

        if (!finalName) {
            return res.status(400).json({ success: false, message: 'Package Name is required.' });
        }

        if (!Array.isArray(tests) || tests.length === 0) {
            return res.status(400).json({ success: false, message: 'Please select at least one test for this package.' });
        }

        // Deduplicate tests
        const uniqueTestIds = [...new Set(tests.map(String))];

        // Fetch selected tests from database to verify and calculate trusted server-side price total
        const validTests = await LabTest.find({ _id: { $in: uniqueTestIds }, isActive: true });
        if (validTests.length === 0) {
            return res.status(400).json({ success: false, message: 'None of the selected tests were found active in database.' });
        }

        const calculatedBasePrice = validTests.reduce((sum, t) => sum + (Number(t.standardPrice || t.price) || 0), 0);
        const discPrice = Number(discountedPrice !== undefined ? discountedPrice : calculatedBasePrice) || calculatedBasePrice;

        if (discPrice < 0) {
            return res.status(400).json({ success: false, message: 'Package price cannot be negative.' });
        }

        const savings = Math.max(0, calculatedBasePrice - discPrice);

        const newPkg = new TestPackage({
            name: finalName,
            packageName: finalName,
            code: finalCode || finalName.slice(0, 6).toUpperCase(),
            packageCode: finalCode || finalName.slice(0, 6).toUpperCase(),
            description: String(description || '').trim(),
            tests: validTests.map(t => t._id),
            price: calculatedBasePrice,
            standardPrice: calculatedBasePrice,
            discountedPrice: discPrice,
            savings,
            department: String(department || 'Health Packages').trim(),
            category: String(category || 'General').trim(),
            isActive: Boolean(isActive),
            hospitalId: hid,
            createdBy: req.user._id
        });

        await newPkg.save();
        await newPkg.populate('tests', 'name testName code testCode price standardPrice');

        res.status(201).json({
            success: true,
            message: `Package "${finalName}" created with ${validTests.length} tests (Savings: ₹${savings}).`,
            data: newPkg
        });
    } catch (err) {
        console.error('Create package error:', err);
        res.status(500).json({ success: false, message: 'Failed to create package: ' + err.message });
    }
});

// 2.3 Update Package
router.put('/packages/:id', requireManageMaster, async (req, res) => {
    try {
        const pkg = await TestPackage.findById(req.params.id);
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        const hid = getTenantHospitalId(req);
        if (!isSuperOrCentralAdmin(req) && pkg.hospitalId && String(pkg.hospitalId) !== hid) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const {
            packageName, name, packageCode, code, description, tests,
            discountedPrice, department, category, isActive
        } = req.body;

        if (packageName || name) {
            const n = String(packageName || name).trim();
            pkg.name = n;
            pkg.packageName = n;
        }

        if (packageCode || code) {
            const c = String(packageCode || code).trim().toUpperCase();
            pkg.code = c;
            pkg.packageCode = c;
        }

        if (description !== undefined) pkg.description = String(description).trim();
        if (department !== undefined) pkg.department = String(department).trim();
        if (category !== undefined) pkg.category = String(category).trim();
        if (isActive !== undefined) pkg.isActive = Boolean(isActive);

        if (Array.isArray(tests)) {
            const uniqueTestIds = [...new Set(tests.map(String))];
            const validTests = await LabTest.find({ _id: { $in: uniqueTestIds } });
            pkg.tests = validTests.map(t => t._id);

            const calculatedBasePrice = validTests.reduce((sum, t) => sum + (Number(t.standardPrice || t.price) || 0), 0);
            pkg.price = calculatedBasePrice;
            pkg.standardPrice = calculatedBasePrice;
        }

        if (discountedPrice !== undefined) {
            const dPrice = Number(discountedPrice);
            if (dPrice < 0) return res.status(400).json({ success: false, message: 'Price cannot be negative' });
            pkg.discountedPrice = dPrice;
        }

        pkg.savings = Math.max(0, (pkg.standardPrice || pkg.price || 0) - (pkg.discountedPrice || 0));
        pkg.updatedBy = req.user._id;

        await pkg.save();
        await pkg.populate('tests', 'name testName code testCode price standardPrice');

        res.json({
            success: true,
            message: `Package "${pkg.name}" updated successfully.`,
            data: pkg
        });
    } catch (err) {
        console.error('Update package error:', err);
        res.status(500).json({ success: false, message: 'Failed to update package: ' + err.message });
    }
});

// 2.4 Toggle Package Status
router.patch('/packages/:id/status', requireManageMaster, async (req, res) => {
    try {
        const pkg = await TestPackage.findById(req.params.id);
        if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

        pkg.isActive = !pkg.isActive;
        await pkg.save();

        res.json({ success: true, message: `Package is now ${pkg.isActive ? 'Active' : 'Inactive'}`, isActive: pkg.isActive });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update package status' });
    }
});


// ============================================================================
// 3. SPECIMEN TYPES & CONTAINERS MASTER
// ============================================================================

// 3.1 Get Specimens
router.get('/specimens', async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const query = hid ? { $or: [{ hospitalId: null }, { hospitalId: hid }] } : { hospitalId: null };
        const specimens = await LabSpecimenType.find(query).sort({ specimenName: 1 }).lean();

        // If none configured yet, return common diagnostic specimen standards
        if (specimens.length === 0) {
            const defaults = [
                { specimenCode: 'WB', specimenName: 'Whole Blood', description: 'Fresh anticoagulated venous blood' },
                { specimenCode: 'SRM', specimenName: 'Serum', description: 'Clotted whole blood centrifugation supernatant' },
                { specimenCode: 'PLS', specimenName: 'Plasma', description: 'Anticoagulated centrifugation supernatant' },
                { specimenCode: 'URN', specimenName: 'Urine', description: 'Mid-stream clean catch specimen' },
                { specimenCode: 'STL', specimenName: 'Stool', description: 'Fresh fecal specimen' },
                { specimenCode: 'SWB', specimenName: 'Swab (Throat/Nasal)', description: 'Sterile transport swab' }
            ];
            return res.json({ success: true, count: defaults.length, data: defaults });
        }

        res.json({ success: true, count: specimens.length, data: specimens });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch specimen types' });
    }
});

// 3.2 Create Specimen
router.post('/specimens', requireManageMaster, async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const { specimenCode, specimenName, description, isActive = true } = req.body;

        if (!specimenName || !specimenCode) {
            return res.status(400).json({ success: false, message: 'Specimen Name and Code are required' });
        }

        const newSpecimen = new LabSpecimenType({
            hospitalId: hid,
            specimenCode: String(specimenCode).trim().toUpperCase(),
            specimenName: String(specimenName).trim(),
            description: String(description || '').trim(),
            isActive: Boolean(isActive),
            createdBy: req.user._id
        });

        await newSpecimen.save();
        res.status(201).json({ success: true, message: 'Specimen type created', data: newSpecimen });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3.3 Get Containers
router.get('/containers', async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const query = hid ? { $or: [{ hospitalId: null }, { hospitalId: hid }] } : { hospitalId: null };
        const containers = await LabContainerType.find(query).sort({ containerName: 1 }).lean();

        if (containers.length === 0) {
            const defaults = [
                { containerCode: 'EDTA', containerName: 'EDTA Tube (Lavender Top)', tubeColor: 'Lavender', additive: 'K2/K3 EDTA', minimumVolume: '2 ml', maximumVolume: '3 ml', labelColor: '#8b5cf6' },
                { containerCode: 'PLAIN', containerName: 'Plain / Clot Activator (Red Top)', tubeColor: 'Red', additive: 'Silica Clot Activator', minimumVolume: '3 ml', maximumVolume: '5 ml', labelColor: '#ef4444' },
                { containerCode: 'CITRATE', containerName: 'Sodium Citrate (Light Blue Top)', tubeColor: 'Light Blue', additive: '3.2% Sodium Citrate (1:9 ratio)', minimumVolume: '2.7 ml', maximumVolume: '3 ml', labelColor: '#38bdf8' },
                { containerCode: 'FLUORIDE', containerName: 'Fluoride / Oxalate (Grey Top)', tubeColor: 'Grey', additive: 'Sodium Fluoride / Potassium Oxalate', minimumVolume: '2 ml', maximumVolume: '2.5 ml', labelColor: '#64748b' }
            ];
            return res.json({ success: true, count: defaults.length, data: defaults });
        }

        res.json({ success: true, count: containers.length, data: containers });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch container types' });
    }
});

// 3.4 Create Container
router.post('/containers', requireManageMaster, async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const {
            containerCode, containerName, tubeColor, additive,
            minimumVolume, maximumVolume, specimenCompatibility = [], labelColor, isActive = true
        } = req.body;

        if (!containerName || !containerCode) {
            return res.status(400).json({ success: false, message: 'Container Name and Code are required' });
        }

        const newContainer = new LabContainerType({
            hospitalId: hid,
            containerCode: String(containerCode).trim().toUpperCase(),
            containerName: String(containerName).trim(),
            tubeColor: String(tubeColor || 'Lavender').trim(),
            additive: String(additive || '').trim(),
            minimumVolume: String(minimumVolume || '1 ml').trim(),
            maximumVolume: String(maximumVolume || '5 ml').trim(),
            specimenCompatibility: Array.isArray(specimenCompatibility) ? specimenCompatibility : [],
            labelColor: String(labelColor || '#8b5cf6').trim(),
            isActive: Boolean(isActive),
            createdBy: req.user._id
        });

        await newContainer.save();
        res.status(201).json({ success: true, message: 'Container type created', data: newContainer });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// ============================================================================
// 4. REFERRING DOCTOR MASTER MANAGEMENT
// ============================================================================

// 4.1 List Doctors
router.get('/doctors', async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        if (!hid && !isSuperOrCentralAdmin(req)) {
            return res.status(400).json({ success: false, message: 'Hospital context required' });
        }

        const { search, specialization, isActive } = req.query;
        let query = hid ? { hospitalId: hid } : {};

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { doctorName: regex },
                { registrationNumber: regex },
                { clinicHospitalName: regex },
                { contactNumber: regex }
            ];
        }

        if (specialization && specialization !== 'all') {
            query.specialization = specialization;
        }

        if (isActive !== undefined && isActive !== 'all') {
            query.isActive = isActive === 'true' || isActive === true;
        }

        const doctors = await LabDoctor.find(query).sort({ doctorName: 1 }).lean();
        res.json({ success: true, count: doctors.length, data: doctors });
    } catch (err) {
        console.error('Fetch doctors error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch referring doctors' });
    }
});

// 4.2 Create Doctor
router.post('/doctors', requireManageMaster, async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        if (!hid) return res.status(400).json({ success: false, message: 'Hospital context required' });

        const {
            doctorName, registrationNumber, qualification, specialization,
            clinicHospitalName, contactNumber, email, address, commissionRule, isActive = true
        } = req.body;

        if (!doctorName || !doctorName.trim()) {
            return res.status(400).json({ success: false, message: 'Doctor Name is required.' });
        }

        // Prevent duplicate registration number within same hospital
        if (registrationNumber && registrationNumber.trim()) {
            const existing = await LabDoctor.findOne({
                hospitalId: hid,
                registrationNumber: registrationNumber.trim()
            });
            if (existing) {
                return res.status(400).json({ success: false, message: `Doctor with registration "${registrationNumber.trim()}" is already registered.` });
            }
        }

        const newDoc = new LabDoctor({
            hospitalId: hid,
            doctorName: String(doctorName).trim(),
            registrationNumber: String(registrationNumber || '').trim(),
            qualification: String(qualification || 'MBBS').trim(),
            specialization: String(specialization || 'General Medicine').trim(),
            clinicHospitalName: String(clinicHospitalName || '').trim(),
            contactNumber: String(contactNumber || '').trim(),
            email: String(email || '').trim().toLowerCase(),
            address: String(address || '').trim(),
            commissionRule: {
                type: commissionRule?.type || 'NONE',
                value: Number(commissionRule?.value) || 0,
                notes: String(commissionRule?.notes || '')
            },
            isActive: Boolean(isActive),
            createdBy: req.user._id
        });

        await newDoc.save();
        res.status(201).json({ success: true, message: `Dr. ${newDoc.doctorName} registered successfully.`, data: newDoc });
    } catch (err) {
        console.error('Create doctor error:', err);
        res.status(500).json({ success: false, message: 'Failed to create doctor: ' + err.message });
    }
});

// 4.3 Update Doctor
router.put('/doctors/:id', requireManageMaster, async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const doc = await LabDoctor.findOne({ _id: req.params.id, hospitalId: hid });
        if (!doc) return res.status(404).json({ success: false, message: 'Referring doctor record not found' });

        const {
            doctorName, registrationNumber, qualification, specialization,
            clinicHospitalName, contactNumber, email, address, commissionRule, isActive
        } = req.body;

        if (doctorName !== undefined) doc.doctorName = String(doctorName).trim();
        if (registrationNumber !== undefined) doc.registrationNumber = String(registrationNumber).trim();
        if (qualification !== undefined) doc.qualification = String(qualification).trim();
        if (specialization !== undefined) doc.specialization = String(specialization).trim();
        if (clinicHospitalName !== undefined) doc.clinicHospitalName = String(clinicHospitalName).trim();
        if (contactNumber !== undefined) doc.contactNumber = String(contactNumber).trim();
        if (email !== undefined) doc.email = String(email).trim().toLowerCase();
        if (address !== undefined) doc.address = String(address).trim();
        if (isActive !== undefined) doc.isActive = Boolean(isActive);

        if (commissionRule) {
            doc.commissionRule = {
                type: commissionRule.type || doc.commissionRule?.type || 'NONE',
                value: Number(commissionRule.value) || 0,
                notes: String(commissionRule.notes || '')
            };
        }

        doc.updatedBy = req.user._id;
        await doc.save();

        res.json({ success: true, message: 'Doctor details updated successfully', data: doc });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update doctor: ' + err.message });
    }
});

// 4.4 Toggle Doctor Status
router.patch('/doctors/:id/status', requireManageMaster, async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const doc = await LabDoctor.findOne({ _id: req.params.id, hospitalId: hid });
        if (!doc) return res.status(404).json({ success: false, message: 'Doctor not found' });

        doc.isActive = !doc.isActive;
        await doc.save();

        res.json({ success: true, message: `Doctor is now ${doc.isActive ? 'Active' : 'Inactive'}`, isActive: doc.isActive });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update status' });
    }
});


// ============================================================================
// 5. STANDARD PRICE LIST MANAGEMENT
// ============================================================================

// 5.1 Fetch Consolidated Standard Price List
router.get('/prices', async (req, res) => {
    try {
        const hid = getTenantHospitalId(req);
        const testQuery = hid ? { $or: [{ hospitalId: null }, { hospitalId: hid }] } : { hospitalId: null };
        const pkgQuery = hid ? { $or: [{ hospitalId: null }, { hospitalId: hid }] } : { hospitalId: null };

        const [tests, packages] = await Promise.all([
            LabTest.find(testQuery).select('name testName code testCode department category price standardPrice isActive').sort({ name: 1 }).lean(),
            TestPackage.find(pkgQuery).select('name packageName code packageCode department category price standardPrice discountedPrice savings isActive').sort({ name: 1 }).lean()
        ]);

        const formattedTests = tests.map(t => ({
            id: t._id,
            type: 'TEST',
            name: t.testName || t.name,
            code: t.testCode || t.code,
            department: t.department || 'General',
            category: t.category || 'General',
            standardPrice: t.standardPrice || t.price || 0,
            isActive: t.isActive
        }));

        const formattedPackages = packages.map(p => ({
            id: p._id,
            type: 'PACKAGE',
            name: p.packageName || p.name,
            code: p.packageCode || p.code,
            department: p.department || 'Health Packages',
            category: p.category || 'General',
            standardPrice: p.standardPrice || p.price || 0,
            discountedPrice: p.discountedPrice || p.standardPrice || 0,
            savings: p.savings || 0,
            isActive: p.isActive
        }));

        res.json({
            success: true,
            totalItems: formattedTests.length + formattedPackages.length,
            tests: formattedTests,
            packages: formattedPackages
        });
    } catch (err) {
        console.error('Fetch prices error:', err);
        res.status(500).json({ success: false, message: 'Failed to load price list' });
    }
});

// 5.2 Bulk Update Standard Prices (with safe numeric validation)
router.put('/prices', requireManageMaster, async (req, res) => {
    try {
        const { updates } = req.body;
        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ success: false, message: 'Array of price updates is required' });
        }

        const hid = getTenantHospitalId(req);
        let updatedCount = 0;
        const errors = [];

        for (const item of updates) {
            const { id, type, standardPrice, discountedPrice } = item;
            if (!id) continue;

            const newPrice = Number(standardPrice);
            if (isNaN(newPrice) || newPrice < 0) {
                errors.push(`Item ID ${id}: Price cannot be negative`);
                continue;
            }

            try {
                if (type === 'PACKAGE') {
                    const pkg = await TestPackage.findById(id);
                    if (pkg) {
                        pkg.price = newPrice;
                        pkg.standardPrice = newPrice;
                        if (discountedPrice !== undefined) {
                            const dPrice = Math.max(0, Number(discountedPrice) || 0);
                            pkg.discountedPrice = dPrice;
                            pkg.savings = Math.max(0, newPrice - dPrice);
                        } else {
                            pkg.savings = Math.max(0, newPrice - (pkg.discountedPrice || 0));
                        }
                        await pkg.save();
                        updatedCount++;
                    }
                } else {
                    const test = await LabTest.findById(id);
                    if (test) {
                        test.price = newPrice;
                        test.standardPrice = newPrice;
                        if (hid && !isSuperOrCentralAdmin(req)) {
                            test.hospitalPrices = test.hospitalPrices || new Map();
                            test.hospitalPrices.set(hid, newPrice);
                        }
                        await test.save();
                        updatedCount++;
                    }
                }
            } catch (itemErr) {
                errors.push(`Item ${id}: ${itemErr.message}`);
            }
        }

        res.json({
            success: true,
            message: `Updated ${updatedCount} price records successfully.`,
            updatedCount,
            errors
        });
    } catch (err) {
        console.error('Bulk price update error:', err);
        res.status(500).json({ success: false, message: 'Price update failed: ' + err.message });
    }
});

module.exports = router;
