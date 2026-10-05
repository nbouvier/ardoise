import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

export interface OthersAvatarProps {
  /** Diameter in pixels — the same as the `Avatar` it stands in for. */
  size?: number;
}

/**
 * What Others shows where a member would show an avatar: a neutral disc with
 * the people icon. Others is not a person (`docs/specs/transactions.md`), so
 * it has no picture, no initial and no medallion colour of its own.
 */
export function OthersAvatar({ size = 40 }: OthersAvatarProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.disc,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.backgroundSelected,
        },
      ]}>
      <Icon name="groups" size={size * 0.56} color={theme.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
