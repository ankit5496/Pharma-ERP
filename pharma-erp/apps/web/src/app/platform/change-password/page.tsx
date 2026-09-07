import type { Metadata } from 'next';

import { requirePlatformSessionAllowingPasswordChange } from '@/lib/platform-session';

import { platformLogoutAction } from '../actions';
import { PlatformChangePasswordForm } from './form';

export const metadata: Metadata = { title: 'Change password' };
export const dynamic = 'force-dynamic';

/**
 * The only page a must-change-password operator can reach — the API refuses
 * every other platform route until it is done. Also available voluntarily.
 */
export default async function PlatformChangePasswordPage() {
  const operator = await requirePlatformSessionAllowingPasswordChange();
  const forced = operator.mustChangePassword;

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-slate-700">
        <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Platform console
          </p>
          <form action={platformLogoutAction}>
            <button
              type="submit"
              className="text-sm font-medium text-slate-400 underline decoration-slate-600 underline-offset-4 hover:text-slate-200"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-12">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            {forced ? 'Set your own password' : 'Change your password'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {forced ? (
              <>
                Your password was set from the command line, so whoever ran it knows it too. Choose
                your own before continuing — this console can create and suspend companies.
              </>
            ) : (
              <>
                Signed in as <span className="font-medium text-slate-200">{operator.email}</span>.
              </>
            )}
          </p>
        </header>

        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 sm:p-8">
          <PlatformChangePasswordForm />
        </div>
      </main>
    </div>
  );
}
