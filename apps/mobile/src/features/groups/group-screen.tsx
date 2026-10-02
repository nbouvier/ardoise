import type { GroupDetail, GroupMember, SubgroupSummary, Transaction } from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Breadcrumb } from '@/components/breadcrumb';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DismissiblePage } from '@/components/dismissible-page';
import { FavoriteStar } from '@/components/favorite-star';
import { BackButton } from '@/components/back-button';
import { IconButton } from '@/components/icon-button';
import { MedallionBadge } from '@/components/medallion-badge';
import { MeTag } from '@/components/me-tag';
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
 * What can be open above the page, as a true page-sheet modal. `createSubgroup`
 * is launched from the sub-groups section. The transaction form is not one of
 * these any more — like "+ Invite" on the Manage tab, it swaps the Transactions
 * tab's own content in place (`transactionOpen`, below) rather than sliding up
 * over it. Renaming happens inline on the Manage tab's own name field, not as
 * a sheet either.
 */
type Sheet = 'createSubgroup' | null;

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
  // "+ Invite" swaps the Manage tab's content for the invite page, in place;
  // `transactionOpen` does the same for the Transactions tab and the add/edit
  // form.
  const [inviting, setInviting] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  // Set only when the transaction form was opened from the reimbursement
  // plan — it is both the form's starting values and how closing it knows to
  // hand control back to the plan's own tab afterwards (`returnTab`).
  const [prefill, setPrefill] = useState<TransactionPrefill | null>(null);
  // The tab to come back to once this form closes — only set when it was
  // opened from somewhere other than the Transactions tab itself (a suggested
  // reimbursement, from Balances).
  const [returnTab, setReturnTab] = useState<GroupTab | null>(null);
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

  const closeTransaction = useCallback(() => {
    setTransactionOpen(false);
    if (returnTab) {
      setTab(returnTab);
      setReturnTab(null);
    }
  }, [returnTab]);

  // The form and the invite page are this screen's own state, not routes, so
  // Android's back button would otherwise pop the whole group out from under
  // them. While either is open it closes that instead, exactly like its own
  // cancel; with neither open there is no listener and back leaves the group.
  useEffect(() => {
    if (!transactionOpen && !inviting) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (transactionOpen) {
        closeTransaction();
      } else {
        setInviting(false);
      }
      return true;
    });
    return () => subscription.remove();
  }, [transactionOpen, inviting, closeTransaction]);

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

  function renameGroup(name: string) {
    return run('rename', () => updateGroup(authorizedFetch, groupId, { name }));
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
    setReturnTab(null);
    setTransactionOpen(true);
  }

  function openTransaction(transaction: Transaction) {
    setEditingTransaction(transaction);
    setPrefill(null);
    setReturnTab(null);
    setTransactionOpen(true);
  }

  /**
   * Record a suggested reimbursement: the transfer form, pre-filled, with
   * everything still editable — a partial payment is a changed amount
   * (`docs/specs/reimbursements.md`). This is reached from the Balances tab,
   * so opening it also switches to the Transactions tab, where the form now
   * lives; saving or cancelling returns to Balances, where the plan is then
   * re-read.
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
    setReturnTab(tab);
    setTab('transactions');
    setTransactionOpen(true);
  }

  function selectTab(next: GroupTab) {
    setInviting(false);
    setTransactionOpen(false);
    setTab(next);
  }

  // One of the group's tabs, as a page: drawn when shown or next to the one shown.
  const renderTab = (page: GroupTab) => {
    switch (page) {
      case 'transactions':
        return transactionOpen && viewerId ? (
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
              // A friend's per-friend total on the Friends tab may depend on
              // this transaction too; it has no other way to know.
              friendsChanged.notify();
              // And so do the home's two sections: the group's own balance on
              // its favorited row, and the transaction itself in the latest
              // list (`docs/specs/home.md`).
              announceTransactionChange();
              closeTransaction();
            }}
            onDeleted={() => {
              if (editingTransaction) {
                transactionsResult.remove(editingTransaction.id);
              }
              balancesResult.refresh();
              friendsChanged.notify();
              announceTransactionChange();
              closeTransaction();
            }}
            onCancel={closeTransaction}
          />
        ) : (
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
            subgroups={group.subgroups}
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
            viewerId={viewerId}
            onInvite={() => setInviting(true)}
            onRename={renameGroup}
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

      <SheetModal visible={sheet === 'createSubgroup'} onClose={() => setSheet(null)}>
        {/* The new-group page draws its own banner, right up to the top edge. */}
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
  viewerId,
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
  viewerId: string | null;
  onInvite: () => void;
  onRename: (name: string) => Promise<boolean>;
  onArchiveToggle: () => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  // The owner is always first; everyone else keeps the order the server sent
  // (alphabetical) — a stable sort only ever moves the one owner.
  const orderedMembers = [...group.members].sort((a, b) =>
    a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0,
  );

  return (
    // "handled" keeps the name field focused — and its just-typed draft
    // intact — when its own discard/checkmark are tapped: without it, the
    // scroll view blurs the field on the touch itself, before the button's
    // own `onPress` ever runs, discarding the draft a beat too early.
    <ScrollView contentContainerStyle={styles.manage} keyboardShouldPersistTaps="handled">
      <View style={styles.manageBlock}>
        <View style={styles.sectionHeader}>
          <ThemedText type="overline" themeColor="textSecondary">
            Group name
          </ThemedText>
        </View>
        <GroupNameField
          name={group.name}
          editable={managed && !readOnly}
          busy={busy}
          onRename={onRename}
        />
      </View>

      <View style={styles.manageBlock}>
        <View style={styles.sectionHeader}>
          <ThemedText type="overline" themeColor="textSecondary">
            {`Members (${group.memberCount})`}
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
        <Card style={styles.manageSection}>
          <View style={styles.members}>
            {orderedMembers.map((member) => (
              <MemberRow key={member.id} member={member} isViewer={member.id === viewerId} />
            ))}
          </View>
        </Card>
      </View>

      {managed ? (
        <View style={styles.actions}>
          {pairRooted ? (
            <ThemedText type="small" themeColor="textSecondary">
              Just the two of you here too — no one else can be added.
            </ThemedText>
          ) : null}

          {/* The owner cannot strand the others; alone, leaving is deleting. */}
          {!isOwner || alone ? (
            <Button label="Leave group" variant="secondary" disabled={busy} onPress={onLeave} />
          ) : null}

          <Button
            label={ownArchived ? 'Reopen group' : 'Archive group'}
            variant="secondary"
            busy={busy}
            onPress={onArchiveToggle}
          />

          {isOwner ? (
            <Button label="Delete group" variant="danger" disabled={busy} onPress={onDelete} />
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

// How long the checkmark's confirming tilt (and the state it holds) stays up
// before it fades away — a beat longer than the wobble itself so the
// confirmation actually reads.
const NAME_CONFIRM_HOLD_MS = 900;
// How long an unsaved change sits blurred before the "not saved" hint
// actually shows — long enough that tapping straight back in to keep editing
// never sees it flash.
const NAME_UNSAVED_HINT_DELAY_MS = 400;

/**
 * The group's name, always editable in place: tapping directly into the
 * field is the only way in, no separate edit button — its own checkmark
 * fades in at its end (inside it, not beside it) the moment it's focused,
 * even before anything has changed, and a discard (cross) joins it, to its
 * left, only once the name actually differs from the saved one. Committing
 * only ever happens on the checkmark or the keyboard's own submit, never on
 * losing focus: that neither saves nor discards, so a change left
 * un-validated just sits there — checkmark, cross and all — until it's
 * either committed or discarded, with a small note underneath while it does.
 * The checkmark still does its small confirming tilt, held a moment before
 * it fades away (`docs/DESIGN.md`).
 */
function GroupNameField({
  name,
  editable,
  busy,
  onRename,
}: {
  name: string;
  /** Whether the group can be renamed at all — absent, the field is purely informational. */
  editable: boolean;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
}) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  // Guards `commit` against being invoked twice at once (e.g. a fast double
  // tap on the checkmark) while a request is already in flight.
  const savingRef = useRef(false);
  // The pending delay between losing focus and the unsaved hint actually
  // showing — cleared whenever that hint no longer applies (refocusing,
  // discarding, committing) before it gets the chance to fire.
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Real focus state — tapping directly into or away from the field, plus
  // the discard/commit actions setting it directly rather than waiting on a
  // blur event a real device may fire late, or not at all here (see the
  // mobile-testing memory on native focus commands not round-tripping).
  const [hasFocus, setHasFocus] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [hintDue, setHintDue] = useState(false);
  const [draft, setDraft] = useState(name);
  const rotation = useSharedValue(0);

  // A change sitting in the field that hasn't been sent yet — independent of
  // focus, since losing focus must neither save nor discard it.
  const dirty = draft.trim() !== name;
  // The checkmark shows for as long as there's something to act on: the
  // field is focused, or a change is waiting un-validated. It also stays up
  // through a successful confirmation so its tilt has time to play out, even
  // once focus and dirtiness have both cleared.
  const showCheckmark = hasFocus || dirty || confirmed;
  // The cross only makes sense once there's an actual unsaved change to
  // throw away — showing it just because the field has focus, with nothing
  // typed differently yet, would offer to discard nothing.
  const showDiscard = dirty && !confirmed;
  // Only once its own short delay (`clearHintTimeout`'s counterpart, started
  // on blur) has actually elapsed — a change abandoned by tapping straight
  // back in doesn't deserve a flash of "not saved" on the way past.
  const showUnsavedHint = hintDue && dirty && !hasFocus && !confirmed;

  function clearHintTimeout() {
    if (hintTimeoutRef.current) {
      clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
  }

  function handleFocus() {
    clearHintTimeout();
    setHintDue(false);
    setHasFocus(true);
  }

  // Losing focus on its own — tapping elsewhere, not the checkmark or the
  // keyboard's own submit — neither saves nor discards; the draft just sits
  // there until acted on. The "not saved" hint waits its own short delay
  // rather than appearing the instant focus goes, so a quick tap back into
  // the field to keep editing doesn't flash it for no reason.
  function handleBlur() {
    setHasFocus(false);
    clearHintTimeout();
    hintTimeoutRef.current = setTimeout(() => {
      setHintDue(true);
    }, NAME_UNSAVED_HINT_DELAY_MS);
  }

  function discard() {
    clearHintTimeout();
    setHintDue(false);
    setDraft(name);
    setHasFocus(false);
    inputRef.current?.blur();
  }

  async function commit() {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    try {
      clearHintTimeout();
      setHintDue(false);
      const trimmed = draft.trim();
      if (trimmed.length === 0 || trimmed === name) {
        setDraft(name);
        setHasFocus(false);
        inputRef.current?.blur();
        return;
      }
      const success = await onRename(trimmed);
      if (!success) {
        return;
      }
      setDraft(trimmed);
      setConfirmed(true);
      rotation.set(
        withSequence(
          withTiming(-12, { duration: 70 }),
          withTiming(12, { duration: 100 }),
          withTiming(0, { duration: 90 }),
        ),
      );
      setHasFocus(false);
      inputRef.current?.blur();
      setTimeout(() => {
        setConfirmed(false);
      }, NAME_CONFIRM_HOLD_MS);
    } finally {
      savingRef.current = false;
    }
  }

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));

  return (
    <View style={styles.nameField}>
      <View style={styles.nameFieldRow}>
        <TextField
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          editable={editable && !busy}
          maxLength={60}
          style={styles.nameInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmitEditing={() => void commit()}
        />
        {editable && showCheckmark ? (
          <View style={styles.nameFieldActions} pointerEvents="box-none">
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(120)}
              style={styles.nameFieldActionsGroup}>
              {showDiscard ? (
                <IconButton
                  icon="close"
                  accessibilityLabel="Discard change"
                  color={theme.primary}
                  disabled={busy}
                  onPress={discard}
                />
              ) : null}
              <Animated.View style={iconStyle}>
                <IconButton
                  icon="check"
                  accessibilityLabel="Save group name"
                  color={theme.primary}
                  disabled={busy}
                  onPress={() => void commit()}
                />
              </Animated.View>
            </Animated.View>
          </View>
        ) : null}
      </View>
      {editable ? (
        // Its own fixed-height slot, always present, so the hint showing or
        // not never changes the field block's overall height — the icon
        // crossfade above already has its own timing to juggle; the field
        // settling into a taller "two lines" shape for a beat while that
        // plays out was this row's height moving too, on top of it.
        <View style={styles.nameHintSlot}>
          {showUnsavedHint ? (
            <ThemedText type="small" themeColor="danger" style={styles.nameHintText}>
              Change not saved yet
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MemberRow({ member, isViewer }: { member: GroupMember; isViewer: boolean }) {
  const theme = useTheme();

  return (
    <View style={styles.memberRow}>
      <Avatar name={member.name} picture={member.picture} size={36} seed={member.id} />
      <ThemedText style={styles.memberName}>{member.name}</ThemedText>
      <View style={styles.memberTags}>
        {member.role === 'owner' ? (
          <View style={[styles.memberTag, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="overline" themeColor="onPrimarySoft">
              Owner
            </ThemedText>
          </View>
        ) : null}
        {isViewer ? <MeTag /> : null}
      </View>
    </View>
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
  // A block's own header-then-content spacing inside Manage — the same shape
  // as `subgroups`, just not named after it.
  manageBlock: {
    gap: Spacing.two,
  },
  // The outer wrapper: the field's own row, plus the unsaved-hint slot below
  // it — kept apart so the row's height (and the icons stretched to fill it)
  // is only ever the input's own height, never that plus the hint's.
  nameField: {},
  // The row the icons overlay: its action icons sit inside it, overlaid on
  // its right edge, rather than in a row alongside it.
  nameFieldRow: {
    position: 'relative',
  },
  nameInput: {
    // Room for two icon buttons, the gap between them, and their inset from
    // the field's own edge.
    paddingRight: 84,
  },
  nameFieldActions: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: Spacing.two,
    justifyContent: 'center',
  },
  nameFieldActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  // Fixed at one line of `nameHintText` plus its gap from the field, whether
  // or not the hint itself is showing.
  nameHintSlot: {
    height: 16 + Spacing.one,
    justifyContent: 'flex-end',
  },
  // Deliberately smaller than the "small" text style it's layered on — a
  // field-level caveat, not a message that should compete with the field's
  // own contents (`docs/DESIGN.md`).
  nameHintText: {
    fontSize: 12,
    lineHeight: 16,
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
  memberTags: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  memberTag: {
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
});
