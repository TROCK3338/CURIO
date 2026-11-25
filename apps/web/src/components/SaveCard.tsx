import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock, Share, AlertCircle, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import type { SavedItem } from '@curio/shared';
import { Cover } from './Cover';
import { cn } from '../utils/cn';
import { platformMeta } from '../utils/platform';
import { COLLECTIONS, isCollectionType } from '../utils/collections';
import { cleanEntities, cleanCaption, decodeEntities, displayAuthor, displayTitle, topicTags } from '../utils/text';
import { useSuccessToast } from './ui/Toast';

/** Short relative time: "now", "5m", "3h", "2d", then "Nov 12" / "Nov 12, 2025". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d`;
  return format(date, date.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy');
}

export async function shareItem(item: Pick<SavedItem, 'url' | 'title' | 'platform' | 'userNote'>, onCopied: () => void) {
  const title = displayTitle(item);
  if (navigator.share) {
    try {
      await navigator.share({ title, url: item.url });
      return;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
  }
  await navigator.clipboard?.writeText(item.url);
  onCopied();
}

function StatusPill({ item }: { item: SavedItem }) {
  if (item.enrichmentStatus === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
        <Clock className="h-3 w-3" /> AI pending
      </span>
    );
  }
  if (item.enrichmentStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <AlertCircle className="h-3 w-3" /> AI failed
      </span>
    );
  }
  return null;
}

/** Big feed card used on Home and in collections. */
export function SaveCard({ item, priority = false }: { item: SavedItem; priority?: boolean }) {
  const successToast = useSuccessToast();
  const meta = platformMeta(item.platform);
  const PlatformIcon = meta.icon;
  const title = displayTitle(item);
  const author = displayAuthor(item);
  const summary = decodeEntities(item.summary) || cleanCaption(item.userNote);
  const tags = topicTags(item.tags).slice(0, 4);
  const collections = Object.keys(cleanEntities(item.entities)).filter(isCollectionType);
  // Tall covers only when there is a real (portrait) image; generated covers stay compact
  const [hasImage, setHasImage] = useState(Boolean(item.thumbnailUrl));
  const tall = hasImage && meta.aspect === 'portrait';

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[26px] border bg-card animate-in lg:rounded-[22px] lg:transition-colors lg:hover:border-primary/40">
      <Link to={`/item/${item.id}`} className="block" aria-label={title}>
        <Cover
          item={item}
          size="lg"
          onImageAvailable={setHasImage}
          // Phones: tall Reels; laptops: one tidy shape so the grid lines up
          className={cn(tall ? 'aspect-[4/5]' : 'aspect-[16/10]', 'lg:aspect-[4/3]', priority && 'bg-elevated')}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm', meta.chip)}>
              <PlatformIcon className="h-3.5 w-3.5" /> {meta.label}
            </span>
            {collections.length > 0 && (
              <span className="flex gap-1">
                {collections.map(c => (
                  <span key={c} className="rounded-full bg-black/55 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                    {COLLECTIONS[c].emoji} {COLLECTIONS[c].singular}
                  </span>
                ))}
              </span>
            )}
          </div>
        </Cover>
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-elevated text-[11px] font-bold uppercase text-foreground">
            {author.replace('@', '').charAt(0) || '•'}
          </span>
          <span className="truncate font-medium text-foreground/90">{author}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={item.savedAt} className="shrink-0">{timeAgo(item.savedAt)}</time>
          <span className="ml-auto"><StatusPill item={item} /></span>
        </div>

        <Link to={`/item/${item.id}`} className="block space-y-1.5">
          <h3 className="text-[17px] font-semibold leading-snug line-clamp-2">{title}</h3>
          {summary && summary !== title && (
            <p className="text-[14.5px] leading-relaxed text-muted-foreground line-clamp-2">{summary}</p>
          )}
        </Link>

        <div className="mt-auto flex items-center gap-2 pt-0.5">
          <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {tags.map(tag => (
              <Link
                key={tag}
                to={`/search?tag=${encodeURIComponent(tag)}`}
                className="shrink-0 rounded-full bg-elevated px-2.5 py-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
              >
                #{tag}
              </Link>
            ))}
          </div>
          <button
            type="button"
            onClick={() => shareItem(item, () => successToast('Link copied'))}
            className="pressable rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Share"
          >
            <Share className="h-[18px] w-[18px]" />
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pressable rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Open on ${meta.label}`}
          >
            <ArrowUpRight className="h-5 w-5" />
          </a>
        </div>
      </div>
    </article>
  );
}

/** Compact row for search results, collections and related saves. */
export function SaveRow({ item, subtitle, className }: { item: SavedItem; subtitle?: string; className?: string }) {
  const meta = platformMeta(item.platform);
  const PlatformIcon = meta.icon;
  const title = displayTitle(item);
  const summary = subtitle ?? (decodeEntities(item.summary) || cleanCaption(item.userNote));

  return (
    <Link
      to={`/item/${item.id}`}
      className={cn('pressable flex items-center gap-3 rounded-2xl p-2 -mx-2 hover:bg-card', className)}
    >
      <Cover item={item} showTitle={false} size="sm" className="h-[72px] w-[72px] shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug line-clamp-1">{title}</p>
        {summary && <p className="mt-0.5 text-[13.5px] text-muted-foreground line-clamp-2">{summary}</p>}
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <PlatformIcon className="h-3 w-3" /> {meta.label} · {timeAgo(item.savedAt)}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
    </Link>
  );
}

export function SaveCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[26px] border bg-card">
      <div className="aspect-[4/5] animate-pulse bg-elevated lg:aspect-[4/3]" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded-full bg-elevated" />
        <div className="h-4 w-4/5 animate-pulse rounded-full bg-elevated" />
        <div className="h-3 w-full animate-pulse rounded-full bg-elevated" />
      </div>
    </div>
  );
}

export function SaveRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-2xl bg-elevated" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded-full bg-elevated" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-elevated" />
      </div>
    </div>
  );
}
