import { currentUser } from '@clerk/nextjs/server';
import { SignOutButton } from '@clerk/nextjs';
import type { Metadata } from 'next';

import { requirePreOnboardingSession } from '@/lib/session';

import { CompanyForm } from './company-form';

export const metadata: Metadata = {
  title: 'Set up your company',
  description: 'Register your manufacturing company to finish creating your account.',
};

/**
 * Signup step 2: create the tenant.
 *
 * Reached with a valid Clerk session but no company yet. `requirePreOnboardingSession`
 * enforces exactly that — an already-onboarded user is redirected to their
 * dashboard rather than being offered a second company.
 */
export default async function OnboardingPage() {
  await requirePreOnboardingSession();

  // Prefill the name from Clerk if the user supplied one at registration; it is
  // a suggestion, and the form lets them change it.
  const clerkUser = await currentUser();
  const defaultFullName = [clerkUser?.firstName, clerkUser?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Pharma ERP
          </p>
          <SignOutButton redirectUrl="/sign-in">
            <button
              type="button"
              className="text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
            >
              Sign out
            </button>
          </SignOutButton>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <ol className="mb-8 flex items-center gap-3 text-xs font-medium">
          <li className="flex items-center gap-2">
            <span className="bg-status-ok flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white">
              ✓
            </span>
            <span className="text-slate-500">Account</span>
          </li>
          <span aria-hidden className="h-px flex-1 bg-slate-200" />
          <li className="flex items-center gap-2" aria-current="step">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              2
            </span>
            <span className="text-slate-900">Company</span>
          </li>
        </ol>

        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Set up your company
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {clerkUser?.primaryEmailAddress?.emailAddress ? (
              <>
                Signed in as{' '}
                <span className="font-medium text-slate-900">
                  {clerkUser.primaryEmailAddress.emailAddress}
                </span>
                . You&rsquo;ll be this company&rsquo;s administrator, with permission to invite
                colleagues and assign their roles.
              </>
            ) : (
              <>
                You&rsquo;ll be this company&rsquo;s administrator, with permission to invite
                colleagues and assign their roles.
              </>
            )}
          </p>
        </header>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <CompanyForm defaultFullName={defaultFullName} />
        </div>
      </main>
    </div>
  );
}
