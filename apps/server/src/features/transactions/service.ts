import {
  breakdownFromTotals,
  statisticsKinds,
  DEFAULT_TRANSACTION_CATEGORY,
  splitByShares,
  splitSumsTo,
} from '@ardoise/shared';
import type {
  Balance,
  CreateTransactionRequest,
  FriendSummary,
  GroupStatisticsQuery,
  GroupStatisticsResponse,
  PartyId,
  RecentTransaction,
  SplitMode,
  Transaction,
  UpdateTransactionRequest,
} from '@ardoise/shared';

import type { TransactionParticipantRow, TransactionRow } from '../../db/schema.js';
import type { GroupAccess, GroupsService } from '../groups/service.js';
import type { UsersRepository } from '../users/repository.js';
import { toUserSummary } from '../users/repository.js';

import { groupParticipantsByTransaction } from './balances.js';
import { TransactionError } from './errors.js';
import type {
  ParticipantInput,
  TransactionCursor,
  TransactionFields,
  TransactionsRepository,
} from './repository.js';

export interface TransactionsListResult {
  transactions: Transaction[];
  /** Where the next page starts; `null` on the last. */
  next: TransactionCursor | null;
}

export interface TransactionsService {
  /**
   * One page of a group's own transactions, most recent first, starting
   * after `after` (`docs/specs/transactions.md`). Sub-groups' never appear.
   */
  list(
    userId: string,
    groupId: string,
    page: { limit: number; after?: TransactionCursor | undefined },
  ): Promise<TransactionsListResult>;
  /**
   * How the group's money splits across categories — with the branches of
   * the direct sub-groups named in `query`, every one when omitted, keeping
   * only the descendants the caller belongs to (`docs/specs/group-statistics.md`).
   */
  statistics(
    userId: string,
    groupId: string,
    query: GroupStatisticsQuery,
  ): Promise<GroupStatisticsResponse>;
  get(userId: string, groupId: string, transactionId: string): Promise<Transaction>;
  create(userId: string, groupId: string, input: CreateTransactionRequest): Promise<Transaction>;
  update(
    userId: string,
    groupId: string,
    transactionId: string,
    input: UpdateTransactionRequest,
  ): Promise<Transaction>;
  remove(userId: string, groupId: string, transactionId: string): Promise<void>;
  /**
   * Every current (and formerly-owing) member's net balance. Sums to zero —
   * which is also what lets the client derive the reimbursement plan from
   * it (`planReimbursements`, `docs/specs/reimbursements.md`).
   */
  balances(userId: string, groupId: string): Promise<Balance[]>;
  /**
   * The `limit` most recent transactions that involve the caller — paid by
   * them, or concerning them — across every group and sub-group they belong
   * to, each with the group it happened in (`docs/specs/home.md`). Not scoped
   * to one group, unlike everything above: it is the home screen's own read.
   */
  recent(userId: string, limit: number): Promise<RecentTransaction[]>;
}

export interface TransactionsServiceDeps {
  repository: TransactionsRepository;
  groups: GroupsService;
  users: UsersRepository;
  now?: () => Date;
}

/**
 * A party the request names, resolved against the group's current
 * membership. Others (`null`) is never checked: it stands for everyone
 * outside the group and is always available (`docs/specs/transactions.md`).
 */
function partyId(memberIds: ReadonlySet<string>, id: PartyId): PartyId {
  if (id !== null && !memberIds.has(id)) {
    throw new TransactionError('not_group_member');
  }
  return id;
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
): { splitMode: SplitMode; payerId: PartyId; participants: ParticipantInput[] } {
  const payerId = partyId(memberIds, input.payerId);

  if (input.kind === 'transfer') {
    // Covers Others to Others too: a transfer always has two distinct ends.
    if (input.toUserId === input.payerId) {
      throw new TransactionError('invalid_split');
    }
    const toUserId = partyId(memberIds, input.toUserId);
    return {
      splitMode: 'amount',
      payerId,
      participants: [{ userId: toUserId, shareCents: input.amount, weight: null }],
    };
  }

  const split = input.split.participants.map((p) => ({ ...p, userId: partyId(memberIds, p.userId) }));

  if (input.split.mode === 'shares') {
    const weightById = new Map(input.split.participants.map((p) => [p.userId, p.weight]));
    const shares = splitByShares(
      input.amount,
      split.map(({ userId }) => ({ userId, weight: weightById.get(userId) ?? 1 })),
    );
    return {
      splitMode: 'shares',
      payerId,
      participants: shares.map((share) => ({
        userId: share.userId,
        shareCents: share.shareCents,
        weight: weightById.get(share.userId) ?? null,
      })),
    };
  }

  const amountById = new Map(
    input.split.participants.map((p) => [p.userId, 'amount' in p ? p.amount : 0]),
  );
  const participants: ParticipantInput[] = split.map(({ userId }) => ({
    userId,
    shareCents: amountById.get(userId) ?? 0,
    weight: null,
  }));
  if (!splitSumsTo(input.amount, participants)) {
    throw new TransactionError('invalid_split');
  }
  return { splitMode: 'amount', payerId, participants };
}

function toTransactionFields(
  input: CreateTransactionRequest,
  splitMode: SplitMode,
  payerId: PartyId,
): Omit<TransactionFields, 'groupId'> {
  return {
    kind: input.kind,
    title: input.title,
    amountCents: input.amount,
    occurredOn: input.occurredOn,
    comment: input.comment ?? null,
    category: input.category ?? DEFAULT_TRANSACTION_CATEGORY,
    payerId,
    splitMode,
  };
}

/** `null` (Others) stays `null`: it is not a user, and has no profile. */
function resolveParty(
  userMap: ReadonlyMap<string, FriendSummary>,
  userId: PartyId,
): FriendSummary | null {
  if (userId === null) {
    return null;
  }
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
    kind: row.kind,
    title: row.title,
    amountCents: row.amountCents,
    occurredOn: row.occurredOn,
    comment: row.comment,
    category: row.category,
    payer: resolveParty(userMap, row.payerId),
    splitMode: row.splitMode,
    participants: participants.map((participant) => ({
      user: resolveParty(userMap, participant.userId),
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
  function requireMembership(userId: string, groupId: string): Promise<GroupAccess> {
    return groups.access(userId, groupId);
  }

  /**
   * Membership, and a group that is not archived — itself, or any ancestor
   * of it: an archived group is fully read-only for transactions
   * (`docs/specs/groups.md`).
   */
  function requireWritable(userId: string, groupId: string): Promise<GroupAccess> {
    return groups.access(userId, groupId, { writable: true });
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

  /** Profiles of every user named; Others (`null`) has none to look up. */
  async function buildUserMap(ids: readonly PartyId[]): Promise<Map<string, FriendSummary>> {
    const userIds = ids.filter((id): id is string => id !== null);
    const rows = await users.findSummariesByIds([...new Set(userIds)]);
    return new Map(rows.map((user) => [user.id, toUserSummary(user)]));
  }

  /** The rows as the API shows them, their participants and people read in one go. */
  async function toTransactions(rows: readonly TransactionRow[]): Promise<Transaction[]> {
    const participants = await repository.listParticipants(rows.map((row) => row.id));
    const byTransaction = groupParticipantsByTransaction(participants);
    const userMap = await buildUserMap([
      ...rows.map((row) => row.payerId),
      ...participants.map((participant) => participant.userId),
    ]);
    return rows.map((row) => toTransaction(row, byTransaction.get(row.id) ?? [], userMap));
  }

  async function toDetail(
    row: TransactionRow,
    participants: readonly TransactionParticipantRow[],
  ): Promise<Transaction> {
    const userMap = await buildUserMap([row.payerId, ...participants.map((p) => p.userId)]);
    return toTransaction(row, participants, userMap);
  }

  return {
    async list(userId, groupId, { limit, after }) {
      await requireMembership(userId, groupId);
      const { rows, next } = await repository.listPage(groupId, limit, after);
      return { transactions: await toTransactions(rows), next };
    },

    async statistics(userId, groupId, query) {
      // Checks the caller's membership of `groupId` first.
      const { memberDescendantIds, excludedCount } = await groups.subtreeScope(
        userId,
        groupId,
        query.subgroupIds,
      );
      const totals = await repository.categoryTotals([groupId, ...memberDescendantIds], {
        kind: statisticsKinds[query.type],
        participantIds: query.participantIds ?? null,
        from: query.from,
        to: query.to,
      });
      return { ...breakdownFromTotals(totals), excludedSubgroupCount: excludedCount };
    },

    async recent(userId, limit) {
      // No `requireMembership` here: there is no one group to check. The
      // repository's own join is the authorization — only groups the caller
      // currently belongs to produce a row — and `groups.labels` re-applies
      // the same rule before naming any of them.
      const rows = await repository.listRecentForUser(userId, limit);
      if (rows.length === 0) {
        return [];
      }

      const [transactions, labels] = await Promise.all([
        toTransactions(rows),
        groups.labels(
          userId,
          rows.map((row) => row.groupId),
        ),
      ]);

      return transactions.flatMap((transaction) => {
        const label = labels.get(transaction.groupId);
        // Unreachable through the query above, which only returns rows from
        // groups the caller belongs to — dropped rather than guessed at if a
        // membership disappears between the two reads.
        if (!label) {
          return [];
        }
        return [
          {
            transaction,
            group: { id: transaction.groupId, ...label },
          },
        ];
      });
    },

    async get(userId, groupId, transactionId) {
      await requireMembership(userId, groupId);
      const row = await requireTransaction(groupId, transactionId);
      const participants = await repository.listParticipants([row.id]);
      return toDetail(row, participants);
    },

    async create(userId, groupId, input) {
      const { memberIds } = await requireWritable(userId, groupId);
      const { splitMode, payerId, participants } = resolveSplit(input, new Set(memberIds));

      const created = await repository.create(
        { groupId, ...toTransactionFields(input, splitMode, payerId) },
        userId,
        participants,
      );
      return toDetail(created.transaction, created.participants);
    },

    async update(userId, groupId, transactionId, input) {
      const { memberIds } = await requireWritable(userId, groupId);
      const stored = await requireTransaction(groupId, transactionId);
      // Someone who has left the group since stays on a transaction that
      // already names them: editing it must not force rewriting history. They
      // still cannot be added where they were not (`docs/specs/transactions.md`).
      const storedParticipants = await repository.listParticipants([stored.id]);
      const allowedIds = new Set([
        ...memberIds,
        ...[stored.payerId, ...storedParticipants.map((p) => p.userId)].filter(
          (id): id is string => id !== null,
        ),
      ]);
      const { splitMode, payerId, participants } = resolveSplit(input, allowedIds);

      const updated = await repository.update(
        transactionId,
        toTransactionFields(input, splitMode, payerId),
        participants,
        now(),
      );
      return toDetail(updated.transaction, updated.participants);
    },

    async remove(userId, groupId, transactionId) {
      await requireWritable(userId, groupId);
      await requireTransaction(groupId, transactionId);
      await repository.remove(transactionId);
    },

    async balances(userId, groupId) {
      const { memberIds } = await requireMembership(userId, groupId);
      const totals = await repository.balancesInGroup(groupId);

      for (const memberId of memberIds) {
        if (!totals.has(memberId)) {
          totals.set(memberId, 0);
        }
      }

      return [...totals.entries()].map(([memberId, amountCents]) => ({
        userId: memberId,
        amountCents,
      }));
    },
  };
}
