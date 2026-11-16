/**
 * portManager.js
 * Automatically detects and frees ports occupied by stale/zombie processes.
 * Fixes "Error: listen EADDRINUSE: address already in use 0.0.0.0:3000" permanently
 * across Windows, Linux, and macOS environments.
 */

const { execSync, exec } = require('child_process');

/**
 * Returns an array of PIDs currently LISTENING on the specified TCP port (excluding self).
 * @param {number|string} port
 * @returns {number[]}
 */
function getListeningPids(port) {
    const targetPort = parseInt(port, 10);
    if (!targetPort) return [];

    const isWin = process.platform === 'win32';
    const pids = new Set();
    const portSuffix = `:${targetPort}`;

    try {
        if (isWin) {
            // netstat is built into all Windows systems (no PowerShell required)
            const stdout = execSync('netstat -ano -p tcp', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                windowsHide: true
            });

            const lines = stdout.split(/\r?\n/);
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                // Windows netstat output: TCP  [Local Address]  [Foreign Address]  [State]  [PID]
                if (parts.length >= 5 && parts[0].toUpperCase() === 'TCP') {
                    const localAddress = parts[1];
                    const state = parts[3];
                    const pid = parseInt(parts[4], 10);

                    // Check exact port match: ends with :PORT (e.g. 0.0.0.0:3000 or [::]:3000)
                    if (
                        localAddress &&
                        localAddress.endsWith(portSuffix) &&
                        state &&
                        state.toUpperCase() === 'LISTENING' &&
                        pid &&
                        pid > 4 && // Protect System (0, 4)
                        pid !== process.pid
                    ) {
                        pids.add(pid);
                    }
                }
            }
        } else {
            // Linux / macOS / BSD
            try {
                const stdout = execSync(`lsof -ti tcp:${targetPort} -sTCP:LISTEN`, {
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'ignore']
                });
                for (const line of stdout.split(/\r?\n/)) {
                    const pid = parseInt(line.trim(), 10);
                    if (pid && pid > 1 && pid !== process.pid) {
                        pids.add(pid);
                    }
                }
            } catch {
                // Fallback to fuser on Linux
                try {
                    const stdout = execSync(`fuser ${targetPort}/tcp 2>/dev/null`, {
                        encoding: 'utf8',
                        stdio: ['ignore', 'pipe', 'ignore']
                    });
                    for (const token of stdout.trim().split(/\s+/)) {
                        const pid = parseInt(token.trim(), 10);
                        if (pid && pid > 1 && pid !== process.pid) {
                            pids.add(pid);
                        }
                    }
                } catch {}
            }
        }
    } catch (err) {
        // Ignore inspection errors (port might be free)
    }

    return Array.from(pids);
}

/**
 * Forcefully terminates a process by PID.
 * @param {number} pid
 * @returns {boolean} true if killed or already dead
 */
function killPid(pid) {
    if (!pid || pid === process.pid || pid <= 4) return false;

    const isWin = process.platform === 'win32';
    try {
        if (isWin) {
            // /F = Forcefully terminate, /T = Tree kill (includes child processes)
            execSync(`taskkill /F /PID ${pid} /T`, {
                stdio: 'ignore',
                windowsHide: true
            });
        } else {
            execSync(`kill -9 ${pid} 2>/dev/null`, { stdio: 'ignore' });
        }
        return true;
    } catch {
        // Also try node process.kill fallback
        try {
            process.kill(pid, 'SIGKILL');
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Synchronous delay helper (doesn't require external packages).
 * @param {number} ms
 */
function sleepSync(ms) {
    try {
        // Atomics.wait on a SharedArrayBuffer is non-CPU-spinning sync sleep in modern Node.js
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    } catch {
        const start = Date.now();
        while (Date.now() - start < ms) {
            // Fallback busy wait
        }
    }
}

/**
 * Asynchronous delay helper.
 * @param {number} ms
 */
function sleepAsync(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Synchronously checks if the port is in use; if so, terminates the blocking process(es)
 * and waits until the port is confirmed released.
 * Safe to call at the top of server startup before server.listen().
 * @param {number|string} port
 * @returns {boolean} true if port is free or was freed, false if could not be freed
 */
function ensurePortAvailableSync(port) {
    const targetPort = parseInt(port, 10);
    if (!targetPort) return false;

    const pids = getListeningPids(targetPort);
    if (pids.length === 0) {
        return true; // Already free
    }

    console.warn(`⚠️ [Port Manager] Port ${targetPort} is occupied by PID(s): ${pids.join(', ')}.`);
    console.log(`🧹 [Port Manager] Automatically terminating stale process(es) to reclaim port ${targetPort}...`);

    for (const pid of pids) {
        killPid(pid);
    }

    // Wait up to 2 seconds for OS socket release
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
        sleepSync(150);
        const remaining = getListeningPids(targetPort);
        if (remaining.length === 0) {
            console.log(`✅ [Port Manager] Port ${targetPort} has been freed successfully.`);
            return true;
        }
    }

    console.warn(`⚠️ [Port Manager] Timed out waiting for port ${targetPort} socket release.`);
    return false;
}

/**
 * Asynchronously checks if the port is in use; if so, terminates the blocking process(es)
 * and waits until the port is confirmed released.
 * @param {number|string} port
 * @returns {Promise<boolean>}
 */
async function ensurePortAvailable(port) {
    const targetPort = parseInt(port, 10);
    if (!targetPort) return false;

    const pids = getListeningPids(targetPort);
    if (pids.length === 0) {
        return true;
    }

    console.warn(`⚠️ [Port Manager] Port ${targetPort} is occupied by PID(s): ${pids.join(', ')}.`);
    console.log(`🧹 [Port Manager] Automatically terminating stale process(es) to reclaim port ${targetPort}...`);

    for (const pid of pids) {
        killPid(pid);
    }

    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
        await sleepAsync(200);
        const remaining = getListeningPids(targetPort);
        if (remaining.length === 0) {
            console.log(`✅ [Port Manager] Port ${targetPort} has been freed successfully.`);
            return true;
        }
    }

    return false;
}

/**
 * Free any process listening on the port.
 * @param {number|string} port
 * @returns {Promise<boolean>}
 */
async function killProcessOnPort(port) {
    return ensurePortAvailable(port);
}

module.exports = {
    getListeningPids,
    killPid,
    ensurePortAvailableSync,
    ensurePortAvailable,
    killProcessOnPort
};
