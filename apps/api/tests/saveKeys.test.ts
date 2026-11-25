import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the DB layer at a throwaway local libSQL file before it is imported
process.env.TURSO_DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'curio-keys-')), 'test.db')}`;
process.env.TURSO_AUTH_TOKEN = 'test';
process.env.CLERK_SECRET_KEY = 'sk_test_dummy';

const { initializeSchema, getDb } = await import('../lib/db');
const keys = await import('../lib/apiKeys');
const { requireAuth } = await import('../lib/auth');

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.setHeader = () => res;
  return res;
}
const reqWith = (token: string) => ({ headers: { authorization: `Bearer ${token}` } }) as any;

beforeAll(async () => {
  await initializeSchema();
});

describe('save keys', () => {
  it('creates a key that is shown once and stored only as a hash', async () => {
    const { key, summary } = await keys.createSaveKey('user-a', 'My iPhone');
    expect(key.startsWith(keys.SAVE_KEY_PREFIX)).toBe(true);
    expect(summary.label).toBe('My iPhone');
    expect(key.startsWith(summary.prefix)).toBe(true);

    const rows = await getDb().execute('SELECT key_hash FROM api_keys');
    const stored = rows.rows.map(r => String(r.key_hash));
    expect(stored).not.toContain(key);
    expect(stored).toContain(keys.hashKey(key));
  });

  it('verifies, lists, scopes to the owner and revokes', async () => {
    const { key, summary } = await keys.createSaveKey('user-b', '');
    expect(summary.label).toBe('iPhone Shortcut');
    expect(await keys.verifySaveKey(key)).toBe('user-b');
    expect((await keys.listSaveKeys('user-b')).map(k => k.id)).toEqual([summary.id]);

    // Another user can't revoke it
    expect(await keys.revokeSaveKey('user-a', summary.id)).toBe(false);
    expect(await keys.verifySaveKey(key)).toBe('user-b');

    expect(await keys.revokeSaveKey('user-b', summary.id)).toBe(true);
    expect(await keys.verifySaveKey(key)).toBeNull();
    expect(await keys.listSaveKeys('user-b')).toEqual([]);
  });

  it('rejects malformed and unknown keys', async () => {
    expect(await keys.verifySaveKey('curio_sk_short')).toBeNull();
    expect(await keys.verifySaveKey(`${keys.SAVE_KEY_PREFIX}${'x'.repeat(32)}`)).toBeNull();
    expect(await keys.verifySaveKey('not-a-key')).toBeNull();
  });

  it('caps active keys per user', async () => {
    for (let i = 0; i < 10; i++) await keys.createSaveKey('user-c', `k${i}`);
    await expect(keys.createSaveKey('user-c', 'one too many')).rejects.toThrow(/already have 10/);
  });
});

describe('requireAuth with save keys', () => {
  it('accepts a valid key only on routes that opt in', async () => {
    const { key } = await keys.createSaveKey('user-d', 'shortcut');

    const ok = mockRes();
    expect(await requireAuth(reqWith(key), ok, { allowSaveKey: true })).toBe('user-d');

    const blocked = mockRes();
    expect(await requireAuth(reqWith(key), blocked)).toBeNull();
    expect(blocked.statusCode).toBe(403);
  });

  it('rejects revoked keys with 401', async () => {
    const { key, summary } = await keys.createSaveKey('user-e', 'shortcut');
    await keys.revokeSaveKey('user-e', summary.id);
    const res = mockRes();
    expect(await requireAuth(reqWith(key), res, { allowSaveKey: true })).toBeNull();
    expect(res.statusCode).toBe(401);
  });
});
