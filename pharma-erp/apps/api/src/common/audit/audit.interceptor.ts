import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { tap, type Observable } from 'rxjs';

import type { AuditAction } from '@pharma-erp/database';

import { TenantContextService } from '../../tenant/tenant-context.service';

import { AUDIT_ENTITY_KEY, AUDIT_SKIP_KEY } from './audit.decorators';
import { AuditService } from './audit.service';

/** HTTP verb to audit action. GET/HEAD/OPTIONS mutate nothing and are skipped. */
const METHOD_ACTIONS: Readonly<Record<string, AuditAction>> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

/**
 * Writes an AuditLog row for every successful mutating request.
 *
 * Registered globally in AppModule, so auditing is the default and has to be
 * opted OUT of with `@SkipAudit('reason')`. That inversion is deliberate: a new
 * endpoint that nobody thought about is audited, whereas an opt-in scheme means
 * the endpoints nobody thought about are exactly the ones missing from the
 * trail.
 *
 * What it can and cannot capture: the request body becomes `after_json`, and
 * `before_json` is populated only when a handler explicitly records the prior
 * state (see `AuditService.record` — a service that reads-then-writes should
 * call it directly with both snapshots). A full before/after diff for arbitrary
 * updates needs a Prisma query extension that re-reads the row inside the
 * transaction; that lands with the first flow that has an update path.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const action = METHOD_ACTIONS[request.method.toUpperCase()];

    // Not a mutation — nothing to record.
    if (!action) {
      return next.handle();
    }

    const skipReason = this.reflector.getAllAndOverride<string | undefined>(AUDIT_SKIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipReason) {
      this.logger.debug(
        `Audit skipped for ${request.method} ${request.originalUrl}: ${skipReason}`,
      );
      return next.handle();
    }

    // No tenant context means an exempt route (e.g. /health); there is no tenant
    // to file the entry under, and inventing one would corrupt the trail.
    if (!this.tenantContext.get()?.tenantId) {
      return next.handle();
    }

    const entityType = this.resolveEntityType(context);

    return next.handle().pipe(
      // `tap` on the success channel only: a failed request changed nothing, so
      // auditing it would record a mutation that never happened. (Failed
      // *attempts* are a separate security-log concern, not an audit-trail one.)
      tap({
        next: (result) => {
          void this.auditService.record({
            entityType,
            entityId: this.resolveEntityId(result, request),
            action: this.refineAction(action, request),
            after: this.pickPayload(result, request),
            requestId: this.headerValue(request, 'x-request-id'),
            ipAddress: request.ip,
            userAgent: this.headerValue(request, 'user-agent'),
          });
        },
      }),
    );
  }

  /**
   * An explicit `@Auditable('X')` wins; otherwise derive the entity from the
   * controller's class name — 'BatchController' becomes 'Batch'.
   *
   * The class name rather than the route path: the path carries the global
   * '/api/v1' prefix, so its first segment is always 'api', and plural route
   * names ('/batches') do not reliably singularise.
   */
  private resolveEntityType(context: ExecutionContext): string {
    const declared = this.reflector.getAllAndOverride<string | undefined>(AUDIT_ENTITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (declared) return declared;

    return context.getClass().name.replace(/Controller$/, '') || 'Unknown';
  }

  /**
   * A DELETE against a table with `deletedAt` is a soft delete, and the trail
   * should say so. Handlers that genuinely purge (none, on compliance tables)
   * can record DELETE explicitly.
   */
  private refineAction(action: AuditAction, request: Request): AuditAction {
    if (action !== 'DELETE') return action;
    return request.query.hard === 'true' ? 'DELETE' : 'SOFT_DELETE';
  }

  private resolveEntityId(result: unknown, request: Request): string {
    if (result && typeof result === 'object' && 'id' in result) {
      const id = (result as { id: unknown }).id;
      if (typeof id === 'string' || typeof id === 'number' || typeof id === 'bigint') {
        return String(id);
      }
    }

    const routeId = request.params?.id;
    return typeof routeId === 'string' && routeId.length > 0 ? routeId : 'unknown';
  }

  /**
   * Prefer the handler's response over the raw request body: it reflects what
   * was actually persisted (defaults applied, values coerced), whereas the body
   * only reflects what was asked for.
   */
  private pickPayload(result: unknown, request: Request): unknown {
    if (result && typeof result === 'object') return result;
    return request.body;
  }

  private headerValue(request: Request, name: string): string | undefined {
    const raw = request.headers[name];
    return Array.isArray(raw) ? raw[0] : raw;
  }
}
