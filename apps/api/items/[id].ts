/**
 * GET /api/items/:id
 * Fetch one saved item by its stable identifier.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, setCorsHeaders } from '../lib/auth.js';
import { getItem, initializeSchema } from '../lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    await initializeSchema();
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing item id' });

    const item = await getItem(id, userId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const { embedding: _embedding, ...responseItem } = item;
    return res.status(200).json(responseItem);
  } catch (error) {
    console.error('[Items] Error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}
