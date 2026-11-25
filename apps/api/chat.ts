/**
 * POST /api/chat
 * RAG chat over user's saved items
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireAuth, setCorsHeaders } from './lib/auth.js';
import { initializeSchema, semanticSearch } from './lib/db.js';
import { generateEmbedding, chatWithSaves } from './lib/ai.js';
import type { ChatResponse, SavedItem } from './lib/types';

const ChatSchema = z.object({
  message: z.string().min(1).max(2000),
  contextLimit: z.coerce.number().min(1).max(50).default(10),
  filter: z.object({
    platform: z.enum([
      'instagram', 'tiktok', 'x', 'youtube', 'reddit',
      'pinterest', 'linkedin', 'threads', 'bluesky', 'generic'
    ]).optional(),
    tags: z.array(z.string()).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  }).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    await initializeSchema();

    const parseResult = ChatSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
    }

    const { message, contextLimit, filter } = parseResult.data;

    // Find relevant items using semantic search scoped to this user
    const queryEmbedding = await generateEmbedding(message);
    const { items } = await semanticSearch(queryEmbedding, { ...(filter || {}), userId }, contextLimit * 2, 0, message);

    let relevantItems: SavedItem[] = items;
    if (items.length > 0) {
      relevantItems = items.slice(0, contextLimit);
    }

    const result = await chatWithSaves(message, relevantItems, contextLimit);

    return res.status(200).json({
      answer: result.answer,
      citations: result.citations,
      relatedItems: relevantItems.map(({ embedding, ...item }) => item),
    } as ChatResponse);

  } catch (error) {
    console.error('[Chat] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
