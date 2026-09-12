import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { errorFields, logger } from '@/lib/logger';

import { useAuth } from './use-auth';

export function AccountScreen() {
  const { state, signOut } = useAuth();
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
        <View style={styles.profile}>
          {/* The identity card: the one piece of content this screen has. */}
          <Card tone="brand" style={styles.card}>
            <Avatar name={user.name} picture={user.picture} size={96} seed={user.id} />
            <ThemedText type="sectionTitle">{user.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {user.email}
            </ThemedText>
          </Card>
        </View>

        <Button
          label={busy ? 'Signing out…' : 'Sign out'}
          variant="secondary"
          busy={false}
          disabled={busy}
          onPress={() => void handleSignOut()}
        />
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
    justifyContent: 'center',
  },
  card: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
});
