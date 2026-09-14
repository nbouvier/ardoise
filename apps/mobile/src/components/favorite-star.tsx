import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

export interface FavoriteStarProps {
  favorite: boolean;
  onToggle: () => void;
  /** The group's own name, for a specific accessibility label — several stars can share one screen. */
  label: string;
  disabled?: boolean;
  size?: number;
}

/**
 * The star toggling a group's favorite state (`docs/specs/favorites.md`):
 * filled in the accent hue when favorited, an outline in `textSecondary`
 * otherwise — no separate label needed, the fill alone carries the state. A
 * sibling of whatever `Pressable` opens the row/screen it sits on, never
 * nested inside it, so tapping the star never also opens the group.
 */
export function FavoriteStar({
  favorite,
  onToggle,
  label,
  disabled = false,
  size = 22,
}: FavoriteStarProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={favorite ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      accessibilityState={{ selected: favorite, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onToggle}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}>
      <Icon
        name="star"
        size={size}
        color={favorite ? theme.accent : theme.textSecondary}
        filled={favorite}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    padding: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
