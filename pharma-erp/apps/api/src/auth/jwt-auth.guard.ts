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

import { AUTH_ALLOW_PASSWORD_CHANGE_KEY, AUTH_PUBLIC_KEY } from './auth.decorators';
import { TokenService } from './token.service';

/**
 * Authenticates every request and establishes the tenant.
 *
 * Registered as a global guard, so authentication is the default: a new
 * controller is protected the moment it is written, and exposing it requires an
 * explicit `@Public('reason')`. The alternative — opt-in guards — means the
 * endpoints nobody thought about are exactly the unprotected ones.
 *
 * Two-stage identity resolution, and the second stage is the important one:
 *   1. Verify the token's signature and expiry. That yields a user id and a
 *      tenant id, and nothing else — deliberately, since a token's claims are
 *      frozen at the moment it was issued.
 *   2. Re-read the account from Postgres. Role, status and the
 *      must-change-password flag all come from there, so disabling a user or
 *      demoting them takes effect on their very next request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
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

    const claims = await this.tokens.verify(token);

    if (!claims) {
      // Deliberately vague: distinguishing "expired" from "bad signature" tells
      // an attacker which knob to turn.
      throw new UnauthorizedException('Invalid or expired session.');
    }

    if (claims.scope !== 'tenant') {
      // A validly-signed PLATFORM token. Refusing it here — rather than letting
      // the user lookup miss — means the log says what actually happened, and a
      // platform operator gets a comprehensible error instead of "no session".
      this.logger.warn(`Rejected a '${claims.scope}' token on a tenant route`);
      throw new UnauthorizedException('This session is not valid for the application.');
    }

    // Guaranteed by TokenService for a tenant-scoped token, but narrowing it
    // here keeps the type honest rather than asserting non-null.
    if (!claims.tid) {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    const store = this.tenantContext.get();

    if (!store) {
      throw new UnauthorizedException(
        'Request context is missing; RequestContextMiddleware did not run for this route.',
      );
    }

    const identity = await this.prisma.resolveIdentity(claims.tid, claims.sub);

    if (!identity) {
      // A validly-signed token for an account that has since been deleted, or
      // whose company has been removed.
      throw new UnauthorizedException('Invalid or expired session.');
    }

    if (identity.status === 'DISABLED') {
      throw new ForbiddenException('This account has been disabled by an administrator.');
    }

    if (identity.status === 'INVITED') {
      // No password set, so no session should exist. Reaching here means a
      // token outlived an account being reverted to INVITED.
      throw new ForbiddenException('This account is not active. Contact your administrator.');
    }

    if (identity.tenantStatus === 'SUSPENDED') {
      throw new ForbiddenException('This company account is suspended.');
    }

    if (!isUserRole(identity.role)) {
      // Only reachable if the Prisma enum and @pharma-erp/types have drifted,
      // which assertRoleEnumsInSync prevents at boot. Refuse rather than guess.
      this.logger.error(`User ${identity.userId} has unrecognised role ${identity.role}`);
      throw new ForbiddenException('Account role is not recognised. Contact your administrator.');
    }

    store.tenantId = identity.tenantId;
    store.userId = identity.userId;
    store.role = identity.role;
    store.mustChangePassword = identity.mustChangePassword;

    // A temporary password is a shared secret until replaced, so the account is
    // confined to the change-password flow until then. Enforced here rather
    // than per-controller so a new endpoint is covered without being told.
    if (identity.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
        AUTH_ALLOW_PASSWORD_CHANGE_KEY,
        [context.getHandler(), context.getClass()],
      );

      if (!allowed) {
        throw new ForbiddenException('You must change your password before continuing.');
      }
    }

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
