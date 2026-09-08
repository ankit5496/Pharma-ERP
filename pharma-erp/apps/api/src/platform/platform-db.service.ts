import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createProvisioningClient, type PrismaClient } from '@pharma-erp/database';

import type { EnvironmentVariables } from '../config/env.validation';

/**
 * The elevated connection used by everything under /platform.
 *
 * Why this exists as its own provider rather than reusing PrismaService: every
 * platform operation is inherently cross-tenant. Creating a company writes to
 * `tenants` (no INSERT policy for the runtime role, deliberately), counting
 * users spans every tenant, and `platform_users` is REVOKEd from the runtime
 * role outright — a request-scoped connection gets "permission denied" there.
 *
 * So platform work runs on MIGRATION_DATABASE_URL, the table owner. That makes
 * this class a genuine security boundary, and the rule for anything using it is
 * blunt: **row-level security will not protect you here.** Any query touching a
 * tenant-scoped table must filter by tenant itself, and any query returning
 * tenant data to a platform user must be one a platform user is entitled to see.
 *
 * Keeping it confined to this module is what stops that exemption spreading.
 */
@Injectable()
export class PlatformDbService implements OnModuleDestroy {
  private readonly logger = new Logger(PlatformDbService.name);
  private readonly client: PrismaClient;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.client = createProvisioningClient(config.get('MIGRATION_DATABASE_URL', { infer: true }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  /** The elevated client. Read the class comment before using it. */
  get db(): PrismaClient {
    return this.client;
  }

  /**
   * Records a platform action in `platform_audit_logs`.
   *
   * Never throws: a failure to record must not roll back an operation that has
   * already succeeded. It logs at `error` instead, which is what alerting should
   * watch — a silent gap in the platform trail is the failure mode that matters,
   * since this trail is the only record of who provisioned or suspended a
   * customer.
   */
  async recordAudit(entry: {
    platformUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: unknown;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    try {
      await this.client.platformAuditLog.create({
        data: {
          platformUserId: entry.platformUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          detailsJson: (entry.details ?? undefined) as never,
          requestId: entry.requestId ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent?.slice(0, 512) ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write platform audit entry (${entry.action} on ${entry.entityType})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
