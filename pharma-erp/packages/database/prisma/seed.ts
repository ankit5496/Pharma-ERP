/**
 * Development seed: one tenant and one admin user, so the API has something to
 * resolve a tenant against before auth exists.
 *
 * It deliberately connects on MIGRATION_DATABASE_URL (the superuser). Tenant
 * provisioning is a platform operation that RLS blocks for the application
 * role by design — there is no INSERT policy on `tenants` — so seeding through
 * the runtime connection would (correctly) fail.
 */
import { PrismaClient } from '../generated/client';

const adminUrl = process.env.MIGRATION_DATABASE_URL;

if (!adminUrl) {
  console.error(
    'MIGRATION_DATABASE_URL is not set. Run this via `pnpm db:seed` from the repo root so the root .env is loaded.',
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-pharma' },
    update: {},
    create: {
      slug: 'demo-pharma',
      name: 'Demo Pharma Manufacturing Pvt Ltd',
      status: 'ACTIVE',
      drugLicenceNumber: 'MH-DEMO-25B-0001',
      gstin: '27AAAAA0000A1Z5',
      timezone: 'Asia/Kolkata',
    },
  });

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo-pharma.test' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo-pharma.test',
      fullName: 'Demo Admin',
      role: 'ADMIN',
      // No auth provider is wired yet, so there is no external subject id to
      // link and the account stays INVITED.
      status: 'INVITED',
    },
  });

  console.info('Seeded tenant:', { id: tenant.id, slug: tenant.slug });
  console.info('Seeded admin user:', { id: admin.id, email: admin.email });
  console.info(
    `\nUse this tenant id with the dev header while auth is unwired:\n  x-tenant-id: ${tenant.id}\n`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
