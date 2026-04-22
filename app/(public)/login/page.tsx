'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const isDev = process.env.NODE_ENV !== 'production';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [devAutoLogin, setDevAutoLogin] = useState(isDev);
  const attempted = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!isDev || attempted.current) return;
    attempted.current = true;
    signIn('dev-auto', { redirect: false }).then((result) => {
      if (result?.error) {
        setDevAutoLogin(false);
      } else {
        router.push('/apps');
      }
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('email-password', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid email or password');
    } else {
      router.push('/apps');
    }
  }

  if (devAutoLogin) {
    return (
      <div data-id="dev-auto-login" className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-400">Signing in automatically (dev mode)...</p>
      </div>
    );
  }

  return (
    <div data-id="login-page" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 data-id="login-title" className="text-2xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-gray-400">Welcome back to addnewfeature</p>
        </div>

        <form data-id="login-form" onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div data-id="login-error" className="rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">{error}</div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email</label>
            <input
              data-id="login-email"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">Password</label>
            <input
              data-id="login-password"
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <button
            data-id="login-submit"
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400">
          Don&apos;t have an account?{' '}
          <Link data-id="login-register-link" href="/register" className="text-blue-400 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
