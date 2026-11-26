import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB layer at a throwaway local libSQL file before it is imported
process.env.TURSO_DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'curio-done-')), 'test.db')}`;
process.env.TURSO_AUTH_TOKEN = 'test';

const db = await import('../lib/db');

function item(id: string, userId: string, platform: 'instagram' | 'youtube' = 'instagram') {
  const now = new Date().toISOString();
  return {
    id, userId, url: `https://example.com/${id}`, platform,
    title: `Item ${id}`, userNote: null, summary: null, tags: ['food'],
    entities: id === 'a2' ? { recipe: { name: 'Pasta', ingredients: [], instructions: [] } } : {},
    embedding: null, mediaUrl: null, thumbnailUrl: null,
    authorUsername: null, authorDisplayName: null, publishedAt: null,
    savedAt: now, updatedAt: now, doneAt: null,
    enrichmentStatus: 'enriched' as const, enrichmentError: null,
  };
}

beforeAll(async () => {
  await db.initializeSchema();
  for (const id of ['a1', 'a2', 'a3']) await db.upsertItem(item(id, 'user-a'));
  await db.upsertItem(item('b1', 'user-b'));
});

describe('done saves', () => {
  it('marks a save done and back, scoped to its owner', async () => {
    expect(await db.setItemDone('a2', 'user-b', true)).toBe(false);
    expect(await db.setItemDone('a2', 'user-a', true)).toBe(true);
    expect((await db.getItem('a2', 'user-a'))?.doneAt).toBeTruthy();
  });

  it('filters by status: active, done or all', async () => {
    const ids = async (status?: 'active' | 'done' | 'all') =>
      (await db.searchItems('', { userId: 'user-a', status })).items.map(i => i.id).sort();
    expect(await ids('active')).toEqual(['a1', 'a3']);
    expect(await ids('done')).toEqual(['a2']);
    expect(await ids('all')).toEqual(['a1', 'a2', 'a3']);
    expect(await ids()).toEqual(['a1', 'a2', 'a3']);
  });

  it('counts only active saves in facets and reports the done count', async () => {
    const facets = await db.getLibraryFacets('user-a');
    expect(facets.total).toBe(2);
    expect(facets.done).toBe(1);
    expect(facets.entities.recipe).toBe(0);
    expect(facets.platforms.instagram).toBe(2);
  });

  it('a re-save upsert keeps the done state; undo clears it', async () => {
    await db.upsertItem(item('a2', 'user-a'));
    expect((await db.getItem('a2', 'user-a'))?.doneAt).toBeTruthy();
    expect(await db.setItemDone('a2', 'user-a', false)).toBe(true);
    expect((await db.getItem('a2', 'user-a'))?.doneAt).toBeNull();
  });
});
