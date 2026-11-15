/**
 * POST /api/ingest
 * Receives shared content from PWA, processes with AI, stores in Turso
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getDb, initializeSchema, rowToItem, upsertItem } from './lib/db.js';
import { processItem, generateEmbedding } from './lib/gemini.js';
import { detectPlatform, enrichUrl, extractShortcode, quickEntityExtraction } from './lib/extractor.js';
import type { SavedItem, IngestRequest, IngestResponse, Platform } from './lib/types';

// ============================================
// Request Validation
// ============================================

const IngestSchema = z.object({
  url: z.string().trim().url(),
  title: z.string().optional(),
  text: z.string().optional(),
  userNote: z.string().optional(),
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ============================================
// Handler
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).send('');
  }

  if (req.method !== 'POST') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Set CORS headers for all responses
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

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

    // Check if already saved
    const db = getDb();
    const existing = await db.execute({
      sql: 'SELECT id FROM items WHERE url = ?',
      args: [url],
    });

    if (existing.rows.length > 0) {
      const existingId = existing.rows[0].id as string;
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

    // Detect platform
    const platform = detectPlatform(url);

    // Enrich metadata from URL (best effort)
    const enriched = await enrichUrl(url, platform);

    // Combine user input with enriched data
    const combinedNote = [userNote, text, enriched.description].filter(Boolean).join('\n\n');

    // Quick regex-based entity extraction (fast fallback)
    const quickEntities = quickEntityExtraction(combinedNote || url);

    // Process with Gemini AI
    let processed: Awaited<ReturnType<typeof processItem>>;
    try {
      processed = await processItem(
        url,
        platform,
        title ?? enriched.title ?? null,
        combinedNote || null,
      );
    } catch (error) {
      console.warn('[Ingest] AI enrichment unavailable; saving link without AI:', error);
      processed = {
        summary: combinedNote || `Saved ${platform} link`,
        tags: [],
        entities: {},
      };
    }

    // Merge entities (AI + quick)
    const mergedEntities = { ...quickEntities, ...processed.entities };

    // Generate embedding for semantic search
    const embeddingText = [
      enriched.title,
      combinedNote,
      processed.summary,
      processed.tags.join(' '),
      Object.values(mergedEntities).flatMap(e => Object.values(e as Record<string, unknown>)).filter(v => typeof v === 'string').join(' '),
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
      id: crypto.randomUUID(),
      url,
      platform,
      title: (title ?? enriched.title) ?? null,
      userNote: combinedNote || null,
      summary: processed.summary,
      tags: [...new Set([...processed.tags, platform, ...(enriched.tags || [])])],
      entities: mergedEntities,
      embedding: embedding ? Array.from(embedding) : null,
      mediaUrl: enriched.mediaUrl ?? null,
      thumbnailUrl: enriched.thumbnailUrl ?? null,
      authorUsername: (enriched.authorUsername ?? extractShortcode(url, platform) ?? null) as string | null,
      authorDisplayName: enriched.authorDisplayName ?? null,
      publishedAt: enriched.publishedAt ?? null,
      savedAt: now,
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
