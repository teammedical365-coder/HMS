/**
 * duplicateDetector.js — Deterministic duplicate detection engine for migrations.
 *
 * Checks both:
 * 1. Intra-session duplicates (records within the current migration file/session)
 * 2. Existing Medical365 hospital database records (scoped strictly to hospitalId)
 *
 * Classifies into:
 * - EXACT_DUPLICATE
 * - POSSIBLE_DUPLICATE
 * - NO_MATCH
 *
 * RULE: In Phase 2, NEVER automatically merge records or alter production data.
 * The output is strictly diagnostic for human review.
 */

const mongoose = require('mongoose');

class DuplicateDetector {
    constructor(hospitalId, migrationId) {
        this.hospitalId = hospitalId;
        this.migrationId = migrationId;

        // In-memory sets to catch intra-session duplicates
        // entity -> Map(key -> stagingId)
        this.seenPatientsUhid = new Map();
        this.seenPatientsPhoneName = new Map();
        this.seenDoctorsId = new Map();
        this.seenDoctorsPhone = new Map();
        this.seenDepartmentsName = new Map();
        this.seenMedicinesName = new Map();
    }

    /**
     * Check if a patient is a duplicate against existing DB and current session.
     * @param {Object} transformed
     * @param {String} stagingId
     * @param {Object} models - Tenant models (e.g. User model)
     */
    async detectPatientDuplicate(transformed, stagingId, models = {}) {
        const name = (transformed.name || '').trim().toLowerCase();
        const phone = (transformed.phone || '').trim();
        const uhid = (transformed.uhid || '').trim().toLowerCase();
        const email = (transformed.email || '').trim().toLowerCase();
        const dob = (transformed.dob || '').trim();
        const aadhaar = (transformed.aadhaarNumber || '').trim();

        const matchedFields = [];

        // 1. Check intra-session duplicate first
        if (uhid && this.seenPatientsUhid.has(uhid)) {
            const prevStagingId = this.seenPatientsUhid.get(uhid);
            return {
                matchType: 'EXACT_DUPLICATE',
                matchedRecordId: prevStagingId,
                matchedRecordSummary: `Duplicate UHID '${uhid}' found in row staged as ${prevStagingId}`,
                matchedFields: ['uhid'],
                resolution: 'PENDING'
            };
        }

        const phoneNameKey = `${phone}_${name}`;
        if (phone && name && this.seenPatientsPhoneName.has(phoneNameKey)) {
            const prevStagingId = this.seenPatientsPhoneName.get(phoneNameKey);
            return {
                matchType: 'EXACT_DUPLICATE',
                matchedRecordId: prevStagingId,
                matchedRecordSummary: `Duplicate Patient with phone ${phone} and name '${transformed.name}' in staging ${prevStagingId}`,
                matchedFields: ['phone', 'name'],
                resolution: 'PENDING'
            };
        }

        // Register in session cache
        if (uhid) this.seenPatientsUhid.set(uhid, stagingId);
        if (phone && name) this.seenPatientsPhoneName.set(phoneNameKey, stagingId);

        // 2. Check existing Medical365 database (User collection where hospitalId matches)
        const UserModel = models.User || mongoose.models.User;
        if (!UserModel || !this.hospitalId) {
            return { matchType: 'NO_MATCH', matchedFields: [], resolution: 'PENDING' };
        }

        try {
            // Check UHID match
            if (uhid) {
                const existing = await UserModel.findOne({
                    hospitalId: this.hospitalId,
                    $or: [
                        { uhid: new RegExp(`^${uhid}$`, 'i') },
                        { patientId: new RegExp(`^${uhid}$`, 'i') }
                    ]
                }).lean();

                if (existing) {
                    matchedFields.push('uhid');
                    return {
                        matchType: 'EXACT_DUPLICATE',
                        matchedRecordId: String(existing._id),
                        matchedRecordSummary: `Existing Patient: ${existing.name || ''} (UHID: ${existing.uhid || existing.patientId || 'N/A'}, Phone: ${existing.phone || 'N/A'})`,
                        matchedFields,
                        resolution: 'PENDING'
                    };
                }
            }

            // Check Aadhaar match
            if (aadhaar) {
                const existing = await UserModel.findOne({
                    hospitalId: this.hospitalId,
                    aadhaarNumber: aadhaar
                }).lean();

                if (existing) {
                    matchedFields.push('aadhaarNumber');
                    return {
                        matchType: 'EXACT_DUPLICATE',
                        matchedRecordId: String(existing._id),
                        matchedRecordSummary: `Existing Patient: ${existing.name || ''} (Aadhaar: ${aadhaar})`,
                        matchedFields,
                        resolution: 'PENDING'
                    };
                }
            }

            // Check Phone + Name match
            if (phone) {
                const existingByPhone = await UserModel.find({
                    hospitalId: this.hospitalId,
                    phone
                }).lean();

                if (existingByPhone.length > 0) {
                    matchedFields.push('phone');
                    for (const cand of existingByPhone) {
                        const candName = (cand.name || '').toLowerCase();
                        if (candName === name) {
                            matchedFields.push('name');
                            if (dob && cand.dob === dob) matchedFields.push('dob');
                            return {
                                matchType: 'EXACT_DUPLICATE',
                                matchedRecordId: String(cand._id),
                                matchedRecordSummary: `Existing Patient: ${cand.name} (Phone: ${cand.phone}, DOB: ${cand.dob || 'N/A'})`,
                                matchedFields,
                                resolution: 'PENDING'
                            };
                        }
                    }

                    // Phone matched but name differed -> POSSIBLE_DUPLICATE
                    const cand = existingByPhone[0];
                    return {
                        matchType: 'POSSIBLE_DUPLICATE',
                        matchedRecordId: String(cand._id),
                        matchedRecordSummary: `Existing Patient with same phone (${phone}): ${cand.name}`,
                        matchedFields: ['phone'],
                        resolution: 'PENDING'
                    };
                }
            }

            // Check Email match
            if (email) {
                const existingByEmail = await UserModel.findOne({
                    hospitalId: this.hospitalId,
                    email
                }).lean();

                if (existingByEmail) {
                    return {
                        matchType: 'POSSIBLE_DUPLICATE',
                        matchedRecordId: String(existingByEmail._id),
                        matchedRecordSummary: `Existing Patient with same email (${email}): ${existingByEmail.name}`,
                        matchedFields: ['email'],
                        resolution: 'PENDING'
                    };
                }
            }
        } catch (err) {
            console.error('[DuplicateDetector] Database check error:', err.message);
        }

        return {
            matchType: 'NO_MATCH',
            matchedRecordId: null,
            matchedRecordSummary: '',
            matchedFields: [],
            resolution: 'PENDING'
        };
    }

    /**
     * Check if a doctor is a duplicate.
     */
    async detectDoctorDuplicate(transformed, stagingId, models = {}) {
        const doctorId = (transformed.doctorId || '').trim().toLowerCase();
        const email = (transformed.email || '').trim().toLowerCase();
        const phone = (transformed.phone || '').trim();

        // Intra-session check
        if (doctorId && this.seenDoctorsId.has(doctorId)) {
            return {
                matchType: 'EXACT_DUPLICATE',
                matchedRecordId: this.seenDoctorsId.get(doctorId),
                matchedRecordSummary: `Duplicate Doctor ID '${doctorId}' in staging`,
                matchedFields: ['doctorId'],
                resolution: 'PENDING'
            };
        }
        if (phone && this.seenDoctorsPhone.has(phone)) {
            return {
                matchType: 'EXACT_DUPLICATE',
                matchedRecordId: this.seenDoctorsPhone.get(phone),
                matchedRecordSummary: `Duplicate Doctor Phone '${phone}' in staging`,
                matchedFields: ['phone'],
                resolution: 'PENDING'
            };
        }

        if (doctorId) this.seenDoctorsId.set(doctorId, stagingId);
        if (phone) this.seenDoctorsPhone.set(phone, stagingId);

        // Database check
        const DoctorModel = models.Doctor || mongoose.models.Doctor;
        if (!DoctorModel || !this.hospitalId) {
            return { matchType: 'NO_MATCH', matchedFields: [], resolution: 'PENDING' };
        }

        try {
            const query = [];
            if (doctorId) query.push({ doctorId: new RegExp(`^${doctorId}$`, 'i') });
            if (email) query.push({ email: new RegExp(`^${email}$`, 'i') });
            if (phone) query.push({ phone });

            if (query.length > 0) {
                const existing = await DoctorModel.findOne({
                    hospitalId: this.hospitalId,
                    $or: query
                }).lean();

                if (existing) {
                    const matchedFields = [];
                    if (existing.doctorId && existing.doctorId.toLowerCase() === doctorId) matchedFields.push('doctorId');
                    if (existing.email && existing.email.toLowerCase() === email) matchedFields.push('email');
                    if (existing.phone === phone) matchedFields.push('phone');

                    return {
                        matchType: matchedFields.length >= 2 || matchedFields.includes('doctorId') ? 'EXACT_DUPLICATE' : 'POSSIBLE_DUPLICATE',
                        matchedRecordId: String(existing._id),
                        matchedRecordSummary: `Existing Doctor: Dr. ${existing.name} (${existing.specialty || ''}, Phone: ${existing.phone})`,
                        matchedFields,
                        resolution: 'PENDING'
                    };
                }
            }
        } catch (err) {
            console.error('[DuplicateDetector] Doctor DB check error:', err.message);
        }

        return { matchType: 'NO_MATCH', matchedFields: [], resolution: 'PENDING' };
    }

    /**
     * Dispatch duplicate detection based on entity.
     */
    async detectDuplicate(entity, transformedData, stagingId, models = {}) {
        if (entity === 'Patient') {
            return this.detectPatientDuplicate(transformedData, stagingId, models);
        }
        if (entity === 'Doctor') {
            return this.detectDoctorDuplicate(transformedData, stagingId, models);
        }
        return {
            matchType: 'NO_MATCH',
            matchedRecordId: null,
            matchedRecordSummary: '',
            matchedFields: [],
            resolution: 'PENDING'
        };
    }
}

module.exports = { DuplicateDetector };
