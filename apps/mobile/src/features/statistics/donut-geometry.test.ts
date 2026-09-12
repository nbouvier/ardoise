import { describe, expect, it } from '@jest/globals';

import { layoutSlices, MIN_SLICE_DEGREES, slicePath } from './donut-geometry';

function sweeps(values: number[]): number[] {
  return layoutSlices(values).map((slice) => slice.endAngle - slice.startAngle);
}

describe('layoutSlices', () => {
  it('lays slices out clockwise from the top, in the order given', () => {
    expect(layoutSlices([1, 1, 2])).toEqual([
      { startAngle: 0, endAngle: 90 },
      { startAngle: 90, endAngle: 180 },
      { startAngle: 180, endAngle: 360 },
    ]);
  });

  it('gives a single value the whole ring', () => {
    expect(layoutSlices([42])).toEqual([{ startAngle: 0, endAngle: 360 }]);
  });

  it('always closes the ring, whatever the values', () => {
    const cases = [[1], [1, 1], [3, 2, 1], [1000, 1, 1, 1], [7, 7, 7, 7, 7, 1, 1]];

    for (const values of cases) {
      const slices = layoutSlices(values);
      expect(slices[0]?.startAngle).toBe(0);
      expect(slices[slices.length - 1]?.endAngle).toBeCloseTo(360, 6);
      // No gaps: each slice starts where the previous one ended.
      for (let i = 1; i < slices.length; i += 1) {
        expect(slices[i]!.startAngle).toBeCloseTo(slices[i - 1]!.endAngle, 6);
      }
    }
  });

  it('keeps a sliver visible without distorting the rest', () => {
    const [big, sliver] = sweeps([100_000, 1]);

    expect(sliver).toBeCloseTo(MIN_SLICE_DEGREES, 6);
    // The big one gives up only what the sliver needed.
    expect(big).toBeCloseTo(360 - MIN_SLICE_DEGREES, 1);
  });

  it('splits the ring evenly when every slice is at the floor', () => {
    // 180 equal slices: 2° each, under the 3° floor, with nothing to take from.
    const values = Array.from({ length: 180 }, () => 1);
    const result = sweeps(values);

    expect(result.every((sweep) => Math.abs(sweep - 2) < 1e-6)).toBe(true);
  });

  it('has nothing to lay out for no values, or for values summing to zero', () => {
    expect(layoutSlices([])).toEqual([]);
    expect(layoutSlices([0, 0])).toEqual([]);
  });
});

describe('slicePath', () => {
  it('draws a quarter slice as a single outer and inner arc', () => {
    const path = slicePath({ startAngle: 0, endAngle: 90 }, 50, 50, 30);

    // Starts at the top of the outer edge, sweeps clockwise (1) without the
    // large-arc flag, comes back along the inner edge counter-clockwise (0).
    expect(path).toContain('M 50 0');
    expect(path).toContain('A 50 50 0 0 1');
    expect(path).toContain('A 30 30 0 0 0');
    expect(path.endsWith('Z')).toBe(true);
  });

  it('flags the large arc beyond a half turn', () => {
    expect(slicePath({ startAngle: 0, endAngle: 200 }, 50, 50, 30)).toContain(
      'A 50 50 0 1 1',
    );
  });

  it('draws a full ring as two halves, since one arc would be degenerate', () => {
    const path = slicePath({ startAngle: 0, endAngle: 360 }, 50, 50, 30);

    // Two closed sub-paths rather than an arc from a point back to itself.
    expect(path.match(/Z/g)).toHaveLength(2);
    expect(path.match(/M /g)).toHaveLength(2);
  });
});
