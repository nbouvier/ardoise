# Database

Living document. Update it with every schema decision and migration.

## Ownership

The database is owned exclusively by `apps/server`. The mobile client never connects to
it and never sees connection strings or credentials.

## Chosen stack

- **PostgreSQL** as the store.
- **Drizzle ORM** with **drizzle-kit** as the migration mechanism.
- In local development and tests, an embedded **PGlite** database is used instead of a
  real Postgres server — same SQL dialect, no external service. The driver is selected at
  runtime: `DATABASE_URL` set → `node-postgres`; unset → PGlite
  (`apps/server/src/db/client.ts`).

## Configuration

| Variable          | Purpose                                                             |
| ----------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`    | Postgres connection string. Unset → embedded PGlite. **Required when `NODE_ENV=production`**: the server refuses to start without it (an in-memory database would lose every write at the next restart). |
| `PGLITE_DATA_DIR` | Directory for the PGlite data in development (default `.pglite`, git-ignored). |

## Migrations

SQL migrations live in `apps/server/drizzle/` and are generated from the schema in
`apps/server/src/db/schema.ts`.

```bash
npm run migrate:generate --workspace @ardoise/server   # generate a migration from schema changes
npm run migrate --workspace @ardoise/server            # apply pending migrations (needs DATABASE_URL)
```

- `migrate:generate` only reads the schema file; no database needed.
- **Development and tests:** the server applies pending migrations itself on startup
  (embedded PGlite, or whatever `DATABASE_URL` points at when `NODE_ENV=development`).
- **Production:** the server never migrates. A release step runs
  `npm run migrate:deploy --workspace @ardoise/server` (`node dist/scripts/migrate.js`
  from the built output, which has no drizzle-kit) **once** per release, and the server
  refuses to start while a migration is pending. See "Database migrations" in
  `docs/DEPLOYMENT.md`. `npm run migrate` (drizzle-kit) stays for a developer's machine.
- Tests apply migrations to a fresh in-memory PGlite per test file
  (`src/test/database.ts`).
- All schema changes go through drizzle-kit migrations — never ad-hoc edits.
- Each migration should leave the schema valid and be reversible where practical.
- **Write migrations so the previous release still works on the new schema** (expand
  first, contract in a later release): add a column nullable or with a default rather
  than renaming or dropping one in the same step. The release step migrates *before*
  the new containers start, so the old version serves traffic against the new schema for
  a moment, and a rollback to the previous image runs old code on the new schema. A
  breaking change is split in two releases.

## Schema

### `users`

A person who has signed in with Google.

| Column       | Type          | Notes                                    |
| ------------ | ------------- | ---------------------------------------- |
| `id`         | uuid PK       | `gen_random_uuid()`                      |
| `google_sub` | text, unique  | Stable Google subject id; sign-in lookup |
| `email`      | text          | From the verified Google token           |
| `name`       | text          | From the verified Google token           |
| `picture`    | text, null    | Avatar URL, may be absent                |
| `created_at` | timestamptz   | `now()`                                  |
| `updated_at` | timestamptz   | `now()`; refreshed on profile change     |

### `sessions`

One row per issued refresh token. Rotation revokes the old row and inserts a new one.

| Column               | Type          | Notes                                          |
| -------------------- | ------------- | ---------------------------------------------- |
| `id`                 | uuid PK       | `gen_random_uuid()`                            |
| `user_id`            | uuid FK       | → `users.id`, `ON DELETE CASCADE`             |
| `refresh_token_hash` | text, unique  | SHA-256 of the opaque refresh token; token itself is never stored |
| `expires_at`         | timestamptz   | Absolute refresh-token expiry                  |
| `created_at`         | timestamptz   | `now()`                                        |
| `last_used_at`       | timestamptz   | Updated on each refresh                        |
| `revoked_at`         | timestamptz null | Set on rotation or sign-out; non-null → unusable |

Index: `sessions_user_id_idx` on `user_id`.

### `friendships`

A symmetric friendship, stored once per pair.

| Column       | Type        | Notes                             |
| ------------ | ----------- | --------------------------------- |
| `id`         | uuid PK     | `gen_random_uuid()`               |
| `user_a_id`  | uuid FK     | → `users.id`, `ON DELETE CASCADE` |
| `user_b_id`  | uuid FK     | → `users.id`, `ON DELETE CASCADE` |
| `created_at` | timestamptz | `now()`                           |

The pair is always written in a **canonical order** (`user_a_id` < `user_b_id`, see
`orderPair` in `src/features/friends/friendships.ts`), so the unique constraint
`friendships_pair_unique` alone rules out duplicates — including under concurrent
acceptance, where the insert uses `ON CONFLICT DO NOTHING`. A check constraint
(`friendships_distinct_users`) forbids self-friendship.

Index: `friendships_user_b_id_idx` on `user_b_id` (the `user_a_id` side is covered by the
unique constraint's index).

### `groups`

A space shared by a set of people, and later the expenses they record in it.

| Column          | Type             | Notes                                                    |
| --------------- | ---------------- | -------------------------------------------------------- |
| `id`            | uuid PK          | `gen_random_uuid()`                                       |
| `kind`          | text             | `standard` or `pair` (default `standard`)                 |
| `name`          | text, null       | Set for a standard group, always `NULL` for a pair group  |
| `friendship_id` | uuid FK, unique, null | → `friendships.id`, `ON DELETE CASCADE`; pair groups only |
| `parent_id`     | uuid FK, null    | → `groups.id`, `ON DELETE CASCADE`; `NULL` for a root group |
| `depth`         | integer          | `0` for a root group, `parent.depth + 1` otherwise; capped at `4` |
| `archived_at`   | timestamptz null | Non-null → inactive. Reversible, loses nothing            |
| `created_at`    | timestamptz      | `now()`                                                   |
| `updated_at`    | timestamptz      | `now()`; refreshed on rename / archive                    |

Two shapes, kept exclusive by check constraints:

- `groups_kind_valid` — `kind in ('standard', 'pair')`.
- `groups_pair_shape` — `(kind = 'pair') = (friendship_id is not null)`.
- `groups_standard_named` — `(kind = 'standard') = (name is not null)`.

The **pair group is keyed by the friendship**, which is what makes "every pair of friends
has one" true in the database rather than in application code: the `UNIQUE` on
`friendship_id` guarantees exactly one even when two requests race to create it (the
insert uses `ON CONFLICT DO NOTHING`), and the cascade takes it away with the friendship.
It stores no name — the API returns the *other* member's name, so each side sees who they
share with.

This row is created **eagerly**, inside `POST /invites/:code/accept` (`friendsPlugin`
calls `groupsRepository.createPairGroup` directly — see `docs/ARCHITECTURE.md`), in the
same step as the friendship itself.

**Nesting** (`docs/specs/groups.md`): a group can have sub-groups through `parent_id`, a
self-referential FK that cascades — deleting a group deletes its entire sub-tree for free,
with no application-level cascade needed. A sub-group is always `kind = 'standard'`
(`groups_pair_no_parent` below), but the *parent* being nested under can be either kind: a
standard group, or the implicit pair group of a friendship — a friendship can have
sub-groups too, capped at its own two people by a service-level guard (`pairCeiling`), not
by a column here, since which rows are members is not something a `CHECK` on `groups` can
see. Three more check constraints keep the tree well-formed:

- `groups_pair_no_parent` — `kind <> 'pair' or parent_id is null`: a pair group can never
  itself be nested under something else (whether it can be *pointed at* as someone else's
  parent is exactly what changed with sub-groups — now allowed, and no longer expressible
  as a single-row check either way, since it depends on the parent row, not this one).
- `groups_root_depth` — `(parent_id is null) = (depth = 0)`: a root group is exactly the
  ones at depth zero — this includes every pair group, which is always a root.
- `groups_depth_valid` — `depth between 0 and 4`: five levels total (a root plus four
  levels of nesting).

`parent_id` is **immutable after creation** — there is no update path for it — which keeps
the tree acyclic by construction rather than by cycle detection, and every tree query
(ancestors, descendants) a bounded recursive `WITH RECURSIVE` walk instead of an
open-ended graph problem, since depth is capped. `depth` is stored rather than computed on
read because it is fixed at creation and makes the depth cap a plain check instead of a
recursive query.

Index: `groups_parent_id_idx` on `parent_id`.

### `group_members`

Who belongs to a group, and with which rights. **A membership row is the only thing that
grants access to a group**: every route resolves it before anything else.

| Column         | Type             | Notes                              |
| -------------- | ---------------- | ---------------------------------- |
| `id`           | uuid PK          | `gen_random_uuid()`                |
| `group_id`     | uuid FK          | → `groups.id`, `ON DELETE CASCADE` |
| `user_id`      | uuid FK          | → `users.id`, `ON DELETE CASCADE`  |
| `role`         | text             | `owner` or `member` (default `member`) |
| `joined_at`    | timestamptz      | `now()`                            |
| `favorited_at` | timestamptz null | Non-null → the viewer favorited this group (`docs/specs/favorites.md`) |

Constraints: `group_members_unique` on (`group_id`, `user_id`) — which also makes a
repeated or concurrent join a no-op rather than a duplicate — and
`group_members_role_valid` on the role.

**`favorited_at` lives on the membership row itself**, not a separate table: a favorite is
nothing more than a personal marker on "this user belongs to this group", so it is
automatically scoped to one viewer and automatically removed when the membership row is
(leaving, removal, or the group's own deletion) — no separate cleanup path needed.

Index: `group_members_user_id_idx` on `user_id` (the group side is covered by the unique
constraint's index).

### `invites`

A shareable invitation. **One table for every kind on purpose**: the code space is shared,
so a single link format, a single landing page and a single pair of public routes serve
friendships and groups alike.

| Column       | Type             | Notes                                                    |
| ------------ | ---------------- | -------------------------------------------------------- |
| `id`         | uuid PK          | `gen_random_uuid()`                                       |
| `kind`       | text             | `friend` or `group`                                       |
| `inviter_id` | uuid FK          | → `users.id`, `ON DELETE CASCADE`; who issued it          |
| `group_id`   | uuid FK, null    | → `groups.id`, `ON DELETE CASCADE`; group invitations only |
| `code`       | text, unique     | 128 bits of randomness, base64url (22 chars)              |
| `expires_at` | timestamptz      | Default lifetime 7 days (`INVITE_TTL_SECONDS`)            |
| `created_at` | timestamptz      | `now()`                                                   |
| `revoked_at` | timestamptz null | Set on rotation / revocation; non-null → unusable         |

Check constraints: `invites_kind_valid`, and `invites_target_shape`
(`(kind = 'group') = (group_id is not null)`).

Indexes: `invites_inviter_id_idx`, `invites_group_id_idx`.

"One active invitation" is scoped differently per kind and enforced by the service rather
than a constraint: a **friend** invitation is one per inviter (the link *is* "add me"), a
**group** invitation is one per group whoever created it (the link belongs to the group,
and keeps working after that person leaves).

Unlike `sessions.refresh_token_hash`, the code is stored **in clear**. It has to be
redisplayable ("copy my link again"), and it only grants a narrow, expiring, revocable
capability — becoming someone's friend or joining one group, subject to the recipient's
own acceptance.

### `transactions`

An expense, income or transfer recorded in a group.

| Column          | Type             | Notes                                                    |
| --------------- | ---------------- | --------------------------------------------------------- |
| `id`            | uuid PK          | `gen_random_uuid()`                                        |
| `group_id`      | uuid FK          | → `groups.id`, `ON DELETE CASCADE`                         |
| `kind`          | text             | `expense`, `income` or `transfer`                          |
| `title`         | text             |                                                             |
| `amount_cents`  | integer          | Strictly positive                                          |
| `occurred_on`   | date             | A calendar date, not a timestamp — no time zone drift      |
| `comment`       | text, null       | Optional                                                   |
| `category`      | text             | One of a fixed preset list; default `'other'`, never `NULL` |
| `payer_id`      | uuid FK          | → `users.id`, `ON DELETE CASCADE`                          |
| `split_mode`    | text             | `shares` or `amount`                                       |
| `created_by`    | uuid FK          | → `users.id`, `ON DELETE CASCADE`; who recorded it         |
| `created_at`    | timestamptz      | `now()`                                                     |
| `updated_at`    | timestamptz      | `now()`; refreshed on edit                                  |

Check constraints: `transactions_kind_valid`, `transactions_split_mode_valid`,
`transactions_amount_positive` (`amount_cents > 0`), `transactions_category_valid` (one
of the preset keys) — the preset list is duplicated here and in `@ardoise/shared`'s
`categories.ts`; keep both in sync by hand, there being only the one place that needs to
change until custom categories exist.

Indexes: `transactions_group_id_occurred_on_idx` on (`group_id`, `occurred_on`) for the
group's transaction list; `transactions_payer_id_idx`.

A `transfer` is stored the same way as an `expense`/`income` with `split_mode = 'amount'`
and a single row in `transaction_participants` — the one recipient, for the full amount.
No third `split_mode` value is needed, and every other query (the transaction list, the
balance calculation) treats all three kinds uniformly.

### `transaction_participants`

One member's share of a transaction.

| Column           | Type        | Notes                                                              |
| ---------------- | ----------- | -------------------------------------------------------------------- |
| `id`             | uuid PK     | `gen_random_uuid()`                                                   |
| `transaction_id` | uuid FK     | → `transactions.id`, `ON DELETE CASCADE`                              |
| `user_id`        | uuid FK     | → `users.id`, `ON DELETE CASCADE`                                     |
| `share_cents`    | integer     | ≥ 0; `shares` mode's computed output, or `amount` mode's input        |
| `weight`         | integer, null | Set only in `shares` mode: the input the split was computed from     |

Constraints: `transaction_participants_unique` on (`transaction_id`, `user_id`) — one row
per person per transaction; `transaction_participants_share_non_negative`;
`transaction_participants_weight_positive` (`weight is null or weight > 0`).

Index: `transaction_participants_user_id_idx`.

References the **user**, not their `group_members` row: leaving the group does not touch
past transactions, so history is not rewritten. `Σ share_cents = amount_cents` for a given
transaction is the core invariant — not expressible as a single-row `CHECK`, so it is
enforced by the service inside the same database transaction that writes both tables.

**`payer_id` and `created_by` cascade-delete like every other FK to `users.id`** in this
schema, which means deleting a user's account would currently delete every transaction
they paid for or recorded — including ones shared with people who remain in the group,
silently breaking their balances. There is no account-deletion feature yet to trigger
this, so it is left as-is for consistency with the rest of the schema; if one is added,
revisit this the way a pair group's missing member is already handled at the API layer
(`ON DELETE SET NULL` plus a "deleted user" fallback when rendering), rather than losing
shared history.

## Cascades worth knowing

- Removing a **friendship** removes the pair group and everything in it, on both sides —
  including its entire sub-tree, the same `parent_id` cascade as any other group's, one
  hop further out. This is why removing a friend is a destructive action in the product,
  not just a relational one.
- Deleting a **group** removes its memberships and its invitation. A code pointing at a
  deleted group becomes simply unknown (`404`), which is a dead link like any other and
  does not confirm the group ever existed.
- Deleting a **group** also removes **its entire sub-tree** — every sub-group nested
  inside it, at any depth, with their own memberships, invitations and transactions —
  through `groups.parent_id`'s own cascade, the same mechanism as every other cascade in
  this schema, not an application-level loop.
- Deleting a **user** removes their sessions, friendships (and therefore their pair
  groups), memberships and the invitations they issued. Standard groups they belonged to
  survive; one left with no members at all is deleted by the service when its last member
  leaves. It would also currently remove every transaction they paid for or recorded —
  see the note under `transactions` above.
- Deleting a **group** now also removes its transactions and their participants, the same
  way it already removes memberships and the invitation.

## Current state

- Migration `0000_*` — `users` and `sessions` tables (Google sign-in).
- Migration `0001_*` — `friend_invites` and `friendships` tables (friends and invitations).
- Migration `0002_*` — drops `friend_invites`, superseded by the generalised `invites`
  table. Deliberately a drop rather than a rename: the shape changed, and there is no
  deployment holding data yet.
- Migration `0003_*` — `groups`, `group_members` and `invites` tables (groups, and one
  invitation system for friends and groups).
- Migration `0004_*` — `transactions` and `transaction_participants` tables (expenses,
  incomes and transfers, with per-member splits).
- Migration `0005_*` — adds `transactions.category`, originally nullable.
- Migration `0006_*` — backfills any `NULL` category to `'other'`, then makes the column
  `NOT NULL DEFAULT 'other'`: an uncategorised transaction is `'other'`, not the absence
  of a value.
- Migration `0007_*` — adds `groups.parent_id` (self-referential, `ON DELETE CASCADE`) and
  `groups.depth`, plus the three check constraints that keep the tree well-formed
  (nested groups, `docs/specs/groups.md`). Every existing row backfills to a root
  (`parent_id NULL`, `depth 0`) automatically, since the column defaults to `0`.
- Migration `0008_*` — adds `group_members.favorited_at`, nullable, no backfill needed
  (favorites, `docs/specs/favorites.md`).
