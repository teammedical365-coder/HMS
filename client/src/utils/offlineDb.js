/**
 * offlineDb.js — IndexedDB Manager for Medical365 Offline-First HMS
 *
 * Provides a thin, zero-dependency wrapper over the native IndexedDB API.
 * Manages four object stores:
 *   - cache:     Cached GET responses (keyed by URL + params hash)
 *   - syncQueue: Pending write operations (POST/PUT/PATCH/DELETE)
 *   - idMap:     Maps temporary client IDs → real server IDs after sync
 *   - meta:      Sync timestamps, version info, last-online time
 *
 * All methods are async and safe to call from any component or utility.
 * The DB is scoped per-user via the userId prefix in the DB name,
 * ensuring tenant isolation at the browser level.
 */

const DB_VERSION = 1;
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const STATIC_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for static data

// Static metadata endpoints that change infrequently
const STATIC_CACHE_PATTERNS = [
  '/api/admin/roles',
  '/api/public/services',
  '/api/doctor', // doctor listing
  '/api/hospitals',
  '/api/lab-tests',
  '/api/medicines',
  '/api/public/auth-config',
  '/api/test-packages',
];

/**
 * Determine TTL for a given cache key based on whether it's static metadata
 */
function getTtlForKey(cacheKey) {
  for (const pattern of STATIC_CACHE_PATTERNS) {
    if (cacheKey.includes(pattern)) {
      return STATIC_CACHE_TTL_MS;
    }
  }
  return DEFAULT_CACHE_TTL_MS;
}

// ── Singleton DB Instance ─────────────────────────────────────────────────────

let dbInstance = null;
let dbName = 'hms_offline_default';

/**
 * Initialize the offline DB for a specific user.
 * Call this after login with the user's ID.
 * @param {string} userId - The logged-in user's MongoDB _id
 */
export function initOfflineDb(userId) {
  if (!userId) return;
  const newName = `hms_offline_${userId}`;
  if (newName !== dbName) {
    // Close existing connection if switching users
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
    dbName = newName;
  }
}

/**
 * Get (or open) the IndexedDB connection
 * @returns {Promise<IDBDatabase>}
 */
function getDb() {
  if (dbInstance && dbInstance._closed !== true) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // ── cache store ──
      if (!db.objectStoreNames.contains('cache')) {
        const cacheStore = db.createObjectStore('cache', { keyPath: 'cacheKey' });
        cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // ── syncQueue store ──
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        syncStore.createIndex('createdAt', 'createdAt', { unique: false });
        syncStore.createIndex('status', 'status', { unique: false });
      }

      // ── idMap store ──
      if (!db.objectStoreNames.contains('idMap')) {
        db.createObjectStore('idMap', { keyPath: 'tempId' });
      }

      // ── meta store ──
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbInstance._closed = false;

      // Handle unexpected close (e.g., browser GC)
      dbInstance.onclose = () => {
        dbInstance._closed = true;
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[OfflineDB] Failed to open:', event.target.error);
      reject(event.target.error);
    };
  });
}

// ── Generic Transaction Helpers ───────────────────────────────────────────────

/**
 * Execute a read-only transaction on a single store
 */
async function readStore(storeName, callback) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    callback(store, resolve, reject);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Execute a read-write transaction on a single store
 */
async function writeStore(storeName, callback) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    callback(store, resolve, reject);
    tx.onerror = () => reject(tx.error);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a deterministic cache key from URL and params
 * @param {string} url - The request URL path
 * @param {object} [params] - Query parameters
 * @returns {string}
 */
export function buildCacheKey(url, params = null) {
  let key = url;
  if (params && typeof params === 'object') {
    const sorted = Object.keys(params).sort();
    const qs = sorted.map((k) => `${k}=${params[k]}`).join('&');
    if (qs) key += `?${qs}`;
  }
  return key;
}

/**
 * Get cached response data
 * @param {string} cacheKey
 * @returns {Promise<{data: any, timestamp: number, isStale: boolean} | null>}
 */
export async function getCached(cacheKey) {
  try {
    return await readStore('cache', (store, resolve) => {
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        const record = req.result;
        if (!record) return resolve(null);

        const ttl = getTtlForKey(cacheKey);
        const age = Date.now() - record.timestamp;
        const isStale = age > ttl;

        resolve({
          data: record.data,
          timestamp: record.timestamp,
          isStale,
        });
      };
    });
  } catch (err) {
    console.error('[OfflineDB] getCached error:', err);
    return null;
  }
}

/**
 * Store response data in cache
 * @param {string} cacheKey
 * @param {any} data - The response data to cache
 */
export async function putCache(cacheKey, data) {
  try {
    await writeStore('cache', (store, resolve) => {
      const req = store.put({
        cacheKey,
        data,
        timestamp: Date.now(),
      });
      req.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error('[OfflineDB] putCache error:', err);
  }
}

/**
 * Invalidate cached entries matching a prefix
 * @param {string} [prefix] - URL prefix to match. If empty, clears all cache.
 */
export async function invalidateCache(prefix = '') {
  try {
    if (!prefix) {
      // Clear entire cache store
      await writeStore('cache', (store, resolve) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
      });
      return;
    }

    // Delete entries matching prefix
    await writeStore('cache', (store, resolve) => {
      const req = store.openCursor();
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.key.startsWith(prefix)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  } catch (err) {
    console.error('[OfflineDB] invalidateCache error:', err);
  }
}

/**
 * Remove expired cache entries (garbage collection)
 */
export async function pruneExpiredCache() {
  try {
    const cutoff = Date.now() - STATIC_CACHE_TTL_MS; // Remove anything older than max TTL
    await writeStore('cache', (store, resolve) => {
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoff);
      const req = index.openCursor(range);
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  } catch (err) {
    console.error('[OfflineDB] pruneExpiredCache error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC QUEUE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enqueue a write operation for later sync
 * @param {Object} operation
 * @param {string} operation.method - HTTP method (POST, PUT, PATCH, DELETE)
 * @param {string} operation.url - API endpoint URL
 * @param {object} [operation.data] - Request body
 * @param {string} [operation.clientOperationId] - Unique idempotency key
 * @param {string} [operation.description] - Human-readable description
 * @param {string[]} [operation.dependsOnTempIds] - Temp IDs this op depends on
 * @returns {Promise<number>} The auto-generated queue ID
 */
export async function enqueue(operation) {
  try {
    return await writeStore('syncQueue', (store, resolve) => {
      const record = {
        ...operation,
        status: 'pending', // pending | processing | failed
        createdAt: Date.now(),
        attempts: 0,
        lastError: null,
      };
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
    });
  } catch (err) {
    console.error('[OfflineDB] enqueue error:', err);
    throw err;
  }
}

/**
 * Get the next pending operation from the queue (FIFO)
 * @returns {Promise<Object|null>}
 */
export async function dequeue() {
  try {
    return await readStore('syncQueue', (store, resolve) => {
      const index = store.index('status');
      const req = index.openCursor(IDBKeyRange.only('pending'));
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        resolve(cursor ? cursor.value : null);
      };
    });
  } catch (err) {
    console.error('[OfflineDB] dequeue error:', err);
    return null;
  }
}

/**
 * Get all pending operations in the queue
 * @returns {Promise<Object[]>}
 */
export async function peekQueue() {
  try {
    return await readStore('syncQueue', (store, resolve) => {
      const index = store.index('createdAt');
      const results = [];
      const req = index.openCursor();
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
    });
  } catch (err) {
    console.error('[OfflineDB] peekQueue error:', err);
    return [];
  }
}

/**
 * Update an operation's status in the queue
 * @param {number} id - Queue item ID
 * @param {Object} updates - Fields to update (status, attempts, lastError)
 */
export async function updateQueueItem(id, updates) {
  try {
    await writeStore('syncQueue', (store, resolve) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result;
        if (record) {
          Object.assign(record, updates);
          store.put(record);
        }
        resolve();
      };
    });
  } catch (err) {
    console.error('[OfflineDB] updateQueueItem error:', err);
  }
}

/**
 * Remove an operation from the queue
 * @param {number} id - Queue item ID
 */
export async function removeFromQueue(id) {
  try {
    await writeStore('syncQueue', (store, resolve) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error('[OfflineDB] removeFromQueue error:', err);
  }
}

/**
 * Get the count of pending operations
 * @returns {Promise<number>}
 */
export async function getQueueCount() {
  try {
    return await readStore('syncQueue', (store, resolve) => {
      const index = store.index('status');
      const req = index.count(IDBKeyRange.only('pending'));
      req.onsuccess = () => resolve(req.result);
    });
  } catch (err) {
    console.error('[OfflineDB] getQueueCount error:', err);
    return 0;
  }
}

/**
 * Get count of all items including failed
 * @returns {Promise<number>}
 */
export async function getTotalQueueCount() {
  try {
    return await readStore('syncQueue', (store, resolve) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
    });
  } catch (err) {
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ID MAP OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map a temporary client ID to a real server ID
 * @param {string} tempId
 * @param {string} serverId
 */
export async function mapId(tempId, serverId) {
  try {
    await writeStore('idMap', (store, resolve) => {
      const req = store.put({ tempId, serverId, mappedAt: Date.now() });
      req.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error('[OfflineDB] mapId error:', err);
  }
}

/**
 * Resolve a temp ID to its server ID
 * @param {string} tempId
 * @returns {Promise<string|null>}
 */
export async function resolveId(tempId) {
  try {
    return await readStore('idMap', (store, resolve) => {
      const req = store.get(tempId);
      req.onsuccess = () => {
        resolve(req.result ? req.result.serverId : null);
      };
    });
  } catch (err) {
    console.error('[OfflineDB] resolveId error:', err);
    return null;
  }
}

/**
 * Deep-replace all temp ID references in an object with real server IDs
 * @param {any} obj - The object to scan and replace
 * @returns {Promise<any>} The object with IDs resolved
 */
export async function resolveAllIds(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const json = JSON.stringify(obj);
  // Find all temp IDs (format: tmp_XXXXX)
  const tempIdPattern = /tmp_[a-zA-Z0-9_-]{10,30}/g;
  const tempIds = [...new Set(json.match(tempIdPattern) || [])];

  if (tempIds.length === 0) return obj;

  let resolved = json;
  for (const tempId of tempIds) {
    const serverId = await resolveId(tempId);
    if (serverId) {
      resolved = resolved.replaceAll(tempId, serverId);
    }
  }

  return JSON.parse(resolved);
}

// ═══════════════════════════════════════════════════════════════════════════════
// META OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get a metadata value
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getMeta(key) {
  try {
    return await readStore('meta', (store, resolve) => {
      const req = store.get(key);
      req.onsuccess = () => {
        resolve(req.result ? req.result.value : null);
      };
    });
  } catch (err) {
    return null;
  }
}

/**
 * Set a metadata value
 * @param {string} key
 * @param {any} value
 */
export async function setMeta(key, value) {
  try {
    await writeStore('meta', (store, resolve) => {
      const req = store.put({ key, value, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error('[OfflineDB] setMeta error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clear ALL offline data (call on logout)
 */
export async function clearAll() {
  try {
    const db = await getDb();
    const storeNames = ['cache', 'syncQueue', 'idMap', 'meta'];
    await Promise.all(
      storeNames.map(
        (name) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(name, 'readwrite');
            const store = tx.objectStore(name);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          })
      )
    );
  } catch (err) {
    console.error('[OfflineDB] clearAll error:', err);
  }
}

/**
 * Delete the entire database (nuclear option — for user data removal)
 */
export async function deleteDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
