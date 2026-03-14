const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    // slug: URL-safe identifier used in path-based routing: myurl.com/:slug/login
    // Auto-generated from name on creation if not provided
    slug: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    logo: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    departments: [{ type: String }],
    facilities: [{
        name: { type: String, required: true },
        pricePerDay: { type: Number, required: true, min: 0 }
    }],
    // Hospital admin user reference
    adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Hospital', hospitalSchema);
