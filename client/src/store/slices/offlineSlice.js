/**
 * offlineSlice.js — Redux state for Offline-First HMS
 *
 * Exposes offline/online status, sync progress, and pending queue count
 * to all React components via Redux. Driven by events from
 * networkStatus.js and syncEngine.js.
 */

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncStatus: 'idle', // 'idle' | 'syncing' | 'error' | 'complete'
  pendingCount: 0,
  lastSyncAt: null,
  syncProgress: null, // { processed, total, succeeded, failed }
  syncErrors: [],
};

const offlineSlice = createSlice({
  name: 'offline',
  initialState,
  reducers: {
    setOnlineStatus(state, action) {
      state.isOnline = action.payload;
      // Reset sync status when coming online
      if (action.payload && state.syncStatus === 'error') {
        state.syncStatus = 'idle';
      }
    },

    setSyncStatus(state, action) {
      state.syncStatus = action.payload;
    },

    setPendingCount(state, action) {
      state.pendingCount = action.payload;
    },

    setSyncProgress(state, action) {
      state.syncProgress = action.payload;
    },

    setSyncComplete(state, action) {
      const { succeeded, failed, errors, remainingCount } = action.payload;
      state.syncStatus = errors.length > 0 ? 'error' : 'complete';
      state.pendingCount = remainingCount;
      state.lastSyncAt = Date.now();
      state.syncProgress = null;
      state.syncErrors = errors.map((e) => ({
        message: e.error || e.message,
        description: e.operation?.description || '',
        timestamp: Date.now(),
      }));

      // Auto-reset to idle after success
      if (state.syncStatus === 'complete') {
        // Will be reset by the component after showing success toast
      }
    },

    setSyncError(state, action) {
      state.syncStatus = 'error';
      state.syncErrors = [
        {
          message: action.payload.message,
          authExpired: action.payload.authExpired || false,
          timestamp: Date.now(),
        },
      ];
    },

    clearSyncErrors(state) {
      state.syncErrors = [];
      if (state.syncStatus === 'error') {
        state.syncStatus = 'idle';
      }
    },

    resetSyncStatus(state) {
      state.syncStatus = 'idle';
      state.syncProgress = null;
    },
  },
});

export const {
  setOnlineStatus,
  setSyncStatus,
  setPendingCount,
  setSyncProgress,
  setSyncComplete,
  setSyncError,
  clearSyncErrors,
  resetSyncStatus,
} = offlineSlice.actions;

export default offlineSlice.reducer;
