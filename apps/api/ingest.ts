/**
 * POST /api/ingest
 * Receives shared content from PWA, processes with AI, stores in Turso
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getDb, initializeSchema, upsertItem } from './lib/db';
import { processItem, generateEmbedding } from './lib/gemini';
import { detectPlatform, enrichUrl, extractShortcode, quickEntityExtraction } from './lib/extractor';
import type { SavedItem, IngestRequest, IngestResponse, Platform } from '@mindspace/shared';

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
    return res.status(200).set(CORS_HEADERS).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).set(CORS_HEADERS).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Initialize DB schema on first request (idempotent)
    await initializeSchema();

    // Validate request
    const parseResult = IngestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).set(CORS_HEADERS).json({
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
      return res.status(200).set(CORS_HEADERS).json({
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
      title || enriched.title,
      combinedNote || null,
      // Media context could be added here if we had video analysis
    );

    // Merge entities (AI + quick)
    const mergedEntities = { ...quickEntities, ...processed.entities };

    // Generate embedding for semantic search
    const embeddingText = [
      enriched.title,
      combinedNote,
      processed.summary,
      processed.tags.join(' '),
      Object.values(mergedEntities).flatMap(e => Object.values(e)).join(' '),
    ].filter(Boolean).join('\n');

    const embedding = await generateEmbedding(embeddingText);

    // Build item
    const now = new Date().toISOString();
    const item: SavedItem = {
      id: crypto.randomUUID(),
      url,
      platform,
      title: title || enriched.title,
      userNote: combinedNote || null,
      summary: processed.summary,
      tags: [...new Set([...processed.tags, platform, ...(enriched.tags || [])])],
      entities: mergedEntities,
      embedding: Array.from(embedding),
      mediaUrl: enriched.mediaUrl,
      thumbnailUrl: enriched.thumbnailUrl,
      authorUsername: enriched.authorUsername || extractShortcode(url, platform),
      authorDisplayName: enriched.authorDisplayName,
      publishedAt: enriched.publishedAt,
      savedAt: now,
      updatedAt: now,
      enrichmentStatus: 'enriched',
      enrichmentError: null,
    };

    // Store in database
    await upsertItem(item);

    // Return success (omit embedding for response size)
    const { embedding: _, ...responseItem } = item;
    return res.status(200).set(CORS_HEADERS).json({
      success: true,
      item: responseItem,
    } as IngestResponse);

  } catch (error) {
    console.error('[Ingest] Error:', error);
    return res.status(500).set(CORS_HEADERS).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    } as IngestResponse);
  }
}