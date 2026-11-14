/**
 * Push Database Schema to Turso
 * Run: npm run db:push (from apps/api)
 */

import { createClient } from '@libsql/client';
import 'dotenv/config';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function pushSchema() {
  console.log('🔧 Pushing schema to Turso...');

  try {
    // Enable JSON1 extension
    await db.execute('PRAGMA enable_json1 = true;');
    console.log('✅ JSON1 enabled');

    // Items table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
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
      );
    `);
    console.log('✅ Items table created');

    // Indexes
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_items_platform ON items(platform);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_items_saved_at ON items(saved_at DESC);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_items_author ON items(author_username);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_items_enrichment ON items(enrichment_status);`);
    console.log('✅ Indexes created');

    // Vector table (sqlite-vec)
    try {
      await db.execute(`
        CREATE VIRTUAL TABLE IF NOT EXISTS items_vec USING vec0(
          embedding FLOAT[768]
        );
      `);
      console.log('✅ Vector table created (sqlite-vec)');
    } catch (e) {
      console.warn('⚠️ Vector table not available:', e.message);
    }

    // Settings table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    console.log('✅ Settings table created');

    // Clusters table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS clusters (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT,
        item_count INTEGER DEFAULT 0,
        tags TEXT,
        representative_items TEXT,
        generated_at TEXT NOT NULL
      );
    `);
    console.log('✅ Clusters table created');

    // Insert default settings
    const defaultSettings = [
      { key: 'theme', value: 'system' },
      { key: 'autoTag', value: 'true' },
      { key: 'autoSummarize', value: 'true' },
      { key: 'preferredModel', value: 'gemini-1.5-flash' },
      { key: 'syncEnabled', value: 'true' },
      { key: 'syncIntervalMinutes', value: '15' },
      { key: 'wifiOnlySync', value: 'true' },
      { key: 'defaultView', value: 'timeline' },
      { key: 'itemsPerPage', value: '20' },
      { key: 'analyticsEnabled', value: 'false' },
      { key: 'crashReportingEnabled', value: 'false' },
    ];

    for (const setting of defaultSettings) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
        args: [setting.key, setting.value],
      });
    }
    console.log('✅ Default settings inserted');

    console.log('\n🎉 Schema push complete!');
    console.log('Run "npm run db:studio" to inspect database');

  } catch (error) {
    console.error('❌ Schema push failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

pushSchema();