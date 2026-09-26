# Feature: Groups

## Context

SplitCount can tell who a person is (Google sign-in) and who they are connected to
(friends), but there is still nowhere to put a shared expense. A **group** is that place:
a named space that a set of people belong to, inside which expenses are recorded, split
and balanced.

Two shapes of shared space exist in practice and users should not have to think about the
difference:

- an explicit, named group — a trip, a flatshare, a recurring night out;
- the ongoing one-to-one tab between two friends, which in Tricount forces people to
  create a two-person "trip" that is really just "me and you".

Groups make the second case an **implicit group** that already exists for every pair of
friends, reachable by tapping that friend. Both run on the same model: a group is a group,
only its lifecycle differs.

A third shape addresses a real organisational gap Tricount does not solve: a shared trip
or household is rarely one flat expense pool. A flatshare has a recurring-bills sub-budget;
a group holiday has a sub-trip only some of the party joins. Rather than forcing everything
into one undifferentiated group, or forcing a brand-new top-level group with its own
separate membership and no relationship to the trip it belongs to, a **standard group can
have sub-groups**, nested up to a bounded depth. A sub-group is a normal group in every
respect — it has its own name, its own members, its own transactions and its own
statistics — that additionally remembers which group it was created under.

## User story

As a **SplitCount user**, I want to **create a group and put my friends in it**, so that
**we have one place to track what we share**.

As a **SplitCount user**, I want to **invite someone into a group with a link**, so that
**I can include people who are not in my friend list yet**.

As a **SplitCount user**, I want to **open the shared space I have with a friend by
tapping their name**, so that **a one-to-one tab does not require creating a group**.

As a **SplitCount user**, I want to **archive a group that is over and delete one that
was a mistake**, so that **my list stays about what is still going on**.

As a **member of a group**, I want to **create a sub-group under it for a subset of us**,
so that **a side trip or a recurring sub-budget has its own space without starting an
unrelated group from scratch**.

As a **member of a group**, I want to **see at a glance what I owe or am owed across a
group and everything nested inside it**, so that **I don't have to open every sub-group to
know where I stand on the trip as a whole**.

## Expected behavior

### Creating a group

- A signed-in user can create a group by giving it a **name** and, optionally, picking
  **friends** from their friend list to add straight away.
- The creator is the group's **owner**. Everyone else is a **member**.
- A group appears immediately in the list of every person who belongs to it.
- A group may optionally be created **under an existing group**, becoming its sub-group —
  see "Sub-groups" below.

### The group list

- The list shows the **root groups** the user belongs to: name, member count, and their
  own net balance (see "Balance across a group and its sub-groups" below). A group that is
  itself a sub-group is never a top-level entry in this list — it is reached by opening its
  parent.
- **Implicit pair groups never appear in this list.** They are reached from the friend
  list.
- **Archived groups are hidden by default**, behind a toggle at the bottom of the list
  that states how many there are. Revealed, they are shown **below** the active groups and
  are visually muted.
- Empty state: an explanation; the "+ Join or Create" action stays at the top.
- Each row carries its own **"⋮" actions menu**, next to its favorite star: Manage (opens
  the group opened on its Manage tab), Archive/Reopen, Leave and Delete —
  exactly the actions available from inside the group itself (see "Inside a group" below),
  gated the same way, so acting on a group never requires opening it first. The same menu
  sits on a group's own row wherever else it is shown as a row with a favorite star — a
  joined sub-group in its parent's own sub-groups section, and a favorited group (pair
  groups included) on the home screen (`docs/specs/home.md`).

### Inside a group

- A group shows its name, its members, and — for a standard group — its own **sub-groups**.
- A group's page is split into four tabs — **Transactions** (its sub-groups and its
  transactions, the default), **Balances** (the viewer's own balance, the plan to
  reimburse, and where every member stands), **Statistics**, and **Manage** (the member
  list and the actions on the group itself).
- Any member can **add friends of theirs** to the group, **share an invitation link**
  (both from the "+ Invite" action heading the Manage tab's member list, which opens one
  page carrying both at once: the friend picker on top, the link at the bottom), **rename** the group, **archive** it, and **create a sub-group**
  under it.
- Only the **owner** can **delete** it.
- A member can **leave** a group. The owner cannot leave while others remain — they
  archive, delete, or remove themselves once alone (which deletes the group). The same
  applies if the owner is themselves the sole remaining owner of a populated sub-group of
  it — see "Sub-groups" below.
- Expenses are recorded, split and balanced inside the group; see
  `docs/specs/transactions.md` and `docs/specs/balances.md`.

### Sub-groups

A group can have sub-groups nested under it, and those sub-groups can themselves have
sub-groups, up to **five levels deep** (a root group plus four levels of nesting). A
sub-group is itself always a **standard** group — it has its own name, owner, members,
transactions and statistics, and is created, renamed, archived, deleted, joined and left
exactly like a root standard group — but the *parent* being nested under can be either
kind: a standard group, or the **implicit pair group** two friends share. Nesting under a
pair group works exactly the same way, with one difference — see "Sub-groups of a pair
group" below.

- **Creating a sub-group** is available to any member of the parent group, the same
  people who can add a friend to it. The parent must be *effectively active* and not
  already at the depth limit — see the constraints below.
- **Membership flows down automatically, never sideways or up on its own.** Belonging to
  a group **requires** belonging to every one of its ancestor groups. Concretely: adding a
  friend to a group, or accepting an invitation into it, adds that person to the group
  **and to every ancestor of it** in the same action. This is what makes "a sub-group is
  smaller than its parent" true by construction rather than by convention: nobody is ever
  in a trip's Corsica sub-group without also being in the trip itself.
- **A sub-group is visible to every member of its direct parent**, whether or not they
  belong to the sub-group itself — it shows in the parent's sub-group section with its
  name and member count. A member of the parent who is not yet a member of the sub-group
  can **join it directly**, a lighter action than accepting an invitation link: no
  friendship check, since they are already trusted enough to be in the parent. Joining a
  sub-group only ever adds the person to that sub-group — never to a level further down —
  since membership in the parent (and beyond) already holds by the same rule.
- **A member who does not belong to every sub-group of a group they are in has those
  unjoined sub-groups hidden from them by default**, behind a toggle that states how many
  there are, mirroring the existing archived-groups toggle. Revealing them lists them
  alongside the ones already joined.
- **Leaving or being removed from a group removes that person from every descendant of
  it**, for the same reason membership flows down at add time: nobody can remain in a
  sub-group of a group they are no longer part of. The confirmation for leaving or for
  removing someone states how many sub-groups (and, transitively, their contents) that
  reaches.
- **Archiving a group makes every sub-group of it effectively archived too**, without
  writing anything to those sub-groups: a sub-group's own archived state, and its
  ancestors', are independent facts, and a group is read-only exactly when it or any
  ancestor of it is archived. Un-archiving the parent restores each sub-group's own state
  exactly as it was — nothing about a sub-group's individual archived state is lost by an
  ancestor's archive cycle.
- **Deleting a group deletes its entire sub-tree** — every sub-group, at every depth, with
  everything in them. The confirmation states this in terms of what is lost (sub-groups
  and their transactions), not only "this group".
- **A sub-group's parent is fixed at creation and cannot be changed** (no re-parenting, no
  promoting a sub-group to a root group). This keeps the tree acyclic by construction and
  keeps every membership, balance and statistics computation a straightforward top-down
  walk.
- **A pair group can never itself have a parent** — it stays a root, keyed by its
  friendship. It *can* be a parent, though: see the next section.

### Sub-groups of a pair group

A pair group is a fixed, two-person space, and that does not change just because it now
has sub-groups: **every sub-group nested under a pair group — at any depth — can only
ever contain that friendship's own two people**, forever. Concretely:

- **No third person can ever be added**, by any of the usual paths: chosen as an initial
  member while creating the sub-group, added later as a friend, or joining through an
  invitation link. All three would otherwise propagate a new membership up into the pair
  group itself (the same upward-flow rule every sub-group follows) and break the one thing
  that defines it. Attempting any of them is refused the same way any other pair-group
  change is (`pair_group_immutable`).
- **The other friend is already a member from the moment it is created** — since the
  friendship's two people are the only ones such a sub-group could ever hold, there is no
  picking involved and nothing to join: creating one starts both of them in it, unlike an
  ordinary sub-group's unjoined-until-picked members.
- **Sharing an invitation link is refused outright** for such a sub-group: there is no one
  it could legitimately be for, since the only other allowed person already has the join
  path above.
- Everything else about it is unaffected — it can still be renamed, archived, deleted,
  and left like any standard group; only who can ever be *in* it is capped.
- This caps every sub-group in that part of the tree, however deep: a sub-group of a
  sub-group of a pair group is capped exactly the same way, transitively.

### Balance in a group, and in each sub-group

- The **group list** shows, next to each root group, the user's own net position **in
  that group alone**: positive means they are owed, negative means they owe, consistent
  with every other balance figure in the product (`docs/specs/balances.md`).
- A **sub-group is never folded into its parent's figure**, at any depth. Each space
  answers "where do I stand here", and the number under a group's name is exactly what
  its own transaction list and per-member balances add up to. A rolled-up figure was
  tried and dropped for precisely that reason — see `docs/specs/balances.md`.
- Inside a group, a member sees that group's own figure on the group screen, and each
  **joined** sub-group in the sub-groups section carries its own; one the viewer has not
  joined shows nothing, since they are on none of its transactions.

### Inviting into a group

- A group has **one active invitation link at a time**, shared by the whole group rather
  than per member: any member sees, shares and can replace the same link. This applies to
  a sub-group exactly as to a root group — its link is its own, separate from its
  parent's.
- The link behaves exactly like a friend invitation link: reusable while valid, expiring
  after ~7 days, revocable, and openable by someone who does not have the app yet.
- Whoever accepts it **joins the group** — and every one of its ancestors, per "Sub-groups"
  above — as a member. It does **not** make them a friend of the person who shared it.
- The recipient sees, before accepting, **who invited them and which group** they are
  being invited to.

### Archiving and deleting

- **Archiving** is reversible and loses nothing: the group becomes inactive, drops to the
  archived section, and can be reopened. An archived group is read-only for membership
  changes — no adding, no invitation links, no creating a sub-group under it — until it is
  unarchived. The same read-only behavior applies to a group whose *ancestor* is archived,
  even while the group's own archived state is untouched — see "Sub-groups".
- **Deleting** is irreversible and loses everything in the group **and in every sub-group
  nested inside it**. It is confirmed explicitly and is stated as permanent.

### The implicit pair group

- Every pair of friends shares a group, created the moment the friendship is
  (`docs/specs/friends-and-invitations.md`) — by the time either side sees the other in
  their Friends list, the group already exists.
- It is **not listed** among the user's groups — it surfaces on the Friends list instead,
  one row per friend, the same one that opens it (`docs/specs/friends-and-invitations.md`).
- **Nobody can be added to it**: no member management, no invitation link. It stays
  exactly two people.
- It **cannot be renamed, archived, or nested under something else**. It is named
  after the other person.
- **It can have sub-groups**, exactly like a standard group — but every sub-group in that
  tree, at any depth, is itself capped at the same two people forever (no third person, no
  invitation link either); see "Sub-groups of a pair group" above.
- In every other respect it is a normal group and holds expenses the same way.
- It **disappears with the friendship**: removing a friend deletes the pair group and
  everything in it, on both sides. This is the same loss as deleting a group, and the
  friend-removal confirmation says so.
- Its row's own "⋮" menu (wherever it is shown as a row with a favorite star — a favorited
  pair group on the home screen, `docs/specs/home.md`) only ever offers **Manage** and
  **Delete**: Archive and Leave don't apply to it — see "Inside a group" and "Archiving and
  deleting" above for why — so showing them here would be a dead end.
- **Deleting it directly does the same thing.** Unlike a standard group, it has no owner
  gating who may take this action — either of the two friends can — and doing so does not
  merely empty the shared space, it ends the friendship itself, exactly as if either side
  had removed the other as a friend. The client's confirmation for this action reads as a
  friend removal ("Remove so-and-so from your friends?"), not as a group deletion, since
  that is the loss it actually causes. This is the one operation on a pair group that is
  *not* refused as `pair_group_immutable` — see "Edge cases" above.

## Out of scope

- **Re-parenting a sub-group**, or promoting a sub-group into a root group. The parent is
  fixed at creation.
- **A depth limit other than five levels** being configurable; five is a fixed constant.
- **Moving a group's own transactions** into or out of a sub-group after the fact — a
  transaction stays recorded in the group it was created in.
- Group avatars, colours, categories, currencies or descriptions.
- Transferring ownership, or more than the two roles (owner / member).
- Per-group notification settings, activity feeds, or notifying members that they were
  added, that a sub-group was created under a group they are in, or that a group was
  archived.
- Group-level privacy settings, or approval before joining a visible sub-group or
  following a link.
- Restoring a deleted group (or sub-tree), or any undo window.
- Searching and filtering the group list or the sub-group list.
- Making a pair group "promotable" into a normal group by adding a third person.
- Web (`mobile:web`) support beyond what already works: sign-in is disabled there.

## Edge cases

- **Adding someone who is already a member**: no duplicate, no error — the membership is
  simply already there. This holds separately at each level of the tree: adding a friend
  already in the parent but not the sub-group adds them to the sub-group only.
- **Adding a non-friend directly** (by user id): refused. Direct addition is limited to
  the caller's friends; anyone else joins through a link or, for a sub-group, the join
  action.
- **Two people accepting the same group link at once**, or one person accepting twice: the
  membership (at every level it touches) is created once; a repeat reports "already a
  member".
- **A member accepting their own group's link**: no-op, reported as already a member.
  Unlike a friend invitation this is not an error.
- **Two people joining the same visible sub-group at once**, or one person joining twice:
  same idempotence and concurrency guarantee as accepting a link.
- **A member of the parent trying to join a sub-group of a group they are not (or no
  longer) a member of**: impossible to construct — every ancestor is always joined before
  a descendant, so a sub-group is never visible without its parent already being joined.
- **Accepting a link to a deleted group, or joining a sub-group that was deleted or
  emptied moments earlier**: treated like a dead link / "not found" respectively.
- **Accepting a link to an archived group, or one whose ancestor is archived**: refused as
  a dead link — an effectively archived group takes no new members at any level.
- **The member who created the link leaves the group**: the link keeps working; it belongs
  to the group, not to them.
- **Being removed from a group while looking at it, or while looking at one of its
  sub-groups**: the next action returns "group not found" and the user is taken back
  towards the list.
- **A non-member requesting a group they cannot see at all**: answered as **not found**,
  never as "forbidden" — group existence is not disclosed. **A member of the direct parent
  requesting a sub-group they have not joined** is the one case where existence is already
  known to the caller (it is visible in the parent's sub-group list); this is answered
  distinctly — see Security / privacy considerations.
- **The owner trying to leave** with other members present, in this group or in a
  sub-group of it where they are the sole owner: refused with an explanation naming which
  group is the obstacle.
- **A member trying to remove the owner**: refused. Otherwise the group would be left with
  nobody allowed to delete it.
- **Removing someone who already left**: a no-op, not an error, at every level it would
  otherwise touch.
- **The last member leaving a group**: the group, and by the same act every sub-group
  nested in it (necessarily now empty too, by the membership invariant), is deleted with
  its contents.
- **Any membership change on a pair group itself** (add, remove, invite, rename, archive,
  nest it under something else): refused; the pair group is immutable by
  construction. **Creating a sub-group under it is allowed** — but bringing a third
  person into that sub-group, or any of its descendants, is refused the same way (see
  "Sub-groups of a pair group" above). **Deleting it is the one exception**: it works
  exactly like removing the friend (see "The implicit pair group" below), so either
  side may do it, owner or not — there is no owner on it in the first place.
- **Two people becoming friends at the same time as each other trying to** (racing invite
  acceptances): the friendship is created once (`docs/specs/friends-and-invitations.md`)
  and so is its pair group — the unique constraint on `groups.friendship_id` is what
  guarantees that, the same way `friendships`' own constraint does for the relationship.
- **Opening the pair group of someone who is no longer a friend**: refused, like any other
  group the user does not belong to.
- **Creating a sub-group at the depth limit**: refused with an explanation; the five-level
  cap is fixed.
- **A sub-group the viewer has never joined, in the parent's sub-groups section**: it is
  listed with its member count and no balance of theirs — they are on none of its
  transactions — and its money never reaches the parent's own figure.
- **Network failure** while loading, creating, archiving, deleting, or joining a
  sub-group: an explicit, retryable error; nothing is half-created.

## Acceptance criteria

- [ ] A signed-in user can create a named group, optionally selecting friends, and it
      appears in their list and in each selected friend's list.
- [ ] The group list shows root groups only, with member counts, each member's own
      balance in that group, and an empty state with a "Create a group" action.
- [ ] Archived groups are hidden behind a toggle that states how many there are, and are
      listed below the active ones when revealed.
- [ ] Archiving a group loses nothing and can be undone; the group returns to the active
      section.
- [ ] Deleting a group asks for an explicit confirmation naming what is lost — including
      any nested sub-groups and their transactions — and states that it is permanent; the
      group and its entire sub-tree disappear for every member.
- [ ] Only the owner can delete a group; another member attempting it is refused.
- [ ] Any member can rename, archive, add a friend to, share the link of, and create a
      sub-group under a standard group.
- [ ] A group has one invitation link at a time; every member sees the same one, and
      replacing it invalidates the previous one. A sub-group's link is independent of its
      parent's.
- [ ] Opening a group invitation link shows who invited the recipient **and** the group
      name, before they accept.
- [ ] Accepting a group link adds the person to the group **and to every one of its
      ancestor groups**, and does **not** create a friendship.
- [ ] Accepting a group link twice does not duplicate any membership and reports that they
      are already a member.
- [ ] A group link for an archived group, or one whose ancestor is archived, or a deleted
      group, is refused as no longer valid.
- [ ] A member of a group can see its direct sub-groups, including ones they have not
      joined, behind a toggle mirroring the archived-groups one.
- [ ] A member of the parent can join a visible sub-group directly, without an invitation
      link, and this adds them to that sub-group only (their membership in every ancestor
      already holds).
- [ ] A member who is not a member of the immediate parent of a group gets a "not found"
      answer for that group; a member of the immediate parent who has not joined the
      sub-group itself gets a distinct "join required" answer, never a silent success.
- [ ] Creating a sub-group beyond five levels of nesting is refused.
- [ ] A member can leave a group; leaving removes them from every sub-group nested inside
      it too. The owner cannot leave while other members remain in the group **or in any
      sub-group they solely own**, and no member can remove the owner.
- [ ] Tapping a friend in the friend list opens the group shared with that friend, showing
      their name, both members, no membership or invitation actions, and an ordinary
      sub-groups section.
- [ ] That pair group never appears in the group list, and cannot itself be a sub-group.
- [ ] The pair group exists from the moment the friendship does; two people becoming
      friends at the same time as each other trying to still ends with a single group.
- [ ] Archiving, renaming, inviting into or adding someone to a pair group is refused;
      creating a sub-group under it is not.
- [ ] Deleting a pair group directly works, for either friend, and ends the friendship —
      the same end state as removing the friend.
- [ ] A sub-group nested under a pair group, at any depth, starts with both friends as
      members already, and refuses a third person as a further initial member, as a later
      addition, and through an invitation link (which cannot even be generated for it) —
      while it can still be renamed, archived, deleted and left normally.
- [ ] Archiving a group makes every one of its sub-groups read-only for membership and
      transactions without changing any sub-group's own archived flag; un-archiving the
      parent restores each sub-group's own prior state exactly.
- [ ] Removing a friend deletes the group shared with them for both users, and the
      removal confirmation states that its contents are lost.
- [ ] Every group route is refused for a user who is not a member of that group, nor of
      its immediate parent, enforced by the server.

## Testing considerations

- **Authorization is the core risk**: every group route must be proven inaccessible to a
  non-member and to a non-member-of-the-parent, server-side, and must answer `404` in
  every case except the one deliberate `403` (a parent member who has not joined the
  sub-group) — worth a matrix test across every route rather than one-off checks.
- **The membership-implies-ancestor-membership invariant** is the property the whole
  feature rests on: after any add, invite acceptance, join, or account state change, a
  generated check that "member of X ⇒ member of every ancestor of X" must hold. Property
  tests over randomly generated small trees are worth more here than a handful of fixed
  examples.
- **Downward removal**: leaving or being removed from a group must remove the same person
  from every descendant, and never touch an unrelated branch of the tree or the ancestors.
- **Idempotence of the pair group under concurrency** is worth a test that races two
  friendship-acceptance requests without awaiting the first — the group is created there
  now (`docs/specs/friends-and-invitations.md`), not on first access.
- **Idempotence and concurrency of joining a sub-group**, the same way, is a direct
  analogue.
- The **pair-group immutability** guard still applies to add, remove, invite, rename and
  archive on the pair group itself, plus nesting it under something else; cover them as a
  set rather than one by one. **Delete is the deliberate exception** — worth its own test
  proving it is *not* refused, succeeds for either member (not just whichever side sent the
  original friend invitation), and ends with the same state as removing the friend
  (friendship gone, group and every sub-group in it gone, for both sides). Creating a
  sub-group under a pair group is also allowed — the same immutability guard reappears one
  level down instead, refusing a third person anywhere in that sub-group's own tree (add,
  invite, or an initial member at creation) — cover that set separately, since it is a
  different operation triggering the same reason.
- **Effective archive**: a transaction, membership change or invitation issued against a
  sub-group must be refused when *any* ancestor is archived, not only when the sub-group
  itself is; and restored the instant the archiving ancestor is un-archived, with no state
  lost on the sub-group itself.
- **Depth enforcement**: creating at depth four (the fifth level) succeeds; at depth five
  is refused. A generated chain, not just a hand-built one, is worth covering.
- **Balance containment**: for a tree of groups and transactions, each group's figure must
  equal that member's own balance in that group and nothing more — money spent in a
  sub-group must not move its parent, at any depth (`docs/specs/balances.md`).
- **Cascade deletion of a sub-tree**, not just a single group, deserves a direct test:
  deleting a group with two levels of sub-groups beneath it removes every membership,
  invitation and transaction at every level.
- The generalised invitation system is shared with friends: the existing friend
  invitation behaviour must be preserved, and the group name is now rendered into the
  landing page HTML, so **escaping needs a test with a hostile group name** — unchanged
  from before, still worth re-asserting since sub-groups reuse the same invitation
  mechanism unmodified.

## Data / API considerations

See `docs/API.md` for the authoritative surface and `docs/DATABASE.md` for the schema.

- A **group** persists: kind (standard or pair), name, archived state, timestamps, its
  parent group (nullable — null for a root group), its depth in the tree, and for a pair
  group the friendship it belongs to.
- A **membership** persists the group, the user and their role. It is the only thing that
  grants access to a group at that level — there is no separate "grants access to the
  whole sub-tree" record; access to a descendant is always its own membership row, kept
  consistent with its ancestors' by the write paths described above, never by a read-time
  walk that infers it.
- The pair group is **keyed by the friendship**, so the database itself guarantees one per
  pair and removes it with the friendship; a pair group's own parent is always null. It can,
  however, *be* referenced as another group's parent — a friendship can have sub-groups.
- The pair group's name is **not stored**: the API returns the other member's name, so
  each side sees the person they are sharing with.
- **A sub-group nested under a pair group, at any depth, is capped at that friendship's own
  two people** — enforced in the service layer against every group in the tree whose root
  ancestor is the pair group, not by a column (`GroupDetail.pairRooted` exposes this to the
  client). See "Sub-groups of a pair group" above.
- **A group's parent is immutable after creation.** There is no endpoint to change it.
  This is what keeps the tree acyclic without needing cycle detection, and keeps every
  tree computation (membership propagation, effective-archive, depth) a
  bounded top-down or bottom-up walk instead of an open-ended graph problem.
- **Depth is capped at five levels** (a root group plus four levels of nesting), enforced
  at creation.
- **Invitations are shared, not group-tree-specific.** The existing invitation mechanism
  (one code space, one link format, one landing page, `docs/specs/friends-and-invitations.md`)
  is unchanged by sub-groups: a sub-group's invitation is exactly a group invitation whose
  target happens to be a sub-group, resolved the same way.
- The public preview of a code returns **who is inviting** and, for a group, the group's
  name and member count — never a member list, never an email address, never the group's
  position in a tree (its ancestors are not disclosed to someone who has not yet joined).

## UX / UI considerations

- **Groups replace Home as the first tab** and the app's landing screen. Tabs remain
  Groups, Friends, Account.
- **Group list**: root groups only, name + member count + the member's own balance in
  that group. Archived groups sit under a discreet
  "Show archived (n)" toggle at the bottom and are muted when shown. Primary
  "+ Join or Create" action, which opens the one "New group" page.
- **New group**: one page for both ways in. On top, **create**: a name field and the
  friend list with multi-selection; creating with no friends selected is allowed. Below,
  after an "OR" rule, **join**: the same manual invitation-code entry the Friends tab has —
  one code, entered the same way, whichever it turns out to lead to — where pasting a
  whole invitation link keeps just its code. The page is closed by the chevron in its
  banner. Creating a sub-group reuses the create part, opened from inside the parent, with
  the parent implicit rather than a field to fill in and no join part.
- **Group detail** is one screen used for every standard group at any depth, and for a
  pair group. Its **top banner** — the same wash as the app's other pages — carries the group's name and, after a "·" in smaller type, its member
  count on one line, with a breadcrumb of its ancestors above the name when it is a sub-group (so a member
  always knows where in the tree they are), the favorite star, and the way back (a down chevron at the far end). Under it
  are four **tabs**: **Transactions** (the default), **Balances**, **Statistics** and
  **Manage**, described below. The Transactions tab shows a **sub-groups section** — shown
  for a pair group too — above the transaction list, listing its direct
  sub-groups with their member counts and, for a joined one, its own balance;
  sub-groups the viewer has not joined are hidden by default behind a
  "Show sub-groups I'm not in (n)" toggle, mirroring the archived-groups pattern, and open
  a "Join this group?" confirmation rather than the group itself. For a pair group, the
  member actions, the invitation action and the rename/archive/delete actions are absent —
  not disabled-looking, absent — because they can never apply; **for any group whose tree
  is capped at a friendship's two people** (the pair group itself, or a sub-group nested
  under it at any depth), "+ Invite" (and so "Add friends" and "share an invitation link") is likewise absent
  and creating a further sub-group there skips the friend picker, since there is never
  anyone left to offer — the other person is already a member of it from the moment it is
  created, so it never shows up behind the "not in" toggle above in the first place.
- Deleting asks for confirmation and states that everything in the group **and its
  sub-groups** is lost; leaving asks for confirmation too, and states how many sub-groups
  it also removes the member from.
- The **invitation screen is the one that already exists** for groups, reused unchanged
  for a sub-group's own link.
- The **friend row becomes tappable** and opens the shared group; the row's trailing
  "Remove" text button is replaced by a "⋮" actions menu ("Manage", "Delete friend"); the
  confirmation mentions the shared group's contents.
- The **landing page** gains the group's name when the link is a group invitation, exactly
  as before — unaffected by whether that group is a sub-group.
- Light and dark themes through the existing tokens.

## Observability

- Group creation, archiving, unarchiving and deletion must be diagnosable with the acting
  user and the group, including its parent when it is a sub-group.
- Joining and leaving a group must be observable, including whether a join came from a
  link, from the direct join action on a visible sub-group, or from being added by a
  member — and, for a leave or removal, how many descendant groups it cascaded into.
- Refused group access must be observable with the reason (not a member, join required,
  pair group immutable, not the owner, max depth reached) — a spike means either a bug or
  probing. `join_required` and `group_not_found` are logged distinctly so the two are not
  confused when reviewing access patterns.
- Pair-group creation is observable; a *second* creation for the same friendship losing
  the race is expected and must not be logged as an error. The same applies to a second
  sub-group join losing a concurrent race.
- Invitation codes and group names must not be logged; a group name is user content and
  the code is a capability.

## Security / privacy considerations

- **Membership is the only authorization**, at every level of the tree. Every group route
  resolves the caller's own membership row for the group named in the URL server-side
  first; the mobile app never gates access on its own, and access to an ancestor is never
  treated as access to a descendant, or vice versa.
- **Non-membership of a group's immediate parent** answers `404`, so a group's existence
  is not disclosed to someone with no legitimate way to have learned it exists.
  **Membership in the immediate parent without membership in the group itself** answers a
  distinct `403 join_required` — a deliberate, narrow exception to "always 404": the
  caller already legitimately knows the sub-group exists, because it was shown to them in
  the parent's own sub-group list. This exception never applies transitively — knowing
  about a sibling's or grandchild's existence is not implied by knowing about a group's
  direct children.
- Adding a member directly is restricted to the **caller's own friends**, so a user id
  cannot be used to pull an arbitrary stranger into a group at any level. Joining a
  visible sub-group directly is the one addition path that skips the friendship check —
  deliberately, since it requires already being a member of the parent, a stronger
  condition than friendship.
- The group invitation code is a bearer capability with the same properties as the friend
  one: 128 bits, opaque, expiring, revocable. Its blast radius is joining one group **and
  every one of its ancestors** — no larger a blast radius than accepting it manually
  through each ancestor's own link would produce. This is exactly why it **cannot be
  generated at all** for a sub-group nested under a pair group: unlike adding a friend
  directly (already restricted to the caller's own friends), an invitation link has no
  friendship check, so if one could be created there it would let a total stranger's
  acceptance propagate a membership up into the pair group itself — refusing generation is
  what actually closes that path, not a check on acceptance.
- The unauthenticated preview exposes a group's **name and member count** to whoever holds
  the code — needed to decide whether to join, and bounded: no member list, no emails, no
  disclosure of the group's ancestors or position in a tree.
- A group name is user-controlled data rendered into server-generated HTML on the landing
  page and must be escaped — unchanged, and equally true for a sub-group's name.
- Deleting a group is destructive and irreversible, and now takes an entire sub-tree with
  it; it is owner-only and confirmed, with the confirmation naming the scope of the loss.
- Removing a friend is destructive too, since it takes the pair group **and every
  sub-group nested under it** with it — the confirmation must say so.
- A group's balance is built only from that group's own transactions, which the viewer
  can already read in full, so it discloses nothing about any sub-group — see
  `docs/specs/balances.md`.

## Open questions

- Should a pair group be **emptiable** without removing the friend (a "clear our tab"
  action)? Deleting it is currently impossible, and it will accumulate history forever.
- Should **ownership be transferable**, so an inactive owner does not strand a group (or a
  sub-group they solely own) that can never be deleted or left?
- Should a pair group be **promotable** into a normal group when a third person is added,
  instead of the user creating a separate group?
- Should members be **notified** when they are added to a group or a sub-group, or when a
  group they belong to is archived or deleted? (Needs push notifications.)
- Should a group **link require approval** by a member, for groups where money is
  involved? The same question now applies to the lighter "join a visible sub-group"
  action.
- Should an archived group still be **openable read-only** by its members (current
  answer: yes, it is just inactive), and should its expenses count in balances later?
- Should a **sub-group be re-parentable**, or a sub-group promotable to a root group,
  after creation? Deliberately out of scope for now — see "Out of scope" — revisit once
  real usage shows the fixed-at-creation rule is a real friction point.
- Should the **five-level depth limit** ever need to be higher, or configurable per group?
  Chosen as a fixed, generous-enough constant to avoid pathological trees and unbounded
  recursive queries; revisit only with evidence it is actually reached in practice.
