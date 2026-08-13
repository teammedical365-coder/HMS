const express = require('express');
const router = express.Router();
const Inventory = require('../models/inventory.model');
const PurchaseInvoice = require('../models/purchaseInvoice.model');
const { verifyToken, verifyAdmin } = require('../middleware/auth.middleware');
const multer = require('multer');
const { parseInvoice } = require('../utils/invoiceParser');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});

const fs = require('fs');
const path = require('path');
const invoiceStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '../../uploads/invoices');
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const uploadInvoice = multer({
    storage: invoiceStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});

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

// GET all inventory
router.get('/inventory', verifyToken, async (req, res) => {
    try {
        let pharmacyIds = [req.user.id];
        let query = { pharmacyId: req.user.id };

        if (req.user.hospitalId) {
            const pharmacyRoles = await Role.find({ name: { $regex: /pharmac/i } });
            if (pharmacyRoles.length > 0) {
                const pharmacists = await User.find({ hospitalId: req.user.hospitalId, role: { $in: pharmacyRoles.map(r => r._id) } });
                const ids = pharmacists.map(p => p._id);
                if (ids.length > 0) pharmacyIds = ids;
            }
            query = {
                $or: [
                    { pharmacyId: { $in: pharmacyIds } },
                    { hospitalId: req.user.hospitalId }
                ]
            };
        } else {
             query = { pharmacyId: req.user.id };
        }

        const items = await Inventory.find(query).sort({ createdAt: -1 });
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
const Vendor = require('../models/vendor.model');

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
            paymentStatus: 'Paid',
            orderStatus: 'Completed'
        }).populate('userId', 'name phone');

        const returns = await PharmacyReturn.find(dateFilter);

        let totalGrossSales = 0;
        let cashAmount = 0;
        let upiAmount = 0;
        let cardAmount = 0;

        orders.forEach(order => {
            totalGrossSales += (order.totalAmount || 0);
            // Assuming default Cash if no specific payment mode is tracked in PharmacyOrder yet.
            // If paymentMode exists, we map it, else fallback to Cash
            const mode = (order.paymentMode || 'Cash').toLowerCase();
            if (mode.includes('upi')) upiAmount += (order.totalAmount || 0);
            else if (mode.includes('card')) cardAmount += (order.totalAmount || 0);
            else cashAmount += (order.totalAmount || 0);
        });

        let totalReturnsRefunded = 0;
        returns.forEach(r => {
            if (r.returnType === 'Refund') {
                totalReturnsRefunded += (r.refundAmount || 0);
            }
        });

        const netCollection = totalGrossSales - totalReturnsRefunded;

        res.json({
            success: true,
            summary: {
                totalGrossSales,
                totalReturnsRefunded,
                netCollection,
                cashAmount,
                upiAmount,
                cardAmount
            },
            orders,
            returns
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- PURCHASE INVOICE MODULE ---

// POST Upload Purchase Invoice
router.post('/purchase-invoice/upload', verifyToken, uploadInvoice.single('invoice'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded or invalid file format.' });
        }

        const originalName = req.file.originalname;
        const generatedName = req.file.filename || `${Date.now()}-${originalName}`;
        const size = req.file.size;

        const uploadDate = new Date();
        const uploadTime = uploadDate.toTimeString().split(' ')[0];

        // 1. Parse PDF immediately
        let fileBuffer;
        let parsedData;
        try {
            fileBuffer = fs.readFileSync(req.file.path);
            if (!fileBuffer || fileBuffer.length === 0) {
                throw new Error("Uploaded PDF file is empty or corrupt.");
            }
            parsedData = await parseInvoice(fileBuffer);
            
            if (!parsedData || !parsedData.invoice || !Array.isArray(parsedData.medicines)) {
                return res.status(400).json({
                    success: false,
                    message: 'Could not extract valid medicine items from this PDF layout.'
                });
            }
        } catch (parseErr) {
            console.error("PDF Parsing Error:", parseErr);
            // Cleanup the file before returning error
            if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, message: parseErr.message || 'Failed to parse invoice PDF' });
        }

        const { vendorName, vendorAddress, vendorDL, invoiceNumber, invoiceDate, grandTotal, taxableAmount, discount, cgst, sgst, igst } = parsedData.invoice;
        const totalMedicines = parsedData.invoice.totalMedicines || parsedData.medicines.length;
        const purchaseQty = parsedData.invoice.purchaseQty || 0;
        const freeQty = parsedData.invoice.freeQty || 0;

        // 2. Prevent Duplicate Invoice
        if (vendorName && invoiceNumber) {
            const existingInvoice = await PurchaseInvoice.findOne({ vendorName, invoiceNumber });
            if (existingInvoice) {
                // Remove the uploaded file since it's a duplicate
                try {
                    fs.unlinkSync(req.file.path);
                } catch (unlinkErr) {
                    console.error("Failed to delete file:", unlinkErr);
                }
                return res.status(400).json({ success: false, message: 'Invoice Already Exists.' });
            }
        }

        // 3. Create Database Record
        const newInvoice = new PurchaseInvoice({
            vendorName,
            vendorGST: parsedData.invoice.vendorGST,
            vendorAddress,
            vendorDL,
            invoiceNumber,
            invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
            grandTotal,
            taxableAmount,
            discount,
            cgst,
            sgst,
            igst,
            totalMedicines,
            purchaseQty,
            freeQty,
            uploadedBy: {
                name: req.user.name || 'Unknown',
                email: req.user.email || 'Unknown',
                userId: req.user.id
            },
            uploadedPDF: {
                originalName,
                generatedName,
                size
            },
            uploadDate,
            uploadTime,
            status: 'Pending',
            importedMedicines: 0,
            remainingMedicines: totalMedicines
        });

        await newInvoice.save();

        res.status(201).json({
            success: true,
            message: 'Invoice uploaded successfully',
            invoice: newInvoice,
            medicines: parsedData.medicines
        });
    } catch (error) {
        // If parsing fails or any other error, remove the uploaded file
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkErr) {
                console.error("Failed to delete file:", unlinkErr);
            }
        }
        console.error("Upload Invoice Error:", error);
        res.status(500).json({ success: false, message: error.message || 'Failed to upload invoice.' });
    }
});

// POST process purchase invoice (bulk import)
router.post('/purchase-invoice/:id/process', verifyToken, async (req, res) => {
    try {
        const invoice = await PurchaseInvoice.findById(req.params.id);
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }
        if (invoice.status === 'Completed') {
            return res.status(400).json({ success: false, message: 'Invoice already processed' });
        }

        const filePath = path.join(__dirname, '../../uploads/invoices', invoice.uploadedPDF.generatedName);
        if (!fs.existsSync(filePath)) {
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
            // Check if it exists
            const query = { 
                name: med.medicineName, 
                batchNumber: med.batch || ''
            };
            if (hospitalId) {
                query.hospitalId = hospitalId;
            } else {
                query.pharmacyId = pharmacyId;
            }

            let item = await Inventory.findOne(query);

            const purchaseQty = med.purchaseQty || 0;
            const freeQty = med.freeQty || 0;
            const totalQty = purchaseQty + freeQty;
            const buyingPrice = med.purchaseRate || 0;
            
            trueGrandTotal += (purchaseQty * buyingPrice);

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
                    batchNumber: med.batch || '',
                    stock: totalQty,
                    buyingPrice: buyingPrice,
                    sellingPrice: med.mrp || 0,
                    cgst: med.gst / 2 || 0,
                    sgst: med.gst / 2 || 0,
                    purchaseQty: purchaseQty,
                    freeQty: freeQty,
                    discountType: med.discountType || 'Percentage',
                    discountValue: med.discountValue || med.discount || 0,
                    purchaseInvoiceId: invoice._id,
                    vendor: invoice.vendorName || 'Unknown Vendor'
                });
                
                if (med.expiry) {
                    const parts = med.expiry.split(/[\/\-]/);
                    if (parts.length === 2) {
                        let month = parseInt(parts[0]);
                        let year = parseInt(parts[1]);
                        if (year < 100) year += 2000;
                        item.expiryDate = new Date(year, month - 1, 1);
                    }
                }
                await item.save();
            }
            importedCount++;
        }

        invoice.importedMedicines = invoice.totalMedicines || importedCount;
        invoice.remainingMedicines = 0;
        invoice.status = 'Completed';
        invoice.grandTotal = trueGrandTotal;
        await invoice.save();

        res.json({ success: true, message: 'Invoice processed successfully', importedCount, trueGrandTotal });
    } catch (error) {
        console.error("Process Invoice Error:", error);
        res.status(500).json({ success: false, message: error.message || 'Failed to process invoice' });
    }
});

// GET all purchase invoices
router.get('/purchase-invoice', verifyToken, async (req, res) => {
    try {
        const invoices = await PurchaseInvoice.find().sort({ createdAt: -1 });
        
        // Fallback calculation for older invoices with 0 grandTotal
        for (let inv of invoices) {
            if (!inv.grandTotal && inv.status === 'Completed') {
                const items = await Inventory.find({ purchaseInvoiceId: inv._id });
                let calculatedTotal = 0;
                for (let med of items) {
                    const qty = med.purchaseQty || 0;
                    const price = med.buyingPrice || 0;
                    const discount = med.discountValue || 0;
                    const afterDiscount = (qty * price) - discount;
                    const taxAmt = afterDiscount * ((med.cgst || 0) + (med.sgst || 0)) / 100;
                    calculatedTotal += afterDiscount + taxAmt;
                }
                if (calculatedTotal > 0) {
                    inv.grandTotal = calculatedTotal;
                    await PurchaseInvoice.updateOne({ _id: inv._id }, { $set: { grandTotal: calculatedTotal } });
                }
            }
        }

        res.json({ success: true, data: invoices });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET single purchase invoice by ID
router.get('/purchase-invoice/:id', verifyToken, async (req, res) => {
    try {
        const invoice = await PurchaseInvoice.findById(req.params.id);
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }
        
        let importedMedicines = [];
        if (invoice.status === 'Completed') {
            importedMedicines = await Inventory.find({ purchaseInvoiceId: invoice._id });
        } else {
            // For pending invoices, we can re-parse the PDF to return the medicines to display
            const filePath = path.join(__dirname, '../../uploads/invoices', invoice.uploadedPDF.generatedName);
            if (fs.existsSync(filePath)) {
                const fileBuffer = fs.readFileSync(filePath);
                try {
                    const parsedData = await parseInvoice(fileBuffer);
                    importedMedicines = parsedData.medicines.map(m => ({
                        name: m.medicineName,
                        batchNumber: m.batch,
                        purchaseQty: m.purchaseQty,
                        freeQty: m.freeQty,
                        buyingPrice: m.purchaseRate,
                        sellingPrice: m.mrp,
                        totalAmount: m.purchaseQty * m.purchaseRate,
                        expiryDate: m.expiry,
                        discountValue: m.discount || 0,
                        cgst: m.gst ? m.gst / 2 : 0,
                        sgst: m.gst ? m.gst / 2 : 0
                    }));
                } catch(e) { console.error('Parse error on GET:', e); }
            }
        }
        
        // Add medicines array to response for the modal to use
        const invoiceData = invoice.toObject();
        invoiceData.importedMedicinesList = importedMedicines;

        res.json({ success: true, data: invoiceData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE purchase invoice (Admin only)
router.delete('/purchase-invoice/:id', verifyAdmin, async (req, res) => {
    try {
        // Admin validation logic (assuming user role exists or can be verified, here just verifyToken is applied)
        // If there's an isAdmin middleware or we check req.user.role, we can add it here.
        const invoice = await PurchaseInvoice.findByIdAndDelete(req.params.id);
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }
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

        const orderItem = {
            medicineName: facilityName,
            price: Number(unitPrice),
            quantity: Number(quantity),
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

            pharmacyOrder = new PharmacyOrder({
                hospitalId,
                patientId: patientId.toString(),
                userId: patientId,
                doctorId: req.user.id, 
                appointmentId: lastAppt ? lastAppt._id : (new (require('mongoose').Types.ObjectId)()), // Dummy ID if no appt exists to pass validation safely, or use isOutsidePatient
                isOutsidePatient: !lastAppt,
                patientName: patient ? patient.name : 'Unknown',
                patientPhone: patient ? patient.phone : '',
                doctorName: req.user.name || 'Staff',
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