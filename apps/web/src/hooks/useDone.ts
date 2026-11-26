import { useCallback } from 'react';
import { useSetDone } from './useItems';
import { useToast } from '../components/ui/Toast';

/**
 * Mark a save done (hidden from the library, still searchable) or move it back,
 * with an Undo toast. Returns [toggle, isPending].
 */
export function useToggleDone(onChange?: (done: boolean) => void) {
  const setDone = useSetDone();
  const { toast } = useToast();

  const apply = useCallback((id: string, done: boolean, withUndo: boolean) => {
    onChange?.(done);
    setDone.mutate({ id, done }, {
      onSuccess: () => {
        if (!withUndo) return;
        toast({
          type: 'success',
          title: done ? 'Marked done' : 'Back in your library',
          description: done ? 'Still findable in search' : undefined,
          action: { label: 'Undo', onClick: () => apply(id, !done, false) },
          duration: 5000,
        });
      },
      onError: e => {
        onChange?.(!done);
        toast({ type: 'error', title: 'Couldn’t update', description: e instanceof Error ? e.message : undefined });
      },
    });
  }, [setDone, toast, onChange]);

  const toggle = useCallback((id: string, done: boolean) => apply(id, done, true), [apply]);
  return [toggle, setDone.isPending] as const;
}
