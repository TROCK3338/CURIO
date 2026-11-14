/**
 * GET /api/clusters
 * Returns AI-generated thematic clusters of saved items
 * Also used by cron job to regenerate clusters periodically
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, initializeSchema, getLatestClusters, saveClusters } from './lib/db';
import { generateClusters } from './lib/gemini';
import type { ClusterResponse, SavedItem } from '@mindspace/shared';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).send('');
  }

  try {
    await initializeSchema();

    if (req.method === 'POST') {
      // Regenerate clusters (called by cron or manually)
      return await regenerateClusters(req, res);
    }

    // GET: Return latest clusters
    const clusters = await getLatestClusters();

    const formatted = clusters.map(c => ({
      id: c.id,
      label: c.label,
      description: c.description,
      itemCount: c.item_count,
      tags: JSON.parse(c.tags),
      representativeItems: JSON.parse(c.representative_items),
    }));

    return res.status(200).set(CORS_HEADERS).json({
      clusters: formatted,
      generatedAt: clusters[0]?.generated_at || new Date().toISOString(),
    } as ClusterResponse);

  } catch (error) {
    console.error('[Clusters] Error:', error);
    return res.status(500).set(CORS_HEADERS).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function regenerateClusters(req: VercelRequest, res: VercelResponse) {
  const db = getDb();

  // Fetch recent items for clustering (last 1000)
  const result = await db.execute({
    sql: `SELECT * FROM items WHERE enrichment_status = 'enriched' ORDER BY saved_at DESC LIMIT 1000`,
  });

  // Convert to SavedItem type
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
    return res.status(200).set(CORS_HEADERS).json({
      clusters: [],
      generatedAt: new Date().toISOString(),
      message: 'Not enough items for clustering',
    });
  }

  // Generate clusters with AI
  const clusters = await generateClusters(items);

  // Save to database
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

  await saveClusters(clusterRows);

  return res.status(200).set(CORS_HEADERS).json({
    clusters,
    generatedAt: now,
    message: `Generated ${clusters.length} clusters`,
  });
}