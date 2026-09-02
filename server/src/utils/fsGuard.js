/**
 * Windows File-System Guard & Retry Mechanism
 * 
 * Prevents transient Windows file lock errors (errno: -4094 / UV_UNKNOWN / EBUSY / EPERM / EACCES)
 * caused by IDE saves, antivirus scans, git operations, or Windows Search indexing.
 */

const fs = require('fs');

const TRANSIENT_ERROR_CODES = new Set(['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES', 'EMFILE', 'EAGAIN']);
const TRANSIENT_ERRNOS = new Set([-4094, -4082, -4048, -4075]); // Libuv Windows error codes

function isTransientFileError(err) {
    if (!err) return false;
    if (TRANSIENT_ERROR_CODES.has(err.code)) return true;
    if (TRANSIENT_ERRNOS.has(err.errno)) return true;
    if (err.message && (err.message.includes('unknown error, read') || err.message.includes('EBUSY') || err.message.includes('resource busy or locked'))) {
        return true;
    }
    return false;
}

// 1. Wrap Synchronous readFileSync (used by CommonJS require() and config loaders)
const origReadFileSync = fs.readFileSync;
fs.readFileSync = function (path, options) {
    let attempts = 0;
    const maxAttempts = 15;
    
    while (true) {
        try {
            return origReadFileSync.call(fs, path, options);
        } catch (err) {
            attempts++;
            if (isTransientFileError(err) && attempts < maxAttempts) {
                // Synchronous wait to let Windows release file lock
                const delayMs = Math.min(25 * attempts, 200);
                const start = Date.now();
                while (Date.now() - start < delayMs) {
                    // spin wait
                }
                continue;
            }
            throw err;
        }
    }
};

// 2. Wrap Asynchronous readFile
const origReadFile = fs.readFile;
fs.readFile = function (path, options, callback) {
    let cb = callback;
    let opt = options;
    if (typeof options === 'function') {
        cb = options;
        opt = {};
    }

    let attempts = 0;
    const maxAttempts = 10;

    function executeRead() {
        origReadFile.call(fs, path, opt, (err, data) => {
            if (err && isTransientFileError(err) && attempts < maxAttempts) {
                attempts++;
                const delayMs = Math.min(30 * attempts, 300);
                setTimeout(executeRead, delayMs);
                return;
            }
            if (cb) cb(err, data);
        });
    }

    executeRead();
};

// 3. Wrap Synchronous statSync / lstatSync / existsSync
const origStatSync = fs.statSync;
fs.statSync = function (path, options) {
    let attempts = 0;
    const maxAttempts = 10;
    while (true) {
        try {
            return origStatSync.call(fs, path, options);
        } catch (err) {
            attempts++;
            if (isTransientFileError(err) && attempts < maxAttempts) {
                const start = Date.now();
                while (Date.now() - start < 20 * attempts) {}
                continue;
            }
            throw err;
        }
    }
};

// 4. Wrap Module._extensions['.js'] for CommonJS loader extra resilience
try {
    const Module = require('module');
    if (Module._extensions && Module._extensions['.js']) {
        const origJsLoader = Module._extensions['.js'];
        Module._extensions['.js'] = function (module, filename) {
            let attempts = 0;
            const maxAttempts = 10;
            while (true) {
                try {
                    return origJsLoader.call(this, module, filename);
                } catch (err) {
                    attempts++;
                    if (isTransientFileError(err) && attempts < maxAttempts) {
                        const start = Date.now();
                        while (Date.now() - start < 30 * attempts) {}
                        continue;
                    }
                    throw err;
                }
            }
        };
    }
} catch (e) {
    // Ignore module loader override if restricted
}

module.exports = { isTransientFileError };
