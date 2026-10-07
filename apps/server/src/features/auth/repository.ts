import { and, eq, gt, isNull, lte, ne, sql } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import {
  emailCodes,
  sessions,
  users,
  type EmailCodePurpose,
  type EmailCodeRow,
  type NewEmailCodeRow,
  type SessionRow,
  type UserRow,
} from '../../db/schema.js';

export interface GoogleAccountInput {
  googleSub: string;
  email: string;
  name: string;
  picture: string | null;
}

/**
 * How a Google sign-in found its account: by its Google identity, by its
 * address (Google is now linked to it), or not at all (created).
 */
export type GoogleAccountOutcome = 'existing' | 'linked' | 'created';

/**
 * A Google identity whose verified address belongs to an account already
 * linked to another Google identity: neither can be told to be the owner.
 */
export class GoogleAccountConflictError extends Error {
  constructor(readonly userId: string) {
    super('The address belongs to an account linked to another Google identity');
    this.name = 'GoogleAccountConflictError';
  }
}

/** The account with this address, whatever its case (`users_email_unique`). */
function accountWithEmail(email: string) {
  return and(eq(users.kind, 'account'), sql`lower(${users.email}) = lower(${email})`);
}

export interface InsertSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

export interface AuthRepository {
  /**
   * The account a Google sign-in reaches, refreshing its name and picture:
   * the one with this Google identity, else the one with this address (linking
   * Google to it), else a new one. The address follows Google's unless another
   * account has it. Throws `GoogleAccountConflictError` when the address's
   * account is linked to another Google identity.
   */
  signInGoogleAccount(
    input: GoogleAccountInput,
  ): Promise<{ user: UserRow; outcome: GoogleAccountOutcome }>;
  findUserById(id: string): Promise<UserRow | undefined>;
  /** The account with this address, whatever its case. */
  findAccountByEmail(email: string): Promise<UserRow | undefined>;
  setPasswordHash(userId: string, passwordHash: string): Promise<UserRow>;
  insertPasswordAccount(input: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<UserRow>;
  /** Store a code for its address and purpose, replacing the one already there. */
  saveEmailCode(input: NewEmailCodeRow): Promise<void>;
  /**
   * Spend one attempt on the live code for this address and purpose, and
   * return it to be checked. `undefined` when there is none: never asked
   * for, entered already, expired, or out of attempts. Concurrent tries each
   * spend their own attempt, so the limit holds.
   */
  claimEmailCodeAttempt(
    purpose: EmailCodePurpose,
    email: string,
    at: Date,
  ): Promise<EmailCodeRow | undefined>;
  /** Use a code up; `false` when another request used it first. */
  deleteEmailCode(id: string): Promise<boolean>;
  /** Delete the codes expired at `at`; returns how many were. */
  deleteExpiredEmailCodes(at: Date): Promise<number>;
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
  /**
   * Delete every session of a user. Unlike revoking, which keeps the rows so a
   * revoked token coming back is caught as theft, a deleted token is merely
   * unknown: the right outcome when the sessions end on purpose.
   */
  deleteUserSessions(userId: string): Promise<void>;
  /** Delete the sessions expired at `at`; returns how many were. */
  deleteExpiredSessions(at: Date): Promise<number>;
}

export function createAuthRepository(db: Database): AuthRepository {
  return {
    async signInGoogleAccount(input) {
      return db.transaction(async (tx) => {
        const profile = { name: input.name, picture: input.picture, updatedAt: new Date() };

        const [bySub] = await tx.select().from(users).where(eq(users.googleSub, input.googleSub));
        if (bySub) {
          const [holder] = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(accountWithEmail(input.email), ne(users.id, bySub.id)));
          const [row] = await tx
            .update(users)
            .set(holder ? profile : { ...profile, email: input.email })
            .where(eq(users.id, bySub.id))
            .returning();
          return { user: row!, outcome: 'existing' as const };
        }

        // Google has verified the address: it may claim the account that has it.
        const [byEmail] = await tx.select().from(users).where(accountWithEmail(input.email));
        if (byEmail) {
          if (byEmail.googleSub !== null) {
            throw new GoogleAccountConflictError(byEmail.id);
          }
          const [row] = await tx
            .update(users)
            .set({ ...profile, googleSub: input.googleSub })
            .where(eq(users.id, byEmail.id))
            .returning();
          return { user: row!, outcome: 'linked' as const };
        }

        const [row] = await tx.insert(users).values(input).returning();
        return { user: row!, outcome: 'created' as const };
      });
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

    async findAccountByEmail(email) {
      const [row] = await db.select().from(users).where(accountWithEmail(email));
      return row;
    },

    async setPasswordHash(userId, passwordHash) {
      const [row] = await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      return row!;
    },

    async insertPasswordAccount(input) {
      const [row] = await db.insert(users).values(input).returning();
      return row!;
    },

    async saveEmailCode(input) {
      await db
        .insert(emailCodes)
        .values(input)
        .onConflictDoUpdate({
          target: [emailCodes.purpose, emailCodes.email],
          set: {
            userId: input.userId ?? null,
            codeHash: input.codeHash,
            attemptsLeft: input.attemptsLeft,
            name: input.name ?? null,
            passwordHash: input.passwordHash ?? null,
            expiresAt: input.expiresAt,
            createdAt: new Date(),
          },
        });
    },

    async claimEmailCodeAttempt(purpose, email, at) {
      const [row] = await db
        .update(emailCodes)
        .set({ attemptsLeft: sql`${emailCodes.attemptsLeft} - 1` })
        .where(
          and(
            eq(emailCodes.purpose, purpose),
            eq(emailCodes.email, email),
            gt(emailCodes.attemptsLeft, 0),
            gt(emailCodes.expiresAt, at),
          ),
        )
        .returning();
      return row;
    },

    async deleteEmailCode(id) {
      const deleted = await db
        .delete(emailCodes)
        .where(eq(emailCodes.id, id))
        .returning({ id: emailCodes.id });
      return deleted.length > 0;
    },

    async deleteExpiredEmailCodes(at) {
      const deleted = await db
        .delete(emailCodes)
        .where(lte(emailCodes.expiresAt, at))
        .returning({ id: emailCodes.id });
      return deleted.length;
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

    async deleteUserSessions(userId) {
      await db.delete(sessions).where(eq(sessions.userId, userId));
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
