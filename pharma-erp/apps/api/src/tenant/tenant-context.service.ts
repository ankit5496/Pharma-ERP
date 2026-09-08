import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable, InternalServerErrorException } from '@nestjs/common';

import type { RequestContext } from '@pharma-erp/types';

/**
 * Carries the current request's identity without threading it through every
 * function signature.
 *
 * AsyncLocalStorage rather than a `@Injectable({ scope: REQUEST })` provider:
 * request-scoped providers force every consumer up the chain to become
 * request-scoped too (Nest rebuilds the whole subtree per request), which would
 * mean a fresh PrismaService — and a fresh connection pool — on every call. ALS
 * keeps the providers singletons while still giving per-request state, and it is
 * readable from places Nest's DI does not reach.
 *
 * The store is filled in two stages, which is why RequestContext is mutable:
 * the middleware creates it with a request id before anything is known about
 * the caller, and JwtAuthGuard fills in the identity once the token has been
 * verified. Entering a new store from the guard instead would put the guard and
 * the controller in different contexts.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  /** Runs `fn` with `context` visible to everything it awaits. */
  run<T>(context: RequestContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  /** The current context, or undefined outside a request (jobs, boot). */
  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  /**
   * The current tenant id, or a 500 if there is none.
   *
   * A 500 rather than a 401 on purpose: by the time anything asks for the
   * tenant, JwtAuthGuard has already rejected an unauthenticated request and
   * refused a tenantless one on any route not marked `@AllowNoTenant`. Reaching
   * here without a tenant therefore means a route is misconfigured or the work
   * escaped the request scope — a server bug, not a client one.
   */
  requireTenantId(): string {
    const context = this.storage.getStore();

    if (!context?.tenantId) {
      throw new InternalServerErrorException(
        'No tenant context for this request. Either the route is marked @AllowNoTenant and should ' +
          'not be touching tenant-scoped data, or the work escaped the request scope ' +
          '(a detached promise, a setTimeout callback, an event listener).',
      );
    }

    return context.tenantId;
  }

  /** The acting user's id, or null before onboarding / for system work. */
  getUserId(): string | null {
    return this.storage.getStore()?.userId ?? null;
  }

  /** Correlation id for this request; always present inside a request. */
  getRequestId(): string | null {
    return this.storage.getStore()?.requestId ?? null;
  }
}
