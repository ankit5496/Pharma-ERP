import { redirect } from 'next/navigation';
import { AUTH_ROUTES, type SessionResponse, type SessionUser } from '@pharma-erp/types';

import { apiFetch, type ApiResult } from './api';

/**
 * Fetches the caller's session from the API.
 *
 * The API — not Clerk — is the source of truth for tenant and role. Clerk knows
 * only that someone is signed in; which company they belong to and what they may
 * do lives in our Postgres, so revoking a role takes effect on the next request
 * rather than when a token happens to expire.
 */
export async function getSession(): Promise<ApiResult<SessionResponse>> {
  return apiFetch<SessionResponse>('/api/v1/me', { authenticated: true });
}

/**
 * Session for a page that requires a fully onboarded user.
 *
 * Redirects rather than returning an error, because there is exactly one correct
 * destination for each failure and every protected page wants the same one:
 *   - no Clerk session      → /sign-in  (normally already handled by middleware)
 *   - session, no company   → /onboarding
 *   - account disabled      → /sign-in?reason=disabled
 *
 * Call this at the top of a protected server component. It never returns a
 * half-valid session.
 */
export async function requireSession(): Promise<SessionUser> {
  const result = await getSession();

  if (!result.ok) {
    if (result.status === 401) redirect(AUTH_ROUTES.signIn);

    // A 403 here means authenticated-but-not-onboarded on a route that does not
    // tolerate it, which is the same remedy as onboarded: false.
    if (result.status === 403) redirect(AUTH_ROUTES.onboarding);

    // Anything else — the API is down, a 500, a timeout — is not something the
    // user can fix by navigating. Surface it rather than bouncing them around.
    throw new Error(`Could not load your session: ${result.error}`);
  }

  if (!result.data.onboarded) {
    if (result.data.reason === 'DISABLED') {
      redirect(`${AUTH_ROUTES.signIn}?reason=disabled`);
    }

    redirect(AUTH_ROUTES.onboarding);
  }

  return result.data.user;
}

/**
 * Session for the onboarding page, which is the mirror image: it needs a Clerk
 * session but must NOT have a company yet. An already-onboarded user landing
 * here is sent to their dashboard instead of being offered a second company.
 */
export async function requirePreOnboardingSession(): Promise<void> {
  const result = await getSession();

  if (!result.ok) {
    if (result.status === 401) redirect(AUTH_ROUTES.signIn);
    // A 403 is the pre-onboarding state on a stricter route — exactly where we
    // want to be. Anything else is a real failure.
    if (result.status !== 403) {
      throw new Error(`Could not load your session: ${result.error}`);
    }
    return;
  }

  if (result.data.onboarded) redirect('/dashboard');

  if (result.data.reason === 'DISABLED') redirect(`${AUTH_ROUTES.signIn}?reason=disabled`);
}
