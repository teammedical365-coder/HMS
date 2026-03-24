const mongoose = require('mongoose');

const brandingSchema = new mongoose.Schema({
    // Identity
    appName:    { type: String, default: '' },   // e.g. "AKG Medical Suite"
    tagline:    { type: String, default: '' },   // e.g. "Caring for Every Life"
    logoUrl:    { type: String, default: '' },   // hosted image URL
    faviconUrl: { type: String, default: '' },
    // Color Palette
    primaryColor:    { type: String, default: '#14b8a6' }, // teal
    secondaryColor:  { type: String, default: '#0a2647' }, // navy
    accentColor:     { type: String, default: '#6366f1' }, // purple
    successColor:    { type: String, default: '#10b981' },
    backgroundColor: { type: String, default: '#f8fafc' },
    textColor:       { type: String, default: '#1e293b' },
    // Contact
    supportEmail:  { type: String, default: '' },
    supportPhone:  { type: String, default: '' },
    address:       { type: String, default: '' },
    // Social / Links
    websiteUrl:    { type: String, default: '' },
    instagramUrl:  { type: String, default: '' },
    facebookUrl:   { type: String, default: '' },
    twitterUrl:    { type: String, default: '' },
    // Footer
    footerText:    { type: String, default: '' },  // e.g. "© 2025 AKG Hospital. All rights reserved."
}, { _id: false });

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
    departmentFees: { type: Map, of: Number, default: {} },
    appointmentFee: { type: Number, default: 500 },
    facilities: [{
        name: { type: String, required: true },
        pricePerDay: { type: Number, required: true, min: 0 }
    }],
    // White-label branding config (per hospital)
    branding: { type: brandingSchema, default: () => ({}) },
    // Hospital admin user reference
    adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Hospital', hospitalSchema);
