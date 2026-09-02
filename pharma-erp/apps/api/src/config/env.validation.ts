import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
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
   * Clerk secret key. The API uses it to verify session tokens against Clerk's
   * JWKS and to write our role/tenant back to the Clerk user's metadata.
   */
  @IsString()
  @IsNotEmpty({ message: 'CLERK_SECRET_KEY is required (see .env.example)' })
  @Matches(/^sk_(test|live)_/, {
    message: 'CLERK_SECRET_KEY must start with sk_test_ or sk_live_',
  })
  CLERK_SECRET_KEY!: string;

  /**
   * Clerk publishable key. The API never authenticates with it, but validating
   * it here catches a mismatched pair (test key in the browser, live key on the
   * API) at boot instead of as puzzling 401s later.
   */
  @IsString()
  @IsNotEmpty({ message: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required (see .env.example)' })
  @Matches(/^pk_(test|live)_/, {
    message: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with pk_test_ or pk_live_',
  })
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!: string;

  /**
   * Comma-separated origins allowed to be the token's authorised party. When
   * set, a token minted for some other site is rejected even if its signature
   * is valid, which is what stops it being replayed against this API.
   * Recommended in production; defaults to WEB_ORIGIN when omitted.
   */
  @IsOptional()
  @IsString()
  CLERK_AUTHORIZED_PARTIES?: string;

  /**
   * Opt out of the "no Clerk test keys in production" rule. Intended for
   * staging and preview deployments, which run NODE_ENV=production but point at
   * a Clerk development instance. Never set this on a deployment serving real
   * users — see validateEnv.
   */
  @IsOptional()
  @IsString()
  ALLOW_CLERK_TEST_KEYS?: string;

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

  // A live Clerk instance behind a test key pair (or the reverse) means the web
  // app and the API are talking to two different Clerk environments, and every
  // token the browser sends will fail verification. Catch it at boot.
  const secretEnv = config.CLERK_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test';
  const publishableEnv = config.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_live_')
    ? 'live'
    : 'test';

  if (secretEnv !== publishableEnv) {
    throw new Error(
      `Clerk key mismatch: CLERK_SECRET_KEY is a ${secretEnv} key but ` +
        `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a ${publishableEnv} key. ` +
        'Both must come from the same Clerk instance.',
    );
  }

  if (config.NODE_ENV === NodeEnvironment.Production && secretEnv === 'test') {
    // Test keys in production are almost always a mistake — a Clerk development
    // instance has permissive origins and its own user pool, so real users would
    // be authenticating against a throwaway directory. But a staging deployment
    // legitimately runs NODE_ENV=production against test keys, so the rule is an
    // explicit opt-out rather than an absolute.
    if (!parseBoolean(config.ALLOW_CLERK_TEST_KEYS)) {
      throw new Error(
        'Refusing to start: NODE_ENV=production with Clerk TEST keys.\n' +
          '  For a real deployment, use live keys from your Clerk production instance.\n' +
          '  For staging/preview, set ALLOW_CLERK_TEST_KEYS=true to accept the risk.',
      );
    }

    // eslint-disable-next-line no-console -- must be visible in deploy logs before the logger exists
    console.warn(
      '[env] WARNING: running in production with Clerk TEST keys because ' +
        'ALLOW_CLERK_TEST_KEYS=true. Do not serve real users this way.',
    );
  }

  return config;
}

/** Reads a boolean from the loose string forms an env var arrives in. */
function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return false;

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
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
