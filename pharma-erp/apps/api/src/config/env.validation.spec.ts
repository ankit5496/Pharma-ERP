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
});
