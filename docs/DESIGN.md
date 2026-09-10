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
- `AppTabs` — bottom tab navigation (Home, Friends, Account).

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

### Account (`src/features/auth/account-screen.tsx`, tab `app/account.tsx`)

Google avatar (or initial fallback), name, email, and an outlined "Sign out" button.

### Friends (`src/features/friends/friends-screen.tsx`, tab `app/friends.tsx`)

List of avatar + name rows with a per-row "Remove" (confirmed by an `Alert`). Empty state:
"No friends yet". A footer holds the primary "Invite a friend" action and an "Got an
invitation code?" field — the manual fallback for someone who installed the app after
following a link.

### Invite (`src/features/friends/invite-screen.tsx`)

Opened as a sheet from the Friends tab. The link is shown in a `backgroundElement` box and
is **selectable**, so a failed clipboard write is not a dead end. Primary "Share" (OS share
sheet), secondary "Copy link" (flips to "Copied"), the expiry in words, and a bottom
"Generate a new link" with a caption warning that the previous link stops working.

### Invitation confirmation (`src/features/friends/invite-prompt.tsx`)

A full-screen modal, not a route: it must appear identically whether the code arrived from
a deep link or was typed by hand, and it is mounted above the tabs. Centred avatar + "X
wants to add you as a friend" + Accept / Not now. Terminal states: friends now, already
friends, link no longer valid, your own link, and a retryable connection error.

## Principles

- Prefer the smallest structural fix over a visual workaround.
- Check light and dark, plus small and large widths, after any UI change.
- Reproduce a visual bug before fixing it; verify the fix against the original scenario.

## Current state

Auth screens (sign-in, account, gate) and the friends screens are real. The Home tab is
still the Expo starter content — replace it as features are specified. The Explore tab was
replaced by Friends.
