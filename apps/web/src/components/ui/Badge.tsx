import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'platform';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
      secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
      destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
      outline: 'text-foreground',
      platform: 'bg-muted text-muted-foreground',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

/* Platform-specific badge colors */
export function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
    tiktok: 'bg-black text-white',
    x: 'bg-gray-900 text-white dark:bg-white dark:text-black',
    youtube: 'bg-red-600 text-white',
    reddit: 'bg-orange-500 text-white',
    pinterest: 'bg-red-600 text-white',
    linkedin: 'bg-blue-600 text-white',
    threads: 'bg-gray-900 text-white dark:bg-white dark:text-black',
    bluesky: 'bg-sky-500 text-white',
    generic: 'bg-muted text-muted-foreground',
  };

  const style = colors[platform] || colors.generic;

  return (
    <Badge variant="platform" className={style} style={{ border: 'none' }}>
      {platform.charAt(0).toUpperCase() + platform.slice(1)}
    </Badge>
  );
}