import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Download,
  HardDrive,
  Zap,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Share2,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { downloadExport, TRASH_RETENTION_DAYS } from '../services/api';
import { addToQueue, clearAllItems } from '../services/indexeddb';
import { triggerManualSync } from '../services/sync';
import { findUrl } from '../services/save';
import { Sheet } from '../components/Sheet';
import { QuickSaveSetup } from '../components/QuickSaveSetup';
import { Switch } from '../components/ui/Switch';
import { useErrorToast, useInfoToast, useSuccessToast } from '../components/ui/Toast';
import { cn } from '../utils/cn';

function Group({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="space-y-2">
      {title && <h2 className="section-label px-1">{title}</h2>}
      <div className="divide-y overflow-hidden rounded-[22px] border bg-card">{children}</div>
      {footer && <p className="px-1 text-xs text-muted-foreground">{footer}</p>}
    </section>
  );
}

function Row({
  icon: Icon, label, hint, right, onClick, to, danger, disabled,
}: {
  icon: LucideIcon; label: string; hint?: string; right?: ReactNode; onClick?: () => void; to?: string; danger?: boolean; disabled?: boolean;
}) {
  const body = (
    <>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-elevated', danger && 'text-destructive')}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block font-medium', danger && 'text-destructive')}>{label}</span>
        {hint && <span className="block text-[13px] text-muted-foreground">{hint}</span>}
      </span>
      {right ?? ((onClick || to) && <ChevronRight className="h-4 w-4 text-muted-foreground/60" />)}
    </>
  );
  const cls = cn('flex w-full items-center gap-3 px-4 py-3 text-left', (onClick || to) && 'hover:bg-accent/50', disabled && 'pointer-events-none opacity-50');
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls} disabled={disabled}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

const THEMES = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'Auto', icon: Monitor },
] as const;

export function SettingsPage() {
  const { settings, updateSettings, syncStatus } = useSettings();
  const { user } = useUser();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();
  const infoToast = useInfoToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [quickSaveOpen, setQuickSaveOpen] = useState(false);

  const installed =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  const exportAll = async () => {
    setExporting(true);
    try {
      await downloadExport();
      successToast('Export downloaded');
    } catch (e) {
      errorToast('Export failed', e instanceof Error ? e.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await triggerManualSync();
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      successToast('Up to date');
    } finally {
      setSyncing(false);
    }
  };

  /** Accepts a CURIO JSON export or any text file of links; each link is queued and saved properly. */
  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      let urls: string[] = [];
      try {
        const data = JSON.parse(text);
        const list = Array.isArray(data) ? data : data?.items;
        if (Array.isArray(list)) urls = list.map((i: { url?: unknown }) => (typeof i?.url === 'string' ? i.url : '')).filter(Boolean);
      } catch {
        urls = text.split(/\s+/).map(findUrl).filter((u): u is string => !!u);
      }
      urls = [...new Set(urls)];
      if (urls.length === 0) throw new Error('No links found in that file');
      for (const url of urls) await addToQueue({ url });
      window.dispatchEvent(new Event('queue-updated'));
      infoToast(`Importing ${urls.length} links`, 'They’ll appear as CURIO reads each one');
      void triggerManualSync().then(() => queryClient.invalidateQueries({ queryKey: ['items'] }));
    } catch (e) {
      errorToast('Import failed', e instanceof Error ? e.message : undefined);
    }
  };

  const clearDevice = async () => {
    await clearAllItems();
    await queryClient.invalidateQueries();
    setConfirmClear(false);
    successToast('Device cache cleared', 'Your saves are still in your account');
  };

  return (
    <div className="space-y-7 pt-2 lg:mx-auto lg:max-w-2xl">
      <h1 className="screen-title lg:text-4xl">Settings</h1>

      <Group>
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated text-lg font-bold uppercase">
            {(user?.firstName || user?.username || '?').charAt(0)}
            {user?.imageUrl && (
              <img
                src={user.imageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{user?.fullName || user?.username || 'Your account'}</p>
            <p className="truncate text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>
        <Row icon={UserRound} label="Manage account" onClick={() => clerk.openUserProfile()} />
      </Group>

      <Group title="Appearance">
        <div className="grid grid-cols-3 gap-2 p-2">
          {THEMES.map(t => {
            const Icon = t.icon;
            const active = settings.theme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => updateSettings({ theme: t.value })}
                className={cn('flex flex-col items-center gap-1.5 rounded-2xl py-3 text-sm font-medium', active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent')}
                aria-pressed={active}
              >
                <Icon className="h-5 w-5" /> {t.label}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Saving" footer="CURIO appears in your share sheet once it's installed on your phone.">
        <Row icon={Zap} label="iPhone quick save" hint="Share to CURIO without leaving the app you’re in" onClick={() => setQuickSaveOpen(true)} />
        <Row icon={Share2} label="Set up sharing from other apps" hint="Instagram, YouTube, Safari, Android share sheet" to="/welcome?step=share" />
        <Row
          icon={Smartphone}
          label={installed ? 'Installed on this device' : 'Install the app'}
          hint={installed ? 'Opens full-screen from your home screen' : 'Add CURIO to your home screen'}
          to={installed ? undefined : '/welcome?step=install'}
        />
      </Group>

      <Group title="Offline & sync" footer="Links you save offline are kept on this device and uploaded automatically when you reconnect.">
        <Row
          icon={RefreshCw}
          label="Upload offline saves automatically"
          right={<Switch checked={settings.syncEnabled} onCheckedChange={v => updateSettings({ syncEnabled: v })} />}
        />
        <Row
          icon={syncing ? Loader2 : RefreshCw}
          label="Sync now"
          hint={syncStatus.queuedCount > 0 ? `${syncStatus.queuedCount} waiting to upload` : 'Everything is uploaded'}
          onClick={syncNow}
          disabled={syncing}
        />
      </Group>

      <Group title="Your data">
        <Row icon={exporting ? Loader2 : Download} label="Export all saves" hint="JSON file with every link, note, summary and tag" onClick={exportAll} disabled={exporting} />
        <Row icon={Upload} label="Import links" hint="A CURIO export or any text file with links" onClick={() => fileRef.current?.click()} />
        <Row icon={Trash2} label="Recently deleted" hint={`Restore deleted saves for ${TRASH_RETENTION_DAYS} days`} to="/settings/deleted" />
        <Row icon={HardDrive} label="Clear this device’s cache" hint="Doesn’t delete anything from your account" onClick={() => setConfirmClear(true)} />
      </Group>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.txt,.csv,application/json,text/plain"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }}
      />

      <Group>
        <Row icon={LogOut} label="Sign out" danger onClick={() => clerk.signOut({ redirectUrl: '/' })} />
      </Group>

      <p className="pb-4 text-center text-xs text-muted-foreground">
        <span className="font-display text-base italic text-foreground">curio</span> · your saves, made findable
      </p>

      <Sheet open={quickSaveOpen} onClose={() => setQuickSaveOpen(false)} title="iPhone quick save">
        <QuickSaveSetup />
      </Sheet>

      <Sheet open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear device cache?">
        <p className="text-sm text-muted-foreground">
          Removes the copy of your saves stored on this device for offline use. Everything stays in your CURIO account and downloads again next time you open the app.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setConfirmClear(false)} className="h-12 rounded-2xl border bg-elevated font-semibold">Cancel</button>
          <button type="button" onClick={clearDevice} className="h-12 rounded-2xl bg-foreground font-semibold text-background">Clear</button>
        </div>
      </Sheet>
    </div>
  );
}
