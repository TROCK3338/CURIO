import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Zap } from 'lucide-react';
import { listSaveKeys } from '../services/api';
import { deviceKind } from '../utils/install';
import { Sheet } from './Sheet';
import { QuickSaveSetup } from './QuickSaveSetup';

const DISMISSED_KEY = 'curio.quicksave-nudge.dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Home card for iPhone users who haven't set up the background-save Shortcut
 * yet (no save key). Opens the two-tap setup; can be dismissed for good.
 */
export function QuickSaveNudge() {
  const isIos = deviceKind() === 'ios';
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [open, setOpen] = useState(false);
  const keys = useQuery({ queryKey: ['save-keys'], queryFn: listSaveKeys, staleTime: 60_000, enabled: isIos && !dismissed });

  const hasKey = (keys.data?.length ?? 0) > 0;
  if (!isIos || dismissed || !keys.isSuccess || (hasKey && !open)) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* private mode: hide for this visit only */ }
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <Zap className="h-5 w-5" />
        </span>
        <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 text-left">
          <span className="block font-semibold leading-tight">Save from any app in 2 taps</span>
          <span className="block text-[13px] text-muted-foreground">Share a Reel and stay where you are. Set up →</span>
        </button>
        <button type="button" onClick={dismiss} className="rounded-full p-1.5 text-muted-foreground hover:bg-accent" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="iPhone quick save">
        <QuickSaveSetup />
      </Sheet>
    </>
  );
}
