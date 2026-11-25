import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, MessageCircle, Search as SearchIcon, X } from 'lucide-react';
import { useFacets, useLocalSearch, useSearch } from '../hooks/useItems';
import { SaveRow, SaveRowSkeleton } from '../components/SaveCard';
import { platformMeta } from '../utils/platform';
import { cn } from '../utils/cn';

const RECENTS_KEY = 'curio.recentSearches';

function readRecents(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeRecents(list: string[]) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 8))); } catch { /* private mode */ }
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const tag = params.get('tag') ?? '';
  const platform = params.get('platform') ?? '';

  const [input, setInput] = useState(urlQuery);
  const [debounced, setDebounced] = useState(urlQuery);
  const [recents, setRecents] = useState<string[]>(readRecents);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: facets } = useFacets();

  // Keep the box in sync when navigating here with ?q=
  useEffect(() => { setInput(urlQuery); setDebounced(urlQuery); }, [urlQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  // Reflect the query in the URL (shareable, survives back/forward)
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debounced) next.set('q', debounced); else next.delete('q');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const active = Boolean(debounced || tag || platform);
  const search = useSearch(
    {
      q: debounced || undefined,
      tags: tag ? [tag] : undefined,
      platform: platform || undefined,
      semantic: Boolean(debounced),
      limit: 40,
    },
    { enabled: active },
  );
  const local = useLocalSearch(search.isError ? debounced : '', 40);
  const offline = search.isError;
  const results = offline ? local.data ?? [] : search.data?.items ?? [];
  const total = offline ? results.length : search.data?.total ?? 0;

  // Remember queries that actually ran
  useEffect(() => {
    if (!debounced || !search.isSuccess) return;
    setRecents(prev => {
      const next = [debounced, ...prev.filter(r => r.toLowerCase() !== debounced.toLowerCase())].slice(0, 8);
      writeRecents(next);
      return next;
    });
  }, [debounced, search.isSuccess]);

  const clearFilter = (key: 'tag' | 'platform') => {
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next, { replace: true });
  };

  const topTags = useMemo(
    () => (facets?.tags ?? []).filter(t => !['instagram', 'tiktok', 'x', 'youtube', 'generic', 'saved', 'reels', 'linkedin', 'reddit'].includes(t.tag)).slice(0, 14),
    [facets],
  );

  return (
    <div className="space-y-5 pt-2">
      <h1 className="screen-title">Search</h1>

      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 bg-background/85 px-4 pb-2 pt-1 backdrop-blur-xl">
        <div className="flex items-center gap-2 rounded-2xl border bg-card px-3.5 focus-within:border-primary/60">
          <SearchIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setDebounced(input.trim()); inputRef.current?.blur(); } }}
            placeholder="Search by meaning: “cozy pasta”, “UI tips”…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-muted-foreground focus:outline-none"
            aria-label="Search your saves"
          />
          {input && (
            <button type="button" onClick={() => { setInput(''); setDebounced(''); inputRef.current?.focus(); }} className="rounded-full p-1 text-muted-foreground hover:text-foreground" aria-label="Clear">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {(tag || platform) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {tag && (
              <button type="button" onClick={() => clearFilter('tag')} className="chip chip-active">#{tag} <X className="h-3.5 w-3.5" /></button>
            )}
            {platform && (
              <button type="button" onClick={() => clearFilter('platform')} className="chip chip-active">
                {platformMeta(platform).label} <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {!active && (
        <div className="space-y-7">
          {recents.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="section-label">Recent</h2>
                <button type="button" onClick={() => { setRecents([]); writeRecents([]); }} className="text-sm text-muted-foreground hover:text-foreground">Clear</button>
              </div>
              <div className="divide-y rounded-[22px] border bg-card">
                {recents.map(r => (
                  <button key={r} type="button" onClick={() => setInput(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50">
                    <Clock className="h-4 w-4 text-muted-foreground" /> <span className="flex-1 truncate">{r}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {topTags.length > 0 && (
            <section className="space-y-3">
              <h2 className="section-label">Your topics</h2>
              <div className="flex flex-wrap gap-2">
                {topTags.map(t => (
                  <Link key={t.tag} to={`/search?tag=${encodeURIComponent(t.tag)}`} className="chip">
                    #{t.tag} <span className="opacity-50">{t.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <Link to="/chat" className="pressable flex items-center gap-3 rounded-[22px] border bg-gradient-to-br from-primary/20 to-card p-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/20 text-primary"><MessageCircle className="h-5 w-5" /></span>
            <span className="flex-1">
              <span className="block font-semibold">Ask your library instead</span>
              <span className="text-sm text-muted-foreground">“What was that pasta recipe I saved?”</span>
            </span>
          </Link>
        </div>
      )}

      {active && (
        <section className="space-y-1" aria-live="polite">
          <p className={cn('pb-2 text-sm text-muted-foreground', search.isFetching && 'animate-pulse')}>
            {search.isLoading ? 'Searching…' : offline ? `${total} found on this device (offline)` : `${total} ${total === 1 ? 'result' : 'results'}`}
          </p>
          {search.isLoading && [0, 1, 2, 3].map(i => <SaveRowSkeleton key={i} />)}
          {results.map(item => <SaveRow key={item.id} item={item} />)}
          {!search.isLoading && results.length === 0 && (
            <div className="rounded-[22px] border bg-card p-6 text-center">
              <p className="text-3xl">🔭</p>
              <p className="mt-2 font-semibold">Nothing matches yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Try different words, or ask in chat.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
