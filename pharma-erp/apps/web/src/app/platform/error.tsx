'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Error boundary for the platform console.
 *
 * A separate file from the root boundary purely so the console stays dark. The
 * two surfaces are visually distinct on purpose — a Super User has authority
 * over every customer's data — and dropping to a light error page in the middle
 * of the console loses that signal at the exact moment someone is confused.
 *
 * One extra hint over the tenant boundary: the console is the only area that
 * uses MIGRATION_DATABASE_URL, via the elevated provisioning connection. So a
 * failure here while tenant sign-in still works points squarely at that
 * variable, and saying so is worth more than a digest.
 */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Platform console server-side exception', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-6 py-12">
      <div className="w-full max-w-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Pharma ERP
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
          Platform console
        </h1>

        <div className="mt-6 rounded-lg border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
          <h2 className="text-base font-semibold text-slate-100">This page could not load</h2>

          <p className="mt-2 text-sm text-slate-400">
            The console could not reach the API. If company sign-in is working but this is not, the
            difference is the elevated database connection the console uses on its own — check{' '}
            <span className="font-mono text-slate-300">MIGRATION_DATABASE_URL</span> on the API
            service.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-white"
            >
              Try again
            </button>
            <Link
              href="/platform/logout"
              className="rounded-md border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700/50"
            >
              Sign out and start over
            </Link>
          </div>

          {error.digest && (
            <p className="mt-5 border-t border-slate-700 pt-4 text-xs text-slate-500">
              Reference: <span className="font-mono text-slate-400">{error.digest}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
