import type { Prisma, PrismaClient } from '@prisma/client';

import { PG_TENANT_SETTING } from '@pharma-erp/types';

/**
 * A PrismaClient that has been bound to one tenant. Structurally identical to
 * PrismaClient for query purposes, but every operation it performs runs inside
 * a transaction that has `app.current_tenant_id` set, so PostgreSQL RLS applies.
 */
export type TenantScopedClient = ReturnType<typeof forTenant>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Binds a client to a tenant for the lifetime of the returned object.
 *
 * The mechanism matters, so: PostgreSQL settings are per-session, and Prisma
 * hands out connections from a pool, so setting the tenant "once per request"
 * on a bare client would leak across requests. Instead every operation is
 * wrapped in a transaction that first calls `set_config(..., true)` — the
 * `true` makes it SET LOCAL, scoped to that transaction and therefore to that
 * one connection checkout. There is no window in which a connection carries the
 * wrong tenant.
 *
 * Cost: one extra round trip per operation, and each operation becomes its own
 * transaction. Where that matters, batch work inside a single
 * `runInTenantTransaction` call instead of issuing many scoped operations.
 */
export function forTenant(prisma: PrismaClient, tenantId: string) {
  assertTenantId(tenantId);

  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            setTenantStatement(prisma, tenantId),
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

/**
 * Runs `fn` inside a single tenant-scoped interactive transaction.
 *
 * Use this rather than `forTenant` when several statements must be atomic, or
 * when the per-operation transaction overhead of `forTenant` is measurable. The
 * client passed to `fn` is the transaction client: queries issued on it are in
 * scope, queries issued on the outer client are NOT.
 */
export async function runInTenantTransaction<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  },
): Promise<T> {
  assertTenantId(tenantId);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config(${PG_TENANT_SETTING}, ${tenantId}, true)`;
    return fn(tx);
  }, options);
}

/**
 * Escape hatch for genuinely cross-tenant platform work: tenant provisioning,
 * the platform admin console, background reconciliation. Named to be
 * conspicuous in review — every call site should carry a comment justifying it.
 *
 * This does NOT disable RLS (the app role cannot); it simply leaves
 * `app.current_tenant_id` unset, which means tenant-scoped tables return zero
 * rows. Operations that must truly span tenants have to run on the migration /
 * admin connection.
 */
export function withoutTenantScope(prisma: PrismaClient): PrismaClient {
  return prisma;
}

function setTenantStatement(prisma: PrismaClient, tenantId: string) {
  // Parameterised via the tagged template, so the uuid is never interpolated
  // into SQL text. `true` = SET LOCAL semantics (transaction-scoped).
  return prisma.$executeRaw`SELECT set_config(${PG_TENANT_SETTING}, ${tenantId}, true)`;
}

function assertTenantId(tenantId: string): void {
  if (!UUID_RE.test(tenantId)) {
    // A malformed tenant id means the caller's tenant resolution is broken.
    // Failing here beats sending a value the RLS policy will silently reject.
    throw new TypeError(`Invalid tenant id: expected a UUID, received ${JSON.stringify(tenantId)}`);
  }
}
