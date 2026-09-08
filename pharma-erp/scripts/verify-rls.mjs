/**
 * Row-Level Security verification harness.
 *
 * Asserts the security properties this application actually depends on, against
 * a live PostgreSQL. Unit tests cannot cover these: RLS is enforced by the
 * database, so the only way to know it works is to ask the database.
 *
 * Run it:
 *   pnpm verify:rls
 *
 * It needs a migrated database and both URLs from .env:
 *   DATABASE_URL           the least-privilege app role  (properties are asserted as this role)
 *   MIGRATION_DATABASE_URL the database owner            (seed + cleanup + provisioning)
 *
 * It passes against both deployment shapes: a local superuser owner, and a
 * managed database whose owner is a plain non-superuser role.
 *
 * It creates two throwaway tenants with random slugs, asserts against them, and
 * removes them afterwards. It never reads or writes anything it did not create.
 */
import { randomUUID } from 'node:crypto';

import {
  assertRoleEnumsInSync,
  createPrismaClient,
  createProvisioningClient,
  forTenant,
  findLoginCandidateByEmail,
  resolveIdentityByUserId,
  runInTenantTransaction,
} from '@pharma-erp/database';

const { DATABASE_URL, MIGRATION_DATABASE_URL, NODE_ENV } = process.env;

if (!DATABASE_URL || !MIGRATION_DATABASE_URL) {
  console.error(
    'DATABASE_URL and MIGRATION_DATABASE_URL are both required.\n' +
      'Run this via `pnpm verify:rls` from the repo root so the root .env is loaded.',
  );
  process.exit(1);
}

if (NODE_ENV === 'production') {
  // It writes rows. That is fine on a dev or CI database and not fine anywhere
  // real, so refuse rather than trust the operator's aim.
  console.error('Refusing to run against NODE_ENV=production.');
  process.exit(1);
}

if (DATABASE_URL === MIGRATION_DATABASE_URL) {
  console.error(
    'DATABASE_URL and MIGRATION_DATABASE_URL are identical, so the application would be\n' +
      'connecting as the table owner — which can switch RLS off on its own tables, and\n' +
      'bypasses it outright if it is also a superuser. Every assertion below would pass\n' +
      'meaninglessly. Fix the two-role split first (see README, "Two roles, on purpose").',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tiny assertion harness. Deliberately not jest: this is a standalone script so
// it can be pointed at a staging database during a deploy check.
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  const suffix = detail ? ` — ${detail}` : '';
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${label}${suffix}`);
  } else {
    failed += 1;
    console.log(`  \x1b[31m✗\x1b[0m ${label}${suffix}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** Runs `fn`, returning the rejection message, or null if it resolved. */
async function rejection(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// ---------------------------------------------------------------------------

const suffix = randomUUID().slice(0, 8);
const alpha = {
  id: randomUUID(),
  slug: `zz-verify-alpha-${suffix}`,
  email: `admin@zz-verify-alpha-${suffix}.test`,
};
const beta = {
  id: randomUUID(),
  slug: `zz-verify-beta-${suffix}`,
  email: `admin@zz-verify-beta-${suffix}.test`,
};

const admin = createProvisioningClient(MIGRATION_DATABASE_URL);
const app = createPrismaClient({ databaseUrl: DATABASE_URL, logQueries: false });

async function seed() {
  // Mirrors OnboardingService exactly, including the part that matters: `users`
  // is FORCE'd, so even the owner connection must set app.current_tenant_id
  // before inserting. Seeding any other way would be testing a path the
  // application does not use.
  for (const tenant of [alpha, beta]) {
    tenant.userId = await admin.$transaction(async (tx) => {
      await tx.tenant.create({
        data: { id: tenant.id, slug: tenant.slug, name: `Verify ${tenant.slug}`, status: 'ACTIVE' },
      });

      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`;

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: tenant.email,
          // A syntactically-shaped but unusable hash. These accounts are never
          // signed in to, and a null hash would make them INVITED-shaped, which
          // would skew the login-lookup assertions below. No real password
          // produces this value, so it cannot be authenticated against.
          passwordHash: ['', 'argon2id', 'v=19', 'm=19456,t=2,p=1', 'unusable', 'unusable'].join(
            '$',
          ),
          fullName: `Admin ${tenant.slug}`,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      return user.id;
    });
  }
}

async function cleanup() {
  // Removing this run's rows means deliberately defeating the guards the
  // assertions above just verified, and there are TWO of them stacked:
  //
  //   1. The no-hard-delete / append-only triggers, so the triggers are disabled.
  //   2. RLS itself. audit_logs has no DELETE policy at all, so on a
  //      non-superuser owner the DELETE silently matches zero rows — no error,
  //      nothing removed — and the ON DELETE RESTRICT foreign key then blocks
  //      the tenant delete. Disabling the trigger alone is not enough; FORCE has
  //      to come off too so the owner is exempt from the policies.
  //
  // This is acceptable here and nowhere else, because it runs in one transaction
  // (an ACCESS EXCLUSIVE lock, so the guards are never observably absent to
  // concurrent traffic), the deletes are pinned to this run's generated UUIDs,
  // and it requires table-owner rights that no application path holds.
  //
  // If you are reading this because you want to purge audit rows in production:
  // don't. Archive the tenant instead.
  await admin.$transaction([
    admin.$executeRaw`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only`,
    admin.$executeRaw`ALTER TABLE users DISABLE TRIGGER users_no_hard_delete`,
    admin.$executeRaw`ALTER TABLE audit_logs NO FORCE ROW LEVEL SECURITY`,
    admin.$executeRaw`ALTER TABLE users NO FORCE ROW LEVEL SECURITY`,

    admin.$executeRaw`DELETE FROM audit_logs WHERE tenant_id IN (${alpha.id}::uuid, ${beta.id}::uuid)`,
    admin.$executeRaw`DELETE FROM users WHERE tenant_id IN (${alpha.id}::uuid, ${beta.id}::uuid)`,

    // Restore both guards before the transaction commits, so a crash between
    // here and the end cannot leave the tables permanently unprotected.
    admin.$executeRaw`ALTER TABLE users FORCE ROW LEVEL SECURITY`,
    admin.$executeRaw`ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY`,
    admin.$executeRaw`ALTER TABLE users ENABLE TRIGGER users_no_hard_delete`,
    admin.$executeRaw`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only`,
  ]);

  // tenants has its own no-hard-delete trigger; same treatment, once its
  // dependent rows are gone. No FORCE to remove — that is the point of
  // migration 20260901000300.
  await admin.$transaction([
    admin.$executeRaw`ALTER TABLE tenants DISABLE TRIGGER tenants_no_hard_delete`,
    admin.$executeRaw`DELETE FROM tenants WHERE id IN (${alpha.id}::uuid, ${beta.id}::uuid)`,
    admin.$executeRaw`ALTER TABLE tenants ENABLE TRIGGER tenants_no_hard_delete`,
  ]);
}

async function main() {
  console.log('\nVerifying Row-Level Security against a live database.');
  console.log(`Throwaway tenants: ${alpha.slug}, ${beta.slug}`);

  await app.$connect();
  await seed();

  const alphaDb = forTenant(app, alpha.id);
  const betaDb = forTenant(app, beta.id);

  section('Enforcement is on');
  const rlsState = await admin.$queryRaw`
    SELECT relname::text AS table_name, relrowsecurity AS enabled, relforcerowsecurity AS forced
    FROM pg_class WHERE relname IN ('tenants', 'users', 'audit_logs')`;
  const byTable = Object.fromEntries(rlsState.map((row) => [row.table_name, row]));

  check(
    'RLS is enabled on every tenant-scoped table',
    rlsState.length === 3 && rlsState.every((row) => row.enabled),
    rlsState.map((r) => `${r.table_name}=${r.enabled}`).join(' '),
  );

  // `tenants` is deliberately NOT forced — the owner must be able to provision.
  // `users` and `audit_logs` are, so they stay isolated even from the owner.
  // See migration 20260901000300 for the full reasoning.
  check(
    'FORCE is set on users + audit_logs and deliberately absent on tenants',
    byTable.users?.forced === true &&
      byTable.audit_logs?.forced === true &&
      byTable.tenants?.forced === false,
    rlsState.map((r) => `${r.table_name} forced=${r.forced}`).join(' '),
  );

  const isSuperuser =
    await app.$queryRaw`SELECT usesuper FROM pg_user WHERE usename = current_user`;
  check(
    'the application role is NOT a superuser (or RLS would be bypassed)',
    isSuperuser[0]?.usesuper === false,
    `usesuper=${isSuperuser[0]?.usesuper}`,
  );

  section('Tenant isolation');
  const alphaUsers = await alphaDb.user.findMany({ select: { email: true } });
  check(
    'a tenant-scoped client sees only its own users',
    alphaUsers.length === 1 && alphaUsers[0].email === `admin@${alpha.slug}.test`,
    `${alphaUsers.length} row(s)`,
  );

  const crossRead = await alphaDb.user.findMany({ where: { tenantId: beta.id } });
  check('an explicit cross-tenant where clause returns nothing', crossRead.length === 0);

  const unscoped = await app.user.findMany({ select: { id: true } });
  check(
    'an unscoped client fails closed (zero rows, not all rows)',
    unscoped.length === 0,
    `${unscoped.length} row(s)`,
  );

  section('Connection-pool safety');
  // The failure this catches: if the tenant were set per SESSION rather than per
  // TRANSACTION, a pooled connection would carry the previous caller's tenant.
  const interleaved = await Promise.all([
    alphaDb.user.findMany({ select: { email: true } }),
    betaDb.user.findMany({ select: { email: true } }),
    alphaDb.user.findMany({ select: { email: true } }),
    betaDb.user.findMany({ select: { email: true } }),
  ]);
  const seen = interleaved.map((rows) => rows.map((r) => r.email).join(','));
  check(
    'no tenant bleed across interleaved concurrent queries',
    seen[0] === `admin@${alpha.slug}.test` &&
      seen[1] === `admin@${beta.slug}.test` &&
      seen[2] === `admin@${alpha.slug}.test` &&
      seen[3] === `admin@${beta.slug}.test`,
  );

  const inTx = await runInTenantTransaction(app, alpha.id, async (tx) => tx.user.count());
  check(
    'runInTenantTransaction scopes a multi-statement transaction',
    inTx === 1,
    `${inTx} row(s)`,
  );

  section('Write protection');
  const crossWrite = await rejection(() =>
    alphaDb.user.create({
      data: {
        tenantId: beta.id,
        email: `smuggled-${suffix}@test.invalid`,
        fullName: 'Smuggled',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    }),
  );
  check(
    'writing a row into another tenant is refused',
    crossWrite !== null && /row-level security/i.test(crossWrite),
  );

  const noTenantWrite = await rejection(() =>
    app.user.create({
      data: {
        tenantId: alpha.id,
        email: `no-tenant-${suffix}@test.invalid`,
        fullName: 'No Tenant',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    }),
  );
  check(
    'writing with no tenant context raises require_tenant_id',
    noTenantWrite !== null && /current_tenant_id|row-level security/i.test(noTenantWrite),
  );

  // Two independent mechanisms block this, and which one fires depends on how
  // the deployment granted privileges: the prevent_hard_delete trigger, or the
  // simple absence of a DELETE grant. Either is a pass — what matters is that
  // the row survives, so assert the outcome rather than a particular message.
  const hardDelete = await rejection(() => alphaDb.user.delete({ where: { id: alpha.userId } }));
  const survivor = await alphaDb.user.count({ where: { id: alpha.userId } });
  check(
    'a hard DELETE on users cannot remove the row',
    hardDelete !== null && survivor === 1,
    hardDelete
      ? `blocked by: ${
          hardDelete
            .split('\n')
            .find((l) => /permission|not permitted/i.test(l))
            ?.trim() ?? 'error'
        }`
      : 'DELETE SUCCEEDED',
  );

  const deleteTrigger = await admin.$queryRaw`
    SELECT tgname::text AS name FROM pg_trigger
    WHERE tgrelid = 'users'::regclass AND NOT tgisinternal`;
  check(
    'the prevent_hard_delete trigger exists on users',
    deleteTrigger.some((t) => t.name === 'users_no_hard_delete'),
    deleteTrigger.map((t) => t.name).join(',') || 'none',
  );

  section('Audit trail is append-only');
  await alphaDb.auditLog.create({
    data: {
      tenantId: alpha.id,
      entityType: 'VerifyHarness',
      entityId: suffix,
      action: 'CREATE',
      afterJson: { note: 'written by scripts/verify-rls.mjs' },
    },
  });
  const auditRows = await alphaDb.auditLog.count();
  check('an audit row can be inserted', auditRows >= 1, `${auditRows} row(s)`);

  // Tampering is blocked by whichever mechanism applies to the connection:
  //   * a superuser bypasses RLS, so it reaches the append-only trigger and errors;
  //   * a non-superuser owner is subject to RLS, and audit_logs has no UPDATE or
  //     DELETE policy, so the statement matches zero rows and errors at all;
  //   * pharma_app has no UPDATE/DELETE grant at all.
  // All three leave the row untouched, which is the property worth asserting.
  // Checking for a specific error message would pass on one deployment shape and
  // fail on another while the data was equally safe.
  // Read through the TENANT-SCOPED client, not `admin`. audit_logs is FORCE'd
  // with no cross-tenant SELECT policy, so unless the provisioning connection
  // is a superuser it sees nothing here — which would make the before/after
  // comparison below compare undefined to undefined and pass vacuously.
  const original = await alphaDb.auditLog.findFirst({
    where: { tenantId: alpha.id },
    select: { id: true, entityId: true },
  });
  check(
    'the audit row is readable within its tenant',
    original != null,
    original?.entityId ?? 'null',
  );

  const auditUpdate = await rejection(
    () =>
      admin.$executeRaw`UPDATE audit_logs SET entity_id = 'TAMPERED' WHERE tenant_id = ${alpha.id}::uuid`,
  );
  const afterUpdate = await alphaDb.auditLog.findFirst({
    where: { id: original?.id },
    select: { entityId: true },
  });
  check(
    'UPDATE cannot alter an audit row, even on the provisioning connection',
    afterUpdate?.entityId === original?.entityId && afterUpdate?.entityId !== 'TAMPERED',
    auditUpdate ? 'rejected outright' : 'matched zero rows',
  );

  const auditDelete = await rejection(
    () => admin.$executeRaw`DELETE FROM audit_logs WHERE tenant_id = ${alpha.id}::uuid`,
  );
  const afterDelete = await alphaDb.auditLog.count({ where: { id: original?.id } });
  check(
    'DELETE cannot remove an audit row, even on the provisioning connection',
    afterDelete === 1,
    auditDelete ? 'rejected outright' : 'matched zero rows',
  );

  const auditTriggers = await admin.$queryRaw`
    SELECT tgname::text AS name FROM pg_trigger
    WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal`;
  check(
    'the append-only trigger exists on audit_logs',
    auditTriggers.some((t) => t.name === 'audit_logs_append_only'),
    auditTriggers.map((t) => t.name).join(',') || 'none',
  );

  section('Login lookup policy');
  // Sign-in arrives with an email and no tenant, and the tenant is what the
  // lookup is trying to discover — so one narrow SELECT policy exists for it.
  // Unlike the previous external-provider version, the key here is an
  // unauthenticated string typed at a login form, which is why these
  // assertions matter more than they used to.
  const candidate = await findLoginCandidateByEmail(app, alpha.email);
  check(
    'an email resolves to its account, tenant and role with no tenant set',
    candidate?.tenantId === alpha.id && candidate?.role === 'ADMIN',
    candidate ? `${candidate.email} / ${candidate.role}` : 'null',
  );

  const unknown = await findLoginCandidateByEmail(app, `nobody-${suffix}@nowhere.test`);
  check('an unknown email resolves to null', unknown === null);

  check(
    'the lookup is case-insensitive on the address',
    (await findLoginCandidateByEmail(app, alpha.email.toUpperCase()))?.tenantId === alpha.id,
  );

  // The policy must not become a cross-tenant read primitive: with a tenant
  // already set, another tenant's address must change nothing.
  const notWidened = await runInTenantTransaction(app, alpha.id, async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_login_email', ${beta.email}, true)`;
    return tx.user.findMany({ select: { email: true } });
  });
  check(
    'the login policy cannot widen an already-scoped query',
    notWidened.length === 1 && notWidened[0].email === alpha.email,
    notWidened.map((r) => r.email).join(','),
  );

  // A login lookup must expose the ONE row for the address and nothing else —
  // not the other tenant's users, and not a whole-table read.
  const scopedToOneRow = await app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_login_email', ${alpha.email}, true)`;
    return tx.user.findMany({ select: { email: true } });
  });
  check(
    'the login policy exposes exactly one row, not the table',
    scopedToOneRow.length === 1 && scopedToOneRow[0].email === alpha.email,
    `${scopedToOneRow.length} row(s)`,
  );

  section('Identity re-read on every request');
  // This is what makes revoking a role or disabling an account take effect
  // immediately rather than at token expiry.
  const reread = await resolveIdentityByUserId(app, alpha.id, alpha.userId);
  check('a user id + tenant resolves to the live account', reread?.email === alpha.email);

  const crossTenantToken = await resolveIdentityByUserId(app, beta.id, alpha.userId);
  check(
    'a token naming one tenant cannot resolve another tenant’s user',
    crossTenantToken === null,
    crossTenantToken ? 'LEAKED' : 'null',
  );

  section('Provisioning without a superuser');
  // This group exists because of a real bug: `tenants` was FORCE'd, which
  // extends RLS to the table owner. Locally that was invisible (the owner was
  // the `postgres` superuser, which bypasses RLS), but on any managed Postgres
  // — Render, Neon, RDS — there is no superuser and company signup failed
  // outright. These assertions run against whatever role MIGRATION_DATABASE_URL
  // names, so they catch it wherever it is pointed.
  const probeSlug = `zz-verify-probe-${suffix}`;
  const probeId = randomUUID();
  const provisionTenant = await rejection(() =>
    admin.tenant.create({ data: { id: probeId, slug: probeSlug, name: 'Probe', status: 'TRIAL' } }),
  );
  check(
    'the provisioning connection can create a tenant',
    provisionTenant === null,
    provisionTenant ?? '',
  );

  const listable = await admin.tenant.count({ where: { slug: probeSlug } });
  check('the provisioning connection can read tenants (slug availability)', listable === 1);

  // Whether the next assertion is meaningful depends on the deployment shape.
  // A superuser bypasses RLS unconditionally, so it CAN insert without a tenant
  // — that is PostgreSQL working as documented, not a defect. On a managed
  // database (Render, Neon, RDS) there is no superuser and the guard is live.
  const adminSuper =
    await admin.$queryRaw`SELECT usesuper FROM pg_user WHERE usename = current_user`;
  const adminIsSuperuser = adminSuper[0]?.usesuper === true;

  const probeUserId = randomUUID();
  const userWithoutTenant = await rejection(() =>
    admin.user.create({
      data: {
        id: probeUserId,
        tenantId: probeId,
        email: `probe-${suffix}@test.invalid`,
        fullName: 'Probe',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    }),
  );

  if (adminIsSuperuser) {
    check(
      'provisioning connection is a SUPERUSER — the no-tenant guard cannot apply to it',
      true,
      'expected locally; a managed database has no superuser, so verify there too',
    );
    console.log(
      '        \x1b[33mnote\x1b[0m MIGRATION_DATABASE_URL is a superuser. That is fine for local\n' +
        '        development, but it means this run cannot prove the provisioning path works\n' +
        '        where no superuser exists. Deploy targets should use a plain database owner.',
    );
  } else {
    check(
      'the provisioning connection still cannot insert a user without a tenant set',
      userWithoutTenant !== null && /current_tenant_id|row-level security/i.test(userWithoutTenant),
      userWithoutTenant ? 'refused' : 'INSERT SUCCEEDED — users is not protected from the owner',
    );
  }

  const forced = await admin.$queryRaw`
    SELECT relname::text AS table_name, relforcerowsecurity AS forced
    FROM pg_class WHERE relname IN ('users', 'audit_logs')`;
  check(
    'users and audit_logs are still FORCE’d, so even the owner is tenant-isolated',
    forced.length === 2 && forced.every((row) => row.forced),
    forced.map((r) => `${r.table_name}=${r.forced}`).join(' '),
  );

  // Tear down the probe. The user row only exists when the insert above
  // succeeded (the superuser case), but ON DELETE RESTRICT means the tenant
  // cannot go while it does, so remove it unconditionally.
  await admin.$transaction([
    admin.$executeRaw`ALTER TABLE users DISABLE TRIGGER users_no_hard_delete`,
    admin.$executeRaw`ALTER TABLE users NO FORCE ROW LEVEL SECURITY`,
    admin.$executeRaw`DELETE FROM users WHERE id = ${probeUserId}::uuid`,
    admin.$executeRaw`ALTER TABLE users FORCE ROW LEVEL SECURITY`,
    admin.$executeRaw`ALTER TABLE users ENABLE TRIGGER users_no_hard_delete`,
    admin.$executeRaw`ALTER TABLE tenants DISABLE TRIGGER tenants_no_hard_delete`,
    admin.$executeRaw`DELETE FROM tenants WHERE id = ${probeId}::uuid`,
    admin.$executeRaw`ALTER TABLE tenants ENABLE TRIGGER tenants_no_hard_delete`,
  ]);

  section('Schema invariants');
  const drift = await rejection(async () => assertRoleEnumsInSync());
  check('the Prisma UserRole enum matches @pharma-erp/types', drift === null, drift ?? '');
}

let exitCode = 0;

try {
  await main();
} catch (error) {
  console.error('\n\x1b[31mHarness error\x1b[0m:', error);
  exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error('\nCleanup failed; throwaway rows may remain:', error);
    exitCode = 1;
  }

  await app.$disconnect();
  await admin.$disconnect();
}

const line = '─'.repeat(56);
console.log(`\n${line}`);
if (failed === 0 && exitCode === 0) {
  console.log(`\x1b[32m  ${passed} passed\x1b[0m — tenant isolation verified`);
} else {
  console.log(`\x1b[31m  ${passed} passed, ${failed} failed\x1b[0m`);
  exitCode = 1;
}
console.log(`${line}\n`);

process.exit(exitCode);
