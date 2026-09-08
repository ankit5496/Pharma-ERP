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

import { AUTH_ALLOW_PASSWORD_CHANGE_KEY, AUTH_PUBLIC_KEY } from '../auth/auth.decorators';
import { TokenService } from '../auth/token.service';

import { PlatformDbService } from './platform-db.service';

/** Attached to the request so controllers can read the acting platform user. */
export interface PlatformRequest extends Request {
  platformUser?: {
    id: string;
    email: string;
    fullName: string;
    mustChangePassword: boolean;
  };
}

/**
 * Authenticates platform routes.
 *
 * Applied per-controller rather than globally: the global JwtAuthGuard handles
 * tenant routes, and these two must not both run. A platform user is not in
 * `users`, so the tenant guard would reject them — which is why every platform
 * controller is `@Public()` to the global guard and gated by this one instead.
 * That looks alarming and is worth stating plainly: `@Public` here means "not a
 * TENANT session", not "unauthenticated".
 *
 * Three things are checked, in order:
 *   1. The token verifies AND its scope is 'platform'. A tenant token is
 *      refused here even though its signature is valid.
 *   2. The platform user still exists and is ACTIVE — re-read from the database
 *      on every request, so disabling an operator takes effect immediately.
 *   3. A must-change-password operator is confined to the change-password route.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  private readonly logger = new Logger(PlatformGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly platformDb: PlatformDbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<PlatformRequest>();

    // Platform sign-in itself needs no session, and is marked with a distinct
    // metadata key so this guard can tell it apart from the tenant @Public.
    const publicReason = this.reflector.get<string | undefined>(
      PLATFORM_PUBLIC_KEY,
      context.getHandler(),
    );

    if (publicReason) return true;

    const token = this.extractBearerToken(request);

    if (!token) throw new UnauthorizedException('Missing bearer token.');

    const claims = await this.tokens.verify(token);

    if (!claims) throw new UnauthorizedException('Invalid or expired session.');

    if (claims.scope !== 'platform') {
      // A perfectly valid tenant token. Refusing it explicitly — rather than
      // letting the user lookup fail — means the log says what happened.
      this.logger.warn(`Rejected a '${claims.scope}' token on a platform route`);
      throw new UnauthorizedException('This session is not valid for the platform console.');
    }

    const operator = await this.platformDb.db.platformUser.findFirst({
      where: { id: claims.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        mustChangePassword: true,
      },
    });

    if (!operator) {
      // A validly-signed token for an operator since deleted.
      throw new UnauthorizedException('Invalid or expired session.');
    }

    if (operator.status === 'DISABLED') {
      throw new ForbiddenException('This platform account has been disabled.');
    }

    request.platformUser = {
      id: operator.id,
      email: operator.email,
      fullName: operator.fullName,
      mustChangePassword: operator.mustChangePassword,
    };

    if (operator.mustChangePassword) {
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
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;

    return value.trim() || null;
  }
}

/**
 * Marks a platform route as needing no platform session. Distinct from the
 * tenant `@Public` key so the two cannot be confused: a route must not be
 * accidentally exempted from both guards at once.
 */
export const PLATFORM_PUBLIC_KEY = 'platform:public';

/** Re-exported so the tenant key is visible next to its platform sibling. */
export { AUTH_PUBLIC_KEY };
