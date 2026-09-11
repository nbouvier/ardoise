import { describe, expect, it } from 'vitest';

import { orderPair } from './friendships.js';

describe('orderPair', () => {
  const alice = '11111111-1111-1111-1111-111111111111';
  const bob = '99999999-9999-9999-9999-999999999999';

  it('sorts the pair so both argument orders produce the same row', () => {
    expect(orderPair(alice, bob)).toEqual({ userAId: alice, userBId: bob });
    expect(orderPair(bob, alice)).toEqual({ userAId: alice, userBId: bob });
  });

  it('refuses a self-pair', () => {
    expect(() => orderPair(alice, alice)).toThrow(/own friend/);
  });
});
