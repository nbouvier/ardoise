import { and, eq, isNull } from 'drizzle-orm';

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
  revokeSessionById(id: string, at: Date): Promise<void>;
  revokeSessionByHash(refreshTokenHash: string, at: Date): Promise<void>;
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

    async revokeSessionById(id, at) {
      await db
        .update(sessions)
        .set({ revokedAt: at })
        .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)));
    },

    async revokeSessionByHash(refreshTokenHash, at) {
      await db
        .update(sessions)
        .set({ revokedAt: at })
        .where(
          and(eq(sessions.refreshTokenHash, refreshTokenHash), isNull(sessions.revokedAt)),
        );
    },
  };
}
