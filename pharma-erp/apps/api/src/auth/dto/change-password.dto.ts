import { IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@pharma-erp/types';
import type { ChangePasswordRequest } from '@pharma-erp/types';

export class ChangePasswordDto implements ChangePasswordRequest {
  @IsString()
  @MinLength(1, { message: 'Enter your current password' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Your new password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}
