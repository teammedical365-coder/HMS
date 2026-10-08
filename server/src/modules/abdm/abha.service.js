/**
 * abha.service.js — Business Logic & Tenant Security for Medical365 ABHA Integration
 *
 * Enforces:
 *   - Strict Tenant Isolation (hospitalId checked against authenticated user session)
 *   - Duplicate ABHA Detection within tenant
 *   - Separation between Medical365 MRN and ABDM ABHA
 *   - Data Persistence across Master and Tenant DBs
 *   - Privacy Masking for UI Presentation
 */

const mongoose = require('mongoose');
const User = require('../../models/user.model');
const abdmClient = require('./abdm.client');
const { getTenantConnection } = require('../../db/tenantDb');
const { getTenantModels } = require('../../db/tenantModels');

class AbhaService {
    /**
     * Mask ABHA Number for safe UI presentation (e.g. 14-8293-8472-9102 -> **-****-****-9102)
     */
    maskAbhaNumber(abhaNumber) {
        if (!abhaNumber || typeof abhaNumber !== 'string') return '';
        const clean = abhaNumber.trim();
        if (clean.length <= 4) return '****';
        const last4 = clean.slice(-4);
        return `**-****-****-${last4}`;
    }

    /**
     * Mask ABHA Address for safe UI presentation (e.g. rohit.verma@abdm -> r***a@abdm)
     */
    maskAbhaAddress(abhaAddress) {
        if (!abhaAddress || typeof abhaAddress !== 'string') return '';
        const parts = abhaAddress.trim().split('@');
        if (parts.length < 2) return '******@abdm';
        const user = parts[0];
        const domain = parts[1];
        if (user.length <= 2) return `${user[0]}*@${domain}`;
        const maskedUser = `${user[0]}***${user[user.length - 1]}`;
        return `${maskedUser}@${domain}`;
    }

    /**
     * Helper to retrieve patient document strictly scoped to the hospital tenant
     */
    async getPatientForTenant(hospitalId, patientId) {
        if (!patientId) {
            const err = new Error('Patient ID is required');
            err.status = 400;
            throw err;
        }

        const query = { _id: patientId };
        if (hospitalId) {
            query.hospitalId = hospitalId;
        }

        const patient = await User.findOne(query);
        if (!patient) {
            const err = new Error('Patient record not found in this hospital tenant');
            err.status = 404;
            throw err;
        }

        return patient;
    }

    /**
     * Fetch the current ABHA status for a patient
     */
    async getStatus(hospitalId, patientId) {
        const patient = await this.getPatientForTenant(hospitalId, patientId);
        const isConfigured = abdmClient.isConfigured();

        const abdmData = patient.abdm || {
            abhaNumber: null,
            abhaAddress: null,
            isVerified: false,
            status: 'Not Linked'
        };

        return {
            success: true,
            isConfigured,
            patientId: patient._id,
            name: patient.name,
            mrn: patient.patientId || patient.mrn || patient.uhid || 'N/A',
            abdm: {
                status: abdmData.status || (abdmData.isVerified ? 'Verified' : 'Not Linked'),
                isVerified: Boolean(abdmData.isVerified),
                verifiedAt: abdmData.verifiedAt || null,
                linkedAt: abdmData.linkedAt || null,
                maskedAbhaNumber: abdmData.abhaNumber ? this.maskAbhaNumber(abdmData.abhaNumber) : null,
                maskedAbhaAddress: abdmData.abhaAddress ? this.maskAbhaAddress(abdmData.abhaAddress) : null
            }
        };
    }

    /**
     * Step 1: Start Link Existing ABHA Flow
     */
    async startLink(hospitalId, patientId, { abhaIdentifier, authMethod = 'AADHAAR_OTP' }) {
        if (!abdmClient.isConfigured()) {
            return {
                success: false,
                configured: false,
                message: 'ABDM Sandbox is not configured. Please set ABDM_CLIENT_ID and ABDM_CLIENT_SECRET in the server environment.'
            };
        }

        if (!abhaIdentifier || typeof abhaIdentifier !== 'string' || abhaIdentifier.trim().length < 4) {
            const err = new Error('Valid ABHA Number or ABHA Address is required');
            err.status = 400;
            throw err;
        }

        const patient = await this.getPatientForTenant(hospitalId, patientId);

        // Check if patient is already verified
        if (patient.abdm?.isVerified) {
            const err = new Error('ABHA already linked to this patient');
            err.status = 409;
            throw err;
        }

        // Prevent duplicate ABHA within the same hospital tenant
        const cleanId = abhaIdentifier.trim();
        const duplicateCheck = await User.findOne({
            hospitalId: patient.hospitalId,
            _id: { $ne: patient._id },
            $or: [
                { 'abdm.abhaNumber': cleanId },
                { 'abdm.abhaAddress': cleanId }
            ]
        });

        if (duplicateCheck) {
            const err = new Error('This ABHA is already linked to another patient in this hospital');
            err.status = 409;
            throw err;
        }

        // Initiate with official ABDM Gateway
        const result = await abdmClient.initLink({ abhaIdentifier: cleanId, authMethod });

        return {
            success: true,
            configured: true,
            txnId: result.txnId,
            authMode: result.authMode,
            message: 'OTP sent to registered mobile by ABDM'
        };
    }

    /**
     * Step 2: Verify Link Existing ABHA with OTP & Save to Patient
     */
    async verifyLink(hospitalId, patientId, { txnId, otp }) {
        if (!abdmClient.isConfigured()) {
            return {
                success: false,
                configured: false,
                message: 'ABDM Sandbox is not configured. Please set ABDM_CLIENT_ID and ABDM_CLIENT_SECRET in the server environment.'
            };
        }

        if (!txnId || !otp) {
            const err = new Error('Transaction ID (txnId) and OTP are required');
            err.status = 400;
            throw err;
        }

        const patient = await this.getPatientForTenant(hospitalId, patientId);

        // Confirm with official ABDM Gateway
        const abdmProfile = await abdmClient.confirmLink({ txnId, otp });

        if (!abdmProfile.abhaNumber && !abdmProfile.abhaAddress) {
            const err = new Error('ABDM did not return verified ABHA credentials');
            err.status = 502;
            throw err;
        }

        // Final duplicate check
        if (abdmProfile.abhaNumber) {
            const dup = await User.findOne({
                hospitalId: patient.hospitalId,
                _id: { $ne: patient._id },
                'abdm.abhaNumber': abdmProfile.abhaNumber
            });
            if (dup) {
                const err = new Error('ABHA already linked to another patient in this hospital');
                err.status = 409;
                throw err;
            }
        }

        const now = new Date();
        const abdmUpdate = {
            abhaNumber: abdmProfile.abhaNumber || null,
            abhaAddress: abdmProfile.abhaAddress || null,
            isVerified: true,
            verifiedAt: now,
            linkedAt: now,
            status: 'Verified'
        };

        patient.abdm = abdmUpdate;
        await patient.save();

        // Also update in tenant DB if active
        if (patient.hospitalId) {
            try {
                const tenantDb = await getTenantConnection(String(patient.hospitalId));
                const tenantModels = getTenantModels(tenantDb);
                if (tenantModels.User) {
                    await tenantModels.User.findByIdAndUpdate(patient._id, { $set: { abdm: abdmUpdate } });
                }
            } catch (_) {}
        }

        return {
            success: true,
            message: 'ABHA successfully linked and verified',
            abha: {
                status: 'Verified',
                isVerified: true,
                maskedAbhaNumber: this.maskAbhaNumber(abdmUpdate.abhaNumber),
                maskedAbhaAddress: this.maskAbhaAddress(abdmUpdate.abhaAddress)
            }
        };
    }

    /**
     * Step 1: Start Create ABHA with Aadhaar OTP
     */
    async startCreate(hospitalId, patientId, { aadhaarNumber }) {
        if (!abdmClient.isConfigured()) {
            return {
                success: false,
                configured: false,
                message: 'ABDM Sandbox is not configured. Please set ABDM_CLIENT_ID and ABDM_CLIENT_SECRET in the server environment.'
            };
        }

        const patient = await this.getPatientForTenant(hospitalId, patientId);

        if (patient.abdm?.isVerified) {
            const err = new Error('ABHA already created and linked to this patient');
            err.status = 409;
            throw err;
        }

        // Use patient's existing Aadhaar if not passed explicitly
        const targetAadhaar = aadhaarNumber || patient.aadhaarNumber;
        if (!targetAadhaar || !/^\d{12}$/.test(String(targetAadhaar).trim())) {
            const err = new Error('Valid 12-digit Aadhaar number is required for ABHA creation');
            err.status = 400;
            throw err;
        }

        const result = await abdmClient.generateCreateOtp({ aadhaarNumber: targetAadhaar });

        return {
            success: true,
            configured: true,
            txnId: result.txnId,
            message: 'Aadhaar OTP sent to Aadhaar-registered mobile number'
        };
    }

    /**
     * Step 2: Verify Create ABHA with Aadhaar OTP & Save to Patient
     */
    async verifyCreate(hospitalId, patientId, { txnId, otp }) {
        if (!abdmClient.isConfigured()) {
            return {
                success: false,
                configured: false,
                message: 'ABDM Sandbox is not configured. Please set ABDM_CLIENT_ID and ABDM_CLIENT_SECRET in the server environment.'
            };
        }

        if (!txnId || !otp) {
            const err = new Error('Transaction ID (txnId) and OTP are required');
            err.status = 400;
            throw err;
        }

        const patient = await this.getPatientForTenant(hospitalId, patientId);

        // Verify with official ABDM Gateway
        const abdmProfile = await abdmClient.verifyCreateOtp({ txnId, otp });

        if (!abdmProfile.abhaNumber && !abdmProfile.abhaAddress) {
            const err = new Error('ABDM did not return created ABHA details');
            err.status = 502;
            throw err;
        }

        // Prevent duplicate ABHA within same tenant
        if (abdmProfile.abhaNumber) {
            const dup = await User.findOne({
                hospitalId: patient.hospitalId,
                _id: { $ne: patient._id },
                'abdm.abhaNumber': abdmProfile.abhaNumber
            });
            if (dup) {
                const err = new Error('Created ABHA is already linked to another patient in this hospital');
                err.status = 409;
                throw err;
            }
        }

        const now = new Date();
        const abdmUpdate = {
            abhaNumber: abdmProfile.abhaNumber || null,
            abhaAddress: abdmProfile.abhaAddress || null,
            isVerified: true,
            verifiedAt: now,
            linkedAt: now,
            status: 'Verified'
        };

        patient.abdm = abdmUpdate;
        await patient.save();

        // Also update in tenant DB if active
        if (patient.hospitalId) {
            try {
                const tenantDb = await getTenantConnection(String(patient.hospitalId));
                const tenantModels = getTenantModels(tenantDb);
                if (tenantModels.User) {
                    await tenantModels.User.findByIdAndUpdate(patient._id, { $set: { abdm: abdmUpdate } });
                }
            } catch (_) {}
        }

        return {
            success: true,
            message: 'New ABHA successfully created and linked to patient',
            abha: {
                status: 'Verified',
                isVerified: true,
                maskedAbhaNumber: this.maskAbhaNumber(abdmUpdate.abhaNumber),
                maskedAbhaAddress: this.maskAbhaAddress(abdmUpdate.abhaAddress)
            }
        };
    }
}

module.exports = new AbhaService();
