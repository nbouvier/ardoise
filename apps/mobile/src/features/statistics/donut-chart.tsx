import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { layoutSlices, slicePath } from './donut-geometry';

export interface DonutSlice {
  /** Identifies the slice to the caller — a category key here. */
  key: string;
  value: number;
  color: string;
  /** What a screen reader announces for the slice's arc. */
  label: string;
}

export interface DonutChartProps {
  slices: readonly DonutSlice[];
  /** The ring's outer diameter, in points. */
  size: number;
  /** How thick the ring is; the hole is what's left. */
  thickness?: number;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  /** Rendered in the hole — the total, or the selected slice. */
  children?: ReactNode;
}

/**
 * A donut chart: one arc per slice, sized by its share of the total, tappable
 * when the caller cares. The hole holds whatever the caller renders into it, as
 * plain views rather than SVG text, so it can use the app's own typography.
 *
 * Colour never carries meaning alone here — the legend beside the chart repeats
 * every slice with its emoji and label (`docs/specs/group-statistics.md`).
 */
export function DonutChart({
  slices,
  size,
  thickness = 28,
  selectedKey,
  onSelect,
  children,
}: DonutChartProps) {
  const centre = size / 2;
  const outerRadius = centre;
  const innerRadius = Math.max(centre - thickness, 0);
  const angles = layoutSlices(slices.map((slice) => slice.value));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} testID="donut-chart">
        <G>
          {angles.map((slice, index) => {
            const { key, color, label } = slices[index]!;
            const dimmed = selectedKey != null && selectedKey !== key;

            return (
              <Path
                key={key}
                testID={`donut-slice-${key}`}
                accessible
                accessibilityLabel={label}
                d={slicePath(slice, centre, outerRadius, innerRadius)}
                fill={color}
                // Selecting one slice fades the others rather than moving
                // anything: the ring stays readable as a whole.
                opacity={dimmed ? 0.3 : 1}
                onPress={onSelect ? () => onSelect(key) : undefined}
              />
            );
          })}
        </G>
      </Svg>
      <View
        pointerEvents="none"
        style={[styles.hole, { left: thickness, top: thickness, right: thickness, bottom: thickness }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
  },
  hole: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
