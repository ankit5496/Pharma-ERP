import { Injectable, Logger } from '@nestjs/common';

import { Prisma, type AuditAction } from '@pharma-erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  requestId?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Field names whose values are redacted before being written to the trail. The
 * audit table is widely readable inside a tenant, so it must not become a
 * side-channel for secrets.
 */
const REDACTED_FIELDS = new Set([
  'password',
  'passwordhash',
  'passwordconfirmation',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'secret',
  'clientsecret',
  'otp',
  'externalauthid',
]);

const REDACTED = '[redacted]';

/** Guard against a huge payload turning one audit row into a storage problem. */
const MAX_SNAPSHOT_BYTES = 64 * 1024;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Writes one audit row.
   *
   * Never throws: a failure to record must not roll back or 500 the business
   * operation that already succeeded. It logs at `error` instead, which is what
   * alerting should watch — a silent audit gap is the failure mode that matters
   * here, so it needs to be loud in the logs even though it is quiet to the
   * caller.
   */
  async record(entry: AuditEntry): Promise<void> {
    const context = this.tenantContext.get();

    if (!context?.tenantId) {
      this.logger.error(
        `Dropping audit entry for ${entry.entityType}#${entry.entityId}: no tenant context.`,
      );
      return;
    }

    try {
      await this.prisma.scoped.auditLog.create({
        data: {
          tenantId: context.tenantId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          userId: context.userId,
          beforeJson: this.snapshot(entry.before),
          afterJson: this.snapshot(entry.after),
          requestId: entry.requestId ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent?.slice(0, 512) ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit entry for ${entry.entityType}#${entry.entityId} ` +
          `(action=${entry.action}, tenant=${context.tenantId})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Prepares a value for the `before_json` / `after_json` columns: redacts
   * sensitive keys, normalises types Prisma's JSON column cannot hold (Date,
   * BigInt, Decimal), and truncates anything oversized.
   */
  private snapshot(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (value === undefined || value === null) {
      // Prisma.DbNull writes a SQL NULL; Prisma.JsonNull would write the JSON
      // literal null, which reads as 'the value was null' rather than 'not recorded'.
      return Prisma.DbNull;
    }

    const sanitised = this.sanitise(value);
    const serialised = JSON.stringify(sanitised);

    if (serialised !== undefined && Buffer.byteLength(serialised, 'utf8') > MAX_SNAPSHOT_BYTES) {
      return {
        __truncated: true,
        reason: `Snapshot exceeded ${MAX_SNAPSHOT_BYTES} bytes and was not recorded in full.`,
        byteLength: Buffer.byteLength(serialised, 'utf8'),
      };
    }

    return sanitised as Prisma.InputJsonValue;
  }

  private sanitise(value: unknown, depth = 0): unknown {
    if (depth > 12) return '[max depth]';

    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();
    if (Buffer.isBuffer(value)) return `[binary ${value.byteLength} bytes]`;

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitise(item, depth + 1));
    }

    if (typeof value === 'object') {
      // Prisma Decimal and similar wrapper types expose toString(); their own
      // internals are noise in an audit row.
      const maybeDecimal = value as { toFixed?: unknown; toString(): string };
      if (typeof maybeDecimal.toFixed === 'function') return maybeDecimal.toString();

      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        result[key] = REDACTED_FIELDS.has(key.toLowerCase())
          ? REDACTED
          : this.sanitise(item, depth + 1);
      }
      return result;
    }

    return value;
  }
}
