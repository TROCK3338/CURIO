import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../utils/cn';
import { X, ChevronDown } from 'lucide-react';

const DropdownMenuContext = createContext<{
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  contentRef: React.RefObject<HTMLDivElement>;
} | null>(null);

export function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const onToggle = () => setOpen(value => !value);
  const onClose = () => setOpen(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (contentRef.current && !contentRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <DropdownMenuContext.Provider value={{ open, onToggle, onClose, triggerRef, contentRef }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({ children, className, asChild = false, onClick, ...props }: { children: ReactNode; className?: string; asChild?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = useContext(DropdownMenuContext);
  if (!context) throw new Error('DropdownMenuTrigger must be used within DropdownMenu');

  const triggerProps = {
    ref: context.triggerRef,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) context.onToggle();
    },
    className: cn(
      'inline-flex items-center gap-1.5 rounded-md bg-background px-3 py-2 text-sm font-medium',
      'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:pointer-events-none disabled:opacity-50',
      'hover:bg-accent hover:text-accent-foreground',
      className
    ),
    ...props,
  };

  // Slot must receive exactly one element. Keeping the normal-trigger chevron
  // out of this branch avoids passing a false sibling to Radix when asChild.
  if (asChild) {
    return <Slot {...triggerProps}>{children}</Slot>;
  }

  return (
    <button {...triggerProps}>
      {children}
      <ChevronDown className={cn('h-4 w-4 transition-transform', context.open && 'rotate-180')} />
    </button>
  );
}

export function DropdownMenuContent({ children, className, align = 'end', ...props }: { children: ReactNode; className?: string; align?: 'start' | 'end' | 'center' } & React.HTMLAttributes<HTMLDivElement>) {
  const context = useContext(DropdownMenuContext);
  if (!context) throw new Error('DropdownMenuContent must be used within DropdownMenu');

  if (!context.open) return null;

  return (
    <div
      ref={context.contentRef}
      className={cn(
        'relative z-50 min-w-[8rem] origin-top-right rounded-md border bg-popover p-1 text-popover-foreground',
        'shadow-lg animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2',
        align === 'end' && 'right-0',
        align === 'center' && 'left-1/2 -translate-x-1/2',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({ children, className, onClick, disabled, ...props }: { children: ReactNode; className?: string; onClick?: () => void; disabled?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  const context = useContext(DropdownMenuContext);
  if (!context) throw new Error('DropdownMenuItem must be used within DropdownMenu');

  return (
    <div
      onClick={() => { if (!disabled) { onClick?.(); context.onClose(); } }}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm',
        'outline-none focus:bg-accent focus:text-accent-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      data-disabled={disabled}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator({ className, ...props }: { className?: string } & React.HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />;
}

export function DropdownMenuLabel({ children, className, ...props }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-2 py-1.5 text-sm font-semibold', className)} {...props}>
      {children}
    </div>
  );
}

export function DropdownMenuCheckboxItem({ className, checked, onCheckedChange, children, ...props }: { className?: string; checked: boolean; onCheckedChange: (checked: boolean) => void; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm',
        'outline-none focus:bg-accent focus:text-accent-foreground',
        className
      )}
      {...props}
    >
      <span className="flex h-4 w-4 items-center justify-center mr-2">
        {checked && <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" /></svg>}
      </span>
      {children}
    </div>
  );
}
