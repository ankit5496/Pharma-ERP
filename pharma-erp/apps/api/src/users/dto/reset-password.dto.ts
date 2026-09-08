import { IsString, MaxLength, MinLength } from 'class-validator';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type ResetPasswordRequest,
} from '@pharma-erp/types';

/** Body of `POST /api/v1/users/:id/reset-password`. */
export class ResetPasswordDto implements ResetPasswordRequest {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `The temporary password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  temporaryPassword!: string;
}
