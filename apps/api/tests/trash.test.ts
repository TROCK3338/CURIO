import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB layer at a throwaway local libSQL file before it is imported
process.env.TURSO_DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'curio-trash-')), 'test.db')}`;
process.env.TURSO_AUTH_TOKEN = 'test';

const db = await import('../lib/db');

function item(id: string, userId: string) {
  const now = new Date().toISOString();
  return {
    id, userId, url: `https://example.com/${id}`, platform: 'instagram' as const,
    title: `Item ${id}`, userNote: null, summary: null, tags: ['food'], entities: {},
    embedding: null, mediaUrl: null, thumbnailUrl: null,
    authorUsername: null, authorDisplayName: null, publishedAt: null,
    savedAt: now, updatedAt: now, enrichmentStatus: 'enriched' as const, enrichmentError: null,
  };
}

const ids = async (status?: 'active' | 'done' | 'all' | 'deleted') =>
  (await db.searchItems('', { userId: 'user-a', status })).items.map(i => i.id).sort();

beforeAll(async () => {
  await db.initializeSchema();
  for (const id of ['t1', 't2', 't3']) await db.upsertItem(item(id, 'user-a'));
  await db.upsertItem(item('u1', 'user-b'));
});

describe('recently deleted', () => {
  it('moves a save to Recently deleted, scoped to its owner', async () => {
    expect(await db.trashItem('t1', 'user-b')).toBe(false);
    expect(await db.trashItem('t1', 'user-a')).toBe(true);
    expect((await db.getItem('t1', 'user-a'))?.deletedAt).toBeTruthy();
  });

  it('hides deleted saves everywhere except the deleted list', async () => {
    expect(await ids('all')).toEqual(['t2', 't3']);
    expect(await ids('active')).toEqual(['t2', 't3']);
    expect(await ids()).toEqual(['t2', 't3']);
    expect(await ids('deleted')).toEqual(['t1']);
    const facets = await db.getLibraryFacets('user-a');
    expect(facets.total).toBe(2);
    expect(facets.deleted).toBe(1);
  });

  it('restores a deleted save', async () => {
    expect(await db.restoreItem('t1', 'user-a')).toBe(true);
    expect(await ids('all')).toEqual(['t1', 't2', 't3']);
    expect(await ids('deleted')).toEqual([]);
  });

  it('purges only saves deleted more than 7 days ago', async () => {
    await db.trashItem('t2', 'user-a');
    await db.trashItem('t3', 'user-a');
    const eightDaysAgo = new Date(Date.now() - 8 * 86400_000).toISOString();
    await db.getDb().execute({ sql: `UPDATE items SET deleted_at = ? WHERE id = 't2'`, args: [eightDaysAgo] });

    expect(await db.purgeDeletedItems()).toBe(1);
    expect(await db.getItem('t2', 'user-a')).toBeNull();
    expect(await ids('deleted')).toEqual(['t3']);
  });
});
