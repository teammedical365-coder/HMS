'use strict';
/**
 * abha.service.js - ABHA create / link-existing on ABDM V3 (Milestone 1).
 *
 * Security & tenant invariants:
 *  - Supports Hospital patients (User) and Simple Clinic patients (ClinicPatient) without mixing models.
 *  - Aadhaar is NEVER read from the patient record and NEVER stored or logged.
 *  - Every txnId is bound server-side to hospital/clinic + patient + user with atomic attempt caps,
 *    resend cooldowns, temporary lockouts, expiry checks, and replay prevention.
 *  - Never logs OTP values, Aadhaar numbers, or decrypted tokens.
 */
const mongoose = require('mongoose');
const User = require('../../models/user.model');
const Hospital = require('../../models/hospital.model');
const ClinicPatient = require('../../models/clinicPatient.model');
const Role = require('../../models/role.model');
const AbdmTxn = require('../../models/abdmTxn.model');
const client = require('./abdm.client');
const { getTenantConnection } = require('../../db/tenantDb');
const { getTenantModels } = require('../../db/tenantModels');

const OTP_RESEND_COOLDOWN_MS = Number(process.env.ABDM_OTP_RESEND_COOLDOWN_MS) || 45 * 1000;
const MAX_OTP_ATTEMPTS = Number(process.env.ABDM_OTP_MAX_ATTEMPTS) || 5;
const OTP_LOCK_MS = Number(process.env.ABDM_OTP_LOCK_MS) || 15 * 60 * 1000;
const TXN_TTL_MS = Number(process.env.ABDM_TXN_TTL_MS) || 10 * 60 * 1000;

const STAFF_ROLE_NAMES = new Set([
    'hospitaladmin', 'hospital admin', 'superadmin', 'centraladmin', 'admin',
    'doctor', 'clinic doctor', 'clinicdoctor', 'resident', 'resident doctor',
    'reception', 'receptionist', 'nurse', 'staff nurse', 'head nurse',
    'accountant', 'pharmacist', 'lab', 'lab admin', 'lab manager',
    'lab technician', 'pathologist', 'phlebotomist', 'cashier', 'billing',
    'ot manager', 'doctor assistant'
]);

const httpError = (status, message) => Object.assign(new Error(message), { status });
const notConfigured = () => ({
    success: false,
    configured: false,
    message: 'ABDM is not configured. Set ABDM_CLIENT_ID and ABDM_CLIENT_SECRET in the server environment.',
});

class AbhaService {
    maskAbhaNumber(n) {
        if (!n || typeof n !== 'string') return '';
        const clean = n.trim();
        return clean.length <= 4 ? '****' : `**-****-****-${clean.slice(-4)}`;
    }

    maskAbhaAddress(a) {
        if (!a || typeof a !== 'string') return '';
        const [user, domain] = a.trim().split('@');
        if (!domain) return '******@abdm';
        if (user.length <= 2) return `${user[0]}*@${domain}`;
        return `${user[0]}***${user[user.length - 1]}@${domain}`;
    }

    async _isHospitalUserPatientRecord(user) {
        if (!user) return false;
        if (typeof user.role === 'string') {
            const lower = user.role.toLowerCase().trim();
            if (lower === 'patient') return true;
            if (STAFF_ROLE_NAMES.has(lower)) return false;
        }
        if (user.role && mongoose.Types.ObjectId.isValid(String(user.role))) {
            const roleDoc = await Role.findById(user.role).select('name').lean();
            const rName = String(roleDoc?.name || '').toLowerCase().trim();
            if (rName === 'patient') return true;
            if (STAFF_ROLE_NAMES.has(rName)) return false;
        }
        return Boolean(user.patientId);
    }

    async _resolvePatientForTenant(hospitalId, patientId) {
        if (!hospitalId || !mongoose.Types.ObjectId.isValid(String(hospitalId))) {
            throw httpError(400, 'Valid hospital or clinic ID is required');
        }
        if (!patientId || !mongoose.Types.ObjectId.isValid(String(patientId))) {
            throw httpError(400, 'Valid patient ID is required');
        }

        const hospital = await Hospital.findOne({ _id: hospitalId, isActive: { $ne: false } })
            .select('_id name clinicType abdm')
            .lean();
        if (!hospital) {
            throw httpError(404, 'Hospital or clinic not found or inactive');
        }

        if (hospital.clinicType === 'clinic') {
            const clinicPatient = await ClinicPatient.findOne({
                _id: patientId,
                clinicId: hospital._id,
                isActive: { $ne: false }
            });
            if (clinicPatient) {
                return { patient: clinicPatient, patientModel: 'ClinicPatient', tenantId: hospital._id, hospital };
            }

            // Optional fallback ONLY for legacy clinics storing patients in User (strictly scoped to this tenant)
            const legacyClinicUser = await User.findOne({ _id: patientId, hospitalId: hospital._id });
            if (legacyClinicUser && await this._isHospitalUserPatientRecord(legacyClinicUser)) {
                return { patient: legacyClinicUser, patientModel: 'User', tenantId: hospital._id, hospital };
            }
            throw httpError(404, 'Clinic patient record not found in this clinic');
        }

        const hospitalPatient = await User.findOne({ _id: patientId, hospitalId: hospital._id });
        if (!hospitalPatient || !(await this._isHospitalUserPatientRecord(hospitalPatient))) {
            throw httpError(404, 'Patient record not found in this hospital');
        }
        return { patient: hospitalPatient, patientModel: 'User', tenantId: hospital._id, hospital };
    }

    async getPatientForTenant(hospitalId, patientId) {
        const resolved = await this._resolvePatientForTenant(hospitalId, patientId);
        return resolved.patient;
    }

    async _assertCanSendOtp({ hospitalId, patientId, flow }) {
        const now = new Date();
        const latest = await AbdmTxn.findOne({ hospitalId, patientId, flow })
            .sort({ lastOtpSentAt: -1, createdAt: -1 })
            .lean();

        if (!latest) return;

        if (latest.lockedUntil && new Date(latest.lockedUntil) > now) {
            const waitMins = Math.max(1, Math.ceil((new Date(latest.lockedUntil).getTime() - now.getTime()) / 60000));
            throw httpError(429, `ABDM OTP is temporarily locked due to repeated failed attempts. Try again in ${waitMins} minute(s).`);
        }

        const sentAt = latest.lastOtpSentAt ? new Date(latest.lastOtpSentAt) : (latest.createdAt ? new Date(latest.createdAt) : null);
        if (latest.status === 'ACTIVE' && sentAt) {
            const elapsed = now.getTime() - sentAt.getTime();
            if (elapsed < OTP_RESEND_COOLDOWN_MS) {
                const waitSecs = Math.max(1, Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000));
                throw httpError(429, `Please wait ${waitSecs} seconds before requesting another OTP.`);
            }
        }
    }

    async bindTxn({ txnId, flow, hospitalId, patientId, patientModel = 'User', userId, meta }) {
        if (!txnId) throw httpError(502, 'ABDM did not return a transaction id');
        const cleanTxnId = String(txnId).trim();
        const existing = await AbdmTxn.findOne({ txnId: cleanTxnId, flow }).select('status lockedUntil').lean();
        if (existing && existing.status === 'VERIFIED') {
            throw httpError(409, 'Transaction identifier replay rejected');
        }

        const now = new Date();
        await AbdmTxn.findOneAndUpdate(
            { txnId: cleanTxnId, flow },
            {
                $set: {
                    hospitalId,
                    patientId,
                    patientModel,
                    userId: userId || null,
                    meta: meta || {},
                    status: 'ACTIVE',
                    attempts: 0,
                    maxAttempts: MAX_OTP_ATTEMPTS,
                    lockedUntil: null,
                    expiresAt: new Date(now.getTime() + TXN_TTL_MS),
                    lastOtpSentAt: now,
                    verifiedAt: null,
                    processingStartedAt: null,
                    createdAt: now
                }
            },
            { upsert: true }
        );
    }

    async claimTxnForVerify({ txnId, flow, hospitalId, patientId, userId }) {
        const cleanTxnId = String(txnId || '').trim();
        if (!cleanTxnId) throw httpError(400, 'txnId is required');

        const now = new Date();
        const claimed = await AbdmTxn.findOneAndUpdate(
            {
                txnId: cleanTxnId,
                flow,
                hospitalId,
                patientId,
                userId: userId || null,
                status: 'ACTIVE',
                attempts: { $lt: MAX_OTP_ATTEMPTS },
                $and: [
                    { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
                    { $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] }
                ]
            },
            {
                $set: { status: 'PROCESSING', processingStartedAt: now },
                $inc: { attempts: 1 }
            },
            { new: true }
        );

        if (claimed) return claimed;

        // Inspect existing txn for deterministic error reporting (scoped check avoids info leak across hospitals)
        const existing = await AbdmTxn.findOne({
            txnId: cleanTxnId,
            flow,
            hospitalId,
            patientId
        }).lean();

        if (!existing || (existing.userId && userId && String(existing.userId) !== String(userId))) {
            throw httpError(403, 'Invalid or expired transaction. Please start again.');
        }
        if (existing.status === 'VERIFIED') {
            throw httpError(409, 'This transaction has already been completed and cannot be reused.');
        }
        if (existing.status === 'PROCESSING') {
            throw httpError(409, 'OTP verification is already in progress for this transaction.');
        }
        if (
            existing.status === 'LOCKED' ||
            (existing.lockedUntil && new Date(existing.lockedUntil) > now) ||
            existing.attempts >= (existing.maxAttempts || MAX_OTP_ATTEMPTS)
        ) {
            await AbdmTxn.updateOne(
                { _id: existing._id, status: { $ne: 'LOCKED' } },
                { $set: { status: 'LOCKED', lockedUntil: existing.lockedUntil || new Date(now.getTime() + OTP_LOCK_MS) } }
            ).catch(() => {});
            throw httpError(429, 'Too many failed OTP attempts. Transaction temporarily locked.');
        }
        if (existing.expiresAt && new Date(existing.expiresAt) <= now) {
            await AbdmTxn.updateOne({ _id: existing._id }, { $set: { status: 'EXPIRED' } }).catch(() => {});
            throw httpError(410, 'ABDM transaction expired. Please start again.');
        }
        throw httpError(403, 'Invalid or expired transaction. Please start again.');
    }

    async _releaseFailedAttempt(claimedTxn) {
        if (!claimedTxn) return false;
        const limit = claimedTxn.maxAttempts || MAX_OTP_ATTEMPTS;
        if (claimedTxn.attempts >= limit) {
            await AbdmTxn.updateOne(
                { _id: claimedTxn._id },
                {
                    $set: {
                        status: 'LOCKED',
                        lockedUntil: new Date(Date.now() + OTP_LOCK_MS),
                        processingStartedAt: null
                    }
                }
            );
            return true;
        }
        await AbdmTxn.updateOne(
            { _id: claimedTxn._id, status: 'PROCESSING' },
            { $set: { status: 'ACTIVE', processingStartedAt: null } }
        );
        return false;
    }

    async _markTxnVerified(claimedTxn) {
        if (!claimedTxn) return;
        await AbdmTxn.updateOne(
            { _id: claimedTxn._id },
            { $set: { status: 'VERIFIED', verifiedAt: new Date(), processingStartedAt: null } }
        );
    }

    async getStatus(hospitalId, patientId) {
        const { patient, patientModel } = await this._resolvePatientForTenant(hospitalId, patientId);
        const a = patient.abdm || {};
        return {
            success: true,
            isConfigured: client.isConfigured(),
            patientId: patient._id,
            patientType: patientModel === 'ClinicPatient' ? 'clinic' : 'hospital',
            name: patient.name,
            mrn: patient.patientUid || patient.patientId || 'N/A',
            abdm: {
                status: a.status || (a.isVerified ? 'Verified' : 'Not Linked'),
                isVerified: Boolean(a.isVerified),
                verifiedAt: a.verifiedAt || null,
                linkedAt: a.linkedAt || null,
                maskedAbhaNumber: a.abhaNumber ? this.maskAbhaNumber(a.abhaNumber) : null,
                maskedAbhaAddress: a.abhaAddress ? this.maskAbhaAddress(a.abhaAddress) : null,
            },
        };
    }

    // ── Create new ABHA (Aadhaar OTP) ────────────────────────────────────────
    async startCreate(hospitalId, patientId, userId, { aadhaarNumber }) {
        if (!client.isConfigured()) return notConfigured();
        const { patient, patientModel, tenantId } = await this._resolvePatientForTenant(hospitalId, patientId);
        if (patient.abdm && patient.abdm.isVerified) throw httpError(409, 'ABHA already linked to this patient');

        const aadhaar = String(aadhaarNumber || '').trim();
        if (!/^\d{12}$/.test(aadhaar)) throw httpError(400, 'A valid 12-digit Aadhaar number is required');

        await this._assertCanSendOtp({ hospitalId: tenantId, patientId: patient._id, flow: 'ENROL' });

        const r = await client.requestEnrolOtp({ aadhaar }); // encrypted inside the client
        await this.bindTxn({
            txnId: r.txnId,
            flow: 'ENROL',
            hospitalId: tenantId,
            patientId: patient._id,
            patientModel,
            userId
        });
        return { success: true, configured: true, txnId: r.txnId, message: 'OTP sent to the Aadhaar-registered mobile number' };
    }

    async verifyCreate(hospitalId, patientId, userId, { txnId, otp, mobile }) {
        if (!client.isConfigured()) return notConfigured();
        if (!txnId || !otp) throw httpError(400, 'txnId and otp are required');

        const { patient, patientModel, tenantId } = await this._resolvePatientForTenant(hospitalId, patientId);
        const mob = String(mobile || patient.phone || patient.mobile || '').replace(/\D/g, '').slice(-10);
        if (!mob || mob.length !== 10) {
            throw httpError(400, 'A valid 10-digit mobile number is required to link the ABHA profile.');
        }

        const claimed = await this.claimTxnForVerify({
            txnId,
            flow: 'ENROL',
            hospitalId: tenantId,
            patientId: patient._id,
            userId
        });

        const otpStr = String(otp).trim();
        if (!/^\d{6}$/.test(otpStr)) {
            const locked = await this._releaseFailedAttempt(claimed);
            throw httpError(locked ? 429 : 400, locked ? 'Maximum OTP attempts exceeded. Transaction locked.' : 'A valid 6-digit OTP is required');
        }

        let profile;
        try {
            const resp = await client.enrolByAadhaar({ txnId, otp: otpStr, mobile: mob });
            profile = resp && resp.profile;
        } catch (err) {
            const locked = await this._releaseFailedAttempt(claimed);
            if (locked) throw httpError(429, 'Too many failed OTP attempts. Transaction temporarily locked.');
            throw err;
        }

        if (!profile) {
            const locked = await this._releaseFailedAttempt(claimed);
            if (locked) throw httpError(429, 'Too many failed OTP attempts. Transaction temporarily locked.');
            throw httpError(502, 'ABDM did not return the created ABHA');
        }

        await this._markTxnVerified(claimed);
        const abha = await this.persist(patient, profile, { patientModel, tenantId });
        return { success: true, message: 'ABHA created and linked to the patient', abha };
    }

    // ── Link existing ABHA (by 14-digit ABHA number) ─────────────────────────
    async startLink(hospitalId, patientId, userId, { abhaIdentifier, authMethod = 'AADHAAR_OTP' }) {
        if (!client.isConfigured()) return notConfigured();
        const { patient, patientModel, tenantId } = await this._resolvePatientForTenant(hospitalId, patientId);
        if (patient.abdm && patient.abdm.isVerified) throw httpError(409, 'ABHA already linked to this patient');

        const digits = String(abhaIdentifier || '').replace(/\D/g, '');
        if (digits.length !== 14) {
            throw httpError(400, 'Enter the 14-digit ABHA number (ABHA-address login is not supported yet)');
        }
        const abhaNumber = `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;

        const dup = patientModel === 'ClinicPatient'
            ? await ClinicPatient.findOne({ clinicId: tenantId, _id: { $ne: patient._id }, 'abdm.abhaNumber': abhaNumber }).select('_id').lean()
            : await User.findOne({ hospitalId: tenantId, _id: { $ne: patient._id }, 'abdm.abhaNumber': abhaNumber }).select('_id').lean();
        if (dup) throw httpError(409, 'This ABHA is already linked to another patient in this facility');

        await this._assertCanSendOtp({ hospitalId: tenantId, patientId: patient._id, flow: 'LOGIN' });

        const viaAadhaar = String(authMethod).toUpperCase() !== 'MOBILE_OTP';
        const scope = viaAadhaar ? ['abha-login', 'aadhaar-verify'] : ['abha-login'];
        const r = await client.requestLoginOtp({
            loginHint: 'abha-number', loginId: abhaNumber, otpSystem: viaAadhaar ? 'aadhaar' : 'abdm', scope,
        });
        await this.bindTxn({
            txnId: r.txnId,
            flow: 'LOGIN',
            hospitalId: tenantId,
            patientId: patient._id,
            patientModel,
            userId,
            meta: { scope }
        });
        return { success: true, configured: true, txnId: r.txnId, authMode: authMethod, message: 'OTP sent by ABDM' };
    }

    async verifyLink(hospitalId, patientId, userId, { txnId, otp }) {
        if (!client.isConfigured()) return notConfigured();
        if (!txnId || !otp) throw httpError(400, 'txnId and otp are required');

        const { patient, patientModel, tenantId } = await this._resolvePatientForTenant(hospitalId, patientId);
        const claimed = await this.claimTxnForVerify({
            txnId,
            flow: 'LOGIN',
            hospitalId: tenantId,
            patientId: patient._id,
            userId
        });

        const otpStr = String(otp).trim();
        if (!/^\d{6}$/.test(otpStr)) {
            const locked = await this._releaseFailedAttempt(claimed);
            throw httpError(locked ? 429 : 400, locked ? 'Maximum OTP attempts exceeded. Transaction locked.' : 'A valid 6-digit OTP is required');
        }

        let profile;
        try {
            const resp = await client.verifyLogin({
                txnId,
                otp: otpStr,
                scope: (claimed.meta && claimed.meta.scope) || ['abha-login']
            });
            profile = resp && resp.profile;
        } catch (err) {
            const locked = await this._releaseFailedAttempt(claimed);
            if (locked) throw httpError(429, 'Too many failed OTP attempts. Transaction temporarily locked.');
            throw err;
        }

        if (!profile) {
            const locked = await this._releaseFailedAttempt(claimed);
            if (locked) throw httpError(429, 'Too many failed OTP attempts. Transaction temporarily locked.');
            throw httpError(502, 'ABDM did not return verified ABHA details');
        }

        await this._markTxnVerified(claimed);
        const abha = await this.persist(patient, profile, { patientModel, tenantId });
        return { success: true, message: 'ABHA verified and linked', abha };
    }

    // ── shared ───────────────────────────────────────────────────────────────
    async persist(patient, profile, { patientModel = null, tenantId = null } = {}) {
        const resolvedModel = patientModel || (patient.clinicId ? 'ClinicPatient' : 'User');
        const resolvedTenantId = tenantId || patient.clinicId || patient.hospitalId;

        const abhaNumber = profile.ABHANumber || profile.healthIdNumber || null;
        const abhaAddress = String(
            (profile.phrAddress && profile.phrAddress[0]) ||
            profile.preferredAbhaAddress ||
            profile.preferredAddress ||
            ''
        ).toLowerCase() || null;
        if (!abhaNumber && !abhaAddress) throw httpError(502, 'ABDM did not return ABHA credentials');

        const name = profile.name || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ') || null;
        const yobMatch = String(profile.yearOfBirth || profile.dob || '').match(/(19|20)\d{2}/);
        const g = profile.gender ? String(profile.gender).trim()[0].toUpperCase() : null;

        const dupOr = [];
        if (abhaNumber) dupOr.push({ 'abdm.abhaNumber': abhaNumber });
        if (abhaAddress) dupOr.push({ 'abdm.abhaAddress': abhaAddress });

        if (dupOr.length) {
            const dup = resolvedModel === 'ClinicPatient'
                ? await ClinicPatient.findOne({ clinicId: resolvedTenantId, _id: { $ne: patient._id }, $or: dupOr }).select('_id').lean()
                : await User.findOne({ hospitalId: resolvedTenantId, _id: { $ne: patient._id }, $or: dupOr }).select('_id').lean();
            if (dup) throw httpError(409, 'ABHA already linked to another patient in this facility');
        }

        const now = new Date();
        const update = {
            abhaNumber, abhaAddress,
            abhaName: name, abhaGender: g, abhaYearOfBirth: yobMatch ? Number(yobMatch[0]) : null,
            kycVerified: Boolean(profile.kycVerified),
            isVerified: true, verifiedAt: now, linkedAt: now, status: 'Verified',
        };
        patient.abdm = update;
        await patient.save();

        // Sync tenant DB copy only for multi-tenant Hospital patients (User model), never ClinicPatient
        if (resolvedModel === 'User' && patient.hospitalId) {
            try {
                const tdb = await getTenantConnection(String(patient.hospitalId));
                const tm = getTenantModels(tdb);
                if (tm.User) await tm.User.findByIdAndUpdate(patient._id, { $set: { abdm: update } });
            } catch (err) {
                console.error('[ABHA] tenant DB sync failed:', err.message); // no PHI in the log
            }
        }

        return {
            status: 'Verified', isVerified: true,
            maskedAbhaNumber: this.maskAbhaNumber(abhaNumber),
            maskedAbhaAddress: this.maskAbhaAddress(abhaAddress),
        };
    }
}

module.exports = new AbhaService();
