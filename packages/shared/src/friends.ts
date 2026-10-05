import { z } from 'zod';

/**
 * How another user is exposed: the inviter on a public invitation preview,
 * every entry of a friend list, and every member of a group. Deliberately
 * narrower than `UserProfile` (which describes *oneself*) — it carries no email
 * address.
 *
 * `placeholder` is `true` for a group member known by name only, with no
 * account behind it (`docs/specs/placeholder-members.md`) — as a member, a
 * payer or a participant. Absent for everyone with an account, so an inviter
 * or a friend never carries it.
 */
export const friendSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  picture: z.url().nullable(),
  placeholder: z.literal(true).optional(),
});
export type FriendSummary = z.infer<typeof friendSummarySchema>;

/**
 * A friend as the friend list shows them: the summary, plus where the two of
 * them stand. `balanceCents` is positive when the friend owes the caller,
 * negative when the caller owes the friend, zero when they are settled — netted
 * across every group the two share. See `docs/specs/balances.md`.
 *
 * `groupId` is the implicit pair group the two share — created the moment
 * they become friends (`docs/specs/friends-and-invitations.md`), so it always
 * exists here. `favorite` is that same group's favorite marker, personal to
 * the caller (`docs/specs/favorites.md`); favorited friends sort first.
 * Neither is the group's *own* balance — that stays scoped to the pair
 * group's own transactions, while `balanceCents` here nets every group the
 * two share, the pair group included.
 *
 * Deliberately its own shape rather than a field on `friendSummarySchema`,
 * which also describes a group member, a transaction's payer and an inviter —
 * none of which carry a balance.
 */
export const friendEntrySchema = friendSummarySchema.extend({
  balanceCents: z.number().int(),
  groupId: z.uuid(),
  favorite: z.boolean(),
});
export type FriendEntry = z.infer<typeof friendEntrySchema>;

/** `GET /friends` response. */
export const friendsListResponseSchema = z.object({
  friends: z.array(friendEntrySchema),
});
export type FriendsListResponse = z.infer<typeof friendsListResponseSchema>;
