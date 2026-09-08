import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Log = 'log',
  Debug = 'debug',
  Verbose = 'verbose',
}

/**
 * The API's environment contract. Anything the process needs in order to serve
 * a request belongs here; nothing reads `process.env` directly past this point.
 *
 * Validated once at boot by `validateEnv` below, which throws — the process
 * exits rather than starting up half-configured and failing on first request.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnvironment, {
    message: `NODE_ENV must be one of: ${Object.values(NodeEnvironment).join(', ')}`,
  })
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  /**
   * Port to listen on. Render, Heroku, Fly and friends inject PORT and expect
   * the process to honour it; API_PORT is the local, explicit name. PORT wins
   * when both are present — see validateEnv.
   */
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT: number = 4000;

  /**
   * Runtime database connection. Must point at the least-privilege application
   * role so PostgreSQL RLS is enforced — see the RLS migration's header.
   */
  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL is required (see .env.example)' })
  DATABASE_URL!: string;

  /**
   * Migration/admin connection. Used at runtime for exactly one thing — company
   * provisioning, which RLS blocks for the application role by design — so a
   * missing value must fail the boot, not the first signup.
   */
  @IsString()
  @IsNotEmpty({ message: 'MIGRATION_DATABASE_URL is required (see .env.example)' })
  MIGRATION_DATABASE_URL!: string;

  /** Comma-separated list of browser origins permitted by CORS. */
  @IsString()
  @IsNotEmpty()
  WEB_ORIGIN: string = 'http://localhost:3000';

  @IsOptional()
  @IsEnum(LogLevel)
  LOG_LEVEL: LogLevel = LogLevel.Log;

  /**
   * HMAC key for signing access tokens.
   *
   * 32 characters minimum, because a short key is brute-forceable offline from
   * a single captured token — and forging a token means impersonating any user
   * in any tenant. Generate one with:
   *   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   *
   * Changing it invalidates every session immediately, which is the intended
   * lever if you ever need to sign everyone out at once.
   */
  @IsString()
  @IsNotEmpty({ message: 'JWT_SECRET is required (see .env.example)' })
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  JWT_SECRET!: string;

  /**
   * Session lifetime in seconds. Default 8 hours — one working shift, so an
   * operator is not signed out mid-batch, and a stolen token expires the same
   * day. There are no refresh tokens: with the per-request account re-read,
   * disabling a user already takes effect immediately, and a refresh flow would
   * add a second credential to protect for no gain here.
   */
  @IsInt()
  @Min(300)
  @Max(86_400)
  SESSION_TTL_SECONDS: number = 28_800;

  /** Reported by `GET /health`; injected by CI, defaulted for local runs. */
  @IsOptional()
  @IsString()
  APP_VERSION?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  NEXT_PUBLIC_API_URL?: string;
}

/**
 * Coerces and validates the raw environment. Registered as ConfigModule's
 * `validate` hook, so it runs before any provider is instantiated.
 */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(
    EnvironmentVariables,
    {
      ...raw,
      // Everything arrives from the OS as a string; class-validator's @IsInt
      // needs a real number, so coerce that one field here rather than
      // sprinkling @Transform across the class.
      // PORT first: a platform that injects it has already bound that port and
      // will health-check it, so ignoring it means the deploy never goes live.
      API_PORT: resolvePort(raw.PORT, raw.API_PORT),
      SESSION_TTL_SECONDS:
        raw.SESSION_TTL_SECONDS === undefined || raw.SESSION_TTL_SECONDS === ''
          ? undefined
          : Number(raw.SESSION_TTL_SECONDS),
    },
    { exposeDefaultValues: true, enableImplicitConversion: false },
  );

  const errors = validateSync(config, {
    skipMissingProperties: false,
    whitelist: false,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `  - ${error.property}: ${Object.values(error.constraints ?? {}).join('; ')}`)
      .join('\n');

    // Two audiences read this: someone running locally who forgot to create
    // .env, and someone staring at a deploy log wondering where to put values
    // when there is no .env file at all. Address both, because the second case
    // is where a "copy .env.example" hint wastes the most time.
    throw new Error(
      `Invalid environment configuration.\n${details}\n\n` +
        `  Local:  copy .env.example to .env at the repo root and fill these in.\n` +
        `  Hosted: set them as environment variables on the service (Render:\n` +
        `          Dashboard -> your service -> Environment -> Add Environment Variable).\n` +
        `          There is no .env file in a deployed container; the platform supplies them.`,
    );
  }

  assertDatabaseHostsAreNotLoopback(config);

  return config;
}

/** Hosts that cannot possibly be a managed database from inside a container. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/**
 * In production, refuses a database URL pointing at loopback.
 *
 * Both DATABASE_URL and MIGRATION_DATABASE_URL were previously checked only for
 * emptiness, which let a value copied out of a local .env pass the boot and fail
 * later — and the two connections fail at different moments, which is what makes
 * this worth a dedicated check. DATABASE_URL is exercised by /health/ready, so a
 * bad value shows up as a failed deploy. MIGRATION_DATABASE_URL is used at
 * runtime by exactly one area, /platform, so a bad value boots healthy and then
 * surfaces as "Internal server error" the first time an operator signs in —
 * with the real reason (`Can't reach database server at localhost:5432`) visible
 * only in the service log.
 *
 * Not applied outside production, where loopback is the correct value.
 */
function assertDatabaseHostsAreNotLoopback(config: EnvironmentVariables): void {
  if (config.NODE_ENV !== NodeEnvironment.Production) return;

  const offenders: string[] = [];

  for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL'] as const) {
    const value = config[key];

    let host: string;

    try {
      // A Postgres URL is URL-parseable; hostname strips any port and brackets.
      host = new URL(value).hostname.toLowerCase();
    } catch {
      // Not parseable, so nothing to assert. Emptiness is already covered, and
      // Prisma gives a better message for a malformed URL than this could.
      continue;
    }

    if (LOOPBACK_HOSTS.has(host)) offenders.push(`${key} points at ${host}`);
  }

  if (offenders.length === 0) return;

  throw new Error(
    `Refusing to start: a database URL points at this container, not at your database.\n` +
      offenders.map((o) => `  - ${o}\n`).join('') +
      `\n  A deployed container has no database on localhost. Set these to the\n` +
      `  database's INTERNAL connection string (Render: Dashboard -> your\n` +
      `  Postgres instance -> Connections -> Internal Database URL).\n\n` +
      `  DATABASE_URL must use the least-privilege application role, or\n` +
      `  row-level security does not apply to it and tenant isolation is lost.\n` +
      `  MIGRATION_DATABASE_URL is the owner connection.`,
  );
}

/**
 * Chooses the listen port, preferring the platform's `PORT` over `API_PORT`.
 *
 * A host that injects `PORT` (Render, Heroku, Fly, Cloud Run) has already
 * decided which port it will route traffic to and health-check. Binding
 * anything else means the deploy never turns healthy, with no error to explain
 * why — so `PORT` has to win when both are set.
 */
function resolvePort(port: unknown, apiPort: unknown): number | undefined {
  const candidate = port ?? apiPort;

  if (candidate === undefined || candidate === null || candidate === '') return undefined;

  return Number(candidate);
}
