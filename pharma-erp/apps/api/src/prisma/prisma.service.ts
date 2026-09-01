import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import {
  assertRoleEnumsInSync,
  createPrismaClient,
  forTenant,
  resolveIdentityByExternalAuthId,
  runInTenantTransaction,
  type Prisma,
  type PrismaClient,
  type ResolvedIdentity,
  type TenantScopedClient,
} from '@pharma-erp/database';

import { TenantContextService } from '../tenant/tenant-context.service';

/**
 * Owns the single PrismaClient for the process.
 *
 * Deliberately NOT `extends PrismaClient`: the common Nest recipe does that,
 * which makes the unscoped client injectable everywhere and one forgotten
 * `where: { tenantId }` away from a cross-tenant leak. Here the unscoped client
 * is private and callers get `scoped`, which is bound to the current request's
 * tenant and runs under RLS.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient;

  constructor(private readonly tenantContext: TenantContextService) {
    this.client = createPrismaClient();
  }

  async onModuleInit(): Promise<void> {
    // Fail fast: a bad DATABASE_URL should stop the boot, not surface as a 500
    // on the first request that touches the database.
    await this.client.$connect();
    assertRoleEnumsInSync();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  /**
   * The tenant-scoped client for the current request. Every query it issues
   * runs in a transaction with `app.current_tenant_id` set, so the RLS policies
   * apply.
   *
   * Throws if there is no tenant on the request — which is the intended
   * behaviour: a handler that needs data must know whose data it is.
   */
  get scoped(): TenantScopedClient {
    return forTenant(this.client, this.tenantContext.requireTenantId());
  }

  /**
   * Several statements, one transaction, one tenant scope. Prefer this over a
   * sequence of `scoped` calls whenever the writes must be atomic.
   */
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return runInTenantTransaction(this.client, this.tenantContext.requireTenantId(), fn, options);
  }

  /**
   * Resolves a verified Clerk subject to our user and tenant.
   *
   * The one query that legitimately runs without a tenant, because the tenant is
   * what it is looking up. It is not unscoped in the dangerous sense: the
   * `users_auth_bootstrap` RLS policy restricts it to the single row whose
   * `external_auth_id` matches the subject the API just verified. See
   * packages/database/prisma/migrations/20260901000200_auth_bootstrap.
   */
  async resolveIdentity(externalAuthId: string): Promise<ResolvedIdentity | null> {
    return resolveIdentityByExternalAuthId(this.client, externalAuthId);
  }

  /**
   * Unscoped client, for the narrow set of operations that legitimately have no
   * tenant: liveness probes and platform-level jobs.
   *
   * This does not bypass RLS — the application role cannot — so queries against
   * tenant-scoped tables will simply return nothing. Every call site should say
   * why it is here.
   */
  get unscoped(): PrismaClient {
    return this.client;
  }
}
