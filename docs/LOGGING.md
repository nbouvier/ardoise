# Logging

Living document. Conventions live in `docs/guidelines/LOGGING.md`; this file records the
current setup and state.

## Server (`apps/server`)

- Uses the Fastify built-in logger (pino).
- Level from `LOG_LEVEL` (`apps/server/.env.example`); `info` by default, `silent` in tests.
- `development` pipes through `pino-pretty`; other environments emit JSON.
- Fastify logs one line per request automatically. Add explicit logs only for meaningful
  lifecycle or failure events, with stable event names (e.g. `server.start.failed`).

### Auth events

| Event                          | Level | Fields        | Meaning                                        |
| ------------------------------ | ----- | ------------- | ---------------------------------------------- |
| `auth.session.issued`          | info  | `userId`      | Sign-in succeeded, a session was created       |
| `auth.google.verify.failed`    | warn  | `reason`      | Google rejected the ID token (categorised)     |
| `auth.session.refresh.reused`  | warn  | —             | A revoked refresh token was presented (possible theft) |
| `auth.session.revoked`         | info  | —             | Sign-out revoked a session                     |

Never log tokens, ID tokens, authorization headers or the refresh-token hash.

## Client (`apps/mobile`)

- No structured logger yet. Application code must not use `console.log`.
- Introduce a small logger module before the first feature that does async work, network
  I/O or background sync.

## Shared rules (both apps)

- Structured fields over interpolated strings.
- Never log passwords, tokens, secrets, authorization headers, connection strings,
  payment data or unnecessary personal data.
- No successful logs from high-frequency render paths or tight loops.
- Log a failure once, at the boundary where it becomes operationally meaningful.
