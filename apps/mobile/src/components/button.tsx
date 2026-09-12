import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Shows a spinner and blocks presses. */
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/**
 * The app's action button. `primary` is the brand-filled call to action — one
 * per screen; `secondary` is the same shape outlined in the brand hue;
 * `ghost` is a soft brand wash for an action that must not compete; `danger`
 * is the outlined destructive one.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  style,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const blocked = busy || disabled;

  const surfaces: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.primary },
    secondary: { borderWidth: 1.5, borderColor: theme.primary },
    ghost: { backgroundColor: theme.primarySoft },
    danger: { borderWidth: 1.5, borderColor: theme.danger },
  };

  const inks: Record<ButtonVariant, string> = {
    primary: theme.onPrimary,
    secondary: theme.primary,
    ghost: theme.onPrimarySoft,
    danger: theme.danger,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        surfaces[variant],
        pressed && styles.pressed,
        blocked && styles.blocked,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={inks[variant]} />
      ) : (
        <ThemedText style={[styles.label, { color: inks[variant] }]}>{label}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  blocked: {
    opacity: 0.4,
  },
});
