import { describe, expect, it } from 'vitest';

import { createPasswordHasher } from './passwords.js';

// Cheap enough for a test; the format and the comparison are what is under test.
const hasher = createPasswordHasher({ N: 2 ** 10, r: 8, p: 1 });

describe('createPasswordHasher', () => {
  it('verifies the password it hashed, and no other', async () => {
    const stored = await hasher.hash('correct horse battery');

    await expect(hasher.verify('correct horse battery', stored)).resolves.toBe(true);
    await expect(hasher.verify('correct horse batterY', stored)).resolves.toBe(false);
  });

  it('salts every hash and never stores the password', async () => {
    const first = await hasher.hash('correct horse battery');
    const second = await hasher.hash('correct horse battery');

    expect(first).not.toBe(second);
    expect(first).not.toContain('correct');
    expect(first).toMatch(/^scrypt\$1024\$8\$1\$[\w-]+\$[\w-]+$/);
  });

  it('verifies with the cost a hash records, so a later cost change keeps passwords working', async () => {
    const stored = await hasher.hash('correct horse battery');
    const stronger = createPasswordHasher({ N: 2 ** 11, r: 8, p: 1 });

    await expect(stronger.verify('correct horse battery', stored)).resolves.toBe(true);
  });

  it('treats composed and decomposed accents as the same password', async () => {
    const stored = await hasher.hash('café crème');

    await expect(hasher.verify('café crème', stored)).resolves.toBe(true);
  });

  it('answers false without a stored hash, or with one it cannot read', async () => {
    await expect(hasher.verify('anything at all', null)).resolves.toBe(false);
    await expect(hasher.verify('anything at all', 'bcrypt$garbage')).resolves.toBe(false);
  });
});
