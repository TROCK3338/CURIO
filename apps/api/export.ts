/**
 * GET /api/export
 * Export all saved items for the authenticated user as JSON download.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, setCorsHeaders } from './lib/auth.js';
import { initializeSchema, searchItems } from './lib/db.js';

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

    // Fetch all user items (up to 10,000)
    const { items } = await searchItems('', { userId }, 10000, 0);

    const exportData = items.map(item => {
      const { embedding: _embedding, ...rest } = item;
      return rest;
    });

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="curio-export-${dateStr}.json"`);

    return res.status(200).send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error('[Export] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
