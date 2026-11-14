import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle, AlertCircle, Share2, Brain, Zap } from 'lucide-react';
import { addToQueue, parseShareTargetData } from '../services/indexeddb';
import { ingestItem } from '../services/api';
import { initializeSync, triggerManualSync, getSyncStatus } from '../services/sync';
import { getSettings } from '../services/indexeddb';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';
import { useSuccessToast, useErrorToast, useInfoToast } from '../components/ui/Toast';

export function ShareTargetPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();
  const infoToast = useInfoToast();

  const [state, setState] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedItem, setSavedItem] = useState<any>(null);

  // Process share data on mount
  useEffect(() => {
    const processShare = async () => {
      // Get data from URL params (Web Share Target GET fallback)
      const url = searchParams.get('url');
      const title = searchParams.get('title');
      const text = searchParams.get('text');

      if (!url && !title && !text) {
        // No share data - might be direct navigation
        setState('idle');
        return;
      }

      setState('processing');
      setError(null);

      try {
        // Parse share data (handles both GET params and future POST data)
        const shareData = { url, title: title || undefined, text: text || undefined };
        const parsed = parseShareTargetData(shareData);

        if (!parsed.url) {
          throw new Error('No URL provided');
        }

        // Try to save immediately if online
        const settings = await getSettings();
        await initializeSync(settings);

        if (navigator.onLine) {
          const result = await ingestItem({
            url: parsed.url,
            title: parsed.title,
            text: parsed.text,
          });

          if (result.success && result.item) {
            setSavedItem(result.item);
            setState('success');
            successToast('Saved!', `"${result.item.title || 'Item'}" added to MindSpace`);
          } else {
            throw new Error(result.error || 'Save failed');
          }
        } else {
          // Queue for later
          await addToQueue({ url: parsed.url, title: parsed.title, text: parsed.text });
          setState('success');
          infoToast('Queued for sync', 'Saved offline - will sync when online');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save';
        setError(message);
        setState('error');
        errorToast('Save failed', message);
      }
    };

    processShare();
  }, [searchParams, successToast, errorToast, infoToast]);

  // Handle POST data from service worker (via message)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'SHARED_CONTENT' && state === 'idle') {
        const { url, title, text } = event.data.payload;
        // Update URL params to trigger processing
        const params = new URLSearchParams();
        if (url) params.set('url', url);
        if (title) params.set('title', title);
        if (text) params.set('text', text);
        window.history.replaceState({}, '', `/share-target?${params.toString()}`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [state]);

  // If no share data and idle, show instruction page
  if (state === 'idle') {
    return (
      <ShareInstructionsPage />
    );
  }

  // Processing state
  if (state === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 pb-8 px-6 text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <h2 className="text-xl font-bold mb-2">Saving to MindSpace...</h2>
            <p className="text-muted-foreground">Processing your share</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 pb-8 px-6 text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">Saved to MindSpace!</h2>
            <p className="text-muted-foreground mb-6">Your content is now organized and searchable</p>

            {savedItem && (
              <div className="mb-6 p-4 rounded-lg bg-muted/50 text-left">
                <p className="font-medium truncate">{savedItem.title || 'Untitled'}</p>
                <p className="text-sm text-muted-foreground mt-1">{savedItem.platform}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {savedItem.tags?.slice(0, 4).map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => navigate('/')}>
                <Brain className="h-4 w-4 mr-2" />
                View in MindSpace
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => window.close()}>
                <XCircle className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Tip: Share from any app (Instagram, TikTok, Safari, etc.) to save instantly
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 pb-8 px-6 text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">Couldn't save</h2>
            <p className="text-muted-foreground mb-6">{error || 'An unknown error occurred'}</p>

            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => window.location.reload()}>
                <Loader2 className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => navigate('/')}>
                <XCircle className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}

/* ============================================
   Instructions Page (when opened directly)
   ============================================ */

function ShareInstructionsPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mx-auto mb-8 w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
          <Brain className="h-10 w-10 text-primary-foreground" />
        </div>

        <h1 className="text-3xl font-bold mb-2">MindSpace Share Target</h1>
        <p className="text-muted-foreground mb-8">
          This page receives content from the system share sheet.
          You don't need to open this directly.
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How to use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-left">
            <Step number={1} icon={<Share2 className="h-5 w-5" />}>
              <strong>Open any app</strong> (Instagram, TikTok, X, Safari, etc.)
            </Step>
            <Step number={2} icon={<Zap className="h-5 w-5" />}>
              <strong>Tap Share</strong> on a post, reel, link, or selected text
            </Step>
            <Step number={3} icon={<Brain className="h-5 w-5" />}>
              <strong>Select "MindSpace"</strong> from the share sheet
            </Step>
            <Step number={4} icon={<CheckCircle className="h-5 w-5" />}>
              <strong>Done!</strong> Content is saved, tagged, and searchable
            </Step>
          </CardContent>
        </Card>

        <div className="mt-8 p-4 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">
            <strong>First time?</strong> Open MindSpace in Safari, tap Share → "Add to Home Screen".
            Then it'll appear in your share sheet automatically.
          </p>
        </div>

        <Button className="mt-6 w-full" onClick={() => window.location.href = '/'}>
          <Brain className="h-4 w-4 mr-2" />
          Open MindSpace
        </Button>
      </div>
    </div>
  );
}

function Step({ number, icon, children }: { number: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
        {number}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="font-medium">{children}</span>
        </div>
      </div>
    </div>
  );
}