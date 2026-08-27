/**
 * Smart Idle Prefetching Engine for Medical365 HMS
 * 
 * Schedules dynamic import chunk downloads during browser idle cycles,
 * ensuring high-probability next pages open instantaneously without
 * competing with critical CPU or network tasks on the current page.
 */

const prefetchedModules = new Set();

/**
 * Prefetch a dynamic import component function during idle time
 * @param {string} key - Unique route or component identifier
 * @param {Function} importFn - Dynamic import function, e.g. () => import('./MyPage')
 */
export const prefetchRoute = (key, importFn) => {
    if (typeof window === 'undefined' || !importFn || prefetchedModules.has(key)) {
        return;
    }

    prefetchedModules.add(key);

    const executePrefetch = () => {
        try {
            const promise = importFn();
            if (promise && typeof promise.catch === 'function') {
                promise.catch((err) => {
                    // Fail silently in background without impacting the user
                    console.debug(`[Prefetch] Silently skipped prefetch for '${key}':`, err?.message);
                    prefetchedModules.delete(key);
                });
            }
        } catch {
            prefetchedModules.delete(key);
        }
    };

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(executePrefetch, { timeout: 4000 });
    } else {
        setTimeout(executePrefetch, 1000);
    }
};

/**
 * Convenience batch prefetcher
 * @param {Array<{key: string, importFn: Function}>} routeList
 */
export const prefetchRoutes = (routeList = []) => {
    if (!Array.isArray(routeList)) return;
    routeList.forEach(({ key, importFn }) => {
        prefetchRoute(key, importFn);
    });
};
