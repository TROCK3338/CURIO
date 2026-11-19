/**
 * GET /api/health
 * Public health check endpoint for monitoring uptime and DB connectivity.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './lib/auth.js';
import { getDb } from './lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const timestamp = new Date().toISOString();

  try {
    const db = getDb();
    await db.execute('SELECT 1');

    return res.status(200).json({
      status: 'ok',
      timestamp,
      database: 'connected',
    });
  } catch (error) {
    console.error('[Health] DB ping error:', error);
    return res.status(503).json({
      status: 'error',
      timestamp,
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown database error',
    });
  }
}
