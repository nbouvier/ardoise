# Testing

Living document. Conventions live in `docs/guidelines/TESTING.md`; this file records the
current setup and state.

## Tooling

| Workspace       | Runner    | Command                                     |
| --------------- | --------- | ------------------------------------------- |
| `apps/mobile`   | jest-expo | `npm run test --workspace @splitcount/mobile` |
| `apps/server`   | Vitest    | `npm run test --workspace @splitcount/server` |
| `packages/shared` | Vitest  | `npm run test --workspace @splitcount/shared` |

From the repository root:

```bash
npm test          # runs every workspace's test script
npm run typecheck # tsc --noEmit in every workspace
npm run lint      # expo lint (mobile) + eslint (server)
```

## Layout

Co-locate tests with the code they cover: `foo.ts` → `foo.test.ts`, or a `__tests__/`
folder beside the unit under test. Feature test plans are derived from the feature spec's
acceptance criteria before implementation.

## Server tests

Prefer integration tests that build the Fastify app via `buildApp()` and drive it with
`app.inject(...)` (see `apps/server/src/routes/health.test.ts`). Vitest runs with
`NODE_ENV=test` and a silent logger. Unit-test isolated logic (calculations,
authorization rules) directly.

Database-backed tests use an in-memory **PGlite** instance (real Postgres SQL, no
external service), migrated **once per test file**:

- `createTestContext()` (`src/test/app.ts`) — a ready Fastify instance plus `reset()`.
  Build it in `beforeAll`, call `reset()` in `beforeEach`. This is the default: migrating
  a PGlite database costs a second or two, so one per *test* made the suite five times
  slower for no extra isolation.
- `createTestApp()` — the same without the reset, for a file whose tests write nothing.
- `createTestDatabase()` / `resetDatabase()` (`src/test/database.ts`) — the handle-level
  building blocks.
- `signInAs(app, idToken)` (`src/test/auth.ts`) — a signed-in user and their headers.

Close it in `afterAll` (`app.close()` / `handle.close()`). External boundaries such as
Google token verification are mocked, never contacted.

Vitest's default timeouts are raised (`hookTimeout` 60s, `testTimeout` 30s in
`apps/server/vitest.config.ts`). Every database-backed file starts and migrates its own
PGlite, and the files run concurrently, so on a busy machine that setup alone can exceed
the 10s/5s defaults — a spurious failure that says nothing about the code. The timeouts
are a ceiling for setup, not a licence for slow tests: a *test* that needs seconds is
doing too much.

The root `npm test` runs `pretest` first, which builds `@splitcount/shared` so both apps
resolve its compiled output.

## Client tests

`jest-expo` is configured. Import test globals explicitly from `@jest/globals` (ambient
`@types/jest` is not wired). Use `@testing-library/react-native` for component tests.
`transformIgnorePatterns` also transforms `@splitcount/shared`; native modules are mocked
(`__mocks__/`), and injected fakes (`GoogleModule`, `TokenStore`) keep native code out of
`AuthClient` tests. `@expo/ui`'s date picker is mocked the same way
(`__mocks__/@expo/ui/community/datetime-picker.tsx`, mapped explicitly in `moduleNameMapper`
since it's a deep subpath import): pressing the mock reports a fixed date, enough to test
the wiring around it without a real host view, which Jest cannot render. Real calendar
interaction is a device concern.

Gestures and animations run under Jest through `apps/mobile/jest.setup.js`:
gesture-handler's own `jestSetup`, `react-native-worklets` mocked (worklets run as plain
functions) and Reanimated's `setUpTests()`. A gesture is driven with
`fireGestureHandler(getByGestureTestId('…'), [BEGAN, ACTIVE, END events])` from
`react-native-gesture-handler/jest-utils` — the app's own gestures carry test ids
(`pager`, `dismiss-page`, `pull-to-refresh`) — inside `act`, since the result reaches React
through `scheduleOnRN`. The decisions themselves (`pageAfterSwipe`, `dragPosition`,
`dismissesPage`, `refreshesOnRelease`) are pure and tested directly. Under Jest nothing is
laid out, so a `Pager` page is as wide as the window: swipe by a fraction of
`Dimensions.get('window').width`. The pages next to the one shown are drawn but hidden
from accessibility, so default queries only see the page shown; pass
`includeHiddenElements: true` to reach a neighbour. The bottom tabs' navigator
(`PagerTabs`) is driven through `renderRouter` from `expo-router/testing-library`
(its `toHavePathname` / `getPathname` do not survive RNTL v14's async render — assert on
the selected tab and the page shown instead). The drawn pull-to-refresh is Android's;
tests run as iOS, so the screens' own tests drive the native `RefreshControl` and
`PullToRefreshScrollView` is tested directly. What a swipe *feels* like is a device
concern.

## Current state

- `apps/server`: `GET /health` integration test; database migration tests
  (`src/db/client.test.ts`); auth unit + integration tests (`src/features/auth/`);
  invitation code and landing-page tests (`src/features/invites/`), including HTML
  escaping of both an inviter name and a group name; friends integration tests
  (`src/features/friends/`) covering the invitation lifecycle, friendship symmetry, and
  (`docs/specs/favorites.md`) that `GET /friends` carries the pair group's `groupId` and
  `favorite`, personal to the caller, and lists favorited friends first; groups unit +
  integration tests (`src/features/groups/`) covering membership authorization on every
  route, archiving, deletion cascades, group invitations, the implicit pair group
  (created eagerly at friendship creation rather than on first access, a single group
  under a race, immutability, cascade on unfriend), and favorites
  (`docs/specs/favorites.md`): toggling, idempotence, personal-to-the-caller, unaffected
  by archived state, refused for a non-member, dropped when the membership is removed,
  and favorite-first ordering within both the group list's active/archived sections and a
  parent's joined sub-groups, plus `GET /groups/favorites` (`docs/specs/home.md`):
  gathering all three kinds at once, active-then-alphabetical ordering with a pair group
  sorted under the other member's name, a sub-group's ancestors and own balance, empty
  for a caller who has starred nothing, and never another member's;
  transactions unit + integration tests (`src/features/transactions/`) covering the
  balance calculation (sign convention, sum-to-zero) in isolation, and end-to-end: every
  split shape, the pair-group regression (transactions must **not** be refused by the
  same guard that blocks every other pair-group mutation), archived-group read-only
  behaviour, cross-group transaction access, cascade deletion, and the category field
  (round-trips, defaults to Other, an unknown value is refused, resets to Other when none
  is given), and `GET /me/transactions` (`docs/specs/home.md`): the involvement filter
  from both sides (paid by the caller, concerning the caller, and — the one that must
  **not** appear — a transaction between two other members of the caller's own group),
  the membership boundary (a group the caller has left serves nothing, even where they
  are still a participant), and the cap with same-day ties in recording order. Group
  balances are covered in `features/groups/plugin.test.ts`, including
  **containment**: a sub-group's own figure stays in the sub-group, a parent's is its own,
  every level of a nested tree carries its own, and an unjoined sub-group shows `0` — the
  regression guarding the removed sub-tree roll-up.
- `packages/shared`: the split algorithm (`splitByShares`) — the sum invariant across
  many generated totals/weights/group sizes, rounding determinism, tie-breaking — the
  transaction request schema's shape per kind, the category preset list (unique keys,
  emoji, label and a distinct colour each), and the statistics breakdown
  (`categoryBreakdown`): kind filtering (transfers never count), a selected subset of
  participants using their own shares rather than what they paid (single member, several
  summed, and an empty selection), ordering, and the two sum invariants — amounts to the
  total and percentages to exactly 100 — across many generated shapes; and the
  reimbursement planner (`planReimbursements`): the clearing property and the
  payment-count bound over 200 generated balance sets, exact-match pairing, a chain of
  debts collapsing into one payment, zero-balance people left out, and independence from
  input order.
- `apps/mobile`: `src/lib/stable-order.test.ts` — the order-preserving merge behind the
  "don't jump when I favorite it" behaviour below: known ids keep their previous position,
  a fresh field value applies without moving the row, an id absent from the previous order
  is appended, one dropped from the fresh data disappears, and an empty previous order
  keeps the fresh data as-is; API clients (`src/lib/api/`, with shared fakes in
  `src/test-utils/`), auth state machine (`src/features/auth/auth-client.test.ts`), auth
  screens, the invitation feature (`src/features/invites/`): pending-invite store and the
  confirmation flow for both kinds of invitation, the friends feature
  (`src/features/friends/`): list, the one "New friend" page (invite link and code entry
  together, a typed code handed off, the chevron that closes it), opening the group shared
  with a friend directly by its already-known id (no request first), and the favorite star
  (`docs/specs/favorites.md`) on a friend's row — toggling through the same
  `setGroupFavorite` a group uses and pinning favorited friends first — the groups feature
  (`src/features/groups/`): list with the archived toggle, the one "New group" page (creation with friend selection,
  then joining by code — a pasted link cut down to its code — and the chevron that closes it),
  the detail screen — four tabs (Transactions by default, Balances, Statistics, Manage),
  with group management on Manage, including the pair-group variant where every management action is absent **but
  "Add a transaction" is present** — plus the favorite star (`docs/specs/favorites.md`) on
  the group list row, the group screen's header (including on a pair group's own page),
  and a joined sub-group's own row, including the notify-then-refetch path a sub-group's
  own toggle relies on, and — on both the group list and the friend list — that starring a
  row moves it across the divider rule at once (no rule while nothing is a
  favorite), and a *later* refresh (another change elsewhere notifying the same
  `groupsChanged` signal) brings the server's order into view — the home feature
  (`src/features/home/`): the identity block, both sections' empty states, favorites of
  every kind listed with a sub-group's breadcrumb, a star taking its row *out* of that
  section (rather than moving it, as everywhere else), the latest list naming the group
  each transaction happened in and opening that group rather than the transaction, both
  sections re-reading when something changes elsewhere (`transactionsChanged` /
  `groupsChanged`), and one section failing and retrying without taking the other or the
  identity down — and the transactions feature
  (`src/features/transactions/`): the split editor (selection, weight stepper, live
  preview, mode switching, the allocation indicator), the add/edit form (defaults — Other
  by default — request shape for each kind, full-replace edit, transfer validation, the
  category badge that opens the picker sheet and updates the badge without a separate
  save step), the category picker (selection; every category is reachable, none has a
  "clear" behaviour), `transaction-request.ts` (rebuilding a split for the form),
  the transaction row's "my share" calculation and category emoji, and the date field's
  local-date conversion (no time-zone shift) and its iOS/Android wiring; and the
  statistics feature (`src/features/statistics/`): the donut geometry (the ring always
  closes, a sliver stays visible, a full ring is drawn as two halves) and the statistics
  sheet (totals and legend, one arc per category, the type toggle, narrowing and summing
  the per-member selection, the "select at least one" empty state, selecting and
  deselecting a slice, and each empty state saying *which* view is empty); and the
  reimbursements feature (`src/features/reimbursements/`): a chain of debts shown as one
  payment, each payment worded from the viewer's point of view with their own first,
  recording one by tapping it, the explained (not silent) refusal on an archived group or
  with a former member, the settled state, and the derived-from-balances states — the
  balances' spinner while they load, their retry on failure, and never a "settled" read
  produced by a failure — plus, on the group screen, the plan opening from the header and
  handing a pre-filled transfer to the transaction form (the debtor as payer, not the
  viewer).

### Gotchas

- When faking `useAuth`, return **the same object on every render**. The real context
  memoises its value, so `authorizedFetch` is stable; a fresh `jest.fn()` per render makes
  every `useCallback`/`useEffect` that depends on it re-run, and data-loading screens loop.
- `toHaveTextContent('…')` compares the element's **whole** text, not a substring (RNTL
  v14). Pass a regex (`toHaveTextContent(/Travel/)`) when the element also renders an
  emoji or a suffix.
- Server tests that depend on time inject a clock (`invites: { now }` / `groups: { now }`
  in `createTestContext`) rather than waiting.
- A screen that navigates needs `expo-router` mocked (`useRouter: () => ({ push })`).
  Assert on the typed object form — `{ pathname: '/groups/[id]', params: { id } }` — since
  that is what the code passes.
- `resetDatabase` truncates `users` and `groups` with `cascade`. Those are the two roots:
  a standard group hangs off no user, so truncating `users` alone would leave it behind.
  A new top-level table needs adding there.
