import { NodeEnvironment, validateEnv } from './env.validation';

const VALID = {
  NODE_ENV: 'development',
  API_PORT: '4000',
  DATABASE_URL: 'postgresql://pharma_app:pw@localhost:5432/pharma_erp?schema=public',
  MIGRATION_DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/pharma_erp?schema=public',
  WEB_ORIGIN: 'http://localhost:3000',
  CLERK_SECRET_KEY: 'sk_test_abc123',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_abc123',
};

describe('validateEnv', () => {
  it('accepts a valid environment and coerces the port to a number', () => {
    const result = validateEnv({ ...VALID });

    expect(result.API_PORT).toBe(4000);
    expect(result.NODE_ENV).toBe(NodeEnvironment.Development);
  });

  it.each(['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'CLERK_SECRET_KEY'])(
    'refuses to start when %s is missing',
    (key) => {
      const raw: Record<string, unknown> = { ...VALID };
      delete raw[key];

      expect(() => validateEnv(raw)).toThrow(new RegExp(key));
    },
  );

  it('rejects a port outside the valid range', () => {
    expect(() => validateEnv({ ...VALID, API_PORT: '70000' })).toThrow(/API_PORT/);
  });

  it('rejects an unknown NODE_ENV rather than silently defaulting', () => {
    expect(() => validateEnv({ ...VALID, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  describe('Clerk keys', () => {
    it('rejects a secret key that is not a Clerk secret key', () => {
      // A publishable key pasted into the secret slot is a common copy-paste
      // slip, and it would otherwise fail later as unexplained 401s.
      expect(() => validateEnv({ ...VALID, CLERK_SECRET_KEY: 'pk_test_abc123' })).toThrow(
        /CLERK_SECRET_KEY/,
      );
    });

    it('rejects a publishable key that is not a Clerk publishable key', () => {
      expect(() =>
        validateEnv({ ...VALID, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'sk_test_abc123' }),
      ).toThrow(/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
    });

    it('rejects a mismatched test/live key pair', () => {
      // The two keys must come from one Clerk instance; otherwise the browser
      // mints tokens the API cannot verify, with no obvious clue why.
      expect(() =>
        validateEnv({
          ...VALID,
          CLERK_SECRET_KEY: 'sk_live_abc123',
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_abc123',
        }),
      ).toThrow(/Clerk key mismatch/);
    });

    it('accepts a matched live key pair in production', () => {
      const result = validateEnv({
        ...VALID,
        NODE_ENV: 'production',
        CLERK_SECRET_KEY: 'sk_live_abc123',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_abc123',
      });

      expect(result.NODE_ENV).toBe(NodeEnvironment.Production);
    });

    it('refuses to start in production with test keys', () => {
      expect(() => validateEnv({ ...VALID, NODE_ENV: 'production' })).toThrow(
        /production with Clerk test keys/,
      );
    });
  });

  describe('authorized parties', () => {
    it('is optional and left unset when absent', () => {
      expect(validateEnv({ ...VALID }).CLERK_AUTHORIZED_PARTIES).toBeUndefined();
    });

    it('is carried through when provided', () => {
      const result = validateEnv({
        ...VALID,
        CLERK_AUTHORIZED_PARTIES: 'https://erp.example.com,https://staging.example.com',
      });

      expect(result.CLERK_AUTHORIZED_PARTIES).toContain('erp.example.com');
    });
  });
});
