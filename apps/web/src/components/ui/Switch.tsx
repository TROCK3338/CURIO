import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

export const Switch = forwardRef<HTMLButtonElement, { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean; className?: string }>(
  ({ checked, onCheckedChange, disabled, className, ...props }, ref) => (
    <button
      ref={ref}
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onCheckedChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary border-primary' : 'bg-muted border-muted-foreground/30',
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow',
          'transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
);
Switch.displayName = 'Switch';