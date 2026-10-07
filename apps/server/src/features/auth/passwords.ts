import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** scrypt's cost parameters. */
export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

/**
 * OWASP's scrypt setting for 16 MiB of memory per hash (N=2^14, r=8, p=5):
 * as strong as its 128 MiB one, but a burst of sign-ins stays well within the
 * server container's memory ceiling.
 */
export const DEFAULT_SCRYPT_COST: ScryptCost = { N: 2 ** 14, r: 8, p: 5 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export interface PasswordHasher {
  /** A self-describing hash: `scrypt$N$r$p$salt$key`, base64url parts. */
  hash(password: string): Promise<string>;
  /**
   * Whether `password` matches `stored`. With no stored hash (no account, or
   * one without a password) it still spends a hash's worth of work before
   * answering `false`, so the answer's timing says nothing about the account.
   */
  verify(password: string, stored: string | null): Promise<boolean>;
}

function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  // scrypt needs 128·N·r bytes; leave headroom over Node's 32 MiB default.
  const options: ScryptOptions = { ...cost, maxmem: 256 * cost.N * cost.r };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

function parse(stored: string): { cost: ScryptCost; salt: Buffer; key: Buffer } | undefined {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !key) {
    return undefined;
  }
  return {
    cost: { N: Number(n), r: Number(r), p: Number(p) },
    salt: Buffer.from(salt, 'base64url'),
    key: Buffer.from(key, 'base64url'),
  };
}

/**
 * Hashes with the given cost; verifies with the cost each hash records, so
 * raising the cost later leaves existing passwords working.
 */
export function createPasswordHasher(cost: ScryptCost = DEFAULT_SCRYPT_COST): PasswordHasher {
  async function hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(password, salt, cost);
    const parts = [cost.N, cost.r, cost.p, salt.toString('base64url'), key.toString('base64url')];
    return ['scrypt', ...parts].join('$');
  }

  // Compared against when there is nothing to compare against.
  let decoy: Promise<string> | undefined;

  return {
    hash,

    async verify(password, stored) {
      const parsed = stored ? parse(stored) : undefined;
      if (!parsed) {
        decoy ??= hash(randomBytes(SALT_LENGTH).toString('base64url'));
        const fake = parse(await decoy)!;
        await derive(password, fake.salt, fake.cost);
        return false;
      }
      const key = await derive(password, parsed.salt, parsed.cost);
      return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
    },
  };
}
