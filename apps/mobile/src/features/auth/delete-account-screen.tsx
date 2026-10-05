import type { AccountDeletionPreview } from '@ardoise/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { Button } from '@/components/button';
import { DismissiblePage } from '@/components/dismissible-page';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { useDialog } from '@/components/use-dialog';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { centsToText } from '@/features/transactions/amount-input';
import { balanceTone } from '@/features/transactions/balance-display';
import { useTheme } from '@/hooks/use-theme';
import { fetchDeletionPreview } from '@/lib/api/account';
import { errorFields, logger } from '@/lib/logger';

import { useAuth } from './use-auth';

export interface DeleteAccountScreenProps {
  /** Folds the page away — the banner's chevron. */
  onClose: () => void;
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; preview: AccountDeletionPreview };

/**
 * What deleting the account costs, spelled out before anything is deleted,
 * then the one destructive button and a last confirmation
 * (`docs/specs/account-deletion.md`). Once the deletion goes through the app
 * is signed out, and this page goes with the rest.
 */
export function DeleteAccountScreen({ onClose }: DeleteAccountScreenProps) {
  const { authorizedFetch, deleteAccount } = useAuth();
  const theme = useTheme();
  const { dialog, confirm } = useDialog();
  const [state, setState] = useState<PreviewState>({ status: 'loading' });
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetchDeletionPreview(authorizedFetch)
      .then((preview) => {
        if (live) {
          setState({ status: 'ready', preview });
        }
      })
      .catch((error: unknown) => {
        logger.warn('account.deletion_preview.failed', errorFields(error));
        if (live) {
          setState({ status: 'error' });
        }
      });
    return () => {
      live = false;
    };
  }, [authorizedFetch, attempt]);

  function retry() {
    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }

  async function remove() {
    setDeleting(true);
    setFailed(false);
    try {
      await deleteAccount();
    } catch (error) {
      logger.warn('account.delete.failed', errorFields(error));
      setFailed(true);
      setDeleting(false);
    }
  }

  function askToDelete() {
    confirm({
      title: 'Delete your account?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => void remove(),
    });
  }

  return (
    <DismissiblePage
      onClose={onClose}
      style={{ backgroundColor: theme.background }}
      header={
        <ScreenHeader
          title="Delete account"
          wash
          action={<BackButton icon="collapse" label="Close" onPress={onClose} />}
        />
      }>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        {state.status === 'loading' ? (
          <View style={styles.centered}>
            <ActivityIndicator testID="deletion-preview-loading" color={theme.primary} />
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.centered}>
            <ThemedText themeColor="textSecondary" style={styles.centeredText}>
              We couldn’t load what deleting your account would change. Check your connection
              and try again.
            </ThemedText>
            <Button label="Try again" variant="secondary" onPress={retry} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Consequences preview={state.preview} />
            <ThemedText themeColor="textSecondary">
              It cannot be undone: signing in again later creates a new, empty account.
            </ThemedText>
            {failed ? (
              <ThemedText themeColor="danger" accessibilityRole="alert">
                We couldn’t delete your account. Check your connection and try again.
              </ThemedText>
            ) : null}
            <Button
              label="Delete my account"
              variant="danger"
              busy={deleting}
              onPress={askToDelete}
            />
          </ScrollView>
        )}
      </SafeAreaView>
      {dialog}
    </DismissiblePage>
  );
}

function Consequences({ preview }: { preview: AccountDeletionPreview }) {
  const friends =
    preview.friendCount === 0
      ? 'Your friend list.'
      : preview.friendCount === 1
        ? 'Your friend, and the group you share with them — with its sub-groups and everything in them, for them too.'
        : `Your ${preview.friendCount} friends, and the group you share with each of them — with its sub-groups and everything in them, for them too.`;

  const owed = preview.balances.filter((balance) => balance.balanceCents > 0);
  const owing = preview.balances.filter((balance) => balance.balanceCents < 0);

  return (
    <>
      <Section title="What is deleted">
        <Bullet>Your profile: name, e-mail address and picture, and your sign-in.</Bullet>
        <Bullet>{friends}</Bullet>
        <Bullet>Groups where you are the only member.</Bullet>
      </Section>

      <Section title="What stays">
        <Bullet>
          In your other groups, your transactions stay, so everyone else’s accounts still add
          up. Your part in them becomes “Others”: your name disappears from them.
        </Bullet>
        <Bullet>Groups you created pass to the member who has been in them the longest.</Bullet>
      </Section>

      <Section title="What you lose">
        <ThemedText themeColor="textSecondary">
          Your balances disappear: nobody will pay back what you’re owed, and you won’t pay
          what you owe.
        </ThemedText>
        {owed.length === 0 && owing.length === 0 ? (
          <ThemedText themeColor="textSecondary">You’re settled up in every group.</ThemedText>
        ) : null}
        {owed.length > 0 ? <BalanceDisclosure label="You are owed" balances={owed} /> : null}
        {owing.length > 0 ? <BalanceDisclosure label="You owe" balances={owing} /> : null}
      </Section>
    </>
  );
}

type Balance = AccountDeletionPreview['balances'][number];

/**
 * One side of what the user loses — all they are owed, or all they owe — as a
 * row showing the total, which unfolds into the groups it is made of.
 */
function BalanceDisclosure({ label, balances }: { label: string; balances: Balance[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const total = balances.reduce((sum, balance) => sum + balance.balanceCents, 0);
  const tone = balanceTone(total);
  const text = `${label} ${centsToText(Math.abs(total))}`;

  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={text}
        onPress={() => setOpen((previous) => !previous)}
        style={({ pressed }) => [
          styles.disclosureHeader,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
        ]}>
        <ThemedText type="smallBold" themeColor={tone} style={styles.groupName}>
          {text}
        </ThemedText>
        <View style={open ? styles.chevronOpen : undefined}>
          <Icon name="collapse" size={16} color={theme.textSecondary} />
        </View>
      </Pressable>
      {open
        ? balances.map((balance) => (
            <View key={balance.groupId} style={styles.balanceRow}>
              <ThemedText type="small" numberOfLines={1} style={styles.groupName}>
                {balance.name}
              </ThemedText>
              <ThemedText type="small" themeColor={tone}>
                {centsToText(Math.abs(balance.balanceCents))}
              </ThemedText>
            </View>
          ))
        : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="overline" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bullet}>
      <ThemedText themeColor="textSecondary">•</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.bulletText}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  content: {
    gap: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  centeredText: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  bullet: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bulletText: {
    flex: 1,
  },
  disclosure: {
    gap: Spacing.two,
  },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  groupName: {
    flexShrink: 1,
  },
});
