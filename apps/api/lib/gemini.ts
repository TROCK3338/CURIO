/**
 * Gemini AI Client
 * Uses Gemini 1.5 Flash (free tier: 1,500 req/day)
 * Handles: embeddings, summarization, tagging, entity extraction, chat
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { SavedItem, ExtractedEntities, Platform } from '@mindspace/shared';

// ============================================
// Configuration
// ============================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY environment variable');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Model configuration
const FLASH_MODEL = 'gemini-1.5-flash';
const EMBEDDING_MODEL = 'text-embedding-004';

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const generationConfig = {
  temperature: 0.3,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 2048,
};

// ============================================
// Prompt Templates
// ============================================

const SYSTEM_PROMPT = `You are an AI assistant that processes saved content from social media and the web.
Your job: summarize, tag, and extract structured entities from the content provided.
Be concise, accurate, and consistent.`;

const TAGGING_PROMPT = `Analyze the content and return 3-8 relevant tags.
Tags should be lowercase, singular, from this preferred vocabulary:
["design", "ui", "ux", "coding", "programming", "javascript", "react", "python", "ai", "ml", "productivity", "learning", "tutorial", "inspiration", "reference", "recipe", "cooking", "food", "workout", "fitness", "health", "travel", "place", "restaurant", "hotel", "product", "shopping", "tech", "gadget", "book", "article", "video", "podcast", "music", "art", "photography", "business", "finance", "investing", "career", "marketing", "writing", "creative", "minimalism", "organization", "mental-health", "meditation", "science", "space", "history", "philosophy", "psychology", "education", "language", "diy", "craft", "home", "garden", "fashion", "beauty", "style"]

Also include platform-specific tags: ["instagram", "tiktok", "x", "youtube", "reels", "shorts", "tweet", "thread"]

Return ONLY a JSON array of strings. No explanation.`;

const SUMMARY_PROMPT = `Write a 2-3 sentence summary capturing the key insight or value of this content.
Focus on: what is this about, why might someone save it, what's actionable or memorable.
Be specific, not generic. No fluff.`;

const ENTITY_EXTRACTION_PROMPT = `Extract structured entities from the content. Return ONLY valid JSON matching this TypeScript interface:

interface ExtractedEntities {
  recipe?: { name: string; ingredients: string[]; instructions: string[]; cuisine?: string; dietTags?: string[] };
  product?: { name: string; brand?: string; price?: string; currency?: string; url?: string };
  place?: { name: string; address?: string; lat?: number; lng?: number; placeId?: string };
  event?: { name: string; startAt?: string; endAt?: string; location?: string };
  workout?: { name: string; type?: string; duration?: string; equipment?: string[] };
  [key: string]: unknown;
}

Only include entities that are clearly present. If none, return {}.`;

const CHAT_PROMPT = (context: string) => `You are a helpful assistant that answers questions using ONLY the user's saved content below.
If the answer isn't in the context, say "I don't have that information in your saves."
Cite sources by referencing the item titles/URLs.

CONTEXT:
${context}

QUESTION:`;

// ============================================
// Model Instances
// ============================================

const flashModel = genAI.getGenerativeModel({
  model: FLASH_MODEL,
  safetySettings,
  generationConfig,
  systemInstruction: SYSTEM_PROMPT,
});

const embeddingModel = genAI.getGenerativeModel({
  model: EMBEDDING_MODEL,
});

// ============================================
// Core AI Functions
// ============================================

/**
 * Generate embedding for semantic search
 * 768 dimensions, normalized
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  try {
    const result = await embeddingModel.embedContent(text);
    const embedding = result.embedding.values;
    return new Float32Array(embedding);
  } catch (error) {
    console.error('[Gemini] Embedding failed:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Process a saved item: summarize, tag, extract entities
 * Single API call for efficiency
 */
export interface ProcessedItem {
  summary: string;
  tags: string[];
  entities: ExtractedEntities;
}

export async function processItem(
  url: string,
  platform: Platform,
  title: string | null,
  userNote: string | null,
  mediaContext?: string
): Promise<ProcessedItem> {
  // Build context for the model
  const contextParts = [
    `Platform: ${platform}`,
    `URL: ${url}`,
    title ? `Title: ${title}` : null,
    userNote ? `User Note/Caption: ${userNote}` : null,
    mediaContext ? `Media Analysis: ${mediaContext}` : null,
  ].filter(Boolean);

  const context = contextParts.join('\n');

  const prompt = `
${context}

---
TASKS:
1. SUMMARY: ${SUMMARY_PROMPT}
2. TAGS: ${TAGGING_PROMPT}
3. ENTITIES: ${ENTITY_EXTRACTION_PROMPT}

Return ONLY a JSON object with keys: summary (string), tags (string[]), entities (object).
`;

  try {
    const result = await flashModel.generateContent(prompt);
    const response = result.response.text();

    // Parse JSON from response (handle potential markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response;
    const parsed = JSON.parse(jsonStr);

    return {
      summary: parsed.summary?.trim() ?? '',
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter(t => typeof t === 'string') : [],
      entities: parsed.entities ?? {},
    };
  } catch (error) {
    console.error('[Gemini] Process item failed:', error);
    // Return minimal fallback
    return {
      summary: userNote?.slice(0, 200) ?? 'Saved from ' + platform,
      tags: [platform, 'saved'],
      entities: {},
    };
  }
}

/**
 * Chat with user's saves (RAG)
 */
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
  // Build context from top items
  const contextItems = items.slice(0, maxContextItems);
  const context = contextItems
    .map((item, i) => `
[${i + 1}] ${item.title || 'Untitled'} (${item.platform})
URL: ${item.url}
Summary: ${item.summary || item.userNote || 'No summary'}
Tags: ${item.tags.join(', ')}
`).join('\n---\n');

  const prompt = CHAT_PROMPT(context) + question;

  try {
    const result = await flashModel.generateContent(prompt);
    const answer = result.response.text().trim();

    // Simple citation extraction: find which items were referenced
    const citations = contextItems
      .filter(item => answer.toLowerCase().includes(item.title?.toLowerCase().slice(0, 20) ?? ''))
      .map((item, i) => ({
        itemId: item.id,
        itemTitle: item.title || 'Untitled',
        itemUrl: item.url,
        relevanceScore: 1 - i * 0.1,
        excerpt: item.summary || item.userNote || '',
      }));

    return { answer, citations };
  } catch (error) {
    console.error('[Gemini] Chat failed:', error);
    return {
      answer: 'Sorry, I encountered an error while processing your question.',
      citations: [],
    };
  }
}

/**
 * Generate clusters from items (for periodic batch job)
 */
export interface Cluster {
  id: string;
  label: string;
  description: string;
  tags: string[];
  itemIds: string[];
}

export async function generateClusters(items: SavedItem[]): Promise<Cluster[]> {
  if (items.length < 5) return [];

  // Sample items for clustering (max 100 to fit context)
  const sample = items.slice(0, 100);
  const context = sample
    .map(item => `${item.id}|${item.title || ''}|${item.summary || item.userNote || ''}|${item.tags.join(',')}`)
    .join('\n');

  const prompt = `
Analyze these saved items and group them into 5-10 thematic clusters.
Each item: ID | Title | Summary | Tags

${context}

Return ONLY a JSON array of clusters:
[
  {
    "id": "cluster-1",
    "label": "Short Label",
    "description": "One sentence describing this cluster",
    "tags": ["tag1", "tag2"],
    "itemIds": ["item-id-1", "item-id-2"]
  }
]
`;

  try {
    const result = await flashModel.generateContent(prompt);
    const response = result.response.text();
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('[Gemini] Clustering failed:', error);
    return [];
  }
}

// ============================================
// Utility: Count Tokens (for monitoring usage)
// ============================================

export async function countTokens(text: string): Promise<number> {
  try {
    const result = await flashModel.countTokens(text);
    return result.totalTokens;
  } catch {
    return Math.ceil(text.length / 4); // Rough estimate
  }
}