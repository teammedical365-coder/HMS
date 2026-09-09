/**
 * OfflineBanner.jsx — Single Unified Real-time Offline & Sync Indicator
 * Uses standard react-hot-toast with interactive close button, clean English messaging,
 * 5-second auto-dismissal, and ZERO duplicate popups.
 */

import React, { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAppDispatch } from '../store/hooks';
import {
  setOnlineStatus,
  setSyncStatus,
  setPendingCount,
  setSyncProgress,
  setSyncComplete,
  setSyncError,
  resetSyncStatus,
} from '../store/slices/offlineSlice';
import { onStatusChange } from '../utils/networkStatus';
import { onSyncEvent } from '../utils/syncEngine';
import { getQueueCount } from '../utils/offlineDb';

const AUTO_DISMISS_MS = 5000;
const TOAST_ID = 'network-status-toast';

// Helper function to render a sleek custom toast with a dismiss (✕) button
const showOfflineToast = ({ iconDotColor, iconGlow, message, prefix, duration = AUTO_DISMISS_MS }) => {
  toast.custom(
    (t) => (
      <div
        style={{
          opacity: t.visible ? 1 : 0,
          transform: t.visible ? 'translateY(0) scale(1)' : 'translateY(-16px) scale(0.95)',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          padding: '9px 18px',
          background: 'rgba(15, 23, 42, 0.94)',
          color: '#f8fafc',
          border: `1px solid ${iconGlow || 'rgba(255, 255, 255, 0.2)'}`,
          borderRadius: '999px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.1)',
          fontSize: '13px',
          fontWeight: 600,
          fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          pointerEvents: 'auto',
          maxWidth: '90vw',
          zIndex: 999999,
        }}
      >
        <span
          style={{
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            background: iconDotColor,
            boxShadow: `0 0 10px ${iconDotColor}`,
            flexShrink: 0,
          }}
        />
        <span style={{ lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <strong>{prefix}</strong> {message}
        </span>
        <button
          onClick={() => toast.dismiss(t.id)}
          title="Close notification"
          aria-label="Close"
          style={{
            background: 'rgba(255, 255, 255, 0.12)',
            border: 'none',
            color: '#ffffff',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 700,
            marginLeft: '4px',
            flexShrink: 0,
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.28)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)')}
        >
          ✕
        </button>
      </div>
    ),
    {
      id: TOAST_ID,
      duration,
      position: 'top-center',
    }
  );
};

const OfflineBanner = () => {
  const dispatch = useAppDispatch();
  const resetTimeoutRef = useRef(null);
  const prevOnlineRef = useRef(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // ── Network status listener ──
  useEffect(() => {
    try {
      const unsubscribe = onStatusChange((online) => {
        dispatch(setOnlineStatus(online));

        // When switching from online to offline
        if (!online && prevOnlineRef.current) {
          showOfflineToast({
            iconDotColor: '#f59e0b',
            iconGlow: 'rgba(245, 158, 11, 0.5)',
            prefix: '⚡ Offline Mode Active:',
            message: 'You are offline. Changes will safely sync when connected.',
            duration: AUTO_DISMISS_MS,
          });
        }

        // When switching from offline to online
        if (online && !prevOnlineRef.current) {
          showOfflineToast({
            iconDotColor: '#10b981',
            iconGlow: 'rgba(16, 185, 129, 0.5)',
            prefix: '🟢 Back Online:',
            message: 'Connection restored. Syncing offline changes to cloud...',
            duration: AUTO_DISMISS_MS,
          });
        }

        prevOnlineRef.current = online;
      });

      return () => {
        unsubscribe && unsubscribe();
        if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      };
    } catch (e) {
      console.warn('[OfflineBanner] Status listener error:', e);
    }
  }, [dispatch]);

  // ── Subscribe to sync engine events ──
  useEffect(() => {
    try {
      const unsubs = [
        onSyncEvent('sync-start', (data) => {
          const total = data?.total || 0;
          dispatch(setSyncStatus('syncing'));
          dispatch(setSyncProgress({ processed: 0, total, succeeded: 0, failed: 0 }));
        }),
        onSyncEvent('sync-progress', (progress) => {
          if (progress) dispatch(setSyncProgress(progress));
        }),
        onSyncEvent('sync-complete', (result) => {
          if (result) {
            dispatch(setSyncComplete(result));
            const errors = result.errors || [];
            if (errors.length === 0) {
              showOfflineToast({
                iconDotColor: '#10b981',
                iconGlow: 'rgba(16, 185, 129, 0.6)',
                prefix: '✨ Synced Successfully:',
                message: 'All offline data saved to cloud!',
                duration: AUTO_DISMISS_MS,
              });

              if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
              resetTimeoutRef.current = setTimeout(() => {
                dispatch(resetSyncStatus());
              }, AUTO_DISMISS_MS);
            }
          }
        }),
        onSyncEvent('sync-error', (error) => {
          if (error) {
            dispatch(setSyncError(error));
            showOfflineToast({
              iconDotColor: '#ef4444',
              iconGlow: 'rgba(239, 68, 68, 0.6)',
              prefix: '⚠️ Sync Notice:',
              message: 'Temporary sync issue. Will retry automatically.',
              duration: 6000,
            });
          }
        }),
        onSyncEvent('queue-change', (data) => {
          const count = data?.count ?? 0;
          dispatch(setPendingCount(count));
        }),
      ];

      return () => {
        unsubs.forEach((unsub) => unsub && unsub());
        if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      };
    } catch (e) {
      console.warn('[OfflineBanner] Sync event error:', e);
    }
  }, [dispatch]);

  // ── Poll pending count in background ──
  useEffect(() => {
    const updateCount = async () => {
      try {
        const count = await getQueueCount();
        dispatch(setPendingCount(count || 0));
      } catch {}
    };

    updateCount();
    const interval = setInterval(updateCount, 10000);
    return () => clearInterval(interval);
  }, [dispatch]);

  // Returns null so ONLY the unified hot-toast popup appears (no double banners)
  return null;
};

export default OfflineBanner;

