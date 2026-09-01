import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';
import Link from 'next/link';

import { clerkAppearance } from '@/lib/clerk-appearance';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Register your manufacturing company on Pharma ERP.',
};

/**
 * Sign-up page — step 1 of 2.
 *
 * This creates the Clerk identity only (email, password, verification). The
 * company itself is created in step 2 at /onboarding, and the person who does
 * that becomes its Admin.
 *
 * Note what is deliberately absent: any role selector. Roles are assigned by an
 * Admin from inside the app. Letting a stranger pick their own role at
 * registration would let anyone grant themselves Admin over a tenant.
 */
export default function SignUpPage() {
  return (
    <div>
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 lg:hidden">
          Pharma ERP
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 lg:mt-0">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          You&rsquo;ll set up your company on the next step and become its administrator.
        </p>
      </header>

      <ol className="mb-6 flex items-center gap-3 text-xs font-medium">
        <Step index={1} label="Account" state="current" />
        <span aria-hidden className="h-px flex-1 bg-slate-200" />
        <Step index={2} label="Company" state="upcoming" />
      </ol>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <SignUp
          appearance={clerkAppearance}
          // Straight to company setup; /onboarding sends an already-onboarded
          // user on to their dashboard, so this is safe on a repeat visit.
          forceRedirectUrl="/onboarding"
          signInUrl="/sign-in"
        />
      </div>

      <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Been invited to an existing company?</p>
        <p className="mt-1">
          Use the link in your invitation email instead of this form — it joins you to your company
          with the role your administrator assigned.
        </p>
      </div>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link
          href="/sign-in"
          className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

function Step({
  index,
  label,
  state,
}: {
  index: number;
  label: string;
  state: 'current' | 'upcoming';
}) {
  const isCurrent = state === 'current';

  return (
    <li className="flex items-center gap-2" aria-current={isCurrent ? 'step' : undefined}>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
          isCurrent ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
        }`}
      >
        {index}
      </span>
      <span className={isCurrent ? 'text-slate-900' : 'text-slate-500'}>{label}</span>
    </li>
  );
}
