import Link from 'next/link';
import type { ReactNode } from 'react';
import { PLATFORM_ROUTES, type PlatformSessionUser } from '@pharma-erp/types';

import { platformLogoutAction } from './actions';

const NAV = [
  { label: 'Overview', href: PLATFORM_ROUTES.dashboard },
  { label: 'Companies', href: PLATFORM_ROUTES.companies },
] as const;

/**
 * Chrome for the platform console.
 *
 * Dark, unlike the tenant application's light chrome. That is a deliberate
 * safety signal rather than decoration: a Super User can see and change every
 * customer's company, and the surface they are on should be unmistakable at a
 * glance. The banner states the authority level explicitly for the same reason.
 */
export function PlatformShell({
  operator,
  active,
  children,
}: {
  operator: PlatformSessionUser;
  active: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-700 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Pharma ERP
            </p>
            <p className="text-sm font-semibold text-slate-100">Platform console</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-100">{operator.fullName}</p>
              <p className="text-xs text-slate-400">{operator.email}</p>
            </div>

            <Link
              href={PLATFORM_ROUTES.changePassword}
              className="hidden rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 sm:block"
            >
              Password
            </Link>

            <form action={platformLogoutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav aria-label="Platform" className="mx-auto max-w-6xl px-6">
          <ul className="-mb-px flex gap-1">
            {NAV.map((item) => {
              const isActive = active === item.href;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'border-slate-100 text-slate-100'
                        : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <p
        role="status"
        className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-center text-xs font-medium text-amber-200"
      >
        Platform authority — you can see and change every company on this deployment.
      </p>

      {children}
    </div>
  );
}
