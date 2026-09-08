import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { TokenScope } from '@pharma-erp/types';

import type { EnvironmentVariables } from '../config/env.validation';

/**
 * Claims carried in the access token.
 *
 * Deliberately minimal: the user id and their tenant, nothing else. In
 * particular the ROLE is not here — it is re-read from Postgres on every
 * request, so revoking someone's authority takes effect on their next click
 * rather than whenever their token expires. In a GxP system, withdrawing a
 * Quality Officer's release authority must not wait.
 */
export interface AccessTokenClaims {
  /** User.id, or PlatformUser.id when scope is 'platform'. */
  sub: string;
  /**
   * Tenant.id — lets the request be tenant-scoped without a lookup first.
   * Absent for a platform token, which belongs to no tenant.
   */
  tid?: string;
  /**
   * Which surface this token is for. Checked by both guards, so a tenant token
   * presented to a platform route is refused deliberately rather than by the
   * accident of a lookup missing.
   */
  scope: TokenScope;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = config.get('JWT_SECRET', { infer: true });
    this.ttlSeconds = config.get('SESSION_TTL_SECONDS', { infer: true });
  }

  get expiresInSeconds(): number {
    return this.ttlSeconds;
  }

  async sign(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.secret,
      expiresIn: this.ttlSeconds,
      algorithm: 'HS256',
    });
  }

  /**
   * Verifies signature and expiry. Returns null on any failure — the caller
   * turns that into a 401 without saying which check failed, since
   * distinguishing "expired" from "bad signature" tells an attacker which knob
   * to turn.
   */
  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.secret,
        // Pinned: without this, a token could assert `alg: none` or a weaker
        // algorithm and the library would honour it.
        algorithms: ['HS256'],
      });

      if (typeof payload.sub !== 'string') {
        this.logger.warn('Token verified but is missing sub');
        return null;
      }

      if (payload.scope !== 'tenant' && payload.scope !== 'platform') {
        // A token minted before scopes existed, or hand-crafted. Refuse rather
        // than assume a scope — guessing 'tenant' would let a scopeless token
        // through the tenant guard.
        this.logger.warn('Token verified but carries no recognised scope');
        return null;
      }

      if (payload.scope === 'tenant' && typeof payload.tid !== 'string') {
        this.logger.warn('Tenant token verified but is missing tid');
        return null;
      }

      return { sub: payload.sub, tid: payload.tid, scope: payload.scope };
    } catch (error) {
      this.logger.debug(
        `Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
