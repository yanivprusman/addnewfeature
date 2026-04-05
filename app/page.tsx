import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <nav data-id="landing-nav" className="border-b border-gray-800 bg-gray-900/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold">addnewfeature</span>
          <div className="flex gap-3">
            <Link data-id="nav-sign-in" href="/login" className="rounded border border-gray-700 px-4 py-2 text-sm hover:bg-gray-800">
              Sign in
            </Link>
            <Link data-id="nav-get-started" href="/register" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <main data-id="hero-section" className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 data-id="hero-headline" className="text-5xl font-bold tracking-tight">
          Ship apps with<br />
          <span className="text-blue-400">built-in AI feedback</span>
        </h1>
        <p data-id="hero-subtitle" className="mt-6 max-w-lg text-lg text-gray-400">
          Create a Next.js app in seconds. Every app comes with an AI-powered feedback widget
          that helps you clarify and track issues as you build.
        </p>
        <div className="mt-8 flex gap-4">
          <Link data-id="cta-start-building" href="/register" className="rounded bg-blue-600 px-6 py-3 font-medium hover:bg-blue-700">
            Start building
          </Link>
          <Link data-id="cta-sign-in" href="/login" className="rounded border border-gray-700 px-6 py-3 font-medium hover:bg-gray-800">
            Sign in
          </Link>
        </div>

        <div data-id="features-grid" className="mt-16 grid max-w-3xl gap-6 text-left sm:grid-cols-3">
          <div data-id="feature-instant-setup" className="rounded border border-gray-800 bg-gray-900/30 p-5">
            <h3 className="font-semibold">Instant Setup</h3>
            <p className="mt-2 text-sm text-gray-400">
              One click creates a full Next.js app with dev and prod environments, systemd services, and a git repo.
            </p>
          </div>
          <div data-id="feature-ai-clarifier" className="rounded border border-gray-800 bg-gray-900/30 p-5">
            <h3 className="font-semibold">AI Issue Clarifier</h3>
            <p className="mt-2 text-sm text-gray-400">
              Every dev environment includes an AI widget that helps you describe bugs clearly and creates structured issues.
            </p>
          </div>
          <div data-id="feature-dev-prod" className="rounded border border-gray-800 bg-gray-900/30 p-5">
            <h3 className="font-semibold">Dev &amp; Prod</h3>
            <p className="mt-2 text-sm text-gray-400">
              Deploy from dev to prod with one click. Each environment runs independently with its own URL.
            </p>
          </div>
        </div>
      </main>

      <footer data-id="landing-footer" className="border-t border-gray-800 py-6 text-center text-sm text-gray-500">
        addnewfeature
      </footer>
    </div>
  );
}
