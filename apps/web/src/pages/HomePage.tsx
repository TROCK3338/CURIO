import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CheckCircle2, Link2, RefreshCw, Sparkles, WifiOff } from 'lucide-react';
import type { SavedItem } from '@curio/shared';
import { useClusters, useFacets, useInfiniteSearch, useLocalItems } from '../hooks/useItems';
import { saveItemLocally } from '../services/indexeddb';
import { SaveCard, SaveCardSkeleton } from '../components/SaveCard';
import { useOpenSaveSheet } from '../components/Layout';
import { QuickSaveNudge } from '../components/QuickSaveNudge';
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
  // "Done" shows the saves the user has finished with; everything else shows active ones
  const [showDone, setShowDone] = useState(false);
  const { data: facets } = useFacets();
  const { data: clustersData } = useClusters();
  const feed = useInfiniteSearch({
    limit: PAGE_SIZE,
    status: showDone ? 'done' : 'active',
    ...(platform && !showDone ? { platform } : {}),
  });
  const cached = useLocalItems(40, 0);

  const serverItems = useMemo(() => feed.data?.pages.flatMap(p => p.items) ?? [], [feed.data]);
  const offline = feed.isError && serverItems.length === 0;
  const items: SavedItem[] = (offline
    ? (cached.data ?? []).filter(i => !platform || i.platform === platform)
    : serverItems
  ).filter(i => Boolean(i.doneAt) === showDone); // a card leaves as soon as it's marked

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
  const doneCount = facets?.done ?? 0;
  const isEmpty = !feed.isLoading && !offline && total === 0 && doneCount === 0;
  const pick = (p: string, done: boolean) => { setPlatform(p); setShowDone(done); };

  return (
    <div className="space-y-6">
      <section className="pt-2 lg:flex lg:items-end lg:justify-between lg:gap-8 lg:pt-0">
        <div>
          <p className="text-[15px] text-muted-foreground">{greeting()}</p>
          <h1 className="screen-title lg:text-4xl">Your library</h1>
          {total > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {total} {total === 1 ? 'save' : 'saves'}
              {thisWeek > 0 && <> · <span className="text-foreground">{thisWeek} new this week</span></>}
            </p>
          )}
        </div>
        <QuickPaste onSave={openSave} />
      </section>

      {!isEmpty && <QuickSaveNudge />}

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

      {(platforms.length > 1 || doneCount > 0 || showDone) && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Filter saves">
          <button type="button" role="tab" aria-selected={!platform && !showDone} onClick={() => pick('', false)} className={cn('chip', !platform && !showDone && 'chip-active')}>
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
                aria-selected={platform === p && !showDone}
                onClick={() => pick(platform === p && !showDone ? '' : p, false)}
                className={cn('chip', platform === p && !showDone && 'chip-active')}
              >
                <Icon className="h-3.5 w-3.5" /> {meta.label} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
          {(doneCount > 0 || showDone) && (
            <button
              type="button"
              role="tab"
              aria-selected={showDone}
              onClick={() => pick('', !showDone)}
              className={cn('chip', showDone && 'chip-active')}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Done <span className="opacity-60">{doneCount}</span>
            </button>
          )}
        </div>
      )}

      {showDone && !feed.isLoading && items.length === 0 && (
        <p className="rounded-2xl border bg-card p-5 text-center text-sm text-muted-foreground">
          Nothing marked done yet. Tap <CheckCircle2 className="inline h-4 w-4 align-[-3px]" /> on a save once you&rsquo;ve dealt with it.
        </p>
      )}

      <section aria-label="Saves">
        <div className="grid gap-5 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3">
          {feed.isLoading && !offline && [0, 1, 2].map(i => <SaveCardSkeleton key={i} />)}
          {items.map((item, i) => <SaveCard key={item.id} item={item} priority={i < 3} />)}
          {feed.isFetchingNextPage && <SaveCardSkeleton />}
        </div>
        <div ref={sentinel} />
        {!showDone && !feed.hasNextPage && items.length > 3 && (
          <p className="py-8 text-center text-sm text-muted-foreground">You&rsquo;re all caught up ✨</p>
        )}
      </section>
    </div>
  );
}

/** Laptop-only: paste a link straight into the page header. */
function QuickPaste({ onSave }: { onSave: (url?: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={e => { e.preventDefault(); onSave(value.trim()); setValue(''); }}
      className="mt-0 hidden w-full max-w-md items-center gap-2 rounded-2xl border bg-card p-1.5 pl-4 focus-within:border-primary/60 lg:flex"
    >
      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Paste a link to save…"
        className="h-9 min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        aria-label="Link to save"
      />
      <button type="submit" disabled={!value.trim()} className="h-9 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">
        Save
      </button>
    </form>
  );
}

function EmptyLibrary({ onSave }: { onSave: () => void }) {
  return (
    <section className="rounded-[28px] border bg-gradient-to-br from-primary/20 via-card to-card p-6 text-center lg:mx-auto lg:max-w-xl lg:p-10">
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
