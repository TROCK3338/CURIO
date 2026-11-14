import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Copy, Tag, Calendar, Globe, User, Loader2, Sparkles, Brain } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getItemLocally } from '../services/indexeddb';
import { searchItems } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge, PlatformBadge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Skeleton } from '../components/ui/Skeleton';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '../utils/cn';
import { useSuccessToast } from '../components/ui/Toast';

export function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const successToast = useSuccessToast();
  const [item, setItem] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch item
  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setIsLoading(true);
      try {
        // Try local first
        const local = await getItemLocally(id);
        if (local) {
          setItem(local);
        }

        // Also try server for freshest data
        const result = await searchItems({ q: '', limit: 1 });
        const serverItem = result.items.find(i => i.id === id);
        if (serverItem) setItem(serverItem);
      } catch (error) {
        console.error('Failed to load item:', error);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [id]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full rounded-lg" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold">Item not found</h2>
        <p className="text-muted-foreground mt-1">This save may have been deleted</p>
        <Link to="/" className="mt-4 text-primary hover:underline">Back to home</Link>
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(item.url);
    successToast('Link copied');
  };

  const handleOpen = () => window.open(item.url, '_blank', 'noopener,noreferrer');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back Button */}
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      {/* Main Card */}
      <Card className="overflow-hidden">
        {/* Header with thumbnail */}
        {item.thumbnailUrl && (
          <div className="relative h-64 w-full">
            <img
              src={item.thumbnailUrl}
              alt={item.title || ''}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
              <div>
                <PlatformBadge platform={item.platform} />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="icon" onClick={handleCopy} aria-label="Copy link">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="default" size="icon" onClick={handleOpen} aria-label="Open original">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <CardContent className="p-6 space-y-6">
          {/* Title & Meta */}
          <div>
            <h1 className="text-2xl font-bold">{item.title || 'Untitled'}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Saved {formatDistanceToNow(new Date(item.savedAt), { addSuffix: true })}
              </span>
              {item.publishedAt && (
                <span className="flex items-center gap-1">
                  <Globe className="h-4 w-4" />
                  Published {format(new Date(item.publishedAt), 'MMM d, yyyy')}
                </span>
              )}
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {item.authorDisplayName || item.authorUsername || 'Unknown'}
              </span>
            </div>
          </div>

          {/* Tags */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {item.tags.map((tag: string) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
              {item.enrichmentStatus === 'pending' && (
                <Badge variant="outline"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing</Badge>
              )}
            </div>
          </div>

          {/* Summary */}
          {item.summary && (
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4" />
                  AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{item.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* User Note */}
          {item.userNote && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Tag className="h-4 w-4" />
                  Your Note
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{item.userNote}</p>
              </CardContent>
            </Card>
          )}

          {/* Entities */}
          {item.entities && Object.keys(item.entities).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Brain className="h-4 w-4" />
                  Extracted Entities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(item.entities).map(([key, value]: [string, any]) => (
                    <EntityCard key={key} type={key} data={value} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Original URL */}
          <div className="pt-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span className="truncate max-w-xs">{item.url}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleOpen}>
              <ExternalLink className="h-4 w-4 mr-1" />
              Open Original
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Related Items */}
      <RelatedItems itemId={id} tags={item.tags} />
    </div>
  );
}

function EntityCard({ type, data }: { type: string; data: any }) {
  const icons: Record<string, any> = {
    recipe: '🍳',
    product: '🛍️',
    place: '📍',
    event: '📅',
    workout: '💪',
  };

  return (
    <div className="p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icons[type] || '📦'}</span>
        <span className="font-medium capitalize">{type}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        {Object.entries(data).map(([key, value]) => (
          value != null && value !== '' && (
            <React.Fragment key={key}>
              <dt className="text-muted-foreground">{key.charAt(0).toUpperCase() + key.slice(1)}</dt>
              <dd className="font-medium">{Array.isArray(value) ? value.join(', ') : value}</dd>
            </React.Fragment>
          )
        ))}
      </dl>
    </div>
  );
}

function RelatedItems({ itemId, tags }: { itemId: string; tags: string[] }) {
  const { data } = useQuery({
    queryKey: ['related', itemId, tags],
    queryFn: async () => {
      if (tags.length === 0) return { items: [] };
      const result = await searchItems({ tags: tags.slice(0, 3), limit: 10 });
      return result;
    },
    enabled: tags.length > 0,
  });

  if (!data?.items.length) return null;

  const related = data.items.filter((i: any) => i.id !== itemId).slice(0, 4);
  if (!related.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Related Saves</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {related.map((item: any) => (
            <Link
              key={item.id}
              to={`/item/${item.id}`}
              className="p-3 rounded-lg border hover:bg-accent transition-colors group"
            >
              <div className="flex items-start gap-3">
                {item.thumbnailUrl && (
                  <img src={item.thumbnailUrl} alt="" className="h-16 w-16 rounded object-cover group-hover:scale-105 transition-transform" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium line-clamp-1 group-hover:text-primary">{item.title || 'Untitled'}</p>
                  <p className="text-xs text-muted-foreground">{item.platform}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}