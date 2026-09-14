import type {
  GroupDetail,
  GroupMember,
  SubgroupSummary,
  Transaction,
} from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Breadcrumb } from '@/components/breadcrumb';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { FavoriteStar } from '@/components/favorite-star';
import { HeroWash } from '@/components/hero-wash';
import { MedallionBadge } from '@/components/medallion-badge';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { friendsChanged } from '@/features/friends/friends-changed';
import {
  ReimbursementsScreen,
  type Suggestion,
} from '@/features/reimbursements/reimbursements-screen';
import { StatisticsScreen } from '@/features/statistics/statistics-screen';
import { balanceTone, groupBalanceLabel } from '@/features/transactions/balance-display';
import { GroupBalances, ViewerBalance } from '@/features/transactions/group-balances';
import {
  TransactionFormScreen,
  type TransactionPrefill,
} from '@/features/transactions/transaction-form-screen';
import { TransactionRow } from '@/features/transactions/transaction-row';
import { transactionsChanged } from '@/features/transactions/transactions-changed';
import { useBalances, type UseBalancesResult } from '@/features/transactions/use-balances';
import { useTransactions } from '@/features/transactions/use-transactions';
import { useTheme } from '@/hooks/use-theme';
import {
  addGroupMembers,
  deleteGroup,
  joinGroup,
  removeGroupMember,
  setGroupFavorite,
  updateGroup,
} from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

import { CreateGroupScreen } from './create-group-screen';
import { FriendPicker } from './friend-picker';
import { GroupInviteScreen } from './group-invite-screen';
import { groupsChanged } from './groups-changed';
import { useGroup } from './use-group';

/**
 * `details` is the group-management sheet (members, balances, rename,
 * archive, invite, leave, delete) — everything that used to sit directly on
 * this screen before transactions became its primary content. `invite`,
 * `members` and `rename` are launched from inside it and return to it.
 * `statistics` is its read-only counterpart, opened from the same header, as
 * is `reimbursements` — which is read-only too until a suggested payment is
 * tapped, at which point it hands over to `transaction` pre-filled and gets
 * it back, one payment shorter. `createSubgroup` is launched from the
 * sub-groups section.
 */
type Sheet =
  | 'details'
  | 'invite'
  | 'members'
  | 'rename'
  | 'transaction'
  | 'statistics'
  | 'reimbursements'
  | 'createSubgroup'
  | null;

export function GroupScreen({ groupId }: { groupId: string }) {
  const { status, group, refresh, set } = useGroup(groupId);
  const { authorizedFetch, state: authState } = useAuth();
  const viewerId = authState.status === 'signedIn' ? authState.user.id : null;
  const router = useRouter();
  const theme = useTheme();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  // Set only when the transaction sheet was opened from the reimbursement
  // plan — it is both the form's starting values and how the sheet knows to
  // hand control back to the plan afterwards.
  const [prefill, setPrefill] = useState<TransactionPrefill | null>(null);
  const [busy, setBusy] = useState(false);
  // A sub-group's own favorite star toggles a different group than the one
  // this screen is showing, so it cannot ride the screen-wide `busy` flag —
  // just the one row mid-request.
  const [favoriteBusySubgroupId, setFavoriteBusySubgroupId] = useState<string | null>(null);
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

  /**
   * A transaction changed here, which the home screen shows from somewhere
   * else entirely: its latest list (`transactionsChanged`) and the group's
   * own balance on its favorited row (`groupsChanged`).
   */
  function announceTransactionChange() {
    transactionsChanged.notify();
    groupsChanged.notify();
  }

  if (status === 'loading') {
    return (
      <Centered>
        <ActivityIndicator testID="group-loading" color={theme.primary} />
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
  // disabled — they can never apply. Transactions and sub-groups are the
  // exception: they both work exactly like a standard group, except every
  // sub-group nested under a pair group is itself `pairRooted` (below).
  const managed = group.kind === 'standard';
  // The group's *own* archived flag — drives the archive toggle's own label
  // and action. `readOnly` is the effective one (itself or any ancestor
  // archived, docs/specs/groups.md) and gates everything that is actually
  // blocked server-side: transactions, membership changes, invitations,
  // creating a sub-group. The two are equal for a root group, since it has no
  // ancestors.
  const ownArchived = group.archivedAt !== null;
  const readOnly = group.readOnly;
  // This group — or a pair group somewhere above it — can only ever contain
  // the two people of a friendship, however deep its own sub-groups go
  // (`docs/specs/groups.md`). "Add friends" and "share an invitation link"
  // have no one left to add and are hidden; the other person still reaches
  // it through the ordinary unjoined-sub-group toggle, since they already
  // belong to every ancestor.
  const pairRooted = group.pairRooted;
  const isOwner = group.viewerRole === 'owner';
  const alone = group.memberCount === 1;
  const hasSubgroups = group.subgroupCount > 0;

  function openGroup(id: string) {
    router.push({ pathname: '/groups/[id]', params: { id } });
  }

  function confirmArchive() {
    void run('archive', () => updateGroup(authorizedFetch, groupId, { archived: !ownArchived }));
  }

  function toggleFavorite() {
    void run('favorite', () => setGroupFavorite(authorizedFetch, groupId, !group!.favorite));
  }

  /**
   * A sub-group shown in this group's own sub-groups section: the API call
   * targets the sub-group, not this screen's group, so its response cannot
   * feed `set()` directly — a `groupsChanged` notification is what brings
   * this screen's own `subgroups` list (order included) back in sync.
   */
  function toggleSubgroupFavorite(subgroup: SubgroupSummary) {
    setFavoriteBusySubgroupId(subgroup.id);
    setGroupFavorite(authorizedFetch, subgroup.id, !subgroup.favorite)
      .then(() => groupsChanged.notify())
      .catch((error: unknown) => {
        logger.warn('groups.favorite.failed', errorFields(error));
        Alert.alert('That didn’t work', 'Check your connection and try again.');
      })
      .finally(() => setFavoriteBusySubgroupId(null));
  }

  function confirmLeave() {
    if (!viewerId) {
      return;
    }
    // Alone, leaving deletes the group — say so rather than surprise them.
    // Any sub-groups come with the same loss, since leaving cascades down.
    const scope = hasSubgroups ? ' and every sub-group nested inside it' : '';
    const warning = alone
      ? `Leave “${group!.name}”? You’re the only member, so the group${scope} is deleted.`
      : `Leave “${group!.name}”?${hasSubgroups ? ' This also removes you from its sub-groups.' : ''}`;

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
    const scope = hasSubgroups ? ', and every sub-group nested inside it,' : '';
    Alert.alert(
      'Delete group',
      `Delete “${group!.name}” permanently? Everything in it${scope} is lost, for everyone.`,
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

  function confirmJoin(subgroup: SubgroupSummary) {
    Alert.alert('Join this group?', `Join “${subgroup.name}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Join',
        onPress: () => {
          setBusy(true);
          joinGroup(authorizedFetch, subgroup.id)
            .then(() => {
              groupsChanged.notify();
              openGroup(subgroup.id);
            })
            .catch((error: unknown) => {
              logger.warn('groups.join.failed', errorFields(error));
              Alert.alert('That didn’t work', 'Check your connection and try again.');
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  function openNewTransaction() {
    setEditingTransaction(null);
    setPrefill(null);
    setSheet('transaction');
  }

  function openTransaction(transaction: Transaction) {
    setEditingTransaction(transaction);
    setPrefill(null);
    setSheet('transaction');
  }

  /**
   * Record a suggested reimbursement: the transfer form, pre-filled, with
   * everything still editable — a partial payment is a changed amount
   * (`docs/specs/reimbursements.md`). Saving or cancelling returns to the
   * plan, which is then re-read.
   */
  function recordReimbursement(suggestion: Suggestion) {
    setEditingTransaction(null);
    setPrefill({
      kind: 'transfer',
      title: 'Reimbursement',
      amountCents: suggestion.amountCents,
      payerId: suggestion.from.id,
      toUserId: suggestion.to.id,
    });
    setSheet('transaction');
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.header, styles.headerWash]}>
          <HeroWash />
          <Breadcrumb ancestors={group.ancestors} onOpen={openGroup} />
          <View style={styles.headerRow}>
            <ThemedText type="subtitle" style={styles.headerTitle} numberOfLines={1}>
              {group.name}
            </ThemedText>
            {/* A pair group can be favorited too, even though it is never
                listed anywhere that reorders — its own page is the only
                place the star (and its state) is ever seen
                (`docs/specs/favorites.md`). */}
            <FavoriteStar
              favorite={group.favorite}
              label={group.name}
              disabled={busy}
              onToggle={toggleFavorite}
            />
          </View>
          <View style={styles.headerActions}>
            <HeaderChip
              label="Settle"
              accessibilityLabel="Reimbursements"
              onPress={() => setSheet('reimbursements')}
            />
            <HeaderChip
              label="Stats"
              accessibilityLabel="Group statistics"
              onPress={() => setSheet('statistics')}
            />
            <HeaderChip
              label="Details"
              accessibilityLabel="Group details"
              onPress={() => setSheet('details')}
            />
          </View>
          {readOnly ? (
            <ThemedText type="small" themeColor="textSecondary">
              Archived — read-only until it’s reopened.
            </ThemedText>
          ) : null}
          {/* The one figure this screen exists to answer, given its own card. */}
          <Card tone="brand" style={styles.balanceCard}>
            <ThemedText type="overline" themeColor="onPrimarySoft">
              Your balance here
            </ThemedText>
            <ViewerBalance amountCents={group.viewerBalanceCents} />
          </Card>
        </View>

        {/* Standard and pair groups can both have sub-groups — the pair
            group's own DetailsSheet message covers the "no one new here"
            part; this section is the same for both kinds. */}
        <SubgroupsSection
          subgroups={group.subgroups}
          readOnly={readOnly}
          busy={busy}
          favoriteBusyId={favoriteBusySubgroupId}
          onOpen={openGroup}
          onJoin={confirmJoin}
          onCreate={() => setSheet('createSubgroup')}
          onToggleFavorite={toggleSubgroupFavorite}
        />

        <TransactionList
          result={transactionsResult}
          viewerId={viewerId}
          archived={readOnly}
          onOpen={openTransaction}
        />

        {readOnly ? null : (
          <View style={styles.footer}>
            <Button label="Add a transaction" onPress={openNewTransaction} />
          </View>
        )}
      </View>

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
                readOnly={readOnly}
                pairRooted={pairRooted}
                ownArchived={ownArchived}
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

            {sheet === 'createSubgroup' ? (
              <CreateGroupScreen
                parentId={groupId}
                pairRooted={pairRooted}
                onCreated={(created) => {
                  groupsChanged.notify();
                  setSheet(null);
                  openGroup(created.id);
                }}
                onCancel={() => setSheet(null)}
              />
            ) : null}

            {sheet === 'statistics' ? (
              <StatisticsScreen
                groupId={groupId}
                hasSubgroups={hasSubgroups}
                members={group.members}
                viewerId={viewerId}
                onClose={() => setSheet(null)}
              />
            ) : null}

            {sheet === 'reimbursements' ? (
              <ReimbursementsScreen
                balances={balancesResult}
                members={group.members}
                viewerId={viewerId}
                readOnly={readOnly}
                onRecord={recordReimbursement}
                onClose={() => setSheet(null)}
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
                prefill={prefill ?? undefined}
                onSaved={(transaction) => {
                  transactionsResult.upsert(transaction);
                  // Unlike the list, balances cannot be recomputed from one
                  // transaction — every member's share of it moved.
                  balancesResult.refresh();
                  // A friend's per-friend total on the Friends tab may depend
                  // on this transaction too; it has no other way to know.
                  friendsChanged.notify();
                  // And so do the home's two sections: the group's own
                  // balance on its favorited row, and the transaction itself
                  // in the latest list (`docs/specs/home.md`).
                  announceTransactionChange();
                  // Back to the plan it came from, remounted and re-read, so
                  // the payment just recorded is gone from it.
                  setSheet(prefill ? 'reimbursements' : null);
                }}
                onDeleted={() => {
                  if (editingTransaction) {
                    transactionsResult.remove(editingTransaction.id);
                  }
                  balancesResult.refresh();
                  friendsChanged.notify();
                  announceTransactionChange();
                  setSheet(null);
                }}
                onCancel={() => setSheet(prefill ? 'reimbursements' : null)}
              />
            ) : null}
          </SafeAreaView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

/**
 * A read-only view of this group opened from its header: a soft brand chip,
 * quieter than a button but plainly tappable.
 */
function HeaderChip({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerChip,
        { backgroundColor: theme.primarySoft },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" themeColor="onPrimarySoft">
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * A group's direct sub-groups, above the transaction list. Ones the viewer
 * has already joined are always shown; ones they have not are hidden by
 * default behind a toggle, mirroring the group list's archived-groups
 * pattern (`docs/specs/groups.md`).
 */
function SubgroupsSection({
  subgroups,
  readOnly,
  busy,
  favoriteBusyId,
  onOpen,
  onJoin,
  onCreate,
  onToggleFavorite,
}: {
  subgroups: readonly SubgroupSummary[];
  readOnly: boolean;
  busy: boolean;
  /** The one sub-group whose favorite star is mid-request, if any. */
  favoriteBusyId: string | null;
  onOpen: (groupId: string) => void;
  onJoin: (subgroup: SubgroupSummary) => void;
  onCreate: () => void;
  onToggleFavorite: (subgroup: SubgroupSummary) => void;
}) {
  const [showUnjoined, setShowUnjoined] = useState(false);
  const joined = subgroups.filter((subgroup) => subgroup.viewerIsMember);
  const unjoined = subgroups.filter((subgroup) => !subgroup.viewerIsMember);

  if (subgroups.length === 0 && readOnly) {
    return null;
  }

  return (
    <View style={styles.subgroups}>
      <View style={styles.subgroupsHeader}>
        <ThemedText type="overline" themeColor="textSecondary">
          Sub-groups
        </ThemedText>
        {readOnly ? null : (
          <Pressable accessibilityRole="button" onPress={onCreate} disabled={busy}>
            <ThemedText type="smallBold" themeColor="primary">
              + Create
            </ThemedText>
          </Pressable>
        )}
      </View>

      {joined.map((subgroup) => (
        <SubgroupRow
          key={subgroup.id}
          subgroup={subgroup}
          favoriteBusy={favoriteBusyId === subgroup.id}
          onPress={() => onOpen(subgroup.id)}
          onToggleFavorite={() => onToggleFavorite(subgroup)}
        />
      ))}

      {unjoined.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowUnjoined((shown) => !shown)}
            style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
            <ThemedText type="smallBold" themeColor="primary">
              {showUnjoined
                ? 'Hide sub-groups I’m not in'
                : `Show sub-groups I’m not in (${unjoined.length})`}
            </ThemedText>
          </Pressable>
          {showUnjoined
            ? unjoined.map((subgroup) => (
                <SubgroupRow
                  key={subgroup.id}
                  subgroup={subgroup}
                  muted
                  onPress={() => onJoin(subgroup)}
                />
              ))
            : null}
        </>
      ) : null}

      {joined.length === 0 && unjoined.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No sub-groups yet.
        </ThemedText>
      ) : null}
    </View>
  );
}

function SubgroupRow({
  subgroup,
  muted = false,
  favoriteBusy = false,
  onPress,
  onToggleFavorite,
}: {
  subgroup: SubgroupSummary;
  muted?: boolean;
  favoriteBusy?: boolean;
  onPress: () => void;
  /** Absent for a sub-group the viewer has not joined — nothing to favorite there. */
  onToggleFavorite?: () => void;
}) {
  const members = subgroup.memberCount === 1 ? '1 member' : `${subgroup.memberCount} members`;

  return (
    <Card muted={muted}>
      <View style={styles.subgroupRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={subgroup.name}
          onPress={onPress}
          style={({ pressed }) => [styles.subgroupRowMain, pressed && styles.pressed]}>
          <MedallionBadge seed={subgroup.id} content="↳" size={36} />
          <View style={styles.subgroupText}>
            <ThemedText numberOfLines={1}>{subgroup.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {muted ? `${members} · not joined` : members}
            </ThemedText>
            {/* Not joined means none of the viewer's transactions can be in this
                sub-tree, so the balance is always exactly 0 — not worth a line. */}
            {muted ? null : (
              <ThemedText type="smallBold" themeColor={balanceTone(subgroup.viewerBalanceCents)}>
                {groupBalanceLabel(subgroup.viewerBalanceCents)}
              </ThemedText>
            )}
          </View>
        </Pressable>
        {onToggleFavorite ? (
          <FavoriteStar
            favorite={subgroup.favorite}
            label={subgroup.name}
            disabled={favoriteBusy}
            onToggle={onToggleFavorite}
          />
        ) : null}
      </View>
    </Card>
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
      <View style={styles.centeredBody}>
        <ActivityIndicator testID="transactions-loading" color={theme.primary} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.centeredBody}>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          We couldn’t load the transactions. Check your connection and try again.
        </ThemedText>
        <Button label="Try again" variant="secondary" onPress={refresh} />
      </View>
    );
  }

  if (transactions.length === 0) {
    return (
      <View style={styles.centeredBody}>
        <Card tone="brand" style={styles.emptyCard}>
          <ThemedText style={styles.emptyGlyph}>🧾</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            {archived
              ? 'This group has no transactions.'
              : 'No transactions yet. Add one to start tracking what you share.'}
          </ThemedText>
        </Card>
      </View>
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
  readOnly,
  pairRooted,
  ownArchived,
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
  /** Itself or an ancestor archived — gates what the server actually blocks. */
  readOnly: boolean;
  /** This group's whole tree is capped at a friendship's two people — hides "Add friends"/"Invite". */
  pairRooted: boolean;
  /** The group's own flag — drives the archive toggle's own label and action. */
  ownArchived: boolean;
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

      <Card style={styles.sheetSection}>
        <ThemedText type="overline" themeColor="textSecondary">
          {group.memberCount === 1 ? '1 member' : `${group.memberCount} members`}
        </ThemedText>
        <View style={styles.members}>
          {group.members.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </View>
      </Card>

      <Card style={styles.sheetSection}>
        <ThemedText type="overline" themeColor="textSecondary">
          Balances
        </ThemedText>
        <GroupBalances result={balances} members={group.members} />
      </Card>

      {managed ? (
        <View style={styles.actions}>
          {pairRooted ? (
            <ThemedText type="small" themeColor="textSecondary">
              Just the two of you here too — no one else can be added.
            </ThemedText>
          ) : null}

          {readOnly || pairRooted ? null : (
            <>
              <Button label="Add friends" variant="secondary" disabled={busy} onPress={onAddFriends} />
              <Button
                label="Share an invitation link"
                variant="secondary"
                disabled={busy}
                onPress={onInvite}
              />
            </>
          )}
          {readOnly ? null : (
            <Button label="Rename" variant="secondary" disabled={busy} onPress={onRename} />
          )}

          <Button
            label={ownArchived ? 'Reopen group' : 'Archive group'}
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
              <ThemedText type="smallBold" themeColor="danger">
                Delete this group
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          This is the space you share with {group.name}. It’s just the two of you — to
          include other people, create a group.
        </ThemedText>
      )}

      <View style={styles.sheetFooter}>
        <Button label="Close" variant="ghost" onPress={onClose} />
      </View>
    </ThemedView>
  );
}

function MemberRow({ member }: { member: GroupMember }) {
  const theme = useTheme();

  return (
    <View style={styles.memberRow}>
      <Avatar name={member.name} picture={member.picture} size={36} seed={member.id} />
      <ThemedText style={styles.memberName}>{member.name}</ThemedText>
      {member.role === 'owner' ? (
        <View style={[styles.ownerTag, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="overline" themeColor="onAccentSoft">
            Owner
          </ThemedText>
        </View>
      ) : null}
    </View>
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
      <View style={styles.actions}>
        <Button
          label="Add to group"
          busy={busy}
          disabled={selected.size === 0}
          onPress={() => onAdd([...selected])}
        />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
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
  const [name, setName] = useState(current);

  return (
    <ThemedView style={styles.sheet}>
      <ThemedText type="subtitle">Rename group</ThemedText>
      <TextField
        accessibilityLabel="Group name"
        autoFocus
        value={name}
        onChangeText={setName}
        maxLength={60}
      />
      <View style={styles.actions}>
        <Button
          label="Rename"
          busy={busy}
          disabled={name.trim().length === 0 || name.trim() === current}
          onPress={() => onRename(name.trim())}
        />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </ThemedView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.centered}>{children}</View>
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
  headerWash: {
    // Bleeds to the edges of the screen's own padding, like the home
    // screen's hero (`docs/specs/home.md`).
    marginHorizontal: -Spacing.four,
    marginTop: -Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  headerTitle: {
    flex: 1,
  },
  headerChip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  balanceCard: {
    marginTop: Spacing.two,
    gap: Spacing.one,
  },
  subgroups: {
    gap: Spacing.two,
  },
  subgroupsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subgroupRow: {
    flexDirection: 'row',
    // The star aligns with the name line specifically, not the row's full
    // height — the row also carries a member count and balance beneath it.
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  subgroupRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  subgroupText: {
    flex: 1,
    gap: Spacing.half,
  },
  list: {
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  emptyGlyph: {
    fontSize: 40,
    lineHeight: 48,
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
  ownerTag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  sheetSection: {
    gap: Spacing.three,
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
  pressed: {
    opacity: 0.6,
  },
  toggle: {
    paddingVertical: Spacing.one,
  },
  muted: {
    opacity: 0.55,
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
});
