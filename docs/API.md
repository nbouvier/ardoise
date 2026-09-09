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

## Planned

- Groups ("counts") CRUD.
- Expenses CRUD with split definitions.
- Balances / settle-up.
