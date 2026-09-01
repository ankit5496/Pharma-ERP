import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { isUserRole } from '@pharma-erp/types';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

import { AUTH_ALLOW_NO_TENANT_KEY, AUTH_PUBLIC_KEY } from './auth.decorators';
import { ClerkService } from './clerk.service';

/**
 * Authenticates every request against Clerk and establishes the tenant.
 *
 * Registered as a global guard, so authentication is the default: a new
 * controller is protected the moment it is written, and exposing it requires an
 * explicit `@Public('reason')`. The alternative — opt-in guards — means the
 * endpoints nobody thought about are exactly the unprotected ones.
 *
 * The two-stage identity resolution matters:
 *   1. Verify the Clerk token locally (signature, expiry, authorised party).
 *      That yields only the Clerk subject.
 *   2. Resolve that subject to OUR user row, which is where tenant and role
 *      live. Reading the role from Postgres rather than from a token claim is
 *      what makes revoking someone's authority take effect immediately.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly clerk: ClerkService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const publicReason = this.reflector.getAllAndOverride<string | undefined>(AUTH_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (publicReason) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    const session = await this.clerk.verifySessionToken(token);

    if (!session) {
      // Deliberately vague: distinguishing "expired" from "bad signature" from
      // "wrong authorised party" tells an attacker which knob to turn.
      throw new UnauthorizedException('Invalid or expired session.');
    }

    const store = this.tenantContext.get();

    if (!store) {
      throw new UnauthorizedException(
        'Request context is missing; RequestContextMiddleware did not run for this route.',
      );
    }

    store.externalAuthId = session.subject;

    const identity = await this.prisma.resolveIdentity(session.subject);

    const allowNoTenant = this.reflector.getAllAndOverride<boolean | undefined>(
      AUTH_ALLOW_NO_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!identity) {
      // A valid Clerk session with no user row: they have registered but not yet
      // created a company. /me and /onboarding must work here; nothing else can.
      if (allowNoTenant) return true;

      throw new ForbiddenException(
        'No company is associated with this account yet. Complete onboarding first.',
      );
    }

    if (identity.status === 'DISABLED') {
      throw new ForbiddenException('This account has been disabled by an administrator.');
    }

    if (identity.tenantStatus === 'SUSPENDED') {
      throw new ForbiddenException('This company account is suspended.');
    }

    if (!isUserRole(identity.role)) {
      // Only reachable if the Prisma enum and @pharma-erp/types have drifted,
      // which assertRoleEnumsInSync is supposed to prevent at boot. Refuse
      // rather than guess at a role.
      this.logger.error(`User ${identity.userId} has unrecognised role ${identity.role}`);
      throw new ForbiddenException('Account role is not recognised. Contact your administrator.');
    }

    store.tenantId = identity.tenantId;
    store.userId = identity.userId;
    store.role = identity.role;

    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;

    const [scheme, value] = header.split(' ');

    // Case-insensitive scheme per RFC 7235; some clients send "bearer".
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;

    return value.trim() || null;
  }
}
