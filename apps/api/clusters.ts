/**
 * GET /api/clusters
 * Returns AI-generated thematic clusters of saved items
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, setCorsHeaders } from './lib/auth.js';
import { getDb, initializeSchema, getLatestClusters, saveClusters } from './lib/db.js';
import { generateClusters } from './lib/gemini.js';
import type { ClusterResponse, SavedItem } from './lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).send('');

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    await initializeSchema();

    if (req.method === 'POST') {
      return await regenerateClusters(req, res, userId);
    }

    // GET: Return latest clusters for this user
    const clusters = await getLatestClusters(userId);

    const formatted = clusters.map(c => ({
      id: c.id,
      label: c.label,
      description: c.description,
      itemCount: c.item_count,
      tags: JSON.parse(c.tags),
      representativeItems: JSON.parse(c.representative_items),
    }));

    return res.status(200).json({
      clusters: formatted,
      generatedAt: clusters[0]?.generated_at || new Date().toISOString(),
    } as ClusterResponse);

  } catch (error) {
    console.error('[Clusters] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function regenerateClusters(_req: VercelRequest, res: VercelResponse, userId: string) {
  const db = getDb();

  const result = await db.execute({
    sql: `SELECT * FROM items WHERE user_id = ? AND enrichment_status = 'enriched' ORDER BY saved_at DESC LIMIT 1000`,
    args: [userId],
  });

  const items: SavedItem[] = result.rows.map(row => ({
    id: row.id as string,
    userId,
    url: row.url as string,
    platform: row.platform as SavedItem['platform'],
    title: row.title as string | null,
    userNote: row.user_note as string | null,
    summary: row.summary as string | null,
    tags: row.tags ? JSON.parse(row.tags as string) : [],
    entities: row.entities ? JSON.parse(row.entities as string) : {},
    embedding: row.embedding ? Array.from(new Float32Array(row.embedding as ArrayBuffer)) : null,
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
    return res.status(200).json({
      clusters: [],
      generatedAt: new Date().toISOString(),
      message: 'Not enough items for clustering',
    });
  }

  const clusters = await generateClusters(items);

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

  await saveClusters(clusterRows, userId);

  return res.status(200).json({
    clusters,
    generatedAt: now,
    message: `Generated ${clusters.length} clusters`,
  });
}
