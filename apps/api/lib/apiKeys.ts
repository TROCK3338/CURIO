/**
 * Personal save keys for the iOS Shortcut ("silent save").
 *
 * A key is shown to the user once. We store only its SHA-256 hash plus a short
 * prefix for display. Keys are deliberately limited to saving links: routes
 * opt in with requireAuth(req, res, { allowSaveKey: true }), and only
 * /api/ingest does.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from './db.js';

export const SAVE_KEY_PREFIX = 'curio_sk_';
const MAX_ACTIVE_KEYS = 10;

export interface SaveKeySummary {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function looksLikeSaveKey(token: string): boolean {
  return token.startsWith(SAVE_KEY_PREFIX) && token.length > SAVE_KEY_PREFIX.length + 20;
}

export async function createSaveKey(userId: string, label: string): Promise<{ key: string; summary: SaveKeySummary }> {
  const db = getDb();
  const active = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ? AND revoked_at IS NULL`,
    args: [userId],
  });
  if (Number(active.rows[0]?.n ?? 0) >= MAX_ACTIVE_KEYS) {
    throw new Error(`You already have ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
  }

  const key = SAVE_KEY_PREFIX + randomBytes(24).toString('base64url');
  const summary: SaveKeySummary = {
    id: randomUUID(),
    label: label.trim().slice(0, 60) || 'iPhone Shortcut',
    prefix: key.slice(0, SAVE_KEY_PREFIX.length + 4),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };

  await db.execute({
    sql: `INSERT INTO api_keys (id, user_id, key_hash, prefix, label, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [summary.id, userId, hashKey(key), summary.prefix, summary.label, summary.createdAt],
  });

  return { key, summary };
}

export async function listSaveKeys(userId: string): Promise<SaveKeySummary[]> {
  const result = await getDb().execute({
    sql: `SELECT id, label, prefix, created_at, last_used_at FROM api_keys
          WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
    args: [userId],
  });
  return result.rows.map(r => ({
    id: String(r.id),
    label: String(r.label),
    prefix: String(r.prefix),
    createdAt: String(r.created_at),
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
  }));
}

export async function revokeSaveKey(userId: string, id: string): Promise<boolean> {
  const result = await getDb().execute({
    sql: `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    args: [new Date().toISOString(), id, userId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/** Returns the owner's user id for a valid, unrevoked key, or null. */
export async function verifySaveKey(key: string): Promise<string | null> {
  if (!looksLikeSaveKey(key)) return null;
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, user_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`,
    args: [hashKey(key)],
  });
  const row = result.rows[0];
  if (!row) return null;

  // Best effort; never block a save on this
  db.execute({
    sql: `UPDATE api_keys SET last_used_at = ? WHERE id = ?`,
    args: [new Date().toISOString(), String(row.id)],
  }).catch(() => {});

  return String(row.user_id);
}
