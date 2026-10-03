# Mobile client workflow

Living document for how `apps/mobile` is built and run. Update it when the workflow changes.

## Runtime model: development build, not Expo Go

`apps/mobile` runs as a **development build** (a custom native app that embeds
`expo-dev-client`), **not** the Expo Go sandbox.

Reasons:

- Google sign-in uses a native SDK (`@react-native-google-signin/google-signin`) that
  Expo Go does not include.
- The app's own native configuration (config plugins) only applies to a build of its own.

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
`npm run prebuild --workspace @splitcount/mobile` to regenerate.

After the dev build is installed, iterate with just `npm run mobile` (JS reloads live;
rebuild only when native dependencies or config change).

## Native dependencies

Some dependencies contain native code, linked into the dev build when it is built:
`@expo/ui` (native SwiftUI / Jetpack Compose views — the transaction date field,
`src/features/transactions/date-picker-field.tsx`), `react-native-svg` (the statistics
donut, `src/features/statistics/donut-chart.tsx`), the Google sign-in SDK…

**After adding or upgrading one**, an installed dev build does not have it and the screen
that uses it fails at runtime. Regenerate and reinstall:

```bash
npm run prebuild --workspace @splitcount/mobile
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
npm run prebuild --workspace @splitcount/mobile
npm run mobile:android   # or: npm run mobile:ios
```

iOS uses the same `icon.png` as every other platform.

## Cloud builds (EAS) — alternative

For a dev build without local native toolchains (e.g. iOS from Windows), use EAS Build.
This requires an Expo account and adds `eas.json` + an EAS project id to `app.json`.
Not set up yet — decide if/when we need it and record the outcome here.

## Environment

Configuration is layered onto `app.json` by `app.config.ts`, driven by `EXPO_PUBLIC_*`
variables (bundled into the client; none are secret). Copy `.env.example` to `.env`:

| Variable                          | Purpose                                              |
| --------------------------------- | --------------------------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`        | SplitCount API base URL (default `http://localhost:3000`). |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`| Google OAuth **web** client ID — the native SDK needs it to return an ID token. |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`| Google OAuth **iOS** client ID — also drives the reversed iOS URL scheme. |
| `APP_ID`                          | Application id: the Android package and the iOS bundle identifier (not `EXPO_PUBLIC_`: read at build time only). Optional — defaults to the id in `app.json`. See "Application id". |

### Application id

The id (`com.…`) is **permanent once the app is published** — on the Play Store it can
never change — and the product name is not final, so it is a single value: `APP_ID`, read by
`app.config.ts`, applied to both the Android `package` and the iOS `bundleIdentifier`.
`app.json` still carries the Expo template's `com.anonymous.splitcount`, which is fine to
develop under but must never ship.

- It must look like `com.example.app` (dot-separated, each part starting with a letter,
  letters/digits/underscores only); anything else fails the config with a message.
- An EAS build whose profile name starts with `production` **fails** while the id is still
  the `com.anonymous…` placeholder. Set `APP_ID` (an EAS environment variable, see "Builds
  and updates (EAS)") before the first production build.
- Changing it later, before publishing, is cheap: change `APP_ID`, create the matching
  Google OAuth **Android** client (it is matched by package name + signing SHA-1), rebuild.
  Native projects must be regenerated (`npm run prebuild --workspace @splitcount/mobile`),
  and an installed build under the old id is a different app.
- The tests are in `src/lib/app-config.test.ts`. They live under `src/` deliberately:
  next to `app.config.ts`, `@jest/globals` becomes the first file `tsc` sees and flips which
  global `fetch` typing wins, breaking the typecheck of every test that mocks `fetch`.

Read at runtime via `Constants.expoConfig.extra` (`src/lib/api/config.ts`,
`src/features/auth/google.ts`).

## Deep links

The app registers the `splitcount` URL scheme (`scheme` in `app.json`). Friend invitations
use it: the link a user shares points at the API (`/i/<code>`), and that page tries to open
`splitcount://invite/<code>`.

The code is captured by `InviteLinkHandler`, which sits **above** the auth gate — someone
following a link may not have an account yet — and parked in `pendingInvite` until a
session exists.

Testing a deep link without the web page:

```bash
npx uri-scheme open splitcount://invite/<code> --android
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
  `npm run prebuild --workspace @splitcount/mobile`, then rebuild (`npm run
  mobile:android` / `mobile:ios`).
- **Android**: the OAuth Android client is matched by package name
  (`APP_ID`, `com.anonymous.splitcount` until it is chosen) + the signing certificate SHA-1. For a debug build, add the
  debug keystore SHA-1 (`cd android && ./gradlew signingReport`) to the Google Cloud
  Android client, or sign-in fails silently.
- Google Cloud setup (OAuth consent screen + Web/iOS/Android client IDs) is a manual
  prerequisite — see `docs/specs/authentication.md`.
