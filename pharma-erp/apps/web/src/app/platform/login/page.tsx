import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AUTH_ROUTES, PLATFORM_ROUTES } from '@pharma-erp/types';

import { getPlatformToken } from '@/lib/platform-session';

import { PlatformLoginForm } from './form';

export const metadata: Metadata = { title: 'Platform console' };
export const dynamic = 'force-dynamic';

/**
 * Platform console sign-in.
 *
 * Visually distinct from the tenant login — dark rather than light — on purpose.
 * A Super User has authority over every customer's data, and it should be
 * obvious at a glance which surface you are on. Mistaking the two is exactly the
 * kind of error that leads to changing the wrong company.
 */
export default async function PlatformLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  if (await getPlatformToken()) redirect(PLATFORM_ROUTES.dashboard);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12">
      <div className="w-full max-w-lg">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Pharma ERP
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
            Platform console
          </h1>
          {/* A real link rather than a bare path in monospace: someone who
              followed the console link by mistake should be one click from where
              they meant to go, not retyping a URL. */}
          <p className="mt-2 text-sm text-slate-400">
            For platform operators only. Company staff{' '}
            <Link
              href={AUTH_ROUTES.login}
              className="font-medium text-slate-300 underline decoration-slate-600 underline-offset-4 hover:text-slate-100"
            >
              sign in here
            </Link>
            .
          </p>
        </header>

        {expired === '1' && (
          <div
            role="status"
            className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"
          >
            Your console session ended. Sign in again.
          </div>
        )}

        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
          <PlatformLoginForm />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          Platform accounts are created from the command line (
          <span className="font-mono">pnpm create-super-user</span>), never through this page. There
          is no self-registration and no password reset by email.
        </p>
      </div>
    </div>
  );
}
