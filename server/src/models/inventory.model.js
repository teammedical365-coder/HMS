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
    }
}, { timestamps: true });

// UPDATED HOOK: Use async function without 'next' to avoid the error
inventorySchema.pre('save', async function () {
    if (this.stock <= 0) {
        this.status = 'Out of Stock';
    } else if (this.stock < 50) {
        this.status = 'Low Stock';
    } else {
        this.status = 'In Stock';
    }
    // No next() call needed for async functions in Mongoose
});

module.exports = mongoose.model('Inventory', inventorySchema);