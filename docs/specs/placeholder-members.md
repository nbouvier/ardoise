# Feature: Placeholder members

## Context

A group is rarely complete the day it is created. Some people are not friends of the
creator on Ardoise yet, some will join later through the link, and some will never install
the app at all. Expenses still have to be recorded from the first day, and they have to
name who they concern.

A **placeholder member** is that person: a member of a group known only by a name, with no
account behind it. They take part in transactions exactly like a member with an account.
When the real person joins later, they say which placeholder they are, and everything
recorded for the placeholder becomes theirs.

Placeholders sit next to **Others** (`docs/specs/transactions.md`): Others is everyone
outside the group, anonymous and outside every balance; a placeholder is one named person
inside the group, with a balance of their own.

## User story

As a **group creator**, I want to **add people by name only**, so that **I can record
expenses with everyone from the start, whether or not they are on Ardoise**.

As **someone joining a group**, I want to **say which of its placeholder members I am**, so
that **the expenses recorded for me before I joined become mine**.

## Expected behavior

### Adding placeholders

- Creating a standard group offers, next to the friend picker, an **Add other
  participants** part: type a name, add it, repeat. Names can be taken back off the list
  before the group is created.
- Placeholders can also be **added later**, from the same part on the group's "+ Invite"
  page.
- A name is 1 to 60 characters, trimmed. **Two placeholders of the same group tree cannot
  share a name** (case-insensitive); a placeholder may share a name with a member who has
  an account.
- Never in a **pair group** or in any sub-group nested under one: that tree is capped at
  the friendship's two people (`docs/specs/groups.md`).

### Placeholders and sub-groups

- A placeholder belongs to a **group tree**: it is created once and can be a member of any
  group of that tree, following the same rule as everyone else — being in a sub-group
  means being in every group above it.
- Creating a sub-group, or its "+ Invite" page, offers the parent's placeholders to pick, as
  well as new names. A new name added in a sub-group is added to every group above it too.
- Removing a placeholder from a **sub-group** works like removing any member: it leaves
  that sub-group and everything below it, and the transactions there keep its name.

### Taking part

- In a group, a placeholder is a member like any other: it can pay, be concerned by an
  expense or an income, send or receive a transfer, appears in the balances, in the plan
  to reimburse and in the statistics.
- It **counts in the member count** shown for the group.
- It is marked **Not on Ardoise** in the Manage tab's member list.

### What a placeholder is not

A placeholder never acts, so it never counts when the rules ask who is there to act:

- it is **never the owner**, and ownership never passes to it;
- it is **never a friend** and never shows in a friend picker;
- **the owner can leave** a group where only placeholders would remain — and a group
  left with **no member who has an account is deleted**, placeholders included, exactly as
  an empty group is today;
- it never creates an invitation link, never records a transaction.

### Claiming a placeholder — "This is me"

- **Right after joining a group through a link**, if the group's tree has placeholders,
  the app asks **"Is one of these you?"** with their names. Picking one claims it; **"I'm
  not on the list"** leaves the person a plain new member.
- **At any time later**, any member with an account can open a placeholder's row in the
  Manage tab and choose **This is me** — for someone who answered too fast, or a friend
  who was added directly rather than through the link.
- Claiming asks for a confirmation that states what is taken over: the placeholder's
  balance in the group and how many transactions name it.
- Claiming **merges the placeholder into the account**, across its whole tree:
  - every transaction naming the placeholder — as payer, as a concerned party, at either
    end of a transfer — names the account instead;
  - where the account was already on the same transaction (a former member who rejoined),
    the two shares are added together;
  - a transfer between the placeholder and the account itself moves nothing any more and
    is deleted;
  - the account becomes a member of every group the placeholder was in;
  - the placeholder disappears.
- **A member claims at most one placeholder per group tree**, and a placeholder can only
  be claimed once.

### Renaming and removing

- Any member can **rename** a placeholder (a typo, a nickname), within the uniqueness rule
  above.
- Any member can **remove** a placeholder from the tree's root group. It then disappears
  from the whole tree, and **its part in every transaction becomes Others** — the same
  anonymisation as an account deletion (`docs/specs/account-deletion.md`): what it was
  owed and what it owed in the group is lost, and the confirmation says so.

## Out of scope

- Merging a placeholder into a member who has already claimed one in the same tree, or
  merging two placeholders together.
- Undoing a claim or a removal.
- Inviting a specific placeholder through a link of its own; the group's one link serves
  everyone.
- Contact details for a placeholder (e-mail, phone), or notifying the real person.
- Turning a share recorded as Others into a placeholder after the fact.
- Showing the "Not on Ardoise" marker anywhere other than the Manage tab and the claim
  prompt (transaction forms, balances, statistics show the name only).

## Edge cases

- **Two people claiming the same placeholder at once**: one wins, the other is told it has
  already been claimed and stays a plain member.
- **One person claiming two placeholders at once**: one wins, the other is refused as
  already claimed by them.
- **The placeholder was removed, or renamed, while the prompt was open**: claiming a
  removed one is refused as gone; a rename does not matter, the claim is by identity.
- **Accepting a link one is already a member through**: no prompt. "This is me" is still
  there.
- **A member who left the tree and rejoined**: their membership is new, so they may claim
  again — the earlier claim already became theirs and stays so.
- **Archived tree** (the root archived): adding, renaming, removing and claiming are
  refused, like any membership change. A claim made from an active tree also carries over
  the placeholder's transactions in its archived sub-groups: it changes who a transaction
  names, never its content.
- **Removing a placeholder that is on no transaction**: it just disappears.
- **Two placeholders, or a placeholder and a new name in the same request, with the same
  name**: refused as a duplicate.
- **Deleting the group**: its placeholders go with it.
- **The account that claimed a placeholder is deleted later**: its part becomes Others, like
  everything else it had (`docs/specs/account-deletion.md`).

## Acceptance criteria

- [ ] Creating a standard group can add placeholders by name, along with friends; they are
      members of the group from the start, counted in its member count.
- [ ] Placeholders can be added later from "+ Invite"; a sub-group can take its parent's
      placeholders and new ones, and a new one joins every group above it too.
- [ ] Placeholders are refused anywhere in a pair group's tree.
- [ ] Two placeholders of the same tree cannot share a name, whatever the case.
- [ ] A placeholder can be the payer, a concerned party and either end of a transfer, and
      counts in balances, the plan to reimburse and statistics like any member.
- [ ] A placeholder is never owner nor heir; the owner can leave when only placeholders
      remain; a group with no account member left is deleted.
- [ ] After joining through a link, a person is asked whether they are one of the tree's
      placeholders, and can answer no.
- [ ] Claiming a placeholder, after the link or later from Manage, makes every transaction
      of the tree that named it name the account instead, with shares merged and
      self-transfers deleted, and gives the account every membership the placeholder had.
- [ ] Every member's balance after a claim equals what it would be had the account been
      on those transactions from the start.
- [ ] A member can claim only one placeholder per tree; a placeholder can be claimed once,
      even under concurrent claims.
- [ ] Renaming a placeholder changes its name everywhere.
- [ ] Removing a placeholder from the root turns its part into Others everywhere in the
      tree; removing it from a sub-group only takes it out of that branch.

## Testing considerations

- The claim is the core risk, and it has an oracle: for a generated ledger mixing
  placeholders, members, Others, transfers and both split modes, the balances after
  claiming must equal those of the same ledger written with the account in the
  placeholder's place from the start — the mirror of account deletion's property test.
- Removal has the same oracle as account deletion: the ledger with the placeholder
  replaced by Others.
- Concurrency: two claims of one placeholder, and two claims by one member, raced without
  awaiting each other.
- Every rule that counts members — owner leaving, ownership passing, deleting a group left
  without accounts, account deletion — needs a case where only placeholders remain.
- Deleting a group, and a group emptied of accounts, must take its placeholders with it
  even when they are on transactions.
- Authorization: every placeholder route refuses a non-member like every group route does.

## Data / API considerations

See `docs/API.md` and `docs/DATABASE.md`.

- A placeholder is a **person without an account**: it is stored where accounts are, so
  memberships, payers and shares name it exactly as they name an account, and claiming it
  is a matter of naming the account instead. It has no Google identity and no e-mail, can
  never sign in, and belongs to its tree's root group: deleting that group deletes it.
- Members, payers and participants carry a `placeholder` flag so the client can tell them
  apart.
- A member's claim is recorded on their membership of the tree's root, which is what
  limits them to one.
- The removal of a person still named on a transaction stays refused by the database, as
  for account deletion; the check runs at the end of the database transaction, so that
  deleting a group can take its placeholders and their transactions with it at once.

## UX / UI considerations

- **New group / New sub-group**: under the friend picker, an `overline` **Add other
  participants**, a name field with an **Add** action, then the names added as removable
  pills. For a sub-group, the parent's placeholders show first, as pills to select.
- **"+ Invite"**: the same part, between the friend picker and the link.
- **Manage tab**: a placeholder's row carries a neutral **Not on Ardoise** tag and opens a
  menu: **This is me** (when the viewer can still claim), **Rename**, **Remove**
  (destructive).
- **Claim prompt** after joining: "Is one of these you?", one row per placeholder, and
  "I'm not on the list".
- Claim confirmation: "You are Alex?" — "Alex's 7 transactions become yours. In this group,
  Alex is owed 12.00." Removal confirmation states the balance that is lost.

## Observability

- Placeholder creation, rename, removal and claim are logged with the acting user, the
  group and the placeholder id — never the name, which is personal data typed by members.
- A claim logs how many transactions it rewrote and how many self-transfers it deleted; a
  removal how many transactions it anonymised.
- Refusals (already claimed, gone, name taken, pair group) are logged with their reason.

## Security / privacy considerations

- Membership remains the only authorization: every placeholder action requires being a
  member of the group named in the request, enforced on the server.
- Anyone who joins through the link can claim any placeholder. This adds no power a member
  does not already have — any member can edit any transaction — but a claim cannot be
  undone, so it is confirmed and limited to one per member per tree.
- A placeholder can never authenticate: it has no identity a sign-in could match.
- Placeholder names are **personal data about people who have not agreed to Ardoise**,
  typed by members. They are kept only as long as the group, disappear on claim or
  removal, are never logged, and must be covered by the privacy policy.

## Open questions

None.
