import type { UserRole } from './roles';

/**
 * Per-request state carried through the request scope, so nothing has to thread
 * the tenant through every function signature.
 *
 * Mutable by design, and filled in two stages: middleware creates it with a
 * `requestId` before anything is known about the caller, then the auth guard
 * populates the identity fields once the token is verified and the user
 * resolved. A frozen object would force the guard to re-enter the async store,
 * which would put the controller in a different context than the middleware.
 */
export interface RequestContext {
  /** Correlation id, echoed as the `x-request-id` header and stored on audit rows. */
  readonly requestId: string;
  /** UUID of the tenant this request acts for; null before authentication. */
  tenantId: string | null;
  /** User.id (UUID); null before authentication and for system/background work. */
  userId: string | null;
  role: UserRole | null;
  /**
   * True when the signed-in user must replace an administrator-set password.
   * Every route except change-password is refused while it holds.
   */
  mustChangePassword: boolean;
}

/**
 * The identity fields once authentication has succeeded and a tenant exists.
 * Handlers that reach the database work with this, never with the nullable form.
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly role: UserRole | null;
}

/**
 * Postgres session variable read by every tenant-isolation RLS policy. Kept
 * here so the migration SQL, the Prisma client extension and the API all refer
 * to one name rather than three string literals that can drift apart.
 */
export const PG_TENANT_SETTING = 'app.current_tenant_id';

/**
 * Postgres session variable carrying the email being authenticated, read by the
 * `users_login_lookup` RLS policy. That policy is the only way to resolve an
 * account before its tenant is known, so this name is load-bearing too.
 */
export const PG_LOGIN_EMAIL_SETTING = 'app.current_login_email';
