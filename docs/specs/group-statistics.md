# Feature: Group statistics

## Context

Groups record transactions, each carrying a category (`docs/specs/transactions.md`), but
nothing yet answers the question the category exists for: *where did the money actually
go?* Balances say who owes whom; they say nothing about whether a trip went on food or on
hotels. This feature adds the first read-only analysis of a group's transactions: the
breakdown of its money across categories, for the group as a whole and for the viewer
personally.

It is the "better expense tracking" half of the product promise — the part Tricount does
not do well.

Since groups can nest (`docs/specs/groups.md`), the same question comes up one level
higher: did *the trip as a whole* go on food or on hotels, once its sub-groups are counted
too? The breakdown answers this with a third toggle, alongside type and participants.

## User story

As a **member of a group**, I want to **see how the group's money is split across
categories**, so that **I can tell at a glance what we're actually spending on**.

As a **member of a group**, I want to **narrow the breakdown to one or more members**, so
that **I can see what this group cost me, or a subset of us, category by category**.

## Expected behavior

### What is measured

A breakdown is computed over the group's transactions along two independent axes the
viewer switches between:

- **Type** — **Spending** (transactions of kind `expense`) or **Income** (kind `income`).
  The two are never mixed into one chart: they move money in opposite directions, and a
  single chart summing them would be meaningless. Spending is the default.
- **Participants** — every group member is selectable, **all of them selected by
  default**. With everyone selected, each transaction contributes its full amount, whoever
  paid — "the group" in full. Deselecting members narrows the breakdown to the sum of only
  the selected members' own shares of each transaction; selecting the viewer alone
  reproduces what used to be called the "Me" scope. At least one member must stay selected
  for the chart to mean anything. The current selection is named in one field — "Everybody"
  when all are selected, otherwise the selected members' first names — and changed from a
  checklist opened over the screen, not a row of per-member chips: a group of any size must
  stay legible in one line.
- **Scope** — for a group with sub-groups, whether the breakdown covers **this group
  alone** or **this group and every sub-group nested inside it**, at any depth. Including
  sub-groups is the default: the natural reading of "this trip's spending" is the whole
  trip, not just the top-level bucket. This is the **only** view in the product that
  crosses into sub-groups, and it says so on the toggle — balances and the reimbursement
  plan are each scoped to one group (`docs/specs/balances.md`,
  `docs/specs/reimbursements.md`). A group with no sub-groups has nothing for this toggle
  to change, and it is not shown.

The **participant list never changes** based on scope: every member of a sub-group is
necessarily already a member of the group itself (`docs/specs/groups.md`), so the group's
own member list is always the complete set of people who could appear on any transaction
in scope, whether or not sub-groups are included.

**Transfers are never counted**, in any combination. A transfer is one member reimbursing
another: money moving inside a group, not money the group (or its sub-groups) spent or
received. Excluding them is what keeps the totals honest.

For each type, participant selection and scope, every matching transaction — the group's
own, plus those of its sub-groups when scope includes them — contributes its amount (or
the sum of the selected members' shares of it) to its category. The result is:

- a **total** — the sum over every category;
- per category with a non-zero amount: its **amount** and its **percentage of the
  total**, rounded so the displayed percentages always sum to exactly 100%;
- categories with nothing in them are absent, not shown at zero.

Categories are the fixed preset list from `docs/specs/transactions.md`; every transaction
has one (`Other` by default), so nothing falls outside the breakdown.

### How it is shown

- A **donut chart**: one arc per category, sized by its share of the total, in that
  category's own fixed colour. The **centre shows the total** for the current type and
  scope.
- **Selecting a category** — by tapping its arc or its legend row — shows that category's
  emoji, label, amount and percentage in the centre instead of the total, and highlights
  the arc. Selecting it again, or switching the type, the participant selection, or the
  sub-groups scope, returns to the total.
- A **legend** under the chart: one row per category, **largest first**, with the
  category's colour, emoji, label, amount and percentage.
- The breakdown is **reachable from the group screen** and does not displace the
  transaction list as the group's primary content.

### Where it applies

- Available on every group the viewer belongs to, **including the implicit pair group**
  (which can neither have sub-groups nor show the scope toggle) and **including an
  archived group** — it is a read-only view of transactions that remain visible either
  way.
- Non-members see nothing, exactly as for every other group route: the group itself is
  "not found" to them.
- **A sub-group the viewer has not joined is excluded from the "including sub-groups"
  scope**, for the same reason it contributes nothing to any balance of theirs
  (`docs/specs/balances.md`): the viewer is on none of its transactions, so there is
  nothing of theirs to count, whether or not that sub-group is currently visible to them
  in the group's sub-group list. When this leaves out at least one sub-group, the view
  says so in one line ("n sub-groups you're not in aren't included") rather than silently
  presenting a partial sum as if it were the whole trip.

### Freshness

The breakdown describes exactly the transactions the group (and, in scope, its
sub-groups) is currently showing — it is the same lists, read again, not a separate figure
that could disagree with them. Recording, editing or deleting a transaction anywhere in
scope is therefore reflected the next time the breakdown is looked at, with no refresh of
its own.

## Out of scope

- **Any time filtering** — this month, this year, a custom range. The breakdown covers
  every transaction in the group. A period filter is the most likely next step.
- **Per-member breakdown shown at once** — "what did each member spend on, by category",
  side by side. The participant selector narrows one chart to a subset; it does not draw
  one chart per member.
- **Trends over time** — a category's evolution month over month, or any chart other than
  the category donut.
- **Statistics across groups** — a user's overall spending, all groups combined.
- **Comparing scopes or types side by side** — one chart at a time.
- **Budgets, limits or alerts** per category.
- **Exporting** the breakdown (CSV, image, share sheet).
- **Netting income against spending** per category. The two are separate views; a
  reimbursement does not reduce a spending figure.
- Drilling from a category into the transactions that make it up.

## Edge cases

- **A group with no transactions at all**: the breakdown says there is nothing to show
  yet, in the same terms as the empty transaction list.
- **A group whose transactions are all transfers**: the same empty state — nothing was
  spent or received. The wording must not read as an error, since the group plainly has
  transactions.
- **No income at all** (the common case) while the Income type is selected: an empty
  state specific to that combination ("nothing recorded as income"), with the type
  toggle still available to switch back.
- **A selection where none of the chosen members is ever a participant** (they always paid
  for others, or recorded nothing): total zero, empty state — the selection's share of
  everything is nothing.
- **Deselecting every member**: nothing to compute — an empty state asking to select at
  least one, rather than a zero chart that would read as "nothing recorded".
- **A single category holding everything**: one arc, 100%, still rendered as a full ring
  rather than a degenerate shape.
- **Very small shares** (a category worth well under 1% of the total): its arc stays
  visible as a thin sliver and its legend row always lists it, with its real rounded
  percentage — never hidden or merged into an "Other" bucket, which would collide with
  the real `Other` category.
- **Rounding**: percentages are rounded to whole numbers for display but must still sum to
  exactly 100% — no "99%" or "101%" total.
- **A member who left the group**: their transactions still count toward the group's
  breakdown, consistently with balances, which also keep them.
- **Failing to load the transactions**: the breakdown shows the same retryable error as
  the transaction list, never an empty chart that would read as "nothing spent".
- **A group with no sub-groups**: no scope toggle is shown at all — there is nothing for
  it to change, and showing a toggle that does nothing would be confusing rather than
  neutral.
- **Every sub-group in scope excluded because the viewer is in none of them**: scope
  "including sub-groups" then behaves exactly like "this group alone", with the "n
  sub-groups not included" note still shown so the totals are not mistaken for the whole
  trip.
- **Switching scope while a category is selected**: the same rule as switching type or
  participants — the selection clears, since the amounts it referred to may no longer
  mean the same thing.
- **A sub-group deleted, archived, or left between the group screen loading and the
  breakdown being opened**: reflected the next time the breakdown reads its data, same as
  any other transaction-affecting change — no separate staleness rule for sub-groups.

## Acceptance criteria

- [ ] From a group, a member can open a statistics view showing a donut chart of the
      group's spending by category, with a legend listing each category's amount and
      percentage, largest first.
- [ ] The percentages shown always sum to exactly 100%, and the amounts always sum to the
      total shown in the centre.
- [ ] Switching the type to Income recomputes the chart over `income` transactions only;
      switching back to Spending restores the `expense` breakdown.
- [ ] Deselecting members recomputes the chart over the sum of the remaining members'
      shares only; the total with everyone selected and with only the viewer selected
      differ whenever the viewer is not the sole participant.
- [ ] Deselecting every member shows an empty state asking for at least one, rather than a
      zero chart.
- [ ] Transfers never appear in any breakdown and never affect any total.
- [ ] A transaction with no explicit category counts under `Other`.
- [ ] Tapping an arc or a legend row shows that category's amount and percentage in the
      centre of the donut; deselecting restores the total.
- [ ] A group with no transactions, or only transfers, shows an explanatory empty state
      rather than an empty chart.
- [ ] Selecting Income on a group with no income shows an empty state specific to that
      view, and the viewer can switch back.
- [ ] The statistics view is available on a pair group and on an archived group.
- [ ] A failure to load the group's transactions is reported with a way to retry.
- [ ] For a group with sub-groups, a scope toggle defaults to including every sub-group's
      transactions, at any depth, in the breakdown; switching it to "this group alone"
      recomputes over only the group's own transactions.
- [ ] A group with no sub-groups shows no scope toggle.
- [ ] A sub-group the viewer has not joined never contributes to the "including
      sub-groups" scope, and its exclusion is stated when it affects the total.
- [ ] The participant checklist is always the group's own member list, unaffected by the
      scope toggle, with the viewer's own row marked "Me".
- [ ] The participants field names who is selected — "Everybody", or the selected
      members' first names — and opens the checklist when tapped.

## Testing considerations

- **Sum invariants** are the core property: per-category amounts must sum to the total,
  and rounded percentages to exactly 100%, across many generated inputs — not only a few
  fixed examples. Values that divide badly (three categories on a prime total) are the
  interesting ones.
- **Kind filtering** deserves explicit cases: a group holding all three kinds must
  produce a spending breakdown that ignores incomes and transfers, and an income
  breakdown that ignores expenses and transfers.
- **A selected subset of participants** must use their own share, not the transaction
  amount, and must count a transaction a selected member paid for but does not
  participate in as zero — a likely confusion between "paid" and "concerned". Selecting
  more than one member must sum their shares, not the transaction's full amount.
- Ordering (largest first) and the exclusion of zero categories are cheap to assert and
  easy to regress.
- **Scope must never leak an unjoined sub-group's amounts.** A test generating a tree
  where the viewer belongs to some sub-groups and not others must show the "including
  sub-groups" breakdown identical to one computed only from the joined ones.
- **The participants field's own wording** — "Everybody" with everyone selected, first
  names joined by commas otherwise — is worth asserting directly, since it is the only
  place the current selection is stated once the per-member chips are gone.
- **The three presets** must each resolve to the exact set they name — "Only you" selects
  the viewer alone even when they are not first in the member list — and the field's own
  wording after each is worth asserting, not just the resulting breakdown.

## Data / API considerations

- **No new persisted data.** The breakdown itself is still derived on the fly, the way
  balances are (`docs/ARCHITECTURE.md`); nesting adds a data-fetching question, not a
  storage one.
- **The aggregation lives in `@splitcount/shared`** as a pure function operating on a flat
  list of transactions, unchanged by sub-groups: scope is resolved into *which*
  transactions are handed to it, not into new logic inside it. The rule for what counts —
  and the percentage rounding — keeps its one definition.
- **Each category gains a fixed colour**, alongside its emoji and label, in the same
  shared preset list. A category's colour is part of its identity, used by the chart and
  its legend together; it is not chosen per screen.
- **A group's transaction list gains a `scope` query parameter** (`group`, the default, or
  `subtree`) so the client can ask for the group's own transactions or for the group's
  together with every sub-group's the caller is a member of, in one call — see
  `docs/API.md`. This is what "including sub-groups" is built from; the plain
  `GET /groups/:groupId/transactions` used by the transaction list itself is unaffected
  and keeps returning only that group's own transactions.
- **This is only viable while the client holds every transaction in scope.** The
  transaction list is unpaginated today (an open question in
  `docs/specs/transactions.md`); the moment it is paginated, a client-side breakdown would
  silently describe only the loaded page, and the aggregation must move behind a
  `GET /groups/:groupId/transactions/statistics` route that accepts the same `scope`.
  Recorded as an open question below and in `docs/ARCHITECTURE.md`.

## UX / UI considerations

- Shown as the group screen's **Statistics tab** — the transaction list stays the group's
  default and primary content, and the statistics are one tab over, read afresh each time
  the tab is opened.
- Above the chart: a **field naming who is currently selected** ("Everybody" by default, or
  the selected members' first names, truncated with an ellipsis rather than wrapping),
  left-aligned; under it, centred on its own, a **real two-way switch** for the type —
  "Spending" and "Income" named inside it, not two pills that could as well be read as
  independent options.
- Tapping the participants field **swaps the tab's content for a picker**, the same way
  "+ Invite" swaps the Manage tab's content for its own page: three quick presets
  ("Everybody", "Nobody", "Only you"), then one row per member with an avatar and a
  checkbox, the viewer's own row marked "Me" the same way "Owner" marks a member in Manage
  (`docs/specs/balances.md`) — everyone checked by default, changes taking effect as each
  row (or preset) is tapped, confirmed by a "Done" button that returns to the chart. Not a
  sheet stacked over the chart: the picker *is* the tab's content while it is open.
- The **ring is noticeably thick** relative to its diameter, so a category holding a small
  share still reads as a real arc rather than a thin line.
- The chart must be **legible without colour alone**: every legend row carries the
  category's emoji and label next to its swatch, and the selected arc is identified in
  words in the centre. Colour is a grouping aid, never the only carrier of meaning.
- The colours must hold up **in light and dark mode** and be distinguishable from each
  other across all thirteen categories.
- States: loading (while the transactions load), retryable error, and the empty states
  described above — the empty state must be specific enough that "no income" does not
  read as "no transactions".
- Amounts follow the formatting already used by the transaction list and balances; no new
  money formatting.
- The **scope toggle** sits on its own row under the participants field and the type
  switch, same pill styling as before, and is present only for a group that has
  sub-groups. When it excludes at least one unjoined sub-group, a single small line under
  the toggles states how many — worded plainly ("n sub-groups you're not in aren't
  included"), not as a warning.

## Observability

None beyond existing conventions. The view is read-only and derived from data already
loaded and already logged at its own fetch; no new failure path is introduced. Category
amounts are financial data and must not be logged
(`docs/guidelines/LOGGING.md`).

## Security / privacy considerations

- Membership remains the only authorization, and it is already enforced on the
  transactions it derives from: a non-member cannot read the group's transactions, so
  there is nothing to expose. No new data reaches the client that it could not already
  read.
- The breakdown must never be derived from anything other than the group in view — a
  statistic is not a way to learn about a group the viewer does not belong to.
- **Including sub-groups never widens what the viewer can see.** The `subtree` scope is
  resolved server-side to the group plus only the descendants the caller is currently a
  member of; a sub-group they cannot read contributes nothing and is never named, exactly
  as it contributes nothing to any balance of theirs (`docs/specs/balances.md`).

## Open questions

- **Pagination.** Deriving the breakdown client-side is correct only while the whole
  transaction list is loaded. Paginating the list requires moving this to the server;
  which of the two happens first is not decided.
- **Time filtering** (this month / this year / trip range) is the most requested natural
  extension and deliberately absent from this pass. Whether the default should then stay
  "all time" is undecided.
- **Per-member breakdown shown side by side** — "who spends on what, member by member" —
  is plausible but carries a social dimension (it exposes each member's habits to the
  whole group) that deserves an explicit decision rather than being added by symmetry with
  the participant selector, which already lets a viewer narrow to one member at a time.
- Should a category's **colour** ever be configurable, or tied to a theme? It is fixed in
  code today, chosen to read on both themes; custom categories (see
  `docs/specs/transactions.md`) would force the question.
- **Should the scope toggle's choice be remembered** per group, so a member who always
  wants the whole trip does not re-select it every time they open the tab? Deliberately
  simple (always defaults to including sub-groups) for this pass.
