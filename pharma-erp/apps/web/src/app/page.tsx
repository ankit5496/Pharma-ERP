import { redirect } from 'next/navigation';
import { AUTH_ROUTES, PLATFORM_ROUTES } from '@pharma-erp/types';

import { getPlatformToken } from '@/lib/platform-session';
import { getSessionToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The root sends you wherever you already belong.
 *
 * It checks BOTH session cookies, because the two surfaces are independent: a
 * platform operator who visits the root should reach their console, not the
 * tenant sign-in page for an account they do not have.
 *
 * Tenant first when both cookies are present. A platform operator demonstrating
 * a customer's account has the tenant session as the one they are actively
 * using, and the console remains one click away in either case.
 *
 * Only cookie PRESENCE is checked — validating either would cost an API round
 * trip on every visit to "/". A stale cookie is handled one hop later: the
 * destination page's session check fails and routes through /logout, which
 * clears it.
 */
export default async function HomePage() {
  const [tenantToken, platformToken] = await Promise.all([getSessionToken(), getPlatformToken()]);

  if (tenantToken) redirect(AUTH_ROUTES.afterLogin);
  if (platformToken) redirect(PLATFORM_ROUTES.dashboard);

  redirect(AUTH_ROUTES.login);
}
