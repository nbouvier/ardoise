import { describe, expect, it } from '@jest/globals';

import { preserveOrder } from './stable-order';

interface Item {
  id: string;
  value: string;
}

const item = (id: string, value = id): Item => ({ id, value });

describe('preserveOrder', () => {
  it('keeps every known id in its previous position', () => {
    const result = preserveOrder(['b', 'a', 'c'], [item('a'), item('b'), item('c')], (i) => i.id);

    expect(result.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('applies fresh field values while keeping the old position', () => {
    const result = preserveOrder(
      ['b', 'a'],
      [item('a', 'updated'), item('b', 'unchanged')],
      (i) => i.id,
    );

    expect(result).toEqual([item('b', 'unchanged'), item('a', 'updated')]);
  });

  it('appends an id absent from the previous order, at the end', () => {
    const result = preserveOrder(
      ['b', 'a'],
      [item('a'), item('c'), item('b')],
      (i) => i.id,
    );

    expect(result.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('drops an id no longer present in the fresh data', () => {
    const result = preserveOrder(['b', 'a', 'c'], [item('a'), item('c')], (i) => i.id);

    expect(result.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('with no previous order, keeps the fresh data as-is', () => {
    const result = preserveOrder([], [item('a'), item('b')], (i) => i.id);

    expect(result.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
