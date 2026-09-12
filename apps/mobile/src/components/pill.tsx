import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface PillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** `radio` for a one-of-many toggle, `checkbox` for an independent one. */
  role?: 'radio' | 'checkbox' | 'button';
  accessibilityLabel?: string;
  /** Overrides the brand hue — a category carries its own colour. */
  color?: string;
  style?: ViewStyle;
  testID?: string;
}

/**
 * The app's selectable token: a mode toggle, a category, a member filter.
 * Filled in the brand hue when selected, outlined when not — one shape, so a
 * row of pills always means "pick from these", wherever it appears.
 */
export function Pill({
  label,
  selected,
  onPress,
  role = 'button',
  accessibilityLabel,
  color,
  style,
  testID,
}: PillProps) {
  const theme = useTheme();
  const hue = color ?? theme.primary;

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'checkbox' ? { checked: selected } : { selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.pill,
        selected
          ? { backgroundColor: hue, borderColor: hue }
          : { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.pressed,
        style,
      ]}>
      <ThemedText
        type="smallBold"
        style={{ color: selected ? theme.onPrimary : theme.textSecondary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
