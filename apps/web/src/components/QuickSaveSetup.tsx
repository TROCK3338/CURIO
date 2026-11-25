import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { createSaveKey, listSaveKeys, revokeSaveKey } from '../services/api';
import { useErrorToast, useSuccessToast } from './ui/Toast';
import { timeAgo } from './SaveCard';
import { cn } from '../utils/cn';

const KEYS_QUERY = ['save-keys'];

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the value is still selectable */
    }
  };
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <button
        type="button"
        onClick={copy}
        className={cn('pressable flex w-full items-center gap-2 rounded-xl border bg-background px-3 py-2.5 text-left', secret && 'border-primary/50')}
      >
        <code className="min-w-0 flex-1 break-all text-[12.5px] leading-snug">{value}</code>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-elevated px-2.5 py-1 text-[11px] font-semibold">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-bold">{n}</span>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5 text-[14.5px] leading-relaxed">{children}</div>
    </li>
  );
}

/**
 * Creates a personal save key and shows the iOS Shortcut recipe that uses it,
 * so sharing to CURIO saves in the background without opening Safari.
 */
export function QuickSaveSetup({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();
  const [newKey, setNewKey] = useState<string | null>(null);
  const keys = useQuery({ queryKey: KEYS_QUERY, queryFn: listSaveKeys, staleTime: 60_000 });

  const create = useMutation({
    mutationFn: () => createSaveKey('iPhone Shortcut'),
    onSuccess: created => {
      setNewKey(created.key);
      void queryClient.invalidateQueries({ queryKey: KEYS_QUERY });
    },
    onError: e => errorToast('Couldn’t create a key', e instanceof Error ? e.message : undefined),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeSaveKey(id),
    onSuccess: () => {
      successToast('Key revoked', 'Shortcuts using it will stop saving');
      void queryClient.invalidateQueries({ queryKey: KEYS_QUERY });
    },
    onError: e => errorToast('Couldn’t revoke', e instanceof Error ? e.message : undefined),
  });

  const ingestUrl = `${window.location.origin}/api/ingest`;
  const active = keys.data ?? [];

  return (
    <div className="space-y-5">
      {!compact && (
        <p className="text-sm text-muted-foreground">
          Share from Instagram, YouTube or Safari and CURIO saves it in the background. You stay in the app you were in and get a
          “Saved to CURIO ✓” notification.
        </p>
      )}

      {newKey ? (
        <div className="space-y-4 rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <p className="text-sm font-semibold">Your key is ready. Copy it now: it won’t be shown again.</p>
          <CopyField label="Save key" value={newKey} secret />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="pressable flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {active.length > 0 ? 'Create another key' : 'Create my save key'}
        </button>
      )}

      <ol className="space-y-4">
        <Step n={1}>
          Open <b>Shortcuts</b> and create a shortcut named <b>Save to CURIO</b> (or edit your existing one and delete its steps).
          Tap <b>ⓘ</b> → turn on <b>Show in Share Sheet</b> → receive <b>URLs</b>, <b>Safari web pages</b> and <b>Text</b>.
        </Step>
        <Step n={2}>
          Add <b>Get URLs from Input</b>, then <b>Get Item from List</b> → <b>First Item</b>.
        </Step>
        <Step n={3}>
          Add <b>Get Contents of URL</b> and paste this as the URL:
          <CopyField label="URL" value={ingestUrl} />
          Tap <b>Show More</b>: Method <b>POST</b>. Under <b>Headers</b> add <b>Authorization</b> with the value:
          <CopyField label="Header value" value={newKey ? `Bearer ${newKey}` : 'Bearer <your save key>'} secret={!!newKey} />
          Request Body <b>JSON</b>: add a <b>Text</b> field named <b>url</b> and set it to the <b>Item from List</b> variable.
        </Step>
        <Step n={4}>
          Add <b>Get Dictionary Value</b> → key <b>notification</b> from <b>Contents of URL</b>.
        </Step>
        <Step n={5}>
          Add <b>Show Notification</b> with the <b>Dictionary Value</b>. Done: try Share → <b>Save to CURIO</b> on any Reel.
        </Step>
      </ol>

      {active.length > 0 && (
        <div className="space-y-2">
          <p className="section-label">Active keys</p>
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {active.map(k => (
              <div key={k.id} className="flex items-center gap-3 px-4 py-3">
                <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">
                    <code>{k.prefix}…</code> · created {timeAgo(k.createdAt)} · {k.lastUsedAt ? `last used ${timeAgo(k.lastUsedAt)}` : 'never used'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke.mutate(k.id)}
                  disabled={revoke.isPending}
                  className="rounded-full p-2 text-destructive hover:bg-destructive/15"
                  aria-label={`Revoke ${k.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">A key can only save links. It can’t read, change or delete your library.</p>
        </div>
      )}
    </div>
  );
}
