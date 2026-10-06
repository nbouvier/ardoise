import { describe, expect, it } from '@jest/globals';

import { sameSet, toggleInSet } from './sets';

describe('toggleInSet', () => {
  it('adds a value that is not there, and removes one that is', () => {
    expect(toggleInSet(new Set(['a']), 'b')).toEqual(new Set(['a', 'b']));
    expect(toggleInSet(new Set(['a', 'b']), 'a')).toEqual(new Set(['b']));
  });

  it('leaves the set it was given untouched', () => {
    const original = new Set(['a']);
    toggleInSet(original, 'a');
    expect(original).toEqual(new Set(['a']));
  });
});

describe('sameSet', () => {
  it('compares contents, not order or identity', () => {
    expect(sameSet(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
    expect(sameSet(new Set(['a']), new Set(['a', 'b']))).toBe(false);
    expect(sameSet(new Set(), new Set())).toBe(true);
  });
});
