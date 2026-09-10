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
- `AppTabs` — bottom tab navigation (Home, Explore, Account).

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

## Principles

- Prefer the smallest structural fix over a visual workaround.
- Check light and dark, plus small and large widths, after any UI change.
- Reproduce a visual bug before fixing it; verify the fix against the original scenario.

## Current state

Auth screens (sign-in, account, gate) are real. The Home and Explore tabs are still the
Expo starter content — replace them as features are specified.
