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
- `AppTabs` — bottom tab navigation.

## Principles

- Prefer the smallest structural fix over a visual workaround.
- Check light and dark, plus small and large widths, after any UI change.
- Reproduce a visual bug before fixing it; verify the fix against the original scenario.

## Current state

Screens are still the Expo starter content. Replace with real SplitCount screens as
features are specified.
