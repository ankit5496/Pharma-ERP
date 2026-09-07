import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { LoginResponse, SessionUser } from '@pharma-erp/types';
import { isUserRole } from '@pharma-erp/types';

import { Auditable, SkipAudit } from '../common/audit/audit.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

import { AllowPasswordChange, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Exchanges an email and password for an access token.
   *
   * The only unauthenticated write in the application, so it is also the only
   * one an attacker can reach. Its defences: a single generic failure message
   * regardless of cause, constant-time password verification even for unknown
   * addresses, and a lockout after five consecutive failures.
   */
  @Public('Sign-in must be reachable without a session, by definition.')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Auditable('User')
  async login(@Body() dto: LoginDto, @Req() request: Request): Promise<LoginResponse> {
    return this.authService.login(dto.email, dto.password, request.ip);
  }

  /**
   * Ends the session.
   *
   * The API holds no server-side session state — the token is self-contained
   * and short-lived — so this exists to record the event in the audit trail and
   * to give the web app a single place to clear its cookie. Tokens are not
   * individually revocable by design; the mitigation is a short TTL plus the
   * per-request account re-read that makes disabling an account immediate.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowPasswordChange()
  @Auditable('User')
  async logout(): Promise<void> {
    const context = this.tenantContext.get();

    if (context?.userId) {
      // Recorded by the audit interceptor via @Auditable; nothing else to do.
      return;
    }
  }

  /**
   * The current user.
   *
   * Reads through to Postgres rather than trusting the token, so the web app
   * always renders the role the database says they have.
   *
   * `@AllowPasswordChange` because the change-password screen needs to show who
   * is signed in, and that screen is all a must-change-password user can reach.
   */
  @Get('me')
  @AllowPasswordChange()
  @SkipAudit('Read-only session lookup on every page render; would flood the trail.')
  async me(): Promise<SessionUser> {
    const context = this.tenantContext.get();

    if (!context?.userId || !context.tenantId) {
      throw new UnauthorizedException('No session.');
    }

    const identity = await this.prisma.resolveIdentity(context.tenantId, context.userId);

    if (!identity) {
      throw new UnauthorizedException('No session.');
    }

    if (!isUserRole(identity.role)) {
      throw new BadRequestException('Account role is not recognised.');
    }

    return {
      id: identity.userId,
      email: identity.email,
      fullName: identity.fullName,
      role: identity.role,
      tenantId: identity.tenantId,
      tenantName: identity.tenantName,
      tenantSlug: identity.tenantSlug,
      status: identity.status as SessionUser['status'],
      mustChangePassword: identity.mustChangePassword,
    };
  }

  /**
   * Replaces the caller's own password.
   *
   * Reachable while must-change-password is set — it is the only thing such an
   * account can do, and the route out of that state.
   */
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowPasswordChange()
  @Auditable('User')
  async changePassword(@Body() dto: ChangePasswordDto): Promise<void> {
    const context = this.tenantContext.get();

    if (!context?.userId) {
      throw new UnauthorizedException('No session.');
    }

    await this.authService.changeOwnPassword(context.userId, dto.currentPassword, dto.newPassword);
  }
}
