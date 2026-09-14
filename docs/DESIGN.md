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
| **Accent** | tangerine | emphasis that is *not* an action (badges, the "Owner" tag) — used sparingly |
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

Every tab screen opens with the mark and the "SplitCount" wordmark **before** the name of
the page — the app introduces itself first, the section second — via `ScreenHeader`. A
page title is never the largest, boldest text at the top of a tab screen; it sits smaller
and in `textSecondary` beneath the wordmark.

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
- **Layout** — `MaxContentWidth` (800), `BottomTabInset` per platform.

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
- **`TextField`** — every text input: a filled, rounded field on `backgroundElement`,
  never a bare underline. `multiline` for a comment.
- **`Avatar`** — someone's Google picture, falling back to their initial **on their own
  medallion colour**. Pass `seed={user.id}` wherever an id is available, so a rename does
  not change someone's colour.
- **`MedallionBadge`** — a coloured disc standing in for something with no picture: a
  group's initials, a category's emoji, a sub-group's `↳`. Takes an explicit `color` when
  the subject owns one (a category), a seed otherwise.
- **`BrandMark`** — the logo, drawn from the tokens.
- **`Icon`** — the app's small glyph set (`plus`, `key`, `close`, `star`), drawn as strokes
  on a 24×24 grid rather than an icon font, coloured through `theme` like everything else;
  `filled` swaps the hollow outline for a solid fill of the same colour.
- **`FavoriteStar`** — the favorite toggle (`docs/specs/favorites.md`): an unfilled
  `textSecondary` star, filled `accent` when favorited — the fill alone carries the state,
  no label. Always a sibling of whatever `Pressable` opens the row or screen it sits on,
  never nested inside it, so tapping it never also navigates.
- **`Breadcrumb`** — where a sub-group sits, above its name: its ancestors root first,
  chevron-separated, in the quietest type there is. `onOpen` makes each one its own hit
  area (a group's own header); without it the trail is plain `small` text — what a row in
  a list wants, where the row is already the target and a nested pressable would steal
  the tap. Shown wherever a group is named away from its parent (`docs/specs/home.md`).
- **`ScreenHeader`** — the top of a tab screen: **SplitCount's own identity first** — the
  `BrandMark`, sized to stand as tall as the two text lines beside it, next to the
  wordmark and, directly under it, the current page named in smaller, secondary-coloured
  type, with an optional trailing caption and room for one screen-level action. Every tab
  opens the same way, and reads as SplitCount before it reads as "Groups" or "Friends".
  `wash` draws `HeroWash` behind it, bleeding to the edges of the screen's own padding —
  used on Friends and Account, not on the (unfavorited) Groups list.
- **`HeroWash`** — the app's decorative colour wash, extracted from the home screen's own
  hero: three overlapping radial gradients (brand, accent, a third medallion hue) fading
  to transparent over a `primarySoft` ground, filling whatever it is placed behind. Drawn,
  not blurred — see Home below. Used on the home hero, and behind the header of Group
  detail, Friends and Account (`docs/specs/home.md`).
- **`AddMenuButton`** — a list screen's single, full-width footer `Button` (e.g. "New
  group"). Tapping it opens a bottom sheet of icon + label rows for the couple of related
  choices behind it (create or join) — the sheet replaces the button in place rather than
  popping out from beside it, so there is no separate position to get wrong.
- **`ThemedText`** — `title`, `subtitle` (a screen's own name), `sectionTitle` (a block
  inside a screen), `overline` (a small all-caps label above a block — quiet structure,
  never a sentence), `amount` (a figure that must read as a figure), `default`, `small`,
  `smallBold`, `link`, `linkPrimary`, `code`.
- **`ThemedView`** — themed surfaces, plus `type="transparent"` for a layout wrapper
  inside a card, where the canvas colour would undo the card.

### Rules of thumb

- One **primary** button per screen. Everything else is `secondary` or `ghost`.
- A destructive action is a **red text button**, never a filled red one, and always
  confirms through an `Alert` that states what is lost.
- A section heading inside a screen or sheet is an **`overline`**, not a bold sentence.
- A spinner is `theme.primary`, never `theme.text`.
- Colour never carries meaning alone: a balance is said in words ("You owe 8.00"), a
  chart slice is repeated in a legend with its emoji and label.
- An action that branches into a couple of related choices (add → create or join) is a
  single full-width **`AddMenuButton`** opening a bottom sheet of icon + label rows,
  rather than a text button per choice or an icon whose single meaning has to be guessed.
- A list screen's footer action sits **pinned to the bottom of the screen** (the body
  above it takes `flex: 1`), not just after whatever content happens to be there.
- A group named anywhere other than under its own parent carries a **`Breadcrumb`** above
  its name — the group list, the home's favorites, a group's own header. "Beach day" on
  its own is ambiguous between two trips; "Corsica 2026 › Beach day" is not.

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
status bar. Nothing in it is tappable and it never carries a figure. The same `HeroWash`
sits behind the header of Group detail, Friends and Account, so the same "out of focus"
read shows up at the top of every screen with an identity to lead with.

**Two sections** follow, each an `overline` heading over its own content, and each with
its own loading spinner, error card ("Try again") and empty line — one section failing
never takes the other, or the identity, down with it. `Favorites` reuses **`GroupRow`**
unchanged, so a group looks the same here as in the group list, breadcrumb included (this
is the list that mixes depths); tapping a star here *removes* the row rather than moving
it, since the section is the favorites. `Latest` reuses **`TransactionRow`**, passing
`group` so each row leads with "Corsica 2026 › Beach day" above the title; tapping one
opens the group, not the transaction. Pull to refresh reloads both.

### Groups list (`src/features/groups/groups-screen.tsx`, tab `app/(tabs)/groups.tsx`)

**Root groups only** — a sub-group is reached by opening its parent.
`ScreenHeader` with the active-group count as caption. Each group is a **`GroupRow`
card**: a medallion carrying the group's initials, the name, the member count, and the
viewer's balance **in that group alone** (`groupBalanceLabel` / `balanceTone`,
`docs/specs/balances.md`), with a **`FavoriteStar`** at the far right of the row, aligned
with the name line specifically (`docs/specs/favorites.md`) — favorited groups are pinned
above non-favorited ones, alphabetical within each. The row leads with a **`Breadcrumb`**
of the group's ancestors when it has any — never here, where every group is a root one,
but the same row is reused by the home's favorites section, which mixes depths. Tapping the star flips it in place
without moving the row: the refetch that tap itself triggers (`groupsChanged`) keeps the
row where it is, and only a *later*, unrelated refetch brings the pinned order into
view — a visible list reordering under the viewer's own finger reads as disorienting,
one caused by something else happening elsewhere does not. Empty state: a brand card with
a glyph, "No groups yet" and what a group is for.

A full-width **`AddMenuButton`** ("New group", pinned to the bottom of the screen) opens
a bottom sheet with "Create a group" (`plus` icon) and "Join a group" (`key` icon).
"Create a group" opens the same creation sheet as before; "Join a group" opens a sheet
holding the invitation-code entry — submitting a code closes the sheet and hands off to
`InvitePrompt`, which is what actually confirms and joins.

**Archived groups** sit under a "Show archived (n)" brand-coloured toggle at the bottom,
rendered `muted` with "n members · archived" when revealed — hidden rather than greyed
inline because the list is about what is still going on. A list with only archived groups
shows the toggle, not the empty state.

### Group detail (`src/features/groups/group-screen.tsx`, route `app/groups/[id].tsx`)

Pushed above the tabs, so it has a back button. **Transactions are the primary content.**

The header sits on the home screen's `HeroWash`, bled to the edges of the screen. It is: a
**breadcrumb** of ancestors (brand-coloured, tappable, only on a
sub-group), the group's name with a **`FavoriteStar`** at the right of the same line
(`docs/specs/favorites.md`) — present on every kind of group, pair included: a pair
group's own page is one of the two places its star shows, the other being its row on the
Friends tab (`docs/specs/friends-and-invitations.md`) — a row of three **header chips** — "Settle" (the
reimbursement plan), "Stats" (the per-category breakdown), "Details" — all soft brand,
all present on every kind of group, archived or pair included, since the first two are
read-only views and the plan's one action is refused with a reason rather than hidden. An
"Archived — read-only" note when the group is *effectively* archived (itself or any
ancestor, `readOnly` on `GroupDetail`). Then **the viewer's own balance in a brand card**
— "Your balance here" over the figure, said in words so it never rests on spotting a minus
sign, read straight off `group.viewerBalanceCents` rather than a separate fetch.

Below: the sub-groups section, the transaction list (`TransactionRow` cards), and a
primary "Add a transaction" — absent when effectively archived. A row opens the same
add/edit sheet, pre-filled; when read-only, rows render but are not pressable. Empty
state: a brand card with a glyph and an explanation.

**Sub-groups section** (shown on **both kinds of group** — a friendship can have
sub-groups too): an `overline` "Sub-groups" heading with a brand "+ Create" link, then
every sub-group the viewer has joined as a card (`↳` medallion, name, member count, and
where they stand across *that* sub-group's own sub-tree), with its own **`FavoriteStar`**
at the right of the name line (`docs/specs/favorites.md`) — favorited joined sub-groups
are pinned above non-favorited ones. Ones they have **not** joined hide behind a "Show
sub-groups I'm not in (n)" toggle, mirroring the archived pattern; revealed, they render
`muted` with "n members · not joined" and no balance line (never being a member, it is
always exactly zero) and **no star** — there is no membership row to favorite on — and
tapping one opens a "Join this group?" `Alert` instead of navigating. The section renders
nothing when there are no sub-groups and the group is read-only, so it never becomes a
permanent empty box.

**Details sheet** — the member list (avatar + name, an accent "Owner" tag on the owner) in
one card, **balances** (`GroupBalances`) in another, then the management actions. The
per-member balance list is read **once, by the group screen**, and handed to the sheet.

**One screen for both kinds of group.** Transactions and sub-groups behave identically on
a pair group. Every other management action is **absent**, not disabled, there, and the
sheet's closing line explains that it is just the two of them. For a standard group: "Add
friends" and "Share an invitation link" (gone when effectively archived, or when the group
is `pairRooted`), "Rename" (gone only when the group's **own** flag is archived), "Archive
group" / "Reopen group" (always available, always the group's own flag), "Leave group"
(hidden for an owner who still has company or who solely owns a populated sub-group), and
a red text-only "Delete this group" for the owner.

States: loading, "This group is gone" (no retry, just a way back), and a retryable
connection error.

### Transaction row (`src/features/transactions/transaction-row.tsx`)

A card: the **category's emoji on a badge in the category's own colour**, then the title,
then a second line of date · kind · payer, then the viewer's own share, coloured. The
emoji is the badge — it is *not* prefixed to the title text.

### Reimbursements (`src/features/reimbursements/reimbursements-screen.tsx`)

A sheet from "Settle". **Answer first, justification second**: "Suggested reimbursements"
— one card per payment, a sentence ("You pay Alan Turing") with the amount at the end as
an `amount`, the viewer's own rows first — then a one-line count, then "Where everyone
stands", the group's balances in one card, same colours and wording as `GroupBalances`.

A payment card is **pressable and opens the pre-filled transfer form**; when it cannot be
recorded (archived group, or a party who has left) it is `muted`, disabled, and carries
the reason underneath — never a silent dead tap. When nobody owes anybody, both lists are
replaced by a single settled line.

The plan is **derived from the balances the group screen already loaded**
(`planReimbursements`), so the sheet has no fetch of its own.

### Group statistics (`src/features/statistics/statistics-screen.tsx`)

A sheet from "Stats". A **Spending / Income** pill row — with an **"Include sub-groups"**
pill for a group that has any, active by default — then a wrapped row of **one pill per
member** (the viewer's reads "You"), all active by default, each independently tappable.
When sub-groups are included and some are left out because the viewer has not joined them,
a small line says how many rather than presenting a partial sum as the whole tree's.

Under that a **donut chart** (220pt, 44pt ring — thick enough that a small share reads as
an arc, not a line), one arc per category in that category's own colour, and a legend card
below: swatch, emoji + label, percentage, amount — largest first. The hole holds the total
for the current selection; tapping an arc or legend row swaps it for that category's
emoji, label, amount and percentage, fades the other arcs to 30%, and tints the legend row
it came from. Tapping again, changing the type, or toggling a member or sub-groups returns
to the total.

States: a spinner, the same retryable connection error as the list, and empty states that
say *which* combination is empty ("Nothing recorded as income yet.") rather than a generic
"nothing here".

### Add / edit a transaction (`src/features/transactions/transaction-form-screen.tsx`)

One sheet for recording and for editing. A **kind pill row** (Expense / Income /
Transfer), then **two cards**:

1. *What it is* — a square **category badge** (the emoji, tappable, opens a sheet holding
   just the `CategoryPicker`; picking one closes it immediately, though the transaction is
   only persisted on "Save"), the title field beside it, then amount and date side by
   side under `overline` labels, then an optional multiline comment.
2. *Who it involves* — "Who paid" (`MemberSelect`), then either a single "To" picker
   (transfer, excluding the payer) or "Who it concerns" (`SplitEditor`).

Then primary "Save" (disabled until title, amount, date and split are all valid — the
category always has a value, so it never blocks saving), ghost "Cancel", and when editing
a red text-only "Delete this transaction".

### Member / friend selection

`MemberSelect` (single-select) and `FriendPicker` (multi-select) both render a **filled
row in `primarySoft` when selected**, not just a filled dot — what the eye lands on first
when reopening a pre-filled form. The dot or checkbox is the confirmation, not the signal.
The friend picker deliberately shows **no balance**: it is a selection list, and a money
figure there is noise.

### Split editor (`src/features/transactions/split-editor.tsx`)

Every member as a checkbox row (selected rows filled in `primarySoft`), plus a **Shares /
Fixed amounts** pill toggle. In shares mode each checked member gets a −/+ stepper
(default 1 — an equal split is everyone at the same weight) and a live "= 12.34" preview
using the server's own rounding. In fixed-amount mode each gets an amount field and a
running "X left to allocate" / "X over the total" line — `credit` when it balances,
`debit` otherwise. Switching modes seeds fixed amounts from the shares preview and resets
shares to equal weights, rather than losing the selection.

### Date field (`src/features/transactions/date-picker-field.tsx`)

A native picker via `@expo/ui`, platform split inside the one component: **iOS** an inline
`compact` SwiftUI `DatePicker`; **Android** a plain field opening the Material dialog
(Compose has no inline equivalent); **web** the app's own `TextField` in `YYYY-MM-DD`
(`@expo/ui` has no host views there).

### Create a group (`src/features/groups/create-group-screen.tsx`)

A sheet: a name field (autofocused, 60 chars), then the friend picker. Creating with
nobody selected is allowed — a link can come later. The same screen creates a
**sub-group** when opened with a `parentId`: the title reads "New sub-group", the button
"Create sub-group", and the parent is implicit. When the parent is `pairRooted` the friend
picker is **not shown at all**, replaced by a short note — the only other allowed person
is added automatically.

### Friends (`src/features/friends/friends-screen.tsx`)

`ScreenHeader` with `wash` and the friend count. Each friend is a card: avatar, name, **where the
two of them stand** — "owes you 12.50" / "you owe 12.50" / "settled up", coloured, netted
across every group they share — and a **`FavoriteStar`** at the far right (`docs/specs/
favorites.md`), favoriting the implicit pair group behind that row; favorited friends are
pinned above the rest, alphabetical within that, the same rule and the same
tap-does-not-jump behaviour the group list has. No grand total above the list: members of
shared groups who are not friends are absent from it, so a sum of the rows would not be
the viewer's overall position. **Tapping a card opens the group shared with that
friend**, directly by its already-known id — no request first, the group exists from the
moment the friendship does (`docs/specs/friends-and-invitations.md`); "Remove" stays a
separate hit area at the end. Empty state: a brand card. A footer holds the same
**`AddMenuButton`** pattern as Groups ("Add a friend"): "Invite a friend" (`plus` icon)
opens the invite sheet, "Enter a code" (`key` icon) opens a sheet holding the
invitation-code entry.

### Invitation code entry (`src/features/invites/invitation-code-entry.tsx`)

An `overline` "Got an invitation code?", a `TextField` and a secondary "Open" (disabled
until something is typed, submittable from the keyboard). **The same component on both
the Friends and Groups tabs** — neither has to know which kind of code the visitor is
holding — rendered inside the Friends tab's "Enter a code" sheet and the Groups tab's
"Join a group" sheet. An optional `onSubmitted` callback lets the host sheet close itself
once the code is handed off.

### Invitation sharing (`src/features/invites/invite-share-screen.tsx`)

One component behind both the friend link and the group link. The link sits in a
**brand-toned card** under an "Your invitation link" overline, and is **selectable**, so a
failed clipboard write is not a dead end. Primary "Share", secondary "Copy link" (flips to
"Copied"), the expiry in words, and a bottom ghost "Generate a new link" with a caption
warning that the previous link stops working.

### Invitation confirmation (`src/features/invites/invite-prompt.tsx`)

A full-screen modal, not a route: it must appear identically whether the code arrived from
a deep link or was typed, and it is mounted above the tabs. Centred avatar, what the link
leads to, and Accept / Join group / Not now. Terminal states: friends now, already
friends, joined (with "Open group"), already a member, link no longer valid, your own
link, and a retryable connection error.

## Navigation

`app/_layout.tsx` is a `Stack` wrapping the `(tabs)` group, so a group detail pushes above
the tab bar with a back button; the tabs live in `app/(tabs)/_layout.tsx`. Four tabs, in
order: **Home**, **Groups**, **Friends**, **Account**. The tab bar is
a **surface**, not the canvas, and the active tab carries the brand hue — the one place
navigation says which app this is. On web the tab list is a floating pill bar with the
"SplitCount" wordmark in brand violet.

The home is the index of that group, so its URL is `/`; the groups list sits at
`/groups`, which coexists with the `/groups/[id]` detail route outside the tabs.

Typed routes are generated into `.expo/types/router.d.ts` when the dev server runs. If
`router.push` or an `href` is rejected for a route that plainly exists, the generated file
is stale — restart the dev server rather than working around the type.

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
