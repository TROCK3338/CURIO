import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle, AlertCircle, Share2, Brain, Zap } from 'lucide-react';
import { addToQueue, parseShareTargetData, saveItemLocally } from '../services/indexeddb';
import { ingestItem } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';
import { useSuccessToast, useInfoToast } from '../components/ui/Toast';

export function ShareTargetPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const successToast = useSuccessToast();
  const infoToast = useInfoToast();

  const [state, setState] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedItem, setSavedItem] = useState<any>(null);
  const [manualUrl, setManualUrl] = useState('');
  const attemptedShareRef = useRef<string | null>(null);

  const saveSharedContent = async (data: { url?: string | null; title?: string | null; text?: string | null }) => {
    const parsed = parseShareTargetData(data);
    const candidate = parsed.url || findUrl(parsed.text || '');
    parsed.url = candidate;
    if (!parsed.url) throw new Error('No link was received. Use Copy Link in Instagram, then paste the link here.');
    const normalizedUrl = parsed.url.trim();
    let validUrl: URL;
    try { validUrl = new URL(normalizedUrl); } catch { throw new Error('The shared content did not contain a valid link.'); }
    if (validUrl.protocol !== 'https:' && validUrl.protocol !== 'http:') throw new Error('Only web links can be saved.');

    const payload = { url: validUrl.toString(), title: parsed.title || undefined, text: parsed.text || undefined };
    if (!navigator.onLine) {
      await addToQueue(payload);
      window.dispatchEvent(new Event('queue-updated'));
      return { queued: true as const };
    }

    try {
      const result = await ingestItem(payload);
      if (!result.success || !result.item) throw new Error(result.error || 'The server did not confirm the save.');
      await saveItemLocally(result.item);
      return { queued: false as const, item: result.item };
    } catch (error) {
      // Only network failures should be queued. A server/API error must be visible
      // so we don't tell the user their link was saved when it was rejected.
      if (error instanceof TypeError) {
        await addToQueue(payload);
        window.dispatchEvent(new Event('queue-updated'));
        return { queued: true as const };
      }
      throw error;
    }
  };

  const handleManualSave = async () => {
    setState('processing');
    try {
      const outcome = await saveSharedContent({ url: manualUrl });
      if (outcome.queued) {
        setState('success');
        infoToast('Queued for sync', 'Saved offline - will sync when online');
      } else {
        setSavedItem(outcome.item);
        setState('success');
        successToast('Saved!', `"${outcome.item.title || 'Link'}" added to CURIO`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      setError(message);
      setState('error');
    }
  };

  // Process share data on mount
  useEffect(() => {
    const processShare = async () => {
      // Get data from URL params (Web Share Target GET fallback)
      const url = searchParams.get('url');
      const title = searchParams.get('title');
      const text = searchParams.get('text');
      const shareKey = JSON.stringify([url, title, text]);

      if (!url && !title && !text) {
        // No share data - might be direct navigation
        setState('idle');
        return;
      }

      // React Strict Mode may mount effects twice in development. Never ingest
      // the same share payload twice during one page session.
      if (attemptedShareRef.current === shareKey) return;
      attemptedShareRef.current = shareKey;

      setState('processing');
      setError(null);

      try {
        const shareData = { url, title: title || undefined, text: text || undefined };
        const outcome = await saveSharedContent(shareData);
        if (outcome.queued) {
          setState('success');
          infoToast('Queued for sync', 'Saved offline - will sync when online');
        } else {
          setSavedItem(outcome.item);
          setState('success');
          successToast('Saved!', `"${outcome.item.title || 'Link'}" added to CURIO`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save';
        setError(message);
        setState('error');
      }
    };

    processShare();
  }, [searchParams, successToast, infoToast]);

  // Handle POST data from service worker (via message)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'SHARED_CONTENT' && state === 'idle') {
        setState('processing');
        try {
          const outcome = await saveSharedContent(event.data.payload || {});
          if (outcome.queued) {
            setState('success');
            infoToast('Queued for sync', 'Saved offline - will sync when online');
          } else {
            setSavedItem(outcome.item);
            setState('success');
            successToast('Saved!', `"${outcome.item.title || 'Link'}" added to CURIO`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to save';
          setError(message);
          setState('error');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [state, successToast, infoToast]);

  // If no share data and idle, show instruction page
  if (state === 'idle') {
    return (
      <ShareInstructionsPage url={manualUrl} setUrl={setManualUrl} onSave={handleManualSave} />
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
            <h2 className="text-xl font-bold mb-2">Saving to CURIO...</h2>
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
            <h2 className="text-xl font-bold mb-2">Saved to CURIO!</h2>
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
                View in CURIO
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
              <Button className="flex-1" onClick={() => window.location.reload()}>Try Again</Button>
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

function ShareInstructionsPage({ url, setUrl, onSave }: { url: string; setUrl: (url: string) => void; onSave: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mx-auto mb-8 w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
          <Brain className="h-10 w-10 text-primary-foreground" />
        </div>

        <h1 className="text-3xl font-bold mb-2">Save to CURIO</h1>
        <p className="text-muted-foreground mb-8">
          iPhone PWAs cannot currently receive items directly from the system share sheet. Use Instagram’s Copy Link, then paste it into CURIO.
        </p>

        <div className="mb-6 flex gap-2">
          <input
            aria-label="Reel or video link"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="Paste a Reel or video link"
            value={url}
            onChange={event => setUrl(event.target.value)}
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <Button onClick={onSave} disabled={!url.trim()}>Save link</Button>
        </div>

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
              <strong>On iPhone, copy the link</strong> from the share sheet, then open CURIO and paste it
            </Step>
            <Step number={4} icon={<CheckCircle className="h-5 w-5" />}>
              <strong>Done!</strong> Content is saved, tagged, and searchable
            </Step>
          </CardContent>
        </Card>

        <div className="mt-8 p-4 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">
            <strong>Shortcut option:</strong> Create a Shortcut that accepts URLs from the share sheet and opens CURIO’s save-link page with that URL.
          </p>
        </div>

        <Button className="mt-6 w-full" onClick={() => window.location.href = '/'}>
          <Brain className="h-4 w-4 mr-2" />
          Open CURIO
        </Button>
      </div>
    </div>
  );
}

function findUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[),.!?]+$/, '') : null;
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
