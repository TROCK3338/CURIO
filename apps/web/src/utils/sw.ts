/**
 * Service Worker Registration & Update Handling
 */

export async function registerSW(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // Check for updates periodically
    setInterval(() => {
      registration.update().catch(console.error);
    }, 1000 * 60 * 60); // Every hour

    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available - notify user
          dispatchUpdateEvent();
        }
      });
    });

    console.log('[SW] Registered:', registration.scope);
  } catch (error) {
    console.error('[SW] Registration failed:', error);
  }
}

function dispatchUpdateEvent(): void {
  window.dispatchEvent(new CustomEvent('sw-update', { detail: { available: true } }));
}

export function onSWUpdate(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener('sw-update', handler);
  return () => window.removeEventListener('sw-update', handler);
}

export async function skipWaiting(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}

/* Background Sync Registration */
export async function registerBackgroundSync(tag: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('sync' in window.ServiceWorkerRegistration.prototype)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await (registration as any).sync.register(tag);
    console.log('[SW] Background sync registered:', tag);
  } catch (error) {
    console.error('[SW] Background sync registration failed:', error);
  }
}

/* Share Target Handling */
export function handleShareTarget(): void {
  // This is handled by the ShareTarget page component
  // The service worker receives the POST and forwards to the page
  console.log('[SW] Share target ready');
}