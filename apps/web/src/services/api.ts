/**
 * API client for the CURIO PWA
 * Handles communication with Vercel serverless functions
 */

import type { SavedItem, SearchResponse, ChatResponse, ClusterResponse, IngestRequest, IngestResponse } from '@curio/shared';

const API_BASE = '/api';

type AuthTokenGetter = () => Promise<string | null>;
let getAuthToken: AuthTokenGetter | null = null;

export function setAuthTokenGetter(getter: AuthTokenGetter | null): void {
  getAuthToken = getter;
}

class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken ? await getAuthToken() : null;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let error: { error?: string; details?: unknown } = {};
    try {
      error = await response.json();
    } catch {
      // Vercel runtime crashes may return an HTML error page instead of JSON.
    }
    const message = error.error || `CURIO server request failed (${response.status})`;
    throw new ApiError(response.status, message, error.details);
  }

  return response.json();
}

/* ============================================
   Ingest - Save new items
   ============================================ */

export async function ingestItem(data: IngestRequest): Promise<IngestResponse> {
  return fetchJson<IngestResponse>('/ingest', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/* ============================================
   Search - Semantic + keyword search
   ============================================ */

export interface SearchParams {
  q?: string;
  platform?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  semantic?: boolean;
  /** Smart collection: recipe | place | product | event | workout */
  entity?: string;
  /** Saves similar to this item id */
  relatedTo?: string;
}

export interface LibraryFacets {
  total: number;
  platforms: Record<string, number>;
  entities: Record<string, number>;
  tags: Array<{ tag: string; count: number }>;
}

export async function getFacets(): Promise<LibraryFacets> {
  return fetchJson<LibraryFacets>('/search?facets=1');
}

export async function searchItems(params: SearchParams = {}): Promise<SearchResponse> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        searchParams.append(key, value.join(','));
      } else {
        searchParams.append(key, String(value));
      }
    }
  });

  return fetchJson<SearchResponse>(`/search?${searchParams.toString()}`);
}

/* ============================================
   Chat - RAG over saved items
   ============================================ */

export interface ChatParams {
  message: string;
  contextLimit?: number;
  filter?: {
    platform?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
}

export async function chatWithSaves(params: ChatParams): Promise<ChatResponse> {
  return fetchJson<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/* ============================================
   Clusters - AI-generated thematic groups
   ============================================ */

export async function getClusters(): Promise<ClusterResponse> {
  return fetchJson<ClusterResponse>('/clusters');
}

export async function regenerateClusters(): Promise<ClusterResponse> {
  return fetchJson<ClusterResponse>('/clusters', {
    method: 'POST',
  });
}

/* ============================================
   Item Operations
   ============================================ */

export async function getItem(id: string): Promise<SavedItem | null> {
  try {
    return await fetchJson<SavedItem>(`/items/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export interface ItemEdits {
  title?: string | null;
  userNote?: string | null;
  tags?: string[];
}

export async function updateItem(id: string, edits: ItemEdits): Promise<SavedItem> {
  return fetchJson<SavedItem>(`/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(edits),
  });
}

export async function deleteItem(id: string): Promise<void> {
  await fetchJson<{ success: boolean }>(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Re-run AI summary, tags, entities and embedding for a save. */
export async function reprocessItem(id: string): Promise<SavedItem> {
  return fetchJson<SavedItem>(`/items/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'reprocess' }),
  });
}

/** Re-scrape an item's preview image (social CDN links expire). */
export async function refreshItemMedia(id: string): Promise<SavedItem & { refreshed?: boolean }> {
  return fetchJson<SavedItem & { refreshed?: boolean }>(`/items/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'refresh-media' }),
  });
}

/** Downloads every save as JSON (authenticated, unlike a plain link). */
export async function downloadExport(): Promise<void> {
  const token = getAuthToken ? await getAuthToken() : null;
  const response = await fetch(`${API_BASE}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(response.status, `Export failed (${response.status})`);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `curio-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/* ============================================
   Health Check
   ============================================ */

export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  return fetchJson('/health');
}

export { ApiError };
