import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { DependencyCheck, HealthCheckResponse } from '@pharma-erp/types';

import type { EnvironmentVariables } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

/** Beyond this, treat the database as down rather than waiting on the probe. */
const DB_PROBE_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async check(): Promise<HealthCheckResponse> {
    const database = await this.checkDatabase();

    return {
      status: database.status === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      version: this.config.get('APP_VERSION', { infer: true }) ?? '0.1.0',
      environment: this.config.get('NODE_ENV', { infer: true }),
      checks: { database },
    };
  }

  private async checkDatabase(): Promise<DependencyCheck> {
    const startedAt = process.hrtime.bigint();

    try {
      // `unscoped` on purpose: this probe has no tenant, and `SELECT 1` touches
      // no tenant-scoped table, so RLS is not in play.
      await this.withTimeout(this.prisma.unscoped.$queryRaw`SELECT 1`, DB_PROBE_TIMEOUT_MS);

      return {
        status: 'up',
        latencyMs: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
      };
    } catch (error) {
      this.logger.error(
        'Database health check failed',
        error instanceof Error ? error.stack : error,
      );

      return {
        status: 'down',
        // First non-blank line only: Prisma's messages are multi-line, the
        // leading line is sometimes empty, and the full text can contain the
        // connection string — which must not reach an unauthenticated caller.
        error: firstLine(error),
      };
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`Probe timed out after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** First non-blank line of an error's message, for a public health payload. */
function firstLine(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error';

  const line = error.message
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);

  return line ?? error.name;
}
