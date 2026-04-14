'use client';

import { useState, useEffect } from 'react';
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

export default function AppsPage() {
  const [apps, setApps] = useState<TenantApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [appType, setAppType] = useState<'web' | 'android'>('web');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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

    setNewName('');
    setNewDescription('');
    setAppType('web');
    setShowCreate(false);
    setCreating(false);
    fetchApps();
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
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700"
          >
            Create App
          </button>
          <button
            data-id="create-android-app"
            onClick={() => { setAppType('android'); setShowCreate(true); }}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium hover:bg-green-700"
          >
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
