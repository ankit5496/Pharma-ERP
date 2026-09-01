import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';

import type { CreateCompanyResponse, SessionResponse } from '@pharma-erp/types';
import { isUserRole } from '@pharma-erp/types';

import { Auditable, SkipAudit } from '../common/audit/audit.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

import { AllowNoTenant } from './auth.decorators';
import { CreateCompanyDto } from './dto/create-company.dto';
import { OnboardingService } from './onboarding.service';

/**
 * Session and onboarding endpoints.
 *
 * Every route here requires a valid Clerk session but tolerates the absence of
 * a tenant (`@AllowNoTenant`) — this is the only part of the API that runs in
 * the window between "registered with Clerk" and "created a company".
 */
@AllowNoTenant()
@Controller()
export class AuthController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Who am I, and do I have a company yet.
   *
   * The web app calls this on every protected page render to decide between
   * showing the app, redirecting to /onboarding, or showing a disabled notice.
   * `onboarded: false` is a 200, not a 401 — a signed-in user with no tenant is
   * a valid state, and 401-ing them would bounce them back to sign-in forever.
   */
  @Get('me')
  @SkipAudit('Read-only session lookup on every page render; would flood the trail.')
  async me(): Promise<SessionResponse> {
    const context = this.tenantContext.get();

    if (!context?.externalAuthId) {
      throw new UnauthorizedException('No session.');
    }

    const identity = await this.prisma.resolveIdentity(context.externalAuthId);

    if (!identity) {
      return { onboarded: false, reason: 'NO_TENANT' };
    }

    if (identity.status === 'DISABLED') {
      return { onboarded: false, reason: 'DISABLED' };
    }

    if (!isUserRole(identity.role)) {
      // Role enum drift; assertRoleEnumsInSync should have caught this at boot.
      throw new BadRequestException('Account role is not recognised.');
    }

    return {
      onboarded: true,
      user: {
        id: identity.userId,
        email: identity.email,
        fullName: identity.fullName,
        role: identity.role,
        tenantId: identity.tenantId,
        tenantName: identity.tenantName,
        tenantSlug: identity.tenantSlug,
        status: identity.status as 'INVITED' | 'ACTIVE' | 'DISABLED',
      },
    };
  }

  /**
   * Creates the caller's company and makes them its Admin.
   *
   * There is no `role` field on the request body by design: the first user of a
   * tenant is always ADMIN, and every subsequent user is created by an Admin who
   * chooses their role. Roles are never self-selected.
   */
  @Post('onboarding/company')
  @HttpCode(HttpStatus.CREATED)
  @Auditable('Tenant')
  async createCompany(@Body() dto: CreateCompanyDto): Promise<CreateCompanyResponse> {
    const context = this.tenantContext.get();

    if (!context?.externalAuthId) {
      throw new UnauthorizedException('No session.');
    }

    return this.onboarding.createCompany(context.externalAuthId, dto);
  }

  /** Live availability check behind the signup form's slug field. */
  @Get('onboarding/slug-available')
  @SkipAudit('Read-only availability probe typed against on every keystroke.')
  async slugAvailable(@Query('slug') slug?: string): Promise<{ slug: string; available: boolean }> {
    const normalised = (slug ?? '').trim().toLowerCase();

    // Mirrors CreateCompanyDto's constraint. A malformed slug is "unavailable"
    // rather than a 400, so the form can show one consistent message.
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalised) || normalised.length < 3) {
      return { slug: normalised, available: false };
    }

    return { slug: normalised, available: await this.onboarding.isSlugAvailable(normalised) };
  }
}
