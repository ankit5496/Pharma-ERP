import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import type { PlatformLoginResponse, PlatformSessionUser } from '@pharma-erp/types';

import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';

import { PlatformDbService } from './platform-db.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * One message for every credential failure, for the same reason the tenant
 * login has one: any variation turns the form into an oracle for which
 * addresses are real. That matters more here — the addresses are the vendor's
 * own staff, and this console can create companies.
 */
const GENERIC_FAILURE = 'Incorrect email or password.';

@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);

  constructor(
    private readonly platformDb: PlatformDbService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async login(email: string, password: string, ip?: string): Promise<PlatformLoginResponse> {
    const normalised = email.trim().toLowerCase();

    const operator = await this.platformDb.db.platformUser.findFirst({
      where: { email: normalised, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        passwordHash: true,
        mustChangePassword: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    // Verify even with no match: verifyPassword(null, …) still runs a full
    // argon2 pass, so the response time does not distinguish the cases.
    const matches = await this.passwords.verifyPassword(operator?.passwordHash ?? null, password);

    if (!operator) {
      this.logger.warn(`Platform sign-in attempt for unknown address from ${ip ?? 'unknown ip'}`);
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    if (operator.lockedUntil && operator.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.max(
        1,
        Math.ceil((operator.lockedUntil.getTime() - Date.now()) / 60_000),
      );
      throw new UnauthorizedException(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      );
    }

    if (!matches) {
      await this.recordFailure(operator.id, operator.failedLoginAttempts + 1);
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    // Password correct from here, so specific messages are safe.

    if (!operator.passwordHash) {
      throw new ForbiddenException('This account has no password set. Use the CLI to set one.');
    }

    if (operator.status === 'DISABLED') {
      throw new ForbiddenException('This platform account has been disabled.');
    }

    await this.platformDb.db.platformUser.update({
      where: { id: operator.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.platformDb.recordAudit({
      platformUserId: operator.id,
      action: 'PLATFORM_SIGN_IN',
      entityType: 'PlatformUser',
      entityId: operator.id,
      details: { email: operator.email },
      ipAddress: ip ?? null,
    });

    const accessToken = await this.tokens.sign({ sub: operator.id, scope: 'platform' });

    return {
      user: this.toSessionUser(operator),
      accessToken,
      expiresInSeconds: this.tokens.expiresInSeconds,
    };
  }

  /** Replaces the operator's own password. Requires the current one. */
  async changeOwnPassword(
    platformUserId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const operator = await this.platformDb.db.platformUser.findFirst({
      where: { id: platformUserId, deletedAt: null },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!operator) throw new UnauthorizedException('Account not found.');

    if (!(await this.passwords.verifyPassword(operator.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Your current password is incorrect.');
    }

    if (this.passwords.safeEquals(currentPassword, newPassword)) {
      throw new ForbiddenException('The new password must be different from the current one.');
    }

    const passwordHash = await this.passwords.hashPassword(newPassword);

    await this.platformDb.db.platformUser.update({
      where: { id: platformUserId },
      data: {
        passwordHash,
        passwordSetAt: new Date(),
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.platformDb.recordAudit({
      platformUserId,
      action: 'PLATFORM_PASSWORD_CHANGED',
      entityType: 'PlatformUser',
      entityId: platformUserId,
      // Never the password or either hash.
      details: { email: operator.email },
    });
  }

  async getSessionUser(platformUserId: string): Promise<PlatformSessionUser> {
    const operator = await this.platformDb.db.platformUser.findFirst({
      where: { id: platformUserId, deletedAt: null },
      select: { id: true, email: true, fullName: true, status: true, mustChangePassword: true },
    });

    if (!operator) throw new UnauthorizedException('No session.');

    return this.toSessionUser(operator);
  }

  private toSessionUser(operator: {
    id: string;
    email: string;
    fullName: string;
    status: string;
    mustChangePassword: boolean;
  }): PlatformSessionUser {
    return {
      id: operator.id,
      email: operator.email,
      fullName: operator.fullName,
      status: operator.status as PlatformSessionUser['status'],
      mustChangePassword: operator.mustChangePassword,
    };
  }

  private async recordFailure(platformUserId: string, attempts: number): Promise<void> {
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    try {
      await this.platformDb.db.platformUser.update({
        where: { id: platformUserId },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
        },
      });
    } catch (error) {
      // Never let bookkeeping turn a failed sign-in into a 500 — that would
      // itself distinguish real accounts from imaginary ones.
      this.logger.error(
        `Could not record failed platform sign-in: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    if (shouldLock) {
      this.logger.warn(
        `Platform account ${platformUserId} locked for ${LOCKOUT_MINUTES} minutes after ${attempts} failed attempts`,
      );
    }
  }
}
