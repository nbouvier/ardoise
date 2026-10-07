# Feature: Authentication (sessions and Google sign-in)

## Context

Ardoise stores all shared data (groups, expenses, balances) on the server, which is
the source of truth. Every future feature needs to know **who** is acting and to scope
data to that person. This feature establishes identity: a user signs in with their
Google account, stays signed in across app launches, and can sign out.

It also owns the **session** every way of signing in ends with, on the phone and in a
browser. Signing in with an e-mail address and a password is its own feature
(`docs/specs/password-sign-in.md`). The server never trusts an identity claim it has not
verified: against Google, or against a password and a code sent to the address.

## User story

As a **person opening Ardoise**, I want to **sign in once with my Google account and
stay signed in**, so that **I can use the app without re-authenticating every time and
without managing another password**.

## Expected behavior

- On launch, while the app determines whether a session exists, a loading/splash state is
  shown (no flash of the sign-in screen).
- If there is no valid session, the app shows a **sign-in screen** with a "Continue with
  Google" action (and the password form, `docs/specs/password-sign-in.md`); nothing else
  of the app is reachable.
- Choosing a Google account and completing Google's consent returns the user to the app,
  now signed in, landing on the app's main screens.
- A signed-in user has an **Account** area showing their Google profile (name, email,
  avatar) with **Switch account** and **Sign out** actions.
- After signing in, fully closing and reopening the app leaves the user **signed in**
  (subject to the session lifetime below) without any Google interaction.
- Signing out returns the user to the sign-in screen and clears the local session. The
  server-side session is revoked so it can no longer be refreshed.
- The access credential used for API calls is short-lived and refreshed transparently;
  the user never sees an "expired session" unless the refresh itself fails.

### Session model (part of the contract)

- Sign-in exchanges a Google ID token for an Ardoise session: a short-lived **access
  token** (~15 minutes) and a longer-lived **refresh token** (~60 days).
- The refresh token is **rotated** on every use: the previous one becomes invalid. Two
  concurrent refreshes with the same token yield at most one new session.
- Sign-out revokes the current refresh token server-side.
- Only a hash of the refresh token is stored server-side.

### Session on the web

A browser page cannot keep a secret from the scripts it runs, so on the web target the
refresh token never reaches JavaScript:

- The web client says it is one on every `/auth/*` call. The server then puts the refresh
  token in an **`HttpOnly`, `Secure`, `SameSite=Strict` cookie** scoped to `/auth`,
  instead of the response body; the access token still comes in the body and stays in
  memory.
- Refresh and sign-out read the token from that cookie; sign-out also clears it.
- A request that relies on the cookie is accepted only from an **allowed origin** (the
  web app's own, from the server's configuration), which stops another site from
  driving it. The API answers CORS for those origins only, with credentials.
- The web app and the API must therefore be served from the same site (for example two
  subdomains of one domain); a cookie from another site would be blocked as third-party.
- On launch the web client asks for a refresh: the cookie, if any, restores the session.
- The native apps are unchanged: the refresh token travels in the body and lives in the
  OS secure store.

## Out of scope

- Google sign-in on the web target (`mobile:web`): the Google action renders there but is
  disabled with a "coming soon" note. Password sign-in works on the web.
- Authentication methods other than Google and e-mail/password (Apple, magic links).
- Profile editing, linking multiple providers. Account deletion is its own feature:
  `docs/specs/account-deletion.md`.
- Authorization rules for domain resources (groups/expenses) — there are no protected
  domain routes yet; this feature only ships the mechanism (`authenticate` guard) for
  later use.
- Multi-device session management UI (listing / revoking other sessions).
- Offline sign-in or offline use of the app.

## Edge cases

- **User cancels the Google dialog**: return to the sign-in screen silently, no error
  message.
- **Google verification fails** (invalid/expired ID token, wrong audience): sign-in fails
  with a generic "Could not sign you in" message; no session is created.
- **Server unreachable during sign-in**: sign-in fails with a retryable error message; no
  crash.
- **Server unreachable on launch with a stored session**: the app stays on a loading /
  error state that allows retry; it does not silently sign the user out on a network
  error (only on an authoritative rejection).
- **Stored refresh token is expired or revoked**: on launch the refresh attempt is
  rejected; the app moves to the signed-out state and shows the sign-in screen.
- **Access token expires mid-session**: the next API call transparently refreshes and
  retries once; the user notices nothing.
- **Refresh token reuse** (an already-rotated or revoked token is presented again): the
  request is rejected as unauthorized, **every session of the user is revoked** (the
  legitimate device and the thief both have to sign in again, since which is which cannot
  be known) and the event is logged as a possible token theft signal.
- **Concurrent API calls hit 401 together**: only one refresh is performed; the others
  wait for its result.
- **Returning user** (same Google account signs in again): the existing user record is
  reused; no duplicate account is created.
- **Sign-out while offline**: the local session is cleared immediately; the server
  revocation is best-effort and the user still ends up signed out locally.

## Acceptance criteria

- [ ] Launching the app with no session shows the sign-in screen after the loading state,
      with the rest of the app unreachable.
- [ ] Completing Google sign-in with a valid account leaves the user signed in and on the
      app's main screens.
- [ ] Cancelling the Google dialog returns to the sign-in screen with no error shown.
- [ ] A sign-in attempt with an ID token the server cannot verify shows a generic failure
      and creates no session (server responds 401).
- [ ] The Account area shows the signed-in user's Google name, email and avatar in a
      Profile row, and the Account tab's icon is that avatar.
- [ ] Tapping the Profile row offers "Switch account" and "Sign out"; "Switch account"
      signs out and opens the Google chooser, and dismissing the chooser shows no error.
- [ ] After a successful sign-in, killing and relaunching the app leaves the user signed
      in without any Google interaction.
- [ ] Signing out returns to the sign-in screen; the just-revoked refresh token can no
      longer be used to refresh (server responds 401).
- [ ] Signing in again with the same Google account does not create a second user record.
- [ ] When the access token is expired, an API call to a protected endpoint still
      succeeds via a single transparent refresh.
- [ ] Presenting an already-rotated refresh token is rejected (server responds 401) and
      revokes every other session of that user.
- [ ] On the web target, the sign-in screen renders and the Google action is disabled
      with a "coming soon" indication (no crash).
- [ ] On the web target, signing in sets the refresh token in an `HttpOnly` cookie and
      never in a response body; reloading the page keeps the user signed in; signing out
      clears the cookie and revokes the session.
- [ ] A refresh or sign-out relying on the cookie from an origin that is not allowed is
      refused (403), and the API sends no CORS headers to such an origin.

## Testing considerations

- Google token verification must be mocked at the `google-auth-library` boundary; tests
  never contact Google.
- Server integration tests drive the built Fastify instance (`app.inject`) against an
  ephemeral Postgres (PGlite), covering the four endpoints and their failure modes.
- Refresh-token rotation, expiry and reuse-rejection are security-sensitive and must have
  explicit tests.
- Client tests must cover the launch state machine (loading → signed in / signed out),
  single-flight refresh on 401, and secure-store persistence (store mocked).
- End-to-end (real Google, real device) is manual for this feature.

## Data / API considerations

New endpoints (see `docs/API.md` for the authoritative surface):

- `POST /auth/google` — body `{ idToken }` → `{ accessToken, refreshToken,
  accessTokenExpiresAt, user }`. Verifies the Google ID token, upserts the user, issues a
  session. `401` if verification fails.
- `POST /auth/refresh` — body `{ refreshToken }` → new session pair (rotation). `401` if
  the token is unknown, expired, revoked or already rotated; a revoked or rotated one also
  revokes every session of its user.
- `POST /auth/logout` — body `{ refreshToken }` → `204`. Idempotent. Revokes the session.
- `GET /auth/me` — `Authorization: Bearer <accessToken>` → `{ user }`. `401` if missing
  or invalid.

Persisted data (see `docs/DATABASE.md`):

- **User**: Google subject id (unique), email, name, avatar URL, timestamps.
- **Session**: owning user, refresh-token hash (unique), expiry, created / last-used /
  revoked timestamps.

Request/response shapes are shared between client and server via `@ardoise/shared`.

Client persistence: the refresh token is stored in the OS secure store
(`expo-secure-store`); the access token is kept in memory only.

## UX / UI considerations

- **Loading state** on launch: reuse the existing splash/animated icon; no flash of the
  sign-in screen.
- **Sign-in screen**: full-screen, centered, product name/logo + one primary "Continue
  with Google" button; error text appears inline below the button on failure (not for
  user cancellation).
- **Account tab**: a bottom tab whose icon is the signed-in user's Google avatar (their
  initial when there is no picture), so the active account is visible from anywhere. Its
  page has a **Profile** section: one row — avatar, name, email beneath — with no card
  around it. Tapping the row opens a menu with **Switch account** (signs out, then opens
  the Google account chooser straight away; dismissing it leaves the user on the sign-in
  screen — for an account with a password, it stops at the sign-in screen) and **Sign
  out**.
- Light and dark themes via existing `ThemedText` / `ThemedView` / `Colors`.
- Web: the Google button is visibly disabled with a short "Google sign-in on the web is
  coming soon" caption; the password form above it works.

## Observability

- Google verification failures must be diagnosable by category (expired, bad audience,
  malformed) without logging the token itself.
- Session issuance, refresh, rotation-reuse detection and revocation must be observable
  server-side with the acting `userId` (never tokens).
- Repeated refresh failures on the client (leading to forced sign-out) must be logged via
  the client logger.
- Event names follow `docs/guidelines/LOGGING.md` (e.g. `auth.google.verify.failed`,
  `auth.session.issued`, `auth.session.refresh.reused`, `auth.session.revoked`).

## Security / privacy considerations

- The server verifies the Google ID token signature and audience on every sign-in; a
  client-supplied identity is never trusted otherwise.
- Access tokens are short-lived JWTs; refresh tokens are opaque, random, stored only as
  hashes, rotated on use and revocable.
- `AUTH_JWT_SECRET` and any Google client secret are server-only environment values,
  never shipped to the client. Google **client IDs** are not secret and may live in the
  mobile config.
- Sign-out must revoke server-side, not only clear local state.
- Only the minimum Google profile fields are requested and stored (id, email, name,
  avatar).
- Tokens must never appear in logs, URLs or query strings.
- On the web, the refresh token lives only in its `HttpOnly` cookie, out of reach of the
  page's scripts; cookie-based requests are checked against the allowed origins.
- Authorization for domain resources is always enforced server-side (future work); the
  mobile app is never the only gate.

## Open questions

- Exact access/refresh token lifetimes (currently ~15 min / ~60 days) — tune before a
  public release.
- Whether to surface a "session expired, please sign in again" toast when a launch
  refresh is authoritatively rejected, versus silently showing the sign-in screen
  (currently: silent).
- Android release signing (Play App Signing SHA-1) — only matters when a release build is
  produced; debug keystore SHA-1 is enough for development.
