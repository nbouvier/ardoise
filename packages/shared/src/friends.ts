import { z } from 'zod';

/**
 * How another user is exposed: the inviter on a public invitation preview,
 * every entry of a friend list, and every member of a group. Deliberately
 * narrower than `UserProfile` (which describes *oneself*) — it carries no email
 * address.
 */
export const friendSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  picture: z.url().nullable(),
});
export type FriendSummary = z.infer<typeof friendSummarySchema>;

/**
 * A friend as the friend list shows them: the summary, plus where the two of
 * them stand. `balanceCents` is positive when the friend owes the caller,
 * negative when the caller owes the friend, zero when they are settled — netted
 * across every group the two share. See `docs/specs/balances.md`.
 *
 * Deliberately its own shape rather than a field on `friendSummarySchema`,
 * which also describes a group member, a transaction's payer and an inviter —
 * none of which carry a balance.
 */
export const friendEntrySchema = friendSummarySchema.extend({
  balanceCents: z.number().int(),
});
export type FriendEntry = z.infer<typeof friendEntrySchema>;

/** `GET /friends` response. */
export const friendsListResponseSchema = z.object({
  friends: z.array(friendEntrySchema),
});
export type FriendsListResponse = z.infer<typeof friendsListResponseSchema>;
