import { and, eq, gt, isNull } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import { invites, type InviteRow } from '../../db/schema.js';

/**
 * What an invitation leads to. A friend invitation is scoped to its inviter —
 * one active link per person; a group invitation is scoped to the group — one
 * active link per group, whoever created it.
 */
export type InviteTarget =
  | { kind: 'friend'; inviterId: string }
  | { kind: 'group'; groupId: string };

export interface InsertInviteInput {
  target: InviteTarget;
  inviterId: string;
  code: string;
  expiresAt: Date;
}

export interface InvitesRepository {
  /** The target's usable invitation (not revoked, not expired), if any. */
  findActive(target: InviteTarget, now: Date): Promise<InviteRow | undefined>;
  findByCode(code: string): Promise<InviteRow | undefined>;
  insert(input: InsertInviteInput): Promise<InviteRow>;
  revokeActive(target: InviteTarget, at: Date): Promise<void>;
}

/** The columns identifying the invitations of one target. */
function matchesTarget(target: InviteTarget) {
  return target.kind === 'friend'
    ? and(eq(invites.kind, 'friend'), eq(invites.inviterId, target.inviterId))
    : and(eq(invites.kind, 'group'), eq(invites.groupId, target.groupId));
}

export function createInvitesRepository(db: Database): InvitesRepository {
  return {
    async findActive(target, now) {
      const [row] = await db
        .select()
        .from(invites)
        .where(
          and(
            matchesTarget(target),
            isNull(invites.revokedAt),
            gt(invites.expiresAt, now),
          ),
        );
      return row;
    },

    async findByCode(code) {
      const [row] = await db.select().from(invites).where(eq(invites.code, code));
      return row;
    },

    async insert(input) {
      const [row] = await db
        .insert(invites)
        .values({
          kind: input.target.kind,
          inviterId: input.inviterId,
          groupId: input.target.kind === 'group' ? input.target.groupId : null,
          code: input.code,
          expiresAt: input.expiresAt,
        })
        .returning();
      return row!;
    },

    async revokeActive(target, at) {
      await db
        .update(invites)
        .set({ revokedAt: at })
        .where(and(matchesTarget(target), isNull(invites.revokedAt)));
    },
  };
}
