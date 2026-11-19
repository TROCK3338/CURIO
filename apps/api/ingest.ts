/**
 * POST /api/ingest
 * Receives shared content from PWA, processes with AI, stores in Turso
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireAuth, setCorsHeaders } from './lib/auth.js';
import { getDb, initializeSchema, rowToItem, upsertItem } from './lib/db.js';
import { processItem, generateEmbedding } from './lib/gemini.js';
import { decodeHtmlEntities, detectPlatform, enrichUrl } from './lib/extractor.js';
import type { SavedItem, IngestResponse, ExtractedEntities } from './lib/types';

// ============================================
// Request Validation
// ============================================

const IngestSchema = z.object({
  url: z.string().trim().url(),
  title: z.string().optional(),
  text: z.string().optional(),
  userNote: z.string().optional(),
});

/** Keep only entities the AI actually filled in (drops empty / placeholder ones). */
function cleanEntities(entities: ExtractedEntities | undefined): ExtractedEntities {
  const cleaned: ExtractedEntities = {};
  for (const [key, value] of Object.entries(entities ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const name = (value as { name?: unknown }).name;
    if (typeof name !== 'string' || !name.trim() || /^detected\s/i.test(name)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

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

    // Check if already saved for this user
    const db = getDb();
    const existing = await db.execute({
      sql: `SELECT id, saved_at, enrichment_status, (embedding IS NOT NULL) AS has_embedding
            FROM items WHERE url = ? AND user_id = ?`,
      args: [url, userId],
    });

    let existingId: string | null = null;
    let existingSavedAt: string | null = null;

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      existingId = String(row.id);
      existingSavedAt = String(row.saved_at);

      const isComplete = row.enrichment_status === 'enriched' && Number(row.has_embedding) === 1;
      if (isComplete) {
        const existingItem = await db.execute({
          sql: 'SELECT * FROM items WHERE id = ? AND user_id = ?',
          args: [existingId, userId],
        });
        const { embedding: _embedding, ...savedItem } = rowToItem(existingItem.rows[0] as Record<string, unknown>);
        return res.status(200).json({
          success: true,
          item: savedItem,
          message: 'Already saved',
        });
      }
      // Saved earlier but never fully processed (for example while the AI was
      // unavailable): fall through and finish the job instead of skipping it.
    }

    // Detect platform
    const platform = detectPlatform(url);

    // Enrich metadata from URL (best effort)
    const enriched = await enrichUrl(url, platform);

    // What the user actually shared (kept separate from the scraped caption)
    const sharedTitle = title ? decodeHtmlEntities(title).trim() : undefined;
    let sharedText = text ? decodeHtmlEntities(text).trim() : '';
    if (sharedText === url || sharedText === enriched.description) sharedText = '';
    const userProvidedNote = [userNote?.trim(), sharedText].filter(Boolean).join('\n\n');

    // Everything the AI gets to read
    const aiContext = [userProvidedNote, enriched.description].filter(Boolean).join('\n\n');

    // For Instagram the scraped title is the clean caption; elsewhere prefer the shared title
    const bestTitle =
      platform === 'instagram'
        ? (enriched.title ?? sharedTitle ?? null)
        : (sharedTitle ?? enriched.title ?? null);

    // Process with AI
    let processed: Awaited<ReturnType<typeof processItem>>;
    try {
      processed = await processItem(url, platform, bestTitle, aiContext || null);
    } catch (error) {
      console.warn('[Ingest] AI enrichment unavailable; saving link without AI:', error);
      processed = {
        summary: aiContext || `Saved ${platform} link`,
        tags: [],
        entities: {},
      };
    }

    const entities = cleanEntities(processed.entities);

    // Generate embedding for semantic search
    const embeddingText = [
      bestTitle,
      aiContext,
      processed.summary,
      processed.tags.join(' '),
      Object.values(entities)
        .flatMap(e => Object.values(e as Record<string, unknown>))
        .filter(v => typeof v === 'string')
        .join(' '),
    ].filter(Boolean).join('\n');

    let embedding: Float32Array | null = null;
    try {
      embedding = await generateEmbedding(embeddingText);
    } catch (error) {
      console.warn('[Ingest] Embedding unavailable; saving without semantic index:', error);
    }

    // Build item - ensure all optional fields are null not undefined
    const now = new Date().toISOString();
    const item: SavedItem = {
      id: existingId ?? crypto.randomUUID(),
      userId,
      url,
      platform,
      title: bestTitle,
      userNote: userProvidedNote || null,
      summary: processed.summary,
      tags: [...new Set([...processed.tags, platform, ...(enriched.tags || [])])],
      entities,
      embedding: embedding ? Array.from(embedding) : null,
      mediaUrl: enriched.mediaUrl ?? null,
      thumbnailUrl: enriched.thumbnailUrl ?? null,
      authorUsername: enriched.authorUsername ?? null,
      authorDisplayName: enriched.authorDisplayName ?? null,
      publishedAt: enriched.publishedAt ?? null,
      savedAt: existingSavedAt ?? now,
      updatedAt: now,
      enrichmentStatus: embedding ? 'enriched' : 'pending',
      enrichmentError: embedding ? null : 'Saved without semantic enrichment',
    };

    // Store in database
    await upsertItem(item);

    // Return success (omit embedding for response size)
    const { embedding: _, ...responseItem } = item;
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
