import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The padded rule between the Groups / Friends lists' favorites and the rest. */
export function ListDivider() {
  const theme = useTheme();

  return <View testID="list-divider" style={[styles.divider, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.three,
  },
});
