'use strict';
/**
 * hip.service.js - Medical365 as an ABDM HIP (Milestone 2): linking, discovery, consent.
 *
 * Inbound handlers (called by the inbox processor) all follow:
 *    resolve tenant by HIP ID -> do the work -> send the matching on-* reply
 *    with response.requestId = the callback's REQUEST-ID header.
 *
 * IMPORTANT: payload field names below follow the V3 samples published by ABDM/NHA and
 * integrator guides. VERIFY every request/reply shape against the current sandbox swagger.
 * Data push (Fidelius + FHIR) is intentionally NOT here: see INTEGRATION.md.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const User = require('../../models/user.model');
const Hospital = require('../../models/hospital.model');
const AbdmTxn = require('../../models/abdmTxn.model');
const AbdmCareContext = require('../../models/abdmCareContext.model');
const AbdmLinkToken = require('../../models/abdmLinkToken.model');
const AbdmConsent = require('../../models/abdmConsent.model');
const client = require('./abdm.client');
const config = require('./abdm.config');

const { HI_TYPES } = AbdmCareContext;

// Error codes used in on-* error replies. VERIFY against ABDM's error catalogue.
const ERR = {
    NOT_FOUND: { code: 1000, message: 'No matching patient found' },
    NO_RECORDS: { code: 1001, message: 'No care contexts available for this patient' },
    BAD_OTP: { code: 1002, message: 'Invalid or expired OTP' },
    NOT_ENABLED: { code: 1003, message: 'Health information transfer is not enabled at this facility yet' },
    INTERNAL: { code: 1999, message: 'Unable to process request' },
};

// ── small helpers ────────────────────────────────────────────────────────────
const last10 = (s) => String(s || '').replace(/\D/g, '').slice(-10);
const norm = (s) => String(s || '').toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|shri|smt)\.?\s/g, '')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const yearOf = (dob) => { const m = String(dob || '').match(/(19|20)\d{2}/); return m ? Number(m[0]) : null; };
const g1 = (g) => (g ? String(g).trim()[0].toUpperCase() : null);
const sha = (txnId, otp) => crypto.createHash('sha256').update(`${txnId}:${otp}`).digest('hex');
const patientRef = (p) => p.patientId || String(p._id);

async function findPatientByRef(hospitalId, ref) {
    const or = [{ patientId: String(ref) }];
    if (mongoose.isValidObjectId(String(ref))) or.push({ _id: String(ref) });
    return User.findOne({ hospitalId, $or: or });
}

function reply(hipId, path, requestId, body) {
    return client.reply(path, { response: { requestId }, ...body }, { hipId });
}

// ── pluggable SMS (wire your provider once) ──────────────────────────────────
let smsSender = null;
/** setSmsSender(async (phone10, text) => {...}) */
function setSmsSender(fn) { smsSender = fn; }

async function sendLinkOtp(phone, otp) {
    if (smsSender) return smsSender(last10(phone), `Your Medical365 record-linking OTP is ${otp}. Valid for 10 minutes.`);
    if (config.sandboxFixedOtp) return undefined; // sandbox only
    throw new Error('SMS provider not configured for ABDM linking (call setSmsSender)');
}

// ═════════════════════════════════════════════════════════════════════════════
// INBOUND
// ═════════════════════════════════════════════════════════════════════════════

/** Callback: link token issued after generate-token */
async function onLinkToken({ body }) {
    const corr = body.response && body.response.requestId;
    const token = body.linkToken || body.token;
    const abhaAddress = body.abhaAddress || null;

    let doc = corr ? await AbdmLinkToken.findOne({ requestId: corr }) : null;
    if (!doc && abhaAddress) doc = await AbdmLinkToken.findOne({ abhaAddress, status: 'PENDING' });
    if (!doc) return { result: 'NO_PENDING_TOKEN' };

    if (!token || body.error) {
        await AbdmLinkToken.updateOne({ _id: doc._id }, { $set: { status: 'FAILED', error: String((body.error && body.error.message) || 'No token returned').slice(0, 300) } });
        return { result: 'TOKEN_FAILED' };
    }
    await AbdmLinkToken.updateOne({ _id: doc._id }, { $set: { token, status: 'READY', error: null } });

    // token arrived: now link everything waiting for this patient
    await linkPendingForPatient({ hospitalId: doc.hospitalId, patientId: doc.patientId });
    return { result: 'TOKEN_READY' };
}

/** Callback: patient searched for records at this facility (V3 is async: answer via on-discover) */
async function onDiscover({ hospital, hipId, requestId, body }) {
    const p = body.patient || {};
    const txn = body.transactionId;

    const verified = Array.isArray(p.verifiedIdentifiers) ? p.verifiedIdentifiers : [];
    const mobiles = verified.filter((i) => /mobile/i.test(String(i.type))).map((i) => last10(i.value)).filter(Boolean);
    const abhaAddress = String(p.id || '').trim().toLowerCase();

    // 1) STRONG identifier required
    const or = [];
    if (mobiles.length) or.push({ phone: { $in: mobiles } });
    if (abhaAddress) or.push({ 'abdm.abhaAddress': abhaAddress });
    if (!or.length) {
        await reply(hipId, config.paths.onDiscover, requestId, { transactionId: txn, error: ERR.NOT_FOUND });
        return { match: 'NO_STRONG_IDENTIFIER' };
    }

    const candidates = await User.find({ hospitalId: hospital._id, $or: or }).select('name phone gender dob patientId abdm').lean();

    // 2) WEAK identifiers must agree (name, gender, year of birth)
    const wantName = norm(p.name);
    const wantGender = g1(p.gender);
    const wantYob = Number(p.yearOfBirth) || null;
    const matches = candidates.filter((c) => {
        const n = norm(c.name);
        const nameOk = !wantName || n === wantName || n.includes(wantName) || wantName.includes(n);
        const gOk = !wantGender || !c.gender || g1(c.gender) === wantGender;
        const y = yearOf(c.dob);
        const yOk = !wantYob || !y || y === wantYob;
        return nameOk && gOk && yOk;
    });

    // 3) NEVER guess between two patients
    if (matches.length !== 1) {
        await reply(hipId, config.paths.onDiscover, requestId, { transactionId: txn, error: ERR.NOT_FOUND });
        return { match: matches.length === 0 ? 'NO_MATCH' : 'DUPLICATE' };
    }
    const m = matches[0];

    // 4) only THIS facility's not-yet-linked care contexts
    const ccs = await AbdmCareContext.find({ hospitalId: hospital._id, patientId: m._id, status: 'CREATED' }).lean();
    if (!ccs.length) {
        await reply(hipId, config.paths.onDiscover, requestId, { transactionId: txn, error: ERR.NO_RECORDS });
        return { match: 'MATCHED_NO_RECORDS' };
    }

    const byType = {};
    ccs.forEach((c) => { (byType[c.hiType] = byType[c.hiType] || []).push({ referenceNumber: c.referenceNumber, display: c.display }); });
    const patient = Object.entries(byType).map(([hiType, careContexts]) => ({
        referenceNumber: patientRef(m),
        display: m.name,
        careContexts,
        hiType,
        count: careContexts.length,
    }));

    await reply(hipId, config.paths.onDiscover, requestId, {
        transactionId: txn,
        patient,
        matchedBy: mobiles.length ? ['MOBILE'] : ['ABHA_ADDRESS'],
    });
    return { match: 'MATCHED', careContexts: ccs.length };
}

/** Callback: patient tapped "Link" -> send OTP, reply on-init */
async function onLinkInit({ hospital, hipId, requestId, body }) {
    const pr = body.patient || {};
    const abdmTxnId = body.transactionId;
    const refs = (Array.isArray(pr.careContexts) ? pr.careContexts : []).map((c) => String(c.referenceNumber));

    const patient = await findPatientByRef(hospital._id, pr.referenceNumber);
    const owned = patient && refs.length
        ? await AbdmCareContext.countDocuments({ hospitalId: hospital._id, patientId: patient._id, referenceNumber: { $in: refs }, status: 'CREATED' })
        : 0;
    if (!patient || owned !== refs.length) {
        await reply(hipId, config.paths.onLinkInit, requestId, { transactionId: abdmTxnId, error: ERR.NOT_FOUND });
        return { result: 'NOT_FOUND' };
    }

    const linkRef = uuidv4();
    const otp = config.sandboxFixedOtp || String(crypto.randomInt(100000, 1000000));
    await sendLinkOtp(patient.phone, otp);

    await AbdmTxn.create({
        txnId: linkRef, flow: 'LINK', hospitalId: hospital._id, patientId: patient._id,
        otpHash: sha(linkRef, otp),
        meta: { careContexts: refs, abdmTransactionId: abdmTxnId, abhaAddress: String(pr.id || '').toLowerCase() || null, expiresAt: Date.now() + 10 * 60 * 1000 },
    });

    await reply(hipId, config.paths.onLinkInit, requestId, {
        transactionId: abdmTxnId,
        link: {
            referenceNumber: linkRef,
            authenticationType: 'DIRECT',
            meta: {
                communicationMedium: 'MOBILE',
                communicationHint: `XXXXXX${last10(patient.phone).slice(-4)}`,
                communicationExpiry: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            },
        },
    });
    return { result: 'OTP_SENT' };
}

/** Callback: patient entered the OTP -> verify, mark LINKED, reply on-confirm */
async function onLinkConfirm({ hospital, hipId, requestId, body }) {
    const c = body.confirmation || {};
    const linkRef = String(c.linkRefNumber || '');
    const otp = String(c.token || '').trim();

    const txn = linkRef ? await AbdmTxn.findOne({ txnId: linkRef, flow: 'LINK', hospitalId: hospital._id }) : null;
    const expired = !txn || (txn.meta && txn.meta.expiresAt && Date.now() > txn.meta.expiresAt);
    if (expired || txn.attempts >= 5) {
        await reply(hipId, config.paths.onLinkConfirm, requestId, { error: ERR.BAD_OTP });
        return { result: expired ? 'EXPIRED' : 'LOCKED' };
    }

    const a = Buffer.from(sha(linkRef, otp));
    const b = Buffer.from(txn.otpHash);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
        await AbdmTxn.updateOne({ _id: txn._id }, { $inc: { attempts: 1 } });
        await reply(hipId, config.paths.onLinkConfirm, requestId, { error: ERR.BAD_OTP });
        return { result: 'BAD_OTP' };
    }

    const refs = txn.meta.careContexts || [];
    await AbdmCareContext.updateMany(
        { hospitalId: hospital._id, patientId: txn.patientId, referenceNumber: { $in: refs } },
        { $set: { status: 'LINKED', linkedAt: new Date(), abhaAddress: txn.meta.abhaAddress || null, error: null } }
    );
    const patient = await User.findById(txn.patientId).select('name patientId').lean();
    const ccs = await AbdmCareContext.find({ hospitalId: hospital._id, referenceNumber: { $in: refs } }).select('referenceNumber display').lean();

    await reply(hipId, config.paths.onLinkConfirm, requestId, {
        patient: {
            referenceNumber: patientRef({ patientId: patient && patient.patientId, _id: txn.patientId }),
            display: patient ? patient.name : '',
            careContexts: ccs.map((x) => ({ referenceNumber: x.referenceNumber, display: x.display })),
        },
    });
    await AbdmTxn.deleteOne({ _id: txn._id });
    return { result: 'LINKED', careContexts: refs.length };
}

/** Callback: consent granted / revoked / expired */
async function onConsentNotify({ hospital, hipId, requestId, body }) {
    const n = body.notification || {};
    const consentId = n.consentId || (n.consentDetail && n.consentDetail.consentId);
    if (!consentId) throw new Error('Consent notification without consentId');

    await AbdmConsent.findOneAndUpdate(
        { hospitalId: hospital._id, consentId: String(consentId) },
        {
            $set: {
                status: String(n.status || 'UNKNOWN').toUpperCase(),
                patientAbhaAddress: (n.consentDetail && n.consentDetail.patient && n.consentDetail.patient.id) || null,
                detail: n.consentDetail || {},
                lastNotifiedAt: new Date(),
            },
        },
        { upsert: true }
    );

    await reply(hipId, config.paths.onConsentNotify, requestId, { acknowledgement: { status: 'OK', consentId: String(consentId) } });
    return { result: 'CONSENT_STORED', status: n.status || null };
}

/** Callback: HIU asks for data. Fidelius + FHIR push is a separate module (not built here). */
async function onHealthInfoRequest({ hipId, requestId, body }) {
    if (!config.dataPushEnabled) {
        // Be honest to the network: do not ACK a transfer we cannot complete.
        await reply(hipId, config.paths.onHealthInfoRequest, requestId, {
            hiRequest: { transactionId: body.transactionId || null },
            error: ERR.NOT_ENABLED,
        });
        return { result: 'REJECTED_DATAPUSH_DISABLED' };
    }
    // TODO (next module): validate consent, build NRCeS FHIR bundles, Fidelius-encrypt, push, notify.
    throw new Error('ABDM_DATAPUSH_ENABLED=true but the data push module is not installed');
}

/** Callback: patient deactivated their ABHA -> remove linkage, keep clinical data */
async function onAbhaDeactivate({ hospital, body }) {
    const address = String(body.abhaAddress || '').toLowerCase();
    const number = String(body.abhaNumber || '').trim();
    const or = [];
    if (address) or.push({ 'abdm.abhaAddress': address });
    if (number) or.push({ 'abdm.abhaNumber': number });
    if (!or.length) return { result: 'NO_IDENTIFIER' };

    const patients = await User.find({ hospitalId: hospital._id, $or: or }).select('_id').lean();
    const ids = patients.map((p) => p._id);
    if (!ids.length) return { result: 'NO_PATIENT' };

    await User.updateMany({ _id: { $in: ids } }, { $set: { 'abdm.isVerified': false, 'abdm.status': 'Not Linked' } });
    await AbdmLinkToken.deleteMany({ hospitalId: hospital._id, patientId: { $in: ids } });
    await AbdmCareContext.updateMany({ hospitalId: hospital._id, patientId: { $in: ids } }, { $set: { status: 'CREATED', linkedAt: null, abhaAddress: null } });
    return { result: 'DEACTIVATED', patients: ids.length };
}

/** Callback: result of our HIP-initiated carecontext link call */
async function onCareContextLinked({ body }) {
    const corr = body.response && body.response.requestId;
    if (!corr) return { result: 'NO_CORRELATION' };
    const ok = !body.error && (!body.acknowledgement || /success|ok/i.test(String(body.acknowledgement.status || 'ok')));
    const upd = ok
        ? { status: 'LINKED', linkedAt: new Date(), error: null }
        : { status: 'FAILED', error: String((body.error && body.error.message) || 'Link failed').slice(0, 300) };
    const r = await AbdmCareContext.updateMany({ lastRequestId: corr }, { $set: upd });
    return { result: ok ? 'LINKED' : 'FAILED', updated: r.modifiedCount };
}

// ═════════════════════════════════════════════════════════════════════════════
// OUTBOUND (call these from your clinical code)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Register an encounter/document as a care context (idempotent per source record).
 * Call after an OPD visit, prescription, lab report, discharge or bill is FINALISED.
 */
async function createCareContext({ hospitalId, patientId, hiType, sourceModel, sourceId, display, visitDate }) {
    if (!HI_TYPES.includes(hiType)) throw new Error(`Unsupported hiType: ${hiType}`);
    const prefix = { OPConsultation: 'OPD', Prescription: 'RX', DiagnosticReport: 'LAB', DischargeSummary: 'DS', ImmunizationRecord: 'IMM', WellnessRecord: 'WEL', HealthDocumentRecord: 'DOC', Invoice: 'INV' }[hiType];
    const referenceNumber = `${prefix}-${String(sourceId)}`;
    return AbdmCareContext.findOneAndUpdate(
        { hospitalId, referenceNumber },
        { $setOnInsert: { hospitalId, patientId, referenceNumber, display, hiType, sourceModel: sourceModel || null, sourceId: String(sourceId), visitDate: visitDate || new Date(), status: 'CREATED' } },
        { upsert: true, new: true }
    );
}

/** Ensure a link token exists (requesting one if needed), then link pending care contexts. */
async function requestLinking({ hospitalId, patientId }) {
    const hospital = await Hospital.findById(hospitalId).select('_id abdm').lean();
    if (!hospital || !hospital.abdm || !hospital.abdm.enabled || !hospital.abdm.hipId) {
        const e = new Error('ABDM is not enabled for this hospital'); e.status = 409; throw e;
    }
    const patient = await User.findOne({ _id: patientId, hospitalId }).select('abdm').lean();
    if (!patient || !patient.abdm || !patient.abdm.isVerified || !patient.abdm.abhaAddress) {
        const e = new Error('Patient has no verified ABHA'); e.status = 409; throw e;
    }

    const tok = await AbdmLinkToken.findOne({ hospitalId, patientId });
    if (tok && tok.status === 'READY' && tok.token) {
        await linkPendingForPatient({ hospitalId, patientId });
        return { status: 'LINKING' };
    }
    if (tok && tok.status === 'PENDING') return { status: 'TOKEN_PENDING' };

    const a = patient.abdm;
    if (!a.abhaNumber || !a.abhaName || !a.abhaGender || !a.abhaYearOfBirth) {
        const e = new Error('ABHA profile incomplete (name/gender/year of birth). Re-verify the ABHA first.'); e.status = 409; throw e;
    }
    const { requestId } = await client.generateLinkToken({
        hipId: hospital.abdm.hipId,
        abhaNumber: Number(String(a.abhaNumber).replace(/\D/g, '')),
        abhaAddress: a.abhaAddress,
        name: a.abhaName,            // MUST match Aadhaar exactly, including middle name
        gender: a.abhaGender,
        yearOfBirth: Number(a.abhaYearOfBirth),
    });
    await AbdmLinkToken.findOneAndUpdate(
        { hospitalId, patientId },
        { $set: { abhaAddress: a.abhaAddress, requestId, status: 'PENDING', token: null, error: null } },
        { upsert: true }
    );
    return { status: 'TOKEN_REQUESTED' };
}

/** Link each CREATED care context, ONE PER CALL (batched calls have been seen to lose records). */
async function linkPendingForPatient({ hospitalId, patientId }) {
    const hospital = await Hospital.findById(hospitalId).select('_id abdm').lean();
    const tok = await AbdmLinkToken.findOne({ hospitalId, patientId, status: 'READY' });
    const patient = await User.findOne({ _id: patientId, hospitalId }).select('name patientId abdm').lean();
    if (!hospital || !tok || !patient || !patient.abdm) return { linked: 0 };

    const ccs = await AbdmCareContext.find({ hospitalId, patientId, status: 'CREATED' }).limit(20);
    let requested = 0;
    for (const cc of ccs) {
        try {
            const { requestId } = await client.linkCareContext({
                hipId: hospital.abdm.hipId,
                linkToken: tok.token,
                body: {
                    abhaNumber: Number(String(patient.abdm.abhaNumber).replace(/\D/g, '')),
                    abhaAddress: patient.abdm.abhaAddress,
                    patient: [{
                        referenceNumber: patientRef(patient),
                        display: patient.name,
                        careContexts: [{ referenceNumber: cc.referenceNumber, display: cc.display }],
                        hiType: cc.hiType,
                        count: 1,
                    }],
                },
            });
            cc.status = 'LINK_REQUESTED';
            cc.lastRequestId = requestId;
            cc.abhaAddress = patient.abdm.abhaAddress;
            cc.error = null;
            requested += 1;
        } catch (err) {
            cc.status = 'FAILED';
            cc.error = String(err.message).slice(0, 300);
        }
        await cc.save();
    }
    return { requested };
}

module.exports = {
    // inbound
    onLinkToken, onDiscover, onLinkInit, onLinkConfirm, onConsentNotify,
    onHealthInfoRequest, onAbhaDeactivate, onCareContextLinked,
    // outbound
    createCareContext, requestLinking, linkPendingForPatient,
    setSmsSender,
    HI_TYPES,
};
