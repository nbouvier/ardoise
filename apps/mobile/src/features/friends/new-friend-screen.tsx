import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { DismissiblePage } from '@/components/dismissible-page';
import { OrDivider } from '@/components/or-divider';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { InvitationCodeEntry } from '@/features/invites/invitation-code-entry';
import { useTheme } from '@/hooks/use-theme';

import { FRIEND_INVITE_BLURB, InviteScreen } from './invite-screen';

export interface NewFriendScreenProps {
  /** Folds the page away — the banner’s chevron; also after a code is handed off. */
  onClose: () => void;
}

/**
 * Both ways to make a friend, on one page: send your own link, or enter the
 * code someone sent you (`docs/specs/friends-and-invitations.md`).
 */
export function NewFriendScreen({ onClose }: NewFriendScreenProps) {
  const theme = useTheme();

  return (
    <DismissiblePage
      onClose={onClose}
      style={{ backgroundColor: theme.background }}
      header={
        <ScreenHeader
          title="New friend"
          wash
          action={<BackButton icon="collapse" label="Close" onPress={onClose} />}
        />
      }>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.page}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.invite}>
              <ThemedText type="overline" themeColor="textSecondary">
                Invite a friend
              </ThemedText>
              <ThemedText themeColor="textSecondary">{FRIEND_INVITE_BLURB}</ThemedText>
              <InviteScreen embedded />
            </View>

            <OrDivider />

            <InvitationCodeEntry title="Enter a code" onSubmitted={onClose} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </DismissiblePage>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  page: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  invite: {
    gap: Spacing.three,
  },
});
