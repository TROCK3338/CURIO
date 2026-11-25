/**
 * POST /api/ingest
 * Receives shared content from PWA, processes with AI, stores in Turso
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireAuth, setCorsHeaders } from './lib/auth.js';
import { getDb, initializeSchema, rowToItem, upsertItem } from './lib/db.js';
import { enrichItem } from './lib/enrich.js';
import { detectPlatform, extractShortcode, buildCanonicalUrl } from './lib/extractor.js';
import type { IngestResponse } from './lib/types';

// ============================================
// Request Validation
// ============================================

const IngestSchema = z.object({
  url: z.string().trim().url(),
  title: z.string().optional(),
  text: z.string().optional(),
  userNote: z.string().optional(),
});

// ============================================
// Handler
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'POST, OPTIONS');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    // Initialize DB schema on first request (idempotent)
    await initializeSchema();

    // Validate request
    const parseResult = IngestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
    }

    const { title, text, userNote } = parseResult.data;
    let url: string;
    try {
      const parsedUrl = new URL(parseResult.data.url);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        throw new Error('Only HTTP and HTTPS links can be saved');
      }
      url = parsedUrl.toString();
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid URL',
      });
    }

    // Detect platform and canonicalize URL (strip tracking params like ?igsh=...)
    const platform = detectPlatform(url);
    const shortcode = extractShortcode(url, platform);
    const canonicalUrl = shortcode ? buildCanonicalUrl(platform, shortcode) : url;

    // Check if already saved for this user or legacy
    const db = getDb();
    const existing = await db.execute({
      sql: `SELECT id, user_id, saved_at, enrichment_status, (embedding IS NOT NULL) AS has_embedding
            FROM items 
            WHERE (url = ? OR url = ?) AND (user_id = ? OR user_id = 'legacy')
            ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END LIMIT 1`,
      args: [canonicalUrl, url, userId, userId],
    });

    let existingId: string | null = null;
    let existingSavedAt: string | null = null;

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      existingId = String(row.id);
      existingSavedAt = String(row.saved_at);

      // Claim legacy item for this user if needed
      if (String(row.user_id) === 'legacy') {
        await db.execute({
          sql: 'UPDATE items SET user_id = ? WHERE id = ?',
          args: [userId, existingId],
        });
      }

      const isComplete = row.enrichment_status === 'enriched' && Number(row.has_embedding) === 1;
      if (isComplete) {
        const existingItem = await db.execute({
          sql: 'SELECT * FROM items WHERE id = ?',
          args: [existingId],
        });
        const { embedding: _embedding, ...savedItem } = rowToItem(existingItem.rows[0] as Record<string, unknown>);
        return res.status(200).json({
          success: true,
          item: savedItem,
          message: 'Already saved',
        });
      }
      // Saved earlier but never fully processed: fall through and finish the job
    }

    // Scrape, run AI and embed (shared with reprocess + the retry cron)
    const item = await enrichItem({
      id: existingId ?? crypto.randomUUID(),
      userId,
      url: canonicalUrl,
      platform,
      sharedTitle: title ?? null,
      // Share sheets often send the (un-canonicalized) link itself as the text
      sharedText: text && text.trim() !== url && text.trim() !== parseResult.data.url ? text : '',
      userNote: userNote ?? null,
      savedAt: existingSavedAt ?? new Date().toISOString(),
    });

    // Store in database
    await upsertItem(item);

    // Return success (omit embedding for response size)
    const { embedding: _, enrichmentAttempts: _attempts, ...responseItem } = item;
    return res.status(200).json({
      success: true,
      item: responseItem,
    } as IngestResponse);

  } catch (error) {
    console.error('[Ingest] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    } as IngestResponse);
  }
}
