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
- **Category colours** are not theme tokens: each transaction category owns its colour in
  `@splitcount/shared`'s `categories.ts`, alongside its emoji and label, and keeps it in
  both themes. Read it from `categoryDefinition(key).color`, never redefine one per screen.
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

The app's landing screen, **root groups only** — a group that is itself a sub-group is
reached by opening its parent, never listed here. Rows (`group-row.tsx`) show name,
member count, and a third line: the viewer's own balance **rolled up over the group and
every sub-group nested inside it** (`groupBalanceLabel` / `balanceTone`,
`docs/specs/balances.md`) — the same wording as the group screen's own summary. Tappable
to open the group. Empty state: "No groups yet" with what a group is for. A footer holds
the primary "Create a group" action and the same "Got an invitation code?" entry as the
Friends tab — a code is a code, and the confirmation screen figures out whether it leads
to a friendship or a group.

**Archived groups** live under a discreet "Show archived (n)" toggle at the very bottom of
the list, and are rendered muted (55% opacity) with "n members · archived" when revealed.
They are hidden rather than greyed inline because the list is about what is still going
on; the count in the toggle is what keeps them findable. A list with only archived groups
shows the toggle, not the empty state.

### Group detail (`src/features/groups/group-screen.tsx`, route `app/groups/[id].tsx`)

Pushed above the tabs, so it has a back button. **Transactions are the primary content**:
a **breadcrumb** of ancestors (root first, tappable, shown only for a sub-group), the
group's name, a **sub-groups section** (below), an "Archived" note when the group is
*effectively* archived — itself or any ancestor (`readOnly` on `GroupDetail`,
`docs/specs/groups.md`) — **the viewer's own balance** ("You are owed 21.25" / "You owe
8.00" / "You're all settled up" — said in words, so it never rests on spotting a minus
sign; for a group with sub-groups this is already rolled up over the whole sub-tree, read
straight off `group.viewerBalanceCents` rather than a separate balances fetch), the
transaction list (`TransactionRow`: the category emoji next to the title, date, kind,
payer, and the viewer's own share, coloured), and a primary "Add a transaction" button —
absent when effectively archived. A row opens the same add/edit sheet, pre-filled; when
read-only, rows render but are not pressable. Empty state: an explanation and the same
"Add a transaction" action.

**Sub-groups section** (`SubgroupsSection`, standard groups only — absent on a pair
group): a "Sub-groups" heading with a small "+ Create" link, then every sub-group the
viewer has already joined as a row (`SubgroupRow`: name + member count, tappable to open
directly). Ones the viewer has **not** joined are hidden behind a "Show sub-groups I'm not
in (n)" toggle, mirroring the group list's archived-groups pattern; revealed, they render
muted with "n members · not joined" and tapping one opens a "Join this group?" `Alert`
instead of navigating — confirming calls the lighter join endpoint (no friendship check)
and opens the group only once it succeeds. "+ Create" opens `CreateGroupScreen` with the
current group as the implicit parent. The section renders nothing when there are no
sub-groups and the group is read-only, so it never appears as a permanent empty box on an
archived leaf group.

The header carries two small text buttons: **"Stats"** (the per-category breakdown, see
"Group statistics" below) and **"Details"**. Both open sheets; both are present on every
kind of group, archived or pair included, since both are read-only views.

Group management — everything that used to sit directly on this screen — moved behind a
small "Details" button in the header, opening a sheet: the member list (avatar + name,
"Owner" on the owner), **balances** (`GroupBalances`: each member's name next to their
net, coloured, "settled up" at zero — a member who left with an unsettled balance still
appears, without an avatar; this list stays scoped to the one group, never rolled up),
then the management actions.

The per-member balance list is read **once, by the group screen**, and handed to the
sheet; the screen refreshes it after a transaction is saved or deleted, since a balance
cannot be patched from a single transaction the way the list can. The top summary no
longer shares that fetch — it reads `group.viewerBalanceCents` directly, so it has nothing
to wait on and nothing to keep stale-but-stable during a reload.

**One screen for both kinds of group**, in both the main view and the details sheet.
**Transactions behave identically on a pair group** — the one thing that does. Every
management action stays **absent**, not disabled, on a pair group, and the details
sheet's closing line explains that it is just the two of them. For a standard group:
"Add friends", "Share an invitation link" (both gone when effectively archived — the
server actually blocks them), "Rename" (gone only when the group's **own** flag is
archived, not an ancestor's — renaming is never blocked server-side), "Archive group" /
"Reopen group" (always available, and always reflects the group's own flag, never an
ancestor's), "Leave group" (hidden for an owner who still has company **or** who solely
owns a still-populated sub-group), and a red text-only "Delete this group" for the owner.
Destructive actions confirm through an `Alert` that states what is lost, naming the
sub-groups too when the group has any.

States: loading, "This group is gone" (deleted, or the viewer was removed — no retry, just
a way back), and a retryable connection error.

### Group statistics (`src/features/statistics/statistics-screen.tsx`)

A sheet, opened from a small "Stats" button in the group header, left of "Details" — the
transaction list stays the group's primary content. A **Spending / Income** pill row (same
styling as the split editor's mode toggle), then a wrapped row of **one pill chip per
group member** — the viewer's own chip reads "You" — all active by default, each
independently tappable to include or exclude that member. Under them a **donut chart**
(`DonutChart`, 220pt, 44pt ring — noticeably thick so a small share still reads as an arc,
not a line) with one arc per category in that category's own colour, and a legend below:
colour swatch, emoji + label, percentage, amount — largest first.

The donut's hole holds the total for the current selection ("Total spending", the amount);
tapping an arc or a legend row swaps it for that category's emoji, label, amount and
percentage, and fades the other arcs to 30%. Tapping the same one again, changing the type,
or toggling a member, returns to the total. With every member selected the total is the
group's; deselecting members narrows it to the sum of only their own shares — selecting the
viewer alone reproduces what used to be a separate "Me" toggle. Deselecting every member
shows an empty state asking to select at least one, instead of drawing a zero-value ring.
Colour never carries meaning alone: every slice is repeated in the legend with its emoji
and label, and the selected one is named in words in the centre.

Category colours live with the categories themselves (`@splitcount/shared`'s
`categories.ts`), mid-lightness so the same thirteen values read on both themes — they are
not theme tokens and do not change between light and dark.

States: a spinner while the transactions load, the same retryable connection error as the
list, and empty states that say *which* combination is empty ("Nothing recorded as income
yet.", "None of this group's spending concerns you yet.") rather than a generic "nothing
here". A group holding only transfers reads as "Nothing spent yet" with the reason, since
transfers deliberately do not count.

The sheet reads the transactions the group screen already loaded — no second request, and
a transaction saved while it is open is reflected when it is reopened.

### Add / edit a transaction (`src/features/transactions/transaction-form-screen.tsx`)

One sheet for recording and for editing — editing pre-fills it, and adds a red text-only
"Delete this transaction". Kind picker (Expense / Income / Transfer), then a title row: a
small square **category badge** to the left of the title field, showing just the emoji
(`Other` by default), then the title itself. Tapping the badge opens a small sheet with
just the category grid (`CategoryPicker`); picking one updates the badge and closes the
sheet immediately — no separate save step for it, though the transaction itself is only
persisted when the form's own "Save" is pressed. Then amount, date (`DatePickerField` —
see below), optional comment, then "Who paid" (`MemberSelect`, defaulting to the
signed-in member). An expense or income continues with "Who it concerns" (`SplitEditor`);
a transfer replaces it with a single "To" picker instead, excluding the payer. "Save" is
disabled until the title, amount, date and split are all valid — the category always has
a value, so it never blocks saving.

### Category picker (`src/features/transactions/category-picker.tsx`)

Every preset as an emoji + label pill (`CategoryPicker`), wrapping into a grid — same
pill styling as the split editor's mode toggle, filled when selected. Single-select: every
transaction has a category (`Other` by default), so there is no "clear" gesture — picking
`Other` itself is the neutral choice. No way to add, rename or reorder a category here —
the list is fixed (`@splitcount/shared`'s `categories.ts`). Used inside the add/edit
form's category badge sheet.

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

The same screen creates a **sub-group** when opened with a `parentId` (from the group
screen's sub-groups section): the title reads "New sub-group", the button "Create
sub-group", and the parent is implicit — there is no field for it, and no failure wording
mentions it either, since the caller already knows which group they are in.

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
Groups hold transactions, show balances and break their money down by category, can nest
sub-groups up to five levels deep, and the friend list shows where you stand with each
person across every group you share; settle-up suggestions are not built yet.

The transaction date field is a native picker (`@expo/ui`) on iOS and Android, a plain
text field on web (see "Date field" above and `docs/MOBILE.md`).

These screens are covered by component tests but have **not** been validated on a device
yet: web sign-in is disabled, so they cannot be reached on the web target.
