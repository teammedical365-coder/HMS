const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const Inventory = require('../models/inventory.model');
const Medicine = require('../models/medicine.model');
const PurchaseInvoice = require('../models/purchaseInvoice.model');
const PurchaseInvoiceMedicine = require('../models/purchaseInvoiceMedicine.model');
const Vendor = require('../models/vendor.model');
const { verifyToken, verifyAdmin } = require('../middleware/auth.middleware');
const { parseInvoice, validatePdfBuffer, InvoiceParseError } = require('../utils/invoiceParser');
const { processInvoiceDocument } = require('../services/pharmacyInvoiceExtractor.service');

const MAX_INVOICE_BYTES = 10 * 1024 * 1024; // 10MB
const INVOICES_ROOT_DIR = path.resolve(__dirname, '../../uploads/invoices');

const getTenantScope = (req) => {
    if (req.user?.hospitalId) {
        return { hospitalId: req.user.hospitalId };
    }
    return { pharmacyId: req.user.id };
};

const getTenantFolderName = (req) => {
    const raw = req.user?.hospitalId || req.user?.id || 'default';
    return String(raw).replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
};

const resolveSafeInvoiceFilePath = (invoice) => {
    const relPath = invoice?.uploadedPDF?.storagePath;
    if (relPath) {
        const resolved = path.resolve(INVOICES_ROOT_DIR, relPath);
        if (resolved.startsWith(INVOICES_ROOT_DIR) && fs.existsSync(resolved)) {
            return resolved;
        }
    }
    const genName = invoice?.uploadedPDF?.generatedName;
    if (genName) {
        const legacyPath = path.resolve(INVOICES_ROOT_DIR, path.basename(genName));
        if (legacyPath.startsWith(INVOICES_ROOT_DIR) && fs.existsSync(legacyPath)) {
            return legacyPath;
        }
    }
    return null;
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_INVOICE_BYTES },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new InvoiceParseError('UNSUPPORTED_FORMAT', 'Only PDF files are allowed for vendor invoice import.'), false);
        }
    }
});

const invoiceStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(INVOICES_ROOT_DIR, getTenantFolderName(req));
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const safeBase = path.basename(file.originalname || 'invoice.pdf')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .slice(-60);
        const uid = crypto.randomBytes(6).toString('hex');
        cb(null, `${Date.now()}-${uid}-${safeBase.endsWith('.pdf') ? safeBase : `${safeBase}.pdf`}`);
    }
});

const uploadInvoice = multer({
    storage: invoiceStorage,
    limits: { fileSize: MAX_INVOICE_BYTES },
    fileFilter: (req, file, cb) => {
        const isPdfMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf';
        const isPdfExt = /\.pdf$/i.test(file.originalname || '');
        if (isPdfMime || isPdfExt) {
            cb(null, true);
        } else {
            cb(new InvoiceParseError('UNSUPPORTED_FORMAT', 'Unsupported file format. Please upload a PDF (.pdf) invoice file.'), false);
        }
    }
});

const handleInvoiceUploadMiddleware = (req, res, next) => {
    uploadInvoice.single('invoice')(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    code: 'FILE_TOO_LARGE',
                    message: 'Uploaded PDF exceeds the maximum allowed size of 10MB.'
                });
            }
            return res.status(400).json({
                success: false,
                code: err.code || 'UPLOAD_ERROR',
                message: 'File upload failed. Please select a valid PDF file under 10MB.'
            });
        }
        return res.status(400).json({
            success: false,
            code: err.code || 'UNSUPPORTED_FORMAT',
            message: err.message || 'Only PDF files are supported.'
        });
    });
};

const User = require('../models/user.model');
const Role = require('../models/role.model');
const Hospital = require('../models/hospital.model');
const VendorReturn = require('../models/vendorReturn.model');
const ConsumptionLog = require('../models/consumptionLog.model');
const Department = require('../models/department.model');
const DepartmentStock = require('../models/departmentStock.model');
const DepartmentTransfer = require('../models/departmentTransfer.model');
const DepartmentUsage = require('../models/departmentUsage.model');
const FacilityCharge = require('../models/facilityCharge.model');
// Update Pharmacy Billing Details
router.put('/hospital-billing', verifyToken, async (req, res) => {
    try {
        if (!req.user.hospitalId) {
            return res.status(400).json({ success: false, message: 'No hospital associated with this user' });
        }
        
        const { gstin, dlNumber } = req.body;
        const hospital = await Hospital.findById(req.user.hospitalId);
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found' });
        }

        if (gstin !== undefined) hospital.gstin = gstin;
        if (dlNumber !== undefined) hospital.dlNumber = dlNumber;
        
        await hospital.save();
        res.json({ success: true, message: 'Billing details updated successfully', data: hospital });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET all inventory (Optimized Lean Query)
router.get('/inventory', verifyToken, async (req, res) => {
    try {
        const query = req.user.hospitalId 
            ? { hospitalId: req.user.hospitalId } 
            : { pharmacyId: req.user.id };

        const items = await Inventory.find(query)
            .sort({ createdAt: -1 })
            .lean();

        res.json({ success: true, data: items });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST new medicine
router.post('/inventory', verifyToken, async (req, res) => {
    try {
        if (req.body.purchaseInvoiceId) {
            const existing = await Inventory.findOne({
                purchaseInvoiceId: req.body.purchaseInvoiceId,
                name: req.body.name,
                batchNumber: req.body.batchNumber
            });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Medicine already imported from this invoice.' });
            }
        }

        const newItem = new Inventory({
            ...req.body,
            pharmacyId: req.user.id,
            hospitalId: req.user.hospitalId
        });

        await newItem.save();

        if (req.body.purchaseInvoiceId) {
            const invoice = await PurchaseInvoice.findById(req.body.purchaseInvoiceId);
            if (invoice) {
                invoice.importedMedicines += 1;
                invoice.remainingMedicines = invoice.totalMedicines - invoice.importedMedicines;
                if (invoice.remainingMedicines <= 0) invoice.status = 'Completed';
                await invoice.save();
            }
        }

        res.status(201).json({ success: true, data: newItem });
    } catch (error) {
        console.error("Mongoose Save Error:", error.message);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE medicine
router.delete('/inventory/:id', verifyToken, async (req, res) => {
    try {
        const deleteQuery = { _id: req.params.id };
        if (req.user.hospitalId) {
            deleteQuery.hospitalId = req.user.hospitalId;
        } else {
            deleteQuery.pharmacyId = req.user.id;
        }
        const deletedItem = await Inventory.findOneAndDelete(deleteQuery);

        if (!deletedItem) {
            return res.status(404).json({ success: false, message: "Item not found or unauthorized" });
        }

        res.json({ success: true, message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// UPDATE medicine
router.put('/inventory/:id', verifyToken, async (req, res) => {
    try {
        const updateQuery = { _id: req.params.id };
        if (req.user.hospitalId) {
            updateQuery.hospitalId = req.user.hospitalId;
        } else {
            updateQuery.pharmacyId = req.user.id;
        }
        
        const updatedItem = await Inventory.findOneAndUpdate(
            updateQuery,
            { 
                $set: {
                    ...req.body,
                    isMultiDose: Boolean(req.body.isMultiDose),
                    packVolume: Number(req.body.packVolume) || 1,
                    billingType: req.body.billingType || 'FULL_UNIT'
                }
            },
            { new: true, runValidators: true }
        );

        if (!updatedItem) {
            return res.status(404).json({ success: false, message: "Item not found or unauthorized" });
        }

        res.json({ success: true, data: updatedItem });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- VENDOR MANAGEMENT ---

const validateVendorPayload = (data) => {
    const { vendorName, phone, gstin } = data;
    if (!vendorName || !vendorName.trim()) return "Vendor name is required";
    if (phone && !/^\d{10}$/.test(phone)) return "Phone number must be exactly 10 digits";
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.trim())) {
        return "Invalid GSTIN format";
    }
    return null;
};

// Add Vendor
router.post('/vendors', verifyToken, async (req, res) => {
    try {
        if (!req.user.hospitalId) {
            return res.status(403).json({ success: false, message: 'Hospital context required' });
        }
        
        const validationError = validateVendorPayload(req.body);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        const newVendor = new Vendor({
            ...req.body,
            hospitalId: req.user.hospitalId
        });
        await newVendor.save();
        res.status(201).json({ success: true, data: newVendor });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Vendors
router.get('/vendors', verifyToken, async (req, res) => {
    try {
        if (!req.user.hospitalId) {
            return res.json({ success: true, data: [] });
        }
        const vendors = await Vendor.find({ hospitalId: req.user.hospitalId }).sort({ createdAt: -1 });
        res.json({ success: true, data: vendors });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Vendor
router.put('/vendors/:id', verifyToken, async (req, res) => {
    try {
        if (!req.user.hospitalId) {
            return res.status(403).json({ success: false, message: 'Hospital context required' });
        }

        const validationError = validateVendorPayload(req.body);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        const updatedVendor = await Vendor.findOneAndUpdate(
            { _id: req.params.id, hospitalId: req.user.hospitalId },
            { $set: req.body },
            { new: true, runValidators: true }
        );
        if (!updatedVendor) {
            return res.status(404).json({ success: false, message: "Vendor not found or unauthorized" });
        }
        res.json({ success: true, data: updatedVendor });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- REVENUE & COLLECTIONS ANALYTICS ---
const PharmacyOrder = require('../models/pharmacyOrder.model');
const PharmacyReturn = require('../models/pharmacyReturn.model');

router.get('/analytics/collections', verifyToken, async (req, res) => {
    try {
        if (!req.user.hospitalId) {
            return res.status(403).json({ success: false, message: 'Hospital context required' });
        }

        const { startDate, endDate } = req.query;
        let start = new Date();
        start.setHours(0, 0, 0, 0);
        let end = new Date();
        end.setHours(23, 59, 59, 999);

        if (startDate) {
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
        }
        if (endDate) {
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        }

        const dateFilter = {
            hospitalId: req.user.hospitalId,
            createdAt: { $gte: start, $lte: end }
        };

        const orders = await PharmacyOrder.find({
            ...dateFilter,
            paymentStatus: { $in: ['Paid', 'PAID_BY_DOCTOR'] },
            orderStatus: 'Completed'
        }).populate('userId', 'name phone').lean();

        const returns = await PharmacyReturn.find(dateFilter).lean();

        let totalGrossSales = 0;
        let cashAmount = 0;
        let upiAmount = 0;
        let cardAmount = 0;
        let doctorGuaranteedAmount = 0;
        let cogs = 0;
        let itemMap = {};

        orders.forEach(order => {
            totalGrossSales += (order.totalAmount || 0);
            cogs += (order.totalCost || 0);
            
            if (order.paymentStatus === 'PAID_BY_DOCTOR') {
                doctorGuaranteedAmount += (order.totalAmount || 0);
            } else {
                const mode = (order.paymentMode || 'Cash').toLowerCase();
                if (mode.includes('upi')) upiAmount += (order.totalAmount || 0);
                else if (mode.includes('card')) cardAmount += (order.totalAmount || 0);
                else cashAmount += (order.totalAmount || 0);
            }

            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    if (item.medicineName) {
                        if (!itemMap[item.medicineName]) {
                            itemMap[item.medicineName] = { medicineName: item.medicineName, quantity: 0, totalRevenue: 0 };
                        }
                        itemMap[item.medicineName].quantity += (item.quantity || 0);
                        itemMap[item.medicineName].totalRevenue += ((item.quantity || 0) * (item.price || 0));
                    }
                });
            }
        });

        const topSellingItems = Object.values(itemMap).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

        let totalReturnsRefunded = 0;
        returns.forEach(r => {
            if (r.returnType === 'Refund') {
                totalReturnsRefunded += (r.refundAmount || 0);
                // Optionally subtract COGS reversed if tracked, but typical MVP skips this or assumes totalCost reversal.
                // Assuming proportional COGS reversal if needed, but keeping it simple for gross profit.
            }
        });

        const netCollection = totalGrossSales - totalReturnsRefunded;
        const grossProfit = netCollection - cogs;

        let recentTransactions = [];
        orders.forEach(o => {
            recentTransactions.push({ _id: o._id, type: 'Sale', amount: o.totalAmount, createdAt: o.createdAt });
        });
        returns.forEach(r => {
            recentTransactions.push({ _id: r._id, type: 'Refund', amount: r.refundAmount, createdAt: r.createdAt });
        });
        recentTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        recentTransactions = recentTransactions.slice(0, 10);

        res.json({
            success: true,
            summary: {
                totalGrossSales,
                totalReturnsRefunded,
                netCollection,
                cashAmount,
                upiAmount,
                cardAmount,
                doctorGuaranteedAmount,
                cogs,
                grossProfit
            },
            topSellingItems,
            recentTransactions,
            orders,
            returns
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- PURCHASE INVOICE MODULE (SMART VENDOR PDF IMPORT) ---

const cleanupUploadedFile = (filePath) => {
    if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
    }
};

// POST Upload Purchase Invoice (Layered Native Coordinate + OCR Fallback + Smart Normalization + Validation)
router.post('/purchase-invoice/upload', verifyToken, handleInvoiceUploadMiddleware, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                code: 'NO_FILE',
                message: 'No PDF file was uploaded. Please choose a vendor invoice PDF.'
            });
        }

        const tenantScope = getTenantScope(req);
        const hospitalId = req.user.hospitalId || null;
        const pharmacyId = req.user.id || null;
        const tenantFolder = getTenantFolderName(req);

        const originalName = req.file.originalname;
        const generatedName = req.file.filename || `${Date.now()}-invoice.pdf`;
        const storagePath = `${tenantFolder}/${generatedName}`;
        const size = req.file.size;

        const uploadDate = new Date();
        const uploadTime = uploadDate.toTimeString().split(' ')[0];

        let fileBuffer;
        try {
            fileBuffer = fs.readFileSync(req.file.path);
            validatePdfBuffer(fileBuffer, { maxBytes: MAX_INVOICE_BYTES });
        } catch (valErr) {
            cleanupUploadedFile(req.file.path);
            return res.status(400).json({
                success: false,
                code: valErr.code || 'INVALID_PDF',
                message: valErr.message || 'Invalid PDF file.'
            });
        }

        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Load tenant Vendors, existing Inventory & master Medicines for smart format adaptation & candidate suggestions
        const [vendorsList, existingInventory, masterMedicines] = await Promise.all([
            hospitalId ? Vendor.find({ hospitalId }).lean() : Promise.resolve([]),
            Inventory.find(tenantScope).select('_id name salt category unit unitsPerStrip batchNumber stock buyingPrice sellingPrice expiryDate').lean(),
            Medicine.find({}).select('_id name genericName category').lean()
        ]);

        let processed;
        try {
            const allowOcrFallback = req.body?.useOcr !== 'false';
            processed = await processInvoiceDocument({
                buffer: fileBuffer,
                hospitalId,
                user: req.user,
                vendors: vendorsList,
                existingInventory,
                masterMedicines,
                allowOcrFallback
            });
        } catch (parseErr) {
            cleanupUploadedFile(req.file.path);
            const code = parseErr?.code || 'PDF_PARSE_ERROR';
            const userMsg = parseErr instanceof InvoiceParseError
                ? parseErr.message
                : 'Unable to process this PDF invoice. Please check the file or enter medicines manually.';
            return res.status(400).json({
                success: false,
                code,
                message: userMsg
            });
        }

        const invMeta = processed.invoice || {};
        const medicinesList = Array.isArray(processed.medicines) ? processed.medicines : [];

        // Tenant-scoped duplicate detection (Invoice Number + Vendor OR Identical PDF Hash)
        const allowRevised = req.body?.allowRevised === 'true' || req.body?.allowRevised === true;
        let existingDuplicate = null;
        if (invMeta.invoiceNumber && invMeta.vendorName) {
            existingDuplicate = await PurchaseInvoice.findOne({
                ...tenantScope,
                status: { $ne: 'Cancelled' },
                invoiceNumber: new RegExp(`^${invMeta.invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                vendorName: new RegExp(`^${invMeta.vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
            }).lean();
        }
        if (!existingDuplicate) {
            existingDuplicate = await PurchaseInvoice.findOne({
                ...tenantScope,
                status: { $ne: 'Cancelled' },
                'uploadedPDF.fileHash': fileHash
            }).lean();
        }

        if (existingDuplicate && !allowRevised) {
            cleanupUploadedFile(req.file.path);
            return res.status(409).json({
                success: false,
                code: 'DUPLICATE_INVOICE',
                message: `Duplicate invoice detected: Invoice ${existingDuplicate.invoiceNumber || invMeta.invoiceNumber || '(Same PDF)'} from ${existingDuplicate.vendorName || invMeta.vendorName || 'this vendor'} already exists (${existingDuplicate.status}).`,
                existingInvoice: {
                    _id: existingDuplicate._id,
                    invoiceNumber: existingDuplicate.invoiceNumber,
                    vendorName: existingDuplicate.vendorName,
                    status: existingDuplicate.status,
                    uploadDate: existingDuplicate.uploadDate,
                    importedMedicines: existingDuplicate.importedMedicines,
                    totalMedicines: existingDuplicate.totalMedicines
                }
            });
        }

        const newInvoice = new PurchaseInvoice({
            hospitalId,
            pharmacyId,
            vendorId: invMeta.vendorId || null,
            vendorName: invMeta.vendorName || '',
            vendorGST: invMeta.vendorGST || '',
            vendorAddress: invMeta.vendorAddress || '',
            vendorDL: invMeta.vendorDL || '',
            vendorPhone: invMeta.vendorPhone || '',
            orderRef: invMeta.orderRef || '',
            invoiceNumber: invMeta.invoiceNumber || '',
            invoiceDate: invMeta.invoiceDate ? new Date(invMeta.invoiceDate) : null,
            grandTotal: invMeta.grandTotal || 0,
            taxableAmount: invMeta.taxableAmount || 0,
            discountAmount: invMeta.discountAmount || 0,
            cgst: invMeta.cgst || 0,
            sgst: invMeta.sgst || 0,
            igst: invMeta.igst || 0,
            totalMedicines: medicinesList.length,
            purchaseQty: invMeta.purchaseQty || 0,
            freeQty: invMeta.freeQty || 0,
            isRevisedDuplicate: Boolean(existingDuplicate && allowRevised),
            extractionMeta: processed.extractionMeta || {},
            uploadedBy: {
                name: req.user.name || 'Unknown',
                email: req.user.email || 'Unknown',
                userId: req.user.id
            },
            uploadedPDF: {
                originalName,
                generatedName,
                storagePath,
                size,
                fileHash
            },
            uploadDate,
            uploadTime,
            status: 'Pending',
            importedMedicines: 0,
            skippedMedicines: 0,
            failedMedicines: 0,
            remainingMedicines: medicinesList.length
        });

        await newInvoice.save();

        // Store extracted review lines in PurchaseInvoiceMedicine so partial progress & audits persist securely in MongoDB
        if (medicinesList.length > 0) {
            const lineDocs = medicinesList.map((m, idx) => ({
                hospitalId,
                invoiceId: newInvoice._id,
                rowNumber: m.rowNumber || (idx + 1),
                medicineName: m.medicineName,
                rawMedicineName: m.rawMedicineName || m.medicineName,
                salt: m.salt || '',
                category: m.category || 'General',
                manufacturer: m.manufacturer || '',
                packSize: m.packSize || '',
                unit: m.unit || 'Tablets',
                unitsPerStrip: Number(m.unitsPerStrip) || 1,
                hsnCode: m.hsnCode || '',
                batch: m.batch || '',
                expiryRaw: m.expiryRaw || '',
                expiry: m.expiry && !Number.isNaN(new Date(m.expiry).getTime()) ? new Date(m.expiry) : null,
                mfgDate: m.mfgDate && !Number.isNaN(new Date(m.mfgDate).getTime()) ? new Date(m.mfgDate) : null,
                purchaseQty: m.purchaseQty !== undefined ? m.purchaseQty : null,
                freeQty: Number(m.freeQty) || 0,
                totalQty: (Number(m.purchaseQty) || 0) + (Number(m.freeQty) || 0),
                purchaseRate: m.purchaseRate !== undefined ? m.purchaseRate : null,
                mrp: m.mrp !== undefined ? m.mrp : null,
                gst: m.gst !== undefined ? m.gst : null,
                cgst: m.cgst !== undefined ? m.cgst : null,
                sgst: m.sgst !== undefined ? m.sgst : null,
                igst: m.igst !== undefined ? m.igst : null,
                discount: m.discount !== undefined ? m.discount : null,
                discountType: m.discountType || 'Percentage',
                amount: m.amount !== undefined ? m.amount : null,
                confidence: Number(m.confidence) || 0,
                fieldConfidence: m.fieldConfidence || {},
                warnings: Array.isArray(m.warnings) ? m.warnings : [],
                originalExtracted: m.originalExtracted || null,
                matchedInventoryId: m.matchedInventoryId || null,
                importAction: m.importAction || 'create_new',
                status: 'Pending'
            }));
            await PurchaseInvoiceMedicine.insertMany(lineDocs);
        }

        res.status(201).json({
            success: true,
            message: medicinesList.length > 0
                ? `Extracted ${medicinesList.length} medicine item(s) across ${processed.extractionMeta?.pageCount || 1} page(s).`
                : 'PDF uploaded, but no medicine table rows were auto-detected. You can add rows manually in the review table.',
            invoice: newInvoice,
            medicines: medicinesList,
            matchedVendor: processed.matchedVendor || null,
            vendors: vendorsList,
            extractionMeta: processed.extractionMeta || {}
        });
    } catch (error) {
        cleanupUploadedFile(req.file?.path);
        console.error('Upload Invoice Error:', error);
        res.status(500).json({
            success: false,
            code: 'UPLOAD_FAILED',
            message: 'Failed to process the uploaded invoice PDF. Please verify the file and try again.'
        });
    }
});

// GET Authenticated & Tenant-Isolated PDF File Stream for Inline Invoice Preview
router.get('/purchase-invoice/:id/file', verifyToken, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid invoice ID' });
        }
        const invoice = await PurchaseInvoice.findOne({ _id: req.params.id, ...getTenantScope(req) }).lean();
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found or access denied' });
        }

        const resolvedPath = resolveSafeInvoiceFilePath(invoice);
        if (!resolvedPath) {
            return res.status(404).json({ success: false, message: 'Invoice PDF file is not available on disk.' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(invoice.uploadedPDF?.originalName || 'invoice.pdf')}"`);
        return res.sendFile(resolvedPath);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to stream invoice PDF preview.' });
    }
});

// POST Confirm & Bulk Import Reviewed Medicines in a Controlled Operation
router.post('/purchase-invoice/:id/bulk-import', verifyToken, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid invoice ID' });
    }

    const tenantScope = getTenantScope(req);
    const hospitalId = req.user.hospitalId || null;
    const pharmacyId = req.user.id || null;

    let session = null;
    try {
        const invoice = await PurchaseInvoice.findOne({ _id: req.params.id, ...tenantScope });
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found or access denied.' });
        }
        if (invoice.status === 'Completed') {
            return res.status(409).json({
                success: false,
                code: 'ALREADY_IMPORTED',
                message: 'This purchase invoice has already been imported.'
            });
        }

        const {
            rows = [],
            invoiceMeta = {},
            saveVendorMapping = true,
            allowRevised = false
        } = req.body || {};

        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: 'No review rows submitted for import.' });
        }

        // Update confirmed header metadata (preserving user edits)
        const finalVendorName = String(invoiceMeta.vendorName ?? invoice.vendorName ?? '').trim();
        const finalInvoiceNo = String(invoiceMeta.invoiceNumber ?? invoice.invoiceNumber ?? '').trim();
        const finalVendorGST = String(invoiceMeta.vendorGST ?? invoice.vendorGST ?? '').trim().toUpperCase();
        const finalVendorDL = String(invoiceMeta.vendorDL ?? invoice.vendorDL ?? '').trim();

        // Guard against importing a duplicate completed invoice under edited Invoice Number + Vendor
        if (finalVendorName && finalInvoiceNo && !allowRevised) {
            const dupCompleted = await PurchaseInvoice.findOne({
                ...tenantScope,
                _id: { $ne: invoice._id },
                status: 'Completed',
                invoiceNumber: new RegExp(`^${finalInvoiceNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                vendorName: new RegExp(`^${finalVendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
            }).lean();
            if (dupCompleted) {
                return res.status(409).json({
                    success: false,
                    code: 'DUPLICATE_COMPLETED_INVOICE',
                    message: `Invoice ${finalInvoiceNo} from ${finalVendorName} was already imported earlier.`
                });
            }
        }

        // Resolve or create Vendor within tenant scope & update learned column mappings
        let vendorDoc = null;
        if (invoiceMeta.vendorId && mongoose.Types.ObjectId.isValid(invoiceMeta.vendorId)) {
            vendorDoc = await Vendor.findOne({ _id: invoiceMeta.vendorId, ...(hospitalId ? { hospitalId } : {}) });
        }
        if (!vendorDoc && hospitalId && (finalVendorGST || finalVendorName)) {
            if (finalVendorGST) {
                vendorDoc = await Vendor.findOne({ hospitalId, gstin: finalVendorGST });
            }
            if (!vendorDoc && finalVendorName) {
                vendorDoc = await Vendor.findOne({
                    hospitalId,
                    vendorName: new RegExp(`^${finalVendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
                });
            }
            if (!vendorDoc && finalVendorName) {
                // Create clean vendor record if valid
                const cleanGstin = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(finalVendorGST) ? finalVendorGST : '';
                vendorDoc = await Vendor.create({
                    hospitalId,
                    vendorName: finalVendorName,
                    gstin: cleanGstin,
                    dlNumber: finalVendorDL
                });
            }
        }

        if (vendorDoc && saveVendorMapping && invoice.extractionMeta?.columnMappings) {
            const existingMap = (vendorDoc.invoiceFormatProfile && vendorDoc.invoiceFormatProfile.columnMappings) || {};
            const mergedMap = { ...existingMap, ...invoice.extractionMeta.columnMappings };
            vendorDoc.invoiceFormatProfile = {
                columnMappings: mergedMap,
                confirmedCount: Number(vendorDoc.invoiceFormatProfile?.confirmedCount || 0) + 1,
                lastHeaders: Array.isArray(invoice.extractionMeta?.detectedHeaders) ? invoice.extractionMeta.detectedHeaders : [],
                lastInvoiceNumber: finalInvoiceNo || vendorDoc.invoiceFormatProfile?.lastInvoiceNumber || '',
                updatedAt: new Date()
            };
            await vendorDoc.save();
        }

        // Attempt optional MongoDB replica-set transaction; cleanly fall back to tracked rollback if standalone MongoDB
        let useTransaction = false;
        try {
            session = await mongoose.startSession();
            session.startTransaction();
            useTransaction = true;
        } catch (_) {
            if (session) { try { await session.endSession(); } catch (__) {} session = null; }
            useTransaction = false;
        }

        const createdInventoryIds = [];
        const priorInventorySnapshots = [];

        const rollbackStandaloneOps = async () => {
            if (createdInventoryIds.length > 0) {
                await Inventory.deleteMany({ _id: { $in: createdInventoryIds }, ...tenantScope }).catch(() => {});
            }
            for (const snap of priorInventorySnapshots) {
                const { _id, ...restoreData } = snap.data || {};
                if (snap._id) {
                    await Inventory.replaceOne({ _id: snap._id, ...tenantScope }, restoreData).catch(() => {});
                }
            }
        };

        const runBulkOps = async (dbSession) => {
            createdInventoryIds.length = 0;
            priorInventorySnapshots.length = 0;
            const sessOpt = dbSession ? { session: dbSession } : {};
            const importedRows = [];
            const skippedRows = [];
            const failedRows = [];
            const persistedLineDocs = [];

            let totalImportedPurchaseQty = 0;
            let totalImportedFreeQty = 0;
            let totalTaxable = 0;
            let totalDiscount = 0;
            let totalCgstAmt = 0;
            let totalSgstAmt = 0;
            let totalNetAmt = 0;

            const effectivePurchaseDate = invoiceMeta.invoiceDate && !Number.isNaN(new Date(invoiceMeta.invoiceDate).getTime())
                ? new Date(invoiceMeta.invoiceDate)
                : (invoice.invoiceDate || new Date());

            for (let idx = 0; idx < rows.length; idx += 1) {
                const r = rows[idx] || {};
                const rowNo = Number(r.rowNumber) || (idx + 1);
                const medName = String(r.medicineName || '').trim();
                const isIncluded = r.included !== false && r.importAction !== 'skip';

                if (!isIncluded) {
                    skippedRows.push({ rowNumber: rowNo, medicineName: medName || '(Unnamed)', reason: 'Excluded by reviewer' });
                    persistedLineDocs.push({
                        hospitalId,
                        invoiceId: invoice._id,
                        rowNumber: rowNo,
                        medicineName: medName || 'Skipped Item',
                        rawMedicineName: r.rawMedicineName || medName,
                        batch: String(r.batch || '').trim(),
                        status: 'Skipped',
                        importAction: 'skip'
                    });
                    continue;
                }

                // Strictly validate confirmed row fields without inventing missing data
                const rowErrors = [];
                if (!medName || medName.length < 2) rowErrors.push('Medicine name is required');
                const pQty = Number(r.purchaseQty);
                const fQty = Number(r.freeQty) || 0;
                if (!Number.isFinite(pQty) || pQty < 0 || (pQty === 0 && fQty <= 0)) {
                    rowErrors.push('Valid quantity (> 0) is required');
                }
                const rate = Number(r.purchaseRate);
                if (!Number.isFinite(rate) || rate < 0 || (r.purchaseRate === '' || r.purchaseRate === null || r.purchaseRate === undefined)) {
                    rowErrors.push('Valid purchase rate is required');
                }
                const mrpVal = (r.mrp === '' || r.mrp === null || r.mrp === undefined) ? null : Number(r.mrp);
                if (mrpVal !== null && (!Number.isFinite(mrpVal) || mrpVal < 0)) {
                    rowErrors.push('MRP must be a valid non-negative number');
                }

                let parsedExpiry = null;
                if (r.expiry && String(r.expiry).trim()) {
                    const d = new Date(r.expiry);
                    if (Number.isNaN(d.getTime())) {
                        rowErrors.push('Invalid expiry date');
                    } else {
                        parsedExpiry = d;
                    }
                }

                let parsedMfg = null;
                if (r.mfgDate && String(r.mfgDate).trim()) {
                    const md = new Date(r.mfgDate);
                    if (!Number.isNaN(md.getTime())) parsedMfg = md;
                }

                if (rowErrors.length > 0) {
                    failedRows.push({
                        rowNumber: rowNo,
                        medicineName: medName || '(Unnamed)',
                        batch: r.batch || '',
                        errors: rowErrors
                    });
                    persistedLineDocs.push({
                        hospitalId,
                        invoiceId: invoice._id,
                        rowNumber: rowNo,
                        medicineName: medName || 'Invalid Item',
                        rawMedicineName: r.rawMedicineName || medName,
                        batch: String(r.batch || '').trim(),
                        expiry: parsedExpiry,
                        purchaseQty: Number.isFinite(pQty) ? pQty : null,
                        freeQty: fQty,
                        purchaseRate: Number.isFinite(rate) ? rate : null,
                        mrp: mrpVal,
                        status: 'Failed',
                        errorMessage: rowErrors.join('; ')
                    });
                    continue;
                }

                const unit = r.unit || 'Tablets';
                let unitsPerStrip = Number(r.unitsPerStrip) || 1;
                const packTotal = pQty + fQty;
                const stockToAdd = ['Strip', 'Capsules', 'Tablets'].includes(unit) && unitsPerStrip > 1
                    ? packTotal * unitsPerStrip
                    : packTotal;

                const discType = r.discountType === 'Flat Amount' ? 'Flat Amount' : 'Percentage';
                const discVal = Number(r.discount) || 0;
                const gstPct = (r.gst !== '' && r.gst !== null && r.gst !== undefined) ? Number(r.gst) || 0 : ((Number(r.cgst) || 0) + (Number(r.sgst) || 0));
                const cgstPct = (r.cgst !== '' && r.cgst !== null && r.cgst !== undefined) ? Number(r.cgst) || 0 : Number((gstPct / 2).toFixed(2));
                const sgstPct = (r.sgst !== '' && r.sgst !== null && r.sgst !== undefined) ? Number(r.sgst) || 0 : Number((gstPct / 2).toFixed(2));

                const gross = pQty * rate;
                const discAmt = discType === 'Flat Amount' ? discVal : gross * (discVal / 100);
                const taxable = Math.max(0, gross - discAmt);
                const cgstAmt = taxable * (cgstPct / 100);
                const sgstAmt = taxable * (sgstPct / 100);
                const lineFinalAmount = Number((taxable + cgstAmt + sgstAmt).toFixed(2));

                totalImportedPurchaseQty += pQty;
                totalImportedFreeQty += fQty;
                totalTaxable += taxable;
                totalDiscount += discAmt;
                totalCgstAmt += cgstAmt;
                totalSgstAmt += sgstAmt;
                totalNetAmt += lineFinalAmount;

                const batchStr = String(r.batch || '').trim();
                const targetVendorName = vendorDoc?.vendorName || finalVendorName || 'Vendor';

                // Check duplicate-invoice-row guard
                const alreadyInThisInv = await Inventory.findOne({
                    ...tenantScope,
                    purchaseInvoiceId: invoice._id,
                    name: medName,
                    batchNumber: batchStr
                }, null, sessOpt);

                if (alreadyInThisInv) {
                    skippedRows.push({
                        rowNumber: rowNo,
                        medicineName: medName,
                        batch: batchStr,
                        reason: 'Already imported in this invoice'
                    });
                    continue;
                }

                // Link to explicit user-confirmed existing Inventory item ONLY if same batch or user selected 'link_existing'
                let invDoc = null;
                if (r.importAction === 'link_existing' && r.matchedInventoryId && mongoose.Types.ObjectId.isValid(r.matchedInventoryId)) {
                    const candidate = await Inventory.findOne({ _id: r.matchedInventoryId, ...tenantScope }, null, sessOpt);
                    if (candidate && (!candidate.batchNumber || !batchStr || candidate.batchNumber === batchStr)) {
                        invDoc = candidate;
                    }
                }
                if (!invDoc && batchStr) {
                    invDoc = await Inventory.findOne({
                        ...tenantScope,
                        name: medName,
                        batchNumber: batchStr
                    }, null, sessOpt);
                }

                if (invDoc) {
                    if (!useTransaction) {
                        priorInventorySnapshots.push({ _id: invDoc._id, data: invDoc.toObject() });
                    }
                    invDoc.stock = (Number(invDoc.stock) || 0) + stockToAdd;
                    invDoc.totalStock = (Number(invDoc.totalStock) || 0) + stockToAdd;
                    invDoc.buyingPrice = rate || invDoc.buyingPrice;
                    if (mrpVal !== null && mrpVal > 0) invDoc.sellingPrice = mrpVal;
                    invDoc.pricingConfig = {
                        ...(invDoc.pricingConfig || {}),
                        purchasePrice: rate || invDoc.pricingConfig?.purchasePrice || 0,
                        mrp: mrpVal !== null ? mrpVal : (invDoc.pricingConfig?.mrp || invDoc.sellingPrice || 0),
                        sellingPrice: mrpVal !== null ? mrpVal : (invDoc.pricingConfig?.sellingPrice || invDoc.sellingPrice || 0)
                    };
                    if (parsedExpiry && !invDoc.expiryDate) invDoc.expiryDate = parsedExpiry;
                    if (r.salt && !invDoc.salt) invDoc.salt = String(r.salt).trim();
                    if (r.hsnCode && !invDoc.hsnCode) invDoc.hsnCode = String(r.hsnCode).trim();
                    if (r.manufacturer && !invDoc.manufacturer) invDoc.manufacturer = String(r.manufacturer).trim();
                    if (r.packSize && !invDoc.packSize) invDoc.packSize = String(r.packSize).trim();
                    invDoc.cgst = cgstPct;
                    invDoc.sgst = sgstPct;
                    invDoc.cgstPercent = cgstPct;
                    invDoc.sgstPercent = sgstPct;
                    invDoc.purchaseQty = (Number(invDoc.purchaseQty) || 0) + pQty;
                    invDoc.freeQty = (Number(invDoc.freeQty) || 0) + fQty;
                    invDoc.purchaseInvoiceId = invoice._id;
                    invDoc.vendor = targetVendorName;
                    if (vendorDoc?._id) invDoc.vendorId = vendorDoc._id;
                    await invDoc.save(sessOpt);
                } else {
                    invDoc = new Inventory({
                        pharmacyId,
                        hospitalId,
                        name: medName,
                        salt: String(r.salt || '').trim(),
                        category: String(r.category || 'General').trim() || 'General',
                        manufacturer: String(r.manufacturer || '').trim(),
                        packSize: String(r.packSize || '').trim(),
                        hsnCode: String(r.hsnCode || '').trim(),
                        mfgDate: parsedMfg,
                        batchNumber: batchStr,
                        expiryDate: parsedExpiry,
                        purchaseDate: effectivePurchaseDate,
                        stock: stockToAdd,
                        totalStock: stockToAdd,
                        unit,
                        unitsPerStrip,
                        buyingPrice: rate,
                        sellingPrice: mrpVal !== null ? mrpVal : 0,
                        pricingConfig: {
                            purchasePrice: rate,
                            landingCost: pQty > 0 ? Number((lineFinalAmount / pQty).toFixed(2)) : rate,
                            mrp: mrpVal !== null ? mrpVal : 0,
                            sellingPrice: mrpVal !== null ? mrpVal : 0
                        },
                        cgst: cgstPct,
                        sgst: sgstPct,
                        cgstPercent: cgstPct,
                        sgstPercent: sgstPct,
                        purchaseQty: pQty,
                        freeQty: fQty,
                        discountType: discType,
                        discountValue: discVal,
                        purchaseAmount: Number(gross.toFixed(2)),
                        finalAmount: lineFinalAmount,
                        purchaseInvoiceId: invoice._id,
                        vendor: targetVendorName,
                        vendorId: vendorDoc?._id || null
                    });
                    await invDoc.save(sessOpt);
                    createdInventoryIds.push(invDoc._id);
                }

                importedRows.push({
                    rowNumber: rowNo,
                    inventoryId: invDoc._id,
                    medicineName: invDoc.name,
                    batch: invDoc.batchNumber,
                    stockAdded: stockToAdd,
                    action: r.importAction === 'link_existing' ? 'Updated Existing Stock' : 'Created New Batch'
                });

                persistedLineDocs.push({
                    hospitalId,
                    invoiceId: invoice._id,
                    rowNumber: rowNo,
                    medicineName: medName,
                    rawMedicineName: r.rawMedicineName || medName,
                    salt: String(r.salt || '').trim(),
                    category: String(r.category || 'General').trim(),
                    manufacturer: String(r.manufacturer || '').trim(),
                    packSize: String(r.packSize || '').trim(),
                    unit,
                    unitsPerStrip,
                    hsnCode: String(r.hsnCode || '').trim(),
                    batch: batchStr,
                    expiryRaw: r.expiryRaw || '',
                    expiry: parsedExpiry,
                    mfgDate: parsedMfg,
                    purchaseQty: pQty,
                    freeQty: fQty,
                    totalQty: stockToAdd,
                    purchaseRate: rate,
                    mrp: mrpVal,
                    gst: gstPct,
                    cgst: cgstPct,
                    sgst: sgstPct,
                    discount: discVal,
                    discountType: discType,
                    amount: Number(r.amount) || lineFinalAmount,
                    confidence: Number(r.confidence) || 100,
                    originalExtracted: r.originalExtracted || null,
                    matchedInventoryId: r.matchedInventoryId || null,
                    importAction: r.importAction || 'create_new',
                    inventoryId: invDoc._id,
                    status: 'Imported'
                });
            }

            // Replace pending PurchaseInvoiceMedicine lines cleanly with final persisted results
            await PurchaseInvoiceMedicine.deleteMany({ invoiceId: invoice._id }, sessOpt);
            if (persistedLineDocs.length > 0) {
                await PurchaseInvoiceMedicine.insertMany(persistedLineDocs, sessOpt);
            }

            invoice.vendorName = finalVendorName || invoice.vendorName;
            invoice.vendorGST = finalVendorGST || invoice.vendorGST;
            invoice.vendorDL = finalVendorDL || invoice.vendorDL;
            invoice.invoiceNumber = finalInvoiceNo || invoice.invoiceNumber;
            if (vendorDoc?._id) invoice.vendorId = vendorDoc._id;
            if (invoiceMeta.invoiceDate && !Number.isNaN(new Date(invoiceMeta.invoiceDate).getTime())) {
                invoice.invoiceDate = new Date(invoiceMeta.invoiceDate);
            }
            invoice.totalMedicines = rows.length;
            invoice.importedMedicines = importedRows.length;
            invoice.skippedMedicines = skippedRows.length;
            invoice.failedMedicines = failedRows.length;
            invoice.remainingMedicines = failedRows.length;
            invoice.purchaseQty = totalImportedPurchaseQty;
            invoice.freeQty = totalImportedFreeQty;
            if (totalNetAmt > 0 && !invoice.grandTotal) {
                invoice.taxableAmount = Number(totalTaxable.toFixed(2));
                invoice.discountAmount = Number(totalDiscount.toFixed(2));
                invoice.cgst = Number(totalCgstAmt.toFixed(2));
                invoice.sgst = Number(totalSgstAmt.toFixed(2));
                invoice.grandTotal = Number(totalNetAmt.toFixed(2));
            }
            invoice.status = failedRows.length === 0
                ? 'Completed'
                : (importedRows.length > 0 ? 'Partially Imported' : 'Pending');

            await invoice.save(sessOpt);

            return {
                importedRows,
                skippedRows,
                failedRows,
                createdInventoryIds,
                priorInventorySnapshots,
                invoice
            };
        };

        let result;
        if (useTransaction && session) {
            try {
                result = await runBulkOps(session);
                await session.commitTransaction();
            } catch (txErr) {
                await session.abortTransaction().catch(() => {});
                // Fallback only if standalone MongoDB doesn't support replica-set transactions
                if (/transaction numbers are only allowed|replica set/i.test(txErr.message || '')) {
                    useTransaction = false;
                    try {
                        result = await runBulkOps(null);
                    } catch (standaloneErr) {
                        await rollbackStandaloneOps();
                        throw standaloneErr;
                    }
                } else {
                    throw txErr;
                }
            } finally {
                await session.endSession().catch(() => {});
                session = null;
            }
        } else {
            try {
                result = await runBulkOps(null);
            } catch (standaloneErr) {
                await rollbackStandaloneOps();
                throw standaloneErr;
            }
        }

        res.json({
            success: true,
            message: `Bulk import complete: ${result.importedRows.length} imported, ${result.skippedRows.length} skipped, ${result.failedRows.length} failed.`,
            summary: {
                total: rows.length,
                imported: result.importedRows.length,
                skipped: result.skippedRows.length,
                failed: result.failedRows.length
            },
            results: {
                importedRows: result.importedRows,
                skippedRows: result.skippedRows,
                failedRows: result.failedRows
            },
            invoice: result.invoice
        });
    } catch (error) {
        if (session) {
            try { await session.abortTransaction(); } catch (_) {}
            try { await session.endSession(); } catch (_) {}
        }
        console.error('Bulk Import Invoice Error:', error);
        res.status(500).json({
            success: false,
            code: 'BULK_IMPORT_FAILED',
            message: error.message || 'Bulk import failed without modifying finalized records.'
        });
    }
});

// POST process purchase invoice (legacy 1-click process preserved & hardened with tenant isolation)
router.post('/purchase-invoice/:id/process', verifyToken, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid invoice ID' });
        }
        const tenantScope = getTenantScope(req);
        const invoice = await PurchaseInvoice.findOne({ _id: req.params.id, ...tenantScope });
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found or access denied' });
        }
        if (invoice.status === 'Completed') {
            return res.status(400).json({ success: false, message: 'Invoice already processed' });
        }

        const filePath = resolveSafeInvoiceFilePath(invoice);
        if (!filePath) {
            return res.status(404).json({ success: false, message: 'Invoice PDF file not found on server' });
        }

        const fileBuffer = fs.readFileSync(filePath);
        const parsedData = await parseInvoice(fileBuffer);

        if (!parsedData || !parsedData.medicines || !Array.isArray(parsedData.medicines)) {
            return res.status(400).json({ success: false, message: 'Invalid or empty parsed data from invoice PDF' });
        }

        const pharmacyId = req.user.id;
        const hospitalId = req.user.hospitalId;

        let importedCount = 0;
        let trueGrandTotal = 0;

        for (const med of parsedData.medicines) {
            const query = {
                name: med.medicineName,
                batchNumber: med.batch || '',
                ...tenantScope
            };

            let item = await Inventory.findOne(query);

            const purchaseQty = Number(med.purchaseQty) || 0;
            const freeQty = Number(med.freeQty) || 0;
            const totalQty = purchaseQty + freeQty;
            const buyingPrice = Number(med.purchaseRate) || 0;

            trueGrandTotal += Number(med.amount) || (purchaseQty * buyingPrice);

            const cgstVal = med.gst ? Number((Number(med.gst) / 2).toFixed(2)) : (Number(med.cgst) || 0);
            const sgstVal = med.gst ? Number((Number(med.gst) / 2).toFixed(2)) : (Number(med.sgst) || 0);

            if (item) {
                item.stock += totalQty;
                item.buyingPrice = buyingPrice || item.buyingPrice;
                item.sellingPrice = med.mrp || item.sellingPrice;
                item.purchaseInvoiceId = invoice._id;
                await item.save();
            } else {
                item = new Inventory({
                    pharmacyId,
                    hospitalId,
                    name: med.medicineName,
                    salt: med.salt || '',
                    category: med.category || 'General',
                    hsnCode: med.hsnCode || '',
                    packSize: med.packSize || '',
                    manufacturer: med.manufacturer || '',
                    unit: med.unit || 'Tablets',
                    unitsPerStrip: Number(med.unitsPerStrip) || 1,
                    batchNumber: med.batch || '',
                    stock: totalQty,
                    buyingPrice,
                    sellingPrice: med.mrp || 0,
                    cgst: cgstVal,
                    sgst: sgstVal,
                    cgstPercent: cgstVal,
                    sgstPercent: sgstVal,
                    purchaseQty,
                    freeQty,
                    discountType: med.discountType || 'Percentage',
                    discountValue: med.discount || 0,
                    purchaseInvoiceId: invoice._id,
                    vendor: invoice.vendorName || 'Unknown Vendor'
                });

                if (med.expiry) {
                    const d = new Date(med.expiry);
                    if (!Number.isNaN(d.getTime())) item.expiryDate = d;
                }
                await item.save();
            }
            importedCount++;
        }

        invoice.importedMedicines = invoice.totalMedicines || importedCount;
        invoice.remainingMedicines = 0;
        invoice.status = 'Completed';
        if (!invoice.grandTotal) invoice.grandTotal = Number(trueGrandTotal.toFixed(2));
        await invoice.save();

        res.json({ success: true, message: 'Invoice processed successfully', importedCount, trueGrandTotal });
    } catch (error) {
        console.error('Process Invoice Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to process invoice' });
    }
});

// GET all purchase invoices (strictly tenant-isolated)
router.get('/purchase-invoice', verifyToken, async (req, res) => {
    try {
        const tenantScope = getTenantScope(req);
        const invoices = await PurchaseInvoice.find(tenantScope).sort({ createdAt: -1 });

        for (const inv of invoices) {
            if (!inv.grandTotal && inv.status === 'Completed') {
                const items = await Inventory.find({ purchaseInvoiceId: inv._id, ...tenantScope });
                let calculatedTotal = 0;
                for (const med of items) {
                    const qty = med.purchaseQty || 0;
                    const price = med.buyingPrice || 0;
                    const discount = med.discountValue || 0;
                    const afterDiscount = med.discountType === 'Flat Amount'
                        ? (qty * price) - discount
                        : (qty * price) * (1 - discount / 100);
                    const taxAmt = afterDiscount * ((med.cgstPercent || med.cgst || 0) + (med.sgstPercent || med.sgst || 0)) / 100;
                    calculatedTotal += afterDiscount + taxAmt;
                }
                if (calculatedTotal > 0) {
                    inv.grandTotal = Number(calculatedTotal.toFixed(2));
                    await PurchaseInvoice.updateOne({ _id: inv._id }, { $set: { grandTotal: inv.grandTotal } });
                }
            }
        }

        res.json({ success: true, data: invoices });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET single purchase invoice by ID (strictly tenant-isolated)
router.get('/purchase-invoice/:id', verifyToken, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid invoice ID' });
        }
        const tenantScope = getTenantScope(req);
        const invoice = await PurchaseInvoice.findOne({ _id: req.params.id, ...tenantScope });
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found or access denied' });
        }

        let importedMedicines = [];
        const savedLines = await PurchaseInvoiceMedicine.find({ invoiceId: invoice._id }).sort({ rowNumber: 1 }).lean();

        if (invoice.status === 'Completed') {
            importedMedicines = await Inventory.find({ purchaseInvoiceId: invoice._id, ...tenantScope }).lean();
            if (importedMedicines.length === 0 && savedLines.length > 0) {
                importedMedicines = savedLines;
            }
        } else if (savedLines.length > 0) {
            importedMedicines = savedLines.map((m) => ({
                ...m,
                name: m.medicineName,
                batchNumber: m.batch,
                buyingPrice: m.purchaseRate,
                sellingPrice: m.mrp,
                discountValue: m.discount || 0
            }));
        } else {
            const filePath = resolveSafeInvoiceFilePath(invoice);
            if (filePath) {
                const fileBuffer = fs.readFileSync(filePath);
                try {
                    const parsedData = await parseInvoice(fileBuffer);
                    importedMedicines = (parsedData.medicines || []).map((m) => ({
                        name: m.medicineName,
                        medicineName: m.medicineName,
                        salt: m.salt || '',
                        batchNumber: m.batch,
                        purchaseQty: m.purchaseQty,
                        freeQty: m.freeQty,
                        buyingPrice: m.purchaseRate,
                        sellingPrice: m.mrp,
                        totalAmount: m.amount || ((m.purchaseQty || 0) * (m.purchaseRate || 0)),
                        expiryDate: m.expiry,
                        discountValue: m.discount || 0,
                        cgst: m.cgst ?? (m.gst ? m.gst / 2 : 0),
                        sgst: m.sgst ?? (m.gst ? m.gst / 2 : 0)
                    }));
                } catch (e) { console.error('Parse error on GET:', e.message); }
            }
        }

        const invoiceData = invoice.toObject();
        invoiceData.importedMedicinesList = importedMedicines;
        invoiceData.reviewLines = savedLines;

        res.json({ success: true, data: invoiceData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE purchase invoice (Admin only, tenant-isolated)
router.delete('/purchase-invoice/:id', verifyAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid invoice ID' });
        }
        const tenantScope = getTenantScope(req);
        const invoice = await PurchaseInvoice.findOneAndDelete({ _id: req.params.id, ...tenantScope });
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found or unauthorized' });
        }
        await PurchaseInvoiceMedicine.deleteMany({ invoiceId: invoice._id });
        const resolvedPath = resolveSafeInvoiceFilePath(invoice);
        cleanupUploadedFile(resolvedPath);
        res.json({ success: true, message: 'Invoice deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// VENDOR RETURNS (RTV)
router.post('/vendor-returns', verifyToken, async (req, res) => {
    try {
        if (!req.user.hospitalId) {
            return res.status(400).json({ success: false, message: 'No hospital associated with this user' });
        }

        const { vendorName, invoiceOrBillNo, items, totalReturnAmount } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'No items provided for return' });
        }

        // Deduct inventory sequentially to avoid race conditions
        for (const item of items) {
            if (item.inventoryId) {
                await Inventory.findOneAndUpdate(
                    { _id: item.inventoryId, hospitalId: req.user.hospitalId },
                    { $inc: { stock: -Math.abs(item.quantityReturned) } },
                    { new: true }
                );
            }
        }

        const newReturn = new VendorReturn({
            hospitalId: req.user.hospitalId,
            vendorName,
            invoiceOrBillNo,
            items,
            totalReturnAmount
        });

        await newReturn.save();
        res.status(201).json({ success: true, message: 'Vendor return saved successfully', returnRecord: newReturn });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/vendor-returns', verifyToken, async (req, res) => {
    try {
        if (!req.user.hospitalId) {
            return res.status(400).json({ success: false, message: 'No hospital associated with this user' });
        }

        const returns = await VendorReturn.find({ hospitalId: req.user.hospitalId })
            .sort({ returnDate: -1 });

        res.json({ success: true, returns });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST Record Internal Consumption
router.post('/consumption', verifyToken, async (req, res) => {
    try {
        const { medicineId, quantity, reason, givenTo } = req.body;
        const hospitalId = req.user.hospitalId;

        if (!medicineId || !quantity || quantity <= 0 || !reason) {
            return res.status(400).json({ success: false, message: 'Invalid consumption details provided' });
        }

        // 1. Fetch Inventory Item
        const inventory = await Inventory.findOne({ _id: medicineId, hospitalId });
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Medicine not found in inventory' });
        }

        // 2. Validate Stock
        if (inventory.stock < quantity) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient stock. Only ${inventory.stock} ${inventory.unit} available.` 
            });
        }

        // 3. Deduct Stock and Save (Triggers pre-save hook for status update)
        inventory.stock -= quantity;
        await inventory.save();

        // 4. Create Audit Log
        const consumptionLog = new ConsumptionLog({
            hospitalId,
            medicineId,
            quantity,
            reason,
            givenTo,
            loggedBy: req.user.id
        });
        await consumptionLog.save();

        res.status(201).json({ 
            success: true, 
            message: 'Consumption logged successfully', 
            consumptionLog,
            newStock: inventory.stock
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// --- Department Stock Transfer & Usage APIs ---

// GET all departments
router.get('/departments', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const departments = await Department.find({ hospitalId, isActive: true }).sort({ name: 1 });
        res.json({ success: true, departments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST create department
router.post('/departments', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { name, description } = req.body;
        
        if (!name) return res.status(400).json({ success: false, message: 'Department name is required' });

        const dept = new Department({ hospitalId, name, description });
        await dept.save();
        res.status(201).json({ success: true, department: dept });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET department stocks
router.get('/department-stocks', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { departmentId } = req.query;
        
        const query = { hospitalId, quantity: { $gt: 0 } };
        if (departmentId) query.departmentId = departmentId;

        const stocks = await DepartmentStock.find(query)
            .populate('departmentId', 'name')
            .populate('medicineId', 'name batchNumber sellingPrice category unit')
            .sort({ updatedAt: -1 });

        res.json({ success: true, stocks });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST transfer to department
router.post('/departments/transfer', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { departmentId, medicineId, quantity } = req.body;

        if (!departmentId || !medicineId || !quantity || quantity <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid transfer details' });
        }

        // 1. Fetch Inventory Item
        const inventory = await Inventory.findOne({ _id: medicineId, hospitalId });
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Medicine not found in inventory' });
        }

        // 2. Validate Stock
        if (inventory.stock < quantity) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient stock in main pharmacy. Only ${inventory.stock} available.` 
            });
        }

        // 3. Deduct from main inventory
        inventory.stock -= quantity;
        await inventory.save(); // Triggers status hook

        // 4. Add to department stock
        let deptStock = await DepartmentStock.findOne({ hospitalId, departmentId, medicineId });
        if (deptStock) {
            deptStock.quantity += quantity;
            await deptStock.save();
        } else {
            deptStock = new DepartmentStock({ hospitalId, departmentId, medicineId, quantity });
            await deptStock.save();
        }

        // 5. Log transfer
        const transferLog = new DepartmentTransfer({
            hospitalId,
            departmentId,
            medicineId,
            quantity,
            transferredBy: req.user.id
        });
        await transferLog.save();

        res.status(201).json({ success: true, message: 'Transfer completed successfully', deptStock });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST record usage & bill patient
router.post('/departments/usage', verifyToken, async (req, res) => {
    try {
        const hospitalId = req.user.hospitalId;
        const { departmentId, medicineId, patientId, quantity, unitPrice } = req.body;

        if (!departmentId || !medicineId || !patientId || !quantity || quantity <= 0 || unitPrice === undefined) {
            return res.status(400).json({ success: false, message: 'Invalid usage details provided' });
        }

        // 1. Validate Department Stock
        const deptStock = await DepartmentStock.findOne({ hospitalId, departmentId, medicineId });
        if (!deptStock || deptStock.quantity < quantity) {
            return res.status(400).json({ success: false, message: 'Insufficient stock in this department.' });
        }

        // 2. Deduct from department stock
        deptStock.quantity -= quantity;
        await deptStock.save();

        // 3. Fetch medicine details for billing label
        const medicine = await Inventory.findById(medicineId).select('name');
        const dept = await Department.findById(departmentId).select('name');
        
        const totalAmount = Number(quantity) * Number(unitPrice);
        const facilityName = `${medicine ? medicine.name : 'Medicine'} (${dept ? dept.name : 'Dept'} Usage)`;

        // 4. Log usage
        const usageLog = new DepartmentUsage({
            hospitalId,
            departmentId,
            medicineId,
            patientId,
            quantity,
            unitPrice,
            totalAmount,
            recordedBy: req.user.id
        });
        await usageLog.save();

        // 5. Bill Patient (Pharmacy Order)
        const PharmacyOrder = require('../models/pharmacyOrder.model');
        const UserMaster = require('../models/user.model');
        const Appointment = require('../models/appointment.model');

        let pharmacyOrder = await PharmacyOrder.findOne({ 
            userId: patientId, 
            paymentStatus: 'Pending',
            hospitalId: hospitalId
        }).sort({ createdAt: -1 });

        const calculatedTotalPrice = (Number(quantity) || 1) * (Number(unitPrice) || 0);
        const orderItem = {
            medicineName: facilityName,
            price: Number(unitPrice),
            quantity: Number(quantity),
            totalPrice: calculatedTotalPrice,
            purchased: true,
            days: 1
        };

        if (pharmacyOrder) {
            pharmacyOrder.items.push(orderItem);
            pharmacyOrder.totalAmount = (pharmacyOrder.totalAmount || 0) + totalAmount;
            pharmacyOrder.taxableAmount = pharmacyOrder.totalAmount;
            pharmacyOrder.totalCost = pharmacyOrder.totalAmount;
            await pharmacyOrder.save();
        } else {
            const patient = await UserMaster.findById(patientId);
            const lastAppt = await Appointment.findOne({ patientId }).sort({ createdAt: -1 });

            const isDoctor = req.user.role === 'doctor';
            const finalDoctorId = isDoctor ? req.user.id : null;
            const finalDoctorName = isDoctor ? (req.user.name || 'Doctor') : 'N/A (Department Usage)';

            pharmacyOrder = new PharmacyOrder({
                hospitalId,
                patientId: patientId.toString(),
                userId: patientId,
                doctorId: finalDoctorId, 
                appointmentId: lastAppt ? lastAppt._id : (new (require('mongoose').Types.ObjectId)()), // Dummy ID if no appt exists to pass validation safely, or use isOutsidePatient
                isOutsidePatient: !lastAppt,
                patientName: patient ? patient.name : 'Unknown',
                patientPhone: patient ? patient.phone : '',
                doctorName: finalDoctorName,
                items: [orderItem],
                totalAmount: totalAmount,
                taxableAmount: totalAmount,
                totalCost: totalAmount,
                paymentStatus: 'Pending',
                orderStatus: 'Upcoming'
            });
            await pharmacyOrder.save();
        }

        res.status(201).json({ success: true, message: 'Usage recorded and patient billed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;