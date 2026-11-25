/**
 * Cluster generation shared by GET/POST /api/clusters and the nightly cron.
 */

import { getItemsForClustering, saveClusters } from './db.js';
import { generateClusters, type Cluster } from './ai.js';

export const MIN_ITEMS_FOR_CLUSTERING = 5;

export async function regenerateClustersForUser(
  userId: string,
): Promise<{ clusters: Cluster[]; generatedAt: string; skipped: boolean }> {
  const generatedAt = new Date().toISOString();
  const items = await getItemsForClustering(userId);
  if (items.length < MIN_ITEMS_FOR_CLUSTERING) {
    return { clusters: [], generatedAt, skipped: true };
  }

  const clusters = await generateClusters(items);
  // An empty result usually means the AI call failed; keep the previous clusters.
  if (clusters.length === 0) {
    return { clusters, generatedAt, skipped: true };
  }

  const byId = new Map(items.map(item => [item.id, item]));
  await saveClusters(
    clusters.map(c => ({
      id: c.id,
      label: c.label,
      description: c.description,
      item_count: c.itemIds.length,
      tags: JSON.stringify(c.tags),
      representative_items: JSON.stringify(
        c.itemIds.slice(0, 5).flatMap(id => {
          const item = byId.get(id);
          return item ? [{ id: item.id, title: item.title, thumbnailUrl: item.thumbnailUrl, url: item.url }] : [];
        }),
      ),
      generated_at: generatedAt,
    })),
    userId,
  );

  return { clusters, generatedAt, skipped: false };
}
