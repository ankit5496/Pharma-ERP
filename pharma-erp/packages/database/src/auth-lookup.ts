import type { PrismaClient } from '@prisma/client';

import { PG_EXTERNAL_AUTH_SETTING } from '@pharma-erp/types';

/** Row shape the API needs to build a RequestContext and a SessionUser. */
export interface ResolvedIdentity {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
}

/**
 * Resolves a verified Clerk subject to our own user + tenant.
 *
 * Runs in a transaction that sets `app.current_external_auth_id` but NOT
 * `app.current_tenant_id` — the tenant is what we are trying to discover. The
 * `users_auth_bootstrap` / `tenants_auth_bootstrap` policies (see
 * migrations/20260901000200_auth_bootstrap) exist precisely for this query and
 * expose at most the caller's own row.
 *
 * Returns null when the subject has no user row yet, which is the normal state
 * between "signed up with Clerk" and "created their company".
 */
export async function resolveIdentityByExternalAuthId(
  prisma: PrismaClient,
  externalAuthId: string,
): Promise<ResolvedIdentity | null> {
  if (!externalAuthId) return null;

  return prisma.$transaction(async (tx) => {
    // set_config with `true` = SET LOCAL: scoped to this transaction, and
    // therefore to this connection checkout. Parameterised via the tagged
    // template, so the subject is never interpolated into SQL text.
    await tx.$executeRaw`SELECT set_config(${PG_EXTERNAL_AUTH_SETTING}, ${externalAuthId}, true)`;

    const user = await tx.user.findFirst({
      where: { externalAuthId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        tenant: { select: { name: true, slug: true, status: true, deletedAt: true } },
      },
    });

    // A user whose tenant has been soft-deleted has no working session.
    if (!user || user.tenant.deletedAt !== null) return null;

    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      tenantName: user.tenant.name,
      tenantSlug: user.tenant.slug,
      tenantStatus: user.tenant.status,
    };
  });
}
