# Feature: Email and password sign-in

## Context

Until now Google sign-in was the only way into Ardoise
(`docs/specs/authentication.md`). That turns away everyone without a Google account or
unwilling to use it, and it keeps the web target closed. This feature adds a classic
account: an e-mail address and a password, created through a sign-up form.

Unlike Google, nobody vouches for an address a person types. Every address is therefore
**proven by a code sent to it** before it is trusted, which is also what makes a
forgotten password recoverable and lets one person's Google and password sign-ins land
on the same account.

## User story

As a **person without a Google account, or who prefers not to use it**, I want to
**create an Ardoise account with my e-mail address and a password**, so that **I can
use the app, on my phone or in a browser, like anyone else**.

As a **user who forgot their password**, I want to **set a new one from a code sent to
my e-mail address**, so that **I do not lose my account and its groups**.

## Expected behavior

### One account per e-mail address

- An e-mail address belongs to at most one account, compared without regard to case.
  Google and password sign-ins with the same address reach **the same account**.
- The app **never reveals whether an address has an account**: signing up, asking for a
  password reset and failing to sign in all look the same either way. Only the mailbox
  owner learns it, from the e-mail they receive.

### Sign-up

1. The sign-in screen offers **Create an account**: a form with **name**, **e-mail** and
   **password**.
2. Submitting it always answers "We sent a 6-digit code to …" and shows a code field.
   What actually happens depends on the address:
   - **no account**: an e-mail carries the code;
   - **an account without a password** (Google only): an e-mail carries the code and
     says that entering it adds a password to the existing account;
   - **an account with a password**: no code; an e-mail says an account already exists
     and points to sign-in and to "Forgot password".
3. Entering the right code signs the person in:
   - **no account**: the account is created with the name, address and password given;
   - **Google-only account**: the password is added to it; its name stays as it is.
4. The code screen offers **Resend code** (submits the form again, which replaces the
   previous code) and a way back to change the address.

### Sign-in

- The sign-in screen has an **e-mail** and a **password** field and a **Sign in** button,
  above the existing **Continue with Google** action.
- A wrong address, a wrong password, or an account without a password all answer the
  same "Incorrect e-mail or password".

### Forgotten password

1. **Forgot password?** on the sign-in screen asks for the address and always answers
   "If an account uses this address, we sent it a code".
2. An account with that address (with or without a password) gets an e-mail with a
   code; an unknown address gets nothing.
3. The code and a new password sign the person in. **Every other session of the account
   is revoked**, on every device.
4. On a Google-only account, this is how a password is added from the sign-in screen.

### Changing the password

- The Account page of an account **with a password** offers **Change password**: the
  current password, then the new one. On success the person stays signed in here and
  every other session is revoked.
- An account without a password does not show it (see Open questions).

### Google sign-in

- Signing in with Google whose address matches an account without a Google identity
  **links** Google to that account (Google has verified the address) instead of creating
  a second one. From then on, either way in reaches it.
- Google keeps refreshing the account's name and picture at each Google sign-in, as
  before.

### Account page and switching account

- A password account has no picture: its avatar is its initial, as already happens when
  a Google account has none.
- **Switch account** signs out and returns to the sign-in screen for an account with a
  password; a Google-only account keeps today's behavior (straight to the Google
  chooser).

### Codes and passwords

- A code is 6 digits, valid **15 minutes**, usable **once**, and dies after **5 wrong
  attempts**. Requesting a new one for the same address and purpose replaces the
  previous one.
- A password is **8 to 128 characters**, with no rule on its composition.
- E-mails are in French or English, following the language the app or browser asks for;
  English otherwise.

## Out of scope

- Google sign-in on the web target (still disabled there; see Open questions).
- Changing the account's e-mail address or name.
- Unlinking Google from an account, or removing a password.
- Two-factor authentication, passkeys, magic links, Apple sign-in.
- Checking passwords against known-breached password lists.
- Showing which sign-in methods an account has, beyond the Change password action.
- Hosting the web app (a separate deployment step).

## Edge cases

- **Wrong code**: "This code is not valid" — the same answer for a mistyped, expired, used
  or exhausted code, with no attempt count shown.
- **Too many requests for one address**: beyond **5 codes per hour** for an address
  and purpose, or **10 failed sign-ins in 15 minutes** for an address, the request is
  refused as "Too many attempts, try again later". The limit counts requests for the
  address, whether or not an account exists, so it reveals nothing. The per-client
  limits on `/auth/*` still apply on top.
- **The e-mail cannot be sent** (provider down): the request still answers as usual;
  the failure is logged and reported. The person uses Resend code.
- **An account gains a password between sign-up and code entry** (through "Forgot
  password" in another tab): the sign-up code is refused as not valid; the person signs
  in instead.
- **Google sign-in whose address changed** to one held by another account: the Google
  account keeps signing into its own account, with its previous address.
- **Account deleted while a code is pending**: the code goes with the account's data
  and can no longer be used.
- **Invitation link opened while signed out**: the invitation survives sign-up, code
  entry and password reset, as it survives Google sign-in
  (`docs/specs/friends-and-invitations.md`).
- **Name with surrounding spaces**: trimmed; 1 to 60 characters, like a placeholder's.
- **Address in a different case** at sign-in than at sign-up: same account.

## Acceptance criteria

- [ ] Signing up with a new address sends a code; entering it creates the account and
      signs the person in, landing on the app's main screens.
- [ ] Signing up with an address that has a password account sends no code, sends an
      "account already exists" e-mail, and answers exactly as for a new address.
- [ ] Signing up with the address of a Google-only account and entering the code adds a
      password to that account: signing in with that password reaches the same groups,
      and its name is unchanged.
- [ ] Signing in with the right address and password signs in; a wrong password, an
      unknown address and a Google-only account all answer the same 401.
- [ ] Signing in with Google whose address matches a password account reaches that
      account, not a new one.
- [ ] A code is refused when wrong, after 15 minutes, once used, and after 5 wrong
      attempts even if the 6th is right.
- [ ] "Forgot password" answers the same for a known and an unknown address, sends a code
      only to a known one, and the code with a new password signs in and revokes every
      other session of the account.
- [ ] Changing the password from the Account page needs the current one, keeps the
      current device signed in and revokes every other session.
- [ ] More than 5 code requests in an hour, or 10 failed sign-ins in 15 minutes, for one
      address are refused with 429, whether or not the address has an account.
- [ ] A password under 8 or over 128 characters, or an empty name, is refused before any
      e-mail is sent.
- [ ] The production server refuses to start without a real e-mail transport configured.
- [ ] On the web target, a person can sign up, sign in, reset their password and use the
      app.

## Testing considerations

- Server integration tests drive the built Fastify instance with an in-memory e-mail
  transport, reading codes from the captured e-mails; the e-mail provider's API is mocked
  at the HTTP boundary.
- Non-disclosure is the core property: tests compare the status and body of each pair of
  "account exists / does not exist" requests.
- Codes and throttling depend on time: tests use an injected clock.
- The pre-existing Google account path (link by address) and account deletion (pending
  codes and the password go with the account) need regression tests.

## Data / API considerations

- An account gains an optional **password hash**. An account must have a Google identity,
  a password, or both, and always an e-mail address, unique without regard to case.
- **Pending codes**: address, purpose (sign-up or password reset), a hash of the code,
  expiry, attempts left, and for a sign-up the name and password hash given. One per
  address and purpose.
- The user profile tells the client whether the account has a password, for the Account
  page.
- Endpoints (see `docs/API.md` for the authoritative surface): sign-up request and code
  verification, password sign-in, password reset request and confirmation, password
  change. Every one that signs in returns the same session as Google sign-in.

## UX / UI considerations

- Signed-out screens: sign-in (form + Google), create account, enter code, forgot
  password, set a new password. They are steps of one signed-out flow, with a way back on
  each.
- Fields carry the right keyboard and autofill hints so password managers offer to save
  and fill: e-mail keyboard, `username`/`email` and `password` / `new-password` content
  types, no autocorrect or auto-capitalisation on the address.
- A show/hide toggle on password fields; the code field is a numeric keyboard with
  one-time-code autofill.
- Errors appear inline under the form; buttons show a busy state while waiting.
- On web, Enter submits the form.

## Observability

- Failed password sign-ins, refused codes and throttled addresses are observable by
  category, with the `userId` when an account is involved; never the address, the
  password or the code.
- Every code sent and every e-mail that fails to send is logged with its purpose; a
  sending failure also reaches error reporting with the provider's status.
- Account linking (password added, Google linked), password resets and changes are
  logged with the `userId`.

## Security / privacy considerations

- Passwords are stored only as a slow, salted hash (scrypt), never logged, never
  returned. Sign-in compares in constant time and spends the same hashing effort on an
  unknown address.
- Codes are stored hashed with a server secret, so a database leak does not reveal them.
- Non-disclosure of accounts holds across responses (status, body) and is kept as close
  as practical in timing: e-mails are sent after the response, not before it.
- A code proves control of the address; it is the only thing that adds a password to an
  existing account or replaces a forgotten one. Linking Google relies on Google's own
  verification of the address.
- Resetting or changing a password revokes every other session.
- The e-mail provider (Brevo, EU) is a new processor: the privacy policy names it, and
  the password hash joins the list of stored data (`docs/specs/legal-pages.md`).
- The provider's API key is server-only configuration.

## Open questions

- Should a Google-only account be able to add a password from the Account page (today
  only through "Forgot password" on the sign-in screen)?
- Google sign-in on the web target.
