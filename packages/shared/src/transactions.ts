import { z } from 'zod';

import { transactionCategorySchema } from './categories.js';
import { friendSummarySchema } from './friends.js';
import { groupAncestorSchema } from './groups.js';

/**
 * `expense` — the payer spent on behalf of the people it concerns; each of
 * them owes the payer their share. `income` — the reverse: the payer
 * received money on their behalf; each of them is owed their share. `transfer`
 * — one member reimburses another for the full amount; nothing to split.
 * See `docs/specs/transactions.md`.
 */
export const transactionKindSchema = z.enum(['expense', 'income', 'transfer']);
export type TransactionKind = z.infer<typeof transactionKindSchema>;

/**
 * `shares` (the default) divides the amount proportionally to a weight per
 * participant — equal split is simply everyone at weight 1. `amount` takes a
 * fixed amount per participant instead of computing one.
 */
export const splitModeSchema = z.enum(['shares', 'amount']);
export type SplitMode = z.infer<typeof splitModeSchema>;

/** 999,999.99 in the transaction's implicit currency, in cents. */
export const MAX_TRANSACTION_AMOUNT_CENTS = 99_999_999;

export const transactionAmountSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_TRANSACTION_AMOUNT_CENTS);

export const transactionTitleSchema = z.string().trim().min(1).max(80);
export const transactionCommentSchema = z.string().trim().min(1).max(500);

/**
 * Who a transaction names — a payer, a participant, a transfer's recipient:
 * a member's user id, or `null` for **Others**, the single anonymous stand-in
 * for everyone outside the group. Others is the absence of a user, never an
 * account, so it can never surface as a friend, a member or a sign-in. It is
 * nullable rather than optional on purpose: a forgotten field is a validation
 * error, never a silent Others. See `docs/specs/transactions.md`.
 */
export const partyIdSchema = z.uuid().nullable();
export type PartyId = z.infer<typeof partyIdSchema>;

/** How much a participant counts for, relative to the others, in a shares split. */
export const shareWeightSchema = z.number().int().min(1).max(1000);

/** A participant's cents of the total — a shares split's output, or an amount split's input. */
export const shareCentsSchema = z.number().int().min(0).max(MAX_TRANSACTION_AMOUNT_CENTS);

export const sharesSplitParticipantSchema = z.object({
  userId: partyIdSchema,
  weight: shareWeightSchema,
});
export type SharesSplitParticipant = z.infer<typeof sharesSplitParticipantSchema>;

export const amountSplitParticipantSchema = z.object({
  userId: partyIdSchema,
  amount: shareCentsSchema,
});
export type AmountSplitParticipant = z.infer<typeof amountSplitParticipantSchema>;

/**
 * No duplicate participant, in either split mode — each person appears once,
 * and Others (`null`) at most once.
 */
function hasUniqueUserIds(participants: readonly { userId: PartyId }[]): boolean {
  return new Set(participants.map((p) => p.userId)).size === participants.length;
}

export const splitInputSchema = z
  .discriminatedUnion('mode', [
    z.object({
      mode: z.literal('shares'),
      participants: z.array(sharesSplitParticipantSchema).min(1).max(100),
    }),
    z.object({
      mode: z.literal('amount'),
      participants: z.array(amountSplitParticipantSchema).min(1).max(100),
    }),
  ])
  .refine((value) => hasUniqueUserIds(value.participants), {
    message: 'duplicate participant',
    path: ['participants'],
  });
export type SplitInput = z.infer<typeof splitInputSchema>;

const transactionCommonFields = {
  title: transactionTitleSchema,
  amount: transactionAmountSchema,
  occurredOn: z.iso.date(),
  comment: transactionCommentSchema.nullable().optional(),
  /**
   * From the fixed preset list (`categories.ts`). Optional to *send* — the
   * server defaults an omitted one to `other` — but never absent on a stored
   * transaction; see `transactionSchema.category` below.
   */
  category: transactionCategorySchema.optional(),
  /** `null` is Others: accepted by the API, not offered by the client. */
  payerId: partyIdSchema,
};

/**
 * `POST /groups/:groupId/transactions` and `PATCH .../transactions/:txId`: the
 * latter is a full replace (all fields required), not a partial update — a
 * transaction's fields are interdependent (kind drives whether a split or a
 * single recipient applies), so there is no useful partial shape.
 */
export const createTransactionRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('expense'),
    ...transactionCommonFields,
    split: splitInputSchema,
  }),
  z.object({
    kind: z.literal('income'),
    ...transactionCommonFields,
    split: splitInputSchema,
  }),
  z.object({
    kind: z.literal('transfer'),
    ...transactionCommonFields,
    /**
     * The one person being reimbursed. Must differ from `payerId`. `null` is
     * Others: accepted by the API, not offered by the client.
     */
    toUserId: partyIdSchema,
  }),
]);
export type CreateTransactionRequest = z.infer<typeof createTransactionRequestSchema>;

export const updateTransactionRequestSchema = createTransactionRequestSchema;
export type UpdateTransactionRequest = CreateTransactionRequest;

/**
 * A transaction's participant as returned by the API, resolved to a live user
 * — or `null` for Others.
 */
export const transactionParticipantSchema = z.object({
  user: friendSummarySchema.nullable(),
  shareCents: z.number().int(),
  /** Only meaningful when the transaction's `splitMode` is `shares`. */
  weight: z.number().int().nullable(),
});
export type TransactionParticipant = z.infer<typeof transactionParticipantSchema>;

export const transactionSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  kind: transactionKindSchema,
  title: z.string().min(1),
  amountCents: z.number().int(),
  occurredOn: z.iso.date(),
  comment: z.string().nullable(),
  /** Always set — an uncategorised transaction is stored and returned as `other`. */
  category: transactionCategorySchema,
  /** `null` is Others — only ever stored data, never picked in the client. */
  payer: friendSummarySchema.nullable(),
  splitMode: splitModeSchema,
  participants: z.array(transactionParticipantSchema),
  /** `null` once the account that recorded it is deleted. */
  createdBy: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Transaction = z.infer<typeof transactionSchema>;

/** How many transactions a page of a group's list holds, and the most a caller may ask for. */
export const TRANSACTIONS_PAGE_SIZE = 30;
export const MAX_TRANSACTIONS_PAGE_SIZE = 100;

/**
 * `GET /groups/:groupId/transactions?limit=&cursor=`. `cursor` is the
 * `nextCursor` of the previous page, opaque to the client; omitted, the list
 * starts at the most recent transaction (`docs/specs/transactions.md`).
 */
export const transactionsPageQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_TRANSACTIONS_PAGE_SIZE)
    .default(TRANSACTIONS_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});

/** One page of a group's transactions, most recent first. `nextCursor` is `null` on the last. */
export const transactionsListResponseSchema = z.object({
  transactions: z.array(transactionSchema),
  nextCursor: z.string().nullable(),
});
export type TransactionsListResponse = z.infer<typeof transactionsListResponseSchema>;

export const transactionResponseSchema = z.object({ transaction: transactionSchema });
export type TransactionResponse = z.infer<typeof transactionResponseSchema>;

/**
 * One entry of the home screen's latest-transactions section
 * (`docs/specs/home.md`): a transaction that involves the viewer, plus which
 * group it happened in — the transaction alone carries a `groupId`, but a
 * list spanning several groups has to name each one, and say where it sits
 * when it is a sub-group.
 */
export const recentTransactionSchema = z.object({
  transaction: transactionSchema,
  group: z.object({
    id: z.uuid(),
    /** Resolved the way it is everywhere: a pair group takes the other member's name. */
    name: z.string().min(1),
    /** Root first, empty when the group is a root one. */
    ancestors: z.array(groupAncestorSchema),
  }),
});
export type RecentTransaction = z.infer<typeof recentTransactionSchema>;

/** How many entries the home screen asks for, and the ceiling the server allows. */
export const DEFAULT_RECENT_TRANSACTIONS = 10;
export const MAX_RECENT_TRANSACTIONS = 50;

/** `GET /me/transactions?limit=`. An absent or unusable `limit` falls back to the default. */
export const recentTransactionsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_RECENT_TRANSACTIONS)
    .default(DEFAULT_RECENT_TRANSACTIONS),
});

export const recentTransactionsResponseSchema = z.object({
  transactions: z.array(recentTransactionSchema),
});
export type RecentTransactionsResponse = z.infer<typeof recentTransactionsResponseSchema>;

/** `GET /groups/:groupId/transactions/balances`. Positive: the group owes them. */
export const balanceSchema = z.object({
  userId: z.uuid(),
  amountCents: z.number().int(),
});
export type Balance = z.infer<typeof balanceSchema>;

export const balancesResponseSchema = z.object({ balances: z.array(balanceSchema) });
export type BalancesResponse = z.infer<typeof balancesResponseSchema>;

// --- Split arithmetic -------------------------------------------------
//
// Pure, dependency-free math shared by both apps: the client uses it for a
// live preview while composing a transaction, the server uses it as the
// authority and recomputes independently of whatever the client sent. Kept
// here so the two can never drift into splitting the same input differently.

export interface SplitShare {
  userId: PartyId;
  shareCents: number;
}

/** Lexicographic on user id, Others (`null`) after every member — a fixed, total order. */
function compareParties(a: PartyId, b: PartyId): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
}

/**
 * Divide `totalCents` among `participants` proportionally to weight, rounding
 * to the cent with the largest-remainder method: each participant first gets
 * `floor(total * weight / totalWeight)`, then the leftover cents (always
 * fewer than the participant count) go one by one to the largest fractional
 * remainders. Ties break on `userId` (lexicographic, Others last), so the
 * same input always splits the same way — on the client and on the server
 * alike.
 *
 * The result always sums to exactly `totalCents`.
 */
export function splitByShares(
  totalCents: number,
  participants: readonly SharesSplitParticipant[],
): SplitShare[] {
  if (participants.length === 0) {
    throw new Error('splitByShares: at least one participant is required');
  }

  const totalWeight = participants.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('splitByShares: total weight must be positive');
  }

  const withRemainders = participants.map((p) => {
    const exact = (totalCents * p.weight) / totalWeight;
    const shareCents = Math.floor(exact);
    return { userId: p.userId, shareCents, remainder: exact - shareCents };
  });

  let leftover = totalCents - withRemainders.reduce((sum, p) => sum + p.shareCents, 0);

  // Largest remainder first; the party order breaks ties deterministically.
  const byRemainder = [...withRemainders].sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    return compareParties(a.userId, b.userId);
  });

  for (const entry of byRemainder) {
    if (leftover <= 0) {
      break;
    }
    entry.shareCents += 1;
    leftover -= 1;
  }

  return withRemainders.map(({ userId, shareCents }) => ({ userId, shareCents }));
}

/** Whether a set of shares sums to exactly `totalCents` — the split invariant. */
export function splitSumsTo(totalCents: number, shares: readonly SplitShare[]): boolean {
  return shares.reduce((sum, share) => sum + share.shareCents, 0) === totalCents;
}

// --- What a transaction means inside the group ---------------------------
//
// Others (people outside the group) never enters a balance or a statistic:
// only money moving between members counts. These read that rule off the API
// shape, for the client; the server applies the same rule to its own rows
// (`apps/server/src/features/transactions/balances.ts`).

/**
 * What the group's members were concerned by: every participant's share
 * except Others'. Equal to the amount unless part of it was for Others.
 */
export function memberSharesCents(transaction: Pick<Transaction, 'participants'>): number {
  return transaction.participants
    .filter((participant) => participant.user !== null)
    .reduce((sum, participant) => sum + participant.shareCents, 0);
}

/**
 * The transaction's effect on `userId`'s balance in its group. Positive: it
 * moved money toward them. The payer is credited the members' shares — never
 * Others' — and each member is debited their own; an income reverses both. A
 * transaction Others paid is owed to no one in the group, so it moves nothing.
 *
 * E.g. 60 € paid by me, 10 € each for me and two members and 30 € for Others
 * is +20 for me — what the two members owe — not +50.
 */
export function balanceEffectCents(
  transaction: Pick<Transaction, 'kind' | 'payer' | 'participants'>,
  userId: string,
): number {
  if (transaction.payer === null) {
    return 0;
  }
  const sign = transaction.kind === 'income' ? -1 : 1;
  let net = 0;
  if (transaction.payer.id === userId) {
    net += sign * memberSharesCents(transaction);
  }
  const own = transaction.participants.find((participant) => participant.user?.id === userId);
  if (own) {
    net -= sign * own.shareCents;
  }
  return net;
}
