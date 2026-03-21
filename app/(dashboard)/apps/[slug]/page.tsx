'use client';

import { useState, useEffect, use } from 'react';

type AppDetail = {
  id: string;
  name: string;
  appSlug: string;
  description: string | null;
  devPort: number | null;
  prodPort: number | null;
  status: string;
  daemonStatus: string;
  createdAt: string;
};

export default function AppDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState('');

  useEffect(() => {
    fetchApp();
  }, [slug]);

  async function fetchApp() {
    const res = await fetch(`/api/apps/${slug}/status`);
    if (res.ok) {
      const data = await res.json();
      setApp(data);
    }
    setLoading(false);
  }

  async function handleDeploy() {
    setDeploying(true);
    setDeployMsg('');
    const res = await fetch(`/api/apps/${slug}/deploy`, { method: 'POST' });
    const data = await res.json();
    setDeployMsg(res.ok ? 'Deployed successfully' : data.error || 'Deploy failed');
    setDeploying(false);
    fetchApp();
  }

  if (loading) return <div className="text-gray-400">Loading...</div>;
  if (!app) return <div className="text-red-400">App not found</div>;

  const devUrl = `${app.appSlug}.dev.ya-niv.com`;
  const prodUrl = `${app.appSlug}.prod.ya-niv.com`;
  const issuesUrl = `https://${devUrl}/issues`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{app.name}</h1>
        {app.description && <p className="mt-1 text-gray-400">{app.description}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-sm font-medium text-gray-400">Dev</h3>
          <a href={`https://${devUrl}`} target="_blank" rel="noreferrer"
            className="mt-1 block text-blue-400 hover:underline">{devUrl}</a>
          <p className="mt-1 text-xs text-gray-500">Port {app.devPort}</p>
        </div>
        <div className="rounded border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-sm font-medium text-gray-400">Prod</h3>
          <a href={`https://${prodUrl}`} target="_blank" rel="noreferrer"
            className="mt-1 block text-blue-400 hover:underline">{prodUrl}</a>
          <p className="mt-1 text-xs text-gray-500">Port {app.prodPort}</p>
        </div>
      </div>

      <div className="rounded border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-sm font-medium text-gray-400">Service Status</h3>
        <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-300">{app.daemonStatus}</pre>
      </div>

      <div className="rounded border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-sm font-medium text-gray-400">Issues</h3>
        <p className="mt-1 text-sm text-gray-300">
          View and manage issues reported via the feedback widget:
        </p>
        <a href={issuesUrl} target="_blank" rel="noreferrer"
          className="mt-2 inline-block text-blue-400 hover:underline">{issuesUrl}</a>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="rounded bg-green-700 px-4 py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-50"
        >
          {deploying ? 'Deploying...' : 'Deploy to Prod'}
        </button>
      </div>

      {deployMsg && (
        <div className={`rounded px-3 py-2 text-sm ${deployMsg.includes('success') ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {deployMsg}
        </div>
      )}
    </div>
  );
}
