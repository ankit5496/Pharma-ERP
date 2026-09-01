import { PrismaClient, type Prisma } from '@prisma/client';

export interface CreatePrismaClientOptions {
  /** Overrides `DATABASE_URL`. Useful in tests against a throwaway database. */
  databaseUrl?: string;
  /** Emit query-level logs. Defaults to true outside production. */
  logQueries?: boolean;
}

/**
 * Builds the single PrismaClient the API uses at runtime.
 *
 * Note the connection this uses: `DATABASE_URL` points at the least-privilege
 * `pharma_app` role, not the superuser. That is what makes RLS effective — see
 * the header of prisma/migrations/20260901000100_rls_and_guards/migration.sql.
 */
export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const logQueries = options.logQueries ?? process.env.NODE_ENV !== 'production';

  const log: Prisma.LogLevel[] = logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'];

  return new PrismaClient({
    log,
    ...(options.databaseUrl ? { datasources: { db: { url: options.databaseUrl } } } : {}),
  });
}
