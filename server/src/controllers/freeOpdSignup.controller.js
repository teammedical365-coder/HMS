const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const Hospital = require('../models/hospital.model');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const Role = require('../models/role.model');
const { sendFreeOpdWelcomeEmail } = require('../services/email.service');
const { getTenantConnection } = require('../db/tenantDb');
const validatePassword = require('../utils/validatePassword');

/**
 * Generate a unique URL slug from clinic name.
 * If collisions occur, increments with -1, -2, etc.
 */
const generateUniqueSlug = async (name) => {
    const raw = (name || 'clinic').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'clinic';
    let candidate = raw;
    let counter = 1;
    while (await Hospital.findOne({ slug: candidate })) {
        candidate = `${raw}-${counter++}`;
    }
    return candidate;
};

/**
 * Generate a unique 3-4 character clinic prefix code.
 */
const generateClinicCode = async (name) => {
    const base = (name || 'CLN').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'CLN';
    let code = base;
    let suffix = 1;
    while (await Hospital.findOne({ clinicCode: code })) {
        code = base.slice(0, 3) + suffix;
        suffix++;
    }
    return code;
};

/**
 * POST /api/public/free-opd-signup
 * Public self-service registration for the Free Doctor OPD Plan.
 */
exports.signup = async (req, res) => {
    try {
        const {
            clinicName,
            address,
            city,
            state,
            pincode,
            doctorName,
            doctorEmail,
            doctorPhone,
            specialization,
            qualification,
            password,
            consultationFee,
            // Security check: any client attempt to specify subscription plan
            subscriptionPlan,
            plan,
            tier
        } = req.body;

        // ── 1. SECURITY RESTRICTION: Reject client-supplied paid plans ──────────
        if ((subscriptionPlan && subscriptionPlan !== 'free_doctor_opd') ||
            (plan && plan !== 'free_doctor_opd')) {
            return res.status(400).json({
                success: false,
                message: 'The public self-signup endpoint only provisions the Free Doctor OPD Plan. Paid subscriptions cannot be created via this endpoint.'
            });
        }

        // ── 2. INPUT VALIDATION ───────────────────────────────────────────────
        if (!clinicName || typeof clinicName !== 'string' || clinicName.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Clinic name is required (min 2 characters)' });
        }

        if (!doctorName || typeof doctorName !== 'string' || doctorName.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Doctor full name is required (min 2 characters)' });
        }

        if (!doctorEmail || typeof doctorEmail !== 'string') {
            return res.status(400).json({ success: false, message: 'Valid doctor email address is required' });
        }
        const normalizedEmail = doctorEmail.toLowerCase().trim();
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email format' });
        }

        if (!doctorPhone || typeof doctorPhone !== 'string') {
            return res.status(400).json({ success: false, message: 'Doctor mobile number is required' });
        }
        const cleanedPhone = doctorPhone.replace(/\D/g, '').slice(-10);
        if (cleanedPhone.length !== 10) {
            return res.status(400).json({ success: false, message: 'Phone number must be a valid 10-digit mobile number' });
        }

        if (!password || typeof password !== 'string') {
            return res.status(400).json({ success: false, message: 'Password is required' });
        }
        const pwError = validatePassword(password);
        if (pwError) {
            return res.status(400).json({ success: false, message: pwError });
        }

        // ── 3. DUPLICATE ACCOUNT CHECK ────────────────────────────────────────
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'An account with this email address already exists. Please log in to your account.'
            });
        }

        // ── 4. AUTO-GENERATE COLLISION-FREE SLUG & CLINIC CODE ────────────────
        const slug = await generateUniqueSlug(clinicName);
        const clinicCode = await generateClinicCode(clinicName);

        // ── 5. CREATE CLINIC TENANT WITH STRICT FREE OPD LIMITS ──────────────
        const clinicData = {
            name: clinicName.trim(),
            slug,
            clinicCode,
            address: address ? address.trim() : '',
            city: city ? city.trim() : '',
            state: state ? state.trim() : '',
            phone: cleanedPhone,
            email: normalizedEmail,
            clinicType: 'clinic',
            subscriptionPlan: 'free_doctor_opd',
            appointmentMode: 'token',
            isActive: true,
            defaultFee: Number(consultationFee) || 0,
            tier: {
                maxDoctors: 1,
                maxReceptionists: 0,
                maxStaff: 0,
                maxDailyAppointments: 20
            }
        };

        const clinic = new Hospital(clinicData);
        await clinic.save();

        // Auto-provision tenant DB (non-fatal if database server allows dynamic creation)
        try {
            await getTenantConnection(clinic._id.toString());
        } catch (dbErr) {
            console.error('[freeOpdSignup] Tenant DB provisioning error (non-fatal):', dbErr.message);
        }

        // ── 6. CREATE DOCTOR USER ACCOUNT ────────────────────────────────────
        // Resolve seeded Clinic Doctor role or fallback to 'doctor'
        let roleId = 'doctor';
        try {
            const roleDoc = await Role.findOne({ name: 'Clinic Doctor', hospitalId: null });
            if (roleDoc) {
                roleId = roleDoc._id;
            }
        } catch (_) {}

        const user = new User({
            name: doctorName.trim(),
            email: normalizedEmail,
            password, // Hashed automatically by User pre-save hook
            phone: cleanedPhone,
            role: roleId,
            hospitalId: clinic._id,
            city: city ? city.trim() : undefined,
            state: state ? state.trim() : undefined,
            address: address ? address.trim() : undefined,
            zipCode: pincode ? pincode.trim() : undefined,
            services: specialization ? [specialization.trim()] : ['General Consultation']
        });
        await user.save();

        // Link clinic administrator to doctor user
        clinic.adminUserId = user._id;
        await clinic.save();

        // ── 7. CREATE LINKED DOCTOR RECORD ───────────────────────────────────
        let doctorId;
        let isUnique = false;
        while (!isUnique) {
            doctorId = nanoid(10);
            const existingDoc = await Doctor.findOne({ doctorId });
            if (!existingDoc) isUnique = true;
        }

        const doctorDoc = new Doctor({
            doctorId,
            userId: user._id,
            hospitalId: clinic._id,
            name: doctorName.trim(),
            email: normalizedEmail,
            phone: cleanedPhone,
            specialty: specialization ? specialization.trim() : 'General Physician',
            education: qualification ? qualification.trim() : 'MBBS',
            status: 'Active',
            isAvailable: true,
            consultationFee: Number(consultationFee) || 0
        });
        await doctorDoc.save();

        // ── 8. CONSTRUCT CLINIC & LOGIN URLS ────────────────────────────────
        const baseDomain = process.env.BASE_DOMAIN || 'medical365.in';
        const clinicUrl = `https://${baseDomain}`;
        const loginUrl = `https://${baseDomain}/login?email=${encodeURIComponent(normalizedEmail)}`;
        const devLoginUrl = `/login?email=${encodeURIComponent(normalizedEmail)}`;

        // ── 9. DISPATCH WELCOME EMAIL (Asynchronous Background Task) ─────────
        sendFreeOpdWelcomeEmail({
            email: normalizedEmail,
            doctorName: doctorName.trim(),
            clinicName: clinic.name,
            clinicUrl,
            loginUrl,
            password
        }).catch(emailErr => {
            console.error('[freeOpdSignup] Failed to send welcome email in background:', emailErr.message);
        });

        // ── 10. SUCCESS RESPONSE ─────────────────────────────────────────────
        return res.status(201).json({
            success: true,
            message: 'Free Doctor OPD clinic created successfully',
            clinic: {
                id: clinic._id,
                name: clinic.name,
                slug: clinic.slug,
                clinicCode: clinic.clinicCode,
                address: clinic.address,
                city: clinic.city,
                state: clinic.state,
                phone: clinic.phone,
                email: clinic.email,
                clinicType: clinic.clinicType,
                subscriptionPlan: clinic.subscriptionPlan,
                tier: clinic.tier,
                createdAt: clinic.createdAt
            },
            doctor: {
                id: doctorDoc._id,
                doctorId: doctorDoc.doctorId,
                userId: user._id,
                name: doctorDoc.name,
                email: doctorDoc.email,
                phone: doctorDoc.phone,
                specialty: doctorDoc.specialty,
                education: doctorDoc.education
            },
            clinicUrl,
            loginUrl,
            devLoginUrl
        });

    } catch (error) {
        console.error('Free Doctor OPD signup error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred during Free Doctor OPD registration',
            error: error.message
        });
    }
};

/**
 * POST /api/public/free-opd-signup/resend-email
 * Safe resend mechanism if email delivery failed. Does NOT create duplicate clinics.
 */
exports.resendWelcomeEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Registered email is required' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail }).populate('hospitalId');
        if (!user || !user.hospitalId) {
            return res.status(404).json({ success: false, message: 'No registered account found with this email' });
        }

        const clinic = user.hospitalId;
        if (clinic.subscriptionPlan !== 'free_doctor_opd') {
            return res.status(400).json({ success: false, message: 'This account is not on the Free Doctor OPD Plan' });
        }

        const baseDomain = process.env.BASE_DOMAIN || 'medical365.in';
        const clinicUrl = `https://${baseDomain}`;
        const loginUrl = `https://${baseDomain}/login?email=${encodeURIComponent(normalizedEmail)}`;

        await sendFreeOpdWelcomeEmail({
            email: normalizedEmail,
            doctorName: user.name,
            clinicName: clinic.name,
            clinicUrl,
            loginUrl
        });

        return res.json({
            success: true,
            message: 'Free Doctor OPD welcome email resent successfully',
            clinicUrl,
            loginUrl
        });
    } catch (error) {
        console.error('Resend welcome email error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to resend welcome email',
            error: error.message
        });
    }
};

