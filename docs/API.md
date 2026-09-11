# HTTP API

Living document describing the current API surface of `apps/server`. Update it whenever a
route is added, changed or removed.

## Conventions

- REST over HTTP, JSON request and response bodies.
- Request and response shapes are validated with Zod on the server; the schemas are
  shared with the client via `@splitcount/shared`.
- Authentication: SplitCount issues its own session after verifying a Google ID token.
  Protected routes require `Authorization: Bearer <accessToken>`. The access token is a
  short-lived (~15 min) HS256 JWT; the client refreshes it with the rotating refresh
  token. Auth failures return `401` with `{ "error": "<code>" }`; validation failures
  return `400 { "error": "invalid_request" }`.

## Base URL

- Local: `http://localhost:3000` (`PORT`, default `3000`).

## Endpoints

### `GET /health`

Liveness probe. No authentication. Dependency-free.

Response `200`:

```json
{ "status": "ok" }
```

### `POST /auth/google`

Exchange a Google ID token for a SplitCount session. Verifies the token against
`GOOGLE_CLIENT_IDS`, creates the user on first sign-in.

Request:

```json
{ "idToken": "<google id token>" }
```

Response `200`:

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<opaque>",
  "accessTokenExpiresAt": "2026-09-09T19:15:00.000Z",
  "user": { "id": "<uuid>", "email": "a@example.com", "name": "Ada", "picture": null }
}
```

`401 { "error": "invalid_google_token" }` when the token cannot be verified.

### `POST /auth/refresh`

Rotate a session. The supplied refresh token is revoked and a new pair is returned.

Request: `{ "refreshToken": "<opaque>" }` → Response `200`: same shape as `POST /auth/google`.

`401 { "error": "invalid_refresh_token" }` when the token is unknown, expired, revoked or
already rotated.

### `POST /auth/logout`

Revoke a session. Idempotent.

Request: `{ "refreshToken": "<opaque>" }` → Response `204` (no body).

### `GET /auth/me`

Current user. Requires `Authorization: Bearer <accessToken>`.

Response `200`: `{ "user": { "id": "<uuid>", "email": "...", "name": "...", "picture": null } }`

`401` when the access token is missing, invalid or expired.

## Invitations

Invitations share **one code space**, one link format and one landing page, whatever they
lead to (`docs/specs/friends-and-invitations.md`, `docs/specs/groups.md`). The client
captures a code without knowing what it is for; these routes say. An invitation code is
opaque, 128 bits of randomness in base64url (22 characters).

The routes that *issue* an invitation belong to the feature owning the target
(`POST /friends/invite`, `POST /groups/:groupId/invite`); the two below are the public
ones every invitation goes through.

### `GET /invites/:code`

What the invitation leads to. **Unauthenticated** on purpose: the recipient must be able
to see who is inviting them, and into what, before deciding to sign in.

Response `200`, discriminated on `kind`:

```json
{ "invite": { "kind": "friend", "inviter": { "id": "<uuid>", "name": "Ada", "picture": null } } }
```

```json
{
  "invite": {
    "kind": "group",
    "inviter": { "id": "<uuid>", "name": "Ada", "picture": null },
    "group": { "id": "<uuid>", "name": "Corsica 2026", "memberCount": 4 }
  }
}
```

- `404 { "error": "invite_not_found" }` — unknown or malformed code.
- `410 { "error": "invite_expired" }` / `"invite_revoked"` / `"invite_gone"`.
  `invite_gone` means the target no longer accepts anyone (an archived group). All of
  them are dead links as far as the holder is concerned.

### `POST /invites/:code/accept`

Accept, as the authenticated caller. Idempotent.

Response `200`, discriminated on `kind`:

```json
{
  "result": {
    "kind": "friend",
    "friend": { "id": "<uuid>", "name": "Ada", "picture": null },
    "alreadyFriends": false
  }
}
```

```json
{ "result": { "kind": "group", "group": "<GroupSummary>", "alreadyMember": false } }
```

- `409 { "error": "self_invite" }` — the inviter cannot accept their own **friend** link.
  Accepting one's own **group** link is a no-op reported as `alreadyMember: true`.
- `404` / `410` as for the preview. `401` when unauthenticated.

### `GET /i/:code`

The public HTML page an invitation link points to. Not JSON: it tries to open
`splitcount://invite/<code>`, and otherwise shows who is inviting (and which group, for a
group invitation), the code to enter manually, and the store links when they are
configured. Served with `Cache-Control: no-store`.

## Friends

See `docs/specs/friends-and-invitations.md`. A `FriendSummary` (`{ id, name, picture }`)
is how *another* user is exposed — deliberately narrower than the `UserProfile` returned
for oneself: it carries no email address.

### `POST /friends/invite`

The caller's active invitation, creating one when there is none. Idempotent: calling it
again returns the same link until it expires or is rotated. Requires authentication.

Response `200`:

```json
{
  "invite": {
    "code": "Zx3k9QpL2mN7vR1sT4uW8g",
    "url": "https://api.splitcount.example/i/Zx3k9QpL2mN7vR1sT4uW8g",
    "expiresAt": "2026-09-17T12:00:00.000Z"
  }
}
```

### `POST /friends/invite/rotate`

Revoke the active invitation and issue a new one. The previous link stops working
immediately. Requires authentication. Response `200`: same shape as above.

### `DELETE /friends/invite`

Revoke the active invitation without issuing a new one. Idempotent. Requires
authentication. Response `204`.

### `GET /friends`

The caller's friends, sorted by name. Requires authentication.

Response `200`: `{ "friends": [ { "id": "<uuid>", "name": "Ada", "picture": null } ] }`

### `DELETE /friends/:friendId`

Remove a friend. Symmetric and idempotent. Requires authentication. Response `204`;
`400 { "error": "invalid_request" }` when `friendId` is not a UUID.

**Destructive beyond the relationship**: the group the pair shared goes with the
friendship, along with everything in it.

## Groups

See `docs/specs/groups.md`. Every route below requires authentication and resolves the
caller's **membership** before anything else.

A group the caller does not belong to is answered `404 { "error": "group_not_found" }`,
never `403` — a non-member must not be able to tell a group they cannot see from one that
does not exist.

Shared error codes:

| Status | Code                   | Meaning                                                    |
| ------ | ---------------------- | ---------------------------------------------------------- |
| `404`  | `group_not_found`      | No such group, or the caller is not a member                |
| `403`  | `not_group_owner`      | Deleting is owner-only                                      |
| `409`  | `pair_group_immutable` | The operation can never apply to an implicit pair group     |
| `409`  | `group_archived`       | An archived group takes no new members and issues no links  |
| `409`  | `owner_cannot_leave`   | The owner cannot leave while other members remain           |
| `409`  | `cannot_remove_owner`  | Members may remove each other, but not the owner             |
| `400`  | `not_friends`          | Only the caller's own friends can be added directly         |

`GroupSummary` is `{ id, kind, name, memberCount, archivedAt, createdAt }`, with `kind`
one of `standard` / `pair`. `GroupDetail` adds `members` (a `FriendSummary` plus `role`)
and `viewerRole`. A **pair group stores no name**: the API fills it with the *other*
member's name, so each side sees who they share with.

### `GET /groups`

The caller's groups. **Pair groups are never listed** — they are reached from the friend
list. Active groups first, then archived ones; alphabetical within each.

Response `200`: `{ "groups": [ "<GroupSummary>" ] }`

### `POST /groups`

Create a group. `memberIds` is optional and must contain only friends of the caller.

Request: `{ "name": "Corsica 2026", "memberIds": ["<uuid>"] }` → Response
`201 { "group": "<GroupDetail>" }`. The creator is the group's `owner`.

### `GET /groups/:groupId`

The group and its members. Response `200 { "group": "<GroupDetail>" }`.

### `PATCH /groups/:groupId`

Rename and/or archive. Any member may do either; at least one field is required.

Request: `{ "name": "Corsica", "archived": true }` → Response
`200 { "group": "<GroupDetail>" }`. Archiving is reversible (`"archived": false`) and
loses nothing.

### `DELETE /groups/:groupId`

Delete the group and everything in it. **Owner only**, irreversible. Response `204`.

### `POST /groups/:groupId/members`

Add friends of the caller. Already-members are ignored rather than rejected.

Request: `{ "memberIds": ["<uuid>"] }` → Response `200 { "group": "<GroupDetail>" }`.

### `DELETE /groups/:groupId/members/:userId`

Remove a member, or leave when `userId` is the caller. Response `204`, and removing
someone who already left is a no-op. When the last member leaves, the group is deleted
with its contents.

The **owner cannot be removed** by another member: that would leave a group nobody is
allowed to delete. They leave on their own terms, or delete it.

### `POST /groups/:groupId/invite`, `/rotate`, `DELETE /groups/:groupId/invite`

The group's invitation link — **one per group**, not per member: any member sees, shares
and can replace the same one. Same shapes as the `/friends/invite` trio. Accepting adds
the person to the group; it does **not** create a friendship.

### `POST /groups/pair/:friendId`

The group the caller shares with a friend, **created on first access**. Idempotent, and
safe under concurrency: the unique constraint on the friendship guarantees one group per
pair. Response `200 { "group": "<GroupDetail>" }`; `404` when the two are not friends.

## Transactions

See `docs/specs/transactions.md`. Every route below requires authentication and resolves
the caller's group membership first, exactly like every other group route — a non-member
gets `404 { "error": "group_not_found" }`. **Unlike every other group route, these work
identically on the implicit pair group** — transactions are the point of it.

An **archived group is fully read-only for transactions**: `POST`, `PATCH` and `DELETE`
all refuse with `409 { "error": "group_archived" }`; `GET` still works.

Shared error codes, beyond the ones `groups` already defines:

| Status | Code                 | Meaning                                                        |
| ------ | -------------------- | ---------------------------------------------------------------- |
| `404`  | `transaction_not_found` | Unknown id, or it belongs to a different group than the URL's |
| `400`  | `not_group_member`   | The payer, a concerned member, or a transfer's recipient isn't a current member of the group |
| `400`  | `invalid_split`      | A fixed-amount split doesn't sum to the total, or a transfer targets the payer |

`kind` is one of `expense` / `income` / `transfer`; `splitMode` is `shares` or `amount`.
Amounts are integer cents throughout. Any member can record, edit or delete any
transaction — there is no per-transaction ownership.

`Transaction` is:

```json
{
  "id": "<uuid>",
  "groupId": "<uuid>",
  "kind": "expense",
  "title": "Groceries",
  "amountCents": 4250,
  "occurredOn": "2026-09-11",
  "comment": null,
  "payer": "<FriendSummary>",
  "splitMode": "shares",
  "participants": [
    { "user": "<FriendSummary>", "shareCents": 2125, "weight": 1 }
  ],
  "createdBy": "<uuid>",
  "createdAt": "2026-09-11T12:00:00.000Z",
  "updatedAt": "2026-09-11T12:00:00.000Z"
}
```

`weight` is `null` whenever `splitMode` is `amount` (including every transfer, stored as
a single-participant amount split).

### `GET /groups/:groupId/transactions`

The group's transactions, most recent first (by date, then by recording order for
same-day entries). Response `200 { "transactions": ["<Transaction>"] }`.

### `POST /groups/:groupId/transactions`

Record a transaction. `payerId` and every concerned member must be current members of
the group. Request, discriminated on `kind`:

```json
{
  "kind": "expense",
  "title": "Groceries",
  "amount": 4250,
  "occurredOn": "2026-09-11",
  "comment": null,
  "payerId": "<uuid>",
  "split": {
    "mode": "shares",
    "participants": [{ "userId": "<uuid>", "weight": 1 }]
  }
}
```

`income` has the same shape as `expense`. A `transfer` has no `split`; instead:

```json
{
  "kind": "transfer",
  "title": "Reimbursement",
  "amount": 2000,
  "occurredOn": "2026-09-11",
  "payerId": "<uuid>",
  "toUserId": "<uuid>"
}
```

A `split` with `"mode": "amount"` takes a fixed `amount` per participant instead of a
`weight`, and must sum exactly to the transaction's `amount`. Response
`201 { "transaction": "<Transaction>" }`.

### `GET /groups/:groupId/transactions/:transactionId`

A single transaction. Response `200 { "transaction": "<Transaction>" }`.

### `PATCH /groups/:groupId/transactions/:transactionId`

Edit a transaction. **A full replace, not a partial update** — the request is the same
shape as `POST`, every field required, because a transaction's fields are interdependent
(the kind drives whether a split or a single recipient applies). Response
`200 { "transaction": "<Transaction>" }`.

### `DELETE /groups/:groupId/transactions/:transactionId`

Delete a transaction. Immediate and permanent. Response `204`.

### `GET /groups/:groupId/transactions/balances`

Every member's net balance in the group: positive means the group owes them, negative
means they owe the group. Every current member appears, including at zero; a member who
left with an unsettled balance still appears too. Computed on the fly from the
transactions, not stored — see `docs/ARCHITECTURE.md`.

Response `200`:

```json
{ "balances": [{ "userId": "<uuid>", "amountCents": 500 }] }
```

## Planned

- Settle-up suggestions (minimising the number of payments to clear a group's balances).
