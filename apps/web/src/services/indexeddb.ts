/**
 * IndexedDB Service (via Dexie.js)
 * Offline-first storage for saved items, queue, and settings
 */

import Dexie, { type Table } from 'dexie';
import type { SavedItem, OfflineQueueItem, UserSettings, ShareTargetData } from '@mindspace/shared';

class MindSpaceDB extends Dexie {
  items!: Table<SavedItem, string>;
  queue!: Table<OfflineQueueItem, string>;
  settings!: Table<UserSettings, string>;

  constructor() {
    super('MindSpaceDB');
    this.version(1).stores({
      items: 'id, url, platform, savedAt, *tags, authorUsername',
      queue: 'id, createdAt, status, retries',
      settings: 'key',
    });
    this.version(2).stores({
      items: 'id, url, platform, savedAt, *tags, authorUsername, enrichmentStatus',
    }).upgrade(tx => {
      // Migration: add enrichmentStatus index
      return tx.table('items').toCollection().modify(item => {
        item.enrichmentStatus = item.enrichmentStatus || 'pending';
      });
    });
  }
}

export const db = new MindSpaceDB();

/* ============================================
   Items Operations
   ============================================ */

export async function saveItemLocally(item: SavedItem): Promise<void> {
  await db.items.put(item);
}

export async function getItemLocally(id: string): Promise<SavedItem | undefined> {
  return db.items.get(id);
}

export async function getItemsLocally(limit = 50, offset = 0): Promise<SavedItem[]> {
  return db.items
    .orderBy('savedAt')
    .reverse()
    .offset(offset)
    .limit(limit)
    .toArray();
}

export async function searchItemsLocally(query: string, limit = 20): Promise<SavedItem[]> {
  const lowerQuery = query.toLowerCase();
  return db.items
    .filter(item =>
      item.title?.toLowerCase().includes(lowerQuery) ||
      item.userNote?.toLowerCase().includes(lowerQuery) ||
      item.summary?.toLowerCase().includes(lowerQuery) ||
      item.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
      item.authorUsername?.toLowerCase().includes(lowerQuery)
    )
    .limit(limit)
    .toArray();
}

export async function getItemsByPlatform(platform: string): Promise<SavedItem[]> {
  return db.items.where('platform').equals(platform).reverse().sortBy('savedAt');
}

export async function getItemsByTag(tag: string): Promise<SavedItem[]> {
  return db.items.where('tags').equalsIgnoreCase(tag).reverse().sortBy('savedAt');
}

export async function deleteItemLocally(id: string): Promise<void> {
  await db.items.delete(id);
}

export async function clearAllItems(): Promise<void> {
  await db.items.clear();
}

/* ============================================
   Offline Queue Operations
   ============================================ */

export async function addToQueue(payload: ShareTargetData & { userNote?: string }): Promise<string> {
  const id = crypto.randomUUID();
  const queueItem: OfflineQueueItem = {
    id,
    payload: {
      url: payload.url!,
      title: payload.title,
      text: payload.text,
      userNote: payload.userNote,
    },
    createdAt: new Date().toISOString(),
    retries: 0,
    status: 'pending',
  };
  await db.queue.add(queueItem);
  return id;
}

export async function getPendingQueue(): Promise<OfflineQueueItem[]> {
  return db.queue.where('status').anyOf(['pending', 'syncing']).toArray();
}

export async function updateQueueStatus(id: string, status: OfflineQueueItem['status'], error?: string): Promise<void> {
  await db.queue.update(id, { status, error, retries: status === 'failed' ? (await db.queue.get(id))!.retries + 1 : undefined });
}

export async function clearSyncedQueue(): Promise<void> {
  await db.queue.where('status').equals('synced').delete();
}

/* ============================================
   Settings Operations
   ============================================ */

export const DEFAULT_SETTINGS: UserSettings = {
  autoTag: true,
  autoSummarize: true,
  preferredModel: 'gemini-1.5-flash',
  syncEnabled: true,
  syncIntervalMinutes: 15,
  wifiOnlySync: true,
  theme: 'system',
  defaultView: 'timeline',
  itemsPerPage: 20,
  analyticsEnabled: false,
  crashReportingEnabled: false,
};

export async function getSettings(): Promise<UserSettings> {
  const stored = await db.settings.get('user');
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...settings });
}

export async function resetSettings(): Promise<void> {
  await db.settings.put(DEFAULT_SETTINGS);
}

/* ============================================
   Sync Operations
   ============================================ */

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export async function syncQueue(apiIngest: (data: any) => Promise<any>): Promise<SyncResult> {
  const pending = await getPendingQueue();
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  for (const item of pending) {
    await updateQueueStatus(item.id, 'syncing');
    try {
      await apiIngest(item.payload);
      await updateQueueStatus(item.id, 'synced');
      result.synced++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await updateQueueStatus(item.id, 'failed', message);
      result.failed++;
      result.errors.push(`${item.payload.url}: ${message}`);
    }
  }

  return result;
}

/* ============================================
   Share Target Data Processing
   ============================================ */

export function parseShareTargetData(data: ShareTargetData): {
  url: string | null;
  title: string | null;
  text: string | null;
  files: File[];
} {
  return {
    url: data.url || null,
    title: data.title || null,
    text: data.text || null,
    files: data.files || [],
  };
}

/* ============================================
   Database Maintenance
   ============================================ */

export async function vacuum(): Promise<void> {
  // Dexie doesn't expose VACUUM directly, but we can trigger it
  await db.backendDB().then(db => db.execute('VACUUM'));
}

export async function getDBSize(): Promise<{ items: number; queue: number; settings: number }> {
  const [items, queue, settings] = await Promise.all([
    db.items.count(),
    db.queue.count(),
    db.settings.count(),
  ]);
  return { items, queue, settings };
}