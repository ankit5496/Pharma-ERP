import { Controller, Get, Header, HttpCode, HttpException, HttpStatus } from '@nestjs/common';

import type { HealthCheckResponse } from '@pharma-erp/types';

import { Public } from '../auth/auth.decorators';
import { SkipAudit } from '../common/audit/audit.decorators';

import { HealthService } from './health.service';

/**
 * Unauthenticated liveness/readiness surface. @Public is what makes it
 * reachable without a session; the global guard would reject it otherwise.
 *
 * The response never carries connection strings or stack traces: it is public.
 */
@Public('Orchestrators and load balancers probe this before any user exists.')
@SkipAudit('Read-only probe; mutates nothing and would flood the audit trail.')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Full check, including a database round trip.
   *
   * Always 200, even when a dependency is down, with the verdict in the body's
   * `status` field. A non-2xx here would make an orchestrator kill a pod that is
   * merely waiting on Postgres to come back; `/health/ready` is the endpoint
   * that answers with a status code for that purpose.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async check(): Promise<HealthCheckResponse> {
    return this.healthService.check();
  }

  /** Liveness: is the process running at all. No dependency checks. */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness: should this instance receive traffic. Returns 503 when a
   * dependency is down, which is what a load balancer needs.
   */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready(): Promise<HealthCheckResponse> {
    const result = await this.healthService.check();

    if (result.status !== 'ok') {
      // HttpException so Nest's exception layer sets 503 while still serialising
      // the full health payload as the body — a bare Error would become a 500
      // with a generic message and lose the diagnosis.
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }
}
