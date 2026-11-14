import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Switch } from '../components/ui/Switch';
import { Label } from '../components/ui/Label';
import { Separator } from '../components/ui/Separator';
import { cn } from '../utils/cn';
import { Brain, Cloud, Moon, Sun, Monitor, Database, Bell, Shield, Trash2, Download, Upload } from 'lucide-react';
import { useSuccessToast, useErrorToast } from '../components/ui/Toast';

export function SettingsPage() {
  const { settings, updateSettings, reset, manualSync, syncStatus, isLoading } = useSettings();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();

  const [activeTab, setActiveTab] = useState<'general' | 'sync' | 'ai' | 'privacy' | 'about'>('general');

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Customize your MindSpace experience</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {[
          { id: 'general', label: 'General', icon: <Monitor className="h-4 w-4" /> },
          { id: 'sync', label: 'Sync', icon: <Cloud className="h-4 w-4" /> },
          { id: 'ai', label: 'AI', icon: <Brain className="h-4 w-4" /> },
          { id: 'privacy', label: 'Privacy', icon: <Shield className="h-4 w-4" /> },
          { id: 'about', label: 'About', icon: <Database className="h-4 w-4" /> },
        ].map(tab => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'ghost'}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      <Card>
        <CardContent className="pt-6">
          {activeTab === 'general' && <GeneralSettings settings={settings} updateSettings={updateSettings} />}
          {activeTab === 'sync' && <SyncSettings settings={settings} updateSettings={updateSettings} syncStatus={syncStatus} manualSync={manualSync} />}
          {activeTab === 'ai' && <AISettings settings={settings} updateSettings={updateSettings} />}
          {activeTab === 'privacy' && <PrivacySettings settings={settings} updateSettings={updateSettings} />}
          {activeTab === 'about' && <AboutSettings reset={reset} />}
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================
   General Settings
   ============================================ */

function GeneralSettings({ settings, updateSettings }: { settings: any; updateSettings: any }) {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h3 className="font-medium">Appearance</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {['light', 'dark', 'system'].map(theme => (
            <label
              key={theme}
              className={cn(
                'relative cursor-pointer',
                settings.theme === theme ? 'ring-2 ring-primary' : ''
              )}
            >
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={settings.theme === theme}
                onChange={e => updateSettings({ theme: e.target.value as any })}
                className="sr-only"
              />
              <div className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-center">
                <ThemeIcon theme={theme} className="mx-auto mb-2 h-8 w-8" />
                <p className="capitalize font-medium">{theme}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="font-medium">Default View</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {['timeline', 'grid', 'map', 'clusters'].map(view => (
            <label
              key={view}
              className={cn(
                'relative cursor-pointer',
                settings.defaultView === view ? 'ring-2 ring-primary' : ''
              )}
            >
              <input
                type="radio"
                name="defaultView"
                value={view}
                checked={settings.defaultView === view}
                onChange={e => updateSettings({ defaultView: e.target.value as any })}
                className="sr-only"
              />
              <div className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-center">
                <ViewIcon view={view} className="mx-auto mb-2 h-8 w-8" />
                <p className="capitalize font-medium">{view}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="font-medium">Display</h3>
        <div className="space-y-4">
          <SettingRow
            label="Items per page"
            description="Number of items to show per page"
          >
            <select
              value={settings.itemsPerPage}
              onChange={e => updateSettings({ itemsPerPage: Number(e.target.value) })}
              className="w-32 rounded-md border bg-background px-2 py-1 text-sm focus:ring-2 focus:ring-primary"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </SettingRow>
        </div>
      </section>
    </div>
  );
}

function ThemeIcon({ theme, className }: { theme: string; className?: string }) {
  switch (theme) {
    case 'light': return <Sun className={className} />;
    case 'dark': return <Moon className={className} />;
    case 'system': return <Monitor className={className} />;
  }
}

function ViewIcon({ view, className }: { view: string; className?: string }) {
  switch (view) {
    case 'timeline': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
    case 'grid': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
    case 'map': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></svg>;
    case 'clusters': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>;
  }
}

/* ============================================
   Sync Settings
   ============================================ */

function SyncSettings({ settings, updateSettings, syncStatus, manualSync }: any) {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h3 className="font-medium">Sync Status</h3>
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <span>Status</span>
            <span className={cn(
              'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-sm font-medium',
              syncStatus.isSyncing ? 'bg-primary/10 text-primary' : 'bg-green-500/10 text-green-500'
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', syncStatus.isSyncing ? 'bg-primary animate-pulse' : 'bg-green-500')} />
              {syncStatus.isSyncing ? 'Syncing...' : 'Synced'}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            {syncStatus.queuedCount > 0 ? `${syncStatus.queuedCount} items queued` : 'All caught up'}
          </div>
        </div>

        <Button
          onClick={manualSync}
          disabled={syncStatus.isSyncing || !syncStatus.isOnline}
          className="w-full"
        >
          {syncStatus.isSyncing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <Cloud className="h-4 w-4 mr-2" />
              Sync Now
            </>
          )}
        </Button>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="font-medium">Sync Preferences</h3>

        <SettingRow
          label="Auto-sync"
          description="Automatically sync in the background"
        >
          <Switch
            checked={settings.syncEnabled}
            onCheckedChange={checked => updateSettings({ syncEnabled: checked })}
          />
        </SettingRow>

        <SettingRow
          label="Wi-Fi only"
          description="Only sync when connected to Wi-Fi"
        >
          <Switch
            checked={settings.wifiOnlySync}
            onCheckedChange={checked => updateSettings({ wifiOnlySync: checked })}
            disabled={!settings.syncEnabled}
          />
        </SettingRow>

        <SettingRow
          label="Sync interval"
          description="How often to check for updates"
        >
          <select
            value={settings.syncIntervalMinutes}
            onChange={e => updateSettings({ syncIntervalMinutes: Number(e.target.value) })}
            disabled={!settings.syncEnabled}
            className="w-40 rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={1440}>Daily</option>
          </select>
        </SettingRow>
      </section>
    </div>
  );
}

/* ============================================
   AI Settings
   ============================================ */

function AISettings({ settings, updateSettings }: any) {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h3 className="font-medium">Model</h3>
        <div className="space-y-3">
          {['gemini-1.5-flash', 'gemini-1.5-pro'].map(model => (
            <label
              key={model}
              className={cn(
                'flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors',
                settings.preferredModel === model ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'
              )}
            >
              <div>
                <p className="font-medium">{model === 'gemini-1.5-flash' ? 'Gemini 1.5 Flash' : 'Gemini 1.5 Pro'}</p>
                <p className="text-sm text-muted-foreground">
                  {model === 'gemini-1.5-flash'
                    ? 'Fast, free tier (1,500 req/day), great for tagging & search'
                    : 'More capable, stricter limits (50 req/day), better for complex chat'}
                </p>
              </div>
              <input
                type="radio"
                name="model"
                value={model}
                checked={settings.preferredModel === model}
                onChange={e => updateSettings({ preferredModel: e.target.value as any })}
                className="h-4 w-4 text-primary"
              />
            </label>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="font-medium">Auto-processing</h3>

        <SettingRow
          label="Auto-tag"
          description="Automatically generate tags for new saves"
        >
          <Switch
            checked={settings.autoTag}
            onCheckedChange={checked => updateSettings({ autoTag: checked })}
          />
        </SettingRow>

        <SettingRow
          label="Auto-summarize"
          description="Generate AI summaries for new saves"
        >
          <Switch
            checked={settings.autoSummarize}
            onCheckedChange={checked => updateSettings({ autoSummarize: checked })}
          />
        </SettingRow>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="font-medium">Custom Prompts</h3>
        <p className="text-sm text-muted-foreground">
          Override default AI prompts for tagging, summarization, etc. (Advanced)
        </p>
        <Button variant="outline" size="sm">Configure prompts</Button>
      </section>
    </div>
  );
}

/* ============================================
   Privacy Settings
   ============================================ */

function PrivacySettings({ settings, updateSettings }: any) {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h3 className="font-medium">Data & Analytics</h3>

        <SettingRow
          label="Anonymous analytics"
          description="Help improve MindSpace with usage data (no personal info)"
        >
          <Switch
            checked={settings.analyticsEnabled}
            onCheckedChange={checked => updateSettings({ analyticsEnabled: checked })}
          />
        </SettingRow>

        <SettingRow
          label="Crash reporting"
          description="Automatically send error reports for debugging"
        >
          <Switch
            checked={settings.crashReportingEnabled}
            onCheckedChange={checked => updateSettings({ crashReportingEnabled: checked })}
          />
        </SettingRow>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="font-medium">Data Management</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Button variant="outline" onClick={() => window.location.href = '/api/export'}>
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
          <Button variant="outline" onClick={() => document.getElementById('import-file')?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Import Data
          </Button>
          <input id="import-file" type="file" accept=".json" className="hidden" />
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="font-medium">Danger Zone</h3>
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5">
          <p className="text-sm text-destructive/80 mb-3">
            This will permanently delete all your saved items, settings, and local data.
            This action cannot be undone.
          </p>
          <Button variant="destructive" onClick={() => { if (confirm('Delete ALL data? This cannot be undone.')) { /* TODO: implement */ } }}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete All Data
          </Button>
        </div>
      </section>
    </div>
  );
}

/* ============================================
   About Settings
   ============================================ */

function AboutSettings({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
          <div className="p-3 rounded-xl bg-primary/10">
            <Brain className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-lg">MindSpace</h3>
            <p className="text-sm text-muted-foreground">Version 0.1.0</p>
            <p className="text-sm text-muted-foreground mt-1">Your personal AI-powered mind space</p>
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="font-medium">Links</h3>
        <div className="space-y-2">
          <LinkRow icon={<Brain className="h-4 w-4" />} label="Documentation" href="#" />
          <LinkRow icon={<Shield className="h-4 w-4" />} label="Privacy Policy" href="#" />
          <LinkRow icon={<Database className="h-4 w-4" />} label="Data Policy" href="#" />
          <LinkRow icon={<Github className="h-4 w-4" />} label="GitHub Repository" href="#" />
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="font-medium">Reset</h3>
        <Button variant="outline" onClick={() => { if (confirm('Reset all settings to defaults?')) reset(); }}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset Settings
        </Button>
      </section>
    </div>
  );
}

function LinkRow({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
      <span className="p-2 rounded-lg bg-muted">{icon}</span>
      <span className="font-medium">{label}</span>
    </a>
  );
}

import { Github, RotateCcw } from 'lucide-react';

/* ============================================
   UI Helpers
   ============================================ */

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

