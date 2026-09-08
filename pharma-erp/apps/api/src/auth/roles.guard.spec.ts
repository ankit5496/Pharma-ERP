import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RequestContext, UserRole } from '@pharma-erp/types';

import { TenantContextService } from '../tenant/tenant-context.service';

import { AUTH_PUBLIC_KEY, AUTH_ROLES_KEY } from './auth.decorators';
import { RolesGuard } from './roles.guard';

/** Minimal ExecutionContext double — the guard uses only these four members. */
function makeContext(method: string): ExecutionContext {
  // The guard only uses this as a metadata key, never calls it.
  const handler = function handler() {
    return undefined;
  };
  class TestController {}

  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  } as unknown as ExecutionContext;
}

function makeStore(role: UserRole | null): RequestContext {
  return {
    requestId: 'test-request',
    tenantId: role ? 'e6a1b0c2-1111-4222-8333-444455556666' : null,
    userId: role ? 'a1b2c3d4-5555-4666-8777-888899990000' : null,
    role,
    mustChangePassword: false,
  };
}

/**
 * Builds a guard whose Reflector returns fixed metadata and whose context holds
 * a fixed role, so each case exercises one decision.
 */
function makeGuard(options: {
  role: UserRole | null;
  allowedRoles?: UserRole[];
  isPublic?: boolean;
}): RolesGuard {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
    if (key === AUTH_PUBLIC_KEY) return options.isPublic ? 'public for a test reason' : undefined;
    if (key === AUTH_ROLES_KEY) return options.allowedRoles;
    return undefined;
  });

  const tenantContext = new TenantContextService();
  jest.spyOn(tenantContext, 'get').mockReturnValue(makeStore(options.role));

  return new RolesGuard(reflector, tenantContext);
}

describe('RolesGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('read-only roles', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'refuses MANAGEMENT on %s regardless of @Roles',
      (method) => {
        // The point of the rule: even a route that explicitly lists MANAGEMENT
        // must not let it write. Encoding this once beats trusting every
        // controller to leave MANAGEMENT out of every mutation.
        const guard = makeGuard({ role: 'MANAGEMENT', allowedRoles: ['MANAGEMENT', 'ADMIN'] });

        expect(() => guard.canActivate(makeContext(method))).toThrow(ForbiddenException);
      },
    );

    it('allows MANAGEMENT to read', () => {
      const guard = makeGuard({ role: 'MANAGEMENT' });

      expect(guard.canActivate(makeContext('GET'))).toBe(true);
    });
  });

  describe('@Roles', () => {
    it('allows a listed role', () => {
      const guard = makeGuard({
        role: 'QUALITY_OFFICER',
        allowedRoles: ['ADMIN', 'QUALITY_OFFICER'],
      });

      expect(guard.canActivate(makeContext('PATCH'))).toBe(true);
    });

    it('refuses an unlisted role', () => {
      const guard = makeGuard({
        role: 'SALES_MANAGER',
        allowedRoles: ['ADMIN', 'QUALITY_OFFICER'],
      });

      expect(() => guard.canActivate(makeContext('PATCH'))).toThrow(ForbiddenException);
    });

    it('names the required roles in the error, so the message is actionable', () => {
      const guard = makeGuard({ role: 'ACCOUNTANT', allowedRoles: ['QUALITY_OFFICER'] });

      expect(() => guard.canActivate(makeContext('POST'))).toThrow(/Quality \/ Compliance Officer/);
    });

    it('allows any authenticated role when the route lists none', () => {
      // No @Roles means "any member of the tenant", which is the right default
      // for reads; writes are expected to name their roles.
      const guard = makeGuard({ role: 'STORE_OFFICER' });

      expect(guard.canActivate(makeContext('GET'))).toBe(true);
    });
  });

  it('skips every check on a @Public route', () => {
    const guard = makeGuard({ role: null, isPublic: true, allowedRoles: ['ADMIN'] });

    expect(guard.canActivate(makeContext('POST'))).toBe(true);
  });

  it('passes a pre-onboarding request through — there is no role to check yet', () => {
    // JwtAuthGuard has already decided whether a tenantless request may reach
    // this route; with no role there is no role decision to make, and no
    // tenant-scoped data reachable either.
    const guard = makeGuard({ role: null });

    expect(guard.canActivate(makeContext('POST'))).toBe(true);
  });
});
