/**
 * GET /api/items/:id
 * Fetch one saved item by its stable identifier.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getItem, initializeSchema } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await initializeSchema();
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing item id' });

    const item = await getItem(id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const { embedding: _embedding, ...responseItem } = item;
    return res.status(200).json(responseItem);
  } catch (error) {
    console.error('[Items] Error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}
