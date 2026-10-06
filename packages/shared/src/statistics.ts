import { z } from 'zod';

import type { TransactionCategory } from './categories.js';
import { TRANSACTION_CATEGORIES, transactionCategorySchema } from './categories.js';
import { memberSharesCents, type Transaction } from './transactions.js';

/**
 * What a breakdown measures — one of the two independent axes a group's
 * statistics are read along (`docs/specs/group-statistics.md`).
 *
 * `spending` and `income` are never mixed into one breakdown: they move money
 * in opposite directions, so a chart summing them would mean nothing.
 * Transfers belong to neither — a member reimbursing another moves money
 * inside the group without the group spending or receiving anything.
 */
export const statisticsTypeSchema = z.enum(['spending', 'income']);
export type StatisticsType = z.infer<typeof statisticsTypeSchema>;

export const categoryBreakdownSliceSchema = z.object({
  category: transactionCategorySchema,
  amountCents: z.number().int().positive(),
  /** Whole-number share of the total. The slices always sum to exactly 100. */
  percent: z.number().int().min(0).max(100),
});
export type CategoryBreakdownSlice = z.infer<typeof categoryBreakdownSliceSchema>;

export interface CategoryBreakdown {
  /** The sum of every slice — what the donut's centre shows. */
  totalCents: number;
  /** Largest first; a category with nothing in it is absent, not a zero slice. */
  slices: CategoryBreakdownSlice[];
}

/** A comma-separated list of ids in a query string; the empty string is the empty list. */
const idListSchema = z
  .string()
  .transform((value) => (value.length === 0 ? [] : value.split(',')))
  .pipe(z.array(z.uuid()));

/**
 * `GET /groups/:groupId/statistics` (`docs/specs/group-statistics.md`).
 * `participantIds` omitted is everyone; `subgroupIds` omitted is every direct
 * sub-group's branch, empty is none. `from` and `to` are inclusive.
 */
export const groupStatisticsQuerySchema = z.object({
  type: statisticsTypeSchema,
  participantIds: idListSchema.optional(),
  subgroupIds: idListSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type GroupStatisticsQuery = z.infer<typeof groupStatisticsQuerySchema>;

/**
 * One breakdown. `excludedSubgroupCount` is how many sub-groups in the
 * selected branches were left out because the caller is not in them, so the
 * view can say so rather than presenting a partial sum as the whole tree's.
 */
export const groupStatisticsResponseSchema = z.object({
  totalCents: z.number().int().nonnegative(),
  slices: z.array(categoryBreakdownSliceSchema),
  excludedSubgroupCount: z.number().int().nonnegative(),
});
export type GroupStatisticsResponse = z.infer<typeof groupStatisticsResponseSchema>;

export interface CategoryBreakdownOptions {
  type: StatisticsType;
  /**
   * Which members' money counts. Omitted or `null` means everyone: each
   * transaction contributes its full amount. Otherwise only the listed
   * members' own shares are counted — one participant reproduces the old "Me"
   * scope, all of them reproduces "the group", and anything in between is a
   * partial breakdown across a chosen subset.
   */
  participantIds?: readonly string[] | null;
}

/** The transaction kind each type of breakdown counts. */
export const statisticsKinds = { spending: 'expense', income: 'income' } as const;

/** Preset display order, for a stable tie-break between equal amounts. */
const categoryOrder = new Map<TransactionCategory, number>(
  TRANSACTION_CATEGORIES.map((category, index) => [category.key, index]),
);

function amountOf(
  transaction: Transaction,
  { participantIds }: CategoryBreakdownOptions,
): number {
  // What the members were *concerned by*, not what they paid — whoever paid,
  // Others included. Others' own share is never counted: what concerns
  // people outside the group is not the group's money
  // (`docs/specs/group-statistics.md`).
  if (!participantIds) {
    return memberSharesCents(transaction);
  }
  // Someone who paid for others without taking part contributes nothing to a
  // breakdown that excludes those others.
  const wanted = new Set(participantIds);
  return transaction.participants
    .filter((participant) => participant.user !== null && wanted.has(participant.user.id))
    .reduce((sum, participant) => sum + participant.shareCents, 0);
}

/**
 * Turn per-category amounts into whole percentages that sum to exactly 100, by
 * the same largest-remainder method the split arithmetic uses: every slice
 * floors first, then the leftover points go to the largest fractional
 * remainders. The slices come in already sorted, so ties resolve in that order
 * and the result is deterministic.
 */
function withPercents(
  slices: readonly Omit<CategoryBreakdownSlice, 'percent'>[],
  totalCents: number,
): CategoryBreakdownSlice[] {
  if (totalCents <= 0) {
    return slices.map((slice) => ({ ...slice, percent: 0 }));
  }

  const withRemainders = slices.map((slice) => {
    const exact = (slice.amountCents * 100) / totalCents;
    const percent = Math.floor(exact);
    return { ...slice, percent, remainder: exact - percent };
  });

  let leftover = 100 - withRemainders.reduce((sum, entry) => sum + entry.percent, 0);

  const byRemainder = [...withRemainders].sort((a, b) => b.remainder - a.remainder);

  for (const entry of byRemainder) {
    if (leftover <= 0) {
      break;
    }
    entry.percent += 1;
    leftover -= 1;
  }

  return withRemainders.map(({ category, amountCents, percent }) => ({
    category,
    amountCents,
    percent,
  }));
}

/**
 * A breakdown from each category's total: the empty ones dropped, the rest
 * largest first, with their percentages. The server aggregates the totals in
 * SQL and finishes here, so the ordering and the rounding keep one definition.
 */
export function breakdownFromTotals(
  centsByCategory: ReadonlyMap<TransactionCategory, number>,
): CategoryBreakdown {
  const sorted = [...centsByCategory.entries()]
    .filter(([, amountCents]) => amountCents > 0)
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return (categoryOrder.get(a[0]) ?? 0) - (categoryOrder.get(b[0]) ?? 0);
    })
    .map(([category, amountCents]) => ({ category, amountCents }));
  const totalCents = sorted.reduce((sum, slice) => sum + slice.amountCents, 0);

  return { totalCents, slices: withPercents(sorted, totalCents) };
}

/**
 * How a group's money splits across categories, for one type and one scope.
 *
 * The readable statement of the rule for what counts: the server computes the
 * same thing in SQL (`GET /groups/:groupId/statistics`), and is tested against
 * this (`docs/specs/group-statistics.md`).
 */
export function categoryBreakdown(
  transactions: readonly Transaction[],
  options: CategoryBreakdownOptions,
): CategoryBreakdown {
  const wantedKind = statisticsKinds[options.type];
  const centsByCategory = new Map<TransactionCategory, number>();

  for (const transaction of transactions) {
    if (transaction.kind !== wantedKind) {
      continue;
    }
    const amountCents = amountOf(transaction, options);
    if (amountCents <= 0) {
      continue;
    }
    centsByCategory.set(
      transaction.category,
      (centsByCategory.get(transaction.category) ?? 0) + amountCents,
    );
  }

  return breakdownFromTotals(centsByCategory);
}
