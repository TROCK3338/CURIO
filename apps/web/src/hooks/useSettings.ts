/**
 * Settings Hook
 * Manages user preferences with local persistence and sync
 */

import { useState, useEffect, useCallback } from 'react';
import { getSettings, saveSettings, resetSettings, DEFAULT_SETTINGS } from '../services/indexeddb';
import { initializeSync, stopSync, triggerManualSync, getSyncStatus } from '../services/sync';
import type { UserSettings } from '@mindspace/shared';

export function useSettings() {
  const [settings, setSettingsState] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());

  // Load settings on mount
  useEffect(() => {
    const load = async () => {
      const stored = await getSettings();
      setSettingsState(stored);
      await initializeSync(stored);
      setSyncStatus(getSyncStatus());
      setIsLoading(false);
    };
    load();
  }, []);

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
  }, []);

  return {
    settings,
    isLoading,
    syncStatus,
    updateSettings,
    reset,
    manualSync,
  };
}

/* ============================================
   Theme Application
   ============================================ */

function applyTheme(theme: UserSettings['theme']): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (theme === 'system') {
    root.classList.toggle('dark', systemDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
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