import { z } from 'zod';

/**
 * How another user is exposed: the inviter on a public invitation preview, and
 * every entry of a friend list. Deliberately narrower than `UserProfile` (which
 * describes *oneself*) — it carries no email address.
 */
export const friendSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  picture: z.url().nullable(),
});
export type FriendSummary = z.infer<typeof friendSummarySchema>;

/**
 * An invitation code. Opaque, 128 bits of randomness encoded as base64url. Used
 * to validate route parameters on the server and manually typed codes on the
 * client.
 */
export const inviteCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{16,64}$/, 'invalid invitation code');

/**
 * The caller's active invitation. `url` is the shareable link; `code` is the
 * same capability in a form that can be typed by hand when the link could not
 * carry it (app not installed yet).
 */
export const friendInviteSchema = z.object({
  code: inviteCodeSchema,
  url: z.url(),
  expiresAt: z.iso.datetime(),
});
export type FriendInvite = z.infer<typeof friendInviteSchema>;

/** `POST /friends/invite` and `POST /friends/invite/rotate` response. */
export const friendInviteResponseSchema = z.object({
  invite: friendInviteSchema,
});
export type FriendInviteResponse = z.infer<typeof friendInviteResponseSchema>;

/** `GET /friends/invites/:code` response — who is inviting. Unauthenticated. */
export const invitePreviewResponseSchema = z.object({
  inviter: friendSummarySchema,
});
export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;

/**
 * `POST /friends/invites/:code/accept` response. `alreadyFriends` is true when
 * the relationship existed before this call, so the client can say so instead
 * of celebrating twice.
 */
export const acceptInviteResponseSchema = z.object({
  friend: friendSummarySchema,
  alreadyFriends: z.boolean(),
});
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>;

/** `GET /friends` response. */
export const friendsListResponseSchema = z.object({
  friends: z.array(friendSummarySchema),
});
export type FriendsListResponse = z.infer<typeof friendsListResponseSchema>;
