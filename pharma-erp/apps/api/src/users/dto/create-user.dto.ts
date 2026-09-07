import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USER_ROLES,
  type CreateUserRequest,
  type UserRole,
} from '@pharma-erp/types';

/**
 * Body of `POST /api/v1/users` — an Admin creating a colleague.
 *
 * There is deliberately no `tenantId`: the tenant comes from the Admin's own
 * session. Accepting one would let an Admin create users in another company.
 * There is also no `status` — a new account is always ACTIVE with
 * must-change-password set.
 */
export class CreateUserDto implements CreateUserRequest {
  @IsEmail({}, { message: 'Enter a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @MaxLength(320)
  email!: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 255, { message: 'Enter the full name' })
  fullName!: string;

  /**
   * Assigned by the Admin, never chosen by the person being created — the whole
   * point of an invite-only system. `@IsIn` against the shared list rather than
   * a TypeScript type, because a request body is runtime data.
   */
  @IsIn(USER_ROLES, {
    message: `Role must be one of: ${USER_ROLES.join(', ')}`,
  })
  role!: UserRole;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(32)
  phone?: string;

  /**
   * Temporary password, handed to the user out of band. Held to the same length
   * policy as a real one: it is a working credential until they replace it, and
   * "it's only temporary" is how weak passwords get set.
   */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `The temporary password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  temporaryPassword!: string;
}
