/**
 * Standalone Verification of Medical365 Local Agent
 * Tests:
 * 1. Config loading & defaults
 * 2. Local Health HTTP server startup on port 4001
 * 3. GET /health and GET /status endpoints response format
 * 4. Cloud client exponential retry delay computation
 * 5. Clean shutdown
 */

const assert = require('assert');
const http = require('http');
const localHealthServer = require('./src/localHealthServer');
const cloudClient = require('./src/cloudClient');
const configManager = require('./src/config');

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        }).on('error', reject);
    });
}

async function runLocalAgentTests() {
    console.log('\n======================================================');
    console.log('--- TESTING LOCAL AGENT EMBEDDED MODULES ---');
    console.log('======================================================\n');

    let passed = 0;
    let failed = 0;

    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ ${name}`);
            console.error(`    ${err.message}`);
            failed++;
        }
    };

    // 1. Config Manager Test
    await test('Config manager loads default values properly', () => {
        const cfg = configManager.get();
        assert(cfg.agentVersion === '1.0.0');
        assert(cfg.cloudUrl);
        assert(cfg.heartbeatIntervalMs >= 5000);
    });

    // 2. Local Health Server Test
    await test('Local health server starts on port 4001 and serves GET /health', async () => {
        localHealthServer.start(4001);
        // Wait 100ms for bind
        await new Promise(r => setTimeout(r, 100));

        const res = await httpGet('http://localhost:4001/health');
        assert(res.status === 200 || res.status === 503, 'Expected 200 or 503 HTTP status');
        assert.strictEqual(res.body.agent, 'healthy');
        assert(res.body.agentVersion === '1.0.0');
        assert(res.body.timestamp);
    });

    await test('Local health server serves detailed metrics on GET /status', async () => {
        const res = await httpGet('http://localhost:4001/status');
        assert.strictEqual(res.status, 200);
        assert(res.body.agent);
        assert(res.body.database);
        assert(res.body.cloud);
        assert(Array.isArray(res.body.operationalLogs));
    });

    // 3. Cloud Client Backoff Test
    await test('Cloud client calculates exponential backoff with jitter upon failure', () => {
        cloudClient.status = 'CONNECTED';
        const initialDelay = cloudClient.backoffDelayMs;
        assert.strictEqual(initialDelay, 2000);

        cloudClient.handleHeartbeatFailure(new Error('Network connection timeout'));
        assert.strictEqual(cloudClient.status, 'DISCONNECTED');
        assert(cloudClient.consecutiveFailures === 1);
        assert(cloudClient.backoffDelayMs > 2000, 'Backoff delay must increase');

        cloudClient.handleHeartbeatFailure(new Error('DNS resolution failed'));
        assert.strictEqual(cloudClient.status, 'RECONNECTING');
        assert(cloudClient.consecutiveFailures === 2);
    });

    // 4. Shutdown
    localHealthServer.stop();
    console.log('\n======================================================');
    console.log(`LOCAL AGENT TESTS FINISHED: ${passed} passed, ${failed} failed.`);
    console.log('======================================================\n');

    if (failed > 0) process.exit(1);
}

runLocalAgentTests().catch(err => {
    console.error('Local agent test failed:', err);
    process.exit(1);
});
