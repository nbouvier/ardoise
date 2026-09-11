# Design

Living document for visual and interaction conventions. Update it as the UI evolves.

## Tokens

Defined in `apps/mobile/src/constants/theme.ts`:

- **Colours** — `Colors.light` / `Colors.dark` with roles: `text`, `textSecondary`,
  `background`, `backgroundElement`, `backgroundSelected`, plus `credit` / `debit` for a
  balance in or against the viewer's favour (lifted on dark, where the light greens and
  reds go muddy). Reach for them through `balanceTone()`
  (`src/features/transactions/balance-display.ts`) rather than testing the sign by hand.
  Destructive-action red is still written inline at its few call sites — a different
  meaning that happens to share a hue.
- **Spacing** — `Spacing` scale: `half` (2) → `six` (64). Use tokens, not raw numbers.
- **Fonts** — `Fonts` per platform: `sans`, `serif`, `rounded`, `mono`.
- **Layout** — `MaxContentWidth` (800), `BottomTabInset` per platform.

## Theming

- Light/dark driven by the OS colour scheme (`userInterfaceStyle: "automatic"`).
- On web, hydration-safe colour scheme via `apps/mobile/src/hooks/use-color-scheme.web.ts`.
- Use `ThemedText` and `ThemedView` rather than styling colours directly.

## Components

- `ThemedText` — typography variants (`title`, `code`, `small`, ...).
- `ThemedView` — themed surfaces, incl. `type="backgroundElement"`.
- `Button` — the action button: `primary` (filled) or `secondary` (outlined), with a busy
  state. The auth screens predate it and still style their own pressables.
- `AppTabs` — bottom tab navigation (Groups, Friends, Account). Groups is the index
  route and the app's landing screen.
- `Avatar` — someone's Google picture, falling back to the initial of their name. Used
  in every list of people.

## Screens

### Auth gate (`src/features/auth/auth-gate.tsx`)

Wraps the app. States:

- **loading** — centered `ActivityIndicator` while the session is restored (the animated
  splash overlay covers the first frames).
- **error** — "Can't connect" with a "Try again" button, when the server was unreachable
  on launch (the stored session is kept).
- **signedOut** — the sign-in screen.
- **signedIn** — the app (tabs).

### Sign-in (`src/features/auth/sign-in-screen.tsx`)

Full-screen, centered. Logo + "SplitCount" + tagline; a single primary "Continue with
Google" button (filled with the theme text colour). Inline red error text on failure
(not on user cancellation). On web the button is disabled with a "coming soon" caption.

### Account (`src/features/auth/account-screen.tsx`, tab `app/(tabs)/account.tsx`)

Google avatar (or initial fallback), name, email, and an outlined "Sign out" button.

### Groups list (`src/features/groups/groups-screen.tsx`, tab `app/(tabs)/index.tsx`)

The app's landing screen. Rows of name + member count, tappable to open the group. Empty
state: "No groups yet" with what a group is for. A footer holds the primary "Create a
group" action and the same "Got an invitation code?" entry as the Friends tab — a code is
a code, and the confirmation screen figures out whether it leads to a friendship or a
group.

**Archived groups** live under a discreet "Show archived (n)" toggle at the very bottom of
the list, and are rendered muted (55% opacity) with "n members · archived" when revealed.
They are hidden rather than greyed inline because the list is about what is still going
on; the count in the toggle is what keeps them findable. A list with only archived groups
shows the toggle, not the empty state.

### Group detail (`src/features/groups/group-screen.tsx`, route `app/groups/[id].tsx`)

Pushed above the tabs, so it has a back button. **Transactions are the primary content**:
the group's name, an "Archived" note when it applies, **the viewer's own balance**
("You are owed 21.25" / "You owe 8.00" / "You're all settled up" — said in words, so it
never rests on spotting a minus sign), the transaction list
(`TransactionRow`: title, date, kind, payer, and the viewer's own share, coloured), and a
primary "Add a transaction" button — absent on an archived group. A row opens the same
add/edit sheet, pre-filled; on an archived group rows render but are not pressable, read
only. Empty state: an explanation and the same "Add a transaction" action.

Group management — everything that used to sit directly on this screen — moved behind a
small "Details" button in the header, opening a sheet: the member list (avatar + name,
"Owner" on the owner), **balances** (`GroupBalances`: each member's name next to their
net, coloured, "settled up" at zero — a member who left with an unsettled balance still
appears, without an avatar), then the management actions.

The balances are read **once, by the group screen**, and handed to both the summary and
the sheet; the screen refreshes them after a transaction is saved or deleted, since a
balance cannot be patched from a single transaction the way the list can. The summary
keeps showing the last known figure while that reload is in flight, rather than blinking
on every save.

**One screen for both kinds of group**, in both the main view and the details sheet.
**Transactions behave identically on a pair group** — the one thing that does. Every
management action stays **absent**, not disabled, on a pair group, and the details
sheet's closing line explains that it is just the two of them. For a standard group:
"Add friends", "Share an invitation link" and "Rename" (all three gone while archived),
"Archive group" / "Reopen group", "Leave group" (hidden for an owner who still has
company), and a red text-only "Delete this group" for the owner. Destructive actions
confirm through an `Alert` that states what is lost.

States: loading, "This group is gone" (deleted, or the viewer was removed — no retry, just
a way back), and a retryable connection error.

### Add / edit a transaction (`src/features/transactions/transaction-form-screen.tsx`)

One sheet for recording and for editing — editing pre-fills it, and adds a red text-only
"Delete this transaction". Kind picker (Expense / Income / Transfer), title, amount, date
(`DatePickerField` — see below), optional comment, then "Who paid" (`MemberSelect`,
defaulting to the signed-in member). An expense or income continues with "Who it
concerns" (`SplitEditor`); a transfer replaces it with a single "To" picker instead, excluding the
payer. "Save" is disabled until the title, amount, date and split are all valid.

### Split editor (`src/features/transactions/split-editor.tsx`)

Every member as a checkbox row (all pre-selected by default, on the caller's side — this
component just edits whatever selection it is given), plus a **Shares / Fixed amounts**
toggle. In shares mode each checked member gets a −/+ weight stepper (default 1 — an
equal split is simply everyone at the same weight) and a live-computed "= 12.34" preview
of their cut, using the same rounding as the server. In fixed-amount mode each checked
member gets an amount field instead, with a running "X left to allocate" / "X over the
total" line — green when it balances, red otherwise. Switching modes seeds fixed amounts
from the shares preview, and resets shares to equal weights, rather than losing the
selection.

### Date field (`src/features/transactions/date-picker-field.tsx`)

A native picker via `@expo/ui`, one component with the platform split inside it rather
than as separate files, since only the trigger differs:

- **iOS** — an inline `compact` SwiftUI `DatePicker`: a small tappable field that pops its
  own calendar, no extra chrome needed.
- **Android** — Compose has no inline "compact field" equivalent, so a plain field shows
  the formatted date and tapping it opens the Material dialog picker; it unmounts on
  confirmation or dismissal.
- **Web** — `@expo/ui` has no host views there at all (`date-picker-field.web.tsx`): the
  same plain `YYYY-MM-DD` text field every platform used before this existed.

`@expo/ui` was already a dependency, unused until now — see `docs/MOBILE.md` for the
native-rebuild consequence of that.

### Create a group (`src/features/groups/create-group-screen.tsx`)

A sheet from the groups list: a name field (autofocused, 60 chars), then the friend picker.
Creating with nobody selected is allowed — a link can come later.

### Friend picker (`src/features/groups/friend-picker.tsx`)

Selectable friend rows with a round checkbox that fills with the theme text colour. Used
both when creating a group and when adding to one, where members already in are left out
and the empty state points at the invitation link instead.

### Friends (`src/features/friends/friends-screen.tsx`, tab `app/(tabs)/friends.tsx`)

List of avatar + name rows, each with **where the two of them stand** under the name —
"owes you 12.50" / "you owe 12.50" / "settled up", coloured, netted across every group
they share (`docs/specs/balances.md`). No grand total sits above the list: members of
shared groups who are not friends are absent from it, so a sum of the rows would not be
the viewer's overall position.

**Tapping a row opens the group shared with that friend**; "Remove" stays a separate hit
area at the end of the row, and its confirmation says that the shared group and its
contents go too. Empty state: "No friends yet". A footer holds the primary "Invite a
friend" action and the invitation code entry below.

The **friend picker** deliberately shows no balance: it is a selection list, and a money
figure there is noise.

### Invitation code entry (`src/features/invites/invitation-code-entry.tsx`)

The manual fallback for someone who has a code instead of a link — typed in, or pasted
from somewhere the link itself didn't survive. A small "Got an invitation code?" label,
a text field and a secondary "Open" button (disabled until something is typed), submittable
from the keyboard too. Feeds the same `pendingInvite` store a deep link does, so it opens
the same confirmation screen.

**Rendered identically at the bottom of both the Friends and Groups tabs** — one component,
so a friend code and a group code are entered the same way and neither tab has to know
which kind of code the visitor is holding.

### Invitation sharing (`src/features/invites/invite-share-screen.tsx`)

One component behind both the friend link (`features/friends/invite-screen.tsx`) and the
group link (`features/groups/group-invite-screen.tsx`): only the wording and the endpoint
differ. Opened as a sheet. The link is shown in a `backgroundElement` box and is
**selectable**, so a failed clipboard write is not a dead end. Primary "Share" (OS share
sheet), secondary "Copy link" (flips to "Copied"), the expiry in words, and a bottom
"Generate a new link" with a caption warning that the previous link stops working.

### Invitation confirmation (`src/features/invites/invite-prompt.tsx`)

A full-screen modal, not a route: it must appear identically whether the code arrived from
a deep link or was typed by hand, and it is mounted above the tabs. Centred avatar, then
what the link leads to — "X wants to add you as a friend" / "X invited you to <group>" —
and Accept / Join group / Not now. Terminal states: friends now, already friends, joined
(with an "Open group" action), already a member, link no longer valid, your own link, and
a retryable connection error.

## Principles

- Prefer the smallest structural fix over a visual workaround.
- Check light and dark, plus small and large widths, after any UI change.
- Reproduce a visual bug before fixing it; verify the fix against the original scenario.

## Navigation

`app/_layout.tsx` is a `Stack` wrapping the `(tabs)` group, so a group detail pushes
above the tab bar with a back button. The tabs themselves live in
`app/(tabs)/_layout.tsx`.

The groups list is the index of that group, so its URL is `/`.

Typed routes are generated into `.expo/types/router.d.ts` when the dev server runs. If
`router.push` or an `href` is rejected for a route that plainly exists, the generated file
is stale — restart the dev server rather than working around the type.

## Current state

Auth screens (sign-in, account, gate), the friends screens, the groups screens and the
transaction screens are real. The Expo starter Home tab is gone — Groups took its place.
Groups hold transactions and show balances, and the friend list shows where you stand with
each person across every group you share; settle-up suggestions are not built yet.

The transaction date field is a native picker (`@expo/ui`) on iOS and Android, a plain
text field on web (see "Date field" above and `docs/MOBILE.md`).

These screens are covered by component tests but have **not** been validated on a device
yet: web sign-in is disabled, so they cannot be reached on the web target.
