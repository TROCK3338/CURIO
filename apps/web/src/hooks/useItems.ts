/**
 * React Query Hooks for Items
 * Handles caching, synchronization, and optimistic updates
 */

import { useEffect, useState, useCallback } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { searchItems, chatWithSaves, getClusters, regenerateClusters, ingestItem, updateItem, deleteItem, restoreItem, reprocessItem, getFacets, type SearchParams, type ItemEdits } from '../services/api';
import { getItemsLocally, saveItemLocally, searchItemsLocally, deleteItemLocally } from '../services/indexeddb';
import type { SavedItem, SearchResponse, ChatParams, IngestRequest, IngestResponse } from '@curio/shared';

const ITEMS_QUERY_KEY = ['items'] as const;

/* ============================================
   Search Hook
   ============================================ */

export function useSearch(
  params: SearchParams = {},
  options?: Omit<UseQueryOptions<SearchResponse, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<SearchResponse, Error>({
    queryKey: [...ITEMS_QUERY_KEY, 'search', params],
    queryFn: () => searchItems(params),
    placeholderData: (previous) => previous, // Keep previous data while fetching
    staleTime: 1000 * 30, // 30 seconds
    ...options,
  });
}

export function useLocalSearch(query: string, limit = 20) {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, 'local-search', query, limit],
    queryFn: () => searchItemsLocally(query, limit),
    enabled: query.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/* ============================================
   Infinite Scroll Search
   ============================================ */

export function useInfiniteSearch(params: SearchParams = {}) {
  const limit = params.limit ?? 50;
  return useInfiniteQuery({
    queryKey: [...ITEMS_QUERY_KEY, 'infinite', params],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => searchItems({ ...params, offset: pageParam, limit }),
    getNextPageParam: (lastPage, allPages) => lastPage.hasMore ? allPages.length * limit : undefined,
    staleTime: 1000 * 60 * 5,
  });
}

/* ============================================
   Chat Hook
   ============================================ */

export function useChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: ChatParams) => chatWithSaves(params),
    onSuccess: (data) => {
      // Cache the chat result for potential reuse
      queryClient.setQueryData(['chat', data], data);
    },
  });
}

/* ============================================
   Clusters Hook
   ============================================ */

export function useClusters() {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, 'clusters'],
    queryFn: getClusters,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useRegenerateClusters() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: regenerateClusters,
    onSuccess: (data) => {
      queryClient.setQueryData(['items', 'clusters'], data);
    },
  });
}

/* ============================================
   Ingest/Save Hook
   ============================================ */

export function useSaveItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: IngestRequest) => ingestItem(data),
    onMutate: async (newItem) => {
      // Optimistic update - cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ITEMS_QUERY_KEY });

      // Snapshot previous values
      const previousItems = queryClient.getQueriesData({ queryKey: ITEMS_QUERY_KEY });

      // Optimistically add to cache
      queryClient.setQueriesData(
        { queryKey: ITEMS_QUERY_KEY, exact: false },
        (old: any) => {
          if (!old?.items) return old;
          const optimisticItem: SavedItem = {
            id: crypto.randomUUID(),
            url: newItem.url,
            platform: new URL(newItem.url).hostname.includes('instagram') ? 'instagram' : 'generic',
            title: newItem.title || null,
            userNote: newItem.userNote || newItem.text || null,
            summary: 'Processing...',
            tags: ['pending'],
            entities: {},
            embedding: null,
            mediaUrl: null,
            thumbnailUrl: null,
            authorUsername: null,
            authorDisplayName: null,
            publishedAt: null,
            savedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            enrichmentStatus: 'pending',
            enrichmentError: null,
          };
          return { ...old, items: [optimisticItem, ...old.items], total: old.total + 1 };
        }
      );

      return { previousItems };
    },
    onError: (err, newItem, context) => {
      // Rollback on error
      if (context?.previousItems) {
        context.previousItems.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
    },
    onSuccess: (data) => {
      // Invalidate to fetch real data
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
  });
}

/* ============================================
   Edit / Delete / Reprocess
   ============================================ */

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, edits }: { id: string; edits: ItemEdits }) => updateItem(id, edits),
    onSuccess: async (item) => {
      await saveItemLocally(item);
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
  });
}

/** Moves a save to Recently deleted, or erases it now with `permanent: true`. */
export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, permanent = false }: { id: string; permanent?: boolean }) => {
      await deleteItem(id, permanent);
      return id;
    },
    onSuccess: async (id) => {
      await deleteItemLocally(id);
      // Drop it from every cached list right away, then refetch
      queryClient.setQueriesData({ queryKey: ITEMS_QUERY_KEY, exact: false }, (old: any) => {
        if (old?.items) {
          return { ...old, items: old.items.filter((i: SavedItem) => i.id !== id), total: Math.max(0, (old.total ?? 1) - 1) };
        }
        if (old?.pages) {
          return {
            ...old,
            pages: old.pages.map((p: any) => ({ ...p, items: p.items.filter((i: SavedItem) => i.id !== id) })),
          };
        }
        if (Array.isArray(old)) return old.filter((i: SavedItem) => i.id !== id);
        return old;
      });
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
  });
}

/** Mark a save done (or move it back). Lists update right away; the server confirms. */
export function useSetDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => updateItem(id, { done }),
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: ITEMS_QUERY_KEY });
      const doneAt = done ? new Date().toISOString() : null;
      const patch = (i: SavedItem) => (i.id === id ? { ...i, doneAt } : i);
      queryClient.setQueriesData({ queryKey: ITEMS_QUERY_KEY, exact: false }, (old: any) => {
        if (old?.pages) {
          // Feeds hide cards whose done state no longer matches, so they leave instantly
          return { ...old, pages: old.pages.map((p: any) => ({ ...p, items: p.items.map(patch) })) };
        }
        if (old?.items) return { ...old, items: old.items.map(patch) };
        return old;
      });
    },
    onSuccess: async (item) => {
      await saveItemLocally(item);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
  });
}

export function useRestoreItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreItem(id),
    onSuccess: async (item) => {
      await saveItemLocally(item);
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
  });
}

export function useReprocessItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reprocessItem(id),
    onSuccess: async (item) => {
      await saveItemLocally(item);
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY });
    },
  });
}

/* ============================================
   Local Items Hook (for offline-first)
   ============================================ */

export function useLocalItems(limit = 50, offset = 0) {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, 'local', limit, offset],
    queryFn: () => getItemsLocally(limit, offset),
    staleTime: 1000 * 60 * 2, // 2 minutes
    initialData: [],
  });
}

/* ============================================
   Combined Hook (Online + Local fallback)
   ============================================ */

export function useHybridItems(params: SearchParams = {}) {
  const onlineQuery = useSearch(params);
  const localQuery = useLocalSearch(params.q || '', params.limit || 20);
  const cachedQuery = useLocalItems(params.limit || 50, params.offset || 0);

  useEffect(() => {
    if (onlineQuery.data?.items?.length) {
      void Promise.all(onlineQuery.data.items.map(item => saveItemLocally(item)));
    }
  }, [onlineQuery.data]);

  // Prefer live server results; show cached items when the API is unavailable.
  const mergedItems = onlineQuery.data?.items ?? (params.q ? localQuery.data : cachedQuery.data) ?? [];
  const isLoading = onlineQuery.isLoading;
  const isError = onlineQuery.isError && mergedItems.length === 0;

  return {
    items: mergedItems,
    total: onlineQuery.data?.total ?? mergedItems.length,
    hasMore: onlineQuery.data?.hasMore || false,
    isLoading,
    isError,
    error: onlineQuery.error || localQuery.error,
    refetch: onlineQuery.refetch,
  };
}

/* ============================================
   Search Suggestions Hook
   ============================================ */

export function useSearchSuggestions(items: SavedItem[] = []) {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, 'suggestions'],
    queryFn: () => {
      const tagCounts = new Map<string, number>();
      const termCounts = new Map<string, number>();

      items.forEach(item => {
        item.tags.forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
        const words = [...(item.title || ''), ...(item.userNote || ''), ...(item.summary || '')]
          .join(' ')
          .toLowerCase()
          .split(/\W+/)
          .filter(w => w.length > 3);
        words.forEach(w => termCounts.set(w, (termCounts.get(w) || 0) + 1));
      });

      const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
      const topTerms = [...termCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);

      return [...new Set([...topTags, ...topTerms])];
    },
    enabled: items.length > 0,
    staleTime: 1000 * 60 * 5,
  });
}

/* ============================================
   Filter Hook
   ============================================ */

export function useFilters() {
  const [filters, setFilters] = useState({
    platform: '' as string,
    tags: [] as string[],
    dateFrom: '' as string,
    dateTo: '' as string,
  });

  const toggleTag = useCallback((tag: string) => {
    setFilters(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }));
  }, []);

  const setPlatform = useCallback((platform: string) => {
    setFilters(f => ({ ...f, platform: f.platform === platform ? '' : platform }));
  }, []);

  const setDateRange = useCallback((from: string, to: string) => {
    setFilters(f => ({ ...f, dateFrom: from, dateTo: to }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ platform: '', tags: [], dateFrom: '', dateTo: '' });
  }, []);

  const hasActiveFilters = filters.platform || filters.tags.length > 0 || filters.dateFrom || filters.dateTo;

  return { filters, setFilters, toggleTag, setPlatform, setDateRange, clearFilters, hasActiveFilters };
}

/* ============================================
   Library facets, collections, related saves
   ============================================ */

export function useFacets() {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, 'facets'],
    queryFn: getFacets,
    staleTime: 1000 * 60 * 2,
  });
}

export function useRelatedItems(itemId: string | undefined, limit = 6) {
  return useQuery({
    queryKey: [...ITEMS_QUERY_KEY, 'related', itemId, limit],
    queryFn: () => searchItems({ relatedTo: itemId, limit }),
    enabled: !!itemId,
    staleTime: 1000 * 60 * 5,
  });
}
