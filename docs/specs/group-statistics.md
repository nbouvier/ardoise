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
- **Participants** — every group member appears as a selectable chip, **all of them
  selected by default**. With everyone selected, each transaction contributes its full
  amount, whoever paid — "the group" in full. Deselecting members narrows the breakdown to
  the sum of only the selected members' own shares of each transaction; selecting the
  viewer alone reproduces what used to be called the "Me" scope. At least one member must
  stay selected for the chart to mean anything.

**Transfers are never counted**, in any combination. A transfer is one member reimbursing
another: money moving inside the group, not money the group spent or received. Excluding
them is what keeps the totals honest.

For each type and each participant selection, every matching transaction contributes its
amount (or the sum of the selected members' shares of it) to its category. The result is:

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
  the arc. Selecting it again, or switching the type or the participant selection, returns
  to the total.
- A **legend** under the chart: one row per category, **largest first**, with the
  category's colour, emoji, label, amount and percentage.
- The breakdown is **reachable from the group screen** and does not displace the
  transaction list as the group's primary content.

### Where it applies

- Available on every group the viewer belongs to, **including the implicit pair group**
  and **including an archived group** — it is a read-only view of transactions that
  remain visible either way.
- Non-members see nothing, exactly as for every other group route: the group itself is
  "not found" to them.

### Freshness

The breakdown describes exactly the transactions the group is currently showing — it is
the same list, read again, not a separate figure that could disagree with it. Recording,
editing or deleting a transaction is therefore reflected the next time the breakdown is
looked at, with no refresh of its own.

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

## Data / API considerations

- **No new persisted data and no new endpoint.** The breakdown is derived on the fly from
  the transactions the client already loads for the group, the way balances are derived
  rather than stored (`docs/ARCHITECTURE.md`).
- **The aggregation lives in `@splitcount/shared`** as a pure function, so the rule for
  what counts — and the percentage rounding — has one definition, and so a server-side
  endpoint can reuse it unchanged if one becomes necessary.
- **Each category gains a fixed colour**, alongside its emoji and label, in the same
  shared preset list. A category's colour is part of its identity, used by the chart and
  its legend together; it is not chosen per screen.
- **This is only viable while the client holds every transaction of a group.** The
  transaction list is unpaginated today (an open question in
  `docs/specs/transactions.md`); the moment it is paginated, a client-side breakdown would
  silently describe only the loaded page, and the aggregation must move behind a
  `GET /groups/:groupId/transactions/statistics` route. Recorded as an open question
  below and in `docs/ARCHITECTURE.md`.

## UX / UI considerations

- Opened as a **sheet from the group screen's header**, next to "Details" — the
  transaction list stays the group's primary content, and the sheet pattern is the one
  the group screen already uses for everything secondary.
- The type is a **segmented toggle above the chart**, reusing the pill styling of the
  existing kind and split-mode toggles. Participants are the same pill styling, one chip
  per member (the viewer's own chip reads "You"), wrapped onto multiple rows and all
  active by default — tapping a chip toggles that member in or out of the selection.
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
