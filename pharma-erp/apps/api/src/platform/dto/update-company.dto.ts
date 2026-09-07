import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import type { UpdateCompanyRequest } from '@pharma-erp/types';

import { SUPPORTED_TIMEZONES } from './timezones';

/** Body of `PATCH /api/v1/platform/companies/:id`. Every field optional. */
export class UpdateCompanyDto implements UpdateCompanyRequest {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 255)
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @MaxLength(64)
  drugLicenceNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @MaxLength(15)
  gstin?: string;

  @IsOptional()
  @IsIn(SUPPORTED_TIMEZONES)
  timezone?: string;

  /**
   * SUSPENDED blocks every sign-in for the company immediately: the auth guard
   * re-reads tenant status on each request, so existing sessions stop working
   * too rather than lingering until their tokens expire.
   */
  @IsOptional()
  @IsIn(['TRIAL', 'ACTIVE', 'SUSPENDED'], { message: 'Status must be TRIAL, ACTIVE or SUSPENDED' })
  status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED';
}
