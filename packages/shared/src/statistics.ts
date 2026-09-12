import type { TransactionCategory } from './categories.js';
import { TRANSACTION_CATEGORIES } from './categories.js';
import type { Transaction } from './transactions.js';

/**
 * What a breakdown measures, and over whose money — the two independent axes a
 * group's statistics are read along (`docs/specs/group-statistics.md`).
 *
 * `spending` and `income` are never mixed into one breakdown: they move money
 * in opposite directions, so a chart summing them would mean nothing.
 * Transfers belong to neither — a member reimbursing another moves money
 * inside the group without the group spending or receiving anything.
 */
export type StatisticsType = 'spending' | 'income';

/** `group`: each transaction's full amount. `viewer`: only the viewer's share of it. */
export type StatisticsScope = 'group' | 'viewer';

export interface CategoryBreakdownSlice {
  category: TransactionCategory;
  amountCents: number;
  /** Whole-number share of the total. The slices always sum to exactly 100. */
  percent: number;
}

export interface CategoryBreakdown {
  /** The sum of every slice — what the donut's centre shows. */
  totalCents: number;
  /** Largest first; a category with nothing in it is absent, not a zero slice. */
  slices: CategoryBreakdownSlice[];
}

export interface CategoryBreakdownOptions {
  type: StatisticsType;
  scope: StatisticsScope;
  /** Required by the `viewer` scope, ignored by the `group` one. */
  viewerId?: string | null;
}

const kindByType = { spending: 'expense', income: 'income' } as const;

/** Preset display order, for a stable tie-break between equal amounts. */
const categoryOrder = new Map<TransactionCategory, number>(
  TRANSACTION_CATEGORIES.map((category, index) => [category.key, index]),
);

function amountOf(
  transaction: Transaction,
  { scope, viewerId }: CategoryBreakdownOptions,
): number {
  if (scope === 'group') {
    return transaction.amountCents;
  }
  if (!viewerId) {
    return 0;
  }
  // What the viewer was *concerned by*, not what they paid: someone who paid
  // for others without taking part contributes nothing to their own breakdown.
  return transaction.participants
    .filter((participant) => participant.user.id === viewerId)
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
 * How a group's money splits across categories, for one type and one scope.
 *
 * Pure and dependency-free so the rule for what counts has a single
 * definition: the client derives it from the transactions it already holds,
 * and a server endpoint could reuse it unchanged if the list is ever
 * paginated (see `docs/specs/group-statistics.md`).
 */
export function categoryBreakdown(
  transactions: readonly Transaction[],
  options: CategoryBreakdownOptions,
): CategoryBreakdown {
  const wantedKind = kindByType[options.type];
  const centsByCategory = new Map<TransactionCategory, number>();
  let totalCents = 0;

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
    totalCents += amountCents;
  }

  const sorted = [...centsByCategory.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return (categoryOrder.get(a[0]) ?? 0) - (categoryOrder.get(b[0]) ?? 0);
    })
    .map(([category, amountCents]) => ({ category, amountCents }));

  return { totalCents, slices: withPercents(sorted, totalCents) };
}
