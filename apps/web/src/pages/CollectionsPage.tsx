import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin, CalendarPlus, RefreshCw, Sparkles } from 'lucide-react';
import type { SavedItem } from '@curio/shared';
import { useClusters, useFacets, useInfiniteSearch, useRegenerateClusters } from '../hooks/useItems';
import { Cover } from '../components/Cover';
import { SaveRow, SaveRowSkeleton } from '../components/SaveCard';
import { useErrorToast, useSuccessToast } from '../components/ui/Toast';
import { COLLECTIONS, COLLECTION_TYPES, calendarUrl, isCollectionType, mapsUrl, type CollectionType } from '../utils/collections';
import { platformMeta } from '../utils/platform';
import { cleanEntities, displayTitle } from '../utils/text';
import { cn } from '../utils/cn';

/* ============================================
   /collections - overview
   ============================================ */

export function CollectionsPage() {
  const { data: facets, isLoading } = useFacets();
  const { data: clustersData } = useClusters();
  const regenerate = useRegenerateClusters();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();
  const clusters = clustersData?.clusters ?? [];
  const platforms = Object.entries(facets?.platforms ?? {});

  const handleRegenerate = () =>
    regenerate.mutate(undefined, {
      onSuccess: (data: any) => successToast(data?.message ?? 'Topics refreshed'),
      onError: e => errorToast('Couldn’t refresh topics', e instanceof Error ? e.message : undefined),
    });

  return (
    <div className="space-y-8 pt-2">
      <header>
        <h1 className="screen-title">Collections</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sorted automatically from what CURIO finds in your saves.</p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        {COLLECTION_TYPES.map(type => {
          const c = COLLECTIONS[type];
          const count = facets?.entities?.[type] ?? 0;
          return (
            <Link
              key={type}
              to={`/collections/${type}`}
              className={cn(
                'pressable flex aspect-[1.15] flex-col justify-between rounded-[24px] border bg-gradient-to-br p-4',
                c.tint,
                count === 0 && 'opacity-55',
              )}
            >
              <span className="text-3xl" aria-hidden="true">{c.emoji}</span>
              <span>
                <span className="block text-lg font-semibold leading-tight">{c.title}</span>
                <span className="text-[13px] text-muted-foreground">
                  {isLoading ? '…' : count === 0 ? c.blurb : `${count} ${count === 1 ? 'save' : 'saves'}`}
                </span>
              </span>
            </Link>
          );
        })}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-label">AI topics</h2>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerate.isPending}
            className="flex items-center gap-1.5 text-sm font-medium text-primary disabled:opacity-50"
          >
            {regenerate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
        {clusters.length === 0 ? (
          <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
            Topics appear once you have at least 5 saves. They refresh every night.
          </p>
        ) : (
          <div className="divide-y overflow-hidden rounded-[22px] border bg-card">
            {clusters.map(cluster => (
              <Link
                key={cluster.id}
                to={`/search?q=${encodeURIComponent(cluster.label)}`}
                className="flex items-center gap-3 p-4 hover:bg-accent/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <Sparkles className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{cluster.label}</span>
                  <span className="block text-[13px] text-muted-foreground line-clamp-1">{cluster.description}</span>
                </span>
                <span className="text-sm text-muted-foreground">{cluster.itemCount}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {platforms.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">By source</h2>
          <div className="flex flex-wrap gap-2">
            {platforms.map(([p, n]) => {
              const meta = platformMeta(p);
              const Icon = meta.icon;
              return (
                <Link key={p} to={`/search?platform=${p}`} className="chip">
                  <Icon className="h-3.5 w-3.5" /> {meta.label} <span className="opacity-60">{n}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================
   /collections/:type - one smart collection
   ============================================ */

export function CollectionPage() {
  const { type } = useParams<{ type: string }>();
  if (!isCollectionType(type)) return <Navigate to="/collections" replace />;
  return <CollectionList type={type} />;
}

function CollectionList({ type }: { type: CollectionType }) {
  const meta = COLLECTIONS[type];
  const query = useInfiniteSearch({ entity: type, limit: 30 });
  const items = useMemo(() => query.data?.pages.flatMap(p => p.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <div className="space-y-5 pt-2">
      <Link to="/collections" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Collections
      </Link>
      <header className={cn('rounded-[28px] border bg-gradient-to-br p-5', meta.tint)}>
        <span className="text-4xl" aria-hidden="true">{meta.emoji}</span>
        <h1 className="screen-title mt-3">{meta.title}</h1>
        <p className="text-sm text-muted-foreground">
          {query.isLoading ? 'Loading…' : `${total} ${total === 1 ? meta.singular : `${meta.singular}s`} · ${meta.blurb.toLowerCase()}`}
        </p>
      </header>

      {query.isLoading && [0, 1, 2].map(i => <SaveRowSkeleton key={i} />)}

      {!query.isLoading && items.length === 0 && (
        <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          Nothing here yet. When you save a {meta.singular}, CURIO spots it and files it here automatically.
        </p>
      )}

      <div className={cn(type === 'recipe' || type === 'product' ? 'grid grid-cols-2 gap-3' : 'space-y-3')}>
        {items.map(item => (
          <EntityCard key={item.id} type={type} item={item} />
        ))}
      </div>

      {query.hasNextPage && (
        <button
          type="button"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="w-full rounded-2xl border bg-card py-3 text-sm font-medium"
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

function EntityCard({ type, item }: { type: CollectionType; item: SavedItem }) {
  const entity = (cleanEntities(item.entities)[type] ?? {}) as Record<string, any>;
  const name: string = entity.name || displayTitle(item);

  if (type === 'recipe' || type === 'product') {
    const detail =
      type === 'recipe'
        ? [entity.cuisine, Array.isArray(entity.ingredients) && entity.ingredients.length ? `${entity.ingredients.length} ingredients` : null]
        : [entity.brand, entity.price ? `${entity.currency ?? ''}${entity.price}`.trim() : null];
    return (
      <Link to={`/item/${item.id}`} className="pressable overflow-hidden rounded-[22px] border bg-card">
        <Cover item={item} showTitle={false} size="sm" className="aspect-square" />
        <div className="p-3">
          <p className="font-semibold leading-snug line-clamp-2">{name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{detail.filter(Boolean).join(' · ') || platformMeta(item.platform).label}</p>
        </div>
      </Link>
    );
  }

  if (type === 'place') {
    return (
      <div className="flex items-center gap-3 rounded-[22px] border bg-card p-3">
        <Link to={`/item/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Cover item={item} showTitle={false} size="sm" className="h-16 w-16 shrink-0 rounded-2xl" />
          <span className="min-w-0">
            <span className="block font-semibold line-clamp-1">{name}</span>
            <span className="block text-[13px] text-muted-foreground line-clamp-1">{entity.address || displayTitle(item)}</span>
          </span>
        </Link>
        <a
          href={mapsUrl(entity)}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-3 py-2 text-xs font-semibold text-primary"
        >
          <MapPin className="h-3.5 w-3.5" /> Map
        </a>
      </div>
    );
  }

  if (type === 'event') {
    const when = entity.startAt ? new Date(entity.startAt) : null;
    const validWhen = when && !Number.isNaN(when.getTime()) ? when : null;
    return (
      <div className="flex items-center gap-3 rounded-[22px] border bg-card p-3">
        <Link to={`/item/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-elevated">
            {validWhen ? (
              <>
                <span className="text-[11px] font-semibold uppercase text-primary">{validWhen.toLocaleString(undefined, { month: 'short' })}</span>
                <span className="text-2xl font-bold leading-none">{validWhen.getDate()}</span>
              </>
            ) : (
              <span className="text-2xl">📅</span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold line-clamp-1">{name}</span>
            <span className="block text-[13px] text-muted-foreground line-clamp-1">{entity.location || displayTitle(item)}</span>
          </span>
        </Link>
        <a
          href={calendarUrl(entity)}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable shrink-0 rounded-full bg-primary/15 p-2.5 text-primary"
          aria-label="Add to calendar"
        >
          <CalendarPlus className="h-4 w-4" />
        </a>
      </div>
    );
  }

  // workout
  const detail = [entity.type, entity.duration, Array.isArray(entity.equipment) ? entity.equipment.join(', ') : null].filter(Boolean).join(' · ');
  return <SaveRow item={item} subtitle={detail || undefined} />;
}

