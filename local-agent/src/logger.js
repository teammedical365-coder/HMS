/**
 * logger.js — Operational Logger for Medical365 Local Agent
 * Strictly logs system & connectivity events. Never logs patient or clinical data.
 */

const MAX_LOGS = 50;
const recentLogs = [];

function formatLog(level, component, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}`;
}

function pushLog(level, component, message) {
    const formatted = formatLog(level, component, message);
    if (level === 'error') {
        console.error(formatted);
    } else if (level === 'warn') {
        console.warn(formatted);
    } else {
        console.log(formatted);
    }

    recentLogs.unshift({
        timestamp: new Date().toISOString(),
        level: level.toUpperCase(),
        component,
        message
    });

    if (recentLogs.length > MAX_LOGS) {
        recentLogs.length = MAX_LOGS;
    }
}

const logger = {
    info(component, message) {
        pushLog('info', component, message);
    },
    warn(component, message) {
        pushLog('warn', component, message);
    },
    error(component, message) {
        pushLog('error', component, message);
    },
    debug(component, message) {
        if (process.env.DEBUG) {
            pushLog('debug', component, message);
        }
    },
    getRecentLogs() {
        return [...recentLogs];
    }
};

module.exports = logger;
