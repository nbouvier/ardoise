# Design

Living document for visual and interaction conventions. **Every new feature follows
it**; when a feature genuinely needs something this document does not cover, add the
rule here in the same change rather than inventing it locally.

## Identity

SplitCount is about money shared between people who like each other. The design aims for
**warm, colourful and calm** — not the neutral grey-on-white of a banking app, and not a
rainbow either.

The palette is deliberately small:

| Role | Hue | What it is for |
| --- | --- | --- |
| **Brand** | violet | primary actions, active states, links, the app's own identity |
| **Accent** | tangerine | emphasis that is *not* an action (badges, the "Me" tag) — used sparingly |
| **Credit / debit** | green / red | money owed to you, money you owe — nothing else |
| **Danger** | red | destructive actions |

Green and red are kept **out** of the brand and accent, so a balance never reads as
branding and branding never reads as a balance. Neutrals are tinted towards the brand
hue rather than grey: **no surface in the app is plain white, grey or black.**

The mark (`src/components/brand-mark.tsx`) is a rounded tile split down the middle —
violet half, tangerine half — with a coin on the seam: one thing, divided between
people. It is **drawn in SVG from the theme tokens**, not shipped as a bitmap, so the
identity has exactly one source. The app icon, splash glyph, favicon and Android
adaptive layers are exports of that same mark.

The home screen is where the app introduces itself: "SplitCount" and the tagline. The other tab screens (Groups, Friends,
Account) open with **the page's own name on a single line** — `sectionTitle`, then, smaller
(`smallBold`, secondary) after a "·", what it counts ("3 groups", "2 friends"; nothing on
Account) — via `ScreenHeader`. The one page pushed above the tabs, a group's, keeps the
banner: the group's name and, in the same smaller style after a
"·", its member count.

## Tokens

All in `apps/mobile/src/constants/theme.ts`. Reach for a token, never a literal.

### Colours — `Colors.light` / `Colors.dark`, typed as `Theme`

- **Ink** — `text` (a deep violet, not black), `textSecondary`.
- **Surfaces** — `background` (the canvas), `surface` (a card sitting on it),
  `backgroundElement` (a filled but unselected area: inputs, quiet fills),
  `backgroundSelected`, `border` (hairlines and card outlines).
- **Brand** — `primary`, `onPrimary` (ink on top of it), `primarySoft` (a washed brand
  surface: chips, badges, highlighted rows), `onPrimarySoft`.
- **Accent** — `accent`, `accentSoft`, `onAccentSoft` (the accent itself is too light to
  be text on its own wash).
- **Money** — `credit` / `debit`, reached through `balanceTone()`
  (`src/features/transactions/balance-display.ts`) rather than testing the sign by hand.
- **Destructive** — `danger`. A different meaning that happens to share a hue with
  `debit`; never write it inline.
- **Scrim** — `scrim`, the violet-tinted dim behind a `ConfirmDialog`; `dropdownScrim`,
  the lighter violet tint behind a `DropdownMenu` (a tint rather than a dim) — read by
  `DropdownScrim` for its gradient's peak alpha rather than rendered flat.

Read them through `useTheme()`. `useIsDark()` exists only for the handful of tokens that
are a function of the scheme rather than a colour (`cardShadow`, a medallion's two
halves) — it is never a licence to branch on the scheme inline.

### Medallions

`Medallions` / `medallionFor(id)` give something with no colour of its own — a group, a
sub-group, a person with no profile picture — a **stable** colour derived from its id.
The same subject keeps the same colour across screens and launches. This is what makes a
list of otherwise identical rows tell itself apart at a glance. Never a random colour,
never a per-screen choice.

### Category colours

Not theme tokens: each transaction category owns its colour in `@splitcount/shared`'s
`categories.ts`, alongside its emoji and label, and keeps it in both themes. Read it from
`categoryDefinition(key).color`. A selected category pill and the statistics donut use
that colour rather than the brand hue — a category is the one thing allowed to bring its
own.

### Shape, space, type

- **`Spacing`** — `half` (2) → `six` (64). Tokens, not raw numbers.
- **`Radius`** — `small` (8), `medium` (12, fields), `card` (18), `large` (26),
  `pill` (999, every button and every selectable token). The app is deliberately round.
- **`cardShadow(dark)`** — a soft violet-tinted lift on light; **flat on dark**, where a
  shadow only muddies the canvas and `border` carries the separation instead.
- **`Fonts`** per platform: `sans`, `serif`, `rounded`, `mono`.
- **Layout** — `MaxContentWidth` (800). The bottom tab bar takes its own room below the
  pages (it does not float over them), so a tab's content needs no bottom inset for it.
- **Small caveat text** — any brief note that qualifies something above it rather than
  standing as content of its own (an unsaved-change warning, a field's own validation
  error, a disabled-row explanation, a list's own usage hint) keeps `type="small"`'s
  weight and colour but overrides its `fontSize`/`lineHeight` down from 14/20 to **12/16**
  — smaller than ordinary "small" text, since it is a caveat, not a message meant to
  compete with whatever it is attached to. First used for the Manage tab's "Change not
  saved yet" (`nameHintText`, `group-screen.tsx`) and the Balances tab's "Tap a row to
  reimburse." (`tapHint`, `reimbursements-screen.tsx`); use the same 12/16 override for
  any future text of this kind rather than plain "small".

## Theming

- Light/dark driven by the OS colour scheme (`userInterfaceStyle: "automatic"`).
- On web, hydration-safe colour scheme via `apps/mobile/src/hooks/use-color-scheme.web.ts`.
- React Navigation gets SplitCount's palette too (`navigationTheme` in `app/_layout.tsx`)
  — otherwise a pushed screen's header and the gap between screens fall back to its
  grey-on-white defaults and punch a hole in the tinted canvas.
- Use `ThemedText` / `ThemedView` rather than styling colours directly.

## Components

The shared kit in `src/components`. **Reuse these before writing a new pressable, field
or box**; a screen that styles its own is a bug in this document.

- **`Card`** — the app's unit of content: every row, field group and standalone block
  sits in one, so a list reads as a stack of objects rather than runs of text separated
  by hairlines. `tone="brand"` for the single most important block on a screen;
  `muted` for archived / left / not-joined; `onPress` makes the whole card the hit area.
- **`Button`** — `primary` (brand-filled, **one per screen**), `secondary` (outlined in
  the brand hue), `ghost` (a soft brand wash, for an action that must not compete —
  Cancel, Close, Done), `danger` (outlined destructive). Pill-shaped, with a busy state.
- **`Pill`** — the selectable token: a mode toggle, a category, a member filter. Filled
  when selected, outlined when not. One shape, so a row of pills always means "pick from
  these".
- **`SegmentedSwitch`** — a real switch, its options named inside a sliding brand-filled
  thumb rather than drawn as look-alike pills: used where the choice is one setting with a
  fixed, small set of positions (Spending / Income on Statistics; Expense / Income /
  Transfer on the transaction form), not a "pick one of these tokens" row — that stays
  `Pill` or `TabBar`. Two options or more, no upper bound in principle, but it reads well
  up to three or four. `size="small"` shrinks it for a switch sitting beside a section
  title rather than taking its own line (Shares / Fixed on the split editor) — smaller
  geometry and a quieter label size (12/16, a notch under `small`'s own 14/20), since it
  reads as secondary to the title it sits beside rather than content of its own. Each
  option is sized to its own label, measured via `onLayout`, rather than split evenly
  across the track's width — a track with no explicit width of its own (beside a heading,
  rather than alone on its own line) has nothing to divide equal-width options into, and
  they silently collapse to nothing. Measuring each option avoids that regardless of what
  row the switch sits in.
- **`TextField`** — every text input: a filled, rounded field on `backgroundElement`,
  never a bare underline. `multiline` for a comment.
- **`Avatar`** — someone's Google picture, falling back to their initial **on their own
  medallion colour**. Pass `seed={user.id}` wherever an id is available, so a rename does
  not change someone's colour.
- **`MedallionBadge`** — a coloured disc standing in for something with no picture: a
  group's initials, a category's emoji, a sub-group's `↳`. Takes an explicit `color` when
  the subject owns one (a category), a seed otherwise.
- **`MeTag`** — the accent "Me" pill marking the viewer's own row in a member list, the
  same shape as the brand-violet "Owner" tag in Manage. Used on the Manage tab's member
  list, the statistics participant picker, and the transaction form's payer and split
  rows — one component so "which one is me" always reads the same way.
- **`BrandMark`** — the logo, drawn from the tokens.
- **`Icon`** — the app's small glyph set (`plus`, `key`, `close`, `star`, `more`, `manage`,
  `archive`, `leave`, `trash`, `back`), drawn as strokes on a 24×24 grid rather than an icon font,
  coloured through `theme` like everything else; `filled` swaps the hollow outline for a
  solid fill of the same colour — used for `more`'s three dots, always solid.
- **`IconButton`** — a bare tappable glyph for an action belonging to the block it sits in
  (the invitation card's share / copy / generate): a 32pt box, padded hit area, dimmed when
  disabled. Always given an `accessibilityLabel` in words; the caller passes the colour.
  Also in the `Icon` set now: `share`, `copy`, `refresh`, `check`.
- **`DropdownMenu`** — the shared popup every dropdown list in the app opens into: a
  `Card` of rows over `DropdownScrim`, a **light violet gradient**, not a flat dark dim —
  anchored **a fifth of the way down the screen** (`paddingTop: '20%'`, proportional
  rather than a fixed offset) rather than vertically centred, so it reads as attached to
  the field or icon that opened it rather than a dialog floating mid-screen.
  `DropdownScrim` is bled to the screen's actual edges (status bar and home-indicator
  strips included) rather than sitting inside a `SafeAreaView`'s own insets — only the
  menu's position respects the safe area, not the wash behind it — and fades softly
  towards the very top and bottom the way `HeroWash` fades its own ellipses, instead of a
  single flat alpha everywhere. Its `Card` is given a heavier-than-usual border (`1.5`
  rather than the usual hairline) so its edge still reads clearly against that lighter
  wash. `IconMenuButton`'s "⋮" sheet, the transaction form's category picker, and
  `MemberDropdownField`'s options all render through it — one component, so every
  dropdown opens, dims and sits the same way. `ConfirmDialog` is the deliberate exception
  (see below): a yes/no question is a dialog, not a list, stays centred, and keeps the
  darker, flat `scrim`.
- **`ConfirmDialog`** — the app's own "are you sure": a card (title, message, a ghost
  Cancel and the confirming button — `danger` when `destructive`) centred over a `scrim`-dimmed
  screen, in place of the stock OS `Alert`. Tapping outside or the back gesture cancels.
  **It is the norm for every confirmation** — never reach for the OS `Alert` in new work.
  Every confirmation (leave, delete, join, regenerate…) and every failure notice goes
  through it — no OS `Alert` is left. Screens use the **`useDialog()`** hook
  (`components/use-dialog.tsx`): `confirm({ title, message, confirmLabel, destructive,
  onConfirm })` asks, `inform(title, message)` tells with a single "OK" (`confirmOnly`,
  no Cancel), and the screen renders the hook's `dialog` once. `useGroupRowActions`
  exposes its own `dialog` for the screens that use it.
- **`FavoriteStar`** — the favorite toggle (`docs/specs/favorites.md`): an unfilled
  `textSecondary` star, filled `accent` when favorited — the fill alone carries the state,
  no label. Always a sibling of whatever `Pressable` opens the row or screen it sits on,
  never nested inside it, so tapping it never also navigates.
- **`Breadcrumb`** — where a sub-group sits, above its name: its ancestors root first,
  chevron-separated, in the quietest type there is. `onOpen` makes each one its own hit
  area (a group's own header); without it the trail is plain `small` text — what a row in
  a list wants, where the row is already the target and a nested pressable would steal
  the tap. Shown wherever a group is named away from its parent (`docs/specs/home.md`).
- **`ScreenHeader`** — the top of a tab screen: **the page's name** (`sectionTitle`) on one
  line, with an optional caption after it — a "·" then a `smallBold`, secondary-coloured
  count — and room for one screen-level action. No mark and no wordmark: the app names
  itself on the home screen only. `wash` wraps the header in `PageHero` — used on the
  Groups list, Friends and Account. Group detail wears the same wash and the same
  name-then-count line, but has the group's name and count in its own row and so does not use `ScreenHeader`.
- **`TabBar`** — the tabs *within* one screen (as opposed to the app's bottom tabs, which
  switch between screens): an underlined row of text labels, the selected one in the brand
  colour with a brand underline, on a hairline rule. Each tab grows to share the width and
  the row scrolls sideways if the labels ever do not fit. Each is `accessibilityRole="tab"`
  with its `selected` state. Used by the group screen.
- **`PageHero`** — the one place the app's decorative wash is bled to a screen's edges and
  given its own top safe-area inset, so every header that carries it behaves identically
  instead of each screen re-deriving its own margins. Takes whatever header content a
  screen wants as `children`. Must be a screen's own first element, before any padded
  content wrapper — nesting it inside one reintroduces the padding it exists to bleed
  past. Used by `ScreenHeader`'s `wash`.
- **`HeroWash`** — the app's decorative colour wash, drawn once for `PageHero` and for the
  home screen's own hero: three overlapping radial gradients (brand, accent, a third
  medallion hue) fading to transparent over a `primarySoft` ground, filling whatever it is
  placed behind. Drawn, not blurred — see Home below.
- **`TextAction`** — every quiet text action in the brand colour: a page's "+ Verb" ("+ Join
  or Create", "+ Add or Invite", at the top of the page's content, right-aligned, *not* in
  the banner — it opens one page that holds every way of doing the thing), a list's own
  "+ Add" / "+ Create" / "+ Invite", and the "Show archived" style toggles. Pressed, a soft
  `primarySoft` pill appears behind the words; its padding is taken back with a negative
  margin, so the words sit exactly where plain text would.
- **`DismissiblePage`** — a page that opened from the bottom (a group, a friend's, a
  sub-group's, "New group", "New friend"): its banner is a drag handle. Pulled down, the
  whole page follows the finger; past 120 pt (or flicked) it slides away and closes,
  otherwise it springs back. Off on iOS, where these pages are native sheets that already
  do this.
- **`SheetModal`** — how a page opens *over* another from inside a screen ("New group",
  "New friend", a sub-group): sliding up; a native page sheet on iOS, a see-through
  window elsewhere so a `DismissiblePage` pulled down reveals what is under it; with its
  own gesture root. The transaction form is **not** one of these — like "+ Invite" on the
  Manage tab, it swaps the Transactions tab's own content in place instead of sliding up
  over it (see "Add / edit a transaction" below).
- **`Pager`** — sibling pages side by side, swiped between: a group's own tabs, and the
  app's bottom tabs (through `PagerTabs`). The pages follow the finger one to one, so the
  next one is seen coming in; 40 % of the width, or a flick (800 pt/s) past 12 %, turns
  the page, one at most, and a long drag ended by a flick back stays. Its `position` (in
  pages, fractional mid-swipe) is shared with the bar above or below, whose indicator
  travels with it. A page is drawn once it is shown or next to the one shown, then kept;
  only the page shown is visible to a screen reader.
- **`PagerTabs`** — the navigator of `app/(tabs)` on iOS and Android: a `Pager` of the
  four tab screens over a Material-style bar (icon over label, `surface`, a hairline on
  top) whose `primarySoft` pill slides from tab to tab with the pages. It replaces the
  native tab bar, whose pages cannot be dragged in and whose indicator cannot follow a
  finger. The web keeps its floating pill bar (`app-tabs.web.tsx`).
- **`TabBar`** — a screen's own tabs (a group's): an underlined row whose underline slides
  from tab to tab, following the `Pager`'s `position` when given it.
- **`RefreshableScrollView`** — a scroll view with pull to refresh. A deliberate pull:
  on Android a drawn indicator that asks for 192 pt of finger travel (the pull resists,
  at half the finger), only when the pull *starts* at the top — a scroll up that runs
  into the top does not count — with an arrow that winds up and brightens once letting
  go would refresh. iOS keeps its native `RefreshControl`, which already asks for a
  long pull.
- **`BackButton`** — the way out of a page with no native header: an arrow, or — in a
  banner, at its far end — the downward chevron (`collapse` icon) that folds the page
  away. Takes the place of a Cancel button.
- **`OrDivider`** — a padded rule with "OR" in the middle, between two alternative ways of
  doing the same thing (creating a group / joining one; inviting a friend / entering a
  code).
- **`ListDivider`** — the padded hairline between the Groups and Friends lists' favorites
  and the rest.
- **`IconMenuButton`** — a sheet of icon + label rows anchored to a
  small "⋮" icon (the `more` glyph, filled), opened through `DropdownMenu`
  rather than docked to the bottom — for actions that belong to one row in a
  list, not to the screen as a whole. An option can be marked `destructive`, rendering its
  icon and label in `danger`.
- **`GroupActionsMenu`** — the business logic behind a group's own `IconMenuButton`: given
  its `kind`, `viewerRole`, `memberCount` and archived state, decides which of Manage /
  Archive (or Reopen) / Leave / Delete actually apply, mirroring the group page's own
  Manage tab exactly (`docs/specs/groups.md`) — a row's menu never offers something
  opening the group would refuse. A pair group only ever gets Manage and a Delete labelled
  "Remove friend", since that is exactly what it does. Sits next to `FavoriteStar` on
  `GroupRow` and on a group's own joined `SubgroupRow`.
- **`ThemedText`** — `title`, `subtitle` (a screen's own name), `sectionTitle` (a block
  inside a screen), `overline` (a small all-caps label above a block — quiet structure,
  never a sentence), `amount` (a figure that must read as a figure), `default`, `small`,
  `smallBold`, `link`, `linkPrimary`, `code`.
- **`ThemedView`** — themed surfaces, plus `type="transparent"` for a layout wrapper
  inside a card, where the canvas colour would undo the card.

### Rules of thumb

- **Everything tappable answers the touch** (a design rule, not a nicety). A text action
  or a tab shows a `primarySoft` wash behind it; an icon (`IconButton`, `BackButton`,
  `FavoriteStar`, a "⋮") a round `primarySoft` wash; a menu row a rounded one; a `Button`
  or a `Card` dims and shrinks a hair; a filled field darkens to `backgroundSelected`.
  A new pressable picks one of these — never nothing.
- **Motion follows the finger** (see Motion below): a page that opened from the bottom
  closes back down, a banner can be pulled down to close its page, and siblings side by
  side (bottom tabs, a group's tabs) are one swipe apart.
- **Every dropdown list opens through `DropdownMenu`**: anchored a fifth of the way down
  the screen, never vertically centred, and washed behind, edge-to-edge, in
  `DropdownScrim`'s light-violet gradient — a transparent overlay reads as the background
  still being "live" underneath, which a list of options should not, and a wash that stops
  short of the screen's actual top or bottom edge (e.g. one left inside a `SafeAreaView`'s
  own insets) leaves a visible gap there. Centred, and the darker flat `scrim`, are
  reserved for `ConfirmDialog` itself, a dialog asking a question rather than a list
  offering choices.
- **A view that replaces a tab's content in place closes on the hardware back button.**
  "+ Invite" (Manage) and the add/edit transaction form (Transactions) are screen state, not
  routes, so Android's back would otherwise pop the whole group from under them. While one
  is open, back closes just that — exactly like its own Cancel/Done, discarding nothing it
  would not already discard — and a form opened from elsewhere (a suggested reimbursement)
  returns there.
  Implemented as a `BackHandler` listener (`hardwareBackPress`) that exists only while the
  view is open, so with nothing open back still leaves the group. A new in-place view
  does the same. A popup opened over it (`DropdownMenu`, `ConfirmDialog`) is a `Modal`
  and takes the first press itself, so back unwinds one layer at a time.

- One **primary** button per screen. Everything else is `secondary` or `ghost`.
- A destructive action is a **red text button**, never a filled red one, and always
  confirms through a `ConfirmDialog` that states what is lost.
- A section heading inside a screen or sheet is an **`overline`**, not a bold sentence.
- **Every screen has a banner** — the `PageHero` wash with the page's name and its count on
  one line (a tab screen's page name, a group's name), never a bare or plain header. A new
  screen starts from that, and a pushed one draws its own way back in it.
- **Adding to a list is a "+ Verb" text action at the end of that list's own heading
  line** — brand-coloured `smallBold`, opposite the `overline` title: "+ Create" for
  sub-groups, "+ Add" for transactions, "+ Invite" for members. Not a full-width button
  below the list. (A *tab screen's* own top-level add, which branches into several choices, is a
  `TextAction` at the top of its content, worded the same way, that opens one page holding
  all the choices, separated by an `OrDivider`.) Give it an `accessibilityLabel` that names what is
  added when the visible word is not enough ("Add a transaction").
- A spinner is `theme.primary`, never `theme.text`.
- Colour never carries meaning alone: a balance is said in words ("You owe 8.00"), a
  chart slice is repeated in a legend with its emoji and label.
- An action that branches into a couple of related choices (add → create or join) is a
  single **`TextAction`** opening one page with each choice as a section, an `OrDivider`
  between them and a chevron in the banner to close it — rather than a text button per
  choice, a menu, or an icon whose single meaning has to be guessed.
- A group named anywhere other than under its own parent carries a **`Breadcrumb`** above
  its name — the group list, the home's favorites, a group's own header. "Beach day" on
  its own is ambiguous between two trips; "Corsica 2026 › Beach day" is not.
- **A field or label whose row has other content to protect never wraps to a second
  line** — `numberOfLines={1}`, truncated with an ellipsis instead, so a long value never
  pushes a row's other fields out of place or doubles its height. Established for the
  transaction form's Title, Date and member rows (`docs/specs/transactions.md`); apply the
  same rule to any field in a row where staying on one line matters more than showing the
  value in full.

## Screens

### Auth gate (`src/features/auth/auth-gate.tsx`)

Wraps the app. States: **loading** (centred spinner while the session is restored, under
the animated splash overlay), **error** ("Can't connect" + a secondary "Try again"),
**signedOut** (the sign-in screen), **signedIn** (the app).

### Sign-in (`src/features/auth/sign-in-screen.tsx`)

Full-screen, centred. The `BrandMark` on a `primarySoft` wash, "SplitCount", a tagline,
and a single primary "Continue with Google". Inline `danger` error text on failure (not
on user cancellation). On web the button is disabled with a "coming soon" caption.

### Account (`src/features/auth/account-screen.tsx`)

`ScreenHeader` with `wash`, then one brand-toned identity card — avatar, name, email — and
a secondary "Sign out" at the bottom. The screen has exactly one piece of content below
the header, so it gets exactly one card.

### Home (`src/features/home/home-screen.tsx`, tab `app/(tabs)/index.tsx`)

The first screen of the app (`docs/specs/home.md`), a scroll of three stacked blocks —
no `ScreenHeader`, since the first block *is* the identity, at full size.

**The identity** takes about a quarter of the screen height (`useWindowDimensions`), runs
edge to edge, square-cornered, and carries the wordmark in `title` and the tagline
"Settle up, stay friends." in secondary `sectionTitle`, both centred — no mark, since the
block already reads as the app's own identity without one. Behind it, `HeroWash`: three
overlapping ellipses on `primarySoft`, each a **radial gradient fading to transparent** —
brand, accent, and a third hue borrowed from the medallion family so it reads as the
app's palette rather than as two brand colours meeting. Drawn, not blurred: a real blur is
a native module on one platform and a CSS filter on another, and gradients fading to
nothing give the same out-of-focus read from the tokens themselves, identically
everywhere. The safe-area inset is padding *inside* the block, so the wash runs under the
status bar. Nothing in it is tappable and it never carries a figure. The same wash, via
`PageHero`, sits behind the `ScreenHeader` of Groups, Friends and Account, so the same
"out of focus" read shows up at the top of every tab. Group
detail — pushed above the tabs, under its own Stack header — keeps a plain header instead.

**Two sections** follow, each an `overline` heading over its own content, and each with
its own loading spinner, error card ("Try again") and empty line — one section failing
never takes the other, or the identity, down with it. `Favorites` reuses **`GroupRow`**
unchanged, so a group looks the same here as in the group list, breadcrumb, actions menu
and all — this is the one place the menu can land on a pair group (a favorited friend),
where it offers only Manage and "Remove friend" (`docs/specs/groups.md`); this
is the list that mixes depths, too. Tapping a star here *removes* the row rather than
moving it, since the section is the favorites. `Latest` reuses **`TransactionRow`**, passing
`group` so each row leads with "Corsica 2026 › Beach day" above the title; tapping one
opens the group, not the transaction. Pull to refresh reloads both.

### Groups list (`src/features/groups/groups-screen.tsx`, tab `app/(tabs)/groups.tsx`)

**Root groups only** — a sub-group is reached by opening its parent.
`ScreenHeader` with `wash` and the active-group count as caption. Each group is a **`GroupRow`
card**: a medallion carrying the group's initials, the name, the member count, and the
viewer's balance **in that group alone** (`groupBalanceLabel` / `balanceTone`,
`docs/specs/balances.md`), with a **`FavoriteStar`**, and next to it a **`GroupActionsMenu`**, both at the far right
of the row, aligned with the name line specifically (`docs/specs/favorites.md`) —
favorites come first, then a padded `ListDivider`, then the rest — alphabetical
within each, no headings; with no favorites there is one plain list and no rule. The row
leads with a **`Breadcrumb`** of the group's ancestors when it has any — never here, where
every group is a root one, but the same row is reused by the home's favorites section,
which mixes depths. Tapping the star moves the group across the divider at once — the move is the
feedback. Empty state: a brand card with a glyph and one sentence, in the manner of the
transactions tab's ("No groups yet. Create one, or join one with a code, to start tracking
what you share.").

A **`TextAction`** ("+ Join or Create", right-aligned at the top of the content) opens the
one "New group" page (below), which both creates a group and joins one.

**Archived groups** sit under a "Show archived (n)" brand-coloured toggle at the bottom,
rendered `muted` with "n members · archived" when revealed — hidden rather than greyed
inline because the list is about what is still going on. A list with only archived groups
shows the toggle, not the empty state.

### Group detail (`src/features/groups/group-screen.tsx`, route `app/groups/[id].tsx`)

Opened above the tabs, from the bottom, and closed by its chevron or by pulling its banner
down (see Motion). **Transactions are the default content**, one of four tabs — a sideways
swipe on the content moves between them.

**Top banner.** The same `PageHero` wash as the tab screens.
The group's **name** (`sectionTitle`, one line, truncated first) followed by a "·" and its
**member count** (`smallBold`, secondary), on the same line; a **breadcrumb** of ancestors
(brand-coloured, tappable, only on a sub-group) sits above it. At the far end: a
**`FavoriteStar`** (`docs/specs/favorites.md`) — present on every kind of group, pair
included: a pair group's own page is one of the two places its star shows, the other being
its row on the Friends tab (`docs/specs/friends-and-invitations.md`) — then the way back,
a **chevron pointing down** (label "Back": fold the group away). The route has no native
Stack header (`headerShown: false`). An "Archived — read-only" note under the name when the
group is *effectively* archived (itself or any ancestor, `readOnly` on `GroupDetail`). The
loading / gone / error states have no banner and keep a plain back arrow.

**Tabs** (`TabBar`, under the banner, all four on every kind of group, archived or pair
included): **Transactions** (default), **Balances**, **Statistics**, **Manage**. Only the
selected tab's content is mounted, so Statistics re-reads its data each time it is
opened; the group's balances and transactions are read once by the screen. A row's own
"Manage" action opens the group on the Manage tab (route param `tab=manage`).

**Transactions tab** — the sub-groups section, then a "Transactions" section of the same
shape (overline title, "+ Add" text action at the end — absent when effectively archived)
over the transaction list (`TransactionRow` cards). "+ Add", or tapping a row, **swaps the
tab's own content for the add/edit form** — the same in-place pattern as "+ Invite" on the
Manage tab, not a sheet sliding up over it: the banner and tabs stay, and picking another
tab leaves it. A suggested reimbursement from the Balances tab opens the same form the same
way, switching to the Transactions tab to show it and switching back to Balances once it is
saved or cancelled. When read-only, rows render but are not pressable. Empty state: a brand
card with a glyph and an explanation.

**Balances tab** — **"Balances"** first, always listing the viewer's own row first
regardless of amount (`forDisplay`, `reimbursements-screen.tsx`), then **"Reimbursements"**
(the plan; see below). The viewer's own figure is their row in that list, marked with an
accent **"Me"** tag the same shape as the "Owner" tag in Manage, rather than repeated in a
card of its own. The "Tap a row to reimburse." note under the suggestions is the small
caveat text size (`tapHint`, `reimbursements-screen.tsx`; see "Shape, space, type" above).

**Statistics tab** — the breakdown, see "Group statistics" below.

**Sub-groups section** (shown on **both kinds of group** — a friendship can have
sub-groups too): an `overline` "Sub-groups" heading with a brand "+ Create" link, then
every sub-group the viewer has joined as a card (`↳` medallion, name, member count, and
where they stand across *that* sub-group's own sub-tree), with its own **`FavoriteStar`**
and **`GroupActionsMenu`** at the right of the name line (`docs/specs/favorites.md`) —
favorited joined sub-groups are pinned above non-favorited ones. Ones they have **not**
joined hide behind a "Show sub-groups I'm not in (n)" toggle, mirroring the archived
pattern; revealed, they render `muted` with "n members · not joined" and no balance line
(never being a member, it is always exactly zero) and **no star or menu** — there is no
membership row to favorite on, or manage — and tapping one opens a "Join this group?"
`ConfirmDialog` instead of navigating. The section renders
nothing when there are no sub-groups and the group is read-only, so it never becomes a
permanent empty box.

**Manage tab** — top to bottom: an overline **"Group name"** label (the same quiet,
all-caps section heading as "Sub-groups" on the Transactions tab — small, secondary-toned,
never a sentence) over a `TextField` that is **always editable**, no separate rename page —
tapping directly into the field is the only way in, no dedicated edit button (one existed
briefly; coordinating its own crossfade against the checkmark's and the discard's own
appearance rules cost more than a plain always-editable field was worth). Its checkmark
`IconButton` fades in at the field's own end, inside it, not beside it, the moment the field is
focused, even before the name has actually changed, since it always means "done here", not
"something changed"; it also stays up whenever the name differs from the saved one, focused or
not — so a change left hanging is never silently lost. A discard (a cross, back to what it was)
joins it, to its left, but **only once the name actually differs from the saved one** — a cross
with nothing behind it to discard would be a false offer, so focusing an unchanged field shows
the checkmark alone. Both icons share the same brand color, never a muted secondary tone.
Committing only ever happens on the checkmark or the keyboard's own submit — **never on blur,
in either direction**: losing focus neither saves nor discards, it just leaves the draft
exactly as typed, with a small note reading **"Change not saved yet"** under the field for as
long as it sits there unsaved and unfocused. The note itself waits a short delay
(`NAME_UNSAVED_HINT_DELAY_MS`, 400ms) after that blur before showing, cancelled outright by a
refocus, a discard or a commit that lands first — tapping straight back into the field to keep
editing should never see it flash on the way past. It reads `type="small" themeColor="danger"`,
at the small caveat text size (`nameHintText`, `group-screen.tsx`; see "Shape, space, type"
above). That note lives in its own
fixed-height slot, always present whether or not the note itself is — the field's own row
(`TextField` plus its icon overlay) is a separate block above it for the same reason, so neither
the icon crossfade nor the note appearing or clearing ever changes the field's own height;
without that, the two animations landing a beat apart could make the field flash to a taller,
wrapped-looking shape for an instant. (The Manage tab's own scroll view sets
`keyboardShouldPersistTaps="handled"` specifically so tapping the checkmark doesn't blur the
field — and so lose that focus-independent draft's chance to be read — a beat before its own
`onPress` runs.) The checkmark does a small confirming tilt (no color change — the app doesn't
read a rename as a "credit"), held a moment before both icons fade away.
A blank name, or one identical to the saved one, is treated the same as tapping discard rather
than sent. Then an overline **"Members (n)"** label — the count lives inside the label itself,
not a separate line — with the brand **"+ Invite"** text action at its end (the same shape
as "+ Create" and "+ Add"), and the member list itself (avatar + name, a brand-violet "Owner"
tag on the owner — always the first row, whatever order the server listed them in, plus an
accent **"Me"** tag on the viewer's own row, independent of it — both can land on the same
row) in its own surface card. Below that, the management actions. "+ Invite" **swaps the Manage tab's
own content for the invite page** (`InvitePanel`) — no modal, no navigation; the banner
and tabs stay, and picking any tab leaves it. Both ways in are on it, no menu between,
told apart by a hairline. "Add friends" (overline section title) heads the friend picker,
in the same surface card as the member list, headed by an overline count ("0 selected",
"2 selected") where the member list says "Members (n)". The card **always fills the room
the link leaves** even with few friends, its list scrolling when it runs out; friends
already in the group are listed too, ticked and disabled. "Add to group" closes the
section, under the card. "Invitation link" (overline, its share / copy / generate icons at
the end of that line) over a surface card holding just the link, and its small expiry
line, sits below the hairline, and a **"Done"** button closes the page back to the member
list (as does adding friends), spaced clear of the link. (A modal was tried and rejected.)

**One screen for both kinds of group.** Transactions and sub-groups behave identically on
a pair group; its name field still shows, just without the pencil — there is nothing to
rename. Every other management action is **absent**, not disabled, there, and the tab's
closing line explains that it is just the two of them. For a standard group: the rename
pencil (gone only when the group's **own** flag is archived), "+ Invite" (gone when
effectively archived, or when the group is `pairRooted`), "Leave group" (hidden for an
owner who still has company or who solely owns a populated sub-group), "Archive group" /
"Reopen group" (always available, always the group's own flag), and a bordered, outlined
red **"Delete group"** (`Button` `danger` variant) for the owner — in that order: Leave,
then Archive/Reopen, then Delete, the least reversible action last.

States: loading, "This group is gone" (no retry, just a way back), and a retryable
connection error.

### Transaction row (`src/features/transactions/transaction-row.tsx`)

A card: the **category's emoji on a badge in the category's own colour**, then the title,
then a second line of date · kind · payer, then the viewer's own share, coloured. The
emoji is the badge — it is *not* prefixed to the title text.

### Reimbursements (`src/features/reimbursements/reimbursements-screen.tsx`)

The group's Balances tab, in full. **The figures first, then what to do about them**:
"Where everyone stands" — the group's balances in one card, the viewer's own row marked
"Me" — then "Suggested reimbursements": one card per payment, a sentence ("You pay Alan
Turing") with the amount at the end, sized as `smallBold` like the standings above it
rather than a headline `amount` (there is one figure on this tab that deserves that
weight, and it is the plan as a whole, not any single row), the viewer's own rows first,
then a plain "Tap to reimburse." hint in place of a payment count.

A payment card is **pressable and opens the pre-filled transfer form**; when it cannot be
recorded (archived group, or a party who has left) it is `muted`, disabled, and carries
the reason underneath — never a silent dead tap. When nobody owes anybody, both lists are
replaced by a single settled line.

The plan is **derived from the balances the group screen already loaded**
(`planReimbursements`), so it has no fetch of its own.

### Group statistics (`src/features/statistics/statistics-screen.tsx`)

The group's Statistics tab. A real **Spending / Income switch** — the two words drawn
inside a sliding brand-filled thumb, not a pair of look-alike pills — sits on its own line
at the very top, centred, always visible. At the far right of that same line, out of the
flow so the switch stays centred, a small **"Filters"** icon button (sliders glyph, no
text) discloses the fields below, closed by default; open, it is tinted brand over a soft
wash. The section's reveal beneath is animated (`react-native-reanimated`), not instant.

Inside the filters: a row of **labelled fields**, each a small uppercase caption above
a fixed-size pill that never changes size with its content — a **participants field**
(showing "Everybody" or the selected members' first names, ellipsized rather than
wrapped) and, only for a group with any sub-groups, a **subgroups field** beside it
(reading "All" by default, "None", or the selected sub-groups' own names, ellipsized the
same way). Below that, a second row of two more labelled fields, **From** and **To** —
each reading "Any" until set, then a set date in short form ("11 Sep 2026"), ellipsized
the same way as the fields above rather than resizing, with a **calendar icon** in place
of the chevron (opening one date, not a list). Tapping one swaps it for the same native
date field the transaction form's own Date field uses (defaulting to today the first
time); once set, **the field itself never shrinks for a clear control** — a small
**"Clear"** text appears at the far right of that field's own label row (`From ⋯ Clear`)
instead. When some sub-group in scope is left out because the viewer has not joined it, a
small line under the fields says how many rather than presenting a partial sum as the
whole tree's.

The line that used to separate the controls from the chart is gone — the switch
row itself is that boundary now — but the padding it gave the chart stays, carried by the
section above instead of a divider between the two.

The short form, ellipsis and calendar icon are fully controlled on Android, which also
opens a native dialog directly from the field itself. iOS's inline `compact` date widget
draws its own label once a date is set — a platform limit, not a missed detail — so there
the field still shows "Any" first the same way, but a set bound falls back to the OS's own
formatting.

Tapping either field **opens a multi-select dropdown** (`DropdownMenu`, the rule above) over
the chart — the chart is not swapped out. The menu stays open while ticking, so several
rows can be picked in one go, and closes on a tap outside it or Android's back; there is
no "Done" button. Its option list scrolls past half the screen's height.

- The **participants dropdown**: presets **"Everybody", "Only you", "Nobody"**, in that
  order, each reading as selected when the current selection already matches it, above a
  list — one row per member, an avatar, a checkbox, and the viewer's own row marked
  **"Me"** the same tag shape as "Owner" in Manage. Everyone is checked by default.
- The **subgroups dropdown**: presets **"All"** and **"None"**, above a list — one row per
  *direct* sub-group, just its name and a checkbox. Every direct sub-group is checked by
  default; checking one back in brings its own nested sub-groups along with it, since
  there is no separate row for a grandchild.

Each row or preset applies immediately, and the field behind the menu updates with it.

Under that a **donut chart** (220pt, 44pt ring — thick enough that a small share reads as
an arc, not a line), one arc per category in that category's own colour, and a legend card
below: swatch, emoji + label, percentage, amount — largest first. The hole holds the total
for the current selection; tapping an arc or legend row swaps it for that category's
emoji, label, amount and percentage, fades the other arcs to 30%, and tints the legend row
it came from. Tapping again, changing the type, or changing any selection — participants,
sub-groups, or either date bound — returns to the total.

States: a spinner, the same retryable connection error as the list, and — when the
breakdown has nothing to show — the donut chart stays on screen as a single muted, static
arc holding a zero total, with a sentence underneath saying *which* combination is empty
("Nothing recorded as income yet.", "Nothing spent in the selected date range.") rather
than a generic "nothing here" or blank space where the chart would be.

### Add / edit a transaction (`src/features/transactions/transaction-form-screen.tsx`)

One form for recording and for editing, with no title of its own — the **kind switch**
(`SegmentedSwitch`, Expense / Income / Transfer) sits where a heading would, exactly the
same component and position as Statistics' own Spending / Income switch. It swaps the
Transactions tab's own content in place (see "Transactions tab" above) rather than opening
as a sheet, with **no padding of its own on the sides** — it fills the page it replaces,
which already pads its edges, and a form padded again on top of that read as more
indented than the ordinary Transactions tab it stands in for. Its scroll indicator is
hidden too: a long form scrolling in place of a tab's own content should feel like part of
the tab, not a sheet with its own chrome. Below the kind switch, **two plain sections, not
cards** — the form itself is not a list of objects, so the usual `Card` boxing would just
be padding around padding; the only `Card` left in it is the split editor's own member
list (below), the one place that *is* a list:

1. *What it is* — a **Title** field (`overline` label above it, like Amount and Date)
   beside a square **category badge** at its end (the emoji, tappable, opens a **`DropdownMenu`**
   over the form — the same popup language as a group's own "⋮" menu, not a full page
   sheet — holding the `CategoryPicker`'s rows; picking one closes it immediately, though
   the transaction is only persisted on "Save"), bottom-aligned with the field so the row
   reads as one line even though the label sits above the text field alone. Then amount
   and date side by side under their own `overline` labels: Amount carries a small **€**
   suffix inside the field, at its end; Date shows the short form ("11 Sep 2026", never
   "11 September 2026") and never wraps (see "A field or label… never wraps" above) — the
   same short format and single-line rule as the statistics date range field, including
   its iOS limitation (the native inline widget owns its own label once a date is set).
   Then **"Who paid" / "Who received it"** (`MemberDropdownField`), under Amount/Date and
   above the comment — every kind has a payer, whatever else it needs. Then an optional
   comment, under its own **"Comment (optional)"** `overline` label (the placeholder is a
   short example, not an instruction, now that the label says what the field is for).
2. *Who it involves* — either a single **"To"** dropdown (transfer, `MemberDropdownField`
   excluding the payer) or **"Participants"** (`SplitEditor`).

Then, stacked full width: ghost "Cancel", then primary "Save" (disabled until title,
amount, date and split are all valid — the category always has a value, so it never
blocks saving) — ghost before primary, the same order `ConfirmDialog` uses for its own
Cancel and confirming button. When editing, a red text-only "Delete this transaction"
follows.

### Member / friend selection

`MemberDropdownField` (single-select) and `FriendPicker` (multi-select) both render a
**filled row in `primarySoft` when selected**, not just a filled dot — what the eye lands
on first when reopening a pre-filled form. The dot or checkbox is the confirmation, not
the signal. `MemberDropdownField` is a field like any other in the form — avatar, name,
`MeTag` and a chevron, the `collapse` icon — that opens its options through **`DropdownMenu`**
rather than a row of options sitting inline in the form itself: a form with "who paid", "to" and a split editor
all showing every member inline at once read as far busier than the choices it actually
asks for. Its dropdown additionally pins the viewer's own row **first** — picking yourself
(as payer, or as a transfer's recipient) is the common case, so it is the row nobody has to
scroll or search for. The friend picker deliberately shows **no balance**: it is a
selection list, and a money figure there is noise.

### Split editor (`src/features/transactions/split-editor.tsx`)

Every member always has a row — concerned or not — so the layout never reflows as people
are added or dropped; a concerned row is tinted `primarySoft`, the only selection cue
(there is no checkbox). The viewer's own row is pinned **first**, the same ordering
`MemberDropdownField` uses. Its own header — the "Participants" `overline` paired with a
**small `SegmentedSwitch`** (`size="small"`) for **Shares / Fixed**, at the
title's end, the same "label left, control right" row as "Members (n)" / "+ Invite" on
Manage — sits plain, **outside** any `Card`; only the rows themselves sit in one, the same
"header outside, `Card` around just the list" shape as Manage's own member list.

A row is one line: avatar, name (truncated — see "never wraps" above — to leave room for
the row's other fields), `MeTag` on the viewer's own row, then the mode's own control at
the row's end. In shares mode that is a −/+ stepper (an equal split is everyone at the
same weight) and a live "= 12.34" preview using the server's own rounding, both with less
padding than the stand-alone stepper elsewhere, to stay compact on one line. In
fixed-amount mode it is an amount field carrying the same **€** suffix as the
transaction's own Amount field. **Every row is the same fixed height regardless of mode**
— the stepper and the amount field aren't naturally the same height, and a row sized to
its own content made every row jump when the Shares / Fixed switch was toggled.

**A field is the selection**, not a separate control: raising a weight above zero, or
typing a non-zero amount, is what adds a member to the split; bringing either back down to
exactly zero removes them — the schema never persists a weight or amount of zero, so a
"zero" row is simply not a participant. A not-yet-concerned row still shows its stepper or
amount field, just resting at zero, rather than appearing once picked some other way.

In fixed-amount mode, the "Fully allocated" / "x.xx left to allocate" / "x.xx over the
total" line below the member `Card` reads as a **caption on that card**, not a sibling
block of its own: `small` type (not `smallBold`) and pulled up out of the section's own
`gap` so it sits close under the rows it reports on.

### Amount fields (`AmountInput`, `src/features/transactions/amount-input.tsx`)

A field still reading **zero** clears itself the moment it gains focus, so typing a sum is
never preceded by deleting a "0.00" that was never a real value — a non-zero amount is a
real edit in progress and is left as-is on focus. Used by the transaction's own Amount
field and every participant's fixed-amount field in `SplitEditor`.

A running "X left to allocate" / "X over the total" line sits under the rows in
fixed-amount mode — `credit` when it balances, `debit` otherwise. Switching modes seeds
fixed amounts from the shares preview and resets shares to equal weights, rather than
losing the selection.

### Date field (`src/features/transactions/date-picker-field.tsx`)

A native picker via `@expo/ui`, platform split inside the one component: **iOS** an inline
`compact` SwiftUI `DatePicker`; **Android** a plain field opening the Material dialog
(Compose has no inline equivalent); **web** the app's own `TextField` in `YYYY-MM-DD`
(`@expo/ui` has no host views there).

### New group (`src/features/groups/create-group-screen.tsx`)

A sheet with the classic banner (`ScreenHeader` with `wash`): "New group", and a
`BackButton` chevron at its far end in place of a Cancel button. Below it, on one page:

- **Create a group**, on top: an `overline`, the name field (autofocused, 60 chars), a
  hint, then the friends in a `Card` (`FriendPickerCard` — "N selected", the list scrolling
  inside the room left) and the "Create group" button. Creating with nobody selected is
  allowed — a link can come later.
- an **`OrDivider`**;
- **Join a group**, at the bottom: the invitation-code entry (below). Submitting a code
  folds the page away and hands off to `InvitePrompt`, which is what actually confirms
  and joins.

The same screen creates a **sub-group** when opened with a `parentId`: the title still
reads "New group", with the parent's **breadcrumb** (its ancestors, then the parent itself)
on a quiet line above it (`ScreenHeader`'s `above`), the button reads "Create sub-group",
the parent is implicit, and there is no Join part (nothing to join from inside a group). When the parent is `pairRooted` the
friend picker is **not shown at all**, replaced by a short note — the only other allowed
person is added automatically.

### Friends (`src/features/friends/friends-screen.tsx`)

`ScreenHeader` with `wash` and the friend count. Each friend is a card: avatar, name, **where the
two of them stand** — "owes you 12.50" / "you owe 12.50" / "settled up", coloured, netted
across every group they share — and a **`FavoriteStar`** at the far right (`docs/specs/
favorites.md`), favoriting the implicit pair group behind that row; favorites
first, a `ListDivider`, then the rest, alphabetical within each — exactly like the group
list (no rule when nobody is a favorite; a star moves the friend at once). No grand total above the list: members of
shared groups who are not friends are absent from it, so a sum of the rows would not be
the viewer's overall position. **Tapping a card opens the group shared with that
friend**, directly by its already-known id — no request first, the group exists from the
moment the friendship does (`docs/specs/friends-and-invitations.md`); a "⋮" `IconMenuButton` ("Manage" → the shared
group's Manage tab, "Delete friend") stays a separate hit area after the star. Empty state: the same kind of card ("No friends yet. Invite someone with a link
and they’ll show up here."). The top of the content holds a
**`TextAction`** ("+ Add or Invite") opening the "New friend" page (below).

### New friend (`src/features/friends/new-friend-screen.tsx`)

A sheet built like "New group": the classic banner ("New friend", a `BackButton` chevron at
its far end, no Done/Cancel button), then on one page **Invite a friend** on top — an
`overline`, a sentence saying what the link does, and the invitation link with its share,
copy and regenerate icons and its expiry (`InviteShareScreen`, `embedded`) — an
**`OrDivider`**, and **Enter a code** at the bottom (the invitation-code entry below).
Submitting a code folds the page away and hands off to `InvitePrompt`. The content scrolls
when the screen is short.

### Invitation code entry (`src/features/invites/invitation-code-entry.tsx`)

An `overline` (default "Got an invitation code?", "Enter a code" on the New friend page,
"Join a group" on the New group page), a
`TextField` whose placeholder shows what a link looks like (`<API base URL>/i/…`) and a
secondary "Join" (disabled until something is typed, submittable from the keyboard).
**Pasting a whole invitation link keeps just its code** — the field shows the code, not
the URL. **The same component on both the Friends and Groups tabs** — neither has to know
which kind of code the visitor is holding — rendered inside the "New friend" and "New
group" pages. An optional `onSubmitted` callback lets the host
close itself once the code is handed off.

### Invitation sharing (`src/features/invites/invite-share-screen.tsx`)

One component behind both the friend link and the group link. The link sits in a
**brand-toned card**, and is **selectable**, so a failed clipboard write is not a dead
end. The card's title line — the "Your invitation link" overline — carries **three
`IconButton`s at its far end**: share (`share`), copy (`copy`, which flips to a `check`
labelled "Copied") and generate a new one (`refresh`). Each is labelled in words for
accessibility. **Tapping the link itself copies it too**, and a small "Copied" tooltip in the
brand colours appears **at the spot that was tapped** for two seconds, then goes (the copy
icon's tick reverts with it). Generating asks first through the app's own **`ConfirmDialog`** —
"Generating a new link stops the previous one from working." — so the page itself carries
no such caption. The expiry is said in words under the card.

### Invitation confirmation (`src/features/invites/invite-prompt.tsx`)

A full-screen modal, not a route: it must appear identically whether the code arrived from
a deep link or was typed, and it is mounted above the tabs. Centred avatar, what the link
leads to, and Accept / Join group / Not now. Terminal states: friends now, already
friends, joined (with "Open group"), already a member, link no longer valid, your own
link, and a retryable connection error.

## Navigation

`app/_layout.tsx` is a `Stack` wrapping the `(tabs)` group, so a group detail opens above
the tab bar, from the bottom (see Motion); the tabs live in `app/(tabs)/_layout.tsx`
(`PagerTabs`). Four tabs, in order: **Home**, **Groups**, **Friends**, **Account**. The tab
bar is a **surface**, not the canvas, and the active tab carries the brand hue — its icon,
its label and the pill behind the icon — the one place navigation says which app this
is. On web the tab list is a floating pill bar with the
"SplitCount" wordmark in brand violet.

The home is the index of that group, so its URL is `/`; the groups list sits at
`/groups`, which coexists with the `/groups/[id]` detail route outside the tabs.

Typed routes are generated into `.expo/types/router.d.ts` when the dev server runs. If
`router.push` or an `href` is rejected for a route that plainly exists, the generated file
is stale — restart the dev server rather than working around the type.

## Motion

The app should feel direct: things move the way the finger does, and every change of
page says where it came from.

- **Pages over pages open from the bottom and close back down.** A group's page (a
  friend's and a sub-group's are group pages too) slides up over the tabs: a native sheet
  on iOS (`presentation: 'modal'`), a slide from the bottom over a page that stays visible
  underneath elsewhere (`transparentModal`, `slide_from_bottom`) — set once, on the
  `groups/[id]` route in `app/_layout.tsx`. "New group", "New friend" and the other sheets
  opened from inside a screen do the same through `SheetModal`. Their banner carries a
  downward chevron, not a back arrow.
- **Pull the banner down to close.** On those pages the banner is a `DismissiblePage` drag
  handle: the page follows the finger, then closes or springs back. Only the banner — the
  content below keeps its own vertical scrolling.
- **Swipe sideways between siblings — and see the next one coming.** On Home, Groups,
  Friends and Account, a sideways swipe drags the next or previous bottom tab's page in
  beside the current one (`PagerTabs`); on a group's page, the next or previous tab of the
  page (`Pager`). The pages follow the finger, then settle (280 ms, easing out); nothing
  lies past either end, where the pages resist and come back. The swipe takes over only
  after 24 pt sideways, and gives way to vertical scrolling after 12 pt up or down.
- **The indicator travels with the pages.** The bottom bar's pill and a group's underline
  follow the swipe frame by frame, and slide the same way when a tab is tapped — the
  pages then slide there too, drawing any page they pass.
- **Pull a list down to refresh it — on purpose** (Home, Groups, Friends): a long pull,
  started at the top (`RefreshableScrollView`). The list stays on screen while it reloads
  (`pullRefresh` / `refreshing` on `useGroups` / `useFriends`) — unlike "Try again", which
  shows the loading state.
- Performance: every drawn page stays mounted and the swipe only moves one row of pages
  (a transform on the UI thread), so a swipe costs no React render until it settles.
  Pages two or more away are not drawn until first approached.
- Gestures come from `react-native-gesture-handler` (a `GestureHandlerRootView` at the
  root, and inside each `SheetModal`), animation from Reanimated; gesture callbacks run as
  worklets on the UI thread and hand results back with `scheduleOnRN`.

## Principles

- Prefer the smallest structural fix over a visual workaround.
- Check light and dark, plus small and large widths, after any UI change.
- Reproduce a visual bug before fixing it; verify the fix against the original scenario.
- Reuse the shared kit. A new pressable, field or box needs a reason recorded here.

## Current state

The whole surface — auth, groups, friends, transactions, statistics, reimbursements,
invitations — is on this design system; every Expo starter component and asset is gone.
The sign-in screen has been verified in both themes on the web target; the rest is covered
by component tests but **has not been validated on a device**, since web sign-in is
disabled and they cannot be reached there.

The app icon, splash glyph, favicon and Android adaptive layers were generated from
`BrandMark`. They are flat exports of the SVG: if the mark ever changes, regenerate them
rather than editing the PNGs.
