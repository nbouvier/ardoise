import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { DropdownMenu } from '@/components/dropdown-menu';
import { Icon } from '@/components/icon';
import { MenuRow } from '@/components/icon-menu-button';
import { ScreenHeader } from '@/components/screen-header';
import { SheetModal } from '@/components/sheet-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorFields, logger } from '@/lib/logger';

import { DeleteAccountScreen } from './delete-account-screen';
import { GoogleSignInCancelled } from './google-module';
import { useAuth } from './use-auth';

export function AccountScreen() {
  const { state, signIn, signOut } = useAuth();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (state.status !== 'signedIn') {
    return null;
  }
  const { user } = state;

  async function handleSignOut() {
    try {
      await signOut();
    } catch (caught) {
      logger.warn('auth.sign_out.failed', errorFields(caught));
    }
  }

  // Signing out clears the chosen Google account, so the chooser that opens
  // straight after lists them all; dismissing it lands on the sign-in screen.
  async function handleSwitchAccount() {
    await handleSignOut();
    try {
      await signIn();
    } catch (caught) {
      if (!(caught instanceof GoogleSignInCancelled)) {
        logger.warn('auth.switch_account.failed', errorFields(caught));
      }
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Account" wash />

      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.section}>
          <ThemedText type="overline" themeColor="textSecondary">
            Profile
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${user.name}, ${user.email}`}
            onPress={() => setMenuOpen(true)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.primarySoft }]}>
            <Avatar name={user.name} picture={user.picture} size={48} seed={user.id} />
            <View style={styles.identity}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {user.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {user.email}
              </ThemedText>
            </View>
            <Icon name="collapse" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>

        {/* Apart from the Profile row's menu: a wrong tap next to "Sign out" must
          not be where an account gets deleted. */}
        <View style={styles.section}>
          <ThemedText type="overline" themeColor="textSecondary">
            Your data
          </ThemedText>
          <MenuRow
            icon="trash"
            label="Delete account"
            destructive
            onPress={() => setDeleting(true)}
          />
        </View>
      </SafeAreaView>

      <SheetModal visible={deleting} onClose={() => setDeleting(false)}>
        <DeleteAccountScreen onClose={() => setDeleting(false)} />
      </SheetModal>

      <DropdownMenu visible={menuOpen} onClose={() => setMenuOpen(false)}>
        {ACTIONS.map(({ key, icon, label, destructive }, index) => (
          <Fragment key={key}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
            <MenuRow
              icon={icon}
              label={label}
              destructive={destructive}
              onPress={() => {
                setMenuOpen(false);
                void (key === 'switch' ? handleSwitchAccount() : handleSignOut());
              }}
            />
          </Fragment>
        ))}
      </DropdownMenu>
    </ThemedView>
  );
}

const ACTIONS = [
  { key: 'switch', icon: 'refresh', label: 'Switch account', destructive: false },
  { key: 'signOut', icon: 'leave', label: 'Sign out', destructive: true },
] as const;

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
    paddingTop: Spacing.four,
    gap: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginHorizontal: -Spacing.two,
    borderRadius: Radius.medium,
  },
  identity: {
    flex: 1,
  },
  divider: {
    height: 1,
  },
});
