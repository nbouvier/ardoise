import { and, eq, gt, isNull, lte } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import { sessions, users, type SessionRow, type UserRow } from '../../db/schema.js';

export interface UpsertUserInput {
  googleSub: string;
  email: string;
  name: string;
  picture: string | null;
}

export interface InsertSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

export interface AuthRepository {
  upsertUserByGoogleSub(input: UpsertUserInput): Promise<UserRow>;
  findUserById(id: string): Promise<UserRow | undefined>;
  insertSession(input: InsertSessionInput): Promise<void>;
  findSessionByHash(refreshTokenHash: string): Promise<SessionRow | undefined>;
  revokeSessionByHash(refreshTokenHash: string, at: Date): Promise<void>;
  /**
   * Atomically revoke the live session behind `refreshTokenHash` and insert
   * `next` in its place, for that session's user. `undefined` when no live
   * session matched: unknown, already revoked or expired. Of two concurrent
   * rotations of the same token, exactly one gets a session.
   */
  rotateSession(
    refreshTokenHash: string,
    at: Date,
    next: Omit<InsertSessionInput, 'userId'>,
  ): Promise<{ userId: string } | undefined>;
  /** Revoke every live session of a user; returns how many were. */
  revokeUserSessions(userId: string, at: Date): Promise<number>;
  /** Delete the sessions expired at `at`; returns how many were. */
  deleteExpiredSessions(at: Date): Promise<number>;
}

export function createAuthRepository(db: Database): AuthRepository {
  return {
    async upsertUserByGoogleSub(input) {
      const [row] = await db
        .insert(users)
        .values(input)
        .onConflictDoUpdate({
          target: users.googleSub,
          set: {
            email: input.email,
            name: input.name,
            picture: input.picture,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row!;
    },

    async findUserById(id) {
      // Accounts only: a placeholder member is stored alongside them but is
      // nobody to authenticate (`docs/specs/placeholder-members.md`).
      const [row] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), eq(users.kind, 'account')));
      return row;
    },

    async insertSession(input) {
      await db.insert(sessions).values(input);
    },

    async findSessionByHash(refreshTokenHash) {
      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.refreshTokenHash, refreshTokenHash));
      return row;
    },

    async revokeSessionByHash(refreshTokenHash, at) {
      await db
        .update(sessions)
        .set({ revokedAt: at })
        .where(
          and(eq(sessions.refreshTokenHash, refreshTokenHash), isNull(sessions.revokedAt)),
        );
    },

    async rotateSession(refreshTokenHash, at, next) {
      return db.transaction(async (tx) => {
        // The `revoked_at IS NULL` condition is the claim: a concurrent
        // rotation of the same token waits on the row lock, then matches nothing.
        const [claimed] = await tx
          .update(sessions)
          .set({ revokedAt: at, lastUsedAt: at })
          .where(
            and(
              eq(sessions.refreshTokenHash, refreshTokenHash),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, at),
            ),
          )
          .returning({ userId: sessions.userId });
        if (!claimed) {
          return undefined;
        }
        await tx.insert(sessions).values({ ...next, userId: claimed.userId });
        return { userId: claimed.userId };
      });
    },

    async revokeUserSessions(userId, at) {
      const revoked = await db
        .update(sessions)
        .set({ revokedAt: at })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      return revoked.length;
    },

    async deleteExpiredSessions(at) {
      const deleted = await db
        .delete(sessions)
        .where(lte(sessions.expiresAt, at))
        .returning({ id: sessions.id });
      return deleted.length;
    },
  };
}
