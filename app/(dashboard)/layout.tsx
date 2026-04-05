import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { NavLinks } from './nav-links';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen">
      <nav data-id="dashboard-nav" className="border-b border-gray-800 bg-gray-900/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link data-id="dashboard-logo" href="/apps" className="text-lg font-bold">
            addnewfeature
          </Link>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <NavLinks />
            <span data-id="user-email">{session.user.email}</span>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
