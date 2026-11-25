import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserButton, useUser } from '@clerk/react';
import { Home, Layers, MessageCircle, Plus, Search, Settings2 } from 'lucide-react';
import { cn } from '../utils/cn';
import { useKeyboardShortcuts, useSettings } from '../hooks/useSettings';
import { findUrl } from '../services/save';
import { SaveSheet } from './SaveSheet';

const SaveSheetContext = createContext<(url?: string) => void>(() => {});

/** Opens the global "Save a link" sheet from anywhere in the app. */
export function useOpenSaveSheet() {
  return useContext(SaveSheetContext);
}

const NAV = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/search', label: 'Search', icon: Search },
  { path: '/collections', label: 'Collections', icon: Layers },
  { path: '/chat', label: 'Ask', icon: MessageCircle },
] as const;

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * App shell. Phones: glass top bar + floating tab bar with a center Save button.
 * Laptops (lg+): a fixed left sidebar and a wide content area.
 */
export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { syncStatus } = useSettings();
  const { user } = useUser();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveUrl, setSaveUrl] = useState('');

  const openSave = useCallback((url = '') => {
    setSaveUrl(url);
    setSaveOpen(true);
  }, []);

  useKeyboardShortcuts({
    search: () => navigate('/search'),
    chat: () => navigate('/chat'),
    escape: () => setSaveOpen(false),
  });

  // Desktop nicety: paste a link anywhere (outside a text field) to save it
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]') || saveOpen) return;
      const url = findUrl(e.clipboardData?.getData('text') ?? '');
      if (url) {
        e.preventDefault();
        openSave(url);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [openSave, saveOpen]);

  // Item pages have a full-bleed hero with their own floating controls on phones
  const immersive = location.pathname.startsWith('/item/');
  const isChat = location.pathname.startsWith('/chat');
  const pending = syncStatus.isSyncing || syncStatus.queuedCount > 0;

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const syncBadge = pending && (
    <span
      className="flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
      title={syncStatus.queuedCount > 0 ? `${syncStatus.queuedCount} waiting to sync` : 'Syncing'}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
      {syncStatus.queuedCount > 0 ? `${syncStatus.queuedCount} queued` : 'Syncing'}
    </span>
  );

  return (
    <SaveSheetContext.Provider value={openSave}>
      <div className="min-h-[100dvh] bg-background">
        {/* ---------- Desktop sidebar ---------- */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card/40 px-4 py-6 lg:flex">
          <Link to="/" className="flex items-center gap-2.5 px-2" aria-label="CURIO home">
            <img src="/icons/icon-72x72.png" alt="" className="h-8 w-8 rounded-[10px]" />
            <span className="font-display text-[30px] italic leading-none tracking-tight">curio</span>
          </Link>

          <button
            type="button"
            onClick={() => openSave()}
            className="pressable mt-7 flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-[0_6px_20px_hsl(var(--primary)/0.35)]"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} /> Save a link
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            or paste anywhere with <kbd className="rounded bg-elevated px-1 py-0.5 font-sans">{isMac ? '⌘' : 'Ctrl'} V</kbd>
          </p>

          <nav aria-label="Main" className="mt-7 space-y-1">
            {NAV.map(item => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors',
                    active ? 'bg-elevated text-foreground' : 'text-muted-foreground hover:bg-elevated/60 hover:text-foreground',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.3 : 1.8} />
                  {item.label}
                  {item.path === '/search' && (
                    <kbd className="ml-auto rounded bg-background px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex-1" />

          <div className="space-y-2">
            {syncBadge && <div className="px-2">{syncBadge}</div>}
            <NavLink
              to="/settings"
              className={({ isActive: active }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors',
                  active ? 'bg-elevated text-foreground' : 'text-muted-foreground hover:bg-elevated/60 hover:text-foreground',
                )
              }
            >
              <Settings2 className="h-5 w-5" /> Settings
            </NavLink>
            <div className="flex items-center gap-3 rounded-xl px-3 py-2">
              <UserButton />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user?.firstName || user?.username || 'Account'}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* ---------- Content ---------- */}
        <div className="relative mx-auto min-h-[100dvh] max-w-xl lg:ml-64 lg:max-w-none">
          {/* Phone top bar */}
          {!immersive && (
            <header className="glass sticky top-0 z-40 pt-safe lg:hidden">
              <div className="flex h-14 items-center gap-2 px-4">
                <Link to="/" className="flex items-center gap-2" aria-label="CURIO home">
                  <img src="/icons/icon-72x72.png" alt="" className="h-7 w-7 rounded-[9px]" />
                  <span className="font-display text-[26px] italic leading-none tracking-tight">curio</span>
                </Link>
                {syncBadge && <span className="ml-1">{syncBadge}</span>}
                <div className="flex-1" />
                <NavLink
                  to="/settings"
                  className={({ isActive: active }) =>
                    cn('rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground', active && 'text-foreground')
                  }
                  aria-label="Settings"
                >
                  <Settings2 className="h-5 w-5" />
                </NavLink>
                <div className="flex h-8 w-8 items-center justify-center">
                  <UserButton />
                </div>
              </div>
            </header>
          )}

          <main
            className={cn(
              isChat ? '' : 'pb-32 lg:pb-12',
              !immersive && !isChat && 'px-4 pt-2 lg:mx-auto lg:max-w-6xl lg:px-10 lg:pt-10',
              immersive && 'lg:mx-auto lg:max-w-6xl lg:px-10 lg:pt-10',
            )}
          >
            <Outlet />
          </main>
        </div>

        {/* ---------- Phone tab bar ---------- */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
        >
          <div className="glass flex items-center justify-between rounded-[26px] border border-white/10 px-2 py-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
            {[NAV[0], NAV[1], null, NAV[2], NAV[3]].map(item => {
              if (!item) {
                return (
                  <button
                    key="save"
                    type="button"
                    onClick={() => openSave()}
                    className="pressable -my-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-primary text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/0.45)]"
                    aria-label="Save a link"
                  >
                    <Plus className="h-7 w-7" strokeWidth={2.5} />
                  </button>
                );
              }
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-medium transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        </nav>

        <SaveSheet open={saveOpen} onClose={() => setSaveOpen(false)} initialUrl={saveUrl} />
      </div>
    </SaveSheetContext.Provider>
  );
}
