'use strict';
/**
 * abdm.inbox.processor.js - background processing of stored ABDM callbacks.
 * Routes by path SUFFIX (ABDM sends the same callback under several prefixes).
 * Includes a recovery worker so a restart never loses a callback.
 */
const AbdmInbox = require('../../models/abdmInbox.model');
const Hospital = require('../../models/hospital.model');
const hip = require('./hip.service');

const MAX_ATTEMPTS = 5;

const ROUTES = [
    [/\/hip\/v3\/links\/link\/token$/i, 'onLinkToken'],
    [/\/patient\/care-context\/discover$/i, 'onDiscover'],
    [/\/link\/care-context\/init$/i, 'onLinkInit'],
    [/\/link\/care-context\/confirm$/i, 'onLinkConfirm'],
    [/\/request\/hip\/notify$/i, 'onConsentNotify'],
    [/\/health-information\/request$/i, 'onHealthInfoRequest'],
    [/\/abha\/deactivate$/i, 'onAbhaDeactivate'],
    [/on[-_]carecontext$/i, 'onCareContextLinked'],
];

async function processInbox(id) {
    const doc = await AbdmInbox.findOneAndUpdate(
        { _id: id, status: { $in: ['RECEIVED', 'FAILED'] }, attempts: { $lt: MAX_ATTEMPTS } },
        { $set: { status: 'PROCESSING', lockedAt: new Date(), lastAttemptAt: new Date() }, $inc: { attempts: 1 } },
        { new: true }
    );
    if (!doc) return; // already claimed / finished

    try {
        const route = ROUTES.find(([re]) => re.test(doc.path));
        if (!route) {
            await AbdmInbox.updateOne({ _id: doc._id }, { $set: { status: 'UNHANDLED', error: 'No handler for path' } });
            return;
        }
        const handlerName = route[1];

        let hospital = null;
        if (doc.hipId) {
            hospital = await Hospital.findOne({ 'abdm.hipId': doc.hipId, isActive: true }).select('_id name abdm').lean();
        }
        // onLinkToken / onCareContextLinked correlate by our own request id, so hospital is optional there
        if (!hospital && handlerName !== 'onLinkToken' && handlerName !== 'onCareContextLinked') {
            await AbdmInbox.updateOne({ _id: doc._id }, { $set: { status: 'UNHANDLED', error: 'Unknown HIP ID' } });
            return;
        }

        const meta = await hip[handlerName]({
            hospital,
            hipId: doc.hipId,
            requestId: doc.requestId,
            body: doc.payload || {},
        });

        await AbdmInbox.updateOne({ _id: doc._id }, {
            $set: {
                status: 'PROCESSED',
                processedAt: new Date(),
                error: null,
                hospitalId: hospital ? hospital._id : null,
                meta: meta || {},
            },
        });
    } catch (err) {
        await AbdmInbox.updateOne({ _id: doc._id }, { $set: { status: 'FAILED', error: String(err.message).slice(0, 500) } });
        console.error(`[ABDM] ${doc.path} failed (attempt ${doc.attempts}):`, err.message);
    }
}

/** Call once from server.js after the DB connects. */
function startInboxWorker({ intervalMs = 30000 } = {}) {
    const timer = setInterval(async () => {
        try {
            const now = Date.now();
            // free callbacks stuck in PROCESSING (crash mid-flight)
            await AbdmInbox.updateMany(
                { status: 'PROCESSING', lockedAt: { $lt: new Date(now - 5 * 60 * 1000) } },
                { $set: { status: 'FAILED' } }
            );
            const due = await AbdmInbox.find({
                attempts: { $lt: MAX_ATTEMPTS },
                $or: [
                    { status: 'RECEIVED', receivedAt: { $lt: new Date(now - 60 * 1000) } },
                    { status: 'FAILED', lastAttemptAt: { $lt: new Date(now - 60 * 1000) } },
                ],
            }).select('_id').limit(25).lean();
            for (const d of due) await processInbox(d._id);
        } catch (err) {
            console.error('[ABDM] inbox worker error:', err.message);
        }
    }, intervalMs);
    if (timer.unref) timer.unref();
    return timer;
}

module.exports = { processInbox, startInboxWorker, ROUTES };
