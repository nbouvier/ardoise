import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A padded rule with "OR" in the middle, between two alternative ways of doing the same thing. */
export function OrDivider() {
  const theme = useTheme();
  const rule = [styles.rule, { backgroundColor: theme.border }];

  return (
    <View style={styles.row}>
      <View style={rule} />
      <ThemedText type="overline" themeColor="textSecondary">
        OR
      </ThemedText>
      <View style={rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginVertical: Spacing.five,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
});
