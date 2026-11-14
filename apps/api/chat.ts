/**
 * POST /api/chat
 * RAG chat over user's saved items
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getDb, initializeSchema, searchItems } from './lib/db';
import { generateEmbedding, chatWithSaves } from './lib/gemini';
import type { ChatRequest, ChatResponse, SavedItem } from '@mindspace/shared';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).set(CORS_HEADERS).json({ error: 'Method not allowed' });
  }

  try {
    await initializeSchema();

    const parseResult = ChatSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).set(CORS_HEADERS).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
    }

    const { message, contextLimit, filter } = parseResult.data;

    // First, find relevant items using semantic search
    const queryEmbedding = await generateEmbedding(message);
    const { items } = await searchItems('', filter || {}, contextLimit * 2, 0);

    // If we have items, use semantic search to rank them
    let relevantItems: SavedItem[] = items;
    if (items.length > 0) {
      // Re-rank by vector similarity (already done in semanticSearch)
      // For now, just use keyword search results
      relevantItems = items.slice(0, contextLimit);
    }

    // Generate response using RAG
    const result = await chatWithSaves(message, relevantItems, contextLimit);

    return res.status(200).set(CORS_HEADERS).json({
      answer: result.answer,
      citations: result.citations,
      relatedItems: relevantItems.map(({ embedding, ...item }) => item),
    } as ChatResponse);

  } catch (error) {
    console.error('[Chat] Error:', error);
    return res.status(500).set(CORS_HEADERS).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}