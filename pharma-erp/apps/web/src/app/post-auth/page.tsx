import { redirect } from 'next/navigation';
import { AUTH_ROUTES, ROLE_LANDING_PATH } from '@pharma-erp/types';

import { getSession } from '@/lib/session';

// Never cached: the whole point is to re-read the current session.
export const dynamic = 'force-dynamic';

/**
 * The one place that decides where a signed-in user belongs.
 *
 * Sign-in, the root path, and anything else that needs "send them to the right
 * screen" all land here rather than each guessing for themselves. The decision
 * needs the API's answer — Clerk knows only that a session exists, not whether
 * the user has a company or what role they hold — so it has to happen on the
 * server, after a call to `/me`.
 *
 * This page renders nothing; every branch redirects.
 */
export default async function PostAuthPage() {
  const result = await getSession();

  if (!result.ok) {
    // 401 means no usable Clerk session. 403 means authenticated but with no
    // company, which is onboarding's job.
    if (result.status === 403) redirect(AUTH_ROUTES.onboarding);
    if (result.status === 401) redirect(AUTH_ROUTES.signIn);

    // The API is unreachable or erroring. Redirecting anywhere would either
    // loop or silently hide the outage, so surface it.
    throw new Error(`Could not determine where to send you: ${result.error}. Is the API running?`);
  }

  if (!result.data.onboarded) {
    if (result.data.reason === 'DISABLED') {
      redirect(`${AUTH_ROUTES.signIn}?reason=disabled`);
    }

    redirect(AUTH_ROUTES.onboarding);
  }

  redirect(ROLE_LANDING_PATH[result.data.user.role]);
}
