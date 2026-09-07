import type { Metadata } from 'next';

import { logoutAction } from '@/app/(auth)/login/actions';
import { requireSessionAllowingPasswordChange } from '@/lib/session';

import { ChangePasswordForm } from './form';

export const metadata: Metadata = { title: 'Change your password' };
export const dynamic = 'force-dynamic';

/**
 * Forced password change.
 *
 * The only page reachable while `mustChangePassword` is set — the API refuses
 * everything else, so this is not merely a suggestion the UI makes. It is also
 * available voluntarily to anyone who wants to change their password.
 */
export default async function ChangePasswordPage() {
  const user = await requireSessionAllowingPasswordChange();
  const forced = user.mustChangePassword;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Pharma ERP
          </p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-12">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {forced ? 'Set your own password' : 'Change your password'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {forced ? (
              <>
                Your administrator set a temporary password, so they know it too. Choose your own
                before continuing — you won&rsquo;t be able to reach anything else until you do.
              </>
            ) : (
              <>
                Signed in as <span className="font-medium text-slate-900">{user.email}</span>.
              </>
            )}
          </p>
        </header>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <ChangePasswordForm />
        </div>
      </main>
    </div>
  );
}
