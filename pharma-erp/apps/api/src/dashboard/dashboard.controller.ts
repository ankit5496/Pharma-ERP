import { Controller, Get } from '@nestjs/common';

import type { TenantDashboard } from '@pharma-erp/types';

import { SkipAudit } from '../common/audit/audit.decorators';

import { DashboardService } from './dashboard.service';

/**
 * The signed-in user's dashboard.
 *
 * No `@Roles(...)`: every authenticated member of the tenant may open their own
 * dashboard. What it CONTAINS is decided by role inside the service, which is
 * the part that matters — a role filter on the route would be all-or-nothing.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @SkipAudit('Read-only; the audit trail it displays is the record, not this read.')
  async get(): Promise<TenantDashboard> {
    return this.dashboard.forCurrentUser();
  }
}
