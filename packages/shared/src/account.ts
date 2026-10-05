import { z } from 'zod';

import { groupKindSchema } from './groups.js';

/**
 * A group where the caller's own balance is not zero: what deleting the
 * account would lose there (`docs/specs/account-deletion.md`). Positive means
 * the group owes the caller, as everywhere else.
 */
export const deletionBalanceSchema = z.object({
  groupId: z.uuid(),
  kind: groupKindSchema,
  /** A standard group's own name; the friend's name for a pair group. */
  name: z.string().min(1),
  balanceCents: z.number().int(),
});
export type DeletionBalance = z.infer<typeof deletionBalanceSchema>;

/** `GET /me/deletion-preview` — what the Delete account page shows before anything is deleted. */
export const accountDeletionPreviewSchema = z.object({
  /** Each friendship ends, and the group shared with that friend is deleted with it. */
  friendCount: z.number().int().nonnegative(),
  /** Every group the caller belongs to where their balance is not zero, highest first. */
  balances: z.array(deletionBalanceSchema),
});
export type AccountDeletionPreview = z.infer<typeof accountDeletionPreviewSchema>;
