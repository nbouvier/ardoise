# Feature: Legal pages

## Context

Before its first public release Ardoise needs the documents French law, the GDPR and
Google Play ask for:

- a **privacy policy** (GDPR articles 13–14), which Google Play also requires as a public
  URL;
- a **legal notice** (*mentions légales*, required by the LCEN, loi n° 2004-575) identifying who publishes
  the service and who hosts it;
- short **terms of use** (*CGU*), setting the rules of use and what Ardoise does not
  promise (it tracks who owes what; it never holds or moves money).

The publisher is, for now, a private individual publishing on a non-professional basis.
They may become a sole trader (*micro-entreprise*) later, so who the publisher is must be
changeable without rewriting the pages.

## User story

As a **user**, I want to read what Ardoise does with my data, who runs it and what the
rules are, so that I can decide to use it knowing what I accept.

As the **publisher**, I want those documents public, accurate and easy to keep current,
so that the app can be published and I stay within the law.

## Expected behavior

### The pages

- Three public pages on the server, readable without the app or an account:
  - **Privacy policy** — `/privacy`;
  - **Terms of use** — `/terms`;
  - **Legal notice** — `/legal`.
- Each exists in **French and English**. French is the authoritative version; the English
  one says so. A page is shown in French when the browser prefers French, in English
  otherwise; `?lang=fr` / `?lang=en` forces one, and each page links to its other
  language.
- The account-deletion page (`/delete-account`, `docs/specs/account-deletion.md`) gets
  the same two languages and the same footer.
- Every page ends with a footer linking the four pages to each other, and shows the date
  of its last update.
- Same plain, self-contained style as the existing public pages: no cookie, no tracker,
  no external resource.

### What the pages say

**Legal notice:**

- Publisher: the publisher's name, as a private individual publishing on a
  non-professional basis, with the contact address. The publisher's name also stands
  as the director of publication.
- The publisher's postal address and phone number are not shown: as the law allows a
  non-professional publisher, they are held by the hosting
  provider instead.
- Hosting provider: its name, address and phone number.
- Source code: public, under the AGPL-3.0 licence.
- A link to the privacy policy.

**Privacy policy:**

- **Controller**: the publisher, reachable at the contact address.
- **What is collected**:
  - the account: name and e-mail address; from the Google account, at each Google
    sign-in: name, e-mail address, profile picture, Google identifier; for a password,
    only a hash of it (`docs/specs/password-sign-in.md`); the 6-digit codes e-mailed to
    confirm an address or set a new password;
  - what users enter: groups and their names, transactions (amounts, dates, titles,
    comments, categories, who paid and who shares), friendships, invitations,
    favorites;
  - names of people added to a group without an account (placeholder members), entered
    by another user;
  - technical data: session credentials, and error reports (device model, operating
    system and app version, what failed, the account's internal identifier — never a
    name, an e-mail or an amount).
  - The IP address is used on the fly to limit abusive traffic and is not kept in the
    server's logs.
  - No advertising, no audience measurement, no tracker, nothing sold.
- **Why, and on which legal basis**:
  - running the service (accounts, groups, balances): performance of the contract, the
    terms of use;
  - security, preventing abuse, diagnosing errors, encrypted backups: legitimate
    interest in a working, secure service;
  - names of people without an account: the legitimate interest of the members to keep
    their group's accounts complete.
- **Who sees what**:
  - members of a group see the name and picture of every other member, and every
    transaction in that group;
  - friends see each other's name and picture. The e-mail address is shown to no other
    user;
  - service providers, each only for its task:
    - a hosting provider in the European Union;
    - encrypted backup storage in the European Union;
    - Sentry, for error reports, with data stored in the European Union;
    - Brevo (Sendinblue SAS, France), which sends the e-mails carrying the codes;
    - Google, for Google sign-in; it also serves profile pictures;
    - Expo, for delivering app updates.
- **Transfers outside the EU**: Google, Expo and Sentry are US companies. Transfers rely
  on the EU–US Data Privacy Framework or the European Commission's standard contractual
  clauses.
- **How long**:
  - the account and its data: until the user deletes the account;
  - what stays after a deletion is what the deletion page lists;
  - backups: up to 12 months;
  - error reports: 30 days;
  - an e-mailed code: 15 minutes, or until used;
  - server logs: until rotated. They hold only internal identifiers.
- **Rights**:
  - access, rectification, erasure, restriction, objection and portability, exercised
    by writing to the contact address. An answer comes within one month;
  - deletion is also available directly in the app;
  - with Google sign-in, name and picture come from Google and follow the Google
    account at the next sign-in; otherwise the name is corrected on request;
  - the right to complain to the CNIL.
- **People added by name**: someone named in a group without an account can ask, at the
  contact address, for their name to be erased. The publisher handles it by hand
  (`docs/OPERATIONS.md`, "Privacy requests").
- **Minimum age**: 15.
- **Security**: encrypted connections, encrypted backups, passwords kept only as
  hashes, access limited to the publisher.
- **On the device**: session credentials in the system's secure storage. In a browser,
  a strictly necessary `HttpOnly` session cookie (no consent needed) and the last
  profile (name, e-mail) in local storage, erased at sign-out; no other cookie.
- **Changes**: the date of the last update is shown. A material change is announced in
  the app.

**Terms of use:**

- Using Ardoise means accepting them; creating an account or signing in says so.
- **Access**: 15 years old or over, with an e-mail address or a Google account. Free.
- **What Ardoise is**: a tool for tracking shared expenses. It holds and moves no money.
  Balances and reimbursement plans are computed only from what members enter, and
  Ardoise does not guarantee they match reality. Settling up happens between the people
  concerned, outside the app.
- **Users' responsibilities**:
  - enter accurate, lawful content;
  - nothing insulting, hateful or unlawful in names, titles or comments;
  - add a person by name only with good reason, knowing others in the group will see it;
  - keep their password to themselves, and sign up only with an address of their own;
  - each user is responsible for what they enter.
- **Shared content**: what is entered in a group is visible to its members, and any
  member can change or remove it.
- **The service**:
  - provided as is, without a guarantee of availability;
  - it may change or stop, with reasonable notice when possible;
  - an account that breaks these terms may be suspended or deleted.
- **Liability**: limited as far as the law allows. Ardoise plays no part in
  disagreements between members.
- **Ending**: the user may delete their account at any time.
- **Changes**: announced in the app; continuing to use Ardoise after a change means
  accepting it.
- **Law**: French law. A consumer keeps the protection of the courts the law gives them.

### In the app

- **Sign-in screen**: under "Continue with Google", a short line: "By continuing, you
  agree to the Terms of use and acknowledge the Privacy policy". Both names are links.
- **Account page**: a **Legal** section under "Your data", with three rows — Privacy
  policy, Terms of use, Legal notice. Each opens the page in the in-app browser, in the
  language the browser prefers.

### Configuration

The publisher's identity, the contact address and the hosting provider come from the
server's configuration, not from the repository:

- publisher's name;
- contact address — the same one the deletion page already uses;
- hosting provider's name, address and phone.

A production server refuses to start without them, so the pages can never go live
incomplete.

## Out of scope

- **Purging inactive accounts.** For now an account is kept until its user deletes it.
  To revisit once the app can send an e-mail warning first.
- **Exporting one's data in the app.** Access and portability go through the contact
  address, answered by the publisher.
- **Explicit acceptance.** No checkbox and no record of which version a user accepted.
  Continuing at sign-in stands as acceptance.
- **Showing the documents again after a change.** A change is announced in the app; there
  is no blocking re-acceptance.
- **Translating the app itself.** It stays in English; only the legal pages are
  bilingual.
- **Sole-trader details.** A *micro-entreprise* would add its SIRET and a consumer
  mediator. Those fields are added when it happens.
- **A cookie banner.** No page sets a cookie or loads a tracker.
- **The Google Play forms.** The Data safety form and the target audience are filled in
  the Play Console from these pages (`docs/MOBILE.md`).

## Edge cases

- **Unknown `lang` value, or no `Accept-Language`**: English.
- **`Accept-Language` listing French after another language**: the first supported
  language in the header's order of preference wins.
- **A configured value containing markup**: escaped like every interpolated value.
- **Offline in the app**: the in-app browser shows its own error. The app is unaffected.

## Acceptance criteria

- [ ] `/privacy`, `/terms` and `/legal` answer `200` with HTML, without authentication.
- [ ] Each page and `/delete-account` is French when `Accept-Language` prefers French or
      `?lang=fr` is given, English otherwise. Each links to its other language, and the
      English versions say the French one prevails.
- [ ] The legal notice shows the configured publisher's name and contact address, and
      the hosting provider's name, address and phone. It never shows the publisher's
      postal address.
- [ ] The privacy policy states:
  - [ ] the controller and the contact address;
  - [ ] each category of data and the legal bases;
  - [ ] who sees what;
  - [ ] the service providers;
  - [ ] the transfers outside the EU;
  - [ ] the retention periods (12 months for backups);
  - [ ] the rights and the CNIL;
  - [ ] the minimum age of 15;
  - [ ] how a person added by name can have it removed.
- [ ] The terms state the minimum age, that Ardoise moves no money and does not guarantee
      balances, and the rules on content.
- [ ] Every page links to the four pages and shows its last-update date.
- [ ] A production server without a publisher name, contact address or hosting-provider
      details fails at startup and names the missing variable.
- [ ] The sign-in screen links to the terms and the privacy policy.
- [ ] The Account page's Legal section opens each of the three pages.
- [ ] No server log line carries the client's IP address.

## Testing considerations

- Language choice is the only logic: cover `?lang`, `Accept-Language` with weights, an
  unsupported language and a missing header.
- Configured values are interpolated into HTML: check that a value with markup is
  escaped.
- The legal text is reviewed by reading it, not by tests. Tests check only that each
  required statement is there: a heading, a configured value, the retention periods.

## Data / API considerations

- `GET /privacy`, `GET /terms` and `GET /legal` are public HTML pages, with the same
  Content-Security-Policy as the other pages. Like `GET /delete-account`, each takes an
  optional `lang` (`fr` | `en`).
- New server configuration:
  - `LEGAL_PUBLISHER_NAME`;
  - `LEGAL_HOST_NAME`, `LEGAL_HOST_ADDRESS` and `LEGAL_HOST_PHONE`;
  - `CONTACT_EMAIL`, which replaces `ACCOUNT_DELETION_CONTACT` as the one contact
    address of every page.
- No data stored, no database change.

## UX / UI considerations

- The pages reuse the deletion page's left-aligned prose layout, with a small footer
  line.
- On the sign-in screen, the line is `small` secondary text under the button, with its
  links underlined. Each link's accessible name is the document's name.
- The Legal rows on the Account page use the same row style as "Delete account", without
  the danger colour.

## Observability

- None beyond existing request logging. The pages are static apart from the
  configuration.

## Security / privacy considerations

- Neither the publisher's identity nor the hosting provider's details are written in the
  repository, which is public. They live only in the deployment's configuration.
- Configured values are escaped before being written into the pages.
- The pages set no cookie and load nothing external. The Content-Security-Policy allows
  only their own inline style.
- Server request logs no longer record the client's address or port. Rate limiting still
  uses the address, in memory only.
- The publisher must, outside the code:
  - make sure the hosting provider holds their identity (the condition for not
    publishing their address);
  - turn off IP address storage in both Sentry projects.

## Open questions

- None.
