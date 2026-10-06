import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';

import type { Database, DatabaseTransaction } from '../../db/client.js';
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
  /**
   * The target's usable invitation (not revoked, not expired), inserting
   * `input` when there is none. Concurrent calls for one target all get the
   * same invitation.
   */
  findOrInsertActive(input: InsertInviteInput, now: Date): Promise<InviteRow>;
  findByCode(code: string): Promise<InviteRow | undefined>;
  /**
   * Revoke the target's invitations and insert `input`. Concurrent calls for
   * one target leave exactly one usable invitation.
   */
  replaceActive(input: InsertInviteInput, at: Date): Promise<InviteRow>;
  revokeActive(target: InviteTarget, at: Date): Promise<void>;
  /** Delete the invitations revoked, or expired, before `before`; returns how many. */
  deleteStale(before: Date): Promise<number>;
}

/** The columns identifying the invitations of one target. */
function matchesTarget(target: InviteTarget) {
  return target.kind === 'friend'
    ? and(eq(invites.kind, 'friend'), eq(invites.inviterId, target.inviterId))
    : and(eq(invites.kind, 'group'), eq(invites.groupId, target.groupId));
}

/**
 * Serialise the writes to one target's invitations until `tx` ends: without
 * it, two concurrent requests both find no active invitation (or both revoke
 * the same one) and each inserts its own, leaving two usable links.
 */
async function lockTarget(tx: DatabaseTransaction, target: InviteTarget): Promise<void> {
  const key = target.kind === 'friend' ? target.inviterId : target.groupId;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invite:${target.kind}:${key}`}))`);
}

async function insertInvite(tx: DatabaseTransaction, input: InsertInviteInput): Promise<InviteRow> {
  const [row] = await tx
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
}

export function createInvitesRepository(db: Database): InvitesRepository {
  return {
    async findOrInsertActive(input, now) {
      return db.transaction(async (tx) => {
        await lockTarget(tx, input.target);
        const [active] = await tx
          .select()
          .from(invites)
          .where(
            and(
              matchesTarget(input.target),
              isNull(invites.revokedAt),
              gt(invites.expiresAt, now),
            ),
          );
        return active ?? insertInvite(tx, input);
      });
    },

    async findByCode(code) {
      const [row] = await db.select().from(invites).where(eq(invites.code, code));
      return row;
    },

    async replaceActive(input, at) {
      return db.transaction(async (tx) => {
        await lockTarget(tx, input.target);
        await tx
          .update(invites)
          .set({ revokedAt: at })
          .where(and(matchesTarget(input.target), isNull(invites.revokedAt)));
        return insertInvite(tx, input);
      });
    },

    async revokeActive(target, at) {
      await db
        .update(invites)
        .set({ revokedAt: at })
        .where(and(matchesTarget(target), isNull(invites.revokedAt)));
    },

    async deleteStale(before) {
      const deleted = await db
        .delete(invites)
        .where(or(lt(invites.revokedAt, before), lt(invites.expiresAt, before)))
        .returning({ id: invites.id });
      return deleted.length;
    },
  };
}
