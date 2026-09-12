# Feature: Reimbursements

## Context

A group's balances say where each person stands **against the group**
(`docs/specs/balances.md`). They deliberately stop short of the question people
actually settle on: *who should pay whom, and how little can we get away with?* In a
five-person trip that answer is arithmetic nobody wants to do by hand, and doing it
naively — everybody reimburses everybody they were on a transaction with — produces
many more payments than are needed.

This feature is the settle-up half that `docs/specs/balances.md` listed as out of scope.
It turns net positions into a short, concrete list of payments that clears everything,
and lets the viewer record one of those payments in a tap — since a reimbursement in
this product *is* a `transfer` transaction (`docs/specs/transactions.md`), not a new
kind of record.

Because groups nest (`docs/specs/groups.md`), the plan is most useful over **a group and
its whole sub-tree**: a debt that arose in the Corsica sub-group and a debt in the trip
itself cancel each other, and only a plan that sees both can net them. That is also this
feature's one deliberate departure from how the rest of the product treats sub-groups —
see Security / privacy considerations.

## User story

As a **member of a group**, I want to **see the short list of payments that clears
everything we owe each other**, so that **we can settle without working out who pays
whom**.

As a **member who owes money**, I want to **record a suggested payment in one tap**, so
that **settling up does not mean re-entering an amount the app already knows**.

## Expected behavior

### What is computed

Two things, from the same figures:

- **Net positions** — each person's balance over the scope: the plain sum of their
  balance in each group in scope, by the same rule a group balance already uses
  (`docs/specs/balances.md`). Positive means they are owed, negative means they owe.
  Every current member appears, including at zero, plus anyone who left with something
  still owed — the same rule the balance list follows, so the two never disagree about
  who is in the group. The positions always sum to zero, since every group's balances
  do.
- **A reimbursement plan** — a list of payments, each "X pays Y an amount", that brings
  every position to zero.

The plan is built from net positions, **not** from who was on a transaction with whom.
That is the whole point: if Alice owes Bob 10 and Bob owes Carole 10, the plan is one
payment — Alice pays Carole 10 — not two. A pairwise reading of the same debts
(`balance(me, them)`, used for the friend list) would insist on two.

How the plan is built, in order:

1. People at exactly zero are left out entirely — there is nothing for them to do.
2. **Exact matches first**: a debtor whose debt equals a creditor's credit is paired off
   directly, which is both the obvious payment and one fewer than the general case would
   produce.
3. Then, repeatedly, **the largest remaining debtor pays the largest remaining
   creditor** the smaller of the two amounts, until everyone is at zero.

This yields **at most one payment fewer than the number of people with a non-zero
position**, and usually fewer. It is not presented, and must not be described, as a
*proven* minimum: finding the provably smallest set of payments is an NP-hard problem,
and the product's promise is a short, stable, explainable plan rather than an optimal
one.

The plan is **deterministic**: the same positions always produce the same plan, with
ties broken on user id, so two members looking at the same group see the same payments
in the same order. No plan is stored — it is derived on read, like every balance in this
product.

### Scope

- For a group **with sub-groups**, the viewer switches between **this group alone** and
  **this group and every sub-group nested inside it**, at any depth. Including
  sub-groups is the **default**: it is the scope that actually minimises payments, and it
  matches the rolled-up balance the group screen already shows.
- A group **with no sub-groups** has nothing for the toggle to change, and it is not
  shown.
- **Every descendant is counted, whether or not the viewer has joined it.** This is the
  deliberate exception to the rule that a sub-group the viewer is not in contributes
  nothing (`docs/specs/balances.md`, `docs/specs/group-statistics.md`). Those views
  answer "where do *I* stand" and "what did *we* spend", and for both, a group the viewer
  is on no transaction of genuinely contributes zero. A reimbursement plan is about
  *other people's* debts too, so excluding a sub-group would produce a plan that is not
  minimal over the trip and that contradicts what its own members see. The consequence —
  a disclosure — is accepted and bounded; see Security / privacy considerations.
- **Archived groups in scope still count**, at any depth. Archiving stops new
  transactions; it does not forgive a debt.

### Attribution

Every net position can be **expanded to show where it comes from**: per group in scope,
that person's balance in that group, largest magnitude first, each named. Collapsed by
default — the plan is the answer, the attribution is the justification, and showing both
at once would bury the first under the second.

The attribution of a position always sums back to the position itself.

**Suggested payments are not attributed**, and deliberately so. A payment produced by
netting does not belong to one group: Alice paying Carole 10 may settle 6 from the trip
and 4 from Corsica, or arise entirely from debts neither of them ever shared a
transaction over. Claiming a source for it would be a made-up fact. Only positions,
which do decompose exactly, carry sources.

### Recording a payment

- Tapping a suggested payment opens the **existing transaction form**, pre-filled as a
  `transfer`: the debtor as payer, the creditor as the person reimbursed, the suggested
  amount, and a default title. Everything stays editable before saving — a partial
  reimbursement is recorded by changing the amount.
- The transfer is recorded **in the group whose plan is open**, at any scope. Everyone in
  a sub-group is necessarily a member of every ancestor (`docs/specs/groups.md`), so both
  parties to any suggested payment are members of that group — there is never a payment
  the group cannot record.
- Saving it **re-reads the plan**, which shrinks by that payment, and refreshes the
  group's balances and the friend totals, exactly as recording any transfer already does.
- **A payment recorded at the parent settles the rolled-up position, and the per-group
  views then show the two offsetting entries that produce it** — the sub-group still
  showing its internal debt, the parent showing its mirror. This is inherent to
  per-group ledgers and is not a defect: the scope the plan was read and settled at is
  the scope that reads as settled.
- Nothing here moves money. A reimbursement plan is a statement about a ledger; the
  payment itself happens between people, outside the app.

### Where it applies

- On every group the viewer belongs to, **including the implicit pair group** (which has
  at most one suggested payment, and no scope toggle unless it has sub-groups of its
  own).
- On an **archived** group — or one whose ancestor is archived — the plan is shown
  read-only: it is the answer to "what do we still owe", which archiving does not
  change, but no transfer can be recorded until it is reopened, consistent with every
  other write path.
- Non-members see nothing: the group is "not found" to them, as on every group route.

## Out of scope

- **A proven-minimal plan.** The plan is short and stable, not optimal.
- **"Mark as settled"** as an action distinct from recording a transfer. The ledger is
  the source of truth; a settled flag that no transaction backs would drift from it.
- **Settling across groups in one action**, or from a friend row on the Friends tab —
  "settle up with Ada, wherever we stand". Still deferred, and still blocked on the same
  question: which group would record it (`docs/specs/balances.md`, Open questions).
- **Choosing who pays whom by hand** — reshuffling the suggested plan. The pre-filled
  form is editable, which covers the real need.
- **Payment integrations** — no money moves, no bank, no link to a payment app.
- **Reminders or nudges** to whoever owes, and any notification when a plan changes.
- **A history of settlements** as a thing of its own; recorded transfers are already
  visible in the transaction list.
- Multiple currencies (inherited: none exists yet).

## Edge cases

- **Everyone is at zero**: no payments, and an explicit settled state — never an empty
  list with no explanation.
- **A group of one**, or a group whose only transactions concern one person: settled,
  same as above.
- **Rounding**: all figures are integer cents and the positions sum to zero exactly, so
  the plan clears exactly. There is no residual cent to hide, and no payment of zero is
  ever suggested.
- **A member who left with a non-zero position**: they appear in the plan, named the way
  the balance list already names them ("Former member" when no membership remains to
  read a name from). Their payment is still recordable, since the transaction form's
  parties come from the group's current members — if they are no longer one, that row is
  informative only and says so rather than opening a form that cannot be saved.
- **A person who only ever appears in a sub-group the viewer has not joined**: cannot
  happen. Membership flows up, so anyone on a transaction in the sub-tree is a member of
  the group being viewed, or a former one the viewer already sees in its balance list.
  The plan therefore never names someone the viewer could not already see.
- **A sub-group the viewer has not joined, holding a debt**: counted, and named in the
  expandable attribution of the positions it affects.
- **A deeply nested tree**: every descendant at every depth is in scope, not only direct
  sub-groups.
- **The plan load fails**: an explicit, retryable error. Never a partial plan, and never
  a "settled" state produced by a failed read — that would be the worst possible lie
  this screen could tell.
- **Two people record the same suggested payment at once**: both transfers are recorded,
  as two ordinary transactions. The plan then shows the reverse payment for the excess,
  and the ledger stays correct. Nothing is locked; a plan is a suggestion, not a claim.
- **A transaction changes elsewhere while the plan is open**: the plan is re-read when it
  is opened and after a payment is recorded. It describes the transactions as of its last
  read, like every other derived figure here.
- **An amount too large to record as one transfer** (the per-transaction cap,
  `docs/specs/transactions.md`): the suggestion still states the true amount; saving a
  transfer above the cap is refused by the form's existing validation, and the payment
  is made in parts.

## Acceptance criteria

- [ ] A group shows where each person stands over the current scope — every current
      member, including at zero, plus anyone who left with something still owed, exactly
      as its balance list does — and the list of suggested payments that brings everyone
      to zero.
- [ ] Applying every suggested payment to the net positions leaves every person at zero.
- [ ] No suggested payment is for zero, and nobody at zero appears in the plan.
- [ ] Where Alice owes Bob and Bob owes Carole the same amount, the plan is the single
      payment from Alice to Carole.
- [ ] The number of suggested payments never exceeds one fewer than the number of people
      with a non-zero position.
- [ ] The same balances always produce the same plan, in the same order, for every
      viewer.
- [ ] For a group with sub-groups, the plan covers the group and every descendant at any
      depth by default, and the viewer can restrict it to the group alone.
- [ ] A descendant the viewer has not joined is included in the sub-tree plan.
- [ ] An archived descendant is included in the sub-tree plan.
- [ ] A group with no sub-groups shows no scope toggle, and its plan equals its own
      group's plan.
- [ ] Each net position can be expanded to its per-group breakdown, and that breakdown
      sums to the position.
- [ ] The breakdown is collapsed when the plan is opened.
- [ ] Tapping a suggested payment opens the transaction form as a transfer, pre-filled
      with the debtor as payer, the creditor as recipient, and the suggested amount.
- [ ] Saving that pre-filled transfer removes that payment from the plan.
- [ ] Editing the pre-filled amount down leaves the remainder in the plan.
- [ ] When every position is zero, the plan reads as settled rather than as an empty or
      failed list.
- [ ] On an archived group (itself or by an ancestor) the plan is readable and no payment
      can be recorded from it.
- [ ] A non-member of the group gets the same "not found" answer as on every other group
      route, and no plan.
- [ ] A failed load shows a retry, and never reads as settled.

## Testing considerations

- **The clearing property is load-bearing**: for generated sets of positions summing to
  zero, applying the plan must leave every person at zero, and the payment count must
  stay within the bound. This is the test that catches an algorithm change breaking the
  guarantee.
- **The chained-debt case** (A owes B, B owes C) is the regression this feature exists to
  prevent: netting, not pairwise reimbursement.
- **Determinism** deserves its own test: the same positions, in a different input order,
  must produce the same plan.
- **Attribution must reconcile**: per person, the sum of their per-group sources equals
  their net position, checked against the per-group balance the existing balances route
  computes — never a second independent implementation of a balance.
- **The unjoined-descendant inclusion is the one behaviour that contradicts the other
  sub-tree features**, so it needs an explicit integration test, and a matching one
  showing that the roll-up and the statistics scope were *not* changed by this feature.
- **Authorization**: a non-member of the group being asked gets `not found`; membership
  in the root is the only thing that grants the plan.
- **The pre-filled transfer** is the main end-to-end scenario: a plan with one payment,
  recorded, leaves the group settled.

## Data / API considerations

See `docs/API.md` for the authoritative surface.

- **Nothing is stored.** Positions and the plan are derived from `transactions` and
  `transaction_participants` on every read, for the same reason no balance is stored
  (`docs/specs/balances.md`, `docs/ARCHITECTURE.md`): a stored money figure that every
  write path has to keep correct is a drift waiting to happen.
- One new read route, next to the balances it derives from:
  `GET /groups/:groupId/transactions/reimbursements?scope=group|subtree`. It returns the
  net positions (each with its per-group sources) **and** the plan, in one response:
  the plan is unreadable without the positions it came from, and two calls would let the
  two disagree.
- `scope=subtree` resolves the sub-tree from `groups.parent_id`, **without** filtering on
  the caller's membership — unlike the `subtree` scope of the transaction list, which
  does filter. The two are intentionally different and must not be refactored into one.
- The response **never carries the transactions themselves**, nor per-group amounts for
  anyone other than a person's own position — a plan discloses net figures, not the
  contents of a sub-group.
- Parties are returned as resolved user summaries, so a person who left the group still
  has a name and picture without the client resolving ids it may not have.
- Amounts are integer cents, as everywhere else.
- Recording a payment uses the **existing** `POST /groups/:groupId/transactions` with
  `kind: "transfer"`. No new write route, and no settlement record.

## UX / UI considerations

- Reached from the **group screen's header**, alongside "Stats" and "Details" — it is a
  read-and-act view of its own, and folding it into the details sheet would bury it under
  group management.
- The sheet reads top to bottom as **answer, then justification**:
  1. the scope toggle, when the group has sub-groups;
  2. **"Suggested reimbursements"** — the plan, one row per payment, worded as a
     sentence ("Alice pays Bob 30.00") rather than a signed figure, with the viewer's own
     payments first so the first thing they see is what *they* have to do;
  3. **"Where everyone stands"** — the net positions, using the same colours and wording
     as the existing balance displays, each expandable to its per-group sources.
- A suggested payment row is **tappable when it can be recorded** and visibly inert when
  it cannot (archived group, or a party who is no longer a member), with the reason in
  one line rather than a silent dead tap.
- **Settled state**: one clear line ("You're all settled up") in place of both lists, not
  two empty sections.
- **Loading and error states** mirror the existing balances list: a spinner in place of
  the content, and an explicit retry on failure.
- Amounts and their direction follow `docs/DESIGN.md` and the existing balance wording —
  nothing here invents a second way to show money owed.

## Observability

- A failed plan read must be diagnosable and distinct from a failed group or balances
  read, carrying the operation, the caller, the group and the scope.
- **No amount is ever logged** — a plan is financial data
  (`docs/guidelines/LOGGING.md`). Counts (how many positions, how many payments) are
  not, and are what makes a plan's shape diagnosable without its figures.
- Recording a reimbursement is already observable as a transaction creation; it needs no
  log of its own.

## Security / privacy considerations

- The plan is readable **only by a member of the group asked for**, resolved server-side.
  A non-member gets `not found`, as on every group route.
- **The deliberate disclosure, stated plainly**: over `scope=subtree`, a member of a
  group can read net positions arising in a sub-group they have not joined, and the name
  of that sub-group in the attribution. This is a departure from the rolled-up balance
  and the statistics scope, both of which exclude such a sub-group, and it is a product
  decision taken knowingly because a plan that ignores those debts is wrong rather than
  merely incomplete.
- **What that disclosure is bounded to**: net figures per person per group in the
  sub-tree, and group names the viewer can already see in the sub-groups list
  (`docs/specs/groups.md`). It never exposes a transaction, a title, a category, a date,
  a split, or a member list. It cannot name a person the viewer could not already see,
  since membership flows up from any descendant to the group being viewed.
- Joining a visible sub-group is already a one-tap action with no friendship check for a
  member of its parent, so this discloses no figure the viewer could not have reached
  deliberately — it removes a click, not a boundary.
- The route grants **no write**: acting on a plan goes through the transaction create
  path, which enforces membership, the archived check, and that both parties are members
  of the group being written to.

## Open questions

- **Should a payment recorded from a sub-tree plan be attributed to a sub-group** rather
  than to the group whose plan is open — so the sub-group's own plan also reads as
  settled? It would need a rule for splitting one netted payment across several groups,
  which the plan itself deliberately refuses to invent.
- **Should the disclosure above be configurable** — a group setting that keeps a
  sub-group's figures inside it, at the cost of a plan that is not minimal? Related to
  the group-level privacy settings already listed as out of scope in
  `docs/specs/groups.md`.
- **Settling with one person across every group**, from the friend row, remains open for
  the same reason as before: which group would record it.
