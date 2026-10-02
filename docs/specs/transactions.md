# Feature: Group transactions

## Context

Groups exist but hold no money yet — they are spaces with members only
(`docs/specs/groups.md`). This feature adds the thing a group is actually for: recording
who paid what, who it was for, and how it is split, and the running total each member
owes or is owed as a result. This is the core of SplitCount, the behaviour Tricount is
being out-organised on.

**Settle-up — suggesting who should pay whom to clear the balances** — is not part of
this feature; see Out of scope.

## User story

As a **member of a group**, I want to **record a transaction** — an expense, an income,
or a transfer — with a title, an amount, a date and an optional comment, so that **what we
share is tracked**.

As a **member of a group**, I want to **choose who it concerns and how it is split**
between them, defaulting to an equal split among everyone, so that **recording a shared
cost is fast when it's simple and precise when it isn't**.

As a **member of a group**, I want to **correct or remove a transaction**, so that **a
mistake doesn't stay in the record forever**.

## Expected behavior

### What a transaction is

A transaction has:

- a **kind**: `expense`, `income`, or `transfer`;
- a **title** (required), an **amount** (required, strictly positive), a **date**
  (required, a calendar date — not a timestamp), and an optional **comment**;
- an optional **category** — see below;
- a **payer** — who the transaction is attributed to. Defaults to the person recording
  it, but any member can be picked as the payer;
- a **split**: the set of members it concerns, and how the amount is divided among them.

The three kinds share this shape and differ only in meaning and in the direction they
move money:

- **expense** — the payer spent money on behalf of the people it concerns; each of them
  owes the payer their share.
- **income** — the payer received money on behalf of the people it concerns (a refund, a
  shared payout); each of them is owed their share by the payer.
- **transfer** — one member reimburses another. A transfer concerns **exactly one**
  person other than the payer, for the full amount — there is nothing to split.

The payer does not have to be one of the people the transaction concerns (e.g. "Alice
paid, split between Bob and Carole").

### Categories

- A transaction can be tagged with a **category**, picked from a fixed, preset list —
  there is no way to create a new one yet. Each category has a short label and an
  **emoji**, which is what actually identifies it at a glance in the transaction list.
- The preset list (subject to change without a migration of existing data, since removing
  one only means new transactions can't pick it — see Data / API considerations):

  | Emoji | Category            |
  | ----- | -------------------- |
  | 🛒    | Groceries             |
  | 🍽️    | Bar & Restaurant      |
  | 🎉    | Leisure               |
  | 🏠    | Housing               |
  | 🚗    | Transport             |
  | ✈️    | Travel                |
  | 💊    | Health                |
  | 🛍️    | Shopping              |
  | 💡    | Bills & Utilities     |
  | 🎁    | Gifts                 |
  | 📚    | Education             |
  | 🐾    | Pets                  |
  | 🧾    | Other                 |

- **Every transaction has a category — `Other` is the default**, not a stand-in for "no
  category". Recording one without explicitly picking a category is the common case and
  simply means it stays `Other`; there is no separate "uncategorised" state to display or
  reason about.
- Any member can change a transaction's category the same way they edit anything else
  about it.

### Splitting

Two ways to divide the amount among the people it concerns:

- **Shares** (the default) — each concerned member has a **weight**, defaulting to 1 when
  they are added. Equal split is simply everyone at weight 1; a weight of 2 means twice
  anyone else's share. The amount is divided proportionally to weight and rounded to the
  cent; any remaining cents go to the largest fractional remainders, breaking ties in a
  fixed, deterministic order so the same input always splits the same way.
- **Fixed amounts** — each concerned member's share is entered directly. The amounts must
  add up to exactly the transaction's total.

A transfer has no split to configure: it is always the full amount, to the one person it
concerns.

### Recording, editing and removing

- Any member of a group can record a transaction in it, on behalf of any member as payer.
- Any member can **edit** any transaction in the group (all fields, including the split),
  and **delete** it. There is no per-transaction ownership — this mirrors how groups
  themselves work (any member renames, archives, adds people).
- Deleting a transaction is immediate and permanent; the client confirms before sending
  it, as for deleting a group.
- **This applies equally to the implicit pair group.** Unlike membership, invitations,
  renaming, archiving or deletion — all refused on a pair group — transactions are the
  point of the pair group and behave exactly as in a standard one.
- **An archived group is fully read-only for transactions**: none can be recorded,
  edited or deleted until the group is reopened. Existing transactions remain visible.

### Viewing

- A group shows its transactions, most recent first (by date, then by recording order for
  same-day entries).
- Each entry shows its title, date, amount, kind, the payer, and — for the person looking
  at it — their own share, so "what do I owe on this one" never needs mental math.
- Every entry shows its category's emoji next to its title — always present, since every
  transaction has a category (`Other` when none was chosen). It is not interactive in the
  list; changing it means opening the entry, as for any other field.

### Balances

Balances are specified in full in `docs/specs/balances.md`, including the balance between
two people across every group they share. What follows is the group-level rule this
feature establishes, which that spec builds on.

- A group shows each member's **balance**: the net of every transaction they were the
  payer or a concerned member of. Positive means the group owes them; negative means they
  owe the group.
- A balance is a straightforward sum, not a separate record: for an expense or a
  transfer, the payer's balance goes up by the amount and each concerned member's goes
  down by their share (the same person can be both, and the two net out); for an income
  it is the reverse. Every transaction's own shares always sum to its amount, so a
  group's balances always sum to zero.
- Every current member is shown, including at zero. A member who left the group but has
  an unsettled balance from transactions recorded while they were a member still counts
  toward the total — leaving does not erase what they owe or are owed.

## Out of scope

- **Settle-up suggestions** — who should pay whom, and how many transfers it takes to
  clear every balance. Balances themselves (the net per member) are in scope; minimising
  the number of payments to settle them is a further step, left for later.
- **The balance between two people across the groups they share** — see
  `docs/specs/balances.md`.
- Multiple currencies, or a currency at all (inherited from groups: none exists yet).
- Recurring transactions.
- Receipt photos or any attachment.
- **Creating, renaming, reordering or hiding a category.** The preset list is fixed;
  changing it is a code change, not a product feature, for now.
- **Tags**, or more than one category per transaction.
- Filtering, grouping or totalling the transaction list by category.
- Comments/discussion on a transaction beyond the single optional comment field.
- An edit history or audit trail of who changed what.
- Notifying members when a transaction is added, edited or deleted.
- Pagination or filtering of the transaction list (see Open questions).

## Edge cases

- **Split amounts not summing to the total** (fixed-amount mode): refused.
- **A transfer with zero or more than one concerned member**, or **a transfer where the
  concerned member is the payer**: refused — a transfer to yourself is not meaningful.
- **A payer or a concerned member who is not a member of the group**: refused. Both must
  be resolved against the group's current membership at the time of the call.
- **A member who has since left the group** still appears, by name, on transactions
  recorded while they were a member — the record does not rewrite history. They cannot be
  selected as payer or participant on a new or edited transaction. If they left with an
  unsettled balance, it still appears among the group's balances.
- **Recording, editing or deleting on an archived group**: refused.
- **Recording, editing or deleting on a group the caller does not belong to**: answered
  as "not found", like every other group route.
- **Editing or deleting a transaction that belongs to a different group** than the one
  named in the request: answered as "not found" — a transaction id is not, by itself,
  authorization to touch it.
- **Two members editing or deleting the same transaction at once**: last write wins; no
  optimistic locking. Acceptable for now given no history/audit is kept.
- **Amount is zero, negative, non-numeric, or unreasonably large**: refused.
- **Title empty or too long, comment too long, date missing or malformed**: refused.
- **Deleting a group**: its transactions are deleted with it (cascade), like memberships
  and invitations already are.
- **A friendship (and its pair group) is removed**: its transactions are deleted with the
  group, per the existing pair-group cascade.

## Acceptance criteria

- [ ] A member can record an expense, an income, or a transfer in a group they belong to,
      with a title, amount, date, optional comment, a chosen payer (defaulting to
      themselves), and a chosen set of concerned members.
- [ ] The default split is shares with every concerned member at weight 1 (equal split);
      weights can be changed per member.
- [ ] The split can be switched to fixed amounts per concerned member instead of shares.
- [ ] A shares split whose amount does not divide evenly is rounded so the parts sum
      exactly to the total, with the remainder distributed deterministically.
- [ ] A fixed-amount split that does not sum to the total is refused, client-side and
      server-side.
- [ ] A transfer always concerns exactly one member, for the full amount; attempting
      otherwise, or transferring to the payer themselves, is refused.
- [ ] Any member can edit any transaction in the group, including its split, and any
      member can delete any transaction, with confirmation.
- [ ] A group's transactions are listed most recent first, each showing title, date,
      amount, kind, payer, and the viewer's own share.
- [ ] Transactions work identically in the implicit pair group.
- [ ] An archived group refuses new, edited or deleted transactions, but its existing
      transactions remain visible.
- [ ] A user who is not a member of the group gets "not found" for every transaction
      route, never a hint that the group or its transactions exist.
- [ ] Deleting a group deletes its transactions; removing a friend deletes the pair
      group's transactions along with it.
- [ ] A group shows every current member's balance, positive when the group owes them,
      negative when they owe the group, zero for a member with no transactions.
- [ ] A group's balances always sum to zero.
- [ ] A member who left the group with an unsettled balance still appears among the
      group's balances.
- [ ] A transaction can be given a category from the fixed preset list; leaving it unset
      records `Other`. An invalid or unknown category is refused, server-side.
- [ ] Every transaction shows its category's emoji next to its title in the list. In the
      add/edit form, a category badge at the end of the title row opens a dropdown of
      categories and updates on selection, without a separate save step for that field
      alone.
- [ ] A transaction recorded before categories existed, or before `Other` became the
      default, reads as `Other` — never as a missing or blank category.

## Testing considerations

- **Split-sum invariant**: for shares and for fixed amounts, the parts must always sum
  exactly to the total — a property worth checking across many generated inputs, not just
  a few fixed examples.
- **Rounding determinism**: the same input always produces the same per-member split, run
  to run.
- **Pair-group transactions are the main regression risk**: the existing membership guard
  (`assertNotPairGroup`) must not be reused for transaction routes, or every transaction
  on a pair group would wrongly be refused. A test creating a transaction in a pair group
  is essential.
- **Authorization** follows the existing group pattern exactly: non-member → not found,
  same for edit/delete/balances; must be proven per route.
- **Cross-group access**: editing or deleting a transaction by id must fail when it
  belongs to a group other than the one in the URL, even for a member of that other
  group.
- Cascade deletion (group deleted → transactions gone; friendship removed → pair group's
  transactions gone) deserves a direct test, as it does for groups today.
- **Balances sum to zero**: worth checking as a property across a generated set of
  transactions, not just a fixed example — it is the clearest signal the ledger is
  internally consistent.

## Data / API considerations

See `docs/API.md` for the authoritative surface and `docs/DATABASE.md` for the schema.

- A **transaction** persists: kind, title, amount, date, optional comment, a **category**
  (always set, `Other` by default), payer, the group it belongs to, split mode, who
  recorded it, and timestamps.
- The **category list is a fixed, closed set** (key, label, emoji) defined once in code
  (`@splitcount/shared`) and validated the same way on both sides — not a database table,
  since nothing today creates, renames or reorders one. If custom categories are ever
  added, that is the point to promote it to a table; until then a table would be
  unused flexibility.
- **Transactions recorded before `Other` became the default** are backfilled to it by a
  migration, so the column can become `NOT NULL` — there is no `NULL` category to handle
  anywhere above the database layer.
- A **participant** row per concerned member persists the transaction, the member, and
  their share of the amount (plus their weight, when the split is by shares).
- Participants reference the user directly, not their membership row, so a transaction
  survives the participant later leaving the group.
- Amounts are integer cents throughout the API and the database; no floating point.
- The split-sum invariant (parts sum to the total) is enforced by the service in a
  transaction, not by a database constraint (a cross-row sum check isn't expressible as a
  single-row `CHECK`).
- The split algorithm (shares → per-member cents, largest-remainder rounding) is shared
  code (`@splitcount/shared`) rather than duplicated: the client uses it for a live
  preview while composing a transaction, the server uses it as the authority and
  recomputes independently of whatever the client sent (except in fixed-amount mode,
  where the entered amounts are the input, only validated to sum correctly).
- **Balances are computed on the fly** from the transaction and participant rows, not
  stored — there is no separate balance record to keep in sync. See
  `docs/ARCHITECTURE.md` for the tradeoff and when to revisit it.

## UX / UI considerations

- The group screen's current "expenses are coming" placeholder is replaced by the
  transaction list, becoming the primary content of a group; group management (rename,
  archive, invite, members, delete) lives on the group screen's **Manage** tab, beside the
  default **Transactions** tab.
- **Balances** show on the **Balances** tab: each member's name next to their balance,
  coloured (owed to them / owing) rather than just signed, zero shown neutrally, under
  the reimbursement plan (`docs/specs/reimbursements.md`).
- **Add transaction** swaps the Transactions tab's own content for the form, in place —
  the same pattern as "+ Invite" on the Manage tab, not a sheet sliding up over it — with
  no title of its own: a kind switch (Expense / Income / Transfer) sits where a heading
  would. Then a title row: a labelled "Title" field with a small square **category badge**
  at its end, showing just the emoji (`Other` by default); tapping it opens a dropdown over
  the form (the same popup style as a group's own "⋮" menu) listing every category, and
  picking one updates the badge and closes the dropdown immediately — the transaction
  itself is only saved when the form's own "Save" is pressed. Then amount (with a small €
  suffix) and date (short form, e.g. "11 Sep 2026") side by side, a "Who paid" dropdown
  field (defaulting to the signed-in member, whose row is pinned first and marked "Me"),
  and an optional comment under its own "Comment (optional)" label. Then, for an expense or
  income, "Participants": a member picker where every member keeps a row whether or not
  they are concerned, raising a weight or entering a non-zero amount adds them and bringing
  either back to zero removes them, with a small Shares/Fixed switch next to its
  own heading; for a transfer, a single "To" dropdown field instead, excluding the payer.
  The date uses a native picker (inline on iOS, a dialog on Android); on web, which has no
  native pickers, it stays a plain `YYYY-MM-DD` text field. See `docs/DESIGN.md` for the
  full layout.
- Tapping a transaction opens the same form pre-filled, in place of the Transactions tab's
  own content, with a destructive "Delete this transaction" action, confirmed. A suggested
  reimbursement from the Balances tab opens the same form the same way, switching to the
  Transactions tab to show it and switching back once it is saved or cancelled.
- **Android's back button closes the form** (add or edit) rather than leaving the group,
  exactly like the form's own cancel — what was typed is discarded, nothing is saved, and
  a form opened from a suggested reimbursement returns to the Balances tab. With the form
  closed, back leaves the group as usual. The same holds for the Manage tab's invite page.
- Empty state: an explanation and the same "Add a transaction" action as the
  "+ Add" in the group's "Transactions" section title (there is no separate large button).
- On a pair group, the transaction list and "Add a transaction" are present exactly as on
  a standard group; only the (already-absent) management actions differ.
- On an archived group, "Add a transaction" is absent and existing entries are not
  editable — read-only, like the rest of an archived group.

## Observability

- Recording, editing and deleting a transaction must be diagnosable with the acting user,
  the group and the transaction id.
- Refused transaction access must be observable with the reason (not a member, group
  archived, invalid split), following the same pattern as group access refusals.
- Titles, comments and amounts are user content / financial data and must **not** be
  logged, per `docs/guidelines/LOGGING.md`.

## Security / privacy considerations

- Membership is the only authorization, exactly as for every other group route: a
  non-member gets "not found", never a hint that a group or a transaction exists.
- Any member can edit or delete any transaction — a deliberate low-friction choice
  matching the group's existing permission model, not an oversight. It means a member can
  alter or remove another member's entry; there is no audit trail (see Out of scope) to
  detect this, which is an accepted tradeoff for now given the group is a trusted circle
  (friends, flatmates, trip companions).
- The payer and every concerned member must be resolved against the group's current
  membership server-side; the client's word for "who is in this group" is never trusted.

## Open questions

- **Pagination**: the transaction list has no limit or paging in this pass. Fine for a
  trip or a flatshare's typical volume; will need revisiting (cursor-based, most likely)
  once a long-lived group accumulates hundreds of entries.
- **Should an edit history be kept**, given any member can silently change another's
  entry? Deferred — see Security / privacy considerations.
- Should recording, editing or deleting later require confirmation from the payer or
  other concerned members before applying, given real money is implied? Current answer:
  no, trust within the group is assumed, as it already is for group membership changes.
- **Custom categories**: should users eventually be able to add their own, alongside or
  instead of the preset list? Would move the list from code into a table (see Data / API
  considerations) and likely needs per-group or per-user scoping. Not requested yet.
- **Filtering or totalling by category**: a natural next step once enough transactions
  carry one, explicitly out of scope for this pass.
