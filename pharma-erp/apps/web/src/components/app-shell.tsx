import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  READ_ONLY_ROLES,
  ROLE_MODULES,
  USER_ROLE_LABELS,
  type AppModule,
  type SessionUser,
} from '@pharma-erp/types';

/**
 * Navigation for each feature area. The `module` field is what gates it: a role
 * sees an item only if ROLE_MODULES lists that module for them.
 *
 * `href: null` marks an area that is planned but not built yet — rendered as a
 * disabled row rather than omitted, so the shape of the product is visible
 * without offering links that 404.
 */
const NAV: readonly { module: AppModule; label: string; href: string | null }[] = [
  { module: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { module: 'masters', label: 'Items & parties', href: null },
  { module: 'purchase', label: 'Purchase', href: null },
  { module: 'inventory', label: 'Inventory & batches', href: null },
  { module: 'production', label: 'Production', href: null },
  { module: 'quality', label: 'Quality & release', href: null },
  { module: 'sales', label: 'Sales', href: null },
  { module: 'accounts', label: 'Accounts', href: null },
  { module: 'admin', label: 'Users & settings', href: null },
];

/**
 * Chrome for every signed-in page: company header, role-filtered navigation,
 * account menu.
 *
 * The navigation is filtered from the same ROLE_MODULES table the API's guard
 * consults, so a user cannot be shown a menu item they would be refused on. To
 * be clear about what this is and isn't: hiding a link is a usability measure,
 * not a security boundary — the enforcement is RolesGuard plus row-level
 * security, both of which hold regardless of what the browser renders.
 */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const allowed = ROLE_MODULES[user.role];
  const visible = NAV.filter((item) => allowed.includes(item.module));
  const isReadOnly = READ_ONLY_ROLES.includes(user.role);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Pharma ERP
            </p>
            <p className="truncate text-sm font-semibold text-slate-900">{user.tenantName}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
              <p className="text-xs text-slate-500">{USER_ROLE_LABELS[user.role]}</p>
            </div>
            <UserButton />
          </div>
        </div>

        <nav aria-label="Main" className="mx-auto max-w-6xl px-6">
          <ul className="-mb-px flex gap-1 overflow-x-auto">
            {visible.map((item) => (
              <li key={item.module}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="inline-block whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    title="Not built yet"
                    className="inline-block cursor-not-allowed whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-slate-300"
                  >
                    {item.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {isReadOnly && (
        <p
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-xs font-medium text-amber-900"
        >
          Read-only access — you can view every module but cannot create or change records.
        </p>
      )}

      {user.status === 'INVITED' && (
        <p
          role="status"
          className="border-b border-slate-200 bg-slate-100 px-6 py-2 text-center text-xs font-medium text-slate-700"
        >
          Your account is pending activation by an administrator.
        </p>
      )}

      {children}
    </div>
  );
}
