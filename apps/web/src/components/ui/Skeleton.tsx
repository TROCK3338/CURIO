import { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export function ItemSkeleton() {
  return (
    <div className="group flex gap-4 p-4 bg-card rounded-xl border border-border/50">
      <Skeleton className="h-24 w-24 rounded-lg shrink-0 bg-gradient-to-br from-muted via-muted/50 to-muted" />
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-4 w-1/2 rounded" />
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-1/4 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-5/6 rounded" />
      <Skeleton className="h-4 w-3/4 rounded" />
    </div>
  );
}