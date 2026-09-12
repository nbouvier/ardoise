import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
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

/**
 * A space shared by a set of people, and later the expenses they record in it.
 *
 * `kind = 'standard'` is a group someone created and named. `kind = 'pair'` is
 * the implicit group two friends share: it carries no name (the API returns the
 * other member's name), it is never listed, and it is keyed by the friendship
 * itself — so the database guarantees exactly one per pair and takes it away
 * with the friendship.
 *
 * A standard group can have sub-groups, nested through `parent_id`, up to five
 * levels deep (`depth` 0..4). The parent is fixed at creation — there is no
 * re-parenting — which keeps the tree acyclic by construction and every tree
 * computation (membership propagation, effective-archive, balance and
 * statistics roll-up) a bounded walk instead of an open-ended graph problem. A
 * pair group can neither have a parent nor be one. See `docs/specs/groups.md`.
 */
export const groups = pgTable(
  'groups',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    kind: text('kind').notNull().default('standard'),
    name: text('name'),
    friendshipId: uuid('friendship_id')
      .unique()
      .references(() => friendships.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => groups.id, {
      onDelete: 'cascade',
    }),
    depth: integer('depth').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('groups_kind_valid', sql`${table.kind} in ('standard', 'pair')`),
    // The two shapes are exclusive: a pair group is the one keyed by a
    // friendship, and only a standard group carries a name.
    check(
      'groups_pair_shape',
      sql`(${table.kind} = 'pair') = (${table.friendshipId} is not null)`,
    ),
    check(
      'groups_standard_named',
      sql`(${table.kind} = 'standard') = (${table.name} is not null)`,
    ),
    // A pair group is always a root: it can never be nested nor have children
    // point at it (the latter is a foreign-key concern, enforced in service —
    // see assertNotPairGroup's use as a parent guard).
    check('groups_pair_no_parent', sql`${table.kind} <> 'pair' or ${table.parentId} is null`),
    check('groups_root_depth', sql`(${table.parentId} is null) = (${table.depth} = 0)`),
    check('groups_depth_valid', sql`${table.depth} between 0 and 4`),
    index('groups_parent_id_idx').on(table.parentId),
  ],
);

/**
 * Who belongs to a group, and with which rights. A membership row is the *only*
 * thing that grants access to a group: every route resolves it before anything
 * else. The creator is the `owner`; only an owner may delete the group.
 */
export const groupMembers = pgTable(
  'group_members',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('group_members_unique').on(table.groupId, table.userId),
    check('group_members_role_valid', sql`${table.role} in ('owner', 'member')`),
    index('group_members_user_id_idx').on(table.userId),
  ],
);

/**
 * A shareable invitation. One table for every kind of invitation on purpose:
 * the code space is shared, so a single link format, a single landing page and
 * a single pair of public routes serve friendships and groups alike.
 *
 * `kind = 'friend'` invites into a friendship with `inviter_id`; `kind =
 * 'group'` invites into `group_id`. Unlike a refresh token the code is stored
 * in clear — it must be redisplayable ("copy my link again") and only grants a
 * narrow, expiring, revocable capability that still requires the recipient to
 * accept. See `docs/specs/friends-and-invitations.md`.
 */
export const invites = pgTable(
  'invites',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    kind: text('kind').notNull(),
    inviterId: uuid('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    check('invites_kind_valid', sql`${table.kind} in ('friend', 'group')`),
    check(
      'invites_target_shape',
      sql`(${table.kind} = 'group') = (${table.groupId} is not null)`,
    ),
    index('invites_inviter_id_idx').on(table.inviterId),
    index('invites_group_id_idx').on(table.groupId),
  ],
);

/**
 * An expense, income or transfer recorded in a group. `kind = 'expense'` — the
 * payer spent on behalf of the people it concerns. `kind = 'income'` — the
 * reverse: the payer received on their behalf. `kind = 'transfer'` — one
 * member reimburses another for the full amount, via a single row in
 * `transaction_participants`.
 *
 * `amount_cents` and every participant's `share_cents` are integer cents;
 * `Σ share_cents = amount_cents` is the core invariant, enforced by the
 * service (not expressible as a single-row `CHECK`). Any member of the group
 * can record, edit or delete any transaction — no per-transaction ownership.
 * See `docs/specs/transactions.md`.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    amountCents: integer('amount_cents').notNull(),
    // A calendar date, not an instant: "the meal on the 3rd" should not shift
    // by a day depending on time zone.
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    comment: text('comment'),
    // A fixed, closed preset list (`@splitcount/shared`'s categories.ts) kept
    // in code, not a table — nothing creates, renames or reorders one today.
    // This CHECK is the one place that list is duplicated; keep both in sync.
    // Always set — an uncategorised transaction is recorded as 'other'.
    category: text('category').notNull().default('other'),
    payerId: uuid('payer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    splitMode: text('split_mode').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('transactions_kind_valid', sql`${table.kind} in ('expense', 'income', 'transfer')`),
    check('transactions_split_mode_valid', sql`${table.splitMode} in ('shares', 'amount')`),
    check('transactions_amount_positive', sql`${table.amountCents} > 0`),
    check(
      'transactions_category_valid',
      sql`${table.category} in (
        'groceries', 'restaurant', 'leisure', 'housing', 'transport', 'travel',
        'health', 'shopping', 'bills', 'gifts', 'education', 'pets', 'other'
      )`,
    ),
    index('transactions_group_id_occurred_on_idx').on(table.groupId, table.occurredOn),
    index('transactions_payer_id_idx').on(table.payerId),
  ],
);

/**
 * One member's share of a transaction. For `shares` mode, `weight` is the
 * input and `share_cents` is the computed, rounded output; for `amount` mode
 * (including every transfer, stored as a single row), `weight` is `NULL` and
 * `share_cents` is the input directly.
 *
 * References the user, not their membership row: a transaction outlives a
 * participant leaving the group, so history does not rewrite itself.
 */
export const transactionParticipants = pgTable(
  'transaction_participants',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    shareCents: integer('share_cents').notNull(),
    weight: integer('weight'),
  },
  (table) => [
    unique('transaction_participants_unique').on(table.transactionId, table.userId),
    check('transaction_participants_share_non_negative', sql`${table.shareCents} >= 0`),
    check(
      'transaction_participants_weight_positive',
      sql`${table.weight} is null or ${table.weight} > 0`,
    ),
    index('transaction_participants_user_id_idx').on(table.userId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type FriendshipRow = typeof friendships.$inferSelect;
export type NewFriendshipRow = typeof friendships.$inferInsert;
export type GroupRow = typeof groups.$inferSelect;
export type NewGroupRow = typeof groups.$inferInsert;
export type GroupMemberRow = typeof groupMembers.$inferSelect;
export type NewGroupMemberRow = typeof groupMembers.$inferInsert;
export type InviteRow = typeof invites.$inferSelect;
export type NewInviteRow = typeof invites.$inferInsert;
export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
export type TransactionParticipantRow = typeof transactionParticipants.$inferSelect;
export type NewTransactionParticipantRow = typeof transactionParticipants.$inferInsert;
