import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface AsyncStateProps {
  status: 'loading' | 'ready' | 'error';
  /** The spinner's test id. */
  loadingTestID: string;
  /** Said when the read failed, above "Try again". */
  failure: string;
  onRetry: () => void;
  /** The centred box the spinner and the failure sit in. */
  style?: StyleProp<ViewStyle>;
  /** What to show once the data is there. */
  children: ReactNode;
}

/**
 * What every screen reading server data shows before it has anything: a
 * spinner, or what went wrong with a way to try again. `children` once ready.
 */
export function AsyncState({
  status,
  loadingTestID,
  failure,
  onRetry,
  style,
  children,
}: AsyncStateProps) {
  const theme = useTheme();

  if (status === 'loading') {
    return (
      <View style={[styles.centered, style]}>
        <ActivityIndicator testID={loadingTestID} color={theme.primary} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.centered, style]}>
        <ThemedText themeColor="textSecondary" style={styles.text}>
          {failure}
        </ThemedText>
        <Button label="Try again" variant="secondary" onPress={onRetry} />
      </View>
    );
  }

  return <>{children}</>;
}

/** A list with nothing in it yet: a glyph and what would fill it, centred. */
export function EmptyState({
  glyph,
  message,
  style,
}: {
  glyph: string;
  message: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.centered, style]}>
      <Card tone="brand" style={styles.emptyCard}>
        <ThemedText style={styles.glyph}>{glyph}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.text}>
          {message}
        </ThemedText>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  text: {
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  glyph: {
    fontSize: 40,
    lineHeight: 48,
  },
});
