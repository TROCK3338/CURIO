/**
 * Prompt Templates
 * Centralized for easy customization across CURIO
 */

export const PROMPTS = {
  SYSTEM: `You are CURIO, an AI that helps users organize and retrieve their saved content.
You process content from social media (Instagram, TikTok, X, YouTube, etc.) and the web.
Be concise, accurate, and helpful. Never hallucinate. If unsure, say so.`,

  SUMMARIZE: `Write a 2-3 sentence summary capturing the key insight or value of this content.
Focus on: what is this about, why might someone save it, what's actionable or memorable.
Be specific, not generic. No fluff.`,

  TAG: `Analyze the content and return 3-8 relevant tags.
Tags should be lowercase, singular, from this preferred vocabulary:
["design", "ui", "ux", "coding", "programming", "javascript", "react", "python", "ai", "ml", "productivity", "learning", "tutorial", "inspiration", "reference", "recipe", "cooking", "food", "workout", "fitness", "health", "travel", "place", "restaurant", "hotel", "product", "shopping", "tech", "gadget", "book", "article", "video", "podcast", "music", "art", "photography", "business", "finance", "investing", "career", "marketing", "writing", "creative", "minimalism", "organization", "mental-health", "meditation", "science", "space", "history", "philosophy", "psychology", "education", "language", "diy", "craft", "home", "garden", "fashion", "beauty", "style"]

Also include platform-specific tags: ["instagram", "tiktok", "x", "youtube", "reels", "shorts", "tweet", "thread"]`,

  ENTITIES: `Extract structured entities from the content. Use this shape:

{
  "recipe": { "name": string, "ingredients": string[], "instructions": string[], "cuisine"?: string, "dietTags"?: string[] },
  "product": { "name": string, "brand"?: string, "price"?: string, "currency"?: string, "url"?: string },
  "place": { "name": string, "address"?: string },
  "event": { "name": string, "startAt"?: string, "endAt"?: string, "location"?: string },
  "workout": { "name": string, "type"?: string, "duration"?: string, "equipment"?: string[] }
}

Only include entity keys that are clearly present. If none, use {}.`,

  PROCESS_ITEM: (context: string) => `${PROMPTS.SYSTEM}

${context}

TASKS:
1. SUMMARY: ${PROMPTS.SUMMARIZE}
2. TAGS: ${PROMPTS.TAG}
3. ENTITIES: ${PROMPTS.ENTITIES}

Return ONLY a JSON object with exactly these keys: "summary" (string), "tags" (array of strings), "entities" (object). No explanation, no markdown.`,

  CHAT: (context: string) => `You are CURIO, answering questions using ONLY the user's saved content below.
If the answer isn't in the context, say "I don't have that information in your saves."
Cite sources by referencing the item titles/URLs.

CONTEXT:
${context}

QUESTION:`,

  CLUSTER: (itemsContext: string) => `Analyze these saved items and group them into 3-8 thematic clusters.
Each line: ID | Title | Summary | Tags

${itemsContext}

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
Only use item IDs from the list above.`,
};

export const DEFAULT_CUSTOM_PROMPTS = {
  tagPrompt: '',
  summaryPrompt: '',
  entityPrompt: '',
  chatPrompt: '',
};

export function buildCustomPrompt(basePrompt: string, customPrompt: string): string {
  if (!customPrompt.trim()) return basePrompt;
  return `${basePrompt}\n\nADDITIONAL INSTRUCTIONS FROM USER:\n${customPrompt}`;
}