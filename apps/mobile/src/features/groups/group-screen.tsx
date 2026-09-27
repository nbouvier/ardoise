import type { GroupDetail, GroupMember, SubgroupSummary, Transaction } from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Breadcrumb } from '@/components/breadcrumb';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DismissiblePage } from '@/components/dismissible-page';
import { FavoriteStar } from '@/components/favorite-star';
import { BackButton } from '@/components/back-button';
import { MedallionBadge } from '@/components/medallion-badge';
import { PageHero } from '@/components/page-hero';
import { SheetModal } from '@/components/sheet-modal';
import { Pager } from '@/components/pager';
import { TabBar } from '@/components/tab-bar';
import { TextAction } from '@/components/text-action';
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
import {
  TransactionFormScreen,
  type TransactionPrefill,
} from '@/features/transactions/transaction-form-screen';
import { TransactionRow } from '@/features/transactions/transaction-row';
import { transactionsChanged } from '@/features/transactions/transactions-changed';
import { useBalances } from '@/features/transactions/use-balances';
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
import { GroupActionsMenu } from './group-actions-menu';
import { InvitePanel } from './invite-panel';
import { groupsChanged } from './groups-changed';
import { useGroup } from './use-group';
import { useDialog } from '@/components/use-dialog';
import { useGroupRowActions } from './use-group-row-actions';

/**
 * The parts of a group's page, one tab each: what happened (transactions and
 * sub-groups, the default), who stands where (balances and the plan to settle
 * them), what it adds up to (statistics), and who is in it and what can be
 * done to it (manage).
 */
export const GROUP_TABS = [
  { key: 'transactions', label: 'Transactions' },
  { key: 'balances', label: 'Balances' },
  { key: 'statistics', label: 'Statistics' },
  { key: 'manage', label: 'Manage' },
] as const;

export type GroupTab = (typeof GROUP_TABS)[number]['key'];

/** Reads a route param back into a tab, or `undefined` for anything else. */
export function parseGroupTab(value: string | undefined): GroupTab | undefined {
  return GROUP_TABS.find((tab) => tab.key === value)?.key;
}

/**
 * What can be open above the page. `invite` is the hub reached from the
 * Manage tab's "+ Invite"; `friends` (add friends) and `link` (the invitation
 * link) are launched from it and return to it. `transaction` is the
 * add/edit form, also reached from a suggested reimbursement — pre-filled.
 * `createSubgroup` is launched from the sub-groups section, and `rename`
 * from Manage.
 */
type Sheet = 'rename' | 'transaction' | 'createSubgroup' | null;

export interface GroupScreenProps {
  groupId: string;
  /** Opens straight onto a tab — a row's own "Manage" action, elsewhere in the app. */
  initialTab?: GroupTab;
}

export function GroupScreen({ groupId, initialTab = 'transactions' }: GroupScreenProps) {
  const { status, group, refresh, set } = useGroup(groupId);
  const { authorizedFetch, state: authState } = useAuth();
  const viewerId = authState.status === 'signedIn' ? authState.user.id : null;
  const router = useRouter();
  const theme = useTheme();
  const [tab, setTab] = useState<GroupTab>(initialTab);
  // Where the pages are, shared by the pager and the tab bar's underline.
  const tabPosition = useSharedValue(
    GROUP_TABS.findIndex((candidate) => candidate.key === initialTab),
  );
  // "+ Invite" swaps the Manage tab's content for the invite page, in place.
  const [inviting, setInviting] = useState(false);
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
  const subgroupActions = useGroupRowActions();
  const { dialog, confirm, inform } = useDialog();
  const transactionsResult = useTransactions(groupId);
  // Read once here rather than inside the Balances tab: a recorded transaction
  // refreshes it from wherever the form was opened, and the tab is not
  // mounted while another one is showing.
  const balancesResult = useBalances(groupId);

  /**
   * Run a change, keep the screen in sync, and surface a failure plainly.
   * Reports whether it worked, so a caller that navigates away only does so on
   * success.
   */
  async function run(what: string, action: () => Promise<GroupDetail | null>): Promise<boolean> {
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
      inform('That didn’t work', 'Check your connection and try again.');
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

  function manageSubgroup(id: string) {
    router.push({ pathname: '/groups/[id]', params: { id, tab: 'manage' } });
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
        inform('That didn’t work', 'Check your connection and try again.');
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

    confirm({
      title: 'Leave group',
      message: warning,
      confirmLabel: 'Leave',
      destructive: true,
      onConfirm: () => {
        void run('leave', async () => {
          await removeGroupMember(authorizedFetch, groupId, viewerId);
          return null;
        }).then((ok) => ok && leaveScreen());
      },
    });
  }

  function confirmDelete() {
    const scope = hasSubgroups ? ', and every sub-group nested inside it,' : '';
    confirm({
      title: 'Delete group',
      message: `Delete “${group!.name}” permanently? Everything in it${scope} is lost, for everyone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        void run('delete', async () => {
          await deleteGroup(authorizedFetch, groupId);
          return null;
        }).then((ok) => ok && leaveScreen());
      },
    });
  }

  function confirmJoin(subgroup: SubgroupSummary) {
    confirm({
      title: 'Join this group?',
      message: `Join “${subgroup.name}”?`,
      confirmLabel: 'Join',
      onConfirm: () => {
        setBusy(true);
        joinGroup(authorizedFetch, subgroup.id)
          .then(() => {
            groupsChanged.notify();
            openGroup(subgroup.id);
          })
          .catch((error: unknown) => {
            logger.warn('groups.join.failed', errorFields(error));
            inform('That didn’t work', 'Check your connection and try again.');
          })
          .finally(() => setBusy(false));
      },
    });
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

  function selectTab(next: GroupTab) {
    setInviting(false);
    setTab(next);
  }

  // One of the group's tabs, as a page: drawn when shown or next to the one shown.
  const renderTab = (page: GroupTab) => {
    switch (page) {
      case 'transactions':
        return (
          <>
            {/* Standard and pair groups can both have sub-groups — the pair
                group's own Manage message covers the "no one new here"
                part; this section is the same for both kinds. */}
            <SubgroupsSection
              subgroups={group.subgroups}
              readOnly={readOnly}
              busy={busy}
              favoriteBusyId={favoriteBusySubgroupId}
              actionsBusyId={subgroupActions.busyId}
              onOpen={openGroup}
              onJoin={confirmJoin}
              onCreate={() => setSheet('createSubgroup')}
              onToggleFavorite={toggleSubgroupFavorite}
              onManage={manageSubgroup}
              // A sub-group is always a standard group (`groups_pair_no_parent`)
              // and doesn't carry its own `subgroupCount` — it is shown one level
              // deep only, so the leave/delete confirmations skip that clause.
              onArchiveToggle={(subgroup) =>
                subgroupActions.archiveToggle({ ...subgroup, kind: 'standard' })
              }
              onLeave={(subgroup) =>
                subgroupActions.confirmLeave({ ...subgroup, kind: 'standard' })
              }
              onDelete={(subgroup) =>
                subgroupActions.confirmDelete({ ...subgroup, kind: 'standard' })
              }
            />

            <View style={styles.sectionHeader}>
              <ThemedText type="overline" themeColor="textSecondary">
                Transactions
              </ThemedText>
              {readOnly ? null : (
                <TextAction
                  label="+ Add"
                  accessibilityLabel="Add a transaction"
                  onPress={openNewTransaction}
                />
              )}
            </View>

            <TransactionList
              result={transactionsResult}
              viewerId={viewerId}
              archived={readOnly}
              onOpen={openTransaction}
            />
          </>
        );
      case 'balances':
        return (
          <>
            <ReimbursementsScreen
              balances={balancesResult}
              members={group.members}
              viewerId={viewerId}
              readOnly={readOnly}
              onRecord={recordReimbursement}
            />
          </>
        );
      case 'statistics':
        return (
          <StatisticsScreen
            groupId={groupId}
            hasSubgroups={hasSubgroups}
            members={group.members}
            viewerId={viewerId}
          />
        );
      case 'manage':
        return inviting ? (
          <InvitePanel
            group={group}
            busy={busy}
            onAdd={(memberIds) => {
              setInviting(false);
              void run('members.add', () => addGroupMembers(authorizedFetch, groupId, memberIds));
            }}
            onClose={() => setInviting(false)}
          />
        ) : (
          <ManageTab
            group={group}
            managed={managed}
            readOnly={readOnly}
            pairRooted={pairRooted}
            ownArchived={ownArchived}
            isOwner={isOwner}
            alone={alone}
            busy={busy}
            onInvite={() => setInviting(true)}
            onRename={() => setSheet('rename')}
            onArchiveToggle={confirmArchive}
            onLeave={confirmLeave}
            onDelete={confirmDelete}
          />
        );
    }
  };

  // The same wash-and-two-lines top as the tab screens, with the group in the
  // place of the app: its name first, how many are in it underneath. The
  // route has no native header of its own, so the way back is drawn here —
  // the chevron, or pulling the banner down.
  return (
    <DismissiblePage
      onClose={() => router.back()}
      style={{ backgroundColor: theme.background }}
      header={
        <PageHero>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Breadcrumb ancestors={group.ancestors} onOpen={openGroup} />
              <View style={styles.titleLine}>
                <ThemedText type="sectionTitle" numberOfLines={1} style={styles.titleName}>
                  {group.name}
                </ThemedText>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.titleCount}>
                  {`· ${group.memberCount === 1 ? '1 member' : `${group.memberCount} members`}`}
                </ThemedText>
              </View>
              {readOnly ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Archived — read-only until it’s reopened.
                </ThemedText>
              ) : null}
            </View>
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
            <BackButton icon="collapse" onPress={() => router.back()} />
          </View>
        </PageHero>
      }>
      <View style={styles.content}>
        <View style={styles.tabBar}>
          <TabBar tabs={GROUP_TABS} selected={tab} onSelect={selectTab} position={tabPosition} />
        </View>

        <Pager
          index={GROUP_TABS.findIndex((candidate) => candidate.key === tab)}
          count={GROUP_TABS.length}
          position={tabPosition}
          onIndexChange={(index) => selectTab(GROUP_TABS[index]!.key)}
          pageStyle={styles.tabBody}
          renderPage={(index) => renderTab(GROUP_TABS[index]!.key)}
        />
      </View>

      <SheetModal visible={sheet !== null} onClose={() => setSheet(null)}>
        {/* The new-group page draws its own banner, right up to the top edge. */}
        {sheet === 'createSubgroup' ? (
          <CreateGroupScreen
            parentId={groupId}
            parentTrail={[...group.ancestors, { id: group.id, name: group.name }]}
            pairRooted={pairRooted}
            onCreated={(created) => {
              groupsChanged.notify();
              setSheet(null);
              openGroup(created.id);
            }}
            onClose={() => setSheet(null)}
          />
        ) : null}
        {sheet !== 'createSubgroup' ? (
          <ThemedView style={styles.container}>
            <SafeAreaView style={styles.container}>
              {sheet === 'rename' ? (
                <RenameSheet
                  current={group.name}
                  busy={busy}
                  onCancel={() => setSheet(null)}
                  onRename={(name) => {
                    setSheet(null);
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
                    // The Balances tab it may have come from is still under the
                    // sheet, re-read above, so the payment just recorded is
                    // already gone from its plan.
                    setSheet(null);
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
                  onCancel={() => setSheet(null)}
                />
              ) : null}
            </SafeAreaView>
          </ThemedView>
        ) : null}
      </SheetModal>

      {dialog}
      {subgroupActions.dialog}
    </DismissiblePage>
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
  actionsBusyId,
  onOpen,
  onJoin,
  onCreate,
  onToggleFavorite,
  onManage,
  onArchiveToggle,
  onLeave,
  onDelete,
}: {
  subgroups: readonly SubgroupSummary[];
  readOnly: boolean;
  busy: boolean;
  /** The one sub-group whose favorite star is mid-request, if any. */
  favoriteBusyId: string | null;
  /** The one sub-group whose "⋮" action is mid-request, if any. */
  actionsBusyId: string | null;
  onOpen: (groupId: string) => void;
  onJoin: (subgroup: SubgroupSummary) => void;
  onCreate: () => void;
  onToggleFavorite: (subgroup: SubgroupSummary) => void;
  onManage: (groupId: string) => void;
  onArchiveToggle: (subgroup: SubgroupSummary) => void;
  onLeave: (subgroup: SubgroupSummary) => void;
  onDelete: (subgroup: SubgroupSummary) => void;
}) {
  const [showUnjoined, setShowUnjoined] = useState(false);
  const joined = subgroups.filter((subgroup) => subgroup.viewerIsMember);
  const unjoined = subgroups.filter((subgroup) => !subgroup.viewerIsMember);

  if (subgroups.length === 0 && readOnly) {
    return null;
  }

  return (
    <View style={styles.subgroups}>
      <View style={styles.sectionHeader}>
        <ThemedText type="overline" themeColor="textSecondary">
          Sub-groups
        </ThemedText>
        {readOnly ? null : <TextAction label="+ Create" onPress={onCreate} disabled={busy} />}
      </View>

      {joined.map((subgroup) => (
        <SubgroupRow
          key={subgroup.id}
          subgroup={subgroup}
          favoriteBusy={favoriteBusyId === subgroup.id}
          actionsBusy={actionsBusyId === subgroup.id}
          onPress={() => onOpen(subgroup.id)}
          onToggleFavorite={() => onToggleFavorite(subgroup)}
          onManage={() => onManage(subgroup.id)}
          onArchiveToggle={() => onArchiveToggle(subgroup)}
          onLeave={() => onLeave(subgroup)}
          onDelete={() => onDelete(subgroup)}
        />
      ))}

      {unjoined.length > 0 ? (
        <>
          <TextAction
            label={
              showUnjoined
                ? 'Hide sub-groups I’m not in'
                : `Show sub-groups I’m not in (${unjoined.length})`
            }
            onPress={() => setShowUnjoined((shown) => !shown)}
            style={styles.toggle}
          />
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
  actionsBusy = false,
  onPress,
  onToggleFavorite,
  onManage,
  onArchiveToggle,
  onLeave,
  onDelete,
}: {
  subgroup: SubgroupSummary;
  muted?: boolean;
  favoriteBusy?: boolean;
  actionsBusy?: boolean;
  onPress: () => void;
  /** Absent for a sub-group the viewer has not joined — nothing to favorite there. */
  onToggleFavorite?: () => void;
  /** Absent for a sub-group the viewer has not joined — nothing to manage there. */
  onManage?: () => void;
  onArchiveToggle?: () => void;
  onLeave?: () => void;
  onDelete?: () => void;
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
        {onManage && onArchiveToggle && onLeave && onDelete ? (
          <GroupActionsMenu
            name={subgroup.name}
            kind="standard"
            viewerRole={subgroup.viewerRole}
            memberCount={subgroup.memberCount}
            archived={subgroup.archivedAt !== null}
            busy={actionsBusy}
            onManage={onManage}
            onArchiveToggle={onArchiveToggle}
            onLeave={onLeave}
            onDelete={onDelete}
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

/**
 * Who is in the group and what can be done to it: the member list, with the
 * way to bring more people in at its head, then the management actions.
 */
function ManageTab({
  group,
  managed,
  readOnly,
  pairRooted,
  ownArchived,
  isOwner,
  alone,
  busy,
  onInvite,
  onRename,
  onArchiveToggle,
  onLeave,
  onDelete,
}: {
  group: GroupDetail;
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
  onInvite: () => void;
  onRename: () => void;
  onArchiveToggle: () => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.manage}>
      <Card style={styles.manageSection}>
        <View style={styles.sectionHeader}>
          <ThemedText type="overline" themeColor="textSecondary">
            {group.memberCount === 1 ? '1 member' : `${group.memberCount} members`}
          </ThemedText>
          {managed && !readOnly && !pairRooted ? (
            <TextAction
              label="+ Invite"
              accessibilityLabel="Invite"
              disabled={busy}
              onPress={onInvite}
            />
          ) : null}
        </View>
        <View style={styles.members}>
          {group.members.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </View>
      </Card>

      {managed ? (
        <View style={styles.actions}>
          {pairRooted ? (
            <ThemedText type="small" themeColor="textSecondary">
              Just the two of you here too — no one else can be added.
            </ThemedText>
          ) : null}

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
          This is the space you share with {group.name}. It’s just the two of you — to include other
          people, create a group.
        </ThemedText>
      )}
    </ScrollView>
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

/** A state with no group to show yet, still with a way back — there is no native header. */
function Centered({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.centeredBack}>
          <BackButton icon="collapse" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
      <View style={styles.centered}>{children}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // A tab's own content, below the tab bar — one page of the pager. The pager
  // itself spans the full width, so a page slides in from the screen's edge.
  tabBody: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  tabBar: {
    paddingHorizontal: Spacing.four,
  },
  content: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
  // The hero's own row: the back arrow, the name block, the star.
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // The name and its count on one line, the count smaller and never squeezed out.
  titleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  titleName: {
    flexShrink: 1,
  },
  titleCount: {
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  centeredBack: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    alignItems: 'flex-start',
  },
  subgroups: {
    gap: Spacing.two,
  },
  // A section's own line: its overline title, and its "+" action at the end.
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manage: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  manageSection: {
    gap: Spacing.three,
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
    alignSelf: 'flex-start',
    marginVertical: 0,
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
});
