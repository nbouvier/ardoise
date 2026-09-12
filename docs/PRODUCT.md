# SplitCount — product overview

Concise, high-level view of the product and its current capabilities. Detailed behaviour
lives in `docs/specs/`.

## Vision

Ease expense sharing between people. Positioned as a successor to Tricount, with stronger
organisation and better expense tracking.

## Target users

Groups who share costs: flatmates, trips, couples, recurring social groups.

## Shape of the product

- A mobile client (Expo / React Native).
- A backend API (Node) that is the source of truth for all shared data.
- Users sign in; groups and expenses live on the server and sync to each member's device.

## Current capabilities

- **Authentication** — Google sign-in. Users sign in with their Google account and stay
  signed in across app launches (rotating refresh-token session); the server verifies
  every Google token before trusting an identity. See `docs/specs/authentication.md`.
- **Friends and invitations** — each user keeps a friend list, built by sharing an
  invitation link (copy or OS share sheet: SMS, mail, WhatsApp…). The link opens the app,
  prompts for Google sign-in if needed, and connects both people after an explicit
  confirmation. See `docs/specs/friends-and-invitations.md`.
- **Groups** — named spaces that people belong to, and where transactions live. A user
  creates a group, adds friends to it, or shares an invitation link for anyone else.
  Groups can be archived (reversible, hidden behind a toggle in the list) or deleted
  (permanent). Every pair of friends also shares an **implicit group**, opened by tapping
  that friend: unlisted, two people forever, otherwise a normal group.
  A standard group can also have **sub-groups**, nested up to five levels deep, for a
  side trip or a recurring sub-budget that still belongs to the group it lives under.
  Belonging to a group always implies belonging to every one of its ancestors; a member
  can see (and join) the sub-groups of any group they belong to, hidden behind a toggle
  when they have not joined them. See `docs/specs/groups.md`.
- **Group transactions** — any member records an expense, an income, or a transfer in a
  group: a title, an amount, a date, an optional comment, an optional **category** (a
  fixed preset list, each with an emoji shown next to the transaction in the list), who
  it's attributed to (defaulting to the recorder), and who it concerns. Splitting
  defaults to equal shares and can be changed to weighted shares or fixed amounts per
  person. Any member can edit or delete any transaction. Works identically in the
  implicit pair group; an archived group is read-only for transactions. See
  `docs/specs/transactions.md`.
- **Balances** — a group shows where each member stands against it, and the viewer's own
  position sits on the group screen itself, rolled up over the group and every sub-group
  nested inside it. The friend list goes further: next to each friend, the net of what
  they owe the user or the user owes them, summed across every group the two share. All
  are derived from the transactions on every read, never stored. See
  `docs/specs/balances.md`.
- **Group statistics** — a group shows where its money went: a donut chart of its
  transactions broken down by category, with each category's amount and share of the
  total. Toggles switch what is measured — spending or income, the whole group or the
  viewer's own share, and, for a group with sub-groups, whether their transactions are
  included (on by default). Transfers between members are never counted. Derived from the
  transactions, like balances. See `docs/specs/group-statistics.md`.

Otherwise the project is still at an early stage: monorepo, mobile client, an API with
`/health`, auth, friends, invitations, groups, group transactions and per-category
statistics, tooling and documentation.

## Planned direction

- Settle-up suggestions — who should pay whom to clear a group, or to clear everything
  between two people, built on the balances now shown.
- Better tracking and organisation than Tricount (categories, history, clarity).

## Not yet decided

- Whether non-authenticated, link-based group access is offered later.
- Offline support (the current model is online, server-authoritative).
- Adding friends by email address, alongside invitation links.
- Notifying the inviter when someone accepts an invitation (needs push notifications).
- Whether group ownership can be transferred, and whether a pair group can be cleared
  without removing the friend.
- Whether a sub-group can be re-parented or promoted to a root group after creation.
- Whether transactions need an edit history, given any member can change or remove
  another member's entry with no trace kept.

## Feature specifications

See `docs/specs/` for the authoritative behaviour of each feature as it is defined.
