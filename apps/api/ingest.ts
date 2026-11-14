/**
 * POST /api/ingest
 * Receives shared content from PWA, processes with AI, stores in Turso
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getDb, initializeSchema, upsertItem } from './lib/db';
import { processItem, generateEmbedding } from './lib/gemini';
import { detectPlatform, enrichUrl, extractShortcode, quickEntityExtraction } from './lib/extractor';
import type { SavedItem, IngestRequest, IngestResponse, Platform } from './lib/types';

// ============================================
// Request Validation
// ============================================

const IngestSchema = z.object({
  url: z.string().url(),
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

    const { url, title, text, userNote } = parseResult.data;

    // Check if already saved
    const db = getDb();
    const existing = await db.execute({
      sql: 'SELECT id FROM items WHERE url = ?',
      args: [url],
    });

    if (existing.rows.length > 0) {
      const existingId = existing.rows[0].id as string;
      return res.status(200).json({
        success: true,
        item: { id: existingId, url },
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
    const processed = await processItem(
      url,
      platform,
      title ?? enriched.title ?? null,
      combinedNote || null,
    );

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

    const embedding = await generateEmbedding(embeddingText);

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
      embedding: Array.from(embedding),
      mediaUrl: enriched.mediaUrl ?? null,
      thumbnailUrl: enriched.thumbnailUrl ?? null,
      authorUsername: (enriched.authorUsername ?? extractShortcode(url, platform) ?? null) as string | null,
      authorDisplayName: enriched.authorDisplayName ?? null,
      publishedAt: enriched.publishedAt ?? null,
      savedAt: now,
      updatedAt: now,
      enrichmentStatus: 'enriched',
      enrichmentError: null,
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