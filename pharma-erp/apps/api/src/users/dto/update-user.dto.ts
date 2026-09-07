import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { USER_ROLES, type UpdateUserRequest, type UserRole } from '@pharma-erp/types';

/**
 * Body of `PATCH /api/v1/users/:id`. Every field optional — an Admin editing
 * only a role should not have to resend the name.
 *
 * Notably absent: email and password. Changing a login identifier is an
 * identity change, not an edit, and passwords go through the dedicated reset
 * endpoint so the audit trail distinguishes them.
 */
export class UpdateUserDto implements UpdateUserRequest {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 255)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsIn(USER_ROLES, { message: `Role must be one of: ${USER_ROLES.join(', ')}` })
  role?: UserRole;

  /**
   * ACTIVE or DISABLED only. INVITED is not settable: it means "no password
   * has ever been set", which cannot be reached again by editing.
   */
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'], { message: 'Status must be ACTIVE or DISABLED' })
  status?: 'ACTIVE' | 'DISABLED';
}
