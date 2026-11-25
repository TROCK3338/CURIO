import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardPaste, Link2, Loader2 } from 'lucide-react';
import { Sheet } from './Sheet';
import { saveLink, findUrl } from '../services/save';
import { useErrorToast, useInfoToast, useSuccessToast } from './ui/Toast';
import { displayTitle } from '../utils/text';
import { cn } from '../utils/cn';

interface SaveSheetProps {
  open: boolean;
  onClose: () => void;
  initialUrl?: string;
}

export function SaveSheet({ open, onClose, initialUrl = '' }: SaveSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const successToast = useSuccessToast();
  const infoToast = useInfoToast();
  const errorToast = useErrorToast();
  const [url, setUrl] = useState(initialUrl);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    setNote('');
    setShowNote(false);
    setError(null);
    // Focus after the sheet animation so iOS keeps the keyboard up
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open, initialUrl]);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const found = findUrl(text);
      if (found) {
        setUrl(found);
        setError(null);
      } else {
        setError('Your clipboard doesn’t contain a link.');
      }
    } catch {
      setError('Clipboard access was blocked. Long-press the field and choose Paste.');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveLink(url, note);
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      onClose();
      if (result.status === 'queued') {
        infoToast('Saved offline', 'It will sync when you’re back online');
      } else if (result.status === 'duplicate') {
        infoToast('Already in your library', displayTitle(result.item));
        navigate(`/item/${result.item.id}`);
      } else {
        successToast('Saved to CURIO', displayTitle(result.item));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save this link';
      setError(message);
      errorToast('Couldn’t save', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Save a link">
      <form onSubmit={submit} className="space-y-3">
        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl border bg-elevated px-3 transition-colors focus-within:border-primary/60',
            error && 'border-destructive/60',
          )}
        >
          <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Paste a Reel, video, post or article link"
            value={url}
            onChange={e => { setUrl(e.target.value); setError(null); }}
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-muted-foreground focus:outline-none"
            aria-label="Link to save"
          />
          {canPaste && !url && (
            <button
              type="button"
              onClick={paste}
              className="flex shrink-0 items-center gap-1 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              <ClipboardPaste className="h-3.5 w-3.5" /> Paste
            </button>
          )}
        </div>

        {showNote ? (
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Why are you saving this? (helps search and chat)"
            className="w-full resize-none rounded-2xl border bg-elevated px-3 py-3 text-[16px] placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
            aria-label="Note"
          />
        ) : (
          <button type="button" onClick={() => setShowNote(true)} className="text-sm font-medium text-primary">
            + Add a note
          </button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={!url.trim() || saving}
          className="pressable flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving & reading it…</> : 'Save'}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          Tip: share straight from Instagram, YouTube or Safari once CURIO is set up on your phone.
        </p>
      </form>
    </Sheet>
  );
}
