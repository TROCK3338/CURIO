/**
 * /api/keys - personal save keys for the iOS Shortcut ("silent save")
 *   GET            list active keys (never the keys themselves)
 *   POST {label}   create a key; the full key is returned once
 *   DELETE ?id=    revoke a key
 *
 * Requires a signed-in browser session: a save key can't manage keys.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireAuth, setCorsHeaders } from './lib/auth.js';
import { initializeSchema } from './lib/db.js';
import { createSaveKey, listSaveKeys, revokeSaveKey } from './lib/apiKeys.js';

const CreateSchema = z.object({ label: z.string().trim().max(60).optional() });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (!['GET', 'POST', 'DELETE'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  // Never cache responses that may contain a freshly created key
  res.setHeader('Cache-Control', 'no-store');

  try {
    await initializeSchema();

    if (req.method === 'GET') {
      return res.status(200).json({ keys: await listSaveKeys(userId) });
    }

    if (req.method === 'POST') {
      const parsed = CreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });
      const { key, summary } = await createSaveKey(userId, parsed.data.label ?? '');
      return res.status(201).json({ key, ...summary });
    }

    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing key id' });
    const revoked = await revokeSaveKey(userId, id);
    if (!revoked) return res.status(404).json({ error: 'Key not found' });
    return res.status(200).json({ success: true, id });
  } catch (error) {
    console.error('[Keys] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(message.startsWith('You already have') ? 409 : 500).json({ error: message });
  }
}
