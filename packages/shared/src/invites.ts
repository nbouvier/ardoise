import { z } from 'zod';

import { friendSummarySchema } from './friends.js';
import { groupInvitePreviewSchema, groupSummarySchema } from './groups.js';

/**
 * What an invitation leads to. There is a **single code space**: the client
 * captures `ardoise://invite/<code>` without knowing what it is for, and the
 * server says. That is why one landing page and one pair of public routes serve
 * both friendships and groups.
 */
export const inviteKindSchema = z.enum(['friend', 'group']);
export type InviteKind = z.infer<typeof inviteKindSchema>;

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
 * An active invitation. `url` is the shareable link; `code` is the same
 * capability in a form that can be typed by hand when the link could not carry
 * it (app not installed yet).
 */
export const inviteSchema = z.object({
  code: inviteCodeSchema,
  url: z.url(),
  expiresAt: z.iso.datetime(),
});
export type Invite = z.infer<typeof inviteSchema>;

/** Response of every route that issues or returns an active invitation. */
export const inviteResponseSchema = z.object({ invite: inviteSchema });
export type InviteResponse = z.infer<typeof inviteResponseSchema>;

/**
 * What `GET /invites/:code` discloses — to anyone holding the code, without
 * authentication. The recipient must know who is inviting them, and into what,
 * before deciding to sign in.
 */
export const invitePreviewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('friend'), inviter: friendSummarySchema }),
  z.object({
    kind: z.literal('group'),
    inviter: friendSummarySchema,
    group: groupInvitePreviewSchema,
  }),
]);
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

export const invitePreviewResponseSchema = z.object({ invite: invitePreviewSchema });
export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;

/**
 * What accepting produced. The `already*` flags let the client say "you were
 * already there" instead of celebrating twice; accepting is idempotent, so both
 * a first and a repeated acceptance succeed.
 */
export const acceptInviteResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('friend'),
    friend: friendSummarySchema,
    alreadyFriends: z.boolean(),
  }),
  z.object({
    kind: z.literal('group'),
    group: groupSummarySchema,
    alreadyMember: z.boolean(),
  }),
]);
export type AcceptInviteResult = z.infer<typeof acceptInviteResultSchema>;

export const acceptInviteResponseSchema = z.object({ result: acceptInviteResultSchema });
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>;
