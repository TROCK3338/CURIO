/**
 * Enrichment pipeline shared by /api/ingest, item reprocessing and the
 * retry cron: scrape metadata -> AI summary/tags/entities -> embedding.
 */

import { processItem, generateEmbedding } from './ai.js';
import { decodeHtmlEntities, enrichUrl } from './extractor.js';
import type { SavedItem, ExtractedEntities, Platform } from './types';

/** After this many failed attempts an item is marked 'failed' and left for a manual retry. */
export const MAX_ENRICHMENT_ATTEMPTS = 3;

export interface EnrichInput {
  id: string;
  userId: string;
  url: string;          // canonical URL
  platform: Platform;
  sharedTitle: string | null;
  /** Text that came with the share (caption etc.); dropped if it is just the URL or the scraped description. */
  sharedText: string;
  userNote: string | null;
  savedAt: string;
  /** How many attempts were made before this one. */
  previousAttempts?: number;
}

/** Keep only entities the AI actually filled in (drops empty / placeholder ones). */
export function cleanEntities(entities: ExtractedEntities | undefined): ExtractedEntities {
  const cleaned: ExtractedEntities = {};
  for (const [key, value] of Object.entries(entities ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const name = (value as { name?: unknown }).name;
    if (typeof name !== 'string' || !name.trim() || /^detected\s/i.test(name)) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

/** Text used to embed an item for semantic search. */
export function buildEmbeddingText(item: {
  title: string | null;
  userNote: string | null;
  summary: string | null;
  tags: string[];
  entities: ExtractedEntities;
}, extraContext = ''): string {
  return [
    item.title,
    item.userNote,
    extraContext,
    item.summary,
    item.tags.join(' '),
    Object.values(item.entities)
      .flatMap(e => Object.values(e as Record<string, unknown>))
      .filter(v => typeof v === 'string')
      .join(' '),
  ].filter(Boolean).join('\n');
}

const LOGIN_WALL_PATTERNS = [
  /^(log ?in|sign ?in|sign ?up|join)\b/i,                 // "Sign in | LinkedIn", "Log in • Instagram"
  /\b(log ?in|sign ?in|sign ?up)\s*(,|[|•·–—-])/i,       // "LinkedIn Login, Sign in | LinkedIn"
  /\bauthwall\b/i,
  /\b(log ?in|sign ?in) to (see|view|continue|access)\b/i,
];

/** True when scraped metadata describes a sign-in page rather than the shared post. */
export function isLoginWall(title?: string | null, description?: string | null): boolean {
  const text = [title, description].filter(Boolean).join(' \n ');
  return !!text && LOGIN_WALL_PATTERNS.some(p => p.test(title ?? '') || p.test(text));
}

export async function enrichItem(input: EnrichInput): Promise<SavedItem & { enrichmentAttempts: number }> {
  const { url, platform } = input;
  const attempts = (input.previousAttempts ?? 0) + 1;

  // Scrape metadata from the URL (best effort); meta tags often arrive HTML-encoded
  const scraped = await enrichUrl(url, platform);
  const decoded = {
    ...scraped,
    title: scraped.title ? decodeHtmlEntities(scraped.title).trim() || undefined : scraped.title,
    description: scraped.description ? decodeHtmlEntities(scraped.description).trim() || undefined : scraped.description,
    // og:image links come HTML-encoded ("&amp;"), which breaks signed CDN URLs
    thumbnailUrl: scraped.thumbnailUrl ? decodeHtmlEntities(scraped.thumbnailUrl) : scraped.thumbnailUrl,
    mediaUrl: scraped.mediaUrl ? decodeHtmlEntities(scraped.mediaUrl) : scraped.mediaUrl,
  };
  // Sites like LinkedIn serve their sign-in page to servers; don't summarize that as the content.
  const enriched = isLoginWall(decoded.title, decoded.description)
    ? { ...decoded, title: undefined, description: undefined }
    : decoded;

  const sharedTitle = input.sharedTitle ? decodeHtmlEntities(input.sharedTitle).trim() || null : null;
  let sharedText = input.sharedText ? decodeHtmlEntities(input.sharedText).trim() : '';
  if (sharedText === url || sharedText === enriched.description) sharedText = '';
  const userProvidedNote = [input.userNote?.trim(), sharedText].filter(Boolean).join('\n\n');

  // Everything the AI gets to read
  const aiContext = [userProvidedNote, enriched.description].filter(Boolean).join('\n\n');

  // For Instagram the scraped title is the clean caption; elsewhere prefer the shared title
  const bestTitle =
    platform === 'instagram'
      ? (enriched.title ?? sharedTitle ?? null)
      : (sharedTitle ?? enriched.title ?? null);

  let processed: Awaited<ReturnType<typeof processItem>>;
  try {
    processed = await processItem(url, platform, bestTitle, aiContext || null);
  } catch (error) {
    console.warn('[Enrich] AI enrichment unavailable; saving link without AI:', error);
    processed = { summary: aiContext || `Saved ${platform} link`, tags: [], entities: {} };
  }

  const entities = cleanEntities(processed.entities);
  const tags = [...new Set([...processed.tags, platform, ...(enriched.tags || [])])];

  let embedding: Float32Array | null = null;
  try {
    embedding = await generateEmbedding(
      buildEmbeddingText(
        { title: bestTitle, userNote: userProvidedNote || null, summary: processed.summary, tags, entities },
        enriched.description ?? '',
      ),
    );
  } catch (error) {
    console.warn('[Enrich] Embedding unavailable; saving without semantic index:', error);
  }

  const status: SavedItem['enrichmentStatus'] = embedding
    ? 'enriched'
    : attempts >= MAX_ENRICHMENT_ATTEMPTS ? 'failed' : 'pending';

  return {
    id: input.id,
    userId: input.userId,
    url,
    platform,
    title: bestTitle,
    userNote: userProvidedNote || null,
    summary: processed.summary,
    tags,
    entities,
    embedding: embedding ? Array.from(embedding) : null,
    mediaUrl: enriched.mediaUrl ?? null,
    thumbnailUrl: enriched.thumbnailUrl ?? null,
    authorUsername: enriched.authorUsername ?? null,
    authorDisplayName: enriched.authorDisplayName ?? null,
    publishedAt: enriched.publishedAt ?? null,
    savedAt: input.savedAt,
    updatedAt: new Date().toISOString(),
    enrichmentStatus: status,
    enrichmentError: embedding
      ? null
      : status === 'failed'
        ? `AI processing failed after ${attempts} attempts`
        : 'Saved without semantic enrichment; will retry automatically',
    enrichmentAttempts: embedding ? 0 : attempts,
  };
}
