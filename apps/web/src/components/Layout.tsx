import { createContext, useCallback, useContext, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserButton } from '@clerk/react';
import { Home, Layers, MessageCircle, Plus, Search, Settings2 } from 'lucide-react';
import { cn } from '../utils/cn';
import { useKeyboardShortcuts, useSettings } from '../hooks/useSettings';
import { SaveSheet } from './SaveSheet';

const SaveSheetContext = createContext<(url?: string) => void>(() => {});

/** Opens the global "Save a link" sheet from anywhere in the app. */
export function useOpenSaveSheet() {
  return useContext(SaveSheetContext);
}

const TABS = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/search', label: 'Search', icon: Search },
  { path: '#save', label: 'Save', icon: Plus },
  { path: '/collections', label: 'Collections', icon: Layers },
  { path: '/chat', label: 'Ask', icon: MessageCircle },
] as const;

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { syncStatus } = useSettings();
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

  // Item pages have a full-bleed hero with their own floating controls
  const immersive = location.pathname.startsWith('/item/');
  const isChat = location.pathname.startsWith('/chat');
  const pending = syncStatus.isSyncing || syncStatus.queuedCount > 0;

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <SaveSheetContext.Provider value={openSave}>
      <div className="min-h-[100dvh] bg-background">
        <div className="relative mx-auto min-h-[100dvh] max-w-xl sm:border-x sm:border-border/60">
          {!immersive && (
            <header className="glass sticky top-0 z-40 pt-safe">
              <div className="flex h-14 items-center gap-2 px-4">
                <Link to="/" className="flex items-center gap-2" aria-label="CURIO home">
                  <img src="/icons/icon-72x72.png" alt="" className="h-7 w-7 rounded-[9px]" />
                  <span className="font-display text-[26px] italic leading-none tracking-tight">curio</span>
                </Link>
                {pending && (
                  <span
                    className="ml-1 flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
                    title={syncStatus.queuedCount > 0 ? `${syncStatus.queuedCount} waiting to sync` : 'Syncing'}
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    {syncStatus.queuedCount > 0 ? `${syncStatus.queuedCount} queued` : 'Syncing'}
                  </span>
                )}
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

          <main className={cn(isChat ? '' : 'pb-32', !immersive && !isChat && 'px-4 pt-2')}>
            <Outlet />
          </main>

          {/* Floating tab bar */}
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="glass flex items-center justify-between rounded-[26px] border border-white/10 px-2 py-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
              {TABS.map(tab => {
                const Icon = tab.icon;
                if (tab.path === '#save') {
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
                const active = isActive(tab.path);
                return (
                  <NavLink
                    key={tab.path}
                    to={tab.path}
                    className={cn(
                      'flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-medium transition-colors',
                      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                    {tab.label}
                  </NavLink>
                );
              })}
            </div>
          </nav>
        </div>

        <SaveSheet open={saveOpen} onClose={() => setSaveOpen(false)} initialUrl={saveUrl} />
      </div>
    </SaveSheetContext.Provider>
  );
}
