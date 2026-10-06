import type { GroupDetail, SubgroupSummary, Transaction } from '@ardoise/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AsyncState } from '@/components/async-state';
import { Breadcrumb } from '@/components/breadcrumb';
import { Button } from '@/components/button';
import { DismissiblePage } from '@/components/dismissible-page';
import { FavoriteStar } from '@/components/favorite-star';
import { BackButton } from '@/components/back-button';
import { PageHero } from '@/components/page-hero';
import { SheetModal } from '@/components/sheet-modal';
import { Pager } from '@/components/pager';
import { TabBar } from '@/components/tab-bar';
import { TextAction } from '@/components/text-action';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useDialog } from '@/components/use-dialog';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import {
  ReimbursementsScreen,
  type Suggestion,
} from '@/features/reimbursements/reimbursements-screen';
import { StatisticsScreen } from '@/features/statistics/statistics-screen';
import {
  TransactionFormScreen,
  type TransactionPrefill,
} from '@/features/transactions/transaction-form-screen';
import { useBalances } from '@/features/transactions/use-balances';
import { useTransactions } from '@/features/transactions/use-transactions';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api/errors';
import {
  addGroupMembers,
  deleteGroup,
  joinGroup,
  removeGroupMember,
  setGroupFavorite,
  updateGroup,
} from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';
import { useInvalidation } from '@/lib/query/use-invalidation';

import { CreateGroupScreen } from './create-group-screen';
import { InvitePanel } from './invite-panel';
import { ManageTab } from './manage-tab';
import { usePlaceholderActions } from './placeholder-actions';
import { SectionHeader } from './section-header';
import { SubgroupsSection } from './subgroups-section';
import { TransactionList } from './transaction-list';
import { useGroup } from './use-group';
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
  const { dialog, confirm, inform, informFailure } = useDialog();
  const invalidation = useInvalidation();
  const transactionsResult = useTransactions(groupId);
  // Read once here rather than inside the Balances tab: a recorded transaction
  // refreshes it from wherever the form was opened, and the tab is not
  // mounted while another one is showing.
  const balancesResult = useBalances(groupId);
  const placeholderActions = usePlaceholderActions({
    group,
    readOnly: group?.readOnly ?? true,
    onChanged: (updated) => (updated ? set(updated) : refresh()),
  });

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
      void invalidation.groupsChanged();
      if (updated) {
        set(updated);
      }
      return true;
    } catch (error: unknown) {
      logger.warn(`groups.${what}.failed`, errorFields(error));
      if (error instanceof ApiError && error.code === 'placeholder_name_taken') {
        inform('That name is taken', 'Someone in this group already has one of those names.');
      } else {
        informFailure();
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  function leaveScreen() {
    void invalidation.groupsChanged();
    router.back();
  }

  /**
   * A transaction was recorded, edited or deleted here. Balances cannot be
   * recomputed from one transaction — every member's share of it moved — and
   * the figures shown elsewhere (each friend's total, the home's latest list
   * and the group's own balance on its favorited row) depend on it too.
   */
  function afterTransactionChange() {
    void invalidation.transactionsChanged();
    closeTransaction();
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

  if (status !== 'ready' || !group) {
    return (
      <Centered>
        <AsyncState
          status={status === 'loading' ? 'loading' : 'error'}
          loadingTestID="group-loading"
          failure="We couldn’t load this group. Check your connection and try again."
          onRetry={refresh}>
          {null}
        </AsyncState>
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
  // Alone among the members with an account: placeholders never keep a group
  // going, so leaving then deletes it with them (`docs/specs/placeholder-members.md`).
  const alone = group.members.filter((member) => !member.placeholder).length === 1;
  const placeholderNames = group.members
    .filter((member) => member.placeholder)
    .map((member) => member.name);
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
   * feed `set()` directly — invalidating the groups is what brings
   * this screen's own `subgroups` list (order included) back in sync.
   */
  function toggleSubgroupFavorite(subgroup: SubgroupSummary) {
    setFavoriteBusySubgroupId(subgroup.id);
    setGroupFavorite(authorizedFetch, subgroup.id, !subgroup.favorite)
      .then(() => invalidation.groupsChanged())
      .catch((error: unknown) => {
        logger.warn('groups.favorite.failed', errorFields(error));
        informFailure();
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
    const withThem =
      placeholderNames.length > 0 ? `, with ${placeholderNames.join(', ')},` : '';
    const warning = alone
      ? `Leave “${group!.name}”? You’re the only member on Ardoise, so the group${scope}${withThem} is deleted.`
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
            void invalidation.groupsChanged();
            openGroup(subgroup.id);
          })
          .catch((error: unknown) => {
            logger.warn('groups.join.failed', errorFields(error));
            informFailure();
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
              afterTransactionChange();
            }}
            onDeleted={() => {
              if (editingTransaction) {
                transactionsResult.remove(editingTransaction.id);
              }
              afterTransactionChange();
            }}
            onCancel={closeTransaction}
          />
        ) : (
          <TransactionList
            result={transactionsResult}
            viewerId={viewerId}
            archived={readOnly}
            onOpen={openTransaction}
            header={
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
                <SectionHeader
                  title="Transactions"
                  action={
                    readOnly ? null : (
                      <TextAction
                        label="+ Add"
                        accessibilityLabel="Add a transaction"
                        onPress={openNewTransaction}
                      />
                    )
                  }
                />
              </>
            }
          />
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
            onAdd={(people) => {
              setInviting(false);
              void run('members.add', () => addGroupMembers(authorizedFetch, groupId, people));
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
            onPlaceholderPress={placeholderActions.available ? placeholderActions.open : undefined}
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
          parentPlaceholders={group.members.filter((member) => member.placeholder)}
          onCreated={(created) => {
            void invalidation.groupsChanged();
            setSheet(null);
            openGroup(created.id);
          }}
          onClose={() => setSheet(null)}
        />
      </SheetModal>

      {dialog}
      {subgroupActions.dialog}
      {placeholderActions.element}
    </DismissiblePage>
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
});
