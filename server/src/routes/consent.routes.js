const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ConsentCategory = require('../models/consentCategory.model');
const ConsentTemplate = require('../models/consentTemplate.model');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const Hospital = require('../models/hospital.model');
const ConsentFillerService = require('../services/consentFiller.service');
const { verifyToken, verifySuperAdmin } = require('../middleware/auth.middleware');

// --- Multer Configuration ---
const uploadDir = path.join(__dirname, '../../uploads/consent-templates');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'consent-' + uniqueSuffix + '.docx');
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        cb(null, true);
    } else {
        cb(new Error('Only .docx files are allowed!'), false);
    }
};

const upload = multer({ 
    storage, 
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});


// ==========================================
// Dashboard Stats
// ==========================================
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const totalCategories = await ConsentCategory.countDocuments();
        const totalTemplates = await ConsentTemplate.countDocuments();
        const activeTemplates = await ConsentTemplate.countDocuments({ isActive: true });
        const inactiveTemplates = totalTemplates - activeTemplates;

        res.json({
            success: true,
            stats: {
                totalCategories,
                totalTemplates,
                activeTemplates,
                inactiveTemplates
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// Category Management
// ==========================================
router.get('/categories', verifyToken, async (req, res) => {
    try {
        const categories = await ConsentCategory.find().sort({ sortOrder: 1, createdAt: -1 });
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/categories', verifyToken, verifySuperAdmin, async (req, res) => {
    try {
        const { name, description, isActive, sortOrder } = req.body;
        
        const exists = await ConsentCategory.findOne({ name });
        if (exists) return res.status(400).json({ success: false, message: 'Category name already exists' });

        const category = await ConsentCategory.create({ name, description, isActive, sortOrder });
        res.status(201).json({ success: true, data: category, message: 'Category created successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/categories/:id', verifyToken, verifySuperAdmin, async (req, res) => {
    try {
        const { name, description, sortOrder } = req.body;
        
        const exists = await ConsentCategory.findOne({ name, _id: { $ne: req.params.id } });
        if (exists) return res.status(400).json({ success: false, message: 'Category name already exists' });

        const category = await ConsentCategory.findByIdAndUpdate(
            req.params.id, 
            { name, description, sortOrder }, 
            { new: true }
        );
        res.json({ success: true, data: category, message: 'Category updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.patch('/categories/:id/toggle', verifyToken, verifySuperAdmin, async (req, res) => {
    try {
        const category = await ConsentCategory.findById(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        
        category.isActive = !category.isActive;
        await category.save();
        res.json({ success: true, data: category, message: `Category ${category.isActive ? 'activated' : 'deactivated'}` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/categories/:id', verifyToken, verifySuperAdmin, async (req, res) => {
    try {
        const templatesCount = await ConsentTemplate.countDocuments({ categoryId: req.params.id });
        if (templatesCount > 0) {
            return res.status(400).json({ success: false, message: 'Cannot delete category because it has templates linked to it. Delete the templates first.' });
        }

        await ConsentCategory.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// Template Management
// ==========================================
router.get('/templates', verifyToken, async (req, res) => {
    try {
        const { search, categoryId, status } = req.query;
        let query = {};

        if (search) query.name = { $regex: search, $options: 'i' };
        if (categoryId) query.categoryId = categoryId;
        if (status) query.isActive = status === 'active';

        const templates = await ConsentTemplate.find(query)
            .populate('categoryId', 'name')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: templates });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/templates/:id', verifyToken, async (req, res) => {
    try {
        const template = await ConsentTemplate.findById(req.params.id).populate('categoryId', 'name');
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
        res.json({ success: true, data: template });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/templates', verifyToken, verifySuperAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'A .docx file is required' });
        }

        const { name, categoryId, description, isActive } = req.body;

        const template = await ConsentTemplate.create({
            name,
            categoryId,
            description,
            originalFileName: req.file.originalname,
            storedFilePath: req.file.path,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            isActive: isActive === 'true' || isActive === true,
            createdBy: req.user._id || req.user.id
        });

        res.status(201).json({ success: true, data: template, message: 'Template uploaded successfully' });
    } catch (error) {
        // Clean up file if DB fails
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/templates/:id', verifyToken, verifySuperAdmin, upload.single('file'), async (req, res) => {
    try {
        const template = await ConsentTemplate.findById(req.params.id);
        if (!template) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        const { name, categoryId, description, isActive } = req.body;

        const updates = {
            name,
            categoryId,
            description,
            isActive: isActive === 'true' || isActive === true
        };

        if (req.file) {
            // Delete old file
            if (fs.existsSync(template.storedFilePath)) {
                fs.unlinkSync(template.storedFilePath);
            }
            updates.originalFileName = req.file.originalname;
            updates.storedFilePath = req.file.path;
            updates.fileSize = req.file.size;
            updates.version = template.version + 1;
        }

        const updatedTemplate = await ConsentTemplate.findByIdAndUpdate(req.params.id, updates, { new: true });
        res.json({ success: true, data: updatedTemplate, message: 'Template updated successfully' });
    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/templates/:id', verifyToken, verifySuperAdmin, async (req, res) => {
    try {
        const template = await ConsentTemplate.findById(req.params.id);
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

        if (fs.existsSync(template.storedFilePath)) {
            fs.unlinkSync(template.storedFilePath);
        }

        await ConsentTemplate.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Template deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/templates/:id/download', verifyToken, async (req, res) => {
    try {
        const template = await ConsentTemplate.findById(req.params.id);
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

        if (!fs.existsSync(template.storedFilePath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        res.download(template.storedFilePath, template.originalFileName);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// Template Generation (Auto-fill)
// ==========================================

const fetchContextData = async (patientId, req) => {
    const data = {
        patient_name: '', age: '', gender: '', address: '', phone: '',
        doctor_name: '', hospital_name: '', today: new Date().toLocaleDateString(),
        current_time: new Date().toLocaleTimeString()
    };

    if (patientId) {
        const patient = await User.findById(patientId);
        if (patient) {
            data.patient_name = patient.name || '';
            data.gender = patient.gender || '';
            data.phone = patient.phone || '';
            if (patient.dateOfBirth) {
                const diff_ms = Date.now() - new Date(patient.dateOfBirth).getTime();
                const age_dt = new Date(diff_ms); 
                data.age = Math.abs(age_dt.getUTCFullYear() - 1970).toString();
            }
        }
    }

    if (req.user && req.user.hospitalId) {
        const hospital = await Hospital.findById(req.user.hospitalId);
        if (hospital) {
            data.hospital_name = hospital.name || '';
        }
    }

    // Try to get doctor info if the current user is a doctor
    if (req.user) {
        const doctor = await Doctor.findOne({ userId: req.user._id || req.user.id });
        if (doctor) {
            data.doctor_name = doctor.name || '';
        }
    }

    return data;
};

router.get('/templates/:id/generate', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.query;
        const template = await ConsentTemplate.findById(req.params.id);
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

        if (!fs.existsSync(template.storedFilePath)) {
            return res.status(404).json({ success: false, message: 'Template file missing on server' });
        }

        const data = await fetchContextData(patientId, req);
        const buf = await ConsentFillerService.fillTemplate(template.storedFilePath, data);

        const outName = template.originalFileName.replace('.docx', `_filled_${Date.now()}.docx`);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
        res.send(buf);

    } catch (error) {
        console.error('Docx generate error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/templates/:id/generate-pdf', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.query;
        const template = await ConsentTemplate.findById(req.params.id);
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

        if (!fs.existsSync(template.storedFilePath)) {
            return res.status(404).json({ success: false, message: 'Template file missing on server' });
        }

        const data = await fetchContextData(patientId, req);
        const pdfBuf = await ConsentFillerService.generatePdf(template.storedFilePath, data);

        const outName = template.originalFileName.replace('.docx', `_filled_${Date.now()}.pdf`);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
        res.send(pdfBuf);

    } catch (error) {
        console.error('PDF generate error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
