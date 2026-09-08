import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import type { LoginCandidate } from '@pharma-erp/database';
import { isUserRole, type LoginResponse, type SessionUser } from '@pharma-erp/types';

import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/** Failed attempts before an account is locked. */
const MAX_FAILED_ATTEMPTS = 5;

/** How long a lockout lasts. Long enough to kill online guessing, short enough
 * not to need an administrator for an ordinary typo streak. */
const LOCKOUT_MINUTES = 15;

/**
 * The single message returned for every sign-in failure.
 *
 * Wrong password, unknown address, no password set — all identical. Any
 * variation turns the login form into an oracle for which addresses are real,
 * which for a closed system is exactly the information an attacker lacks.
 * The specific reason is logged server-side.
 */
const GENERIC_FAILURE = 'Incorrect email or password.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Authenticates an email and password.
   *
   * Order matters here. The password is verified BEFORE the account's status is
   * considered, so a caller cannot learn that an address is disabled or
   * unprovisioned without already knowing its password.
   */
  async login(email: string, password: string, ip?: string): Promise<LoginResponse> {
    const candidate = await this.prisma.findLoginCandidate(email);

    // Always verify, even with no candidate: verifyPassword(null, …) still runs
    // a full argon2 pass so the response time does not distinguish the cases.
    const passwordMatches = await this.passwords.verifyPassword(
      candidate?.passwordHash ?? null,
      password,
    );

    if (!candidate) {
      this.logger.warn(`Sign-in attempt for unknown address from ${ip ?? 'unknown ip'}`);
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    if (this.isLocked(candidate)) {
      // Being explicit here is a deliberate exception to the generic-message
      // rule: the caller has already proven they know a real address by
      // triggering the lockout, and leaving them to guess why sign-in fails for
      // 15 minutes generates support load for no security gain.
      const minutes = Math.max(
        1,
        Math.ceil((candidate.lockedUntil!.getTime() - Date.now()) / 60_000),
      );

      throw new UnauthorizedException(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      );
    }

    if (!passwordMatches) {
      await this.recordFailedAttempt(candidate);
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    // Password is correct from here on, so specific messages are safe.

    if (candidate.status === 'INVITED' || !candidate.passwordHash) {
      throw new ForbiddenException(
        'This account has no password set yet. Ask your administrator to set one.',
      );
    }

    if (candidate.status === 'DISABLED') {
      throw new ForbiddenException('This account has been disabled by an administrator.');
    }

    if (candidate.tenantStatus === 'SUSPENDED') {
      throw new ForbiddenException('This company account is suspended.');
    }

    if (!isUserRole(candidate.role)) {
      this.logger.error(`User ${candidate.userId} has unrecognised role ${candidate.role}`);
      throw new ForbiddenException('Account role is not recognised. Contact your administrator.');
    }

    await this.recordSuccessfulLogin(candidate);

    // Populate the request context so the audit write below is attributed and
    // tenant-scoped. Until now this request had no identity at all.
    const store = this.tenantContext.get();
    if (store) {
      store.tenantId = candidate.tenantId;
      store.userId = candidate.userId;
      store.role = candidate.role;
      store.mustChangePassword = candidate.mustChangePassword;
    }

    await this.auditService.record({
      entityType: 'User',
      entityId: candidate.userId,
      action: 'UPDATE',
      after: { event: 'SIGN_IN', email: candidate.email, ipAddress: ip ?? null },
    });

    const accessToken = await this.tokens.sign({
      sub: candidate.userId,
      tid: candidate.tenantId,
      scope: 'tenant',
    });

    return {
      user: this.toSessionUser(candidate),
      accessToken,
      expiresInSeconds: this.tokens.expiresInSeconds,
    };
  }

  /**
   * Replaces the caller's own password.
   *
   * Requires the current password even though the caller is already
   * authenticated: it is what stops a hijacked session from locking the real
   * owner out of their account.
   */
  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const tenantId = this.tenantContext.requireTenantId();

    const user = await this.prisma.scoped.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user) {
      throw new UnauthorizedException('Account not found.');
    }

    const matches = await this.passwords.verifyPassword(user.passwordHash, currentPassword);

    if (!matches) {
      throw new UnauthorizedException('Your current password is incorrect.');
    }

    if (this.passwords.safeEquals(currentPassword, newPassword)) {
      throw new ForbiddenException('The new password must be different from the current one.');
    }

    // Throws on a policy violation before anything is written.
    const hashed = await this.passwords.hashPassword(newPassword);

    await this.prisma.scoped.user.update({
      where: { id: userId },
      data: {
        passwordHash: hashed,
        passwordSetAt: new Date(),
        mustChangePassword: false,
        // A successful change clears any lockout: the owner has demonstrated
        // control of the account.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    const store = this.tenantContext.get();
    if (store) store.mustChangePassword = false;

    await this.auditService.record({
      entityType: 'User',
      entityId: userId,
      action: 'UPDATE',
      // Never the password itself, or either hash — an audit row is widely
      // readable within a tenant.
      after: { event: 'PASSWORD_CHANGED', email: user.email },
    });

    this.logger.log(`User ${userId} changed their password`);
  }

  /** Maps a login candidate to the session shape, dropping credential fields. */
  toSessionUser(candidate: LoginCandidate): SessionUser {
    if (!isUserRole(candidate.role)) {
      throw new ForbiddenException('Account role is not recognised.');
    }

    return {
      id: candidate.userId,
      email: candidate.email,
      fullName: candidate.fullName,
      role: candidate.role,
      tenantId: candidate.tenantId,
      tenantName: candidate.tenantName,
      tenantSlug: candidate.tenantSlug,
      status: candidate.status as SessionUser['status'],
      mustChangePassword: candidate.mustChangePassword,
    };
  }

  private isLocked(candidate: LoginCandidate): boolean {
    return candidate.lockedUntil !== null && candidate.lockedUntil.getTime() > Date.now();
  }

  /**
   * Increments the failure counter and locks the account at the threshold.
   *
   * Runs on the unscoped client with an explicit tenant filter: the request has
   * no tenant context yet (authentication has not succeeded), and going through
   * `scoped` would throw. The row is addressed by primary key, so this cannot
   * touch anything but the account that was just looked up.
   */
  private async recordFailedAttempt(candidate: LoginCandidate): Promise<void> {
    const attempts = candidate.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    try {
      await this.prisma.updateLoginState(candidate.tenantId, candidate.userId, {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      });
    } catch (error) {
      // Never let bookkeeping turn a failed sign-in into a 500 — that would
      // itself distinguish real accounts from imaginary ones.
      this.logger.error(
        `Could not record failed sign-in for ${candidate.userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    if (shouldLock) {
      this.logger.warn(
        `Account ${candidate.userId} locked for ${LOCKOUT_MINUTES} minutes after ${attempts} failed attempts`,
      );
    }
  }

  private async recordSuccessfulLogin(candidate: LoginCandidate): Promise<void> {
    try {
      await this.prisma.updateLoginState(candidate.tenantId, candidate.userId, {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      });
    } catch (error) {
      this.logger.error(
        `Could not record sign-in for ${candidate.userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
