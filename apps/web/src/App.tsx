import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignIn, useAuth } from '@clerk/react';
import { ToastProvider } from './components/ui/Toast';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { ChatPage } from './pages/ChatPage';
import { ItemPage } from './pages/ItemPage';
import { ShareTargetPage } from './pages/ShareTargetPage';
import { SettingsPage } from './pages/SettingsPage';
import { setAuthTokenGetter } from './services/api';

export function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <ToastProvider>
      {!isSignedIn ? (
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
      ) : (
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
      )}
    </ToastProvider>
  );
}
