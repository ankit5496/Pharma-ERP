import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AUTH_ROUTES, PLATFORM_ROUTES } from '@pharma-erp/types';

import { getSessionToken } from '@/lib/session';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Pharma ERP.',
};

// Reads a cookie, so it can never be static.
export const dynamic = 'force-dynamic';

/**
 * Sign-in page.
 *
 * There is no "create an account" link, and no social sign-in. Accounts are
 * created by an administrator inside the application; the platform operator
 * creates each company and its first Admin from a CLI. Nothing self-registers,
 * which is what removes public signup as an attack surface entirely.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  // An already-signed-in user has no business here. Only the presence of a
  // token is checked — validating it would cost an API round trip on a page
  // whose whole job is to be fast and always available.
  if (await getSessionToken()) redirect(AUTH_ROUTES.afterLogin);

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
          Use the email address and password your administrator gave you.
        </p>
      </header>

      {expired === '1' && (
        <div
          role="status"
          className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-medium">Your session ended.</p>
          <p className="mt-1">
            Sign in again. This also happens if an administrator disabled your account or changed
            your role.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <LoginForm />
      </div>

      <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">No account?</p>
        <p className="mt-1">
          Accounts are created by your company&rsquo;s administrator. Ask them to add you and assign
          your role. Forgotten your password? They can set a new one.
        </p>
      </div>

      {/* Deliberately understated. Company staff are the overwhelming majority
          of visitors and should not have to read past an option that is not for
          them, while platform operators get one click instead of a memorised
          URL. Safe to surface because the console is dark-themed and banners its
          authority, so it cannot be entered by accident — and because
          /platform/login answers whether or not it is linked, so this reveals
          nothing an attacker could not already find. */}
      <p className="mt-8 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
        Platform operator?{' '}
        <Link
          href={PLATFORM_ROUTES.login}
          className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
        >
          Sign in to the console
        </Link>
      </p>
    </div>
  );
}
