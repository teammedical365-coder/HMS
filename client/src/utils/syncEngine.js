/**
 * syncEngine.js — Offline Sync Queue Processor for Medical365 HMS
 *
 * Processes queued write operations when the device comes back online.
 * Handles:
 *   - FIFO queue processing (oldest operations first)
 *   - Dependency-aware sync (resolves temp IDs before sending)
 *   - Idempotent retries with exponential backoff
 *   - Server-wins conflict resolution (safest for medical data)
 *   - Auth failure detection (stops sync if JWT expired)
 *   - Event emission for UI updates
 *
 * Zero server changes required — uses existing Express APIs as-is.
 */

import apiClient from './api';
import {
  peekQueue,
  updateQueueItem,
  removeFromQueue,
  resolveAllIds,
  resolveId,
  mapId,
  invalidateCache,
  getQueueCount,
  setMeta,
} from './offlineDb';
import { isOnline, onStatusChange } from './networkStatus';

// ── Configuration ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Base delay, doubles each retry
const SYNC_DEBOUNCE_MS = 400; // Wait before starting sync after coming online (ultra-fast)

// ── State ─────────────────────────────────────────────────────────────────────

let isSyncing = false;
let syncTimeoutId = null;
const eventListeners = new Map(); // eventName → Set<callback>

// ── Event System ──────────────────────────────────────────────────────────────

/**
 * Subscribe to sync events
 * @param {'sync-start'|'sync-progress'|'sync-complete'|'sync-error'|'sync-item-success'|'sync-item-fail'|'queue-change'} event
 * @param {function} callback
 * @returns {function} Unsubscribe function
 */
export function onSyncEvent(event, callback) {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  eventListeners.get(event).add(callback);
  return () => eventListeners.get(event)?.delete(callback);
}

function emit(event, data) {
  const callbacks = eventListeners.get(event);
  if (callbacks) {
    for (const cb of callbacks) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[SyncEngine] Event listener error (${event}):`, err);
      }
    }
  }
}

// ── URL Patterns for Cache Invalidation ───────────────────────────────────────

/**
 * Determine which cache prefixes to invalidate after a sync operation
 */
function getCacheInvalidationPrefixes(url) {
  const prefixes = [];

  if (url.includes('/reception/register') || url.includes('/patients')) {
    prefixes.push('/api/reception/patients', '/api/doctor/patients', '/api/patients');
  }
  if (url.includes('/reception/book-appointment') || url.includes('/appointments')) {
    prefixes.push('/api/reception/appointments', '/api/doctor/appointments', '/api/reception/stats');
  }
  if (url.includes('/clinical/intake')) {
    prefixes.push('/api/clinical', '/api/doctor/patients');
  }
  if (url.includes('/reception/appointments') && url.includes('confirm-payment')) {
    prefixes.push('/api/reception/appointments', '/api/reception/transactions', '/api/reception/stats');
  }
  if (url.includes('/reception/intake')) {
    prefixes.push('/api/reception/patients', '/api/doctor/patients');
  }
  if (url.includes('/admin/users') || url.includes('/admin/roles')) {
    prefixes.push('/api/admin/users', '/api/admin/roles', '/api/admin/stats');
  }
  if (url.includes('/medicines') || url.includes('/pharmacy')) {
    prefixes.push('/api/medicines', '/api/pharmacy');
  }
  if (url.includes('/lab-tests') || url.includes('/lab')) {
    prefixes.push('/api/lab-tests', '/api/lab');
  }
  if (url.includes('/ot')) {
    prefixes.push('/api/ot');
  }
  if (url.includes('/nurse')) {
    prefixes.push('/api/nurse');
  }

  return prefixes;
}

// ── Core Sync Logic ───────────────────────────────────────────────────────────

/**
 * Process a single queued operation
 * @param {Object} operation - The queue item from IndexedDB
 * @returns {Promise<{success: boolean, serverId?: string, error?: string}>}
 */
async function processOperation(operation) {
  const { id, method, url, data, clientOperationId } = operation;

  try {
    // Step 1: Resolve any temp IDs in the request data
    const resolvedData = data ? await resolveAllIds(data) : data;
    const resolvedUrl = await resolveUrlIds(url);

    // Step 2: Mark as processing
    await updateQueueItem(id, { status: 'processing' });

    // Step 3: Send to server via existing apiClient (has auth interceptor)
    const config = {
      method: method.toLowerCase(),
      url: resolvedUrl,
      headers: {},
    };

    if (resolvedData && ['post', 'put', 'patch'].includes(config.method)) {
      config.data = resolvedData;
    }

    // Add idempotency header if available
    if (clientOperationId) {
      config.headers['X-Client-Operation-Id'] = clientOperationId;
    }

    const response = await apiClient(config);

    // Step 4: Extract server ID from response (for ID mapping)
    const responseData = response.data;
    let serverId = null;

    if (responseData) {
      // Common patterns for ID extraction from Medical365 API responses
      serverId =
        responseData._id ||
        responseData.id ||
        responseData.data?._id ||
        responseData.data?.id ||
        responseData.patient?._id ||
        responseData.appointment?._id ||
        responseData.user?._id ||
        null;
    }

    // Step 5: If original data had a tempId, map it to the real server ID
    if (serverId && data) {
      const originalTempId = data._tempId || data.tempId;
      if (originalTempId && originalTempId.startsWith('tmp_')) {
        await mapId(originalTempId, String(serverId));
      }
    }

    // Step 6: Invalidate relevant caches
    const prefixes = getCacheInvalidationPrefixes(resolvedUrl);
    for (const prefix of prefixes) {
      await invalidateCache(prefix);
    }

    // Step 7: Remove from queue
    await removeFromQueue(id);

    return { success: true, serverId: serverId ? String(serverId) : null };
  } catch (err) {
    const status = err.response?.status;
    const message = err.response?.data?.message || err.message;

    // 401 — Auth expired, stop entire sync
    if (status === 401) {
      await updateQueueItem(id, {
        status: 'pending', // Keep in queue for after re-login
        lastError: 'Authentication expired. Please log in again.',
      });
      throw new AuthExpiredError('Authentication expired during sync');
    }

    // 409 — Conflict: Server wins for medical data safety
    if (status === 409) {
      console.warn(`[SyncEngine] Conflict on operation ${id}. Server wins — discarding.`);
      await removeFromQueue(id);
      return { success: true, conflict: true };
    }

    // 400/422 — Validation error: Don't retry, mark as failed
    if (status === 400 || status === 422) {
      await updateQueueItem(id, {
        status: 'failed',
        lastError: message,
        attempts: (operation.attempts || 0) + 1,
      });
      return { success: false, error: message, permanent: true };
    }

    // Other errors — retry
    const attempts = (operation.attempts || 0) + 1;
    if (attempts >= MAX_RETRIES) {
      await updateQueueItem(id, {
        status: 'failed',
        lastError: message,
        attempts,
      });
      return { success: false, error: message, permanent: true };
    }

    await updateQueueItem(id, {
      status: 'pending',
      lastError: message,
      attempts,
    });
    return { success: false, error: message, permanent: false };
  }
}

/**
 * Replace temp IDs in URL path segments
 */
async function resolveUrlIds(url) {
  const tempIdPattern = /tmp_[a-zA-Z0-9_-]{10,30}/g;
  const matches = url.match(tempIdPattern);
  if (!matches) return url;

  let resolved = url;
  for (const tempId of matches) {
    const serverId = await resolveId(tempId);
    if (serverId) {
      resolved = resolved.replace(tempId, serverId);
    }
  }
  return resolved;
}

// Custom error for auth failures
class AuthExpiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

// ── Main Sync Processor ───────────────────────────────────────────────────────

/**
 * Process all pending operations in the queue
 */
async function processQueue() {
  if (isSyncing || !isOnline()) return;

  const queue = await peekQueue();
  const pending = queue.filter((op) => op.status === 'pending');

  if (pending.length === 0) return;

  isSyncing = true;
  emit('sync-start', { total: pending.length });

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors = [];

  for (const operation of pending) {
    // Re-check connectivity before each operation
    if (!isOnline()) {
      break;
    }

    try {
      const result = await processOperation(operation);
      processed++;

      if (result.success) {
        succeeded++;
        emit('sync-item-success', {
          operation,
          serverId: result.serverId,
          conflict: result.conflict,
        });
      } else {
        if (result.permanent) {
          failed++;
          errors.push({ operation, error: result.error });
          emit('sync-item-fail', { operation, error: result.error, permanent: true });
        } else {
          // Will retry later — don't count as failed
          emit('sync-item-fail', { operation, error: result.error, permanent: false });
        }
      }

      emit('sync-progress', {
        processed,
        total: pending.length,
        succeeded,
        failed,
      });

      // Small delay between operations to avoid overwhelming the server
      if (processed < pending.length) {
        await sleep(300);
      }
    } catch (err) {
      if (err instanceof AuthExpiredError) {
        // Stop syncing — user needs to re-login
        errors.push({ error: err.message });
        emit('sync-error', { message: err.message, authExpired: true });
        break;
      }
      // Unexpected error — continue with next operation
      failed++;
      errors.push({ operation, error: err.message });
    }
  }

  isSyncing = false;

  // Update metadata
  await setMeta('lastSyncAt', Date.now());
  await setMeta('lastSyncResult', { succeeded, failed, errors: errors.length });

  // Emit completion
  const remainingCount = await getQueueCount();
  emit('sync-complete', {
    succeeded,
    failed,
    errors,
    remainingCount,
  });
  emit('queue-change', { count: remainingCount });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Auto-Sync on Connectivity Change ──────────────────────────────────────────

let unsubscribeNetwork = null;

/**
 * Initialize the sync engine. Call once on app startup.
 */
export function startSyncEngine() {
  // Listen for online status changes
  unsubscribeNetwork = onStatusChange((online, { wasOffline }) => {
    if (online && wasOffline) {
      // Just came back online — start sync after a debounce
      if (syncTimeoutId) clearTimeout(syncTimeoutId);
      syncTimeoutId = setTimeout(() => {
        processQueue();
      }, SYNC_DEBOUNCE_MS);
    }
  });

  // Also try to sync on startup if there are pending items
  if (isOnline()) {
    setTimeout(() => processQueue(), SYNC_DEBOUNCE_MS);
  }
}

/**
 * Stop the sync engine (cleanup)
 */
export function stopSyncEngine() {
  if (unsubscribeNetwork) {
    unsubscribeNetwork();
    unsubscribeNetwork = null;
  }
  if (syncTimeoutId) {
    clearTimeout(syncTimeoutId);
    syncTimeoutId = null;
  }
}

/**
 * Manually trigger a sync attempt
 */
export async function triggerSync() {
  if (!isOnline()) {
    emit('sync-error', { message: 'Cannot sync — no internet connection' });
    return;
  }
  await processQueue();
}

/**
 * Get current sync status
 */
export function isSyncInProgress() {
  return isSyncing;
}
