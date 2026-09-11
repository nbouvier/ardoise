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

/** `GET /friends` response. */
export const friendsListResponseSchema = z.object({
  friends: z.array(friendSummarySchema),
});
export type FriendsListResponse = z.infer<typeof friendsListResponseSchema>;
