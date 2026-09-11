import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * A person who has signed in with Google. Identified across sign-ins by the
 * stable Google subject id (`sub`). Only the minimum profile fields are stored.
 */
export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  picture: text('picture'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A refresh-token session. One row per issued refresh token; rotation revokes
 * the old row and inserts a new one. Only a hash of the token is stored, so a
 * database leak does not expose usable tokens.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

/**
 * A shareable invitation to become someone's friend. One active row per
 * inviter: rotating an invite revokes the previous one. Unlike a refresh token
 * the code is stored in clear — it must be redisplayable ("copy my link again")
 * and only grants a narrow, expiring, revocable capability that still requires
 * the recipient to accept. See `docs/specs/friends-and-invitations.md`.
 */
export const friendInvites = pgTable(
  'friend_invites',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    inviterId: uuid('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('friend_invites_inviter_id_idx').on(table.inviterId)],
);

/**
 * A symmetric friendship, stored once per pair. The two columns always hold the
 * pair in a canonical order (`user_a_id` < `user_b_id`), so the unique
 * constraint alone makes a duplicate — including under concurrent acceptance —
 * impossible.
 */
export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userAId: uuid('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: uuid('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('friendships_pair_unique').on(table.userAId, table.userBId),
    check('friendships_distinct_users', sql`${table.userAId} <> ${table.userBId}`),
    index('friendships_user_b_id_idx').on(table.userBId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type FriendInviteRow = typeof friendInvites.$inferSelect;
export type NewFriendInviteRow = typeof friendInvites.$inferInsert;
export type FriendshipRow = typeof friendships.$inferSelect;
export type NewFriendshipRow = typeof friendships.$inferInsert;
