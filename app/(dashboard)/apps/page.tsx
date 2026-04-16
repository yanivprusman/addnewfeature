'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type TenantApp = {
  id: string;
  name: string;
  appSlug: string;
  description: string | null;
  appType: string;
  devPort: number | null;
  prodPort: number | null;
  status: string;
  createdAt: string;
};

type StepStatus = 'pending' | 'active' | 'done' | 'error';

function ProgressStep({ label, status }: { label: string; status: StepStatus }) {
  return (
    <div className="flex items-center gap-3">
      {status === 'pending' && <span className="h-5 w-5 rounded-full border border-gray-600" />}
      {status === 'active' && (
        <span className="h-5 w-5 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
      )}
      {status === 'done' && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs text-white">✓</span>
      )}
      {status === 'error' && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white">✗</span>
      )}
      <span className={status === 'active' ? 'text-green-300' : status === 'done' ? 'text-gray-300' : status === 'error' ? 'text-red-300' : 'text-gray-500'}>
        {label}
        {status === 'active' && '...'}
      </span>
    </div>
  );
}

export default function AppsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<TenantApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [appType, setAppType] = useState<'web' | 'android'>('web');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [androidProgress, setAndroidProgress] = useState<{
    step: 'creating' | 'installing' | 'done' | 'error';
    slug: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    fetchApps();
  }, []);

  async function fetchApps() {
    const res = await fetch('/api/apps');
    const data = await res.json();
    setApps(data.apps || []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');

    const endpoint = appType === 'android' ? '/api/apps/create-android' : '/api/apps/create';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDescription }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to create app');
      setCreating(false);
      return;
    }

    const result = await res.json();

    if (appType !== 'android') {
      setNewName('');
      setNewDescription('');
      setAppType('web');
      setShowCreate(false);
      setCreating(false);
      fetchApps();
      return;
    }

    // Android: chain create → build → install
    const slug = result.slug;
    setShowCreate(false);
    setCreating(false);
    setNewName('');
    setNewDescription('');
    setAndroidProgress({ step: 'installing', slug });
    const installRes = await fetch(`/api/apps/${slug}/install-apk`, { method: 'POST' });
    if (!installRes.ok) {
      const data = await installRes.json();
      setAndroidProgress({ step: 'error', slug, error: `Install failed: ${data.error}` });
      return;
    }

    setAndroidProgress({ step: 'done', slug });
    setTimeout(() => {
      router.push(`/apps/${slug}`);
    }, 1500);
  }

  const statusColors: Record<string, string> = {
    running: 'bg-green-900/50 text-green-300',
    creating: 'bg-yellow-900/50 text-yellow-300',
    stopped: 'bg-gray-800 text-gray-400',
    error: 'bg-red-900/50 text-red-300',
  };

  if (loading) {
    return <div className="text-gray-400">Loading apps...</div>;
  }

  return (
    <div data-id="apps-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 data-id="apps-title" className="text-2xl font-bold">Your Apps</h1>
        <div className="flex gap-2">
          <button
            data-id="create-app"
            onClick={() => { setAppType('web'); setShowCreate(true); }}
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Create Web App
          </button>
          <button
            data-id="create-android-app"
            onClick={() => { setAppType('android'); setShowCreate(true); }}
            className="inline-flex items-center gap-1.5 rounded border border-green-600 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-600/20"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48A5.84 5.84 0 0 0 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31A5.983 5.983 0 0 0 6 7h12c0-2.21-1.2-4.15-2.97-5.18-.15-.08-.02.26.5-.66zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
            </svg>
            Create Android App
          </button>
        </div>
      </div>

      {showCreate && (
        <form data-id="create-app-form" onSubmit={handleCreate} className="space-y-3 rounded border border-gray-700 bg-gray-900 p-4">
          {error && <div data-id="create-app-error" className="text-sm text-red-400">{error}</div>}
          <div>
            <label className="block text-sm text-gray-300">App Name</label>
            <input
              data-id="app-name-input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              placeholder="My App"
              className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300">Description</label>
            <input
              data-id="app-description-input"
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="A brief description of your app"
              className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              data-id="create-app-submit"
              type="submit"
              disabled={creating}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : (appType === 'android' ? 'Create Android App' : 'Create')}
            </button>
            <button
              data-id="create-app-cancel"
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded border border-gray-700 px-4 py-2 text-sm hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {androidProgress && (
        <div data-id="android-progress" className="rounded border border-green-800/50 bg-green-950/30 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-green-300">Setting up Android App</h3>
          <div className="space-y-3">
            <ProgressStep
              label="Creating app"
              status="done"
            />
            <ProgressStep
              label="Installing on phone"
              status={androidProgress.step === 'installing' ? 'active' :
                      androidProgress.step === 'done' ? 'done' :
                      androidProgress.step === 'error' ? 'error' : 'pending'}
            />
          </div>
          {androidProgress.step === 'error' && (
            <div className="space-y-2">
              <div className="rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">
                {androidProgress.error}
              </div>
              <button
                onClick={() => { setAndroidProgress(null); router.push(`/apps/${androidProgress.slug}`); }}
                className="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600"
              >
                Go to App Details
              </button>
            </div>
          )}
          {androidProgress.step === 'done' && (
            <div className="rounded bg-green-900/50 px-3 py-2 text-sm text-green-300">
              All done! Redirecting to app details...
            </div>
          )}
        </div>
      )}

      {apps.length === 0 ? (
        <div data-id="apps-empty-state" className="rounded border border-gray-800 bg-gray-900/50 p-12 text-center">
          <p className="text-gray-400">No apps yet. Create your first app to get started.</p>
        </div>
      ) : (
        <div data-id="apps-grid" className="grid gap-4">
          {apps.map((app) => (
            <Link
              key={app.id}
              href={`/apps/${app.appSlug}`}
              data-id={`app-card-${app.appSlug}`}
              className="block rounded border border-gray-800 bg-gray-900/50 p-4 hover:border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{app.name}</h2>
                  {app.description && (
                    <p className="mt-1 text-sm text-gray-400">{app.description}</p>
                  )}
                  <div className="mt-2 flex gap-3 text-xs text-gray-500">
                    <span>slug: {app.appSlug}</span>
                    {app.appType === 'android' && (
                      <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-green-300">Android</span>
                    )}
                    {app.devPort && <span>dev: {app.devPort}</span>}
                    {app.prodPort && <span>prod: {app.prodPort}</span>}
                  </div>
                </div>
                <span data-id={`app-status-${app.appSlug}`} className={`rounded px-2 py-1 text-xs ${statusColors[app.status] || 'bg-gray-800 text-gray-400'}`}>
                  {app.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
