const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');
const NabhStandard = require('../models/nabhStandard.model');
const NabhCompliance = require('../models/nabhCompliance.model');
const Capa = require('../models/capa.model');
const Hospital = require('../models/hospital.model');
const { computeHospitalQualityIndicators } = require('../services/qualityIndicator.service');

const DEFAULT_NABH_CHAPTERS = [
    {
        code: 'AAC',
        name: 'Access, Assessment and Continuity of Care',
        standards: [
            { code: 'AAC.1', title: 'Services provided are clearly defined and comply with relevant rules and regulations.' },
            { code: 'AAC.2', title: 'Patients cared for by the organization undergo an established initial assessment.' },
            { code: 'AAC.3', title: 'Laboratory services are provided as per the scope of services.' },
            { code: 'AAC.4', title: 'Imaging services are provided as per the scope of services.' },
            { code: 'AAC.5', title: 'Transfer and discharge processes are planned and coordinated.' }
        ]
    },
    {
        code: 'COP',
        name: 'Care of Patients',
        standards: [
            { code: 'COP.1', title: 'Care of patients is provided in a uniform and coordinated manner.' },
            { code: 'COP.2', title: 'Emergency services are guided by established clinical protocols.' },
            { code: 'COP.3', title: 'Care of vulnerable patients and high-risk conditions follows specific guidelines.' },
            { code: 'COP.4', title: 'Pain management is systematically practiced for all inpatients.' }
        ]
    },
    {
        code: 'MOM',
        name: 'Management of Medication',
        standards: [
            { code: 'MOM.1', title: 'Pharmacy operations and medication management follow established laws and formularies.' },
            { code: 'MOM.2', title: 'Safe storage and handling of high-alert medications and LASA drugs are enforced.' },
            { code: 'MOM.3', title: 'Prescription, dispensing and administration of medications are documented accurately in MAR.' }
        ]
    },
    {
        code: 'PRE',
        name: 'Patient Rights and Education',
        standards: [
            { code: 'PRE.1', title: 'Patient and family rights are respected and protected during care delivery.' },
            { code: 'PRE.2', title: 'Informed consent is obtained for clinical and surgical procedures.' }
        ]
    },
    {
        code: 'HIC',
        name: 'Hospital Infection Control',
        standards: [
            { code: 'HIC.1', title: 'Infection prevention and control program is actively implemented.' },
            { code: 'HIC.2', title: 'Standard precautions, hand hygiene and sterilization protocols are audited regularly.' }
        ]
    },
    {
        code: 'PSQ',
        name: 'Patient Safety and Quality Improvement',
        standards: [
            { code: 'PSQ.1', title: 'Continuous quality improvement program is guided by measurable clinical indicators.' },
            { code: 'PSQ.2', title: 'Incident reporting and Corrective and Preventive Action (CAPA) systems are maintained.' }
        ]
    },
    {
        code: 'ROM',
        name: 'Responsibilities of Management',
        standards: [
            { code: 'ROM.1', title: 'Leadership ensures ethical governance, statutory compliance and resource allocation.' }
        ]
    },
    {
        code: 'FMS',
        name: 'Facility Management and Safety',
        standards: [
            { code: 'FMS.1', title: 'Building, electrical, biomedical and fire safety requirements are strictly fulfilled.' }
        ]
    },
    {
        code: 'HRM',
        name: 'Human Resource Management',
        standards: [
            { code: 'HRM.1', title: 'Staff credentialing, continuous medical training and performance appraisals are tracked.' }
        ]
    },
    {
        code: 'IMS',
        name: 'Information Management System',
        standards: [
            { code: 'IMS.1', title: 'Electronic health records are confidential, tamper-evident and audit-trailed.' }
        ]
    }
];

// Seed standard catalog if empty
router.post('/standards/seed', verifyToken, async (req, res) => {
    try {
        const count = await NabhStandard.countDocuments();
        if (count > 0) {
            return res.json({ success: true, message: 'NABH standards already populated', count });
        }

        const docs = [];
        let sort = 1;
        for (const ch of DEFAULT_NABH_CHAPTERS) {
            for (const std of ch.standards) {
                docs.push({
                    edition: '6th Edition',
                    chapterCode: ch.code,
                    chapterName: ch.name,
                    standardCode: std.code,
                    title: std.title,
                    description: `Standard guideline for ${std.title}`,
                    objectiveElements: [
                        { elementCode: `${std.code}.a`, description: 'Documented SOP and policy exists.', category: 'CORE' },
                        { elementCode: `${std.code}.b`, description: 'Implementation verified in active clinical workflow.', category: 'COMMITMENT' },
                        { elementCode: `${std.code}.c`, description: 'Regular staff training and audit records maintained.', category: 'ACHIEVEMENT' }
                    ],
                    sortOrder: sort++
                });
            }
        }

        await NabhStandard.insertMany(docs);
        res.json({ success: true, message: 'NABH 6th Edition standards seeded successfully', count: docs.length });
    } catch (err) {
        console.error('Error seeding NABH standards:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/nabh/standards - List all standards
router.get('/standards', verifyToken, async (req, res) => {
    try {
        const { chapterCode } = req.query;
        const query = chapterCode ? { chapterCode: chapterCode.toUpperCase() } : {};
        let standards = await NabhStandard.find(query).sort({ sortOrder: 1, standardCode: 1 });

        // Auto-seed if database is empty
        if (standards.length === 0 && !chapterCode) {
            const docs = [];
            let sort = 1;
            for (const ch of DEFAULT_NABH_CHAPTERS) {
                for (const std of ch.standards) {
                    docs.push({
                        edition: '6th Edition',
                        chapterCode: ch.code,
                        chapterName: ch.name,
                        standardCode: std.code,
                        title: std.title,
                        description: `Standard guideline for ${std.title}`,
                        objectiveElements: [
                            { elementCode: `${std.code}.a`, description: 'Documented SOP and policy exists.', category: 'CORE' },
                            { elementCode: `${std.code}.b`, description: 'Implementation verified in active clinical workflow.', category: 'COMMITMENT' },
                            { elementCode: `${std.code}.c`, description: 'Regular staff training and audit records maintained.', category: 'ACHIEVEMENT' }
                        ],
                        sortOrder: sort++
                    });
                }
            }
            standards = await NabhStandard.insertMany(docs);
        }

        res.json({ success: true, count: standards.length, data: standards });
    } catch (err) {
        console.error('Error fetching NABH standards:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/nabh/overview - Super Admin multi-hospital readiness
router.get('/overview', verifyToken, async (req, res) => {
    try {
        const hospitals = await Hospital.find({}).select('name code clinicType city state accreditation createdAt');
        const overview = [];

        for (const h of hospitals) {
            const totalCompliances = await NabhCompliance.find({ hospitalId: h._id });
            const totalScore = totalCompliances.reduce((acc, c) => acc + (c.chapterScore || 0), 0);
            const maxScore = Math.max(totalCompliances.length * 10, 100);
            const readinessPercent = totalCompliances.length > 0 ? Math.min(Math.round((totalScore / maxScore) * 100), 100) : 0;
            const openCapas = await Capa.countDocuments({ hospitalId: h._id, status: { $in: ['OPEN', 'UNDER_INVESTIGATION'] } });

            overview.push({
                hospitalId: h._id,
                hospitalName: h.name,
                city: h.city,
                state: h.state,
                accreditation: h.accreditation || { enabled: false, certNo: '' },
                readinessPercent,
                evaluatedStandards: totalCompliances.length,
                openCapas
            });
        }

        res.json({ success: true, data: overview });
    } catch (err) {
        console.error('Error fetching NABH overview:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/nabh/hospitals/:hospitalId/compliance - Hospital compliance report
router.get('/hospitals/:hospitalId/compliance', verifyToken, async (req, res) => {
    try {
        const { hospitalId } = req.params;
        const compliances = await NabhCompliance.find({ hospitalId });
        const allStandards = await NabhStandard.find({}).sort({ sortOrder: 1 });

        // Calculate chapter-wise breakdown
        const chapters = DEFAULT_NABH_CHAPTERS.map(ch => {
            const chStandards = allStandards.filter(s => s.chapterCode === ch.code);
            const chCompliances = compliances.filter(c => c.chapterCode === ch.code);
            const scored = chCompliances.reduce((acc, c) => acc + (c.chapterScore || 0), 0);
            const possible = Math.max(chStandards.length * 10, 10);
            const percent = Math.min(Math.round((scored / possible) * 100), 100);

            return {
                chapterCode: ch.code,
                chapterName: ch.name,
                standardCount: chStandards.length,
                evaluatedCount: chCompliances.length,
                score: scored,
                percentage: percent
            };
        });

        const totalScored = compliances.reduce((acc, c) => acc + (c.chapterScore || 0), 0);
        const maxScore = Math.max(allStandards.length * 10, 100);
        const overallPercentage = Math.min(Math.round((totalScored / maxScore) * 100), 100);

        res.json({
            success: true,
            data: {
                hospitalId,
                overallPercentage,
                totalStandards: allStandards.length,
                evaluatedStandards: compliances.length,
                chapters,
                compliances
            }
        });
    } catch (err) {
        console.error('Error fetching hospital NABH compliance:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/nabh/hospitals/:hospitalId/compliance/:standardCode - Evaluate standard elements
router.put('/hospitals/:hospitalId/compliance/:standardCode', verifyToken, async (req, res) => {
    try {
        const { hospitalId, standardCode } = req.params;
        const { chapterCode, elementScores, overallStatus } = req.body;

        let totalScore = 0;
        if (Array.isArray(elementScores)) {
            totalScore = elementScores.reduce((acc, el) => acc + (Number(el.score) || 0), 0);
        }

        const compliance = await NabhCompliance.findOneAndUpdate(
            { hospitalId, standardCode },
            {
                hospitalId,
                standardCode,
                chapterCode: chapterCode || standardCode.split('.')[0],
                elementScores: elementScores || [],
                chapterScore: totalScore,
                overallStatus: overallStatus || 'IN_ASSESSMENT',
                lastAuditedAt: new Date(),
                lastAuditedBy: req.user._id
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({ success: true, message: 'Standard evaluation updated', data: compliance });
    } catch (err) {
        console.error('Error updating standard compliance:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/nabh/hospitals/:hospitalId/capa - List CAPA items
router.get('/hospitals/:hospitalId/capa', verifyToken, async (req, res) => {
    try {
        const { hospitalId } = req.params;
        const { status, chapterCode } = req.query;
        const filter = { hospitalId };
        if (status) filter.status = status;
        if (chapterCode) filter.chapterCode = chapterCode;

        const capas = await Capa.find(filter).sort({ createdAt: -1 });
        res.json({ success: true, count: capas.length, data: capas });
    } catch (err) {
        console.error('Error fetching CAPA items:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/nabh/hospitals/:hospitalId/capa - Create CAPA
router.post('/hospitals/:hospitalId/capa', verifyToken, async (req, res) => {
    try {
        const { hospitalId } = req.params;
        const {
            title,
            description,
            chapterCode,
            standardReference,
            nonConformanceType,
            severity,
            rootCauseAnalysis,
            correctiveAction,
            preventiveAction,
            assignedToId,
            assignedToName,
            assignedToRole,
            targetDate
        } = req.body;

        if (!title || !description) {
            return res.status(400).json({ success: false, message: 'Title and description are required' });
        }

        const count = await Capa.countDocuments({ hospitalId });
        const capaNumber = `CAPA-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

        const capa = await Capa.create({
            hospitalId,
            capaNumber,
            title,
            description,
            chapterCode: chapterCode || 'GENERAL',
            standardReference: standardReference || '',
            nonConformanceType: nonConformanceType || 'DOCUMENTATION',
            severity: severity || 'MEDIUM',
            rootCauseAnalysis: rootCauseAnalysis || '',
            correctiveAction: correctiveAction || '',
            preventiveAction: preventiveAction || '',
            assignedToId: assignedToId || null,
            assignedToName: assignedToName || '',
            assignedToRole: assignedToRole || '',
            targetDate: targetDate ? new Date(targetDate) : null,
            status: 'OPEN',
            createdBy: req.user._id,
            createdByName: req.user.name || 'Staff',
            actionHistory: [{
                action: 'CREATED',
                comment: 'CAPA initiated',
                updatedBy: req.user._id,
                updatedByName: req.user.name || 'Staff'
            }]
        });

        res.status(201).json({ success: true, message: 'CAPA created successfully', data: capa });
    } catch (err) {
        console.error('Error creating CAPA:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PATCH /api/nabh/hospitals/:hospitalId/capa/:capaId - Update CAPA status
router.patch('/hospitals/:hospitalId/capa/:capaId', verifyToken, async (req, res) => {
    try {
        const { hospitalId, capaId } = req.params;
        const { status, rootCauseAnalysis, correctiveAction, preventiveAction, comment, verificationSignOff } = req.body;

        const capa = await Capa.findOne({ _id: capaId, hospitalId });
        if (!capa) return res.status(404).json({ success: false, message: 'CAPA record not found' });

        if (status) capa.status = status;
        if (rootCauseAnalysis !== undefined) capa.rootCauseAnalysis = rootCauseAnalysis;
        if (correctiveAction !== undefined) capa.correctiveAction = correctiveAction;
        if (preventiveAction !== undefined) capa.preventiveAction = preventiveAction;
        if (verificationSignOff) capa.verificationSignOff = verificationSignOff;

        if (comment || status) {
            capa.actionHistory.push({
                action: status ? `STATUS_CHANGED_TO_${status}` : 'UPDATED',
                comment: comment || '',
                updatedBy: req.user._id,
                updatedByName: req.user.name || 'Staff',
                updatedAt: new Date()
            });
        }

        await capa.save();
        res.json({ success: true, message: 'CAPA updated successfully', data: capa });
    } catch (err) {
        console.error('Error updating CAPA:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/nabh/hospitals/:hospitalId/quality-indicators - Live quality indicators
router.get('/hospitals/:hospitalId/quality-indicators', verifyToken, async (req, res) => {
    try {
        const { hospitalId } = req.params;
        const { period } = req.query;
        const data = await computeHospitalQualityIndicators(hospitalId, period);
        res.json({ success: true, data });
    } catch (err) {
        console.error('Error fetching quality indicators:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;

