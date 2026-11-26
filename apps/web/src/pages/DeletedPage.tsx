import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import type { SavedItem } from '@curio/shared';
import { useDeleteItem, useInfiniteSearch, useRestoreItem } from '../hooks/useItems';
import { TRASH_RETENTION_DAYS } from '../services/api';
import { Cover } from '../components/Cover';
import { Sheet } from '../components/Sheet';
import { SaveRowSkeleton } from '../components/SaveCard';
import { useErrorToast, useSuccessToast } from '../components/ui/Toast';
import { daysLeftText } from './ItemPage';
import { displayTitle } from '../utils/text';
import { platformMeta } from '../utils/platform';

/** Settings → Recently deleted: restore a save or erase it now. */
export function DeletedPage() {
  const query = useInfiniteSearch({ status: 'deleted', limit: 50 });
  const items = useMemo(() => query.data?.pages.flatMap(p => p.items) ?? [], [query.data]);
  const restore = useRestoreItem();
  const erase = useDeleteItem();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();
  const [confirm, setConfirm] = useState<SavedItem | null>(null);

  const onRestore = (item: SavedItem) =>
    restore.mutate(item.id, {
      onSuccess: () => successToast('Restored', 'Back in your library'),
      onError: e => errorToast('Couldn’t restore', e instanceof Error ? e.message : undefined),
    });

  const onErase = () => {
    if (!confirm) return;
    erase.mutate({ id: confirm.id, permanent: true }, {
      onSuccess: () => { setConfirm(null); successToast('Erased for good'); },
      onError: e => errorToast('Couldn’t delete', e instanceof Error ? e.message : undefined),
    });
  };

  return (
    <div className="space-y-5 pt-2 lg:max-w-2xl">
      <Link to="/settings" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <header>
        <h1 className="screen-title">Recently deleted</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleted saves stay here for {TRASH_RETENTION_DAYS} days, then they&rsquo;re erased for good.
        </p>
      </header>

      {query.isLoading && [0, 1, 2].map(i => <SaveRowSkeleton key={i} />)}

      {!query.isLoading && items.length === 0 && (
        <p className="rounded-2xl border bg-card p-5 text-center text-sm text-muted-foreground">Nothing here. Deleted saves show up for {TRASH_RETENTION_DAYS} days.</p>
      )}

      <ul className="space-y-2">
        {items.map(item => {
          const meta = platformMeta(item.platform);
          return (
            <li key={item.id} className="flex items-center gap-3 rounded-2xl border bg-card p-2.5">
              <Link to={`/item/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Cover item={item} showTitle={false} size="sm" className="h-14 w-14 shrink-0 rounded-xl" />
                <span className="min-w-0">
                  <span className="block font-semibold leading-snug line-clamp-1">{displayTitle(item)}</span>
                  <span className="block text-[12.5px] text-muted-foreground">
                    {meta.label} · {item.deletedAt ? daysLeftText(item.deletedAt) : ''}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => onRestore(item)}
                disabled={restore.isPending && restore.variables === item.id}
                className="pressable flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 text-xs font-semibold text-primary disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </button>
              <button
                type="button"
                onClick={() => setConfirm(item)}
                className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive"
                aria-label="Delete now"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>

      {query.hasNextPage && (
        <button type="button" onClick={() => query.fetchNextPage()} className="w-full rounded-2xl border bg-card py-3 text-sm font-semibold">
          {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      )}

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title="Erase this save now?">
        <p className="text-sm text-muted-foreground">
          &ldquo;{confirm ? displayTitle(confirm) : ''}&rdquo; will be erased from CURIO right away. This can&rsquo;t be undone.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setConfirm(null)} className="h-12 rounded-2xl border bg-elevated font-semibold">Cancel</button>
          <button
            type="button"
            onClick={onErase}
            disabled={erase.isPending}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-destructive font-semibold text-white disabled:opacity-60"
          >
            {erase.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Delete now
          </button>
        </div>
      </Sheet>
    </div>
  );
}
