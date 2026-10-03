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
- Requests are rate limited per client address (`docs/DEPLOYMENT.md`). A client over its
  budget gets `429 { "error": "rate_limited" }` with a `Retry-After` header (seconds);
  every response carries `X-RateLimit-Limit` / `X-RateLimit-Remaining` /
  `X-RateLimit-Reset`. `GET /health` is never limited. The mobile client should treat
  a `429` as "try again later", not as a failure of the request itself.
- Every response carries security headers (`docs/DEPLOYMENT.md`). The API sets no CORS
  headers: it is called by the native app, not from a browser page.
- Every error body is `{ "error": "<code>" }`. Failures the server did not anticipate
  (any 5xx) always answer `{ "error": "internal_error" }`: the underlying message — which
  may carry a constraint name or a fragment of data — is logged, never sent. Failures
  raised by Fastify before a handler runs (malformed JSON, body over the limit, wrong
  content type) keep their 4xx status with `invalid_request` (`400`),
  `payload_too_large` (`413`) or `unsupported_media_type` (`415`).

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

The caller's friends, favorited ones first and alphabetical within that
(`docs/specs/favorites.md`), each with where the two of them stand. Requires
authentication.

`balanceCents` is positive when that friend owes the caller, negative when the caller owes
them, `0` when they are settled — including when they share no transaction at all. It is
the net across **every group the two share**, archived ones included, and a group only one
of them still belongs to counts too. It is built solely from transactions the caller is
party to, so it can never surface a group or an amount they cannot already read. Computed
on the fly, not stored — see `docs/specs/balances.md` and `docs/ARCHITECTURE.md`.

`groupId` is the implicit pair group the two share — created the moment they became
friends (`docs/specs/friends-and-invitations.md`), so it is always present. `favorite` is
that group's own favorite marker, personal to the caller; toggle it through the same
`PUT`/`DELETE /groups/:groupId/favorite` every other group uses, no dedicated route. Note
this is *not* the pair group's own balance (`viewerBalanceCents` on `GET
/groups/:groupId`), which is scoped to that group's own transactions only —
`balanceCents` here nets every group the two share.

Response `200`:

```json
{
  "friends": [
    {
      "id": "<uuid>",
      "name": "Ada",
      "picture": null,
      "balanceCents": 1250,
      "groupId": "<uuid>",
      "favorite": false
    }
  ]
}
```

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
does not exist. **The one exception is `join_required`**: a member of a group's immediate
parent who has not joined it already knows it exists — it is shown to them in the parent's
own `subgroups` list — so every route that would otherwise answer `group_not_found`
answers `403 { "error": "join_required" }` for exactly that case instead
(`docs/specs/groups.md`). This never applies transitively to a sibling or grandchild.

Shared error codes:

| Status | Code                   | Meaning                                                    |
| ------ | ---------------------- | ---------------------------------------------------------- |
| `404`  | `group_not_found`      | No such group, or the caller is not a member                |
| `403`  | `join_required`        | The caller belongs to the group's immediate parent but hasn't joined it |
| `403`  | `not_group_owner`      | Deleting is owner-only                                      |
| `409`  | `pair_group_immutable` | The operation can never apply to an implicit pair group, or would bring a third person into a sub-group nested under one |
| `409`  | `group_archived`       | An archived group, or one whose ancestor is archived, takes no new members and issues no links |
| `409`  | `owner_cannot_leave`   | The owner cannot leave — or be removed — while other members remain in the group or in a sub-group they solely own |
| `409`  | `cannot_remove_owner`  | Members may remove each other, but not the owner             |
| `400`  | `not_friends`          | Only the caller's own friends can be added directly         |
| `409`  | `max_depth_reached`    | A sub-group cannot nest past the five-level cap              |

`GroupSummary` is `{ id, kind, name, memberCount, parentId, depth, ancestors, subgroupCount, viewerBalanceCents, favorite, archivedAt, createdAt, viewerRole }`, with `kind` one of `standard` / `pair`. `favorite` is the caller's own marker (`docs/specs/favorites.md`), never another member's — see `PUT`/`DELETE /groups/:groupId/favorite` below. `parentId` is
`null` for a root group; `depth` is `0` for a root group and capped at `4`; `subgroupCount`
is the number of *direct* sub-groups only. `ancestors` is every group above it, root
first, each `{ id, name }` — empty for a root group, and named the way the group itself
is (a pair group among them carries the *other* member's name, per caller).
`viewerBalanceCents` is the caller's own net
position **in that group alone** — positive means they are owed, negative means they owe
(`docs/specs/balances.md`). It is the caller's own entry of
`GET /groups/:groupId/transactions/balances`, and a sub-group is never folded into it.
`viewerRole` is the caller's own role on this group, `owner` or `member` — what a client's
own row-level actions menu (Manage / Archive / Leave / Delete) gates on, without a second
read per row.
`GroupDetail` adds `members` (a
`FriendSummary` plus `role`), `subgroups` (the group's direct sub-groups — see
below), `readOnly` — `true` when the group itself is
archived *or any ancestor of it is*; for a root group this always equals
`archivedAt !== null`, since it has no ancestors — and `pairRooted`. A **pair group stores
no name**: the API fills it with the *other* member's name, so each side sees who they
share with. A pair group's own parent is always `null`, and it can never be nested under
something else — but it *can* be a parent: a friendship can have sub-groups, exactly like a
standard group. `pairRooted` is `true` for the pair group itself and for every sub-group
nested under it, at any depth: such a group can only ever contain that friendship's own two
people, so `POST /groups` (as an initial member) and `POST /groups/:groupId/members` both
refuse a third person there with `pair_group_immutable`, and
`POST /groups/:groupId/invite` / `POST .../invite/rotate` refuse outright rather than issue
a link with no one left to legitimately send it to. The other friend still reaches it
through `POST /groups/:groupId/join` instead, same as any other unjoined sub-group.

A `subgroups` entry is `{ id, name, memberCount, viewerIsMember, viewerBalanceCents, favorite, viewerRole, archivedAt }` —
enough to decide whether to open it (already a member) or join it and show where the
viewer stands, never a member list. `viewerBalanceCents` is the viewer's own balance in
*that* sub-group, on the same terms as the top-level figure (see above), and is always `0`
when `viewerIsMember` is `false`, since a non-member is on none of its transactions.
`favorite` and `viewerRole` are likewise `false` / `null` when `viewerIsMember` is `false` —
there is no membership row to hold either on (`docs/specs/favorites.md`); the list is
otherwise ordered with favorited sub-groups first among those the viewer has joined,
alphabetical within that. `archivedAt` is the sub-group's own flag — a sub-group is always
`standard`, never `pair`, so its own row-level actions never need `viewerRole` to be
anything but the two ordinary roles. It carries no `ancestors`, `depth` or `subgroups` of
its own — those are read from the sub-group's own `GET /groups/:groupId` when opened.

### `GET /groups`

The caller's **root** groups only — a group that is itself a sub-group is reached by
opening its parent, never listed here. **Pair groups are never listed** — they are reached
from the friend list. Active groups first, then archived ones; within each, favorited
groups first (`docs/specs/favorites.md`), then alphabetical.

Response `200`: `{ "groups": [ "<GroupSummary>" ] }`

### `GET /groups/favorites`

The caller's favorited groups (`docs/specs/favorites.md`), for the home screen
(`docs/specs/home.md`). Unlike `GET /groups`, it crosses every boundary that list draws:
a sub-group at any depth and the implicit pair group behind a favorited friend are both
included, each with its name resolved, its `ancestors` and the caller's own balance in it.
Active groups first, then archived ones; alphabetical within each — a pair group sorts
under the other member's name, since that is the name it is shown with.

Response `200`: `{ "groups": [ "<GroupSummary>" ] }` — every entry has `favorite: true`.

### `POST /groups`

Create a group. `memberIds` is optional and must contain only friends of the caller.

Request: `{ "name": "Corsica 2026", "memberIds": ["<uuid>"] }` → Response
`201 { "group": "<GroupDetail>" }`. The creator is the group's `owner`.

`parentId` is optional and creates a **sub-group** under that group instead of a root
group (`docs/specs/groups.md`): the caller must belong to `parentId`, which must be
effectively active and not already at the depth cap — either kind, standard or the
implicit pair group. Every initial member (the creator included) is also added to every
ancestor of the new group in the same request — membership always flows down the tree.
When `parentId` is `pairRooted`, the friendship's other person is added automatically
regardless of `memberIds` — there is no one else it could legitimately hold — and any id
other than theirs is refused with `409 pair_group_immutable`.

Request: `{ "name": "Ajaccio weekend", "parentId": "<uuid>" }` → Response
`201 { "group": "<GroupDetail>" }`, with `parentId` and `depth` set accordingly.

### `GET /groups/:groupId`

The group, its members, its direct sub-groups and, for a sub-group, its ancestors.
Response `200 { "group": "<GroupDetail>" }`.

### `PATCH /groups/:groupId`

Rename and/or archive. Any member may do either; at least one field is required.

Request: `{ "name": "Corsica", "archived": true }` → Response
`200 { "group": "<GroupDetail>" }`. Archiving is reversible (`"archived": false`) and
loses nothing.

### `DELETE /groups/:groupId`

Delete the group and everything in it. **Owner only**, irreversible. Response `204`.

For the **implicit pair group**, this is the one exception to its usual immutability
(`docs/specs/groups.md`): either of the two friends may delete it, since it has no owner,
and doing so deletes the friendship itself — the same end state `DELETE /friends/:userId`
reaches, just from the group's own side rather than the friend's.

### `POST /groups/:groupId/members`

Add friends of the caller. Already-members are ignored rather than rejected. Each added
person is also added to every ancestor of `groupId` in the same request — membership
always flows down the tree (`docs/specs/groups.md`); the response's `memberCount` and
`subgroups` describe `groupId` itself only.

Request: `{ "memberIds": ["<uuid>"] }` → Response `200 { "group": "<GroupDetail>" }`.

### `DELETE /groups/:groupId/members/:userId`

Remove a member, or leave when `userId` is the caller. Response `204`, and removing
someone who already left is a no-op. This also removes that person from every one of
`groupId`'s descendants, since nobody can remain in a sub-group of a group they are no
longer part of (`docs/specs/groups.md`). When the last member of a group leaves, it is
deleted with its contents; the same applies to any descendant left with nobody in it by
this cascade.

The **owner cannot be removed** by another member: that would leave a group nobody is
allowed to delete. They leave on their own terms, or delete it. The same refusal
(`409 owner_cannot_leave`) now also covers cascading someone out of a sub-group they solely
own while others remain in it — leaving or being removed from `groupId` would strand it.

### `POST /groups/:groupId/join`

Join a sub-group that is visible because the caller already belongs to its immediate
parent — lighter than an invitation link: no friendship check, since membership in the
parent is already a stronger signal of trust. Joins that sub-group only; the caller's
membership in every one of its ancestors already holds (`docs/specs/groups.md`).
Idempotent — calling it again when already a member returns the group unchanged, without
altering an existing role (e.g. an owner stays the owner).

Response `200 { "group": "<GroupDetail>" }`. `404 group_not_found` for a root group, or for
a sub-group whose immediate parent the caller does not belong to. `409 group_archived` when
the sub-group or an ancestor of it is archived.

### `PUT /groups/:groupId/favorite`, `DELETE /groups/:groupId/favorite`

Set or clear the caller's own favorite marker on the group (`docs/specs/favorites.md`).
Personal to the caller, and unaffected by the group's own archived state; both are
idempotent — setting an already-favorited group favorite again, or clearing one that
isn't, changes nothing and still answers `200`.

Response `200 { "group": "<GroupDetail>" }`.

### `POST /groups/:groupId/invite`, `/rotate`, `DELETE /groups/:groupId/invite`

The group's invitation link — **one per group**, not per member: any member sees, shares
and can replace the same one, and a sub-group's link is entirely its own, independent of
its parent's. Same shapes as the `/friends/invite` trio. Accepting adds the person to the
group, and to every one of its ancestors (`docs/specs/groups.md`); it does **not** create
a friendship. The get-or-create and rotate routes refuse (`409 pair_group_immutable`) for
a `pairRooted` group — there is no one an invitation to one could legitimately be for.

The implicit pair group itself has no route of its own: it is created the moment two
people become friends (`docs/specs/friends-and-invitations.md`) and reached through
`GET /friends`'s `groupId`, then the ordinary `GET /groups/:groupId`. It can be used as
`parentId` on `POST /groups` — a friendship can have sub-groups.

## Transactions

See `docs/specs/transactions.md`. Every route below requires authentication and resolves
the caller's group membership first, exactly like every other group route — a non-member
gets `404 { "error": "group_not_found" }`. **Unlike every other group route, these work
identically on the implicit pair group** — transactions are the point of it.

A group that is **archived — itself, or any ancestor of it — is fully read-only for
transactions** (`readOnly` on `GroupDetail`, `docs/specs/groups.md`): `POST`, `PATCH` and
`DELETE` all refuse with `409 { "error": "group_archived" }`; `GET` still works.

Shared error codes, beyond the ones `groups` already defines:

| Status | Code                 | Meaning                                                        |
| ------ | -------------------- | ---------------------------------------------------------------- |
| `404`  | `transaction_not_found` | Unknown id, or it belongs to a different group than the URL's |
| `400`  | `not_group_member`   | The payer, a concerned member, or a transfer's recipient isn't a current member of the group |
| `400`  | `invalid_split`      | A fixed-amount split doesn't sum to the total, or a transfer targets the payer |

`kind` is one of `expense` / `income` / `transfer`; `splitMode` is `shares` or `amount`.
`category` is always one of a fixed preset list — never `null` — see "Categories" below.
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
  "category": "groceries",
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

**Categories** are a fixed, closed preset list (`@splitcount/shared`'s `categories.ts`) —
`groceries`, `restaurant`, `leisure`, `housing`, `transport`, `travel`, `health`,
`shopping`, `bills`, `gifts`, `education`, `pets`, `other`. `other` is the default for a
transaction recorded without one; it is a real category, not a stand-in for "none" — a
transaction's `category` is never `null`. There is no route to create, rename or list
categories dynamically; the emoji and label for each key are a client-side lookup
(`categoryDefinition()`), not part of the `Transaction` response.

### `GET /me/transactions`

The caller's own most recent transactions, across **every group and sub-group they
currently belong to**, pair groups included — the home screen's latest-transactions
section (`docs/specs/home.md`). The only transaction route not scoped to one group.

Only what **involves the caller** is returned: they paid it, or they are one of the
people it concerns. A transaction between two other members of a group they belong to is
not listed. Membership is re-established by the query itself, so a transaction the caller
participated in, in a group they have since left, is never served.

Most recent first — by `occurredOn`, then by recording order, the same ordering a group's
own list uses, so same-day entries are deterministic and the cap always cuts at the same
place.

Query: `limit` (default `10`, max `50`). An absent, malformed or out-of-range `limit`
falls back to the default rather than failing — it changes how much comes back, not what.

Response `200`:

```json
{
  "transactions": [
    {
      "transaction": "<Transaction>",
      "group": {
        "id": "<uuid>",
        "name": "Beach day",
        "ancestors": [{ "id": "<uuid>", "name": "Corsica 2026" }]
      }
    }
  ]
}
```

`group.name` is resolved the way it is everywhere (a pair group carries the other
member's name) and `ancestors` is empty for a root group.

### `GET /groups/:groupId/transactions`

The group's transactions, most recent first (by date, then by recording order for
same-day entries). Response
`200 { "transactions": ["<Transaction>"], "excludedSubgroupCount": 0 }`.

`?scope=` (`group`, the default, or `subtree`) controls whether sub-groups are included
(`docs/specs/group-statistics.md`). With `scope=subtree`, the response also contains every
transaction of the group's descendants **the caller currently belongs to**, at any depth —
a sub-group the caller has not joined contributes nothing, whether or not it is visible to
them. `excludedSubgroupCount` is then the number of descendants left out for that reason;
it is always `0` for `scope=group` and for a group with no sub-groups. An unrecognised
`scope` value falls back to `group` rather than `400` — the client just gets a smaller
answer, not a broken one. The plain transaction list itself always uses the default
`scope=group` and is unaffected by any of this.

`?subgroupIds=` (only meaningful with `scope=subtree`), a comma-separated list of direct
sub-group ids, narrows the descendants added to only those branches — each named
sub-group plus everything nested under it. The empty string means no branch, equivalent to
`scope=group`; omitting the parameter entirely means every branch, the same answer as
before this parameter existed. An id that is not actually one of the group's descendants is
silently dropped rather than causing a `400`.

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
  "category": "groceries",
  "payerId": "<uuid>",
  "split": {
    "mode": "shares",
    "participants": [{ "userId": "<uuid>", "weight": 1 }]
  }
}
```

`category` is optional to send — an omitted one defaults to `other` — and validated
against the fixed preset list; an unrecognised value is `400 { "error":
"invalid_request" }`, the same as any other malformed field.

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

This is a net against the **group**, not against a person: it cannot say who owes whom.
For that, see `balanceCents` on `GET /friends` and `docs/specs/balances.md`; for who
should pay whom to clear the group, see the reimbursement plan below.

Response `200`:

```json
{ "balances": [{ "userId": "<uuid>", "amountCents": 500 }] }
```

> **The reimbursement plan has no route.** Who should pay whom to clear a group is
> derived from these balances by `planReimbursements` in `@splitcount/shared`, on the
> client, so the plan and the balance list can never disagree
> (`docs/specs/reimbursements.md`). Acting on it uses the ordinary
> `POST /groups/:groupId/transactions` with `kind: "transfer"`; there is no settlement
> record. An earlier `GET .../reimbursements` route existed while a plan could span a
> group's sub-tree, and was removed with that scope.

## Planned

- Settling with one person across every group they share, from the friend list
  (`docs/specs/reimbursements.md`, Open questions).
