import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, CloudOff, Loader2 } from 'lucide-react';
import type { SavedItem } from '@curio/shared';
import { findUrl, saveLink, type SaveOutcome } from '../services/save';
import { Cover } from '../components/Cover';
import { displayTitle } from '../utils/text';
import { platformMeta } from '../utils/platform';

type State =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; outcome: SaveOutcome }
  | { kind: 'error'; message: string };

/**
 * Landing page for the Web Share Target (Android/desktop) and the iOS Shortcut
 * (`/share-target?url=...`). Saves immediately, then shows what was saved.
 */
export function ShareTargetPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [manual, setManual] = useState('');
  const attempted = useRef<string | null>(null);

  const run = async (raw: string) => {
    setState({ kind: 'saving' });
    try {
      const outcome = await saveLink(raw);
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      setState({ kind: 'done', outcome });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Couldn’t save that link' });
    }
  };

  // Shared via URL params
  useEffect(() => {
    const candidate = params.get('url') || findUrl(params.get('text')) || findUrl(params.get('title'));
    const key = JSON.stringify([params.get('url'), params.get('text'), params.get('title')]);
    if (!candidate) {
      if (params.get('text') || params.get('title')) {
        setState({ kind: 'error', message: 'No link came through. In the app, use Copy Link and paste it below.' });
      }
      return;
    }
    // Strict Mode mounts effects twice in development: never save the same share twice
    if (attempted.current === key) return;
    attempted.current = key;
    void run(candidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Shared via POST, relayed by the service worker
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'SHARED_CONTENT') return;
      const p = event.data.payload ?? {};
      const candidate = p.url || findUrl(p.text) || findUrl(p.title);
      if (candidate) void run(candidate);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (manual.trim()) void run(manual);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 pb-safe pt-safe">
      <div className="w-full max-w-sm">
        {state.kind === 'saving' && (
          <div className="text-center animate-in">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-primary/15">
              <Loader2 className="h-9 w-9 animate-spin text-primary" />
            </span>
            <h1 className="mt-6 text-2xl font-bold">Saving to CURIO</h1>
            <p className="mt-2 text-muted-foreground">Reading it, tagging it, making it findable…</p>
          </div>
        )}

        {state.kind === 'done' && <Saved outcome={state.outcome} onDone={() => navigate('/', { replace: true })} />}

        {(state.kind === 'idle' || state.kind === 'error') && (
          <div className="animate-in">
            {state.kind === 'error' ? (
              <div className="mb-6 flex gap-3 rounded-2xl bg-destructive/15 p-4 text-sm text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{state.message}</span>
              </div>
            ) : (
              <>
                <h1 className="font-display text-4xl italic">Save a link</h1>
                <p className="mt-2 text-muted-foreground">Paste a Reel, video, post or article.</p>
              </>
            )}
            <form onSubmit={submitManual} className="mt-6 space-y-3">
              <input
                type="url"
                inputMode="url"
                autoCapitalize="off"
                value={manual}
                onChange={e => setManual(e.target.value)}
                placeholder="https://"
                className="h-14 w-full rounded-2xl border bg-card px-4 text-[16px] focus:border-primary/60 focus:outline-none"
                aria-label="Link to save"
              />
              <button type="submit" disabled={!manual.trim()} className="pressable h-12 w-full rounded-2xl bg-primary font-semibold text-primary-foreground disabled:opacity-40">
                Save
              </button>
            </form>
            <Link to="/" className="mt-4 block text-center text-sm font-medium text-muted-foreground">Back to library</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Saved({ outcome, onDone }: { outcome: SaveOutcome; onDone: () => void }) {
  if (outcome.status === 'queued') {
    return (
      <div className="text-center animate-in">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-elevated"><CloudOff className="h-9 w-9" /></span>
        <h1 className="mt-6 text-2xl font-bold">Saved offline</h1>
        <p className="mt-2 text-muted-foreground">It&rsquo;ll upload as soon as you&rsquo;re back online.</p>
        <button type="button" onClick={onDone} className="pressable mt-8 h-12 w-full rounded-2xl bg-primary font-semibold text-primary-foreground">Done</button>
      </div>
    );
  }

  const item: SavedItem = outcome.item;
  const meta = platformMeta(item.platform);
  return (
    <div className="animate-in">
      <p className="mb-4 flex items-center justify-center gap-2 font-semibold text-success">
        <Check className="h-5 w-5" /> {outcome.status === 'duplicate' ? 'Already in your library' : 'Saved'}
      </p>
      <div className="overflow-hidden rounded-[26px] border bg-card">
        <Cover item={item} size="md" className={meta.aspect === 'portrait' ? 'aspect-[4/5] max-h-[46vh] w-full' : 'aspect-[16/10] w-full'} />
        <div className="p-4">
          <p className="text-xs font-medium text-muted-foreground">{meta.label}</p>
          <p className="mt-1 font-semibold leading-snug line-clamp-2">{displayTitle(item)}</p>
          {item.summary && <p className="mt-1.5 text-sm text-muted-foreground line-clamp-3">{item.summary}</p>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link to={`/item/${item.id}`} replace className="flex h-12 items-center justify-center rounded-2xl border bg-card font-semibold">View</Link>
        <button type="button" onClick={onDone} className="pressable h-12 rounded-2xl bg-primary font-semibold text-primary-foreground">Done</button>
      </div>
    </div>
  );
}
