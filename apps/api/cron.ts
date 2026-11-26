/**
 * Cron Jobs (scheduled in vercel.json)
 *   ?job=clusters - erase saves deleted over 7 days ago, then regenerate every user's clusters
 *   ?job=purge    - only the erase step
 *   ?job=retry    - re-run AI enrichment for saves that missed it
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, getItemsToRetry, initializeSchema, purgeDeletedItems, upsertItem } from './lib/db.js';
import { regenerateClustersForUser } from './lib/clustering.js';
import { enrichItem } from './lib/enrich.js';

const CRON_SECRET = process.env.CRON_SECRET;

/** Stop starting new work after this long so the function never hits its time limit. */
const TIME_BUDGET_MS = 45_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Fail closed if CRON_SECRET is missing or does not match
  const authHeader = req.headers.authorization;
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await initializeSchema();

    const { job } = req.query;
    switch (job) {
      case 'clusters': {
        // Rides on the daily clusters schedule so no extra cron slot is needed
        const purged = await purgeDeletedItems();
        return res.status(200).json({ success: true, job, purged, ...(await runClusterGeneration()) });
      }
      case 'purge':
        return res.status(200).json({ success: true, job, purged: await purgeDeletedItems() });
      case 'retry':
      case 'cleanup': // old schedule name, kept so a stale cron config still does something useful
        return res.status(200).json({ success: true, job: 'retry', ...(await runEnrichmentRetry()) });
      default:
        return res.status(400).json({ error: 'Unknown job', available: ['clusters', 'purge', 'retry'] });
    }
  } catch (error) {
    console.error('[Cron] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function runClusterGeneration() {
  const started = Date.now();
  const users = await getDb().execute(
    `SELECT DISTINCT user_id FROM items WHERE enrichment_status = 'enriched' AND user_id != 'legacy'`,
  );

  let generated = 0;
  let skipped = 0;
  for (const row of users.rows) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const userId = String(row.user_id);
    try {
      const result = await regenerateClustersForUser(userId);
      if (result.skipped) skipped++;
      else generated++;
    } catch (error) {
      console.error(`[Cron] Clustering failed for user ${userId}:`, error);
    }
  }

  console.log(`[Cron] Clusters regenerated for ${generated} users (${skipped} skipped)`);
  return { users: users.rows.length, generated, skipped };
}

async function runEnrichmentRetry() {
  const started = Date.now();
  const items = await getItemsToRetry(15);

  let enriched = 0;
  let stillPending = 0;
  let failed = 0;
  for (const item of items) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const updated = await enrichItem({
        id: item.id,
        userId: item.userId ?? 'legacy',
        url: item.url,
        platform: item.platform,
        sharedTitle: item.title,
        sharedText: '',
        userNote: item.userNote,
        savedAt: item.savedAt,
        previousAttempts: item.enrichmentAttempts,
      });
      await upsertItem(updated);
      if (updated.enrichmentStatus === 'enriched') enriched++;
      else if (updated.enrichmentStatus === 'failed') failed++;
      else stillPending++;
    } catch (error) {
      console.error(`[Cron] Retry failed for item ${item.id}:`, error);
      stillPending++;
    }
  }

  console.log(`[Cron] Retry: ${enriched} enriched, ${stillPending} still pending, ${failed} gave up`);
  return { checked: items.length, enriched, stillPending, failed };
}
