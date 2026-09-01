import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { READ_ONLY_ROLES, USER_ROLE_LABELS, type UserRole } from '@pharma-erp/types';

import { TenantContextService } from '../tenant/tenant-context.service';

import { AUTH_PUBLIC_KEY, AUTH_ROLES_KEY } from './auth.decorators';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Enforces `@Roles(...)` and the platform-wide read-only rule.
 *
 * Runs after ClerkAuthGuard (guard order follows registration order), so the
 * request context already carries a resolved role.
 *
 * Two independent checks:
 *   1. If the route names roles, the caller's role must be among them.
 *   2. A read-only role is refused on any mutating verb, whatever the route
 *      says. Management can see everything and change nothing, and encoding
 *      that once here is safer than trusting eight controllers to remember to
 *      leave MANAGEMENT out of every write.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<string | undefined>(AUTH_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const role = this.tenantContext.get()?.role;

    // No role yet means the caller is authenticated but pre-onboarding, which
    // ClerkAuthGuard has already decided is acceptable for this route. There is
    // no role to check, and no tenant data to reach.
    if (!role) return true;

    if (READ_ONLY_ROLES.includes(role) && MUTATING_METHODS.has(request.method.toUpperCase())) {
      throw new ForbiddenException(
        `${USER_ROLE_LABELS[role]} has read-only access and cannot modify records.`,
      );
    }

    const allowed = this.reflector.getAllAndOverride<UserRole[] | undefined>(AUTH_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles means "any authenticated member of the tenant", which is the
    // right default for reads. Writes should always name their roles.
    if (!allowed || allowed.length === 0) return true;

    if (!allowed.includes(role)) {
      throw new ForbiddenException(
        `This action requires one of: ${allowed
          .map((candidate) => USER_ROLE_LABELS[candidate])
          .join(', ')}. Your role is ${USER_ROLE_LABELS[role]}.`,
      );
    }

    return true;
  }
}
