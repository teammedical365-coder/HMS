'use strict';
/**
 * abha.service.js - ABHA create / link-existing on ABDM V3 (Milestone 1).
 *
 * Differences from the old version:
 *  - V3 endpoints; Aadhaar/mobile/OTP are RSA-encrypted (inside abdm.client.js).
 *  - Aadhaar is NEVER read from the patient record and NEVER stored or logged.
 *  - Every txnId is bound server-side to hospital + patient + user (no replay across patients).
 *  - Captures abhaName/gender/yearOfBirth exactly as ABDM returns them (needed for link tokens).
 */
const User = require('../../models/user.model');
const AbdmTxn = require('../../models/abdmTxn.model');
const client = require('./abdm.client');
const config = require('./abdm.config');
const { getTenantConnection } = require('../../db/tenantDb');
const { getTenantModels } = require('../../db/tenantModels');

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

    async getPatientForTenant(hospitalId, patientId) {
        if (!hospitalId) throw httpError(400, 'hospitalId is required');
        if (!patientId) throw httpError(400, 'Patient ID is required');
        const patient = await User.findOne({ _id: patientId, hospitalId });
        if (!patient) throw httpError(404, 'Patient record not found in this hospital');
        return patient;
    }

    async bindTxn({ txnId, flow, hospitalId, patientId, userId, meta }) {
        if (!txnId) throw httpError(502, 'ABDM did not return a transaction id');
        await AbdmTxn.findOneAndUpdate(
            { txnId: String(txnId), flow },
            { $set: { hospitalId, patientId, userId: userId || null, meta: meta || {}, attempts: 0, createdAt: new Date() } },
            { upsert: true }
        );
    }

    async takeTxn({ txnId, flow, hospitalId, patientId, userId }) {
        const t = await AbdmTxn.findOne({ txnId: String(txnId), flow, hospitalId, patientId, userId: userId || null });
        if (!t) throw httpError(403, 'Invalid or expired transaction. Please start again.');
        return t;
    }

    async getStatus(hospitalId, patientId) {
        const patient = await this.getPatientForTenant(hospitalId, patientId);
        const a = patient.abdm || {};
        return {
            success: true,
            isConfigured: client.isConfigured(),
            patientId: patient._id,
            name: patient.name,
            mrn: patient.patientId || 'N/A',
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
        const patient = await this.getPatientForTenant(hospitalId, patientId);
        if (patient.abdm && patient.abdm.isVerified) throw httpError(409, 'ABHA already linked to this patient');

        const aadhaar = String(aadhaarNumber || '').trim();
        if (!/^\d{12}$/.test(aadhaar)) throw httpError(400, 'A valid 12-digit Aadhaar number is required');

        const r = await client.requestEnrolOtp({ aadhaar }); // encrypted inside the client
        await this.bindTxn({ txnId: r.txnId, flow: 'ENROL', hospitalId: patient.hospitalId, patientId: patient._id, userId });
        return { success: true, configured: true, txnId: r.txnId, message: 'OTP sent to the Aadhaar-registered mobile number' };
    }

    async verifyCreate(hospitalId, patientId, userId, { txnId, otp, mobile }) {
        if (!client.isConfigured()) return notConfigured();
        if (!txnId || !otp) throw httpError(400, 'txnId and otp are required');
        const patient = await this.getPatientForTenant(hospitalId, patientId);
        await this.takeTxn({ txnId, flow: 'ENROL', hospitalId: patient.hospitalId, patientId: patient._id, userId });

        const mob = String(mobile || patient.phone || patient.mobile || '').replace(/\D/g, '').slice(-10);
        if (!mob || mob.length !== 10) {
            throw httpError(400, 'A valid 10-digit mobile number is required to link the ABHA profile.');
        }
        const { profile } = await client.enrolByAadhaar({ txnId, otp: String(otp).trim(), mobile: mob });
        if (!profile) throw httpError(502, 'ABDM did not return the created ABHA');

        const abha = await this.persist(patient, profile);
        await AbdmTxn.deleteOne({ txnId: String(txnId), flow: 'ENROL' });
        return { success: true, message: 'ABHA created and linked to the patient', abha };
    }

    // ── Link existing ABHA (by 14-digit ABHA number) ─────────────────────────
    async startLink(hospitalId, patientId, userId, { abhaIdentifier, authMethod = 'AADHAAR_OTP' }) {
        if (!client.isConfigured()) return notConfigured();
        const patient = await this.getPatientForTenant(hospitalId, patientId);
        if (patient.abdm && patient.abdm.isVerified) throw httpError(409, 'ABHA already linked to this patient');

        const digits = String(abhaIdentifier || '').replace(/\D/g, '');
        if (digits.length !== 14) {
            throw httpError(400, 'Enter the 14-digit ABHA number (ABHA-address login is not supported yet)');
        }
        const abhaNumber = `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;

        const dup = await User.findOne({ hospitalId: patient.hospitalId, _id: { $ne: patient._id }, 'abdm.abhaNumber': abhaNumber });
        if (dup) throw httpError(409, 'This ABHA is already linked to another patient in this hospital');

        const viaAadhaar = String(authMethod).toUpperCase() !== 'MOBILE_OTP';
        const scope = viaAadhaar ? ['abha-login', 'aadhaar-verify'] : ['abha-login'];
        const r = await client.requestLoginOtp({
            loginHint: 'abha-number', loginId: abhaNumber, otpSystem: viaAadhaar ? 'aadhaar' : 'abdm', scope,
        });
        await this.bindTxn({ txnId: r.txnId, flow: 'LOGIN', hospitalId: patient.hospitalId, patientId: patient._id, userId, meta: { scope } });
        return { success: true, configured: true, txnId: r.txnId, authMode: authMethod, message: 'OTP sent by ABDM' };
    }

    async verifyLink(hospitalId, patientId, userId, { txnId, otp }) {
        if (!client.isConfigured()) return notConfigured();
        if (!txnId || !otp) throw httpError(400, 'txnId and otp are required');
        const patient = await this.getPatientForTenant(hospitalId, patientId);
        const t = await this.takeTxn({ txnId, flow: 'LOGIN', hospitalId: patient.hospitalId, patientId: patient._id, userId });

        const { profile } = await client.verifyLogin({ txnId, otp: String(otp).trim(), scope: (t.meta && t.meta.scope) || ['abha-login'] });
        if (!profile) throw httpError(502, 'ABDM did not return verified ABHA details');

        const abha = await this.persist(patient, profile);
        await AbdmTxn.deleteOne({ txnId: String(txnId), flow: 'LOGIN' });
        return { success: true, message: 'ABHA verified and linked', abha };
    }

    // ── shared ───────────────────────────────────────────────────────────────
    async persist(patient, profile) {
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

        if (abhaNumber) {
            const dup = await User.findOne({ hospitalId: patient.hospitalId, _id: { $ne: patient._id }, 'abdm.abhaNumber': abhaNumber });
            if (dup) throw httpError(409, 'ABHA already linked to another patient in this hospital');
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

        try {
            const tdb = await getTenantConnection(String(patient.hospitalId));
            const tm = getTenantModels(tdb);
            if (tm.User) await tm.User.findByIdAndUpdate(patient._id, { $set: { abdm: update } });
        } catch (err) {
            console.error('[ABHA] tenant DB sync failed:', err.message); // no PHI in the log
        }

        return {
            status: 'Verified', isVerified: true,
            maskedAbhaNumber: this.maskAbhaNumber(abhaNumber),
            maskedAbhaAddress: this.maskAbhaAddress(abhaAddress),
        };
    }
}

module.exports = new AbhaService();
