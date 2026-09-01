import { SetMetadata } from '@nestjs/common';

import type { UserRole } from '@pharma-erp/types';

export const AUTH_PUBLIC_KEY = 'auth:public';
export const AUTH_ALLOW_NO_TENANT_KEY = 'auth:allowNoTenant';
export const AUTH_ROLES_KEY = 'auth:roles';

/**
 * Marks a route as reachable without a Clerk session.
 *
 * The auth guard is global, so authentication is the default and this is the
 * only way out — the same inversion the audit interceptor uses. Anything marked
 * `@Public()` is internet-facing and must assume a hostile caller.
 *
 * @param reason kept in the code so a reviewer can judge the exposure without
 *   reading the handler.
 */
export const Public = (reason: string): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTH_PUBLIC_KEY, reason);

/**
 * Requires a valid Clerk session but NOT a tenant.
 *
 * Exactly one situation needs this: the window between "registered with Clerk"
 * and "created a company". `GET /me` has to be able to answer "you have no
 * tenant yet", and `POST /onboarding/company` has to be callable in order to
 * create one. Everything else must have a tenant, or the request has no
 * business touching tenant-scoped data.
 */
export const AllowNoTenant = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTH_ALLOW_NO_TENANT_KEY, true);

/**
 * Restricts a route to the listed roles.
 *
 * Without it a route is open to every authenticated member of the tenant, which
 * is the right default for reads. Writes should always name their roles.
 *
 * MANAGEMENT is read-only platform-wide and is rejected on any mutating verb
 * regardless of what is listed here — see RolesGuard.
 *
 * @example
 * ```ts
 * @Roles('ADMIN', 'QUALITY_OFFICER')
 * @Patch(':id/release')
 * release() {}
 * ```
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTH_ROLES_KEY, roles);
