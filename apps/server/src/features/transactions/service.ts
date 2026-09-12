import { DEFAULT_TRANSACTION_CATEGORY, splitByShares, splitSumsTo } from '@splitcount/shared';
import type {
  Balance,
  CreateTransactionRequest,
  FriendSummary,
  GroupDetail,
  NetPosition,
  ReimbursementPlanResponse,
  ReimbursementScope,
  ReimbursementSource,
  SplitMode,
  Transaction,
  TransactionCategory,
  TransactionKind,
  TransactionsListScope,
  UpdateTransactionRequest,
} from '@splitcount/shared';

import type { TransactionParticipantRow, TransactionRow } from '../../db/schema.js';
import { GroupAccessError } from '../groups/membership.js';
import type { GroupsService } from '../groups/service.js';
import type { UsersRepository } from '../users/repository.js';
import { toUserSummary } from '../users/repository.js';

import {
  computeBalances,
  computeBalancesByGroup,
  groupParticipantsByTransaction,
} from './balances.js';
import { TransactionError } from './errors.js';
import { planReimbursements } from './reimbursements.js';
import type { ParticipantInput, TransactionFields, TransactionsRepository } from './repository.js';

export interface TransactionsListResult {
  transactions: Transaction[];
  /** Always `0` for `scope: 'group'`. See `docs/specs/group-statistics.md`. */
  excludedSubgroupCount: number;
}

export interface TransactionsService {
  /**
   * A group's transactions. `scope: 'subtree'` adds those of every
   * descendant the caller belongs to (`docs/specs/group-statistics.md`);
   * `'group'` (the default call site, the plain transaction list) is
   * unaffected by sub-groups entirely.
   */
  list(userId: string, groupId: string, scope?: TransactionsListScope): Promise<TransactionsListResult>;
  get(userId: string, groupId: string, transactionId: string): Promise<Transaction>;
  create(userId: string, groupId: string, input: CreateTransactionRequest): Promise<Transaction>;
  update(
    userId: string,
    groupId: string,
    transactionId: string,
    input: UpdateTransactionRequest,
  ): Promise<Transaction>;
  remove(userId: string, groupId: string, transactionId: string): Promise<void>;
  /** Every current (and formerly-owing) member's net balance. Sums to zero. */
  balances(userId: string, groupId: string): Promise<Balance[]>;
  /**
   * Who should pay whom to clear everything, and the net positions it is
   * derived from (`docs/specs/reimbursements.md`). `scope: 'subtree'` covers
   * the group and every descendant at any depth — **including ones the
   * caller has not joined**, unlike every other sub-tree scope here.
   */
  reimbursements(
    userId: string,
    groupId: string,
    scope?: ReimbursementScope,
  ): Promise<ReimbursementPlanResponse>;
}

export interface TransactionsServiceDeps {
  repository: TransactionsRepository;
  groups: GroupsService;
  users: UsersRepository;
  now?: () => Date;
}

/**
 * Turn a create/update request into what actually gets persisted: which
 * split mode, and each participant's cents. Shares are computed here (the
 * server is the authority, independent of what the client previewed); fixed
 * amounts are only validated to sum correctly. A transfer normalises to a
 * single-participant amount split, so storage and the balance calculation
 * never need a third case.
 */
function resolveSplit(
  input: CreateTransactionRequest,
  memberIds: ReadonlySet<string>,
): { splitMode: SplitMode; participants: ParticipantInput[] } {
  if (!memberIds.has(input.payerId)) {
    throw new TransactionError('not_group_member');
  }

  if (input.kind === 'transfer') {
    if (input.toUserId === input.payerId) {
      throw new TransactionError('invalid_split');
    }
    if (!memberIds.has(input.toUserId)) {
      throw new TransactionError('not_group_member');
    }
    return {
      splitMode: 'amount',
      participants: [{ userId: input.toUserId, shareCents: input.amount, weight: null }],
    };
  }

  const participantIds = input.split.participants.map((p) => p.userId);
  if (participantIds.some((id) => !memberIds.has(id))) {
    throw new TransactionError('not_group_member');
  }

  if (input.split.mode === 'shares') {
    const shares = splitByShares(input.amount, input.split.participants);
    const weightById = new Map(input.split.participants.map((p) => [p.userId, p.weight]));
    return {
      splitMode: 'shares',
      participants: shares.map((share) => ({
        userId: share.userId,
        shareCents: share.shareCents,
        weight: weightById.get(share.userId) ?? null,
      })),
    };
  }

  const participants: ParticipantInput[] = input.split.participants.map((p) => ({
    userId: p.userId,
    shareCents: p.amount,
    weight: null,
  }));
  if (!splitSumsTo(input.amount, participants)) {
    throw new TransactionError('invalid_split');
  }
  return { splitMode: 'amount', participants };
}

function toTransactionFields(
  input: CreateTransactionRequest,
  splitMode: SplitMode,
): Omit<TransactionFields, 'groupId'> {
  return {
    kind: input.kind,
    title: input.title,
    amountCents: input.amount,
    occurredOn: input.occurredOn,
    comment: input.comment ?? null,
    category: input.category ?? DEFAULT_TRANSACTION_CATEGORY,
    payerId: input.payerId,
    splitMode,
  };
}

function resolveUser(userMap: ReadonlyMap<string, FriendSummary>, userId: string): FriendSummary {
  // The account could have been deleted since; the transaction still has to
  // render, the same way a pair group falls back when the other member is
  // gone (see groups/service.ts).
  return userMap.get(userId) ?? { id: userId, name: 'Deleted user', picture: null };
}

function toTransaction(
  row: TransactionRow,
  participants: readonly TransactionParticipantRow[],
  userMap: ReadonlyMap<string, FriendSummary>,
): Transaction {
  return {
    id: row.id,
    groupId: row.groupId,
    kind: row.kind as TransactionKind,
    title: row.title,
    amountCents: row.amountCents,
    occurredOn: row.occurredOn,
    comment: row.comment,
    category: row.category as TransactionCategory,
    payer: resolveUser(userMap, row.payerId),
    splitMode: row.splitMode as SplitMode,
    participants: participants.map((participant) => ({
      user: resolveUser(userMap, participant.userId),
      shareCents: participant.shareCents,
      weight: participant.weight,
    })),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createTransactionsService(deps: TransactionsServiceDeps): TransactionsService {
  const { repository, groups, users, now = () => new Date() } = deps;

  /**
   * Caller membership, resolved through `groups` — a non-member gets exactly
   * the same `not_found` refusal as every other group route, and a group the
   * caller belongs to is always readable even when archived.
   */
  async function requireMembership(userId: string, groupId: string): Promise<GroupDetail> {
    return groups.get(userId, groupId);
  }

  /**
   * A group that is archived — itself, or any ancestor of it — is fully
   * read-only for transactions (`docs/specs/groups.md`). `readOnly` already
   * carries that combined check; a root group's is exactly its own
   * `archivedAt !== null`, since it has no ancestors.
   */
  function requireActive(group: GroupDetail): void {
    if (group.readOnly) {
      throw new GroupAccessError('archived');
    }
  }

  /**
   * The transaction, scoped to the group named in the URL. A valid id
   * belonging to a *different* group is reported as not found — the id alone
   * is not authorization to touch it.
   */
  async function requireTransaction(groupId: string, transactionId: string): Promise<TransactionRow> {
    const row = await repository.findById(transactionId);
    if (!row || row.groupId !== groupId) {
      throw new TransactionError('not_found');
    }
    return row;
  }

  async function buildUserMap(ids: readonly string[]): Promise<Map<string, FriendSummary>> {
    const rows = await users.findManyByIds([...new Set(ids)]);
    return new Map(rows.map((user) => [user.id, toUserSummary(user)]));
  }

  async function toDetail(
    row: TransactionRow,
    participants: readonly TransactionParticipantRow[],
  ): Promise<Transaction> {
    const userMap = await buildUserMap([row.payerId, ...participants.map((p) => p.userId)]);
    return toTransaction(row, participants, userMap);
  }

  return {
    async list(userId, groupId, scope = 'group') {
      await requireMembership(userId, groupId);

      let excludedSubgroupCount = 0;
      let rows: TransactionRow[];
      if (scope === 'subtree') {
        const { memberDescendantIds, excludedCount } = await groups.subtreeScope(
          userId,
          groupId,
        );
        excludedSubgroupCount = excludedCount;
        rows = await repository.listByGroups([groupId, ...memberDescendantIds]);
      } else {
        rows = await repository.listByGroup(groupId);
      }

      const participants = await repository.listParticipants(rows.map((row) => row.id));
      const byTransaction = groupParticipantsByTransaction(participants);
      const userMap = await buildUserMap([
        ...rows.map((row) => row.payerId),
        ...participants.map((participant) => participant.userId),
      ]);
      return {
        transactions: rows.map((row) => toTransaction(row, byTransaction.get(row.id) ?? [], userMap)),
        excludedSubgroupCount,
      };
    },

    async get(userId, groupId, transactionId) {
      await requireMembership(userId, groupId);
      const row = await requireTransaction(groupId, transactionId);
      const participants = await repository.listParticipants([row.id]);
      return toDetail(row, participants);
    },

    async create(userId, groupId, input) {
      const group = await requireMembership(userId, groupId);
      requireActive(group);
      const memberIds = new Set(group.members.map((member) => member.id));
      const { splitMode, participants } = resolveSplit(input, memberIds);

      const created = await repository.create(
        { groupId, ...toTransactionFields(input, splitMode) },
        userId,
        participants,
      );
      return toDetail(created.transaction, created.participants);
    },

    async update(userId, groupId, transactionId, input) {
      const group = await requireMembership(userId, groupId);
      requireActive(group);
      await requireTransaction(groupId, transactionId);
      const memberIds = new Set(group.members.map((member) => member.id));
      const { splitMode, participants } = resolveSplit(input, memberIds);

      const updated = await repository.update(
        transactionId,
        toTransactionFields(input, splitMode),
        participants,
        now(),
      );
      return toDetail(updated.transaction, updated.participants);
    },

    async remove(userId, groupId, transactionId) {
      const group = await requireMembership(userId, groupId);
      requireActive(group);
      await requireTransaction(groupId, transactionId);
      await repository.remove(transactionId);
    },

    async balances(userId, groupId) {
      const group = await requireMembership(userId, groupId);
      const rows = await repository.listByGroup(groupId);
      const participants = await repository.listParticipants(rows.map((row) => row.id));
      const totals = computeBalances(rows, groupParticipantsByTransaction(participants));

      for (const member of group.members) {
        if (!totals.has(member.id)) {
          totals.set(member.id, 0);
        }
      }

      return [...totals.entries()].map(([memberId, amountCents]) => ({
        userId: memberId,
        amountCents,
      }));
    },

    async reimbursements(userId, groupId, scope = 'group') {
      const group = await requireMembership(userId, groupId);

      // The group itself first, named the way it already renders (a pair
      // group is named after the other person, so its name cannot be read
      // off the row). Then, for a sub-tree plan, every descendant — the
      // caller's membership in them deliberately not consulted; see
      // `groups.reimbursementScope`.
      const scopeGroups = [{ id: group.id, name: group.name }];
      if (scope === 'subtree') {
        scopeGroups.push(...(await groups.reimbursementScope(userId, groupId)));
      }

      const rows = await repository.listByGroups(scopeGroups.map((inScope) => inScope.id));
      const participants = await repository.listParticipants(rows.map((row) => row.id));
      const balancesByGroup = computeBalancesByGroup(
        rows,
        groupParticipantsByTransaction(participants),
      );

      const netByUser = new Map<string, number>();
      const sourcesByUser = new Map<string, ReimbursementSource[]>();
      for (const inScope of scopeGroups) {
        for (const [personId, amountCents] of balancesByGroup.get(inScope.id) ?? []) {
          netByUser.set(personId, (netByUser.get(personId) ?? 0) + amountCents);
          if (amountCents === 0) {
            // Nothing to justify: a group someone came out even in explains
            // nothing about where their position comes from.
            continue;
          }
          const sources = sourcesByUser.get(personId);
          const source = { groupId: inScope.id, groupName: inScope.name, amountCents };
          if (sources) {
            sources.push(source);
          } else {
            sourcesByUser.set(personId, [source]);
          }
        }
      }

      // Every current member appears, including at zero — the same rule the
      // per-member balance list follows, so the two never disagree about
      // who is in the group.
      for (const member of group.members) {
        if (!netByUser.has(member.id)) {
          netByUser.set(member.id, 0);
        }
      }

      const plan = planReimbursements(netByUser);
      const userMap = await buildUserMap([...netByUser.keys()]);

      const positions: NetPosition[] = [...netByUser.entries()]
        .map(([personId, amountCents]) => ({
          user: resolveUser(userMap, personId),
          amountCents,
          sources: [...(sourcesByUser.get(personId) ?? [])].sort(
            (a, b) =>
              Math.abs(b.amountCents) - Math.abs(a.amountCents) ||
              compare(a.groupId, b.groupId),
          ),
        }))
        // Owed first, owing next, settled last — and deterministic, so two
        // members read the same list in the same order.
        .sort(
          (a, b) =>
            Number(a.amountCents === 0) - Number(b.amountCents === 0) ||
            b.amountCents - a.amountCents ||
            compare(a.user.id, b.user.id),
        );

      return {
        scope,
        positions,
        reimbursements: plan.map((payment) => ({
          from: resolveUser(userMap, payment.fromUserId),
          to: resolveUser(userMap, payment.toUserId),
          amountCents: payment.amountCents,
        })),
      };
    },
  };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
