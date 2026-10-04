import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * What the app shows instead of a blank screen when rendering throws
 * (the root error boundary in `src/app/_layout.tsx`). The error itself has
 * already gone to error reporting; "Try again" renders the app afresh.
 */
export function CrashScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <ThemedView style={styles.centered}>
      <ThemedText type="subtitle">Something went wrong</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.message}>
        Ardoise ran into a problem. Your data is safe on the server.
      </ThemedText>
      <Button label="Try again" variant="secondary" onPress={onRetry} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  message: {
    textAlign: 'center',
  },
});
