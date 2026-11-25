/**
 * Settings Hook
 * Manages user preferences with local persistence and sync
 */

import { useState, useEffect, useCallback } from 'react';
import { getSettings, saveSettings, resetSettings, DEFAULT_SETTINGS, getPendingQueue } from '../services/indexeddb';
import { initializeSync, stopSync, triggerManualSync, getSyncStatus } from '../services/sync';
import type { UserSettings } from '@curio/shared';

export function useSettings() {
  const [settings, setSettingsState] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [queuedCount, setQueuedCount] = useState(0);

  const refreshQueuedCount = useCallback(async () => {
    const pending = await getPendingQueue();
    setQueuedCount(pending.length);
  }, []);

  // Load settings on mount
  useEffect(() => {
    const load = async () => {
      let stored = await getSettings();
      // First launch of the redesigned app: start in dark mode (the new default)
      let themeKnown = false;
      try { themeKnown = localStorage.getItem(THEME_STORAGE_KEY) !== null; } catch { /* private mode */ }
      if (!themeKnown && stored.theme !== 'dark') {
        stored = { ...stored, theme: 'dark' };
        await saveSettings(stored);
      }
      applyTheme(stored.theme);
      setSettingsState(stored);
      await initializeSync(stored);
      setSyncStatus(getSyncStatus());
      await refreshQueuedCount();
      setIsLoading(false);
    };
    load();
    const refreshSyncStatus = () => setSyncStatus(getSyncStatus());
    window.addEventListener('sync-state', refreshSyncStatus);
    window.addEventListener('online', refreshSyncStatus);
    window.addEventListener('offline', refreshSyncStatus);
    window.addEventListener('queue-updated', refreshQueuedCount);
    window.addEventListener('sync-complete', refreshQueuedCount);
    window.addEventListener('sync-errors', refreshQueuedCount);
    return () => {
      window.removeEventListener('sync-state', refreshSyncStatus);
      window.removeEventListener('online', refreshSyncStatus);
      window.removeEventListener('offline', refreshSyncStatus);
      window.removeEventListener('queue-updated', refreshQueuedCount);
      window.removeEventListener('sync-complete', refreshQueuedCount);
      window.removeEventListener('sync-errors', refreshQueuedCount);
    };
  }, [refreshQueuedCount]);

  // Persist settings changes
  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettingsState(newSettings);
    await saveSettings(newSettings);

    // Re-initialize sync if sync settings changed
    if (updates.syncEnabled !== undefined || updates.syncIntervalMinutes !== undefined || updates.wifiOnlySync !== undefined) {
      await initializeSync(newSettings);
      setSyncStatus(getSyncStatus());
    }

    // Apply theme immediately
    if (updates.theme) {
      applyTheme(newSettings.theme);
    }
  }, [settings]);

  const reset = useCallback(async () => {
    await resetSettings();
    setSettingsState(DEFAULT_SETTINGS);
    await initializeSync(DEFAULT_SETTINGS);
    setSyncStatus(getSyncStatus());
    applyTheme(DEFAULT_SETTINGS.theme);
  }, []);

  const manualSync = useCallback(async () => {
    await triggerManualSync();
    setSyncStatus(getSyncStatus());
    await refreshQueuedCount();
  }, [refreshQueuedCount]);

  return {
    settings,
    isLoading,
    syncStatus: { ...syncStatus, queuedCount },
    updateSettings,
    reset,
    manualSync,
  };
}

/* ============================================
   Theme Application
   ============================================ */

const THEME_STORAGE_KEY = 'curio.theme';

export function applyTheme(theme: UserSettings['theme']): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  root.classList.toggle('dark', dark);

  // Remembered for the pre-paint script in index.html
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* private mode */ }

  // Match the browser / status bar chrome to the app background
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', dark ? '#0b0a10' : '#f9f9fb');
}

/* ============================================
   Theme Hook (for components that need it)
   ============================================ */

export function useTheme() {
  const { settings, updateSettings } = useSettings();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const update = () => {
      const isDark = settings.theme === 'dark' ||
        (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setResolvedTheme(isDark ? 'dark' : 'light');
    };
    update();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [settings.theme]);

  const toggleTheme = useCallback(() => {
    const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: newTheme });
  }, [resolvedTheme, updateSettings]);

  return { theme: resolvedTheme, toggleTheme, setTheme: (t: UserSettings['theme']) => updateSettings({ theme: t }) };
}

/* ============================================
   Keyboard Shortcuts Hook
   ============================================ */

export function useKeyboardShortcuts(actions: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      const modifier = e.metaKey || e.ctrlKey;

      // CMD/CTRL + K = Search
      if (modifier && key === 'k') {
        e.preventDefault();
        actions.search?.();
      }
      // CMD/CTRL + N = New/Chat
      if (modifier && key === 'n') {
        e.preventDefault();
        actions.chat?.();
      }
      // Escape = Close modals/clear search
      if (key === 'escape') {
        actions.escape?.();
      }
      // / = Focus search (when not in input)
      if (key === '/' && !modifier) {
        e.preventDefault();
        actions.search?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions]);
}
