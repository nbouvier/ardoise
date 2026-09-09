# Mobile client workflow

Living document for how `apps/mobile` is built and run. Update it when the workflow changes.

## Runtime model: development build, not Expo Go

`apps/mobile` runs as a **development build** (a custom native app that embeds
`expo-dev-client`), **not** the Expo Go sandbox.

Reasons:

- The template already depends on native modules that Expo Go does not bundle
  (`expo-router` native tabs, `@expo/ui`, `expo-glass-effect`).
- Planned Google sign-in needs a native Google SDK that is not available in Expo Go.

Scanning the QR code with Expo Go therefore fails ("Something went wrong"). Use a
development build, or the web target.

## Targets

| Target            | Command (repo root)     | Notes                                        |
| ----------------- | ----------------------- | -------------------------------------------- |
| Web               | `npm run mobile:web`    | Runs in any browser, no native build needed. |
| Android dev build | `npm run mobile:android`| Builds + installs the native app, then serves. |
| iOS dev build     | `npm run mobile:ios`    | macOS + Xcode only.                          |
| Dev server        | `npm run mobile`        | `expo start --dev-client`; use once a dev build is installed. |

`npm run mobile:*` map to `expo run:*` / `expo start --web` inside the workspace.

## First run (local native build)

Prerequisites:

- **Android**: Android Studio + SDK, `ANDROID_HOME` set, an emulator or a USB device
  with USB debugging.
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

## Cloud builds (EAS) — alternative

For a dev build without local native toolchains (e.g. iOS from Windows), use EAS Build.
This requires an Expo account and adds `eas.json` + an EAS project id to `app.json`.
Not set up yet — decide if/when we need it and record the outcome here.

## Environment

The mobile app currently needs no environment configuration. When it starts calling the
API, the base URL will be read from an Expo config value (documented here and in
`docs/API.md`).
