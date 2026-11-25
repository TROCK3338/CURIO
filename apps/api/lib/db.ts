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

async function ensureItemsTableWithoutGlobalUrlUnique(): Promise<void> {
  const client = getDb();
  try {
    const master = await client.execute(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'`);
    const sql = String(master.rows[0]?.sql || '');
    let hasGlobalUrlUnique = /\burl\b[^,]*\bUNIQUE\b/i.test(sql) || /UNIQUE\s*\([^)]*\burl\b[^)]*\)/i.test(sql);

    if (!hasGlobalUrlUnique) {
      const idxList = await client.execute(`PRAGMA index_list(items)`);
      for (const idx of idxList.rows) {
        if (Number(idx.unique) !== 1) continue;
        const idxName = String(idx.name || '');
        if (!idxName) continue;
        const idxInfo = await client.execute(`PRAGMA index_info("${idxName.replace(/"/g, '""')}")`);
        const cols = idxInfo.rows.map(c => String(c.name));
        if (cols.length === 1 && cols[0] === 'url') {
          hasGlobalUrlUnique = true;
          break;
        }
      }
    }

    if (hasGlobalUrlUnique) {
      console.log('[DB] Migrating items table to remove global UNIQUE on url...');
      await client.batch([
        `DROP TABLE IF EXISTS items_v2`,
        `CREATE TABLE items_v2 (
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
        `INSERT OR REPLACE INTO items_v2 SELECT 
          id, 
          COALESCE(user_id, 'legacy'), 
          url, platform, title, user_note, summary, tags, entities, 
          embedding, media_url, thumbnail_url, author_username, 
          author_display_name, published_at, saved_at, updated_at, 
          enrichment_status, enrichment_error 
        FROM items`,
        `DROP TABLE items`,
        `ALTER TABLE items_v2 RENAME TO items`,
        `CREATE INDEX IF NOT EXISTS idx_items_platform ON items(platform)`,
        `CREATE INDEX IF NOT EXISTS idx_items_saved_at ON items(saved_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_items_author ON items(author_username)`,
        `CREATE INDEX IF NOT EXISTS idx_items_enrichment ON items(enrichment_status)`,
        `CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id, saved_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_items_user_url ON items(user_id, url)`,
      ], 'write');
      console.log('[DB] Migration complete: items table now supports multi-user saves per url');
    }
  } catch (err) {
    console.warn('[DB] Migration check/execution warning:', err);
  }

  // Also drop any standalone unique indexes on items(url)
  try {
    const indexes = await client.execute(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'items'`);
    for (const row of indexes.rows) {
      const idxSql = String(row.sql || '');
      const idxName = String(row.name || '');
      if (idxSql && /UNIQUE/i.test(idxSql) && /url/i.test(idxSql) && !/user_id/i.test(idxSql)) {
        try {
          await client.execute(`DROP INDEX IF EXISTS "${idxName}"`);
        } catch (e) {
          console.warn(`[DB] Could not drop index ${idxName}:`, e);
        }
      }
    }
  } catch (err) {
    console.warn('[DB] Index cleanup warning:', err);
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
      await ensureItemsTableWithoutGlobalUrlUnique();
      const itemColumns = await client.execute(`PRAGMA table_info(items)`);
      if (!itemColumns.rows.some(r => String(r.name) === 'enrichment_attempts')) {
        await client.execute(`ALTER TABLE items ADD COLUMN enrichment_attempts INTEGER NOT NULL DEFAULT 0`);
      }
      await client.batch([
        `CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id, saved_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_clusters_user_id ON clusters(user_id, generated_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_items_user_url ON items(user_id, url)`,
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

/** Every column except the embedding BLOB (~3 KB per row) for list/search queries. */
const ITEM_COLUMNS = `id, user_id, url, platform, title, user_note, summary, tags, entities,
  media_url, thumbnail_url, author_username, author_display_name, published_at,
  saved_at, updated_at, enrichment_status, enrichment_error`;

export type StoredItem = SavedItem & { enrichmentAttempts?: number };

export async function upsertItem(item: StoredItem): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const userId = item.userId || 'legacy';

  await db.execute({
    sql: `
      INSERT INTO items (
        id, user_id, url, platform, title, user_note, summary, tags, entities,
        embedding, media_url, thumbnail_url, author_username,
        author_display_name, published_at, saved_at, updated_at,
        enrichment_status, enrichment_error, enrichment_attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        enrichment_error = excluded.enrichment_error,
        enrichment_attempts = excluded.enrichment_attempts
      WHERE items.user_id = excluded.user_id
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
      item.enrichmentAttempts ?? 0,
    ],
  });
}

export async function getItem(id: string, userId: string): Promise<StoredItem | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT *, COALESCE(enrichment_attempts, 0) AS attempts FROM items WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return { ...rowToItem(row), enrichmentAttempts: Number(row.attempts ?? 0) };
}

export async function deleteItem(id: string, userId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: `DELETE FROM items WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export interface UserEditableFields {
  title?: string | null;
  userNote?: string | null;
  tags?: string[];
}

/** Applies user edits; pass a fresh embedding to keep semantic search in sync. */
export async function updateItemFields(
  id: string,
  userId: string,
  fields: UserEditableFields,
  embedding?: number[] | null,
): Promise<void> {
  const sets: string[] = [];
  const args: (string | null | Buffer)[] = [];

  if (fields.title !== undefined) { sets.push('title = ?'); args.push(fields.title); }
  if (fields.userNote !== undefined) { sets.push('user_note = ?'); args.push(fields.userNote); }
  if (fields.tags !== undefined) { sets.push('tags = ?'); args.push(JSON.stringify(fields.tags)); }
  if (embedding) { sets.push('embedding = ?'); args.push(embeddingToBlob(embedding)); }
  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  args.push(new Date().toISOString());

  await getDb().execute({
    sql: `UPDATE items SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
    args: [...args, id, userId],
  });
}

/** Items still waiting for AI enrichment, oldest first, skipping ones touched in the last few minutes. */
export async function getItemsToRetry(limit = 10): Promise<StoredItem[]> {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const result = await getDb().execute({
    sql: `SELECT ${ITEM_COLUMNS}, COALESCE(enrichment_attempts, 0) AS attempts
          FROM items
          WHERE enrichment_status = 'pending' AND updated_at < ?
          ORDER BY updated_at ASC
          LIMIT ?`,
    args: [staleBefore, limit],
  });
  return result.rows.map(row => ({
    ...rowToItem(row as Record<string, unknown>),
    enrichmentAttempts: Number((row as Record<string, unknown>).attempts ?? 0),
  }));
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
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
    tags: parseJson<string[]>(row.tags, []),
    entities: parseJson(row.entities, {}),
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
    // Exact tag match inside the JSON array (LIKE '%ai%' would also match "email", "rain", ...)
    const tagConditions = filters.tags
      .map(() => `EXISTS (SELECT 1 FROM json_each(items.tags) WHERE json_each.value = ?)`)
      .join(' OR ');
    conditions.push(`(${tagConditions})`);
    filters.tags.forEach(tag => args.push(tag.toLowerCase()));
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
    const likeQuery = `%${query.trim()}%`;
    args.unshift(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countResult, itemsResult] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) as total FROM items ${whereClause}`, args }),
    db.execute({
      sql: `SELECT ${ITEM_COLUMNS} FROM items ${whereClause} ORDER BY saved_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    }),
  ]);

  return {
    items: itemsResult.rows.map(row => rowToItem(row as Record<string, unknown>)),
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

/**
 * Cosine distance above which a save is considered unrelated to the query.
 * bge-base embeddings put clearly unrelated text above ~0.5 distance and
 * related text well below that. Override with SEMANTIC_MAX_DISTANCE.
 */
const SEMANTIC_MAX_DISTANCE = Number(process.env.SEMANTIC_MAX_DISTANCE) || 0.5;

/**
 * Meaning-based search: ranks saved items by cosine distance between the
 * query embedding and each item's stored embedding (brute force, which is
 * perfectly fast for a personal library). Only items within
 * SEMANTIC_MAX_DISTANCE are returned. Falls back to keyword search if vector
 * search is unavailable or finds nothing.
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
  const ranked = `
    SELECT ${ITEM_COLUMNS}, vector_distance_cos(embedding, vector32(?)) AS distance
    FROM items
    ${whereClause}
  `;

  try {
    const [result, countResult] = await Promise.all([
      db.execute({
        sql: `SELECT * FROM (${ranked}) WHERE distance <= ? ORDER BY distance ASC LIMIT ? OFFSET ?`,
        args: [queryVector, ...args, SEMANTIC_MAX_DISTANCE, limit, offset],
      }),
      db.execute({
        sql: `SELECT COUNT(*) AS total FROM (${ranked}) WHERE distance <= ?`,
        args: [queryVector, ...args, SEMANTIC_MAX_DISTANCE],
      }),
    ]);

    const items = result.rows.map(row => rowToItem(row as Record<string, unknown>));
    if (items.length === 0 && offset === 0 && fallbackQuery.trim()) {
      return searchItems(fallbackQuery, filters, limit, offset);
    }

    return { items, total: Number(countResult.rows[0]?.total ?? 0) };
  } catch (e) {
    console.warn('[DB] Vector search failed, falling back to keyword:', e);
    return searchItems(fallbackQuery, filters, limit, offset);
  }
}

/** Recently saved, fully enriched items for clustering (no embeddings needed). */
export async function getItemsForClustering(userId: string, limit = 1000): Promise<SavedItem[]> {
  const result = await getDb().execute({
    sql: `SELECT ${ITEM_COLUMNS} FROM items
          WHERE user_id = ? AND enrichment_status = 'enriched'
          ORDER BY saved_at DESC LIMIT ?`,
    args: [userId, limit],
  });
  return result.rows.map(row => rowToItem(row as Record<string, unknown>));
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

/** Replaces the user's clusters with a freshly generated set. */
export async function saveClusters(clusters: ClusterRow[], userId: string): Promise<void> {
  const db = getDb();
  await db.batch([
    { sql: `DELETE FROM clusters WHERE user_id = ?`, args: [userId] },
    ...clusters.map(c => ({
      sql: `
        INSERT OR REPLACE INTO clusters (id, user_id, label, description, item_count, tags, representative_items, generated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    })),
  ], 'write');
}

export async function getLatestClusters(userId: string): Promise<ClusterRow[]> {
  const result = await getDb().execute({
    sql: `SELECT * FROM clusters WHERE user_id = ? ORDER BY generated_at DESC, item_count DESC LIMIT 20`,
    args: [userId],
  });
  return result.rows as unknown as ClusterRow[];
}
