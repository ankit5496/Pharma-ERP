import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import type { RequestContext } from '@pharma-erp/types';

import { TenantContextService } from './tenant-context.service';

/** Bound so a client-supplied value cannot bloat every log line and audit row. */
const MAX_REQUEST_ID_LENGTH = 64;

/**
 * Opens the async context for every request.
 *
 * This runs before guards, so it cannot know who the caller is — it only
 * establishes the store and the correlation id. JwtAuthGuard fills in the
 * tenant, user and role once it has verified the token.
 *
 * Middleware rather than an interceptor, because Nest runs interceptors *after*
 * guards: the guard needs a store to write into, so the store has to be opened
 * earlier than that.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const context: RequestContext = {
      requestId: this.resolveRequestId(req),
      tenantId: null,
      userId: null,
      role: null,
      mustChangePassword: false,
    };

    res.setHeader('x-request-id', context.requestId);

    // Everything downstream of next() — guards, interceptors, the controller,
    // and every promise they await — runs inside this store.
    this.tenantContext.run(context, () => {
      next();
    });
  }

  private resolveRequestId(req: Request): string {
    const incoming = req.headers['x-request-id'];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;

    if (!candidate || candidate.length > MAX_REQUEST_ID_LENGTH) return randomUUID();

    // Only accept a shape safe to embed in logs: no newlines (log injection),
    // no control characters, no header smuggling.
    return /^[A-Za-z0-9._:-]+$/.test(candidate) ? candidate : randomUUID();
  }
}
