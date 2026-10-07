import type { FriendSummary } from '@ardoise/shared';
import { inArray, eq } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import { users, type UserRow } from '../../db/schema.js';

/**
 * The columns {@link toUserSummary} reads — what a query naming other people
 * selects, rather than whole rows carrying their e-mail and Google identity.
 */
export const userSummaryColumns = {
  id: users.id,
  name: users.name,
  picture: users.picture,
  kind: users.kind,
};

export type UserSummaryRow = Pick<UserRow, keyof typeof userSummaryColumns>;

/**
 * How another user is exposed anywhere in the API: an inviter, a friend, a
 * group member. Deliberately narrower than the `UserProfile` returned for
 * oneself — no email address.
 */
export function toUserSummary(user: UserSummaryRow): FriendSummary {
  const summary: FriendSummary = { id: user.id, name: user.name, picture: user.picture };
  // Only ever present, and `true`, for a member known by name only
  // (`docs/specs/placeholder-members.md`).
  if (user.kind === 'placeholder') {
    summary.placeholder = true;
  }
  return summary;
}

export interface UsersRepository {
  findById(id: string): Promise<UserRow | undefined>;
  /** Reads several users' summary columns at once; order is not guaranteed. */
  findSummariesByIds(ids: readonly string[]): Promise<UserSummaryRow[]>;
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

    async findSummariesByIds(ids) {
      if (ids.length === 0) {
        return [];
      }
      return db
        .select(userSummaryColumns)
        .from(users)
        .where(inArray(users.id, [...ids]));
    },
  };
}
