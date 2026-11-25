import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SignIn, useAuth } from '@clerk/react';
import { ToastProvider } from './components/ui/Toast';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { ChatPage } from './pages/ChatPage';
import { ItemPage } from './pages/ItemPage';
import { ShareTargetPage } from './pages/ShareTargetPage';
import { SettingsPage } from './pages/SettingsPage';
import { CollectionPage, CollectionsPage } from './pages/CollectionsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { setAuthTokenGetter } from './services/api';
import { hasOnboarded } from './utils/install';

export function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <img src="/icons/icon-192x192.png" alt="" className="h-16 w-16 animate-pulse rounded-[20px]" />
      </div>
    );
  }

  return (
    <ToastProvider>
      {!isSignedIn ? <SignInScreen /> : <SignedInRoutes />}
    </ToastProvider>
  );
}

function SignedInRoutes() {
  const location = useLocation();
  // First launch: show the setup flow once (not when arriving from a share)
  if (!hasOnboarded() && location.pathname === '/') {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="collections/:type" element={<CollectionPage />} />
        <Route path="item/:id" element={<ItemPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="welcome" element={<OnboardingPage />} />
      {/* Web Share Target + iOS Shortcut entry point */}
      <Route path="share-target" element={<ShareTargetPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function SignInScreen() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 45% at 15% 0%, hsl(var(--primary) / 0.35), transparent 70%), radial-gradient(50% 40% at 100% 30%, rgba(219, 39, 119, 0.22), transparent 70%)',
        }}
      />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col items-center px-6 pb-10 pt-[max(3rem,env(safe-area-inset-top))]">
        <img src="/icons/icon-192x192.png" alt="" className="h-20 w-20 rounded-[26px] shadow-[0_16px_50px_hsl(var(--primary)/0.45)]" />
        <h1 className="mt-6 font-display text-[56px] italic leading-none">curio</h1>
        <p className="mt-3 max-w-xs text-center text-[17px] text-muted-foreground">
          Save Reels, videos and links. Find them again by meaning.
        </p>
        <div className="mt-8 w-full [&_.cl-card]:shadow-2xl [&_.cl-rootBox]:mx-auto [&_.cl-rootBox]:w-full">
          <SignIn routing="hash" />
        </div>
      </div>
    </div>
  );
}
