import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CalendarPlus,
  Clock,
  Copy,
  Loader2,
  MapPin,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Share,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { SavedItem } from '@curio/shared';
import { getItemLocally } from '../services/indexeddb';
import { getItem } from '../services/api';
import { useDeleteItem, useRelatedItems, useReprocessItem, useUpdateItem } from '../hooks/useItems';
import { Cover } from '../components/Cover';
import { Sheet } from '../components/Sheet';
import { SaveRow, SaveRowSkeleton, shareItem, timeAgo } from '../components/SaveCard';
import { useErrorToast, useSuccessToast } from '../components/ui/Toast';
import { COLLECTIONS, calendarUrl, isCollectionType, mapsUrl } from '../utils/collections';
import { hostnameOf, platformMeta } from '../utils/platform';
import { cleanCaption, cleanEntities, decodeEntities, displayAuthor, displayTitle, topicTags } from '../utils/text';
import { cn } from '../utils/cn';
import { format } from 'date-fns';

export function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();
  const updateMutation = useUpdateItem();
  const deleteMutation = useDeleteItem();
  const reprocessMutation = useReprocessItem();
  const related = useRelatedItems(id, 6);

  const [item, setItem] = useState<SavedItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [heroImage, setHeroImage] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const local = await getItemLocally(id);
        if (local && !cancelled) setItem(local);
        const fresh = await getItem(id);
        if (!cancelled) setItem(fresh ?? local ?? null);
      } catch (error) {
        console.error('Failed to load item:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    window.scrollTo(0, 0);
    return () => { cancelled = true; };
  }, [id]);

  if (isLoading && !item) {
    return (
      <div>
        <div className="aspect-[4/5] max-h-[70vh] w-full animate-pulse bg-elevated" />
        <div className="space-y-3 p-5">
          <div className="h-6 w-3/4 animate-pulse rounded-full bg-elevated" />
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-elevated" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl">🫥</p>
        <h1 className="mt-4 text-xl font-semibold">This save isn&rsquo;t here</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted.</p>
        <Link to="/" className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Back to library</Link>
      </div>
    );
  }

  const meta = platformMeta(item.platform);
  const PlatformIcon = meta.icon;
  const title = displayTitle(item);
  const author = displayAuthor(item);
  const entities = cleanEntities(item.entities);
  const tags = topicTags(item.tags);
  const note = cleanCaption(item.userNote);
  const summary = decodeEntities(item.summary);
  const relatedItems = (related.data?.items ?? []).filter(r => r.id !== item.id);

  const copyLink = async () => {
    await navigator.clipboard?.writeText(item.url);
    successToast('Link copied');
  };

  const reprocess = () => {
    setMenuOpen(false);
    reprocessMutation.mutate(item.id, {
      onSuccess: updated => {
        setItem(updated);
        if (updated.enrichmentStatus === 'enriched') successToast('Refreshed', 'Summary, tags and details updated');
        else errorToast('AI is unavailable right now', 'CURIO will keep retrying automatically');
      },
      onError: e => errorToast('Couldn’t re-run AI', e instanceof Error ? e.message : undefined),
    });
  };

  const remove = () => {
    deleteMutation.mutate(item.id, {
      onSuccess: () => {
        successToast('Deleted');
        navigate('/', { replace: true });
      },
      onError: e => errorToast('Couldn’t delete', e instanceof Error ? e.message : undefined),
    });
  };

  return (
    <article className="pb-8">
      {/* Hero */}
      <div className="relative">
        <Cover
          item={item}
          size="lg"
          onImageAvailable={setHeroImage}
          className={cn('w-full', heroImage && meta.aspect === 'portrait' ? 'aspect-[4/5] max-h-[72vh]' : 'aspect-[16/10]')}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative -mt-6 space-y-6 px-5">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', meta.chip)}>
              <PlatformIcon className="h-3.5 w-3.5" /> {meta.label}
            </span>
            <span className="font-medium text-foreground/90">{author}</span>
            <span>· saved {timeAgo(item.savedAt)}</span>
          </div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-balance">{title}</h1>
          <StatusBanner item={item} busy={reprocessMutation.isPending} onRetry={reprocess} />
        </header>

        <div className="flex gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pressable flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-foreground font-semibold text-background"
          >
            Open on {meta.label} <ArrowUpRight className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => shareItem(item, () => successToast('Link copied'))}
            className="pressable flex h-12 w-12 items-center justify-center rounded-2xl border bg-card"
            aria-label="Share"
          >
            <Share className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="pressable flex h-12 w-12 items-center justify-center rounded-2xl border bg-card"
            aria-label="Edit"
          >
            <Pencil className="h-5 w-5" />
          </button>
        </div>

        {summary && (
          <section className="rounded-[22px] border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-primary">
              <Sparkles className="h-4 w-4" /> AI summary
            </h2>
            <p className="text-[15.5px] leading-relaxed">{summary}</p>
          </section>
        )}

        {Object.entries(entities).map(([type, data]) => (
          <EntityDetail key={type} type={type} data={data as Record<string, any>} />
        ))}

        <section className="rounded-[22px] border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-muted-foreground">Your note</h2>
            <button type="button" onClick={() => setEditOpen(true)} className="text-[13px] font-medium text-primary">
              {note ? 'Edit' : 'Add'}
            </button>
          </div>
          {note ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{note}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Add why you saved this. It helps search and chat find it later.</p>
          )}
        </section>

        {tags.length > 0 && (
          <section className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <Link key={tag} to={`/search?tag=${encodeURIComponent(tag)}`} className="chip">#{tag}</Link>
            ))}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="section-label">More like this</h2>
          {related.isLoading && [0, 1].map(i => <SaveRowSkeleton key={i} />)}
          {!related.isLoading && relatedItems.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing similar yet. Related saves show up as your library grows.</p>
          )}
          {relatedItems.map(r => <SaveRow key={r.id} item={r} />)}
        </section>

        <footer className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
          <p>Saved {format(new Date(item.savedAt), "MMMM d, yyyy 'at' h:mm a")}</p>
          <p className="truncate">{hostnameOf(item.url)}</p>
        </footer>
      </div>

      {/* Actions menu */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <div className="divide-y overflow-hidden rounded-2xl border bg-elevated">
          <MenuRow icon={Pencil} label="Edit title, note & tags" onClick={() => { setMenuOpen(false); setEditOpen(true); }} />
          <MenuRow icon={RefreshCw} label="Re-run AI" hint="Fresh summary, tags and details" onClick={reprocess} />
          <MenuRow icon={Copy} label="Copy link" onClick={() => { setMenuOpen(false); void copyLink(); }} />
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border bg-elevated">
          <MenuRow icon={Trash2} label="Delete save" danger onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} />
        </div>
      </Sheet>

      {/* Delete confirmation */}
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this save?">
        <p className="text-sm text-muted-foreground">&ldquo;{title}&rdquo; will be removed from CURIO. This can&rsquo;t be undone.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setConfirmDelete(false)} className="h-12 rounded-2xl border bg-elevated font-semibold">Cancel</button>
          <button
            type="button"
            onClick={remove}
            disabled={deleteMutation.isPending}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-destructive font-semibold text-white disabled:opacity-60"
          >
            {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Delete
          </button>
        </div>
      </Sheet>

      <EditSheet
        open={editOpen}
        item={item}
        saving={updateMutation.isPending}
        onClose={() => setEditOpen(false)}
        onSave={edits =>
          updateMutation.mutate(
            { id: item.id, edits },
            {
              onSuccess: updated => { setItem(updated); setEditOpen(false); successToast('Saved'); },
              onError: e => errorToast('Couldn’t save changes', e instanceof Error ? e.message : undefined),
            },
          )
        }
      />
    </article>
  );
}

function StatusBanner({ item, busy, onRetry }: { item: SavedItem; busy: boolean; onRetry: () => void }) {
  if (item.enrichmentStatus === 'enriched' && !busy) return null;
  const failed = item.enrichmentStatus === 'failed';
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl p-3 text-sm', failed ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning')}>
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : failed ? <AlertCircle className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
      <span className="flex-1">
        {busy ? 'Reading it again…' : failed ? 'CURIO couldn’t read this one.' : 'Still being read. CURIO retries automatically.'}
      </span>
      {!busy && (
        <button type="button" onClick={onRetry} className="rounded-full bg-background/40 px-3 py-1 text-xs font-semibold">
          Retry now
        </button>
      )}
    </div>
  );
}

function MenuRow({ icon: Icon, label, hint, danger, onClick }: { icon: typeof Pencil; label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-accent', danger && 'text-destructive')}>
      <Icon className="h-5 w-5 shrink-0" />
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

function EntityDetail({ type, data }: { type: string; data: Record<string, any> }) {
  const known = isCollectionType(type) ? COLLECTIONS[type] : null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);

  return (
    <section className={cn('rounded-[22px] border bg-gradient-to-br p-4', known?.tint ?? 'from-card to-card')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true">{known?.emoji ?? '📦'}</span>
          {data.name || (known ? known.singular : type)}
        </h2>
        {known && (
          <Link to={`/collections/${type}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            {known.title} →
          </Link>
        )}
      </div>

      {type === 'recipe' && (
        <div className="space-y-3 text-[15px]">
          {(data.cuisine || list(data.dietTags).length > 0) && (
            <p className="text-sm text-muted-foreground">{[data.cuisine, ...list(data.dietTags)].filter(Boolean).join(' · ')}</p>
          )}
          {list(data.ingredients).length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold text-muted-foreground">Ingredients</h3>
              <ul className="space-y-1">
                {list(data.ingredients).map((ing, i) => (
                  <li key={i} className="flex gap-2"><span className="text-primary">•</span>{ing}</li>
                ))}
              </ul>
            </div>
          )}
          {list(data.instructions).length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold text-muted-foreground">Steps</h3>
              <ol className="space-y-2">
                {list(data.instructions).map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/60 text-xs font-bold">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {type === 'place' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{data.address || 'Address not found in the post'}</p>
          <a href={mapsUrl(data)} target="_blank" rel="noopener noreferrer" className="pressable flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-semibold text-background">
            <MapPin className="h-3.5 w-3.5" /> Open in Maps
          </a>
        </div>
      )}

      {type === 'event' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {[formatMaybeDate(data.startAt), data.location].filter(Boolean).join(' · ') || 'Date not found in the post'}
          </p>
          <a href={calendarUrl(data)} target="_blank" rel="noopener noreferrer" className="pressable flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-semibold text-background">
            <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
          </a>
        </div>
      )}

      {type === 'product' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{[data.brand, data.price ? `${data.currency ?? ''}${data.price}`.trim() : null].filter(Boolean).join(' · ')}</p>
          {data.url && (
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="pressable flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-semibold text-background">
              View product <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      {type === 'workout' && (
        <p className="text-sm text-muted-foreground">
          {[data.type, data.duration, list(data.equipment).length ? `Equipment: ${list(data.equipment).join(', ')}` : null].filter(Boolean).join(' · ')}
        </p>
      )}

      {!known && (
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          {Object.entries(data).filter(([k, v]) => k !== 'name' && v != null && v !== '').map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="capitalize text-muted-foreground">{k}</dt>
              <dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function formatMaybeDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : format(d, 'EEE, MMM d · h:mm a');
}

function EditSheet({
  open, item, saving, onClose, onSave,
}: {
  open: boolean;
  item: SavedItem;
  saving: boolean;
  onClose: () => void;
  onSave: (edits: { title: string | null; userNote: string | null; tags: string[] }) => void;
}) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(decodeEntities(item.title));
    setNote(decodeEntities(item.userNote));
    setTags((item.tags ?? []).join(', '));
  }, [open, item]);

  const submit = () => {
    const cleanTags = [...new Set(tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))];
    onSave({ title: title.trim() || null, userNote: note.trim() || null, tags: cleanTags });
  };

  const field = 'w-full rounded-2xl border bg-elevated px-3 py-3 text-[16px] placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none';

  return (
    <Sheet open={open} onClose={onClose} title="Edit save">
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">Title</span>
          <input value={title} onChange={e => setTitle(e.target.value)} className={field} placeholder="Title" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">Your note</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} className={cn(field, 'resize-none')} placeholder="Why did you save this?" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">Tags, separated by commas</span>
          <input value={tags} onChange={e => setTags(e.target.value)} className={field} placeholder="recipe, dinner, italian" autoCapitalize="off" />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="pressable flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
      </div>
    </Sheet>
  );
}
