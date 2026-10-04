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
| `staging` | APK | the staging API | `preview` | `staging` | Install on a phone to try what staging runs. |
| `production` | AAB (app bundle) | the production API | `production` | `production` | Upload to the Play Store. |
| `production-apk` | APK | the production API | `production` | `production` | Direct download from a website. |

The API URL is **not** in `eas.json` (it differs per environment and is baked into the
bundle at build time): each profile takes it from the variables of its **EAS
environment** — `preview` for staging, `production` for the other two. The same goes for
the Google client IDs. Nothing in these is secret.

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
eas update --branch staging --environment preview --message "Fix the split rounding"
```

### One-time setup (needs accounts: not automated)

1. **Expo account** → `cd apps/mobile && eas init`. It creates the project on expo.dev and
   writes `extra.eas.projectId` into `app.json` — **commit that**. `app.config.ts` derives
   the update URL (`https://u.expo.dev/<projectId>`) from it.
2. **EAS environment variables** (once per environment: `preview`, `production`):
   ```bash
   eas env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://api.example.com --visibility plaintext
   eas env:create --environment production --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <id> --visibility plaintext
   ```
   (`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; the iOS client id only
   when iOS exists. The application id comes from `app.json`.) A local `apps/mobile/.env`
   is **not** uploaded to EAS.
3. **A robot token** for the workflow: expo.dev → Account → Access tokens → create one and
   store it as the repository secret `EXPO_TOKEN`.
4. **Signing keystore**: the first Android build offers to generate it and keeps it on EAS.
   It is the app's identity for ever — **a lost keystore means users cannot update**. Back
   it up once: `eas credentials` → Android → Keystore → download, and store it (with its
   passwords) somewhere private and offline.
5. **Google sign-in**: the build's signing certificate SHA-1 (shown by `eas credentials`)
   must be registered on the OAuth **Android** client of Google Cloud, together with the
   final package name. Without it, sign-in fails on any EAS-built app while still working
   on a local debug build. If the app is later published through Play App Signing, Google
   re-signs it with a different key: add that SHA-1 (Play Console → App integrity) too.

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

## Environment

Configuration is layered onto `app.json` by `app.config.ts`, driven by `EXPO_PUBLIC_*`
variables (bundled into the client; none are secret). Copy `.env.example` to `.env`:

| Variable                          | Purpose                                              |
| --------------------------------- | --------------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`        | Ardoise API base URL (default `http://localhost:3000`). |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`| Google OAuth **web** client ID — the native SDK needs it to return an ID token. |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`| Google OAuth **iOS** client ID — also drives the reversed iOS URL scheme. |
| `APP_ID`                          | Overrides the application id of `app.json` (not `EXPO_PUBLIC_`: read at build time only). Optional, unset for Ardoise itself — for a fork publishing its own build. See "Application id". |

### Application id

The id is **`app.ardoise`** (`android.package` in `app.json`), applied by `app.config.ts` to
both the Android `package` and the iOS `bundleIdentifier`. It is **permanent once the app
is published** — on the Play Store it can never change. `APP_ID` overrides it.

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
`src/features/auth/google.ts`).

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
- **Android**: the OAuth Android client is matched by package name (`app.ardoise`) + the
  signing certificate SHA-1. For a debug build, add the
  debug keystore SHA-1 (`cd android && ./gradlew signingReport`) to the Google Cloud
  Android client, or sign-in fails silently.
- Google Cloud setup (OAuth consent screen + Web/iOS/Android client IDs) is a manual
  prerequisite — see `docs/specs/authentication.md`.
