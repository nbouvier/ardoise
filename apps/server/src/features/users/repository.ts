import type { FriendSummary } from '@ardoise/shared';
import { inArray, eq } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import { users, type UserRow } from '../../db/schema.js';

/**
 * How another user is exposed anywhere in the API: an inviter, a friend, a
 * group member. Deliberately narrower than the `UserProfile` returned for
 * oneself — no email address.
 */
export function toUserSummary(user: UserRow): FriendSummary {
  return { id: user.id, name: user.name, picture: user.picture };
}

export interface UsersRepository {
  findById(id: string): Promise<UserRow | undefined>;
  /** Reads several users at once; order is not guaranteed. */
  findManyByIds(ids: readonly string[]): Promise<UserRow[]>;
}

/**
 * Read access to `users`, which is shared domain data: the auth feature owns
 * the writes, every other feature reads through here rather than reaching into
 * auth's own repository.
 */
export function createUsersRepository(db: Database): UsersRepository {
  return {
    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row;
    },

    async findManyByIds(ids) {
      if (ids.length === 0) {
        return [];
      }
      return db
        .select()
        .from(users)
        .where(inArray(users.id, [...ids]));
    },
  };
}
