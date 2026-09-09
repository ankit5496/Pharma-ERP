import { NodeEnvironment, validateEnv } from './env.validation';

const VALID = {
  NODE_ENV: 'development',
  API_PORT: '4000',
  DATABASE_URL: 'postgresql://pharma_app:pw@localhost:5432/pharma_erp?schema=public',
  MIGRATION_DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/pharma_erp?schema=public',
  WEB_ORIGIN: 'http://localhost:3000',
  JWT_SECRET: 'a'.repeat(48),
};

describe('validateEnv', () => {
  it('accepts a valid environment and coerces the port to a number', () => {
    const result = validateEnv({ ...VALID });

    expect(result.API_PORT).toBe(4000);
    expect(result.NODE_ENV).toBe(NodeEnvironment.Development);
  });

  it.each(['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'JWT_SECRET'])(
    'refuses to start when %s is missing',
    (key) => {
      const raw: Record<string, unknown> = { ...VALID };
      delete raw[key];

      expect(() => validateEnv(raw)).toThrow(new RegExp(key));
    },
  );

  it('rejects an unknown NODE_ENV rather than silently defaulting', () => {
    expect(() => validateEnv({ ...VALID, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  describe('listen port', () => {
    it('rejects a port outside the valid range', () => {
      expect(() => validateEnv({ ...VALID, API_PORT: '70000' })).toThrow(/API_PORT/);
    });

    it('prefers the platform PORT over API_PORT', () => {
      // A host that injects PORT has already bound and health-checked it, so
      // binding API_PORT instead means the deploy never turns healthy.
      const result = validateEnv({ ...VALID, PORT: '10000', API_PORT: '4000' });

      expect(result.API_PORT).toBe(10_000);
    });

    it('falls back to API_PORT when PORT is absent', () => {
      expect(validateEnv({ ...VALID, API_PORT: '4100' }).API_PORT).toBe(4100);
    });
  });

  describe('JWT_SECRET', () => {
    it('rejects a secret shorter than 32 characters', () => {
      // A short HMAC key is brute-forceable offline from one captured token,
      // and forging a token means impersonating any user in any tenant.
      expect(() => validateEnv({ ...VALID, JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
    });

    it('accepts a 32-character secret', () => {
      expect(validateEnv({ ...VALID, JWT_SECRET: 'b'.repeat(32) }).JWT_SECRET).toHaveLength(32);
    });
  });

  describe('SESSION_TTL_SECONDS', () => {
    it('defaults to eight hours', () => {
      expect(validateEnv({ ...VALID }).SESSION_TTL_SECONDS).toBe(28_800);
    });

    it('is coerced from a string', () => {
      expect(validateEnv({ ...VALID, SESSION_TTL_SECONDS: '3600' }).SESSION_TTL_SECONDS).toBe(3600);
    });

    it.each(['60', '200000'])('rejects an out-of-range value (%s)', (value) => {
      // Too short makes the app unusable mid-task; too long defeats the point
      // of a short-lived token in the first place.
      expect(() => validateEnv({ ...VALID, SESSION_TTL_SECONDS: value })).toThrow(
        /SESSION_TTL_SECONDS/,
      );
    });
  });
  describe('loopback database URLs in production', () => {
    // The VALID fixture is deliberately all-localhost, which is correct for
    // development — so most of these cases differ from it only by NODE_ENV.
    const PROD_HOSTS = {
      DATABASE_URL: 'postgresql://pharma_app:pw@dpg-abc123-a:5432/pharma_erp?sslmode=require',
      MIGRATION_DATABASE_URL:
        'postgresql://pharma_erp_owner:pw@dpg-abc123-a:5432/pharma_erp?sslmode=require',
    };

    it('allows loopback outside production', () => {
      expect(() => validateEnv({ ...VALID, NODE_ENV: 'development' })).not.toThrow();
      expect(() => validateEnv({ ...VALID, NODE_ENV: 'test' })).not.toThrow();
    });

    it('accepts real hosts in production', () => {
      expect(() => validateEnv({ ...VALID, ...PROD_HOSTS, NODE_ENV: 'production' })).not.toThrow();
    });

    it.each([
      ['localhost', 'postgresql://u:p@localhost:5432/db'],
      ['127.0.0.1', 'postgresql://u:p@127.0.0.1:5432/db'],
      ['0.0.0.0', 'postgresql://u:p@0.0.0.0:5432/db'],
      ['::1', 'postgresql://u:p@[::1]:5432/db'],
    ])('rejects MIGRATION_DATABASE_URL pointing at %s in production', (_host, url) => {
      // This is the one that used to boot healthy and then fail on the first
      // platform sign-in, because only /platform uses this connection.
      expect(() =>
        validateEnv({
          ...VALID,
          ...PROD_HOSTS,
          NODE_ENV: 'production',
          MIGRATION_DATABASE_URL: url,
        }),
      ).toThrow(/MIGRATION_DATABASE_URL points at/);
    });

    it('rejects DATABASE_URL pointing at loopback in production', () => {
      expect(() =>
        validateEnv({
          ...VALID,
          ...PROD_HOSTS,
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
        }),
      ).toThrow(/DATABASE_URL points at localhost/);
    });

    it('names both when both are wrong', () => {
      const run = () => validateEnv({ ...VALID, NODE_ENV: 'production' });

      expect(run).toThrow(/DATABASE_URL points at/);
      expect(run).toThrow(/MIGRATION_DATABASE_URL points at/);
    });

    it('leaves a postgres URL it cannot parse to Prisma rather than guessing', () => {
      // Well-formed enough to pass the protocol check, but `new URL()` cannot
      // parse it — an unterminated IPv6 bracket. The loopback guard has no
      // hostname to judge, and Prisma reports a malformed URL better than a
      // guess here would.
      expect(() =>
        validateEnv({
          ...VALID,
          ...PROD_HOSTS,
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://u:p@[unterminated',
        }),
      ).not.toThrow();
    });
  });
  describe('malformed database URLs', () => {
    // These are checked in every environment, so NODE_ENV stays at the
    // fixture's 'development' throughout.
    it.each([
      ['surrounding quotes', '"postgresql://u:p@host:5432/db"'],
      ['a leading space', ' postgresql://u:p@host:5432/db'],
      ['a trailing newline is fine, a leading one is not', '\npostgresql://u:p@host:5432/db'],
      ['the psql command instead of the URL', 'psql postgresql://u:p@host:5432/db'],
      ['a bare hostname', 'dpg-abc123-a/pharma_erp'],
      ['mysql', 'mysql://u:p@host:3306/db'],
    ])('rejects MIGRATION_DATABASE_URL with %s', (_why, value) => {
      // MIGRATION_DATABASE_URL specifically, because Prisma reports a malformed
      // override against schema.prisma's env("DATABASE_URL") line — naming the
      // one variable that is not at fault.
      expect(() => validateEnv({ ...VALID, MIGRATION_DATABASE_URL: value })).toThrow(
        /MIGRATION_DATABASE_URL does not start with postgresql:\/\//,
      );
    });

    it('rejects a malformed DATABASE_URL too', () => {
      expect(() => validateEnv({ ...VALID, DATABASE_URL: 'not-a-url' })).toThrow(
        /DATABASE_URL does not start with postgresql:\/\//,
      );
    });

    it('names both when both are malformed', () => {
      const run = () =>
        validateEnv({ ...VALID, DATABASE_URL: 'nope', MIGRATION_DATABASE_URL: 'also-nope' });

      expect(run).toThrow(/DATABASE_URL does not start with/);
      expect(run).toThrow(/MIGRATION_DATABASE_URL does not start with/);
    });

    it('shows the offending value so an invisible character is visible', () => {
      // A stray space or quote is the usual cause and is unreadable in a log
      // line unless the value is quoted back.
      expect(() => validateEnv({ ...VALID, DATABASE_URL: ' postgresql://u:p@h/db' })).toThrow(
        /received " postgresql/,
      );
    });

    it('accepts the postgres:// spelling as well as postgresql://', () => {
      expect(() =>
        validateEnv({ ...VALID, DATABASE_URL: 'postgres://u:p@localhost:5432/db' }),
      ).not.toThrow();
    });

    it('truncates a very long value rather than dumping a credential in full', () => {
      const long = 'x'.repeat(200);

      try {
        validateEnv({ ...VALID, DATABASE_URL: long });
        throw new Error('expected validateEnv to throw');
      } catch (error) {
        expect((error as Error).message).toContain('…');
        expect((error as Error).message).not.toContain(long);
      }
    });
  });
});
