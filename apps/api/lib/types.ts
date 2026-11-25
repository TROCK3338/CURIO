/**
 * Local type definitions for API
 * Inlined from @curio/shared to avoid workspace dependency issues in Vercel
 */

// ============================================
// Platform Detection
// ============================================

export type Platform =
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'youtube'
  | 'reddit'
  | 'pinterest'
  | 'linkedin'
  | 'threads'
  | 'bluesky'
  | 'generic';

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

// ============================================
// Core Data Types
// ============================================

export interface SavedItem {
  id: string;
  userId?: string;
  url: string;
  platform: Platform;
  title: string | null;
  userNote: string | null;
  summary: string | null;
  tags: string[];
  entities: ExtractedEntities;
  embedding: number[] | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  publishedAt: string | null;
  savedAt: string;
  updatedAt: string;
  enrichmentStatus: 'pending' | 'enriched' | 'failed';
  enrichmentError: string | null;
}

export interface ExtractedEntities {
  recipe?: {
    name: string;
    ingredients: string[];
    instructions: string[];
    cuisine?: string;
    dietTags?: string[];
  };
  product?: {
    name: string;
    brand?: string;
    price?: string;
    currency?: string;
    url?: string;
  };
  place?: {
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    placeId?: string;
  };
  event?: {
    name: string;
    startAt?: string;
    endAt?: string;
    location?: string;
  };
  workout?: {
    name: string;
    type?: string;
    duration?: string;
    equipment?: string[];
  };
  [key: string]: unknown;
}

// ============================================
// API Request/Response Types
// ============================================

export interface IngestRequest {
  url: string;
  title?: string;
  text?: string;
  userNote?: string;
}

export interface IngestResponse {
  success: boolean;
  item?: SavedItem;
  error?: string;
  message?: string;
  /** Short line for the iOS Shortcut notification */
  notification?: string;
}

export interface SearchRequest {
  q: string;
  platform?: Platform;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  items: SavedItem[];
  total: number;
  hasMore: boolean;
}

export interface ChatRequest {
  message: string;
  contextLimit?: number;
  filter?: {
    platform?: Platform;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
}

export interface ChatResponse {
  answer: string;
  citations: ChatCitation[];
  relatedItems: SavedItem[];
}

export interface ChatCitation {
  itemId: string;
  itemTitle: string;
  itemUrl: string;
  relevanceScore: number;
  excerpt: string;
  /** The [n] number used for this item in the answer text. */
  marker?: number;
}

export interface ClusterResponse {
  clusters: Cluster[];
  generatedAt: string;
}

export interface Cluster {
  id: string;
  label: string;
  description: string;
  itemCount: number;
  tags: string[];
  representativeItems: Pick<SavedItem, 'id' | 'title' | 'thumbnailUrl' | 'url'>[];
}

// ============================================
// PWA / Share Target Types
// ============================================

export interface ShareTargetData {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

export interface OfflineQueueItem {
  id: string;
  payload: IngestRequest;
  createdAt: string;
  retries: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
}

// ============================================
// Settings / User Preferences
// ============================================

export interface UserSettings {
  autoTag: boolean;
  autoSummarize: boolean;
  preferredModel: string;
  customTagPrompt?: string;
  customSummaryPrompt?: string;
  syncEnabled: boolean;
  syncIntervalMinutes: number;
  wifiOnlySync: boolean;
  theme: 'system' | 'light' | 'dark';
  defaultView: 'timeline' | 'grid' | 'map' | 'clusters';
  itemsPerPage: number;
  analyticsEnabled: boolean;
  crashReportingEnabled: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  autoTag: true,
  autoSummarize: true,
  preferredModel: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
  syncEnabled: true,
  syncIntervalMinutes: 15,
  wifiOnlySync: true,
  theme: 'system',
  defaultView: 'timeline',
  itemsPerPage: 20,
  analyticsEnabled: false,
  crashReportingEnabled: false,
};