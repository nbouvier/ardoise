/**
 * Where each slice of a donut starts and ends, in degrees clockwise from the
 * top of the ring (0° = 12 o'clock).
 */
export interface SliceAngles {
  startAngle: number;
  endAngle: number;
}

/**
 * The smallest sweep a slice is drawn with, so a category worth a fraction of a
 * percent stays a visible sliver rather than a sub-pixel line
 * (`docs/specs/group-statistics.md`). The degrees this adds are taken back,
 * proportionally, from the slices that can afford them — so the ring still
 * closes and the big slices stay honest to within a couple of degrees.
 */
export const MIN_SLICE_DEGREES = 3;

/**
 * Lay `values` out around the ring, clockwise from the top, in the order given.
 *
 * Returns one entry per value, always covering the full 360° — an empty or
 * all-zero input returns nothing, since there is no ring to draw.
 */
export function layoutSlices(values: readonly number[]): SliceAngles[] {
  const total = values.reduce((sum, value) => sum + Math.max(value, 0), 0);
  if (values.length === 0 || total <= 0) {
    return [];
  }

  // Everything at the floor already, or below it: the ring can only be split
  // evenly — there is nothing left to take the missing degrees from.
  const floor = Math.min(MIN_SLICE_DEGREES, 360 / values.length);
  const exact = values.map((value) => (Math.max(value, 0) * 360) / total);
  const owed = exact.reduce((sum, sweep) => sum + Math.max(floor - sweep, 0), 0);
  const shrinkable = exact.reduce((sum, sweep) => sum + Math.max(sweep - floor, 0), 0);

  let cursor = 0;
  return exact.map((sweep) => {
    const above = Math.max(sweep - floor, 0);
    // Slices under the floor are lifted to it; the rest give up their share of
    // what that cost, in proportion to how much room they have.
    const adjusted =
      above === 0 ? floor : floor + above - (owed * above) / (shrinkable || 1);
    const startAngle = cursor;
    cursor += adjusted;
    return { startAngle, endAngle: cursor };
  });
}

function pointOnCircle(
  centre: number,
  radius: number,
  angleDegrees: number,
): { x: number; y: number } {
  // -90° so 0 sits at the top of the ring rather than at 3 o'clock.
  const radians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: centre + radius * Math.cos(radians),
    y: centre + radius * Math.sin(radians),
  };
}

/**
 * The SVG path of one donut slice: out along the outer edge, in, back along
 * the inner edge, closed. `centre` is both the x and the y of the ring's
 * centre — the chart is always square.
 *
 * A slice covering the whole ring is drawn as two half sweeps, since a single
 * arc from a point to itself is degenerate and renders as nothing.
 */
export function slicePath(
  { startAngle, endAngle }: SliceAngles,
  centre: number,
  outerRadius: number,
  innerRadius: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep >= 360) {
    const half = startAngle + 180;
    return [
      slicePath({ startAngle, endAngle: half }, centre, outerRadius, innerRadius),
      slicePath(
        { startAngle: half, endAngle: startAngle + 360 },
        centre,
        outerRadius,
        innerRadius,
      ),
    ].join(' ');
  }

  const largeArc = sweep > 180 ? 1 : 0;
  const outerStart = pointOnCircle(centre, outerRadius, startAngle);
  const outerEnd = pointOnCircle(centre, outerRadius, endAngle);
  const innerEnd = pointOnCircle(centre, innerRadius, endAngle);
  const innerStart = pointOnCircle(centre, innerRadius, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}
