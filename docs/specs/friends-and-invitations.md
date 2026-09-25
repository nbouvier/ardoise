# Feature: Friends and invitation links

## Context

SplitCount knows who a person is (Google sign-in) but nothing about the relationships
between people. Every planned feature — shared counts, expenses, balances — needs to pick
participants, and asking for an email address every time is friction that Tricount already
gets wrong.

This feature introduces a **friend list**, built through **invitation links**. A user
generates a link, shares it through whatever they already use (copy/paste, SMS, mail,
WhatsApp, any social app via the OS share sheet), and the person who opens it lands in
SplitCount, signs in with Google if they do not have an account yet, and the two become
friends.

Friendship is the prerequisite; the group/expense features that consume it come later.

## User story

As a **SplitCount user**, I want to **invite someone to become my friend by sending them a
link**, so that **I can add them to a shared count later without knowing or typing their
account details**.

As a **person receiving such a link**, I want to **open it and end up connected to the
sender in a few taps, even if I have never used SplitCount**, so that **joining is not a
chore**.

## Expected behavior

### Inviting

- A signed-in user has a **Friends** area listing the people they are connected to, and an
  **Invite a friend** action.
- The invite action shows a **shareable link** with two ways to send it: **copy** it, or
  open the **OS share sheet** (SMS, mail, WhatsApp, and whatever else the device offers).
- The user has **one active link at a time**. Reopening the invite screen shows the same
  link rather than accumulating links.
- The link is **reusable within its validity window**: several people may accept the same
  link. This matches how it is actually shared (a group conversation, a message forwarded).
- The link **expires after ~7 days**. The screen states when it expires.
- The user can **generate a new link**, which immediately invalidates the previous one.
  Since that cannot be undone, it first asks for confirmation, warning that the previous
  link stops working. Share, copy and generate are icon actions on the link card's title
  line. Tapping the link itself copies it, with a "Copied" tooltip that disappears after about two seconds.

### Receiving

Opening the link:

1. **The app is installed** — the link opens SplitCount directly.
2. **The app is not installed** — a web page explains what SplitCount is, offers the app
   stores when they exist, and shows the **invitation code** so the person can enter it
   manually in the app after installing it.

Once in the app:

3. If the person is **not signed in**, they see the normal Google sign-in screen. The
   invitation is **remembered across sign-in**, including when an account is created on the
   spot.
4. Signed in, they see a **confirmation screen**: the inviter's name and avatar, and
   **Accept** / **Not now**. Accepting connects both people; declining dismisses the
   invitation without connecting anyone.
5. Both users then see each other in their Friends list. **Friendship is symmetric** — there
   is no "pending request" state and no separate approval on the inviter's side, because
   the inviter already consented by sending the link.

The **implicit pair group** the two now share (`docs/specs/groups.md`) is created in this
same step, not the first time either of them opens it — by the time a friend shows up in
either Friends list, the group behind their row already exists.

### Managing

- A user can **remove a friend**, after a confirmation. Removal is symmetric: the
  relationship disappears for both.
- Removal is **destructive**: the group the two shared goes with the friendship, along
  with everything in it. The confirmation says so (`docs/specs/groups.md`).
- A removed friend may be re-added later with a new (or the same still-valid) link — but
  the shared group starts empty again.
- Tapping a friend opens the group shared with them directly, by its already-known id
  (`docs/specs/groups.md`) — no request needed first to find or create it.
- A friend's row carries the same **favorite star** any group does, right of the name
  (`docs/specs/favorites.md`): it toggles that friend's own pair group, and favorited
  friends are pinned above the rest, alphabetical within that.

## Out of scope

- Universal Links / App Links (real `https://` links that open the app natively). Requires a
  domain and a store presence; the custom scheme plus a web landing page covers the current
  need and the switch is additive.
- **Deferred deep linking** (automatically resuming the invitation after installing from a
  store). The manual code fallback stands in for it until the app ships to stores.
- Finding friends by email, phone number, or from the device address book.
- Friend requests, pending states, or an inviter-side approval step.
- Blocking, reporting, or muting a user.
- Notifications (push or in-app) when someone accepts an invitation.
- ~~Any use of the friend list by other features~~ — superseded: groups consume it
  (`docs/specs/groups.md`).
- Web (`mobile:web`) support beyond what already works: sign-in is disabled there, so
  invitations cannot be accepted on web.

## Edge cases

- **Opening one's own link**: rejected with a clear message; a user cannot befriend
  themselves.
- **Accepting a link twice** (or two people racing on the same link): the friendship is
  created once; the second attempt reports "already friends" instead of failing.
- **Already friends**: accepting again is a no-op with a friendly message.
- **Expired link**: the confirmation screen explains the link is no longer valid and
  suggests asking for a new one. The landing page says the same.
- **Revoked link** (the inviter generated a new one): treated exactly like an expired link.
- **Unknown / mistyped code**: same treatment as an expired link — never a crash, never a
  hint about whether the code ever existed.
- **Link opened while signed out**: the invitation survives the sign-in and the confirmation
  screen appears immediately after.
- **Link opened while the app is already running**: handled the same way as a cold start.
- **The inviter deleted their account** (not possible yet, but the data model must not
  break): their invites and friendships disappear with them.
- **Network failure** while loading the invitation preview or accepting: an explicit,
  retryable error; nothing is half-created.
- **Sharing cancelled** by the user in the OS share sheet: no error, no state change.
- **Clipboard unavailable**: the link stays visible and selectable on screen.

## Acceptance criteria

- [ ] A signed-in user can open the Friends area and see an empty state with an "Invite a
      friend" action.
- [ ] The invite screen shows a link; reopening it shows **the same** link.
- [ ] Copying puts the link in the clipboard; sharing opens the OS share sheet with the link.
- [ ] Generating a new link invalidates the previous one: the old link is refused.
- [ ] Opening a valid link on a device with the app installed opens SplitCount on the
      confirmation screen showing the inviter's name.
- [ ] Opening a valid link while signed out shows the sign-in screen, and the confirmation
      screen appears right after a successful sign-in (including for a brand-new account).
- [ ] Accepting connects both users: each appears in the other's Friends list.
- [ ] Accepting the same link a second time does not create a duplicate relationship and
      reports that they are already friends.
- [ ] Two different people can accept the same still-valid link.
- [ ] Opening one's own link is refused with an explicit message and creates nothing.
- [ ] An expired, revoked or unknown code shows a "link no longer valid" state, in the app
      and on the web landing page.
- [ ] Accepting an invitation without being authenticated is refused by the server (401).
- [ ] Opening the link without the app shows a web page containing the invitation code that
      can be entered manually in the app to reach the same confirmation screen.
- [ ] Removing a friend removes the relationship for both users.
- [ ] The public invitation preview never exposes the inviter's email address.
- [ ] The implicit pair group exists as soon as the friendship does, on both sides, without
      either of them opening it first.
- [ ] A friend's row carries a favorite star, toggling their pair group the same way any
      other group's star does; favorited friends are listed above the rest.

## Testing considerations

- The **symmetry** of the friendship and the **absence of duplicates** under concurrent
  acceptance are the core correctness risks — cover them explicitly server-side.
- The inviter's display name comes from Google and is rendered in server-generated HTML on
  the landing page: **HTML escaping needs its own test**.
- The "invitation survives sign-in" path is the most fragile part of the client flow and is
  worth testing at the state-holder level rather than only through the UI.
- Expiry must be testable without waiting: the invite service takes an injectable clock, as
  the session service already does.
- Real end-to-end validation needs **two Google accounts** and is manual.

## Data / API considerations

Endpoints (see `docs/API.md` for the authoritative surface):

- `POST /friends/invite` — get-or-create the caller's active invite → `{ invite }`.
- `POST /friends/invite/rotate` — revoke the active invite and issue a new one.
- `DELETE /friends/invite` — revoke the active invite. Idempotent.
- `GET /friends` — the caller's friends, favorited ones first
  (`docs/specs/favorites.md`), each carrying the implicit pair group's own `groupId` and
  `favorite` marker. That group is created inside `POST /invites/:code/accept` below, not
  lazily — see `docs/specs/groups.md`.
- `DELETE /friends/:friendId` — remove a friend. Idempotent.
- No dedicated route opens or creates the pair group: `groupId` from the list above is
  used directly against `GET /groups/:groupId`, and favoriting it goes through the
  ordinary `PUT`/`DELETE /groups/:groupId/favorite`.

Since groups arrived, the routes that *consume* a code are shared with them — one code
space, one landing page, one confirmation screen (`docs/specs/groups.md`):

- `GET /invites/:code` — **unauthenticated** preview. For a friend invitation it returns
  `{ kind: 'friend', inviter }`. `404` unknown, `410` expired or revoked.
- `POST /invites/:code/accept` — authenticated → `{ kind: 'friend', friend, alreadyFriends }`.
  `409` when accepting one's own invite.
- `GET /i/:code` — the public HTML landing page the shared link points to.

Persisted data (see `docs/DATABASE.md`):

- **Invite**: inviter, opaque code, expiry, creation and revocation timestamps.
- **Friendship**: one row per pair, stored in a canonical order so the same relationship
  cannot be recorded twice.

A friendship created before pair-group creation became eager (2026-09-14) may predate its
group; `npm run backfill:pair-groups --workspace @splitcount/server` creates the missing
ones once, idempotently (`docs/DATABASE.md`).

The invitation **code is stored in clear**, unlike refresh tokens. It must be redisplayable
("copy my link again"), and it only grants a narrow, expiring, revocable capability: to
become a friend of one specific user, subject to that user's own acceptance step.

Shapes are shared between client and server through `@splitcount/shared`. The shape returned
for *another* user (`FriendSummary`: id, name, avatar) is deliberately narrower than the
`UserProfile` returned for oneself — it carries no email address.

## UX / UI considerations

- The **Friends** tab replaces the Expo starter "Explore" tab.
- **Friends list**: avatar + name rows, an explicit empty state ("No friends yet — invite
  someone"), the invite action, and an "I have an invitation code" entry for the manual
  fallback.
- **Invite screen**: the link shown in full and selectable, a primary **Share** action and a
  secondary **Copy** action, the expiry date in plain words, and a discreet "Generate a new
  link" that warns the previous one stops working.
- **Confirmation screen**: presented as a full-screen modal over the app so it appears the
  same way whether it came from a link or from a manually entered code. States: loading,
  preview + Accept/Not now, success, already friends, invalid link, own link, network error
  with retry.
- Removing a friend asks for confirmation.
- Light and dark themes via the existing `ThemedText` / `ThemedView` / `Colors` tokens.
- The web landing page is intentionally plain: product name, who is inviting, one "Open in
  SplitCount" button, the code, and store links when they exist.

## Observability

- Invite creation, rotation and acceptance must be observable with the acting user id and,
  for an acceptance, the inviter id.
- Refused acceptances must be diagnosable **by reason** (expired, revoked, unknown, self) —
  a spike in refusals is the signal that links are being shared after rotation.
- Friend removals must be observable.
- The invitation **code must never appear in logs**, in line with `docs/guidelines/LOGGING.md`.
- Client-side failures to load a preview or accept an invitation are logged through the
  mobile logger.

## Security / privacy considerations

- The code is a bearer capability: high-entropy (128 bits) and opaque, so it cannot be
  guessed or enumerated.
- Its blast radius is deliberately small — it can only lead to a friendship with the
  inviter, it expires, it is revocable, and the recipient still has to accept explicitly.
  That is what justifies storing it in clear.
- The **unauthenticated** preview endpoint exposes the inviter's display name and avatar to
  anyone holding the code. This is necessary (the recipient must know who is inviting them)
  and bounded: no email, no friend list, no other personal data.
- Accepting requires authentication; the friendship is created for the **authenticated
  caller**, never for a user id supplied in the request.
- Removing a friend only ever touches a relationship the caller belongs to.
- Codes must not be logged, and the landing page is served with `Cache-Control: no-store`.
- The inviter's name is user-controlled data rendered into HTML — it must be escaped.

## Open questions

- Should the inviter be **notified** when someone accepts? (Needs push notifications, not
  set up yet.)
- Should a user be able to see and revoke **who accepted** a given link?
- Blocking / reporting: needed before any public launch, deliberately deferred.
- Adding friends **by email address** as an alternative to links — useful once the app is in
  stores, and it changes the privacy surface (email lookup).
- Whether a friendship should carry a nickname or alias per user, for people whose Google
  name is unhelpful.
