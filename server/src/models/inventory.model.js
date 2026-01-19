const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    pharmacyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    stock: { type: Number, required: true, default: 0 },
    unit: { type: String, default: 'Tablets' },
    buyingPrice: { type: Number, required: true },
    sellingPrice: { type: Number, required: true },
    vendor: { type: String, required: true },
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    purchaseDate: { type: Date, default: Date.now },
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