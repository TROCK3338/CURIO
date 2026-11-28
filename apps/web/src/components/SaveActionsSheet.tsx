import type { SavedItem } from '@curio/shared';
import { ArrowUpRight, CheckCircle2, RotateCcw, Share, Trash2, type LucideIcon } from 'lucide-react';
import { Sheet } from './Sheet';
import { shareItem } from './SaveCard';
import { useSuccessToast, useToast } from './ui/Toast';
import { useToggleDone } from '../hooks/useDone';
import { useDeleteItem, useRestoreItem } from '../hooks/useItems';
import { TRASH_RETENTION_DAYS } from '../services/api';
import { platformMeta } from '../utils/platform';
import { displayTitle } from '../utils/text';
import { cn } from '../utils/cn';

function Row({ icon: Icon, label, danger, onClick }: { icon: LucideIcon; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-accent', danger && 'text-destructive')}>
      <Icon className="h-5 w-5" /> <span className="font-medium">{label}</span>
    </button>
  );
}

/** The ⋯ menu for a card in the grid. */
export function SaveActionsSheet({ item, onClose }: { item: SavedItem | null; onClose: () => void }) {
  const [toggleDone] = useToggleDone();
  const remove = useDeleteItem();
  const restore = useRestoreItem();
  const successToast = useSuccessToast();
  const { toast } = useToast();

  const run = (fn: (it: SavedItem) => void) => () => {
    if (!item) return;
    const it = item;
    onClose();
    fn(it);
  };

  const del = (it: SavedItem) =>
    remove.mutate({ id: it.id }, {
      onSuccess: () =>
        toast({
          type: 'success',
          title: 'Moved to Recently deleted',
          description: `Erased for good after ${TRASH_RETENTION_DAYS} days`,
          action: { label: 'Undo', onClick: () => restore.mutate(it.id) },
          duration: 6000,
        }),
      onError: e => toast({ type: 'error', title: 'Couldn’t delete', description: e instanceof Error ? e.message : undefined }),
    });

  return (
    <Sheet open={!!item} onClose={onClose} title={item ? displayTitle(item) : undefined}>
      {item && (
        <>
          <div className="divide-y overflow-hidden rounded-2xl border bg-elevated">
            <Row
              icon={item.doneAt ? RotateCcw : CheckCircle2}
              label={item.doneAt ? 'Move back to library' : 'Mark done'}
              onClick={run(it => toggleDone(it.id, !it.doneAt))}
            />
            <Row icon={Share} label="Share" onClick={run(it => void shareItem(it, () => successToast('Link copied')))} />
            <Row
              icon={ArrowUpRight}
              label={`Open on ${platformMeta(item.platform).label}`}
              onClick={run(it => window.open(it.url, '_blank', 'noopener,noreferrer'))}
            />
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border bg-elevated">
            <Row icon={Trash2} label="Delete" danger onClick={run(del)} />
          </div>
        </>
      )}
    </Sheet>
  );
}
