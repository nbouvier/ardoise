import { aliasedTable, and, asc, eq, inArray, isNull, ne, notExists, or, sql } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import {
  deletedAccounts,
  friendships,
  groupMembers,
  groups,
  transactionParticipants,
  transactions,
  users,
} from '../../db/schema.js';

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
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
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

        // A transfer between this user and Others would become Others to
        // Others: not a valid transfer, and it moves nothing.
        const doomedTransfers = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .innerJoin(
            transactionParticipants,
            eq(transactionParticipants.transactionId, transactions.id),
          )
          .where(
            and(
              eq(transactions.kind, 'transfer'),
              or(
                and(eq(transactions.payerId, userId), isNull(transactionParticipants.userId)),
                and(isNull(transactions.payerId), eq(transactionParticipants.userId, userId)),
              ),
            ),
          );
        if (doomedTransfers.length > 0) {
          await tx.delete(transactions).where(
            inArray(
              transactions.id,
              doomedTransfers.map((row) => row.id),
            ),
          );
        }

        const anonymised = new Set<string>();

        // A transaction has at most one Others share: where it already has
        // one, the user's share is added to it rather than becoming a second.
        // Weights add up too (both set for a split by shares, both `NULL`
        // for a split by amounts).
        const others = aliasedTable(transactionParticipants, 'others');
        const merges = await tx
          .select({
            userRowId: transactionParticipants.id,
            othersRowId: others.id,
            transactionId: transactionParticipants.transactionId,
            shareCents: transactionParticipants.shareCents,
            weight: transactionParticipants.weight,
          })
          .from(transactionParticipants)
          .innerJoin(
            others,
            and(
              eq(others.transactionId, transactionParticipants.transactionId),
              isNull(others.userId),
            ),
          )
          .where(eq(transactionParticipants.userId, userId));
        for (const merge of merges) {
          await tx
            .update(transactionParticipants)
            .set({
              shareCents: sql`${transactionParticipants.shareCents} + ${merge.shareCents}`,
              weight:
                merge.weight === null
                  ? null
                  : sql`${transactionParticipants.weight} + ${merge.weight}`,
            })
            .where(eq(transactionParticipants.id, merge.othersRowId));
          anonymised.add(merge.transactionId);
        }
        if (merges.length > 0) {
          await tx.delete(transactionParticipants).where(
            inArray(
              transactionParticipants.id,
              merges.map((merge) => merge.userRowId),
            ),
          );
        }

        // Every other share, and every payment, becomes Others'.
        const shares = await tx
          .update(transactionParticipants)
          .set({ userId: null })
          .where(eq(transactionParticipants.userId, userId))
          .returning({ transactionId: transactionParticipants.transactionId });
        const payments = await tx
          .update(transactions)
          .set({ payerId: null })
          .where(eq(transactions.payerId, userId))
          .returning({ id: transactions.id });
        for (const row of shares) {
          anonymised.add(row.transactionId);
        }
        for (const row of payments) {
          anonymised.add(row.id);
        }

        // Leave every remaining group. Where the user was the owner, the
        // member who joined earliest takes over (id breaks a tie, so the
        // choice is stable); a group left with nobody in it is deleted, and
        // its sub-groups are necessarily empty too.
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
                    .where(eq(groupMembers.groupId, groups.id)),
                ),
              ),
            )
            .returning({ id: groups.id });
          groupsDeleted = emptied.length;
        }

        await tx.insert(deletedAccounts).values({ userId }).onConflictDoNothing();

        // Sessions and invitations cascade; who recorded a transaction is
        // set to `NULL`. A payer or a share still naming the user would make
        // this fail rather than cascade (`ON DELETE RESTRICT`).
        await tx.delete(users).where(eq(users.id, userId));

        return {
          friendshipsRemoved: removedFriendships.length,
          groupsLeft: left.length,
          ownershipsPassed,
          groupsDeleted,
          transactionsAnonymised: anonymised.size,
          transfersDeleted: doomedTransfers.length,
        };
      });
    },

    async recordDeleted(userId) {
      await db.insert(deletedAccounts).values({ userId }).onConflictDoNothing();
    },
  };
}
