/**
 * Text helpers for showing saved items nicely.
 * Works on already-saved items too, so older saves look clean without a migration.
 */

interface ItemLike {
  url?: string | null;
  platform?: string | null;
  title?: string | null;
  userNote?: string | null;
  authorUsername?: string | null;
  authorDisplayName?: string | null;
}

// ---------- HTML entities ----------

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
};

function fromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function decodeOnce(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => fromCodePoint(parseInt(num, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/** Turns "&quot;hello&quot;" into "hello" (handles double-encoded text too). */
export function decodeEntities(input: string | null | undefined): string {
  if (!input) return '';
  let text = decodeOnce(input);
  if (/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(text)) text = decodeOnce(text);
  return text;
}

// ---------- Captions & titles ----------

const INSTAGRAM_META_PREFIX =
  /^[\d.,KkMm]+\s+likes?,\s*[\d.,KkMm]+\s+comments?\s*-\s*[^:]*?\s+on\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}(?::\s*|\s*$)/;

/** Removes the "1,387 likes, 12 comments - user on Nov 14, 2026:" noise and wrapping quotes. */
export function cleanCaption(input: string | null | undefined): string {
  let text = decodeEntities(input).trim();
  text = text.replace(INSTAGRAM_META_PREFIX, '');
  text = text.replace(/^["“”]\s*/, '').replace(/\s*["“”]\.?\s*$/, '');
  return text.trim();
}

function capitalize(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

export function displayTitle(item: ItemLike): string {
  const raw = decodeEntities(item.title).trim();
  // 'Aditya Gond on Instagram: "Things to run on oracle free vps"'  ->  the caption part
  const withoutPrefix = raw.replace(/^.+?\s+on\s+Instagram:?\s*/i, '');
  const title = cleanCaption(withoutPrefix);
  if (title) return title;

  const fromNote = cleanCaption(item.userNote);
  if (fromNote) return fromNote;

  if (item.platform === 'instagram') return 'Instagram Reel';
  return `${capitalize(item.platform || 'Saved')} link`;
}

export function displayAuthor(item: ItemLike): string {
  const username = item.authorUsername?.trim();
  // Older saves stored the post code (e.g. "DfwQrOkuedN") as the username
  const looksLikePostCode = Boolean(username && item.url && item.url.includes(`/${username}`));
  if (username && !looksLikePostCode) return `@${username}`;

  const noteUsername = decodeEntities(item.userNote).match(
    /-\s*([\w.]+)\s+on\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}:/,
  )?.[1];
  if (noteUsername) return `@${noteUsername}`;

  const titleName = decodeEntities(item.title).match(/^(.+?)\s+on\s+Instagram/i)?.[1];
  if (titleName) return titleName.trim();

  const display = item.authorDisplayName?.trim();
  if (display && !/^(instagram|tiktok|youtube|x|twitter|reddit|generic)$/i.test(display)) return display;

  // Web links: the site is the most useful "author"
  if (item.url && (!item.platform || item.platform === 'generic')) {
    try {
      return new URL(item.url).hostname.replace(/^www\./, '').replace(/^(en|m)\./, '');
    } catch { /* fall through */ }
  }

  return capitalize(item.platform || 'saved');
}

// ---------- Tags ----------

// Tags that describe where something came from, not what it is about
const NON_TOPIC_TAGS = new Set([
  'instagram', 'tiktok', 'x', 'youtube', 'reddit', 'pinterest', 'linkedin', 'threads',
  'bluesky', 'generic', 'reels', 'reel', 'shorts', 'tweet', 'thread', 'saved', 'pending', 'video',
]);

export function topicTags(tags: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  for (const tag of tags ?? []) {
    const clean = tag.trim().toLowerCase();
    if (clean && !NON_TOPIC_TAGS.has(clean)) seen.add(clean);
  }
  return [...seen];
}

// ---------- Entities ----------

/** Drops empty or placeholder entities such as "Detected workout". */
export function cleanEntities(
  entities: Record<string, unknown> | null | undefined,
): Record<string, Record<string, unknown>> {
  const cleaned: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(entities ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const data = value as Record<string, unknown>;
    if (typeof data.name === 'string' && /^detected\s/i.test(data.name)) continue;
    const hasContent = Object.values(data).some(v =>
      Array.isArray(v) ? v.length > 0 : v != null && v !== '',
    );
    if (hasContent) cleaned[key] = data;
  }
  return cleaned;
}

// ---------- Misc ----------

export function pluralize(count: number, word: string, plural = `${word}s`): string {
  return `${count} ${count === 1 ? word : plural}`;
}
