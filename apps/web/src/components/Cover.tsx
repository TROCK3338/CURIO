import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SavedItem } from '@curio/shared';
import { refreshItemMedia } from '../services/api';
import { saveItemLocally } from '../services/indexeddb';
import { cn } from '../utils/cn';
import { hostnameOf, hueFrom, platformMeta } from '../utils/platform';
import { displayTitle } from '../utils/text';

/** Saves stored before the server fix kept "&amp;" in image links, which breaks signed CDN URLs. */
function cleanImageUrl(url: string | null | undefined): string | null {
  return url ? url.replace(/&amp;/g, '&') : null;
}

/** Items whose preview link we already tried to refresh this session. */
const refreshAttempted = new Set<string>();

type CoverItem = Pick<SavedItem, 'id' | 'platform' | 'thumbnailUrl' | 'title' | 'url' | 'userNote'>;

interface CoverProps {
  item: CoverItem;
  className?: string;
  /** Show the title on the generated cover (feed cards: yes, tiny thumbnails: no) */
  showTitle?: boolean;
  /** Size of the generated cover's type */
  size?: 'sm' | 'md' | 'lg';
  /** Called with false when the cover falls back to the generated design */
  onImageAvailable?: (available: boolean) => void;
  /** Called with the image's real width/height once it loads (masonry cards size to it) */
  onNaturalSize?: (width: number, height: number) => void;
  children?: ReactNode;
}

/**
 * A save's preview image. Instagram/TikTok CDN links expire, so when an image
 * fails we ask the server to re-scrape it once; if there is still nothing we
 * render a generated cover (colour from the save id, platform mark, title)
 * instead of a broken image.
 */
export function Cover({ item, className, showTitle = true, size = 'md', onImageAvailable, onNaturalSize, children }: CoverProps) {
  const [src, setSrc] = useState<string | null>(cleanImageUrl(item.thumbnailUrl));
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Only reset when the image actually changes (resetting on mount would hide
  // an image that already finished loading from cache)
  const propUrl = useRef(cleanImageUrl(item.thumbnailUrl));
  useEffect(() => {
    const next = cleanImageUrl(item.thumbnailUrl);
    if (next === propUrl.current) return;
    propUrl.current = next;
    setSrc(next);
    setFailed(false);
    setLoaded(false);
  }, [item.id, item.thumbnailUrl]);

  const handleError = async () => {
    if (refreshAttempted.has(item.id)) {
      setFailed(true);
      return;
    }
    refreshAttempted.add(item.id);
    try {
      const fresh = await refreshItemMedia(item.id);
      const freshUrl = cleanImageUrl(fresh.thumbnailUrl);
      if (freshUrl && freshUrl !== src) {
        setSrc(freshUrl);
        setLoaded(false);
        void saveItemLocally(fresh);
        return;
      }
    } catch {
      // offline or server unavailable: fall through to the generated cover
    }
    setFailed(true);
  };

  const showImage = Boolean(src) && !failed;

  useEffect(() => {
    onImageAvailable?.(showImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showImage]);

  return (
    <div className={cn('relative overflow-hidden bg-elevated', className)}>
      {!showImage || !loaded ? <GeneratedCover item={item} showTitle={showTitle && !showImage} size={size} /> : null}
      {showImage && (
        <img
          src={src as string}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          ref={el => {
            // Cached images can finish before React attaches onLoad
            if (el?.complete && el.naturalWidth > 0) {
              setLoaded(true);
              onNaturalSize?.(el.naturalWidth, el.naturalHeight);
            }
          }}
          onLoad={e => {
            setLoaded(true);
            onNaturalSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
          }}
          onError={handleError}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
      {children}
    </div>
  );
}

function GeneratedCover({ item, showTitle, size }: { item: CoverItem; showTitle: boolean; size: 'sm' | 'md' | 'lg' }) {
  const meta = platformMeta(item.platform);
  const Icon = meta.icon;
  const hue = hueFrom(item.id);
  const title = displayTitle(item);
  const host = hostnameOf(item.url);

  return (
    <div
      className="absolute inset-0 flex flex-col justify-between p-[8%]"
      style={{
        background: `radial-gradient(120% 90% at 0% 0%, hsl(${hue} 70% 55% / 0.55), transparent 60%),
                     radial-gradient(120% 90% at 100% 100%, ${meta.gradient[1]}88, transparent 55%),
                     linear-gradient(135deg, ${meta.gradient[0]}, hsl(${(hue + 40) % 360} 45% 14%))`,
      }}
      aria-hidden="true"
    >
      {/* Larger covers sit under a platform chip, so only small ones need the mark */}
      {size === 'sm' ? <Icon className="h-5 w-5 text-white/80" /> : <span />}
      {showTitle && (
        <div>
          <p
            className={cn(
              'font-display italic text-white leading-[1.05] line-clamp-4 text-balance',
              size === 'lg' ? 'text-4xl lg:text-[28px]' : size === 'md' ? 'text-[26px]' : 'text-base',
            )}
          >
            {title}
          </p>
          {host && size !== 'sm' && <p className="mt-2 text-xs font-medium text-white/60">{host}</p>}
        </div>
      )}
    </div>
  );
}
