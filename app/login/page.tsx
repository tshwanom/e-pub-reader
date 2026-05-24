'use client';

import { Suspense, useState, type FormEvent, type ReactNode } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { buildMagicLoginCallbackUrl, redirectToMagicLoginCallback } from '@/lib/magic-login';

function getAuthErrorMessage(error?: string | null) {
  switch (error) {
    case 'Verification':
      return 'That link or code is invalid or has expired. Request a fresh one and try again.';
    case 'EmailSignin':
      return 'We could not send the sign-in email. Please try again in a moment.';
    case 'EmailCreateAccount':
      return 'We could not sign you in. If you have an existing account, try signing in with your password, or contact support.';
    case 'AccessDenied':
      return 'We could not sign you in with that email just now.';
    default:
      return '';
  }
}

type LoginPageShellProps = {
  children: ReactNode;
  subtitle?: string;
};

function LoginPageShell({ children, subtitle = 'Access your personal library' }: LoginPageShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-landing-bg px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,rgba(61,115,122,0.12),transparent_65%)]" />

      <div className="surface-card w-full max-w-md space-y-8 p-8 sm:p-10">
        <div className="text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-landing-accent">Welcome Back</p>
          <h2 className="font-playfair text-3xl font-semibold tracking-tight text-landing-text">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-landing-text-muted">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') || '/';
  const authErrorFromQuery = getAuthErrorMessage(searchParams?.get('error'));
  const [activeTab, setActiveTab] = useState<'magic' | 'password'>('magic');
  const [magicEmail, setMagicEmail] = useState('');
  const [magicCode, setMagicCode] = useState('');
  const [password, setPassword] = useState('');
  const [credentialsEmail, setCredentialsEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailNotice, setEmailNotice] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [magicLoading, setMagicLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const normalizedMagicEmail = magicEmail.trim().toLowerCase();

  const handleMagicLinkRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!normalizedMagicEmail) {
      setEmailError('Enter your email address so we can send your sign-in link and code.');
      return;
    }

    setMagicLoading(true);
    setEmailError('');
    setEmailNotice('');

    try {
      const result = await signIn('email', {
        redirect: false,
        email: normalizedMagicEmail,
        callbackUrl,
      });

      if (result?.error) {
        setEmailError('We could not send the sign-in email. Please try again.');
      } else {
        setEmailNotice(`We sent a magic link and a 6-digit code to ${normalizedMagicEmail}.`);
      }
    } catch {
      setEmailError('Something went wrong while sending the sign-in email. Please try again.');
    } finally {
      setMagicLoading(false);
    }
  };

  const handleCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!normalizedMagicEmail) {
      setEmailError('Enter your email address before using the code.');
      return;
    }

    if (!magicCode.trim()) {
      setEmailError('Enter the 6-digit code from your email.');
      return;
    }

    setCodeLoading(true);
    setEmailError('');

    const verificationUrl = buildMagicLoginCallbackUrl({
      email: normalizedMagicEmail,
      token: magicCode.trim(),
      callbackUrl,
    });

    redirectToMagicLoginCallback(verificationUrl);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordError('');

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email: credentialsEmail,
        password,
      });

      if (result?.error) {
        setPasswordError('Invalid email or password');
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setPasswordError('An error occurred. Please try again.');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <LoginPageShell>
      <div className="surface-card rounded-2xl border border-landing-border/80 bg-white/70 p-6 shadow-sm space-y-6">
        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-landing-border/30 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('magic')}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 ${
              activeTab === 'magic'
                ? 'bg-white text-landing-text shadow-sm'
                : 'text-landing-text-muted hover:text-landing-text'
            }`}
          >
            Instant Link & Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 ${
              activeTab === 'password'
                ? 'bg-white text-landing-text shadow-sm'
                : 'text-landing-text-muted hover:text-landing-text'
            }`}
          >
            Password
          </button>
        </div>

        {activeTab === 'magic' ? (
          <div className="space-y-4">
            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-landing-accent">Passwordless sign-in & registration</p>
              <h3 className="mt-2 text-xl font-semibold text-landing-text">Sign in or create an account</h3>
              <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                Enter your email to sign in instantly or create a new free account. If you donated, please use your donor email to unlock premium benefits automatically.
              </p>
            </div>

            {(authErrorFromQuery || emailError) && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {emailError || authErrorFromQuery}
              </div>
            )}

            {emailNotice && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {emailNotice}
              </div>
            )}

            <form className="space-y-4" onSubmit={handleMagicLinkRequest}>
              <div className="space-y-2">
                <label htmlFor="magic-email" className="text-sm font-medium text-landing-text-muted">
                  Email address
                </label>
                <input
                  id="magic-email"
                  name="magic-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  className="block w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-landing-text placeholder:text-landing-text-muted/70 focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={magicLoading}
                className="brand-button w-full py-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                {magicLoading ? 'Sending your sign-in email…' : 'Send magic link or code'}
              </button>
            </form>

            <div className="my-5 h-px bg-landing-border/80" />

            <form className="space-y-4" onSubmit={handleCodeSubmit}>
              <div className="space-y-2">
                <label htmlFor="magic-code" className="text-sm font-medium text-landing-text-muted">
                  6-digit code
                </label>
                <input
                  id="magic-code"
                  name="magic-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={magicCode}
                  onChange={(e) => setMagicCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="block w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-center text-lg font-semibold tracking-[0.35em] text-landing-text placeholder:text-landing-text-muted/70 focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
                  placeholder="123456"
                />
              </div>

              <button
                type="submit"
                disabled={codeLoading}
                className="ghost-button w-full py-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                {codeLoading ? 'Verifying code…' : 'Sign in with code'}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-landing-text-muted">Password sign-in</p>
              <h3 className="mt-2 text-xl font-semibold text-landing-text">Sign in with password</h3>
              <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                Access your account using your email and password.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="credentials-email" className="text-sm font-medium text-landing-text-muted">
                  Email
                </label>
                <input
                  id="credentials-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={credentialsEmail}
                  onChange={(e) => setCredentialsEmail(e.target.value)}
                  className="block w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-landing-text placeholder:text-landing-text-muted/70 focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
                  placeholder="Email address"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-landing-text-muted">
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

              {passwordError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {passwordError}
                </div>
              )}

              <button
                type="submit"
                disabled={passwordLoading}
                className="brand-button w-full py-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passwordLoading ? 'Signing in…' : 'Sign in with password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </LoginPageShell>
  );
}

function LoginPageFallback() {
  return (
    <LoginPageShell subtitle="Preparing your sign-in experience...">
      <div className="mt-8 rounded-xl border border-landing-border/60 bg-white/70 px-4 py-6 text-center text-sm text-landing-text-muted">
        Loading sign-in form...
      </div>
    </LoginPageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
