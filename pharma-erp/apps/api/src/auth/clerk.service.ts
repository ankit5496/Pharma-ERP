import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { UserRole } from '@pharma-erp/types';

import type { EnvironmentVariables } from '../config/env.validation';

/** The subset of Clerk's session claims this application relies on. */
export interface VerifiedClerkSession {
  /** Clerk user id — stored on User.externalAuthId. */
  subject: string;
  /** Clerk session id, useful for correlating with Clerk's own logs. */
  sessionId: string | undefined;
}

@Injectable()
export class ClerkService implements OnModuleDestroy {
  private readonly logger = new Logger(ClerkService.name);
  private readonly client: ClerkClient;
  private readonly secretKey: string;
  private readonly authorizedParties: string[];

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    this.secretKey = this.config.get('CLERK_SECRET_KEY', { infer: true });
    this.client = createClerkClient({ secretKey: this.secretKey });

    // Falls back to WEB_ORIGIN so the check is on by default rather than being
    // something you have to remember to switch on in production.
    const configured =
      this.config.get('CLERK_AUTHORIZED_PARTIES', { infer: true }) ??
      this.config.get('WEB_ORIGIN', { infer: true }) ??
      '';

    this.authorizedParties = configured
      .split(',')
      .map((party) => party.trim())
      .filter(Boolean);
  }

  onModuleDestroy(): void {
    // Nothing to close today — createClerkClient holds no persistent socket —
    // but the hook is here so a future switch to a pooled transport has a home.
  }

  /**
   * Verifies a session token's signature, expiry and audience.
   *
   * Verification is local: Clerk's JWKS is fetched and cached by the SDK, so
   * this is a signature check rather than a network round trip per request.
   *
   * Returns null on any failure. The caller turns that into a 401 — the reason
   * is logged but never returned, since telling a caller *why* their token was
   * rejected is free reconnaissance.
   */
  async verifySessionToken(token: string): Promise<VerifiedClerkSession | null> {
    try {
      const claims = await verifyToken(token, {
        secretKey: this.secretKey,
        // Rejects a validly-signed token that was minted for a different site,
        // which is what prevents it being replayed against this API.
        authorizedParties: this.authorizedParties,
      });

      if (!claims.sub) {
        this.logger.warn('Clerk token verified but carried no subject claim');
        return null;
      }

      return { subject: claims.sub, sessionId: claims.sid };
    } catch (error) {
      this.logger.debug(
        `Clerk token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** The Clerk user's primary email address and name, for provisioning. */
  async getUserProfile(
    clerkUserId: string,
  ): Promise<{ email: string; firstName: string | null; lastName: string | null } | null> {
    try {
      const user = await this.client.users.getUser(clerkUserId);

      const primary =
        user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId) ??
        user.emailAddresses[0];

      if (!primary?.emailAddress) {
        this.logger.warn(`Clerk user ${clerkUserId} has no email address`);
        return null;
      }

      return {
        email: primary.emailAddress.toLowerCase(),
        firstName: user.firstName,
        lastName: user.lastName,
      };
    } catch (error) {
      this.logger.error(
        `Failed to load Clerk user ${clerkUserId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /**
   * Mirrors our tenant and role onto the Clerk user's public metadata.
   *
   * This is a convenience for the browser only — it lets the web app render the
   * correct navigation on first paint without waiting for `GET /me`. It is NOT
   * a source of truth: the API always re-reads the role from Postgres, because
   * metadata on a Clerk user is editable through Clerk's own dashboard and lags
   * behind a revocation.
   *
   * Failure is logged, not thrown: the signup that triggered it has already
   * committed, and undoing a tenant because a cosmetic metadata write failed
   * would be a much worse outcome.
   */
  async syncUserMetadata(
    clerkUserId: string,
    metadata: { tenantId: string; tenantSlug: string; role: UserRole; userId: string },
  ): Promise<void> {
    try {
      await this.client.users.updateUserMetadata(clerkUserId, {
        publicMetadata: {
          ...metadata,
          hint: 'Display only — the API re-reads the role from Postgres.',
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to sync Clerk metadata for ${clerkUserId}; the web app will fall back to GET /me`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
