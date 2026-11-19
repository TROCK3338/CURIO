import { useEffect, useState, type ReactNode } from 'react';
import { PlayCircle } from 'lucide-react';
import { cn } from '../utils/cn';

interface ThumbnailProps {
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  children?: ReactNode;
}

/**
 * Preview image with a clean placeholder.
 * Instagram/TikTok preview links often expire or are blocked, so instead of a
 * broken-image icon we show a soft gradient with a play icon.
 */
export function Thumbnail({ src, alt = '', className, imgClassName, children }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  const showImage = Boolean(src) && !failed;

  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-primary/20 via-secondary to-card', className)}>
      {showImage ? (
        <img
          src={src as string}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
          <PlayCircle className="h-8 w-8" aria-hidden="true" />
        </div>
      )}
      {children}
    </div>
  );
}
