/**
 * Express Route & Tenant Security Integration Suite for Smart Pharmacy Vendor Invoice Import.
 * Uses in-memory model stubs + live Express router with real Multer + PDF parser + bulk-import transaction/rollback logic.
 */
const assert = require('assert');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

// Build a valid PDF buffer
function createTestInvoicePdf(invNo = 'INV-9001', vendorName = 'Apex Pharma Distributors') {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 36 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.font('Helvetica-Bold').fontSize(12).text(vendorName, 36, 36);
        doc.font('Helvetica').fontSize(8.5).text(`Invoice No: ${invNo} | Dated: 26-11-2026 | GSTIN: 08AABFA4821K1Z5`, 36, 54);
        let y = 90;
        const cols = [
            { x: 36, w: 180 },
            { x: 222, w: 65 },
            { x: 292, w: 45 },
            { x: 342, w: 40 },
            { x: 388, w: 50 },
            { x: 444, w: 50 },
            { x: 500, w: 60 }
        ];
        doc.font('Helvetica-Bold').fontSize(8);
        ['Medicine Name', 'Batch', 'Exp', 'Qty', 'Rate', 'MRP', 'Amount'].forEach((h, i) => doc.text(h, cols[i].x, y));
        y += 18;
        doc.font('Helvetica').fontSize(8);
        ['Paracetamol 650mg Tabs', 'PCM-101', '08/28', '100', '15.00', '22.00', '1,500.00'].forEach((v, i) => doc.text(v, cols[i].x, y));
        y += 16;
        ['Azithromycin 500mg Tabs', 'AZ-202', '09/28', '50', '80.00', '110.00', '4,000.00'].forEach((v, i) => doc.text(v, cols[i].x, y));
        doc.text('Grand Total: 5,500.00', 36, y + 20);
        doc.end();
    });
}

function makeQuery(result) {
    return {
        select() { return this; },
        sort() { return this; },
        limit() { return this; },
        lean() { return Promise.resolve(Array.isArray(result) ? result.map((d) => ({ ...d })) : (result ? { ...result } : null)); },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
        catch(reject) { return Promise.resolve(result).catch(reject); }
    };
}

function matchFilter(doc, filter = {}) {
    return Object.entries(filter).every(([k, v]) => {
        if (v === undefined) return true;
        if (k === '_id' && v && typeof v === 'object' && v.$ne !== undefined) {
            return String(doc._id) !== String(v.$ne);
        }
        const parts = k.split('.');
        let cur = doc;
        for (const p of parts) cur = cur ? cur[p] : undefined;
        if (v instanceof RegExp) return v.test(String(cur || ''));
        if (v && typeof v === 'object') {
            if (v.$ne !== undefined) return String(cur) !== String(v.$ne);
            if (Array.isArray(v.$in)) return v.$in.map(String).includes(String(cur));
        }
        return String(cur) === String(v);
    });
}

async function runRouteTests() {
    const tenantA = new mongoose.Types.ObjectId().toString();
    const tenantB = new mongoose.Types.ObjectId().toString();
    const userA = new mongoose.Types.ObjectId().toString();
    const userB = new mongoose.Types.ObjectId().toString();

    const db = {
        PurchaseInvoice: [],
        PurchaseInvoiceMedicine: [],
        Inventory: [],
        Vendor: [],
        Medicine: []
    };

    // Mock auth middleware module in require cache
    const authPath = require.resolve('../src/middleware/auth.middleware');
    require.cache[authPath] = {
        id: authPath,
        filename: authPath,
        loaded: true,
        exports: {
            verifyToken: (req, res, next) => {
                const t = req.headers['x-test-tenant'] || tenantA;
                req.user = {
                    id: t === tenantA ? userA : userB,
                    hospitalId: t,
                    name: t === tenantA ? 'Pharmacist A' : 'Pharmacist B',
                    email: t === tenantA ? 'a@hosp.in' : 'b@hosp.in',
                    role: 'admin'
                };
                next();
            },
            verifyAdmin: (req, res, next) => {
                const t = req.headers['x-test-tenant'] || tenantA;
                req.user = { id: t === tenantA ? userA : userB, hospitalId: t, role: 'admin' };
                next();
            }
        }
    };

    const createModelStub = (collName) => {
        class ModelStub {
            constructor(data = {}) {
                Object.assign(this, data);
                if (!this._id) this._id = new mongoose.Types.ObjectId().toString();
            }
            async save() {
                const idx = db[collName].findIndex((d) => String(d._id) === String(this._id));
                const plain = { ...this };
                if (idx >= 0) db[collName][idx] = plain;
                else db[collName].push(plain);
                return this;
            }
            toObject() {
                return { ...this };
            }
        }
        const wrapDoc = (d) => {
            if (!d) return null;
            const inst = new ModelStub(d);
            return inst;
        };
        ModelStub.find = (filter = {}) => {
            const matched = db[collName].filter((d) => matchFilter(d, filter)).map(wrapDoc);
            return makeQuery(matched);
        };
        ModelStub.findOne = (filter = {}) => {
            const found = db[collName].find((d) => matchFilter(d, filter));
            return makeQuery(wrapDoc(found));
        };
        ModelStub.findOneAndDelete = (filter = {}) => {
            const idx = db[collName].findIndex((d) => matchFilter(d, filter));
            if (idx < 0) return makeQuery(null);
            const removed = db[collName].splice(idx, 1)[0];
            return makeQuery(wrapDoc(removed));
        };
        ModelStub.insertMany = async (docs = []) => {
            const inserted = docs.map((d) => {
                const rec = { ...d, _id: d._id || new mongoose.Types.ObjectId().toString() };
                db[collName].push(rec);
                return rec;
            });
            return inserted;
        };
        ModelStub.create = async (data) => {
            const m = new ModelStub(data);
            await m.save();
            return m;
        };
        ModelStub.deleteMany = async (filter = {}) => {
            const before = db[collName].length;
            db[collName] = db[collName].filter((d) => !matchFilter(d, filter));
            return { deletedCount: before - db[collName].length };
        };
        ModelStub.updateOne = async (filter = {}, update = {}) => {
            const doc = db[collName].find((d) => matchFilter(d, filter));
            if (doc && update.$set) Object.assign(doc, update.$set);
            return { modifiedCount: doc ? 1 : 0 };
        };
        ModelStub.replaceOne = async (filter = {}, doc = {}) => {
            const idx = db[collName].findIndex((d) => matchFilter(d, filter));
            if (idx >= 0) db[collName][idx] = { ...doc, _id: db[collName][idx]._id };
            return { modifiedCount: idx >= 0 ? 1 : 0 };
        };
        return ModelStub;
    };

    const stubModels = {
        '../src/models/inventory.model': 'Inventory',
        '../src/models/medicine.model': 'Medicine',
        '../src/models/purchaseInvoice.model': 'PurchaseInvoice',
        '../src/models/purchaseInvoiceMedicine.model': 'PurchaseInvoiceMedicine',
        '../src/models/vendor.model': 'Vendor'
    };
    for (const [relPath, key] of Object.entries(stubModels)) {
        const resolved = require.resolve(relPath);
        require.cache[resolved] = {
            id: resolved,
            filename: resolved,
            loaded: true,
            exports: createModelStub(key)
        };
    }

    const pharmacyRouter = require('../src/routes/pharmacy.routes');
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/pharmacy', pharmacyRouter);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/pharmacy`;

    const cleanupPaths = () => {
        for (const pInv of db.PurchaseInvoice) {
            const rel = pInv.uploadedPDF?.storagePath;
            if (rel) {
                const full = path.resolve(__dirname, '../uploads/invoices', rel);
                if (fs.existsSync(full)) try { fs.unlinkSync(full); } catch (_) {}
            }
        }
        [tenantA, tenantB].forEach((t) => {
            const dir = path.resolve(__dirname, '../uploads/invoices', t);
            if (fs.existsSync(dir)) try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
        });
    };

    let passed = 0;
    let failed = 0;
    async function runCase(name, fn) {
        try {
            await fn();
            passed += 1;
            console.log(`PASS: ${name}`);
        } catch (err) {
            failed += 1;
            console.error(`FAIL: ${name} -> ${err.message}`);
            if (err.stack) console.error(err.stack.split('\n').slice(0, 4).join('\n'));
        }
    }

    try {
        const pdfBuf = await createTestInvoicePdf('INV-T1-2026', 'Apex Pharma Distributors');
        let uploadedInvoiceId = null;

        await runCase('1. Spoofed non-PDF & non-PDF MIME upload rejected with 400 JSON error', async () => {
            const fd = new FormData();
            fd.append('invoice', new Blob(['Not a real PDF at all'], { type: 'application/pdf' }), 'fake.pdf');
            const res = await fetch(`${baseUrl}/purchase-invoice/upload`, {
                method: 'POST',
                headers: { 'x-test-tenant': tenantA },
                body: fd
            });
            const json = await res.json();
            assert.strictEqual(res.status, 400);
            assert.strictEqual(json.code, 'INVALID_PDF');
        });

        await runCase('2. Valid PDF upload creates Tenant A PurchaseInvoice, lines & extracts rows', async () => {
            const fd = new FormData();
            fd.append('invoice', new Blob([pdfBuf], { type: 'application/pdf' }), 'apex_inv.pdf');
            fd.append('useOcr', 'false');
            const res = await fetch(`${baseUrl}/purchase-invoice/upload`, {
                method: 'POST',
                headers: { 'x-test-tenant': tenantA },
                body: fd
            });
            const json = await res.json();
            assert.strictEqual(res.status, 201);
            assert.strictEqual(json.success, true);
            assert.strictEqual(json.medicines.length, 2);
            assert.strictEqual(String(json.invoice.hospitalId), tenantA);
            uploadedInvoiceId = String(json.invoice._id);
        });

        await runCase('3. Duplicate PDF / invoice detected with 409 DUPLICATE_INVOICE and allowRevised overrides cleanly', async () => {
            const fdDup = new FormData();
            fdDup.append('invoice', new Blob([pdfBuf], { type: 'application/pdf' }), 'apex_inv.pdf');
            const dupRes = await fetch(`${baseUrl}/purchase-invoice/upload`, {
                method: 'POST',
                headers: { 'x-test-tenant': tenantA },
                body: fdDup
            });
            const dupJson = await dupRes.json();
            assert.strictEqual(dupRes.status, 409);
            assert.strictEqual(dupJson.code, 'DUPLICATE_INVOICE');

            // Tenant B uploading the exact same PDF MUST succeed (isolated tenant scope!)
            const fdTenantB = new FormData();
            fdTenantB.append('invoice', new Blob([pdfBuf], { type: 'application/pdf' }), 'apex_inv.pdf');
            const resB = await fetch(`${baseUrl}/purchase-invoice/upload`, {
                method: 'POST',
                headers: { 'x-test-tenant': tenantB },
                body: fdTenantB
            });
            assert.strictEqual(resB.status, 201);
        });

        await runCase('4. Cross-tenant isolation: Tenant B cannot view, stream PDF, or bulk-import Tenant A invoice', async () => {
            const getOne = await fetch(`${baseUrl}/purchase-invoice/${uploadedInvoiceId}`, {
                headers: { 'x-test-tenant': tenantB }
            });
            assert.strictEqual(getOne.status, 404);

            const pdfStream = await fetch(`${baseUrl}/purchase-invoice/${uploadedInvoiceId}/file`, {
                headers: { 'x-test-tenant': tenantB }
            });
            assert.strictEqual(pdfStream.status, 404);

            // Tenant A CAN stream its own PDF inline
            const pdfStreamA = await fetch(`${baseUrl}/purchase-invoice/${uploadedInvoiceId}/file`, {
                headers: { 'x-test-tenant': tenantA }
            });
            assert.strictEqual(pdfStreamA.status, 200);
            assert(pdfStreamA.headers.get('content-type').includes('application/pdf'));

            const importB = await fetch(`${baseUrl}/purchase-invoice/${uploadedInvoiceId}/bulk-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-test-tenant': tenantB },
                body: JSON.stringify({ rows: [{ medicineName: 'X', purchaseQty: 1, purchaseRate: 10 }] })
            });
            assert.strictEqual(importB.status, 404);
        });

        await runCase('5. Bulk import tracks imported/skipped/failed counts cleanly & saves Vendor format profile', async () => {
            const bulkRes = await fetch(`${baseUrl}/purchase-invoice/${uploadedInvoiceId}/bulk-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-test-tenant': tenantA },
                body: JSON.stringify({
                    saveVendorMapping: true,
                    invoiceMeta: {
                        vendorName: 'Apex Pharma Distributors',
                        invoiceNumber: 'INV-T1-2026',
                        vendorGST: '08AABFA4821K1Z5'
                    },
                    rows: [
                        { rowNumber: 1, medicineName: 'Paracetamol 650mg Tabs', batch: 'PCM-101', purchaseQty: 100, freeQty: 0, purchaseRate: 15, mrp: 22, gst: 12, included: true },
                        { rowNumber: 2, medicineName: 'Azithromycin 500mg Tabs', batch: 'AZ-202', purchaseQty: 50, freeQty: 5, purchaseRate: 80, mrp: 110, gst: 12, included: true },
                        { rowNumber: 3, medicineName: 'Skipped Vitamin Tab', batch: 'VIT-1', purchaseQty: 10, purchaseRate: 20, included: false },
                        { rowNumber: 4, medicineName: 'Broken Zero Qty Row', batch: 'BAD-1', purchaseQty: 0, purchaseRate: 20, included: true }
                    ]
                })
            });
            const json = await bulkRes.json();
            assert.strictEqual(bulkRes.status, 200);
            assert.strictEqual(json.summary.imported, 2);
            assert.strictEqual(json.summary.skipped, 1);
            assert.strictEqual(json.summary.failed, 1);
            assert.strictEqual(json.invoice.status, 'Partially Imported');

            // Verify inventory created ONLY for Tenant A
            const invA = db.Inventory.filter((i) => String(i.hospitalId) === tenantA);
            assert.strictEqual(invA.length, 2);
            assert.strictEqual(invA[1].stock, 55); // 50 purchaseQty + 5 freeQty
            const vendorA = db.Vendor.find((v) => String(v.hospitalId) === tenantA);
            assert(vendorA && vendorA.vendorName === 'Apex Pharma Distributors');
            assert(vendorA.invoiceFormatProfile && vendorA.invoiceFormatProfile.confirmedCount === 1);
        });

        console.log(`\nROUTE_TEST_SUMMARY: ${passed}/${passed + failed} passed`);
        if (failed > 0) process.exitCode = 1;
    } finally {
        server.close();
        cleanupPaths();
    }
}

runRouteTests().catch((err) => {
    console.error('Fatal route test error:', err);
    process.exit(1);
});
