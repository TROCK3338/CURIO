import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Loader2, MessageCircle, Search, Share, Sparkles, PlusSquare, Layers } from 'lucide-react';
import { canPromptInstall, deviceKind, isInstalled, markOnboarded, onInstallAvailabilityChange, promptInstall } from '../utils/install';
import { saveLink } from '../services/save';
import { QuickSaveSetup } from '../components/QuickSaveSetup';
import { displayTitle } from '../utils/text';
import { cn } from '../utils/cn';

const STEPS = ['welcome', 'install', 'share', 'first'] as const;
type Step = typeof STEPS[number];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('step') as Step | null;
  const [step, setStep] = useState<Step>(requested && STEPS.includes(requested) ? requested : 'welcome');
  const index = STEPS.indexOf(step);

  // Seen once is enough: never bounce people back here on later visits to "/"
  useEffect(() => { markOnboarded(); }, []);

  const go = (next: Step) => {
    setStep(next);
    setParams(next === 'welcome' ? {} : { step: next }, { replace: true });
    window.scrollTo(0, 0);
  };
  const next = () => (index < STEPS.length - 1 ? go(STEPS[index + 1]) : finish());
  const finish = () => {
    markOnboarded();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-primary' : i < index ? 'w-1.5 bg-primary/60' : 'w-1.5 bg-muted')} />
            ))}
          </div>
          <button type="button" onClick={finish} className="text-sm font-medium text-muted-foreground hover:text-foreground">Skip</button>
        </div>

        <div className="flex flex-1 flex-col py-8 animate-in" key={step}>
          {step === 'welcome' && <Welcome />}
          {step === 'install' && <Install />}
          {step === 'share' && <ShareSetup />}
          {step === 'first' && <FirstSave onDone={finish} />}
        </div>

        {step !== 'first' && (
          <button type="button" onClick={next} className="pressable flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-semibold text-primary-foreground">
            {step === 'welcome' ? 'Get started' : 'Continue'} <ArrowRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, text }: { icon: typeof Sparkles; title: string; text: string }) {
  return (
    <div className="flex gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Icon className="h-5 w-5" /></span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <>
      <img src="/icons/icon-192x192.png" alt="" className="h-20 w-20 rounded-[26px] shadow-[0_12px_40px_hsl(var(--primary)/0.35)]" />
      <h1 className="mt-8 font-display text-[52px] italic leading-[0.95]">Save it now.<br />Find it later.</h1>
      <p className="mt-4 text-[17px] text-muted-foreground">
        CURIO keeps the Reels, videos and links you save, then makes them make sense.
      </p>
      <div className="mt-10 space-y-6">
        <Feature icon={Share} title="Save from any app" text="Share from Instagram, YouTube, X or Safari straight into CURIO." />
        <Feature icon={Sparkles} title="Read for you" text="Every save gets a summary, tags and the useful bits pulled out." />
        <Feature icon={Search} title="Find by meaning" text="Search “that cozy pasta video” — no exact words needed." />
        <Feature icon={Layers} title="Sorted automatically" text="Recipes, places, wishlist, events and workouts fill themselves in." />
        <Feature icon={MessageCircle} title="Ask your library" text="Chat with your saves and get answers with sources." />
      </div>
    </>
  );
}

function StepHeader({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
  return (
    <>
      <span className="text-5xl" aria-hidden="true">{emoji}</span>
      <h1 className="mt-6 text-[32px] font-bold leading-tight tracking-tight">{title}</h1>
      <p className="mt-3 text-[16px] text-muted-foreground">{children}</p>
    </>
  );
}

function Numbered({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="mt-8 space-y-4">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-sm font-bold">{i + 1}</span>
          <span className="pt-1 text-[15.5px] leading-relaxed">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Install() {
  const kind = deviceKind();
  const [installed, setInstalled] = useState(isInstalled());
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  useEffect(() => onInstallAvailabilityChange(() => { setCanPrompt(canPromptInstall()); setInstalled(isInstalled()); }), []);

  if (installed) {
    return (
      <StepHeader emoji="✅" title="You're all set">
        CURIO is installed and opens full-screen from your home screen, like any other app.
      </StepHeader>
    );
  }

  return (
    <>
      <StepHeader emoji="📲" title="Put CURIO on your home screen">
        It installs in seconds, works offline and shows up in your share sheet.
      </StepHeader>
      {canPrompt && (
        <button
          type="button"
          onClick={async () => setInstalled(await promptInstall())}
          className="pressable mt-8 flex h-12 items-center justify-center gap-2 rounded-2xl bg-foreground font-semibold text-background"
        >
          <PlusSquare className="h-5 w-5" /> Install CURIO
        </button>
      )}
      {kind === 'ios' && (
        <Numbered steps={[
          <>Open this page in <b>Safari</b>.</>,
          <>Tap the <b>Share</b> button <Share className="inline h-4 w-4 align-text-bottom" /> at the bottom.</>,
          <>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</>,
        ]} />
      )}
      {kind === 'android' && !canPrompt && (
        <Numbered steps={[
          <>Open the <b>⋮</b> menu in Chrome.</>,
          <>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</>,
        ]} />
      )}
      {kind === 'desktop' && !canPrompt && (
        <Numbered steps={[
          <>In Chrome or Edge, click the <b>install icon</b> at the right end of the address bar.</>,
          <>Or open the browser menu and choose <b>Install CURIO</b>.</>,
        ]} />
      )}
    </>
  );
}

function ShareSetup() {
  const kind = deviceKind();

  if (kind !== 'ios') {
    return (
      <>
        <StepHeader emoji="📤" title="Share into CURIO">
          Once installed, CURIO shows up in your share sheet.
        </StepHeader>
        <Numbered steps={[
          <>In Instagram, YouTube, X or Chrome, tap <b>Share</b>.</>,
          <>Pick <b>CURIO</b> from the list (you may need to tap <b>More</b> the first time).</>,
          <>That&rsquo;s it. CURIO saves it and reads it in the background.</>,
        ]} />
        <p className="mt-8 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
          On a computer? Copy any link and press the <b className="text-foreground">+</b> button in CURIO to paste it.
        </p>
      </>
    );
  }

  return (
    <>
      <StepHeader emoji="⚡️" title="Save from any app">
        Share a Reel to CURIO and stay where you are.
      </StepHeader>
      <div className="mt-8">
        <QuickSaveSetup compact />
      </div>
    </>
  );
}

function FirstSave({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setState('saving');
    try {
      const result = await saveLink(url);
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      setMessage(result.status === 'queued' ? 'Saved offline. It will sync when you reconnect.' : `“${displayTitle(result.item)}” is in your library.`);
      setState('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Couldn’t save that link');
      setState('error');
    }
  };

  return (
    <>
      <StepHeader emoji="🔖" title="Try your first save">
        Paste any link: a Reel, a YouTube video, a recipe, an article.
      </StepHeader>
      {state === 'done' ? (
        <div className="mt-8 rounded-2xl border bg-card p-5 animate-in">
          <p className="flex items-center gap-2 font-semibold text-success"><Check className="h-5 w-5" /> Saved</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-3">
          <input
            type="url"
            inputMode="url"
            autoCapitalize="off"
            value={url}
            onChange={e => { setUrl(e.target.value); setState('idle'); }}
            placeholder="https://"
            className="h-14 w-full rounded-2xl border bg-card px-4 text-[16px] focus:border-primary/60 focus:outline-none"
            aria-label="Link to save"
          />
          {state === 'error' && <p className="text-sm text-destructive">{message}</p>}
          <button type="submit" disabled={!url.trim() || state === 'saving'} className="pressable flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground font-semibold text-background disabled:opacity-40">
            {state === 'saving' ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading it…</> : 'Save'}
          </button>
        </form>
      )}
      <div className="flex-1" />
      <button type="button" onClick={onDone} className="pressable mt-10 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-semibold text-primary-foreground">
        {state === 'done' ? 'Open my library' : 'Go to my library'} <ArrowRight className="h-5 w-5" />
      </button>
    </>
  );
}
