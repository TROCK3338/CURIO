import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { SignedIn, SignedOut, SignIn, useAuth } from '@clerk/clerk-react';
import { ToastProvider } from './components/ui/Toast';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { ChatPage } from './pages/ChatPage';
import { ItemPage } from './pages/ItemPage';
import { ShareTargetPage } from './pages/ShareTargetPage';
import { SettingsPage } from './pages/SettingsPage';
import { queryClient } from './main';
import { setAuthTokenGetter } from './services/api';

function AuthBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthBridge />
        <SignedOut>
          <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <img
                src="/icons/icon-192x192.png"
                alt="CURIO logo"
                className="h-16 w-16 rounded-2xl shadow-md"
              />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">CURIO</h1>
                <p className="text-sm text-muted-foreground">
                  Sign in once to save and access your links
                </p>
              </div>
            </div>
            <SignIn routing="hash" />
          </div>
        </SignedOut>
        <SignedIn>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="item/:id" element={<ItemPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            {/* Share Target - handled by service worker, also accessible via iOS Shortcut */}
            <Route path="share-target" element={<ShareTargetPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SignedIn>
      </ToastProvider>
    </QueryClientProvider>
  );
}
