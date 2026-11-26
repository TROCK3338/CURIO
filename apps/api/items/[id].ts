/**
 * /api/items/:id
 *   GET    - fetch one saved item
 *   PATCH  - edit title, note and/or tags  { title?, userNote?, tags? }
 *            mark done / move back           { done: boolean }
 *   DELETE - move to Recently deleted (?permanent=1 erases it now)
 *   POST   - re-run AI enrichment          { action: "reprocess" }
 *            re-scrape the preview image    { action: "refresh-media" }
 *            restore from Recently deleted   { action: "restore" }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireAuth, setCorsHeaders } from '../lib/auth.js';
import { deleteItem, getItem, initializeSchema, restoreItem, setItemDone, trashItem, updateItemFields, updateItemMedia, upsertItem } from '../lib/db.js';
import { decodeHtmlEntities, enrichUrl } from '../lib/extractor.js';
import { buildEmbeddingText, enrichItem } from '../lib/enrich.js';
import { generateEmbedding } from '../lib/ai.js';
import type { SavedItem } from '../lib/types';

const PatchSchema = z.object({
  title: z.string().trim().max(500).nullable().optional(),
  userNote: z.string().trim().max(10_000).nullable().optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(30).optional(),
  done: z.boolean().optional(),
}).strict();

const PostSchema = z.object({ action: z.enum(['reprocess', 'refresh-media', 'restore']) });

function toResponse(item: SavedItem & { enrichmentAttempts?: number }) {
  const { embedding: _embedding, enrichmentAttempts: _attempts, ...rest } = item;
  return rest;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, PATCH, DELETE, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (!['GET', 'PATCH', 'DELETE', 'POST'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    await initializeSchema();

    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing item id' });

    if (req.method === 'DELETE') {
      const permanent = req.query.permanent === '1' || req.query.permanent === 'true';
      if (permanent) {
        if (!(await deleteItem(id, userId))) return res.status(404).json({ error: 'Item not found' });
        return res.status(200).json({ success: true, id, permanent: true });
      }
      if (!(await trashItem(id, userId))) {
        // Already in Recently deleted counts as success; anything else is a 404
        const existing = await getItem(id, userId);
        if (!existing) return res.status(404).json({ error: 'Item not found' });
      }
      return res.status(200).json({ success: true, id, permanent: false });
    }

    const item = await getItem(id, userId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (req.method === 'GET') {
      return res.status(200).json(toResponse(item));
    }

    if (req.method === 'PATCH') {
      const parsed = PatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      }

      const { done, ...edits } = parsed.data;
      if (done !== undefined) await setItemDone(id, userId, done);
      // Marking done changes nothing the AI reads, so skip re-embedding
      if (Object.keys(edits).length === 0) {
        return res.status(200).json(toResponse((await getItem(id, userId)) ?? item));
      }

      const fields = {
        ...edits,
        title: edits.title === '' ? null : edits.title,
        userNote: edits.userNote === '' ? null : edits.userNote,
        tags: edits.tags ? [...new Set(edits.tags)] : undefined,
      };
      const updated: SavedItem = {
        ...item,
        ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
      };

      // Keep semantic search in sync with the edit (best effort: the old vector stays if AI is down)
      let embedding: number[] | null = null;
      try {
        embedding = Array.from(await generateEmbedding(buildEmbeddingText(updated)));
      } catch (error) {
        console.warn('[Items] Re-embedding after edit failed; keeping previous embedding:', error);
      }

      await updateItemFields(id, userId, fields, embedding);
      const fresh = await getItem(id, userId);
      return res.status(200).json(toResponse(fresh ?? updated));
    }

    // POST: reprocess
    const parsed = PostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Unknown action', available: ['reprocess', 'refresh-media', 'restore'] });
    }

    if (parsed.data.action === 'restore') {
      await restoreItem(id, userId);
      return res.status(200).json(toResponse((await getItem(id, userId)) ?? item));
    }

    if (parsed.data.action === 'refresh-media') {
      // Social CDNs expire preview links; re-scrape without spending an AI call.
      const scraped = await enrichUrl(item.url, item.platform);
      // og:image links arrive HTML-encoded ("&amp;"), which breaks signed CDN URLs
      const thumbnailUrl = scraped.thumbnailUrl ? decodeHtmlEntities(scraped.thumbnailUrl) : null;
      const mediaUrl = scraped.mediaUrl ? decodeHtmlEntities(scraped.mediaUrl) : null;
      if (thumbnailUrl || mediaUrl) await updateItemMedia(id, userId, { thumbnailUrl, mediaUrl });
      return res.status(200).json({
        ...toResponse(item),
        thumbnailUrl: thumbnailUrl ?? item.thumbnailUrl,
        mediaUrl: mediaUrl ?? item.mediaUrl,
        refreshed: Boolean(thumbnailUrl && thumbnailUrl !== item.thumbnailUrl),
      });
    }

    const reprocessed = await enrichItem({
      id: item.id,
      userId,
      url: item.url,
      platform: item.platform,
      sharedTitle: item.title,
      sharedText: '',
      userNote: item.userNote,
      savedAt: item.savedAt,
      // A manual retry gets a fresh set of automatic retries if it fails again
      previousAttempts: 0,
    });
    await upsertItem(reprocessed);
    return res.status(200).json(toResponse(reprocessed));
  } catch (error) {
    console.error('[Items] Error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}
