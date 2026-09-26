import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface TextActionProps {
  /** The action's own wording, "+ Verb" style — e.g. "+ Join or Create". */
  label: string;
  onPress: () => void;
  /** Names what is added when the visible word is not enough ("Add a transaction"). */
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A quiet text action in the brand colour: a page's "+ Verb", a list's own
 * "+ Add", a "Show archived" toggle. While pressed, a soft brand wash appears
 * behind the words — the padding it needs is taken back with a negative
 * margin, so the words sit exactly where plain text would.
 */
export function TextAction({
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
  style,
}: TextActionProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        pressed && { backgroundColor: theme.primarySoft },
        disabled && styles.disabled,
        style,
      ]}>
      <ThemedText type="smallBold" themeColor="primary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    marginHorizontal: -Spacing.two,
    marginVertical: -Spacing.one,
    borderRadius: Radius.pill,
  },
  disabled: {
    opacity: 0.4,
  },
});
