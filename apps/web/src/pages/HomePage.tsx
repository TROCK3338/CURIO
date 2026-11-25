import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, RefreshCw, Sparkles, WifiOff } from 'lucide-react';
import type { SavedItem } from '@curio/shared';
import { useClusters, useFacets, useInfiniteSearch, useLocalItems } from '../hooks/useItems';
import { saveItemLocally } from '../services/indexeddb';
import { SaveCard, SaveCardSkeleton } from '../components/SaveCard';
import { useOpenSaveSheet } from '../components/Layout';
import { COLLECTIONS, COLLECTION_TYPES } from '../utils/collections';
import { platformMeta } from '../utils/platform';
import { cn } from '../utils/cn';

const PAGE_SIZE = 12;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage() {
  const openSave = useOpenSaveSheet();
  const [platform, setPlatform] = useState<string>('');
  const { data: facets } = useFacets();
  const { data: clustersData } = useClusters();
  const feed = useInfiniteSearch({ limit: PAGE_SIZE, ...(platform ? { platform } : {}) });
  const cached = useLocalItems(40, 0);

  const serverItems = useMemo(() => feed.data?.pages.flatMap(p => p.items) ?? [], [feed.data]);
  const offline = feed.isError && serverItems.length === 0;
  const items: SavedItem[] = offline
    ? (cached.data ?? []).filter(i => !platform || i.platform === platform)
    : serverItems;

  // Keep an offline copy of what the user has seen
  useEffect(() => {
    if (serverItems.length) void Promise.all(serverItems.map(saveItemLocally));
  }, [serverItems]);

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage]);

  const total = facets?.total ?? feed.data?.pages[0]?.total ?? items.length;
  const thisWeek = items.filter(i => Date.now() - new Date(i.savedAt).getTime() < 7 * 86400_000).length;
  const collectionTiles = COLLECTION_TYPES.filter(t => (facets?.entities?.[t] ?? 0) > 0);
  const clusters = clustersData?.clusters ?? [];
  const platforms = Object.entries(facets?.platforms ?? {}).filter(([, n]) => n > 0);
  const isEmpty = !feed.isLoading && !offline && total === 0;

  return (
    <div className="space-y-6">
      <section className="pt-2">
        <p className="text-[15px] text-muted-foreground">{greeting()}</p>
        <h1 className="screen-title">Your library</h1>
        {total > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {total} {total === 1 ? 'save' : 'saves'}
            {thisWeek > 0 && <> · <span className="text-foreground">{thisWeek} new this week</span></>}
          </p>
        )}
      </section>

      {offline && (
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-sm">
          <WifiOff className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-muted-foreground">Can&rsquo;t reach CURIO right now. Showing saves stored on this device.</span>
          <button type="button" onClick={() => feed.refetch()} className="rounded-full p-1.5 hover:bg-accent" aria-label="Retry">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {isEmpty && <EmptyLibrary onSave={() => openSave()} />}

      {(collectionTiles.length > 0 || clusters.length > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-label">Collections</h2>
            <Link to="/collections" className="flex items-center text-sm font-medium text-primary">
              See all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {collectionTiles.map(type => {
              const c = COLLECTIONS[type];
              return (
                <Link
                  key={type}
                  to={`/collections/${type}`}
                  className={cn('pressable flex h-[104px] w-[132px] shrink-0 flex-col justify-between rounded-[22px] border bg-gradient-to-br p-3.5', c.tint)}
                >
                  <span className="text-2xl" aria-hidden="true">{c.emoji}</span>
                  <span>
                    <span className="block font-semibold leading-tight">{c.title}</span>
                    <span className="text-xs text-muted-foreground">{facets?.entities[type]} saved</span>
                  </span>
                </Link>
              );
            })}
            {clusters.slice(0, 8).map(cluster => (
              <Link
                key={cluster.id}
                to={`/search?q=${encodeURIComponent(cluster.label)}`}
                className="pressable flex h-[104px] w-[148px] shrink-0 flex-col justify-between rounded-[22px] border bg-card p-3.5"
              >
                <Sparkles className="h-5 w-5 text-primary" />
                <span>
                  <span className="block font-semibold leading-tight line-clamp-2">{cluster.label}</span>
                  <span className="text-xs text-muted-foreground">{cluster.itemCount} saves</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {platforms.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Filter by platform">
          <button type="button" role="tab" aria-selected={!platform} onClick={() => setPlatform('')} className={cn('chip', !platform && 'chip-active')}>
            All
          </button>
          {platforms.map(([p, n]) => {
            const meta = platformMeta(p);
            const Icon = meta.icon;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={platform === p}
                onClick={() => setPlatform(platform === p ? '' : p)}
                className={cn('chip', platform === p && 'chip-active')}
              >
                <Icon className="h-3.5 w-3.5" /> {meta.label} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <section className="space-y-5" aria-label="Saves">
        {feed.isLoading && !offline && [0, 1].map(i => <SaveCardSkeleton key={i} />)}
        {items.map((item, i) => <SaveCard key={item.id} item={item} priority={i < 2} />)}
        <div ref={sentinel} />
        {feed.isFetchingNextPage && <SaveCardSkeleton />}
        {!feed.hasNextPage && items.length > 3 && (
          <p className="py-6 text-center text-sm text-muted-foreground">You&rsquo;re all caught up ✨</p>
        )}
      </section>
    </div>
  );
}

function EmptyLibrary({ onSave }: { onSave: () => void }) {
  return (
    <section className="rounded-[28px] border bg-gradient-to-br from-primary/20 via-card to-card p-6 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary/20 text-3xl">🪄</div>
      <h2 className="font-display text-3xl italic">Start your collection</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
        Save a Reel, video, thread or article. CURIO reads it, tags it and makes it findable by meaning.
      </p>
      <button type="button" onClick={onSave} className="pressable mt-5 h-12 w-full rounded-2xl bg-primary font-semibold text-primary-foreground">
        Save your first link
      </button>
      <Link to="/welcome" className="mt-3 block text-sm font-medium text-primary">
        Set up sharing from other apps
      </Link>
    </section>
  );
}
