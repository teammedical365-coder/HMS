const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    pharmacyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        index: true
    },
    name: { type: String, required: true, trim: true },
    salt: { type: String, default: '', trim: true },
    category: { type: String, default: 'General' },
    stock: { type: Number, default: 0 },
    unit: { type: String, default: 'Tablets' },
    buyingPrice: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 },
    vendor: { type: String, default: '' },
    batchNumber: { type: String, default: '' },
    expiryDate: { type: Date, default: null },
    purchaseDate: { type: Date, default: Date.now },
    unitConfig: {
        purchaseUnit: { type: String, default: 'Box' },
        saleUnit: { type: String, default: 'Strip' },
        baseUnit: { type: String, default: 'Tablet' },
        purchaseToSaleMultiplier: { type: Number, default: 1 },
        saleToBaseMultiplier: { type: Number, default: 1 }
    },
    inventoryConfig: {
        openingStock: { type: Number, default: 0 },
        minStock: { type: Number, default: 0 },
        maxStock: { type: Number, default: 0 },
        reorderLevel: { type: Number, default: 0 },
        warehouse: { type: String, default: 'Main Store' },
        rackNumber: { type: String, default: '' },
        shelfNumber: { type: String, default: '' }
    },
    pricingConfig: {
        purchasePrice: { type: Number, default: 0 },
        landingCost: { type: Number, default: 0 },
        mrp: { type: Number, default: 0 },
        sellingPrice: { type: Number, default: 0 },
        maxDiscount: { type: Number, default: 0 },
        taxType: { type: String, enum: ['Inclusive', 'Exclusive'], default: 'Inclusive' }
    },
    status: {
        type: String,
        enum: ['In Stock', 'Low Stock', 'Out of Stock'],
        default: 'In Stock'
    },
    // Merged from Project A
    unitsPerStrip: { type: Number, default: 10 },
    sgst: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    cgstPercent: { type: Number, default: 0 },
    sgstPercent: { type: Number, default: 0 },
    minStockAlertLevel: { type: Number, default: 50 },
    rackLocation: { type: String, default: '' },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    isMultiDose: { type: Boolean, default: false },
    packVolume: { type: Number, default: 1 },
    volumeUnit: { type: String, default: 'ml' },
    openUnitVolume: { type: Number, default: 0 },
    billingType: { type: String, enum: ['PROPORTIONAL', 'FULL_UNIT'], default: 'FULL_UNIT' },
    purchaseInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseInvoice', default: null },
    purchaseQty: { type: Number, default: 0 },
    freeQty: { type: Number, default: 0 },
    discountType: { type: String, enum: ['Percentage', 'Flat Amount'], default: 'Percentage' },
    discountValue: { type: Number, default: 0 },
    purchaseAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },
    totalStock: { type: Number, default: 0 }
}, { timestamps: true });

// Virtual for total available volume (if multi-dose)
inventorySchema.virtual('totalAvailableVolume').get(function() {
    if (this.isMultiDose) {
        return (this.stock * this.packVolume) + this.openUnitVolume;
    }
    return this.stock;
});
inventorySchema.set('toJSON', { virtuals: true });
inventorySchema.set('toObject', { virtuals: true });

// UPDATED HOOK: Use async function without 'next' to avoid the error
inventorySchema.pre('save', async function () {
    const alertLevel = this.minStockAlertLevel !== undefined ? this.minStockAlertLevel : 50;
    if (this.stock <= 0) {
        this.status = 'Out of Stock';
    } else if (this.stock <= alertLevel) {
        this.status = 'Low Stock';
    } else {
        this.status = 'In Stock';
    }
    // No next() call needed for async functions in Mongoose
});

// Compound Indexes for high-speed pharmacy inventory searches & filters
inventorySchema.index({ hospitalId: 1, name: 1 });
inventorySchema.index({ hospitalId: 1, status: 1 });
inventorySchema.index({ hospitalId: 1, category: 1 });
inventorySchema.index({ hospitalId: 1, createdAt: -1 });

module.exports = mongoose.model('Inventory', inventorySchema);