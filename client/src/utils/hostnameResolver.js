/**
 * hostnameResolver.js — Centralized Hostname → Portal Type Resolver
 *
 * This is the SINGLE AUTHORITATIVE source that determines what portal
 * the current hostname maps to.
 *
 * Returns one of:
 *   ADMIN          — admin.medical365.in (exact match)
 *   HOSPITAL       — registered hospital subdomain or custom domain
 *   DEVELOPMENT    — localhost / local dev
 *   INVALID        — unrecognized hostname
 *   RESOLVING      — resolution in progress
 *   NETWORK_ERROR  — couldn't reach server to validate
 *
 * Usage:
 *   import { resolveHostname, useHostnameResolver } from './hostnameResolver';
 *   const { portalType, tenantData, isResolving } = useHostnameResolver();
 */
import { useState, useEffect, useRef } from 'react';
import { baseURL } from './api';

// ── Portal Type Constants ────────────────────────────────────────────────────
export const PORTAL_TYPES = Object.freeze({
    ADMIN: 'ADMIN',
    HOSPITAL: 'HOSPITAL',
    CUSTOM_DOMAIN: 'CUSTOM_DOMAIN',
    DEVELOPMENT: 'DEVELOPMENT',
    INVALID: 'INVALID',
    RESOLVING: 'RESOLVING',
    NETWORK_ERROR: 'NETWORK_ERROR',
});

// ── Configuration ────────────────────────────────────────────────────────────
const ADMIN_HOST = (import.meta.env.VITE_ADMIN_HOST || 'admin.medical365.in').toLowerCase();
const BASE_DOMAIN = (import.meta.env.VITE_BASE_DOMAIN || 'medical365.in').toLowerCase();

// Hosts that represent the platform itself (not a hospital)
const PLATFORM_HOSTS = new Set([
    BASE_DOMAIN,
    `www.${BASE_DOMAIN}`,
    `api.${BASE_DOMAIN}`,
]);

// ── In-Memory Resolution Cache ──────────────────────────────────────────────
const resolutionCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Normalize a hostname: lowercase, strip trailing dot
 */
function normalizeHostname(hostname) {
    if (!hostname) return '';
    return hostname.toLowerCase().replace(/\.$/, '');
}

/**
 * Check if current environment is a local development environment
 */
export function isDevEnvironment() {
    const hostname = normalizeHostname(window.location.hostname);
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        /^192\.168\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
}

/**
 * Synchronous fast check — returns a result immediately without server validation.
 * Used for initial render decisions. Returns null if server validation is needed.
 */
export function resolveHostnameSync(hostname) {
    const h = normalizeHostname(hostname || window.location.hostname);

    // 1. Development environments — allow immediately
    if (isDevEnvironment()) {
        // Check for localhost subdomains (e.g., sunrise.localhost)
        if (h.endsWith('.localhost') || h.endsWith('localhost')) {
            const parts = h.split('.');
            if (parts.length >= 2 && parts[0] !== 'www') {
                // localhost subdomain — needs server validation for hospital
                return null; // needs async resolution
            }
        }
        return { type: PORTAL_TYPES.DEVELOPMENT, tenantData: null };
    }

    // 2. Exact admin hostname match
    if (h === ADMIN_HOST) {
        return { type: PORTAL_TYPES.ADMIN, tenantData: null };
    }

    // 3. Platform base domains (medical365.in, www.medical365.in)
    if (PLATFORM_HOSTS.has(h)) {
        return { type: PORTAL_TYPES.ADMIN, tenantData: null };
    }

    // 4. Check cache
    const cached = resolutionCache.get(h);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return cached.result;
    }

    // 5. Cannot determine synchronously — needs server validation
    return null;
}

/**
 * Async hostname resolution — validates against the backend.
 * This is the definitive resolver.
 */
export async function resolveHostname(hostname) {
    const h = normalizeHostname(hostname || window.location.hostname);

    // 1. Try sync resolution first
    const syncResult = resolveHostnameSync(h);
    if (syncResult !== null) {
        return syncResult;
    }

    // 2. Check cache (may have been populated since sync check)
    const cached = resolutionCache.get(h);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return cached.result;
    }

    // 3. For localhost subdomains in dev mode, query server
    if (isDevEnvironment()) {
        try {
            const res = await fetch(`${baseURL}/api/public/tenant-config?domain=${encodeURIComponent(h)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.tenant) {
                    const result = {
                        type: data.tenant.isCentralAdmin ? PORTAL_TYPES.ADMIN : PORTAL_TYPES.HOSPITAL,
                        tenantData: data.tenant,
                    };
                    resolutionCache.set(h, { result, timestamp: Date.now() });
                    return result;
                }
            }
            // Dev mode: if tenant not found, allow as development
            return { type: PORTAL_TYPES.DEVELOPMENT, tenantData: null };
        } catch {
            // Network error in dev mode — still allow
            return { type: PORTAL_TYPES.DEVELOPMENT, tenantData: null };
        }
    }

    // 4. Production: validate against server
    try {
        const res = await fetch(`${baseURL}/api/public/tenant-config?domain=${encodeURIComponent(h)}`);

        if (res.ok) {
            const data = await res.json();
            if (data.success && data.tenant) {
                const type = data.tenant.isCentralAdmin
                    ? PORTAL_TYPES.ADMIN
                    : PORTAL_TYPES.HOSPITAL;
                const result = { type, tenantData: data.tenant };
                resolutionCache.set(h, { result, timestamp: Date.now() });
                return result;
            }
        }

        if (res.status === 404) {
            // Server explicitly says: this hostname is not registered
            const result = { type: PORTAL_TYPES.INVALID, tenantData: null };
            resolutionCache.set(h, { result, timestamp: Date.now() });
            return result;
        }

        // Other HTTP errors — treat as network error, NOT as admin
        const result = { type: PORTAL_TYPES.NETWORK_ERROR, tenantData: null };
        // Short cache for errors (30 seconds)
        resolutionCache.set(h, { result, timestamp: Date.now() - CACHE_TTL_MS + 30000 });
        return result;

    } catch (err) {
        console.error('[HostnameResolver] Network error resolving hostname:', err);
        // Network failure — NOT admin, NOT hospital
        const result = { type: PORTAL_TYPES.NETWORK_ERROR, tenantData: null };
        resolutionCache.set(h, { result, timestamp: Date.now() - CACHE_TTL_MS + 30000 });
        return result;
    }
}

/**
 * React Hook — resolves hostname on mount and provides reactive state.
 *
 * Usage:
 *   const { portalType, tenantData, isResolving, error } = useHostnameResolver();
 */
export function useHostnameResolver() {
    const [state, setState] = useState(() => {
        const hostname = normalizeHostname(window.location.hostname);
        const syncResult = resolveHostnameSync(hostname);
        if (syncResult !== null) {
            return {
                portalType: syncResult.type,
                tenantData: syncResult.tenantData,
                isResolving: false,
                error: null,
            };
        }
        return {
            portalType: PORTAL_TYPES.RESOLVING,
            tenantData: null,
            isResolving: true,
            error: null,
        };
    });

    const resolvedRef = useRef(false);

    useEffect(() => {
        // If already resolved synchronously, skip
        if (state.portalType !== PORTAL_TYPES.RESOLVING) {
            resolvedRef.current = true;
            return;
        }

        let cancelled = false;

        const doResolve = async () => {
            try {
                const result = await resolveHostname();
                if (!cancelled) {
                    setState({
                        portalType: result.type,
                        tenantData: result.tenantData,
                        isResolving: false,
                        error: result.type === PORTAL_TYPES.NETWORK_ERROR ? 'Network error' : null,
                    });
                    resolvedRef.current = true;
                }
            } catch (err) {
                if (!cancelled) {
                    setState({
                        portalType: PORTAL_TYPES.NETWORK_ERROR,
                        tenantData: null,
                        isResolving: false,
                        error: err.message,
                    });
                }
            }
        };

        doResolve();

        return () => { cancelled = true; };
    }, []); // Only on mount — hostname doesn't change during SPA lifetime

    return state;
}

/**
 * Clear the resolution cache (useful for testing or after tenant changes)
 */
export function clearResolutionCache() {
    resolutionCache.clear();
}
