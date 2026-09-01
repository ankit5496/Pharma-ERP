import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';
import Link from 'next/link';

import { clerkAppearance } from '@/lib/clerk-appearance';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Pharma ERP account.',
};

/**
 * Sign-in page.
 *
 * The `[[...sign-in]]` optional catch-all segment is required by Clerk's path
 * routing: multi-step flows (password reset, email verification, MFA challenge)
 * are rendered at sub-paths like /sign-in/factor-two, and without the catch-all
 * those 404.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  // Next 15: searchParams is a promise in server components.
  const { reason } = await searchParams;

  return (
    <div>
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 lg:hidden">
          Pharma ERP
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 lg:mt-0">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Use the email address your administrator invited.
        </p>
      </header>

      {reason === 'disabled' && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-medium">This account has been disabled.</p>
          <p className="mt-1">
            An administrator at your company has revoked access. Contact them to have it restored —
            your records are retained either way.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <SignIn
          appearance={clerkAppearance}
          // Sign-in never lands on a fixed page: an onboarded user belongs on
          // their dashboard, one who registered but never created a company
          // belongs on /onboarding. /post-auth makes that decision server-side
          // with the API's answer, which the browser cannot know on its own.
          forceRedirectUrl="/post-auth"
          signUpUrl="/sign-up"
        />
      </div>

      <p className="mt-6 text-center text-sm text-slate-600">
        Registering a new company?{' '}
        <Link
          href="/sign-up"
          className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
