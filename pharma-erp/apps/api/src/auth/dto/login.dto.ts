import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_MAX_LENGTH } from '@pharma-erp/types';
import type { LoginRequest } from '@pharma-erp/types';

export class LoginDto implements LoginRequest {
  @IsEmail({}, { message: 'Enter a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @MaxLength(320)
  email!: string;

  /**
   * Deliberately NOT validated against the password policy. The policy applies
   * when setting a password; applying it here would reject a sign-in attempt
   * before checking it, telling the caller that no account could have that
   * password — and it would lock out anyone whose password predates a policy
   * change.
   */
  @IsString()
  @MinLength(1, { message: 'Enter your password' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
