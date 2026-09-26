import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface BackButtonProps {
  onPress: () => void;
  /** An arrow (the way back), or the downward chevron a banner uses to fold its page away. */
  icon?: 'back' | 'collapse';
  label?: string;
}

/**
 * The way out of a page that has no native header. In a banner it is the
 * chevron at the far end; the states without a banner keep the arrow.
 */
export function BackButton({ onPress, icon = 'back', label = 'Back' }: BackButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && { backgroundColor: theme.primarySoft }]}>
      <Icon name={icon} size={26} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
