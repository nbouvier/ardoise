import { z } from 'zod';

import { friendSummarySchema } from './friends.js';

/**
 * `GET /groups/:groupId/transactions/reimbursements?scope=`. `group` (the
 * default) is the group's own transactions only. `subtree` adds every
 * descendant at any depth — **including ones the caller has not joined**,
 * unlike every other sub-tree scope in this product. A plan that ignored
 * those debts would not be minimal over the trip and would contradict what
 * the sub-group's own members see; the disclosure that buys this is
 * deliberate and bounded (`docs/specs/reimbursements.md`).
 */
export const reimbursementScopeSchema = z.enum(['group', 'subtree']);
export type ReimbursementScope = z.infer<typeof reimbursementScopeSchema>;

/**
 * Where one person's net position comes from: their balance in one group of
 * the scope. The sources of a position always sum back to it, which is what
 * makes the plan explainable — see `NetPosition`.
 */
export const reimbursementSourceSchema = z.object({
  groupId: z.uuid(),
  groupName: z.string().min(1),
  /** Positive: that group owes them. Negative: they owe it. Never zero. */
  amountCents: z.number().int(),
});
export type ReimbursementSource = z.infer<typeof reimbursementSourceSchema>;

/**
 * One person's balance over the whole scope — the plain sum of their balance
 * in each group of it, by the same rule a group balance uses
 * (`docs/specs/balances.md`). Positive: they are owed. Negative: they owe.
 *
 * Every current member of the group appears, including at zero, plus anyone
 * who left with something still owed — exactly like a group's balance list.
 * The positions always sum to zero, since every group's balances do.
 */
export const netPositionSchema = z.object({
  user: friendSummarySchema,
  amountCents: z.number().int(),
  /** Largest magnitude first; a group contributing nothing is absent. */
  sources: z.array(reimbursementSourceSchema),
});
export type NetPosition = z.infer<typeof netPositionSchema>;

/**
 * One suggested payment: `from` pays `to` that amount. Derived from the net
 * positions and nothing else — which is why a chain of debts collapses into
 * a single payment instead of one payment per pair.
 *
 * A suggestion carries **no source group**: a payment produced by netting
 * does not belong to one, and claiming one would be a made-up fact. Only
 * positions decompose exactly.
 */
export const suggestedReimbursementSchema = z.object({
  from: friendSummarySchema,
  to: friendSummarySchema,
  amountCents: z.number().int().positive(),
});
export type SuggestedReimbursement = z.infer<typeof suggestedReimbursementSchema>;

/**
 * The plan and the positions it came from travel together: the plan is
 * unreadable without them, and two calls would let the two disagree.
 * Nothing here is stored — both are derived on every read.
 */
export const reimbursementPlanResponseSchema = z.object({
  /** Echoed back, so a client can tell which scope it is looking at. */
  scope: reimbursementScopeSchema,
  /** Largest amount first, then deterministic. Sums to zero. */
  positions: z.array(netPositionSchema),
  /**
   * Canonical order: largest payment first, ties broken on the parties' ids
   * so every viewer sees the same plan. At most one payment fewer than the
   * number of people with a non-zero position.
   */
  reimbursements: z.array(suggestedReimbursementSchema),
});
export type ReimbursementPlanResponse = z.infer<typeof reimbursementPlanResponseSchema>;
