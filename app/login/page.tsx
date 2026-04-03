'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        setError('Invalid email or password');
        setLoading(false);
      } else {
        router.push(callbackUrl);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-landing-bg px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,rgba(61,115,122,0.12),transparent_65%)]" />

      <div className="surface-card w-full max-w-md space-y-8 p-8 sm:p-10">
        <div className="text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-landing-accent">Welcome Back</p>
          <h2 className="font-playfair text-3xl font-semibold tracking-tight text-landing-text">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-landing-text-muted">
            Access your personal library
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="email-address" className="text-sm font-medium text-landing-text-muted">
                Email
              </label>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-landing-text placeholder:text-landing-text-muted/70 focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
                placeholder="Email address"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-landing-text-muted">
                Password
              </label>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-landing-text placeholder:text-landing-text-muted/70 focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
                placeholder="Password"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600">{error}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="brand-button w-full py-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
