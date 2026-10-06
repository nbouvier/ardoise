import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The round tick a multi-select row ends with. Drawing only: the row around
 * it is what is pressed, and carries the checkbox role and state.
 */
export function Checkbox({ checked }: { checked: boolean }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.box,
        { borderColor: checked ? theme.primary : theme.border },
        checked && { backgroundColor: theme.primary },
      ]}>
      {checked ? <Icon name="check" size={14} color={theme.onPrimary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 24,
    height: 24,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
