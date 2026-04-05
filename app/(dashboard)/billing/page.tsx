'use client';

import { useState, useEffect } from 'react';

type TenantApp = {
  id: string;
  name: string;
  appSlug: string;
  status: string;
  createdAt: string;
};

export default function BillingPage() {
  const [apps, setApps] = useState<TenantApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/apps')
      .then((res) => res.json())
      .then((data) => {
        setApps(data.apps || []);
        setLoading(false);
      });
  }, []);

  const activeApps = apps.filter((a) => a.status !== 'stopped' && a.status !== 'error');
  const monthlyTotal = activeApps.length * 19;

  if (loading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div data-id="billing-page" className="space-y-6">
      <h1 data-id="billing-title" className="text-2xl font-bold">Billing</h1>

      <div data-id="billing-summary" className="rounded border border-gray-800 bg-gray-900/50 p-6">
        <div className="text-sm text-gray-400">Monthly total</div>
        <div data-id="monthly-total" className="mt-1 text-3xl font-bold">${monthlyTotal}/mo</div>
        <div className="mt-1 text-sm text-gray-500">
          {activeApps.length} active app{activeApps.length !== 1 ? 's' : ''} x $19/app/month
        </div>
      </div>

      <div data-id="billing-apps-list" className="space-y-2">
        <h2 className="text-sm font-medium text-gray-400">Your apps</h2>
        {apps.map((app) => (
          <div key={app.id} data-id={`billing-app-${app.appSlug}`} className="flex items-center justify-between rounded border border-gray-800 bg-gray-900/30 px-4 py-3">
            <div>
              <span className="font-medium">{app.name}</span>
              <span className="ml-2 text-sm text-gray-500">({app.appSlug})</span>
            </div>
            <div className="text-sm">
              {app.status === 'stopped' || app.status === 'error' ? (
                <span className="text-gray-500">Inactive</span>
              ) : (
                <span className="text-green-400">$19/mo</span>
              )}
            </div>
          </div>
        ))}
        {apps.length === 0 && (
          <p data-id="billing-empty-state" className="text-sm text-gray-500">No apps yet.</p>
        )}
      </div>
    </div>
  );
}
