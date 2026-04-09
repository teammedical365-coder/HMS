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
    // Appointment system mode — set by Supreme Admin per hospital
    // 'slot'  : patients/reception pick a specific time slot (09:00, 09:30, …)
    // 'token' : sequential daily token; resets to 1 at midnight; no time selection
    appointmentMode: { type: String, enum: ['slot', 'token'], default: 'slot' },

    // Hospital admin user reference
    adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Entity type — 'hospital' for full hospitals, 'clinic' for small simple clinics
    clinicType: { type: String, enum: ['hospital', 'clinic'], default: 'hospital' },

    // Clinic-specific fields
    // Short code used as prefix for patient IDs: e.g. "RAM" → patient IDs: RAM-001, RAM-002
    clinicCode: { type: String, uppercase: true, trim: true, default: '' },

    // Staff tier limits (enforced at staff creation)
    tier: {
        maxDoctors:       { type: Number, default: 1 },
        maxReceptionists: { type: Number, default: 1 },
    },

    // Subscription / billing config (set by centraladmin)
    subscription: {
        ratePerPatient:  { type: Number, default: 0 },
        billingEnabled:  { type: Boolean, default: false },
    },

    // Local deployment — API key (bcrypt hashed) issued when clinic goes on-premise
    // null means clinic runs on cloud (default SaaS mode)
    clinicApiKey: { type: String, default: null },

    // Local server status — updated by heartbeat / stats sync
    localServer: {
        isOnline:      { type: Boolean, default: false },
        lastSeenAt:    { type: Date, default: null },
        serverVersion: { type: String, default: '' },
    },

    // ── Revenue / Billing Model ───────────────────────────────────────────────
    // 'per_patient'   : Model B — charged per new patient registered each month
    //                   Rate stored in subscription.ratePerPatient
    // 'fixed_monthly' : Model A — flat monthly fee regardless of patient volume
    //                   Fee stored in revenueConfig.monthlyFee
    // 'per_login'     : Model C — charged per login session (future)
    //                   Rate stored in revenueConfig.ratePerLogin
    revenueModel: {
        type: String,
        enum: ['per_patient', 'fixed_monthly', 'per_login'],
        default: 'per_patient',
    },
    revenueConfig: {
        monthlyFee:    { type: Number, default: 0 },   // for fixed_monthly
        ratePerLogin:  { type: Number, default: 0 },   // for per_login (future)
        billingCycle:  { type: String, enum: ['monthly', 'quarterly', 'annual'], default: 'monthly' },
    },
}, { timestamps: true });

module.exports = mongoose.model('Hospital', hospitalSchema);
