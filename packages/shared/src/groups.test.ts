import { describe, expect, it } from 'vitest';

import { addGroupMembersRequestSchema, createGroupRequestSchema } from './groups.js';

const FRIEND = '11111111-1111-4111-8111-111111111111';

describe('placeholder names in a request', () => {
  it('trims names and accepts distinct ones', () => {
    const parsed = createGroupRequestSchema.parse({
      name: 'Trip',
      placeholderNames: ['  Alex ', 'Sam'],
    });

    expect(parsed.placeholderNames).toEqual(['Alex', 'Sam']);
  });

  it('refuses the same name twice, whatever the case', () => {
    const parsed = createGroupRequestSchema.safeParse({
      name: 'Trip',
      placeholderNames: ['Alex', 'alex '],
    });

    expect(parsed.success).toBe(false);
  });

  it('refuses an empty name', () => {
    expect(
      createGroupRequestSchema.safeParse({ name: 'Trip', placeholderNames: ['  '] }).success,
    ).toBe(false);
  });
});

describe('addGroupMembersRequestSchema', () => {
  it('takes friends, new placeholders, or both', () => {
    expect(addGroupMembersRequestSchema.safeParse({ memberIds: [FRIEND] }).success).toBe(true);
    expect(addGroupMembersRequestSchema.safeParse({ placeholderNames: ['Alex'] }).success).toBe(
      true,
    );
    expect(
      addGroupMembersRequestSchema.safeParse({ memberIds: [FRIEND], placeholderNames: ['Alex'] })
        .success,
    ).toBe(true);
  });

  it('refuses a request that adds nobody', () => {
    expect(addGroupMembersRequestSchema.safeParse({}).success).toBe(false);
    expect(
      addGroupMembersRequestSchema.safeParse({ memberIds: [], placeholderNames: [] }).success,
    ).toBe(false);
  });
});
