import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import {
  assertRoleEnumsInSync,
  createPrismaClient,
  findLoginCandidateByEmail,
  forTenant,
  resolveIdentityByUserId,
  runInTenantTransaction,
  type LoginCandidate,
  type Prisma,
  type PrismaClient,
  type ResolvedIdentity,
  type TenantScopedClient,
} from '@pharma-erp/database';

import { TenantContextService } from '../tenant/tenant-context.service';

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
   * Throws if there is no tenant on the request — intended behaviour: a handler
   * that needs data must know whose data it is.
   */
  get scoped(): TenantScopedClient {
    return forTenant(this.client, this.tenantContext.requireTenantId());
  }

  /** Several statements, one transaction, one tenant scope. */
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return runInTenantTransaction(this.client, this.tenantContext.requireTenantId(), fn, options);
  }

  /**
   * Finds the account for an email during sign-in, before any tenant is known.
   *
   * The one query that legitimately runs without a tenant, because the tenant
   * is what it is looking up. Not unscoped in the dangerous sense: the
   * `users_login_lookup` RLS policy restricts it to the single row matching the
   * address supplied. See migration 20260902000000_local_authentication.
   *
   * Returns the password hash, so the result must never reach a response body.
   */
  async findLoginCandidate(email: string): Promise<LoginCandidate | null> {
    return findLoginCandidateByEmail(this.client, email);
  }

  /**
   * Re-reads the account named by a verified token. Called on every
   * authenticated request, which is what makes a role change or an account
   * being disabled take effect immediately rather than at token expiry.
   */
  async resolveIdentity(tenantId: string, userId: string): Promise<ResolvedIdentity | null> {
    return resolveIdentityByUserId(this.client, tenantId, userId);
  }

  /**
   * Updates the failed-attempt counter, lockout and last-login timestamp.
   *
   * Runs outside the request's tenant scope by necessity — it is called during
   * sign-in, before authentication has succeeded and before any tenant context
   * exists, so `scoped` would throw. Safety comes from the arguments: the
   * tenant is passed explicitly (from the row just looked up, not from user
   * input) and set on the transaction, so RLS still applies and the update is
   * addressed by primary key within that tenant.
   *
   * Deliberately narrow — it accepts only these three fields. A general-purpose
   * "update any user without tenant context" helper is exactly the thing that
   * would eventually be misused.
   */
  async updateLoginState(
    tenantId: string,
    userId: string,
    state: { failedLoginAttempts?: number; lockedUntil?: Date | null; lastLoginAt?: Date },
  ): Promise<void> {
    await runInTenantTransaction(this.client, tenantId, async (tx) => {
      await tx.user.update({ where: { id: userId }, data: state });
    });
  }

  /**
   * Unscoped client, for the narrow set of operations that legitimately have no
   * tenant: liveness probes and platform-level jobs.
   *
   * This does not bypass RLS — the application role cannot — so queries against
   * tenant-scoped tables return nothing. Every call site should say why it is here.
   */
  get unscoped(): PrismaClient {
    return this.client;
  }
}
