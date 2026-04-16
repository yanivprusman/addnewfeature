'use client';

import { useState, useEffect, use } from 'react';

type AppDetail = {
  id: string;
  name: string;
  appSlug: string;
  description: string | null;
  appType: string;
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
  const [installingApk, setInstallingApk] = useState(false);
  const [installMsg, setInstallMsg] = useState('');

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

  async function handleInstallOnPhone() {
    setInstallingApk(true);
    setInstallMsg('Building & installing...');
    const res = await fetch(`/api/apps/${slug}/install-apk`, { method: 'POST' });
    const data = await res.json();
    setInstallMsg(res.ok ? 'Installed on phone successfully!' : data.error || 'Install failed');
    setInstallingApk(false);
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
    <div data-id="app-detail-page" className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 data-id="app-title" className="text-2xl font-bold">{app.name}</h1>
          {app.appType === 'android' && (
            <span className="rounded bg-green-900/50 px-2 py-0.5 text-sm text-green-300">Android</span>
          )}
        </div>
        {app.description && <p data-id="app-description" className="mt-1 text-gray-400">{app.description}</p>}
      </div>

      {app.appType === 'android' && (
        <div data-id="install-section" className="rounded border border-green-800/50 bg-green-950/30 p-4 space-y-3">
          <h3 className="text-sm font-medium text-green-300">Install on Phone</h3>
          <p className="text-sm text-gray-400">
            Build the APK and install it directly on your phone.
          </p>
          <button
            data-id="install-on-phone"
            onClick={handleInstallOnPhone}
            disabled={installingApk}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium hover:bg-green-500 disabled:opacity-50"
          >
            {installingApk ? 'Installing...' : 'Install on Phone'}
          </button>
          {installMsg && (
            <div className={`rounded px-3 py-2 text-sm ${installMsg.includes('successfully') ? 'bg-green-900/50 text-green-300' : installMsg.includes('failed') ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>
              {installMsg}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div data-id="env-dev" className="rounded border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-sm font-medium text-gray-400">{app.appType === 'android' ? 'Dev Backend' : 'Dev'}</h3>
          <a data-id="dev-url" href={`https://${devUrl}`} target="_blank" rel="noreferrer"
            className="mt-1 block text-blue-400 hover:underline">{devUrl}</a>
          <p className="mt-1 text-xs text-gray-500">Port {app.devPort}</p>
        </div>
        <div data-id="env-prod" className="rounded border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-sm font-medium text-gray-400">{app.appType === 'android' ? 'Prod Backend' : 'Prod'}</h3>
          <a data-id="prod-url" href={`https://${prodUrl}`} target="_blank" rel="noreferrer"
            className="mt-1 block text-blue-400 hover:underline">{prodUrl}</a>
          <p className="mt-1 text-xs text-gray-500">Port {app.prodPort}</p>
        </div>
      </div>

      <div data-id="service-status" className="rounded border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-sm font-medium text-gray-400">Service Status</h3>
        <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-300">{app.daemonStatus}</pre>
      </div>

      <div data-id="issues-section" className="rounded border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-sm font-medium text-gray-400">Issues</h3>
        <p className="mt-1 text-sm text-gray-300">
          View and manage issues reported via the feedback widget:
        </p>
        <a data-id="issues-url" href={issuesUrl} target="_blank" rel="noreferrer"
          className="mt-2 inline-block text-blue-400 hover:underline">{issuesUrl}</a>
      </div>

      <div className="flex gap-3">
        <button
          data-id="deploy-to-prod"
          onClick={handleDeploy}
          disabled={deploying}
          className="rounded bg-green-700 px-4 py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-50"
        >
          {deploying ? 'Deploying...' : 'Deploy to Prod'}
        </button>
      </div>

      {deployMsg && (
        <div data-id="deploy-message" className={`rounded px-3 py-2 text-sm ${deployMsg.includes('success') ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {deployMsg}
        </div>
      )}
    </div>
  );
}
