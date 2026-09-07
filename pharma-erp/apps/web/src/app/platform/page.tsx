import type { Metadata } from 'next';
import Link from 'next/link';
import { PLATFORM_ROUTES, type PlatformDashboard } from '@pharma-erp/types';

import { platformFetch, requirePlatformSession } from '@/lib/platform-session';

import { PlatformShell } from './platform-shell';

export const metadata: Metadata = { title: 'Platform overview' };
export const dynamic = 'force-dynamic';

/**
 * The Super User dashboard: system-level figures across every company.
 *
 * Every number here is a real count from the database. Nothing is estimated or
 * placeheld, because a platform operator makes commercial decisions from these.
 */
export default async function PlatformDashboardPage() {
  const operator = await requirePlatformSession();
  const result = await platformFetch<PlatformDashboard>('/api/v1/platform/dashboard');

  return (
    <PlatformShell operator={operator} active={PLATFORM_ROUTES.dashboard}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
              System overview
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Across every company on this deployment.
            </p>
          </div>

          <Link
            href={PLATFORM_ROUTES.companies}
            className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white"
          >
            Create a company
          </Link>
        </header>

        {!result.ok ? (
          <p className="rounded-lg border border-red-400/40 bg-red-500/10 p-6 text-sm text-red-200">
            Could not load the overview: {result.error}
          </p>
        ) : (
          <div className="space-y-8">
            <Section title="Companies">
              <Stat label="Total" value={result.data.companies.total} />
              <Stat label="Trial" value={result.data.companies.trial} tone="warn" />
              <Stat label="Active" value={result.data.companies.active} tone="ok" />
              <Stat label="Suspended" value={result.data.companies.suspended} tone="error" />
            </Section>

            <Section title="Users across all companies">
              <Stat label="Total" value={result.data.users.total} />
              <Stat label="Administrators" value={result.data.users.admins} />
              <Stat label="Active" value={result.data.users.active} tone="ok" />
              <Stat
                label="Pending"
                value={result.data.users.pending}
                tone="warn"
                detail="Awaiting first sign-in or a password change"
              />
              <Stat label="Disabled" value={result.data.users.disabled} />
            </Section>

            <Section title="Platform operators">
              <Stat label="Total" value={result.data.platformUsers.total} />
              <Stat label="Active" value={result.data.platformUsers.active} tone="ok" />
            </Section>

            <Section title="Activity & health">
              <Stat label="Sign-ins, last 24h" value={result.data.activity.signInsLast24h} />
              <Stat
                label="Companies added, 30d"
                value={result.data.activity.companiesCreatedLast30d}
              />
              <Stat label="Audit records" value={result.data.health.auditRecordCount} />
              <Stat
                label="Database"
                value={null}
                text={
                  result.data.health.databaseStatus === 'up'
                    ? `up · ${result.data.health.databaseLatencyMs ?? '?'}ms`
                    : 'down'
                }
                tone={result.data.health.databaseStatus === 'up' ? 'ok' : 'error'}
              />
            </Section>

            <section className="rounded-lg border border-slate-700 bg-slate-800/40">
              <div className="border-b border-slate-700 px-6 py-4">
                <h2 className="text-base font-semibold text-slate-100">Recent platform activity</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Append-only. These records cannot be edited or deleted by anyone, including a
                  platform operator.
                </p>
              </div>

              {result.data.activity.recent.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">Nothing recorded yet.</p>
              ) : (
                <ul className="divide-y divide-slate-700/60">
                  {result.data.activity.recent.map((entry, index) => (
                    <li
                      key={`${entry.at}-${index}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 px-6 py-3 text-sm"
                    >
                      <span className="font-medium text-slate-200">
                        {entry.action.replaceAll('_', ' ').toLowerCase()}
                      </span>
                      <span className="text-xs text-slate-400">
                        {entry.entityType}
                        {entry.actor ? ` · ${entry.actor}` : ' · system'} ·{' '}
                        {new Date(entry.at).toISOString().slice(0, 16).replace('T', ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </PlatformShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  text,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: number | null;
  text?: string;
  detail?: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'error';
}) {
  const toneClass = {
    neutral: 'text-slate-100',
    ok: 'text-green-300',
    warn: 'text-amber-300',
    error: 'text-red-300',
  }[tone];

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {text ?? value ?? '—'}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}
