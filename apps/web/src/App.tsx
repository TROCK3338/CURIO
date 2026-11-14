import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/ui/Toast';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { ChatPage } from './pages/ChatPage';
import { ItemPage } from './pages/ItemPage';
import { ShareTargetPage } from './pages/ShareTargetPage';
import { SettingsPage } from './pages/SettingsPage';
import { queryClient } from './main';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="item/:id" element={<ItemPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          {/* Share Target - handled by service worker, but also accessible as page */}
          <Route path="share-target" element={<ShareTargetPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </QueryClientProvider>
  );
}