import { and, asc, eq, inArray, ne, notExists, or, sql } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import { deletedAccounts, friendships, groupMembers, groups, users } from '../../db/schema.js';
import { replaceParty } from '../transactions/replace-party.js';

/** What one account deletion touched — counts only, for the log. */
export interface DeletionSummary {
  friendshipsRemoved: number;
  groupsLeft: number;
  ownershipsPassed: number;
  groupsDeleted: number;
  transactionsAnonymised: number;
  transfersDeleted: number;
}

/** A group the user belongs to, named the way they see it. */
export interface MembershipGroup {
  groupId: string;
  kind: 'standard' | 'pair';
  name: string;
}

export interface AccountRepository {
  /** Every group `userId` belongs to, pair groups named after the friend. */
  listMembershipGroups(userId: string): Promise<MembershipGroup[]>;
  countFriendships(userId: string): Promise<number>;
  /**
   * Delete the account, all at once (`docs/specs/account-deletion.md`).
   * `null` when there is no such user — nothing is touched then.
   */
  deleteAccount(userId: string): Promise<DeletionSummary | null>;
  /**
   * List `userId` among the deleted accounts without anything else: for an
   * id the operator re-applies that is already gone from this database.
   */
  recordDeleted(userId: string): Promise<void>;
}

/**
 * Account deletion is the one operation that writes to every feature's
 * tables at once — friendships, groups, memberships, transactions — and must
 * do it in a single database transaction, so it is written here against the
 * schema rather than composed from the other features' services: each of
 * those opens its own transaction and enforces rules meant for a member
 * acting in the app (an owner cannot leave, a transfer cannot be Others to
 * Others) that deletion deliberately goes around. See `docs/ARCHITECTURE.md`.
 */
export function createAccountRepository(db: Database): AccountRepository {
  return {
    async listMembershipGroups(userId) {
      const own = await db
        .select({ groupId: groups.id, kind: groups.kind, name: groups.name })
        .from(groupMembers)
        .innerJoin(groups, eq(groups.id, groupMembers.groupId))
        .where(eq(groupMembers.userId, userId));

      // A pair group has no name of its own: it is named after the friend.
      const pairIds = own.filter((group) => group.kind === 'pair').map((group) => group.groupId);
      const friendNames = new Map<string, string>();
      if (pairIds.length > 0) {
        const friends = await db
          .select({ groupId: groupMembers.groupId, name: users.name })
          .from(groupMembers)
          .innerJoin(users, eq(users.id, groupMembers.userId))
          .where(and(inArray(groupMembers.groupId, pairIds), ne(groupMembers.userId, userId)));
        for (const friend of friends) {
          friendNames.set(friend.groupId, friend.name);
        }
      }

      return own.map((group) => ({
        groupId: group.groupId,
        kind: group.kind as 'standard' | 'pair',
        name: group.name ?? friendNames.get(group.groupId) ?? 'Shared expenses',
      }));
    },

    async countFriendships(userId) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(friendships)
        .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)));
      return Number(row?.count ?? 0);
    },

    async deleteAccount(userId) {
      return db.transaction(async (tx) => {
        // Locked first: a transaction naming this user that is being written
        // right now finishes before we go on (and is anonymised with the
        // rest), and one that starts after waits, then fails on the missing
        // user instead of naming an account that no longer exists.
        // Accounts only: a placeholder's id is not an account to delete.
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, userId), eq(users.kind, 'account')))
          .for('update');
        if (!user) {
          return null;
        }

        // Each friendship takes its pair group with it, and that group's
        // sub-groups and transactions (`groups.friendship_id`,
        // `groups.parent_id` and `transactions.group_id` cascade).
        const removedFriendships = await tx
          .delete(friendships)
          .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)))
          .returning({ id: friendships.id });

        // Every share and payment becomes Others' — a transfer with Others
        // at its other end, which would run from Others to Others, is deleted.
        const { transactionsRewritten, transfersDeleted } = await replaceParty(tx, userId, null);

        // Leave every remaining group. Where the user was the owner, the
        // member with an account who joined earliest takes over (id breaks a
        // tie, so the choice is stable) — never a placeholder; a group left
        // with no account in it is deleted with its placeholders, and its
        // sub-groups are necessarily in the same state
        // (`docs/specs/placeholder-members.md`).
        const left = await tx
          .delete(groupMembers)
          .where(eq(groupMembers.userId, userId))
          .returning({ groupId: groupMembers.groupId, role: groupMembers.role });
        const ownedIds = left.filter((row) => row.role === 'owner').map((row) => row.groupId);

        let ownershipsPassed = 0;
        if (ownedIds.length > 0) {
          const heirs = await tx
            .selectDistinctOn([groupMembers.groupId], { id: groupMembers.id })
            .from(groupMembers)
            .innerJoin(users, and(eq(users.id, groupMembers.userId), eq(users.kind, 'account')))
            .where(inArray(groupMembers.groupId, ownedIds))
            .orderBy(groupMembers.groupId, asc(groupMembers.joinedAt), asc(groupMembers.id));
          if (heirs.length > 0) {
            await tx
              .update(groupMembers)
              .set({ role: 'owner' })
              .where(
                inArray(
                  groupMembers.id,
                  heirs.map((heir) => heir.id),
                ),
              );
          }
          ownershipsPassed = heirs.length;
        }

        let groupsDeleted = 0;
        if (left.length > 0) {
          const emptied = await tx
            .delete(groups)
            .where(
              and(
                inArray(
                  groups.id,
                  left.map((row) => row.groupId),
                ),
                notExists(
                  tx
                    .select({ id: groupMembers.id })
                    .from(groupMembers)
                    .innerJoin(users, eq(users.id, groupMembers.userId))
                    .where(and(eq(groupMembers.groupId, groups.id), eq(users.kind, 'account'))),
                ),
              ),
            )
            .returning({ id: groups.id });
          groupsDeleted = emptied.length;
        }

        await tx.insert(deletedAccounts).values({ userId }).onConflictDoNothing();

        // Sessions and invitations cascade; who recorded a transaction is
        // set to `NULL`. A payer or a share still naming the user would make
        // this fail at commit rather than cascade (the foreign keys are
        // checked, deferred, `docs/DATABASE.md`).
        await tx.delete(users).where(eq(users.id, userId));

        return {
          friendshipsRemoved: removedFriendships.length,
          groupsLeft: left.length,
          ownershipsPassed,
          groupsDeleted,
          transactionsAnonymised: transactionsRewritten,
          transfersDeleted,
        };
      });
    },

    async recordDeleted(userId) {
      await db.insert(deletedAccounts).values({ userId }).onConflictDoNothing();
    },
  };
}
