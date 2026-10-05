# Mobile client workflow

Living document for how `apps/mobile` is built and run. Update it when the workflow changes.

## Runtime model: development build, not Expo Go

`apps/mobile` runs as a **development build** (a custom native app that embeds
`expo-dev-client`), **not** the Expo Go sandbox.

Reasons:

- Google sign-in uses a native SDK (`@react-native-google-signin/google-signin`) that
  Expo Go does not include.
- The app's own native configuration (config plugins, `expo-updates`, the app id) only
  applies to a build of its own.

Scanning the QR code with Expo Go therefore fails ("Something went wrong"). Use a
development build, or the web target.

## Targets

| Target            | Command (repo root)     | Notes                                        |
| ----------------- | ----------------------- | -------------------------------------------- |
| Web               | `npm run mobile:web`    | Runs in any browser, no native build needed. |
| Android dev build | `npm run mobile:android`| Builds + installs the native app, then serves. |
| iOS dev build     | `npm run mobile:ios`    | macOS + Xcode only.                          |
| Dev server        | `npm run mobile`        | `expo start --dev-client --tunnel`; use once a dev build is installed. |

`npm run mobile:*` map to `expo run:*` / `expo start --web` inside the workspace.

### Connecting the device to Metro and the API

`npm run mobile` uses `--tunnel` (Metro via Expo's relay) so the JS bundle reaches the
device even when the local network blocks it (Windows Firewall, AP isolation). It needs
`@expo/ngrok` (installed) and internet. Drop `--tunnel` when plain LAN works — it is
faster.

The **API is not tunnelled** — the app calls `EXPO_PUBLIC_API_BASE_URL` directly. For a
USB device or emulator, keep `http://localhost:3000` in `apps/mobile/.env` and forward the
port over the cable (re-run after each reconnect):

```bash
adb reverse tcp:3000 tcp:3000
```

For a Wi-Fi device on the same network as the computer, use the computer's LAN IP instead
(`http://192.168.x.x:3000`). `EXPO_PUBLIC_*` is baked into the bundle, so restart
`npm run mobile` after changing `.env`.

## First run (local native build)

Prerequisites:

- **Android**: Android Studio + SDK, `ANDROID_HOME` set, an emulator or a USB device
  with USB debugging.
- **A JDK 17–23 (21 recommended)**, for example Eclipse Temurin 21. JDK 24+ breaks the
  native build (the prefab tool prints a warning on stderr that Gradle treats as a
  failure). It need not be the default JDK: `npm run mobile:android` runs
  `apps/mobile/scripts/android.js`, which uses `JAVA_HOME` if it is already 17–23, else
  looks for an installed JDK in the usual folders (preferring 21) and sets `JAVA_HOME` and
  `PATH` for that one build only, leaving the machine's default JDK alone.
- **iOS**: macOS, Xcode, CocoaPods.

```bash
npm install
npm run mobile:android    # or: npm run mobile:ios
```

`expo run:*` generates the native project on the fly (Continuous Native Generation).
The `android/` and `ios/` folders are generated and git-ignored; never edit them by
hand. Change native config through `app.json` / config plugins, then re-run, or
`npm run prebuild --workspace @ardoise/mobile` to regenerate.

After the dev build is installed, iterate with just `npm run mobile` (JS reloads live;
rebuild only when native dependencies or config change).

## Native dependencies

Some dependencies contain native code, linked into the dev build when it is built:
`@expo/ui` (native SwiftUI / Jetpack Compose views — the transaction date field,
`src/features/transactions/date-picker-field.tsx`), `react-native-svg` (the statistics
donut, `src/features/statistics/donut-chart.tsx`), `expo-updates`, the Google sign-in SDK…

**After adding or upgrading one**, an installed dev build does not have it and the screen
that uses it fails at runtime. Regenerate and reinstall:

```bash
npm run prebuild --workspace @ardoise/mobile
npm run mobile:android   # or: npm run mobile:ios
```

A fresh `expo run:*` does this automatically. Neither `@expo/ui` nor `react-native-svg`
has a config plugin (autolinking only), and the web target needs no rebuild:
`react-native-svg` renders real SVG there.

## App icon and splash

Both are **generated from `src/components/brand-mark.tsx`**, the SVG mark drawn from the
design tokens (`docs/DESIGN.md`): `assets/images/icon.png`, `splash-icon.png`,
`favicon.png` and the three `android-icon-*.png` adaptive layers are flat exports of it.
If the mark changes, regenerate them rather than editing the PNGs.

`app.json` carries the splash and adaptive-icon background colours, so they are **native
config**: after changing the mark, the icons or those colours, an existing dev build keeps
showing the old ones until it is regenerated.

```bash
npm run prebuild --workspace @ardoise/mobile
npm run mobile:android   # or: npm run mobile:ios
```

iOS uses the same `icon.png` as every other platform.

## Builds and updates (EAS)

Releases are built on **EAS** (Expo's cloud build service), not on a developer's machine, so
a build is reproducible and signed with a key that is not on anyone's laptop. Day-to-day
development stays on local development builds (above). Scope for now: **Android only**; no
iOS profile until an Apple developer account exists.

### Profiles (`apps/mobile/eas.json`)

| Profile | Artifact | Talks to | EAS environment | Update channel | Use |
| --- | --- | --- | --- | --- | --- |
| `development` | APK, dev client | whatever the dev server says | `development` | — | An EAS-built dev client (rarely needed: local builds are faster). |
| `staging` | APK, **Ardoise (staging)** | the staging API | `preview` | `staging` | Install on a phone to try what staging runs, next to the production app. |
| `production` | AAB (app bundle) | the production API | `production` | `production` | Upload to the Play Store. |
| `production-apk` | APK | the production API | `production` | `production` | Direct download from a website. |

The API URL is **not** in `eas.json` (it differs per environment and is baked into the
bundle at build time): each profile takes it from the variables of its **EAS
environment** — `preview` for staging, `production` for the other two. The same goes for
the Google client IDs. Nothing in these is secret.

The `staging` profile builds a **separate app**: `APP_VARIANT=staging` (in `eas.json`) gives
it the id `app.nbouvier.ardoise.staging` and the name "Ardoise (staging)", so it installs
next to the production app instead of replacing it, and nobody mistakes one for the other.
It is never uploaded to a store. The Mobile release workflow sets the same variable when it
publishes a staging update; a staging update published by hand needs it too.

Version numbers: `version` in `app.json` is the user-visible one, bumped by hand;
`versionCode` (what the Play Store orders by) is kept by EAS (`appVersionSource: remote`)
and incremented automatically by `production*` builds.

### Build, or update?

An **update** (EAS Update, "OTA") replaces the app's JavaScript and assets on devices that
already have a compatible binary, within minutes and without store review. It cannot change
native code.

- **Build** (new binary) whenever anything native changed: a dependency with native code
  added/upgraded (the Expo SDK, `react-native-*`, `expo-*`), a config plugin, any native
  field in `app.json` (permissions, icon, splash, scheme, application id).
- **Update** for everything else: screens, logic, copy, styles.

`runtimeVersion` is the `appVersion` policy: an update is delivered only to binaries built
with the **same `version`** in `app.json`. **Bump `version` in the commit that makes a
native change.** Forgetting that is the one way this goes wrong: the update would reach an
old binary that lacks the native module and crash it. (The `fingerprint` policy computes
this automatically from the native inputs; it is the upgrade path if that rule proves too
easy to forget.) An update to the `staging` channel never reaches a `production` build.

### Releasing

Actions tab → **Mobile release** (`.github/workflows/mobile-release.yml`), choosing the
action (`build` / `update`) and the profile. It is manual on purpose: builds count against
the EAS plan's monthly quota, and an update reaches users immediately. A `production*`
profile waits for the reviewer of the `production` GitHub environment. `build` queues the
build on EAS and returns; the artifact is downloaded from the build page on expo.dev.

Locally (installed once with `npm i -g eas-cli`, then `eas login`):

```bash
cd apps/mobile
eas build --platform android --profile staging
APP_VARIANT=staging eas update --branch staging --environment preview --message "Fix the split rounding"
```

### One-time setup (needs accounts: not automated)

In this order: each step needs the previous ones. Nothing here publishes anything; a store
release is a separate, manual process (see "Distribution notes").

1. **Expo account** on expo.dev, then on the developer's machine `npm i -g eas-cli` and
   `eas login`.
2. **The EAS project**: `cd apps/mobile && eas init`. It creates the project on expo.dev and
   writes `extra.eas.projectId` (and `owner`) into `app.json` — **commit that**.
   `app.config.ts` derives the update URL (`https://u.expo.dev/<projectId>`) from it. One
   project serves both apps.
3. **EAS environment variables**, in each of the `preview` (staging) and `production`
   environments, all with visibility *plaintext* except the Sentry token:
   ```bash
   eas env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://api.example.com --visibility plaintext
   ```
   - `EXPO_PUBLIC_API_BASE_URL`: that environment's API (`PUBLIC_BASE_URL` of the server);
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`: the **web** client id, the one the server lists
     in `GOOGLE_CLIENT_IDS` (an ID token's audience is the web client, whatever the app);
   - `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` (*secret*): see
     "Error reporting (Sentry)". Without the token a release build fails.

   The iOS client id only when iOS exists. A local `apps/mobile/.env` is **not** uploaded to
   EAS.
4. **A robot token** for the workflow: expo.dev → Account settings → Access tokens → create
   one, stored as the repository secret `EXPO_TOKEN` (GitHub → Settings → Secrets and
   variables → Actions). Check the Sentry secret and variables the workflow reads are there
   too (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_MOBILE`).
5. **The signing keystores**, one per app: run the first `staging` build and the first
   `production` build **from the machine**, in `apps/mobile` (`eas build --platform android
   --profile staging`, then `--profile production-apk`; from the repository root, `eas`
   finds no `eas.json` and generates a default one instead), and accept when EAS offers to generate the
   keystore (the workflow runs non-interactively and cannot answer). EAS keeps them. Each is
   the app's identity for ever — **a lost keystore means users cannot update** — so back
   both up: `eas credentials` → Android → the app id → Keystore → download, and store them
   (with their passwords) somewhere private and offline.
6. **Google sign-in**: in Google Cloud → Credentials, one OAuth **Android** client per
   (package name, signing SHA-1) pair. The SHA-1 of an EAS keystore is shown by `eas
   credentials`; the debug one by `cd android && ./gradlew signingReport`.
   - `app.nbouvier.ardoise` + the debug keystore's SHA-1 (local development builds);
   - `app.nbouvier.ardoise` + the production keystore's SHA-1;
   - `app.nbouvier.ardoise.staging` + the staging keystore's SHA-1;
   - later, `app.nbouvier.ardoise` + the Play App Signing key's SHA-1 (Play Console → App
     integrity): Google re-signs what the Play Store distributes.

   A missing pair makes sign-in fail on that build only, the others still working. The app
   never uses these client ids: they only need to exist. The server's `GOOGLE_CLIENT_IDS`
   does not change.
7. **The OAuth consent screen** (Google Cloud → Google Auth Platform): app name Ardoise, the
   home page, privacy policy (`/privacy`) and terms (`/terms`) links, and **publishing
   status "In production"**: while it is "Testing", only the listed test users can sign in.
   The app asks only for the basic scopes (e-mail, profile), which need no Google review.
8. **Try it**: Actions → Mobile release → `build` / `staging`, install the APK from the
   build's page on expo.dev, sign in. Then an `update` / `staging` with a visible change, to
   see it arrive after an app restart.

### Distribution notes

- **Play Store**: one-time registration fee (US$25). A *personal* developer account created
  after November 2023 must first run a closed test with at least 12 testers opted in for 14
  days before it can apply for production access — plan two weeks. The `production`
  profile's AAB is what gets uploaded; `eas submit --platform android --profile production`
  can do it once a Google service-account key is configured (not set up). `submit` targets
  the `internal` track, so nothing goes public by accident.
- **APK from a website**: no store fee, but users must allow installing from unknown
  sources, and Google is rolling out developer verification that also covers apps
  installed outside the Play Store (mandatory from September 2026 in a first group of
  countries, worldwide from 2027). Keep the signing key forever: an APK signed with another
  key cannot update the installed one. An APK and a Play Store build are signed by different
  keys, so a user cannot move from one to the other without reinstalling.
- **iOS**: needs the Apple Developer Program (US$99/year) even for TestFlight; deliberately
  out of scope for now.

### Play Console: policy pages and Data safety

From the legal pages (`docs/specs/legal-pages.md`); keep both in step when either changes.

- **Privacy policy URL**: `<PUBLIC_BASE_URL>/privacy`. **Account deletion URL**:
  `<PUBLIC_BASE_URL>/delete-account`.
- **Target audience**: 15 and over (the terms' minimum age), so not the Families program.
- **Ads**: none. **App access**: everything is behind Google sign-in; give the reviewers a
  test Google account.
- **Data safety**:
  - collected:
    - **name, e-mail address, user ids** (account management, app functionality);
    - **photos** (the Google profile picture's address);
    - **other user-generated content** — groups, transactions, names typed in (app
      functionality);
    - **crash logs and diagnostics** (Sentry: analytics of crashes only);
  - **shared**: none in Google's sense. Service providers acting for the app (hosting,
    Sentry, Expo) are not "sharing";
  - **encrypted in transit**: yes;
  - **deletion**: users can request it, in the app and from the deletion URL;
  - no location, contacts, financial information (amounts entered by users are content,
    not payment data), device or other ids beyond Sentry's report.

## Error reporting (Sentry)

Release builds report crashes and unexpected errors to **Sentry** (sentry.io, EU data
region), project `ardoise-mobile`. What gets reported, what never does, and how the logger
feeds it: `docs/LOGGING.md`, "Error reporting". This section is the build side.

**On or off.** The app reports only when its build carries a DSN (`SENTRY_DSN`, passed
through `extra.sentryDsn`). It is set in the `preview` and `production` EAS environments
and nowhere else: local development builds, the web target and tests report nothing. The
Sentry **environment** of a report is the build's update channel — `staging` or
`production` — and `development` for a build without one.

**Readable stack traces.** A release bundle is minified and compiled to Hermes bytecode; a
report is only readable once Sentry has the matching source map.

- `metro.config.js` is built on `getSentryExpoConfig`, which stamps a *debug id* into
  every bundle and its map: Sentry pairs them by that id, whatever the release name.
- **Builds**: the `@sentry/react-native/expo` config plugin (`app.config.ts`) adds a step
  to the Android release build that uploads the maps (and native symbols). It runs on EAS,
  with the EAS environment's `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN`. Debug
  builds (local development) skip it. A release build without the token **fails** — set
  `SENTRY_DISABLE_AUTO_UPLOAD=true` in the environment to build without maps on purpose.
- **Updates**: `eas update` bundles on the GitHub runner, so the **Mobile release**
  workflow uploads the maps itself right after publishing (`npx
  sentry-expo-upload-sourcemaps dist`), with the repository secret `SENTRY_AUTH_TOKEN` and
  the variables `SENTRY_ORG` / `SENTRY_PROJECT_MOBILE`. It checks they exist **before**
  publishing. An update published by hand from a laptop needs the same three variables
  and the same command afterwards.

**Variables.**

| Name | Where | Secret | Purpose |
| --- | --- | --- | --- |
| `SENTRY_DSN` | EAS env `preview` + `production` | no (plaintext) | Turns reporting on; the project's client key. |
| `SENTRY_ORG` | EAS env `preview` + `production`; GitHub variable | no | Organization slug, for the upload. |
| `SENTRY_PROJECT` | EAS env `preview` + `production` | no | `ardoise-mobile`. |
| `SENTRY_PROJECT_MOBILE` | GitHub variable | no | Same value, for the workflow (the server has its own project). |
| `SENTRY_AUTH_TOKEN` | EAS env `preview` + `production` (visibility *secret*); GitHub secret | **yes** | Organization auth token, scope limited to uploads. |
| `SENTRY_URL` | optional, both | no | Only if an upload ever fails on the region: `https://de.sentry.io/`. |

**Native module.** `@sentry/react-native` has native code: adding or upgrading it needs a
new build (and a `version` bump once builds are in users' hands, see "Build, or update?").
After pulling it, rebuild the local development build (`npm run mobile:android`).

## Environment

Configuration is layered onto `app.json` by `app.config.ts`, driven by `EXPO_PUBLIC_*`
variables (bundled into the client; none are secret). Copy `.env.example` to `.env`:

| Variable                          | Purpose                                              |
| --------------------------------- | --------------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`        | Ardoise API base URL (default `http://localhost:3000`). |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`| Google OAuth **web** client ID — the native SDK needs it to return an ID token. |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`| Google OAuth **iOS** client ID — also drives the reversed iOS URL scheme. |
| `APP_ID`                          | Overrides the application id of `app.json` (not `EXPO_PUBLIC_`: read at build time only). Optional, unset for Ardoise itself — for a fork publishing its own build. See "Application id". |
| `APP_VARIANT`                     | `staging` builds "Ardoise (staging)" under its own id (build time only). Set by the `staging` EAS profile and the staging updates; leave unset locally. |
| `SENTRY_DSN`                      | Turns error reporting on (not `EXPO_PUBLIC_`: it reaches the app through `extra`). Leave unset locally. See "Error reporting (Sentry)", which also lists the build-time `SENTRY_*` variables. |

### Application id

The id is **`app.nbouvier.ardoise`** (`android.package` in `app.json`; reversed from a domain
the maintainer owns, so no one else can hold it), applied by `app.config.ts` to both the
Android `package` and the iOS `bundleIdentifier`. It is **permanent once the app is
published** — on the Play Store it can never change. `APP_ID` overrides it.
`APP_VARIANT=staging` appends `.staging` (and " (staging)" to the name); any other value
fails the config, rather than silently building the production app.

- It must look like `com.example.app` (dot-separated, each part starting with a letter,
  letters/digits/underscores only); anything else fails the config with a message.
- An EAS build whose profile name starts with `production` **fails** if the id is the Expo
  template's `com.anonymous…` placeholder: a guard against shipping under an id that cannot
  be kept.
- The Google OAuth **Android** client is matched by this id + the signing SHA-1 (see
  "Google sign-in"). Changing the id means a new client and regenerated native projects
  (`npm run prebuild --workspace @ardoise/mobile`); an installed build under the old id is
  a different app, side by side with the new one.
- The tests are in `src/lib/app-config.test.ts`. They live under `src/` deliberately:
  next to `app.config.ts`, `@jest/globals` becomes the first file `tsc` sees and flips which
  global `fetch` typing wins, breaking the typecheck of every test that mocks `fetch`.

Read at runtime via `Constants.expoConfig.extra` (`src/lib/api/config.ts`,
`src/features/auth/google.ts`, `src/lib/error-reporting.ts`).

## Deep links

The app registers the `ardoise` URL scheme (`scheme` in `app.json`; the server's landing
page and `pending-invite.ts` repeat it and must match). Invitations use it: the link a user
shares points at the API (`/i/<code>`), and that page tries to open
`ardoise://invite/<code>`.

The code is captured by `InviteLinkHandler`, which sits **above** the auth gate — someone
following a link may not have an account yet — and parked in `pendingInvite` until a
session exists.

Testing a deep link without the web page:

```bash
npx uri-scheme open ardoise://invite/<code> --android
```

(`--ios` on macOS.) The landing-page URL form is recognised too, so
`https://<host>/i/<code>` works once App Links / Universal Links are configured.

Universal Links / App Links (real `https://` links opening the app natively) need a domain,
`apple-app-site-association` + `assetlinks.json`, and a store presence. Not set up yet: the
landing page shows the code for manual entry in the meantime, since there is no deferred
deep linking.

For local testing, `PUBLIC_BASE_URL` on the server must be an address the device can reach
— with a USB device, keep `http://localhost:3000` and run `adb reverse tcp:3000 tcp:3000`.
In production it is required and must not be a local address (`docs/DEPLOYMENT.md`).

## Google sign-in

- Uses `@react-native-google-signin/google-signin` (native SDK) — a development build is
  required; it does not run in Expo Go. The web target shows the sign-in screen with the
  action disabled.
- Config plugins (`expo-secure-store`, `@react-native-google-signin/google-signin`) are in
  `app.json`; `app.config.ts` adds the iOS URL scheme from the iOS client ID.
- After changing the Google config or client IDs, regenerate native code:
  `npm run prebuild --workspace @ardoise/mobile`, then rebuild (`npm run
  mobile:android` / `mobile:ios`).
- **Android**: an OAuth Android client is matched by package name + signing certificate
  SHA-1, so each kind of build needs its own (list in "One-time setup", step 6). For a local
  debug build: `app.nbouvier.ardoise` + the debug keystore SHA-1 (`cd android && ./gradlew
  signingReport`), or sign-in fails silently.
- Google Cloud setup (OAuth consent screen + Web/iOS/Android client IDs) is a manual
  prerequisite — see `docs/specs/authentication.md`.
