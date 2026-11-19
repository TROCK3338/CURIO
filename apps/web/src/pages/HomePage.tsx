import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Filter, Clock, Tag, Brain, Zap } from 'lucide-react';
import { useHybridItems } from '../hooks/useItems';
import { useClusters } from '../hooks/useItems';
import { useSettings } from '../hooks/useSettings';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge, PlatformBadge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Skeleton, ItemSkeleton } from '../components/ui/Skeleton';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/DropdownMenu';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../utils/cn';
import { useSuccessToast } from '../components/ui/Toast';

export function HomePage() {
  const { settings } = useSettings();
  const successToast = useSuccessToast();

  // Fetch items
  const { items, isLoading, isError, error, refetch, hasMore } = useHybridItems({ limit: settings.itemsPerPage });

  // Fetch clusters
  const { data: clustersData } = useClusters();
  const clusters = clustersData?.clusters || [];

  // View mode
  const [viewMode, setViewMode] = useState<'timeline' | 'grid'>('timeline');

  // Quick stats
  const stats = {
    total: items.length,
    thisWeek: items.filter(i => Date.now() - new Date(i.savedAt).getTime() < 7 * 24 * 60 * 60 * 1000).length,
    platforms: [...new Set(items.map(i => i.platform))].length,
  };

  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">CURIO</h1>
            <p className="text-muted-foreground">Your personal mind space</p>
          </div>
        </div>
        {[...Array(5)].map((_, i) => <ItemSkeleton key={i} />)}
      </div>
    );
  }

  if (isError && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold">Unable to load saves</h2>
        <p className="text-muted-foreground mt-1">
          {!navigator.onLine
            ? 'You appear to be offline. Check your connection and try again.'
            : error instanceof Error
              ? error.message
              : 'CURIO could not reach its save service. Please try again.'}
        </p>
        <Button onClick={() => refetch()} className="mt-4">Retry</Button>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Brain className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-2xl font-semibold">Your mind space is empty</h2>
        <p className="text-muted-foreground mt-2 max-w-xs">
          Save a public Reel or video link here. CURIO keeps the link so you can return to it later.
        </p>
        <div className="mt-6 flex gap-3">
          <Button asChild variant="outline"><Link to="/share-target"><Plus className="h-4 w-4 mr-2" />Save a link</Link></Button>
          <Button asChild variant="ghost"><Link to="/settings">Open Settings</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">CURIO</h1>
          <p className="text-muted-foreground">
            {stats.total} saves • {stats.platforms} platforms • {stats.thisWeek} this week
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode('timeline')} className={viewMode === 'timeline' ? 'bg-accent' : ''}>
            <Clock className="h-4 w-4 mr-1" /> Timeline
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewMode('grid')} className={viewMode === 'grid' ? 'bg-accent' : ''}>
            <Zap className="h-4 w-4 mr-1" /> Grid
          </Button>
        </div>
      </div>

      {/* Clusters */}
      {clusters.length > 0 && (
        <section aria-label="AI Clusters">
          <h2 className="text-lg font-semibold mb-3">AI Clusters</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clusters.slice(0, 6).map(cluster => (
              <Link
                key={cluster.id}
                to={`/search?cluster=${cluster.id}`}
                className="group p-4 rounded-xl border bg-card/50 hover:bg-card transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium group-hover:text-primary transition-colors">{cluster.label}</h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{cluster.description}</p>
                  </div>
                  <Badge variant="outline">{cluster.itemCount} items</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {cluster.tags.slice(0, 4).map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Items List */}
      <section aria-label="Saved items">
        <div className={cn(
          viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'
        )}>
          {items.map(item => (
            <ItemCard key={item.id} item={item} viewMode={viewMode} />
          ))}
        </div>

        {hasMore && (
          <div className="text-center py-4">
            <Button variant="outline" onClick={() => refetch()}>Load more</Button>
          </div>
        )}
      </section>
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

  const content = (
    <Card className={cn(
      'group overflow-hidden transition-all',
      viewMode === 'grid' ? 'flex flex-col h-full' : 'flex'
    )}>
      {/* Thumbnail */}
      {item.thumbnailUrl && (
        <Link to={`/item/${item.id}`} className="relative shrink-0 overflow-hidden" style={viewMode === 'grid' ? { width: '100%', aspectRatio: '16/9' } : { width: '120px', height: '90px' }}>
          <img
            src={item.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <PlatformBadge platform={item.platform} className="absolute bottom-1 left-1" />
        </Link>
      )}

      {/* Content */}
      <div className={cn('flex-1 p-4', viewMode === 'grid' ? 'flex flex-col' : 'flex flex-col justify-between')}>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className={cn(
              'font-medium line-clamp-2 group-hover:text-primary transition-colors',
              viewMode === 'grid' ? 'text-lg' : 'text-base'
            )}>
              <Link to={`/item/${item.id}`}>{getItemDisplayTitle(item)}</Link>
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded hover:bg-accent text-muted-foreground" aria-label="More options">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1" strokeWidth="3" /><circle cx="19" cy="12" r="1" strokeWidth="3" /><circle cx="5" cy="12" r="1" strokeWidth="3" /></svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleOpen}><svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>Open</DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopy}><svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>Copy Link</DropdownMenuItem>
                <DropdownMenuSeparator />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {item.summary && item.platform !== 'instagram' && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{item.summary}</p>
          )}

          {item.userNote && !item.summary && item.platform !== 'instagram' && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{item.userNote}</p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, viewMode === 'grid' ? 5 : 8).map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
            {item.tags.length > (viewMode === 'grid' ? 5 : 8) && (
              <Badge variant="outline" className="text-xs">+{item.tags.length - (viewMode === 'grid' ? 5 : 8)}</Badge>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={cn('mt-4 flex items-center justify-between text-xs text-muted-foreground', viewMode === 'grid' ? 'mt-auto pt-2 border-t' : '')}>
          <div className="flex items-center gap-2">
            <Avatar src={item.thumbnailUrl} fallback={item.authorUsername?.charAt(0)} size="sm" />
            <span>{item.authorUsername || item.platform}</span>
          </div>
          <span>{formatDistanceToNow(new Date(item.savedAt), { addSuffix: true })}</span>
        </div>
      </div>
    </Card>
  );

  return viewMode === 'grid' ? (
    <Link to={`/item/${item.id}`}>{content}</Link>
  ) : (
    content
  );
}

function getItemDisplayTitle(item: any): string {
  if (item.platform === 'instagram') return 'Instagram Reel';
  return item.title || `${item.platform || 'Saved'} link`;
}
