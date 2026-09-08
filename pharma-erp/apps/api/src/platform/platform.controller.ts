import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import type {
  CompanyListItem,
  CreateCompanyResponse,
  PlatformDashboard,
  PlatformLoginResponse,
  PlatformSessionUser,
} from '@pharma-erp/types';

import { AllowPasswordChange, Public } from '../auth/auth.decorators';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { LoginDto } from '../auth/dto/login.dto';
import { SkipAudit } from '../common/audit/audit.decorators';

import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { PlatformAuthService } from './platform-auth.service';
import { PLATFORM_PUBLIC_KEY, PlatformGuard, type PlatformRequest } from './platform.guard';
import { PlatformService } from './platform.service';

/** Marks a platform route as needing no platform session (sign-in only). */
const PlatformPublic = (reason: string) => SetMetadata(PLATFORM_PUBLIC_KEY, reason);

/**
 * The platform console API.
 *
 * Two decorators on the class deserve explanation, because together they look
 * like the security has been switched off:
 *
 *   `@Public(...)`   exempts these routes from the GLOBAL tenant guard. It must,
 *                    because a platform operator is not in `users` and that
 *                    guard would reject them. It does NOT mean unauthenticated.
 *   `@UseGuards(PlatformGuard)` is what actually authenticates them, against
 *                    `platform_users`, and requires a token whose scope is
 *                    'platform'. A tenant token is refused here even though its
 *                    signature is valid.
 *
 * `@SkipAudit` likewise: these actions are recorded in `platform_audit_logs` by
 * the services themselves, not in the tenant audit trail — a platform action
 * belongs to no tenant, and the tenant interceptor has no tenant to file it
 * under.
 */
@Public(
  'Platform routes authenticate against platform_users via PlatformGuard, not the tenant guard.',
)
@SkipAudit('Recorded in platform_audit_logs by the platform services instead.')
@UseGuards(PlatformGuard)
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platformAuth: PlatformAuthService,
    private readonly platform: PlatformService,
  ) {}

  // -- Session --------------------------------------------------------------

  @PlatformPublic('Platform sign-in must be reachable without a session, by definition.')
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: PlatformRequest,
  ): Promise<PlatformLoginResponse> {
    return this.platformAuth.login(dto.email, dto.password, request.ip);
  }

  @Get('auth/me')
  @AllowPasswordChange()
  async me(@Req() request: PlatformRequest): Promise<PlatformSessionUser> {
    const operator = request.platformUser;
    if (!operator) throw new UnauthorizedException('No session.');

    return this.platformAuth.getSessionUser(operator.id);
  }

  @Post('auth/change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowPasswordChange()
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() request: PlatformRequest,
  ): Promise<void> {
    const operator = request.platformUser;
    if (!operator) throw new UnauthorizedException('No session.');

    await this.platformAuth.changeOwnPassword(operator.id, dto.currentPassword, dto.newPassword);
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowPasswordChange()
  logout(): void {
    // No server-side session state to clear: the token is self-contained and
    // short-lived. The web app deletes its cookie; this exists so the client has
    // one endpoint to call and so the action can be recorded later if needed.
  }

  // -- Companies ------------------------------------------------------------

  /**
   * Creates a company and its first Admin.
   *
   * This is the one endpoint that can bring a new tenant into existence, which
   * is why the whole platform layer has its own table, its own login and its own
   * token scope rather than being a role inside `users`.
   */
  @Post('companies')
  @HttpCode(HttpStatus.CREATED)
  async createCompany(
    @Body() dto: CreateCompanyDto,
    @Req() request: PlatformRequest,
  ): Promise<CreateCompanyResponse> {
    const operator = request.platformUser;
    if (!operator) throw new UnauthorizedException('No session.');

    return this.platform.createCompany(operator.id, dto);
  }

  @Get('companies')
  async listCompanies(): Promise<CompanyListItem[]> {
    return this.platform.listCompanies();
  }

  @Patch('companies/:id')
  async updateCompany(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCompanyDto,
    @Req() request: PlatformRequest,
  ): Promise<CompanyListItem> {
    const operator = request.platformUser;
    if (!operator) throw new UnauthorizedException('No session.');

    return this.platform.updateCompany(operator.id, id, dto);
  }

  // -- Dashboard ------------------------------------------------------------

  @Get('dashboard')
  async dashboard(): Promise<PlatformDashboard> {
    return this.platform.getDashboard();
  }
}
