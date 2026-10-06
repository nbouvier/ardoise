import type {
  AddGroupMembersRequest,
  CreateGroupRequest,
  GroupAncestor,
  GroupDetail,
  GroupRole,
  GroupSummary,
  Invite,
  PlaceholdersResponse,
  UpdateGroupRequest,
} from '@ardoise/shared';

import type { GroupRow } from '../../db/schema.js';
import { InviteError } from '../invites/codes.js';
import type { InviteHandler, InvitesService } from '../invites/service.js';
import type { ReplacedParty } from '../transactions/replace-party.js';
import { toUserSummary } from '../users/repository.js';

import {
  assertCanLeave,
  assertEffectivelyActive,
  assertNotPairGroup,
  assertOwner,
  assertCanRemoveOthers,
  assertRemovable,
  assertWithinDepthLimit,
  GroupAccessError,
  isEffectivelyArchived,
  isPairRooted,
} from './membership.js';
import { createPairTreeSettlement } from './settlement.js';
import type { ClaimedPlaceholder, GroupsRepository, MemberWithUser } from './repository.js';

/**
 * A group the caller is allowed to see, with the role that lets them see it
 * and their own favorite marker off that same membership row
 * (`docs/specs/favorites.md`).
 */
interface GroupContext {
  group: GroupRow;
  role: GroupRole;
  favoritedAt: Date | null;
}

/**
 * How a group is presented outside its own page: the name the viewer knows it
 * by, and the breadcrumb that says where it sits (`docs/specs/home.md`).
 */
export interface GroupLabel {
  name: string;
  ancestors: GroupAncestor[];
}

/** What {@link GroupsService.access} lets the caller go on with. */
export interface GroupAccess {
  /** Everyone currently in the group, placeholders included. */
  memberIds: string[];
}

export interface RemovedMember {
  /** The group had no members left and was deleted with its contents. */
  groupDeleted: boolean;
  /**
   * Set when the person removed was a placeholder taken out of its whole
   * tree: what turning its part into Others changed.
   */
  placeholderRemoved?: ReplacedParty;
  /**
   * How many of the group's descendants the person also lost membership at,
   * as a side effect (`docs/specs/groups.md`) — `0` when the group has none,
   * or when the removal was a no-op (already gone).
   */
  removedFromDescendantCount: number;
}

export interface GroupsService {
  list(userId: string): Promise<GroupSummary[]>;
  /**
   * Every group the caller has favorited, of any kind and any depth — the
   * home screen's own section (`docs/specs/home.md`), and the only read that
   * returns root groups, sub-groups and pair groups side by side. Active
   * before archived, alphabetical within each.
   */
  listFavorites(userId: string): Promise<GroupSummary[]>;
  /**
   * How to present each of `groupIds` to `userId` — what a list of things
   * drawn from several groups at once needs to name each of them
   * (`docs/specs/home.md`). A group the caller does not belong to is simply
   * absent from the result: this never becomes a way to resolve the name of
   * a group one cannot see.
   */
  labels(userId: string, groupIds: readonly string[]): Promise<Map<string, GroupLabel>>;
  get(userId: string, groupId: string): Promise<GroupDetail>;
  /**
   * The membership check a group-scoped route outside `groups` needs, without
   * building the group's whole detail: refuses exactly as {@link get} does,
   * and also as `archived` when `writable` is asked for and the group or any
   * ancestor of it is archived (`docs/specs/groups.md`).
   */
  access(
    userId: string,
    groupId: string,
    options?: { writable?: boolean },
  ): Promise<GroupAccess>;
  create(userId: string, input: CreateGroupRequest): Promise<GroupDetail>;
  update(userId: string, groupId: string, input: UpdateGroupRequest): Promise<GroupDetail>;
  remove(userId: string, groupId: string): Promise<void>;
  /** Friends, placeholders of the tree, and new placeholders, in one request. */
  addMembers(userId: string, groupId: string, input: AddGroupMembersRequest): Promise<GroupDetail>;
  /**
   * Remove a member, or leave. A placeholder removed from its tree's root is
   * removed from the whole tree, its part turned into Others
   * (`docs/specs/placeholder-members.md`).
   */
  removeMember(userId: string, groupId: string, targetId: string): Promise<RemovedMember>;
  /** Every placeholder of `groupId`'s tree, with what claiming it would take over. */
  listPlaceholders(userId: string, groupId: string): Promise<PlaceholdersResponse>;
  renamePlaceholder(
    userId: string,
    groupId: string,
    placeholderId: string,
    name: string,
  ): Promise<GroupDetail>;
  /** "This is me": merge a placeholder of `groupId`'s tree into the caller's account. */
  claimPlaceholder(
    userId: string,
    groupId: string,
    placeholderId: string,
  ): Promise<{ group: GroupDetail; claimed: ClaimedPlaceholder }>;
  /**
   * Join a sub-group visible in a group the caller already belongs to —
   * lighter than an invitation link, since being in the parent is already a
   * stronger trust signal than friendship. Joins that sub-group only; the
   * caller's membership in every ancestor already holds by construction
   * (`docs/specs/groups.md`).
   */
  join(userId: string, groupId: string): Promise<GroupDetail>;
  /**
   * Set or clear the caller's own favorite marker on `groupId`
   * (`docs/specs/favorites.md`). Personal to them, and independent of the
   * group's own archived state — idempotent either way.
   */
  setFavorite(userId: string, groupId: string, favorite: boolean): Promise<GroupDetail>;
  getOrCreateInvite(userId: string, groupId: string): Promise<Invite>;
  rotateInvite(userId: string, groupId: string): Promise<Invite>;
  revokeInvite(userId: string, groupId: string): Promise<void>;
  /**
   * What the statistics "including sub-groups" scope needs
   * (`docs/specs/group-statistics.md`): of `groupId`'s descendants, at any
   * depth, the ones `userId` belongs to — and how many they do not, so the
   * view can say when it is leaving some out. A sub-group's mere visibility
   * must never leak into this: an unjoined one is excluded, full stop.
   *
   * `subgroupIds`, when given, narrows this to only the named direct
   * sub-groups' own branches (each one plus everything nested under it) —
   * the statistics picker's per-branch selection. Any id that is not
   * actually one of `groupId`'s descendants is silently dropped rather than
   * erroring, the same tolerance `scope` itself gets. Omitted entirely, every
   * branch counts, unchanged from before this existed.
   */
  subtreeScope(
    userId: string,
    groupId: string,
    subgroupIds?: readonly string[],
  ): Promise<{ memberDescendantIds: string[]; excludedCount: number }>;
}

/**
 * The slice of the transaction ledger a group's own balance needs: a
 * user's own net balance in a specific set of groups. Narrow on purpose —
 * `groups` reads the ledger, it does not get to write to it, the same
 * pattern `friends`' `CounterpartyBalances` already uses.
 */
export interface GroupBalances {
  balancesByGroup(userId: string, groupIds: readonly string[]): Promise<Map<string, number>>;
}

export interface GroupsServiceDeps {
  repository: GroupsRepository;
  invites: InvitesService;
  ledger: GroupBalances;
  now?: () => Date;
}

/** One active invitation per group, not per member: the link belongs to the group. */
const targetFor = (groupId: string) => ({ kind: 'group' as const, groupId });

/**
 * A standard group's own name. Always set in practice — only a pair group has
 * none, and `nameFor` names it instead — but the column is nullable.
 */
function ownName(group: Pick<GroupRow, 'name'>): string {
  return group.name ?? 'Untitled group';
}

/**
 * What to call a group. A standard group carries its own name; a pair group
 * carries none and is named after the *other* person, so each side sees who
 * they are sharing with.
 */
function nameFor(group: GroupRow, viewerId: string, members: MemberWithUser[]): string {
  if (group.kind !== 'pair') {
    return ownName(group);
  }
  const other = members.find((member) => member.user.id !== viewerId);
  // The other account could have been deleted; the group still has to render.
  return other?.user.name ?? 'Shared expenses';
}

/**
 * The viewer's own net balance in `group` — that group's transactions and
 * nothing else. A sub-group keeps its own figure rather than folding into
 * its parent's: "where do I stand *here*" is the question every screen
 * showing this asks, and a figure that silently included spaces the viewer
 * is not looking at could not be reconciled with the group's own member
 * list (`docs/specs/balances.md`). Module-level (not a closure over
 * `createGroupsService`) so the invite handler below can compute the same
 * figure without a second formula that could drift from this one.
 */
async function ownBalance(
  ledger: GroupBalances,
  userId: string,
  groupId: string,
): Promise<number> {
  const balances = await ledger.balancesByGroup(userId, [groupId]);
  return balances.get(groupId) ?? 0;
}

/**
 * The two-person ceiling a pair-rooted tree can never exceed, or `null` for
 * an ordinary standard-rooted one. Every way a third person could end up in
 * `group` — picked as an initial member, added later, or joining through an
 * invite link — inserts a membership row that propagates up the tree
 * (`docs/specs/groups.md`), which for a pair-rooted group would reach the
 * friendship's own immutable group. Checking the candidate ids against this
 * set at the point of insertion is what actually prevents that; `isPairRooted`
 * alone only says whether the ceiling applies, not who it allows.
 */
async function pairCeiling(
  repository: GroupsRepository,
  group: GroupRow,
): Promise<ReadonlySet<string> | null> {
  const ancestors = await repository.listAncestors(group.id);
  if (!isPairRooted(group, ancestors)) {
    return null;
  }
  const root = ancestors[0] ?? group;
  return new Set(await repository.listMemberIds(root.id));
}

/** Throws `pair_immutable` when `candidateIds` would add someone `ceiling` does not already allow. */
function assertWithinPairCeiling(
  ceiling: ReadonlySet<string> | null,
  candidateIds: readonly string[],
): void {
  if (ceiling && candidateIds.some((id) => !ceiling.has(id))) {
    throw new GroupAccessError('pair_immutable');
  }
}

/**
 * An invite link has no friendship check at all — whoever holds it joins
 * (`InvitesService`) — so it is refused outright for a pair-rooted group
 * rather than checked against the ceiling on acceptance: there is no one
 * left it could legitimately be for, since the only other allowed person is
 * already reachable through the ordinary unjoined-sub-group toggle.
 */
async function assertNotPairRooted(repository: GroupsRepository, group: GroupRow): Promise<void> {
  if (await pairCeiling(repository, group)) {
    throw new GroupAccessError('pair_immutable');
  }
}

export function createGroupsService(deps: GroupsServiceDeps): GroupsService {
  const { repository, invites, ledger, now = () => new Date() } = deps;
  const pairTrees = createPairTreeSettlement(repository, ledger);

  /**
   * Groups as somewhere other than their own page presents them, keyed by
   * id. Reads only what the rows cannot say themselves — the sub-groups'
   * ancestors, then the members of every pair group among all of them (a
   * pair group stores no name) — in one query each, however many groups.
   */
  async function labelsOf(
    rows: readonly GroupRow[],
    viewerId: string,
  ): Promise<Map<string, GroupLabel>> {
    const ancestorsById = await repository.listAncestorsOf(
      rows.filter((group) => group.parentId !== null).map((group) => group.id),
    );
    const pairIds = [...rows, ...[...ancestorsById.values()].flat()]
      .filter((group) => group.kind === 'pair')
      .map((group) => group.id);
    const membersById = await repository.listMembersOf([...new Set(pairIds)]);
    const name = (group: GroupRow) => nameFor(group, viewerId, membersById.get(group.id) ?? []);

    return new Map(
      rows.map((group) => [
        group.id,
        {
          name: name(group),
          ancestors: (ancestorsById.get(group.id) ?? []).map((ancestor) => ({
            id: ancestor.id,
            name: name(ancestor),
          })),
        },
      ]),
    );
  }

  /**
   * A group's ancestors as a breadcrumb reads them, root first. Named the
   * same way the group itself is: a pair group can be an ancestor too — a
   * friendship may have sub-groups (`docs/specs/groups.md`) — and it carries
   * no name of its own, so it is named after the other member, exactly as
   * `nameFor` names it everywhere else. Its member list is the only extra
   * read, and only for a pair-rooted tree.
   */
  function nameAncestors(
    rows: readonly GroupRow[],
    viewerId: string,
  ): Promise<GroupAncestor[]> {
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        name:
          row.kind === 'pair'
            ? nameFor(row, viewerId, await repository.listMembers(row.id))
            : ownName(row),
      })),
    );
  }

  function summaryOf(
    group: GroupRow,
    name: string,
    memberCount: number,
    subgroupCount: number,
    viewerBalanceCents: number,
    favorite: boolean,
    ancestors: readonly GroupAncestor[],
    role: GroupRole,
  ): GroupSummary {
    return {
      id: group.id,
      kind: group.kind,
      name,
      memberCount,
      parentId: group.parentId,
      depth: group.depth,
      ancestors: [...ancestors],
      subgroupCount,
      viewerBalanceCents,
      favorite,
      archivedAt: group.archivedAt?.toISOString() ?? null,
      createdAt: group.createdAt.toISOString(),
      viewerRole: role,
    };
  }

  async function detailOf(
    group: GroupRow,
    viewerId: string,
    role: GroupRole,
    favoritedAt: Date | null,
  ) {
    const [members, children, ancestorRows] = await Promise.all([
      repository.listMembers(group.id),
      repository.listChildren(group.id),
      repository.listAncestors(group.id),
    ]);
    // The rows themselves still answer "is any of them archived / is this
    // tree pair-rooted" below; the breadcrumb needs them named.
    const ancestors = await nameAncestors(ancestorRows, viewerId);
    const pairRooted = isPairRooted(group, ancestorRows);
    // A claim is recorded on the viewer's own row of the tree's root
    // (`docs/specs/placeholder-members.md`); a pair tree has no placeholder.
    const rootMembership = pairRooted
      ? undefined
      : await repository.findMembership((ancestorRows[0] ?? group).id, viewerId);
    const viewerCanClaim = rootMembership !== undefined && rootMembership.claimedPlaceholderAt === null;
    // Every joined child's own role, for its row-level actions menu — a
    // child absent from this map is simply one the viewer hasn't joined
    // (`docs/specs/groups.md`).
    const childRoles = await repository.listMemberRoles(
      viewerId,
      children.map((child) => child.group.id),
    );
    const joinedChildIds = new Set(childRoles.keys());
    // Only a joined sub-group can possibly be favorited — there is no
    // membership row to hold it on otherwise (`docs/specs/favorites.md`).
    const favoriteChildIds = new Set(
      await repository.listFavoriteGroupIds(viewerId, [...joinedChildIds]),
    );
    // One ledger read for this group and each sub-group shown with a figure
    // of its own. An unjoined sub-group is not asked for at all: the viewer
    // is on none of its transactions, so it is `0` without a query.
    const balances = await ledger.balancesByGroup(viewerId, [group.id, ...joinedChildIds]);

    // Favorited sub-groups float to the top of the joined ones, alphabetical
    // order preserved within each half (`docs/specs/favorites.md`); a stable
    // sort keeps `listChildren`'s own alphabetical order as the tiebreaker.
    const orderedChildren = [...children].sort((a, b) => {
      const favoriteA = favoriteChildIds.has(a.group.id) ? 0 : 1;
      const favoriteB = favoriteChildIds.has(b.group.id) ? 0 : 1;
      return favoriteA - favoriteB;
    });

    return {
      ...summaryOf(
        group,
        nameFor(group, viewerId, members),
        members.length,
        children.length,
        balances.get(group.id) ?? 0,
        favoritedAt !== null,
        ancestors,
        role,
      ),
      members: members.map((member) => ({
        ...toUserSummary(member.user),
        role: member.role,
      })),
      subgroups: orderedChildren.map((child) => ({
        id: child.group.id,
        // A sub-group is always a standard group (`groups_pair_no_parent`),
        // so it always carries its own name — no `nameFor` fallback needed.
        name: ownName(child.group),
        memberCount: child.memberCount,
        viewerIsMember: joinedChildIds.has(child.group.id),
        viewerBalanceCents: balances.get(child.group.id) ?? 0,
        favorite: favoriteChildIds.has(child.group.id),
        viewerRole: childRoles.get(child.group.id) ?? null,
        archivedAt: child.group.archivedAt?.toISOString() ?? null,
      })),
      // A root group's `readOnly` is exactly its own archived flag, since it
      // has no ancestors — this only differs from `archivedAt !== null` for a
      // sub-group whose ancestor is archived (`docs/specs/groups.md`).
      readOnly: isEffectivelyArchived(group, ancestorRows),
      pairRooted,
      viewerCanClaim,
    };
  }

  /** {@link assertEffectivelyActive}, fetching the ancestor chain itself. */
  async function assertGroupEffectivelyActive(group: GroupRow): Promise<void> {
    assertEffectivelyActive(group, await repository.listAncestors(group.id));
  }

  /**
   * Membership is the only authorization. A group the caller does not belong
   * to is reported as missing, so its existence is never disclosed — *unless*
   * the caller belongs to its immediate parent, in which case they already
   * legitimately know it exists (it is shown to them in the parent's own
   * sub-group list) and the refusal says "join it" instead
   * (`docs/specs/groups.md`). This never applies transitively: belonging to a
   * grandparent says nothing about knowing a grandchild exists.
   */
  async function requireMembership(userId: string, groupId: string): Promise<GroupContext> {
    const group = await repository.findGroupById(groupId);
    if (!group) {
      throw new GroupAccessError('not_found');
    }
    const membership = await repository.findMembership(groupId, userId);
    if (membership) {
      return { group, role: membership.role, favoritedAt: membership.favoritedAt };
    }
    if (group.parentId && (await repository.findMembership(group.parentId, userId))) {
      throw new GroupAccessError('join_required');
    }
    throw new GroupAccessError('not_found');
  }

  /** Membership plus the guards every management action shares. */
  async function requireManageable(userId: string, groupId: string): Promise<GroupContext> {
    const context = await requireMembership(userId, groupId);
    assertNotPairGroup(context.group);
    return context;
  }

  /**
   * Only the caller's own friends can be pulled into a group directly — and
   * the placeholders of the tree it is in, which are already its members
   * somewhere (`docs/specs/placeholder-members.md`). `rootId` is that tree's
   * root, or `null` for a group that does not exist yet and has none.
   */
  async function requireAddable(
    userId: string,
    memberIds: readonly string[],
    rootId: string | null,
  ) {
    const wanted = [...new Set(memberIds)].filter((id) => id !== userId);
    const placeholderIds = rootId ? await repository.filterPlaceholderIds(rootId, wanted) : [];
    const others = wanted.filter((id) => !placeholderIds.includes(id));
    const friendIds = await repository.filterFriendIds(userId, others);
    if (friendIds.length !== others.length) {
      throw new GroupAccessError('not_friends');
    }
    return [...friendIds, ...placeholderIds];
  }

  /** New placeholders can never go anywhere in a friendship's two-person tree. */
  function assertPlaceholdersAllowed(
    ceiling: ReadonlySet<string> | null,
    names: readonly string[] | undefined,
  ): void {
    if (ceiling && (names?.length ?? 0) > 0) {
      throw new GroupAccessError('pair_immutable');
    }
  }

  /** A placeholder of `groupId`'s tree that is a member of `groupId` itself. */
  async function requirePlaceholderHere(groupId: string, placeholderId: string) {
    const rootId = await repository.findRootId(groupId);
    const placeholder = await repository.findPlaceholder(rootId, placeholderId);
    if (!placeholder || !(await repository.findMembership(groupId, placeholderId))) {
      throw new GroupAccessError('placeholder_not_found');
    }
    return { rootId, placeholder };
  }

  return {
    async list(userId) {
      const rows = await repository.listGroupsForUser(userId);
      if (rows.length === 0) {
        return [];
      }

      // One ledger read for every listed group, rather than one per group:
      // the balance is a client of `transactions`' ledger, not a second
      // implementation of it.
      const balances = await ledger.balancesByGroup(
        userId,
        rows.map(({ group }) => group.id),
      );

      return rows.map(({ group, memberCount, subgroupCount, favoritedAt, role }) =>
        summaryOf(
          group,
          ownName(group),
          memberCount,
          subgroupCount,
          balances.get(group.id) ?? 0,
          favoritedAt !== null,
          // Every group here is a root one, by `listGroupsForUser`'s own
          // filter — there is nothing above it to name.
          [],
          role,
        ),
      );
    },

    async listFavorites(userId) {
      const rows = await repository.listFavoriteGroupsForUser(userId);
      if (rows.length === 0) {
        return [];
      }

      const balances = await ledger.balancesByGroup(
        userId,
        rows.map(({ group }) => group.id),
      );

      const labels = await labelsOf(
        rows.map(({ group }) => group),
        userId,
      );
      const summaries = rows.map(({ group, memberCount, subgroupCount, role }) => {
        const { name, ancestors } = labels.get(group.id)!;
        return summaryOf(
          group,
          name,
          memberCount,
          subgroupCount,
          balances.get(group.id) ?? 0,
          true,
          ancestors,
          role,
        );
      });

      // Sorted here rather than in SQL: a pair group's name is not a column,
      // it is the other member's, so the database cannot order on it.
      return summaries.sort((a, b) => {
        const archivedA = a.archivedAt === null ? 0 : 1;
        const archivedB = b.archivedAt === null ? 0 : 1;
        return archivedA - archivedB || a.name.localeCompare(b.name);
      });
    },

    async labels(userId, groupIds) {
      const wanted = [...new Set(groupIds)];
      // Membership decides what is answered for, in one query — a caller who
      // is no longer in a group gets nothing back for it rather than its name.
      const allowed = await repository.filterMemberGroupIds(userId, wanted);
      return labelsOf(await repository.findGroupsByIds(allowed), userId);
    },

    async get(userId, groupId) {
      const { group, role, favoritedAt } = await requireMembership(userId, groupId);
      return detailOf(group, userId, role, favoritedAt);
    },

    async access(userId, groupId, { writable = false } = {}) {
      const { group } = await requireMembership(userId, groupId);
      const [memberIds] = await Promise.all([
        repository.listMemberIds(groupId),
        writable ? assertGroupEffectivelyActive(group) : undefined,
      ]);
      return { memberIds };
    },

    async create(userId, input) {
      let parentId: string | null = null;
      let depth = 0;
      let ceiling: ReadonlySet<string> | null = null;
      let rootId: string | null = null;

      if (input.parentId) {
        // Creating a sub-group is available to any member of the parent —
        // the same people who can add a friend to it — so this is exactly
        // the membership check every other group action already uses. The
        // parent itself may be a pair group: a friendship can have
        // sub-groups too, just capped at its own two people (`pairCeiling`).
        const { group: parent } = await requireMembership(userId, input.parentId);
        await assertGroupEffectivelyActive(parent);
        assertWithinDepthLimit(parent.depth);
        parentId = parent.id;
        depth = parent.depth + 1;
        ceiling = await pairCeiling(repository, parent);
        rootId = await repository.findRootId(parent.id);
      }

      assertPlaceholdersAllowed(ceiling, input.placeholderNames);
      let memberIds = await requireAddable(userId, input.memberIds ?? [], rootId);
      assertWithinPairCeiling(ceiling, memberIds);
      if (ceiling) {
        // A pair-rooted sub-group can only ever hold the friendship's own two
        // people, so there is no picking involved — both start out as
        // members instead of leaving the partner to notice and join an
        // "unjoined" sub-group later.
        memberIds = [...ceiling];
      }
      const group = await repository.createGroup({
        name: input.name,
        ownerId: userId,
        memberIds,
        placeholderNames: input.placeholderNames ?? [],
        parentId,
        depth,
      });
      // Newly created: nothing has favorited it yet.
      return detailOf(group, userId, 'owner', null);
    },

    async update(userId, groupId, input) {
      const { group, role, favoritedAt } = await requireManageable(userId, groupId);

      const values: { name?: string; archivedAt?: Date | null } = {};
      if (input.name !== undefined) {
        values.name = input.name;
      }
      if (input.archived !== undefined) {
        values.archivedAt = input.archived ? now() : null;
      }

      const updated = await repository.updateGroup(groupId, values, now());
      return detailOf(updated ?? group, userId, role, favoritedAt);
    },

    async remove(userId, groupId) {
      const { group, role } = await requireMembership(userId, groupId);
      if (group.kind === 'pair') {
        // Unlike every other change to a pair group, deleting it is not
        // refused: it reads as "remove this friend" from here, so either
        // side may do it, owner or not — the same friendship deletion "Remove
        // friend" already triggers, taking the group down with it through
        // `groups_friendship_id_fkey` (`docs/specs/groups.md`). Like it, it
        // waits until nobody in the pair tree owes anything.
        if (!(await pairTrees.isSettled(userId, group.id))) {
          throw new GroupAccessError('balance_not_settled');
        }
        await repository.deleteFriendship(group.friendshipId!);
        return;
      }
      assertOwner(role);
      await repository.deleteGroup(group.id);
    },

    async addMembers(userId, groupId, input) {
      const { group, role, favoritedAt } = await requireManageable(userId, groupId);
      await assertGroupEffectivelyActive(group);

      const ceiling = await pairCeiling(repository, group);
      assertPlaceholdersAllowed(ceiling, input.placeholderNames);
      const rootId = await repository.findRootId(groupId);
      const memberIds = await requireAddable(userId, input.memberIds ?? [], rootId);
      assertWithinPairCeiling(ceiling, memberIds);
      await repository.addMembers(groupId, memberIds);
      if (input.placeholderNames && input.placeholderNames.length > 0) {
        await repository.addPlaceholders(rootId, groupId, input.placeholderNames);
      }
      return detailOf(group, userId, role, favoritedAt);
    },

    async removeMember(userId, groupId, targetId) {
      const { group, role } = await requireManageable(userId, groupId);

      // A placeholder taken out of its tree's root leaves the whole tree,
      // and nobody can bring it back: its part becomes Others
      // (`docs/specs/placeholder-members.md`). Out of a sub-group, it is a
      // member like any other, below.
      if (group.parentId === null && targetId !== userId) {
        const placeholder = await repository.findPlaceholder(group.id, targetId);
        if (placeholder) {
          await assertGroupEffectivelyActive(group);
          const placeholderRemoved = await repository.removePlaceholder(group.id, targetId);
          return { groupDeleted: false, removedFromDescendantCount: 0, placeholderRemoved };
        }
      }

      if (targetId === userId) {
        // Placeholders never act, so they are nobody the owner would strand.
        assertCanLeave(role, await repository.countAccountMembers(groupId));
      } else {
        // Removing someone else is a management action; leaving is not.
        await assertGroupEffectivelyActive(group);
        const target = await repository.findMembership(groupId, targetId);
        if (!target) {
          // Already out — nothing to do, and nothing to disclose.
          return { groupDeleted: false, removedFromDescendantCount: 0 };
        }
        assertRemovable(target.role);
        const rootId = group.parentId === null ? group.id : await repository.findRootId(groupId);
        if (!(await repository.findPlaceholder(rootId, targetId))) {
          assertCanRemoveOthers(role);
        }
      }

      // Cascading targetId out of groupId must not strand a sub-group only
      // they can delete — the same reasoning as `assertCanLeave`, extended
      // down the tree (`docs/specs/groups.md`). Applies whether targetId is
      // leaving on their own or being removed by someone else: either way,
      // their membership in every descendant goes with it.
      const stranded = await repository.listOwnedPopulatedDescendants(groupId, targetId);
      if (stranded.length > 0) {
        throw new GroupAccessError('owner_cannot_leave');
      }

      const { removedFromGroupIds, deletedGroupIds } =
        await repository.removeMemberWithDescendants(groupId, targetId);

      return {
        groupDeleted: deletedGroupIds.includes(groupId),
        removedFromDescendantCount: Math.max(0, removedFromGroupIds.length - 1),
      };
    },

    async join(userId, groupId) {
      const group = await repository.findGroupById(groupId);
      // A root group has no "already visible without membership" story, so
      // there is nothing to join directly — the same not_found a stranger
      // gets. Joining only ever applies to a sub-group shown in its parent's
      // own list.
      if (!group || group.parentId === null) {
        throw new GroupAccessError('not_found');
      }
      if (!(await repository.findMembership(group.parentId, userId))) {
        throw new GroupAccessError('not_found');
      }
      await assertGroupEffectivelyActive(group);

      await repository.addMembers(group.id, [userId]);
      // Re-read rather than assume 'member': joining is idempotent, and a
      // caller already a member — as an owner, say — must not be downgraded
      // in the response.
      const membership = await repository.findMembership(group.id, userId);
      return detailOf(group, userId, membership!.role, membership!.favoritedAt);
    },

    async listPlaceholders(userId, groupId) {
      const { group } = await requireMembership(userId, groupId);
      const ancestors = await repository.listAncestors(group.id);
      if (isPairRooted(group, ancestors)) {
        return { placeholders: [], viewerCanClaim: false };
      }
      const rootId = (ancestors[0] ?? group).id;
      const [rows, membership] = await Promise.all([
        repository.listPlaceholders(rootId),
        repository.findMembership(rootId, userId),
      ]);
      const counts = await repository.countTransactionsNaming(rows.map((row) => row.id));
      // One ledger read per placeholder: a tree holds a handful of them.
      const placeholders = await Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          name: row.name,
          transactionCount: counts.get(row.id) ?? 0,
          balanceCents: await ownBalance(ledger, row.id, groupId),
        })),
      );
      return {
        placeholders,
        viewerCanClaim: membership !== undefined && membership.claimedPlaceholderAt === null,
      };
    },

    async renamePlaceholder(userId, groupId, placeholderId, name) {
      const { group, role, favoritedAt } = await requireManageable(userId, groupId);
      await assertGroupEffectivelyActive(group);
      await requirePlaceholderHere(groupId, placeholderId);
      await repository.renamePlaceholder(placeholderId, name, now());
      return detailOf(group, userId, role, favoritedAt);
    },

    async claimPlaceholder(userId, groupId, placeholderId) {
      const { group } = await requireManageable(userId, groupId);
      await assertGroupEffectivelyActive(group);
      // Any placeholder of the tree, not only this group's: whoever joined
      // a sub-group through its link is offered the whole tree's.
      const rootId = await repository.findRootId(groupId);
      const claimed = await repository.claimPlaceholder(rootId, placeholderId, userId, now());
      // Re-read: the claim may have just made the caller a member of more
      // sub-groups, and records that they can claim no more.
      const membership = await repository.findMembership(group.id, userId);
      return {
        group: await detailOf(
          group,
          userId,
          membership!.role,
          membership!.favoritedAt,
        ),
        claimed,
      };
    },

    async setFavorite(userId, groupId, favorite) {
      const { group, role } = await requireMembership(userId, groupId);
      const favoritedAt = favorite ? now() : null;
      await repository.setFavorite(groupId, userId, favoritedAt);
      return detailOf(group, userId, role, favoritedAt);
    },

    async getOrCreateInvite(userId, groupId) {
      const { group } = await requireManageable(userId, groupId);
      await assertGroupEffectivelyActive(group);
      await assertNotPairRooted(repository, group);
      return invites.getOrCreate(targetFor(groupId), userId);
    },

    async rotateInvite(userId, groupId) {
      const { group } = await requireManageable(userId, groupId);
      await assertGroupEffectivelyActive(group);
      await assertNotPairRooted(repository, group);
      return invites.rotate(targetFor(groupId), userId);
    },

    async revokeInvite(userId, groupId) {
      await requireManageable(userId, groupId);
      await invites.revoke(targetFor(groupId));
    },

    async subtreeScope(userId, groupId, subgroupIds) {
      await requireMembership(userId, groupId);
      const allDescendantIds = await repository.listDescendantIds(groupId);

      let descendantIds = allDescendantIds;
      if (subgroupIds) {
        const allowedRoots = subgroupIds.filter((id) => allDescendantIds.includes(id));
        const branches = await Promise.all(
          allowedRoots.map((id) => repository.listDescendantIds(id)),
        );
        const branchIds = new Set(allowedRoots);
        for (const branch of branches) {
          for (const id of branch) {
            branchIds.add(id);
          }
        }
        descendantIds = [...branchIds];
      }

      const memberDescendantIds = await repository.filterMemberGroupIds(userId, descendantIds);
      return {
        memberDescendantIds,
        excludedCount: descendantIds.length - memberDescendantIds.length,
      };
    },
  };
}

/**
 * What a `group` invitation does: joining the group it points at. Registered
 * with the invites feature, which owns the code and its lifecycle.
 */
export function createGroupInviteHandler(
  repository: GroupsRepository,
  ledger: GroupBalances,
): InviteHandler {
  /**
   * A group that was deleted, or archived since the link was shared —
   * itself, or any ancestor of it — takes no new members: the holder's next
   * step is the same as for a dead link (`docs/specs/groups.md`).
   */
  async function resolveGroup(
    groupId: string | null,
  ): Promise<{ group: GroupRow; ancestors: GroupRow[] }> {
    const group = groupId ? await repository.findGroupById(groupId) : undefined;
    if (!group || group.kind === 'pair') {
      throw new InviteError('gone');
    }
    const ancestors = await repository.listAncestors(group.id);
    if (isEffectivelyArchived(group, ancestors)) {
      throw new InviteError('gone');
    }
    return { group, ancestors };
  }

  return {
    async preview({ invite, inviter }) {
      // Deliberately without the ancestors `resolveGroup` also returns: a
      // preview never discloses where in a tree the group sits
      // (`docs/specs/groups.md`).
      const { group } = await resolveGroup(invite.groupId);
      return {
        kind: 'group',
        inviter,
        group: {
          id: group.id,
          name: ownName(group),
          memberCount: await repository.countMembers(group.id),
        },
      };
    },

    async accept({ invite }, userId) {
      const { group, ancestors } = await resolveGroup(invite.groupId);
      // Membership flows down the tree: this also joins every ancestor of
      // `group` (`docs/specs/groups.md`) — a side effect of `addMembers`, not
      // something reflected in the summary below, which describes `group`
      // itself only.
      const inserted = await repository.addMembers(group.id, [userId]);
      const [children, viewerBalanceCents, membership] = await Promise.all([
        repository.listChildren(group.id),
        ownBalance(ledger, userId, group.id),
        // Re-read rather than assume unfavorited: accepting one's own link is
        // a no-op (`alreadyMember: true`), and the existing membership row
        // could already carry a favorite from before.
        repository.findMembership(group.id, userId),
      ]);

      return {
        kind: 'group',
        group: {
          id: group.id,
          kind: 'standard',
          name: ownName(group),
          memberCount: await repository.countMembers(group.id),
          parentId: group.parentId,
          depth: group.depth,
          // Disclosed here, unlike in the preview above: whoever accepted has
          // just joined every one of them (`docs/specs/groups.md`). None can
          // be a pair group — a pair-rooted group refuses invitations
          // outright — so each carries its own name.
          ancestors: ancestors.map((ancestor) => ({
            id: ancestor.id,
            name: ownName(ancestor),
          })),
          subgroupCount: children.length,
          viewerBalanceCents,
          favorite: Boolean(membership?.favoritedAt),
          archivedAt: null,
          createdAt: group.createdAt.toISOString(),
          // Always `member`: joining by invitation link never makes anyone
          // an owner (`docs/specs/groups.md`), so there is no row to read
          // this off in the first place.
          viewerRole: 'member',
        },
        alreadyMember: inserted.length === 0,
      };
    },
  };
}
