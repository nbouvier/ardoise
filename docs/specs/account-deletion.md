# Feature: Account deletion

## Context

A user must be able to delete their Ardoise account and the personal data attached to it
(GDPR right to erasure; Google Play also requires an in-app deletion path and a web page
describing it). The difficulty is that a user's money is entangled with other people's:
the transactions they paid or shared live in groups other members keep using, and
removing those transactions outright would rewrite everyone else's history.

**Others** (`docs/specs/transactions.md`) is what makes deletion possible without that
damage: it stands for people outside the group, and counts in no balance and no statistic.
Deleting an account turns every one of its participations into Others. The other members
keep their own history intact — their shares, what they paid, every statistic about them
— and nothing about the deleted person remains that points to them.

## User story

As an **Ardoise user**, I want to **delete my account from the app**, so that **my
personal data is erased without leaving the people I shared costs with in a broken
state**.

As a **person who no longer has the app**, I want to **find out how to have my account
deleted**, so that **I can exercise that right without reinstalling it**.

## Expected behavior

### Starting the deletion

- The Account page has a **Delete account** action, separate from the Profile row and
  styled as destructive.
- It opens a **Delete account** page that says, before anything is deleted:
  - what is erased: the profile (name, e-mail, picture), the sign-in, the friend list;
  - that **every group shared one-to-one with a friend is deleted, with its sub-groups and
    everything in them, for the friend too** — the same loss as removing that friend;
  - that in every other group, the user's transactions **stay**, but the user's part in
    them becomes **Others**: their name disappears from them;
  - that **what the user is owed and what they owe in those groups disappears** — nobody
    will pay it back, and they will not pay it either. The page lists every group where
    the user's own balance is not zero, with that balance, so the loss is concrete before
    it happens;
  - that groups the user created pass to the member who has been in them the longest, and
    groups where the user is alone are deleted;
  - that it **cannot be undone**: signing in again with the same Google account later
    creates a new, empty account.
- A **Delete my account** button at the bottom, destructive. Pressing it asks one last
  time ("Delete your account? This cannot be undone."), then deletes.
- On success, the app is signed out and back on the sign-in screen. Nothing of the
  account stays on the device.

### What deletion does

All of it happens at once: if any step fails, nothing is deleted and the user can try
again.

- **Friendships**: every one is removed, and with it the group the two people shared and
  every sub-group of it, with all their transactions — exactly what removing each friend
  one by one does (`docs/specs/friends-and-invitations.md`).
- **Transactions everywhere else** — in every group the user belongs to, and in every
  group they used to belong to:
  - where they were the payer, the payer becomes Others;
  - where they had a share, that share becomes Others' share. If the transaction already
    had a share for Others, the two are added together (amounts, and weights for a split
    by shares), since a transaction has at most one Others share;
  - where they were the sender or the recipient of a transfer, that end becomes Others;
  - every transaction keeps its title, amount, date, category, comment and the other
    members' shares unchanged;
  - who recorded the transaction is forgotten.
- **Balances follow from that, without any further step**: Others counts in no balance,
  so whatever the deleted user was owed or owed disappears from every group, and the
  other members' balances change by exactly that amount. Statistics keep counting the
  other members' shares, as they do for any Others transaction.
- **Memberships**: the user leaves every group and sub-group they are in. Where they were
  the owner, ownership passes to the remaining member with an account who joined that
  group earliest. A group left with no member who has an account is deleted, with its
  placeholder members (`docs/specs/placeholder-members.md`) — its sub-groups are
  necessarily in the same state (`docs/specs/groups.md`).
- **Invitation links** the user created stop working: their friend link, and any group
  link they were the one to generate. Any remaining member of such a group can generate a
  new one.
- **Sessions**: every session of the account, on every device, ends. Any request still
  carrying one of its credentials is refused as unauthenticated.
- **Favorites**, being personal to a membership, go with the memberships.
- The account's identifier is kept, alone, in a list of deleted accounts, so the deletion
  can be applied again if a backup taken before it is ever restored (see "Data / API
  considerations").

### The web page

- A public page on the server describes account deletion, for Google Play's "delete
  account" link and for anyone without the app:
  - how to do it in the app (Account → Delete account);
  - what is erased, what stays (transactions in groups with other people, with the
    user's part as Others; anything the user typed into a transaction's title or
    comment), and how long backups keep a copy (see "Security / privacy
    considerations");
  - how to ask for it without the app: by writing to a contact address, from the address
    of the Google account used to sign in. The request is carried out by an operator
    with the same deletion as in the app.
- Same plain style as the invitation landing page.

## Out of scope

- Erasing names typed into free text — a transaction's title or comment, or a group's
  name. They belong to whoever wrote them, and finding a person's name in free text is
  not reliable.
- Anonymising rather than deleting the account itself (a "deactivated" state that can be
  restored), or any grace period / undo window.
- Exporting the user's data before deletion (right of access / portability).
- Notifying the other members that someone deleted their account.
- A web sign-in to delete an account without the app — the contact address stands in for
  it.
- Deleting accounts that have been inactive for a long time.
- Settling balances automatically before deletion.
- Writing the privacy policy itself: a separate piece of work, due before the first public
  release. It must carry the retention stated below and name Sentry as a processor
  (`docs/PRODUCT.md`).
- Asking for the Google sign-in again before deleting: the two confirmations stand in for
  it.

## Edge cases

- **A transfer between the user and someone who already deleted their account**: both of
  its ends would be Others, which is not a valid transfer (`docs/specs/transactions.md`)
  and moves nothing. It is deleted. This is the only transaction deletion ever deletes
  outside the shared one-to-one groups.
- **An expense or income whose payer and every share end up as Others** (every member
  involved has deleted their account): it stays — Others paying for Others is a valid
  transaction that moves nothing — and still shows in the group's history.
- **A transaction in an archived group**: anonymised like any other. Archiving stops
  members from editing; it does not keep a deleted account's data.
- **The user owns a sub-group but not its parent**, or the reverse: each group is handled
  on its own — ownership passes to that group's own longest-standing member with an
  account, never to a placeholder.
- **Two members joined the same group at the same instant**: ownership goes to one of
  them, the same one every time (stable order).
- **The user deletes their account from one device while another device is signed in**:
  the other device's next request is refused as unauthenticated and it returns to the
  sign-in screen, as for any ended session.
- **Another member records a transaction naming the user at the moment the account is
  deleted**: either the transaction is recorded first and anonymised with the rest, or
  the deletion comes first and the transaction is refused because that person is no
  longer a member. Never a crash, never a share for an account that no longer exists.
- **Deleting twice** (a double tap, a retry after a timeout that actually succeeded): the
  second request is refused as unauthenticated, since the account no longer exists; the
  app treats that as done and signs out.
- **Network failure** during deletion: an explicit, retryable error; since deletion is
  all-or-nothing, the account is either fully there or fully gone.
- **The user has no friend, no group**: deletion works the same and only erases the
  profile and sessions.
- **Signing in again with the same Google account**: a new account, unrelated to the old
  one, with no friend, no group, nothing.

## Acceptance criteria

- [ ] The Account page offers **Delete account**, which opens a page explaining what is
      erased, what stays, that balances in groups are lost, and that it is permanent.
- [ ] That page shows the total the user is owed and the total they owe, each unfolding
      into the groups where the balance is not zero, with that balance; a side with no
      group is not shown, and when every balance is zero the page says so.
- [ ] Nothing is deleted until the user confirms twice (the button, then the final
      prompt); cancelling either leaves the account untouched.
- [ ] After deletion the app is on the sign-in screen, and the account's access and
      refresh tokens are both refused (`401`).
- [ ] Every friend of the deleted user no longer lists them, and the group they shared,
      with its sub-groups and their transactions, no longer exists.
- [ ] In a group with other members, every transaction the user paid, shared or sent /
      received a transfer in is still there with the same amount, date, title and other
      members' shares; the user's part is Others, and the user's name appears nowhere in
      the group.
- [ ] A share of the user's in a transaction that already had an Others share is added to
      it: the transaction has a single Others share whose amount (and weight) is the sum.
- [ ] After deletion, every remaining member's balance in such a group is exactly what it
      would be had the user's part always been Others, and the balances still sum to zero.
- [ ] A group the user owned with other members left now has the earliest-joined of them
      as its owner, who can delete it; a group where the user was the only member with an
      account no longer exists, placeholders included.
- [ ] A transfer whose two ends were the user and an already-deleted account no longer
      exists; an expense paid by and shared only with Others still does.
- [ ] Deletion is all-or-nothing: if it fails partway, the account and every piece of data
      above are exactly as before.
- [ ] Signing in again with the same Google account creates a new, empty account.
- [ ] The public deletion page is reachable without signing in and describes the in-app
      path, what is erased and kept, the backup retention and the contact address.
- [ ] The database refuses to delete a user still named as a payer or participant of a
      transaction, so a deletion path that forgets to anonymise fails instead of silently
      deleting other people's transactions.

## Testing considerations

- The anonymisation rule is the heart of the feature and mixes with the Others balance
  rule: a generated-ledger property (random ledgers, random member deleted, the remaining
  members' balances equal those of the same ledger with that member replaced by Others
  from the start) catches what hand-written cases miss.
- The Others-share merge and the Others-to-Others transfer are the two cases where
  anonymisation changes rows rather than one column: each needs its own test.
- All-or-nothing needs a test that makes a late step fail and checks nothing moved.
- Deletion touches friends, groups and transactions at once: cover it at the HTTP level
  against the real schema (PGlite), not by mocking the other features.
- The `401` after deletion must be tested with an access token that has not expired yet —
  the case a stateless token check would let through.

## Data / API considerations

- `GET /me/deletion-preview` — what the Delete account page shows: the groups where the
  caller's own balance is not zero, with that balance, and the number of friends (each a
  shared group that will be deleted).
- `DELETE /me` — deletes the caller's account as described above → `204`. Authenticated
  like every other route; a second call is `401` since the account is gone.
- `GET /delete-account` — the public HTML page, unauthenticated, linked from Google
  Play.
- `transactions.created_by` becomes nullable: who recorded a transaction is forgotten
  when that account is deleted.
- The references from a transaction's payer and from a share to the user **refuse** the
  user's deletion instead of cascading: deleting a user still named on a transaction must
  fail, since cascading would delete other people's transactions. Every path that
  deletes a user anonymises first.
- **Deleted-accounts list**: the identifier of each deleted account and when it was
  deleted — nothing else, no name, no e-mail, no Google id. A database restored from a
  backup taken before a deletion brings the account back; an operator command re-applies
  the deletion to every listed account still present (`docs/OPERATIONS.md`). The same
  command carries out a deletion requested through the contact address.
- Shapes go through `@ardoise/shared` as usual.

## UX / UI considerations

- The Delete account action sits on the Account page under the Profile row, in its own
  section, red like other destructive actions; not inside the Profile row's menu, where a wrong
  tap next to "Sign out" would be too easy.
- The Delete account page states the consequences as a short list, then what is lost as two
  unfoldable rows — "You are owed …" and "You owe …", each the total over every group,
  opening onto the groups it is made of (name and amount, in the usual balance colours) —
  then the button. It
  has a loading state while the preview loads, and an error state with retry.
- The final prompt is the app's own confirmation dialog, destructive button "Delete".
- While deletion runs, the button shows progress and cannot be pressed again.
- A failure leaves the user on the page with an error message and the button available
  again.

## Observability

- Each deletion is logged with the deleted account's identifier and what it touched
  (friendships removed, groups left, ownerships passed on, groups deleted, transactions
  anonymised) — never a name, an e-mail or an amount.
- A failed deletion is logged as an error with the account's identifier and is reported
  to Sentry like any unexpected server failure.
- The operator command logs each account it deletes or skips.
- On the device, a failed deletion is logged through the mobile logger.

## Security / privacy considerations

- Only the account itself can delete it from the app: `DELETE /me` always acts on the
  authenticated caller, never on an identifier from the request.
- After deletion, no stored credential of the account works any more, including an access
  token that has not expired yet.
- What is kept after deletion, and must be stated on the web page and in the privacy
  policy:
  - transactions in groups shared with other people, with the deleted user's part as
    Others and no link to them;
  - free text other people or the user typed (titles, comments, group names);
  - the account's identifier, alone, in the deleted-accounts list;
  - backups: the daily backups keep a copy of the database for up to **12 months**
    (30 daily, 12 monthly — `docs/OPERATIONS.md`). They are encrypted, never used
    except to restore the service, and a restore re-applies every deletion listed;
  - server logs and Sentry events carry only the account's opaque identifier.
- The contact address for deletion requests comes from the server's configuration
  (production only; the page omits that paragraph when it is not set), never from the
  repository.
- A deletion requested by e-mail is only carried out when the request comes from the
  e-mail address of the account's Google account.

## Open questions

- None.
