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

### HTTP events

| Event                   | Level | Fields                       | Meaning |
| ----------------------- | ----- | ---------------------------- | ------- |
| `http.request.failed`   | error | `error` (`type`, `message`, `code`, `stack`) | A request ended in an unhandled error; the client got `{ "error": "internal_error" }`. The only place the cause is visible. |
| `http.request.rejected` | info  | `status`, `code`             | Fastify rejected the request before a handler ran (malformed JSON, body too large, unsupported content type). |

The error is logged as a plain `error` object rather than under pino's `err` key: that
serializer copies every property, and a Postgres error's `detail` holds the offending
value. The `message` is kept — it is what makes the failure diagnosable — but some
driver messages quote the value that was rejected, so treat these logs as sensitive.

### Group and transaction events

| Event                        | Level | Fields                                                    | Meaning |
| ----------------------------- | ----- | ---------------------------------------------------------- | ------- |
| `groups.access.refused`       | info  | `userId`, `groupId`, `reason`                               | A group (or transaction) route was refused — not a member, archived, not owner… Shared across both features so a spike reads the same way regardless of which route tripped it. |
| `transactions.access.refused` | info  | `userId`, `groupId`, `reason`                               | A transaction-specific refusal: `not_group_member` (payer/participant not in the group) or `invalid_split`. |
| `transactions.created`        | info  | `userId`, `groupId`, `transactionId`, `kind`, `splitMode`, `participantCount` | A transaction was recorded. |
| `transactions.updated`        | info  | `userId`, `groupId`, `transactionId`                        | A transaction was edited. |
| `transactions.deleted`        | info  | `userId`, `groupId`, `transactionId`                        | A transaction was deleted. |

**Never** log a transaction's title, comment or amount — user content and financial data,
not diagnostic context. The transaction id is enough to look it up.

## Client (`apps/mobile`)

- Structured logger in `src/lib/logger.ts` (`logger.info/warn/error/debug`, plus
  `errorFields()` for safe error serialisation). Application code logs through it, never
  `console` directly.
- Currently writes to the console sink; silent under `NODE_ENV=test`. A remote transport
  can be added there without touching callers.
- Auth events: `auth.session.restore.rejected` / `.failed`, `auth.session.started`,
  `auth.session.refresh.failed`, `auth.session.revoke.failed`, `auth.token_store.*`.
  Never log tokens.

## Shared rules (both apps)

- Structured fields over interpolated strings.
- Never log passwords, tokens, secrets, authorization headers, connection strings,
  payment data or unnecessary personal data.
- No successful logs from high-frequency render paths or tight loops.
- Log a failure once, at the boundary where it becomes operationally meaningful.
