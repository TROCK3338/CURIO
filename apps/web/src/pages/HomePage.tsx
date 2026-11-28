import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Link2, RefreshCw, WifiOff } from 'lucide-react';
import type { SavedItem } from '@curio/shared';
import { Link } from 'react-router-dom';
import { useClusters, useFacets, useInfiniteSearch, useLocalItems } from '../hooks/useItems';
import { saveItemLocally } from '../services/indexeddb';
import type { SearchParams } from '../services/api';
import { PinCard, PinCardSkeleton, pinRatio } from '../components/SaveCard';
import { Masonry, useMasonryColumns } from '../components/Masonry';
import { SaveActionsSheet } from '../components/SaveActionsSheet';
import { useOpenSaveSheet } from '../components/Layout';
import { QuickSaveNudge } from '../components/QuickSaveNudge';
import { COLLECTIONS, COLLECTION_TYPES } from '../utils/collections';
import { cn } from '../utils/cn';

const PAGE_SIZE = 20;

interface Tab {
  key: string;
  label: string;
  params: SearchParams;
  done?: boolean;
}

export function HomePage() {
  const openSave = useOpenSaveSheet();
  const { data: facets } = useFacets();
  const { data: clustersData } = useClusters();
  const columns = useMasonryColumns();
  const [tabKey, setTabKey] = useState('all');
  const [menuItem, setMenuItem] = useState<SavedItem | null>(null);

  // Pinterest-style tabs: All, the smart collections you have, AI topics, Done
  const tabs = useMemo<Tab[]>(() => {
    const list: Tab[] = [{ key: 'all', label: 'All', params: {} }];
    for (const t of COLLECTION_TYPES) {
      if ((facets?.entities?.[t] ?? 0) > 0) list.push({ key: t, label: COLLECTIONS[t].title, params: { entity: t } });
    }
    for (const c of (clustersData?.clusters ?? []).slice(0, 6)) {
      list.push({ key: `topic:${c.id}`, label: c.label, params: { q: c.label } });
    }
    if ((facets?.done ?? 0) > 0) list.push({ key: 'done', label: 'Done', params: {}, done: true });
    return list;
  }, [facets, clustersData]);
  const tab = tabs.find(t => t.key === tabKey) ?? tabs[0];
  const showDone = Boolean(tab.done);

  const feed = useInfiniteSearch({ limit: PAGE_SIZE, ...tab.params, status: showDone ? 'done' : 'active' });
  const cached = useLocalItems(40, 0);

  const serverItems = useMemo(() => feed.data?.pages.flatMap(p => p.items) ?? [], [feed.data]);
  const offline = feed.isError && serverItems.length === 0;
  const items: SavedItem[] = useMemo(
    () => (offline && tab.key === 'all' ? cached.data ?? [] : serverItems).filter(i => Boolean(i.doneAt) === showDone),
    [offline, tab.key, cached.data, serverItems, showDone],
  );

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
    }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage]);

  const total = facets?.total ?? 0;
  const isEmpty = !feed.isLoading && !offline && total === 0 && (facets?.done ?? 0) === 0 && tab.key === 'all';

  return (
    <div className="space-y-4">
      {/* Laptops: title and a paste box; phones keep the top bar's + */}
      <section className="hidden items-end justify-between gap-8 lg:flex">
        <div>
          <h1 className="screen-title lg:text-4xl">Your library</h1>
          {total > 0 && <p className="mt-1 text-sm text-muted-foreground">{total} {total === 1 ? 'save' : 'saves'}</p>}
        </div>
        <QuickPaste onSave={openSave} />
      </section>

      {tabs.length > 1 && (
        <nav className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto px-4 lg:mx-0 lg:px-0" role="tablist" aria-label="Filter saves">
          {tabs.map(t => {
            const active = t.key === tab.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setTabKey(t.key); window.scrollTo({ top: 0 }); }}
                className={cn(
                  'relative shrink-0 whitespace-nowrap pb-2 text-[16px] font-semibold transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.done && <CheckCircle2 className="mr-1 inline h-4 w-4 align-[-3px]" />}
                {t.label}
                {active && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-foreground" />}
              </button>
            );
          })}
        </nav>
      )}

      {!isEmpty && <QuickSaveNudge />}

      {offline && (
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-sm">
          <WifiOff className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-muted-foreground">Can&rsquo;t reach CURIO. Showing saves on this device.</span>
          <button type="button" onClick={() => feed.refetch()} className="rounded-full p-1.5 hover:bg-accent" aria-label="Retry">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {isEmpty && <EmptyLibrary onSave={() => openSave()} />}

      {!isEmpty && !feed.isLoading && items.length === 0 && !offline && (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {showDone ? 'Nothing marked done yet.' : 'Nothing here yet.'}
        </p>
      )}

      {feed.isLoading && !offline ? (
        <div className="grid gap-[10px]" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns * 2 }, (_, i) => <PinCardSkeleton key={i} tall={i % 3 === 0} />)}
        </div>
      ) : (
        <Masonry
          key={`${tab.key}:${columns}`}
          items={items}
          columns={columns}
          estimateRatio={pinRatio}
          render={item => <PinCard item={item} onMenu={setMenuItem} />}
          className="-mx-2 lg:mx-0 lg:[--masonry-gap:16px] lg:[--masonry-row-gap:20px]"
        />
      )}
      <div ref={sentinel} />
      {feed.isFetchingNextPage && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}

      <SaveActionsSheet item={menuItem} onClose={() => setMenuItem(null)} />
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
