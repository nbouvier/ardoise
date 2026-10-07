import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import type { EmailCodePurpose } from '../../db/schema.js';

/** How long a code may be entered, and how many tries it allows. */
export const CODE_TTL_MS = 15 * 60 * 1000;
export const CODE_ATTEMPTS = 5;

export interface EmailCodeHasher {
  /** A fresh 6-digit code, leading zeros included. */
  generate(): string;
  /** The stored form of `code`, bound to its purpose and address. */
  hash(purpose: EmailCodePurpose, email: string, code: string): string;
  matches(purpose: EmailCodePurpose, email: string, code: string, stored: string): boolean;
}

/**
 * Codes are hashed with a key derived from a server secret: a million
 * possible codes are no obstacle to an unkeyed hash, but without the key a
 * leaked hash is useless. Binding the purpose and the address in means a code
 * never stands in for another one.
 */
export function createEmailCodeHasher(secret: string): EmailCodeHasher {
  const key = createHmac('sha256', secret).update('ardoise/email-code').digest();

  function hash(purpose: EmailCodePurpose, email: string, code: string): string {
    return createHmac('sha256', key).update(`${purpose}\n${email}\n${code}`).digest('base64url');
  }

  return {
    generate: () => randomInt(0, 1_000_000).toString().padStart(6, '0'),
    hash,
    matches(purpose, email, code, stored) {
      const actual = Buffer.from(hash(purpose, email, code));
      const expected = Buffer.from(stored);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
  };
}
