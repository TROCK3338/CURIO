import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Clock,
  LayoutGrid,
  Link2,
  Loader2,
  ExternalLink,
  Copy,
  MoreHorizontal,
  Sparkles,
  Bookmark,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useHybridItems, useClusters } from '../hooks/useItems';
import { useSettings } from '../hooks/useSettings';
import { ingestItem } from '../services/api';
import { addToQueue, saveItemLocally } from '../services/indexeddb';
import { Thumbnail } from '../components/Thumbnail';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, PlatformBadge } from '../components/ui/Badge';
import { ItemSkeleton } from '../components/ui/Skeleton';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../components/ui/DropdownMenu';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../utils/cn';
import { useSuccessToast, useErrorToast, useInfoToast } from '../components/ui/Toast';

export function HomePage() {
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();
  const infoToast = useInfoToast();

  const { items, isLoading, isError, error, refetch, hasMore } = useHybridItems({
    limit: settings.itemsPerPage,
  });
  const { data: clustersData } = useClusters();
  const clusters = clustersData?.clusters || [];

  const [viewMode, setViewMode] = useState<'timeline' | 'grid'>(
    settings.defaultView === 'grid' ? 'grid' : 'timeline'
  );
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [quickUrl, setQuickUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleQuickSave = async (e: FormEvent) => {
    e.preventDefault();
    const raw = quickUrl.trim();
    if (!raw || isSaving) return;

    const match = raw.match(/https?:\/\/[^\s<>"']+/i);
    const candidate = (match ? match[0] : raw).replace(/[),.!?]+$/, '');

    let validUrl: URL;
    try {
      validUrl = new URL(candidate);
      if (validUrl.protocol !== 'https:' && validUrl.protocol !== 'http:') {
        throw new Error('Only HTTP and HTTPS links can be saved.');
      }
    } catch {
      errorToast('Invalid link', 'Paste a valid Reel, video, or web URL.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = { url: validUrl.toString() };
      if (!navigator.onLine) {
        await addToQueue(payload);
        window.dispatchEvent(new Event('queue-updated'));
        setQuickUrl('');
        infoToast('Queued for sync', 'Saved offline — will sync when online');
        return;
      }

      const result = await ingestItem(payload);
      if (!result.success || !result.item) {
        throw new Error(result.error || 'Could not save this link.');
      }
      await saveItemLocally(result.item);
      setQuickUrl('');

      const title = result.item.title || 'Link';
      if (result.message === 'Already saved') {
        infoToast('Already in CURIO', `"${title}" is already in your library`);
      } else {
        successToast('Saved!', `"${title}" added to CURIO`);
      }

      await queryClient.invalidateQueries({ queryKey: ['items'] });
      await refetch();
    } catch (err) {
      if (err instanceof TypeError) {
        await addToQueue({ url: validUrl.toString() });
        window.dispatchEvent(new Event('queue-updated'));
        setQuickUrl('');
        infoToast('Queued for sync', 'Network unavailable — will sync when online');
      } else {
        errorToast("Couldn't save", err instanceof Error ? err.message : 'Failed to save link');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const platforms = [...new Set(items.map(i => i.platform).filter(Boolean))];
  const filteredItems =
    selectedPlatform === 'all'
      ? items
      : items.filter(i => i.platform === selectedPlatform);

  const stats = {
    total: items.length,
    thisWeek: items.filter(
      i => Date.now() - new Date(i.savedAt).getTime() < 7 * 24 * 60 * 60 * 1000
    ).length,
    platforms: platforms.length,
  };

  return (
    <div className="space-y-6">
      {/* Header + View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            {stats.total} {stats.total === 1 ? 'save' : 'saves'}
            {stats.platforms > 0 && ` • ${stats.platforms} platforms`}
            {stats.thisWeek > 0 && ` • ${stats.thisWeek} this week`}
          </p>
        </div>

        <div className="inline-flex items-center rounded-lg border bg-card p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('timeline')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'timeline'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            Timeline
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'grid'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Grid
          </button>
        </div>
      </div>

      {/* Always-available Quick Save URL Bar */}
      <form
        onSubmit={handleQuickSave}
        className="flex flex-col sm:flex-row gap-2 rounded-xl border bg-card p-2 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-all"
      >
        <div className="relative flex-1 flex items-center">
          <Link2 className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            aria-label="Paste a link to save"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="Paste an Instagram Reel, YouTube, X, or article link..."
            value={quickUrl}
            onChange={e => setQuickUrl(e.target.value)}
            disabled={isSaving}
            className="w-full h-10 bg-transparent pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <Button type="submit" disabled={!quickUrl.trim() || isSaving} className="h-10 px-5 shrink-0">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1.5" />
              Save Link
            </>
          )}
        </Button>
      </form>

      {/* Loading State */}
      {isLoading && items.length === 0 && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <ItemSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && items.length === 0 && (
        <Card className="p-8 text-center">
          <Bookmark className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h2 className="text-lg font-semibold">Unable to load saves</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            {!navigator.onLine
              ? 'You appear to be offline. Check your connection and try again.'
              : error instanceof Error
                ? error.message
                : 'CURIO could not reach its save service. Please try again.'}
          </p>
          <Button onClick={() => refetch()} variant="outline" className="mt-4">
            Retry
          </Button>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !isError && items.length === 0 && (
        <Card className="p-10 text-center border-dashed">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Bookmark className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-semibold">Your CURIO library is empty</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Paste any link in the bar above, or use your iOS Share Sheet shortcut to save Reels, videos, and articles.
          </p>
        </Card>
      )}

      {/* Clusters */}
      {clusters.length > 0 && (
        <section aria-label="AI Clusters" className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              AI Clusters
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clusters.slice(0, 6).map(cluster => (
              <Link
                key={cluster.id}
                to={`/search?q=${encodeURIComponent(cluster.tags[0] || cluster.label)}`}
                className="group p-4 rounded-xl border bg-card hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                    {cluster.label}
                  </h3>
                  <Badge variant="secondary" className="shrink-0 text-[11px]">
                    {cluster.itemCount}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                  {cluster.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {cluster.tags.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" className="text-[11px] font-normal">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Platform Filter Pills */}
      {items.length > 0 && platforms.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedPlatform('all')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium border transition-colors shrink-0',
              selectedPlatform === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            All ({items.length})
          </button>
          {platforms.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setSelectedPlatform(p)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium border capitalize transition-colors shrink-0',
                selectedPlatform === p
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {p} ({items.filter(i => i.platform === p).length})
            </button>
          ))}
        </div>
      )}

      {/* Items List */}
      {filteredItems.length > 0 && (
        <section aria-label="Saved items">
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
                : 'space-y-3'
            )}
          >
            {filteredItems.map(item => (
              <ItemCard key={item.id} item={item} viewMode={viewMode} />
            ))}
          </div>

          {hasMore && (
            <div className="text-center pt-4">
              <Button variant="outline" onClick={() => refetch()}>
                Load more
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ============================================
   Item Card Component
   ============================================ */

function ItemCard({ item, viewMode }: { item: any; viewMode: 'timeline' | 'grid' }) {
  const successToast = useSuccessToast();

  const handleOpen = () => window.open(item.url, '_blank', 'noopener,noreferrer');
  const handleCopy = () => {
    navigator.clipboard.writeText(item.url);
    successToast('Link copied');
  };

  const title = getItemDisplayTitle(item);
  const authorLabel = item.authorDisplayName || item.authorUsername || item.platform;

  return (
    <Card
      className={cn(
        'group overflow-hidden border bg-card hover:border-primary/40 hover:shadow-md transition-all',
        viewMode === 'grid' ? 'flex flex-col h-full' : 'flex flex-col sm:flex-row'
      )}
    >
      {/* Thumbnail (always rendered with graceful fallback) */}
      <Link
        to={`/item/${item.id}`}
        className={cn(
          'relative shrink-0 block overflow-hidden',
          viewMode === 'grid' ? 'w-full aspect-video' : 'w-full h-40 sm:w-44 sm:h-auto'
        )}
      >
        <Thumbnail
          src={item.thumbnailUrl}
          alt={title}
          className="h-full w-full"
          imgClassName="group-hover:scale-105 transition-transform duration-300"
        >
          <PlatformBadge platform={item.platform} className="absolute bottom-2 left-2 shadow-sm" />
        </Thumbnail>
      </Link>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3
              className={cn(
                'font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors',
                viewMode === 'grid' ? 'text-base' : 'text-base'
              )}
            >
              <Link to={`/item/${item.id}`}>{title}</Link>
            </h3>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1.5 -mr-1.5 -mt-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="More options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleOpen}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open original
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopy}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {(item.summary || item.userNote) && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {item.summary || item.userNote}
            </p>
          )}

          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.slice(0, viewMode === 'grid' ? 3 : 5).map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-[11px] font-normal">
                  #{tag}
                </Badge>
              ))}
              {item.tags.length > (viewMode === 'grid' ? 3 : 5) && (
                <Badge variant="outline" className="text-[11px] font-normal">
                  +{item.tags.length - (viewMode === 'grid' ? 3 : 5)}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-3 pt-2.5 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate max-w-[60%] font-medium capitalize">{authorLabel}</span>
          <span className="shrink-0">
            {formatDistanceToNow(new Date(item.savedAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    </Card>
  );
}

function getItemDisplayTitle(item: any): string {
  return (
    item.title ||
    `${item.platform ? item.platform.charAt(0).toUpperCase() + item.platform.slice(1) : 'Saved'} link`
  );
}
