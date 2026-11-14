/**
 * Content Extraction Utilities
 * Tries multiple strategies to enrich URLs with metadata
 * Works in serverless (no puppeteer/playwright - too heavy)
 */

import type { Platform, ExtractedEntities } from './types';

// ============================================
// Platform Detection & URL Parsing
// ============================================

export function extractShortcode(url: string, platform: Platform): string | null {
  try {
    const pathname = new URL(url).pathname;

    const patterns: Record<Platform, RegExp[]> = {
      instagram: [
        /\/reel\/([^/?#]+)/,
        /\/p\/([^/?#]+)/,
        /\/tv\/([^/?#]+)/,
      ],
      tiktok: [
        /\/video\/(\d+)/,
        /\/@[^/]+\/video\/(\d+)/,
      ],
      x: [
        /\/status\/(\d+)/,
      ],
      youtube: [
        /\/watch\?v=([^&]+)/,
        /\/shorts\/([^/?#]+)/,
        /youtu\.be\/([^/?#]+)/,
      ],
      reddit: [
        /\/comments\/([^/?#]+)/,
      ],
      pinterest: [
        /\/pin\/(\d+)/,
      ],
      linkedin: [
        /\/feed\/update\/urn:li:activity:(\d+)/,
      ],
      threads: [
        /\/post\/([^/?#]+)/,
      ],
      bluesky: [
        /\/profile\/[^/]+\/post\/([^/?#]+)/,
      ],
      generic: [],
    };

    for (const regex of patterns[platform] || []) {
      const match = pathname.match(regex);
      if (match) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

export function buildCanonicalUrl(platform: Platform, shortcode: string): string {
  const bases: Record<Platform, string> = {
    instagram: `https://www.instagram.com/reel/${shortcode}/`,
    tiktok: `https://www.tiktok.com/@user/video/${shortcode}`,
    x: `https://x.com/user/status/${shortcode}`,
    youtube: `https://www.youtube.com/watch?v=${shortcode}`,
    reddit: `https://www.reddit.com/comments/${shortcode}`,
    pinterest: `https://www.pinterest.com/pin/${shortcode}/`,
    linkedin: `https://www.linkedin.com/feed/update/urn:li:activity:${shortcode}`,
    threads: `https://www.threads.net/@user/post/${shortcode}`,
    bluesky: `https://bsky.app/profile/user/post/${shortcode}`,
    generic: shortcode,
  };
  return bases[platform] || shortcode;
}

// ============================================
// oEmbed / Public Endpoints (No Auth)
// ============================================

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  html?: string;
  width?: number;
  height?: number;
  type?: string;
  version?: string;
}

export async function tryOEmbed(url: string): Promise<Partial<OEmbedResponse> | null> {
  const endpoints: Record<string, string> = {
    'instagram.com': 'https://graph.facebook.com/v18.0/instagram_oembed?url=',
    'tiktok.com': 'https://www.tiktok.com/oembed?url=',
    'x.com': 'https://publish.twitter.com/oembed?url=',
    'twitter.com': 'https://publish.twitter.com/oembed?url=',
    'youtube.com': 'https://www.youtube.com/oembed?url=',
    'youtu.be': 'https://www.youtube.com/oembed?url=',
    'reddit.com': 'https://www.reddit.com/oembed?url=',
    'pinterest.com': 'https://www.pinterest.com/oembed?url=',
    'vimeo.com': 'https://vimeo.com/api/oembed.json?url=',
    'soundcloud.com': 'https://soundcloud.com/oembed?url=',
  };

  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const baseUrl = endpoints[hostname];
    if (!baseUrl) return null;

    const response = await fetch(`${baseUrl}${encodeURIComponent(url)}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;
    return await response.json() as OEmbedResponse;
  } catch {
    return null;
  }
}

// ============================================
// Meta Tag Scraping (Lightweight)
// ============================================

export interface MetaTags {
  title?: string;
  description?: string;
  image?: string;
  video?: string;
  author?: string;
  publishedTime?: string;
  tags?: string[];
  [key: string]: string | string[] | undefined;
}

export async function fetchMetaTags(url: string): Promise<MetaTags | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MindSpace/1.0; +https://mindspace.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });

    if (!response.ok) return null;
    const html = await response.text();

    const meta: MetaTags = {};
    const metaRegex = /<meta\s+(?:property|name)=["']([^"']+)["']\s+content=["']([^"']*)["']/gi;
    let match;
    while ((match = metaRegex.exec(html)) !== null) {
      const [, key, value] = match;
      if (key.startsWith('og:') || key.startsWith('twitter:') || key === 'description' || key === 'author') {
        (meta as Record<string, string | string[] | undefined>)[key] = value;
      }
    }

    const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (data['@type'] === 'VideoObject' || data['@type'] === 'SocialMediaPosting') {
          meta.title = meta.title || data.name;
          meta.description = meta.description || data.description;
          meta.image = meta.image || data.thumbnailUrl;
          meta.video = meta.video || data.contentUrl;
          meta.author = meta.author || data.author?.name;
          meta.publishedTime = meta.publishedTime || data.datePublished;
        }
      } catch {}
    }

    return {
      title: (meta['og:title'] || meta['twitter:title'] || meta.title) as string | undefined,
      description: (meta['og:description'] || meta['twitter:description'] || meta.description) as string | undefined,
      image: (meta['og:image'] || meta['twitter:image'] || meta.image) as string | undefined,
      video: (meta['og:video'] || meta['twitter:player:stream'] || meta.video) as string | undefined,
      author: (meta['og:site_name'] || meta.author) as string | undefined,
      publishedTime: (meta['article:published_time'] || meta.publishedTime) as string | undefined,
      tags: meta['og:tag'] ? (Array.isArray(meta['og:tag']) ? meta['og:tag'] : [meta['og:tag']]) : [],
    };
  } catch {
    return null;
  }
}

// ============================================
// Platform-Specific Enrichment
// ============================================

export interface EnrichedMetadata {
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  authorUsername?: string;
  authorDisplayName?: string;
  publishedAt?: string;
  tags?: string[];
  entities?: ExtractedEntities;
}

export async function enrichUrl(url: string, platform: Platform): Promise<EnrichedMetadata> {
  const result: EnrichedMetadata = {};

  const oembed = await tryOEmbed(url);
  if (oembed) {
    result.title = oembed.title;
    result.authorDisplayName = oembed.author_name;
    result.thumbnailUrl = oembed.thumbnail_url;
  }

  const meta = await fetchMetaTags(url);
  if (meta) {
    result.title = result.title || meta.title;
    result.description = meta.description;
    result.thumbnailUrl = result.thumbnailUrl || meta.image;
    result.mediaUrl = meta.video;
    result.authorDisplayName = result.authorDisplayName || meta.author;
    result.publishedAt = meta.publishedTime;
    result.tags = meta.tags;
  }

  switch (platform) {
    case 'instagram':
      break;
    case 'youtube':
      if (result.mediaUrl && !result.mediaUrl.includes('youtube.com')) {
        const videoId = extractShortcode(url, 'youtube');
        if (videoId) {
          result.mediaUrl = `https://www.youtube.com/embed/${videoId}`;
        }
      }
      break;
    case 'tiktok':
      break;
    case 'x':
      break;
  }

  return result;
}

// ============================================
// Entity Extraction Helpers (Regex-based fallbacks)
// ============================================

const RECIPE_KEYWORDS = ['recipe', 'ingredients', 'instructions', 'cook', 'bake', 'oven', 'minutes', 'cups', 'tbsp', 'tsp', 'grams', 'kg'];
const WORKOUT_KEYWORDS = ['workout', 'exercise', 'reps', 'sets', 'cardio', 'strength', 'hiit', 'yoga', 'pilates', 'run', 'km', 'miles'];
const PRODUCT_KEYWORDS = ['buy', 'price', '$', '€', '£', 'amazon', 'shop', 'store', 'discount', 'sale', 'coupon'];
const PLACE_KEYWORDS = ['restaurant', 'cafe', 'hotel', 'address', 'location', 'visit', 'travel', 'trip', 'city', 'street'];
const EVENT_KEYWORDS = ['event', 'conference', 'meetup', 'workshop', 'webinar', 'date', 'time', 'venue', 'ticket'];

export function quickEntityExtraction(text: string): ExtractedEntities {
  const lower = text.toLowerCase();
  const entities: ExtractedEntities = {};

  if (RECIPE_KEYWORDS.some(k => lower.includes(k))) {
    entities.recipe = {
      name: 'Detected recipe',
      ingredients: extractListItems(text, 'ingredient'),
      instructions: extractListItems(text, 'instruction'),
    };
  }

  if (WORKOUT_KEYWORDS.some(k => lower.includes(k))) {
    entities.workout = {
      name: 'Detected workout',
      type: lower.includes('hiit') ? 'HIIT' : lower.includes('yoga') ? 'Yoga' : 'General',
      duration: extractDuration(text),
    };
  }

  if (PRODUCT_KEYWORDS.some(k => lower.includes(k))) {
    entities.product = {
      name: 'Detected product',
      price: extractPrice(text),
    };
  }

  if (PLACE_KEYWORDS.some(k => lower.includes(k))) {
    entities.place = {
      name: 'Detected place',
    };
  }

  if (EVENT_KEYWORDS.some(k => lower.includes(k))) {
    entities.event = {
      name: 'Detected event',
    };
  }

  return entities;
}

function extractListItems(text: string, type: string): string[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  return lines
    .filter(l => l.toLowerCase().includes(type) || /^[\d\-\*•]\s/.test(l.trim()))
    .slice(0, 10)
    .map(l => l.replace(/^[\d\-\*•]\s*/, '').trim());
}

function extractDuration(text: string): string | undefined {
  const match = text.match(/(\d+)\s*(min|mins|minutes|hr|hrs|hours?)/i);
  return match ? `${match[1]} ${match[2]}` : undefined;
}

function extractPrice(text: string): string | undefined {
  const match = text.match(/[$€£]\s?(\d+(?:[.,]\d+)?)/);
  return match ? match[0] : undefined;
}

export function detectPlatform(url: string): Platform {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    if (hostname.includes('instagram.com')) return 'instagram';
    if (hostname.includes('tiktok.com')) return 'tiktok';
    if (hostname.includes('x.com') || hostname.includes('twitter.com')) return 'x';
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
    if (hostname.includes('reddit.com')) return 'reddit';
    if (hostname.includes('pinterest.com')) return 'pinterest';
    if (hostname.includes('linkedin.com')) return 'linkedin';
    if (hostname.includes('threads.net')) return 'threads';
    if (hostname.includes('bsky.app')) return 'bluesky';
    return 'generic';
  } catch {
    return 'generic';
  }
}

export function extractUsername(url: string, platform: Platform): string | null {
  try {
    const pathname = new URL(url).pathname;
    const patterns: Record<Platform, RegExp> = {
      instagram: /^\/@?([^/]+)\//,
      tiktok: /^\/@?([^/]+)\//,
      x: /^\/@?([^/]+)\//,
      youtube: /^\/(?:@|c\/|user\/)?([^/]+)/,
      reddit: /^\/user\/([^/]+)/,
      pinterest: /^\/@?([^/]+)\//,
      linkedin: /^\/in\/([^/]+)/,
      threads: /^\/@?([^/]+)\//,
      bluesky: /^\/profile\/([^/]+)/,
      generic: /^\/?([^/]+)/,
    };
    const match = pathname.match(patterns[platform]);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}