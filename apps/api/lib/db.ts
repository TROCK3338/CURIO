/**
 * Turso (libSQL) Database Client
 * HTTP-based, works great in Vercel Edge Functions
 */

import { createClient } from '@libsql/client';
import type { SavedItem, ExtractedEntities } from './types';

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

export async function initializeSchema(): Promise<void> {
  const db = getDb();

  // Enable JSON1 extension (built into libSQL)
  await db.execute('PRAGMA enable_json1 = true;');

  // Main items table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL,
      title TEXT,
      user_note TEXT,
      summary TEXT,
      tags TEXT,              -- JSON array
      entities TEXT,          -- JSON object
      embedding BLOB,         -- sqlite-vec vector (768 dims)
      media_url TEXT,
      thumbnail_url TEXT,
      author_username TEXT,
      author_display_name TEXT,
      published_at TEXT,
      saved_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      enrichment_status TEXT NOT NULL DEFAULT 'pending',
      enrichment_error TEXT
    );
  `);

  // Indexes for common queries
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_items_platform ON items(platform);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_items_saved_at ON items(saved_at DESC);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_items_author ON items(author_username);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_items_enrichment ON items(enrichment_status);`);

  // Vector search virtual table (sqlite-vec)
  try {
    await db.execute(`
      CREATE VIRTUAL TABLE IF NOT EXISTS items_vec USING vec0(
        embedding FLOAT[768]
      );
    `);
    console.log('[DB] Vector table ready');
  } catch (e) {
    console.warn('[DB] Vector table not available (sqlite-vec may not be loaded):', e);
  }

  // Settings table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS clusters (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      representative_items TEXT NOT NULL DEFAULT '[]',
      generated_at TEXT NOT NULL
    );
  `);
}

// ============================================
// CRUD Operations
// ============================================

export async function insertItem(item: SavedItem): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.execute({
    sql: `
      INSERT INTO items (
        id, url, platform, title, user_note, summary, tags, entities,
        embedding, media_url, thumbnail_url, author_username,
        author_display_name, published_at, saved_at, updated_at,
        enrichment_status, enrichment_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      item.id,
      item.url,
      item.platform,
      item.title,
      item.userNote,
      item.summary,
      JSON.stringify(item.tags),
      JSON.stringify(item.entities),
      item.embedding ? Buffer.from(new Float32Array(item.embedding).buffer) : null,
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

  if (item.embedding) {
    try {
      const row = await db.execute({ sql: 'SELECT rowid FROM items WHERE id = ?', args: [item.id] });
      const rowId = Number(row.rows[0]?.rowid);
      await db.execute({
        sql: `INSERT INTO items_vec (rowid, embedding) VALUES (?, ?)`,
        args: [rowId, Buffer.from(new Float32Array(item.embedding).buffer)],
      });
    } catch (e) {
      console.warn('[DB] Vector insert failed:', e);
    }
  }
}

export async function upsertItem(item: SavedItem): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.execute({
    sql: `
      INSERT INTO items (
        id, url, platform, title, user_note, summary, tags, entities,
        embedding, media_url, thumbnail_url, author_username,
        author_display_name, published_at, saved_at, updated_at,
        enrichment_status, enrichment_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
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
      item.url,
      item.platform,
      item.title,
      item.userNote,
      item.summary,
      JSON.stringify(item.tags),
      JSON.stringify(item.entities),
      item.embedding ? Buffer.from(new Float32Array(item.embedding).buffer) : null,
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

  if (item.embedding) {
    try {
      const row = await db.execute({ sql: 'SELECT rowid FROM items WHERE id = ?', args: [item.id] });
      const rowId = Number(row.rows[0]?.rowid);
      await db.execute({
        sql: `INSERT INTO items_vec (rowid, embedding) VALUES (?, ?)
              ON CONFLICT(rowid) DO UPDATE SET embedding = excluded.embedding`,
        args: [rowId, Buffer.from(new Float32Array(item.embedding).buffer)],
      });
    } catch (e) {
      console.warn('[DB] Vector upsert failed:', e);
    }
  }
}

export async function getItem(id: string): Promise<SavedItem | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM items WHERE id = ?`,
    args: [id],
  });

  if (result.rows.length === 0) return null;
  return rowToItem(result.rows[0]);
}

export function rowToItem(row: Record<string, unknown>): SavedItem {
  return {
    id: String(row.id),
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

export async function getItemByUrl(url: string): Promise<SavedItem | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM items WHERE url = ?`,
    args: [url],
  });

  if (result.rows.length === 0) return null;
  return rowToItem(result.rows[0]);
}

// ============================================
// Search Operations
// ============================================

export interface SearchFilters {
  platform?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  enrichmentStatus?: string;
}

export async function searchItems(
  query: string,
  filters: SearchFilters = {},
  limit = 20,
  offset = 0
): Promise<{ items: SavedItem[]; total: number }> {
  const db = getDb();

  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (query.trim()) {
    conditions.push(`(
      title LIKE ? OR
      user_note LIKE ? OR
      summary LIKE ? OR
      tags LIKE ? OR
      author_username LIKE ? OR
      author_display_name LIKE ?
    )`);
    const likeQuery = `%${query}%`;
    for (let i = 0; i < 6; i++) args.push(likeQuery);
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

export async function semanticSearch(
  queryEmbedding: Float32Array,
  filters: SearchFilters = {},
  limit = 20,
  offset = 0,
  fallbackQuery = ''
): Promise<{ items: SavedItem[]; total: number }> {
  const db = getDb();

  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (filters.platform) {
    conditions.push(`i.platform = ?`);
    args.push(filters.platform);
  }

  if (filters.dateFrom) {
    conditions.push(`i.saved_at >= ?`);
    args.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push(`i.saved_at <= ?`);
    args.push(filters.dateTo);
  }

  const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  try {
    const result = await db.execute({
      sql: `
        SELECT
          i.*,
          vec_distance_cosine(v.embedding, ?) as distance
        FROM items_vec v
        JOIN items i ON i.rowid = v.rowid
        WHERE 1=1 ${whereClause}
        ORDER BY distance ASC
        LIMIT ? OFFSET ?
      `,
      args: [Buffer.from(queryEmbedding.buffer), ...args, limit, offset],
    });

    const items = result.rows.map(rowToItem);
    if (items.length === 0 && fallbackQuery.trim()) {
      return searchItems(fallbackQuery, filters, limit, offset);
    }

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as total FROM items_vec v JOIN items i ON i.rowid = v.rowid WHERE 1=1 ${whereClause}`,
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
  label: string;
  description: string;
  item_count: number;
  tags: string;
  representative_items: string;
  generated_at: string;
}

export async function saveClusters(clusters: ClusterRow[]): Promise<void> {
  const db = getDb();
  const batch = clusters.map(c => ({
    sql: `
      INSERT INTO clusters (id, label, description, item_count, tags, representative_items, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        description = excluded.description,
        item_count = excluded.item_count,
        tags = excluded.tags,
        representative_items = excluded.representative_items,
        generated_at = excluded.generated_at
    `,
    args: [
      c.id,
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

export async function getLatestClusters(): Promise<ClusterRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM clusters ORDER BY generated_at DESC LIMIT 20`,
    args: [],
  });
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

// ============================================
// Helpers
// ============================================
