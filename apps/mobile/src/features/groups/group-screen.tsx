import type { GroupDetail, GroupMember, Transaction } from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { GroupBalances, ViewerBalance } from '@/features/transactions/group-balances';
import { TransactionFormScreen } from '@/features/transactions/transaction-form-screen';
import { TransactionRow } from '@/features/transactions/transaction-row';
import { useBalances, type UseBalancesResult } from '@/features/transactions/use-balances';
import { useTransactions } from '@/features/transactions/use-transactions';
import { useTheme } from '@/hooks/use-theme';
import {
  addGroupMembers,
  deleteGroup,
  removeGroupMember,
  updateGroup,
} from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

import { FriendPicker } from './friend-picker';
import { GroupInviteScreen } from './group-invite-screen';
import { groupsChanged } from './groups-changed';
import { useGroup } from './use-group';

/**
 * `details` is the group-management sheet (members, balances, rename,
 * archive, invite, leave, delete) — everything that used to sit directly on
 * this screen before transactions became its primary content. `invite`,
 * `members` and `rename` are launched from inside it and return to it.
 */
type Sheet = 'details' | 'invite' | 'members' | 'rename' | 'transaction' | null;

export function GroupScreen({ groupId }: { groupId: string }) {
  const { status, group, refresh, set } = useGroup(groupId);
  const { authorizedFetch, state: authState } = useAuth();
  const viewerId = authState.status === 'signedIn' ? authState.user.id : null;
  const router = useRouter();
  const theme = useTheme();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const transactionsResult = useTransactions(groupId);
  // Read once here rather than inside the details sheet: the summary above the
  // transaction list and the per-member list in the sheet are the same figures.
  const balancesResult = useBalances(groupId);

  /**
   * Run a change, keep the screen in sync, and surface a failure plainly.
   * Reports whether it worked, so a caller that navigates away only does so on
   * success.
   */
  async function run(
    what: string,
    action: () => Promise<GroupDetail | null>,
  ): Promise<boolean> {
    setBusy(true);
    try {
      const updated = await action();
      groupsChanged.notify();
      if (updated) {
        set(updated);
      }
      return true;
    } catch (error: unknown) {
      logger.warn(`groups.${what}.failed`, errorFields(error));
      Alert.alert('That didn’t work', 'Check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function leaveScreen() {
    groupsChanged.notify();
    router.back();
  }

  if (status === 'loading') {
    return (
      <Centered>
        <ActivityIndicator testID="group-loading" color={theme.text} />
      </Centered>
    );
  }

  if (status === 'gone') {
    return (
      <Centered>
        <ThemedText type="subtitle" style={styles.centeredText}>
          This group is gone
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          It was deleted, or you were removed from it.
        </ThemedText>
        <Button label="Back to groups" onPress={() => router.back()} />
      </Centered>
    );
  }

  if (status === 'error' || !group) {
    return (
      <Centered>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          We couldn’t load this group. Check your connection and try again.
        </ThemedText>
        <Button label="Try again" variant="secondary" onPress={refresh} />
      </Centered>
    );
  }

  // A pair group belongs to a friendship: nobody can be added, and it cannot be
  // renamed, archived or deleted. Those actions are absent rather than
  // disabled — they can never apply. Transactions are the exception: they work
  // exactly like a standard group.
  const managed = group.kind === 'standard';
  const archived = group.archivedAt !== null;
  const isOwner = group.viewerRole === 'owner';
  const alone = group.memberCount === 1;

  function confirmArchive() {
    void run('archive', () => updateGroup(authorizedFetch, groupId, { archived: !archived }));
  }

  function confirmLeave() {
    if (!viewerId) {
      return;
    }
    // Alone, leaving deletes the group — say so rather than surprise them.
    const warning = alone
      ? `Leave “${group!.name}”? You’re the only member, so the group is deleted.`
      : `Leave “${group!.name}”?`;

    Alert.alert('Leave group', warning, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          void run('leave', async () => {
            await removeGroupMember(authorizedFetch, groupId, viewerId);
            return null;
          }).then((ok) => ok && leaveScreen());
        },
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      'Delete group',
      `Delete “${group!.name}” permanently? Everything in it is lost, for everyone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void run('delete', async () => {
              await deleteGroup(authorizedFetch, groupId);
              return null;
            }).then((ok) => ok && leaveScreen());
          },
        },
      ],
    );
  }

  function openNewTransaction() {
    setEditingTransaction(null);
    setSheet('transaction');
  }

  function openTransaction(transaction: Transaction) {
    setEditingTransaction(transaction);
    setSheet('transaction');
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedView style={styles.header}>
          <ThemedView style={styles.headerRow}>
            <ThemedText type="subtitle" style={styles.headerTitle} numberOfLines={1}>
              {group.name}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Group details"
              onPress={() => setSheet('details')}
              style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}>
              <ThemedText type="small" themeColor="textSecondary">
                Details
              </ThemedText>
            </Pressable>
          </ThemedView>
          {archived ? (
            <ThemedText type="small" themeColor="textSecondary">
              Archived — read-only until it’s reopened.
            </ThemedText>
          ) : null}
          {viewerId ? <ViewerBalance result={balancesResult} viewerId={viewerId} /> : null}
        </ThemedView>

        <TransactionList
          result={transactionsResult}
          viewerId={viewerId}
          archived={archived}
          onOpen={openTransaction}
        />

        {archived ? null : (
          <ThemedView style={styles.footer}>
            <Button label="Add a transaction" onPress={openNewTransaction} />
          </ThemedView>
        )}
      </ThemedView>

      <Modal
        visible={sheet !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSheet(null)}>
        <ThemedView style={styles.container}>
          <SafeAreaView style={styles.container}>
            {sheet === 'details' ? (
              <DetailsSheet
                group={group}
                balances={balancesResult}
                managed={managed}
                archived={archived}
                isOwner={isOwner}
                alone={alone}
                busy={busy}
                onClose={() => setSheet(null)}
                onAddFriends={() => setSheet('members')}
                onInvite={() => setSheet('invite')}
                onRename={() => setSheet('rename')}
                onArchiveToggle={confirmArchive}
                onLeave={confirmLeave}
                onDelete={confirmDelete}
              />
            ) : null}

            {sheet === 'invite' ? (
              <>
                <GroupInviteScreen groupId={groupId} groupName={group.name} />
                <ThemedView style={styles.sheetFooter}>
                  <Button label="Done" variant="secondary" onPress={() => setSheet('details')} />
                </ThemedView>
              </>
            ) : null}

            {sheet === 'members' ? (
              <AddMembersSheet
                group={group}
                busy={busy}
                onCancel={() => setSheet('details')}
                onAdd={(memberIds) => {
                  setSheet('details');
                  void run('members.add', () =>
                    addGroupMembers(authorizedFetch, groupId, memberIds),
                  );
                }}
              />
            ) : null}

            {sheet === 'rename' ? (
              <RenameSheet
                current={group.name}
                busy={busy}
                onCancel={() => setSheet('details')}
                onRename={(name) => {
                  setSheet('details');
                  void run('rename', () => updateGroup(authorizedFetch, groupId, { name }));
                }}
              />
            ) : null}

            {sheet === 'transaction' && viewerId ? (
              <TransactionFormScreen
                group={group}
                viewerId={viewerId}
                initial={editingTransaction ?? undefined}
                onSaved={(transaction) => {
                  transactionsResult.upsert(transaction);
                  // Unlike the list, balances cannot be recomputed from one
                  // transaction — every member's share of it moved.
                  balancesResult.refresh();
                  setSheet(null);
                }}
                onDeleted={() => {
                  if (editingTransaction) {
                    transactionsResult.remove(editingTransaction.id);
                  }
                  balancesResult.refresh();
                  setSheet(null);
                }}
                onCancel={() => setSheet(null)}
              />
            ) : null}
          </SafeAreaView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

function TransactionList({
  result,
  viewerId,
  archived,
  onOpen,
}: {
  result: ReturnType<typeof useTransactions>;
  viewerId: string | null;
  archived: boolean;
  onOpen: (transaction: Transaction) => void;
}) {
  const theme = useTheme();
  const { status, transactions, refresh } = result;

  if (status === 'loading') {
    return (
      <ThemedView style={styles.centeredBody}>
        <ActivityIndicator testID="transactions-loading" color={theme.text} />
      </ThemedView>
    );
  }

  if (status === 'error') {
    return (
      <ThemedView style={styles.centeredBody}>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          We couldn’t load the transactions. Check your connection and try again.
        </ThemedText>
        <Button label="Try again" variant="secondary" onPress={refresh} />
      </ThemedView>
    );
  }

  if (transactions.length === 0) {
    return (
      <ThemedView style={styles.centeredBody}>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          {archived
            ? 'This group has no transactions.'
            : 'No transactions yet. Add one to start tracking what you share.'}
        </ThemedText>
      </ThemedView>
    );
  }

  if (!viewerId) {
    return null;
  }

  return (
    <FlatList
      data={transactions}
      keyExtractor={(transaction) => transaction.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TransactionRow
          transaction={item}
          viewerId={viewerId}
          onPress={archived ? undefined : onOpen}
        />
      )}
    />
  );
}

function DetailsSheet({
  group,
  balances,
  managed,
  archived,
  isOwner,
  alone,
  busy,
  onClose,
  onAddFriends,
  onInvite,
  onRename,
  onArchiveToggle,
  onLeave,
  onDelete,
}: {
  group: GroupDetail;
  balances: UseBalancesResult;
  managed: boolean;
  archived: boolean;
  isOwner: boolean;
  alone: boolean;
  busy: boolean;
  onClose: () => void;
  onAddFriends: () => void;
  onInvite: () => void;
  onRename: () => void;
  onArchiveToggle: () => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  return (
    <ThemedView style={styles.sheet}>
      <ThemedText type="subtitle">{group.name}</ThemedText>

      <ThemedText type="smallBold">
        {group.memberCount === 1 ? '1 member' : `${group.memberCount} members`}
      </ThemedText>
      <ThemedView style={styles.members}>
        {group.members.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </ThemedView>

      <ThemedText type="smallBold">Balances</ThemedText>
      <GroupBalances result={balances} members={group.members} />

      {managed ? (
        <ThemedView style={styles.actions}>
          {archived ? null : (
            <>
              <Button label="Add friends" variant="secondary" disabled={busy} onPress={onAddFriends} />
              <Button
                label="Share an invitation link"
                variant="secondary"
                disabled={busy}
                onPress={onInvite}
              />
              <Button label="Rename" variant="secondary" disabled={busy} onPress={onRename} />
            </>
          )}

          <Button
            label={archived ? 'Reopen group' : 'Archive group'}
            variant="secondary"
            busy={busy}
            onPress={onArchiveToggle}
          />

          {/* The owner cannot strand the others; alone, leaving is deleting. */}
          {!isOwner || alone ? (
            <Button label="Leave group" variant="secondary" disabled={busy} onPress={onLeave} />
          ) : null}

          {isOwner ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onDelete}
              style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
              <ThemedText type="small" style={styles.deleteLabel}>
                Delete this group
              </ThemedText>
            </Pressable>
          ) : null}
        </ThemedView>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          This is the space you share with {group.name}. It’s just the two of you — to
          include other people, create a group.
        </ThemedText>
      )}

      <ThemedView style={styles.sheetFooter}>
        <Button label="Close" variant="secondary" onPress={onClose} />
      </ThemedView>
    </ThemedView>
  );
}

function MemberRow({ member }: { member: GroupMember }) {
  return (
    <ThemedView style={styles.memberRow}>
      <Avatar name={member.name} picture={member.picture} />
      <ThemedText style={styles.memberName}>{member.name}</ThemedText>
      {member.role === 'owner' ? (
        <ThemedText type="small" themeColor="textSecondary">
          Owner
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

function AddMembersSheet({
  group,
  busy,
  onAdd,
  onCancel,
}: {
  group: GroupDetail;
  busy: boolean;
  onAdd: (memberIds: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const members = new Set(group.members.map((member) => member.id));

  return (
    <ThemedView style={styles.sheet}>
      <ThemedText type="subtitle">Add friends</ThemedText>
      <FriendPicker
        selected={selected}
        onToggle={(id) =>
          setSelected((current) => {
            const next = new Set(current);
            if (!next.delete(id)) {
              next.add(id);
            }
            return next;
          })
        }
        excludeIds={members}
        emptyLabel="All of your friends are already in this group. Share a link to invite anyone else."
      />
      <ThemedView style={styles.actions}>
        <Button
          label="Add to group"
          busy={busy}
          disabled={selected.size === 0}
          onPress={() => onAdd([...selected])}
        />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </ThemedView>
    </ThemedView>
  );
}

function RenameSheet({
  current,
  busy,
  onRename,
  onCancel,
}: {
  current: string;
  busy: boolean;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState(current);

  return (
    <ThemedView style={styles.sheet}>
      <ThemedText type="subtitle">Rename group</ThemedText>
      <TextInput
        accessibilityLabel="Group name"
        autoFocus
        value={name}
        onChangeText={setName}
        maxLength={60}
        style={[
          styles.nameInput,
          { color: theme.text, backgroundColor: theme.backgroundElement },
        ]}
      />
      <ThemedView style={styles.actions}>
        <Button
          label="Rename"
          busy={busy}
          disabled={name.trim().length === 0 || name.trim() === current}
          onPress={() => onRename(name.trim())}
        />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </ThemedView>
    </ThemedView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.centered}>{children}</ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerTitle: {
    flex: 1,
  },
  detailsButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  list: {
    paddingVertical: Spacing.two,
  },
  centeredBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  footer: {
    paddingBottom: Spacing.four,
  },
  members: {
    gap: Spacing.two,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  memberName: {
    flex: 1,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centeredText: {
    textAlign: 'center',
  },
  delete: {
    alignSelf: 'center',
    paddingVertical: Spacing.three,
  },
  deleteLabel: {
    color: '#d64545',
  },
  pressed: {
    opacity: 0.6,
  },
  sheet: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sheetFooter: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  nameInput: {
    height: 52,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
