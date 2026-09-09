'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Error boundary for every segment except the platform console.
 *
 * Without this file, an exception thrown in a server component renders Next's
 * built-in page: "Application error: a server-side exception has occurred" plus
 * a digest and nothing else. That is the worst possible output here, because the
 * overwhelmingly likely cause is one this page can name — the API being
 * unreachable — and the person reading it has no way to tell that from a code
 * bug.
 *
 * The message itself is deliberately NOT displayed. Next strips it in
 * production builds and passes only a digest to the client, so rendering
 * `error.message` would show something useful in development and an empty
 * string in production, which is worse than not offering it. The real message
 * is logged server-side by apiFetch, which reports the OS-level code.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Goes to the browser console, where the digest lets you correlate with the
    // server log line that carries the actual reason.
    console.error('Server-side exception', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">This page could not load</h1>

          <p className="mt-2 text-sm text-slate-600">
            The application server could not complete the request. The usual cause is that the API
            is restarting or unavailable, in which case retrying in a few seconds is enough.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Try again
            </button>
            {/* Routed through /logout rather than /login: if the cause is a stale
                or unusable session, going straight to the login page lets the
                middleware see the cookie again and bounce straight back here. */}
            <Link
              href="/logout"
              className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Sign out and start over
            </Link>
          </div>

          {error.digest && (
            <p className="mt-5 border-t border-slate-200 pt-4 text-xs text-slate-500">
              If this keeps happening, quote this reference when asking for help:{' '}
              <span className="font-mono text-slate-700">{error.digest}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
