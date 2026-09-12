import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          {/* The mark sits on its own brand wash, so it reads on both themes. */}
          <View style={[styles.logoDisc, { backgroundColor: theme.primarySoft }]}>
            <BrandMark size={88} />
          </View>
          <ThemedText type="title">SplitCount</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.tagline}>
            Share expenses with the people you split with.
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Button
            label="Continue with Google"
            onPress={() => void handleSignIn()}
            busy={busy}
            disabled={!googleAvailable}
          />

          {!googleAvailable ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Web sign-in is coming soon — use the iOS or Android app.
            </ThemedText>
          ) : null}
          {error ? (
            <ThemedText type="small" themeColor="danger" style={styles.hint}>
              {error}
            </ThemedText>
          ) : null}
        </View>
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
  logoDisc: {
    width: 132,
    height: 132,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  tagline: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.three,
  },
  hint: {
    textAlign: 'center',
  },
});
