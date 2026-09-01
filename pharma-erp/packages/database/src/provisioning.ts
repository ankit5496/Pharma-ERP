import { PrismaClient } from '@prisma/client';

/**
 * Builds the elevated client used for tenant provisioning only.
 *
 * Why a second client exists at all: creating a Tenant is a platform operation,
 * and `tenants` has no INSERT policy for the application role — deliberately, so
 * that no request-scoped code path can conjure a tenant. Company signup is the
 * one legitimate exception, and it runs here, on MIGRATION_DATABASE_URL, whose
 * role is a superuser and therefore bypasses RLS entirely.
 *
 * That makes this function a genuine security boundary. Two rules for anything
 * that touches the client it returns:
 *   1. It must filter by tenant itself. RLS will not do it for you here.
 *   2. It should do the minimum and hand back to the tenant-scoped client.
 */
export function createProvisioningClient(migrationDatabaseUrl: string): PrismaClient {
  if (!migrationDatabaseUrl) {
    throw new Error('MIGRATION_DATABASE_URL is required to provision tenants (see .env.example).');
  }

  return new PrismaClient({
    datasources: { db: { url: migrationDatabaseUrl } },
    // No query logging: statements on this connection carry new tenants' details
    // and are the least interesting, most sensitive traffic in the system.
    log: ['warn', 'error'],
  });
}

/** Reserved slugs that would collide with application routes or look official. */
export const RESERVED_TENANT_SLUGS: readonly string[] = [
  'admin',
  'api',
  'app',
  'auth',
  'dashboard',
  'health',
  'onboarding',
  'pharma-erp',
  'sign-in',
  'sign-up',
  'support',
  'system',
  'www',
];

/**
 * Normalises a company name into a candidate slug. The API validates the final
 * value with class-validator; this is the convenience transform behind the
 * signup form's suggestion.
 */
export function slugifyCompanyName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/, '');
}
