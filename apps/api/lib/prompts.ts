/**
 * Prompt Templates
 * Centralized for easy customization
 */

export const PROMPTS = {
  SYSTEM: `You are MindSpace, an AI that helps users organize and retrieve their saved content.
You process content from social media (Instagram, TikTok, X, YouTube, etc.) and the web.
Be concise, accurate, and helpful. Never hallucinate. If unsure, say so.`,

  SUMMARIZE: (context: string) => `
${context}

---
Write a 2-3 sentence summary capturing the key insight or value of this content.
Focus on: what is this about, why might someone save it, what's actionable or memorable.
Be specific, not generic. No fluff.
Return ONLY the summary text.`,

  TAG: (context: string) => `
${context}

---
Return 3-8 relevant tags as a JSON array of strings.
Tags should be lowercase, singular.
Preferred vocabulary:
["design", "ui", "ux", "coding", "programming", "javascript", "react", "python", "ai", "ml", "productivity", "learning", "tutorial", "inspiration", "reference", "recipe", "cooking", "food", "workout", "fitness", "health", "travel", "place", "restaurant", "hotel", "product", "shopping", "tech", "gadget", "book", "article", "video", "podcast", "music", "art", "photography", "business", "finance", "investing", "career", "marketing", "writing", "creative", "minimalism", "organization", "mental-health", "meditation", "science", "space", "history", "philosophy", "psychology", "education", "language", "diy", "craft", "home", "garden", "fashion", "beauty", "style"]

Also include platform tags: ["instagram", "tiktok", "x", "youtube", "reels", "shorts", "tweet", "thread"]

Return ONLY a JSON array. Example: ["design", "ui", "inspiration", "instagram", "reels"]`,

  ENTITIES: (context: string) => `
${context}

---
Extract structured entities. Return ONLY valid JSON:
{
  "recipe": { "name": "", "ingredients": [], "instructions": [], "cuisine": "", "dietTags": [] },
  "product": { "name": "", "brand": "", "price": "", "currency": "", "url": "" },
  "place": { "name": "", "address": "", "lat": 0, "lng": 0, "placeId": "" },
  "event": { "name": "", "startAt": "", "endAt": "", "location": "" },
  "workout": { "name": "", "type": "", "duration": "", "equipment": [] }
}

Only include entities clearly present. Omit empty ones.`,

  PROCESS_ITEM: (context: string) => `
${context}

---
TASKS:
1. SUMMARY: 2-3 sentences, key insight, actionable value
2. TAGS: 3-8 lowercase tags from preferred vocabulary + platform tags
3. ENTITIES: Structured extraction (recipe, product, place, event, workout)

Return ONLY JSON:
{
  "summary": "string",
  "tags": ["tag1", "tag2"],
  "entities": { "recipe": {...}, "product": {...} }
}`,

  CHAT: (context: string, question: string) => `
You are MindSpace, answering questions using ONLY the user's saved content below.
If the answer isn't in the context, say "I don't have that information in your saves."
Cite sources by referencing item titles/URLs.

CONTEXT:
${context}

QUESTION: ${question}

ANSWER:`,

  CLUSTER: (itemsContext: string) => `
Analyze these saved items and group them into 5-10 thematic clusters.
Each line: ID | Title | Summary | Tags

${itemsContext}

Return ONLY a JSON array:
[
  {
    "id": "cluster-1",
    "label": "Short Label",
    "description": "One sentence describing this cluster",
    "tags": ["tag1", "tag2"],
    "itemIds": ["item-id-1", "item-id-2"]
  }
]`,
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