# Architecture

Living document. Update it whenever a structural decision is made or changed.

## Overview

SplitCount is an npm-workspaces monorepo with a mobile client and a backend API. The
**server is the source of truth** for all shared data; the mobile client reads and writes
exclusively through the HTTP API.

The mobile client runs as an **Expo development build** (embeds `expo-dev-client`), not
the Expo Go sandbox — it relies on native modules Expo Go does not bundle, and Google
sign-in will need a native SDK. The web target still runs without a native build. See
`docs/MOBILE.md`.

## Repository layout

```text
apps/
  mobile/          Expo (SDK 57) / React Native / TypeScript client.
    src/
      app/         Expo Router routes. Files map to screens; _layout.tsx defines navigation.
      components/  Shared presentational building blocks. ui/ holds lower-level primitives.
      hooks/       Reusable hooks. Platform variants use .web.ts / .ios.tsx / .android.tsx.
      constants/   Design tokens (colours, spacing, fonts) in theme.ts.
      features/    One folder per product feature (auth: state, screens, Google, storage;
                   friends: list, invitations, deep-link capture; groups: list,
                   creation, detail, membership).
      lib/         Cross-feature building blocks: logger, API client (lib/api).
    assets/        Images and fonts.
    metro.config.js  Monorepo-aware Metro config (watches the repo root).
  server/          Node / Fastify / TypeScript API.
    src/
      index.ts     Process entrypoint: builds the app and starts listening.
      app.ts       buildApp() factory — a configured Fastify instance, no listener.
      config/      Typed environment loading (env.ts, Zod-validated).
      routes/      Cross-cutting HTTP routes (health). Feature routes live under features/.
      features/    One folder per product feature: routes, services, repository, tests.
      db/          Drizzle schema (schema.ts), client/driver selection (client.ts),
                   Fastify plugin (plugin.ts). SQL migrations in server/drizzle/.
      test/        Test helpers (in-memory DB, ready app).
packages/
  shared/          @splitcount/shared — platform-neutral API contract (Zod schemas +
                   inferred types) shared by both apps. No React Native, no Node-only
                   APIs, no secrets. Built to dist/ (ESM); consumers resolve types
                   straight from src/ so a rebuild is only needed for runtime/bundling.
docs/              Living documentation (this folder). Transverse, stays at the root.
docs/specs/        Feature specifications — source of truth for established behavior.
docs/guidelines/   Authoring conventions.
tsconfig.base.json Shared TypeScript compiler options; each workspace extends it.
```

## Workspace boundaries

- `apps/mobile` and `apps/server` never import from each other.
- Shared code lives in a `packages/*` workspace and must stay platform-neutral: no React
  Native, no Node-only APIs, no server secrets.
- A `packages/*` workspace depends on neither app.
- Adding a workspace requires a justification recorded here.

### Workspaces

| Workspace              | Justification                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `@splitcount/shared`   | The auth feature is the first client/server contract. Request and response shapes (`/auth/google`, `/auth/refresh`, `/auth/me`) and the `UserProfile` / `AuthSession` types must stay identical on both sides; duplicating Zod schemas would drift. Added 2026-09-09 with Google sign-in. Extended 2026-09-10 with the friends contract (`FriendSummary`, invitation responses), 2026-09-11 with the groups contract and the generalised invitation contract, and 2026-09-11 with the transactions contract and split arithmetic (`transactions.ts`) — the first *logic*, not just schemas, in the package: the client needs to preview a split live while composing a transaction, and the server needs to compute the same split as the authority, so the rounding algorithm itself has to be one implementation, not two that could drift. Now `auth.ts`, `friends.ts`, `groups.ts`, `invites.ts`, `transactions.ts`. |

## Client / server contract

- REST over HTTP/JSON. Request and response shapes are validated with Zod on the server;
  the schemas live in `@splitcount/shared` and the client validates responses with them.
- When a type or schema is needed on both sides, it moves into `@splitcount/shared`
  rather than being duplicated.
- The mobile client treats the server as authoritative: no offline write model yet.
- Auth: the client sends a Google ID token, the server verifies it and returns a
  SplitCount session (short access JWT + rotating refresh token). The client stores the
  refresh token in the OS secure store and refreshes transparently on 401.
- The API is JSON everywhere except `GET /i/:code`, the public invitation landing page,
  which is HTML because a browser opens it before the app is involved.
- Almost every route is authenticated; `GET /invites/:code` is deliberately not, so an
  invited person can see who is inviting them — and into what — before signing in.

## Conventions

- Organise code by feature once features exist. A feature owns its screens, components,
  hooks, state, routes and tests.
- Reuse existing abstractions before adding new ones.
- Avoid speculative abstraction and indirection: add structure at the second concrete use.
- Path alias in mobile: `@/*` → `apps/mobile/src/*`, `@/assets/*` → `apps/mobile/assets/*`.
- Server relative imports use `.js` extensions (NodeNext resolution).

## Tooling

| Concern            | Choice                                    |
| ------------------ | ----------------------------------------- |
| Monorepo           | npm workspaces                            |
| Language           | TypeScript (strict, shared base config)   |
| Mobile framework   | Expo Router                               |
| Server framework   | Fastify                                   |
| Server dev runner  | tsx; build via `tsc`                      |
| Validation         | Zod (server; shared schemas later)        |
| Mobile tests       | jest-expo                                 |
| Server tests       | Vitest (`app.inject` integration tests)   |
| Mobile lint        | `eslint-config-expo` (flat)               |
| Server lint        | `typescript-eslint` (flat)                |
| Server logging     | Fastify / pino                            |
| Database           | PostgreSQL + Drizzle ORM (drizzle-kit migrations); PGlite embedded in dev/test |

## Key decisions

| Date       | Decision                                                  | Rationale                                   |
| ---------- | -------------------------------------------------------- | ------------------------------------------- |
| 2026-09-09 | Expo Router for mobile navigation                         | Standard for modern Expo apps               |
| 2026-09-09 | Design tokens centralised in `apps/mobile/src/constants` | Single source for colours/spacing           |
| 2026-09-09 | npm-workspaces monorepo: `apps/mobile` + `apps/server`   | One place to manage client and server       |
| 2026-09-09 | Server is the source of truth; no offline write model    | Simpler data model to start                 |
| 2026-09-09 | Fastify + Zod + REST for the API                          | Light, TS-first, framework-agnostic contract |
| 2026-09-09 | Vitest for server tests                                   | Fast, native TS/ESM                         |
| 2026-09-09 | PostgreSQL + Drizzle; PGlite embedded in dev/test         | SQL-first, strong types; no external service to run tests |
| 2026-09-09 | Mobile runs as an Expo development build, not Expo Go     | Native modules + upcoming Google sign-in     |
| 2026-09-09 | `@splitcount/shared` workspace for the API contract       | First shared client/server contract (auth)   |
| 2026-09-09 | Auth: Google ID token verified server-side → own session | Google tokens are short-lived; we need persistent, revocable sessions |
| 2026-09-09 | Session = short JWT access token + rotating DB refresh token | Persistent sign-in + real server-side sign-out / revocation |
| 2026-09-10 | Invitation links hosted by the API (`GET /i/:code`) + `splitcount://` scheme | No domain or store presence yet; Universal/App Links slot in later without changing the contract |
| 2026-09-10 | No deferred deep linking: the landing page shows a code to type in | A third-party attribution SDK (Branch, AppsFlyer) is not worth it before the app is in stores |
| 2026-09-10 | Friendships stored once per pair, in a canonical order | The unique constraint alone rules out duplicates, including under concurrent acceptance |
| 2026-09-10 | `FriendSummary` (no email) is how another user is exposed | A public invitation preview must not leak the inviter's email address |
| 2026-09-11 | One `invites` table and one code space for every kind of invitation | The client captures a code before it can know what it leads to; one link format, one landing page, one preview route |
| 2026-09-11 | `friends` and `groups` register an `InviteHandler` rather than `invites` knowing them | Keeps the two features independent of each other while sharing the code lifecycle |
| 2026-09-11 | A `users` read module shared by `friends`, `groups` and `invites` | The open item below came due: a third feature needed `users` |
| 2026-09-11 | The pair group is keyed by the friendship (`groups.friendship_id`, unique) | "One group per pair, gone with the friendship" becomes a database guarantee, not application logic |
| 2026-09-11 | Pair groups are created lazily, on first access | No backfill for existing friendships, and `friends` needs no write dependency on `groups` |
| 2026-09-11 | A non-member gets `404` for a group, never `403` | A `403` would confirm the group exists |
| 2026-09-11 | One migrated PGlite per *test file*, truncated between tests | A database per test cost seconds each; same isolation, suite down from 92s to 17s |
| 2026-09-11 | Split arithmetic (`splitByShares`, largest-remainder rounding) lives in `@splitcount/shared` | The client's live split preview and the server's authoritative recomputation must always agree; two implementations of cent rounding will eventually drift |
| 2026-09-11 | A shares split defaults every participant to weight 1; there is no separate "equal" mode | An equal split *is* a shares split where everyone is weighted the same — a dedicated mode would just be that one case with its own code path |
| 2026-09-11 | Balances are computed on the fly from `transactions` / `transaction_participants`, not stored | No denormalized total to keep in sync while the feature is new; revisit if querying at scale becomes a real cost (see Open items) |
| 2026-09-11 | Transactions are the one thing that works on a pair group like a standard group | Every other pair-group route is refused by `assertNotPairGroup`; transactions must not share that guard, or the pair group could never hold anything |
| 2026-09-11 | The balance between two people is attributed transaction by transaction (payer credited, concerned member debited), never derived from group balances | A group balance is a net against the *group*: it cannot say who owes whom. Deriving a per-person figure from settle-up suggestions instead would make the number move when an unrelated third party spends |
| 2026-09-11 | The per-friend balance is aggregated in SQL, while a group's stays an in-application sum | A group is bounded (a trip ends); the per-friend figure spans the caller's whole history across every group, so loading rows into Node is the wrong shape there |
| 2026-09-11 | The per-friend aggregate filters on "both people are on the transaction", with no group filter at all | Being on a transaction already implies having shared its group. Filtering on *current* membership instead would silently drop the debt of someone who left a shared group |
| 2026-09-11 | Each friend's balance rides on `GET /friends` rather than its own route; `friendSummarySchema` is left untouched | The friend list has no useful state without the amounts, and a second call would show names before figures. The summary shape is reused by group members, transaction participants and invitation previews, none of which have a balance |
| 2026-09-11 | The transaction date field uses `@expo/ui`'s `community/datetime-picker`, not a new dependency | `@expo/ui` was already a dependency but not yet linked into the native build; reusing it (SwiftUI `DatePicker` on iOS, a Material dialog on Android) needs the same native rebuild a brand-new picker library would have, for zero added dependency footprint |
| 2026-09-12 | A group's per-category breakdown is derived on the client, from the transactions the group screen already holds — no endpoint, no stored aggregate | It is the same call the screen already makes, and a second round trip would show a chart after the list it summarises. Valid only while the list is unpaginated (see Open items) |
| 2026-09-12 | The breakdown itself (`categoryBreakdown`) lives in `@splitcount/shared`, not in the mobile app | Same reasoning as the split arithmetic: the rule for what counts as spending, and the percentage rounding, must have one definition — and moving it behind an endpoint later is then an import change, not a rewrite |
| 2026-09-12 | Each category carries its own colour in the shared preset list | A chart and its legend describing different colours for the same category is a defect the type system can prevent; the colour is part of the category, not of the screen |
| 2026-09-12 | The donut is drawn with `react-native-svg` rather than stacked views | Thirteen arcs, exact hit-testing per slice and one implementation across iOS, Android and web. It is a native dependency, so it costs a dev-build rebuild (`docs/MOBILE.md`) |
| 2026-09-12 | Groups can nest via a single nullable `groups.parent_id`, not a materialised path or a closure table | The write path (create, delete) is simple and the read path (ancestors, descendants) is a bounded recursive query, since depth is capped; a closure table would trade that simplicity for write-time upkeep this scale does not need yet |
| 2026-09-12 | A group's parent is immutable after creation — no re-parenting endpoint | Removes cycle detection entirely: the tree is acyclic by construction, not by validation. Every tree computation (membership propagation, effective-archive, balance/statistics roll-up) is then a straightforward top-down or bottom-up walk instead of an open-ended graph problem |
| 2026-09-12 | Nesting depth is capped at five levels (`groups.depth`, 0-4), enforced at creation | Bounds every recursive tree query and rules out pathological chains, at a depth generous enough for any real trip/household structure; `depth` is stored (not recomputed) because it is fixed at creation and lets the cap be a simple check rather than a query |
| 2026-09-12 | Membership in a group implies membership in every ancestor, enforced at every write path (add, invite acceptance, join) rather than checked lazily on read | Makes "who can see this group's transactions" answerable from that group's own membership row alone, with no need to walk up the tree on every read — the invariant is paid for once, at the few places membership changes, not on every access |
| 2026-09-12 | A member of a group's immediate parent who has not joined it gets `403 join_required`, not `404`, when asking for that group | The one deliberate exception to "non-membership is always 404": the caller already legitimately knows the group exists, because it is shown to them in the parent's own sub-group list. Kept narrow — it never applies transitively to a sibling's or grandchild's existence |
| 2026-09-12 | A group's rolled-up balance and its statistics' "including sub-groups" scope are both resolved to "the group plus only the descendants the caller is a member of", entirely server-side | Consistent with `docs/specs/groups.md`'s visibility rule: a sub-group being *visible* must never leak into what its balance or statistics disclose about it |

## Open items

- Backend deployment target: VPS-style host (e.g. AWS EC2). Needs a managed Postgres and
  `DATABASE_URL` in the environment; `npm run migrate` in the deploy step.
- Access / refresh token lifetimes are first guesses (~15 min / ~60 days); tune before a
  public release.
- Development builds are local (`expo run:*`) for now; EAS Build not set up (see
  `docs/MOBILE.md`).
- Any dev build installed before `@expo/ui`'s `community/datetime-picker` was actually
  used (2026-09-11) needs regenerating — `npm run prebuild --workspace @splitcount/mobile`
  then `mobile:android` / `mobile:ios` — before the transaction date field works on
  device; see `docs/MOBILE.md`.
- `users` is shared domain data: the auth feature owns the writes, everyone else reads
  through `features/users/repository.ts` (extracted 2026-09-11, when `groups` became the
  third reader). `friendships` is now in the same position — `groups` reads it directly
  for the pair group and for "is this person a friend of the caller?", and imports only
  the pure `orderPair` helper from `friends`. If a third reader appears, extract it the
  same way. Since 2026-09-11 `friends` is in that position with the ledger: it builds
  `GET /friends`'s per-friend balance from `transactions`' own repository
  (`balancesWith`), behind a narrow `CounterpartyBalances` interface declared on its
  service — read-only, and not through the transactions *service*, since the aggregate is
  already scoped to transactions the caller is party to and needs no group membership
  check. `transactions` stays the owner of those tables and of the rule.
- Invitation lifetime (7 days) is a first guess; tune with real usage.
- Group ownership cannot be transferred, so an inactive owner strands a group nobody can
  delete. Deliberate for now; revisit with real usage (`docs/specs/groups.md`).
- Balances are recomputed from the transaction rows on every request, both per group and
  per friend (`docs/specs/balances.md`). Fine at the volume a trip or a flatshare
  produces, and deliberately so: a stored total is a duplicate that every write path
  (create, edit, delete, group deletion, friendship removal) must keep correct, and a
  drifted money figure is the worst failure this product can have.
  **The per-friend aggregate is the one to watch**: a group's history is bounded by the
  trip that ends it, but that query spans the caller's entire history and grows with the
  lifetime of the account. Revisit when it is measured slow, not before. The right shape
  then is a `pair_balances(user_a, user_b, amount_cents)` table written in the same SQL
  transaction as every transaction write — it matches the read pattern exactly, one
  indexed row per friend — with the current computation kept as the recompute oracle.
- The transaction list has no pagination yet (`docs/specs/transactions.md`); revisit once
  a group's history grows large enough to matter. **Paginating it breaks the group
  statistics silently**: the client-side breakdown would then describe only the loaded
  page while still reading as the whole group. Whoever paginates the list moves
  `categoryBreakdown` behind a `GET /groups/:groupId/transactions/statistics` route,
  carrying the same `scope` parameter nesting adds, in the same change — the function is
  already shared and server-ready.
- **Nested groups, added 2026-09-12** (`docs/specs/groups.md`): re-parenting a sub-group
  and promoting one to a root group are both deliberately out of scope. Adding either
  later needs cycle detection (parent is no longer fixed at creation) and a rule for what
  happens to a sub-group's existing memberships when its ancestor set changes — someone
  could end up a member of a sub-group without being a member of its new parent, which
  the current design makes structurally impossible.
- **`GET /groups`'s balance roll-up** scans, for every root group, the caller's
  transactions across that group's entire sub-tree — bounded by how deep one user's own
  groups nest (capped at five levels), not by the account's whole history, so it does not
  carry the same growth risk as the per-friend aggregate above. Revisit together with it
  if it is ever measured slow.
