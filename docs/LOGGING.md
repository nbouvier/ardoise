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
| `http.request.failed`   | error | `error` (`type`, `message`, `code`, `stack`) | A request ended in an unhandled error; the client got `{ "error": "internal_error" }`. Also reported to Sentry; the log line and the issue are the only places the cause is visible. |
| `http.request.rejected` | info  | `status`, `code`             | A request was refused before or outside a route's own handling: malformed JSON, body too large, unsupported content type, or `429` for rate limiting (`status: 429`). A burst of 429s from one address is how abuse of `/auth/*` shows up. |

The error is logged as a plain `error` object rather than under pino's `err` key: that
serializer copies every property, and a Postgres error's `detail` holds the offending
value. The `message` is kept — it is what makes the failure diagnosable — but some
driver messages quote the value that was rejected, so treat these logs as sensitive.

### Database events

| Event           | Level | Fields                               | Meaning |
| --------------- | ----- | ------------------------------------ | ------- |
| `db.pool.error` | error | `error` (`type`, `message`, `code`)  | The Postgres pool reported an error on an idle connection (database restart, failover, network drop). The broken connection is discarded and replaced on the next query; queries that were running on it fail and surface as `http.request.failed`. Repeated occurrences mean the database is unstable. |

### Release-step events

Emitted by `npm run migrate:deploy` (`src/scripts/migrate.ts`), which runs once per
release, outside the server process, and logs JSON on stdout like the server does.

| Event                | Level | Fields                       | Meaning |
| -------------------- | ----- | ---------------------------- | ------- |
| `db.migrate.started`   | info  | `pending`                    | Number of migrations about to be applied (0 when the schema is already current). |
| `db.migrate.completed` | info  | `applied`, `durationMs`      | The schema is up to date. |
| `db.migrate.failed`    | error | `error` (`type`, `message`, `code`, `causeMessage`) | The step failed (bad configuration, unreachable database, a migration error); it exits 1 and the release must not go on. |

### Lifecycle events

| Event                       | Level | Fields                    | Meaning |
| --------------------------- | ----- | ------------------------- | ------- |
| `server.start.failed`       | error | —                         | The process could not start (bad port, pending migrations in production, unreachable database…); it exits 1. |
| `server.shutdown.started`   | info  | `signal`, `timeoutMs`     | SIGTERM / SIGINT received: the server stopped accepting connections and is draining. |
| `server.shutdown.completed` | info  | —                         | Drained and database closed; the process exits 0. |
| `server.shutdown.timeout`   | error | `timeoutMs`               | In-flight requests did not finish in time; the process exits 1 anyway. Something is holding a request open. |
| `server.shutdown.failed`    | error | error                     | Closing raised (database pool, hook); the process exits 1. |

### Group and transaction events

| Event                        | Level | Fields                                                    | Meaning |
| ----------------------------- | ----- | ---------------------------------------------------------- | ------- |
| `groups.access.refused`       | info  | `userId`, `groupId`, `reason`                               | A group (or transaction) route was refused — not a member, archived, not owner… Shared across both features so a spike reads the same way regardless of which route tripped it. |
| `transactions.access.refused` | info  | `userId`, `groupId`, `reason`                               | A transaction-specific refusal: `not_group_member` (payer/participant not in the group) or `invalid_split`. |
| `transactions.created`        | info  | `userId`, `groupId`, `transactionId`, `kind`, `splitMode`, `participantCount` | A transaction was recorded. |
| `transactions.updated`        | info  | `userId`, `groupId`, `transactionId`                        | A transaction was edited. |
| `transactions.deleted`        | info  | `userId`, `groupId`, `transactionId`                        | A transaction was deleted. |
| `groups.placeholder.claimed`  | info  | `userId`, `groupId`, `placeholderId`, `transactionsRewritten`, `transfersDeleted`, `membershipsGained` | A member said "This is me": the placeholder's transactions became theirs (`docs/specs/placeholder-members.md`). |
| `groups.placeholder.removed`  | info  | `userId`, `groupId`, `placeholderId`, `transactionsAnonymised`, `transfersDeleted` | A placeholder was taken out of its tree; its part became Others. |
| `groups.placeholder.renamed`  | info  | `userId`, `groupId`, `placeholderId`                        | A placeholder was renamed. |

`groups.created` and `groups.members.added` also carry `placeholdersCreated`. **Never** log
a placeholder's name: it is personal data about someone who is not on Ardoise, typed by a
member. Its id is enough.

**Never** log a transaction's title, comment or amount — user content and financial data,
not diagnostic context. The transaction id is enough to look it up.

### Account events

`docs/specs/account-deletion.md`. The account id is all that identifies the person, before
and after: never their name, e-mail address, or an amount they lose.

| Event                        | Level | Fields | Meaning |
| ---------------------------- | ----- | ------ | ------- |
| `account.deleted`            | info  | `userId`, `friendshipsRemoved`, `groupsLeft`, `ownershipsPassed`, `groupsDeleted`, `transactionsAnonymised`, `transfersDeleted`; `source: 'operator'` from the command | An account was deleted, by its owner (`DELETE /me`) or by the operator command (`src/scripts/delete-accounts.ts`). These lines are also the only trace of a deletion outside the database (`docs/OPERATIONS.md`, "Known limits"). |
| `account.delete.failed`      | error | `userId` (from the route), `error` (from the command) | Deletion failed and was rolled back entirely. From the route, the error itself follows as `http.request.failed`, which is reported to Sentry. |
| `account.delete.absent`      | info  | `userId` | The operator command was given an id not in this database; it is only kept on the deleted-accounts list. |
| `account.delete.invalid_id`  | warn  | `position` | The operator command was given something that is not an id; it is not echoed, it could be anything. The command exits 1. |
| `account.delete.no_ids`      | error | — | The operator command was run without any id. |

## Client (`apps/mobile`)

- Structured logger in `src/lib/logger.ts` (`logger.info/warn/error/debug`, plus
  `errorFields()` for safe error serialisation). Application code logs through it, never
  `console` directly.
- Two sinks: the console (silent under `NODE_ENV=test`), and error reporting — see
  "Error reporting (Sentry)" below for what each level turns into there.
- Auth events: `auth.session.restore.rejected` / `.failed`, `auth.session.started`,
  `auth.session.refresh.failed`, `auth.session.revoke.failed`, `auth.token_store.*`,
  `auth.account.deleted`. Never log tokens.
- Account deletion (`docs/specs/account-deletion.md`): `account.deletion_preview.failed`
  and `account.delete.failed` (warn, with `errorFields`) — the page stays, with a retry.

## Error reporting (Sentry)

Logs say what happened on one machine and are gone after a while; nobody reads a phone's
console. Failures that need a human are also sent to **Sentry** (sentry.io, free plan,
**EU data region**), which groups identical errors into one issue, counts the users it
affects and alerts by e-mail. One Sentry project per app (`ardoise-mobile`,
`ardoise-server`); production and staging are the `environment` of each report, not
separate projects, and alert rules filter on `environment:production`.

Reporting is **off without a DSN**: local development, tests and the web target never
report. The free plan allows 5,000 errors a month for the whole organization and one
member; past the quota, reports are dropped until the next month (no pay-as-you-go budget
is set, so nothing is billed).

### Mobile

`src/lib/error-reporting.ts`, started from the root layout before the first render
(build side and variables: `docs/MOBILE.md`, "Error reporting (Sentry)").

| What | Becomes in Sentry |
| --- | --- |
| Uncaught JavaScript error, unhandled promise rejection, native crash | An issue (captured by the SDK itself). |
| An error thrown while rendering | An issue, and the crash screen ("Something went wrong", *Try again*) instead of a blank app: the root `ErrorBoundary` in `src/app/_layout.tsx`. |
| `logger.error(...)` | An issue, always (`captureException` when the fields came from `errorFields`, otherwise `captureMessage`). |
| `logger.warn(event, errorFields(error))` | An issue **only if the error is unexpected**: not a `NetworkError` (no connection), not an `ApiError` (an API refusal; a 5xx is reported by the server), not a cancelled Google dialog. A contract mismatch, a native module failing or a plain bug is. |
| Every log event (any level) | A breadcrumb: the trail of events attached to the next issue. |

An issue is tagged `event:<log event name>`, so `groups.load.failed` in the logs and in
Sentry are the same thing. `errorFields()` keeps the original error (and its stack) on a
symbol key, invisible when the fields are printed, for the reporter to use.

**What never leaves the phone.**

- `sendDefaultPii: false`: no IP address, no device name. The user is attached as their
  opaque internal id only (`setUser({ id })` on sign-in, cleared on sign-out) — no e-mail,
  no name — so Sentry can count affected users.
- Fields of reports and breadcrumbs whose name matches tokens, authorization, password,
  secret, cookie, e-mail, amount, title, comment, picture or `…name` are replaced with
  `[redacted]`, whatever their value.
- Invitation codes are bearer secrets (whoever holds one can join): in any URL or message,
  `/invites/<code>`, `/i/<code>` and `ardoise://invite/<code>` become `…/[code]`.
- The console breadcrumbs are dropped (the logger's own, scrubbed ones replace them).
- No performance tracing, no session replay, no screenshots.

### Server

`src/error-reporting.ts`, started by `src/index.ts` (the process entry point; `buildApp`
and the tests never start it). Configuration: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`
(`DEPLOY_ENV` in the Compose stack), `APP_RELEASE` (baked into the image) —
`docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`.

Reporting is explicit, next to the log line, with the event name as the `event` tag:

| Event | Reported |
| --- | --- |
| `http.request.failed` | With `method`, the route **template** (`/groups/:groupId`, never the raw URL) and `status`. 4xx are never reported. |
| `server.start.failed` | Then waits for the report to be sent before exiting. |
| `db.pool.error` | Each occurrence; Sentry groups them in one issue. |
| `server.shutdown.timeout`, `server.shutdown.failed` | Queued reports are sent before the process exits. |
| Uncaught exception, unhandled rejection | By the SDK, which then exits the process as Node would (Docker restarts it). |

The SDK's own `Fastify` integration is removed: it reported every 5xx untagged, and the
SDK's de-duplication then dropped the tagged report.

**What never leaves the machine.** The SDK collects a lot by default; all of it is off
(`dataCollection`): request headers (the `Authorization` bearer), cookies, request and
response bodies (amounts, titles), query strings, user info, database query data, and
the values of local variables in stack frames. As a second net, `beforeSend` keeps only
the method and URL of the request an error happened in, replaces invitation codes in the
URL with `[code]`, and redacts any `extra` field named like a token, password, e-mail,
amount, title, comment or `detail`. What remains is the error's type, message and stack.
A driver error's **message** can still quote a value (see `http.request.failed` above):
the same caveat as for the logs. Checked end to end against a fake ingest endpoint: a
request carrying a bearer token, a cookie, an invitation code, a query string and a body
with a title and an amount produced a report containing none of them.

## Shared rules (both apps)

- Structured fields over interpolated strings.
- Never log passwords, tokens, secrets, authorization headers, connection strings,
  payment data or unnecessary personal data.
- No successful logs from high-frequency render paths or tight loops.
- Log a failure once, at the boundary where it becomes operationally meaningful.
