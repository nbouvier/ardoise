import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorFields, logger } from '@/lib/logger';

import { useAuth } from './use-auth';

export function AccountScreen() {
  const { state, signOut } = useAuth();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  if (state.status !== 'signedIn') {
    return null;
  }
  const { user } = state;

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } catch (caught) {
      logger.warn('auth.sign_out.failed', errorFields(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.profile}>
          {user.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} contentFit="cover" />
          ) : (
            <ThemedView type="backgroundElement" style={[styles.avatar, styles.avatarFallback]}>
              <ThemedText type="subtitle">{user.name.charAt(0).toUpperCase()}</ThemedText>
            </ThemedView>
          )}
          <ThemedText type="subtitle">{user.name}</ThemedText>
          <ThemedText themeColor="textSecondary">{user.email}</ThemedText>
        </ThemedView>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={handleSignOut}
          style={({ pressed }) => [
            styles.signOut,
            { borderColor: theme.text },
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}>
          <ThemedText>{busy ? 'Signing out…' : 'Sign out'}</ThemedText>
        </Pressable>
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
    paddingVertical: Spacing.six,
    justifyContent: 'space-between',
  },
  profile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: Spacing.two,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    height: 52,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
