import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconButtonVariant = 'primary' | 'ghost';

export interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  /** `primary` is the brand-filled circle; `ghost` is a soft brand wash. */
  variant?: IconButtonVariant;
  size?: number;
  style?: ViewStyle;
  testID?: string;
}

/**
 * A round, label-less action — the app's alternative to a text button when the
 * action is a single unambiguous glyph (add, close). Same two surfaces as
 * `Button`'s `primary`/`ghost`, just circular.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'primary',
  size = 52,
  style,
  testID,
}: IconButtonProps) {
  const theme = useTheme();
  const background = variant === 'primary' ? theme.primary : theme.primarySoft;
  const ink = variant === 'primary' ? theme.onPrimary : theme.onPrimarySoft;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: Radius.pill, backgroundColor: background },
        pressed && styles.pressed,
        style,
      ]}>
      <Icon name={icon} size={size * 0.4} color={ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
