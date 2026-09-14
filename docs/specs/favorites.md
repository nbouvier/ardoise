# Feature: Favorite groups

## Context

A member of several groups has to scan past every one of them to reach the couple they
actually open every day. A **favorite** lets a member mark a group — or a sub-group — as
one of those, so it surfaces at the top of wherever it is listed instead of wherever the
alphabet or the archive puts it. A friend's row is the same idea wearing a different
label: underneath it is the implicit pair group the two share
(`docs/specs/friends-and-invitations.md`), and favoriting it is favoriting that group.

## User story

As a **member of a group**, I want to **mark it as a favorite from its own page or from
its row in a list**, so that **it stays near the top of the groups I look at often**.

As a **user with friends**, I want to **mark a friend as a favorite from their row**, so
that **the people I settle up with most stay near the top of my Friends list too**.

## Expected behavior

- A **star** sits at the far right of a group's name, wherever that name appears: on the
  group's own page (same line as the name, in the header) and on its row in a list — the
  group list, a parent's sub-groups section, and a friend's row in the Friends list alike
  (that row's name is the friend's, but the star still favorites the pair group behind it,
  `docs/specs/friends-and-invitations.md`). Unfilled means not favorited, filled means
  favorited.
- Tapping it **toggles** the group's favorite state for the viewer alone: unfavorited →
  favorited adds it, favorited → unfavorited removes it. The change is immediate and does
  not require confirmation.
- A favorite is **personal to the viewer**, not shared with the group: two members can
  have the same group favorited, neither, or only one of them, independently.
- **Favorited groups are pinned above non-favorited ones** within each section a group
  list already has, without disturbing those sections' own boundaries or the ordering
  within each side of the split:
  - the group list: favorited groups first among the active ones, and — independently —
    favorited groups first among the archived ones when that section is revealed; active
    still sorts before archived exactly as before.
  - a parent's sub-groups section: favorited sub-groups first among the ones the viewer
    has already joined. An unjoined sub-group is never favorited (see Edge cases) and its
    position among the "not in" toggle's own list is unaffected.
  - the Friends list: favorited friends first, the same way — there is only the one
    section, no archived/active split to keep separate.
  - within a favorited or non-favorited bucket, the existing alphabetical order still
    applies.
  - the pinned order is not forced into view the instant a group is (un)favorited: an
    already-visible list does not jump underneath the viewer's finger. The refetch that
    toggle itself triggers (`groupsChanged`, `docs/DESIGN.md`) keeps the row where it is;
    the pinned order takes over on whichever later refetch comes next — another change
    elsewhere notifying the same signal, or the list's own retry action — not
    synchronously with the tap that set the favorite.
- Favoriting or unfavoriting works the same whether the group is active, archived, or
  effectively read-only (an ancestor archived) — it changes nothing about the group
  itself, only the viewer's own marker on their membership in it.
- The implicit **pair group** (the one-to-one tab with a friend) can be favorited from
  either place that shows it: its own page, or the friend's row in the Friends list — the
  same membership row, the same star, the same pinning rule as any other group
  (`docs/specs/friends-and-invitations.md`).

## Out of scope

- A dedicated "Favorites" view, filter or tab collecting every favorited group in one
  place — favorites only change ordering where a group already appears.
- Favoriting anything other than a group (or, through it, a friend): a transaction, a
  category.
- Reordering within the favorited or non-favorited bucket by hand — alphabetical order
  still applies inside each.
- Notifying anyone that a group was favorited.

## Edge cases

- **Favoriting a group twice, or unfavoriting one that is not favorited**: a no-op,
  reported as success — the same idempotence every other toggle-shaped action in the
  product already has.
- **Two favorite/unfavorite requests for the same group racing**: the last write wins;
  neither request errors.
- **A sub-group the viewer has not joined**: never shows the star, the same as it shows no
  balance — a non-member has no membership row to hold a favorite on.
- **A group that becomes archived, or whose ancestor becomes archived, while favorited**:
  keeps its favorite state and its pinned position, unaffected by read-only status.
- **The viewer leaves a group, or is removed from it**: their favorite on it, being part of
  the membership row itself, disappears with the membership — nothing extra to clean up.
- **Network failure while toggling**: the star does not change, and a retryable error
  surfaces the same way any other failed group action does.

## Acceptance criteria

- [ ] A member sees a star at the right of the group name on the group's own page, and at
      the right of every group row in the group list and in a parent's sub-groups section
      (joined ones only).
- [ ] Tapping an unfavorited star favorites the group immediately; tapping a favorited one
      unfavorites it; no confirmation is required either way.
- [ ] A favorited group is listed above non-favorited ones within the active section of
      the group list, and within the archived section independently; alphabetical order
      still applies within each half.
- [ ] A favorited, already-joined sub-group is listed above non-favorited joined ones in
      its parent's sub-groups section, the same way.
- [ ] Favoriting a group is personal: another member's view of the same group is
      unaffected.
- [ ] Favoriting/unfavoriting works on an archived or effectively read-only group without
      changing anything else about it.
- [ ] An unjoined sub-group never shows the star.
- [ ] Leaving or being removed from a group drops its favorite state along with the
      membership; nothing is left behind to reappear if the viewer rejoins later.
- [ ] Favoriting a group from a currently-visible list flips its star immediately but does
      not move its row in that same list; a later, unrelated refetch is what brings the
      pinned position into view.
- [ ] The pair group's own page shows the star too, and it toggles the same way as any
      other group's — see `docs/specs/friends-and-invitations.md` for its star on the
      Friends list and that list's own pinning.

## Testing considerations

- **Ordering**: a mix of favorited/non-favorited groups across the active/archived split
  (and across joined/unjoined sub-groups, and across the Friends list) must sort
  favorited-first within each existing bucket, never across bucket boundaries.
- **Authorization**: favoriting is refused the same way every other group action is for a
  non-member (`docs/specs/groups.md`'s access matrix) — a favorite toggle must not become a
  new way to probe a group's existence.
- **Idempotence**: repeating a favorite or unfavorite call, including two racing at once,
  must not error and must leave the state each call asked for.
- **Cascade**: removing or leaving a membership must not leave an orphaned favorite row
  behind (the column lives on the membership row itself, so this should hold by
  construction — worth one test to pin it down).

## Data / API considerations

- A favorite is **not a new entity**: it is a nullable timestamp on the viewer's own
  membership row (`group_members.favorited_at`), set when favorited and cleared when not.
  It lives and dies with that membership row, so leaving a group removes it for free.
- `GroupSummary`, `GroupDetail`, a sub-group's own summary, and `FriendEntry` each carry a
  `favorite` boolean: the viewer's own state, never another member's. `FriendEntry` also
  carries the pair group's `groupId`, so favoriting a friend goes through the same two
  endpoints below rather than one of its own (`docs/specs/friends-and-invitations.md`).
- Two endpoints toggle it, mirroring the shape of every other per-group action
  (`docs/API.md`): setting favorited is idempotent to call repeatedly, and so is clearing
  it.

## UX / UI considerations

- The star sits **on the same line as the group's name**, right-aligned — in the group
  page's header row, and in a list row aligned with the name specifically, not the row's
  full height (a list row shows a member count and/or a balance beneath the name too).
- Tapping the star must not also trigger the row's own "open this group" action or the
  page's own navigation.
- Filled vs. unfilled is the only signal needed; no additional label, matching how the
  rest of the product favors a plain visual state (`docs/DESIGN.md`) over a text toggle
  for something tapped this often.

## Observability

- A favorite/unfavorite must be diagnosable the same way an archive toggle already is: the
  acting user, the group, and the resulting state.

## Security / privacy considerations

- Favoriting requires the same membership check as every other group action — a group the
  caller does not belong to answers `group_not_found`, never confirming its existence
  through a different route.
- Nothing about a favorite is disclosed to another member: it lives only on the viewer's
  own membership row and never appears in another member's view of the group.

## Open questions

None.
