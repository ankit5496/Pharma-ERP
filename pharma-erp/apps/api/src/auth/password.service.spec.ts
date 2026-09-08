import { BadRequestException } from '@nestjs/common';

import { PASSWORD_MIN_LENGTH } from '@pharma-erp/types';

import { PasswordService } from './password.service';

// argon2 is deliberately slow; these do real hashing rather than mocking it,
// because the point is to verify the real primitive is wired up correctly.
jest.setTimeout(30_000);

describe('PasswordService', () => {
  const service = new PasswordService();

  describe('hashing', () => {
    it('produces an argon2id hash, not a plaintext or a weaker algorithm', async () => {
      const hash = await service.hashPassword('correct horse battery staple');

      expect(hash).toMatch(/^\$argon2id\$/);
      expect(hash).not.toContain('correct horse');
    });

    it('produces a different hash each time for the same password', async () => {
      // Different salts. Identical hashes would mean the salt is fixed or
      // absent, which makes a rainbow table viable across the whole user table.
      const [a, b] = await Promise.all([
        service.hashPassword('correct horse battery staple'),
        service.hashPassword('correct horse battery staple'),
      ]);

      expect(a).not.toBe(b);
    });
  });

  describe('verification', () => {
    it('accepts the right password and rejects a wrong one', async () => {
      const hash = await service.hashPassword('correct horse battery staple');

      expect(await service.verifyPassword(hash, 'correct horse battery staple')).toBe(true);
      expect(await service.verifyPassword(hash, 'Correct horse battery staple')).toBe(false);
      expect(await service.verifyPassword(hash, '')).toBe(false);
    });

    it('returns false for a null hash instead of throwing', async () => {
      // The sign-in path calls this for addresses that do not exist, so it must
      // behave like a wrong password rather than an error.
      expect(await service.verifyPassword(null, 'anything at all')).toBe(false);
    });

    it('returns false for a corrupt stored hash rather than allowing access', async () => {
      // Fail closed. A malformed hash is a data-integrity problem, and the one
      // outcome that must never happen is treating it as a match.
      expect(await service.verifyPassword('not-a-real-hash', 'anything at all')).toBe(false);
    });

    it('spends comparable time on a missing account as on a real one', async () => {
      // Without the dummy-hash path, "no such user" returns in microseconds
      // while a real account takes ~20ms — and that gap alone enumerates valid
      // addresses. A loose bound: this asserts the same order of magnitude, not
      // a precise duration, so it does not turn into a flaky timing test.
      const hash = await service.hashPassword('correct horse battery staple');

      const realStart = process.hrtime.bigint();
      await service.verifyPassword(hash, 'wrong password entirely');
      const realMs = Number(process.hrtime.bigint() - realStart) / 1e6;

      const missingStart = process.hrtime.bigint();
      await service.verifyPassword(null, 'wrong password entirely');
      const missingMs = Number(process.hrtime.bigint() - missingStart) / 1e6;

      expect(missingMs).toBeGreaterThan(realMs / 10);
    });
  });

  describe('policy', () => {
    it(`rejects a password shorter than ${PASSWORD_MIN_LENGTH} characters`, () => {
      expect(() => service.assertMeetsPolicy('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toThrow(
        BadRequestException,
      );
    });

    it(`accepts exactly ${PASSWORD_MIN_LENGTH} characters`, () => {
      expect(() => service.assertMeetsPolicy('a'.repeat(PASSWORD_MIN_LENGTH))).not.toThrow();
    });

    it('rejects an overlong password', () => {
      // argon2 hashes the whole input, so an unbounded field is a cheap way to
      // make the server do arbitrary work.
      expect(() => service.assertMeetsPolicy('a'.repeat(5_000))).toThrow(BadRequestException);
    });

    it('rejects whitespace-only', () => {
      expect(() => service.assertMeetsPolicy(' '.repeat(PASSWORD_MIN_LENGTH + 4))).toThrow(
        BadRequestException,
      );
    });

    it('accepts a passphrase without symbols or digits', () => {
      // No character-class rules, per NIST SP 800-63B: they push people toward
      // `Passw0rd!` and stop there.
      expect(() => service.assertMeetsPolicy('several plain english words')).not.toThrow();
    });

    it('is enforced by hashPassword, not only by the explicit check', async () => {
      await expect(service.hashPassword('short')).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateTemporaryPassword', () => {
    it('meets the policy it will be checked against', () => {
      const generated = service.generateTemporaryPassword();

      expect(generated.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
      expect(() => service.assertMeetsPolicy(generated)).not.toThrow();
    });

    it('avoids characters that are ambiguous when read aloud or retyped', () => {
      // These get transcribed by hand, and a mistyped character is
      // indistinguishable from a wrong password.
      for (let i = 0; i < 25; i += 1) {
        expect(service.generateTemporaryPassword()).not.toMatch(/[Il1O0]/);
      }
    });

    it('does not repeat', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 50; i += 1) seen.add(service.generateTemporaryPassword());

      expect(seen.size).toBe(50);
    });
  });

  describe('safeEquals', () => {
    it('matches identical strings and rejects differing ones', () => {
      expect(service.safeEquals('abcdef', 'abcdef')).toBe(true);
      expect(service.safeEquals('abcdef', 'abcdeg')).toBe(false);
      expect(service.safeEquals('abcdef', 'abcde')).toBe(false);
      expect(service.safeEquals('', '')).toBe(true);
    });
  });
});
