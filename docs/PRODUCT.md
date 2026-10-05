# Ardoise — product overview

Concise, high-level view of the product and its current capabilities. Detailed behaviour
lives in `docs/specs/`.

## Vision

An app for sharing expenses among friends, family or flatmates, with nested sub-groups,
expense tracking, reimbursement plans and advanced statistics: shared costs kept organised,
and always clear about who owes whom.

## Target users

Groups who share costs: flatmates, trips, couples, recurring social groups.

## Shape of the product

- A mobile client (Expo / React Native).
- A backend API (Node) that is the source of truth for all shared data.
- Users sign in; groups and expenses live on the server and sync to each member's device.
- Crashes and unexpected errors, on the phone and on the server, are reported to Sentry
  (a third-party service, EU data region) so they can be fixed: the error and its stack,
  never request contents, amounts, titles, tokens or e-mail addresses; the user appears
  only as an opaque id. A screen that fails to render shows "Something went wrong" with a
  way to try again instead of a blank app. The privacy policy must name this processor.
  See `docs/LOGGING.md`.

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
  (permanent). Every pair of friends also shares an **implicit group**, created the moment
  they become friends and opened by tapping that friend: unlisted among the user's own
  groups (it surfaces on the friend list instead), two people forever, otherwise a normal
  group.
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
  person. A share can go to **Others** — people outside the group — which counts in no
  balance and no statistic: only money between members does. Any member can edit or delete any transaction. Works identically in the
  implicit pair group; an archived group is read-only for transactions. See
  `docs/specs/transactions.md`.
- **Balances** — a group shows where each member stands against it, and the viewer's own
  position sits on the group screen itself. Every figure is scoped to one group: a
  sub-group keeps its own, so the number under a group's name is always exactly what its
  own transactions say. The friend list goes further: next to each friend, the net of what
  they owe the user or the user owes them, summed across every group the two share. All
  are derived from the transactions on every read, never stored. See
  `docs/specs/balances.md`.
- **Group statistics** — a group shows where its money went: a donut chart of its
  transactions broken down by category, with each category's amount and share of the
  total. Toggles switch what is measured — spending or income, the whole group or the
  viewer's own share, and, for a group with sub-groups, whether their transactions are
  included (on by default). Transfers between members are never counted. Derived from the
  transactions, like balances. See `docs/specs/group-statistics.md`.
- **Reimbursements** — a group says who should pay whom to clear it, in as few payments
  as it can manage: a chain of debts becomes one payment rather than one per pair.
  Tapping a suggestion records it as an ordinary transfer, pre-filled and still editable.
  Scoped to the one group, like its balances — a sub-group has its own plan — and derived
  from those balances, so the two can never disagree. See
  `docs/specs/reimbursements.md`.
- **Home** — the screen the app opens on: the product's own identity over a decorative
  wash, then the groups the user has starred (every kind at once — a group, a sub-group,
  or the implicit group behind a favorited friend), then the ten most recent transactions
  that involve them, drawn from every group and sub-group they belong to. Everything on it
  is a shortcut into the screen that owns the thing; nothing is recorded from it. The
  group list moves to a tab of its own, unchanged. See `docs/specs/home.md`.
- **Favorite groups** — a member can star a group or a joined sub-group, from its own page
  or its row in a list, to pin it above non-favorited ones wherever it is listed. A
  friend's row on the friend list carries the same star, favoriting the implicit pair
  group behind it. Personal to the viewer, and independent of a group's archived state.
  See `docs/specs/favorites.md`.

The product is not yet released; Android is the first target.

## Planned direction

- Settling with one person across every group they share, from the friend list — the
  per-group plan now exists; what is missing is which group would record it.
- Richer tracking and organisation (categories, history, clarity).

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
