/**
 * Turso (libSQL) Database Client
 * HTTP-based, works great in Vercel serverless functions
 *
 * Vector search uses Turso's built-in vector functions (vector32 /
 * vector_distance_cos) directly on the `items.embedding` BLOB column.
 * The old sqlite-vec `vec0` virtual table is not available on Turso, so it
 * is no longer used.
 */

import { createClient } from '@libsql/client';
import type { SavedItem } from './types';

// ============================================
// Client Setup
// ============================================

type LibSQLDatabase = ReturnType<typeof createClient>;

let db: LibSQLDatabase | null = null;

export function getDb(): LibSQLDatabase {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
      throw new Error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
    }

    db = createClient({ url, authToken });
  }
  return db;
}

// ============================================
// Schema Initialization
// ============================================

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'legacy',
    url TEXT NOT NULL,
    platform TEXT NOT NULL,
    title TEXT,
    user_note TEXT,
    summary TEXT,
    tags TEXT,
    entities TEXT,
    embedding BLOB,
    media_url TEXT,
    thumbnail_url TEXT,
    author_username TEXT,
    author_display_name TEXT,
    published_at TEXT,
    saved_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    enrichment_status TEXT NOT NULL DEFAULT 'pending',
    enrichment_error TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_items_platform ON items(platform)`,
  `CREATE INDEX IF NOT EXISTS idx_items_saved_at ON items(saved_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_items_author ON items(author_username)`,
  `CREATE INDEX IF NOT EXISTS idx_items_enrichment ON items(enrichment_status)`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'legacy',
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS clusters (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'legacy',
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '[]',
    representative_items TEXT NOT NULL DEFAULT '[]',
    generated_at TEXT NOT NULL
  )`,
];

async function ensureUserIdColumn(table: 'items' | 'clusters' | 'settings'): Promise<void> {
  const client = getDb();
  const info = await client.execute(`PRAGMA table_info(${table})`);
  const hasUserId = info.rows.some(r => String(r.name) === 'user_id');
  if (!hasUserId) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy'`);
  }
}

// Run the setup once per warm function instance instead of on every request.
let schemaPromise: Promise<void> | null = null;

export function initializeSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = getDb();
      await client.batch(SCHEMA_STATEMENTS, 'write');
      await ensureUserIdColumn('items');
      await ensureUserIdColumn('clusters');
      await ensureUserIdColumn('settings');
      await client.batch([
        `CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id, saved_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_clusters_user_id ON clusters(user_id, generated_at DESC)`,
      ], 'write');
    })().catch(error => {
      schemaPromise = null; // allow a retry on the next request
      throw error;
    });
  }
  return schemaPromise;
}

// ============================================
// CRUD Operations
// ============================================

function embeddingToBlob(embedding: number[] | null): Buffer | null {
  return embedding ? Buffer.from(new Float32Array(embedding).buffer) : null;
}

export async function insertItem(item: SavedItem): Promise<void> {
  const db = getDb();
  const userId = item.userId || 'legacy';

  await db.execute({
    sql: `
      INSERT INTO items (
        id, user_id, url, platform, title, user_note, summary, tags, entities,
        embedding, media_url, thumbnail_url, author_username,
        author_display_name, published_at, saved_at, updated_at,
        enrichment_status, enrichment_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      item.id,
      userId,
      item.url,
      item.platform,
      item.title,
      item.userNote,
      item.summary,
      JSON.stringify(item.tags),
      JSON.stringify(item.entities),
      embeddingToBlob(item.embedding),
      item.mediaUrl,
      item.thumbnailUrl,
      item.authorUsername,
      item.authorDisplayName,
      item.publishedAt,
      item.savedAt,
      item.updatedAt,
      item.enrichmentStatus,
      item.enrichmentError,
    ],
  });
}

export async function upsertItem(item: SavedItem): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const userId = item.userId || 'legacy';

  await db.execute({
    sql: `
      INSERT INTO items (
        id, user_id, url, platform, title, user_note, summary, tags, entities,
        embedding, media_url, thumbnail_url, author_username,
        author_display_name, published_at, saved_at, updated_at,
        enrichment_status, enrichment_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        user_note = excluded.user_note,
        summary = excluded.summary,
        tags = excluded.tags,
        entities = excluded.entities,
        embedding = excluded.embedding,
        media_url = excluded.media_url,
        thumbnail_url = excluded.thumbnail_url,
        author_username = excluded.author_username,
        author_display_name = excluded.author_display_name,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at,
        enrichment_status = excluded.enrichment_status,
        enrichment_error = excluded.enrichment_error
    `,
    args: [
      item.id,
      userId,
      item.url,
      item.platform,
      item.title,
      item.userNote,
      item.summary,
      JSON.stringify(item.tags),
      JSON.stringify(item.entities),
      embeddingToBlob(item.embedding),
      item.mediaUrl,
      item.thumbnailUrl,
      item.authorUsername,
      item.authorDisplayName,
      item.publishedAt,
      item.savedAt,
      now,
      item.enrichmentStatus,
      item.enrichmentError,
    ],
  });
}

export async function getItem(id: string, userId?: string): Promise<SavedItem | null> {
  const db = getDb();
  const result = userId
    ? await db.execute({ sql: `SELECT * FROM items WHERE id = ? AND user_id = ?`, args: [id, userId] })
    : await db.execute({ sql: `SELECT * FROM items WHERE id = ?`, args: [id] });

  if (result.rows.length === 0) return null;
  return rowToItem(result.rows[0]);
}

export function rowToItem(row: Record<string, unknown>): SavedItem {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : undefined,
    url: String(row.url),
    platform: row.platform as SavedItem['platform'],
    title: row.title as string | null,
    userNote: row.user_note as string | null,
    summary: row.summary as string | null,
    tags: row.tags ? JSON.parse(String(row.tags)) : [],
    entities: row.entities ? JSON.parse(String(row.entities)) : {},
    embedding: row.embedding ? Array.from(new Float32Array(row.embedding as ArrayBuffer)) : null,
    mediaUrl: row.media_url as string | null,
    thumbnailUrl: row.thumbnail_url as string | null,
    authorUsername: row.author_username as string | null,
    authorDisplayName: row.author_display_name as string | null,
    publishedAt: row.published_at as string | null,
    savedAt: String(row.saved_at),
    updatedAt: String(row.updated_at),
    enrichmentStatus: row.enrichment_status as SavedItem['enrichmentStatus'],
    enrichmentError: row.enrichment_error as string | null,
  };
}

export async function getItemByUrl(url: string, userId?: string): Promise<SavedItem | null> {
  const db = getDb();
  const result = userId
    ? await db.execute({ sql: `SELECT * FROM items WHERE url = ? AND user_id = ?`, args: [url, userId] })
    : await db.execute({ sql: `SELECT * FROM items WHERE url = ?`, args: [url] });

  if (result.rows.length === 0) return null;
  return rowToItem(result.rows[0]);
}

// ============================================
// Search Operations
// ============================================

export interface SearchFilters {
  userId?: string;
  platform?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  enrichmentStatus?: string;
}

function buildFilterConditions(filters: SearchFilters): { conditions: string[]; args: (string | number)[] } {
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (filters.userId) {
    conditions.push(`user_id = ?`);
    args.push(filters.userId);
  }

  if (filters.platform) {
    conditions.push(`platform = ?`);
    args.push(filters.platform);
  }

  if (filters.tags && filters.tags.length > 0) {
    const tagConditions = filters.tags.map(() => `JSON_EXTRACT(tags, '$') LIKE ?`).join(' OR ');
    conditions.push(`(${tagConditions})`);
    filters.tags.forEach(tag => args.push(`%${tag}%`));
  }

  if (filters.dateFrom) {
    conditions.push(`saved_at >= ?`);
    args.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push(`saved_at <= ?`);
    args.push(filters.dateTo);
  }

  if (filters.enrichmentStatus) {
    conditions.push(`enrichment_status = ?`);
    args.push(filters.enrichmentStatus);
  }

  return { conditions, args };
}

export async function searchItems(
  query: string,
  filters: SearchFilters = {},
  limit = 20,
  offset = 0
): Promise<{ items: SavedItem[]; total: number }> {
  const db = getDb();

  const { conditions, args } = buildFilterConditions(filters);

  if (query.trim()) {
    conditions.unshift(`(
      title LIKE ? OR
      user_note LIKE ? OR
      summary LIKE ? OR
      tags LIKE ? OR
      author_username LIKE ? OR
      author_display_name LIKE ?
    )`);
    const likeQuery = `%${query}%`;
    args.unshift(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as total FROM items ${whereClause}`,
    args,
  });
  const total = Number(countResult.rows[0]?.total ?? 0);

  const itemsResult = await db.execute({
    sql: `
      SELECT * FROM items
      ${whereClause}
      ORDER BY saved_at DESC
      LIMIT ? OFFSET ?
    `,
    args: [...args, limit, offset],
  });

  const items = itemsResult.rows.map(rowToItem);
  return { items, total };
}

/**
 * Meaning-based search: ranks saved items by cosine distance between the
 * query embedding and each item's stored embedding (brute force, which is
 * perfectly fast for a personal library). Falls back to keyword search if
 * vector search is unavailable or finds nothing.
 */
export async function semanticSearch(
  queryEmbedding: Float32Array,
  filters: SearchFilters = {},
  limit = 20,
  offset = 0,
  fallbackQuery = ''
): Promise<{ items: SavedItem[]; total: number }> {
  const db = getDb();

  const { conditions, args } = buildFilterConditions(filters);
  conditions.unshift('embedding IS NOT NULL');
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // vector32() takes a JSON array of numbers and builds the vector for us.
  const queryVector = `[${Array.from(queryEmbedding).join(',')}]`;

  try {
    const result = await db.execute({
      sql: `
        SELECT *, vector_distance_cos(embedding, vector32(?)) AS distance
        FROM items
        ${whereClause}
        ORDER BY distance ASC
        LIMIT ? OFFSET ?
      `,
      args: [queryVector, ...args, limit, offset],
    });

    const items = result.rows.map(rowToItem);
    if (items.length === 0 && fallbackQuery.trim()) {
      return searchItems(fallbackQuery, filters, limit, offset);
    }

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as total FROM items ${whereClause}`,
      args,
    });
    const total = Number(countResult.rows[0]?.total ?? 0);

    return { items, total };
  } catch (e) {
    console.warn('[DB] Vector search failed, falling back to keyword:', e);
    return searchItems(fallbackQuery, filters, limit, offset);
  }
}

// ============================================
// Clustering / Analytics
// ============================================

export interface ClusterRow {
  id: string;
  user_id?: string;
  label: string;
  description: string;
  item_count: number;
  tags: string;
  representative_items: string;
  generated_at: string;
}

export async function saveClusters(clusters: ClusterRow[], userId = 'legacy'): Promise<void> {
  const db = getDb();
  const batch = clusters.map(c => ({
    sql: `
      INSERT INTO clusters (id, user_id, label, description, item_count, tags, representative_items, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        label = excluded.label,
        description = excluded.description,
        item_count = excluded.item_count,
        tags = excluded.tags,
        representative_items = excluded.representative_items,
        generated_at = excluded.generated_at
    `,
    args: [
      `${userId}:${c.id}`,
      userId,
      c.label,
      c.description,
      c.item_count,
      c.tags,
      c.representative_items,
      c.generated_at,
    ],
  }));
  await db.batch(batch);
}

export async function getLatestClusters(userId?: string): Promise<ClusterRow[]> {
  const db = getDb();
  const result = userId
    ? await db.execute({ sql: `SELECT * FROM clusters WHERE user_id = ? ORDER BY generated_at DESC LIMIT 20`, args: [userId] })
    : await db.execute({ sql: `SELECT * FROM clusters ORDER BY generated_at DESC LIMIT 20`, args: [] });
  return result.rows as unknown as ClusterRow[];
}

// ============================================
// Settings
// ============================================

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT value FROM settings WHERE key = ?`,
    args: [key],
  });
  const val = result.rows[0]?.value;
  return val != null ? String(val) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  });
}
