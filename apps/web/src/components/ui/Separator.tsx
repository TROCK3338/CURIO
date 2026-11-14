import { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export function Separator({ className, orientation = 'horizontal', ...props }: HTMLAttributes<HTMLHRElement> & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <hr
      className={cn(
        'bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full',
        className
      )}
      {...props}
    />
  );
}