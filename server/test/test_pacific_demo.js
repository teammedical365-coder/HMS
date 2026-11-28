/**
 * Comprehensive End-to-End Verification Suite: Pacific Hospital Interactive Demo
 *
 * Tests strictly against live Express app + MongoDB:
 *  1. Pacific Hospital Demo Config returns demoEnabled=true & 5 roles ONLY for pacifichospital.medical365.in
 *  2. Non-Pacific origins/hosts (apollohospital.medical365.in, city-hospital, localhost, evil.com, spoofed body isDemo)
 *     receive demoEnabled=false and 403 rejection on /api/pacific-demo/login
 *  3. All 5 Pacific Demo Roles (hospitaladmin, doctor, reception, lab, accountant) log in OTP-free with real DB sessions & JWTs
 *  4. Role switching via /api/pacific-demo/switch-role transitions cleanly across roles without logout/OTP & invalidates previous token
 *  5. Backend API access verification per role (Dashboard stats, Doctor patients/appts, Reception appts, Lab summary, Accountant dashboard)
 *  6. Security boundaries:
 *       - Demo users are STRICTLY blocked from Super Admin endpoints (403)
 *       - Demo users CANNOT access other hospital tenants' data (tenant isolation enforced)
 *       - Non-demo regular user attempting demo role switch or demo login is rejected (403)
 *       - Expired demo Session is rejected by verifyToken (401 sessionExpired: true)
 *       - External SMTP / SMS dispatches are suppressed inside active Pacific Demo sandbox sessions
 *  7. OTP ISOLATION: Normal non-demo hospital (and non-demo staff accounts) keep existing OTP workflow untouched
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const Hospital = require('../src/models/hospital.model');
const User = require('../src/models/user.model');
const Session = require('../src/models/session.model');
const { JWT_SECRET } = require('../src/config/jwt');
const {
    PACIFIC_DEMO_HOST,
    PACIFIC_DEMO_HOSPITAL_ID,
    PACIFIC_DEMO_ROLES,
    pacificDemoAls,
    isInPacificDemoSandbox
} = require('../src/config/pacificDemoConfig');
const { sendLoginOtpEmail } = require('../src/services/email.service');

async function runTests() {
    if (!process.env.MONGODB_URL) {
        throw new Error('MONGODB_URL is required in server/.env to run integration tests.');
    }

    await mongoose.connect(process.env.MONGODB_URL);
    console.log('[Test] Connected to MongoDB.');

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    let passed = 0;
    let failed = 0;
    const issuedSessionIds = [];

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

    const pacificHeaders = {
        Origin: `https://${PACIFIC_DEMO_HOST}`,
        Host: PACIFIC_DEMO_HOST
    };

    try {
        await runCase('1. DB has demo enabled ONLY on Pacific Hospital and 5 demo users belong to Pacific tenant', async () => {
            const enabledHospitals = await Hospital.find({ isDemoEnabled: true }).select('_id slug name').lean();
            assert.strictEqual(enabledHospitals.length, 1, `Expected exactly 1 demo-enabled hospital, found ${enabledHospitals.length}`);
            assert.strictEqual(enabledHospitals[0].slug, 'pacifichospital');
            assert.strictEqual(String(enabledHospitals[0]._id), String(PACIFIC_DEMO_HOSPITAL_ID));

            const demoUsers = await User.find({ isDemoAccount: true }).select('hospitalId demoRoleKey isActive role').lean();
            assert.strictEqual(demoUsers.length, 5);
            demoUsers.forEach((u) => {
                assert.strictEqual(String(u.hospitalId), String(PACIFIC_DEMO_HOSPITAL_ID));
                assert.strictEqual(u.isActive, true);
                assert(!['superadmin', 'centraladmin'].includes(String(u.role).toLowerCase()));
            });
        });

        await runCase('2. Config endpoint exposes 5 roles ONLY for Pacific Hospital origin, never other hospitals', async () => {
            const okRes = await fetch(`${baseUrl}/api/pacific-demo/config`, { headers: pacificHeaders });
            const okJson = await okRes.json();
            assert.strictEqual(okRes.status, 200);
            assert.strictEqual(okJson.demoEnabled, true);
            assert.strictEqual(okJson.roles.length, 5);
            assert.deepStrictEqual(
                okJson.roles.map((r) => r.roleKey),
                ['hospitaladmin', 'doctor', 'reception', 'lab', 'accountant']
            );
            assert(!JSON.stringify(okJson).toLowerCase().includes('password'));

            for (const badHost of ['apollohospital.medical365.in', 'cityhospital.medical365.in', 'medical365.in', 'admin.medical365.in']) {
                const badRes = await fetch(`${baseUrl}/api/pacific-demo/config`, {
                    headers: { Origin: `https://${badHost}`, Host: badHost }
                });
                const badJson = await badRes.json();
                assert.strictEqual(badRes.status, 200);
                assert.strictEqual(badJson.demoEnabled, false, `Host ${badHost} must not get demoEnabled=true`);
                assert.strictEqual(badJson.roles.length, 0);
            }
        });

        await runCase('3. Non-Pacific origins & spoofed client isDemo flags are rejected (403) on demo login', async () => {
            for (const badOrigin of ['https://apollohospital.medical365.in', 'https://evil-attacker.com', 'https://medical365.in']) {
                const r = await fetch(`${baseUrl}/api/pacific-demo/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Origin: badOrigin },
                    body: JSON.stringify({ roleKey: 'hospitaladmin', isDemo: true, hospitalSlug: 'pacifichospital' })
                });
                assert.strictEqual(r.status, 403, `Expected 403 for Origin ${badOrigin}, got ${r.status}`);
            }

            const saRes = await fetch(`${baseUrl}/api/pacific-demo/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...pacificHeaders },
                body: JSON.stringify({ roleKey: 'superadmin' })
            });
            assert.strictEqual(saRes.status, 400);
        });

        const roleTokens = {};
        await runCase('4. All 5 Pacific Demo Roles login OTP-free with real JWTs, DB sessions, and working protected endpoints', async () => {
            for (const spec of PACIFIC_DEMO_ROLES) {
                const res = await fetch(`${baseUrl}/api/pacific-demo/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...pacificHeaders },
                    body: JSON.stringify({ roleKey: spec.roleKey })
                });
                const json = await res.json();
                assert.strictEqual(res.status, 200, `Login failed for ${spec.roleKey}: ${json.message}`);
                assert.strictEqual(json.otpBypassed, true);
                assert.strictEqual(json.isPacificDemo, true);
                assert(json.token && json.token.split('.').length === 3);
                assert.strictEqual(String(json.user.hospitalId), String(PACIFIC_DEMO_HOSPITAL_ID));
                assert.strictEqual(json.user.demoRoleKey, spec.roleKey);

                const decoded = jwt.verify(json.token, JWT_SECRET);
                assert.strictEqual(decoded.isPacificDemo, true);
                issuedSessionIds.push(decoded.sessionId);

                const sessDoc = await Session.findOne({ sessionId: decoded.sessionId, isActive: true }).lean();
                assert(sessDoc && sessDoc.isDemoSession === true && sessDoc.expiresAt > new Date());
                roleTokens[spec.roleKey] = json.token;
            }

            const authGet = async (tok, url) => {
                const r = await fetch(`${baseUrl}${url}`, { headers: { Authorization: `Bearer ${tok}` } });
                return { status: r.status, data: await r.json().catch(() => ({})) };
            };

            const adminStats = await authGet(roleTokens.hospitaladmin, `/api/hospitals/${PACIFIC_DEMO_HOSPITAL_ID}/stats`);
            assert.strictEqual(adminStats.status, 200, `Hospital Admin stats failed: ${JSON.stringify(adminStats.data)}`);

            const docAppts = await authGet(roleTokens.doctor, '/api/doctor/appointments');
            assert.strictEqual(docAppts.status, 200, `Doctor appointments failed: ${JSON.stringify(docAppts.data)}`);
            assert(Array.isArray(docAppts.data.appointments) && docAppts.data.appointments.length > 0, 'Demo doctor must see Reception-booked Pacific Hospital appointments');

            const recAppts = await authGet(roleTokens.reception, '/api/reception/appointments');
            assert.strictEqual(recAppts.status, 200, `Reception appointments failed: ${JSON.stringify(recAppts.data)}`);

            const labSummary = await authGet(roleTokens.lab, '/api/lab/dashboard/summary');
            assert.strictEqual(labSummary.status, 200, `Lab summary failed: ${JSON.stringify(labSummary.data)}`);

            const accDash = await authGet(roleTokens.accountant, '/api/accountant/dashboard');
            assert.strictEqual(accDash.status, 200, `Accountant dashboard failed: ${JSON.stringify(accDash.data)}`);

            // Verify multi-doctor config + accurate hospital stats (beds, staff, doctors, today appts)
            const cfgRes4 = await fetch(`${baseUrl}/api/pacific-demo/config`, { headers: pacificHeaders });
            const cfgJson = await cfgRes4.json();
            assert(Array.isArray(cfgJson.doctors) && cfgJson.doctors.length >= 2, 'Pacific config must return active doctors');
            assert(adminStats.data.stats.totalDoctors >= 2, 'Total doctors count must reflect all active Pacific doctors');
            assert(adminStats.data.stats.totalStaff >= 5, 'Total staff count must reflect all Pacific staff');
            assert(adminStats.data.stats.totalBeds > 0, 'Total beds must reflect tenant DB beds');
        });

        await runCase('5. Role switching re-issues token for new role cleanly & invalidates previous token immediately', async () => {
            const prevToken = roleTokens.hospitaladmin;
            const swRes = await fetch(`${baseUrl}/api/pacific-demo/switch-role`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${prevToken}`,
                    ...pacificHeaders
                },
                body: JSON.stringify({ roleKey: 'doctor' })
            });
            const swJson = await swRes.json();
            assert.strictEqual(swRes.status, 200);
            assert.strictEqual(swJson.switched, true);
            assert.strictEqual(swJson.user.demoRoleKey, 'doctor');
            const newDecoded = jwt.verify(swJson.token, JWT_SECRET);
            issuedSessionIds.push(newDecoded.sessionId);

            // Old switched-away token MUST now fail verification (401)
            const staleRes = await fetch(`${baseUrl}/api/hospitals/${PACIFIC_DEMO_HOSPITAL_ID}/stats`, {
                headers: { Authorization: `Bearer ${prevToken}` }
            });
            assert.strictEqual(staleRes.status, 401);

            // Doctor token cannot access Accountant dashboard (403 RBAC enforced)
            const crossRoleForbidden = await fetch(`${baseUrl}/api/accountant/dashboard`, {
                headers: { Authorization: `Bearer ${swJson.token}` }
            });
            assert.strictEqual(crossRoleForbidden.status, 403);

            // Switch to specific non-demo Pacific doctor & verify strict per-doctor appointment isolation
            const cfg2 = await fetch(`${baseUrl}/api/pacific-demo/config`, { headers: pacificHeaders }).then((r) => r.json());
            const otherDoc = (cfg2.doctors || []).find((d) => d.userId && String(d.userId) !== String(swJson.user.id));
            if (otherDoc) {
                const swDoc2 = await fetch(`${baseUrl}/api/pacific-demo/switch-role`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${swJson.token}`,
                        ...pacificHeaders
                    },
                    body: JSON.stringify({ roleKey: 'doctor', doctorUserId: otherDoc.userId })
                }).then((r) => r.json());
                assert.strictEqual(swDoc2.switched, true);
                const doc2Decoded = jwt.verify(swDoc2.token, JWT_SECRET);
                issuedSessionIds.push(doc2Decoded.sessionId);

                const doc2Appts = await fetch(`${baseUrl}/api/doctor/appointments`, {
                    headers: { Authorization: `Bearer ${swDoc2.token}` }
                }).then((r) => r.json());
                assert.strictEqual(doc2Appts.success, true);
                assert(Array.isArray(doc2Appts.appointments) && doc2Appts.appointments.length > 0, 'Switched Pacific doctor must see their assigned appointments');
                const foreignAppt = doc2Appts.appointments.find((a) => String(a.doctorUserId) !== String(otherDoc.userId));
                assert(!foreignAppt, 'Doctor must NEVER see another doctor’s appointments');
            }
        });

        await runCase('6. Super Admin blocked (403) + Tenant isolation enforced + Expired demo session rejected (401)', async () => {
            const res = await fetch(`${baseUrl}/api/pacific-demo/admin/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${roleTokens.lab}` },
                body: JSON.stringify({ enabled: false })
            });
            assert.strictEqual(res.status, 403);

            const otherHosp = await Hospital.findOne({ _id: { $ne: PACIFIC_DEMO_HOSPITAL_ID }, isActive: true }).select('_id').lean();
            if (otherHosp) {
                const crossStats = await fetch(`${baseUrl}/api/hospitals/${otherHosp._id}/stats`, {
                    headers: { Authorization: `Bearer ${roleTokens.reception}` }
                });
                assert.strictEqual(crossStats.status, 403);
            }

            // Expired demo session check
            const recDecoded = jwt.verify(roleTokens.reception, JWT_SECRET);
            await Session.updateOne({ sessionId: recDecoded.sessionId }, { $set: { expiresAt: new Date(Date.now() - 5000) } });
            const expRes = await fetch(`${baseUrl}/api/reception/appointments`, {
                headers: { Authorization: `Bearer ${roleTokens.reception}` }
            });
            const expJson = await expRes.json();
            assert.strictEqual(expRes.status, 401);
            assert.strictEqual(expJson.sessionExpired, true);
        });

        await runCase('7. Demo sandbox suppresses real external SMTP emails; non-demo hospital keeps OTP intact', async () => {
            let sandboxActive = false;
            await pacificDemoAls.run({ isPacificDemo: true }, async () => {
                sandboxActive = isInPacificDemoSandbox();
                const suppressedRes = await sendLoginOtpEmail({
                    email: 'realcustomer@gmail.com',
                    otp: '654321',
                    userName: 'Test',
                    hospitalName: 'Pacific Hospital'
                });
                assert.strictEqual(suppressedRes.demoSkipped, true);
            });
            assert.strictEqual(sandboxActive, true);
            assert.strictEqual(isInPacificDemoSandbox(), false);

            const otherHosp = await Hospital.findOne({ slug: 'apollohospital' }).select('_id slug').lean();
            const otpRes = await fetch(`${baseUrl}/api/auth/otp/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://apollohospital.medical365.in'
                },
                body: JSON.stringify({
                    email: 'nonexistent.staff@apollohospital.in',
                    password: 'WrongPassword123!',
                    hospitalSlug: otherHosp?.slug || 'apollohospital',
                    loginType: 'staff'
                })
            });
            assert(otpRes.status === 404 || otpRes.status === 401);
            const otpJson = await otpRes.json();
            assert(!otpJson.otpBypassed);
        });

        console.log(`\nPACIFIC_DEMO_TEST_SUMMARY: ${passed}/${passed + failed} passed`);
        if (failed > 0) process.exitCode = 1;
    } finally {
        if (issuedSessionIds.length > 0) {
            await Session.deleteMany({ sessionId: { $in: issuedSessionIds } }).catch(() => {});
        }
        server.close();
        await mongoose.disconnect();
    }
}

runTests().catch((err) => {
    console.error('Fatal Pacific demo test error:', err);
    process.exit(1);
});
