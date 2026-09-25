import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/components/icon';

export interface IconButtonProps {
  icon: IconName;
  /** What the button does, said in words — the icon alone is never the label. */
  accessibilityLabel: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * A bare, tappable glyph for an action that belongs to the block it sits in
 * (a card's own share / copy / refresh), too small a thing for a `Button`.
 * The hit area is padded out past the 32pt glyph box.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  color,
  onPress,
  disabled = false,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}>
      <Icon name={icon} size={20} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.5,
  },
});
