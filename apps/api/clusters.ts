/**
 * GET  /api/clusters  - latest AI-generated thematic clusters for the user
 * POST /api/clusters  - regenerate them now
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, setCorsHeaders } from './lib/auth.js';
import { initializeSchema, getLatestClusters } from './lib/db.js';
import { regenerateClustersForUser } from './lib/clustering.js';
import type { ClusterResponse } from './lib/types';

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function latestClusters(userId: string): Promise<ClusterResponse> {
  const clusters = await getLatestClusters(userId);
  return {
    clusters: clusters.map(c => ({
      id: c.id,
      label: c.label,
      description: c.description,
      itemCount: c.item_count,
      tags: parseJson(c.tags, []),
      representativeItems: parseJson(c.representative_items, []),
    })),
    generatedAt: clusters[0]?.generated_at || new Date().toISOString(),
  } as ClusterResponse;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    await initializeSchema();

    if (req.method === 'POST') {
      const result = await regenerateClustersForUser(userId);
      // Respond in the same shape as GET so the client cache stays consistent.
      return res.status(200).json({
        ...(await latestClusters(userId)),
        message: result.skipped
          ? 'Not enough processed saves to group yet (or the AI was unavailable)'
          : `Generated ${result.clusters.length} clusters`,
      });
    }

    return res.status(200).json(await latestClusters(userId));
  } catch (error) {
    console.error('[Clusters] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
