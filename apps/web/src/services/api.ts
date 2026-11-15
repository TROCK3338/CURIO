/**
 * API Client for MindSpace PWA
 * Handles communication with Vercel serverless functions
 */

import type { SavedItem, SearchResponse, ChatResponse, ClusterResponse, IngestRequest, IngestResponse } from '@mindspace/shared';

const API_BASE = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
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
    return await fetchJson<SavedItem>(`/items/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/* ============================================
   Health Check
   ============================================ */

export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  return fetchJson('/health');
}

export { ApiError };
