import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The accent "Me" tag marking the viewer's own row in a member list — the
 * same pill shape as the brand-violet "Owner" tag in the Manage tab, drawn in
 * the accent hue instead since it is not a role. One component so every
 * member list (Manage, the statistics participant picker, the transaction
 * form's payer and split rows) marks "me" identically.
 */
export function MeTag() {
  const theme = useTheme();

  return (
    <View style={[styles.tag, { backgroundColor: theme.accentSoft }]}>
      <ThemedText type="overline" themeColor="onAccentSoft">
        Me
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
});
