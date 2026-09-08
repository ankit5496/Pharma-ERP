import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type CreateCompanyRequest,
} from '@pharma-erp/types';

import { SUPPORTED_TIMEZONES } from './timezones';

/**
 * Body of `POST /api/v1/platform/companies`.
 *
 * The company name is required — it is the whole point of the request, and the
 * created Admin is bound to the company it names.
 */
export class CreateCompanyDto implements CreateCompanyRequest {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 255, { message: 'Enter the company name' })
  companyName!: string;

  /**
   * Optional: derived from the company name when omitted. 63 characters is the
   * DNS label limit, which keeps a future `<slug>.app.example.com` possible.
   */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Length(3, 63)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Identifier must be lowercase letters, digits and single hyphens',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @MaxLength(64)
  drugLicenceNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
    message: 'GSTIN must be a valid 15-character registration number',
  })
  gstin?: string;

  @IsOptional()
  @IsIn(SUPPORTED_TIMEZONES, {
    message: `Timezone must be one of: ${SUPPORTED_TIMEZONES.join(', ')}`,
  })
  timezone?: string;

  // -- The first Admin ------------------------------------------------------

  @IsEmail({}, { message: 'Enter a valid email address for the administrator' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @MaxLength(320)
  adminEmail!: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 255, { message: "Enter the administrator's full name" })
  adminFullName!: string;

  /**
   * Held to the same policy as a permanent password: it is a working credential
   * until replaced, and "it's only temporary" is how weak passwords get set.
   */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `The temporary password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  adminTemporaryPassword!: string;
}
