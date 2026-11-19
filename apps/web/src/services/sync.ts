/**
 * Background Sync Service
 * Handles offline queue processing, periodic sync, and network detection
 */

import { getPendingQueue, syncQueue, clearSyncedQueue } from './indexeddb';
import { ingestItem } from './api';
import { registerBackgroundSync } from '../utils/sw';
import type { UserSettings } from '@mindspace/shared';

let syncInterval: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let currentSettings: UserSettings | null = null;

/* ============================================
   Sync Orchestration
   ============================================ */

export async function initializeSync(settings: UserSettings): Promise<void> {
  currentSettings = settings;

  if (!settings.syncEnabled) {
    stopSync();
    return;
  }

  // Initial sync
  await performSync();

  // Set up periodic sync
  startPeriodicSync(settings.syncIntervalMinutes);

  // Register background sync for when app is closed
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    await registerBackgroundSync('curio-sync');
  }

  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Listen for visibility change (sync when tab becomes visible)
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

export function stopSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

function startPeriodicSync(intervalMinutes: number): void {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(() => {
    if (shouldSync()) {
      performSync();
    }
  }, intervalMinutes * 60 * 1000);
}

function shouldSync(): boolean {
  if (!currentSettings?.syncEnabled) return false;
  if (currentSettings.wifiOnlySync && !isWifi()) return false;
  if (!navigator.onLine) return false;
  return true;
}

function isWifi(): boolean {
  // @ts-ignore - Network Information API
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true; // Assume wifi if API not available
  return connection.type === 'wifi' || connection.effectiveType === '4g';
}

/* ============================================
   Event Handlers
   ============================================ */

function handleOnline(): void {
  console.log('[Sync] Online - triggering sync');
  if (shouldSync()) performSync();
}

function handleOffline(): void {
  console.log('[Sync] Offline - pausing sync');
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible' && shouldSync()) {
    console.log('[Sync] Tab visible - triggering sync');
    performSync();
  }
}

/* ============================================
   Core Sync Logic
   ============================================ */

async function performSync(): Promise<void> {
  if (isSyncing || !navigator.onLine) return;

  isSyncing = true;
  console.log('[Sync] Starting sync...');

  try {
    const result = await syncQueue(ingestItem);
    console.log('[Sync] Completed:', result);

    if (result.synced > 0) {
      // Notify UI of new items
      window.dispatchEvent(new CustomEvent('sync-complete', { detail: result }));
    }

    if (result.failed > 0) {
      window.dispatchEvent(new CustomEvent('sync-errors', { detail: result }));
    }

    // Clean up old synced items periodically
    await clearSyncedQueue();
  } catch (error) {
    console.error('[Sync] Failed:', error);
    window.dispatchEvent(new CustomEvent('sync-error', { detail: error }));
  } finally {
    isSyncing = false;
  }
}

/* ============================================
   Manual Sync Trigger
   ============================================ */

export async function triggerManualSync(): Promise<void> {
  if (!navigator.onLine) {
    throw new Error('Cannot sync while offline');
  }
  await performSync();
}

export function getSyncStatus(): { isSyncing: boolean; isOnline: boolean; wifiOnly: boolean } {
  return {
    isSyncing,
    isOnline: navigator.onLine,
    wifiOnly: currentSettings?.wifiOnlySync ?? true,
  };
}

/* ============================================
   Cleanup
   ============================================ */

export function cleanup(): void {
  stopSync();
}