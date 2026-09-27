# Feature: Reimbursements

## Context

A group's balances say where each person stands **against the group**
(`docs/specs/balances.md`). They deliberately stop short of the question people
actually settle on: *who should pay whom, and how little can we get away with?* In a
five-person trip that answer is arithmetic nobody wants to do by hand, and doing it
naively — everybody reimburses everybody they were on a transaction with — produces
many more payments than are needed.

This feature is the settle-up half that `docs/specs/balances.md` listed as out of scope.
It turns a group's balances into a short, concrete list of payments that clears them,
and lets the viewer record one of those payments in a tap — since a reimbursement in
this product *is* a `transfer` transaction (`docs/specs/transactions.md`), not a new
kind of record.

A plan covers **one group** — the one being looked at. Sub-groups keep their own, the
same way balances do (`docs/specs/balances.md`). A plan spanning a whole sub-tree was
built first and dropped: it netted debts across spaces the viewer was not looking at,
which made a payment impossible to trace back to anything on screen, and it required
counting sub-groups the viewer had never joined to stay consistent with their members.
Settling a trip means settling its groups, each of which says plainly what it is about.

## User story

As a **member of a group**, I want to **see the short list of payments that clears
everything we owe each other**, so that **we can settle without working out who pays
whom**.

As a **member who owes money**, I want to **record a suggested payment in one tap**, so
that **settling up does not mean re-entering an amount the app already knows**.

## Expected behavior

### What is computed

Two things, from the same figures:

- **The group's balances** — each person's net position in it, exactly the figures the
  group already shows (`docs/specs/balances.md`): positive means they are owed, negative
  means they owe. Every current member appears, including at zero, plus anyone who left
  with something still owed. They always sum to zero.
- **A reimbursement plan** — a list of payments, each "X pays Y an amount", that brings
  every balance to zero.

The plan is built from those net balances, **not** from who was on a transaction with
whom. That is the whole point: if Alice owes Bob 10 and Bob owes Carole 10, the plan is
one payment — Alice pays Carole 10 — not two. A pairwise reading of the same debts
(`balance(me, them)`, used for the friend list) would insist on two.

How the plan is built, in order:

1. People at exactly zero are left out entirely — there is nothing for them to do.
2. **Exact matches first**: a debtor whose debt equals a creditor's credit is paired off
   directly, which is both the obvious payment and one fewer than the general case would
   produce.
3. Then, repeatedly, **the largest remaining debtor pays the largest remaining
   creditor** the smaller of the two amounts, until everyone is at zero.

This yields **at most one payment fewer than the number of people with a non-zero
balance**, and usually fewer. It is not presented, and must not be described, as a
*proven* minimum: finding the provably smallest set of payments is an NP-hard problem,
and the product's promise is a short, stable, explainable plan rather than an optimal
one.

The plan is **deterministic**: the same balances always produce the same plan, with
ties broken on user id, so two members looking at the same group see the same payments
in the same order. No plan is stored — it is derived from the balances on every read,
and they are themselves derived from the transactions.

### Scope

- A plan covers **the group being looked at**, and nothing else. There is no scope to
  choose and no toggle: a sub-group has its own plan, reached by opening it, and a
  parent's plan never mentions it.
- This is what makes a suggested payment **accountable**: every cent of it traces to the
  group's own transaction list and its own per-member balances, both one tap away on the
  same screen.
- **An archived group still has a plan** — archiving stops new transactions, it does not
  forgive a debt — but nothing can be recorded from it until it is reopened.

- Tapping a suggested payment opens the **existing transaction form**, pre-filled as a
  `transfer`: the debtor as payer, the creditor as the person reimbursed, the suggested
  amount, and a default title. Everything stays editable before saving — a partial
  reimbursement is recorded by changing the amount.
- The transfer is recorded **in the group whose plan is open** — the group both parties
  are members of and whose debts the plan describes.
- Saving it **refreshes the group's balances**, so the plan shrinks by that payment, and
  the friend totals too, exactly as recording any transfer already does.
- Nothing here moves money. A reimbursement plan is a statement about a ledger; the
  payment itself happens between people, outside the app.

### Where it applies

- On every group the viewer belongs to, **including the implicit pair group**, which has
  at most one suggested payment.
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
- **Rounding**: all figures are integer cents and the balances sum to zero exactly, so
  the plan clears exactly. There is no residual cent to hide, and no payment of zero is
  ever suggested.
- **A member who left with a non-zero balance**: they appear in the plan, named the way
  the balance list already names them ("Former member" when no membership remains to
  read a name from). Their payment is *not* recordable, since the transaction form's
  parties come from the group's current members — that row is informative only, and says
  so rather than opening a form that cannot be saved.
- **A group whose debts were all run up in its sub-groups**: it reads as settled, and
  each sub-group has its own plan. That is the scope working as intended, not a missing
  figure.
- **The plan load fails**: it fails with the balances it is derived from — an explicit,
  retryable error. Never a partial plan, and never a "settled" state produced by a failed
  read, which would be the worst possible lie this screen could tell.
- **Two people record the same suggested payment at once**: both transfers are recorded,
  as two ordinary transactions. The plan then shows the reverse payment for the excess,
  and the ledger stays correct. Nothing is locked; a plan is a suggestion, not a claim.
- **A transaction changes elsewhere while the plan is open**: the plan describes the
  balances as of their last read — when the group was opened, and after any transaction
  is recorded or edited from it — like every other derived figure here.
- **An amount too large to record as one transfer** (the per-transaction cap,
  `docs/specs/transactions.md`): the suggestion still states the true amount; saving a
  transfer above the cap is refused by the form's existing validation, and the payment
  is made in parts.

## Acceptance criteria

- [ ] A group shows where each person stands in it — every current member, including at
      zero, plus anyone who left with something still owed, exactly as its balance list
      does — and the list of suggested payments that brings everyone to zero.
- [ ] Applying every suggested payment to those balances leaves every person at zero.
- [ ] No suggested payment is for zero, and nobody at zero appears in the plan.
- [ ] Where Alice owes Bob and Bob owes Carole the same amount, the plan is the single
      payment from Alice to Carole.
- [ ] The number of suggested payments never exceeds one fewer than the number of people
      with a non-zero balance.
- [ ] The same balances always produce the same plan, in the same order, for every
      viewer.
- [ ] The plan covers the group being looked at only: money owed inside a sub-group does
      not appear in its parent's plan, and there is no scope to choose.
- [ ] A sub-group's own plan covers that sub-group, reached by opening it.
- [ ] Tapping a suggested payment opens the transaction form as a transfer, pre-filled
      with the debtor as payer, the creditor as recipient, and the suggested amount.
- [ ] Saving that pre-filled transfer removes that payment from the plan.
- [ ] Editing the pre-filled amount down leaves the remainder in the plan.
- [ ] When every balance is zero, the plan reads as settled rather than as an empty or
      failed list.
- [ ] On an archived group (itself or by an ancestor) the plan is readable and no payment
      can be recorded from it.
- [ ] A non-member of the group gets the same "not found" answer as on every other group
      route, and no plan.
- [ ] A failed load shows a retry, and never reads as settled.

## Testing considerations

- **The clearing property is load-bearing**: for generated sets of balances summing to
  zero, applying the plan must leave every person at zero, and the payment count must
  stay within the bound. This is the test that catches an algorithm change breaking the
  guarantee.
- **The chained-debt case** (A owes B, B owes C) is the regression this feature exists to
  prevent: netting, not pairwise reimbursement.
- **Determinism** deserves its own test: the same balances, in a different input order,
  must produce the same plan.
- **Containment**: money owed inside a sub-group must not appear in its parent's plan —
  the property the earlier sub-tree scope traded away, now worth pinning.
- **Authorization needs no test of its own here**, which is the point of deriving the
  plan from the balances: it is readable exactly when they are, and they already enforce
  membership.
- **The pre-filled transfer** is the main end-to-end scenario: a plan with one payment,
  recorded, leaves the group settled.

## Data / API considerations

See `docs/API.md` for the authoritative surface.

- **Nothing is stored, and there is no route of its own.** The plan is a pure function of
  a group's balances (`GET /groups/:groupId/transactions/balances`), so it is derived
  wherever those are read — client-side, from figures already on screen. That is also
  what guarantees the plan and the balance list can never disagree, and it is the reason
  the earlier server route was removed once the scope stopped needing data the client
  cannot see.
- The arithmetic lives in `packages/shared`, next to the split arithmetic, for the same
  reason: it is pure, platform-neutral, and there must be exactly one definition of it.
- Parties are named from the group's **own member list**, with the same "Former member"
  fallback the per-member balance list already uses for someone who has left.
- Amounts are integer cents, as everywhere else.
- Recording a payment uses the **existing** `POST /groups/:groupId/transactions` with
  `kind: "transfer"`. No new write route, and no settlement record.

## UX / UI considerations

- Shown on the group screen's **Balances tab** in full — it is a read-and-act view of its
  own, and folding it into Manage would bury it under group management.
- The tab reads top to bottom as **the figures, then what to do about them**:
  1. **"Where everyone stands"** — the group's balances, in the same colours and wording
     as every other balance display, the viewer's own row marked "Me" rather than
     repeated in a card of its own (`docs/specs/balances.md`);
  2. **"Suggested reimbursements"** — the plan, one row per payment, worded as a
     sentence ("Alice pays Bob 30.00") rather than a signed figure, with the viewer's own
     payments first so the first thing they see is what *they* have to do, and a plain
     "Tap to reimburse" hint rather than a count of payments — the count is not the
     point, recording one is.
- A suggested payment row is **tappable when it can be recorded** and visibly inert when
  it cannot (archived group, or a party who is no longer a member), with the reason in
  one line rather than a silent dead tap. Its amount is worded, not shouted: sized with
  the rest of the row rather than as a headline figure.
- **Settled state**: one clear line ("You're all settled up") in place of both lists, not
  two empty sections.
- **Loading and error states** mirror the existing balances list: a spinner in place of
  the content, and an explicit retry on failure.
- Amounts and their direction follow `docs/DESIGN.md` and the existing balance wording —
  nothing here invents a second way to show money owed.

## Observability

- The plan carries no read of its own, so it has **no failure of its own**: it fails, and
  is diagnosable, exactly as the group's balances are (`docs/specs/balances.md`).
- **No amount is ever logged** — a plan is financial data
  (`docs/guidelines/LOGGING.md`).
- Recording a reimbursement is already observable as a transaction creation; it needs no
  log of its own.

## Security / privacy considerations

- A plan is derived from a group's balances, so it is readable **exactly when they are**:
  by a member of that group, and by nobody else. It adds no route, no query and no
  authorization surface of its own.
- It therefore **cannot disclose anything about a sub-group**, joined or not: the figures
  it works from are the group's own, and a sub-group has no way into them.
- It cannot name a person the viewer could not already see — the parties come from the
  group's own balance list, which they can see on the same Balances tab.
- Acting on a plan goes through the transaction create path, which enforces membership,
  the archived check, and that both parties are members of the group being written to.

## Open questions

- **Settling with one person across every group**, from the friend row, remains open for
  the same reason as before: which group would record it.
- **Whether "settle the whole trip" deserves a deliberate, visible feature** of its own —
  now that the implicit sub-tree plan is gone. It would have to state which groups it
  covers and what it leaves out, rather than quietly netting across them.
