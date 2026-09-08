import { randomBytes, timingSafeEqual } from 'node:crypto';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@pharma-erp/types';

/**
 * argon2id parameters. These are the OWASP Password Storage Cheat Sheet
 * minimums (m=19 MiB, t=2, p=1) and also @node-rs/argon2's defaults, stated
 * explicitly so a future default change cannot silently weaken every hash.
 *
 * argon2id rather than bcrypt: it is memory-hard, so a GPU or ASIC attacker
 * gains far less from parallelism. The stored hash records its own parameters,
 * so raising these later re-hashes on next sign-in without invalidating
 * existing passwords.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * A pre-computed hash of a value nobody can supply, used to spend the same CPU
 * time verifying a password for an account that does not exist as for one that
 * does. Without it, "no such user" returns in microseconds while a real account
 * takes ~20ms, and that difference alone enumerates valid addresses.
 */
const DUMMY_PASSWORD = randomBytes(32).toString('hex');

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  /** Resolved once at startup so the timing-equalisation path costs no extra work. */
  private readonly dummyHashPromise: Promise<string> = hash(DUMMY_PASSWORD, ARGON2_OPTIONS);

  async hashPassword(plaintext: string): Promise<string> {
    this.assertMeetsPolicy(plaintext);
    return hash(plaintext, ARGON2_OPTIONS);
  }

  /**
   * Verifies a password against a stored hash.
   *
   * Pass `null` for an account that does not exist or has no password set: it
   * still performs a full argon2 verification against a throwaway hash so the
   * response time does not reveal which case it was.
   */
  async verifyPassword(storedHash: string | null, plaintext: string): Promise<boolean> {
    if (!storedHash) {
      await verify(await this.dummyHashPromise, plaintext, ARGON2_OPTIONS).catch(() => false);
      return false;
    }

    try {
      return await verify(storedHash, plaintext, ARGON2_OPTIONS);
    } catch (error) {
      // A malformed hash in the column is a data-integrity problem, not a wrong
      // password. Log it and deny — never fall through to "allow".
      this.logger.error(
        `Password verification failed structurally; the stored hash may be corrupt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Enforces the password policy.
   *
   * Length only, no character-class requirements. NIST SP 800-63B advises
   * against composition rules because they push people toward predictable
   * shapes like `Passw0rd!` and stop there, while adding little entropy.
   */
  assertMeetsPolicy(plaintext: string): void {
    const problems: string[] = [];

    if (plaintext.length < PASSWORD_MIN_LENGTH) {
      problems.push(`must be at least ${PASSWORD_MIN_LENGTH} characters`);
    }

    // Bounded because argon2 hashes the whole input: an unbounded field is a
    // cheap way to make the server do arbitrary work.
    if (plaintext.length > PASSWORD_MAX_LENGTH) {
      problems.push(`must be at most ${PASSWORD_MAX_LENGTH} characters`);
    }

    if (plaintext.trim().length === 0) {
      problems.push('cannot be only whitespace');
    }

    if (problems.length > 0) {
      throw new BadRequestException(`Password ${problems.join(', ')}.`);
    }
  }

  /**
   * Compares two secrets without leaking their relationship through timing.
   * Used for confirmation fields, not for passwords against hashes.
   */
  safeEquals(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');

    // timingSafeEqual throws on length mismatch, which would itself leak the
    // length — compare a fixed-size digest of each instead by padding.
    if (bufferA.length !== bufferB.length) return false;

    return timingSafeEqual(bufferA, bufferB);
  }

  /**
   * Generates a temporary password an Admin can read out. Uses an unambiguous
   * alphabet — no I/l/1/O/0 — because these get transcribed by hand or read
   * aloud, and a mistyped character looks identical to a wrong password.
   */
  generateTemporaryPassword(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const length = 16;
    const bytes = randomBytes(length * 2);

    let result = '';
    for (let i = 0; result.length < length; i += 1) {
      // Rejection sampling keeps the distribution uniform; the modulo shortcut
      // would bias toward the start of the alphabet.
      const byte = bytes[i % bytes.length] ?? 0;
      if (byte < 256 - (256 % alphabet.length)) {
        result += alphabet[byte % alphabet.length];
      }
    }

    return result;
  }
}
