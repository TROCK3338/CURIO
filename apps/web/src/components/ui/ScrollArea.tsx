import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export const ScrollArea = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('overflow-auto', className)}
      {...props}
    >
      {children}
      {/* Scrollbar styling via CSS */}
    </div>
  )
);
ScrollArea.displayName = 'ScrollArea';