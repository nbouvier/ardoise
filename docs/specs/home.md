# Feature: Home

## Context

Opening SplitCount landed straight on the group list — an alphabetical inventory that
says nothing about what the user was in the middle of. The list is the right place to
*manage* groups, and the wrong place to *resume*: the two or three spaces someone lives
in are buried among the ones they joined once, and nothing anywhere answers "what
happened since I last looked".

The **home** is the app's first screen: who it is, the handful of groups the user
actually opens, and the last things that involved their money. Everything on it is a
shortcut into somewhere else — it holds no state and offers no action that cannot be
taken where the thing itself lives.

## User story

As a **signed-in user**, I want to **land on a screen showing my favorite groups and my
latest transactions**, so that **I can resume where I left off without hunting through
the group list**.

## Expected behavior

### Shape

- The home is the **first tab**, and the one the app opens on. The group list moves to a
  tab of its own, unchanged (`docs/specs/groups.md`).
- It is made of three stacked sections, in this order: the **identity**, the **favorites**,
  the **latest transactions**. Each section below the identity carries a small heading and
  stands on its own — an empty one says why it is empty rather than disappearing.

### Identity

- The top of the screen — about a **quarter of its height** — carries the product's own
  identity: the app's mark, the name **SplitCount**, and underneath it, smaller, the line
  **"Settle up, stay friends."**
- It sits on a decorative background built from the app's own palette
  (`docs/DESIGN.md`) — soft, out-of-focus colour, never an image, never text the user
  has to read.
- It is decoration and identity only: nothing in it is tappable, and it never carries a
  figure, a count or a status.

### Favorites

- Lists every group the viewer has **favorited** (`docs/specs/favorites.md`), whatever
  kind it is: a group, a sub-group, and — unlike the group list — the **implicit pair
  group** behind a favorited friend (`docs/specs/friends-and-invitations.md`), which is
  the only place those two surface side by side.
- Each one is the **same row the group list uses**: medallion, name, member count, the
  viewer's own balance in that group, and its star. Tapping it opens the group; tapping
  the star unfavorites it, and the row leaves the section — this list *is* the
  favorites, so a removed favorite has nowhere to stay.
- A row whose group sits under another carries a **breadcrumb of its ancestors**, root
  first, in small type above the name — the same breadcrumb a sub-group's own page
  shows, so "Beach day" is never ambiguous between two trips.
- Ordering: active groups before archived ones, alphabetical within each. An archived
  favorite is shown muted, exactly as it is in the group list.
- Empty: a short line explaining that starring a group puts it here.

### Latest transactions

- Lists the **ten most recent transactions that involve the viewer** — the ones they
  paid, or that concern them — across **every group and sub-group they belong to**,
  pair groups included. Most recent first, by the date the transaction is *for*, then by
  the order they were recorded.
- A transaction between two other members of a group the viewer belongs to is **not**
  listed: the section answers "what moved my money", not "what happened in my groups".
- Each one is the **same row the group's own transaction list uses**, plus the group it
  belongs to above the title — with that group's ancestors, as a breadcrumb, when it has
  any.
- Tapping one opens **the group it belongs to**, not the transaction: editing a
  transaction is something done where its members and its balances are.
- Empty: a short line explaining that transactions recorded in a group show up here.

### Freshness

- The home re-reads both sections whenever something recorded elsewhere could change
  them: a transaction saved or deleted, a group (un)favorited, joined, archived or left.
- It also offers **pull to refresh**, which re-reads both sections at once.
- Each section fails on its own: one that cannot load says so and offers to retry,
  without taking the other one — or the identity — down with it.

## Out of scope

- Any figure aggregating several groups (a total owed, a net worth, a monthly spend):
  every balance in the product is scoped to one group (`docs/specs/balances.md`), and the
  home does not introduce the first exception.
- Recording a transaction, creating a group or inviting anyone from the home — it is a
  set of shortcuts into the screens that own those actions.
- Choosing what the home shows: the sections, their order and the ten-transaction
  ceiling are fixed.
- Notifications, unread markers, or any "since your last visit" state.
- An activity feed of what other members did (a transaction between two other people, a
  member joining, a group renamed).

## Edge cases

- **A brand-new account** (no groups, no favorites, no transactions): the identity still
  renders in full, and both sections show their empty line.
- **A favorited group that is archived, or whose parent is archived**: still listed, muted,
  and still opens — favorites are independent of archived state
  (`docs/specs/favorites.md`).
- **A favorited group the viewer is removed from, or that is deleted**: gone from the
  section on the next read, with no error — a favorite is a marker on a membership that
  no longer exists.
- **Unfavoriting from the home**: the row leaves the section. Unfavoriting the same group
  twice, or racing two toggles, behaves exactly as it does anywhere else (idempotent,
  last write wins).
- **A transaction in a group the viewer has since left**: not listed, even though they were
  a participant — the section only ever reaches into groups they currently belong to.
- **Fewer than ten transactions involve the viewer**: all of them are listed; the section
  never pads itself.
- **A transaction recorded by someone else that concerns the viewer**: listed, like any
  other that touches their money.
- **The viewer's own share of a listed transaction being zero** (they paid exactly their
  own share, or were added with a zero share): still listed, with the same "—" the group's
  own transaction list shows.

## Acceptance criteria

- [ ] Opening the app signed in lands on the home, and the group list is reachable from
      its own tab with its behaviour unchanged.
- [ ] The identity block shows the app name and the tagline over a decorative background,
      in both colour schemes, and occupies roughly the top quarter of the screen.
- [ ] The favorites section lists every favorited group, sub-group and pair group, with the
      same row the group list uses, active before archived and alphabetical within each.
- [ ] A favorited sub-group's row shows its ancestors as a breadcrumb above its name.
- [ ] Tapping a favorited row opens that group; tapping its star removes it from the
      section.
- [ ] The latest-transactions section lists at most ten transactions, most recent first,
      each one involving the viewer, drawn from every group and sub-group they belong to,
      and each showing which group it belongs to.
- [ ] A transaction between two other members of one of those groups is never listed.
- [ ] Tapping a listed transaction opens its group.
- [ ] Recording a transaction in a group and returning to the home shows it at the top of
      the section without a manual refresh.
- [ ] Each section shows its own empty state, and its own retry when it fails to load.

## Testing considerations

- The **involvement filter** is the part worth testing from both sides: a transaction the
  viewer paid, one where they are only a participant, and one that names neither — the
  last must not appear even though the group is theirs.
- The **membership boundary** is an authorization test, not a cosmetic one: a transaction
  the viewer participated in, in a group they have since left, must not be served.
- **Ordering with a tie**: two transactions on the same day must come back in recording
  order, newest first, so the ten-item ceiling is deterministic.
- The **favorites list crossing kinds** (a root group, a sub-group, a pair group) is worth
  one test: it is the only endpoint in the product that returns all three.

## Data / API considerations

- Nothing new is stored. Both sections are reads over data the server already owns:
  favorites live on the membership row (`docs/specs/favorites.md`), transactions on the
  ledger (`docs/specs/transactions.md`).
- A group summary now carries its **ancestors** wherever it is returned, not only on a
  group's own detail — a listed group has to be able to say where it sits.
- Two reads back the screen (see `docs/API.md` for the authoritative surface):
  - the caller's favorited groups, of any kind and any depth, each with its name resolved
    (a pair group is named after the other member), its ancestors and the caller's own
    balance in it;
  - the caller's most recent transactions across the groups they belong to, capped by the
    caller, each with the group it belongs to.
- Both are scoped to the caller by the server. Membership is re-established on every read:
  a favorite marker or a participation row is never on its own sufficient to be served a
  group's contents.

## UX / UI considerations

- The home holds no destructive action and no form. Its only writes are the favorite
  stars, which behave as they do everywhere else.
- The identity block's background is drawn from the palette's own hues so the screen
  cannot drift from the rest of the app; see "Home" in `docs/DESIGN.md`.
- Both sections reuse the rows they mirror rather than restyling them: a group looks the
  same on the home as in the group list, and a transaction the same as in its group.
