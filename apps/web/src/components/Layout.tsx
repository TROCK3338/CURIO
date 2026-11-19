import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { UserButton } from '@clerk/react';
import { cn } from '../utils/cn';
import { Button } from './ui/Button';
import { Search, Menu, Settings, MessageSquare, Home } from 'lucide-react';
import { useSettings, useKeyboardShortcuts } from '../hooks/useSettings';
import { useInfoToast } from './ui/Toast';

export function Layout() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const { syncStatus } = useSettings();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    search: () => setCommandPaletteOpen(true),
    chat: () => navigate('/chat'),
    escape: () => { setCommandPaletteOpen(false); setSidebarOpen(false); },
  });

  const navigate = (path: string) => {
    routerNavigate(path);
    setSidebarOpen(false);
  };

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/search', label: 'Search', icon: Search },
    { path: '/chat', label: 'Chat', icon: MessageSquare },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-64 border-r bg-card',
          'transform transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Navigation"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center gap-3 border-b px-4">
            <img
              src="/icons/icon-72x72.png"
              alt="CURIO logo"
              className="h-8 w-8 rounded-lg object-cover"
            />
            <span className="font-semibold text-lg">CURIO</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-3" aria-label="Main navigation">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {/* Sync Status & Account */}
          <div className="border-t p-3 space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Sync</span>
              <span className={cn(
                'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium',
                syncStatus.isSyncing ? 'bg-primary/10 text-primary' : 'bg-green-500/10 text-green-500'
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', syncStatus.isSyncing ? 'bg-primary animate-pulse' : 'bg-green-500')} />
                {syncStatus.isSyncing ? 'Syncing' : 'Synced'}
              </span>
            </div>
            {syncStatus.queuedCount > 0 && (
              <p className="text-xs text-muted-foreground">{syncStatus.queuedCount} queued</p>
            )}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">Account</span>
              <UserButton />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64 min-h-screen">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden px-4">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </Button>
          <div className="flex-1 font-semibold">CURIO</div>
          <Button variant="ghost" size="icon" onClick={() => setCommandPaletteOpen(true)} aria-label="Search">
            <Search className="h-5 w-5" />
          </Button>
          <UserButton />
        </header>

        <div className="p-4 lg:p-6 pt-safe pb-safe">
          <Outlet />
        </div>
      </main>

      {/* Command Palette */}
      {commandPaletteOpen && (
        <CommandPalette onClose={() => setCommandPaletteOpen(false)} />
      )}
    </div>
  );
}

/* Command Palette Component */
function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const infoToast = useInfoToast();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const actions = [
    { label: 'Search', path: '/search', shortcut: '⌘K' },
    { label: 'Chat with saves', path: '/chat', shortcut: '⌘N' },
    { label: 'Settings', path: '/settings', shortcut: '⌘,' },
    { label: 'New save (share sheet)', path: '#share', shortcut: 'Share from any app' },
  ];

  const filtered = actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()));

  const handleAction = (path: string) => {
    if (path === '#share') {
      infoToast('Use the share sheet from any app (Instagram, TikTok, Safari, etc.)');
    } else {
      navigate(path);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md rounded-xl border bg-card shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="relative p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type a command or search..."
              className="w-full h-10 pl-10 pr-4 rounded-lg border bg-background text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs text-muted-foreground bg-muted rounded">Esc</kbd>
          </div>
        </div>
        <div className="max-h-60 overflow-auto">
          {filtered.map(action => (
            <button
              key={action.label}
              onClick={() => handleAction(action.path)}
              className="w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
            >
              <span>{action.label}</span>
              <span className="text-xs text-muted-foreground">{action.shortcut}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">No commands found</div>
          )}
        </div>
      </div>
    </div>
  );
}
