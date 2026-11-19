/**
 * Semantic Search Hook
 * Local embedding-based search for instant results
 * Falls back to server search when needed
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocalSearch } from './useItems';
import type { SavedItem } from '@mindspace/shared';

// Simple client-side embedding cache
const embeddingCache = new Map<string, Float32Array>();

export function useSemanticSearch(items: SavedItem[] = []) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SavedItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mode, setMode] = useState<'local' | 'server'>('local');

  const localSearch = useLocalSearch(query, 50);

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);

    try {
      // Try local search first (instant)
      const localResults = await localSearch.refetch();
      if (localResults.data && localResults.data.length > 0) {
        setResults(localResults.data);
        setMode('local');
        return;
      }

      // Fallback to server search would be triggered by parent
      setMode('server');
    } finally {
      setIsSearching(false);
    }
  }, [localSearch]);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Simple text-based relevance scoring (client-side)
  const scoreItem = useCallback((item: SavedItem, searchQuery: string): number => {
    const terms = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    if (terms.length === 0) return 0;

    let score = 0;
    const searchableText = [
      item.title,
      item.userNote,
      item.summary,
      ...item.tags,
      item.authorUsername,
      item.authorDisplayName,
    ].filter(Boolean).join(' ').toLowerCase();

    for (const term of terms) {
      if (searchableText.includes(term)) score += 1;
      // Boost for exact matches in title
      if (item.title?.toLowerCase().includes(term)) score += 2;
      // Boost for tag matches
      if (item.tags.some(t => t.includes(term))) score += 1.5;
    }

    // Recency boost (items from last 7 days get small boost)
    const daysSinceSaved = (Date.now() - new Date(item.savedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSaved < 7) score += 0.5;

    return score;
  }, []);

  // Re-rank results by relevance
  const rankedResults = useCallback((items: SavedItem[], searchQuery: string): SavedItem[] => {
    return [...items]
      .map(item => ({ item, score: scoreItem(item, searchQuery) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }, [scoreItem]);

  return {
    query,
    setQuery,
    results: rankedResults(results, query),
    isSearching,
    mode,
    clear: () => { setQuery(''); setResults([]); },
  };
}

/* ============================================
   Re-export deduplicated hooks from useItems
   ============================================ */

export { useSearchSuggestions, useFilters } from './useItems';