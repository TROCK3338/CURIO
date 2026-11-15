/**
 * AI Client (Cloudflare Workers AI)
 *
 * NOTE: the file is still called gemini.ts so existing imports keep working,
 * but it now talks to Cloudflare Workers AI's REST API (free daily allowance,
 * no credit card needed). Handles: embeddings, summarization, tagging,
 * entity extraction, chat and clustering.
 *
 * Required env vars:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN   (token with Workers AI read + edit permission)
 */

import type { SavedItem, ExtractedEntities, Platform } from './types';

// ============================================
// Configuration
// ============================================

const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
const EMBEDDING_DIMENSIONS = 768; // must match the vector column size in the DB

const REQUEST_TIMEOUT_MS = 25_000;

// Small models have short context windows, so keep prompts compact.
const MAX_EMBEDDING_CHARS = 2000;
const MAX_NOTE_CHARS = 1500;
const MAX_CHAT_CONTEXT_CHARS = 6000;

function getCredentials(): { accountId: string; apiToken: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN environment variable');
  }
  return { accountId, apiToken };
}

// ============================================
// Prompt Templates
// ============================================

const SYSTEM_PROMPT = `You are CURIO, an AI that helps users organize and retrieve their saved content.
You process content from social media (Instagram, TikTok, X, YouTube, etc.) and the web.
Be concise, accurate, and helpful. Never hallucinate. If unsure, say so.`;

const TAGGING_PROMPT = `Analyze the content and return 3-8 relevant tags.
Tags should be lowercase, singular, from this preferred vocabulary:
["design", "ui", "ux", "coding", "programming", "javascript", "react", "python", "ai", "ml", "productivity", "learning", "tutorial", "inspiration", "reference", "recipe", "cooking", "food", "workout", "fitness", "health", "travel", "place", "restaurant", "hotel", "product", "shopping", "tech", "gadget", "book", "article", "video", "podcast", "music", "art", "photography", "business", "finance", "investing", "career", "marketing", "writing", "creative", "minimalism", "organization", "mental-health", "meditation", "science", "space", "history", "philosophy", "psychology", "education", "language", "diy", "craft", "home", "garden", "fashion", "beauty", "style"]

Also include platform-specific tags: ["instagram", "tiktok", "x", "youtube", "reels", "shorts", "tweet", "thread"]`;

const SUMMARY_PROMPT = `Write a 2-3 sentence summary capturing the key insight or value of this content.
Focus on: what is this about, why might someone save it, what's actionable or memorable.
Be specific, not generic. No fluff.`;

const ENTITY_EXTRACTION_PROMPT = `Extract structured entities from the content. Use this shape:

{
  "recipe": { "name": string, "ingredients": string[], "instructions": string[], "cuisine"?: string, "dietTags"?: string[] },
  "product": { "name": string, "brand"?: string, "price"?: string, "currency"?: string, "url"?: string },
  "place": { "name": string, "address"?: string },
  "event": { "name": string, "startAt"?: string, "endAt"?: string, "location"?: string },
  "workout": { "name": string, "type"?: string, "duration"?: string, "equipment"?: string[] }
}

Only include entity keys that are clearly present. If none, use {}.`;

const CHAT_PROMPT = (context: string) => `You are CURIO, answering questions using ONLY the user's saved content below.
If the answer isn't in the context, say "I don't have that information in your saves."
Cite sources by referencing the item titles/URLs.

CONTEXT:
${context}

QUESTION:`;

// ============================================
// Low-level Cloudflare REST helpers
// ============================================

interface CloudflareResponse<T> {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
}

async function runModel<T>(model: string, body: unknown): Promise<T> {
  const { accountId, apiToken } = getCredentials();
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let json: CloudflareResponse<T> | null = null;
  try {
    json = await response.json() as CloudflareResponse<T>;
  } catch {
    // fall through to the error below
  }

  if (!response.ok || !json || json.success === false || json.result === undefined) {
    const detail = json?.errors?.map(e => e.message).filter(Boolean).join('; ');
    throw new Error(`Cloudflare AI request failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  return json.result;
}

async function generateText(
  userPrompt: string,
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const result = await runModel<{ response?: unknown }>(TEXT_MODEL, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.3,
  });

  const out = result.response;
  if (typeof out === 'string') return out;
  if (out == null) return '';
  return JSON.stringify(out); // some models return already-parsed JSON
}

function extractJson(text: string, kind: 'object' | 'array'): unknown {
  const pattern = kind === 'object' ? /\{[\s\S]*\}/ : /\[[\s\S]*\]/;
  const match = text.match(pattern);
  return JSON.parse(match ? match[0] : text);
}

// ============================================
// Core AI Functions
// ============================================

export async function generateEmbedding(text: string): Promise<Float32Array> {
  try {
    const input = text.slice(0, MAX_EMBEDDING_CHARS);
    const result = await runModel<{ data?: number[][] }>(EMBEDDING_MODEL, { text: [input] });

    const vector = result.data?.[0];
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Unexpected embedding shape (expected ${EMBEDDING_DIMENSIONS} numbers, got ${Array.isArray(vector) ? vector.length : typeof vector})`,
      );
    }
    return new Float32Array(vector);
  } catch (error) {
    console.error('[AI] Embedding failed:', error);
    throw new Error('Failed to generate embedding');
  }
}

export interface ProcessedItem {
  summary: string;
  tags: string[];
  entities: ExtractedEntities;
}

function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const tags = raw
    .filter((t): t is string => typeof t === 'string')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && t.length <= 40);
  return [...new Set(tags)].slice(0, 8);
}

export async function processItem(
  url: string,
  platform: Platform,
  title: string | null,
  userNote: string | null,
  mediaContext?: string
): Promise<ProcessedItem> {
  const contextParts = [
    `Platform: ${platform}`,
    `URL: ${url}`,
    title ? `Title: ${title}` : null,
    userNote ? `User Note/Caption: ${userNote.slice(0, MAX_NOTE_CHARS)}` : null,
    mediaContext ? `Media Analysis: ${mediaContext.slice(0, MAX_NOTE_CHARS)}` : null,
  ].filter(Boolean);

  const prompt = `
${contextParts.join('\n')}

---
TASKS:
1. SUMMARY: ${SUMMARY_PROMPT}
2. TAGS: ${TAGGING_PROMPT}
3. ENTITIES: ${ENTITY_EXTRACTION_PROMPT}

Return ONLY a JSON object with exactly these keys: "summary" (string), "tags" (array of strings), "entities" (object). No explanation, no markdown.
`;

  try {
    const response = await generateText(prompt, { maxTokens: 1024, temperature: 0.2 });
    const parsed = extractJson(response, 'object') as Record<string, unknown>;

    const entities =
      parsed.entities && typeof parsed.entities === 'object' && !Array.isArray(parsed.entities)
        ? (parsed.entities as ExtractedEntities)
        : {};

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      tags: cleanTags(parsed.tags),
      entities,
    };
  } catch (error) {
    console.error('[AI] Process item failed:', error);
    return {
      summary: userNote?.slice(0, 200) ?? 'Saved from ' + platform,
      tags: [platform, 'saved'],
      entities: {},
    };
  }
}

export interface ChatResult {
  answer: string;
  citations: Array<{
    itemId: string;
    itemTitle: string;
    itemUrl: string;
    relevanceScore: number;
    excerpt: string;
  }>;
}

export async function chatWithSaves(
  question: string,
  items: SavedItem[],
  maxContextItems = 10
): Promise<ChatResult> {
  const contextItems = items.slice(0, maxContextItems);

  let context = '';
  const usedItems: SavedItem[] = [];
  for (const [i, item] of contextItems.entries()) {
    const block = `
[${i + 1}] ${item.title || 'Untitled'} (${item.platform})
URL: ${item.url}
Summary: ${(item.summary || item.userNote || 'No summary').slice(0, 400)}
Tags: ${item.tags.join(', ')}
`;
    if (context.length + block.length > MAX_CHAT_CONTEXT_CHARS) break;
    context += (context ? '\n---\n' : '') + block;
    usedItems.push(item);
  }

  const prompt = CHAT_PROMPT(context) + question;

  try {
    const answer = (await generateText(prompt, { maxTokens: 1024, temperature: 0.3 })).trim();
    const lowerAnswer = answer.toLowerCase();

    const citations = usedItems
      .filter(item => {
        const titleStart = item.title?.toLowerCase().slice(0, 20).trim();
        return (titleStart && lowerAnswer.includes(titleStart)) || lowerAnswer.includes(item.url.toLowerCase());
      })
      .map((item, i) => ({
        itemId: item.id,
        itemTitle: item.title || 'Untitled',
        itemUrl: item.url,
        relevanceScore: 1 - i * 0.1,
        excerpt: item.summary || item.userNote || '',
      }));

    return { answer, citations };
  } catch (error) {
    console.error('[AI] Chat failed:', error);
    return {
      answer: 'Sorry, I encountered an error while processing your question.',
      citations: [],
    };
  }
}

export interface Cluster {
  id: string;
  label: string;
  description: string;
  tags: string[];
  itemIds: string[];
}

export async function generateClusters(items: SavedItem[]): Promise<Cluster[]> {
  if (items.length < 5) return [];

  // Keep the prompt small so it fits the model's context window.
  const sample = items.slice(0, 60);
  const knownIds = new Set(sample.map(item => item.id));
  const context = sample
    .map(item =>
      [
        item.id,
        (item.title || '').slice(0, 60),
        (item.summary || item.userNote || '').slice(0, 100),
        item.tags.slice(0, 5).join(','),
      ].join('|'),
    )
    .join('\n');

  const prompt = `
Analyze these saved items and group them into 3-8 thematic clusters.
Each line: ID | Title | Summary | Tags

${context}

Return ONLY a JSON array of clusters, no explanation:
[
  {
    "id": "cluster-1",
    "label": "Short Label",
    "description": "One sentence describing this cluster",
    "tags": ["tag1", "tag2"],
    "itemIds": ["item-id-1", "item-id-2"]
  }
]
Only use item IDs from the list above.
`;

  try {
    const response = await generateText(prompt, { maxTokens: 2048, temperature: 0.3 });
    const parsed = extractJson(response, 'array');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c, index) => ({
        id: typeof c.id === 'string' && c.id ? c.id : `cluster-${index + 1}`,
        label: typeof c.label === 'string' ? c.label : `Cluster ${index + 1}`,
        description: typeof c.description === 'string' ? c.description : '',
        tags: cleanTags(c.tags),
        itemIds: Array.isArray(c.itemIds)
          ? c.itemIds.filter((id): id is string => typeof id === 'string' && knownIds.has(id))
          : [],
      }))
      .filter(c => c.itemIds.length > 0);
  } catch (error) {
    console.error('[AI] Clustering failed:', error);
    return [];
  }
}

export async function countTokens(text: string): Promise<number> {
  // Rough estimate (~4 characters per token); Workers AI has no token-count endpoint.
  return Math.ceil(text.length / 4);
}
