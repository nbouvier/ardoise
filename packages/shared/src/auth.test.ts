import { describe, expect, it } from 'vitest';

import { accountNameSchema, emailAddressSchema, emailCodeSchema, passwordSchema } from './auth.js';

describe('emailAddressSchema', () => {
  it('trims and lowercases, so one address is one account', () => {
    expect(emailAddressSchema.parse('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('refuses what is not an address', () => {
    expect(emailAddressSchema.safeParse('ada').success).toBe(false);
    expect(emailAddressSchema.safeParse('').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('takes 8 to 128 characters of anything, untrimmed', () => {
    expect(passwordSchema.parse(' 1234567')).toBe(' 1234567');
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
    expect(passwordSchema.safeParse('x'.repeat(128)).success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});

describe('accountNameSchema', () => {
  it('trims, and refuses a blank name', () => {
    expect(accountNameSchema.parse('  Ada ')).toBe('Ada');
    expect(accountNameSchema.safeParse('   ').success).toBe(false);
  });
});

describe('emailCodeSchema', () => {
  it('takes exactly 6 digits', () => {
    expect(emailCodeSchema.safeParse('012345').success).toBe(true);
    expect(emailCodeSchema.safeParse('12345').success).toBe(false);
    expect(emailCodeSchema.safeParse('12345a').success).toBe(false);
  });
});
