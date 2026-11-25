/**
 * Share Target Hook
 * Handles Web Share Target API data, offline queue, and user feedback
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { addToQueue, getPendingQueue, parseShareTargetData } from '../services/indexeddb';
import { ingestItem } from '../services/api';
import { initializeSync, triggerManualSync, getSyncStatus } from '../services/sync';
import { getSettings } from '../services/indexeddb';
import type { ShareTargetData, IngestRequest } from '@curio/shared';

export interface ShareTargetState {
  isProcessing: boolean;
  isOffline: boolean;
  lastResult: 'success' | 'error' | null;
  error: string | null;
  queuedCount: number;
}

export function useShareTarget(): ShareTargetState & {
  processShareData: (data: ShareTargetData) => Promise<void>;
  retryQueue: () => Promise<void>;
} {
  const navigate = useNavigate();
  const [state, setState] = useState<ShareTargetState>({
    isProcessing: false,
    isOffline: !navigator.onLine,
    lastResult: null,
    error: null,
    queuedCount: 0,
  });

  // Initialize sync on mount
  useEffect(() => {
    const init = async () => {
      const settings = await getSettings();
      await initializeSync(settings);
      updateQueuedCount();
    };
    init();

    const handleOnline = () => {
      setState(s => ({ ...s, isOffline: false }));
      updateQueuedCount();
    };
    const handleOffline = () => setState(s => ({ ...s, isOffline: true }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updateQueuedCount = useCallback(async () => {
    const pending = await getPendingQueue();
    setState(s => ({ ...s, queuedCount: pending.length }));
  }, []);

  const processShareData = useCallback(async (data: ShareTargetData) => {
    setState(s => ({ ...s, isProcessing: true, lastResult: null, error: null }));

    const { url, title, text } = parseShareTargetData(data);

    if (!url) {
      setState(s => ({ ...s, isProcessing: false, lastResult: 'error', error: 'No URL provided' }));
      return;
    }

    const payload: IngestRequest = { url, title, text };

    if (!navigator.onLine) {
      await addToQueue({ url, title, text });
      window.dispatchEvent(new Event('queue-updated'));
      setState(s => ({ ...s, isProcessing: false, lastResult: 'success', queuedCount: s.queuedCount + 1 }));
    } else {
      try {
        const result = await ingestItem(payload);
        if (!result.success || !result.item) throw new Error(result.error || 'The server did not confirm the save.');
        setState(s => ({ ...s, isProcessing: false, lastResult: 'success' }));
      } catch (error) {
        if (error instanceof TypeError) {
          await addToQueue({ url, title, text });
          window.dispatchEvent(new Event('queue-updated'));
          setState(s => ({ ...s, isProcessing: false, lastResult: 'success', queuedCount: s.queuedCount + 1 }));
        } else {
          setState(s => ({
            ...s,
            isProcessing: false,
            lastResult: 'error',
            error: error instanceof Error ? error.message : 'Save failed',
          }));
          return;
        }
      }
    }

    // Navigate to home after a moment
    setTimeout(() => navigate('/'), 1500);
  }, [navigate]);

  const retryQueue = useCallback(async () => {
    if (state.isProcessing) return;
    setState(s => ({ ...s, isProcessing: true }));

    try {
      await triggerManualSync();
      await updateQueuedCount();
      setState(s => ({ ...s, isProcessing: false, lastResult: 'success' }));
    } catch (error) {
      setState(s => ({
        ...s,
        isProcessing: false,
        lastResult: 'error',
        error: error instanceof Error ? error.message : 'Sync failed',
      }));
    }
  }, [state.isProcessing, updateQueuedCount]);

  return { ...state, processShareData, retryQueue };
}

/* ============================================
   URL Parameter Parsing for Share Target
   ============================================ */

export function getShareTargetDataFromURL(): ShareTargetData | null {
  const params = new URLSearchParams(window.location.search);

  // Check for share target parameters
  const title = params.get('title');
  const text = params.get('text');
  const url = params.get('url');

  if (!title && !text && !url) return null;

  return { title: title || undefined, text: text || undefined, url: url || undefined };
}

/* ============================================
   File Handling (for future image/video shares)
   ============================================ */

export async function processSharedFiles(files: File[]): Promise<{ images: File[]; videos: File[] }> {
  const images: File[] = [];
  const videos: File[] = [];

  for (const file of files) {
    if (file.type.startsWith('image/')) images.push(file);
    else if (file.type.startsWith('video/')) videos.push(file);
  }

  return { images, videos };
}
