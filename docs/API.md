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

## Friends and invitations

See `docs/specs/friends-and-invitations.md`. A `FriendSummary`
(`{ id, name, picture }`) is how *another* user is exposed — deliberately narrower than
the `UserProfile` returned for oneself: it carries no email address.

An invitation code is opaque, 128 bits of randomness in base64url (22 characters).

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

### `GET /friends/invites/:code`

Who is inviting. **Unauthenticated** on purpose: the recipient must be able to see who
sent the link before deciding to sign in.

Response `200`: `{ "inviter": { "id": "<uuid>", "name": "Ada", "picture": null } }`

- `404 { "error": "invite_not_found" }` — unknown or malformed code.
- `410 { "error": "invite_expired" }` / `410 { "error": "invite_revoked" }`.

### `POST /friends/invites/:code/accept`

Create the friendship between the authenticated caller and the inviter. Idempotent.

Response `200`:

```json
{ "friend": { "id": "<uuid>", "name": "Ada", "picture": null }, "alreadyFriends": false }
```

- `alreadyFriends` is `true` when the relationship already existed.
- `409 { "error": "self_invite" }` — the inviter cannot accept their own link.
- `404` / `410` as for the preview. `401` when unauthenticated.

### `GET /friends`

The caller's friends, sorted by name. Requires authentication.

Response `200`: `{ "friends": [ { "id": "<uuid>", "name": "Ada", "picture": null } ] }`

### `DELETE /friends/:friendId`

Remove a friend. Symmetric and idempotent. Requires authentication. Response `204`;
`400 { "error": "invalid_request" }` when `friendId` is not a UUID.

### `GET /i/:code`

The public HTML page an invitation link points to. Not JSON: it tries to open
`splitcount://invite/<code>`, and otherwise shows who is inviting, the code to enter
manually, and the store links when they are configured. Served with
`Cache-Control: no-store`.

## Planned

- Groups ("counts") CRUD.
- Expenses CRUD with split definitions.
- Balances / settle-up.
