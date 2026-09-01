import type { Metadata } from 'next';
import { ROLE_MODULES, USER_ROLE_LABELS, USER_ROLES } from '@pharma-erp/types';

import { AppShell } from '@/components/app-shell';
import { fetchHealth } from '@/lib/api';
import { env } from '@/lib/env';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Dashboard' };

// The session and the health probe are both per-request live reads.
export const dynamic = 'force-dynamic';

/**
 * Placeholder dashboard for a signed-in user.
 *
 * Two jobs today: prove the web app, the API and Postgres are all talking, and
 * show what the signed-in user's role actually grants them.
 */
export default async function DashboardPage() {
  // Redirects to /sign-in or /onboarding as appropriate; never returns a
  // half-valid session.
  const user = await requireSession();
  const health = await fetchHealth();

  const allowed = ROLE_MODULES[user.role];

  return (
    <AppShell user={user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Welcome, {user.fullName.split(' ')[0]}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Signed in as {USER_ROLE_LABELS[user.role]} at {user.tenantName} (
            <span className="font-mono text-xs">{user.tenantSlug}</span>).
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <section
            aria-labelledby="your-access"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"
          >
            <h2 id="your-access" className="text-base font-semibold text-slate-900">
              Your access
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              What {USER_ROLE_LABELS[user.role]} can open. Enforced by the API, not by this page.
            </p>

            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {allowed.map((appModule) => (
                <li
                  key={appModule}
                  className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm capitalize text-slate-700"
                >
                  <span aria-hidden className="text-status-ok">
                    ●
                  </span>
                  {appModule}
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="api-connectivity"
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="api-connectivity" className="text-base font-semibold text-slate-900">
                  System status
                </h2>
                <p className="mt-1 truncate font-mono text-xs text-slate-500">
                  {env.apiUrl}/health
                </p>
              </div>
              <StatusBadge
                label={health.ok ? health.data.status : 'unreachable'}
                tone={
                  health.ok && health.data.status === 'ok' ? 'ok' : health.ok ? 'warn' : 'error'
                }
              />
            </div>

            {health.ok ? (
              <dl className="mt-5 space-y-3 text-sm">
                <Row label="Environment" value={health.data.environment} />
                <Row label="Version" value={health.data.version} />
                <Row label="Uptime" value={formatUptime(health.data.uptimeSeconds)} />
                <Row
                  label="Database"
                  value={
                    health.data.checks.database.status === 'up'
                      ? `up · ${health.data.checks.database.latencyMs ?? '?'}ms`
                      : 'down'
                  }
                  tone={health.data.checks.database.status === 'up' ? 'ok' : 'error'}
                />
              </dl>
            ) : (
              <p className="mt-5 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {health.error}
              </p>
            )}
          </section>
        </div>

        <section
          aria-labelledby="roles-overview"
          className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 id="roles-overview" className="text-base font-semibold text-slate-900">
            Roles in this system
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            An administrator assigns one of these when inviting a colleague. Nobody chooses their
            own role.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    Role
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Modules
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {USER_ROLES.map((role) => (
                  <tr key={role} className={role === user.role ? 'bg-slate-50' : undefined}>
                    <th scope="row" className="py-2.5 pr-4 font-medium text-slate-900">
                      {USER_ROLE_LABELS[role]}
                      {role === user.role && (
                        <span className="ml-2 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          You
                        </span>
                      )}
                    </th>
                    <td className="py-2.5 text-slate-600">
                      {ROLE_MODULES[role].length === 9
                        ? 'All modules'
                        : ROLE_MODULES[role].join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Row({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'ok' | 'error';
}) {
  const toneClass =
    tone === 'ok' ? 'text-status-ok' : tone === 'error' ? 'text-status-error' : 'text-slate-900';

  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-medium ${toneClass}`}>{value}</dd>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'error' }) {
  const toneClass = {
    ok: 'bg-green-50 text-green-800 ring-green-200',
    warn: 'bg-amber-50 text-amber-800 ring-amber-200',
    error: 'bg-red-50 text-red-800 ring-red-200',
  }[tone];

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${toneClass}`}
    >
      {label}
    </span>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
