/**
 * GET /api/search
 * Semantic + keyword search over saved items
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireAuth, setCorsHeaders } from './lib/auth.js';
import { initializeSchema, searchItems, semanticSearch } from './lib/db.js';
import { generateEmbedding } from './lib/gemini.js';
import type { SearchResponse } from './lib/types';

const SearchSchema = z.object({
  q: z.string().default(''),
  platform: z.enum([
    'instagram', 'tiktok', 'x', 'youtube', 'reddit',
    'pinterest', 'linkedin', 'threads', 'bluesky', 'generic'
  ]).optional(),
  tags: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  semantic: z.preprocess(
    value => value === 'false' ? false : value === 'true' ? true : value,
    z.boolean().default(true),
  ),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    await initializeSchema();

    const parseResult = SearchSchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parseResult.error.flatten(),
      });
    }

    const { q, platform, tags, dateFrom, dateTo, limit, offset, semantic } = parseResult.data;

    const filters = {
      userId,
      platform,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      dateFrom,
      dateTo,
    };

    let result;

    if (semantic && q.trim()) {
      const queryEmbedding = await generateEmbedding(q);
      result = await semanticSearch(queryEmbedding, filters, limit, offset, q);
    } else {
      result = await searchItems(q, filters, limit, offset);
    }

    const items = result.items.map(({ embedding, ...item }) => item);

    return res.status(200).json({
      items,
      total: result.total,
      hasMore: offset + items.length < result.total,
    } as SearchResponse);

  } catch (error) {
    console.error('[Search] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
