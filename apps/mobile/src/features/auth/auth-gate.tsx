import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { SignInScreen } from './sign-in-screen';
import { useAuth } from './use-auth';

/**
 * Renders the app only when a session is established. Shows a loading state
 * while the session is restored, a retry screen if the server was unreachable,
 * and the sign-in screen when signed out.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state, retry } = useAuth();
  const theme = useTheme();

  if (state.status === 'loading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator testID="auth-gate-loading" color={theme.primary} />
      </ThemedView>
    );
  }

  if (state.status === 'error') {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle">Can’t connect</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.message}>
          We couldn’t reach SplitCount. Check your connection and try again.
        </ThemedText>
        <Button
          label="Try again"
          variant="secondary"
          onPress={() => {
            void retry();
          }}
        />
      </ThemedView>
    );
  }

  if (state.status === 'signedOut') {
    return <SignInScreen />;
  }

  return <>{children}</>;
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
