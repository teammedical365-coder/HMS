/**
 * networkStatus.js — Reactive Online/Offline Detection for Medical365 HMS
 *
 * Uses a combination of:
 *   1. navigator.onLine (instant, but unreliable — only detects LAN disconnect)
 *   2. Periodic HEAD ping to the API server (true connectivity verification)
 *
 * Provides a reactive subscription model so components and the sync engine
 * can respond immediately to connectivity changes.
 */

// ── State ─────────────────────────────────────────────────────────────────────

let currentStatus = typeof navigator !== 'undefined' ? navigator.onLine : true;
let lastOnlineTime = currentStatus ? Date.now() : null;
let pingIntervalId = null;
const listeners = new Set();

// Ping configuration
const PING_INTERVAL_MS = 30000;       // Check every 30s when online
const PING_INTERVAL_OFFLINE_MS = 10000; // Check every 10s when offline (faster recovery)
const PING_TIMEOUT_MS = 5000;          // 5s timeout per ping

function getPingUrl() {
  const liveBackend = 'https://hms-n6nk.onrender.com';
  const rawBaseURL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || liveBackend;
  const base = rawBaseURL.startsWith('http') ? rawBaseURL : `https://${rawBaseURL}`;
  return `${base}/api/public/auth-config`;
}

function notifyListeners(online) {
  if (online === currentStatus) return; // No change

  const wasOffline = !currentStatus;
  currentStatus = online;

  if (online) {
    lastOnlineTime = Date.now();
  }

  // Notify all subscribers
  for (const callback of listeners) {
    try {
      callback(online, { wasOffline, lastOnlineTime });
    } catch (err) {
      console.error('[NetworkStatus] Listener error:', err);
    }
  }

  // Adjust ping frequency
  restartPing();
}

/**
 * Perform a lightweight connectivity check
 */
async function pingServer() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

    const response = await fetch(getPingUrl(), {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'X-Offline-Ping': '1' },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      // If local server is running but database is disconnected (no internet for MongoDB)
      if (data.dbConnected === false) {
        notifyListeners(false);
      } else {
        notifyListeners(true);
      }
    } else {
      // Server returned error (502/503/504) — treat as offline
      notifyListeners(false);
    }
  } catch {
    // Network error or timeout — offline
    notifyListeners(false);
  }
}

function restartPing() {
  if (pingIntervalId) {
    clearInterval(pingIntervalId);
  }
  const interval = currentStatus ? PING_INTERVAL_MS : PING_INTERVAL_OFFLINE_MS;
  pingIntervalId = setInterval(pingServer, interval);
}

// ── Browser Event Listeners ───────────────────────────────────────────────────

function handleOnline() {
  // Browser says online — verify with a ping
  pingServer();
}

function handleOffline() {
  // Browser says offline — trust immediately
  notifyListeners(false);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get current online status
 * @returns {boolean}
 */
export function isOnline() {
  return currentStatus;
}

/**
 * Get the timestamp of the last confirmed online state
 * @returns {number|null}
 */
export function getLastOnlineTime() {
  return lastOnlineTime;
}

/**
 * Subscribe to status changes
 * @param {function(boolean, {wasOffline: boolean, lastOnlineTime: number})} callback
 * @returns {function} Unsubscribe function
 */
export function onStatusChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Initialize network monitoring. Call once on app startup.
 */
export function startNetworkMonitoring() {
  // Set initial state
  currentStatus = navigator.onLine;
  if (currentStatus) lastOnlineTime = Date.now();

  // Listen to browser events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Start periodic pings
  restartPing();

  // Do an immediate ping to verify actual connectivity
  pingServer();
}

/**
 * Stop monitoring (cleanup)
 */
export function stopNetworkMonitoring() {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);

  if (pingIntervalId) {
    clearInterval(pingIntervalId);
    pingIntervalId = null;
  }

  listeners.clear();
}

/**
 * Force a connectivity check right now
 * @returns {Promise<boolean>}
 */
export async function checkConnectivity() {
  await pingServer();
  return currentStatus;
}
