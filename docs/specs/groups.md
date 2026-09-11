# Feature: Groups

## Context

SplitCount can tell who a person is (Google sign-in) and who they are connected to
(friends), but there is still nowhere to put a shared expense. A **group** is that place:
a named space that a set of people belong to, inside which expenses will later be
recorded, split and balanced.

Two shapes of shared space exist in practice and users should not have to think about the
difference:

- an explicit, named group — a trip, a flatshare, a recurring night out;
- the ongoing one-to-one tab between two friends, which in Tricount forces people to
  create a two-person "trip" that is really just "me and you".

This feature introduces groups, and makes the second case an **implicit group** that
already exists for every pair of friends, reachable by tapping that friend. Both run on
the same model: a group is a group, only its lifecycle differs.

Expenses are **not** part of this feature. A group is, for now, a space with members.

## User story

As a **SplitCount user**, I want to **create a group and put my friends in it**, so that
**we have one place to track what we share**.

As a **SplitCount user**, I want to **invite someone into a group with a link**, so that
**I can include people who are not in my friend list yet**.

As a **SplitCount user**, I want to **open the shared space I have with a friend by
tapping their name**, so that **a one-to-one tab does not require creating a group**.

As a **SplitCount user**, I want to **archive a group that is over and delete one that
was a mistake**, so that **my list stays about what is still going on**.

## Expected behavior

### Creating a group

- A signed-in user can create a group by giving it a **name** and, optionally, picking
  **friends** from their friend list to add straight away.
- The creator is the group's **owner**. Everyone else is a **member**.
- A group appears immediately in the list of every person who belongs to it.

### The group list

- The list shows the groups the user belongs to: name and member count.
- **Implicit pair groups never appear in this list.** They are reached from the friend
  list.
- **Archived groups are hidden by default**, behind a toggle at the bottom of the list
  that states how many there are. Revealed, they are shown **below** the active groups and
  are visually muted.
- Empty state: an explanation and a "Create a group" action.

### Inside a group

- A group shows its name and its members.
- Any member can **add friends of theirs** to the group, **share an invitation link**,
  **rename** the group and **archive** it.
- Only the **owner** can **delete** it.
- A member can **leave** a group. The owner cannot leave while others remain — they
  archive, delete, or remove themselves once alone (which deletes the group).
- Expenses do not exist yet; the group states that they are coming.

### Inviting into a group

- A group has **one active invitation link at a time**, shared by the whole group rather
  than per member: any member sees, shares and can replace the same link.
- The link behaves exactly like a friend invitation link: reusable while valid, expiring
  after ~7 days, revocable, and openable by someone who does not have the app yet.
- Whoever accepts it **joins the group** as a member. It does **not** make them a friend
  of the person who shared it.
- The recipient sees, before accepting, **who invited them and which group** they are
  being invited to.

### Archiving and deleting

- **Archiving** is reversible and loses nothing: the group becomes inactive, drops to the
  archived section, and can be reopened. An archived group is read-only for membership
  changes — no adding, no invitation links — until it is unarchived.
- **Deleting** is irreversible and loses everything in the group. It is confirmed
  explicitly and is stated as permanent.

### The implicit pair group

- Every pair of friends shares a group that **already exists** as far as the user is
  concerned: opening a friend from the friend list opens it.
- It is **not listed** among the user's groups.
- **Nobody can be added to it**: no member management, no invitation link. It stays
  exactly two people.
- It **cannot be renamed, archived or deleted**. It is named after the other person.
- In every other respect it is a normal group and will hold expenses the same way.
- It **disappears with the friendship**: removing a friend deletes the pair group and
  everything in it, on both sides. This is the same loss as deleting a group, and the
  friend-removal confirmation says so.

## Out of scope

- **Expenses, splits, balances and settle-up.** A group is a space with members only.
- Group avatars, colours, categories, currencies or descriptions.
- Transferring ownership, or more than the two roles (owner / member).
- Per-group notification settings, activity feeds, or notifying members that they were
  added or that a group was archived.
- Group-level privacy settings or approval before joining through a link.
- Restoring a deleted group, or any undo window.
- Searching and filtering the group list.
- Making a pair group "promotable" into a normal group by adding a third person.
- Web (`mobile:web`) support beyond what already works: sign-in is disabled there.

## Edge cases

- **Adding someone who is already a member**: no duplicate, no error — the membership is
  simply already there.
- **Adding a non-friend directly** (by user id): refused. Direct addition is limited to
  the caller's friends; anyone else joins through a link.
- **Two people accepting the same group link at once**, or one person accepting twice: the
  membership is created once; a repeat reports "already a member".
- **A member accepting their own group's link**: no-op, reported as already a member.
  Unlike a friend invitation this is not an error.
- **Accepting a link to a deleted group**: treated like a dead link.
- **Accepting a link to an archived group**: refused as a dead link — an archived group
  takes no new members.
- **The member who created the link leaves the group**: the link keeps working; it belongs
  to the group, not to them.
- **Being removed from a group while looking at it**: the next action returns "group not
  found" and the user is taken back to the list.
- **A non-member requesting a group**: answered as **not found**, never as "forbidden" —
  group existence is not disclosed.
- **The owner trying to leave** with other members present: refused with an explanation.
- **The last member leaving**: the group is deleted with its contents.
- **Any membership change on a pair group** (add, remove, invite, rename, archive,
  delete): refused; the pair group is immutable by construction.
- **Opening the pair group of a friend for the first time**: it is created on the spot and
  is indistinguishable from one that already existed, including when both devices do it
  simultaneously.
- **Opening the pair group of someone who is no longer a friend**: refused, like any other
  group the user does not belong to.
- **Network failure** while loading, creating, archiving or deleting: an explicit,
  retryable error; nothing is half-created.

## Acceptance criteria

- [ ] A signed-in user can create a named group, optionally selecting friends, and it
      appears in their list and in each selected friend's list.
- [ ] The group list shows member counts and an empty state with a "Create a group" action.
- [ ] Archived groups are hidden behind a toggle that states how many there are, and are
      listed below the active ones when revealed.
- [ ] Archiving a group loses nothing and can be undone; the group returns to the active
      section.
- [ ] Deleting a group asks for an explicit confirmation stating that it is permanent, and
      the group disappears for every member.
- [ ] Only the owner can delete a group; another member attempting it is refused.
- [ ] Any member can rename, archive, add a friend to, and share the link of a group.
- [ ] A group has one invitation link at a time; every member sees the same one, and
      replacing it invalidates the previous one.
- [ ] Opening a group invitation link shows who invited the recipient **and** the group
      name, before they accept.
- [ ] Accepting a group link adds the person to the group and does **not** create a
      friendship.
- [ ] Accepting a group link twice does not duplicate the membership and reports that they
      are already a member.
- [ ] A group link for an archived or deleted group is refused as no longer valid.
- [ ] A member can leave a group; the owner cannot while other members remain.
- [ ] A user who is not a member gets a "not found" answer for a group, never a hint that
      it exists.
- [ ] Tapping a friend in the friend list opens the group shared with that friend, showing
      their name, both members, and no membership or invitation actions.
- [ ] That pair group never appears in the group list.
- [ ] Opening the same friend twice reaches the same group, and two simultaneous openings
      do not create two groups.
- [ ] Archiving, deleting, renaming, inviting into, or adding someone to a pair group is
      refused.
- [ ] Removing a friend deletes the group shared with them for both users, and the
      removal confirmation states that its contents are lost.
- [ ] Every group route is refused for a user who is not a member of that group, enforced
      by the server.

## Testing considerations

- **Authorization is the core risk**: every group route must be proven inaccessible to a
  non-member, server-side, and must answer `404` rather than `403`.
- **Idempotence of the pair group under concurrency** is the second: two simultaneous
  openings must converge on one group. Worth a test that issues both requests without
  awaiting the first.
- The **pair-group immutability** guard applies to six operations; cover them as a set
  rather than one by one.
- The generalised invitation system is shared with friends: the existing friend
  invitation behaviour must be preserved, and the group name is now rendered into the
  landing page HTML, so **escaping needs a test with a hostile group name**.
- Cascade behaviour (friendship removed → pair group gone; group deleted → memberships and
  invitations gone) is enforced by the database and deserves a direct test.

## Data / API considerations

See `docs/API.md` for the authoritative surface and `docs/DATABASE.md` for the schema.

- A **group** persists: kind (standard or pair), name, archived state, timestamps, and for
  a pair group the friendship it belongs to.
- A **membership** persists the group, the user and their role. It is the only thing that
  grants access to a group.
- The pair group is **keyed by the friendship**, so the database itself guarantees one per
  pair and removes it with the friendship.
- The pair group's name is **not stored**: the API returns the other member's name, so
  each side sees the person they are sharing with.
- **Invitations are no longer friend-specific.** The existing invitation mechanism becomes
  a shared one carrying what it leads to (a friendship or a group), so that a single code
  space, a single link format and a single landing page serve both. The client captures a
  code without knowing what it is for; the server says.
- The public preview of a code returns **who is inviting** and, for a group, the group's
  name and member count — never a member list, never an email address.

## UX / UI considerations

- **Groups replace Home as the first tab** and the app's landing screen. Tabs become
  Groups, Friends, Account.
- **Group list**: name + member count rows. Archived groups sit under a discreet
  "Show archived (n)" toggle at the bottom and are muted when shown. Primary
  "Create a group" action.
- **Create**: a name field and the friend list with multi-selection; creating with no
  friends selected is allowed.
- **Group detail** is one screen used for both kinds. For a pair group, the member
  actions, the invitation action and the rename/archive/delete actions are absent — not
  disabled-looking, absent — because they can never apply.
- Deleting asks for confirmation and states that everything in the group is lost; leaving
  asks for confirmation too.
- The **invitation screen is the one that already exists** for friends, reused with the
  group's wording.
- The **friend row becomes tappable** and opens the shared group; the existing "Remove"
  action stays on the row and its confirmation now mentions the shared group's contents.
- The **landing page** gains the group's name when the link is a group invitation.
- Light and dark themes through the existing tokens.

## Observability

- Group creation, archiving, unarchiving and deletion must be diagnosable with the acting
  user and the group.
- Joining and leaving a group must be observable, including whether a join came from a
  link or from being added by a member.
- Refused group access must be observable with the reason (not a member, pair group
  immutable, not the owner) — a spike means either a bug or probing.
- Pair-group creation is observable; a *second* creation for the same friendship losing
  the race is expected and must not be logged as an error.
- Invitation codes and group names must not be logged; a group name is user content and
  the code is a capability.

## Security / privacy considerations

- **Membership is the only authorization.** Every group route resolves the caller's
  membership server-side first; the mobile app never gates access on its own.
- Non-membership answers `404`, so a group's existence is not disclosed to outsiders.
- Adding a member directly is restricted to the **caller's own friends**, so a user id
  cannot be used to pull an arbitrary stranger into a group.
- The group invitation code is a bearer capability with the same properties as the friend
  one: 128 bits, opaque, expiring, revocable. Its blast radius is joining one group.
- The unauthenticated preview exposes a group's **name and member count** to whoever holds
  the code — needed to decide whether to join, and bounded: no member list, no emails.
- A group name is user-controlled data rendered into server-generated HTML on the landing
  page and must be escaped.
- Deleting a group is destructive and irreversible; it is owner-only and confirmed.
- Removing a friend is now destructive too, since it takes the pair group with it — the
  confirmation must say so.

## Open questions

- Should a pair group be **emptiable** without removing the friend (a "clear our tab"
  action)? Deleting it is currently impossible, and it will accumulate history forever.
- Should **ownership be transferable**, so an inactive owner does not strand a group that
  can never be deleted?
- Should a pair group be **promotable** into a normal group when a third person is added,
  instead of the user creating a separate group?
- Should members be **notified** when they are added to a group, or when a group they
  belong to is archived or deleted? (Needs push notifications.)
- Should a group **link require approval** by a member, for groups where money is
  involved?
- Should an archived group still be **openable read-only** by its members (current
  answer: yes, it is just inactive), and should its expenses count in balances later?
