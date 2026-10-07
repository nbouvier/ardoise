import { describe, expect, it } from 'vitest';

import { createEmailCodeHasher } from './codes.js';

const codes = createEmailCodeHasher('test-secret-at-least-32-characters-long');

describe('createEmailCodeHasher', () => {
  it('generates 6-digit codes', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(codes.generate()).toMatch(/^\d{6}$/);
    }
  });

  it('matches a code only for the purpose and the address it was hashed for', () => {
    const stored = codes.hash('signup', 'ada@example.com', '012345');

    expect(codes.matches('signup', 'ada@example.com', '012345', stored)).toBe(true);
    expect(codes.matches('signup', 'ada@example.com', '012346', stored)).toBe(false);
    expect(codes.matches('password_reset', 'ada@example.com', '012345', stored)).toBe(false);
    expect(codes.matches('signup', 'bob@example.com', '012345', stored)).toBe(false);
  });

  it('depends on the server secret', () => {
    const other = createEmailCodeHasher('another-secret-at-least-32-characters');

    expect(other.hash('signup', 'ada@example.com', '012345')).not.toBe(
      codes.hash('signup', 'ada@example.com', '012345'),
    );
  });
});
