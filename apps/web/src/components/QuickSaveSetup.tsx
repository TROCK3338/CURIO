import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Download, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { createSaveKey, listSaveKeys, revokeSaveKey } from '../services/api';
import { useErrorToast, useSuccessToast } from './ui/Toast';
import { timeAgo } from './SaveCard';
import { cn } from '../utils/cn';
import { SHORTCUT_URL } from '../utils/shortcut';

const KEYS_QUERY = ['save-keys'];



/**
 * Creates a personal save key and shows the iOS Shortcut recipe that uses it,
 * so sharing to CURIO saves in the background without opening Safari.
 */
export function QuickSaveSetup({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const keys = useQuery({ queryKey: KEYS_QUERY, queryFn: listSaveKeys, staleTime: 60_000 });

  /**
   * Creates a key and puts it on the clipboard in one tap. iOS Safari only allows
   * clipboard writes during the tap itself, so the write starts now with a
   * promise of the key (ClipboardItem), before the network request finishes.
   */
  const createAndCopy = () => {
    setCreating(true);
    const keyPromise = createSaveKey('iPhone Shortcut').then(created => created.key);
    let clipboardStarted = false;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        clipboardStarted = true;
        navigator.clipboard
          .write([new ClipboardItem({ 'text/plain': keyPromise.then(k => new Blob([k], { type: 'text/plain' })) })])
          .then(() => setCopied(true))
          .catch(() => { /* blocked: the Copy button below still works */ });
      }
    } catch {
      clipboardStarted = false;
    }
    keyPromise
      .then(async key => {
        setNewKey(key);
        if (!clipboardStarted) {
          await navigator.clipboard?.writeText(key).then(() => setCopied(true), () => {});
        }
        void queryClient.invalidateQueries({ queryKey: KEYS_QUERY });
      })
      .catch(e => errorToast('Couldn’t create a key', e instanceof Error ? e.message : undefined))
      .finally(() => setCreating(false));
  };

  const revoke = useMutation({
    mutationFn: (id: string) => revokeSaveKey(id),
    onSuccess: () => {
      successToast('Key revoked', 'Shortcuts using it will stop saving');
      void queryClient.invalidateQueries({ queryKey: KEYS_QUERY });
    },
    onError: e => errorToast('Couldn’t revoke', e instanceof Error ? e.message : undefined),
  });

  const active = keys.data ?? [];

  return (
    <div className="space-y-3">
      {newKey ? (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(newKey).then(() => setCopied(true), () => {})}
          className="pressable flex h-14 w-full items-center justify-center gap-2 rounded-2xl border bg-card font-semibold"
        >
          {copied ? <><Check className="h-5 w-5 text-success" /> Key copied</> : <><Copy className="h-5 w-5" /> Copy my key</>}
        </button>
      ) : (
        <button
          type="button"
          onClick={createAndCopy}
          disabled={creating}
          className="pressable flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />} 1. Copy my key
        </button>
      )}

      <a
        href={SHORTCUT_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!newKey}
        className={cn(
          'pressable flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-semibold',
          newKey ? 'bg-primary text-primary-foreground' : 'pointer-events-none border bg-card text-muted-foreground',
        )}
      >
        <Download className="h-5 w-5" /> 2. Add the Shortcut
      </a>

      <p className="text-center text-sm text-muted-foreground">Paste your key when the Shortcut asks for it.</p>

      {!compact && active.length > 0 && (
        <div className="space-y-2 pt-4">
          <p className="section-label">Connected devices</p>
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {active.map(k => (
              <div key={k.id} className="flex items-center gap-3 px-4 py-3">
                <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">{k.lastUsedAt ? `Last used ${timeAgo(k.lastUsedAt)}` : 'Not used yet'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke.mutate(k.id)}
                  disabled={revoke.isPending}
                  className="rounded-full p-2 text-destructive hover:bg-destructive/15"
                  aria-label={`Remove ${k.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
