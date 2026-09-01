import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  NotContains,
} from 'class-validator';

import type { CreateCompanyRequest } from '@pharma-erp/types';

/** IANA zones this MVP supports. Kept small and explicit rather than accepting
 * any string: batch and expiry dates are legally meaningful, so an unresolvable
 * zone is a compliance problem, not a display glitch. */
export const SUPPORTED_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'UTC',
] as const;

/**
 * Body of `POST /api/v1/onboarding/company`.
 *
 * Everything is validated at the boundary — the global ValidationPipe runs with
 * `whitelist` and `forbidNonWhitelisted`, so an unexpected field is a 400 rather
 * than a silently ignored one. In particular there is deliberately no `role`
 * field: the creator is always ADMIN, and accepting a role here would let anyone
 * self-assign one.
 */
export class CreateCompanyDto implements CreateCompanyRequest {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 255, { message: 'Company name must be between 2 and 255 characters' })
  companyName!: string;

  /**
   * Tenant slug. Lowercase, digits and single hyphens; 63 characters is the DNS
   * label limit, which keeps a future `<slug>.app.example.com` possible.
   */
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Length(3, 63)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Slug must be lowercase letters, digits and single hyphens, and may not start or end with a hyphen',
  })
  @NotContains('--', { message: 'Slug may not contain consecutive hyphens' })
  slug!: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 255, { message: 'Please enter your full name' })
  fullName!: string;

  /** Optional at signup; required before a batch can be released. */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @MaxLength(64)
  drugLicenceNumber?: string;

  /**
   * Indian GSTIN: 2-digit state code, 10-character PAN, entity number, 'Z',
   * checksum. Validated structurally here; the checksum digit itself is not
   * recomputed, which would be the next step if invalid registrations become a
   * real problem.
   */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @MinLength(15)
  @MaxLength(15)
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
    message: 'GSTIN must be a valid 15-character registration number',
  })
  gstin?: string;

  @IsOptional()
  @IsIn(SUPPORTED_TIMEZONES, {
    message: `Timezone must be one of: ${SUPPORTED_TIMEZONES.join(', ')}`,
  })
  timezone?: (typeof SUPPORTED_TIMEZONES)[number];
}
