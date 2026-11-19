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
import { PROMPTS } from './prompts.js';

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
      { role: 'system', content: PROMPTS.SYSTEM },
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

  const prompt = PROMPTS.PROCESS_ITEM(contextParts.join('\n'));

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

  const prompt = PROMPTS.CHAT(context) + question;

  try {
    const answer = (await generateText(prompt, { maxTokens: 1024, temperature: 0.3 })).trim();
    const lowerAnswer = answer.toLowerCase();

    const citations = usedItems
      .filter(item => {
        const rawTitle = item.title?.toLowerCase().trim();
        const titleMatch = rawTitle && rawTitle.length >= 10 ? rawTitle.slice(0, Math.min(rawTitle.length, 40)) : null;
        const matchesTitle = titleMatch ? lowerAnswer.includes(titleMatch) : false;
        const matchesUrl = item.url ? lowerAnswer.includes(item.url.toLowerCase()) : false;
        return matchesTitle || matchesUrl;
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

  const prompt = PROMPTS.CLUSTER(context);

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
