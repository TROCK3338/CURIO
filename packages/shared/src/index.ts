/**
 * Shared types between PWA (web) and API (serverless)
 * Single source of truth for data contracts
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
  url: string;
  platform: Platform;
  title: string | null;
  userNote: string | null;           // Text from share sheet (caption, selected text)
  summary: string | null;            // AI-generated summary
  tags: string[];                    // AI-generated tags
  entities: ExtractedEntities;       // Structured entities (recipe, product, etc.)
  embedding: number[] | null;        // 768-dim vector for semantic search
  mediaUrl: string | null;           // Direct video/image URL if extracted
  thumbnailUrl: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  publishedAt: string | null;        // ISO timestamp from platform
  savedAt: string;                   // ISO timestamp when user saved
  updatedAt: string;
  enrichmentStatus: 'pending' | 'enriched' | 'failed';
  enrichmentError: string | null;
}

export interface ExtractedEntities {
  // Recipe
  recipe?: {
    name: string;
    ingredients: string[];
    instructions: string[];
    cuisine?: string;
    dietTags?: string[];
  };
  // Product
  product?: {
    name: string;
    brand?: string;
    price?: string;
    currency?: string;
    url?: string;
  };
  // Place
  place?: {
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    placeId?: string;
  };
  // Event
  event?: {
    name: string;
    startAt?: string;
    endAt?: string;
    location?: string;
  };
  // Workout
  workout?: {
    name: string;
    type?: string;
    duration?: string;
    equipment?: string[];
  };
  // Generic key-value for extensibility
  [key: string]: unknown;
}

// ============================================
// API Request/Response Types
// ============================================

export interface IngestRequest {
  url: string;
  title?: string;
  text?: string;           // Caption or selected text from share sheet
  files?: File[];          // Images/videos shared directly (future)
  userNote?: string;       // Explicit note from user (future voice input)
}

export interface IngestResponse {
  success: boolean;
  item?: SavedItem;
  error?: string;
  message?: string;
}

export interface SearchRequest {
  q: string;                    // Semantic search query
  platform?: Platform;
  tags?: string[];
  dateFrom?: string;            // ISO date
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
  contextLimit?: number;        // Number of items to include in context
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
  // AI behavior
  autoTag: boolean;
  autoSummarize: boolean;
  preferredModel: string;
  customTagPrompt?: string;
  customSummaryPrompt?: string;

  // Sync
  syncEnabled: boolean;
  syncIntervalMinutes: number;
  wifiOnlySync: boolean;

  // UI
  theme: 'system' | 'light' | 'dark';
  defaultView: 'timeline' | 'grid' | 'map' | 'clusters';
  itemsPerPage: number;

  // Privacy
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
  theme: 'dark',
  defaultView: 'timeline',
  itemsPerPage: 20,
  analyticsEnabled: false,
  crashReportingEnabled: false,
};

// ============================================
// Database Schema (for reference)
// ============================================

/*
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  title TEXT,
  user_note TEXT,
  summary TEXT,
  tags TEXT,              -- JSON array
  entities TEXT,          -- JSON object
  embedding BLOB,         -- sqlite-vec vector (768 dims)
  media_url TEXT,
  thumbnail_url TEXT,
  author_username TEXT,
  author_display_name TEXT,
  published_at TEXT,
  saved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  enrichment_status TEXT NOT NULL DEFAULT 'pending',
  enrichment_error TEXT
);

-- Vector search virtual table
CREATE VIRTUAL TABLE items_vec USING vec0(
  embedding FLOAT[768]
);

-- Indexes
CREATE INDEX idx_items_platform ON items(platform);
CREATE INDEX idx_items_saved_at ON items(saved_at DESC);
CREATE INDEX idx_items_tags ON items(tags);  -- JSON1 extension for tag queries
*/

// ============================================
// Type Aliases (for backward compatibility)
// ============================================

export type SearchParams = SearchRequest;
export type ChatParams = ChatRequest;
export type IngestData = IngestRequest;