# Design

Living document for visual and interaction conventions. Update it as the UI evolves.

## Tokens

Defined in `apps/mobile/src/constants/theme.ts`:

- **Colours** — `Colors.light` / `Colors.dark` with roles: `text`, `textSecondary`,
  `background`, `backgroundElement`, `backgroundSelected`.
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
state: "No groups yet" with what a group is for. A primary "Create a group" sits at the
bottom, outside the list, so it stays reachable.

**Archived groups** live under a discreet "Show archived (n)" toggle at the very bottom of
the list, and are rendered muted (55% opacity) with "n members · archived" when revealed.
They are hidden rather than greyed inline because the list is about what is still going
on; the count in the toggle is what keeps them findable. A list with only archived groups
shows the toggle, not the empty state.

### Group detail (`src/features/groups/group-screen.tsx`, route `app/groups/[id].tsx`)

Pushed above the tabs, so it has a back button. Name, an "Archived" note when it applies,
a placeholder for the expenses to come, the member list (avatar + name, "Owner" on the
owner), then the actions.

**One screen for both kinds of group.** For a pair group every management action is
**absent** — not disabled — because it can never apply, and a closing line explains that
it is just the two of them. For a standard group: "Add friends", "Share an invitation
link" and "Rename" (all three gone while archived), "Archive group" / "Reopen group",
"Leave group" (hidden for an owner who still has company), and a red text-only "Delete
this group" for the owner. Destructive actions confirm through an `Alert` that states what
is lost.

States: loading, "This group is gone" (deleted, or the viewer was removed — no retry, just
a way back), and a retryable connection error.

### Create a group (`src/features/groups/create-group-screen.tsx`)

A sheet from the groups list: a name field (autofocused, 60 chars), then the friend picker.
Creating with nobody selected is allowed — a link can come later.

### Friend picker (`src/features/groups/friend-picker.tsx`)

Selectable friend rows with a round checkbox that fills with the theme text colour. Used
both when creating a group and when adding to one, where members already in are left out
and the empty state points at the invitation link instead.

### Friends (`src/features/friends/friends-screen.tsx`, tab `app/(tabs)/friends.tsx`)

List of avatar + name rows. **Tapping a row opens the group shared with that friend**;
"Remove" stays a separate hit area at the end of the row, and its confirmation says that
the shared group and its contents go too. Empty state: "No friends yet". A footer holds the
primary "Invite a friend" action and an "Got an invitation code?" field — the manual
fallback for someone who installed the app after following a link.

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

Auth screens (sign-in, account, gate), the friends screens and the groups screens are
real. The Expo starter Home tab is gone — Groups took its place. Groups hold members but
no expenses yet, and say so.

The groups screens are covered by component tests but have **not** been validated on a
device yet: web sign-in is disabled, so they cannot be reached on the web target.
