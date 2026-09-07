import { SetMetadata } from '@nestjs/common';

import type { UserRole } from '@pharma-erp/types';

export const AUTH_PUBLIC_KEY = 'auth:public';
export const AUTH_ALLOW_PASSWORD_CHANGE_KEY = 'auth:allowPasswordChange';
export const AUTH_ROLES_KEY = 'auth:roles';

/**
 * Marks a route as reachable without a session.
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
 * Permits a route while the user still has to replace an administrator-set
 * password.
 *
 * Everything else is refused in that state. An admin-chosen temporary password
 * is a shared secret — the admin knows it, it may have been sent over chat —
 * so the account is not fully the user's until they replace it. Only
 * change-password and reading one's own session need this.
 */
export const AllowPasswordChange = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTH_ALLOW_PASSWORD_CHANGE_KEY, true);

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
