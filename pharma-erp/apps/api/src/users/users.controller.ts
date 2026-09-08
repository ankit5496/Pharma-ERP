import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import type { UserListItem } from '@pharma-erp/types';

import { Roles } from '../auth/auth.decorators';
import { Auditable, SkipAudit } from '../common/audit/audit.decorators';

import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/**
 * Admin user management.
 *
 * `@Roles('ADMIN')` on the class, so every route here — present and future —
 * is Admin-only by default rather than each one remembering. Read routes
 * included: a company's user list, with roles and last-login times, is not
 * something every Store Officer needs.
 *
 * MANAGEMENT is additionally refused on every mutating verb by RolesGuard,
 * regardless of this decorator.
 */
@Roles('ADMIN')
@Auditable('User')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @SkipAudit('Read-only listing; the rows themselves carry the history.')
  async list(): Promise<UserListItem[]> {
    return this.users.list();
  }

  /** Creates a colleague with an assigned role and a temporary password. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto): Promise<UserListItem> {
    return this.users.create(dto);
  }

  @Patch(':id')
  async update(
    // ParseUUIDPipe so a malformed id is a 400 at the boundary rather than a
    // Prisma error surfacing as a 500.
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserListItem> {
    return this.users.update(id, dto);
  }

  /** Sets a new temporary password. The whole recovery story — no emailed links. */
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    await this.users.resetPassword(id, dto.temporaryPassword);
  }

  /**
   * Soft-deletes a colleague. `users` has a prevent_hard_delete trigger, so
   * the row and its audit history survive.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.users.softDelete(id);
  }
}
