import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  PLATFORM_ROUTES,
  PLATFORM_SESSION_COOKIE_NAME,
  type PlatformSessionUser,
} from '@pharma-erp/types';

import { apiFetch, type ApiResult } from './api';

/**
 * The platform session token, from its own httpOnly cookie.
 *
 * A DIFFERENT cookie from the tenant session on purpose: both can coexist in
 * one browser, so a Super User can look at a customer's account in another tab
 * without signing themselves out of the console.
 */
export async function getPlatformToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(PLATFORM_SESSION_COOKIE_NAME)?.value ?? null;
}

/** Calls the platform API with the platform token, never the tenant one. */
export async function platformFetch<T>(
  path: string,
  options: Parameters<typeof apiFetch>[1] = {},
): Promise<ApiResult<T>> {
  const token = await getPlatformToken();

  if (!token) return { ok: false, status: 401, error: 'Not signed in.' };

  return apiFetch<T>(path, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
    // Deliberately NOT `authenticated: true` — that would attach the TENANT
    // cookie, which the platform guard rejects for having the wrong scope.
    authenticated: false,
  });
}

export async function getPlatformSession(): Promise<ApiResult<PlatformSessionUser>> {
  return platformFetch<PlatformSessionUser>('/api/v1/platform/auth/me');
}

/**
 * Session for a page that requires a signed-in Super User.
 *
 * Redirects rather than erroring, because each failure has one correct
 * destination:
 *   - no session / expired  -> /platform/login
 *   - must change password  -> /platform/change-password
 */
export async function requirePlatformSession(): Promise<PlatformSessionUser> {
  const result = await getPlatformSession();

  if (!result.ok) {
    // Through /platform/logout so the stale cookie is cleared first — see
    // the comment in that route handler.
    if (result.status === 401) redirect('/platform/logout?expired=1');
    if (result.status === 403) redirect(PLATFORM_ROUTES.changePassword);

    throw new Error(`Could not load your platform session: ${result.error}`);
  }

  if (result.data.mustChangePassword) redirect(PLATFORM_ROUTES.changePassword);

  return result.data;
}

/** The mirror image: requires a session but tolerates must-change-password. */
export async function requirePlatformSessionAllowingPasswordChange(): Promise<PlatformSessionUser> {
  const result = await getPlatformSession();

  if (!result.ok) {
    // Through /platform/logout so the stale cookie is cleared first — see
    // the comment in that route handler.
    if (result.status === 401) redirect('/platform/logout?expired=1');
    throw new Error(`Could not load your platform session: ${result.error}`);
  }

  return result.data;
}
