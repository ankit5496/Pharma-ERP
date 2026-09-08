import type { Metadata } from 'next';
import type { StatWidget, TenantDashboard } from '@pharma-erp/types';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/**
 * The signed-in user's dashboard.
 *
 * Every section here comes from the API, which decides what this role may see.
 * The page renders what arrives rather than fetching everything and hiding
 * some of it — a dashboard that filters client-side has already sent the data.
 */
export default async function DashboardPage() {
  const user = await requireSession();
  const result = await apiFetch<TenantDashboard>('/api/v1/dashboard', { authenticated: true });

  return (
    <AppShell user={user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        {!result.ok ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            Could not load your dashboard: {result.error}
          </p>
        ) : (
          <DashboardContent data={result.data} />
        )}
      </main>
    </AppShell>
  );
}

function DashboardContent({ data }: { data: TenantDashboard }) {
  return (
    <>
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          {data.roleLabel}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {data.headline}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          {data.company.name} · <span className="font-mono text-xs">{data.company.slug}</span> ·{' '}
          {data.company.timezone}
        </p>
      </header>

      {/* The identity panel: who you are, what company, what you can do. Stated
          explicitly because in a multi-tenant system acting in the wrong company
          or believing you have authority you lack are both real hazards. */}
      <section
        aria-labelledby="your-access"
        className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="your-access" className="text-base font-semibold text-slate-900">
              Your access
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {data.readOnly
                ? 'You can view every module but cannot create or change records.'
                : 'Enforced by the API and by row-level security, not by this page.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              label={data.company.status}
              tone={data.company.status === 'ACTIVE' ? 'ok' : 'warn'}
            />
            {data.readOnly && <Badge label="Read-only" tone="warn" />}
            {!data.company.drugLicenceNumber && <Badge label="No licence on file" tone="warn" />}
          </div>
        </div>

        <ul className="mt-5 flex flex-wrap gap-2">
          {data.accessibleModules.map((module) => (
            <li
              key={module}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium capitalize text-slate-700"
            >
              {module}
            </li>
          ))}
        </ul>
      </section>

      {data.companyStats && <CompanyStatsPanel stats={data.companyStats} />}

      <div className="space-y-6">
        {data.sections.map((section) => (
          <section
            key={section.key}
            aria-labelledby={`section-${section.key}`}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 id={`section-${section.key}`} className="text-base font-semibold text-slate-900">
              {section.title}
            </h2>
            {section.note && <p className="mt-1 text-sm text-slate-500">{section.note}</p>}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.widgets.map((widget) => (
                <Widget key={widget.key} widget={widget} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section
        aria-labelledby="recent-activity"
        className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 id="recent-activity" className="text-base font-semibold text-slate-900">
            Recent activity
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {data.role === 'ADMIN' || data.role === 'MANAGEMENT'
              ? 'Everything at this company. Append-only — these records cannot be edited by anyone.'
              : 'Your own activity. Append-only and cannot be edited.'}
          </p>
        </div>

        {data.recentActivity.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recentActivity.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-6 py-3 text-sm"
              >
                <span className="font-medium text-slate-800">
                  {entry.action.toLowerCase()} · {entry.entityType}
                </span>
                <span className="text-xs text-slate-500">
                  {entry.actor ?? 'system'} ·{' '}
                  {new Date(entry.at).toISOString().slice(0, 16).replace('T', ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function CompanyStatsPanel({ stats }: { stats: NonNullable<TenantDashboard['companyStats']> }) {
  return (
    <section
      aria-labelledby="company-stats"
      className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 id="company-stats" className="text-base font-semibold text-slate-900">
        Company
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Since {new Date(stats.createdAt).toISOString().slice(0, 10)} ·{' '}
        {stats.auditRecordCount.toLocaleString()} audit records
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Users" value={stats.users.total} />
        <Tile label="Active" value={stats.users.active} tone="ok" />
        <Tile
          label="Awaiting password change"
          value={stats.users.pendingPasswordChange}
          tone={stats.users.pendingPasswordChange > 0 ? 'warn' : 'neutral'}
        />
        <Tile label="Disabled" value={stats.users.disabled} />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="pb-2 pr-4 font-medium">
                Role
              </th>
              <th scope="col" className="pb-2 font-medium">
                People
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stats.users.byRole.map((row) => (
              <tr key={row.role}>
                <th scope="row" className="py-2 pr-4 font-normal text-slate-700">
                  {row.label}
                </th>
                <td
                  className={`py-2 tabular-nums ${
                    row.count === 0 ? 'text-slate-400' : 'font-medium text-slate-900'
                  }`}
                >
                  {row.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * A single statistic.
 *
 * A `pending` widget shows an em dash and a note, never a zero. A zero is a
 * claim — "there are no expiring batches" — and in a pharma system that claim
 * being wrong is worse than an obvious gap.
 */
function Widget({ widget }: { widget: StatWidget }) {
  if (widget.state === 'pending') {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">{widget.label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-300">—</p>
        <p className="mt-1 text-xs text-slate-400">Not built yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{widget.label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{widget.value}</p>
      {widget.detail && <p className="mt-1 text-xs text-slate-500">{widget.detail}</p>}
    </div>
  );
}

function Tile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'ok' | 'warn';
}) {
  const toneClass = {
    neutral: 'text-slate-900',
    ok: 'text-status-ok',
    warn: 'text-status-warn',
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: 'ok' | 'warn' }) {
  const toneClass =
    tone === 'ok'
      ? 'bg-green-50 text-green-800 ring-green-200'
      : 'bg-amber-50 text-amber-800 ring-amber-200';

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${toneClass}`}
    >
      {label}
    </span>
  );
}
