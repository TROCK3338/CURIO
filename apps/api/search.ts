/**
 * GET /api/search
 *   ?q=...                  semantic + keyword search
 *   ?entity=recipe          a smart collection (recipe | place | product | event | workout)
 *   ?relatedTo=<itemId>     saves similar to one item
 *   ?facets=1               counts per platform / collection / tag (no items)
 * Filters: platform, tags, dateFrom, dateTo, limit, offset, semantic
 *   status=active|done|all|deleted  default: all when searching (q / relatedTo), else active;
 *   deleted saves only appear with status=deleted (Recently deleted)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireAuth, setCorsHeaders } from './lib/auth.js';
import {
  ENTITY_TYPES,
  getItemEmbedding,
  getLibraryFacets,
  initializeSchema,
  searchItems,
  semanticSearch,
} from './lib/db.js';
import { generateEmbedding } from './lib/ai.js';
import type { SearchResponse } from './lib/types';

const boolParam = z.preprocess(
  value => value === 'false' || value === '0' ? false : value === 'true' || value === '1' ? true : value,
  z.boolean(),
);

const SearchSchema = z.object({
  q: z.string().default(''),
  platform: z.enum([
    'instagram', 'tiktok', 'x', 'youtube', 'reddit',
    'pinterest', 'linkedin', 'threads', 'bluesky', 'generic'
  ]).optional(),
  tags: z.string().optional(),
  entity: z.enum(ENTITY_TYPES).optional(),
  relatedTo: z.string().min(1).max(100).optional(),
  facets: boolParam.default(false),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  semantic: boolParam.default(true),
  status: z.enum(['active', 'done', 'all', 'deleted']).optional(),
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

    const { q, platform, tags, entity, relatedTo, facets, dateFrom, dateTo, limit, offset, semantic, status } = parseResult.data;

    if (facets) {
      return res.status(200).json(await getLibraryFacets(userId));
    }

    const filters = {
      userId,
      platform,
      entity,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      dateFrom,
      dateTo,
      // Browsing hides done saves; searching still finds them
      status: status ?? (q.trim() || relatedTo ? 'all' : 'active'),
    };

    let result;

    if (relatedTo) {
      const embedding = await getItemEmbedding(relatedTo, userId);
      result = embedding
        ? await semanticSearch(embedding, { ...filters, excludeId: relatedTo }, limit, offset, '')
        : { items: [], total: 0 };
    } else if (semantic && q.trim()) {
      const queryEmbedding = await generateEmbedding(q);
      result = await semanticSearch(queryEmbedding, filters, limit, offset, q);
    } else {
      result = await searchItems(q, filters, limit, offset);
    }

    const items = result.items.map(({ embedding: _embedding, ...item }) => item);

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
