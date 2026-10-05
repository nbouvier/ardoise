# Feature: Balances

## Context

Transactions are recorded (`docs/specs/transactions.md`) but the question people actually
open the app for is not "what did we spend" — it is **"where do I stand?"**. Two
different answers are needed, and they are not the same number:

- **Inside a group**: each member's net position against the group. This already exists
  and is only being made more visible here.
- **Against one person, everywhere**: what a given friend owes me, or I owe them, across
  every group we share. This is new, and it is the reason this feature is its own spec —
  a per-person figure cannot be derived by summing per-group balances.

Both answers are derived from the transaction record. Neither is a stored total.

Since groups can nest (`docs/specs/groups.md`), a third answer was tried and
**deliberately dropped**: rolling a group's sub-groups into its figure. It read as a
surprise rather than a convenience — a number under a group's name that no list inside
that group could account for. Every balance here is therefore scoped to **one group**,
and a sub-group carries its own.

**Who should pay whom to clear a group** is its own feature, derived from these
balances: `docs/specs/reimbursements.md`.

## User story

As a **member of a group**, I want to **see at a glance whether I am owed money or owe
it**, so that **I know where I stand without opening a sheet or doing mental math**.

As a **user with friends**, I want to **see next to each friend what they owe me or I owe
them, across all the groups we share**, so that **I can settle with one person without
going group by group**.

## Expected behavior

### Group balance (existing)

- A group shows each member's **balance**: positive means the group owes them, negative
  means they owe the group. Every current member appears, including at zero.
- A member who left the group with an unsettled balance still appears.
- A group's balances always sum to zero.
- The rule: the payer is credited the concerned members' shares, each concerned member is
  debited their share; an `income` reverses both signs. **Others** (people outside the
  group) never enters a balance: their share is not credited to the payer, and what
  Others paid is owed to no one. See `docs/specs/transactions.md`.

**What changes here is visibility only.** The viewer's own balance and the per-member list
both live on the group screen's **Balances** tab, in "Where everyone stands", the viewer's
own row marked "Me" — with the reimbursement plan below it
(`docs/specs/reimbursements.md`). There is no separate card for the viewer's own figure:
it would only repeat their row in the list right below it.

### One group, one figure

- Every balance shown for a group covers **that group's own transactions only**. A
  sub-group is never folded into its parent, at any depth.
- The **group list** shows, next to each group, the viewer's balance in it. The **group
  screen** shows the same figure for the group being looked at, and each sub-group in the
  sub-groups section shows its own.
- This is what keeps the figure **accountable**: the number under a group's name is
  exactly the sum of what the group's own transaction list and per-member balances say.
  A rolled-up figure could not be reconciled with anything on screen, which is why it was
  dropped.
- A **sub-group the viewer has not joined** shows no figure of theirs — they are on none
  of its transactions (`docs/specs/groups.md`) — and it is `0`, never a blank or an error.
- A **group the viewer has left** keeps whatever was owed there, unchanged; they simply
  no longer see it, since the group is no longer theirs to open.
- "Where do I stand across this whole trip" is therefore **not a question this product
  answers** — by choice. Per-person totals across every group (below) are the
  cross-cutting view that replaced it.

### Balance with one person

A group balance is a net position **against the group, not against a person**. If Alice,
Bob and Carole share a group and Alice is at +30, nothing in that number says how much
*Bob* owes *Alice*. A per-person figure therefore needs its own rule.

**The rule — the debt as recorded.** For every transaction, the payer is credited and
each concerned member is debited their share (reversed for an `income`) — the same rule
as a group balance, only attributed to the pair rather than to the group:

> `balance(me, them)` = (their shares of what **I** paid) − (my shares of what **they**
> paid), each signed the way its transaction's kind signs it.

Positive means **they owe me**; negative means **I owe them**.

Others is never "them": a share of Others in what I paid, or my share of what Others paid,
is a debt with no one in the product and does not appear in any per-person figure — the
same exclusion as in a group balance, which is what keeps the two consistent.

This follows directly from the transactions record and nothing else, which gives it the
properties the display depends on:

- **A transfer needs no special case.** Reimbursing someone is a transaction where I am
  the payer and they are the single concerned member, so it mechanically cancels my debt
  to them by its amount — same rule, no exception.
- **It is consistent with the group balance.** For any group, the sum of my balances with
  every other member of that group equals my balance in that group.
- **It degenerates correctly.** In a pair group there are only two people, so the balance
  with that person *is* the group balance.
- **It is stable.** The figure only moves when a transaction involving the two of us
  changes. A third person recording something that does not concern me never moves it.
- **It is explainable.** Every cent traces back to a transaction both people appear on.

### What the friend list shows

- Next to each friend, the **net total across every transaction the two of us are both
  party to**, in every group — standard groups and the implicit pair group alike.
- Positive is shown as what they owe the viewer, negative as what the viewer owes them,
  zero neutrally as settled.
- **Archived groups count.** Archiving a group stops new transactions; it does not
  forgive a debt.
- **A group only one of the two still belongs to counts.** Consistent with a group
  balance keeping a departed member's entry, leaving a group does not erase what was
  owed from while they were in it.
- **No grand total is shown for the friend list.** Members of shared groups who are not
  the viewer's friends do not appear in it, so a sum of the rows would not equal the
  viewer's overall position and would invite exactly that misreading.

## Out of scope

- **Settle-up suggestions** — minimising the number of payments that clear a group, or
  clear everything between two people. This feature says *where you stand*; it does not
  propose *what to pay*. A user settles by recording a transfer, as today.
- A **"mark as settled"** action distinct from recording a transfer.
- History or charts of how a balance moved over time.
- Balances with someone who is not a friend, outside of a group's own balance list.
- Multiple currencies (inherited: none exists yet).
- Notifying anyone when a balance crosses a threshold or changes.
- Storing balances as records in their own right — see Data / API considerations.

## Edge cases

- **No transactions with a friend at all**: the pair is settled; shown as such, never as
  a missing or failed value.
- **A friend the viewer shares no group with**: same as above — zero, not an error.
- **A shared group with transactions that concern neither of the two together** (they
  were each involved, but never on the same transaction): zero between them, even though
  both have a non-zero group balance. Correct, and the reason a group balance cannot be
  reused here.
- **A friend who left a shared group**, or **a group the viewer left**: transactions
  recorded while both were members still count.
- **A group is deleted, or a friend is removed**: the transactions go with it (existing
  cascade), so the balance goes to zero. Removing a friend already warns that the shared
  group and everything in it is lost.
- **A transaction is edited or deleted**: both balances reflect it on the next read;
  there is no stored total that could survive the change.
- **The balance load fails**: the amounts travel with the friend list in one response, so
  the list fails as a whole and the screen offers its existing retry. There is no
  half-loaded state showing names without amounts, and in particular no friend is ever
  shown as settled because a figure could not be read.
- **A transaction where the viewer is both the payer and a concerned member**: the two
  contributions net out, exactly as they do in a group balance.
- **A group whose only money moved in its sub-groups**: it reads as settled, and each
  sub-group carries its own figure. Correct, and the point of scoping to one group.
- **A sub-group the viewer has never joined**: shows `0` in the parent's sub-groups
  section — they are on none of its transactions — even though the sub-group itself is
  visible to them (`docs/specs/groups.md`).
- **A deeply nested tree**: every level shows its own figure; none of them includes
  another.
- **A transaction involving Others**: only its member-to-member part counts, in the group
  balance, the per-person figure and the group-list figure alike.

## Acceptance criteria

- [ ] The friend list shows, next to each friend, the net amount that friend owes the
      viewer or the viewer owes them, summed across every group the two share.
- [ ] That amount is positive when the friend owes the viewer, negative when the viewer
      owes the friend, and reads as settled at zero.
- [ ] A friend with no shared transaction reads as settled, not as an error or a blank.
- [ ] Transactions recorded in an archived shared group count toward the total.
- [ ] Transactions recorded in a group one of the two has since left count toward the
      total.
- [ ] A transaction that concerns only one of the two does not move the total between
      them, even when it changes both their group balances.
- [ ] Recording a transfer from the viewer to a friend reduces what the viewer owes that
      friend by the amount of the transfer.
- [ ] For any group, the sum of a member's balances with each other member of that group
      equals that member's group balance.
- [ ] The viewer's own balance is visible on the group screen itself, without opening the
      details sheet, marked among the per-member list rather than repeated in a card of
      its own.
- [ ] The per-member balance list remains available in the group details sheet, unchanged,
      and stays scoped to that one group.
- [ ] A friend balance is computed only from transactions the viewer is party to, so no
      route can expose a group, a member or an amount the viewer cannot already see.
- [ ] The group list shows, for each group, the viewer's balance in that group alone.
- [ ] A group's figure equals the sum of its own transactions' effect on the viewer, and
      does not move when money is spent in one of its sub-groups.
- [ ] Each level of a nested tree shows its own figure, none including another's.
- [ ] A sub-group the viewer has not joined shows `0` in its parent's sub-groups section.

## Testing considerations

- **The consistency property is the load-bearing test**: for a generated set of
  transactions in a group, `Σ over other members of balance(me, them) == groupBalance[me]`.
  It is the clearest signal that the pairwise attribution and the group aggregate cannot
  drift apart.
- **Transfer cancellation** deserves a direct test: owe someone, transfer to them, expect
  zero. It is the behaviour a user will check by hand first.
- **The three-party case** — a transaction between two people that must not move a third
  person's balance with either — is the regression this rule exists to prevent.
- Aggregating **across several groups**, including one archived and one a participant has
  left, is the main integration scenario.
- Authorization: the aggregate is built from transactions the caller is party to; a test
  must show a friend's balance never includes a transaction the caller is not on.
- **Containment is worth a regression test**: money spent in a sub-group must not move
  its parent's figure, at any depth. It is the behaviour that replaced the roll-up, and
  the one a future "show the whole trip" change would silently break.

## Data / API considerations

See `docs/API.md` for the authoritative surface.

- **No balance is stored.** Both figures stay derived from `transactions` and
  `transaction_participants`. A stored total is a duplicate that every write path
  (create, edit, delete, group deletion, friendship removal) has to keep correct, and a
  silently drifted money figure is the worst failure this product can have. See
  `docs/ARCHITECTURE.md` for the tradeoff and the revisit trigger.
- The per-friend aggregate is computed **in SQL**, not by loading rows into the
  application: unlike a group's balance, it spans the caller's whole history rather than
  one bounded group.
- The aggregate needs **no group filter**. Summing over transactions where the two people
  are respectively payer and concerned member is already scoped to groups they shared —
  a person cannot be on a transaction of a group they were never in. This is both simpler
  and more correct than filtering on current membership, which would drop a departed
  member's debt.
- `GET /friends` carries each friend's balance rather than a separate route: the friend
  list has no useful state without it, and two calls would make the amounts appear after
  the names. The friend-list entry gets its own shape; the summary used for group members,
  transaction participants and invitation previews stays unchanged and carries no balance.
- Amounts are integer cents, as everywhere else.
- The viewer's own figure **rides on the group it belongs to**: `GET /groups` and
  `GET /groups/:groupId` each carry it, scoped to that group, and a group's `subgroups`
  entries carry their own. `GET /groups/:groupId/transactions/balances` remains the one
  group's per-member list. No balance route of its own, and no descendant walk in any of
  them.

## UX / UI considerations

- **Friend row**: avatar, name, and the amount at the end of the row, coloured the same
  way a group balance is (owed to the viewer / owed by the viewer) rather than merely
  signed, with a short label so the direction is never ambiguous from a sign alone. Zero
  reads as settled, in the secondary text colour. The row's existing behaviour — tap to
  open the shared group, the "⋮" actions menu as a separate hit area — is unchanged.
- The **friend picker** (create a group, add members) shows no balance: it is a selection
  list, and a money figure there is noise.
- **Group screen**: the viewer's own balance appears on the screen itself, in "Where
  everyone stands" (`docs/specs/reimbursements.md`) — the answer to "where do I stand"
  without a tap, and without a second card repeating a row already in that list. Their
  row is marked "Me", styled the same way "Owner" marks a member in Manage, so it reads
  at a glance without changing how the amount itself is worded.
- The per-member list stays in the details sheet, as specified in
  `docs/specs/transactions.md`, scoped to the same group as the line above it.
- **Group list row**: the same figure for each group, styled exactly like the
  group-screen one.
- Both are **read-only displays**: nothing here is actionable, because acting on a
  balance is recording a transfer, which already has its own flow.

## Observability

- A failure to load a group's balances must be diagnosable, distinct from a failure to
  load the group itself. Per-friend balances travel with the friend list, so their failure
  is the friend list's failure and is already diagnosable as such.
- Amounts are financial data and must **not** be logged, per
  `docs/guidelines/LOGGING.md`. A balance failure logs the operation and the caller, never
  the figures.

## Security / privacy considerations

- A balance is built only from transactions the caller is a party to (payer or concerned
  member), so it can never surface a group, a member or an amount the caller could not
  already read.
- A friend balance is returned only for the caller's own friends, resolved server-side
  from the friendship rows; the client never names the pairs to aggregate.
- Balances are derived on read and carry no authorization of their own beyond the above —
  there is no balance route that bypasses the membership checks transactions already
  enforce.
- **No group's figure discloses anything about a sub-group.** Each is computed from that
  group's own transactions, so a sub-group the caller has not joined contributes nothing
  anywhere — there is no aggregate for its contents to leak into.

## Open questions

- **Should a transfer be offered directly from a friend row** ("settle up with Ada"),
  pre-filled with the balance? Natural next step, but it needs a group to record itself
  in — the pair group is the obvious candidate, yet the debt may have arisen in a shared
  standard group. Deferred with settle-up.
- **How the friend total behaves once settle-up exists**: the two must agree on what
  "settled" means, or the list and the suggestions will contradict each other.
- **Pagination / volume**: the per-friend aggregate scans the caller's whole transaction
  history on every friend-list load. Fine at the volume this product produces; see
  `docs/ARCHITECTURE.md` for the revisit trigger.
