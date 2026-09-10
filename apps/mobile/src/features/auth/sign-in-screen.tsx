import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorFields, logger } from '@/lib/logger';

import { GoogleSignInCancelled } from './google-module';
import { useAuth } from './use-auth';

export function SignInScreen() {
  const { signIn, googleAvailable } = useAuth();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signIn();
    } catch (caught) {
      if (!(caught instanceof GoogleSignInCancelled)) {
        logger.warn('auth.sign_in.failed', errorFields(caught));
        setError('Could not sign you in. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !googleAvailable;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.hero}>
          <Image
            source={require('@/assets/images/logo-glow.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <ThemedText type="title">SplitCount</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.tagline}>
            Share expenses with the people you split with.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={handleSignIn}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.text },
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}>
            {busy ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText style={[styles.buttonLabel, { color: theme.background }]}>
                Continue with Google
              </ThemedText>
            )}
          </Pressable>

          {!googleAvailable ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Web sign-in is coming soon — use the iOS or Android app.
            </ThemedText>
          ) : null}
          {error ? (
            <ThemedText type="small" style={styles.errorText}>
              {error}
            </ThemedText>
          ) : null}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    justifyContent: 'space-between',
    paddingVertical: Spacing.six,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  logo: {
    width: 96,
    height: 96,
  },
  tagline: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.three,
  },
  button: {
    height: 52,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  hint: {
    textAlign: 'center',
  },
  errorText: {
    textAlign: 'center',
    color: '#d94040',
  },
});
