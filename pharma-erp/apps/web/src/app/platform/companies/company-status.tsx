'use client';

import { useState, useTransition } from 'react';
import type { CompanyListItem } from '@pharma-erp/types';

import { updateCompanyAction } from '../actions';

/**
 * Changes a company's status.
 *
 * SUSPENDED is not cosmetic: the tenant auth guard re-reads tenant status on
 * every request, so suspending a company stops its users mid-session rather
 * than when their tokens happen to expire.
 */
export function CompanyStatusControl({ company }: { company: CompanyListItem }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <select
        aria-label={`Status for ${company.name}`}
        value={company.status}
        disabled={isPending}
        onChange={(event) => {
          const status = event.target.value as CompanyListItem['status'];

          if (status === 'SUSPENDED') {
            const ok = window.confirm(
              `Suspend ${company.name}? Every user there is signed out immediately and cannot sign back in.`,
            );
            if (!ok) return;
          }

          setError(null);
          startTransition(async () => {
            const result = await updateCompanyAction(company.id, { status });
            if (!result.ok) setError(result.error ?? 'Could not update the company.');
          });
        }}
        className="field-dark-sm"
      >
        <option value="TRIAL">Trial</option>
        <option value="ACTIVE">Active</option>
        <option value="SUSPENDED">Suspended</option>
      </select>

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
