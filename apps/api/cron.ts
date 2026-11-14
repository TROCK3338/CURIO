/**
 * Cron Jobs
 * Runs periodically via Vercel Cron (vercel.json)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, initializeSchema } from './lib/db';
import { generateClusters } from './lib/gemini';
import type { SavedItem } from '@mindspace/shared';

const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await initializeSchema();

    const { job } = req.query;

    switch (job) {
      case 'clusters':
        await runClusterGeneration();
        return res.status(200).json({ success: true, job: 'clusters' });

      case 'cleanup':
        await runCleanup();
        return res.status(200).json({ success: true, job: 'cleanup' });

      default:
        return res.status(400).json({ error: 'Unknown job', available: ['clusters', 'cleanup'] });
    }
  } catch (error) {
    console.error('[Cron] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function runClusterGeneration() {
  const db = getDb();

  // Fetch recent enriched items
  const result = await db.execute({
    sql: `SELECT * FROM items WHERE enrichment_status = 'enriched' ORDER BY saved_at DESC LIMIT 1000`,
  });

  const items: SavedItem[] = result.rows.map(row => ({
    id: row.id as string,
    url: row.url as string,
    platform: row.platform as SavedItem['platform'],
    title: row.title as string | null,
    userNote: row.user_note as string | null,
    summary: row.summary as string | null,
    tags: row.tags ? JSON.parse(row.tags as string) : [],
    entities: row.entities ? JSON.parse(row.entities as string) : {},
    embedding: row.embedding ? new Float32Array(row.embedding as ArrayBuffer).slice() : null,
    mediaUrl: row.media_url as string | null,
    thumbnailUrl: row.thumbnail_url as string | null,
    authorUsername: row.author_username as string | null,
    authorDisplayName: row.author_display_name as string | null,
    publishedAt: row.published_at as string | null,
    savedAt: row.saved_at as string,
    updatedAt: row.updated_at as string,
    enrichmentStatus: row.enrichment_status as SavedItem['enrichmentStatus'],
    enrichmentError: row.enrichment_error as string | null,
  }));

  if (items.length < 5) {
    console.log('[Cron] Not enough items for clustering');
    return;
  }

  const clusters = await generateClusters(items);

  // Save clusters
  const now = new Date().toISOString();
  const clusterRows = clusters.map(c => ({
    id: c.id,
    label: c.label,
    description: c.description,
    item_count: c.itemIds.length,
    tags: JSON.stringify(c.tags),
    representative_items: JSON.stringify(c.itemIds.slice(0, 5).map(id => {
      const item = items.find(i => i.id === id);
      return item ? { id: item.id, title: item.title, thumbnailUrl: item.thumbnailUrl, url: item.url } : null;
    }).filter(Boolean)),
    generated_at: now,
  }));

  await db.batch(clusterRows.map(c => ({
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
    args: [c.id, c.label, c.description, c.item_count, c.tags, c.representative_items, c.generated_at],
  })));

  console.log(`[Cron] Generated ${clusters.length} clusters`);
}

async function runCleanup() {
  const db = getDb();

  // Delete failed enrichment items older than 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const result = await db.execute({
    sql: `DELETE FROM items WHERE enrichment_status = 'failed' AND saved_at < ?`,
    args: [sevenDaysAgo],
  });

  console.log(`[Cron] Cleaned up ${result.changes} failed items`);
}