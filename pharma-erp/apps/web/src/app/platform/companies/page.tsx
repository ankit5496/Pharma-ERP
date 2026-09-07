import type { Metadata } from 'next';
import { PLATFORM_ROUTES, type CompanyListItem } from '@pharma-erp/types';

import { platformFetch, requirePlatformSession } from '@/lib/platform-session';

import { PlatformShell } from '../platform-shell';
import { CompanyStatusControl } from './company-status';
import { CreateCompanyForm } from './create-company-form';

export const metadata: Metadata = { title: 'Companies' };
export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const operator = await requirePlatformSession();
  const result = await platformFetch<CompanyListItem[]>('/api/v1/platform/companies');

  return (
    <PlatformShell operator={operator} active={PLATFORM_ROUTES.companies}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Companies</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Every tenant on this deployment. Each is fully isolated from the others at the database
            level.
          </p>
        </header>

        <div className="mb-8">
          <CreateCompanyForm />
        </div>

        <section className="rounded-lg border border-slate-700 bg-slate-800/40">
          <div className="border-b border-slate-700 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-100">
              {result.ok
                ? `${result.data.length} compan${result.data.length === 1 ? 'y' : 'ies'}`
                : 'Companies'}
            </h2>
          </div>

          {!result.ok ? (
            <p className="p-6 text-sm text-red-200">Could not load companies: {result.error}</p>
          ) : result.data.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              No companies yet. Create the first one above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-6 py-3 font-medium">
                      Company
                    </th>
                    <th scope="col" className="px-6 py-3 font-medium">
                      Users
                    </th>
                    <th scope="col" className="px-6 py-3 font-medium">
                      Licence
                    </th>
                    <th scope="col" className="px-6 py-3 font-medium">
                      Last activity
                    </th>
                    <th scope="col" className="px-6 py-3 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {result.data.map((company) => (
                    <tr key={company.id}>
                      <td className="px-6 py-4 align-top">
                        <p className="font-medium text-slate-100">{company.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">{company.slug}</p>
                        <p className="text-xs text-slate-500">{company.timezone}</p>
                      </td>

                      <td className="px-6 py-4 align-top text-slate-300">
                        <p className="tabular-nums">{company.userCount} total</p>
                        <p className="text-xs text-slate-500">
                          {company.adminCount} admin{company.adminCount === 1 ? '' : 's'} ·{' '}
                          {company.activeUserCount} active
                        </p>
                      </td>

                      <td className="px-6 py-4 align-top text-xs text-slate-400">
                        {company.drugLicenceNumber ? (
                          <span className="font-mono">{company.drugLicenceNumber}</span>
                        ) : (
                          <span className="text-amber-300">Not set</span>
                        )}
                        {company.gstin && (
                          <p className="mt-1 font-mono text-slate-500">{company.gstin}</p>
                        )}
                      </td>

                      <td className="px-6 py-4 align-top text-xs text-slate-400">
                        {company.lastActivityAt
                          ? new Date(company.lastActivityAt)
                              .toISOString()
                              .slice(0, 16)
                              .replace('T', ' ')
                          : 'Never signed in'}
                      </td>

                      <td className="px-6 py-4 align-top">
                        <CompanyStatusControl company={company} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          You cannot see inside a company from here — no user lists, no records. That is deliberate:
          row-level security scopes every application query to one tenant, and this console reads
          only aggregate counts. To act inside a company, its own Admin does so.
        </p>
      </main>
    </PlatformShell>
  );
}
