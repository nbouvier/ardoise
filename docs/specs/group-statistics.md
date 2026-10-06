# Feature: Group statistics

## Context

Groups record transactions, each carrying a category (`docs/specs/transactions.md`), but
nothing yet answers the question the category exists for: *where did the money actually
go?* Balances say who owes whom; they say nothing about whether a trip went on food or on
hotels. This feature adds the first read-only analysis of a group's transactions: the
breakdown of its money across categories, for the group as a whole and for the viewer
personally.

It is the "expense tracking" half of the product promise.

Since groups can nest (`docs/specs/groups.md`), the same question comes up one level
higher: did *the trip as a whole* go on food or on hotels, once its sub-groups are counted
too? The breakdown answers this with a third toggle, alongside type and participants.

A fourth axis narrows *when*: a date range, so "what did we spend in the first week" is
as answerable as "what did we spend overall".

## User story

As a **member of a group**, I want to **see how the group's money is split across
categories**, so that **I can tell at a glance what we're actually spending on**.

As a **member of a group**, I want to **narrow the breakdown to one or more members**, so
that **I can see what this group cost me, or a subset of us, category by category**.

As a **member of a group**, I want to **narrow the breakdown to a date range**, so that
**I can see what a specific stretch of time — a trip's first week, a single month — cost,
rather than only the running total**.

## Expected behavior

### What is measured

A breakdown is computed over the group's transactions along two independent axes the
viewer switches between:

- **Type** — **Spending** (transactions of kind `expense`) or **Income** (kind `income`).
  The two are never mixed into one chart: they move money in opposite directions, and a
  single chart summing them would be meaningless. Spending is the default.
- **Participants** — every group member is selectable, **all of them selected by
  default**. With everyone selected, each transaction contributes the sum of every
  member's share, whoever paid — "the group" in full. That is its full amount unless part
  of it was for **Others** (people outside the group, `docs/specs/transactions.md`):
  Others' share is never counted, and Others is never selectable here. Deselecting members narrows the breakdown to the sum of only
  the selected members' own shares of each transaction; selecting the viewer alone
  reproduces what used to be called the "Me" scope. At least one member must stay selected
  for the chart to mean anything. The current selection is named in one field — "Everybody"
  when all are selected, otherwise the selected members' first names — and changed from a
  checklist opened over the screen, not a row of per-member chips: a group of any size must
  stay legible in one line.
- **Scope** — for a group with sub-groups, which of its **direct** sub-groups are
  included, each one bringing along everything nested under it, at any depth. Every
  direct sub-group is selected by default: the natural reading of "this trip's spending"
  is the whole trip, not just the top-level bucket. This is the **only** view in the
  product that crosses into sub-groups, and it says so on its own field — balances and the
  reimbursement plan are each scoped to one group (`docs/specs/balances.md`,
  `docs/specs/reimbursements.md`). A group with no sub-groups has nothing for this field to
  change, and it is not shown. The current selection is named the same way the
  participants field is — "All" when every direct sub-group is selected, "None" when the
  breakdown is narrowed to this group alone, otherwise the selected sub-groups' own
  names — and changed from the same kind of checklist.
- **Both selections follow the group** while the screen stays open: with everyone (or
  every sub-group) selected, a member who joins or a sub-group just created is selected
  too, so "Everybody" and "All" stay true. A hand-picked selection keeps its picks: the
  newcomer shows unticked. Someone who leaves, or a sub-group that is deleted, drops out.
- **Date range** — an optional **from** and an optional **to** bound, both unset by
  default (the breakdown covers every date). A transaction counts when its own date falls
  on or after `from` (when set) and on or before `to` (when set) — both bounds are
  inclusive, so a "from" and a "to" set to the same day includes transactions on that one
  day. Either bound can be set without the other: a "from" alone means "since then,
  onward"; a "to" alone means "up to then". Clearing a bound restores every date on that
  side again.

The **participant list never changes** based on scope: every member of a sub-group is
necessarily already a member of the group itself (`docs/specs/groups.md`), so the group's
own member list is always the complete set of people who could appear on any transaction
in scope, whether or not sub-groups are included.

**Transfers are never counted**, in any combination. A transfer is one member reimbursing
another: money moving inside a group, not money the group (or its sub-groups) spent or
received. Excluding them is what keeps the totals honest.

For each type, participant selection and scope, every matching transaction — the group's
own, plus those of its sub-groups when scope includes them — contributes the sum of the
selected members' shares of it to its category (its full amount when everyone is selected
and nothing went to Others). Who paid does not matter, Others included: what the members
consumed counts even if someone outside the group paid for it. The result is:

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
  the arc. Selecting it again, or changing the type, the participant selection, the
  sub-groups scope, or either date bound, returns to the total.
- A **legend** under the chart: one row per category, **largest first**, with the
  category's colour, emoji, label, amount and percentage.
- The breakdown is **reachable from the group screen** and does not displace the
  transaction list as the group's primary content.

### Where it applies

- Available on every group the viewer belongs to, **including the implicit pair group**
  (which can neither have sub-groups nor show the subgroups field) and **including an
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

- **Named or relative periods** — "this month", "this year", "last week" as one-tap
  presets. The date range is two plain bounds the viewer sets themselves; naming common
  ranges is a plausible follow-up, not part of this pass.
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
- **A group whose spending all concerns Others**: the same empty state too, and its wording
  ("Nothing spent between members yet.") stays true for it — something was recorded, but
  none of it was spent on members.
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
- **Any empty state that would otherwise show a category breakdown** (no transactions,
  income-only with none recorded, a narrowed selection or date range with nothing in it):
  the donut ring itself still renders, as a single muted, non-interactive arc holding a
  zero total, with the explanatory sentence underneath — a blank space in place of the
  chart would read as a loading state or a bug, where a placeholder ring reads as "there
  is a chart here, it just has nothing to draw yet".
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
- **A "from" set after "to"**: not rejected or corrected — the range simply matches
  nothing, and the breakdown shows the same empty state as any other combination with
  nothing in it. Correcting or swapping the bounds automatically would second-guess which
  one the viewer meant to change.
- **A date range with nothing in it** (valid or not): an empty state naming the date
  range specifically, not the generic "nothing spent" wording — the same way narrowing to
  participants with nothing of their own gets its own wording rather than reading as "no
  transactions at all".
- **Both a narrowed participant selection and a date range with nothing in their
  intersection**: the empty state names both, not just one, so the viewer knows two
  filters are narrowing the result rather than suspecting a bug in whichever one they
  changed last.

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
- [ ] Others' share of a transaction is never counted, with everyone selected or not, and
      Others is not offered in the participant checklist; members' shares of a
      transaction Others paid are counted.
- [ ] A transaction with no explicit category counts under `Other`.
- [ ] Tapping an arc or a legend row shows that category's amount and percentage in the
      centre of the donut; deselecting restores the total.
- [ ] A group with no transactions, or only transfers, shows a placeholder ring — a
      single muted arc holding a zero total — with an explanatory sentence underneath,
      rather than blank space or no chart at all.
- [ ] Selecting Income on a group with no income shows an empty state specific to that
      view, and the viewer can switch back.
- [ ] The statistics view is available on a pair group and on an archived group.
- [ ] A failure to load the group's transactions is reported with a way to retry.
- [ ] For a group with sub-groups, every direct sub-group is selected by default,
      including every descendant's transactions, at any depth, in the breakdown;
      deselecting one drops that branch — itself and everything nested under it — from the
      breakdown.
- [ ] A group with no sub-groups shows no subgroups field.
- [ ] A sub-group the viewer has not joined never contributes to the breakdown, whether or
      not its own branch is currently selected, and its exclusion is stated when it
      affects the total.
- [ ] The participant checklist is always the group's own member list, unaffected by the
      subgroups selection, with the viewer's own row marked "Me".
- [ ] The subgroups checklist is always the group's own direct sub-group list, unaffected
      by the participant selection.
- [ ] The participants field names who is selected — "Everybody", or the selected
      members' first names — and opens its picker when tapped; the subgroups field names
      which branches are selected the same way — "All", "None", or the selected
      sub-groups' own names — and opens its own dropdown when tapped.
- [ ] The participants field and, when shown, the subgroups field are each labelled by a
      small caption above them and stay the same size regardless of their content.
- [ ] The participants dropdown's presets read, in order, "Everybody", "Only you", "Nobody".
      The subgroups dropdown's presets read "All" and "None".
- [ ] Either dropdown stays open while rows are ticked, leaves the chart in place behind it,
      and closes on a tap outside it or Android's back button, keeping the picks.
- [ ] Setting a "from" date recomputes the breakdown over transactions on or after it;
      setting a "to" date, on or before it; setting both narrows to that inclusive range.
- [ ] Clearing a date bound restores every transaction on that side, recomputing the
      breakdown as if it had never been set.
- [ ] A date range with nothing in it shows an empty state that names the date range,
      distinct from the wording used for an empty participant selection or an empty group.
- [ ] A "from" later than a "to" is accepted as entered, not corrected or rejected, and
      shows the same empty-range state as any other range with nothing in it.
- [ ] The type switch is visible without opening anything; participants, sub-groups and
      the date range are hidden behind a "Filters" icon button, closed by default, and
      revealed by tapping it.
- [ ] The "Filters" button states whether it is open or closed in a way assistive technology
      can read, independent of its own tint.
- [ ] Once a date bound is set, the field itself stays the same size; a "Clear" text next
      to that field's own label — not an icon inside the field — removes it.

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
- **Everyone selected is no longer "the full amount"**: a transaction partly for Others
  must contribute only its members' shares — the regression this rule exists to prevent.
- Ordering (largest first) and the exclusion of zero categories are cheap to assert and
  easy to regress.
- **Scope must never leak an unjoined sub-group's amounts.** A test generating a tree
  where the viewer belongs to some sub-groups and not others must show the "including
  sub-groups" breakdown identical to one computed only from the joined ones.
- **The participants field's own wording** — "Everybody" with everyone selected, first
  names joined by commas otherwise — is worth asserting directly, since it is the only
  place the current selection is stated once the per-member chips are gone.
- **The participants presets** must each resolve to the exact set they name — "Only you"
  selects the viewer alone even when they are not first in the member list — and the
  field's own wording after each is worth asserting, not just the resulting breakdown.
- **Selecting one branch of several nested levels deep** must include that branch's own
  descendants and nothing from a sibling branch — the case a flat "include sub-groups"
  toggle could never distinguish. An id that is not actually a descendant of the group
  must be silently ignored, never surfaced as an error or allowed to reach outside the
  group's own tree.
- **Date bounds are inclusive on both ends** — a transaction dated exactly on `from` or
  exactly on `to` must count, not just one that falls strictly between them; an
  off-by-one here is easy to write and easy to miss with only interior dates in a test.
- **Setting only one bound** must leave the other side open — a "from" alone must still
  include a transaction with no meaningful upper date, and vice versa.
- **A "from" after a "to"** must not throw, silently swap the bounds, or otherwise
  "correct" the input — it is accepted as entered and simply matches nothing.
- **The date fields' own short-form wording** is worth asserting directly, the same way
  the participants field's wording is: a set bound reads a short month name, not the long
  one the rest of the app uses for a single transaction's date.
- **The filters starting closed** means every test that reaches the participants
  field, the subgroups field, or either date bound must open it first — a test that
  doesn't would only be passing because the collapsed section stays mounted (for a smooth
  reveal) rather than because a real person could reach it collapsed.

## Data / API considerations

- **No new persisted data.** The breakdown itself is still derived on the fly, the way
  balances are (`docs/ARCHITECTURE.md`); nesting adds a data-fetching question, not a
  storage one.
- **The aggregation lives in `@ardoise/shared`** as a pure function operating on a flat
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
- **`scope=subtree` also takes an optional `subgroupIds`** — a comma-separated list of
  direct sub-group ids — narrowing the descendants added to only those named branches,
  each with everything nested under it. Resolved server-side (each branch's own
  descendant ids, unioned, then filtered to the ones the caller belongs to exactly as
  `scope=subtree` already was) so an id outside the group's own tree can never leak
  another group's transactions in. Omitting it keeps today's behaviour — every branch —
  unchanged; this is additive, not a breaking change to `scope=subtree`'s existing
  callers.
- **This is only viable while the client holds every transaction in scope.** The
  transaction list is unpaginated today (an open question in
  `docs/specs/transactions.md`); the moment it is paginated, a client-side breakdown would
  silently describe only the loaded page, and the aggregation must move behind a
  `GET /groups/:groupId/transactions/statistics` route that accepts the same `scope`.
  Recorded as an open question below and in `docs/ARCHITECTURE.md`.
- **The date range needed no API change at all.** `occurredOn` was already on every
  `Transaction` the client holds for this view; the range is one more `Array.filter`
  alongside the existing participant one, computed on the same already-fetched list, the
  same way participants and (client-side) sub-group branches already are. It inherits the
  pagination caveat directly above rather than adding a new one: once the transaction list
  is paginated, the date range moves behind the same future
  `GET /groups/:groupId/transactions/statistics` route, most naturally as its own
  `from`/`to` query parameters, rather than staying a client-side filter over a partial
  list.

## UX / UI considerations

- Shown as the group screen's **Statistics tab** — the transaction list stays the group's
  default and primary content, and the statistics are one tab over, read afresh each time
  the tab is opened.
- **The type switch sits above everything else**, on its own line, centred: a real
  two-way **Spending / Income** switch — the two words named inside a sliding
  brand-filled thumb, not two pills that could as well be read as independent options.
  It is the one control that always matters, so it is never hidden behind a disclosure.
- **Everything that narrows the breakdown — participants, sub-groups, the date range —
  sits behind a "Filters" icon button**, closed by default: a small sliders icon at the
  far right of the type switch's own row (no text), tinted brand over a soft wash when
  open, the switch itself staying centred; the section's reveal is animated rather than
  snapping. Collapsed by default because narrowing is the exception, not the
  common case — most visits want the whole group's total.
- **Inside the filters**, top to bottom: a row of one or two **labelled fields** (a
  **participants field** and, only for a group with sub-groups, a **subgroups field**
  beside it, each a small caption above a fixed-size pill so neither shifts size as its
  content changes), then a second row of two more labelled fields, **From** and **To**,
  the date range. The participants field reads "Everybody" by default, or the selected
  members' first names, truncated with an ellipsis rather than wrapping; the subgroups
  field reads "All" by default, "None", or the selected sub-groups' own names, truncated
  the same way.
- **From** and **To** each read "Any" until set, then a set date in **short form** ("11
  Sep 2026", not "11 September 2026") truncated with an ellipsis the same way the
  participants and subgroups fields are, rather than resizing the field or wrapping the
  text — the field never changes size regardless of what it holds. Each carries a
  **calendar icon**, not the chevron the participants and subgroups fields use: it opens a
  single date, not a list. Tapping either swaps in the same native date picker the
  transaction form's own Date field uses, defaulting to today the first time. Once a
  bound is set, **the field itself never shrinks to make room for a clear control** — a
  "Clear" text appears at the far right of that field's own caption instead, beside
  "From" or "To", the way a form field's own inline error or hint sits next to its label
  rather than inside the field. Neither field is a dropdown list — a single date is a
  small enough choice that the native picker is the whole interaction, unlike
  participants and sub-groups.
- **The divider that used to separate the controls from the chart is gone** now that
  the switch row itself marks that boundary, but the padding it gave the chart is kept —
  removing the line did not mean removing the breathing room.
- Tapping either the participants or the subgroups field **opens a multi-select dropdown
  over the chart** (the app's dropdown popup, `docs/DESIGN.md`): quick presets, then one
  row per item with a checkbox. The menu stays open while rows are ticked, so several can
  be picked in one go, and closes on a tap outside it or Android's back button — there is
  no "Done" button, and the chart stays in place behind it.
  - **The participants dropdown**: presets in order **"Everybody", "Only you", "Nobody"**,
    then one row per member with an avatar and a checkbox, the viewer's own row marked
    "Me" the same way "Owner" marks a member in Manage (`docs/specs/balances.md`) —
    everyone checked by default.
  - **The subgroups dropdown**: presets **"All"** and **"None"**, then one row per direct
    sub-group with just its name and a checkbox — every direct sub-group checked by
    default, checking one in bringing along everything nested under it.
  - A change takes effect as each row or preset is tapped, and the field behind the menu
    names the new selection straight away. A long list scrolls inside the menu.
- The **ring is noticeably thick** relative to its diameter, so a category holding a small
  share still reads as a real arc rather than a thin line.
- The chart must be **legible without colour alone**: every legend row carries the
  category's emoji and label next to its swatch, and the selected arc is identified in
  words in the centre. Colour is a grouping aid, never the only carrier of meaning.
- The colours must hold up **in light and dark mode** and be distinguishable from each
  other across all thirteen categories.
- States: loading (while the transactions load), retryable error, and the empty states
  described above — the empty state must be specific enough that "no income" does not
  read as "no transactions", and an empty date range does not read as "no participant
  selected" or vice versa; when both are narrowed at once and nothing matches, the
  wording names both.
- Amounts follow the formatting already used by the transaction list and balances; no new
  money formatting.
- The **subgroups field** described above is present only for a group that has sub-groups.
  When the current selection excludes at least one unjoined sub-group, a single small line
  inside the filters, under the fields, states how many — worded plainly ("n
  sub-groups you're not in aren't included"), not as a warning. This can happen even with
  every direct sub-group selected, since a nested one further down could still be one the
  viewer has not joined.


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
- **`subgroupIds` can only narrow, never widen, that same set.** Every id it names is
  checked server-side against the group's own descendant ids before anything is looked up;
  an id from outside the group's tree — a different group entirely, or one the caller
  supplies by guessing — is dropped rather than resolved, so it can never be used to pull
  in another group's transactions.

## Open questions

- **Pagination.** Deriving the breakdown client-side is correct only while the whole
  transaction list is loaded. Paginating the list requires moving this to the server;
  which of the two happens first is not decided.
- **Named or relative date presets** ("this month", "this year", "last 7 days") on top of
  the two plain bounds — the most likely next step now that the range itself exists.
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
