/**
 * Creates a company and its first Admin.
 *
 * This is the platform operator's tool — the "super user" path. It is a script
 * rather than a web page on purpose: an internet-facing endpoint that can
 * create tenants is the single most dangerous thing this system could expose,
 * and nobody needs to onboard a pharma manufacturer from a phone.
 *
 * Run it:
 *   pnpm create-tenant --name "Acme Pharma" --slug acme --admin-email admin@acme.com \
 *                      --admin-name "Priya Sharma" [--password "..."] [--licence MH-...] [--gstin 27...]
 *
 * With no --password, a strong one is generated and printed once. Give it to
 * the Admin out of band; they are forced to replace it on first sign-in.
 *
 * Connects on MIGRATION_DATABASE_URL, because creating a tenant is inherently
 * cross-tenant: `tenants` has no INSERT policy for the application role, by
 * design, so no request-scoped code path can conjure a company.
 */
import { randomBytes } from 'node:crypto';

import { hash, Algorithm } from '@node-rs/argon2';
import {
  createProvisioningClient,
  RESERVED_TENANT_SLUGS,
  slugifyCompanyName,
} from '@pharma-erp/database';
// PG_TENANT_SETTING is defined in @pharma-erp/types, not re-exported by the
// database package. Importing it from the wrong place fails at load time under
// Node's ESM loader, which can only see a CommonJS module's direct exports.
import { PG_TENANT_SETTING } from '@pharma-erp/types';

// Must match apps/api/src/auth/password.service.ts. A hash written here with
// different parameters still verifies (argon2 records them in the string), but
// keeping them equal means a CLI-created password costs the same to check.
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const PASSWORD_MIN_LENGTH = 12;

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = argv[i + 1];

    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** Unambiguous alphabet: no I/l/1/O/0, because this gets read aloud or retyped. */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(64);
  let out = '';

  for (const byte of bytes) {
    if (out.length === 20) break;
    // Rejection sampling: the modulo shortcut would bias the distribution
    // toward the start of the alphabet.
    if (byte < 256 - (256 % alphabet.length)) out += alphabet[byte % alphabet.length];
  }

  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
  Create a company and its first Admin.

    --name          Company name, as registered                      (required)
    --slug          URL-safe identifier; defaults to a slug of --name
    --admin-email   The first Admin's email address                  (required)
    --admin-name    The first Admin's full name                      (required)
    --password      Temporary password; generated if omitted
    --licence       Manufacturing licence number
    --gstin         15-character GST registration number
    --timezone      IANA zone, default Asia/Kolkata
`);
  process.exit(0);
}

const { MIGRATION_DATABASE_URL } = process.env;

if (!MIGRATION_DATABASE_URL) {
  fail(
    'MIGRATION_DATABASE_URL is not set.\n  Run this via `pnpm create-tenant` from the repo root so the root .env is loaded.',
  );
}

const companyName = typeof args.name === 'string' ? args.name.trim() : '';
const adminEmail =
  typeof args['admin-email'] === 'string' ? args['admin-email'].trim().toLowerCase() : '';
const adminName = typeof args['admin-name'] === 'string' ? args['admin-name'].trim() : '';

if (!companyName) fail('--name is required. Use --help for usage.');
if (!adminEmail) fail('--admin-email is required.');
if (!adminName) fail('--admin-name is required.');

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  fail(`--admin-email does not look like an email address: ${adminEmail}`);
}

const slug =
  typeof args.slug === 'string' && args.slug.trim()
    ? args.slug.trim().toLowerCase()
    : slugifyCompanyName(companyName);

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 63) {
  fail(
    `Slug "${slug}" is invalid. Use 3-63 characters: lowercase letters, digits and single hyphens.`,
  );
}

if (RESERVED_TENANT_SLUGS.includes(slug)) {
  fail(`Slug "${slug}" is reserved. Choose another with --slug.`);
}

const generated = typeof args.password !== 'string';
const password = generated ? generatePassword() : args.password;

if (password.length < PASSWORD_MIN_LENGTH) {
  fail(`--password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
}

const prisma = createProvisioningClient(MIGRATION_DATABASE_URL);

try {
  const passwordHash = await hash(password, ARGON2_OPTIONS);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        slug,
        name: companyName,
        // TRIAL, not ACTIVE: activation is a commercial decision, not something
        // a provisioning script should grant.
        status: 'TRIAL',
        drugLicenceNumber: typeof args.licence === 'string' ? args.licence.toUpperCase() : null,
        gstin: typeof args.gstin === 'string' ? args.gstin.toUpperCase() : null,
        timezone: typeof args.timezone === 'string' ? args.timezone : 'Asia/Kolkata',
      },
      select: { id: true, slug: true, name: true },
    });

    // `users` keeps FORCE ROW LEVEL SECURITY, so this insert is subject to
    // users_tenant_isolation even on the owner connection. Setting the tenant
    // just created lets the WITH CHECK pass on its own terms rather than by
    // exemption — the same approach the API's provisioning path uses.
    await tx.$executeRaw`SELECT set_config(${PG_TENANT_SETTING}, ${tenant.id}, true)`;

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: adminEmail,
        fullName: adminName,
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordHash,
        passwordSetAt: new Date(),
        // Whoever ran this script knows the password, so it is a shared secret
        // until the Admin replaces it on first sign-in.
        mustChangePassword: true,
      },
      select: { id: true, email: true },
    });

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        entityType: 'Tenant',
        entityId: tenant.id,
        action: 'CREATE',
        // userId is null: this was the platform operator via CLI, not a user
        // inside the tenant. Honest attribution beats a convenient fiction.
        afterJson: {
          event: 'TENANT_PROVISIONED_VIA_CLI',
          slug: tenant.slug,
          name: tenant.name,
          firstAdminUserId: user.id,
          firstAdminEmail: user.email,
        },
      },
    });

    return { tenant, user };
  });

  const line = '─'.repeat(64);
  console.log(`\n${line}`);
  console.log(`  Company created: ${result.tenant.name}`);
  console.log(`${line}`);
  console.log(`  Tenant id   : ${result.tenant.id}`);
  console.log(`  Identifier  : ${result.tenant.slug}`);
  console.log(`  Status      : TRIAL`);
  console.log(`\n  Admin sign-in`);
  console.log(`  Email       : ${result.user.email}`);
  console.log(`  Password    : ${password}`);
  console.log(`${line}`);

  if (generated) {
    console.log('\n  This password is shown once and is not stored anywhere in readable form.');
  }

  console.log(
    '  Give it to the Admin directly. They must change it on first sign-in before\n' +
      '  they can reach anything else, and can then create their colleagues.\n',
  );
} catch (error) {
  if (error?.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : '';

    if (target.includes('slug')) {
      fail(`A company with the identifier "${slug}" already exists. Choose another with --slug.`);
    }

    fail(`The email address "${adminEmail}" is already in use on this platform.`);
  }

  console.error('\n  Failed to create the company:\n', error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
